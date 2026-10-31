import React, { useMemo, useState } from "react";
import { Download, LayoutDashboard } from "lucide-react";
import type { TermsPeriod } from "../lib/commercial/terms";
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
import { todayVn } from "../lib/performance/brandCommitment";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { useToast } from "../hooks/useToast";
import { PageHeader } from "./common/PageHeader";
import { channelRefs, useChannelCards } from "./dashboard/useChannelCards";
import { ddmm, useTooltip } from "./dashboard/shared";
import { PlatformTab } from "./dashboard/period/PlatformTab";
import { OverviewTab, type PlatformSummary } from "./dashboard/period/OverviewTab";
import { accountRow, platformPace, sortAccounts } from "../lib/performance/accountOverview";
import { BrandTab } from "./dashboard/period/BrandTab";
import { rangeLabel } from "./dashboard/period/ui";
import type { AccountVM } from "./runrate/types";

// Dashboard agency (demo duyệt 22/10/2026 — thay 3 tab Tháng này / Theo kỳ / Sức khoẻ): MỘT sàn (thanh "Sàn"), kỳ chọn ở thanh trên
// (Tháng này · 7 ngày + "So với"; 23/10 bỏ "Tháng trước"/"Tự chọn" — Dashboard chỉ xem trong tháng, tháng đã hết xem ở Report Tháng), mọi con số tự so kỳ so sánh (lib/performance/periodCompare.ts). 24/10 thêm tab đầu "Tổng quan account" (mọi sàn, một dòng mỗi kênh, xếp theo rủi ro —
// lib/performance/accountOverview.ts; không theo thanh "Sàn" và bộ chọn kỳ). Hai tab theo sàn:
// "Toàn sàn" (mọi brand của sàn) và "Brand" (một brand: run-rate + 4 nút xem + Key Metrics + shop/ads/đội live đi theo nút).
// Run-rate, dự báo, 4 nút xem chỉ có ở "Tháng này" — số đi qua MỘT lần tính (useChannelCards → buildChannelCard).

