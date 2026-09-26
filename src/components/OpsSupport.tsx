import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarRange, Gauge, Radio, TrendingDown, TrendingUp } from "lucide-react";
import { Brand, BrandMonthPlan, BrandMonthPlanSlot, CalendarEventRow, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { EngineParams } from "../lib/scheduling/engineParams";
import { buildHistory } from "../lib/scheduling/suggestEngine";
import { buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { fetchBrandLockedPlanSlots, fetchCalendarEvents, fetchMonthPlan } from "../lib/db/monthPlans";
import { EstimateCtx, MonthTracking, benchmarkForWindow, suggestFill, trackMonth } from "../lib/opsSupport";
import { monthOutlook } from "../lib/performance/ceoBrief";
import { elapsedFractionOf, todayVn } from "../lib/performance/brandCommitment";
import { useDefaultBrand } from "../hooks/useDefaultBrand";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import { metricHint } from "../lib/metricGlossary";

// Hỗ Trợ Vận Hành (user chốt 2026-09-21): tầng "target vận hành" — KHÔNG đụng target cam kết đã chốt,
// không ghi DB, không đọc số realtime. (1) Run-rate & dự kiến cuối tháng + phương án bù (đề xuất; ops
// tự thêm ca ở Kế Hoạch Tháng). (2) Benchmark ca sắp live — ops tự đối chiếu bằng mắt với dashboard
// TikTok trong phiên: view thấp → đẩy traffic, CTR/CVR thấp → tối ưu, ads đốt mạnh → hãm.

interface OpsSupportProps {
  brands: Brand[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  onOpenMonthPlan: () => void;
  onOpenSession: (sessionId: string) => void;
}

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtDate = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtPct = (x: number, digits = 0) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
const fmtN = (x: number) => Math.round(x).toLocaleString("vi-VN");
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, "0")}-${`${x.getDate()}`.padStart(2, "0")}`;
};

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: "good" | "bad" | "warn" | "muted" }> = ({ label, value, hint, tone }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
    <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]" title={metricHint(label)}>{label}</p>
    <p className={`text-lg font-black mt-0.5 ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-300" : tone === "muted" ? "text-[var(--text-faint)]" : "text-[var(--text)]"}`}>{value}</p>
    {hint && <p className="text-[11px] text-[var(--text-faint)] mt-0.5 leading-snug">{hint}</p>}
  </div>
);

