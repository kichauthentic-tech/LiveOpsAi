import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Info, LayoutDashboard, Lock, Minus } from "lucide-react";
import {
  Brand,
  BrandMonthlyReport,
  BrandMonthPlan,
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
  BucketOutlook,
  FinanceTotals,
  Grain,
  Issue,
  IssueAction,
  MonthOutlook,
  PROJECTION_ERROR_BAND,
  PnlFn,
  Totals,
  assistantRows,
  buildIssues,
  change,
  combineOutlooks,
  financeOf,
  hostRows,
  inRange,
  lastDataDate,
  monthColumns,
  monthEndOf,
  monthOutlook,
  monthTargetOf,
  nextMonthOf,
  pairRows,
  periodFor,
  prevMonthOf,
  totalsOf
} from "../lib/performance/ceoBrief";
import { buildMonthTargetPlan } from "../lib/performance/targetAllocation";
import { metricHint } from "../lib/metricGlossary";
import { todayVn } from "../lib/performance/brandCommitment";
import { PNL_MISSING_LABEL, PnlMissingInput, computeSessionPnl } from "../lib/pnl";
import { fetchPlanStatuses } from "../lib/db/monthPlans";
import { addDays, eachDay } from "../lib/dateUtils";
import { CampDayBucket, CampOverrides } from "../lib/campaignDays";
import { getBrandTheme } from "../lib/brandTheme";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { BrandLogo } from "./ui/BrandLogo";

// Bản Tin CEO (2026-09-25) — thay Toàn Cảnh Agency. Mọi luật số nằm ở lib/performance/ceoBrief.ts;
// file này chỉ trình bày. Khối tiền chỉ ceo/admin thấy, và chỉ cộng ca ĐỦ dữ liệu để tính tiền
// (không in số tính trên rate = 0 hay % mặc định trong code).

interface CeoBriefProps {
  sessions: LiveSession[];
  brands: Brand[];
  talents: Talent[];
  shiftSlots: ShiftSlot[];
  planTargetsBySlotId: Map<string, number>;
  planMonthTotals: Map<string, number>;
  monthlyReports: Map<string, BrandMonthlyReport>;
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talentRateHistory: TalentRateHistoryEntry[];
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
}

const ACTION_TAB: Record<IssueAction, { tab: string; label: string }> = {
  sessions: { tab: "sessions", label: "Mở Sổ Ca" },
  month_plan: { tab: "month_plan", label: "Mở Kế Hoạch Tháng" },
  reconcile: { tab: "live_reconciliation", label: "Mở Đối Soát" },
  talents: { tab: "talents", label: "Mở Talent Pool" },
  rate_card: { tab: "crm", label: "Mở Rate Card" },
  host_performance: { tab: "host_performance", label: "Mở Hiệu Suất Host" }
};
const BUCKET_LABEL: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Daily" };
const BUCKET_COLOR: Record<CampDayBucket, string> = { dday: "var(--accent)", midmonth: "var(--success)", payday: "var(--warning)", daily: "var(--text-faint)" };
const WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const money = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : formatCurrencyAdaptive(v, ""));
const moneyShort = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tỷ`;
  if (a >= 1e6) return `${Math.round(v / 1e6).toLocaleString("vi-VN")}tr`;
  return v ? `${Math.round(v / 1e3).toLocaleString("vi-VN")}k` : "0";
};
const pct = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
const num = (v: number) => Math.round(v).toLocaleString("vi-VN");
const hrs = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ`;
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const weekdayIdx = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Màu brand cho biểu đồ: JOCKEY/Franklin có màu gần đen — không nhìn thấy trên nền tối — nên dùng màu phụ. */
function chartColor(name: string): string {
  const t = getBrandTheme(name);
  const h = t.primary.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.2 ? "#94a3b8" : t.primary;
}

const Delta: React.FC<{ cur: number | null; prev: number | null; goodWhenUp?: boolean }> = ({ cur, prev, goodWhenUp = true }) => {
  const c = change(cur, prev);
  if (c == null) return <span className="text-[11px] text-[var(--text-faint)]">kỳ trước chưa có số</span>;
  if (Math.abs(c) < 0.005) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--text-faint)]"><Minus className="w-3 h-3" />0%</span>;
  const good = c > 0 === goodWhenUp;
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? "text-emerald-400" : "text-rose-400"}`}>
      <Icon className="w-3 h-3" />
      {(Math.abs(c) * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(c) < 0.1 ? 1 : 0 })}%
    </span>
  );
};

const Card: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ className = "", style, children }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 ${className}`} style={style}>{children}</div>
);

const SectionTitle: React.FC<{ title: string; note?: React.ReactNode }> = ({ title, note }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
    <h3 className="text-base sm:text-lg font-black text-[var(--text)]">{title}</h3>
    {note && <p className="text-xs text-[var(--text-faint)]">{note}</p>}
  </div>
);

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  if (values.length < 2) return null;
  const w = 200, h = 32;
  const max = Math.max(...values, 0), min = Math.min(...values, 0);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-8 mt-1" aria-hidden="true">
      <polygon points={`2,${h - 3} ${pts} ${w - 2},${h - 3}`} style={{ fill: "var(--accent)", opacity: 0.12 }} />
      <polyline points={pts} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} style={{ fill: "var(--accent)" }} />
    </svg>
  );
};

const Kpi: React.FC<{ label: string; value: string; cur: number | null; prev: number | null; goodWhenUp?: boolean; extra?: string; series?: number[]; locked?: boolean }> = ({ label, value, cur, prev, goodWhenUp, extra, series, locked }) => (
  <Card className="!p-3.5 flex flex-col gap-0.5 min-w-0">
    <span className="text-[11px] font-bold text-[var(--text-faint)] flex items-center gap-1" title={metricHint(label)}>
      {label}
      {locked && <Lock className="w-3 h-3" aria-label="Chỉ CEO/admin" />}
    </span>
    <span className="text-xl font-black text-[var(--text)] truncate">{value}</span>
    <span className="text-[11px] text-[var(--text-faint)] flex flex-wrap gap-x-1.5">
      <Delta cur={cur} prev={prev} goodWhenUp={goodWhenUp} />
      {extra && <span>· {extra}</span>}
    </span>
    {series && <Sparkline values={series} />}
  </Card>
);

// Tooltip nổi cho mọi phần tử có data-tip (biểu đồ SVG + ô lịch). Một listener cho cả màn.
function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-tip]");
    if (!el) return setTip(null);
    setTip({ x: e.clientX, y: e.clientY, text: el.getAttribute("data-tip") ?? "" });
  };
  const node = tip ? (
    <div
      className="fixed z-50 pointer-events-none bg-[var(--surface-elevated)] text-[var(--text)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs shadow-2xl whitespace-pre-line max-w-[260px]"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: tip.y + 14 }}
    >
      {tip.text}
    </div>
  ) : null;
  return { onMove, onLeave: () => setTip(null), node };
}

