import { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../../types";
import { addDays, eachDay } from "../dateUtils";
import { CampDayBucket, CampOverrides, CAMP_DAY_BUCKET_ORDER, resolveCampBucketType } from "../campaignDays";
import { dataSourceTier } from "../dataSource";
import { isCountable } from "./hostPerformance";
import { lastDataDate, monthEndOf, MonthOutlook } from "./ceoBrief";

// Run-rate theo PLAN BAN ĐẦU — luật user chốt 2026-09-28, MỘT hàm cho mọi màn (Dashboard brand, Report
// Tháng/Tuần, Hỗ Trợ Vận Hành cũ). Trước đó có 4 cách tính khác nhau và ra 4 số khác nhau.
//
//   Target        = tổng target các ca của Kế Hoạch Tháng đã chốt (`brand_month_plan_slots.target_gmv`).
//                   KHÔNG chia lại theo khung, KHÔNG phân bổ lại khi lịch đổi.
//   Target tới nay = Σ target ca kế hoạch có ngày ≤ ngày cuối có số.
//   Run-rate      = Σ thực đạt (mọi ca có số tới ngày đó) ÷ target tới nay.
//
//   - Ca kế hoạch bị huỷ GIỮ target trong mẫu số — bỏ đi thì huỷ ca lại làm run-rate đẹp lên.
//   - Ca kế hoạch mất liên kết (xoá ca chờ đăng ký ⇒ slot_id về null) cũng GIỮ target — lỗi E2E 28/09:
//     lọc `slot_id is not null` làm target tháng tụt từ 100M xuống 14,7M.
//   - Ca mở thêm ngoài plan: cộng vào thực đạt, target = 0 (cho nó target mới thì thêm ca bù lại làm
//     run-rate xấu đi, và tổng target phình quá con số đã hứa với brand).
//   - Cùng luật cho tháng, từng khung ngày (D-Day / Mid-Month / Pay Day / ngày thường) và từng ca.

export type PlanSlotState = "done" | "no_data" | "pending" | "cancelled";

export interface PlanRunRateSlot {
  planSlot: BrandMonthPlanSlot;
  session?: LiveSession;
  state: PlanSlotState;
  bucket: CampDayBucket;
  target: number;
  actual: number;
  /** Thực đạt ÷ target của ca — chỉ khi ca đã có số và có target. */
  pctTarget: number | null;
}

export interface RunRateLine {
  target: number;
  targetToDate: number;
  actual: number;
  runRate: number | null;
}

export interface BucketRunRate extends RunRateLine {
  bucket: CampDayBucket;
  days: string[];
  daysPassed: number;
  status: "done" | "live" | "next" | "none";
  slotCount: number;
  slotCountToDate: number;
}

export interface PlanRunRate {
  month: string;
  /** Ngày cuối có số trong tháng; null = tháng chưa có số. */
  through: string | null;
  total: RunRateLine & {
    pctTarget: number | null;
    /** Cuối tháng nếu phần target còn lại cũng đạt đúng run-rate hiện tại. */
    keepPace: number | null;
    remainingDays: number;
    needPerRemainingDay: number | null;
  };
  buckets: BucketRunRate[];
  slots: PlanRunRateSlot[];
  offPlan: { session: LiveSession; bucket: CampDayBucket }[];
  offPlanActual: number;
  cancelledCount: number;
  cancelledTargetToDate: number;
  noDataCount: number;
  targetByDate: Map<string, number>;
  actualByDate: Map<string, number>;
}

const hhmm = (t: string) => (t || "").slice(0, 5);

export function planRunRate(
  month: string,
  planSlots: BrandMonthPlanSlot[],
  shiftSlots: ShiftSlot[],
  /** Mọi ca của ĐÚNG brand (đã bỏ ca `excludedFromReports`) — hàm tự lọc theo tháng. */
  brandSessions: LiveSession[],
  today: string,
  camp?: CampOverrides
): PlanRunRate {
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const days = eachDay(mStart, mEnd);
  const bucketOf = (d: string) => resolveCampBucketType(d, camp);
  const inMonth = brandSessions.filter((s) => s.date >= mStart && s.date <= mEnd);
  const through = lastDataDate(inMonth, today);
  const slotById = new Map(shiftSlots.map((sl) => [sl.id, sl]));
  const sessionById = new Map(inMonth.map((s) => [s.id, s]));
  const plan = planSlots.filter((ps) => ps.date >= mStart && ps.date <= mEnd);

  // Nối ca kế hoạch → ca thật: qua shift_slot trước; ca kế hoạch đã mất shift_slot thì khớp ngày + giờ
  // với một ca chưa ai nhận (để ca đó không bị đếm nhầm thành "ngoài kế hoạch").
  const used = new Set<string>();
  const linked = plan.map((ps) => {
    const sl = ps.slotId ? slotById.get(ps.slotId) : undefined;
    const s = sl?.sessionId ? sessionById.get(sl.sessionId) : undefined;
    if (s) used.add(s.id);
    return { ps, sl, s };
  });
  for (const x of linked) {
    if (x.s || (x.sl && x.sl.status !== "cancelled")) continue;
    const m = inMonth.find((s) => !used.has(s.id) && s.date === x.ps.date && hhmm(s.startTime) === hhmm(x.ps.startTime) && hhmm(s.endTime) === hhmm(x.ps.endTime));
    if (m) {
      x.s = m;
      used.add(m.id);
    }
  }

  const upTo = (d: string) => through != null && d <= through;
  const slots: PlanRunRateSlot[] = linked.map(({ ps, sl, s }) => {
    let state: PlanSlotState;
    if (s?.status === "Cancelled" || (!s && sl?.status === "cancelled")) state = "cancelled";
    else if (s && isCountable(s)) state = "done";
    // Ca của HÔM NAY chưa Completed là ca chưa tới/đang chạy, không phải "đã qua mà chưa có số" (hôm nay vốn không tính vào ngày đủ số).
    else if ((upTo(ps.date) && ps.date < today) || s?.status === "Completed") state = "no_data";
    else state = "pending";
    const actual = state === "done" ? s?.actualGmv ?? 0 : 0;
    const target = Math.max(0, ps.targetGmv || 0);
    return { planSlot: ps, session: s, state, bucket: bucketOf(ps.date), target, actual, pctTarget: state === "done" && target > 0 ? actual / target : null };
  });

  const offPlan = inMonth.filter((s) => !used.has(s.id) && isCountable(s)).map((session) => ({ session, bucket: bucketOf(session.date) }));
  const countable = inMonth.filter((s) => isCountable(s) && upTo(s.date));
  const actualByDate = new Map<string, number>();
  for (const s of countable) actualByDate.set(s.date, (actualByDate.get(s.date) ?? 0) + (s.actualGmv ?? 0));
  const targetByDate = new Map<string, number>(days.map((d) => [d, 0]));
  for (const t of slots) targetByDate.set(t.planSlot.date, (targetByDate.get(t.planSlot.date) ?? 0) + t.target);

  const line = (keep: (date: string) => boolean): RunRateLine => {
    const target = slots.filter((t) => keep(t.planSlot.date)).reduce((a, t) => a + t.target, 0);
    const targetToDate = slots.filter((t) => keep(t.planSlot.date) && upTo(t.planSlot.date)).reduce((a, t) => a + t.target, 0);
    const actual = countable.filter((s) => keep(s.date)).reduce((a, s) => a + (s.actualGmv ?? 0), 0);
    return { target, targetToDate, actual, runRate: targetToDate > 0 ? actual / targetToDate : null };
  };

  const all = line(() => true);
  const from = through && through >= today ? addDays(through, 1) : today;
  const remainingDays = from > mEnd ? 0 : from < mStart ? days.length : days.filter((d) => d >= from).length;
  const buckets: BucketRunRate[] = CAMP_DAY_BUCKET_ORDER.map((b) => {
    const bd = days.filter((d) => bucketOf(d) === b);
    const l = line((d) => bucketOf(d) === b);
    const inB = slots.filter((t) => t.bucket === b);
    const status: BucketRunRate["status"] = bd.length === 0 ? "none" : through && bd[bd.length - 1] <= through ? "done" : !through || bd[0] > through ? "next" : "live";
    return { ...l, bucket: b, days: bd, daysPassed: bd.filter(upTo).length, status, slotCount: inB.length, slotCountToDate: inB.filter((t) => upTo(t.planSlot.date)).length };
  });

  const cancelled = slots.filter((t) => t.state === "cancelled");
  return {
    month,
    through,
    total: {
      ...all,
      pctTarget: all.target > 0 ? all.actual / all.target : null,
      keepPace: all.runRate != null ? all.actual + (all.target - all.targetToDate) * all.runRate : null,
      remainingDays,
      needPerRemainingDay: all.target > 0 && remainingDays > 0 ? Math.max(0, all.target - all.actual) / remainingDays : null
    },
    buckets,
    slots,
    offPlan,
    offPlanActual: offPlan.reduce((a, x) => a + (x.session.actualGmv ?? 0), 0),
    cancelledCount: cancelled.length,
    cancelledTargetToDate: cancelled.filter((t) => upTo(t.planSlot.date)).reduce((a, t) => a + t.target, 0),
    noDataCount: slots.filter((t) => t.state === "no_data").length,
    targetByDate,
    actualByDate
  };
}

// ---------------------------------------------------------------------------
// Run-rate "tới ca mới nhất có số" (11/10/2026, user chọn: nhập tới đâu cập nhật tới đó)
// ---------------------------------------------------------------------------
//   - Ngày ≤ ngày đủ số (≥ 90% giờ ca có số): luật cũ — target CẢ NGÀY, ca chưa có số vẫn nằm trong mẫu số.
//   - Ngày > ngày đủ số: mỗi ca có số được so với target ĐÚNG CA đó (ca sáng 78M ⇒ chia target ca sáng, không chia target cả
//     ngày). Ca chưa có số / ca huỷ của những ngày này chưa vào mẫu số — chúng đang chờ, không phải kéo run-rate xuống.
//   - Ca mở thêm ngoài plan: cộng thực đạt, target 0 (như mọi nơi).
// Hàm thuần của (rr, completeThrough): sửa report của ca, đối soát (đổi số / đổi bậc nguồn), loại ca khỏi report, gộp ca restart
// đều đổi `brandSessions` ⇒ planRunRate dựng lại ⇒ ca vào / ra / đổi số tự nhiên, không có bản lưu nào để lệch.

export interface LiveRunRate {
  /** Ngày đủ số đang dùng làm mốc (null = chưa ngày nào đủ ⇒ mọi ca có số đều tính theo ca). */
  completeThrough: string | null;
  /** Ngày cuối có số (kể cả hôm nay) — null = tháng chưa có số. */
  lastDate: string | null;
  /** Ca có số muộn nhất (ngày + giờ kết thúc) — nhãn "tới ca …". */
  lastShift: { date: string; startTime: string; endTime: string } | null;
  actual: number;
  expected: number;
  runRate: number | null;
  /** Target dùng làm mẫu số theo từng ngày: ≤ ngày đủ số = target cả ngày; sau đó = target các ca đã có số. */
  expectedByDate: Map<string, number>;
  /** Số ca có số nằm SAU ngày đủ số (đã vào run-rate theo ca) và trong đó bao nhiêu ca chưa đối soát. */
  tailShifts: number;
  tailUnreconciled: number;
}

export function runRateLive(rr: PlanRunRate, completeThrough: string | null): LiveRunRate {
  const cut = completeThrough;
  const afterCut = (d: string) => cut == null || d > cut;
  const expectedByDate = new Map<string, number>();
  for (const [d, v] of rr.targetByDate) if (!afterCut(d)) expectedByDate.set(d, v);
  let lastShift: LiveRunRate["lastShift"] = null;
  const seen = (date: string, startTime: string, endTime: string) => {
    if (!lastShift || date + hhmm(endTime) > lastShift.date + hhmm(lastShift.endTime)) lastShift = { date, startTime: hhmm(startTime), endTime: hhmm(endTime) };
  };
  let tailShifts = 0, tailUnreconciled = 0;
  for (const t of rr.slots) {
    if (t.state !== "done" || !t.session) continue;
    seen(t.planSlot.date, t.planSlot.startTime, t.planSlot.endTime);
    if (afterCut(t.planSlot.date)) {
      expectedByDate.set(t.planSlot.date, (expectedByDate.get(t.planSlot.date) ?? 0) + t.target);
      tailShifts++;
      if (dataSourceTier(t.session) !== "reconciled") tailUnreconciled++;
    }
  }
  for (const x of rr.offPlan) {
    seen(x.session.date, x.session.startTime, x.session.endTime);
    if (afterCut(x.session.date)) {
      tailShifts++;
      if (dataSourceTier(x.session) !== "reconciled") tailUnreconciled++;
    }
  }
  let actual = 0, expected = 0;
  for (const v of rr.actualByDate.values()) actual += v;
  for (const v of expectedByDate.values()) expected += v;
  return { completeThrough: cut, lastDate: rr.through, lastShift, actual, expected, runRate: expected > 0 ? actual / expected : null, expectedByDate, tailShifts, tailUnreconciled };
}

/**
 * Ca kế hoạch đã qua mà chưa có số, tách theo mốc ngày đủ số: ngày ≤ mốc = VẪN trong mẫu số (target cả ngày) nên kéo run-rate
 * xuống; ngày sau mốc = đang chờ số, CHƯA vào mẫu số (runRateLive). `completeThrough` undefined = luật cũ (mọi ca đều trong mẫu số).
 */
export function noDataSplit(rr: Pick<PlanRunRate, "slots">, completeThrough: string | null | undefined): { inDenominator: number; waiting: number } {
  let inDenominator = 0, waiting = 0;
  for (const t of rr.slots) {
    if (t.state !== "no_data") continue;
    if (completeThrough === undefined || (completeThrough != null && t.planSlot.date <= completeThrough)) inDenominator++;
    else waiting++;
  }
  return { inDenominator, waiting };
}

export interface MonthEndProjection {
  value: number | null;
  /** gmv_per_hour = giờ ca còn trong lịch × GMV/giờ 28 ngày (cách Bản Tin CEO, backtest T7–T8 lệch −7…+8%);
   *  run_rate = brand chưa có ca nào trong 28 ngày ⇒ phần target còn lại × run-rate hiện tại; none = chưa có gì để chiếu. */
  method: "gmv_per_hour" | "run_rate" | "none";
}

/**
 * Dự kiến cuối tháng — MỘT công thức cho Dashboard brand, khối Hỗ Trợ Vận Hành, Report Tháng/Tuần và Bản Tin CEO
 * (audit 2026-09-28 mục 3: cùng trang Dashboard từng hiện "Nếu giữ run-rate" và "Dự kiến cuối tháng" ra hai số).
 * `outlook` = monthOutlook của đúng brand + tháng. Không có GMV/giờ 28 ngày thì monthOutlook chỉ còn "số đã có"
 * (lỗi E2E #4: "Dự kiến 0 · Thiếu 100%") — khi đó rơi về giữ run-rate, và nói rõ đang dùng cách nào.
 */
export function projectMonthEnd(rr: PlanRunRate | null, outlook: Pick<MonthOutlook, "projected" | "projectionMethod"> | null): MonthEndProjection {
  if (outlook && outlook.projectionMethod === "gmv_per_hour") return { value: outlook.projected, method: "gmv_per_hour" };
  if (rr?.total.keepPace != null) return { value: rr.total.keepPace, method: "run_rate" };
  return { value: null, method: "none" };
}

export const PROJECTION_METHOD_LABEL: Record<MonthEndProjection["method"], string> = {
  gmv_per_hour: "giờ các ca còn trong lịch × GMV/giờ 28 ngày gần nhất (cùng cách Dashboard agency)",
  run_rate: "chưa có GMV/giờ 28 ngày ⇒ phần target còn lại × run-rate hiện tại",
  none: "chưa có số để chiếu"
};
