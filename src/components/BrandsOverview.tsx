import React, { useEffect, useMemo, useState } from "react";
import { rememberBrandId } from "../lib/defaultBrand";
import { requestCrmFocus } from "../lib/crmFocus";
import { brandPriceLabel } from "../lib/brandPricing";
import { Ban, Clock, Download, LayoutGrid, Loader2, RotateCcw, Send } from "lucide-react";
import { Brand, BrandChannel, BrandMonthlyReport, BrandMonthPlan, BrandPlatformRate, LiveSession } from "../types";
import { planStatusesRead } from "../lib/db/monthPlans";
import { channelTitle, platformOf, brandMonthKey, brandPlatformKey, type ReportPlatform } from "../lib/reportPlatform";
import { platformsOfBrand } from "../lib/channels";
import { commitmentsRead, fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { CommitmentProgress, CommitmentStatus, computeAllProgress, todayVn } from "../lib/performance/brandCommitment";
import { filterLedger, summarize } from "../lib/sessionLedger";
import { fmtVndShort } from "../lib/format";
import { downloadRowsAsXlsx } from "../lib/exportXlsx";
import { useToast } from "../hooks/useToast";
import { errorMessage } from "../lib/errorMessage";
import { BrandLogo } from "./ui/BrandLogo";
import { PageHeader } from "./common/PageHeader";
import { MonthPicker } from "./common/MonthPicker";
import { useReportPublish } from "../hooks/useReportPublish";
import { MonthClosePanel } from "./MonthClosePanel";
import { closeMonthFor } from "../lib/report/monthClose";

// Màn toàn cảnh 4 brand cho agency (Đợt C/6, 2026-09-23) — BẢNG trạng thái từng brand cho MỘT
// tháng đang xem, không phải widget KPI kiểu Dashboard cũ (xoá 2026-09-13 vì số tính live/dự phóng
// không đáng tin — xem docs/WORKSPACE_HISTORY.md). Mọi cột ở đây đều là TRẠNG THÁI ĐỌC THẲNG TỪ DB
// (kế hoạch đã chốt chưa, report đã phát hành chưa, rate đã set chưa) hoặc SỐ THẬT đã xảy ra
// (GMV/giờ live từ chính `live_sessions`) — không có ô nào là dự phóng/ước tính cuối tháng.
//
// Câu hỏi màn này trả lời: "tháng này/tháng sau, brand nào đang ổn, brand nào cần tôi để ý ngay" —
// thay vì ops phải mở lần lượt 4 Brand Workspace để tự ghép câu trả lời đó trong đầu.
//
// 23/10 (audit trùng màn): gộp màn "Điều Phối Phát Hành" vào đây — cột Report Tháng có nút Phát hành / Thu hồi (hooks/useReportPublish),
// dòng đầu bảng nhắc tháng đã hết còn report chưa phát hành (thay cho lưới 6 tháng × brand của màn cũ).

const MONTHS_BACK = 6;
const shiftMonthKey = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

interface BrandsOverviewProps {
  /** Sàn của workspace agency (07/10): mỗi brand một dòng của ĐÚNG sàn này. */
  platform: ReportPlatform;
  brands: Brand[];
  /** Kênh brand × sàn (0149): một dòng mỗi kênh của sàn đang xem — kể cả kênh chưa có ca. */
  brandChannels: BrandChannel[];
  sessions: LiveSession[];
  brandPlatformRates: BrandPlatformRate[];
  monthlyReports: Map<string, BrandMonthlyReport>;
  /** Để tự tạo bản chụp số liệu (0119) khi phát hành tháng chưa có — không có bản chụp thì brand mở report ra trống. */
  planMonthTotals?: Map<string, number>;
  /** Nạp lại Map report trung tâm sau khi phát hành/thu hồi. */
  onReportsChanged: () => void;
  /** Mở một màn (brandId có ⇒ mở trong Brand Workspace của brand đó). */
  onNavigate?: (tab: string, brandId?: string, platform?: ReportPlatform) => void;
}

// Ô trạng thái "chưa có" là một NÚT tới đúng chỗ phải nhập (audit người mới 2026-10-04: bảng toàn chữ
// "Chưa lập / Chưa có cam kết / Chưa tạo / Chưa set" mà không nói đi đâu để làm).
const GoLink: React.FC<{ label: string; onClick?: () => void }> = ({ label, onClick }) =>
  onClick ? (
    <button onClick={onClick} className="block mt-1 text-[11px] font-bold text-[var(--accent-text)] hover:underline min-h-6">
      {label} →
    </button>
  ) : null;

const PLAN_STATUS_LABEL: Record<BrandMonthPlan["status"] | "none", string> = {
  none: "Chưa lập",
  draft: "Đang soạn",
  locked: "Đã chốt"
};
const PLAN_STATUS_CLS: Record<BrandMonthPlan["status"] | "none", string> = {
  none: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]",
  draft: "bg-amber-950 text-amber-300 border-amber-800",
  locked: "bg-emerald-950 text-emerald-300 border-emerald-800"
};

