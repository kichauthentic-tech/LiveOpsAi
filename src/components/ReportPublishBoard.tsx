import React, { useMemo, useState } from "react";
import { Send, RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { Brand, BrandMonthlyReport, BrandPlatformRate, LiveSession } from "../types";
import { upsertMonthlyReport, publishMonthlyReport, unpublishMonthlyReport } from "../lib/db/monthlyReports";
import { errorMessage } from "../lib/errorMessage";
import { getTodayMonth } from "../lib/dateUtils";
import { BrandLogo } from "./ui/BrandLogo";
import { useConfirm } from "../hooks/useConfirm";
import { saveMonthlyReportSnapshot, snapshotExists } from "../lib/db/monthlyReportSnapshots";
import { buildMonthlyReportSnapshot } from "../lib/report/monthlySnapshot";

// Bảng điều phối phát hành report (còn lại của Đợt C, Audit Role × Workspace — xem
// WORKSPACE_DESIGN.md) — ops coi trạng thái phát hành Report Tháng của TẤT CẢ brand × nhiều tháng
// cùng lúc, phát hành/thu hồi thẳng từ đây thay vì mở lần lượt 4 Brand Workspace.
//
// Chỉ Report Tháng (brand_monthly_reports) có khái niệm draft/published. Report Tuần là chế độ
// xem đọc-only của Report Tháng (không publish riêng); Cam Kết Hợp Đồng và Affiliate không có cột
// status draft/published nào — không có gì để điều phối, nên không xuất hiện ở bảng này.
const MONTHS_BACK = 6;

interface ReportPublishBoardProps {
  brands: Brand[];
  sessions: LiveSession[];
  // Để tự tạo bản chụp số liệu (0119) khi phát hành tháng chưa có — không có bản chụp thì brand mở
  // report ra trống.
  brandPlatformRates: BrandPlatformRate[];
  planMonthTotals?: Map<string, number>;
  monthlyReports: Map<string, BrandMonthlyReport>;
  // App giữ Map monthlyReports trung tâm (dùng để phân bổ target xuống ca) nhưng không tự refetch
  // sau khi nơi khác publish/unpublish (xem ghi chú trong App.tsx) — gọi lại sau mỗi hành động ở
  // đây để Map không bị lệch với DB.
  onReportsChanged: () => void;
}

const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};
const fmtMonthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `Tháng ${Number(mm)}/${y}`;
};
const monthRange = (month: string): { start: string; end: string } => {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
};

export const ReportPublishBoard: React.FC<ReportPublishBoardProps> = ({ brands, sessions, brandPlatformRates, planMonthTotals, monthlyReports, onReportsChanged }) => {
  const confirm = useConfirm();
  const today = getTodayMonth();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // Danh sách tháng hiện = MONTHS_BACK tháng gần nhất gộp với mọi tháng đã có dòng report (kể cả
  // tháng cũ hơn MONTHS_BACK, hoặc tháng tương lai đã tạo nháp tay) — không giới hạn cứng bỏ sót
  // report thật đang tồn tại.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < MONTHS_BACK; i++) set.add(addMonths(today, -i));
    for (const r of monthlyReports.values()) set.add(r.periodMonth.slice(0, 7));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [today, monthlyReports]);

  const sortedBrands = useMemo(() => brands.slice().sort((a, b) => a.name.localeCompare(b.name)), [brands]);

  const unreconciledCountFor = (brandId: string, month: string) => {
    const { start, end } = monthRange(month);
    return sessions.filter(
      (s) =>
        s.brandId === brandId &&
        s.date >= start &&
        s.date <= end &&
        s.status === "Completed" &&
        (s.dataSource ?? "manual") !== "tiktok_reconciled"
    ).length;
  };

  const handlePublish = async (brandId: string, month: string, existing: BrandMonthlyReport | undefined) => {
    const key = `${brandId}|${month}`;
    setRowError((e) => ({ ...e, [key]: "" }));
    const unreconciled = unreconciledCountFor(brandId, month);
    let force = false;
    if (unreconciled > 0) {
      const ok = await confirm(
        `Còn ${unreconciled} phiên live Completed trong ${fmtMonthLabel(month)} chưa đối soát với TikTok. Vẫn muốn phát hành report này?`
      );
      if (!ok) return;
      force = true;
    }
    setBusyKey(key);
    try {
      // Tháng chưa có dòng brand_monthly_reports (chưa nhập Ads/kế hoạch gì) → tạo dòng nháp trống
      // rồi phát hành ngay, giống hành vi ở tab Report Tháng đơn brand.
      const row = existing ?? (await upsertMonthlyReport(brandId, `${month}-01`, {}));
      // Tháng chưa từng bấm "Tạo report" → chốt số trước (cùng hành vi nút Phát hành ở Report Tháng).
      // Đã có bản chụp thì giữ nguyên: phát hành là gửi đúng số ops đã chốt.
      if (!(await snapshotExists(brandId, month))) {
        const { snapshot } = await buildMonthlyReportSnapshot({ brandId, month, sessions, planMonthTotals, brandPlatformRates });
        await saveMonthlyReportSnapshot(brandId, month, snapshot);
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
    const key = `${brandId}|${month}`;
    if (!(await confirm("Thu hồi report đã phát hành về bản nháp?"))) return;
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

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <Send className="w-5 h-5 text-[var(--accent-text)]" /> Điều Phối Phát Hành Report
        </h2>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Trạng thái phát hành Report Tháng của mọi brand, {MONTHS_BACK} tháng gần nhất — phát hành/thu hồi thẳng từ đây
          thay vì mở lần lượt từng Brand Workspace. Report Tuần đọc theo Report Tháng (không publish riêng); Cam Kết Hợp
          Đồng và Affiliate không có trạng thái phát hành nên không hiện ở đây.
        </p>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Tháng</th>
                <th className="py-2.5 px-2">Brand</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2">Chưa đối soát</th>
                <th className="py-2.5 px-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) =>
                sortedBrands.map((b) => {
                  const key = `${b.id}|${month}`;
                  const report = monthlyReports.get(key);
                  const isPublished = report?.status === "published";
                  const unreconciled = unreconciledCountFor(b.id, month);
                  const busy = busyKey === key;
                  const err = rowError[key];
                  return (
                    <tr key={key} className="border-b border-[var(--border-muted)] align-top">
                      <td className="py-2.5 px-4 font-bold text-[var(--text)] whitespace-nowrap">{fmtMonthLabel(month)}</td>
                      <td className="py-2.5 px-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)] whitespace-nowrap">
                          <BrandLogo brand={b} size="xs" /> {b.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                            isPublished
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : report
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
                          }`}
                        >
                          {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {isPublished ? "Đã phát hành" : report ? "Nháp" : "Chưa có dòng"}
                        </span>
                        {isPublished && report?.publishedAt && (
                          <span className="block text-[10px] text-[var(--text-faint)] mt-1">
                            {new Date(report.publishedAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {unreconciled > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" /> {unreconciled} ca
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-faint)]">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {isPublished ? (
                          <button
                            onClick={() => handleUnpublish(b.id, month, report!.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-muted)] font-bold text-[11px] hover:bg-[var(--surface-elevated)] rounded-lg transition-all disabled:opacity-60"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Thu hồi
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePublish(b.id, month, report)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px] rounded-lg shadow transition-all"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Phát hành
                          </button>
                        )}
                        {err && <div className="text-[10px] text-red-300 font-semibold mt-1 max-w-[220px] whitespace-normal">{err}</div>}
                      </td>
                    </tr>
                  );
                })
              )}
              {sortedBrands.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[var(--text-faint)] italic">
                    Chưa có brand nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
