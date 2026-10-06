import React, { useMemo, useState } from "react";
import { Send, RotateCcw, AlertTriangle, CheckCircle2, Clock, Loader2, Ban } from "lucide-react";
import { Brand, BrandMonthlyReport, BrandPlatformRate, LiveSession } from "../types";
import { upsertMonthlyReport, publishMonthlyReport, unpublishMonthlyReport } from "../lib/db/monthlyReports";
import { errorMessage } from "../lib/errorMessage";
import { getTodayMonth } from "../lib/dateUtils";
import { BrandLogo } from "./ui/BrandLogo";
import { useConfirm } from "../hooks/useConfirm";
import { fetchMonthlyReportSnapshot, saveMonthlyReportSnapshot } from "../lib/db/monthlyReportSnapshots";
import { fetchDataRawImportStamps } from "../lib/db/brandDataRaw";
import { buildMonthlyReportSnapshot, snapshotFreshness } from "../lib/report/monthlySnapshot";
import { shopeeSnapshotFreshness, shopeeStampsFor, type ShopeeReportSnapshot } from "../lib/report/shopeeSnapshot";
import { buildShopeeReportSnapshot } from "../lib/report/shopeeSnapshotBuild";
import { REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
import { PageIntro } from "./common/PageIntro";

// Bảng điều phối phát hành report (còn lại của Đợt C, Audit Role × Workspace — xem
// docs/WORKSPACE_HISTORY.md) — ops coi trạng thái phát hành Report Tháng của TẤT CẢ brand × nhiều tháng
// cùng lúc, phát hành/thu hồi thẳng từ đây thay vì mở lần lượt 4 Brand Workspace.
//
// Chỉ Report Tháng (brand_monthly_reports) có khái niệm draft/published. Report Tuần là chế độ
// xem đọc-only của Report Tháng (không publish riêng); Cam Kết Hợp Đồng và Affiliate không có cột
// status draft/published nào — không có gì để điều phối, nên không xuất hiện ở bảng này.
const MONTHS_BACK = 6;
// Đếm cột thay vì gõ số ở mỗi colSpan (M4 của audit lần 2 đã dính một lần lệch).
const COL_COUNT = 5;

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
  // Hai report độc lập theo sàn (0139): bảng này hiện một sàn một lúc.
  const [platform, setPlatform] = useState<ReportPlatform>("TikTok");
  const isShopee = platform === "Shopee";
  // Khoá dòng report trong Map trung tâm: TikTok giữ "brandId|YYYY-MM", Shopee có hậu tố.
  const reportKey = (brandId: string, month: string) => `${brandId}|${month}${isShopee ? "|Shopee" : ""}`;
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  // Danh sách tháng hiện = MONTHS_BACK tháng gần nhất gộp với mọi tháng đã có dòng report (kể cả
  // tháng cũ hơn MONTHS_BACK, hoặc tháng tương lai đã tạo nháp tay) — không giới hạn cứng bỏ sót
  // report thật đang tồn tại.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < MONTHS_BACK; i++) set.add(addMonths(today, -i));
    for (const r of monthlyReports.values()) if (r.platform === platform) set.add(r.periodMonth.slice(0, 7));
    return [...set].sort((a, b) => (a < b ? 1 : -1));
  }, [today, monthlyReports, platform]);

  const sortedBrands = useMemo(() => brands.slice().sort((a, b) => a.name.localeCompare(b.name)), [brands]);

  // Số ca của brand trong tháng — thứ quyết định report có gì để gửi hay không. Trước đây màn này
  // KHÔNG hiện con số đó ở đâu cả: 24 dòng đều một nút "Phát hành" xanh như nhau, trong khi chỉ 4
  // dòng (CROCS T6–T9) có ca thật; 20 dòng còn lại bấm vào là gửi cho brand một report rỗng.
  const sessionCountFor = (brandId: string, month: string) => {
    const { start, end } = monthRange(month);
    return sessions.filter((s) => s.brandId === brandId && s.platform === platform && s.date >= start && s.date <= end).length;
  };

  const unreconciledCountFor = (brandId: string, month: string) => {
    const { start, end } = monthRange(month);
    return sessions.filter(
      (s) =>
        s.brandId === brandId &&
        s.platform === platform &&
        s.date >= start &&
        s.date <= end &&
        s.status === "Completed" &&
        (s.dataSource ?? "manual") !== "tiktok_reconciled"
    ).length;
  };

  const handlePublish = async (brandId: string, month: string, existing: BrandMonthlyReport | undefined) => {
    const key = reportKey(brandId, month);
    setRowError((e) => ({ ...e, [key]: "" }));
    const unreconciled = unreconciledCountFor(brandId, month);
    // Phát hành = brand NHÌN THẤY report, tức hành động hướng ra ngoài và không rút lại được trong
    // mắt người nhận. Trước đây chỉ hỏi khi còn ca chưa đối soát, nên đường thường (đối soát xong
    // hết — đúng cái ta muốn ops làm) là bấm phát ngay; trong khi "Thu hồi", việc chỉ ảnh hưởng nội
    // bộ và hoàn tác được, thì lại luôn hỏi. Ngược chiều rủi ro (lỗi E2E 28/09 #6). Nay luôn hỏi,
    // câu hỏi nặng thêm khi còn ca chưa đối soát.
    const brandName = brands.find((b) => b.id === brandId)?.name ?? "brand này";
    // Audit workflow 2026-10-04 #10: phát hành từ đây giữ nguyên bản chụp đã có — kể cả khi bản chụp đó chụp TRƯỚC
    // lần đối soát/sửa ca gần nhất. Brand khi đó đọc Report một số, mở Sổ Ca thấy số khác. Kiểm độ mới trước.
    let refresh = false;
    let hasStored: boolean;
    try {
      const [stored, stamps] = await Promise.all([fetchMonthlyReportSnapshot(brandId, month, platform), fetchDataRawImportStamps(brandId)]);
      hasStored = !!stored;
      if (stored) {
        const sf = isShopee
          ? shopeeSnapshotFreshness(stored.snapshot as unknown as ShopeeReportSnapshot, { sessions, stamps: shopeeStampsFor(stamps, month) })
          : null;
        const f = isShopee ? null : snapshotFreshness(stored.snapshot, { sessions, planMonthTotals, brandPlatformRates, imports: stamps });
        const upToDate = isShopee ? sf!.upToDate : f!.upToDate;
        if (!upToDate) {
          const why = isShopee
            ? [sf!.sessionsChanged ? "ca Shopee đổi số/lịch/người" : "", sf!.filesChanged ? "file Shopee mới" : "", sf!.formulaChanged ? "cách tính mới (Ads, xu)" : ""].filter(Boolean).join(" · ")
            : [
                f!.changedSessionsThisMonth > 0 ? `${f!.changedSessionsThisMonth} ca trong tháng đổi số/lịch` : "",
                f!.changedFiles.length > 0 ? `file mới: ${f!.changedFiles.join(", ")}` : "",
                f!.configChanged ? "target/rate/công thức đổi" : ""
              ].filter(Boolean).join(" · ");
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
      // Tháng chưa có dòng brand_monthly_reports (chưa nhập Ads/kế hoạch gì) → tạo dòng nháp trống
      // rồi phát hành ngay, giống hành vi ở tab Report Tháng đơn brand.
      const row = existing ?? (await upsertMonthlyReport(brandId, `${month}-01`, platform));
      // Tháng chưa từng bấm "Tạo report" → chốt số trước (cùng hành vi nút Phát hành ở Report Tháng).
      // Đã có bản chụp thì giữ nguyên: phát hành là gửi đúng số ops đã chốt.
      if (refresh || !hasStored) {
        const snapshot = isShopee
          ? ((await buildShopeeReportSnapshot({ brandId, month, sessions })) as unknown as Awaited<ReturnType<typeof buildMonthlyReportSnapshot>>["snapshot"])
          : (await buildMonthlyReportSnapshot({ brandId, month, sessions, planMonthTotals, brandPlatformRates })).snapshot;
        await saveMonthlyReportSnapshot(brandId, month, snapshot, platform);
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

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <Send className="w-5 h-5 text-[var(--accent-text)]" /> Điều Phối Phát Hành Report
        </h2>
        <PageIntro>
          Trạng thái phát hành Report Tháng của mọi brand, {MONTHS_BACK} tháng gần nhất — phát hành/thu hồi thẳng từ đây
          thay vì mở lần lượt từng Brand Workspace. TikTok và Shopee là hai report độc lập: chọn sàn ở nút bên dưới, mỗi sàn phát hành và đóng sổ riêng. Report Tuần đọc theo Report Tháng (không publish riêng); Cam Kết Hợp
          Đồng và Affiliate không có trạng thái phát hành nên không hiện ở đây.
        </PageIntro>
        <div className="inline-flex items-center gap-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Sàn của report">
          {REPORT_PLATFORMS.map((pl) => (
            <button
              key={pl}
              onClick={() => setPlatform(pl)}
              aria-pressed={platform === pl}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                platform === pl ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]"
              }`}
            >
              {pl}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                <th className="py-2.5 px-4">Brand</th>
                <th className="py-2.5 px-2 text-right">Ca trong tháng</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2">Chưa đối soát</th>
                <th className="py-2.5 px-2 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <React.Fragment key={month}>
                  <tr className="bg-[var(--surface-elevated)]/50">
                    <td colSpan={COL_COUNT} className="py-1.5 px-4 text-[11px] font-bold text-[var(--text-muted)]">
                      {fmtMonthLabel(month)}
                      {(() => {
                        const live = sortedBrands.filter((b) => sessionCountFor(b.id, month) > 0).length;
                        return (
                          <span className="text-[var(--text-faint)] font-normal">
                            {" · "}
                            {live === 0 ? "không brand nào có ca" : `${live}/${sortedBrands.length} brand có ca`}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                  {sortedBrands.map((b) => {
                  const key = reportKey(b.id, month);
                  const report = monthlyReports.get(key);
                  const isPublished = report?.status === "published";
                  const unreconciled = unreconciledCountFor(b.id, month);
                  const sessionCount = sessionCountFor(b.id, month);
                  // Không có ca nào VÀ chưa ai tạo dòng report (nhập Ads tay) ⇒ không có gì để gửi.
                  const nothingToPublish = sessionCount === 0 && !report;
                  const busy = busyKey === key;
                  const err = rowError[key];
                  return (
                    <tr key={key} className="border-b border-[var(--border-muted)] align-top">
                      <td className="py-2.5 px-4">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--text)] whitespace-nowrap">
                          <BrandLogo brand={b} size="xs" /> {b.name}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono whitespace-nowrap">
                        {sessionCount > 0 ? (
                          <span className="text-[var(--text)] font-bold">{sessionCount}</span>
                        ) : (
                          <span className="text-[var(--text-faint)]">0</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
                            isPublished
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : report
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
                          }`}
                        >
                          {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {isPublished ? "Đã phát hành" : report ? (sessionCount === 0 ? "Nháp · không có ca" : "Nháp") : "Chưa tạo"}
                        </span>
                        {isPublished && report?.publishedAt && (
                          <span className="block text-[11px] text-[var(--text-faint)] mt-1">
                            {new Date(report.publishedAt).toLocaleDateString("vi-VN")}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {unreconciled > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 whitespace-nowrap">
                            <AlertTriangle className="w-3 h-3" /> {unreconciled} ca
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--text-faint)]">—</span>
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
                        ) : month >= today ? (
                          // 0133: phát hành = đóng sổ, nên chỉ phát hành khi tháng đã hết (DB cũng chặn).
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-faint)] text-[11px] font-semibold whitespace-nowrap"
                            title="Phát hành là đóng sổ số của tháng — chỉ làm sau khi hết tháng."
                          >
                            <Clock className="w-3.5 h-3.5 shrink-0" /> Chờ hết tháng
                          </span>
                        ) : nothingToPublish ? (
                          // Nút xanh y hệt dòng có 47 ca là mời ops gửi cho brand một report rỗng.
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[var(--text-faint)] text-[11px] font-semibold whitespace-nowrap"
                            title="Tháng này brand chưa có ca nào và cũng chưa ai tạo dòng report — không có số gì để gửi."
                          >
                            <Ban className="w-3.5 h-3.5 shrink-0" /> Không có gì để phát hành
                          </span>
                        ) : (
                          <button
                            onClick={() => handlePublish(b.id, month, report)}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px] rounded-lg shadow transition-all"
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Phát hành
                          </button>
                        )}
                        {err && <div className="text-[11px] text-red-300 font-semibold mt-1 max-w-[220px] whitespace-normal">{err}</div>}
                      </td>
                    </tr>
                  );
                  })}
                </React.Fragment>
              ))}
              {sortedBrands.length === 0 && (
                <tr>
                  <td colSpan={COL_COUNT} className="py-8 text-center text-[var(--text-faint)] italic">
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
