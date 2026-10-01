// Kế Hoạch Tháng — giai đoạn D: KẾ HOẠCH vs THỰC TẾ + tự hiệu chỉnh. Thuần.
//
// Mỗi ca kế hoạch đã chốt (0090) gắn ca thật qua slot_id → shift_slots.session_id → live_sessions.
// Ca thật có GMV đối soát → so với dự báo engine lưu lúc chốt (expected_gmv, 0092) và target ops
// đặt. Sai số gom theo ô thứ × khối giờ (cùng lưới với suggestEngine) thành hệ số hiệu chỉnh:
//   factor(ô) = (Σ thực tế + k·Σ dự báo) / ((1 + k)·Σ dự báo)  — kéo về 1 khi ít quan sát, clamp.
// Engine nhân hệ số này vào GMV/giờ kỳ vọng của ô ở tháng sau. Ca ops đặt tay (expected = 0)
// không tham gia hiệu chỉnh — không có gì để so.
import { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../../types";
import { BLOCK_HOURS } from "./suggestEngine";
import { DEFAULT_ENGINE_PARAMS, EngineParams } from "./engineParams";
import { isCountable } from "../performance/hostPerformance";

export interface PlanEvalRow {
  date: string;
  startTime: string;
  endTime: string;
  expectedGmv: number;
  targetGmv: number;
  actualGmv: number | null; // null = ca chưa diễn ra / chưa có số
  status: "done" | "pending" | "cancelled" | "unlinked";
  errorPct: number | null; // (thực tế − dự báo) / dự báo
}

export interface PlanEvaluation {
  rows: PlanEvalRow[];
  doneCount: number;
  expectedDone: number; // Σ dự báo của ca đã có thực tế VÀ có dự báo (expectedGmv > 0)
  // Σ thực tế của ĐÚNG tập ca nói trên — vế so được với `expectedDone`. `actualDone` là tổng của MỌI
  // ca đã xong nên lớn hơn, và đặt hai số đó cạnh nhau bằng dấu mũi tên là so hai tập khác nhau: phần
  // chênh phần lớn là ca ops đặt tay (expectedGmv = 0), vốn không có dự báo nào để mà sai. Nặng nhất
  // là brand chưa có lịch sử (Đ12 cold start): không ca nào có dự báo ⇒ "dự báo 0 → thực tế 3,5 tỷ".
  actualForecast: number;
  forecastCount: number; // số ca vừa đã có thực tế vừa có dự báo — mẫu số thật của `mape`/`bias`
  targetDone: number;
  actualDone: number;
  mape: number | null; // sai số tuyệt đối trung bình theo ca (chỉ ca có dự báo > 0)
  bias: number | null; // (Σ thực tế / Σ dự báo) − 1
}

export function evaluatePlan(planSlots: BrandMonthPlanSlot[], shiftSlots: ShiftSlot[], sessions: LiveSession[]): PlanEvaluation {
  const slotById = new Map(shiftSlots.map((s) => [s.id, s]));
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const rows: PlanEvalRow[] = planSlots.map((ps) => {
    const base = { date: ps.date, startTime: ps.startTime, endTime: ps.endTime, expectedGmv: ps.expectedGmv, targetGmv: ps.targetGmv };
    const slot = ps.slotId ? slotById.get(ps.slotId) : undefined;
    if (!slot) return { ...base, actualGmv: null, status: "unlinked", errorPct: null };
    if (slot.status === "cancelled") return { ...base, actualGmv: null, status: "cancelled", errorPct: null };
    const session = slot.sessionId ? sessionById.get(slot.sessionId) : undefined;
    if (!session || session.status === "Cancelled") return { ...base, actualGmv: null, status: session ? "cancelled" : "pending", errorPct: null };
    // Cùng định nghĩa "ca có số" với mọi màn (isCountable) — ca đã up file mà bán 0 là kết quả thật, không phải "chờ".
    if (!isCountable(session)) return { ...base, actualGmv: null, status: "pending", errorPct: null };
    const err = ps.expectedGmv > 0 ? (session.actualGmv - ps.expectedGmv) / ps.expectedGmv : null;
    return { ...base, actualGmv: session.actualGmv, status: "done", errorPct: err };
  });
  const done = rows.filter((r) => r.status === "done");
  const withForecast = done.filter((r) => r.expectedGmv > 0);
  const expectedDone = withForecast.reduce((a, r) => a + r.expectedGmv, 0);
  const actualForecastable = withForecast.reduce((a, r) => a + (r.actualGmv ?? 0), 0);
  return {
    rows,
    doneCount: done.length,
    expectedDone,
    actualForecast: actualForecastable,
    forecastCount: withForecast.length,
    targetDone: done.reduce((a, r) => a + r.targetGmv, 0),
    actualDone: done.reduce((a, r) => a + (r.actualGmv ?? 0), 0),
    mape: withForecast.length > 0 ? withForecast.reduce((a, r) => a + Math.abs(r.errorPct ?? 0), 0) / withForecast.length : null,
    bias: expectedDone > 0 ? actualForecastable / expectedDone - 1 : null
  };
}

export interface Calibration {
  factors: Map<string, number>; // "weekday|block" → hệ số
  observations: number; // số ca đã có thực tế tham gia
  overallBias: number | null;
}

export const calibrationKey = (weekday: number, block: number) => `${weekday}|${block}`;

// Gom mọi ca kế hoạch có dự báo + thực tế (nhiều tháng) → hệ số theo ô. GMV của ca rải đều theo phút
// vào các khối nó phủ, giống buildHistory, để cùng một ca dài 6h không chỉ hiệu chỉnh 1 ô.
export function buildCalibration(evals: PlanEvaluation[], params: EngineParams = DEFAULT_ENGINE_PARAMS): Calibration {
  const acc = new Map<string, { expected: number; actual: number; n: number }>();
  let obs = 0;
  let sumE = 0;
  let sumA = 0;
  for (const ev of evals) {
    for (const r of ev.rows) {
      if (r.status !== "done" || r.expectedGmv <= 0 || r.actualGmv === null) continue;
      obs += 1;
      sumE += r.expectedGmv;
      sumA += r.actualGmv;
      const wd = new Date(`${r.date}T00:00:00`).getDay();
      const [sh, sm] = r.startTime.split(":").map(Number);
      const [eh, em] = r.endTime.split(":").map(Number);
      let cur = sh * 60 + sm;
      let end = eh * 60 + em;
      // Chỉ ca QUA ĐÊM THẬT (end < start) mới cộng 24h — đúng quy ước FIX L8 / `sessionDurationHours`
      // của cả app. Bản cũ dùng `end <= cur` nên ca có giờ kết thúc = giờ bắt đầu bị coi là ca dài 24h
      // và rải hệ số hiệu chỉnh ra 13 ô, tràn sang cả thứ hôm sau. `validateDrafts` chặn ca kiểu đó ở
      // lưới nên đây là phòng thủ, không phải lỗ đang hở — nhưng một dòng hỏng lọt vào thì nó bẻ engine
      // của hai ngày, nên không để `<=`. Ca 0 giờ giờ không vào vòng lặp (cur < end sai ngay).
      if (end < cur) end += 24 * 60;
      const total = end - cur;
      while (cur < end) {
        const blockEnd = (Math.floor(cur / (BLOCK_HOURS * 60)) + 1) * BLOCK_HOURS * 60;
        const seg = Math.min(blockEnd, end) - cur;
        const frac = seg / total;
        const block = Math.floor((cur % (24 * 60)) / (BLOCK_HOURS * 60));
        const key = calibrationKey(cur >= 24 * 60 ? (wd + 1) % 7 : wd, block);
        const c = acc.get(key) ?? { expected: 0, actual: 0, n: 0 };
        c.expected += r.expectedGmv * frac;
        c.actual += r.actualGmv * frac;
        c.n += frac;
        acc.set(key, c);
        cur += seg;
      }
    }
  }
  const factors = new Map<string, number>();
  for (const [key, c] of acc) {
    if (c.expected <= 0) continue;
    // shrink về 1 theo số quan sát (n theo phần ca), clamp.
    const raw = c.actual / c.expected;
    const f = (c.n * raw + params.calibrationK * 1) / (c.n + params.calibrationK);
    factors.set(key, Math.min(params.calibrationMax, Math.max(params.calibrationMin, f)));
  }
  return { factors, observations: obs, overallBias: sumE > 0 ? sumA / sumE - 1 : null };
}
