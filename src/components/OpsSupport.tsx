import { useEffect, useMemo, useState } from "react";
import { CalendarRange, Radio, TrendingDown } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, CalendarEventRow, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { EngineParams } from "../lib/scheduling/engineParams";
import { buildHistory } from "../lib/scheduling/suggestEngine";
import { buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { calendarEventsRead, lockedPlanSlotsRead } from "../lib/db/monthPlans";
import { EstimateCtx, MonthTracking, benchmarkForWindow, suggestFill, trackMonth } from "../lib/opsSupport";
import { MonthEndProjection, PlanRunRate, PROJECTION_METHOD_LABEL } from "../lib/performance/planRunRate";
import { todayVn } from "../lib/performance/brandCommitment";
import { fmtVndShort } from "../lib/format";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";

// Hỗ Trợ Vận Hành (user chốt 2026-09-21) — từ 2026-09-28 là MỘT PHẦN của Dashboard brand (user chốt gộp,
// bỏ tab agency `ops_support`). Không đụng target cam kết, không ghi DB. Còn lại hai việc riêng của nó:
// (1) phương án bù khi dự kiến thiếu target (A · thêm giờ theo engine, B · nâng hiệu suất); (2) benchmark
// ca sắp live — ops so bằng mắt với dashboard TikTok trong phiên: view thấp → đẩy traffic, CTR/CVR thấp
// → tối ưu, ads đốt mạnh → hãm. Run-rate, % Target, bảng từng ca kế hoạch và ca ngoài plan nay nằm ở
// Dashboard (planRunRate — luật plan ban đầu), không lặp ở đây.

interface OpsSupportProps {
  /** planRunRate của Dashboard — null khi tháng chưa có kế hoạch chốt. */
  rr: PlanRunRate | null;
  projection: MonthEndProjection;
  brandId: string;
  brandName: string;
  month: string; // "YYYY-MM"
  /** Kế hoạch của `month` — Dashboard đã nạp (trước 2026-10-03 panel tự nạp lại đúng truy vấn đó). */
  plan: { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null;
  planLoading: boolean;
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

// Nạp trước cùng Dashboard brand (lib/db/prefetch.ts) — panel chỉ hiện với ops ở tháng hiện tại.
export function prefetchOpsSupport(brandId: string): void {
  calendarEventsRead.prefetch();
  lockedPlanSlotsRead.prefetch(brandId);
}

export default function OpsSupport({ rr, projection, brandId, brandName, month, plan, planLoading, sessions, shiftSlots, promoSchemes, engineParams, onOpenMonthPlan, onOpenSession }: OpsSupportProps) {
  const today = todayVn();
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  // Khoá brand của lần nạp ca-đã-chốt gần nhất — khác brand đang xem nghĩa là đang tải.
  const [lockedFor, setLockedFor] = useState<string | null>(null);
  const loading = planLoading || lockedFor !== brandId;

  useEffect(() => {
    calendarEventsRead.take().then(setEvents).catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    lockedPlanSlotsRead
      .take(brandId)
      .then((ls) => alive && setLockedSlots(ls))
      .catch(() => alive && setLockedSlots([]))
      .finally(() => alive && setLockedFor(brandId));
    return () => {
      alive = false;
    };
  }, [brandId]);

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

  // Trạng thái ca + dự kiến cuối tháng nhận từ Dashboard (planRunRate + projectMonthEnd) — cùng một số với thẻ
  // run-rate phía trên và Bản Tin CEO (audit 2026-09-28 mục 3). Engine chỉ còn lo dự báo từng ca, k và phương án bù.
  const engineTracking = useMemo(() => (rr ? trackMonth(rr, history, ctx) : null), [rr, history, ctx]);
  const tracking = useMemo<MonthTracking | null>(() => {
    if (!engineTracking || projection.value == null) return null;
    const projected = projection.value;
    const futureForecast = projected - engineTracking.actualAll;
    const gap = engineTracking.targetTotal - projected;
    const remaining = Math.max(0, engineTracking.targetTotal - engineTracking.actualAll);
    const pendingCount = engineTracking.pendingCount + engineTracking.noDataCount;
    return {
      ...engineTracking,
      projected,
      gap,
      gapPct: engineTracking.targetTotal > 0 ? gap / engineTracking.targetTotal : 0,
      upliftPct: pendingCount > 0 && futureForecast > 0 ? (remaining - futureForecast) / futureForecast : null
    };
  }, [engineTracking, projection]);
  const fill = useMemo(
    () => (tracking && plan && tracking.gapPct > engineParams.targetGapWarnPct ? suggestFill(tracking, history, plan.plan, month, today, ctx, engineParams) : null),
    [tracking, plan, history, month, today, ctx, engineParams]
  );

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

  const remainingCount = tracking ? tracking.pendingCount + tracking.noDataCount : 0;
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 1. Phương án bù — chỉ khi kế hoạch đã chốt và dự kiến thiếu quá ngưỡng */}
      {loading ? null : tracking && tracking.gap > 0 && tracking.gapPct > engineParams.targetGapWarnPct ? (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-3">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-amber-300" /> Dự kiến thiếu {fmtVndShort(tracking.gap)} ({fmtPct(tracking.gapPct, 1)} target) — phương án bù
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Dự kiến cuối tháng {fmtVndShort(tracking.projected)} = đã có + {PROJECTION_METHOD_LABEL[projection.method]}.
            {remainingCount > 0 && <> Về đích cần <b className="text-[var(--text)]">{fmtVndShort(tracking.requiredPerPending)}/ca</b> cho {remainingCount} ca kế hoạch còn lại.</>}
          </p>
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
                        <span className="text-[var(--text-faint)]">≈ {fmtVndShort(sl.expectedGmv * (tracking.realityFactor ?? 1))}{sl.dayLabel ? ` · ${sl.dayLabel}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                  <button onClick={onOpenMonthPlan} className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white">
                    <CalendarRange className="w-3.5 h-3.5" /> Thêm ca ở Kế Hoạch Tháng
                  </button>
                  <p className="text-[11px] text-[var(--text-faint)]">Ca thêm ngoài plan được cộng vào thực đạt nhưng không mang target (luật run-rate plan ban đầu); target các ca đã chốt không đổi.</p>
                </>
              ) : (
                <p className="text-[var(--text-muted)]">Không còn chỗ trong khung giờ/ngày của kế hoạch (hoặc chưa đủ lịch sử để engine xếp) — cân nhắc nới khung live hoặc phương án B.</p>
              )}
            </div>
            <div className="bg-[var(--surface-base)]/70 border border-[var(--border)] rounded-xl p-3 space-y-2">
              <p className="font-bold text-[var(--text)]">B · Nâng hiệu suất ca còn lại</p>
              {remainingCount === 0 ? (
                <p className="text-[var(--text-muted)]">Không còn ca kế hoạch nào phía trước — chỉ còn cách thêm giờ (A).</p>
              ) : tracking.upliftPct !== null && tracking.upliftPct > 0 ? (
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
                // Lỗi E2E 28/09 (#4): brand chưa có GMV/giờ 28 ngày ⇒ không có dự báo cho ca còn lại — trước đây
                // rơi vào câu "không còn ca nào" ngay dưới dòng "cần X/ca cho N ca còn lại".
                <p className="text-[var(--text-muted)]">
                  Chưa có GMV/giờ 28 ngày gần nhất để dự báo {remainingCount} ca còn lại — mỗi ca cần đạt khoảng <b className="text-[var(--text)]">{fmtVndShort(tracking.requiredPerPending)}</b> để về đích.
                </p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* 2. Benchmark ca sắp live */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-3">
        <div>
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><Radio className="w-4 h-4 text-[var(--accent-text)]" /> Benchmark ca sắp live (7 ngày) — {brandName}</h3>
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
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">GMV kỳ vọng</p><p className="font-bold text-[var(--text)]">{fmtVndShort(b.expectedGmv * k)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">GMV/giờ</p><p className="font-bold text-[var(--text)]">{fmtVndShort(b.gmvPerHour * k)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Target GMV ca</p><p className={`font-bold ${target > 0 && target > b.expectedGmv * k * engineParams.highExpectationRatio ? "text-amber-300" : "text-[var(--text)]"}`}>{target > 0 ? fmtVndShort(target) : "—"}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Views/giờ</p><p className="font-mono text-[var(--text)]">{fmtN(b.viewsPerHour)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Tổng view</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedViews)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Orders kỳ vọng</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedOrders)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">CVR</p><p className="font-mono text-[var(--text)]">{fmtPct(b.conversion, 2)}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">LIVE CTR</p><p className="font-mono text-[var(--text)]">{b.liveCtr === null ? "—" : `${b.liveCtr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">AOV</p><p className="font-mono text-[var(--text)]">{b.aov > 0 ? fmtVndShort(b.aov) : "—"}</p></div>
                        <div><p className="text-[11px] uppercase font-bold text-[var(--text-faint)]">Ads / giờ</p><p className="font-mono text-[var(--text)]">{b.adsPerHour === null ? "chưa có report" : fmtVndShort(b.adsPerHour)}</p></div>
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
