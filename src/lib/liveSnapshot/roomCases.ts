import type { SnapshotRoomRow } from "./extractRooms";

// Hai trường hợp room ≠ ca (user chốt 08/10, migration 0153):
//  • CA NỐI — 1 room chạy qua nhiều ca. Ca trước (A) đánh dấu "nối" và chọn ĐÚNG ca sau (B) đã có trên lịch; số của B = số cộng
//    dồn của room − snapshot của chính A.
//  • CA BỊ NGẮT ROOM — 1 ca có nhiều room (tắt/bật lại stream). Mỗi lần ngắt là một "mảnh" kèm lý do; số ca = tổng mọi room.
// File này chỉ có logic thuần (nhãn, đếm, cảnh báo) — phép trừ nằm trong DB (view session_room_deltas).

export type BreakReason = "network" | "manual_restart" | "device_change" | "platform_cut" | "test_room" | "other";

export const BREAK_REASONS: { key: BreakReason; label: string; hint: string }[] = [
  { key: "network", label: "Rớt mạng / app crash", hint: "Máy treo, mất wifi — TikTok đóng room, bật lại ra Room ID mới" },
  { key: "manual_restart", label: "Tắt bật lại có chủ ý", hint: "Nghỉ giữa giờ, đổi cảnh, sửa tiêu đề/thumbnail" },
  { key: "device_change", label: "Đổi thiết bị / tài khoản", hint: "Đổi máy live hoặc người đăng nhập" },
  { key: "platform_cut", label: "TikTok cắt live", hint: "Cảnh báo vi phạm, lỗi kỹ thuật phía TikTok" },
  { key: "test_room", label: "Live thử trước giờ", hint: "Room test vài phút trước khi vào ca" },
  { key: "other", label: "Lý do khác", hint: "Ghi chú thêm bên dưới" }
];

export const breakReasonLabel = (r: string): string => BREAK_REASONS.find((x) => x.key === r)?.label ?? r;

export interface RoomSpan {
  roomId: string;
  startedAt?: string;
  endedAt?: string;
}

/** Tổng phút NGHỈ giữa các room liên tiếp của một ca (khoảng giữa lúc room trước kết thúc và room sau bắt đầu). Room chồng
 *  giờ không tạo khoảng nghỉ âm. Room thiếu mốc giờ bị bỏ qua. Giờ live của ca vẫn là tổng thời lượng từng room — số này chỉ để
 *  hiển thị "gián đoạn X phút". */
export function roomGapMinutes(rooms: RoomSpan[]): number {
  const spans = rooms
    .map((r) => ({ s: r.startedAt ? Date.parse(r.startedAt) : NaN, e: r.endedAt ? Date.parse(r.endedAt) : NaN }))
    .filter((x) => Number.isFinite(x.s) && Number.isFinite(x.e))
    .sort((a, b) => a.s - b.s);
  let gap = 0;
  let reach = spans.length > 0 ? spans[0].e : 0;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].s > reach) gap += spans[i].s - reach;
    reach = Math.max(reach, spans[i].e);
  }
  return Math.round(gap / 60000);
}

/** Số lần restart nên điền sẵn ở form giao ca: số lần ngắt đã ghi nhận, hoặc số room − 1 nếu file có nhiều room. Chỉ là GỢI Ý —
 *  trợ vẫn xác nhận/sửa. */
export function suggestedRestartCount(partCount: number, roomCount: number): number {
  return Math.max(partCount, roomCount - 1, 0);
}

export interface PrevBaseline {
  /** Giờ kết thúc ca trước (ms). */
  boundaryMs: number;
  /** Room có trong snapshot của ca trước. */
  roomIds: string[];
}

/** Ca nối: phòng đã tick bắt đầu TRƯỚC giờ hết ca trước mà snapshot ca trước không có ⇒ phép trừ không có gì để trừ, ca này sẽ
 *  nhận cả phòng. Hay gặp khi trợ ca trước quên tick phòng. Trả các phòng nghi ngờ để cảnh báo. */
export function roomsMissingFromPrev(picked: Pick<SnapshotRoomRow, "roomId" | "startedAt">[], prev: PrevBaseline): string[] {
  const known = new Set(prev.roomIds);
  return picked
    .filter((r) => {
      const start = r.startedAt ? Date.parse(r.startedAt) : NaN;
      return Number.isFinite(start) && start < prev.boundaryMs && !known.has(r.roomId);
    })
    .map((r) => r.roomId);
}

export type LinkStatus = "none" | "ready" | "waiting";

/** Trạng thái ca B nối từ A: waiting = A chưa có snapshot (số của B bị khoá, DB không ghi). */
export function nextLinkStatus(hasPrevLink: boolean, prevHasSnapshot: boolean): LinkStatus {
  if (!hasPrevLink) return "none";
  return prevHasSnapshot ? "ready" : "waiting";
}
