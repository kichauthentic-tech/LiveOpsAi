import type { BreakReason } from "./roomCases";

// Dòng thời gian của Cửa sổ ca (08/11, user duyệt demo "cửa sổ ca gọn"): MỘT hình thay cho khối chữ "Lượt live & ca nối" +
// "Các lượt live" + "Chuỗi ca liền kề" + chú giải. Trục giờ gồm ca này và ca kề hai bên (nếu có); thanh = room/phiên, sọc =
// khoảng nghỉ giữa các room, vạch = giờ giao ca. File này chỉ tính vị trí (phần trăm trên trục) — component chỉ vẽ.

export interface TimelineRoomIn {
  roomId: string;
  startedAt?: string;
  endedAt?: string;
  partId?: string;
}

export interface TimelineShiftIn {
  startMs: number;
  endMs: number;
  label: string;
  /** Room chạy tiếp qua ranh giới với ca này đã được xác nhận nối. */
  linked: boolean;
}

export interface TimelineIn {
  win: { startMs: number; endMs: number };
  rooms: TimelineRoomIn[];
  parts: { id: string; partNo: number; reason: BreakReason; roomIds?: string[] }[];
  prev?: TimelineShiftIn;
  next?: TimelineShiftIn;
  /** Room chưa có giờ kết thúc (đang live) vẽ tới mốc này. */
  nowMs: number;
  /** Giờ vào ca kế hoạch của các ca trong chuỗi liền kề (để ca nối thừa hưởng lượng trễ của ca đầu). */
  chainStartsMs?: number[];
  /** Giờ giao ca thực ops đã nhập (0205) — thay giờ hết ca tự tính. */
  manualEndMs?: number;
  /** Ca không có ca nối sau (0209): giờ giao ca kéo theo giờ room tắt (tối đa +90'). */
  noNextShift?: boolean;
}

export interface TimelineSeg {
  leftPct: number;
  widthPct: number;
}

export interface TimelineTurn {
  no: number;
  roomId: string;
  startMs: number;
  endMs: number;
  /** Đang live (file chưa có giờ kết thúc). */
  open: boolean;
  /** Lý do ngắt (lượt ≥ 2 đã ghi lý do). */
  reason?: BreakReason;
  /** Phần nằm trong ca này. */
  inside?: TimelineSeg;
  /** Phần nằm ngoài ca này (thuộc ca trước / ca sau). */
  outside: TimelineSeg[];
}

export interface TimelineLayout {
  axisStartMs: number;
  axisEndMs: number;
  ticks: { pct: number; label: string }[];
  me: TimelineSeg;
  prev?: TimelineSeg & { label: string; linked: boolean };
  next?: TimelineSeg & { label: string; linked: boolean };
  turns: TimelineTurn[];
  gaps: (TimelineSeg & { minutes: number })[];
  /** Có room chạy qua giờ vào ca / giờ hết ca ⇒ vẽ vạch cắt ở đó. */
  cutStartPct?: number;
  cutEndPct?: number;
  /** Ca không có ca sau mà room chạy quá giờ hết ca (0209): đoạn quá giờ kế hoạch (OT) — vẽ khác màu, vạch ở giờ hết ca kế hoạch. */
  overtime?: TimelineSeg & { minutes: number; fromPct: number };
}

const HOUR = 3600000;
/** Room lố giờ ca quá mốc này mới tính là "chạy qua" ca kề (cùng dung sai 5' với runOverRoom). */
export const CROSS_TOL_MS = 5 * 60000;

