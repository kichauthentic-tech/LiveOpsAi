import type { LiveSession } from "../../types";
import type { SnapshotRoomRow } from "./extractRooms";
import { sessionMinutes } from "../staffSegments";

// Chọn PHÒNG của ca khi up file Creator-Live-Performance. File tải về là cả một NGÀY: mỗi dòng một Room ID, gồm phòng của
// mọi ca trong ngày (và một ca bị tắt/bật lại stream thì TikTok tách thành nhiều Room ID liền nhau). Room Title gần như
// luôn trống nên không dùng để nhận ra phòng — chỉ có Room ID, giờ bắt đầu/kết thúc và số liệu. Trợ tick đúng phòng của ca
// mình trước khi gửi; client chỉ gửi các dòng đã tick nên DB không phải đoán.
//
// Quy tắc "phòng này có thể thuộc ca" CÙNG LUẬT với session_room_deltas (0078/0124): phòng kết thúc sau giờ vào ca (hoặc chưa
// kết thúc) và bắt đầu trước giờ cuối cửa sổ. Phòng ngoài cửa sổ DB sẽ bỏ qua nên picker không cho tick.

export interface SessionWindow {
  startMs: number;
  endMs: number;
}

/** Cửa sổ giờ của ca (giờ Việt Nam). untilMin: cắt ở phút thứ N kể từ giờ vào ca (số lúc đổi host). */
export function sessionWindow(s: Pick<LiveSession, "date" | "startTime" | "endTime">, untilMin?: number): SessionWindow {
  const startMs = Date.parse(`${s.date}T${s.startTime.slice(0, 5)}:00+07:00`);
  const dur = untilMin ?? sessionMinutes(s);
  return { startMs, endMs: startMs + dur * 60000 };
}

export interface RoomChoice {
  row: SnapshotRoomRow;
  /** Giao với cửa sổ ca — DB mới tính phòng này cho ca. */
  inWindow: boolean;
  /** Phút phòng nằm TRONG cửa sổ ca. */
  overlapMin: number;
  /** Phần của phòng nằm trong ca (0..1). Thấp = phòng chủ yếu thuộc ca khác, chỉ chạm rìa ca này. */
  overlapShare: number;
  /** Nên tick sẵn: nằm trong ca và phần lớn thời lượng thuộc ca này. */
  suggested: boolean;
}

/** Phòng chạm rìa ca (< 50% thời lượng nằm trong ca) mặc định KHÔNG tick: nếu ca kề đó chưa up file thì số cả phòng
 *  sẽ bị tính hết cho ca này. */
export function classifyRooms(rows: SnapshotRoomRow[], win: SessionWindow, now = Date.now()): RoomChoice[] {
  return rows
    .map((row) => {
      const start = row.startedAt ? Date.parse(row.startedAt) : NaN;
      const end = row.endedAt ? Date.parse(row.endedAt) : now; // chưa kết thúc = đang live
      const inWindow = (!row.endedAt || end >= win.startMs) && (!Number.isFinite(start) || start <= win.endMs);
      const s = Number.isFinite(start) ? start : win.startMs;
      const overlapMs = Math.max(Math.min(end, win.endMs) - Math.max(s, win.startMs), 0);
      const total = Math.max(end - s, 1);
      const overlapShare = inWindow ? Math.min(overlapMs / total, 1) : 0;
      return { row, inWindow, overlapMin: Math.round(overlapMs / 60000), overlapShare, suggested: inWindow && overlapShare >= 0.5 };
    })
    .sort((a, b) => (Date.parse(a.row.startedAt ?? "") || 0) - (Date.parse(b.row.startedAt ?? "") || 0));
}

export interface RoomTotals {
  rooms: number;
  gmv: number;
  orders: number;
  views: number;
}

export function sumRooms(rows: Pick<SnapshotRoomRow, "gmv" | "orders" | "views">[]): RoomTotals {
  return rows.reduce<RoomTotals>((t, r) => ({ rooms: t.rooms + 1, gmv: t.gmv + r.gmv, orders: t.orders + r.orders, views: t.views + r.views }), { rooms: 0, gmv: 0, orders: 0, views: 0 });
}

/** 7693524082461739797 ⇒ "…9797" — đủ để trợ đối chiếu với dashboard. */
export const shortRoomId = (id: string) => `…${id.slice(-4)}`;
