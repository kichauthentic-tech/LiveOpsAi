import React, { useCallback, useMemo, useState } from "react";
import { Download, LayoutDashboard } from "lucide-react";
import type { Brand, BrandChannel, BrandPlatformRate, BrandPlatformRateHistoryEntry, LiveSession, SessionFinance, ShiftSlot, Talent, TalentRateHistoryEntry, UserRole } from "../types";
import { computeSessionPnl } from "../lib/pnl";
import type { PnlFn } from "../lib/performance/ceoBrief";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { LANDING_LABEL } from "../lib/performance/forecastCone";
import { runRateExportSheets, type ExportAccount } from "../lib/performance/runRateUpdate";
import { dataCoverage } from "../lib/performance/channelHealth";
import { aggregate, ranIn, resolvePeriod, spanDays, type CompareMode, type PeriodKey } from "../lib/performance/periodCompare";
import { brandPlatformKey, platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { downloadSheetsAsXlsx } from "../lib/exportXlsx";
import { errorMessage } from "../lib/errorMessage";
import { planStatusesRead } from "../lib/db/monthPlans";
import { commitmentsRead, contractsRead } from "../lib/db/brandContracts";
import { nextMonthOf } from "../lib/performance/ceoBrief";
import { todayVn } from "../lib/performance/brandCommitment";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { useToast } from "../hooks/useToast";
import { PageHeader } from "./common/PageHeader";
import { channelRefs, useChannelCards } from "./dashboard/useChannelCards";
import { ddmm, useTooltip } from "./dashboard/shared";
import { PlatformTab } from "./dashboard/period/PlatformTab";
import { BrandTab } from "./dashboard/period/BrandTab";
import { rangeLabel } from "./dashboard/period/ui";
import type { AccountVM } from "./runrate/types";

// Dashboard agency (demo duyệt 22/10/2026 — thay 3 tab Tháng này / Theo kỳ / Sức khoẻ): MỘT sàn (thanh "Sàn"), kỳ chọn ở thanh trên
// (Tháng này · 7 ngày · Tháng trước · Tự chọn + "So với"), mọi con số tự so kỳ so sánh (lib/performance/periodCompare.ts). Hai tab:
// "Toàn sàn" (mọi brand của sàn) và "Brand" (một brand: run-rate + 4 nút xem + Key Metrics + shop/ads/đội live đi theo nút).
// Run-rate, dự báo, 4 nút xem chỉ có ở "Tháng này" — số đi qua MỘT lần tính (useChannelCards → buildChannelCard).

type View = "platform" | "brand";
const PERIODS: { id: PeriodKey; label: string }[] = [
  { id: "month", label: "Tháng này" },
  { id: "7d", label: "7 ngày" },
  { id: "prev", label: "Tháng trước" },
  { id: "custom", label: "Tự chọn" }
];
const MODES: { id: CompareMode; label: string }[] = [
  { id: "auto", label: "Tự động" },
  { id: "mom", label: "Cùng kỳ tháng trước" },
  { id: "prev", label: "Kỳ ngay trước" }
];
const FIRST_DATA = "2026-06-01";

export interface AgencyDashboardProps {
  platform: ReportPlatform;
  today: string;
  /** Brand chạy sàn này. */
  brands: Brand[];
  brandChannels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  engineParams: EngineParams;
  currentRole: UserRole;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
  onNavigate: (tab: string) => void;
  /** Workspace brand (ops): khoá vào một brand — chỉ tab Brand, không có hàng chọn brand. */
  lockBrandId?: string;
  /** Tính tiền từng ca (khối "Lãi gộp mỗi giờ", chỉ CEO/admin) — cùng hàm Finance & P&L. */
  talents: Talent[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talentRateHistory: TalentRateHistoryEntry[];
}

// Trạng thái kế hoạch tháng này + tháng sau, cam kết, hợp đồng (useChannelCards) — nạp trước trong lúc chờ đợt nạp chung.
export function prefetchAgencyDashboard(_ctx: TabPrefetchCtx): void {
  const month = todayVn().slice(0, 7);
  planStatusesRead.prefetch(month);
  planStatusesRead.prefetch(nextMonthOf(month));
  commitmentsRead.prefetch();
  contractsRead.prefetch();
}

const toExport = (vm: AccountVM): ExportAccount => ({
  name: vm.name,
  platform: vm.platform,
  report: vm.report,
  missing: vm.report ? undefined : vm.planStatus === "locked" ? "no_data" : "no_plan",
  actualOnly: vm.actualOnly > 0 ? vm.actualOnly : undefined,
  forecast: vm.card?.forecast?.p50 ?? null,
  landing: vm.card?.landing ? `${LANDING_LABEL[vm.card.landing.key]} · ${Math.round(vm.card.landing.pHit * 100)}%` : null
});

export const AgencyDashboard: React.FC<AgencyDashboardProps> = (props) => {
  const { platform, today, brands, brandChannels, sessions, shiftSlots, engineParams, currentRole, onOpenMonthPlan, onNavigate, lockBrandId } = props;
  const { showToast } = useToast();
  const tooltip = useTooltip();
  const [viewPick, setView] = useState<View>("platform");
  const [brandPick, setBrandId] = useState<string | null>(null);
  const view: View = lockBrandId ? "brand" : viewPick;
  const brandId = lockBrandId ?? brandPick;
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [mode, setMode] = useState<CompareMode>("auto");
  const [custom, setCustom] = useState({ start: `${today.slice(0, 7)}-01`, end: today });

  const platSessions = useMemo(() => sessions.filter((s) => platformOf(s) === platform && brands.some((b) => b.id === s.brandId)), [sessions, platform, brands]);
  const coverage = useMemo(() => dataCoverage(platSessions, today), [platSessions, today]);
  const period = useMemo(
    () => resolvePeriod({ key: periodKey, mode, completeEnd: coverage.completeThrough, today, custom, first: FIRST_DATA }),
    [periodKey, mode, coverage.completeThrough, today, custom]
  );

  // Thẻ kênh tháng đang chạy — MỘT lần tính cho cả hai tab.
  const month = today.slice(0, 7);
  const refs = useMemo(() => channelRefs(brands, brandChannels, [platform]), [brands, brandChannels, platform]);
  const { cards, loading, nextPlans, ledger } = useChannelCards({ month, today, refs, brandChannels, sessions, shiftSlots, engineParams, role: currentRole });
  const brandOf = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const vms: AccountVM[] = useMemo(() => {
    if (loading || cards.length === 0)
      return refs.map((r) => ({
        key: brandPlatformKey(r.brand.id, r.platform), brand: brandOf.get(r.brand.id)!, platform: r.platform, name: r.brand.name,
        planStatus: "none", report: null, actualOnly: 0, completeThrough: null, missingSessions: 0, oldestMissing: null, loading: true
      }));
    return cards.map((c): AccountVM => ({
      key: c.key, brand: brandOf.get(c.brandId)!, platform: c.platform, name: c.name, planStatus: c.planStatus, report: c.report,
      actualOnly: c.monthActual, completeThrough: c.coverage.completeThrough, missingSessions: c.coverage.missingSessions,
      oldestMissing: c.coverage.oldestMissing, loading: false, card: c
    }));
  }, [loading, cards, refs, brandOf]);
  const nextPlanLocked = useCallback((c: { brandId: string; platform: ReportPlatform }) => nextPlans.get(brandPlatformKey(c.brandId, c.platform))?.status === "locked", [nextPlans]);

  const { talents, financeRecords, brandPlatformRates, brandPlatformRateHistory, talentRateHistory } = props;
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const pnl: PnlFn | null = useMemo(() => {
    if (!canSeeMoney) return null;
    const fin = Object.fromEntries(financeRecords.map((f) => [f.sessionId, f]));
    const talentById = Object.fromEntries(talents.map((t) => [t.id, t]));
    const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));
    return (s: LiveSession) => {
      const r = computeSessionPnl(s, fin, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory);
      return { revenue: r.grossAgencyRev, cost: r.grossAgencyRev - r.netProfit, profit: r.netProfit, missing: r.missingInputs };
    };
  }, [canSeeMoney, financeRecords, talents, brands, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]);

  const pickedBrand = brands.find((b) => b.id === brandId) ?? brands[0] ?? null;
  const openBrand = (id: string) => { setBrandId(id); setView("brand"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const waiting = cards.filter((c) => c.state !== "off").reduce((a, c) => a + c.coverage.missingSessions, 0);
  const label = rangeLabel(period.start, period.end), prevLabel = period.noBase ? "—" : rangeLabel(period.prevStart, period.prevEnd);

  const exportXlsx = () => {
    const sheets = period.isCurrentMonth
      ? runRateExportSheets(vms.map(toExport))
      : [{
          name: "So cùng kỳ",
          rows: brands.map((b) => {
            const xs = platSessions.filter((s) => s.brandId === b.id);
            const c = aggregate(ranIn(xs, period.start, period.end)), p = period.noBase ? null : aggregate(ranIn(xs, period.prevStart, period.prevEnd));
            const r = (v: number | null | undefined) => (v == null ? "" : Math.round(v));
            return { Brand: b.name, "Sàn": platform, "Kỳ": label, "Kỳ so sánh": prevLabel, GMV: r(c.gmv), "GMV kỳ so sánh": r(p?.gmv), "GMV/giờ": r(c.gph), "GMV/giờ kỳ so sánh": r(p?.gph), "Giờ live": Math.round(c.hours * 10) / 10, "Giờ live kỳ so sánh": p ? Math.round(p.hours * 10) / 10 : "", Sessions: c.n, Orders: c.orders };
          })
        }];
    downloadSheetsAsXlsx(sheets, `Dashboard_${platform}_${period.start}_${period.end}.xlsx`).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  const seg = (on: boolean) => `px-3 py-1.5 rounded-lg text-xs font-bold min-h-[30px] transition-colors whitespace-nowrap ${on ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`;

  return (
    <div className="space-y-5" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      <PageHeader icon={LayoutDashboard} title={lockBrandId && pickedBrand ? `Dashboard · ${pickedBrand.name}` : "Dashboard"}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {!lockBrandId && <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1" role="tablist" aria-label="Phần của Dashboard">
            {([["platform", "Toàn sàn"], ["brand", "Brand"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`${seg(view === v)} !text-sm px-3.5 min-h-[32px]`}>{l}</button>
            ))}
          </div>}
          <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1 overflow-x-auto" role="group" aria-label="Kỳ xem">
            {PERIODS.map((x) => <button key={x.id} type="button" aria-pressed={periodKey === x.id} onClick={() => setPeriodKey(x.id)} className={seg(periodKey === x.id)}>{x.label}</button>)}
          </div>
          {periodKey === "custom" && (
            <div className="inline-flex items-center gap-1.5 text-xs">
              <label className="sr-only" htmlFor="dash-from">Từ ngày</label>
              <input id="dash-from" type="date" value={custom.start} min={FIRST_DATA} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, start: e.target.value }))} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 min-h-[30px] text-[var(--text)]" />
              <span className="text-[var(--text-faint)]">→</span>
              <label className="sr-only" htmlFor="dash-to">Tới ngày</label>
              <input id="dash-to" type="date" value={custom.end} min={custom.start} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, end: e.target.value }))} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 min-h-[30px] text-[var(--text)]" />
            </div>
          )}
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            So với
            <select value={mode} onChange={(e) => setMode(e.target.value as CompareMode)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 min-h-[30px] text-[var(--text)] text-xs font-bold">
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={exportXlsx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[32px]">
            <Download className="w-3.5 h-3.5" />Tải Excel
          </button>
        </div>
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-faint)] mt-2">
          <span>Đang xem <b className="text-[var(--text-muted)]">{label}</b> · {spanDays(period.start, period.end)} ngày · so với <b className="text-[var(--text-muted)]">{prevLabel}</b>{period.mode === "mom" ? " cùng ngày tháng trước" : " ngay trước, cùng độ dài"}</span>
          <span>· Số đủ tới {coverage.completeThrough ? ddmm(coverage.completeThrough) : "—"}{period.cut ? " (kỳ cắt ở đây)" : ""}</span>
          {waiting > 0 && <button type="button" onClick={() => onNavigate("sessions")} className="min-h-[24px] font-bold text-amber-300 hover:underline">· {waiting} ca chờ số →</button>}
          <span className="sm:ml-auto">Chỉ số trong {platform} · dưới 5 ca thì không tô màu</span>
        </p>
      </PageHeader>

      {brands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Chưa có brand nào chạy {platform}. Thêm kênh cho brand ở CRM.</div>
      ) : view === "platform" ? (
        <PlatformTab
          platform={platform}
          period={period}
          brands={brands}
          sessions={platSessions}
          cards={cards}
          vms={vms}
          cardsLoading={loading}
          nextPlanLocked={nextPlanLocked}
          today={today}
          onOpenBrand={openBrand}
          onOpenMonthPlan={onOpenMonthPlan}
          onNavigate={onNavigate}
          pnl={pnl}
        />
      ) : pickedBrand ? (
        <BrandTab
          brands={brands}
          platform={platform}
          today={today}
          onOpenMonthPlan={onOpenMonthPlan}
          onNavigate={onNavigate}
          brand={pickedBrand}
          locked={!!lockBrandId}
          ledger={ledger.get(brandPlatformKey(pickedBrand.id, platform))}
          onPickBrand={setBrandId}
          period={period}
          platSessions={platSessions}
          vm={vms.find((v) => v.brand.id === pickedBrand.id) ?? null}
        />
      ) : null}
      {tooltip.node}
    </div>
  );
};
