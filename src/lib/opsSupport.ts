import { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../types";
import { EngineParams } from "./scheduling/engineParams";
import { CalendarEvent, DateRange, HistorySummary, SuggestResult, SuggestedSlot, cellsForWindow, estimateSlots, suggestMonthPlan } from "./scheduling/suggestEngine";
import { sessionHours } from "./performance/hostPerformance";
import { sessionDurationHours } from "./pnl";

// Module hỗ trợ vận hành (2026-09-21, user chốt): tầng "target vận hành" TÁCH khỏi target cam kết của
// Kế Hoạch Tháng đã chốt. Không ghi gì vào DB, không đọc số realtime — chỉ tính từ ca đã xong + kế
// hoạch đã chốt + ma trận lịch sử của engine, đưa ra: (1) run-rate & dự kiến cuối tháng + phương án
// bù (đề xuất, ops tự quyết thêm ca ở Kế Hoạch Tháng); (2) benchmark cho ca sắp live để ops tự đối
// chiếu bằng mắt với dashboard TikTok trong phiên.

export interface EstimateCtx {
  camp?: BrandMonthPlan["campRanges"];
  events?: CalendarEvent[];
  schemes?: DateRange[];
  calibration?: Map<string, number>;
}

export type TrackedSlotState = "done" | "pending" | "cancelled" | "no_data";

export interface TrackedSlot {
  planSlot: BrandMonthPlanSlot;
  slot?: ShiftSlot;
  session?: LiveSession;
  state: TrackedSlotState;
  target: number;
  forecast: number; // engine dự báo cho khung giờ này (0 = không đủ lịch sử)
  actual: number;
}

export interface MonthTracking {
  targetTotal: number;
  slots: TrackedSlot[];
  doneCount: number;
  pendingCount: number;
  cancelledCount: number;
  noDataCount: number; // ca đã qua giờ nhưng chưa có số → chưa tính vào run-rate
  actualDone: number;
  targetDone: number;
  forecastDone: number;
  targetPending: number;
  forecastPending: number;
  targetLost: number; // target của ca đã huỷ — mất hẳn, phải bù chỗ khác
  runRate: number | null; // thực tế ÷ target của ca đã xong
  realityFactor: number | null; // thực tế ÷ dự báo engine của ca đã xong (k) — dùng để chiếu phần còn lại
  // Ca CÓ SỐ của brand trong tháng nhưng KHÔNG nằm trong lưới kế hoạch (ops mở tay ở Lịch & Studio,
  // ca thay thế sau khi huỷ, ca nạp bù). Tiền của chúng là tiền thật đã vào, nên phải cộng vào
  // `projected`/`gap`; nhưng chúng không mang target nào nên cố ý KHÔNG đụng vào runRate/k —
  // hai số đó đo chất lượng THỰC THI KẾ HOẠCH, cộng doanh thu không có mẫu số vào là làm hỏng.
  offPlanSessions: LiveSession[];
  offPlanCount: number;
  offPlanActual: number;
  actualAll: number; // actualDone + offPlanActual — tiền thật của brand trong tháng, dùng cho thanh tiến độ/gap
  projected: number; // thực tế (kế hoạch + ngoài kế hoạch) + dự báo còn lại × k
  gap: number; // target − dự kiến (dương = thiếu)
  gapPct: number;
  requiredPerPending: number; // mỗi ca còn lại phải đạt bao nhiêu để về đích
  avgActualDone: number;
  upliftPct: number | null; // phần còn lại phải nhỉnh hơn dự kiến bao nhiêu % (null = không có ca còn lại)
}

const isDone = (s?: LiveSession) => !!s && s.status === "Completed" && (s.actualGmv > 0 || s.dataSource !== "manual");

export function trackMonth(
  planSlots: BrandMonthPlanSlot[],
  shiftSlots: ShiftSlot[],
  sessions: LiveSession[],
  history: HistorySummary,
  ctx: EstimateCtx,
  // Toàn bộ ca của ĐÚNG brand + ĐÚNG tháng đang xem. Dùng để tìm ca có số nằm ngoài lưới kế hoạch:
  // đường `plan_slot → shift_slot.session_id → live_session` không bao giờ thấy chúng, nên trước
  // bản này màn Hỗ Trợ Vận Hành báo "thực tế 0đ" cho tháng đã chạy ra tiền và đề xuất thêm ca để
  // bù khoản đã bù xong. Bỏ trống = giữ hành vi cũ (chỉ đếm ca trong kế hoạch).
  brandMonthSessions: LiveSession[] = []
): MonthTracking {
  const slotById = new Map(shiftSlots.map((sl) => [sl.id, sl]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const forecasts = history.brandGmvPerHour > 0 ? estimateSlots(history, planSlots, ctx) : planSlots.map((ps) => ps.expectedGmv ?? 0);
  const slots: TrackedSlot[] = planSlots.map((ps, i) => {
    const slot = ps.slotId ? slotById.get(ps.slotId) : undefined;
    const session = slot?.sessionId ? sessionById.get(slot.sessionId) : undefined;
    let state: TrackedSlotState = "pending";
    if (!slot || slot.status === "cancelled" || session?.status === "Cancelled") state = "cancelled";
    else if (isDone(session)) state = "done";
    else if (session?.status === "Completed") state = "no_data";
    return { planSlot: ps, slot, session, state, target: ps.targetGmv, forecast: forecasts[i] ?? 0, actual: session?.actualGmv ?? 0 };
  });
  const by = (st: TrackedSlotState) => slots.filter((t) => t.state === st);
  const done = by("done");
  const pending = [...by("pending"), ...by("no_data")];
  const sum = (xs: TrackedSlot[], f: (t: TrackedSlot) => number) => xs.reduce((a, t) => a + f(t), 0);
  const targetTotal = sum(slots, (t) => t.target);
  const actualDone = sum(done, (t) => t.actual);
  const targetDone = sum(done, (t) => t.target);
  const forecastDone = sum(done, (t) => t.forecast);
  const targetPending = sum(pending, (t) => t.target);
  const forecastPendingRaw = sum(pending, (t) => t.forecast);
  const runRate = targetDone > 0 ? actualDone / targetDone : null;
  const realityFactor = forecastDone > 0 && done.length >= 3 ? actualDone / forecastDone : null;
  // Không có dự báo (thiếu lịch sử) thì phần còn lại chiếu theo target × run-rate; có dự báo thì dự
  // báo × k. k chỉ tin khi đã ≥ 3 ca xong.
  const forecastPending = forecastPendingRaw > 0 ? forecastPendingRaw * (realityFactor ?? 1) : targetPending * (runRate ?? 1);

  // Ca ngoài kế hoạch: có số, không huỷ, và không phải ca mà một dòng kế hoạch nào đang trỏ tới.
  // Khoá theo session id chứ không theo ngày/giờ — ca thay thế sau khi huỷ thường lệch giờ.
  const plannedSessionIds = new Set(slots.map((t) => t.session?.id).filter((id): id is string => !!id));
  const offPlanSessions = brandMonthSessions.filter((s) => !plannedSessionIds.has(s.id) && isDone(s));
  const offPlanActual = offPlanSessions.reduce((a, s) => a + (s.actualGmv ?? 0), 0);

  const actualAll = actualDone + offPlanActual;
  const projected = actualAll + forecastPending;
  const gap = targetTotal - projected;
  const gapPct = targetTotal > 0 ? gap / targetTotal : 0;
  const remainingToTarget = Math.max(0, targetTotal - actualAll);
  return {
    targetTotal,
    slots,
    doneCount: done.length,
    pendingCount: by("pending").length,
    cancelledCount: by("cancelled").length,
    noDataCount: by("no_data").length,
    actualDone,
    targetDone,
    forecastDone,
    targetPending,
    forecastPending,
    targetLost: sum(by("cancelled"), (t) => t.target),
    runRate,
    realityFactor,
    offPlanSessions,
    offPlanCount: offPlanSessions.length,
    offPlanActual,
    actualAll,
    projected,
    gap,
    gapPct,
    requiredPerPending: pending.length > 0 ? remainingToTarget / pending.length : 0,
    avgActualDone: done.length > 0 ? actualDone / done.length : 0,
    upliftPct: pending.length > 0 && forecastPending > 0 ? (remainingToTarget - forecastPending) / forecastPending : null
  };
}

export interface FillPlan {
  result: SuggestResult;
  extraSlots: SuggestedSlot[];
  extraHours: number;
  coversGap: boolean;
}

// Phương án bù giờ: engine chế độ target với TOÀN BỘ ca kế hoạch là ca cố định, target = dự báo engine
// của lưới + phần thiếu (quy về thang engine bằng k) → ca xếp thêm chính là ca cần bù. Chỉ xếp từ hôm
// nay trở đi (engine tự lọc).
export function suggestFill(
  tracking: MonthTracking,
  history: HistorySummary,
  plan: BrandMonthPlan,
  month: string,
  today: string,
  ctx: EstimateCtx,
  params: EngineParams
): FillPlan | null {
  if (tracking.gap <= 0 || history.brandGmvPerHour <= 0) return null;
  const k = tracking.realityFactor ?? 1;
  const fixed = tracking.slots.filter((t) => t.state !== "cancelled").map((t) => ({ date: t.planSlot.date, startTime: t.planSlot.startTime, endTime: t.planSlot.endTime }));
  const forecastFixed = tracking.slots.filter((t) => t.state !== "cancelled").reduce((a, t) => a + t.forecast, 0);
  const result = suggestMonthPlan(history, {
    month,
    today,
    params,
    committedHours: 0,
    targetGmv: forecastFixed + tracking.gap / (k > 0 ? k : 1),
    mode: "target",
    camp: plan.campRanges,
    liveWindowStart: plan.liveWindowStart,
    liveWindowEnd: plan.liveWindowEnd,
    defaultSlotHours: plan.defaultSlotHours,
    maxSlotsPerDay: plan.maxSlotsPerDay,
    blackoutDates: plan.blackoutDates,
    fixedSlots: fixed,
    events: ctx.events,
    schemes: ctx.schemes,
    calibration: ctx.calibration,
    strategy: "max"
  });
  const fixedKeys = new Set(fixed.map((f) => `${f.date}|${f.startTime}|${f.endTime}`));
  const extraSlots = result.slots.filter((sl) => !fixedKeys.has(`${sl.date}|${sl.startTime}|${sl.endTime}`));
  if (extraSlots.length === 0) return null;
  return { result, extraSlots, extraHours: extraSlots.reduce((a, sl) => a + sl.hours, 0), coversGap: result.hoursToHitTarget !== null };
}

// ============ Benchmark cho ca sắp live ============

export interface SessionBenchmark {
  hours: number;
  expectedGmv: number; // đã nhân hệ số ngày (camp/lễ/scheme) + hiệu chỉnh
  gmvPerHour: number;
  viewsPerHour: number;
  expectedViews: number;
  conversion: number; // đơn / người xem
  expectedOrders: number;
  aov: number;
  liveCtr: number | null; // click sản phẩm / lượt xem — từ ca có file của brand cùng thứ
  adsPerHour: number | null; // từ report (adsCost) của brand
  dayFactor: number; // dự báo / (GMV-giờ nền × giờ) — >1 là ngày camp/lễ/scheme
  thin: boolean; // ô lịch sử mỏng (< 3 ca) → chỉ tham khảo
  cellTags: string[];
}

export function benchmarkForWindow(
  history: HistorySummary,
  brandSessions: LiveSession[],
  win: { date: string; startTime: string; endTime: string },
  ctx: EstimateCtx
): SessionBenchmark | null {
  if (history.brandGmvPerHour <= 0) return null;
  const hours = sessionDurationHours(win.startTime, win.endTime);
  if (hours <= 0) return null;
  const segs = cellsForWindow(history, win.date, win.startTime, win.endTime);
  let vph = 0, cvrW = 0, gmv = 0, orders = 0, hoursKnown = 0, n = 0;
  const tags = new Set<string>();
  for (const sg of segs) {
    if (!sg.cell) continue;
    vph += sg.cell.viewsPerHour * sg.hours;
    cvrW += sg.cell.conversion * sg.hours;
    gmv += sg.cell.gmv;
    orders += sg.cell.orders;
    hoursKnown += sg.hours;
    n = Math.max(n, sg.cell.n);
    tags.add(sg.cell.tag);
  }
  const expectedGmv = estimateSlots(history, [win], ctx)[0] ?? 0;
  const viewsPerHour = hoursKnown > 0 ? vph / hoursKnown : 0;
  const conversion = hoursKnown > 0 ? cvrW / hoursKnown : 0;
  const aov = orders > 0 ? gmv / orders : 0;
  const baseGph = hoursKnown > 0 ? segs.reduce((a, sg) => a + (sg.cell ? sg.cell.gmvPerHour * sg.hours : 0), 0) / hoursKnown : history.brandGmvPerHour;
  const dayFactor = baseGph > 0 ? expectedGmv / (baseGph * hours) : 1;
  // CTR live & ads: engine không học 2 chỉ số này → lấy trung vị từ ca có file/report của brand cùng thứ.
  const wd = new Date(`${win.date}T00:00:00`).getDay();
  const sameWd = brandSessions.filter((s) => s.status === "Completed" && new Date(`${s.date}T00:00:00`).getDay() === wd);
  const ctrs = sameWd.filter((s) => (s.productClicks ?? 0) > 0 && s.totalViews > 0).map((s) => (s.productClicks! / s.totalViews) * 100);
  const ads = brandSessions.filter((s) => s.status === "Completed" && (s.report?.adsCost ?? 0) > 0).map((s) => s.report!.adsCost! / Math.max(0.5, sessionHours(s)));
  const median = (xs: number[]) => { if (xs.length === 0) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const scaledViews = viewsPerHour * hours * Math.max(dayFactor, 1);
  return {
    hours,
    expectedGmv,
    gmvPerHour: hours > 0 ? expectedGmv / hours : 0,
    viewsPerHour: viewsPerHour * Math.max(dayFactor, 1),
    expectedViews: scaledViews,
    conversion,
    expectedOrders: scaledViews * conversion,
    aov,
    liveCtr: median(ctrs),
    adsPerHour: median(ads),
    dayFactor,
    thin: n < 3 || hoursKnown < hours * 0.5,
    cellTags: [...tags]
  };
}