const REPORT_STATUS_LABEL: Record<BrandMonthlyReport["status"] | "none", string> = {
  none: "Chưa tạo",
  draft: "Nháp",
  published: "Đã phát hành"
};
const REPORT_STATUS_CLS: Record<BrandMonthlyReport["status"] | "none", string> = {
  none: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]",
  draft: "bg-amber-950 text-amber-300 border-amber-800",
  published: "bg-emerald-950 text-emerald-300 border-emerald-800"
};

// Cùng bộ nhãn/màu với BrandCommitmentView.tsx (màn brand tự xem) — hai màn không được nói khác
// màu nhau cho cùng một trạng thái.
const COMMIT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  no_commitment: "Chưa có cam kết",
  met: "Đã đủ cam kết",
  on_track: "Đúng tiến độ",
  at_risk: "Cần chú ý",
  behind: "Đang chậm"
};
const COMMIT_STATUS_CLS: Record<CommitmentStatus, string> = {
  no_commitment: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]",
  met: "bg-emerald-950 text-emerald-300 border-emerald-800",
  on_track: "bg-sky-950 text-sky-300 border-sky-800",
  at_risk: "bg-amber-950 text-amber-300 border-amber-800",
  behind: "bg-rose-950 text-rose-300 border-rose-800"
};

const fmtHours = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
export function prefetchBrandsOverview(_ctx: TabPrefetchCtx): void {
  planStatusesRead.prefetch(todayVn().slice(0, 7));
  commitmentsRead.prefetch();
}

