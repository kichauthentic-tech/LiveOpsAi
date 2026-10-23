import { useEffect, useMemo, useState } from "react";
import { Radio } from "lucide-react";
import { BrandMonthPlanSlot, CalendarEventRow, LiveSession, PromoScheme, ShiftSlot } from "../types";
import { EngineParams } from "../lib/scheduling/engineParams";
import { buildHistory } from "../lib/scheduling/suggestEngine";
import { buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { calendarEventsRead, lockedPlanSlotsRead } from "../lib/db/monthPlans";
import { EstimateCtx, MonthTracking, benchmarkForWindow, trackMonth } from "../lib/opsSupport";
import { MonthEndProjection, PlanRunRate } from "../lib/performance/planRunRate";
import { todayVn } from "../lib/performance/brandCommitment";
import { fmtVndShort } from "../lib/format";
import type { CampOverrides } from "../lib/campaignDays";
import { SESSION_STATUS_CLS, SESSION_STATUS_LABEL_VI } from "../lib/sessionStatusUi";
import type { ReportPlatform } from "../lib/reportPlatform";
import { profileOf } from "../lib/platforms/profiles";

// Hỗ Trợ Vận Hành — khối cuối Bảng Vận Hành (OpsSupportTab). Không đụng target cam kết, không ghi DB. Chỉ còn MỘT việc:
// benchmark ca sắp live (21/10 bỏ "phương án bù A/B" — phương án của một kênh nay chỉ ở Chi tiết kênh, engine handlingPlan) — — ops so bằng mắt với dashboard TikTok trong phiên: view thấp → đẩy traffic, CTR/CVR thấp
// → tối ưu, ads đốt mạnh → hãm. Run-rate, % Target, bảng từng ca kế hoạch và ca ngoài plan nay nằm ở
// Dashboard (planRunRate — luật plan ban đầu), không lặp ở đây.

interface OpsSupportProps {
  /** planRunRate của Dashboard — null khi tháng chưa có kế hoạch chốt. */
  rr: PlanRunRate | null;
  projection: MonthEndProjection;
  brandId: string;
  brandName: string;
  /** Sàn đang xem — Dashboard đã lọc `sessions`/`shiftSlots` của brand theo sàn này; kế hoạch đã chốt đọc theo sàn. */
  platform: ReportPlatform;
  month: string; // "YYYY-MM"
  /** Khung camp hiệu lực Dashboard đã tính (effectiveCamp) — không đọc thẳng plan.campRanges. */
  camp: CampOverrides;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  engineParams: EngineParams;
  onOpenSession: (sessionId: string) => void;
}

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtDate = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtPct = (x: number, digits = 0) => `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`;
const fmtN = (x: number) => Math.round(x).toLocaleString("vi-VN");
const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, "0")}-${`${x.getDate()}`.padStart(2, "0")}`;
};

export default function OpsSupport({ rr, projection, brandId, brandName, platform, month, camp, sessions, shiftSlots, promoSchemes, engineParams, onOpenSession }: OpsSupportProps) {
  const today = todayVn();
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const funnel = profileOf(platform).funnel;
  const viewsLabel = profileOf(platform).viewsLabel;

  useEffect(() => {
    calendarEventsRead.take().then(setEvents).catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    lockedPlanSlotsRead
      .take(brandId, platform)
      .then((ls) => alive && setLockedSlots(ls))
      .catch(() => alive && setLockedSlots([]));
    return () => {
      alive = false;
    };
  }, [brandId, platform]);

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
  const ctx = useMemo<EstimateCtx>(() => ({ camp, events, schemes: brandSchemes, calibration }), [camp, events, brandSchemes, calibration]);

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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 2. Benchmark ca sắp live — nằm ở tab Hỗ Trợ Vận Hành của agency, không hiện ở Dashboard brand */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-3">
        <div>
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2"><Radio className="w-4 h-4 text-[var(--accent-text)]" /> Benchmark ca sắp live (7 ngày) — {brandName}</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Kỳ vọng theo ô thứ × giờ của lịch sử brand (median, đã nhân hệ số camp/lễ/scheme{tracking?.realityFactor ? `, k=${tracking.realityFactor.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}` : ""}). {funnel.inSessionTip}
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
                        <div><p className="text-[11px] text-[var(--text-faint)]">GMV kỳ vọng</p><p className="font-bold text-[var(--text)]">{fmtVndShort(b.expectedGmv * k)}</p></div>
                        <div><p className="text-[11px] text-[var(--text-faint)]">GMV/giờ</p><p className="font-bold text-[var(--text)]">{fmtVndShort(b.gmvPerHour * k)}</p></div>
                        <div><p className="text-[11px] text-[var(--text-faint)]">Target GMV ca</p><p className={`font-bold ${target > 0 && target > b.expectedGmv * k * engineParams.highExpectationRatio ? "text-amber-300" : "text-[var(--text)]"}`}>{target > 0 ? fmtVndShort(target) : "—"}</p></div>
                        <div><p className="text-[11px] text-[var(--text-faint)]">{viewsLabel}/giờ</p><p className="font-mono text-[var(--text)]">{fmtN(b.viewsPerHour)}</p></div>
                        <div><p className="text-[11px] text-[var(--text-faint)]">Tổng {viewsLabel.toLowerCase()}</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedViews)}</p></div>
                        {funnel.hasOrderFunnel && <div><p className="text-[11px] text-[var(--text-faint)]">Orders kỳ vọng</p><p className="font-mono text-[var(--text)]">{fmtN(b.expectedOrders)}</p></div>}
                        {funnel.hasOrderFunnel && <div><p className="text-[11px] text-[var(--text-faint)]">CVR</p><p className="font-mono text-[var(--text)]">{fmtPct(b.conversion, 2)}</p></div>}
                        {funnel.hasOrderFunnel && <div><p className="text-[11px] text-[var(--text-faint)]">LIVE CTR</p><p className="font-mono text-[var(--text)]">{b.liveCtr === null ? "—" : `${b.liveCtr.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`}</p></div>}
                        {funnel.hasOrderFunnel && <div><p className="text-[11px] text-[var(--text-faint)]">AOV</p><p className="font-mono text-[var(--text)]">{b.aov > 0 ? fmtVndShort(b.aov) : "—"}</p></div>}
                        {funnel.hasOrderFunnel && <div><p className="text-[11px] text-[var(--text-faint)]">Ads / giờ</p><p className="font-mono text-[var(--text)]">{b.adsPerHour === null ? "chưa có report" : fmtVndShort(b.adsPerHour)}</p></div>}
                        <div className="col-span-2"><p className="text-[11px] text-[var(--text-faint)]">Hệ số ngày</p><p className="font-mono text-[var(--text)]">×{b.dayFactor.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}{b.dayFactor > 1.05 ? " (camp/lễ/scheme)" : ""}</p></div>
                      </div>
                      {(b.thin || b.cellTags.includes("weak") || b.cellTags.includes("traffic_low_cvr")) && (
                        <p className="text-[11px] text-amber-300">
                          {b.thin ? "Ít dữ liệu ở khung này — chỉ tham khảo. " : ""}
                          {b.cellTags.includes("traffic_low_cvr") ? funnel.lowConversionTip : ""}
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
