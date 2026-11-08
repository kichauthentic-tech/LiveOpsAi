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
}

const HOUR = 3600000;
/** Room lố giờ ca quá mốc này mới tính là "chạy qua" ca kề (cùng dung sai 5' với runOverRoom). */
export const CROSS_TOL_MS = 5 * 60000;

/** Giờ:phút theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy. */
export function vnClock(ms: number): string {
  const d = new Date(ms + 7 * HOUR);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function timelineLayout(input: TimelineIn): TimelineLayout {
  const { win, prev, next, nowMs } = input;
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

  const axisStartMs = Math.min(win.startMs, prev?.startMs ?? Infinity, ...spans.map((x) => x.s));
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

  return {
    axisStartMs,
    axisEndMs,
    ticks,
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