export default function CeoBrief(props: CeoBriefProps) {
  const { sessions, brands, talents, shiftSlots, planTargetsBySlotId, planMonthTotals, monthlyReports, financeRecords, brandPlatformRates, brandPlatformRateHistory, talentRateHistory, currentRole, onNavigate } = props;
  const today = todayVn();
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const [grain, setGrain] = useState<Grain>("month");
  const [anchor, setAnchor] = useState(today);
  const [customEnd, setCustomEnd] = useState(today);
  const [brandId, setBrandId] = useState<string>("all");
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [nextPlans, setNextPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const tooltip = useTooltip();

  const scopeIds = useMemo(() => (brandId === "all" ? brands.map((b) => b.id) : [brandId]), [brandId, brands]);
  const scopeSessions = useMemo(() => sessions.filter((s) => scopeIds.includes(s.brandId)), [sessions, scopeIds]);
  const dataEnd = useMemo(() => lastDataDate(scopeSessions, today), [scopeSessions, today]);
  const period = useMemo(() => periodFor(grain, anchor, today, dataEnd, customEnd), [grain, anchor, today, dataEnd, customEnd]);
  const month = (grain === "month" ? anchor : period.start).slice(0, 7);

  useEffect(() => {
    let alive = true;
    fetchPlanStatuses(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => { alive = false; };
  }, [month]);
  useEffect(() => {
    let alive = true;
    fetchPlanStatuses(nextMonthOf(today.slice(0, 7))).then((m) => alive && setNextPlans(m)).catch(() => alive && setNextPlans(new Map()));
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
  const prev = useMemo(() => totalsOf(prevSessions), [prevSessions]);
  const fin = useMemo(() => (canSeeMoney ? financeOf(curSessions, pnl) : null), [canSeeMoney, curSessions, pnl]);
  const finPrev = useMemo(() => (canSeeMoney ? financeOf(prevSessions, pnl) : null), [canSeeMoney, prevSessions, pnl]);

  const sparkDays = useMemo(() => {
    if (!hasPeriod) return [];
    const from = grain === "day" || period.end === period.start ? addDays(period.end, -13) : period.start;
    return eachDay(from, period.end);
  }, [grain, period, hasPeriod]);
  const series = (pick: (t: Totals) => number | null) => {
    const byDate = new Map<string, LiveSession[]>();
    for (const s of scopeSessions) if (s.date >= (sparkDays[0] ?? "9") && s.date <= period.end) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    return sparkDays.map((d) => pick(totalsOf(byDate.get(d) ?? [])) ?? 0);
  };

  // ---------- tháng: target, run-rate, dự phóng ----------
  const outlooks = useMemo(() => {
    const out = new Map<string, MonthOutlook>();
    for (const b of brands) {
      const plan = plans.get(b.id);
      const reportPlan = buildMonthTargetPlan(b.id, month, monthlyReports);
      const camp: CampOverrides | undefined = plan && Object.keys(plan.campRanges ?? {}).length > 0 ? plan.campRanges : reportPlan?.camp;
      const lockedSlotTargets = shiftSlots
        .filter((sl) => sl.brandId === b.id && sl.date.startsWith(month) && planTargetsBySlotId.has(sl.id))
        .map((sl) => ({ date: sl.date, target: planTargetsBySlotId.get(sl.id)! }));
      const target = monthTargetOf(month, planMonthTotals.get(`${b.id}|${month}`), lockedSlotTargets, reportPlan, camp);
      const brandSessions = sessions.filter((s) => s.brandId === b.id);
      const open = shiftSlots.filter((sl) => sl.brandId === b.id && sl.status === "open" && !sl.sessionId);
      out.set(b.id, monthOutlook(month, today, brandSessions, open, target, camp));
    }
    return out;
  }, [brands, plans, month, monthlyReports, shiftSlots, planTargetsBySlotId, planMonthTotals, sessions, today]);
  const scopeOutlook = useMemo(() => combineOutlooks(month, today, scopeIds.map((id) => outlooks.get(id)!).filter(Boolean)), [month, today, scopeIds, outlooks]);

  const issues = useMemo(
    () =>
      buildIssues({
        today,
        brands: brands
          .filter((b) => scopeIds.includes(b.id))
          .map((b) => ({ brandId: b.id, name: b.name, outlook: outlooks.get(b.id)!, lastData: lastDataDate(sessions.filter((s) => s.brandId === b.id), today), nextPlan: nextPlans.get(b.id)?.status ?? null })),
        periodSessions: curSessions,
        finance: fin,
        agencyScope: brandId === "all",
        fmt: money
      }),
    [today, brands, scopeIds, outlooks, sessions, nextPlans, curSessions, fin, brandId]
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

  return (
    <div className="space-y-5 sm:space-y-7" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}

      {/* Đầu trang + bộ lọc */}
      <Card className="!p-4 sm:!p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--text)] flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-[var(--accent-text)]" /> Dashboard
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1 max-w-3xl">
              Toàn cảnh agency và từng tài khoản: GMV, target, dự phóng cuối tháng, ngày campaign, nhân sự{canSeeMoney ? " và tiền" : ""}. So sánh luôn cắt về cùng số ngày có số liệu.
            </p>
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
              {grain === "month" && <input type="month" value={anchor.slice(0, 7)} max={today.slice(0, 7)} onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)} className={`${inputCls} font-mono`} aria-label="Tháng" />}
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
          {hasPeriod && <> · mũi tên {compareLabel}</>}
          {period.cutByData && <span className="text-amber-300"> · kỳ cắt tới {ddmm(period.end)} vì số liệu mới về tới ngày đó</span>}
        </p>
      </Card>

      {/* Tổng quan */}
      <section className="space-y-3">
        <SectionTitle title="Tổng quan" />
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4 items-start">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi label="LIVE GMV" value={money(cur.gmv)} cur={cur.gmv} prev={prev.gmv} extra={`${num(cur.sessions)} ca`} series={series((t) => t.gmv)} />
            <Kpi label="Giờ live" value={hrs(cur.hours)} cur={cur.hours} prev={prev.hours} series={series((t) => t.hours)} />
            <Kpi label="GMV/giờ" value={money(cur.gmvPerHour)} cur={cur.gmvPerHour} prev={prev.gmvPerHour} series={series((t) => t.gmvPerHour)} />
            <Kpi label="Orders" value={num(cur.orders)} cur={cur.orders} prev={prev.orders} extra={cur.aov ? `AOV ${money(cur.aov)}` : undefined} series={series((t) => t.orders)} />
            <Kpi label="CVR" value={pct(cur.buyRate, 2)} cur={cur.buyRate} prev={prev.buyRate} series={series((t) => t.buyRate)} />
            <Kpi label="Product CTR" value={pct(cur.ctr, 2)} cur={cur.ctr} prev={prev.ctr} series={series((t) => t.ctr)} />
            {canSeeMoney && fin && (
              <>
                <Kpi label="Doanh thu agency" value={fin.priced ? money(fin.revenue) : "Chưa tính được"} cur={fin.priced ? fin.revenue : null} prev={finPrev?.priced ? finPrev.revenue : null} extra={fin.sessions ? `${fin.priced}/${fin.sessions} ca đủ dữ liệu` : undefined} locked />
                <Kpi label="Lãi gộp" value={fin.priced ? money(fin.profit) : "Chưa tính được"} cur={fin.priced ? fin.profit : null} prev={finPrev?.priced ? finPrev.profit : null} extra={fin.margin != null ? `biên ${pct(fin.margin)}` : undefined} locked />
                <Kpi label="Views" value={num(cur.views)} cur={cur.views} prev={prev.views} series={series((t) => t.views)} />
              </>
            )}
          </div>
          <IssueList issues={issues} onNavigate={onNavigate} />
        </div>
      </section>

      <AccountsTable
        brands={brands}
        sessions={sessions}
        period={{ start: period.start, end: period.end, prevStart: period.prevStart, prevEnd: period.prevEnd, has: hasPeriod }}
        outlooks={outlooks}
        today={today}
        pnl={canSeeMoney ? pnl : null}
        selected={brandId}
        onSelect={(id) => setBrandId(brandId === id ? "all" : id)}
        month={month}
      />

      <MonthOverMonth sessions={scopeSessions} brands={brands.filter((b) => scopeIds.includes(b.id))} lastMonth={dataEnd && dataEnd.slice(0, 7) < today.slice(0, 7) ? dataEnd.slice(0, 7) : today.slice(0, 7)} dataEnd={dataEnd} pnl={canSeeMoney ? pnl : null} />

      <TargetSection outlook={scopeOutlook} month={month} single={scopeIds.length === 1} onNavigate={onNavigate} />

      <CampaignSection outlook={scopeOutlook} month={month} sessions={scopeSessions} />

      <StaffSection cur={curSessions} prev={prevSessions} />

      {canSeeMoney && fin && <FinanceSection fin={fin} finPrev={finPrev} sessions={curSessions} brands={brands.filter((b) => scopeIds.includes(b.id))} pnl={pnl} period={period} onNavigate={onNavigate} />}
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
                  <button onClick={() => onNavigate(ACTION_TAB[it.action!].tab)} className="text-xs font-bold text-[var(--accent-text)] hover:underline mt-0.5">
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

// ---------------------------------------------------------------------------

const StatusPill: React.FC<{ o: MonthOutlook | undefined }> = ({ o }) => {
  if (!o || (!o.actual && !o.pending.length)) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-faint)]">Chưa chạy</span>;
  if (o.runRate == null) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-faint)]">Chưa có target</span>;
  if (o.runRate >= 1 && (o.gap ?? 0) >= 0) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">✓ Đúng tiến độ</span>;
  if (o.runRate >= 0.9) return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">! Sát nút</span>;
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-400">! Chậm</span>;
};

