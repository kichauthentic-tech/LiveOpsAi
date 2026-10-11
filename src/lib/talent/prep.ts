import type { LiveSession } from "../../types";
import { getCampaignDayInfo } from "../campaignDays";
import { sessionWindowMs } from "../sessionStatus";

// "Chuẩn bị ca" trên thẻ ca kế tiếp của app talent (T2, 11/10). Chỉ dùng thứ có số thật — đo 11/10 trên DB: 0 SKU, 0 chương
// trình khuyến mãi, 1/347 ca 30 ngày qua có ghi chú giao ca ⇒ KHÔNG dựng phần "sản phẩm lên live / ghi chú ca trước" (sẽ luôn
// trống). Có số: loại ngày camp (lịch cố định), target ca (58/257 ca sắp tới), ca trước cùng kênh có GMV trong 7 ngày (109/257),
// ca trước trong cùng phòng cùng ngày.

export interface ShiftPrep {
  /** Nhãn ngắn của ngày camp theo lịch cố định (talent không đọc được khung camp riêng của Kế Hoạch Tháng — RLS 0105). */
  campDay: string | null;
  /** Ca gần nhất TRƯỚC ca này của cùng brand × sàn (không cộng TikTok với Shopee) đã có GMV. */
  prevSameChannel: LiveSession | null;
  /** Ca kết thúc gần nhất trước giờ vào ca, cùng phòng, cùng ngày — để biết phòng rảnh từ mấy giờ. */
  roomBefore: LiveSession | null;
}

export function shiftPrep(s: LiveSession, sessions: LiveSession[]): ShiftPrep {
  const start = sessionWindowMs(s)[0];
  let prev: LiveSession | null = null;
  let prevStart = -Infinity;
  let room: LiveSession | null = null;
  let roomEnd = -Infinity;
  for (const o of sessions) {
    if (o.id === s.id || o.status === "Cancelled") continue;
    const [oStart, oEnd] = sessionWindowMs(o);
    if (o.brandId === s.brandId && o.platform === s.platform && oStart < start && o.actualGmv > 0 && oStart > prevStart) {
      prev = o;
      prevStart = oStart;
    }
    if (s.studioId && o.studioId === s.studioId && o.date === s.date && oEnd <= start && oEnd > roomEnd) {
      room = o;
      roomEnd = oEnd;
    }
  }
  return { campDay: getCampaignDayInfo(s.date)?.shortLabel ?? null, prevSameChannel: prev, roomBefore: room };
}
