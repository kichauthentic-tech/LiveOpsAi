import type { LiveSession, ShiftSlot } from "../../types";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { addDays } from "../dateUtils";
import { buildHistory, suggestMonthPlan, type SuggestedSlot } from "./suggestEngine";
import { settingsFromHistory, slotHours } from "./monthPlanGrid";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "./engineParams";
import { buildMonthForecaster, slotForecasts } from "../performance/monthForecast";
import { resolveCampBucketType } from "../campaignDays";

// Ca tăng cường "Thêm ca" ở Điều Phối Lịch Live (06/11, user: "tăng cường thì lần lượt các ca kia vẫn được gợi ý đúng không?"): trước
// đây chọn ngày ít ca nhất + giờ mặc định 19:00, không theo hiệu suất. Giờ dùng CÙNG bộ xếp ca của Kế Hoạch Tháng: lịch đang có của kênh
// trong tháng là ca cố định, xin thêm đúng MỘT ca ⇒ engine trả ca có điểm biên cao nhất còn trống (ngày Campaign thiếu khuôn giờ trước,
// rồi khung tốt nhất của ngày Daily, rải tuần). Khung giờ / ca mỗi ngày / độ dài ca theo lịch thật 60 ngày (`settingsFromHistory`).
// Từ ngày mai (ca hôm nay không kịp mở người). Không có lịch sử ⇒ null, nơi gọi giữ cách cũ.

const BASE = { liveWindowStart: "09:00", liveWindowEnd: "23:00", maxSlotsPerDay: 3, defaultSlotHours: 3 };

export function suggestNextShift(
  sessions: readonly LiveSession[],
  shiftSlots: readonly ShiftSlot[],
  brandId: string,
  platform: ReportPlatform,
  month: string,
  today: string,
  params: EngineParams = DEFAULT_ENGINE_PARAMS
): SuggestedSlot | null {
  const mine = sessions.filter((s) => s.brandId === brandId && platformOf(s) === platform);
  const history = buildHistory(mine, brandId, today, { params });
  if (history.brandGmvPerHour <= 0) return null;
  const from = addDays(today, -60);
  const settings = settingsFromHistory(BASE, mine.filter((s) => s.status !== "Cancelled" && s.date >= from && s.date <= today));
  const inMonth = (d: string) => d.slice(0, 7) === month;
  const fixed = [
    ...mine.filter((s) => inMonth(s.date) && s.status !== "Cancelled"),
    ...shiftSlots.filter((sl) => sl.brandId === brandId && platformOf(sl) === platform && inMonth(sl.date) && sl.status === "open" && !sl.sessionId)
  ].map((x) => ({ date: x.date, startTime: x.startTime, endTime: x.endTime }));
  const hours = fixed.reduce((a, f) => a + slotHours(f), 0) + settings.defaultSlotHours;
  const r = suggestMonthPlan(history, {
    month,
    today: addDays(today, 1),
    committedHours: hours,
    targetGmv: 0,
    mode: "hours",
    liveWindowStart: settings.liveWindowStart,
    liveWindowEnd: settings.liveWindowEnd,
    defaultSlotHours: settings.defaultSlotHours,
    maxSlotsPerDay: settings.maxSlotsPerDay,
    fixedSlots: fixed,
    params
  });
  const taken = new Set(fixed.map((f) => `${f.date}|${f.startTime}|${f.endTime}`));
  // Ca cắt ngắn cho vừa giờ (< ca chuẩn) không phải gợi ý tốt — chỉ nhận ca đủ dài.
  const pick = r.slots.find((s) => !s.fixed && !taken.has(`${s.date}|${s.startTime}|${s.endTime}`) && s.hours >= settings.defaultSlotHours - 0.01);
  if (!pick) return null;
  // Số hiện cho người dùng theo engine v3 (cùng con số với Kế Hoạch Tháng — quy ước "một con số" 06/11); bộ xếp ca chỉ chọn giờ.
  const f = buildMonthForecaster(mine, month, params);
  const v3 = f ? slotForecasts(f, [pick], (d) => resolveCampBucketType(d))[0] : undefined;
  return v3 && v3 > 0 ? { ...pick, expectedGmv: v3 } : pick;
}