const AccountsTable: React.FC<{
  brands: Brand[];
  sessions: LiveSession[];
  period: { start: string; end: string; prevStart: string; prevEnd: string; has: boolean };
  outlooks: Map<string, MonthOutlook>;
  today: string;
  pnl: PnlFn | null;
  selected: string;
  onSelect: (id: string) => void;
  month: string;
}> = ({ brands, sessions, period, outlooks, today, pnl, selected, onSelect, month }) => {
  const rows = brands.map((b) => {
    const bs = sessions.filter((s) => s.brandId === b.id);
    const cur = period.has ? inRange(bs, period.start, period.end) : [];
    return { b, t: totalsOf(cur), p: totalsOf(inRange(bs, period.prevStart, period.prevEnd)), f: pnl ? financeOf(cur, pnl) : null, o: outlooks.get(b.id), last: lastDataDate(bs, today) };
  }).sort((a, z) => z.t.gmv - a.t.gmv || (z.o?.actual ?? 0) - (a.o?.actual ?? 0));
  const th = "px-3 py-2 text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)] text-right whitespace-nowrap";
  const td = "px-3 py-2.5 text-right whitespace-nowrap";
  return (
    <section className="space-y-3">
      <SectionTitle title="Các tài khoản" note={`Bấm một dòng để xem riêng brand đó · target, run-rate, dự phóng là của tháng ${Number(month.slice(5))}`} />
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={`${th} text-left`}>Tài khoản</th>
              <th className={th}>GMV kỳ</th>
              <th className={th}>So kỳ trước</th>
              <th className={th}>GMV/giờ</th>
              <th className={th}>Target GMV tháng</th>
              <th className={th}>Run-rate</th>
              <th className={th}>Dự phóng tháng</th>
              {pnl && <><th className={th}>Doanh thu</th><th className={th}>Lãi gộp</th><th className={th}>Phiên lãi</th></>}
              <th className={th}>Số đến</th>
              <th className={`${th} text-left`}>Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map(({ b, t, p, f, o, last }) => (
              <tr
                key={b.id}
                onClick={() => onSelect(b.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(b.id)}
                tabIndex={0}
                className={`cursor-pointer hover:bg-[var(--surface-hover)]/40 ${selected === b.id ? "bg-[var(--accent)]/10" : ""}`}
              >
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 font-bold text-[var(--text)] whitespace-nowrap">
                    <BrandLogo brand={b} size="xs" /> {b.name}
                    <span className="text-[10px] font-normal text-[var(--text-faint)]">{b.billingModel === "hourly" ? "theo giờ" : "theo %"}</span>
                  </span>
                </td>
                <td className={`${td} font-bold text-[var(--text)]`}>{t.sessions ? money(t.gmv) : "—"}</td>
                <td className={td}>{t.sessions ? <Delta cur={t.gmv} prev={p.gmv} /> : "—"}</td>
                <td className={`${td} text-[var(--text-muted)]`}>{money(t.gmvPerHour)}</td>
                <td className={`${td} text-[var(--text-muted)]`}>{o?.target ? money(o.target.total) : "—"}</td>
                <td className={`${td} font-bold ${o?.runRate == null ? "text-[var(--text-faint)]" : o.runRate >= 1 ? "text-emerald-400" : o.runRate >= 0.9 ? "text-amber-300" : "text-rose-400"}`}>{pct(o?.runRate)}</td>
                <td className={`${td} text-[var(--text-muted)]`}>{o && (o.actual || o.pending.length) ? money(o.projected) : "—"}</td>
                {pnl && (
                  <>
                    <td className={`${td} text-[var(--text-muted)]`}>{f?.priced ? money(f.revenue) : f?.sessions ? <span className="text-[var(--text-faint)]">thiếu dữ liệu</span> : "—"}</td>
                    <td className={`${td} ${f && f.profit < 0 ? "text-rose-400" : "text-[var(--text-muted)]"}`}>{f?.priced ? money(f.profit) : "—"}</td>
                    <td className={`${td} text-[var(--text-muted)]`}>{f?.priced ? pct(f.profitableSessions / f.priced) : "—"}</td>
                  </>
                )}
                <td className={`${td} text-[var(--text-faint)] font-mono text-xs`}>{last ? ddmm(last) : "—"}</td>
                <td className="px-3 py-2.5"><StatusPill o={o} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
};

// ---------------------------------------------------------------------------

const MonthOverMonth: React.FC<{ sessions: LiveSession[]; brands: Brand[]; lastMonth: string; dataEnd: string | null; pnl: PnlFn | null }> = ({ sessions, brands, lastMonth, dataEnd, pnl }) => {
  const allCols = monthColumns(sessions, lastMonth, 6, dataEnd);
  const firstWithData = allCols.findIndex((c) => c.totals.sessions > 0);
  const cols = firstWithData > 0 ? allCols.slice(firstWithData) : allCols;
  const perBrand = cols.map((c) => ({ c, by: brands.map((b) => ({ b, gmv: totalsOf(inRange(sessions.filter((s) => s.brandId === b.id), `${c.month}-01`, c.through)).gmv })) }));
  const last = cols[cols.length - 1];
  const prevM = prevMonthOf(last.month);
  const days = Number(last.through.slice(8, 10));
  const fairEnd = `${prevM}-${String(Math.min(days, Number(monthEndOf(`${prevM}-01`).slice(8)))).padStart(2, "0")}`;
  const fair = totalsOf(inRange(sessions, `${prevM}-01`, fairEnd));
  const finCols = pnl ? cols.map((c) => financeOf(inRange(sessions, `${c.month}-01`, c.through), pnl)) : null;
  const finFair = pnl ? financeOf(inRange(sessions, `${prevM}-01`, fairEnd), pnl) : null;

  const W = 560, H = 220, L = 44, R = 8, T = 22, B = 26;
  const max = Math.max(1, ...perBrand.map((p) => p.by.reduce((a, x) => a + x.gmv, 0)));
  const nice = niceMax(max);
  const step = (W - L - R) / cols.length, bw = Math.min(56, step * 0.55);
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);

  const rows: { label: string; get: (t: Totals) => number | null; fmt: (v: number | null) => string }[] = [
    { label: "GMV", get: (t) => t.gmv, fmt: money },
    { label: "Giờ live", get: (t) => t.hours, fmt: (v) => (v == null ? "—" : `${Math.round(v)}h`) },
    { label: "GMV/giờ", get: (t) => t.gmvPerHour, fmt: money },
    { label: "Orders", get: (t) => t.orders, fmt: (v) => (v == null ? "—" : num(v)) },
    { label: "AOV", get: (t) => t.aov, fmt: money },
    { label: "CVR", get: (t) => t.buyRate, fmt: (v) => pct(v, 2) },
    { label: "Product CTR", get: (t) => t.ctr, fmt: (v) => pct(v, 2) }
  ];
  return (
    <section className="space-y-3">
      <SectionTitle title="Tháng qua tháng" note={`Tháng đang chạy so với cùng ${days} ngày đầu tháng trước`} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
        <Card>
          <h4 className="font-black text-[var(--text)] mb-2 text-sm">GMV theo tháng</h4>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV theo tháng, chia theo brand">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
                <text x={L - 6} y={y(nice * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 10 }}>{f ? moneyShort(nice * f) : "0"}</text>
              </g>
            ))}
            {perBrand.map(({ c, by }, i) => {
              const cx = L + step * i + step / 2;
              let acc = 0;
              const segs = by.filter((x) => x.gmv > 0);
              const total = segs.reduce((a, x) => a + x.gmv, 0);
              return (
                <g key={c.month}>
                  {segs.map((x, k) => {
                    const y0 = y(acc), y1 = y(acc + x.gmv);
                    acc += x.gmv;
                    const top = k === segs.length - 1;
                    const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
                    return (
                      <rect key={x.b.id} x={cx - bw / 2} y={y1} width={bw} height={h} rx={top ? 4 : 0} style={{ fill: chartColor(x.b.name), opacity: c.partial ? 0.6 : 1 }}
                        data-tip={`${x.b.name} · T${Number(c.month.slice(5))}\n${money(x.gmv)}${c.partial ? ` (đến ${ddmm(c.through)})` : ""}`} />
                    );
                  })}
                  {total > 0 && <text x={cx} y={y(total) - 6} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}>{moneyShort(total)}</text>}
                  <text x={cx} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 10 }}>T{Number(c.month.slice(5))}{c.partial ? "*" : ""}</text>
                </g>
              );
            })}
            <line x1={L} x2={W - R} y1={H - B} y2={H - B} style={{ stroke: "var(--text-faint)", strokeWidth: 1 }} />
          </svg>
          {brands.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
              {brands.filter((b) => perBrand.some((p) => p.by.some((x) => x.b.id === b.id && x.gmv > 0))).map((b) => <span key={b.id} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: chartColor(b.name) }} />{b.name}</span>)}
            </div>
          )}
        </Card>
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Chỉ số</th>
                {cols.map((c) => <th key={c.month} className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">T{Number(c.month.slice(5))}{c.partial ? "*" : ""}</th>)}
                <th className="px-3 py-2 text-right text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap">vs cùng kỳ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{r.label}</td>
                  {cols.map((c) => <td key={c.month} className="px-3 py-2 text-right text-[var(--text)] whitespace-nowrap">{c.totals.sessions ? r.fmt(r.get(c.totals)) : "—"}</td>)}
                  <td className="px-3 py-2 text-right"><Delta cur={r.get(last.totals)} prev={fair.sessions ? r.get(fair) : null} /></td>
                </tr>
              ))}
              {finCols && finFair && (
                <tr>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">Lãi gộp <Lock className="w-3 h-3 inline" /></td>
                  {finCols.map((f, i) => <td key={cols[i].month} className="px-3 py-2 text-right text-[var(--text)] whitespace-nowrap">{f.priced ? money(f.profit) : "—"}</td>)}
                  <td className="px-3 py-2 text-right"><Delta cur={finCols[finCols.length - 1].priced ? finCols[finCols.length - 1].profit : null} prev={finFair.priced ? finFair.profit : null} /></td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-[var(--text-faint)] border-t border-[var(--border)]">* Tháng đang chạy, cộng tới ngày có số ({ddmm(last.through)}).{finCols ? " Lãi gộp chỉ cộng ca đủ dữ liệu tính tiền." : ""}</p>
        </Card>
      </div>
    </section>
  );
};

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