export const BrandsOverview: React.FC<BrandsOverviewProps> = ({ platform, brands, brandChannels, sessions, brandPlatformRates, monthlyReports, planMonthTotals, onReportsChanged, onNavigate }) => {
  const { showToast } = useToast();
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [planStatuses, setPlanStatuses] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [commitments, setCommitments] = useState<Awaited<ReturnType<typeof fetchBrandMonthlyCommitments>>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pub = useReportPublish({ platform, brands, sessions, brandPlatformRates, planMonthTotals, onReportsChanged });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    // Lượt đầu (tháng mặc định) lấy bản nạp trước nếu có; đổi tháng thì `take` không khớp key ⇒ đọc mới.
    Promise.all([planStatusesRead.take(month), commitmentsRead.take()])
      .then(([plans, commits]) => {
        if (cancelled) return;
        setPlanStatuses(plans);
        setCommitments(commits);
      })
      .catch((e) => !cancelled && setErrorMsg(errorMessage(e, "Không tải được trạng thái brand")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [month]);

  const brandNameById = useMemo(() => Object.fromEntries(brands.map((b) => [b.id, b.name])), [brands]);
  const progressByBrand = useMemo(() => {
    const rows = computeAllProgress(commitments, brandNameById, sessions, `${month}-01`, today);
    return new Map(rows.map((r) => [brandPlatformKey(r.brandId, r.platform), r] as [string, CommitmentProgress]));
  }, [commitments, brandNameById, sessions, month, today]);


  // Dựng MỘT lần ở đây thay vì tính trong thân map của JSX (như bản 23/09): nút Xuất Excel phải ghi ra
  // ĐÚNG những gì bảng đang hiện — tính lại lần hai cho file là cách chắc chắn sẽ lệch sau một lần sửa
  // cột mà quên chỗ kia (đúng lớp lỗi "hai màn nói hai số" của dự án này).
  const rows = useMemo(() => {
    // Mỗi dòng một brand × sàn (0139–0141): kế hoạch, cam kết, report riêng từng sàn.
    return brands
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .flatMap((b) => platformsOfBrand(brandChannels, b.id).filter((p) => p === platform).map((p) => ({ b, p, multi: platformsOfBrand(brandChannels, b.id).length > 1 })))
      .map(({ b, p, multi }) => {
        const key = brandPlatformKey(b.id, p);
        const plan = planStatuses.get(key);
        const progress = progressByBrand.get(key);
        const s = summarize(filterLedger(sessions.filter((x) => platformOf(x) === p), { month, brandId: b.id }, today), today);
        return {
          brand: b,
          platform: p,
          label: channelTitle(b.name, p, multi),
          plan,
          planStatus: (plan?.status ?? "none") as BrandMonthPlan["status"] | "none",
          progress,
          commitStatus: (progress?.status ?? "no_commitment") as CommitmentStatus,
          sum: s,
          reportStatus: (monthlyReports.get(brandMonthKey(b.id, month, p))?.status ?? "none") as BrandMonthlyReport["status"] | "none",
          // Giá theo sàn + cách thu phí (lib/brandPricing.ts — cùng luật với Việc cần làm và P&L). Trước 06/10 chỉ nhìn
          // đơn giá/giờ ⇒ brand thu theo % hoa hồng luôn hiện "Chưa nhập".
          price: brandPriceLabel(b, brandPlatformRates, p)
        };
      });
  }, [platform, brands, brandChannels, planStatuses, progressByBrand, sessions, month, today, monthlyReports, brandPlatformRates]);

  // Tháng đã hết (6 tháng gần nhất) có ca mà report chưa phát hành — bấm tháng để mở bảng của tháng đó.
  const unpublished = useMemo(() => {
    const cur = today.slice(0, 7);
    const out: { month: string; names: string[] }[] = [];
    for (let i = 1; i <= MONTHS_BACK; i++) {
      const m = shiftMonthKey(cur, -i);
      const names = brands
        .filter((b) => platformsOfBrand(brandChannels, b.id).includes(platform))
        .filter((b) => monthlyReports.get(brandMonthKey(b.id, m, platform))?.status !== "published" && pub.sessionCountFor(b.id, m) > 0)
        .map((b) => b.name)
        .sort();
      if (names.length) out.push({ month: m, names });
    }
    return out;
    // pub.sessionCountFor đọc `sessions` + `platform` — đã có trong deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, brands, brandChannels, platform, monthlyReports, sessions]);

  const exportXlsx = () => {
    const out = rows.map((r) => ({
      Brand: r.label,
      "Kế hoạch tháng": PLAN_STATUS_LABEL[r.planStatus] + (r.plan?.brandConfirmedAt ? " · brand đã xác nhận" : ""),
      "Target kế hoạch": r.plan && r.plan.targetGmv > 0 ? r.plan.targetGmv : "",
      "Cam kết": COMMIT_STATUS_LABEL[r.commitStatus],
      "Giờ đã xếp": r.progress ? r.progress.plannedTotalHours : "",
      "Giờ cam kết": r.progress ? r.progress.committedHours : "",
      "Thiếu giờ": r.progress && r.progress.gapHours > 0 ? r.progress.gapHours : "",
      // Cột số để nguyên dạng số cho Excel tự tính được; cột trạng thái là chữ đúng như trên màn.
      "Giờ live": r.sum.countable > 0 ? r.sum.hours : "",
      "Ca đã diễn ra": r.sum.happened,
      "Ca sắp tới": r.sum.upcoming,
      GMV: r.sum.gmv > 0 ? r.sum.gmv : "",
      "Report Tháng": REPORT_STATUS_LABEL[r.reportStatus],
      "Giá": r.price ?? "Chưa nhập"
    }));
    downloadRowsAsXlsx("Toan Canh Brand", out, `ToanCanhBrand_${month}.xlsx`).catch((e) =>
      showToast(`Không tải được file Excel: ${errorMessage(e)}`)
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon={LayoutGrid}
        title="Toàn Cảnh Brand"
        description="Mỗi brand trong tháng đang xem: đã lập kế hoạch, nhập hợp đồng, nhập giá chưa, số liệu thực tế đã live — và phát hành / thu hồi Report Tháng ngay ở cột Report. Ô nào còn thiếu có nút dẫn tới chỗ nhập."
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <button
              onClick={exportXlsx}
              disabled={rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40"
              title="Tải bảng đang xem ra Excel"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          </>
        }
      />

      {unpublished.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-300">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Report {platform} tháng đã hết chưa phát hành:</span>
          {unpublished.map((u) => (
            <button key={u.month} type="button" onClick={() => setMonth(u.month)} className={`min-h-6 px-2 rounded-lg border font-bold ${u.month === month ? "border-amber-500 text-amber-200" : "border-amber-800 hover:border-amber-500"}`}>
              T{Number(u.month.slice(5))}/{u.month.slice(2, 4)} · {u.names.join(", ")}
            </button>
          ))}
        </p>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {/* Chốt tháng (27/10): tháng đang xem nếu đã hết; tháng này thì tới ngày 10 vẫn chốt tháng trước. */}
      <MonthClosePanel
        platform={platform}
        month={closeMonthFor(month, today)}
        today={today}
        brands={brands}
        brandChannels={brandChannels}
        sessions={sessions}
        monthlyReports={monthlyReports}
        onNavigate={onNavigate}
      />

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] text-[11px] font-semibold">
                <th className="py-2.5 px-4">Brand</th>
                <th className="py-2.5 px-2">Kế hoạch tháng</th>
                <th className="py-2.5 px-2">Cam kết</th>
                <th className="py-2.5 px-2 text-right">Giờ live</th>
                <th className="py-2.5 px-2 text-right">GMV</th>
                <th className="py-2.5 px-2">Report Tháng</th>
                <th className="py-2.5 px-2">Giá</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ brand: b, platform, label, plan, planStatus, progress, commitStatus, sum: s, reportStatus, price }) => {
                return (
                  <tr key={brandPlatformKey(b.id, platform)} className="border-b border-[var(--border-muted)] align-top">
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
                        <BrandLogo brand={b} size="xs" /> {label}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${PLAN_STATUS_CLS[planStatus]}`}>
                        {PLAN_STATUS_LABEL[planStatus]}
                      </span>
                      {/* Tháng đã hết không lập kế hoạch / đặt cam kết được nữa — không mời bấm (23/10). */}
                      {planStatus !== "locked" && month >= today.slice(0, 7) && (
                        <GoLink label={planStatus === "none" ? "Lập kế hoạch" : "Chốt kế hoạch"} onClick={onNavigate && (() => { rememberBrandId(b.id); onNavigate("month_plan", undefined, platform); })} />
                      )}
                      {plan?.brandConfirmedAt && (
                        <span className="block text-[11px] text-emerald-400 mt-1">✓ brand đã xác nhận</span>
                      )}
                      {plan && plan.targetGmv > 0 && (
                        <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
                          Target {fmtVndShort(plan.targetGmv)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${COMMIT_STATUS_CLS[commitStatus]}`}>
                        {COMMIT_STATUS_LABEL[commitStatus]}
                      </span>
                      {commitStatus === "no_commitment" && month >= today.slice(0, 7) && (
                        <GoLink label="Đặt cam kết tháng" onClick={onNavigate && (() => { rememberBrandId(b.id); onNavigate("month_plan", undefined, platform); })} />
                      )}
                      {progress && (
                        <span className="block text-[11px] text-[var(--text-faint)] mt-1">
                          {progress.committedHours > 0 ? `${fmtHours(progress.plannedTotalHours)}/${fmtHours(progress.committedHours)}` : `${fmtHours(progress.plannedTotalHours)} trong lịch`}
                          {progress.gapHours > 0 && <span className="text-amber-300"> · thiếu {fmtHours(progress.gapHours)}</span>}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-[var(--text)] whitespace-nowrap">
                      {s.countable > 0 ? fmtHours(s.hours) : <span className="text-[var(--text-faint)] font-normal">—</span>}
                      {/* Đ11: `happened` chứ không phải `total` — bảng này tự nhận chỉ hiện số đã xảy ra,
                          nên ca sắp tới tách ra thành dòng riêng thay vì cộng chung vào "N ca". */}
                      <span className="block text-[11px] text-[var(--text-faint)] font-normal">{s.happened} ca</span>
                      {s.upcoming > 0 && (
                        <span className="block text-[11px] text-[var(--text-muted)] font-normal">+{s.upcoming} ca sắp tới</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-[var(--success)] whitespace-nowrap">
                      {s.gmv > 0 ? fmtVndShort(s.gmv) : <span className="text-[var(--text-faint)] font-normal">—</span>}
                    </td>
                    <td className="py-2.5 px-2">
                      <ReportCell
                        status={reportStatus}
                        report={monthlyReports.get(pub.reportKey(b.id, month))}
                        month={month}
                        currentMonth={today.slice(0, 7)}
                        sessionCount={pub.sessionCountFor(b.id, month)}
                        unreconciled={pub.unreconciledCountFor(b.id, month)}
                        busy={pub.busyKey === pub.reportKey(b.id, month)}
                        error={pub.rowError[pub.reportKey(b.id, month)]}
                        onPublish={(r) => pub.handlePublish(b.id, month, r)}
                        onUnpublish={(id) => pub.handleUnpublish(b.id, month, id)}
                        onOpen={onNavigate && (() => onNavigate("brand_monthly_report", b.id, platform))}
                      />
                    </td>
                    <td className="py-2.5 px-2">
                      {price ? (
                        <span className="text-[11px] text-[var(--text-muted)]">{price}</span>
                      ) : (
                        <>
                          <span className="text-[11px] text-rose-300 font-bold">Chưa nhập</span>
                          <GoLink label="Nhập ở CRM" onClick={onNavigate && (() => { requestCrmFocus(b.id, platform); onNavigate("crm"); })} />
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-faint)] italic">
                    Chưa có brand nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {loading && (
        <p className="text-[11px] text-[var(--text-faint)] flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" /> Đang tải…
        </p>
      )}
    </div>
  );
};

// Cột Report Tháng: trạng thái + Phát hành / Thu hồi (gộp từ Điều Phối Phát Hành 23/10). Phát hành = đóng sổ (0133) nên chỉ tháng đã hết;
// tháng không có ca và chưa ai tạo dòng report thì không mời gửi một report rỗng.
const ReportCell: React.FC<{
  status: BrandMonthlyReport["status"] | "none";
  report: BrandMonthlyReport | undefined;
  month: string;
  currentMonth: string;
  sessionCount: number;
  unreconciled: number;
  busy: boolean;
  error?: string;
  onPublish: (existing: BrandMonthlyReport | undefined) => void;
  onUnpublish: (reportId: string) => void;
  onOpen?: () => void;
}> = ({ status, report, month, currentMonth, sessionCount, unreconciled, busy, error, onPublish, onUnpublish, onOpen }) => {
  const isPublished = status === "published" && !!report;
  const nothingToPublish = sessionCount === 0 && !report;
  const btn = "inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold min-h-6 disabled:opacity-60";
  return (
    <div>
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${REPORT_STATUS_CLS[status]}`}>
        {REPORT_STATUS_LABEL[status]}
      </span>
      {isPublished && report?.publishedAt && (
        <span className="block text-[11px] text-[var(--text-faint)] mt-1">{new Date(report.publishedAt).toLocaleDateString("vi-VN")}</span>
      )}
      {!isPublished && month < currentMonth && unreconciled > 0 && (
        <span className="block text-[11px] text-amber-300 mt-1">{unreconciled} ca chưa đối soát</span>
      )}
      {isPublished ? (
        <button type="button" onClick={() => onUnpublish(report!.id)} disabled={busy} className={`${btn} text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]`}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Thu hồi
        </button>
      ) : month >= currentMonth ? (
        <span className="block text-[11px] text-[var(--text-faint)] mt-1" title="Phát hành là đóng sổ số của tháng — chỉ làm sau khi hết tháng.">Chờ hết tháng</span>
      ) : nothingToPublish ? (
        <span className="flex items-center gap-1 text-[11px] text-[var(--text-faint)] mt-1" title="Tháng này brand chưa có ca nào và cũng chưa ai tạo dòng report — không có số liệu gì để gửi.">
          <Ban className="w-3 h-3 shrink-0" /> Không có gì để phát hành
        </span>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2">
          <button type="button" onClick={() => onPublish(report)} disabled={busy} className={`${btn} border border-[var(--accent)]/60 text-[var(--accent-text)] hover:bg-[var(--accent)]/15`}>
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Phát hành
          </button>
          <GoLink label="Xem report" onClick={onOpen} />
        </div>
      )}
      {error && <div className="text-[11px] text-red-300 font-semibold mt-1 max-w-[220px] whitespace-normal">{error}</div>}
    </div>
  );
};
