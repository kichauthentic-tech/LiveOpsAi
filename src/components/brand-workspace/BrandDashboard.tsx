import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarRange, Gauge, LayoutDashboard, Lightbulb, TrendingUp, Users } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, PromoScheme, ShiftSlot, UserRole } from "../../types";
import { EngineParams } from "../../lib/scheduling/engineParams";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import { fetchShopDaysMonthSlice, ShopDaysMonthSlice } from "../../lib/dataraw/monthlyProductSlice";
import { CAMP_DAY_BUCKET_LABEL, CampDayBucket, resolveCampBucketType } from "../../lib/campaignDays";
import { todayVn } from "../../lib/performance/brandCommitment";
import { lastDataDate, monthEndOf, monthOutlook, prevMonthOf, nextMonthOf, RUN_RATE_BAD, RUN_RATE_WARN } from "../../lib/performance/ceoBrief";
import { planRunRate, PlanRunRateSlot, projectMonthEnd, PROJECTION_METHOD_LABEL } from "../../lib/performance/planRunRate";
import {
  SLOT_BLOCKS,
  SLOT_BLOCK_LABEL,
  campPositions,
  campRuleReliable,
  campWindows,
  planCheck,
  slotBlock,
  slotIndex,
  slotRuleReliable,
  targetWeightModel,
  walkForward,
  weeklySeries
} from "../../lib/performance/slotInsights";
import { compareWindow, driverBreakdown, DRIVER_LABEL, liveStatsFromRows, LiveStats } from "../../lib/report/monthlyReportInsights";
import { hasLiveNumbers, sessionToLivePerfRow } from "../../lib/report/sessionsLivePerf";
import { fmtKeyMetric, KEY_METRICS, keyMetricValue } from "../../lib/report/keyMetrics";
import { controlGroup, controlLabel, liveGmvByDate, controlVerdict, hostReliability, isBorderline, reliabilityText, VERDICT_TEXT } from "../../lib/report/deepAnalysis";
import { isCountable, sessionHours } from "../../lib/performance/hostPerformance";
import { sessionDurationHours } from "../../lib/pnl";
import { fmtVndShort } from "../../lib/format";
import { METRIC, metricHint } from "../../lib/metricGlossary";
import { PageIntro } from "../common/PageIntro";
import OpsSupport from "../OpsSupport";

// Dashboard brand (2026-09-28) — màn TRONG tháng cho ops: tháng này tới đâu, vì sao, tuần tới / tháng sau
// sửa gì. Report Tháng vẫn là bản chụp SAU tháng gửi brand; hai màn dùng CHUNG hàm (compareWindow,
// driverBreakdown, controlGroup, hostReliability, planRunRate) nên không nói hai số.
// Role brand thấy bản rút gọn (user chốt): KPI, run-rate, nhịp tuần — không thấy đề xuất nội bộ, soát kế
// hoạch, nhóm đối chứng (Dữ Liệu Gốc là ops-only), host, phương án bù. Số tháng CHƯA phát hành bị che
// với brand (0107) — màn này không lách: tháng đó brand chỉ thấy kế hoạch, không thấy số.

interface BrandDashboardProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  currentRole: UserRole;
  onOpenMonthPlan: () => void;
  onOpenSession: (sessionId: string) => void;
  onOpenSessions: () => void;
}