// ---------------------------------------------------------------------------

const TargetSection: React.FC<{ outlook: MonthOutlook; month: string; single: boolean; onNavigate: (tab: string) => void }> = ({ outlook: o, month, single, onNavigate }) => {
  const n = o.days.length;
  const W = 640, H = 260, L = 50, R = 14, T = 16, B = 26;
  const throughIdx = o.through ? o.days.indexOf(o.through) : -1;
  let ca = 0, ct = 0;
  const actualPts: [number, number][] = [], targetPts: [number, number][] = [], projPts: [number, number][] = [];
  o.days.forEach((d, i) => {
    ct += o.target?.byDate.get(d) ?? 0;
    targetPts.push([i, ct]);
    if (i <= throughIdx) { ca += o.actualByDate.get(d) ?? 0; actualPts.push([i, ca]); }
  });
  let cp = ca;
  const startIdx = Math.max(0, throughIdx);
  const hasProjection = o.pending.length > 0;
  projPts.push([startIdx, ca]);
  o.days.forEach((d, i) => { if (i > throughIdx) { cp += o.forecastByDate.get(d) ?? 0; projPts.push([i, cp]); } });
  // Ca đã qua mà chưa có số (ngày ≤ through) được chiếu vào đúng ngày của nó — cộng dồn vào điểm cuối.
  const lateForecast = [...o.forecastByDate.entries()].filter(([d]) => o.through && d <= o.through).reduce((a, [, v]) => a + v, 0);
  if (lateForecast) for (const p of projPts) p[1] += lateForecast;
  const max = niceMax(Math.max(o.target?.total ?? 0, cp * (1 + PROJECTION_ERROR_BAND), ca, 1));
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (pts: [number, number][]) => pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const span = Math.max(1, n - 1 - startIdx);
  const band = (sign: 1 | -1) => projPts.map(([i, v]) => [i, v + sign * cp * PROJECTION_ERROR_BAND * ((i - startIdx) / span)] as [number, number]);
  const colW = (W - L - R) / Math.max(1, n - 1);
  const campIdx = o.days.map((d, i) => (o.buckets.find((b) => b.bucket !== "daily" && b.days.includes(d)) ? i : -1)).filter((i) => i >= 0);
  const sourceLabel = o.target ? (o.target.source === "locked_plan" ? "Kế Hoạch Tháng đã chốt" : "Report Tháng (tab Kế Hoạch Tháng Sau)") : null;
  const stat = (label: string, value: React.ReactNode, sub?: React.ReactNode) => (
    <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">{label}</p>
      <p className="text-lg font-black text-[var(--text)] mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-snug">{sub}</p>}
    </div>
  );
  const gap = o.gap;
  return (
    <section className="space-y-3">
      <SectionTitle title="Target & dự phóng cả tháng" note={`Tháng ${Number(month.slice(5))} · ${sourceLabel ? `target từ ${sourceLabel}` : "chưa có target"}`} />
      <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV cộng dồn so với target và dự phóng">
            {campIdx.map((i) => <rect key={i} x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} style={{ fill: "var(--accent)", opacity: 0.07 }} />)}
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
                <text x={L - 6} y={y(max * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 10 }}>{f ? moneyShort(max * f) : "0"}</text>
              </g>
            ))}
            {[1, 8, 15, 22, 29].filter((d) => d <= n).map((d) => <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 10 }}>{String(d).padStart(2, "0")}/{month.slice(5)}</text>)}
            {hasProjection && projPts.length > 1 && <path d={`${path(band(1))} ${band(-1).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z`} style={{ fill: "var(--accent)", opacity: 0.12 }} />}
            {o.target && <path d={path(targetPts)} style={{ fill: "none", stroke: "var(--text-faint)", strokeWidth: 2, strokeDasharray: "2 4", strokeLinecap: "round" }} />}
            {hasProjection && projPts.length > 1 && <path d={path(projPts)} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2, strokeDasharray: "6 4" }} />}
            {actualPts.length > 0 && <path d={path(actualPts)} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2.5, strokeLinejoin: "round" }} />}
            {actualPts.length > 0 && <circle cx={x(throughIdx)} cy={y(ca)} r={4.5} style={{ fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} />}
            {hasProjection && projPts.length > 1 && <text x={x(n - 1) - 4} y={y(cp) - 10} textAnchor="end" style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}>{moneyShort(cp)}</text>}
            {o.days.map((d, i) => (
              <rect key={d} x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} style={{ fill: "transparent" }}
                data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})\n${i <= throughIdx ? `Thực tế cộng dồn: ${money(actualPts[i]?.[1] ?? 0)}` : `Dự phóng cộng dồn: ${money(projPts.find((p) => p[0] === i)?.[1] ?? cp)}`}${o.target ? `\nTarget tới ngày này: ${money(targetPts[i][1])}` : ""}`} />
            ))}
          </svg>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
            <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "var(--accent)" }} />Thực tế</span>
            {hasProjection && <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "repeating-linear-gradient(90deg,var(--accent) 0 5px,transparent 5px 8px)" }} />Dự phóng (dải ±{Math.round(PROJECTION_ERROR_BAND * 100)}%)</span>}
            {o.target && <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "repeating-linear-gradient(90deg,var(--text-faint) 0 3px,transparent 3px 6px)" }} />Tiến độ target</span>}
            <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--accent)", opacity: 0.25 }} />Ngày camp</span>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-3 content-start">
          {stat("Target GMV tháng", o.target ? money(o.target.total) : "—", o.target ? sourceLabel : <button onClick={() => onNavigate("month_plan")} className="text-[var(--accent-text)] font-bold hover:underline">Chốt Kế Hoạch Tháng →</button>)}
          {stat("Đã đạt", money(o.actual), o.target ? `${pct(o.actual / o.target.total)} Target${o.through ? ` · số đến ${ddmm(o.through)}` : ""}` : o.through ? `số đến ${ddmm(o.through)}` : undefined)}
          {stat("Run-rate", <span className={o.runRate == null ? "" : o.runRate >= 1 ? "text-emerald-400" : o.runRate >= 0.9 ? "text-amber-300" : "text-rose-400"}>{pct(o.runRate)}</span>, o.expectedToDate != null ? `kỳ vọng tới ngày có số: ${money(o.expectedToDate)}` : "cần target")}
          {stat("Dự phóng cuối tháng", money(o.projected), `±${Math.round(PROJECTION_ERROR_BAND * 100)}% · ${o.pending.length} ca còn trong lịch${o.pending.some((p) => p.kind === "open_slot") ? ` (${o.pending.filter((p) => p.kind === "open_slot").length} ca mở)` : ""}`)}
          {stat(gap == null ? "So với target" : gap >= 0 ? "Dự kiến vượt" : "Dự kiến thiếu", gap == null ? "—" : <span className={gap >= 0 ? "text-emerald-400" : "text-rose-400"}>{money(Math.abs(gap))}</span>, gap != null && o.target ? `${pct(Math.abs(gap) / o.target.total)} target` : undefined)}
          {stat("Cần mỗi ngày còn lại", money(o.needPerRemainingDay), o.remainingDays > 0 ? `${o.remainingDays} ngày còn lại` : "tháng đã hết")}
          <p className="col-span-2 text-[11px] text-[var(--text-faint)] leading-snug">
            Dự phóng = số đã có + giờ các ca còn trong lịch (kể cả ca mở chưa có người) × GMV/giờ 28 ngày gần nhất{single ? "" : " của từng brand"}, tách ngày camp và ngày thường. Thêm ca trên lịch là số này tăng theo. Thử lại trên T7–T8/2026: lệch −7% đến +8%.
          </p>
        </div>
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------

const CampaignSection: React.FC<{ outlook: MonthOutlook; month: string; sessions: LiveSession[] }> = ({ outlook: o, month, sessions }) => {
  const status = { done: ["Đã qua", "bg-[var(--surface-elevated)] text-[var(--text-faint)]"], live: ["Đang chạy", "bg-amber-500/15 text-amber-300"], next: ["Sắp tới", "bg-[var(--accent)]/15 text-[var(--accent-text)]"], none: ["—", "bg-[var(--surface-elevated)] text-[var(--text-faint)]"] } as const;
  const card = (b: BucketOutlook) => {
    const [lbl, cls] = status[b.status];
    const range = b.bucket === "daily" ? `${b.days.length} ngày` : b.days.length ? `${ddmm(b.days[0])}–${ddmm(b.days[b.days.length - 1])}` : "";
    const upcoming = b.status === "next";
    const main = upcoming ? (b.pendingCount ? money(b.forecast) : "Chưa có ca") : b.actual.sessions ? money(b.actual.gmv) : b.pendingCount ? `~${money(b.forecast)}` : "Chưa có số";
    const vsTarget = b.target ? (upcoming ? b.forecast / b.target : b.targetToDate ? b.actual.gmv / b.targetToDate : null) : null;
    return (
      <Card key={b.bucket} className="!p-4 space-y-1.5 border-t-4" style={{ borderTopColor: BUCKET_COLOR[b.bucket] }}>
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-black text-[var(--text)]">{BUCKET_LABEL[b.bucket]}</h4>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>
        </div>
        <p className="text-xs text-[var(--text-faint)]">{range}</p>
        <p className="text-xl font-black text-[var(--text)]">{main}</p>
        <p className="text-[11px] text-[var(--text-faint)]">{upcoming ? (b.pendingCount ? `dự phóng từ ${b.pendingCount} ca trong lịch` : "chưa có ca nào trong lịch") : `${b.actual.sessions} ca · ${b.daysWithData}/${b.days.length} ngày có số`}</p>
        {b.target != null && b.target > 0 && (
          <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" title="So với target của khung">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((upcoming ? b.forecast : b.actual.gmv) / b.target) * 100)}%`, background: BUCKET_COLOR[b.bucket] }} />
          </div>
        )}
        <dl className="text-xs space-y-1 pt-1">
          <div className="flex justify-between gap-2"><dt className="text-[var(--text-faint)]">Target khung</dt><dd className="text-[var(--text)] font-bold">{b.target ? money(b.target) : "—"}{vsTarget != null && !upcoming ? ` · ${pct(vsTarget)}` : ""}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--text-faint)]">Mỗi ngày</dt><dd className="text-[var(--text)]">{money(b.perDay)}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--text-faint)]">Tháng trước/ngày</dt><dd className="text-[var(--text)] flex items-center gap-1">{money(b.prevPerDay)}{b.perDay != null && b.prevPerDay != null && <Delta cur={b.perDay} prev={b.prevPerDay} />}</dd></div>
          <div className="flex justify-between gap-2"><dt className="text-[var(--text-faint)]">GMV/giờ</dt><dd className="text-[var(--text)]">{money(b.actual.gmvPerHour)}</dd></div>
        </dl>
      </Card>
    );
  };
  const m0 = `${month}-01`;
  const byDay = new Map<string, LiveSession[]>();
  for (const s of sessions) if (s.date.startsWith(month)) byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  const gmvMax = Math.max(1, ...o.days.map((d) => o.actualByDate.get(d) ?? 0));
  // Một màu, đậm dần theo doanh số — đọc đúng cả theme tối lẫn theme sáng (nhiều = đậm hơn).
  const shade = [0.18, 0.32, 0.46, 0.6, 0.76, 0.92].map((a) => `rgba(59, 130, 246, ${a})`);
  const campOf = (d: string) => o.buckets.find((b) => b.bucket !== "daily" && b.days.includes(d))?.bucket;
  return (
    <section className="space-y-3">
      <SectionTitle title="Ngày campaign" note="Target khung = tổng target các ngày của khung · mỗi ngày = GMV ÷ số ngày của khung đã qua" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{o.buckets.map(card)}</div>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h4 className="font-black text-[var(--text)] text-sm">GMV từng ngày · tháng {Number(month.slice(5))}</h4>
          <span className="text-[11px] text-[var(--text-faint)] inline-flex items-center gap-1">Ít {shade.map((c) => <i key={c} className="w-4 h-2.5 rounded-sm inline-block" style={{ background: c }} />)} Nhiều · ◆ ngày camp · sọc = còn trong lịch</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY.map((w) => <div key={w} className="text-[10px] text-center text-[var(--text-faint)] font-bold">{w}</div>)}
          {Array.from({ length: weekdayIdx(m0) }).map((_, i) => <div key={`e${i}`} />)}
          {o.days.map((d) => {
            const g = o.actualByDate.get(d) ?? 0;
            const f = o.forecastByDate.get(d) ?? 0;
            const t = totalsOf(byDay.get(d) ?? []);
            const camp = campOf(d);
            const k = g > 0 ? Math.min(5, Math.floor((g / gmvMax) * 6)) : -1;
            const style: React.CSSProperties = k >= 0 ? { background: shade[k], color: k >= 3 ? "#ffffff" : "var(--text)" } : f > 0 ? { background: "repeating-linear-gradient(135deg, var(--surface-base) 0 5px, var(--surface-elevated) 5px 7px)" } : {};
            return (
              <div
                key={d}
                className={`rounded-lg p-1.5 min-h-[52px] flex flex-col justify-between text-[10px] ${k < 0 && !f ? "bg-[var(--surface-base)] text-[var(--text-faint)]" : ""} ${camp ? "ring-1 ring-inset ring-[var(--text-muted)]" : ""}`}
                style={style}
                data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})${camp ? ` · ${BUCKET_LABEL[camp]}` : ""}\n${g ? `GMV ${money(g)}\n${t.sessions} ca · ${hrs(t.hours)} · ${money(t.gmvPerHour)}/giờ` : f ? `Dự phóng ${money(f)}` : "Không có ca"}`}
              >
                <span className="font-bold">{Number(d.slice(8))}{camp ? " ◆" : ""}</span>
                <span className="font-bold truncate hidden sm:block">{g ? moneyShort(g) : f ? `~${moneyShort(f)}` : ""}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </section>
  );
};

// ---------------------------------------------------------------------------

const StaffList: React.FC<{ title: string; data: ReturnType<typeof hostRows>; unassignedLabel: string }> = ({ title, data, unassignedLabel }) => {
  const max = niceMax(Math.max(data.average ?? 0, ...data.rows.map((r) => r.totals.gmvPerHour ?? 0)));
  const avg = data.average ?? 0;
  return (
    <Card>
      <h4 className="font-black text-[var(--text)] mb-2">{title}</h4>
      {data.rows.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">Không có ca nào trong kỳ.</p>
      ) : (
        <div className="text-xs">
          <div className="grid grid-cols-[minmax(90px,1.3fr)_32px_44px_minmax(60px,1.6fr)_52px_64px] gap-2 pb-1 text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">
            <span>Tên</span><span className="text-right">Sessions</span><span className="text-right">Giờ live</span><span>GMV/giờ</span><span /><span className="text-right">Kỳ trước</span>
          </div>
          {data.rows.map((r) => {
            const g = r.totals.gmvPerHour ?? 0;
            return (
              <div key={r.key} className="grid grid-cols-[minmax(90px,1.3fr)_32px_44px_minmax(60px,1.6fr)_52px_64px] gap-2 items-center py-1.5 border-t border-[var(--border)]"
                data-tip={`${r.name}\n${r.totals.sessions} ca · ${hrs(r.totals.hours)} (${pct(r.hoursShare)} giờ kỳ)\nGMV ${money(r.totals.gmv)} · ${money(g)}/giờ\nTrung bình: ${money(avg)}/giờ`}>
                <span className="truncate text-[var(--text)] font-bold">{r.name}{r.hoursShare > 0.3 && <span className="ml-1 text-amber-300 text-[10px]">! {pct(r.hoursShare)} giờ</span>}</span>
                <span className="text-right text-[var(--text-muted)]">{r.totals.sessions}</span>
                <span className="text-right text-[var(--text-muted)]">{Math.round(r.totals.hours)}h</span>
                <span className="relative h-4">
                  <span className="absolute left-0 top-[3px] h-2.5 rounded-r" style={{ width: `${(g / max) * 100}%`, background: g >= avg ? "var(--accent)" : "var(--text-faint)" }} />
                  <span className="absolute top-0 bottom-0 w-px bg-[var(--text-muted)]" style={{ left: `${(avg / max) * 100}%` }} />
                </span>
                <span className="text-right font-bold text-[var(--text)]">{moneyShort(g)}</span>
                <span className="text-right">{r.prevGmvPerHour != null ? <Delta cur={g} prev={r.prevGmvPerHour} /> : <span className="text-[var(--text-faint)]">mới</span>}</span>
              </div>
            );
          })}
          {data.unassigned && (
            <p className="pt-2 border-t border-[var(--border)] text-[11px] text-[var(--text-faint)]">
              {unassignedLabel}: {data.unassigned.sessions} ca · {Math.round(data.unassigned.hours)}h · {money(data.unassigned.gmvPerHour)}/giờ — không xếp hạng.
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

const StaffSection: React.FC<{ cur: LiveSession[]; prev: LiveSession[] }> = ({ cur, prev }) => {
  const pairs = pairRows(cur).slice(0, 5);
  return (
    <section className="space-y-3">
      <SectionTitle title="Hiệu suất nhân sự" note="GMV/giờ trong kỳ · vạch đứng = trung bình · so với kỳ trước cùng độ dài" />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <StaffList title="Host" data={hostRows(cur, prev)} unassignedLabel="Chưa ghi host" />
        <StaffList title="Trợ live" data={assistantRows(cur, prev)} unassignedLabel="Không có trợ live" />
      </div>
      <Card className="!p-0 overflow-x-auto">
        <p className="px-4 pt-3 pb-1 font-black text-[var(--text)] text-sm">Cặp host + trợ live bán tốt nhất <span className="font-normal text-[var(--text-faint)] text-xs">(từ 3 ca chung trở lên)</span></p>
        {pairs.length === 0 ? (
          <p className="px-4 pb-3 text-sm text-[var(--text-faint)]">Kỳ này chưa có cặp nào chạy chung từ 3 ca — chọn kỳ dài hơn.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-[var(--border)]">
              {pairs.map((p) => (
                <tr key={`${p.host}|${p.assistant}`}>
                  <td className="px-4 py-2 text-[var(--text)]">{p.host} <span className="text-[var(--text-faint)]">+</span> {p.assistant}</td>
                  <td className="px-4 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{p.totals.sessions} ca · {Math.round(p.totals.hours)}h</td>
                  <td className="px-4 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{money(p.totals.gmv)}</td>
                  <td className="px-4 py-2 text-right font-bold text-[var(--text)] whitespace-nowrap">{money(p.totals.gmvPerHour)}/giờ</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
};

// ---------------------------------------------------------------------------

const FinanceSection: React.FC<{ fin: FinanceTotals; finPrev: FinanceTotals | null; sessions: LiveSession[]; brands: Brand[]; pnl: PnlFn; period: { start: string; end: string }; onNavigate: (tab: string) => void }> = ({ fin, finPrev, sessions, brands, pnl, period, onNavigate }) => {
  const missing = [...fin.missing.entries()].sort((a, b) => b[1] - a[1]);
  const byBrand = brands.map((b) => ({ b, f: financeOf(sessions.filter((s) => s.brandId === b.id), pnl) })).filter((r) => r.f.sessions > 0);
  const posTotal = byBrand.reduce((a, r) => a + Math.max(0, r.f.profit), 0);
  const days = period.end >= period.start ? eachDay(period.end > addDays(period.start, 44) ? addDays(period.end, -44) : period.start, period.end) : [];
  const W = 560, H = 190, L = 46, R = 8, T = 10, B = 22;
  const vals = days.map((d) => fin.byDay.get(d));
  const vmax = niceMax(Math.max(1, ...vals.map((v) => Math.abs(v ?? 0))));
  const hasNeg = vals.some((v) => (v ?? 0) < 0);
  const zero = hasNeg ? T + (H - T - B) / 2 : H - B;
  const scale = (hasNeg ? (H - T - B) / 2 : H - T - B) / vmax;
  const step = (W - L - R) / Math.max(1, days.length), bw = Math.max(2, Math.min(14, step - 2));
  const missingTab: Record<string, string> = { host_rate: "talents", cohost_rate: "talents", brand_rate: "crm", commission_default: "crm" };
  return (
    <section className="space-y-3">
      <SectionTitle title="Tài chính" note={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Chỉ CEO/admin · chỉ cộng ca đủ dữ liệu, gồm cả ca nạp bù</span>} />
      {missing.length > 0 && (
        <Card className="!p-4 border-amber-500/40">
          <p className="text-sm font-bold text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Tính được tiền cho {fin.priced}/{fin.sessions} ca trong kỳ. Các ca còn lại đang thiếu:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map(([k, n]) => (
              <li key={k}>
                <button onClick={() => onNavigate(missingTab[k] ?? "finance")} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]">
                  {PNL_MISSING_LABEL[k as PnlMissingInput] ?? k} · {n} ca →
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Doanh thu agency" value={fin.priced ? money(fin.revenue) : "—"} cur={fin.priced ? fin.revenue : null} prev={finPrev?.priced ? finPrev.revenue : null} />
        <Kpi label="Chi phí trực tiếp" value={fin.priced ? money(fin.cost) : "—"} cur={fin.priced ? fin.cost : null} prev={finPrev?.priced ? finPrev.cost : null} goodWhenUp={false} />
        <Kpi label="Lãi gộp" value={fin.priced ? money(fin.profit) : "—"} cur={fin.priced ? fin.profit : null} prev={finPrev?.priced ? finPrev.profit : null} />
        <Kpi label="Biên lãi gộp" value={pct(fin.margin)} cur={fin.margin} prev={finPrev?.margin ?? null} />
        <Kpi label="Phiên có lãi" value={fin.priced ? pct(fin.profitableSessions / fin.priced) : "—"} cur={fin.priced ? fin.profitableSessions / fin.priced : null} prev={finPrev?.priced ? finPrev.profitableSessions / finPrev.priced : null} extra={`${fin.profitableSessions}/${fin.priced} phiên`} />
        <Kpi label="Ngày có lãi" value={fin.days ? pct(fin.profitableDays / fin.days) : "—"} cur={fin.days ? fin.profitableDays / fin.days : null} prev={finPrev?.days ? finPrev.profitableDays / finPrev.days : null} extra={`${fin.profitableDays}/${fin.days} ngày`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h4 className="font-black text-[var(--text)] text-sm mb-2">Lãi / lỗ từng ngày</h4>
          {fin.days === 0 ? (
            <p className="text-sm text-[var(--text-faint)] py-6 text-center">Chưa có ngày nào đủ dữ liệu để tính.</p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Lãi lỗ từng ngày">
              {(hasNeg ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => (
                <g key={f}>
                  <line x1={L} x2={W - R} y1={zero - f * vmax * scale} y2={zero - f * vmax * scale} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
                  <text x={L - 6} y={zero - f * vmax * scale + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 10 }}>{f ? moneyShort(f * vmax) : "0"}</text>
                </g>
              ))}
              {days.map((d, i) => {
                const v = vals[i];
                const cx = L + step * i + step / 2;
                const h = Math.abs(v ?? 0) * scale;
                return (
                  <g key={d}>
                    {v != null && <rect x={cx - bw / 2} y={v >= 0 ? zero - h : zero} width={bw} height={Math.max(1, h)} rx={Math.min(3, bw / 2)} style={{ fill: v >= 0 ? "var(--success)" : "var(--danger)" }} />}
                    <rect x={cx - step / 2} y={T} width={step} height={H - T - B} style={{ fill: "transparent" }} data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})\n${v == null ? "Không có ca đủ dữ liệu" : `Lãi gộp: ${money(v)}`}`} />
                  </g>
                );
              })}
              {[0, Math.floor(days.length / 2), days.length - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => <text key={i} x={L + step * i + step / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 10 }}>{ddmm(days[i])}</text>)}
              <line x1={L} x2={W - R} y1={zero} y2={zero} style={{ stroke: "var(--text-faint)", strokeWidth: 1 }} />
            </svg>
          )}
        </Card>
        <Card className="space-y-3">
          <h4 className="font-black text-[var(--text)] text-sm">Theo brand</h4>
          {posTotal > 0 && (
            <div className="flex h-5 rounded-md overflow-hidden gap-0.5" aria-label="Tỷ trọng lãi theo brand">
              {byBrand.filter((r) => r.f.profit > 0).map((r) => <div key={r.b.id} style={{ flex: r.f.profit, background: chartColor(r.b.name) }} data-tip={`${r.b.name}\nLãi ${money(r.f.profit)} · ${pct(r.f.profit / posTotal)} tổng lãi`} />)}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)]">
                <tr>{["Brand", "Doanh thu", "Chi phí", "Lãi gộp", "Tỷ trọng lãi", "Phiên lãi", "Ngày lãi"].map((h, i) => <th key={h} className={`px-2 py-1.5 text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {byBrand.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-[var(--text-faint)]">Không có ca nào trong kỳ.</td></tr>}
                {byBrand.map(({ b, f }) => (
                  <tr key={b.id}>
                    <td className="px-2 py-2 text-[var(--text)] font-bold whitespace-nowrap"><i className="w-2.5 h-2.5 rounded-sm inline-block mr-1.5" style={{ background: chartColor(b.name) }} />{b.name}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{f.priced ? money(f.revenue) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{f.priced ? money(f.cost) : "—"}</td>
                    <td className={`px-2 py-2 text-right font-bold whitespace-nowrap ${f.profit < 0 ? "text-rose-400" : "text-[var(--text)]"}`}>{f.priced ? money(f.profit) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.priced && posTotal > 0 && f.profit > 0 ? pct(f.profit / posTotal) : f.priced && f.profit <= 0 ? <span className="text-rose-400">lỗ</span> : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.priced ? pct(f.profitableSessions / f.priced) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.days ? pct(f.profitableDays / f.days) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-faint)] leading-snug">
            Doanh thu = GMV × (1 − tỷ lệ hoàn hủy) × % hoa hồng (brand tính theo %), hoặc giờ × giá/giờ (brand tính theo giờ). Chi phí = lương host + trợ live + phòng + quảng cáo của ca. Chưa trừ chi phí cố định (mặt bằng, lương văn phòng).
          </p>
        </Card>
      </div>
    </section>
  );
};
