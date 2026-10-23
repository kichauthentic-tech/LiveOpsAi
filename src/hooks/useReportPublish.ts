import { useState } from "react";
import type { Brand, BrandMonthlyReport, BrandPlatformRate, LiveSession } from "../types";
import { upsertMonthlyReport, publishMonthlyReport, unpublishMonthlyReport } from "../lib/db/monthlyReports";
import { fetchMonthlyReportSnapshot, saveMonthlyReportSnapshot } from "../lib/db/monthlyReportSnapshots";
import { fetchDataRawImportStamps } from "../lib/db/brandDataRaw";
import { type MonthlyReportSnapshot } from "../lib/report/monthlySnapshot";
import { REPORT_ENGINES, type AnySnapshot } from "../lib/report/reportEngines";
import { brandMonthKey, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { dataSourceTier } from "../lib/dataSource";
import { errorMessage } from "../lib/errorMessage";
import { useConfirm } from "./useConfirm";

// Phát hành / thu hồi Report Tháng của một brand × sàn × tháng. Trước 23/10 nằm trong màn "Điều Phối Phát Hành" riêng; audit trùng màn
// 23/10 gộp màn đó vào Toàn Cảnh Brand (cột Report Tháng) — logic giữ nguyên, chỉ chuyển chỗ.
//
// Phát hành = brand NHÌN THẤY report, tức hành động hướng ra ngoài: LUÔN hỏi (lỗi E2E 28/09 #6), câu hỏi nặng thêm khi còn ca chưa
// đối soát. Trước khi phát hành kiểm độ mới bản chụp (audit workflow 04/10 #10) — bản chụp cũ thì hỏi cập nhật rồi mới phát hành.

const fmtMonthLabel = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
const monthRange = (month: string): { start: string; end: string } => {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
};

interface Args {
  platform: ReportPlatform;
  brands: Brand[];
  sessions: LiveSession[];
  brandPlatformRates: BrandPlatformRate[];
  planMonthTotals?: Map<string, number>;
  /** App giữ Map report trung tâm, không tự nạp lại sau khi phát hành/thu hồi — gọi lại sau mỗi hành động. */
  onReportsChanged: () => void;
}

export function useReportPublish({ platform, brands, sessions, brandPlatformRates, planMonthTotals, onReportsChanged }: Args) {
  const confirm = useConfirm();
  const engine = REPORT_ENGINES[platform];
  const reportKey = (brandId: string, month: string) => brandMonthKey(brandId, month, platform);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // Ca huỷ không có gì để báo cáo — không đếm (CROCS T10 từng hiện 90 trong khi Dashboard/Toàn Cảnh Brand ghi 86).
  const sessionCountFor = (brandId: string, month: string) => {
    const { start, end } = monthRange(month);
    return sessions.filter((s) => s.brandId === brandId && platformOf(s) === platform && s.status !== "Cancelled" && s.date >= start && s.date <= end).length;
  };

  const unreconciledCountFor = (brandId: string, month: string) => {
    const { start, end } = monthRange(month);
    return sessions.filter(
      (s) => s.brandId === brandId && platformOf(s) === platform && s.date >= start && s.date <= end && s.status === "Completed" && dataSourceTier(s) !== "reconciled"
    ).length;
  };

  const handlePublish = async (brandId: string, month: string, existing: BrandMonthlyReport | undefined) => {
    const key = reportKey(brandId, month);
    setRowError((e) => ({ ...e, [key]: "" }));
    const unreconciled = unreconciledCountFor(brandId, month);
    const brandName = brands.find((b) => b.id === brandId)?.name ?? "brand này";
    let refresh = false;
    let hasStored: boolean;
    try {
      const [stored, stamps] = await Promise.all([fetchMonthlyReportSnapshot(brandId, month, platform), fetchDataRawImportStamps(brandId)]);
      hasStored = !!stored;
      if (stored) {
        const f = engine.freshness(stored.snapshot as AnySnapshot, { sessions, planMonthTotals, brandPlatformRates, stamps, month });
        if (!f.upToDate) {
          const why = f.changes.join(" · ");
          if (!(await confirm(`Bản chụp số ${platform} của ${fmtMonthLabel(month)} (${brandName}) đã cũ so với dữ liệu hiện tại${why ? `: ${why}` : ""}.\n\nĐồng ý = cập nhật bản chụp theo số mới rồi phát hành. Muốn xem lại số trước thì Huỷ và mở Report Tháng.`))) return;
          refresh = true;
        }
      }
    } catch (e) {
      setRowError((prev) => ({ ...prev, [key]: errorMessage(e, "Không kiểm được độ mới của bản chụp") }));
      return;
    }
    const ok = await confirm(
      (unreconciled > 0
        ? `Còn ${unreconciled} ca ${platform} đã xong trong ${fmtMonthLabel(month)} chưa đối soát với ${platform} — số trong report có thể còn đổi.\n\nVẫn phát hành ${fmtMonthLabel(month)} cho ${brandName}?`
        : `Phát hành report ${platform} ${fmtMonthLabel(month)} cho ${brandName}? Brand sẽ thấy report này ngay.`) +
        `\n\nPhát hành = ĐÓNG SỔ ${platform} của tháng: sau đó không sửa/đối soát/loại/huỷ ca ${platform} của ${brandName} trong tháng này được nữa cho tới khi thu hồi report (ca sàn kia không bị ảnh hưởng).`
    );
    if (!ok) return;
    const force = unreconciled > 0;
    setBusyKey(key);
    try {
      // Tháng chưa có dòng brand_monthly_reports → tạo dòng nháp trống rồi phát hành ngay, giống nút ở Report Tháng.
      const row = existing ?? (await upsertMonthlyReport(brandId, `${month}-01`, platform));
      // Chưa từng bấm "Tạo report" → chốt số trước; đã có bản chụp mới thì giữ nguyên (gửi đúng số ops đã chốt).
      if (refresh || !hasStored) {
        const { snapshot } = await engine.build({ brandId, month, sessions, planMonthTotals, brandPlatformRates });
        await saveMonthlyReportSnapshot(brandId, month, snapshot as MonthlyReportSnapshot, platform);
      }
      await publishMonthlyReport(row.id, force);
      onReportsChanged();
    } catch (e) {
      setRowError((prev) => ({ ...prev, [key]: errorMessage(e, "Phát hành thất bại") }));
    } finally {
      setBusyKey(null);
    }
  };

  const handleUnpublish = async (brandId: string, month: string, reportId: string) => {
    const key = reportKey(brandId, month);
    if (!(await confirm(`Thu hồi report ${platform} đã phát hành về bản nháp?`))) return;
    setRowError((e) => ({ ...e, [key]: "" }));
    setBusyKey(key);
    try {
      await unpublishMonthlyReport(reportId);
      onReportsChanged();
    } catch (e) {
      setRowError((prev) => ({ ...prev, [key]: errorMessage(e, "Thu hồi thất bại") }));
    } finally {
      setBusyKey(null);
    }
  };

  return { reportKey, busyKey, rowError, sessionCountFor, unreconciledCountFor, handlePublish, handleUnpublish };
}
