import React, { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../lib/scheduling/engineParams";
import { defaultViewMonth } from "../lib/defaultMonth";
import { AlertTriangle, ChevronLeft, ChevronRight, CircleAlert, Info, LayoutDashboard } from "lucide-react";
import {
  Brand,
  BrandChannel,
  BrandMonthPlan,
  BrandMonthPlanSlot,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  LiveSession,
  SessionFinance,
  ShiftSlot,
  Talent,
  TalentRateHistoryEntry,
  UserRole
} from "../types";
import {
  Grain,
  Issue,
  MonthOutlook,
  PnlFn,
  Totals,
  buildIssues,
  combineOutlooks,
  financeOf,
  inRange,
  lastDataDate,
  monthOutlook,
  monthTargetOf,
  nextMonthOf,
  periodFor,
  prevMonthOf,
  totalsOf
} from "../lib/performance/ceoBrief";
import { todayVn } from "../lib/performance/brandCommitment";
import { computeSessionPnl } from "../lib/pnl";
import { monthPlanRead, planStatusesRead } from "../lib/db/monthPlans";
import { recordForecastSnapshots } from "../lib/db/forecastSnapshots";
import { coneHalf } from "../lib/performance/forecastCone";
import { addDays, eachDay } from "../lib/dateUtils";
import { CampOverrides, effectiveCamp } from "../lib/campaignDays";
import { isCountable, sessionHours } from "../lib/performance/hostPerformance";
import { handlingPlan, type HandlingPlan } from "../lib/performance/handlingPlan";
import { planRunRate, type PlanRunRate } from "../lib/performance/planRunRate";
import { profileOf } from "../lib/platforms/profiles";
import { PageIntro } from "./common/PageIntro";
import { MonthPicker } from "./common/MonthPicker";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { channelTitle, platformOf, brandMonthKey, brandPlatformKey, inPlatformScope, PLATFORM_SCOPE_LABEL, type ReportPlatform } from "../lib/reportPlatform";
import { platformsOfBrand } from "../lib/channels";
import { ACTION_TAB, Card, Kpi, ddmm, hrs, money, num, pct, useTooltip } from "./dashboard/shared";
import { Cockpit } from "./dashboard/Cockpit";
import { DrillDown } from "./dashboard/DrillDown";
import { ActionPlan } from "./dashboard/ActionPlan";
import { AgencyHealth } from "./dashboard/AgencyHealth";
import { MonthOverMonth } from "./dashboard/MonthOverMonth";
import { StaffSection } from "./dashboard/StaffSection";
import { FinanceSection } from "./dashboard/FinanceSection";
import type { DashModel } from "./dashboard/model";

// Dashboard agency (làm lại 09/10/2026 — thay Bản Tin CEO một trang dài). Mọi luật số nằm ở lib/performance/*
// (ceoBrief, planRunRate, forecastCone, handlingPlan, runRateLadder); các file components/dashboard/* và file này chỉ trình bày.
// Bốn tab: Overview (sáu câu hỏi của CEO) · Deepdive (kênh → đợt → ngày → ca) · Action (phương án theo dự phóng) · Agency (nhân sự, tháng qua tháng, tiền).
// Khối tiền chỉ ceo/admin thấy, và chỉ cộng ca ĐỦ dữ liệu để tính tiền. Mỗi sàn một khối riêng (App.perPlatformBlocks): không cộng GMV hai sàn.

interface CeoBriefProps {
  /** Sàn của workspace agency (07/10). */
  platform: ReportPlatform;
  sessions: LiveSession[];
  brands: Brand[];
  /** Kênh brand × sàn (0149) — nguồn duy nhất cho "brand chạy sàn nào". */
  brandChannels: BrandChannel[];
  talents: Talent[];
  shiftSlots: ShiftSlot[];
  /** brandMonthKey (brand × tháng × sàn) → target từng ca của Kế Hoạch Tháng đã chốt, gồm cả ca đã mất shift_slot (lỗi E2E #1). */
  planSlotTargets: Map<string, { date: string; target: number }[]>;
  planMonthTotals: Map<string, number>;
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talentRateHistory: TalentRateHistoryEntry[];
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  /** Tham số engine (AI Training Center) — dự báo tháng v3 đọc nhóm `fc*`/`alloc*`. Thiếu = mặc định. */
  engineParams?: EngineParams;
}

type DashTab = "overview" | "drill" | "plan" | "agency";
const TAB_LABEL: Record<DashTab, string> = { overview: "Overview", drill: "Deepdive", plan: "Action", agency: "Agency" };

// Trạng thái kế hoạch tháng này + tháng sau — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
export function prefetchCeoBrief(_ctx: TabPrefetchCtx): void {
  const month = todayVn().slice(0, 7);
  planStatusesRead.prefetch(month);
  planStatusesRead.prefetch(nextMonthOf(month));
}

export default function CeoBrief(props: CeoBriefProps) {
  const { platform, sessions, brands, brandChannels, talents, shiftSlots, planSlotTargets, planMonthTotals, financeRecords, brandPlatformRates, brandPlatformRateHistory, talentRateHistory, currentRole, onNavigate } = props;
  const engineParams = props.engineParams ?? DEFAULT_ENGINE_PARAMS;
  const today = todayVn();
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const [grain, setGrain] = useState<Grain>("month");
  // Mở tháng gần nhất có ca, không phải tháng của hôm nay (lib/defaultMonth.ts — audit người mới 2026-10-04).
  const [anchor, setAnchor] = useState(() => {
    const m = defaultViewMonth(today, sessions);
    return m === today.slice(0, 7) ? today : `${m}-01`;
  });
  const [customEnd, setCustomEnd] = useState(today);
  const [brandId, setBrandId] = useState<string>("all");
  const [tab, setTab] = useState<DashTab>("overview");
  // Ca kế hoạch của các kênh đã CHỐT (brandId → ca) — nguồn của run-rate theo ca/ngày/đợt (planRunRate).
  const [planSlots, setPlanSlots] = useState<Map<string, BrandMonthPlanSlot[]>>(new Map());
  // Sàn do workspace agency quyết định (07/10): hai sàn không gộp được nên Bản Tin CEO chỉ có MỘT sàn, không có "cả 2 sàn".
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [nextPlans, setNextPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const tooltip = useTooltip();

  const scopeIds = useMemo(() => (brandId === "all" ? brands.map((b) => b.id) : [brandId]), [brandId, brands]);
  const platformSessions = useMemo(() => sessions.filter((s) => inPlatformScope(s, platform)), [sessions, platform]);
  const scopeSessions = useMemo(() => platformSessions.filter((s) => scopeIds.includes(s.brandId)), [platformSessions, scopeIds]);
  const dataEnd = useMemo(() => lastDataDate(scopeSessions, today), [scopeSessions, today]);
  const period = useMemo(() => periodFor(grain, anchor, today, dataEnd, customEnd), [grain, anchor, today, dataEnd, customEnd]);
  const month = (grain === "month" ? anchor : period.start).slice(0, 7);

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => { alive = false; };
  }, [month]);
  // Chỉ đọc ca kế hoạch của kênh ĐÃ CHỐT (kế hoạch nháp không có run-rate). Một request mỗi brand, dedupe với màn khác.
  useEffect(() => {
    let alive = true;
    const locked = brands.filter((b) => plans.get(brandPlatformKey(b.id, platform))?.status === "locked");
    if (locked.length === 0) return;
    Promise.all(locked.map((b) => monthPlanRead.take(b.id, month, platform).then((r): [string, BrandMonthPlanSlot[]] => [b.id, r?.slots ?? []]).catch((): [string, BrandMonthPlanSlot[]] => [b.id, []])))
      .then((rows) => alive && setPlanSlots(new Map(rows)));
    return () => { alive = false; };
  }, [plans, brands, platform, month]);
  useEffect(() => {
    let alive = true;
    planStatusesRead.take(nextMonthOf(today.slice(0, 7))).then((m) => alive && setNextPlans(m)).catch(() => alive && setNextPlans(new Map()));
    return () => { alive = false; };
  }, [today]);

  // ---------- tiền ----------
  const pnl: PnlFn = useMemo(() => {
    const financeBySessionId = Object.fromEntries(financeRecords.map((f) => [f.sessionId, f]));
    const talentById = Object.fromEntries(talents.map((t) => [t.id, t]));
    const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));
    return (s: LiveSession) => {
      const r = computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory);
      return { revenue: r.grossAgencyRev, cost: r.grossAgencyRev - r.netProfit, profit: r.netProfit, missing: r.missingInputs };
    };
  }, [financeRecords, talents, brands, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]);

  // ---------- kỳ đang xem ----------
  const hasPeriod = period.end >= period.start;
  const curSessions = useMemo(() => (hasPeriod ? inRange(scopeSessions, period.start, period.end) : []), [scopeSessions, period, hasPeriod]);
  const prevSessions = useMemo(() => inRange(scopeSessions, period.prevStart, period.prevEnd), [scopeSessions, period]);
  const cur = useMemo(() => totalsOf(curSessions), [curSessions]);
  const noCur = curSessions.length === 0;
  const prev = useMemo(() => totalsOf(prevSessions), [prevSessions]);
  const fin = useMemo(() => (canSeeMoney ? financeOf(curSessions, pnl) : null), [canSeeMoney, curSessions, pnl]);
  const finPrev = useMemo(() => (canSeeMoney ? financeOf(prevSessions, pnl) : null), [canSeeMoney, prevSessions, pnl]);

  const sparkDays = useMemo(() => {
    if (!hasPeriod) return [];
    const from = grain === "day" || period.end === period.start ? addDays(period.end, -13) : period.start;
    return eachDay(from, period.end);
  }, [grain, period, hasPeriod]);
  // Bộ chỉ số của sàn đang xem (hồ sơ sàn) — ô phễu và bảng tháng qua tháng đọc từ đây, không rẽ nhánh theo tên sàn.
  const prof = profileOf(platform);
  const metricsOf = (xs: LiveSession[]) => prof.metrics.ofSessions(xs.filter(isCountable), sessionHours);
  const curM = useMemo(() => metricsOf(curSessions), [curSessions, prof]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevM = useMemo(() => metricsOf(prevSessions), [prevSessions, prof]); // eslint-disable-line react-hooks/exhaustive-deps
  // Line theo ngày của kỳ đang xem + đường nét đứt kỳ trước, cùng thứ tự ngày (ngày i của kỳ này ↔ ngày i của kỳ trước).
  const prevOffset = hasPeriod ? eachDay(period.prevStart, period.start).length - 1 : 0; // số ngày lùi về kỳ trước
  const sparkBuckets = (days: string[]) => {
    const byDate = new Map<string, LiveSession[]>();
    for (const s of scopeSessions) if (s.date >= (days[0] ?? "9") && s.date <= (days[days.length - 1] ?? "")) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    return byDate;
  };
  const strictPrev = !(grain === "day" || period.end === period.start); // xem 1 ngày: line 14 ngày gần nhất, kỳ trước lùi cùng số ngày, không cắt theo prevEnd
  const sparkOf = (pick: (xs: LiveSession[]) => number | null) => {
    const curBy = sparkBuckets(sparkDays);
    const prevDays = sparkDays.map((d) => addDays(d, -prevOffset));
    const prevBy = sparkBuckets(prevDays);
    return {
      series: sparkDays.map((d) => pick(curBy.get(d) ?? []) ?? 0),
      prevSeries: prevDays.map((d) => (strictPrev && (d < period.prevStart || d > period.prevEnd) ? null : pick(prevBy.get(d) ?? []) ?? 0)),
    };
  };
  const seriesM = (key: string) => sparkOf((xs) => prof.metrics.value(metricsOf(xs), key));
  const series = (pick: (t: Totals) => number | null) => sparkOf((xs) => pick(totalsOf(xs)));

  // ---------- tháng: target, run-rate, dự phóng ----------
  // Mỗi kênh brand × sàn một outlook (target của kế hoạch ĐÚNG SÀN), rồi cộng theo brand trong phạm vi sàn đang xem.
  const channels = useMemo(
    () => brands.filter((b) => platformsOfBrand(brandChannels, b.id).includes(platform)).map((b) => ({ b, p: platform })),
    [brands, brandChannels, platform]
  );
  const channelOutlooks = useMemo(() => {
    const out = new Map<string, MonthOutlook>();
    for (const { b, p } of channels) {
      const key = brandMonthKey(b.id, month, p);
      const plan = plans.get(brandPlatformKey(b.id, p));
      // Cùng luật khung camp với mọi màn (effectiveCamp).
      const camp: CampOverrides = effectiveCamp(plan?.campRanges);
      const lockedSlotTargets = planSlotTargets.get(key) ?? [];
      const target = monthTargetOf(month, planMonthTotals.get(key), lockedSlotTargets);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      const open = shiftSlots.filter((sl) => sl.brandId === b.id && platformOf(sl) === p && sl.status === "open" && !sl.sessionId);
      out.set(brandPlatformKey(b.id, p), monthOutlook(month, today, chSessions, open, target, camp, engineParams));
    }
    return out;
  }, [channels, plans, month, shiftSlots, planSlotTargets, planMonthTotals, sessions, today, engineParams]);
  const outlooks = useMemo(() => {
    const out = new Map<string, MonthOutlook>();
    for (const b of brands) {
      const parts = channels.filter((c) => c.b.id === b.id).map((c) => channelOutlooks.get(brandPlatformKey(b.id, c.p))!).filter(Boolean);
      if (parts.length) out.set(b.id, parts.length === 1 ? parts[0] : combineOutlooks(month, today, parts));
    }
    return out;
  }, [brands, channels, channelOutlooks, month, today]);
  const scopeOutlook = useMemo(() => combineOutlooks(month, today, scopeIds.map((id) => outlooks.get(id)!).filter(Boolean)), [month, today, scopeIds, outlooks]);
  const multiPlatform = (id: string) => platformsOfBrand(brandChannels, id).length > 1;
  const channelName = (b: Brand, p: ReportPlatform) => channelTitle(b.name, p, multiPlatform(b.id));

  // Sổ độ chính xác dự báo (0163, engine target v3 P7): khi ceo/ops/admin xem THÁNG NÀY, ghi dự phóng của từng kênh cho hôm nay
  // (mở nhiều lần thì DB ghi đè dòng của ngày). Mỗi kênh tối đa một lần ghi cho mỗi (ngày, số dự phóng) trong phiên. Lỗi ghi không
  // làm hỏng Dashboard — chỉ mất một dòng sổ.
  const ledgerWritten = useRef(new Set<string>());
  useEffect(() => {
    if (!["ceo", "operations", "admin"].includes(currentRole) || month !== today.slice(0, 7)) return;
    const rows = channels
      .map(({ b, p }) => ({ b, p, o: channelOutlooks.get(brandPlatformKey(b.id, p)) }))
      .filter((x): x is { b: Brand; p: ReportPlatform; o: MonthOutlook } => !!x.o && x.o.forecastModel === "shape" && x.o.projectionMethod !== "none" && (x.o.actual > 0 || x.o.pending.length > 0))
      .map(({ b, p, o }) => {
        const half = coneHalf(o.actual, o.projected, o.coneCoef);
        return { brandId: b.id, platform: p, month, asOf: today, kind: "daily" as const, p50: o.projected, lo: o.projected - half, hi: o.projected + half, actual: o.actual, target: o.target?.total ?? null, seenShare: o.shape?.seenShare ?? null, ratio: o.shape?.ratio ?? null };
      })
      .filter((r) => !ledgerWritten.current.has(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    if (rows.length === 0) return;
    rows.forEach((r) => ledgerWritten.current.add(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    recordForecastSnapshots(rows).catch((e) => console.warn("Ghi sổ dự báo không được:", e));
  }, [channelOutlooks, channels, currentRole, month, today]);

  const issues = useMemo(
    () =>
      buildIssues({
        today,
        // Cảnh báo theo từng kênh brand × sàn: cộng hai sàn thì sàn tụt bị sàn chạy tốt che mất.
        brands: channels
          .filter(({ b }) => scopeIds.includes(b.id))
          .map(({ b, p }) => ({
            brandId: b.id,
            name: channelName(b, p),
            clientName: b.name,
            platform: p,
            outlook: channelOutlooks.get(brandPlatformKey(b.id, p))!,
            lastData: lastDataDate(sessions.filter((s) => s.brandId === b.id && platformOf(s) === p), today),
            nextPlan: nextPlans.get(brandPlatformKey(b.id, p))?.status ?? null
          })),
        periodSessions: curSessions,
        finance: fin,
        agencyScope: brandId === "all",
        fmt: money
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channelName chỉ đọc `channels`
    [today, channels, scopeIds, channelOutlooks, sessions, nextPlans, curSessions, fin, brandId]
  );

  // ---------- điều khiển kỳ ----------
  const shift = (dir: -1 | 1) => {
    if (grain === "day") setAnchor(addDays(anchor, dir));
    else if (grain === "week") setAnchor(addDays(anchor, dir * 7));
    else if (grain === "month") setAnchor(`${dir < 0 ? prevMonthOf(anchor.slice(0, 7)) : nextMonthOf(anchor.slice(0, 7))}-01`);
  };
  const pickGrain = (g: Grain) => {
    setGrain(g);
    if (g === "day") setAnchor(dataEnd && dataEnd < today ? dataEnd : addDays(today, -1));
    else if (g === "custom") { setAnchor(`${today.slice(0, 7)}-01`); setCustomEnd(today); }
    else setAnchor(today);
  };
  const periodLabel = !hasPeriod
    ? "Kỳ này chưa có số"
    : grain === "day"
      ? `Ngày ${ddmm(period.start)}`
      : grain === "month"
        ? `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)} · ${ddmm(period.start)}–${ddmm(period.end)}`
        : `${ddmm(period.start)} → ${ddmm(period.end)}`;
  const compareLabel = grain === "day" ? `so với cùng thứ tuần trước (${ddmm(period.prevStart)})` : `so với ${ddmm(period.prevStart)}–${ddmm(period.prevEnd)}`;
  const canNext = grain === "custom" ? false : grain === "day" ? anchor < today : period.calendarEnd < today;
  const inputCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";
  const stale = dataEnd != null && dataEnd < addDays(today, -1);
  // ---------- run-rate theo kế hoạch đã chốt + phương án xử lý (từng kênh) ----------
  const planRR = useMemo(() => {
    const out = new Map<string, PlanRunRate>();
    for (const { b, p } of channels) {
      const slots = planSlots.get(b.id);
      if (!slots || slots.length === 0 || plans.get(brandPlatformKey(b.id, p))?.status !== "locked") continue;
      const camp: CampOverrides = effectiveCamp(plans.get(brandPlatformKey(b.id, p))?.campRanges);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      out.set(b.id, planRunRate(month, slots, shiftSlots.filter((sl) => sl.brandId === b.id), chSessions, today, camp));
    }
    return out;
  }, [channels, planSlots, plans, sessions, shiftSlots, month, today]);
  const handling = useMemo(() => {
    const out = new Map<string, HandlingPlan>();
    for (const { b, p } of channels) {
      const o = channelOutlooks.get(brandPlatformKey(b.id, p));
      if (!o || (o.actual <= 0 && o.pending.length === 0)) continue;
      const camp: CampOverrides = effectiveCamp(plans.get(brandPlatformKey(b.id, p))?.campRanges);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      const plan = plans.get(brandPlatformKey(b.id, p));
      out.set(b.id, handlingPlan({ outlook: o, today, sessions: chSessions, camp, slotHours: plan?.defaultSlotHours, checkpointCap: engineParams.fcCheckpointCap }));
    }
    return out;
  }, [channels, channelOutlooks, plans, sessions, today, engineParams.fcCheckpointCap]);

  const scopedBrands = useMemo(() => brands.filter((b) => scopeIds.includes(b.id)), [brands, scopeIds]);
  const model: DashModel = {
    platform, today, month, brands, scopeIds, platformSessions, scopeSessions, outlooks, scopeOutlook, planRR, handling,
    cur, prev, issues, channelName: (b) => channelName(b, platform)
  };

  const kpi = (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Kpi empty={noCur} label="LIVE GMV" value={money(cur.gmv)} cur={cur.gmv} prev={prev.gmv} extra={`${num(cur.sessions)} ca`} {...series((t) => t.gmv)} />
      <Kpi empty={noCur} label="Giờ live" value={hrs(cur.hours)} cur={cur.hours} prev={prev.hours} {...series((t) => t.hours)} />
      <Kpi empty={noCur} label="GMV/giờ" value={money(cur.gmvPerHour)} cur={cur.gmvPerHour} prev={prev.gmvPerHour} {...series((t) => t.gmvPerHour)} />
      <Kpi empty={noCur} label="Orders" value={prof.metrics.value(curM, "orders") == null ? "—" : num(cur.orders)} cur={cur.orders} prev={prev.orders} extra={cur.aov ? `${prof.basketLabel} ${money(cur.aov)}` : undefined} {...series((t) => t.orders)} />
      {prof.briefKpis.map(({ key, label }) => {
        const def = prof.metrics.defs.find((d) => d.key === key)!;
        const c = prof.metrics.value(curM, key);
        return <Kpi key={key} empty={noCur} label={label} value={prof.metrics.fmt(def, c)} cur={c ?? 0} prev={prof.metrics.value(prevM, key) ?? 0} {...seriesM(key)} />;
      })}
      {canSeeMoney && fin && (
        <>
          <Kpi label="Doanh thu agency" value={fin.priced ? money(fin.revenue) : "Chưa tính được"} cur={fin.priced ? fin.revenue : null} prev={finPrev?.priced ? finPrev.revenue : null} extra={fin.sessions ? `${fin.priced}/${fin.sessions} ca đủ dữ liệu` : undefined} locked />
          <Kpi label="Lãi gộp" value={fin.priced ? money(fin.profit) : "Chưa tính được"} cur={fin.priced ? fin.profit : null} prev={finPrev?.priced ? finPrev.profit : null} extra={fin.margin != null ? `biên ${pct(fin.margin)}` : undefined} locked />
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-7" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}

      {/* Đầu trang + bộ lọc */}
      <Card className="!p-4 sm:!p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-[var(--accent-text)]" /> Dashboard
            </h2>
            <PageIntro>
              Toàn cảnh agency và từng tài khoản: đang ở đâu, cuối tháng về đâu, sắp tới gì, phải làm gì{canSeeMoney ? ", kèm nhân sự và tiền" : " và nhân sự"}. So sánh luôn cắt về cùng số ngày có số liệu.
            </PageIntro>
          </div>
          <span
            className={`self-start shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${stale ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}
            title="Ngày gần nhất có ca đã có số liệu, trong phạm vi brand đang xem"
          >
            {dataEnd ? `● Số liệu đến ${ddmm(dataEnd)}${stale ? " — chưa cập nhật" : ""}` : "Chưa có số liệu"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Kỳ xem">
            {(["day", "week", "month", "custom"] as Grain[]).map((g) => (
              <button
                key={g}
                onClick={() => pickGrain(g)}
                aria-pressed={grain === g}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${grain === g ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
              >
                {{ day: "Ngày", week: "Tuần", month: "Tháng", custom: "Tuỳ chọn" }[g]}
              </button>
            ))}
          </div>
          {grain !== "custom" && (
            <div className="inline-flex items-center gap-1">
              <button onClick={() => shift(-1)} className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Kỳ trước"><ChevronLeft className="w-4 h-4" /></button>
              {grain === "day" && <input type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${inputCls} font-mono`} aria-label="Ngày" />}
              {grain === "month" && <MonthPicker value={anchor.slice(0, 7)} max={today.slice(0, 7)} onChange={(m) => setAnchor(`${m}-01`)} arrows={false} ariaLabel="Tháng" />}
              {grain === "week" && <span className="px-2 text-sm font-bold text-[var(--text)]">{ddmm(period.start)} – {ddmm(period.calendarEnd)}</span>}
              <button onClick={() => shift(1)} disabled={!canNext} className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30" aria-label="Kỳ sau"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          {grain === "custom" && (
            <div className="inline-flex items-center gap-1.5 text-sm text-[var(--text-faint)]">
              <input type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${inputCls} font-mono`} aria-label="Từ ngày" />→
              <input type="date" value={customEnd} max={today} onChange={(e) => e.target.value && setCustomEnd(e.target.value)} className={`${inputCls} font-mono`} aria-label="Đến ngày" />
            </div>
          )}
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls} aria-label="Brand">
            <option value="all">Tất cả brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Đang xem <b className="text-[var(--text)]">{periodLabel}</b>
          {" · "}<b className="text-[var(--text)]">{PLATFORM_SCOPE_LABEL[platform]}</b>
          {hasPeriod && <> · mũi tên {compareLabel} · nét đứt trên biểu đồ nhỏ = kỳ so sánh</>}
          {period.cutByData && <span className="text-amber-300"> · kỳ cắt tới {ddmm(period.end)} vì số liệu mới về tới ngày đó</span>}
        </p>
        <div className="flex flex-wrap gap-1 border-t border-[var(--border)] pt-3" role="tablist" aria-label="Phần của Dashboard">
          {(Object.keys(TAB_LABEL) as DashTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === t ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/40"}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </Card>

      {tab === "overview" && (
        <Cockpit
          m={model}
          kpi={kpi}
          issues={<IssueList issues={issues} onNavigate={onNavigate} />}
          selected={brandId}
          onSelectBrand={(id) => setBrandId(brandId === id ? "all" : id)}
          onNavigate={onNavigate}
          onOpenPlan={() => setTab("plan")}
        />
      )}
      {tab === "drill" && <DrillDown m={model} onNavigate={onNavigate} />}
      {tab === "plan" && <ActionPlan m={model} />}
      {tab === "agency" && (
        <div className="space-y-5 sm:space-y-7">
          <AgencyHealth m={model} curSessions={curSessions} onNavigate={onNavigate} />
          <MonthOverMonth sessions={scopeSessions} brands={scopedBrands} lastMonth={dataEnd && dataEnd.slice(0, 7) < today.slice(0, 7) ? dataEnd.slice(0, 7) : today.slice(0, 7)} dataEnd={dataEnd} pnl={canSeeMoney ? pnl : null} metrics={prof.metrics} />
          <StaffSection cur={curSessions} prev={prevSessions} />
          {canSeeMoney && fin && <FinanceSection fin={fin} finPrev={finPrev} sessions={curSessions} brands={scopedBrands} pnl={pnl} period={period} onNavigate={onNavigate} />}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

const IssueList: React.FC<{ issues: Issue[]; onNavigate: (tab: string) => void }> = ({ issues, onNavigate }) => (
  <Card>
    <div className="flex items-baseline justify-between mb-2">
      <h4 className="font-black text-[var(--text)]">Cần chú ý</h4>
      <span className="text-[11px] text-[var(--text-faint)]">tự sinh từ số liệu · đỏ trước</span>
    </div>
    {issues.length === 0 ? (
      <p className="text-sm text-emerald-400 py-2">Không có gì cần chú ý.</p>
    ) : (
      <ul className="divide-y divide-[var(--border)]">
        {issues.slice(0, 8).map((it, i) => {
          const Icon = it.level === "info" ? Info : it.level === "bad" ? CircleAlert : AlertTriangle;
          const color = it.level === "bad" ? "text-rose-400" : it.level === "warn" ? "text-amber-300" : "text-[var(--text-faint)]";
          return (
            <li key={i} className="py-2.5 flex gap-2.5">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} aria-label={it.level === "bad" ? "Cần xử lý" : it.level === "warn" ? "Cần để ý" : "Thông tin"} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-[var(--text)]">{it.title}</p>
                <p className="text-xs text-[var(--text-faint)] leading-snug">{it.detail}</p>
                {it.action && (
                  <button onClick={() => onNavigate(ACTION_TAB[it.action!].tab)} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-xs font-bold text-[var(--accent-text)] hover:underline mt-0.5">
                    {ACTION_TAB[it.action].label} →
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    )}
  </Card>
);
