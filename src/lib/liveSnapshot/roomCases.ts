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

// ---------------------------------------------------------------------------------------------------------------------------
// Phân loại room theo vai trong ca + dải chuỗi ca trong ngày (đề xuất 11/10, số đo T6–T10: 55% ranh giới ca liền kề là ca nối,
// khoảng nghỉ restart trung vị 4,8' / tối đa 13,5'). Chỉ là logic thuần để GỢI Ý — DB vẫn là nơi trừ/cộng số.
// ---------------------------------------------------------------------------------------------------------------------------

/** Dung sai quanh giờ vào/hết ca: room chạm rìa vài phút không tính là "xuyên ranh giới". */
export const ROOM_EDGE_TOLERANCE_MIN = 5;

export type RoomRole =
  | "full" //       nằm trọn trong ca
  | "from_prev" //  bắt đầu trước giờ vào ca (đến từ ca trước)
  | "runs_over" //  chưa kết thúc / kết thúc sau giờ hết ca (chạy tiếp sang ca sau)
  | "both" //       cả hai (room chạy suốt qua ca này)
  | "outside"; //   không giao với ca

export interface RoomTimes {
  startedAt?: string;
  endedAt?: string;
}

/** Vai của một room trong cửa sổ ca. Room không có giờ bắt đầu coi như bắt đầu đúng lúc vào ca; room chưa có giờ kết thúc = đang live. */
export function classifyRoomRole(room: RoomTimes, win: { startMs: number; endMs: number }): RoomRole {
  const tol = ROOM_EDGE_TOLERANCE_MIN * 60000;
  const start = room.startedAt ? Date.parse(room.startedAt) : NaN;
  const end = room.endedAt ? Date.parse(room.endedAt) : NaN;
  const live = !room.endedAt || !Number.isFinite(end);
  if ((!live && end <= win.startMs) || (Number.isFinite(start) && start >= win.endMs)) return "outside";
  const fromPrev = Number.isFinite(start) && start < win.startMs - tol;
  const runsOver = live || end > win.endMs + tol;
  return fromPrev && runsOver ? "both" : fromPrev ? "from_prev" : runsOver ? "runs_over" : "full";
}

/** Room chạy qua giờ hết ca (tối đa một — hai room không chạy cùng lúc). Trả room có giờ kết thúc muộn nhất. */
export function runOverRoom<T extends RoomTimes>(rooms: T[], win: { startMs: number; endMs: number }): T | undefined {
  const over = rooms.filter((r) => {
    const role = classifyRoomRole(r, win);
    return role === "runs_over" || role === "both";
  });
  if (over.length === 0) return undefined;
  const key = (r: T) => (r.endedAt ? Date.parse(r.endedAt) : Infinity);
  return over.reduce((a, b) => (key(b) > key(a) ? b : a));
}

/** Room đến từ ca trước (bắt đầu trước giờ vào ca). */
export function roomsFromPrev<T extends RoomTimes>(rooms: T[], win: { startMs: number; endMs: number }): T[] {
  return rooms.filter((r) => {
    const role = classifyRoomRole(r, win);
    return role === "from_prev" || role === "both";
  });
}

/** Mỗi room của ca là một LƯỢT live; lượt sắp theo giờ bắt đầu (room thiếu giờ xếp cuối). */
export function sortTurns<T extends RoomTimes>(rooms: T[]): T[] {
  const key = (r: T) => (r.startedAt ? Date.parse(r.startedAt) : Infinity);
  return [...rooms].sort((a, b) => key(a) - key(b));
}

export interface TurnView<R> {
  /** 1 = lượt đầu (file đầu); ≥ 2 = mảnh restart. */
  no: number;
  partId?: string;
  reason?: BreakReason;
  note?: string;
  fileName?: string;
  rooms: R[];
}

/** Ghép room của snapshot với các mảnh: lượt 1 = room không thuộc mảnh nào; lượt k ≥ 2 = mảnh k (có thể rỗng = chỉ ghi nhận lý do). */
export function buildTurns<R extends RoomTimes & { partId?: string }>(
  rooms: R[],
  parts: { id: string; partNo: number; reason: BreakReason; note?: string; fileName?: string }[]
): TurnView<R>[] {
  const first = sortTurns(rooms.filter((r) => !r.partId));
  const out: TurnView<R>[] = first.length > 0 || parts.length === 0 ? [{ no: 1, rooms: first }] : [{ no: 1, rooms: [] }];
  for (const p of [...parts].sort((a, b) => a.partNo - b.partNo)) {
    out.push({ no: p.partNo, partId: p.id, reason: p.reason, note: p.note, fileName: p.fileName, rooms: sortTurns(rooms.filter((r) => r.partId === p.id)) });
  }
  return out;
}

export interface ChainShiftLike {
  id: string;
  brandId: string;
  platform: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  isBackfill?: boolean;
}

/** Các ca liền kề (cách nhau ≤ maxGapMin, tính theo giờ thật nên ca qua nửa đêm vẫn đúng) cùng brand + sàn mà ca `s` thuộc về, theo thứ tự giờ. */
export function adjacentShiftChain<T extends ChainShiftLike>(s: T, all: T[], maxGapMin = 30): T[] {
  const span = (x: T) => {
    const startMs = Date.parse(`${x.date}T${x.startTime.slice(0, 5)}:00+07:00`);
    let endMs = Date.parse(`${x.date}T${x.endTime.slice(0, 5)}:00+07:00`);
    if (endMs <= startMs) endMs += 86400000;
    return { startMs, endMs };
  };
  const pool = all
    .filter((x) => x.brandId === s.brandId && x.platform === s.platform && x.status !== "Cancelled" && !x.isBackfill)
    .sort((a, b) => span(a).startMs - span(b).startMs);
  const idx = pool.findIndex((x) => x.id === s.id);
  if (idx < 0) return [s];
  const gap = (a: T, b: T) => Math.abs(span(b).startMs - span(a).endMs) / 60000;
  let lo = idx;
  let hi = idx;
  while (lo > 0 && gap(pool[lo - 1], pool[lo]) <= maxGapMin) lo--;
  while (hi < pool.length - 1 && gap(pool[hi], pool[hi + 1]) <= maxGapMin) hi++;
  return pool.slice(lo, hi + 1);
}

export type BoundaryKind = "linked" | "unlinked";

export interface ChainBoundary {
  prevId: string;
  nextId: string;
  /** linked = trợ/OPS đã xác nhận room chạy tiếp (N); unlinked = chưa nối (room mới, hoặc chưa xác nhận). */
  kind: BoundaryKind;
  /** Ca sau bị khoá số vì ca trước (nối) chưa có file. */
  locked: boolean;
}

/** Trạng thái từng ranh giới của chuỗi: nối hay chưa, và có đang khoá không. `links` = các cặp (prev → next) đã xác nhận. */
export function chainBoundaries(chain: { id: string }[], links: { prevId: string; nextId: string }[], hasFile: (id: string) => boolean): ChainBoundary[] {
  const linked = new Set(links.map((l) => `${l.prevId}>${l.nextId}`));
  const out: ChainBoundary[] = [];
  for (let i = 0; i + 1 < chain.length; i++) {
    const prevId = chain[i].id;
    const nextId = chain[i + 1].id;
    const isLinked = linked.has(`${prevId}>${nextId}`);
    out.push({ prevId, nextId, kind: isLinked ? "linked" : "unlinked", locked: isLinked && !hasFile(prevId) });
  }
  return out;
}
