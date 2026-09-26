import React, { useEffect, useMemo, useState } from "react";
import { LayoutGrid, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Brand, BrandMonthlyReport, BrandMonthPlan, BrandPlatformRate, LiveSession } from "../types";
import { fetchPlanStatuses } from "../lib/db/monthPlans";
import { fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import { CommitmentProgress, CommitmentStatus, computeAllProgress, todayVn } from "../lib/performance/brandCommitment";
import { filterLedger, summarize } from "../lib/sessionLedger";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { errorMessage } from "../lib/errorMessage";
import { BrandLogo } from "./ui/BrandLogo";

// Màn toàn cảnh 4 brand cho agency (Đợt C/6, 2026-09-23) — BẢNG trạng thái từng brand cho MỘT
// tháng đang xem, không phải widget KPI kiểu Dashboard cũ (xoá 2026-09-13 vì số tính live/dự phóng
// không đáng tin — xem WORKSPACE_DESIGN.md). Mọi cột ở đây đều là TRẠNG THÁI ĐỌC THẲNG TỪ DB
// (kế hoạch đã chốt chưa, report đã phát hành chưa, rate đã set chưa) hoặc SỐ THẬT đã xảy ra
// (GMV/giờ live từ chính `live_sessions`) — không có ô nào là dự phóng/ước tính cuối tháng.
//
// Câu hỏi màn này trả lời: "tháng này/tháng sau, brand nào đang ổn, brand nào cần tôi để ý ngay" —
// thay vì ops phải mở lần lượt 4 Brand Workspace để tự ghép câu trả lời đó trong đầu.

interface BrandsOverviewProps {
  brands: Brand[];
  sessions: LiveSession[];
  brandPlatformRates: BrandPlatformRate[];
  monthlyReports: Map<string, BrandMonthlyReport>;
}

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
  none: "Chưa có dòng",
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
  on_track: "Đang đúng nhịp",
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
const fmtMonthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `Tháng ${Number(mm)}/${y}`;
};
const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

export const BrandsOverview: React.FC<BrandsOverviewProps> = ({ brands, sessions, brandPlatformRates, monthlyReports }) => {
  const today = todayVn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [planStatuses, setPlanStatuses] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [commitments, setCommitments] = useState<Awaited<ReturnType<typeof fetchBrandMonthlyCommitments>>>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    Promise.all([fetchPlanStatuses(month), fetchBrandMonthlyCommitments()])
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
    return new Map(rows.map((r) => [r.brandId, r] as [string, CommitmentProgress]));
  }, [commitments, brandNameById, sessions, month, today]);

  const rateSetByBrand = useMemo(() => {
    const map = new Map<string, Set<"TikTok" | "Shopee">>();
    for (const r of brandPlatformRates) {
      if (r.ratePerHour <= 0) continue;
      if (!map.has(r.brandId)) map.set(r.brandId, new Set());
      map.get(r.brandId)!.add(r.platform);
    }
    return map;
  }, [brandPlatformRates]);

  const sortedBrands = useMemo(() => brands.slice().sort((a, b) => a.name.localeCompare(b.name)), [brands]);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-[var(--accent-text)]" /> Toàn Cảnh Brand
          </h2>
          <div className="flex items-center gap-1">
            <button onClick={() => setMonth((m) => addMonths(m, -1))} className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-[var(--text)] w-28 text-center">{fmtMonthLabel(month)}</span>
            <button onClick={() => setMonth((m) => addMonths(m, 1))} className="p-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Trạng thái từng brand cho tháng đang xem — số thật đã xảy ra và trạng thái đọc thẳng từ DB, không có ô nào là dự
          phóng.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                <th className="py-2.5 px-4">Brand</th>
                <th className="py-2.5 px-2">Kế hoạch tháng</th>
                <th className="py-2.5 px-2">Cam kết</th>
                <th className="py-2.5 px-2 text-right">Giờ live</th>
                <th className="py-2.5 px-2 text-right">GMV</th>
                <th className="py-2.5 px-2">Report Tháng</th>
                <th className="py-2.5 px-2">Rate Card</th>
              </tr>
            </thead>
            <tbody>
              {sortedBrands.map((b) => {
                const plan = planStatuses.get(b.id);
                const planStatus = plan?.status ?? "none";
                const progress = progressByBrand.get(b.id);
                const commitStatus: CommitmentStatus = progress?.status ?? "no_commitment";
                const rows = filterLedger(sessions, { month, brandId: b.id }, today);
                const s = summarize(rows, today);
                const report = monthlyReports.get(`${b.id}|${month}`);
                const reportStatus = report?.status ?? "none";
                const rates = rateSetByBrand.get(b.id);
                return (
                  <tr key={b.id} className="border-b border-[var(--border-muted)] align-top">
                    <td className="py-2.5 px-4">
                      <span className="inline-flex items-center gap-1.5 font-bold text-[var(--text)]">
                        <BrandLogo brand={b} size="xs" /> {b.name}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${PLAN_STATUS_CLS[planStatus]}`}>
                        {PLAN_STATUS_LABEL[planStatus]}
                      </span>
                      {plan?.brandConfirmedAt && (
                        <span className="block text-[11px] text-emerald-400 mt-1">✓ brand đã xác nhận</span>
                      )}
                      {plan && plan.targetGmv > 0 && (
                        <span className="block text-[11px] text-[var(--text-faint)] mt-0.5">
                          Target {formatCurrencyAdaptive(plan.targetGmv, "")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${COMMIT_STATUS_CLS[commitStatus]}`}>
                        {COMMIT_STATUS_LABEL[commitStatus]}
                      </span>
                      {progress && (
                        <span className="block text-[11px] text-[var(--text-faint)] mt-1">
                          {fmtHours(progress.plannedTotalHours)}/{fmtHours(progress.committedHours)}
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
                      {s.gmv > 0 ? formatCurrencyAdaptive(s.gmv, "") : <span className="text-[var(--text-faint)] font-normal">—</span>}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${REPORT_STATUS_CLS[reportStatus]}`}>
                        {REPORT_STATUS_LABEL[reportStatus]}
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      {rates && rates.size > 0 ? (
                        <span className="text-[11px] text-[var(--text-muted)]">{[...rates].join(", ")}</span>
                      ) : (
                        <span className="text-[11px] text-rose-300 font-bold">Chưa set</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {sortedBrands.length === 0 && (
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