const OPS_ROLES: UserRole[] = ["ceo", "admin", "operations"];
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dmw = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${dm(d)}`;
const pct = (x: number | null | undefined, digits = 0) => (x == null || !isFinite(x) ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`);
const signed = (x: number | null | undefined, digits = 1) =>
  x == null || !isFinite(x) ? "—" : `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
const num = (x: number | null | undefined, digits = 0) => (x == null || !isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: digits }));
const rrTone = (v: number | null | undefined) => (v == null ? "text-[var(--text-faint)]" : v >= RUN_RATE_WARN ? "text-emerald-400" : v >= RUN_RATE_BAD ? "text-amber-300" : "text-rose-400");
const rrPill = (v: number | null | undefined) =>
  v == null ? "bg-[var(--surface-elevated)] text-[var(--text-faint)]" : v >= RUN_RATE_WARN ? "bg-emerald-500/15 text-emerald-400" : v >= RUN_RATE_BAD ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-400";

const Card: React.FC<{ title: string; icon: React.ReactNode; sub?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, sub, right, children }) => (
  <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h3 className="font-bold text-[var(--text)] flex items-center gap-2">{icon} {title}</h3>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
      </div>
      {right}
    </div>
    {children}
  </section>
);

const Stat: React.FC<{ label: string; value: string; hint?: React.ReactNode; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
    <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]" title={metricHint(label)}>{label}</p>
    <p className={`text-lg font-black mt-0.5 font-mono ${tone ?? "text-[var(--text)]"}`}>{value}</p>
    {hint && <div className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-snug">{hint}</div>}
  </div>
);

const statsOf = (sessions: LiveSession[], start: string, end: string): LiveStats =>
  liveStatsFromRows(sessions.filter((s) => s.date >= start && s.date <= end && hasLiveNumbers(s)).map(sessionToLivePerfRow), start, end);

export default function BrandDashboard({ brandId, brandName, sessions, shiftSlots, promoSchemes, engineParams, currentRole, onOpenMonthPlan, onOpenSession, onOpenSessions }: BrandDashboardProps) {
  const today = todayVn();
  const isOps = OPS_ROLES.includes(currentRole);
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  // Brand: mặc định tháng gần nhất đã phát hành (tháng đang chạy bị che số tới khi phát hành — 0107).
  const defaultMonth = useMemo(() => {
    if (isOps) return today.slice(0, 7);
    const pub = brandSessions.filter((s) => s.monthPublished && s.date <= today).map((s) => s.date.slice(0, 7)).sort();
    return pub.at(-1) ?? today.slice(0, 7);
  }, [isOps, brandSessions, today]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? defaultMonth;
  const [caFilter, setCaFilter] = useState<"all" | "bad" | CampDayBucket | "offplan">("all");

  const [plan, setPlan] = useState<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>(null);
  const [nextPlan, setNextPlan] = useState<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>(null);
  // Khoá của lần tải xong gần nhất — khác (brand, tháng) đang xem nghĩa là đang tải (không setState đồng bộ trong effect).
  const [planKey, setPlanKey] = useState<string | null>(null);
  const planLoading = planKey !== `${brandId}|${month}`;
  useEffect(() => {
    let alive = true;
    Promise.all([fetchMonthPlan(brandId, month).catch(() => null), fetchMonthPlan(brandId, nextMonthOf(month)).catch(() => null)]).then(([p, n]) => {
      if (!alive) return;
      setPlan(p);
      setNextPlan(n);
      setPlanKey(`${brandId}|${month}`);
    });
    return () => {
      alive = false;
    };
  }, [brandId, month]);

  const camp = plan?.plan.campRanges;
  const bucketOf = useMemo(() => (d: string) => resolveCampBucketType(d, camp), [camp]);
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const monthSessions = useMemo(() => brandSessions.filter((s) => s.date >= mStart && s.date <= mEnd), [brandSessions, mStart, mEnd]);
  const hidden = !isOps && monthSessions.some((s) => !s.monthPublished);
  const through = useMemo(() => lastDataDate(monthSessions, today), [monthSessions, today]);
  const lagDays = through && month === today.slice(0, 7) ? Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${through}T00:00:00`).getTime()) / 86400000) : 0;

  // ---- KPI so cùng kỳ (cắt theo ngày cuối có số — compareWindow, như Report Tháng)
  const win = useMemo(() => compareWindow(month, through), [month, through]);
  const cur = useMemo(() => statsOf(brandSessions, win.curStart, win.curEnd), [brandSessions, win]);
  const prev = useMemo(() => statsOf(brandSessions, win.prevStart, win.prevEnd), [brandSessions, win]);
  const drivers = useMemo(() => driverBreakdown(prev, cur), [prev, cur]);

  // ---- Run-rate theo plan ban đầu
  const locked = !planLoading && plan?.plan.status === "locked";
  const rr = useMemo(() => (locked && plan ? planRunRate(month, plan.slots, shiftSlots, brandSessions, today, camp) : null), [locked, plan, month, shiftSlots, brandSessions, today, camp]);
  // Dự kiến cuối tháng — MỘT số cho cả trang (thẻ run-rate + khối phương án bù) và trùng Bản Tin CEO.
  const outlook = useMemo(() => {
    if (!rr) return null;
    const open = shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
    return monthOutlook(month, today, brandSessions, open, null, camp);
  }, [rr, shiftSlots, brandId, month, today, brandSessions, camp]);
  const projection = useMemo(() => projectMonthEnd(rr, outlook), [rr, outlook]);

  // ---- Nhóm đối chứng (ops — Dữ Liệu Gốc)
  const [shop, setShop] = useState<{ cur: ShopDaysMonthSlice; prev: ShopDaysMonthSlice } | null>(null);
  useEffect(() => {
    if (!isOps) return;
    let alive = true;
    const pm = prevMonthOf(month);
    Promise.all([fetchShopDaysMonthSlice(brandId, mStart, mEnd), fetchShopDaysMonthSlice(brandId, `${pm}-01`, monthEndOf(`${pm}-01`))])
      .then(([c, p]) => alive && setShop({ cur: c, prev: p }))
      .catch(() => alive && setShop(null));
    return () => {
      alive = false;
    };
  }, [isOps, brandId, month, mStart, mEnd]);
  // Cột live = ca agency, như Report Tháng phần 2 (Linked account của Shop Analytics đếm cả live ngoài ca).
  const agencyLive = useMemo(() => {
    const rows = liveGmvByDate(brandSessions.filter(hasLiveNumbers).map(sessionToLivePerfRow));
    return { prev: rows, cur: rows };
  }, [brandSessions]);
  const control = useMemo(
    () => (shop ? controlGroup(shop.prev.days, shop.cur.days, win, (d) => resolveCampBucketType(d), bucketOf, agencyLive) : []),
    [shop, win, bucketOf, agencyLive]
  );

  // ---- Nhịp tuần, đề xuất, soát kế hoạch, host
  const weeks = useMemo(() => weeklySeries(brandSessions, through, 16), [brandSessions, through]);
  const history = useMemo(() => brandSessions.filter((s) => !through || s.date <= through), [brandSessions, through]);
  const sIdx = useMemo(() => (isOps ? slotIndex(history, bucketOf) : {}), [isOps, history, bucketOf]);
  const wfSlot = useMemo(() => walkForward(history, bucketOf, (s) => slotBlock(s.startTime)), [history, bucketOf]);
  const wfWeekday = useMemo(() => walkForward(history, bucketOf, (s) => String(new Date(`${s.date}T00:00:00`).getDay())), [history, bucketOf]);
  const cPos = useMemo(() => campPositions(campWindows(history, bucketOf)), [history, bucketOf]);
  const slotOk = slotRuleReliable(sIdx, wfSlot);
  const campOk = campRuleReliable(cPos);
  const nextModel = useMemo(() => targetWeightModel(brandSessions, nextMonthOf(month), (d) => resolveCampBucketType(d, nextPlan?.plan.campRanges)), [brandSessions, month, nextPlan]);
  const check = useMemo(
    () => (nextPlan ? planCheck(nextPlan.slots, brandSessions, lastDataDate(brandSessions, today), (d) => resolveCampBucketType(d, nextPlan.plan.campRanges), nextModel) : null),
    [nextPlan, brandSessions, today, nextModel]
  );
  const hosts = useMemo(() => (isOps ? hostReliability(monthSessions.filter((s) => s.date <= win.curEnd), bucketOf) : []), [isOps, monthSessions, win, bucketOf]);

  // Giờ mỗi ngày thường ở khung yếu / mạnh: tháng này vs tháng trước
  const hoursPerDailyDay = (xs: LiveSession[], k: "B" | "D") => {
    const d = xs.filter((s) => isCountable(s) && bucketOf(s.date) === "daily");
    const days = new Set(d.map((s) => s.date)).size;
    return days ? d.filter((s) => slotBlock(s.startTime) === k).reduce((a, s) => a + sessionHours(s), 0) / days : null;
  };
  const curRange = brandSessions.filter((s) => s.date >= win.curStart && s.date <= win.curEnd);
  const prevRange = brandSessions.filter((s) => s.date >= win.prevStart && s.date <= win.prevEnd);
  const recent28 = useMemo(() => {
    if (!through) return null;
    const from = new Date(`${through}T00:00:00`);
    from.setDate(from.getDate() - 27);
    const f = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
    const xs = brandSessions.filter((s) => isCountable(s) && s.date >= f && s.date <= through);
    // Theo GIỜ KẾ HOẠCH: số này nhân với "dời/thêm N giờ lịch" (audit 2026-09-28 mục 7), cùng cách dự phóng Bản Tin CEO.
    const byCamp = (camp: boolean) => {
      const x = xs.filter((s) => (bucketOf(s.date) !== "daily") === camp);
      const h = x.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
      return h > 0 ? x.reduce((a, s) => a + (s.actualGmv ?? 0), 0) / h : null;
    };
    return { daily: byCamp(false), camp: byCamp(true) };
  }, [brandSessions, through, bucketOf]);

  const noHost = monthSessions.filter((s) => isCountable(s) && !s.hostName).length;
  const noData = monthSessions.filter((s) => s.status === "Completed" && !isCountable(s)).length;
  const inputCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-mono";


  const caRows: { key: string; date: string; time: string; bucket: CampDayBucket; host: string; target: number | null; actual: number | null; pctTarget: number | null; state: PlanRunRateSlot["state"] | "offplan"; sessionId?: string }[] = rr
    ? [
        ...rr.slots.map((t) => ({
          key: t.planSlot.id,
          date: t.planSlot.date,
          time: `${t.planSlot.startTime.slice(0, 5)}–${t.planSlot.endTime.slice(0, 5)}`,
          bucket: t.bucket,
          host: t.session?.hostName ?? "",
          target: t.target,
          actual: t.state === "done" ? t.actual : null,
          pctTarget: t.pctTarget,
          state: t.state,
          sessionId: t.session?.id
        })),
        ...rr.offPlan.map((x) => ({
          key: x.session.id,
          date: x.session.date,
          time: `${x.session.startTime.slice(0, 5)}–${x.session.endTime.slice(0, 5)}`,
          bucket: x.bucket,
          host: x.session.hostName,
          target: null,
          actual: x.session.actualGmv,
          pctTarget: null,
          state: "offplan" as const,
          sessionId: x.session.id
        }))
      ].sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time))
    : [];
  const shownCa = caRows.filter((r) =>
    caFilter === "all" ? true : caFilter === "bad" ? r.pctTarget != null && r.pctTarget < RUN_RATE_BAD : caFilter === "offplan" ? r.state === "offplan" : r.bucket === caFilter
  );
  const STATE_LABEL: Record<string, string> = { done: "Đã xong", no_data: "Chưa có số", pending: "Sắp tới", cancelled: "Huỷ (giữ target)", offplan: "Ngoài kế hoạch" };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--text)] flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-[var(--accent-text)]" /> Dashboard · {brandName}
          </h2>
          <PageIntro>
            Tháng này tới đâu so với target plan, vì sao, và {isOps ? "tuần tới / tháng sau nên sửa gì. Đề xuất chỉ dùng quy tắc đã qua backtest trên lịch sử của chính brand." : "nhịp theo tuần. Số của tháng hiện ra khi ops phát hành Report Tháng."}
          </PageIntro>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {through && (
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${lagDays > 2 ? "bg-rose-500/15 text-rose-400" : "bg-emerald-500/15 text-emerald-400"}`}>
              Số liệu tới {dm(through)}{lagDays > 0 ? ` · trễ ${lagDays} ngày` : ""}
            </span>
          )}
          <input type="month" value={month} onChange={(e) => e.target.value && setPickedMonth(e.target.value)} className={inputCls} aria-label="Tháng" />
        </div>
      </div>

      {/* 01 · Độ tươi dữ liệu (ops) */}
      {isOps && (
        <div className="flex flex-wrap gap-2 text-[11px] font-bold">
          {noHost > 0 && <button onClick={onOpenSessions} className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">{noHost}/{monthSessions.filter(isCountable).length} ca chưa gán host</button>}
          {noData > 0 && <button onClick={onOpenSessions} className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300">{noData} ca đã xong chưa có số</button>}
          {!planLoading && (
            <button onClick={onOpenMonthPlan} className={`px-2.5 py-1 rounded-full ${locked ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}>
              Kế hoạch T{Number(month.slice(5))}: {locked ? "đã chốt" : plan ? "nháp, chưa chốt" : "chưa có"}
            </button>
          )}
          {!planLoading && (
            <button onClick={onOpenMonthPlan} className={`px-2.5 py-1 rounded-full ${nextPlan?.plan.status === "locked" ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"}`}>
              Kế hoạch T{Number(nextMonthOf(month).slice(5))}: {nextPlan?.plan.status === "locked" ? "đã chốt" : nextPlan ? "nháp" : "chưa có"}
            </button>
          )}
        </div>
      )}

      {hidden ? (
        <div className="text-sm text-[var(--text-muted)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          Số liệu tháng {month.slice(5)}/{month.slice(0, 4)} sẽ hiện khi ops phát hành Report Tháng. Chọn tháng đã phát hành ở ô tháng phía trên.
        </div>
      ) : (
        <>
          {/* 02 · Tháng này tới đâu */}
          <Card title={`Tháng ${Number(month.slice(5))} tới ${through ? dm(through) : "—"}`} icon={<Activity className="w-4 h-4 text-[var(--accent-text)]" />} sub={`So với cùng kỳ: ${win.label}`}>
            {/* Key Metrics đủ 18 chỉ số + AOV (lib/report/keyMetrics.ts); màu theo chiều tốt của từng chỉ số, trung tính thì không tô. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
              {KEY_METRICS.map((d) => {
                const a = keyMetricValue(prev, d.key), b = keyMetricValue(cur, d.key);
                const ch = a && b != null ? b / a - 1 : null;
                const tone = ch == null || d.goodWhenUp == null || Math.abs(ch) < 0.02 ? "" : ch > 0 === d.goodWhenUp ? "text-emerald-400" : "text-rose-400";
                return <Stat key={d.key} label={d.label} value={fmtKeyMetric(d, b)} hint={<span className={tone}>{signed(ch)} <span className="text-[var(--text-faint)]">({fmtKeyMetric(d, a)})</span></span>} />;
              })}
            </div>
          </Card>

          {/* 02b · Run-rate theo plan ban đầu */}
          <Card
            title="Run-rate so với target plan"
            icon={<Gauge className="w-4 h-4 text-[var(--accent-text)]" />}
            sub="Target = tổng target các ca của Kế Hoạch Tháng đã chốt. Run-rate = thực đạt ÷ target các ca có ngày ≤ ngày cuối có số. Ca huỷ vẫn giữ target; ca mở thêm ngoài plan được cộng thực đạt, target = 0."
          >
            {planLoading ? (
              <p className="text-xs text-[var(--text-faint)]">Đang tải kế hoạch…</p>
            ) : !rr ? (
              <div className="text-sm text-[var(--text-muted)] bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <span>
                  {plan ? `Kế hoạch tháng ${Number(month.slice(5))} còn là nháp` : `Tháng ${Number(month.slice(5))} chưa có Kế Hoạch Tháng`} — chưa có target plan để tính run-rate.
                  {isOps && <> <button onClick={onOpenMonthPlan} className="font-bold text-[var(--accent-text)] underline">Mở Kế Hoạch Tháng</button></>}
                </span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <Stat label={METRIC.runRate} value={pct(rr.total.runRate, 1)} tone={rrTone(rr.total.runRate)} hint={`đạt ${fmtVndShort(rr.total.actual)} / target tới ${rr.through ? dm(rr.through) : "—"} ${fmtVndShort(rr.total.targetToDate)}`} />
                  <Stat label={METRIC.pctTarget} value={pct(rr.total.pctTarget, 1)} hint={`${fmtVndShort(rr.total.actual)} / ${fmtVndShort(rr.total.target)} · ${rr.slots.length} ca kế hoạch`} />
                  <Stat label="Dự kiến cuối tháng" value={projection.value != null ? fmtVndShort(projection.value) : "—"} tone={projection.value == null ? undefined : projection.value >= rr.total.target ? "text-emerald-400" : "text-rose-400"} hint={`${signed(projection.value != null ? projection.value / rr.total.target - 1 : null)} so với target · ${PROJECTION_METHOD_LABEL[projection.method]}`} />
                  <Stat label="Cần mỗi ngày còn lại" value={rr.total.needPerRemainingDay != null ? fmtVndShort(rr.total.needPerRemainingDay) : "—"} hint={`${rr.total.remainingDays} ngày còn lại`} />
                </div>
                <CumulativeChart month={month} targetByDate={rr.targetByDate} actualByDate={rr.actualByDate} through={rr.through} runRate={rr.total.runRate} bucketOf={bucketOf} />
                {(rr.cancelledCount > 0 || rr.offPlan.length > 0 || rr.noDataCount > 0) && (
                  <p className="text-xs text-[var(--text-muted)]">
                    {rr.cancelledCount > 0 && <>{rr.cancelledCount} ca kế hoạch huỷ — target vẫn giữ trong mẫu số{rr.cancelledTargetToDate > 0 ? ` (${fmtVndShort(rr.cancelledTargetToDate)} tới nay)` : ""}. </>}
                    {rr.offPlan.length > 0 && <>{rr.offPlan.length} ca ngoài kế hoạch đã cộng {fmtVndShort(rr.offPlanActual)} vào thực đạt. </>}
                    {rr.noDataCount > 0 && <span className="text-amber-300">{rr.noDataCount} ca kế hoạch đã qua mà chưa có số — run-rate đang thấp hơn thực tế cho tới khi có file.</span>}
                  </p>
                )}

                <div>
                  <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-2">Theo loại ngày campaign</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead>
                        <tr className="text-[var(--text-faint)] text-left">
                          <th className="pb-1.5 pr-3">Loại ngày</th>
                          <th className="pb-1.5 pr-3">Ngày</th>
                          <th className="pb-1.5 pr-3">Trạng thái</th>
                          <th className="pb-1.5 pr-3 text-right">Target plan</th>
                          <th className="pb-1.5 pr-3 text-right">Target tới nay</th>
                          <th className="pb-1.5 pr-3 text-right">Thực đạt</th>
                          <th className="pb-1.5 text-right" title={metricHint(METRIC.runRate)}>{METRIC.runRate}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rr.buckets.map((b) => (
                          <tr key={b.bucket} className="border-t border-[var(--border)]/60">
                            <td className="py-1.5 pr-3 font-bold text-[var(--text)]">{CAMP_DAY_BUCKET_LABEL[b.bucket]}</td>
                            <td className="py-1.5 pr-3 font-mono text-[var(--text-muted)]">{b.bucket === "daily" ? `${b.days.length} ngày` : b.days.map(dm).join(", ")}</td>
                            <td className="py-1.5 pr-3 text-[var(--text-muted)]">
                              {b.status === "done" ? "Đã xong" : b.status === "live" ? `Đang chạy (${b.daysPassed}/${b.days.length})` : b.status === "next" ? "Sắp tới" : "—"}
                            </td>
                            <td className="py-1.5 pr-3 text-right font-mono">{fmtVndShort(b.target)} <span className="text-[var(--text-faint)]">{b.slotCount} ca</span></td>
                            <td className="py-1.5 pr-3 text-right font-mono">{b.slotCountToDate ? fmtVndShort(b.targetToDate) : "—"}</td>
                            <td className="py-1.5 pr-3 text-right font-mono">{b.daysPassed ? fmtVndShort(b.actual) : "—"}</td>
                            <td className="py-1.5 text-right">{b.targetToDate > 0 ? <span className={`px-2 py-0.5 rounded-full font-bold ${rrPill(b.runRate)}`}>{pct(b.runRate)}</span> : <span className="text-[var(--text-faint)]">chưa tới</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">
                      Theo từng ca · {caRows.filter((r) => r.pctTarget != null && r.pctTarget >= RUN_RATE_WARN).length} ca ≥ 95% · {caRows.filter((r) => r.pctTarget != null && r.pctTarget >= RUN_RATE_BAD && r.pctTarget < RUN_RATE_WARN).length} ca 85–95% ·{" "}
                      {caRows.filter((r) => r.pctTarget != null && r.pctTarget < RUN_RATE_BAD).length} ca dưới 85%
                    </p>
                    <select value={caFilter} onChange={(e) => setCaFilter(e.target.value as typeof caFilter)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)]" aria-label="Lọc ca">
                      <option value="all">Tất cả ca</option>
                      <option value="bad">Chỉ ca dưới 85%</option>
                      <option value="offplan">Ca ngoài kế hoạch</option>
                      <option value="daily">{CAMP_DAY_BUCKET_LABEL.daily}</option>
                      <option value="dday">{CAMP_DAY_BUCKET_LABEL.dday}</option>
                      <option value="midmonth">{CAMP_DAY_BUCKET_LABEL.midmonth}</option>
                      <option value="payday">{CAMP_DAY_BUCKET_LABEL.payday}</option>
                    </select>
                  </div>
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead className="sticky top-0 bg-[var(--surface)]">
                        <tr className="text-[var(--text-faint)] text-left">
                          <th className="pb-1.5 pr-3">Ca</th>
                          <th className="pb-1.5 pr-3">Loại ngày</th>
                          <th className="pb-1.5 pr-3">Host</th>
                          <th className="pb-1.5 pr-3">Trạng thái</th>
                          <th className="pb-1.5 pr-3 text-right">Target ca</th>
                          <th className="pb-1.5 pr-3 text-right">{METRIC.gmv}</th>
                          <th className="pb-1.5 text-right">{METRIC.pctTarget}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownCa.map((r) => (
                          <tr key={r.key} className="border-t border-[var(--border)]/60">
                            <td className="py-1 pr-3 font-mono text-[var(--text)]">
                              {isOps && r.sessionId ? <button onClick={() => onOpenSession(r.sessionId!)} className="hover:text-[var(--accent-text)] underline decoration-dotted">{dmw(r.date)} {r.time}</button> : <>{dmw(r.date)} {r.time}</>}
                            </td>
                            <td className="py-1 pr-3 text-[var(--text-muted)]">{CAMP_DAY_BUCKET_LABEL[r.bucket]}</td>
                            <td className="py-1 pr-3 text-[var(--text-muted)]">{r.host || (r.state === "done" || r.state === "offplan" ? <span className="text-amber-300">chưa gán</span> : "—")}</td>
                            <td className={`py-1 pr-3 ${r.state === "cancelled" ? "text-rose-300" : r.state === "offplan" ? "text-sky-300" : r.state === "no_data" ? "text-amber-300" : "text-[var(--text-muted)]"}`}>{STATE_LABEL[r.state]}</td>
                            <td className="py-1 pr-3 text-right font-mono text-[var(--text-muted)]">{r.target != null ? fmtVndShort(r.target) : "—"}</td>
                            <td className="py-1 pr-3 text-right font-mono font-bold text-[var(--text)]">{r.actual != null ? fmtVndShort(r.actual) : "—"}</td>
                            <td className="py-1 text-right">{r.pctTarget != null ? <span className={`px-2 py-0.5 rounded-full font-bold ${rrPill(r.pctTarget)}`}>{pct(r.pctTarget)}</span> : <span className="text-[var(--text-faint)]">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {shownCa.length === 0 && <p className="text-xs text-[var(--text-faint)] italic py-2">Không có ca nào khớp bộ lọc.</p>}
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* 03 · Vì sao (ops) */}
          {isOps && drivers && (
            <Card title="Vì sao GMV đổi" icon={<TrendingUp className="w-4 h-4 text-[var(--accent-text)]" />} sub={`GMV = ${METRIC.liveHours} × ${METRIC.viewsPerHour} × ${METRIC.liveCtr} × ${METRIC.ctor} × ${METRIC.aov} — ${win.label}`}>
              <DriverBars parts={drivers.parts.map((p) => ({ label: DRIVER_LABEL[p.key], change: p.change / 100 }))} total={cur.gmv / (prev.gmv || 1) - 1} />
              {control.length > 0 ? (
                <ul className="text-xs text-[var(--text-muted)] space-y-1">
                  <li className="text-[var(--text-faint)]">Nhóm đối chứng — live = ca agency, phần còn lại của shop = Total GMV trừ {`Seller LIVE`}; cùng cách tính với Report Tháng:</li>
                  {control.map((r) => {
                    const v = controlVerdict(r);
                    return (
                      <li key={r.key}>
                        <b className="text-[var(--text)]">{controlLabel(r.key)}</b>: live {r.liveChg == null ? "—" : `${r.liveChg >= 0 ? "+" : "−"}${num(Math.abs(r.liveChg), 0)}%`}, phần còn lại {r.restChg == null ? "—" : `${r.restChg >= 0 ? "+" : "−"}${num(Math.abs(r.restChg), 0)}%`}
                        {v && <> ⇒ <span className={v === "ops" ? "text-rose-300 font-bold" : ""}>{VERDICT_TEXT[v]}</span></>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-xs text-[var(--text-faint)]">Chưa có Shop Analytics cho kỳ này ở Dữ Liệu Gốc — chưa so được với phần còn lại của shop.</p>
              )}
            </Card>
          )}

          {/* 04 · Nhịp tuần */}
          {weeks.length > 0 && (
            <Card title={`${METRIC.gmvPerHour} theo tuần`} icon={<Activity className="w-4 h-4 text-[var(--accent-text)]" />} sub="Tuần trọn thấp hơn trung vị 8 tuần trước từ 15% trở lên, hoặc thấp nhất từ trước tới nay, được tô đỏ.">
              <WeeklyBars weeks={weeks} />
              {(() => {
                const last = [...weeks].reverse().find((w) => w.full);
                if (!last) return null;
                return last.alert ? (
                  <p className="text-xs text-rose-300 font-bold">
                    Tuần {dm(last.weekStart)}: {fmtVndShort(last.gmvPerHour)}/giờ{last.median8 ? `, ${signed(last.gmvPerHour! / last.median8 - 1, 0)} so với trung vị 8 tuần trước` : ""} dù chạy {num(last.hours, 0)} giờ.
                  </p>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Tuần gần nhất ({dm(last.weekStart)}) {fmtVndShort(last.gmvPerHour)}/giờ — trong ngưỡng bình thường.</p>
                );
              })()}
            </Card>
          )}
        </>
      )}

      {/* 05 · Đề xuất tối ưu (ops) */}
      {isOps && (
        <Card title="Đề xuất tối ưu" icon={<Lightbulb className="w-4 h-4 text-[var(--accent-text)]" />} sub="Chỉ quy tắc đã qua backtest walk-forward trên lịch sử của chính brand (dùng các tháng trước để đoán tháng sau). Mức ước lượng giả định giờ dời sang giữ được năng suất trung bình của khung đích — đọc là mức trần.">
          <div className="space-y-4 text-xs">
            <div className={`border-l-2 pl-3 space-y-1.5 ${slotOk ? "border-emerald-500" : "border-[var(--border)] opacity-80"}`}>
              <p className="font-bold text-[var(--text)] flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${slotOk ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>{slotOk ? "Đủ tin cậy" : "Chưa đủ tin cậy"}</span>
                Khung giờ ngày thường
              </p>
              {SLOT_BLOCKS.some((k) => sIdx[k]) && <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-left">
                      <th className="pb-1 pr-3">Khung</th>
                      <th className="pb-1 pr-3 text-right">Chỉ số (1,00 = mặt bằng tháng)</th>
                      <th className="pb-1 pr-3 text-right">Khoảng tin cậy 90%</th>
                      <th className="pb-1 text-right">Giờ lịch sử</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SLOT_BLOCKS.filter((k) => sIdx[k]).map((k) => {
                      const r = sIdx[k]!;
                      return (
                        <tr key={k} className="border-t border-[var(--border)]/60">
                          <td className="py-1 pr-3 text-[var(--text)]">{SLOT_BLOCK_LABEL[k]}</td>
                          <td className={`py-1 pr-3 text-right font-mono font-bold ${r.hi < 1 ? "text-rose-400" : r.lo > 1 ? "text-emerald-400" : "text-[var(--text)]"}`}>{num(r.idx, 2)}</td>
                          <td className="py-1 pr-3 text-right font-mono text-[var(--text-muted)]">{num(r.lo, 2)} – {num(r.hi, 2)}</td>
                          <td className="py-1 text-right font-mono text-[var(--text-faint)]">{num(r.hours, 0)}h</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
              {slotOk && sIdx.B && sIdx.D && recent28?.daily != null && (
                <p className="text-[var(--text-muted)]">
                  Dời 1 giờ ngày thường từ khung 11–13h sang 19–20h ≈ <b className="text-[var(--text)]">+{fmtVndShort((sIdx.D.lo - sIdx.B.hi) * recent28.daily)} – {fmtVndShort((sIdx.D.hi - sIdx.B.lo) * recent28.daily)}</b> theo {METRIC.gmvPerHour} ngày thường 28 ngày gần nhất.
                  {(() => {
                    const hB = hoursPerDailyDay(curRange, "B"), hD = hoursPerDailyDay(curRange, "D"), hDp = hoursPerDailyDay(prevRange, "D");
                    if (hD == null) return null;
                    return <> Kỳ này mỗi ngày thường chạy {num(hD, 1)}h ở khung 19–20h (cùng kỳ tháng trước {num(hDp, 1)}h) và {num(hB, 1)}h ở khung 11–13h.{hDp != null && hD < hDp * 0.85 && <b className="text-rose-300"> Giờ ở khung mạnh nhất đang bị cắt bớt.</b>}</>;
                  })()}
                </p>
              )}
              <p className="text-[var(--text-faint)]">Backtest: dùng chỉ số khung của các tháng trước {wfSlot.gain == null ? "chưa đủ tháng để thử" : `${wfSlot.gain > 0 ? "giảm" : "tăng"} sai số dự đoán ${pct(Math.abs(wfSlot.gain))}`} ({wfSlot.months} tháng).</p>
            </div>

            <div className={`border-l-2 pl-3 space-y-1.5 ${campOk ? "border-emerald-500" : "border-[var(--border)] opacity-80"}`}>
              <p className="font-bold text-[var(--text)] flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${campOk ? "bg-emerald-500/15 text-emerald-400" : "bg-[var(--surface-elevated)] text-[var(--text-faint)]"}`}>{campOk ? "Đủ tin cậy" : "Chưa đủ tin cậy"}</span>
                Mid-Month / Pay Day: dồn giờ vào ngày đầu
              </p>
              {cPos ? (
                <p className="text-[var(--text-muted)]">
                  Ngày 1 đạt <b className="text-[var(--text)]">{num(cPos[0].idx, 2)}</b> lần {METRIC.gmvPerHour} trung bình đợt ({cPos[0].above}/{cPos[0].windows} đợt cao hơn), ngày 3 đạt <b className="text-[var(--text)]">{num(cPos[2].idx, 2)}</b> ({cPos[2].windows - cPos[2].above}/{cPos[2].windows} đợt thấp hơn).
                  Trung bình đang xếp {num(cPos[0].avgHours, 1)}h cho ngày 1 và {num(cPos[2].avgHours, 1)}h cho ngày 3.
                  {campOk && recent28?.camp != null && <> Dời 1 ca 3h từ ngày 3 sang ngày 1 ≈ <b className="text-[var(--text)]">+{fmtVndShort(3 * (cPos[0].idx - cPos[2].idx) * recent28.camp)}</b> mỗi đợt.</>}
                </p>
              ) : (
                <p className="text-[var(--text-faint)]">Chưa đủ 2 đợt Mid-Month / Pay Day có số cả 3 ngày.</p>
              )}
            </div>

            <div className="border-l-2 border-[var(--border)] pl-3 space-y-1 opacity-80">
              <p className="font-bold text-[var(--text)] flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-elevated)] text-[var(--text-faint)]">Đã thử, bị loại</span> Chọn thứ trong tuần để live · Xếp hạng host theo tháng
              </p>
              <p className="text-[var(--text-faint)]">
                Chỉ số thứ trong tuần của các tháng trước {wfWeekday.gain == null ? "chưa đủ tháng để thử" : wfWeekday.gain > 0 ? `giảm sai số ${pct(wfWeekday.gain)}` : `làm sai số tăng ${pct(-wfWeekday.gain)}`}; hạng host tháng này không lặp lại tháng sau (đo CROCS 26/09: Spearman −0,04). Màn này không đưa lời khuyên dựa trên hai thứ đó.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* 06 · Soát kế hoạch tháng sau (ops, chỉ cảnh báo) */}
      {isOps && (
        <Card
          title={`Soát kế hoạch tháng ${Number(nextMonthOf(month).slice(5))}`}
          icon={<CalendarRange className="w-4 h-4 text-[var(--accent-text)]" />}
          right={<button onClick={onOpenMonthPlan} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white">Mở Kế Hoạch Tháng</button>}
          sub="Chỉ cảnh báo — sửa ở Kế Hoạch Tháng."
        >
          {!check ? (
            <p className="text-xs text-[var(--text-faint)]">Chưa có Kế Hoạch Tháng {nextMonthOf(month)}.</p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Stat label="Target / giờ" value={`${fmtVndShort(check.target)} / ${num(check.hours, 0)}h`} hint={`cần ${fmtVndShort(check.needPerHour)}/giờ · ${nextPlan?.plan.status === "locked" ? "đã chốt" : "nháp"}`} />
                <Stat label="Đang đạt (28 ngày)" value={`${fmtVndShort(check.recentPerHour)}/giờ`} tone={check.recentPerHour != null && check.needPerHour != null && check.recentPerHour < check.needPerHour ? "text-rose-400" : "text-emerald-400"} hint={check.recentPerHour && check.needPerHour ? `${signed(check.recentPerHour / check.needPerHour - 1)} so với mức cần` : undefined} />
                <Stat label="Dự kiến theo năng suất 28 ngày" value={fmtVndShort(check.expectedAtRecent)} tone={check.expectedAtRecent != null && check.expectedAtRecent >= check.target ? "text-emerald-400" : "text-rose-400"} hint={check.expectedAtRecent != null && check.target > 0 ? `${signed(check.expectedAtRecent / check.target - 1)} so với target` : "chưa đủ lịch sử"} />
                <Stat label="Giờ ngày thường 11–13h / 19–20h" value={`${num(check.weakHours, 0)}h / ${num(check.strongHours, 0)}h`} hint="khung yếu / khung mạnh" />
              </div>
              <ul className="space-y-1 text-[var(--text-muted)]">
                {check.invertedCamps.map((c) => (
                  <li key={c.bucket} className="text-rose-300">
                    {CAMP_DAY_BUCKET_LABEL[c.bucket]}: target ngày 1 ({fmtVndShort(c.day1)}) thấp hơn ngày 3 ({fmtVndShort(c.day3)}) — ngược lịch sử{cPos ? ` (ngày 1 = ${num(cPos[0].idx, 2)}×, ngày 3 = ${num(cPos[2].idx, 2)}× trung bình đợt)` : ""}. Bấm "Chia lại target" ở Kế Hoạch Tháng nháp để chia theo lịch sử.
                  </li>
                ))}
                {check.expectedAtRecent != null && check.expectedAtRecent < check.target && (
                  <li>
                    Thiếu khoảng {fmtVndShort(check.target - check.expectedAtRecent)} nếu năng suất giữ như 28 ngày gần nhất — cần thêm khoảng {num((check.target - check.expectedAtRecent) / (check.recentPerHour || 1), 0)} giờ live, kéo {METRIC.viewsPerHour} / {METRIC.ctor} về mức cũ, hoặc chốt lại target.
                  </li>
                )}
                {check.weakHours > 0 && slotOk && <li>{num(check.weakHours, 0)}h ngày thường đang ở khung 11–13h — cân nhắc dời sang 19–20h nếu còn studio và host.</li>}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* 07 · Host có khoảng tin cậy (ops) */}
      {isOps && !hidden && hosts.length > 0 && (
        <Card title="Host so với mặt bằng cùng loại ngày" icon={<Users className="w-4 h-4 text-[var(--accent-text)]" />} sub="Tỷ số GMV thực ÷ GMV kỳ vọng (cùng tháng × loại ngày × buổi). Chỉ nêu trên/dưới mặt bằng khi cả khoảng tin cậy 95% nằm một phía; còn lại là chưa kết luận được.">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="text-[var(--text-faint)] text-left">
                  <th className="pb-1.5 pr-3">Host</th>
                  <th className="pb-1.5 pr-3 text-right">Ca</th>
                  <th className="pb-1.5 pr-3 text-right">So mặt bằng</th>
                  <th className="pb-1.5">Kết luận</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.key} className="border-t border-[var(--border)]/60">
                    <td className="py-1 pr-3 text-[var(--text)]">{h.name}</td>
                    <td className="py-1 pr-3 text-right font-mono">{h.sessions}</td>
                    <td className="py-1 pr-3 text-right font-mono">{reliabilityText(h)}</td>
                    <td className={`py-1 ${h.verdict === "above" ? "text-emerald-400" : h.verdict === "below" ? "text-rose-400" : "text-[var(--text-faint)]"}`}>
                      {h.verdict === "above" ? "Trên mặt bằng" : h.verdict === "below" ? "Dưới mặt bằng" : h.sessions < 3 ? "Ít ca" : "Chưa kết luận"}
                      {isBorderline(h) ? " (sát ngưỡng)" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 08 · Phương án bù + benchmark ca sắp live (gộp từ Hỗ Trợ Vận Hành) */}
      {isOps && month === today.slice(0, 7) && (
        <OpsSupport
          rr={rr}
          projection={projection}
          brandId={brandId}
          brandName={brandName}
          month={month}
          sessions={sessions}
          shiftSlots={shiftSlots}
          promoSchemes={promoSchemes}
          engineParams={engineParams}
          onOpenMonthPlan={onOpenMonthPlan}
          onOpenSession={onOpenSession}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Biểu đồ
// ---------------------------------------------------------------------------

function CumulativeChart({ month, targetByDate, actualByDate, through, runRate, bucketOf }: { month: string; targetByDate: Map<string, number>; actualByDate: Map<string, number>; through: string | null; runRate: number | null; bucketOf: (d: string) => CampDayBucket }) {
  const days = [...targetByDate.keys()].sort();
  if (days.length === 0) return null;
  let t = 0, a = 0;
  const cumT: number[] = [], cumA: number[] = [], cumP: [number, number][] = [];
  let p = 0;
  days.forEach((d, i) => {
    t += targetByDate.get(d) ?? 0;
    cumT.push(t);
    if (through && d <= through) {
      a += actualByDate.get(d) ?? 0;
      cumA.push(a);
      p = a;
    } else {
      p += (targetByDate.get(d) ?? 0) * (runRate ?? 1);
      cumP.push([i, p]);
    }
  });
  const W = 720, H = 220, pl = 52, pb = 24;
  const maxY = Math.max(t, p, a, 1) * 1.08;
  const x = (i: number) => pl + (i * (W - pl - 20)) / Math.max(1, days.length - 1);
  const y = (v: number) => H - pb - (v / maxY) * (H - pb - 8);
  const line = (pts: [number, number][]) => pts.map(([i, v]) => `${x(i)},${y(v)}`).join(" ");
  return (
    <div>
      <div className="flex flex-wrap gap-4 text-[11px] text-[var(--text-muted)] mb-1">
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-0.5 bg-[var(--accent)]" /> Luỹ kế thực đạt (nét đứt = nếu giữ run-rate)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-3 h-0.5 bg-[var(--text-faint)]" /> Luỹ kế target plan</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-2 h-1 rounded bg-amber-400" /> Ngày camp</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Luỹ kế thực đạt so với luỹ kế target plan">
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <g key={g}>
            <line x1={pl} x2={W} y1={y(t * g)} y2={y(t * g)} style={{ stroke: "var(--border)", strokeDasharray: "2 3" }} />
            <text x={pl - 4} y={y(t * g) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{fmtVndShort(t * g)}</text>
          </g>
        ))}
        <polyline points={line(cumT.map((v, i) => [i, v]))} style={{ fill: "none", stroke: "var(--text-faint)", strokeWidth: 2 }} />
        {cumA.length > 0 && <polyline points={line(cumA.map((v, i) => [i, v]))} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2.5 }} />}
        {cumP.length > 0 && cumA.length > 0 && <polyline points={line([[cumA.length - 1, cumA[cumA.length - 1]], ...cumP])} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2, strokeDasharray: "5 4", opacity: 0.7 }} />}
        {cumA.length > 0 && <circle cx={x(cumA.length - 1)} cy={y(cumA[cumA.length - 1])} r={4.5} style={{ fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} />}
        {days.map((d, i) => (
          <g key={d}>
            {bucketOf(d) !== "daily" && <rect x={x(i) - 3} y={H - pb + 3} width={6} height={4} rx={1} style={{ fill: "#f59e0b" }} />}
            {(i === 0 || i === days.length - 1 || d.endsWith("-15")) && (
              <text x={x(i)} y={H - 4} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} style={{ fill: "var(--text-faint)", fontSize: 11 }}>{dm(d)}</text>
            )}
            <rect x={x(i) - (W - pl) / days.length / 2} y={0} width={(W - pl) / days.length} height={H - pb} style={{ fill: "transparent" }}>
              <title>{`${dm(d)} · target plan ${fmtVndShort(targetByDate.get(d) ?? 0)} · luỹ kế target ${fmtVndShort(cumT[i])}${i < cumA.length ? ` · luỹ kế thực đạt ${fmtVndShort(cumA[i])}` : ""}`}</title>
            </rect>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-[var(--text-faint)]">Tháng {month.slice(5)}/{month.slice(0, 4)}. Target từng ngày = tổng target các ca kế hoạch của ngày đó.</p>
    </div>
  );
}

function DriverBars({ parts, total }: { parts: { label: string; change: number }[]; total: number }) {
  const mx = Math.max(0.05, ...parts.map((p) => Math.abs(p.change)));
  const worst = [...parts].slice(1).sort((a, b) => a.change - b.change)[0];
  const advice: Record<string, string> = {
    [METRIC.viewsPerHour]: "kiểm tra ads và lịch đăng video trước giờ live (nhập Ads ở \"Nhập Ads & Ghi Chú\" để kết luận).",
    [METRIC.ctor]: "kiểm tra giá, voucher và tồn kho của các SKU được ghim nhiều nhất.",
    [METRIC.liveCtr]: "kiểm tra thứ tự ghim sản phẩm và kịch bản mở đầu.",
    [METRIC.aov]: "kiểm tra combo và quà tặng."
  };
  return (
    <div className="space-y-1.5">
      {parts.map((p) => (
        <div key={p.label} className="grid grid-cols-[110px_1fr] sm:grid-cols-[140px_1fr] items-center gap-2 text-xs">
          <span className="text-[var(--text-muted)]" title={metricHint(p.label)}>{p.label}</span>
          <div className="relative h-5">
            <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--border)]" />
            <div className={`absolute inset-y-0.5 rounded ${p.change >= 0 ? "bg-emerald-500/70" : "bg-rose-500/70"}`} style={p.change >= 0 ? { left: "50%", width: `${(Math.abs(p.change) / mx) * 45}%` } : { right: "50%", width: `${(Math.abs(p.change) / mx) * 45}%` }} />
            <span className={`absolute top-0.5 font-mono text-[11px] ${p.change >= 0 ? "text-emerald-400" : "text-rose-400"}`} style={p.change >= 0 ? { left: `calc(50% + ${(Math.abs(p.change) / mx) * 45}% + 4px)` } : { right: `calc(50% + ${(Math.abs(p.change) / mx) * 45}% + 4px)` }}>
              {signed(p.change)}
            </span>
          </div>
        </div>
      ))}
      <p className="text-xs text-[var(--text-muted)]">
        {METRIC.gmv} {signed(total)} so với cùng kỳ.{" "}
        {worst && worst.change < -0.03 ? <>Kéo xuống nhiều nhất: <b className="text-[var(--text)]">{worst.label}</b> ({signed(worst.change)}) — {advice[worst.label] ?? ""}</> : "Không có chỉ số tỷ lệ nào giảm quá 3%."}
      </p>
    </div>
  );
}

function WeeklyBars({ weeks }: { weeks: ReturnType<typeof weeklySeries> }) {
  const W = 720, H = 180, pl = 44, pb = 22;
  const maxY = Math.max(...weeks.map((w) => w.gmvPerHour ?? 0), 1) * 1.1;
  const bw = (W - pl - 6) / weeks.length;
  const y = (v: number) => H - pb - (v / maxY) * (H - pb - 8);
  const ticks = [0.25, 0.5, 0.75, 1].map((g) => maxY * g);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="GMV/giờ theo tuần">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pl} x2={W} y1={y(v)} y2={y(v)} style={{ stroke: "var(--border)", strokeDasharray: "2 3" }} />
          <text x={pl - 4} y={y(v) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{fmtVndShort(v)}</text>
        </g>
      ))}
      {weeks.map((w, i) => {
        const x = pl + i * bw + 2;
        const v = w.gmvPerHour ?? 0;
        return (
          <g key={w.weekStart}>
            <rect x={x} y={y(v)} width={Math.max(2, bw - 4)} height={H - pb - y(v)} rx={3} style={{ fill: w.alert ? "#f43f5e" : "var(--accent)", opacity: w.full ? 1 : 0.45 }}>
              <title>{`Tuần ${dm(w.weekStart)}: ${fmtVndShort(v)}/giờ · ${num(w.hours, 0)}h${w.full ? "" : " (chưa hết tuần)"}${w.median8 ? ` · trung vị 8 tuần trước ${fmtVndShort(w.median8)}` : ""}`}</title>
            </rect>
            {w.median8 != null && <line x1={x - 1} x2={x + bw - 3} y1={y(w.median8)} y2={y(w.median8)} style={{ stroke: "var(--text-faint)", strokeWidth: 2 }} />}
            {(i % 3 === 0 || i === weeks.length - 1) && (
              <text x={x + (bw - 4) / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{dm(w.weekStart)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