export default function OpsSupport({ brands, sessions, shiftSlots, promoSchemes, engineParams, onOpenMonthPlan, onOpenSession }: OpsSupportProps) {
  const today = todayVn();
  const [brandId, setBrandId] = useDefaultBrand(brands, sessions, today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [plan, setPlan] = useState<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>(null);
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCalendarEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    setLoading(true);
    Promise.all([fetchMonthPlan(brandId, month), fetchBrandLockedPlanSlots(brandId)])
      .then(([p, ls]) => {
        if (!alive) return;
        setPlan(p);
        setLockedSlots(ls);
      })
      .catch(() => {
        if (!alive) return;
        setPlan(null);
        setLockedSlots([]);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [brandId, month]);

  const brand = brands.find((b) => b.id === brandId);
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const brandSchemes = useMemo(() => promoSchemes.filter((sc) => sc.brandId === brandId).map((sc) => ({ start: sc.startDate, end: sc.endDate, label: sc.title })), [promoSchemes, brandId]);
  const history = useMemo(() => buildHistory(sessions, brandId, today, { events, schemes: brandSchemes, params: engineParams }), [sessions, brandId, today, events, brandSchemes, engineParams]);
  // Hiệu chỉnh từ các tháng khác (như Kế Hoạch Tháng).
  const calibration = useMemo(() => {
    const others = lockedSlots.filter((ps) => !ps.date.startsWith(month));
    if (others.length === 0) return undefined;
    const byMonth = new Map<string, BrandMonthPlanSlot[]>();
    for (const ps of others) {
      const l = byMonth.get(ps.date.slice(0, 7)) ?? [];
      l.push(ps);
      byMonth.set(ps.date.slice(0, 7), l);
    }
    const cal = buildCalibration([...byMonth.values()].map((l) => evaluatePlan(l, shiftSlots, sessions)), engineParams);
    return cal.observations > 0 ? cal.factors : undefined;
  }, [lockedSlots, month, shiftSlots, sessions, engineParams]);
  const ctx = useMemo<EstimateCtx>(() => ({ camp: plan?.plan.campRanges, events, schemes: brandSchemes, calibration }), [plan, events, brandSchemes, calibration]);

  const locked = plan?.plan.status === "locked";
  // Ca của brand trong ĐÚNG tháng đang xem — trackMonth cần để nhận ra ca có số nằm ngoài lưới kế
  // hoạch (ops mở tay, ca thay thế sau khi huỷ, ca nạp bù). Không lọc theo tháng thì tiền của tháng
  // khác sẽ chảy nhầm vào run-rate tháng này.
  const brandMonthSessions = useMemo(() => brandSessions.filter((s) => s.date.startsWith(month)), [brandSessions, month]);
  const engineTracking = useMemo(
    () => (locked && plan ? trackMonth(plan.slots, shiftSlots, sessions, history, ctx, brandMonthSessions) : null),
    [locked, plan, shiftSlots, sessions, history, ctx, brandMonthSessions]
  );
  // Dự kiến cuối tháng dùng CHUNG cách tính với Bản Tin CEO (lib/performance/ceoBrief.ts): số đã có +
  // giờ mọi ca còn trong lịch (kể cả ca ngoài kế hoạch, ca mở chưa có người) × doanh số/giờ 28 ngày gần
  // nhất. Backtest T7–T8/2026: engine × k lệch +9…+47%, cách này −7…+8%. Engine vẫn dùng cho phương án bù
  // và cột dự báo từng ca — chỉ con số tổng và thiếu/vượt là đổi, để hai màn không nói hai số.
  const tracking = useMemo<MonthTracking | null>(() => {
    if (!engineTracking) return null;
    const open = shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
    const o = monthOutlook(month, today, brandSessions, open, null, plan?.plan.campRanges);
    const futureForecast = o.projected - o.actual;
    const gap = engineTracking.targetTotal - o.projected;
    const remaining = Math.max(0, engineTracking.targetTotal - engineTracking.actualAll);
    return {
      ...engineTracking,
      projected: o.projected,
      gap,
      gapPct: engineTracking.targetTotal > 0 ? gap / engineTracking.targetTotal : 0,
      upliftPct: o.pending.length > 0 && futureForecast > 0 ? (remaining - futureForecast) / futureForecast : null
    };
  }, [engineTracking, shiftSlots, brandId, month, today, brandSessions, plan]);
  const fill = useMemo(
    () => (tracking && plan && tracking.gapPct > engineParams.targetGapWarnPct ? suggestFill(tracking, history, plan.plan, month, today, ctx, engineParams) : null),
    [tracking, plan, history, month, today, ctx, engineParams]
  );
  const elapsed = elapsedFractionOf(`${month}-01`, today);

  // Benchmark: ca sắp live 7 ngày tới (đã chốt) + ca mở chưa có người (vẫn cần biết kỳ vọng để chọn host).
  const upcoming = useMemo(() => {
    const to = addDays(today, 7);
    const ss = brandSessions
      .filter((s) => s.date >= today && s.date <= to && (s.status === "Upcoming" || s.status === "Live Now"))
      .map((s) => ({ key: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, session: s as LiveSession | undefined, slot: undefined as ShiftSlot | undefined }));
    const sl = shiftSlots
      .filter((x) => x.brandId === brandId && x.status === "open" && x.date >= today && x.date <= to)
      .map((x) => ({ key: x.id, date: x.date, startTime: x.startTime, endTime: x.endTime, session: undefined as LiveSession | undefined, slot: x as ShiftSlot | undefined }));
    return [...ss, ...sl].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  }, [brandSessions, shiftSlots, brandId, today]);

  const inputCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--text)] flex items-center gap-2">
            <Gauge className="w-6 h-6 text-[var(--accent-text)]" /> Hỗ Trợ Vận Hành
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Run-rate so với target đã chốt, dự kiến cuối tháng và phương án bù; benchmark cho ca sắp live để đối chiếu với dashboard TikTok trong phiên. Không đổi target cam kết.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls}>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} font-mono`} />
        </div>
      </div>

      {/* 1. Target tháng */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><Activity className="w-4 h-4 text-[var(--accent-text)]" /> Target tháng {month} — {brand?.name}</h3>
          {tracking && (
            <span className="text-[11px] text-[var(--text-faint)]">
              {tracking.doneCount} ca xong · {tracking.pendingCount} còn lại
              {tracking.noDataCount > 0 && <> · <span className="text-amber-300">{tracking.noDataCount} đã qua giờ chưa có số</span></>}
              {tracking.cancelledCount > 0 && <> · <span className="text-rose-300">{tracking.cancelledCount} huỷ (mất {formatCurrencyAdaptive(tracking.targetLost)})</span></>}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-xs text-[var(--text-faint)]">Đang tải…</p>
        ) : !plan || !locked ? (
          <div className="text-sm text-[var(--text-muted)] bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              {plan ? "Kế hoạch tháng này còn là NHÁP" : "Chưa có kế hoạch tháng này"} — chưa có target cam kết để tracking.{" "}
              <button onClick={onOpenMonthPlan} className="font-bold text-[var(--accent-text)] underline">Mở Kế Hoạch Tháng</button>
            </span>
          </div>
        ) : tracking && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Stat label="Target GMV đã chốt" value={formatCurrencyAdaptive(tracking.targetTotal)} hint={`${tracking.slots.length} ca kế hoạch`} />
              <Stat
                label="GMV"
                value={formatCurrencyAdaptive(tracking.actualAll)}
                hint={
                  tracking.offPlanCount > 0
                    ? `${tracking.doneCount} ca kế hoạch + ${tracking.offPlanCount} ca ngoài kế hoạch (${formatCurrencyAdaptive(tracking.offPlanActual)})`
                    : `${tracking.doneCount} ca có số · TB ${formatCurrencyAdaptive(tracking.avgActualDone)}/ca`
                }
                tone={tracking.actualAll > 0 ? "good" : "muted"}
              />
              <Stat
                label="Run-rate"
                value={tracking.runRate === null ? "—" : fmtPct(tracking.runRate)}
                hint={tracking.runRate === null ? "chưa có ca xong" : `thực tế ÷ target của ca KẾ HOẠCH đã xong (${formatCurrencyAdaptive(tracking.targetDone)})`}
                tone={tracking.runRate === null ? "muted" : tracking.runRate >= 1 ? "good" : tracking.runRate >= 0.9 ? "warn" : "bad"}
              />
              <Stat
                label="Dự kiến cuối tháng"
                value={formatCurrencyAdaptive(tracking.projected)}
                hint="đã có + giờ các ca còn trong lịch × GMV/giờ 28 ngày gần nhất (cùng cách Bản Tin CEO) · ±8%"
              />
              <Stat
                label={tracking.gap > 0 ? "Thiếu" : "Vượt"}
                value={formatCurrencyAdaptive(Math.abs(tracking.gap))}
                hint={`${fmtPct(Math.abs(tracking.gapPct), 1)} target · ngưỡng cảnh báo ${fmtPct(engineParams.targetGapWarnPct)}`}
                tone={tracking.gap > 0 ? (tracking.gapPct > engineParams.targetGapWarnPct ? "bad" : "warn") : "good"}
              />
            </div>

            {/* Tiến độ: thực tế / target, vạch = phần tháng đã trôi */}
            <div>
              <div className="relative h-3 rounded-full bg-[var(--surface-base)] border border-[var(--border)] overflow-hidden">
                <div className={`absolute inset-y-0 left-0 ${tracking.gap > 0 && tracking.gapPct > engineParams.targetGapWarnPct ? "bg-rose-500/70" : "bg-emerald-500/70"}`} style={{ width: `${Math.min(100, (tracking.actualAll / Math.max(1, tracking.targetTotal)) * 100)}%` }} />
                <div className="absolute inset-y-0 left-0 bg-[var(--accent)]/25" style={{ width: `${Math.min(100, (tracking.projected / Math.max(1, tracking.targetTotal)) * 100)}%` }} />
                <div className="absolute inset-y-0 w-0.5 bg-[var(--text)]" style={{ left: `${Math.min(100, elapsed * 100)}%` }} title={`Đã trôi ${fmtPct(elapsed)} tháng`} />
              </div>
              <div className="flex justify-between text-[11px] text-[var(--text-faint)] mt-1">
                <span>Thực tế {fmtPct(tracking.targetTotal > 0 ? tracking.actualAll / tracking.targetTotal : 0)} · dự kiến {fmtPct(tracking.targetTotal > 0 ? tracking.projected / tracking.targetTotal : 0)}</span>
                <span>vạch = {fmtPct(elapsed)} tháng đã trôi</span>
              </div>
            </div>

            {/* Ca có số nhưng không nằm trong lưới kế hoạch — trước đây bị bỏ hẳn khỏi tracking nên
                màn này báo "thực tế 0đ" cho tháng đã ra tiền. Liệt kê để ops biết số cộng thêm từ đâu
                và quyết định có nên kéo chúng vào kế hoạch (chốt lại) hay không. */}
            {tracking.offPlanCount > 0 && (
              <div className="rounded-xl border border-sky-800/70 bg-sky-950/25 p-3 text-xs space-y-1.5">
                <p className="font-bold text-sky-200">
                  {tracking.offPlanCount} ca có số ngoài kế hoạch · {formatCurrencyAdaptive(tracking.offPlanActual)}
                </p>
                <p className="text-[var(--text-muted)]">
                  Ca mở tay ở Lịch &amp; Studio, ca thay thế sau khi huỷ, hoặc ca nạp bù. Đã cộng vào <b className="text-[var(--text)]">Thực tế</b> và <b className="text-[var(--text)]">Dự kiến cuối tháng</b>; cố ý KHÔNG tính vào Run-rate vì chúng không mang target nào.
                </p>
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {tracking.offPlanSessions.map((s) => (
                    <li key={s.id} className="flex justify-between gap-2">
                      <button onClick={() => onOpenSession(s.id)} className="text-[var(--accent-text)] hover:underline text-left">
                        {s.date.slice(8)}/{s.date.slice(5, 7)} · {s.startTime}–{s.endTime}
                        {s.hostName ? ` · ${s.hostName}` : ""}
                        {s.isBackfill ? " · nạp bù" : ""}
                      </button>
                      <span className="font-bold text-[var(--text)] shrink-0">{formatCurrencyAdaptive(s.actualGmv ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tracking.pendingCount > 0 && (
              <p className="text-xs text-[var(--text-muted)]">
                Về đích cần <b className="text-[var(--text)]">{formatCurrencyAdaptive(tracking.requiredPerPending)}/ca</b> cho {tracking.pendingCount + tracking.noDataCount} ca còn lại
                {tracking.avgActualDone > 0 && <> — so với TB đang đạt {formatCurrencyAdaptive(tracking.avgActualDone)}/ca ({tracking.requiredPerPending > tracking.avgActualDone ? <span className="text-rose-300">cao hơn {fmtPct(tracking.requiredPerPending / tracking.avgActualDone - 1)}</span> : <span className="text-emerald-300">thấp hơn {fmtPct(1 - tracking.requiredPerPending / tracking.avgActualDone)}</span>})</>}.
              </p>
            )}

            {/* Phương án bù */}
            {tracking.gap > 0 && tracking.gapPct > engineParams.targetGapWarnPct && (
              <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-3 sm:p-4 space-y-3">
                <p className="text-sm font-bold text-amber-200 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Dự kiến thiếu {formatCurrencyAdaptive(tracking.gap)} ({fmtPct(tracking.gapPct, 1)}) — phương án bù</p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                  <div className="bg-[var(--surface-base)]/70 border border-[var(--border)] rounded-xl p-3 space-y-2">
                    <p className="font-bold text-[var(--text)]">A · Thêm giờ live</p>
                    {fill ? (
                      <>
                        <p className="text-[var(--text-muted)]">
                          Thêm <b className="text-[var(--text)]">{fmtH(fill.extraHours)}h ({fill.extraSlots.length} ca)</b> vào các khung mạnh còn trống{fill.coversGap ? "" : " — vẫn chưa đủ trong khung giờ/ngày của kế hoạch"}:
                        </p>
                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                          {fill.extraSlots.map((sl) => (
                            <li key={`${sl.date}${sl.startTime}`} className="flex justify-between gap-2">
                              <span className="font-mono text-[var(--text)]">{fmtDate(sl.date)} {sl.startTime}–{sl.endTime}</span>
                              <span className="text-[var(--text-faint)]">≈ {formatCurrencyAdaptive(sl.expectedGmv * (tracking.realityFactor ?? 1))}{sl.dayLabel ? ` · ${sl.dayLabel}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                        <button onClick={onOpenMonthPlan} className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white">
                          <CalendarRange className="w-3.5 h-3.5" /> Thêm ca ở Kế Hoạch Tháng
                        </button>
                        <p className="text-[11px] text-[var(--text-faint)]">Ca thêm sau chốt mang target riêng theo dự báo; target các ca đã chốt không đổi.</p>
                      </>
                    ) : (
                      <p className="text-[var(--text-muted)]">Không còn chỗ trong khung giờ/ngày của kế hoạch (hoặc chưa đủ lịch sử để engine xếp) — cân nhắc nới khung live hoặc phương án B.</p>
                    )}
                  </div>
                  <div className="bg-[var(--surface-base)]/70 border border-[var(--border)] rounded-xl p-3 space-y-2">
                    <p className="font-bold text-[var(--text)]">B · Nâng hiệu suất ca còn lại</p>
                    {tracking.upliftPct !== null && tracking.upliftPct > 0 ? (
                      <>
                        <p className="text-[var(--text-muted)]">Mỗi ca còn lại phải cao hơn dự kiến <b className="text-[var(--text)]">{fmtPct(tracking.upliftPct)}</b>. GMV = Views × CVR × AOV (CVR = LIVE CTR × CTOR), nên tương đương một trong:</p>
                        <ul className="list-disc pl-4 text-[var(--text-muted)] space-y-0.5">
                          <li>Views (traffic/ads) <b className="text-[var(--text)]">+{fmtPct(tracking.upliftPct)}</b> cùng CVR/AOV</li>
                          <li>CVR <b className="text-[var(--text)]">+{fmtPct(tracking.upliftPct)}</b> (deal/voucher, kịch bản chốt)</li>
                          <li>AOV <b className="text-[var(--text)]">+{fmtPct(tracking.upliftPct)}</b> (combo, upsell)</li>
                          <li>hoặc kết hợp: mỗi thứ +{fmtPct(Math.pow(1 + tracking.upliftPct, 1 / 3) - 1)}</li>
                        </ul>
                      </>
                    ) : (
                      <p className="text-[var(--text-muted)]">Không còn ca nào phía trước — chỉ còn cách thêm giờ (A).</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {tracking.gap <= 0 && tracking.doneCount > 0 && (
              <p className="text-xs text-emerald-300 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Đang đi đúng nhịp — dự kiến vượt target {formatCurrencyAdaptive(-tracking.gap)}.</p>
            )}

            {/* Chi tiết ca kế hoạch */}
            <details className="text-xs">
              <summary className="cursor-pointer text-[var(--text-muted)] font-bold">Chi tiết từng ca kế hoạch ({tracking.slots.length})</summary>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-[var(--text-faint)] text-left">
                      <th className="pb-1.5 pr-3">Ca</th>
                      <th className="pb-1.5 pr-3">Trạng thái</th>
                      <th className="pb-1.5 pr-3 text-right">Target GMV</th>
                      <th className="pb-1.5 pr-3 text-right">Dự báo</th>
                      <th className="pb-1.5 pr-3 text-right">GMV</th>
                      <th className="pb-1.5 text-right">% Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tracking.slots.map((t) => (
                      <tr key={t.planSlot.id} className="border-t border-[var(--border)]/60">
                        <td className="py-1 pr-3 font-mono text-[var(--text)]">
                          {t.session ? <button onClick={() => onOpenSession(t.session!.id)} className="hover:text-[var(--accent-text)] underline decoration-dotted">{fmtDate(t.planSlot.date)} {t.planSlot.startTime}–{t.planSlot.endTime}</button> : <>{fmtDate(t.planSlot.date)} {t.planSlot.startTime}–{t.planSlot.endTime}</>}
                        </td>
                        <td className="py-1 pr-3">
                          <span className={`px-1.5 py-0.5 rounded border text-[11px] font-bold ${t.state === "done" ? SESSION_STATUS_CLS.Completed : t.state === "cancelled" ? SESSION_STATUS_CLS.Cancelled : t.state === "no_data" ? "bg-amber-950 text-amber-300 border-amber-800" : SESSION_STATUS_CLS.Upcoming}`}>
                            {t.state === "done" ? "Đã xong" : t.state === "cancelled" ? "Huỷ" : t.state === "no_data" ? "Chưa có số" : t.session ? SESSION_STATUS_LABEL_VI[t.session.status] : t.slot ? "Chờ đăng ký" : "—"}
                          </span>
                        </td>
                        <td className="py-1 pr-3 text-right text-[var(--text-muted)]">{formatCurrencyAdaptive(t.target)}</td>
                        <td className="py-1 pr-3 text-right text-[var(--text-faint)]">{t.forecast > 0 ? formatCurrencyAdaptive(t.forecast * (tracking.realityFactor ?? 1)) : "—"}</td>
                        <td className="py-1 pr-3 text-right font-bold text-[var(--text)]">{t.state === "done" ? formatCurrencyAdaptive(t.actual) : "—"}</td>
                        <td className={`py-1 text-right font-bold ${t.state !== "done" ? "text-[var(--text-faint)]" : t.actual >= t.target ? "text-emerald-400" : "text-rose-400"}`}>{t.state === "done" && t.target > 0 ? fmtPct(t.actual / t.target) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      {/* 2. Benchmark ca sắp live */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-3">
        <div>
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><Radio className="w-4 h-4 text-[var(--accent-text)]" /> Benchmark ca sắp live (7 ngày) — {brand?.name}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Kỳ vọng theo ô thứ × giờ của lịch sử brand (median, đã nhân hệ số camp/lễ/scheme{tracking?.realityFactor ? `, k=${tracking.realityFactor.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}` : ""}). Trong ca, ops so bằng mắt với dashboard TikTok: <b>view thấp</b> → đẩy traffic; <b>CTR/CVR thấp</b> → tối ưu deal/kịch bản; <b>ads vượt</b> → hãm.
          </p>
        </div>
        {history.brandGmvPerHour <= 0 ? (
          <p className="text-xs text-[var(--text-faint)] italic">Brand chưa có ca đối soát nào — chưa dựng được benchmark.</p>
        ) : upcoming.length === 0 ? (
          <p className="text-xs text-[var(--text-faint)] italic">Không có ca nào trong 7 ngày tới.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {upcoming.map((u) => {
              const b = benchmarkForWindow(history, brandSessions, u, ctx);
              const k = tracking?.realityFactor ?? 1;
              const target = u.session?.targetGmv ?? 0;
              return (
                <div key={u.key} className={`rounded-xl border p-3 space-y-2 ${u.session ? "bg-[var(--surface-base)] border-[var(--border)]" : "bg-[var(--surface-base)]/50 border-dashed border-[var(--border)]"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono font-bold text-[var(--text)] text-sm">{fmtDate(u.date)} · {u.startTime}–{u.endTime}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        {u.session ? <>Host {u.session.hostName || "—"}{u.session.coHostName ? ` · Trợ ${u.session.coHostName}` : ""}</> : "Chờ đăng ký — chưa có host"}
                      </p>
                    </div>
                    {u.session ? (
                      <button onClick={() => onOpenSession(u.session!.id)} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${SESSION_STATUS_CLS[u.session.status]}`}>{SESSION_STATUS_LABEL_VI[u.session.status]}</button>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-blue-950 text-blue-300 border-blue-800">Mở</span>
                    )}
                  </div>
                  {!b ? (
                    <p className="text-[11px] text-[var(--text-faint)] italic">Chưa có lịch sử cho khung này.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-[11px]">
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">GMV kỳ vọng</p><p className="font-bold text-[var(--text)]">{formatCurrencyAdaptive(b.expectedGmv * k)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">GMV/giờ</p><p className="font-bold text-[var(--text)]">{formatCurrencyAdaptive(b.gmvPerHour * k)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Target GMV ca</p><p className={`font-bold ${target > 0 && target > b.expectedGmv * k * engineParams.highExpectationRatio ? "text-amber-300" : "text-[var(--text)]"}`}>{target > 0 ? formatCurrencyAdaptive(target) : "—"}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Views/giờ</p><p className="font-mono text-[var(--text)]">{fmtN(b.viewsPerHour)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Tổng view</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedViews)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Orders kỳ vọng</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedOrders)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">CVR</p><p className="font-mono text-[var(--text)]">{fmtPct(b.conversion, 2)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">LIVE CTR</p><p className="font-mono text-[var(--text)]">{b.liveCtr === null ? "—" : `${b.liveCtr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">AOV</p><p className="font-mono text-[var(--text)]">{b.aov > 0 ? formatCurrencyAdaptive(b.aov) : "—"}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Ads / giờ</p><p className="font-mono text-[var(--text)]">{b.adsPerHour === null ? "chưa có report" : formatCurrencyAdaptive(b.adsPerHour)}</p></div>
                        <div className="col-span-2"><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Hệ số ngày</p><p className="font-mono text-[var(--text)]">×{b.dayFactor.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}{b.dayFactor > 1.05 ? " (camp/lễ/scheme)" : ""}</p></div>
                      </div>
                      {(b.thin || b.cellTags.includes("weak") || b.cellTags.includes("traffic_low_cvr")) && (
                        <p className="text-[11px] text-amber-300">
                          {b.thin ? "Ít dữ liệu ở khung này — chỉ tham khảo. " : ""}
                          {b.cellTags.includes("traffic_low_cvr") ? "Khung này lịch sử view khá nhưng CVR thấp — ưu tiên deal chốt đơn. " : ""}
                          {b.cellTags.includes("weak") ? "Khung yếu trong lịch sử." : ""}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