/** Giờ:phút theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy. */
export function vnClock(ms: number): string {
  const d = new Date(ms + 7 * HOUR);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Tối đa lượng trễ được bù (cùng giới hạn với migration 0204). */
export const MAX_FLEX_MS = 90 * 60000;

/**
 * Lượng trễ (ms) của ca — cùng quy tắc `private.session_lateness` ở migration 0204 (09/11, user: host vào trễ 10–15' rồi tự bù
 * đủ giờ thì ca và các ca nối sau TRƯỢT cùng lượng đó, mỗi ca giữ độ dài kế hoạch):
 *  - room đầu tiên bắt đầu trong ca (hoặc trễ so với giờ vào ca) ⇒ lượng trễ = giờ room bắt đầu − giờ vào ca kế hoạch, kẹp 0..90' (trễ ≤ 5' coi như đúng giờ);
 *  - room bắt đầu TRƯỚC giờ vào ca (> 5') là room chạy tiếp từ ca trước ⇒ thừa hưởng lượng trễ của ca nơi room bắt đầu
 *    (ca có giờ vào ca kế hoạch gần nhất ≤ giờ room bắt đầu, lấy từ `chainStartsMs`); không có ca trước ⇒ 0.
 */
export function flexLateness(win: { startMs: number; endMs: number }, rooms: FlexRoom[], chainStartsMs: number[] = []): number {
  return flexShift(win, rooms, chainStartsMs).endShiftMs;
}

/** Phòng chỉ cần giờ bắt đầu / kết thúc (file giao ca). */
export type FlexRoom = { startedAt?: string; endedAt?: string };

/** Khoảng nghỉ giữa hai room liên tiếp được coi là tắt bật lại (restart) — cùng ngưỡng 1'..30' với migration 0205. */
export const PAUSE_MIN_MS = 60000;
export const PAUSE_MAX_MS = 30 * 60000;

/**
 * Tách lượng trượt của ca thành: `startShiftMs` = trễ vào ca (hoặc thừa hưởng từ ca trước) — dời cả giờ vào ca; `endShiftMs` =
 * trễ + tổng khoảng NGHỈ giữa các room của chính ca này (tắt bật lại 1'..30') — dời giờ hết ca/giờ giao ca (0205: host nghỉ 6'
 * thì phải live thêm 6' mới đủ giờ kế hoạch). Cả hai kẹp 0..90'.
 */
export function flexShift(
  win: { startMs: number; endMs: number },
  rooms: FlexRoom[],
  chainStartsMs: number[] = []
): { startShiftMs: number; endShiftMs: number; pauseMs: number; inherited: boolean } {
  const spans = rooms
    .map((r) => ({ s: r.startedAt ? Date.parse(r.startedAt) : NaN, e: r.endedAt ? Date.parse(r.endedAt) : NaN }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => a.s - b.s);
  if (spans.length === 0) return { startShiftMs: 0, endShiftMs: 0, pauseMs: 0, inherited: false };
  const first = spans[0].s;
  let base: number;
  const inherited = first < win.startMs - CROSS_TOL_MS;
  if (inherited) {
    const before = chainStartsMs.filter((s) => s < win.startMs && s <= first + CROSS_TOL_MS);
    if (before.length === 0) return { startShiftMs: 0, endShiftMs: 0, pauseMs: 0, inherited: false }; // host bật sớm, không có ca trước
    const late = first - Math.max(...before);
    base = late <= CROSS_TOL_MS ? 0 : Math.min(late, MAX_FLEX_MS);
  } else {
    const late = first - win.startMs;
    base = late <= CROSS_TOL_MS ? 0 : Math.min(late, MAX_FLEX_MS); // trễ ≤ 5' không tính (cùng dung sai với 0203/0204)
  }
  // Khoảng nghỉ giữa các room chạm ca này (room kết thúc sau giờ vào ca).
  const inShift = spans.filter((x) => (Number.isFinite(x.e) ? x.e : x.s) > win.startMs);
  let pause = 0;
  for (let i = 1; i < inShift.length; i++) {
    const prevEnd = inShift[i - 1].e;
    if (!Number.isFinite(prevEnd)) continue;
    const gap = inShift[i].s - prevEnd;
    if (gap > PAUSE_MIN_MS && gap <= PAUSE_MAX_MS) pause += gap;
  }
  return { startShiftMs: base, endShiftMs: Math.min(base + pause, MAX_FLEX_MS), pauseMs: pause, inherited };
}

/**
 * Cửa sổ ca sau khi trượt: giờ vào ca dời theo trễ vào ca, giờ hết ca dời theo trễ + phút nghỉ. `manualEndMs` = giờ giao ca thực
 * ops đã nhập (0205) — thay giờ hết ca tự tính.
 */
export function flexWindow(
  win: { startMs: number; endMs: number },
  rooms: FlexRoom[],
  chainStartsMs: number[] = [],
  manualEndMs?: number,
  noNextShift = false
): { startMs: number; endMs: number } {
  const { startShiftMs, endShiftMs } = flexShift(win, rooms, chainStartsMs);
  const startMs = win.startMs + startShiftMs;
  let endMs = manualEndMs && Number.isFinite(manualEndMs) ? manualEndMs : win.endMs + endShiftMs;
  if (noNextShift && !(manualEndMs && Number.isFinite(manualEndMs))) endMs = extendEndToRoomEnd(win, rooms, endMs);
  return startShiftMs > 0 || endMs !== win.endMs ? { startMs, endMs } : win;
}

/**
 * Ca KHÔNG có ca nối sau mà room tắt muộn hơn (giờ hết ca + trễ + 5') ⇒ giờ giao ca = giờ tắt room, tối đa giờ hết ca kế hoạch + 90'
 * (migration 0209, hàm `private.session_flex_boundary_at`). Còn room chưa tắt ⇒ chưa biết giờ kết thúc, giữ nguyên.
 */
function extendEndToRoomEnd(win: { startMs: number; endMs: number }, rooms: FlexRoom[], endMs: number): number {
  const timed = rooms.filter((r) => r.startedAt && Number.isFinite(Date.parse(r.startedAt)));
  if (timed.length === 0 || timed.some((r) => !r.endedAt || !Number.isFinite(Date.parse(r.endedAt)))) return endMs;
  const last = Math.max(...timed.map((r) => Date.parse(r.endedAt!)));
  if (last <= endMs + CROSS_TOL_MS) return endMs;
  return Math.max(endMs, Math.min(last, win.endMs + MAX_FLEX_MS));
}

export function timelineLayout(input: TimelineIn): TimelineLayout {
  const { nowMs } = input;
  // Cửa sổ hiệu lực: cả chuỗi ca nối trượt theo lượng trễ + phút nghỉ (ca này + ca trước/sau trên trục).
  const shift = flexShift(input.win, input.rooms, input.chainStartsMs);
  const win = flexWindow(input.win, input.rooms, input.chainStartsMs, input.manualEndMs, input.noNextShift);
  const late = shift.endShiftMs;
  const slide = (x?: TimelineShiftIn): TimelineShiftIn | undefined => (x && late > 0 ? { ...x, startMs: x.startMs + late, endMs: x.endMs + late } : x);
  const prev = input.prev && shift.inherited && shift.startShiftMs > 0 ? { ...input.prev, startMs: input.prev.startMs + shift.startShiftMs, endMs: input.prev.endMs + shift.startShiftMs } : input.prev;
  const next = input.manualEndMs && input.next ? { ...input.next, startMs: win.endMs, endMs: input.next.endMs + (win.endMs - input.win.endMs) } : slide(input.next);
  const spans = input.rooms
    .map((r) => {
      const s = r.startedAt ? Date.parse(r.startedAt) : NaN;
      const eRaw = r.endedAt ? Date.parse(r.endedAt) : NaN;
      const open = !Number.isFinite(eRaw);
      const e = open ? Math.max(s, Math.min(nowMs, Math.max(win.endMs, next?.endMs ?? win.endMs))) : eRaw;
      return { r, s, e, open };
    })
    .filter((x) => Number.isFinite(x.s) && x.e >= x.s)
    .sort((a, b) => a.s - b.s);

  const axisStartMs = Math.min(input.win.startMs, win.startMs, prev?.startMs ?? Infinity, ...spans.map((x) => x.s));
  let axisEndMs = Math.max(win.endMs, next?.endMs ?? -Infinity, ...spans.map((x) => x.e));
  if (!(axisEndMs > axisStartMs)) axisEndMs = axisStartMs + HOUR;
  const total = axisEndMs - axisStartMs;
  const pct = (ms: number) => Math.min(100, Math.max(0, ((ms - axisStartMs) / total) * 100));
  const seg = (a: number, b: number): TimelineSeg => ({ leftPct: pct(a), widthPct: Math.max(0, pct(b) - pct(a)) });

  // Mốc giờ tròn: ≤ 7 mốc, bước 1/2/3 giờ.
  const firstHour = Math.ceil((axisStartMs + 7 * HOUR) / HOUR) * HOUR - 7 * HOUR;
  const hours = Math.max(1, total / HOUR);
  const step = hours <= 6 ? 1 : hours <= 12 ? 2 : 3;
  const ticks: { pct: number; label: string }[] = [];
  for (let t = firstHour; t <= axisEndMs; t += step * HOUR) ticks.push({ pct: pct(t), label: vnClock(t) });

  const reasonOf = (partId?: string) => input.parts.find((p) => p.id === partId)?.reason;
  // Lượt k ≥ 2 chỉ "ghi nhận lý do" (mảnh không có room): gán lý do theo số lượt cho room thứ k.
  const emptyPartsByNo = new Map(input.parts.filter((p) => !(p.roomIds?.length)).map((p) => [p.partNo, p.reason] as const));
  const turns: TimelineTurn[] = spans.map((x, i) => {
    const outside: TimelineSeg[] = [];
    if (x.s < win.startMs) outside.push(seg(x.s, Math.min(x.e, win.startMs)));
    if (x.e > win.endMs) outside.push(seg(Math.max(x.s, win.endMs), x.e));
    const inS = Math.max(x.s, win.startMs);
    const inE = Math.min(x.e, win.endMs);
    return {
      no: i + 1,
      roomId: x.r.roomId,
      startMs: x.s,
      endMs: x.e,
      open: x.open,
      reason: i === 0 ? undefined : reasonOf(x.r.partId) ?? emptyPartsByNo.get(i + 1),
      inside: inE > inS ? seg(inS, inE) : undefined,
      outside
    };
  });

  const gaps: (TimelineSeg & { minutes: number })[] = [];
  let reach = spans.length > 0 ? spans[0].e : 0;
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].s - reach >= 60000) gaps.push({ ...seg(reach, spans[i].s), minutes: Math.round((spans[i].s - reach) / 60000) });
    reach = Math.max(reach, spans[i].e);
  }

  // Đoạn quá giờ kế hoạch: chỉ khi giờ giao ca được kéo theo room (không ca sau, không nhập tay) — trượt vì vào trễ/nghỉ thì ca vẫn đủ giờ KH, không phải OT.
  const planEnd = flexWindow(input.win, input.rooms, input.chainStartsMs, undefined, false).endMs;
  const ot = input.noNextShift && !input.manualEndMs && win.endMs > planEnd ? { ...seg(planEnd, win.endMs), minutes: Math.round((win.endMs - planEnd) / 60000), fromPct: pct(planEnd) } : undefined;

  return {
    axisStartMs,
    axisEndMs,
    ticks,
    overtime: ot,
    me: seg(win.startMs, win.endMs),
    prev: prev ? { ...seg(prev.startMs, Math.min(prev.endMs, win.startMs)), label: prev.label, linked: prev.linked } : undefined,
    next: next ? { ...seg(Math.max(next.startMs, win.endMs), next.endMs), label: next.label, linked: next.linked } : undefined,
    turns,
    gaps,
    // Lố giờ ≤ 5 phút (bật sớm / tắt trễ một chút) không vẽ vạch cắt — cùng dung sai với `runOverRoom`.
    cutStartPct: spans.some((x) => x.s < win.startMs - CROSS_TOL_MS && x.e > win.startMs) ? pct(win.startMs) : undefined,
    cutEndPct: spans.some((x) => x.s < win.endMs && x.e > win.endMs + CROSS_TOL_MS) ? pct(win.endMs) : undefined
  };
}