type View = "overview" | "platform" | "brand";
const PERIODS: { id: PeriodKey; label: string }[] = [
  { id: "month", label: "Tháng này" },
  { id: "7d", label: "7 ngày" }
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
  /** Mọi sàn agency đang chạy + mọi brand — cho tab Tổng quan account (24/10). Thiếu = chỉ sàn đang chọn. */
  platforms?: ReportPlatform[];
  allBrands?: Brand[];
  /** Đổi sàn của thanh "Sàn" (App) — khi mở một account của sàn khác từ Tổng quan account. */
  onPickPlatform?: (p: ReportPlatform) => void;
  /** Workspace brand (ops): khoá vào một brand — chỉ tab Brand, không có hàng chọn brand. */
  lockBrandId?: string;
  /** Tính tiền từng ca (khối "Lãi gộp mỗi giờ", chỉ CEO/admin) — cùng hàm Finance & P&L. */
  talents: Talent[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  termPeriods?: TermsPeriod[];
  talentRateHistory: TalentRateHistoryEntry[];
}

// Trạng thái kế hoạch tháng này, cam kết, hợp đồng (useChannelCards) — nạp trước trong lúc chờ đợt nạp chung.
export function prefetchAgencyDashboard(_ctx: TabPrefetchCtx): void {
  const month = todayVn().slice(0, 7);
  planStatusesRead.prefetch(month);
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
  const [viewPick, setView] = useState<View>("overview");
  const [brandPick, setBrandId] = useState<string | null>(null);
  const view: View = lockBrandId ? "brand" : viewPick;
  const brandId = lockBrandId ?? brandPick;
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [mode, setMode] = useState<CompareMode>("auto");

  const platSessions = useMemo(() => sessions.filter((s) => platformOf(s) === platform && brands.some((b) => b.id === s.brandId)), [sessions, platform, brands]);
  const coverage = useMemo(() => dataCoverage(platSessions, today), [platSessions, today]);
  const period = useMemo(
    () => resolvePeriod({ key: periodKey, mode, completeEnd: coverage.completeThrough, today, first: FIRST_DATA }),
    [periodKey, mode, coverage.completeThrough, today]
  );

  // Thẻ kênh tháng đang chạy — MỘT lần tính cho cả hai tab.
  const month = today.slice(0, 7);
  // Tổng quan account cần thẻ của MỌI sàn ⇒ một lần nạp cho mọi kênh, các tab theo sàn lọc lại (không nạp hai lần).
  const allPlatforms = useMemo(() => (lockBrandId || !props.platforms?.length ? [platform] : props.platforms), [lockBrandId, props.platforms, platform]);
  const allBrands = lockBrandId ? brands : props.allBrands ?? brands;
  const refs = useMemo(() => channelRefs(allBrands, brandChannels, allPlatforms), [allBrands, brandChannels, allPlatforms]);
  const { cards: allCards, loading, ledger } = useChannelCards({ month, today, refs, brandChannels, sessions, shiftSlots, engineParams, role: currentRole });
  const cards = useMemo(() => allCards.filter((c) => c.platform === platform), [allCards, platform]);
  const platRefs = useMemo(() => refs.filter((r) => r.platform === platform && brands.some((b) => b.id === r.brand.id)), [refs, platform, brands]);
  const overviewRows = useMemo(
    () => sortAccounts(allCards.map((c) => accountRow(c, c.state === "off" ? sessions.filter((s) => s.brandId === c.brandId && platformOf(s) === c.platform) : []))),
    [allCards, sessions]
  );
  const summaries: PlatformSummary[] = useMemo(
    () => allPlatforms.map((p) => {
      const cs = allCards.filter((c) => c.platform === p);
      return { platform: p, pace: platformPace(cs), waiting: cs.filter((c) => c.state !== "off").reduce((a, c) => a + c.coverage.missingSessions, 0) };
    }),
    [allPlatforms, allCards]
  );
  const coverageOf = useMemo(
    () => new Map(allPlatforms.map((p) => [p, dataCoverage(sessions.filter((s) => platformOf(s) === p), today).completeThrough])),
    [allPlatforms, sessions, today]
  );
  const brandOf = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const vms: AccountVM[] = useMemo(() => {
    if (loading || cards.length === 0)
      return platRefs.map((r) => ({
        key: brandPlatformKey(r.brand.id, r.platform), brand: brandOf.get(r.brand.id)!, platform: r.platform, name: r.brand.name,
        planStatus: "none", report: null, actualOnly: 0, completeThrough: null, missingSessions: 0, oldestMissing: null, loading: true
      }));
    return cards.map((c): AccountVM => ({
      key: c.key, brand: brandOf.get(c.brandId)!, platform: c.platform, name: c.name, planStatus: c.planStatus, report: c.report,
      actualOnly: c.monthActual, completeThrough: c.coverage.completeThrough, missingSessions: c.coverage.missingSessions,
      oldestMissing: c.coverage.oldestMissing, loading: false, card: c
    }));
  }, [loading, cards, platRefs, brandOf]);

  const { talents, financeRecords, brandPlatformRates, brandPlatformRateHistory, talentRateHistory, termPeriods } = props;
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const pnl: PnlFn | null = useMemo(() => {
    if (!canSeeMoney) return null;
    const fin = Object.fromEntries(financeRecords.map((f) => [f.sessionId, f]));
    const talentById = Object.fromEntries(talents.map((t) => [t.id, t]));
    const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));
    return (s: LiveSession) => {
      const r = computeSessionPnl(s, fin, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory, termPeriods ?? []);
      return { revenue: r.grossAgencyRev, cost: r.grossAgencyRev - r.netProfit, profit: r.netProfit, missing: r.missingInputs };
    };
  }, [canSeeMoney, financeRecords, talents, brands, brandPlatformRates, talentRateHistory, brandPlatformRateHistory, termPeriods]);

  const pickedBrand = brands.find((b) => b.id === brandId) ?? brands[0] ?? null;
  const openBrand = (id: string) => { setBrandId(id); setView("brand"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openAccount = (id: string, p: ReportPlatform) => { if (p !== platform) props.onPickPlatform?.(p); openBrand(id); };
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
            {([["overview", "Tổng quan account"], ["platform", "Toàn sàn"], ["brand", "Brand"]] as const).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`${seg(view === v)} !text-sm px-3.5 min-h-[32px]`}>{l}</button>
            ))}
          </div>}
          {view !== "overview" && <><div className="flex gap-1 rounded-xl border border-[var(--border)] p-1 overflow-x-auto" role="group" aria-label="Kỳ xem">
            {PERIODS.map((x) => <button key={x.id} type="button" aria-pressed={periodKey === x.id} onClick={() => setPeriodKey(x.id)} className={seg(periodKey === x.id)}>{x.label}</button>)}
          </div>
          <label className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            So với
            <select value={mode} onChange={(e) => setMode(e.target.value as CompareMode)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 min-h-[30px] text-[var(--text)] text-xs font-bold">
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label></>}
          {view !== "overview" && <button type="button" onClick={exportXlsx} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[32px]">
            <Download className="w-3.5 h-3.5" />Tải Excel
          </button>}
        </div>
        {view === "overview" ? (
          <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-faint)] mt-2">
            <span>Tháng <b className="text-[var(--text-muted)]">{Number(month.slice(5))}/{month.slice(0, 4)}</b> · mọi sàn, mỗi sàn tính riêng (không cộng chéo)</span>
            <span>· Dữ liệu đầy đủ đến {allPlatforms.map((p) => `${p} ${coverageOf.get(p) ? ddmm(coverageOf.get(p)!) : "—"}`).join(" · ")}</span>
            {summaries.some((x) => x.waiting > 0) && <button type="button" onClick={() => onNavigate("sessions")} className="min-h-[24px] font-bold text-amber-300 hover:underline">· ca chưa có số liệu: {summaries.map((x) => `${x.platform} ${x.waiting}`).join(" · ")} →</button>}
          </p>
        ) : (
        <p role="status" className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-faint)] mt-2">
          <span>Đang xem <b className="text-[var(--text-muted)]">{label}</b> · {spanDays(period.start, period.end)} ngày · so với <b className="text-[var(--text-muted)]">{prevLabel}</b>{period.mode === "mom" ? " cùng ngày tháng trước" : " ngay trước, cùng độ dài"}</span>
          <span>· Dữ liệu đầy đủ đến {coverage.completeThrough ? ddmm(coverage.completeThrough) : "—"}</span>
          {waiting > 0 && <button type="button" onClick={() => onNavigate("sessions")} className="min-h-[24px] font-bold text-amber-300 hover:underline">· {waiting} ca chưa có số liệu →</button>}
          <span className="sm:ml-auto">Chỉ số trong {platform} · dưới 5 ca không đánh giá tăng/giảm</span>
        </p>
        )}
      </PageHeader>

      {view === "overview" ? (
        <OverviewTab rows={overviewRows} summaries={summaries} brands={allBrands} loading={loading} today={today} onOpenBrand={openAccount} onOpenMonthPlan={onOpenMonthPlan} />
      ) : brands.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--text-muted)]">Chưa có brand nào chạy {platform}. Thêm kênh cho brand ở CRM.</div>
      ) : view === "platform" ? (
        <PlatformTab
          platform={platform}
          period={period}
          brands={brands}
          sessions={platSessions}
          cards={cards}
          cardsLoading={loading}
          waiting={waiting}
          today={today}
          onOpenBrand={openBrand}
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
