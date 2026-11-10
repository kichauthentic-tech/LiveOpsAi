import type { LiveSession, StaffSegment, Talent } from "../../types";
import { findPersonClashes } from "../scheduling/conflicts";
import { addDays } from "../dateUtils";
import { clockAtOffset, effectiveSegments, sessionMinutes, type StaffRole } from "../staffSegments";import { talentShortName } from "../talentName";

// Talent nhường ca / đổi ca cho nhau, trainer/OPs duyệt (migration 0212). File này là BẢN SAO phía client của luật DB để
//   (1) giao diện chỉ liệt kê người/ca thật sự dùng được ("hệ thống lọc trước"), (2) gợi ý nhường MỘT đoạn khi cả ca bị vướng.
// DB vẫn kiểm lại ở mỗi bước (gửi, đồng ý, duyệt) — đây không phải hàng rào bảo mật.
//
// Hai loại KHÁC NHAU: pass = nhường một chiều (cả ca hoặc một đoạn); swap = đổi hai ca/đoạn cho nhau.
// MỘT luật chặn duy nhất: sau khi đổi, lịch mỗi người KHÔNG phát sinh chồng giờ mới so với trước khi đổi
// (chồng giờ có sẵn từ trước không bị tính). Không có luật giờ/tuần — trainer tự cân đối (user chốt 10/11).

export type SwapKind = "pass" | "swap";
export type SwapStatus = "pending_peer" | "pending_ops" | "approved" | "declined" | "rejected" | "cancelled";

/** Một đoạn của một ca: phút kể từ giờ bắt đầu ca. */
export interface SwapPart {
  sessionId: string;
  fromMin: number;
  toMin: number;
}

export interface ShiftSwapRequest {
  id: string;
  kind: SwapKind;
  status: SwapStatus;
  fromTalent: string;
  toTalent: string;
  fromName: string;
  toName: string;
  /** Đoạn người gửi giao đi. */
  give: SwapPart;
  /** Chỉ có ở loại swap: đoạn người nhận đưa lại. */
  take?: SwapPart;
  reason: string;
  peerAnsweredAt?: string;
  decidedAt?: string;
  decisionNote: string;
  createdAt: string;
}

/** Còn bao nhiêu phút đến giờ bắt đầu đoạn thì không đổi qua yêu cầu nữa (gấp hơn = "Tôi không đi được ca này"). */
export const SWAP_LEAD_MINUTES = 24 * 60;
/** Tối đa số đoạn mỗi vai mỗi ca sau khi nhường (giữ ca còn đọc được). */
export const SWAP_MAX_SEGMENTS_PER_ROLE = 3;

/** Giờ ca là giờ Việt Nam (UTC+7, không có DST). */
export function partStartMs(s: Pick<LiveSession, "date" | "startTime">, offsetMin: number): number {
  return Date.parse(`${s.date}T${s.startTime.slice(0, 5)}:00+07:00`) + offsetMin * 60_000;
}

export const isOpenStatus = (st: SwapStatus): boolean => st === "pending_peer" || st === "pending_ops";

export const partLabel = (s: LiveSession, p: { fromMin: number; toMin: number }): string =>
  `${s.brandName} ${s.platform} ${s.date.slice(8, 10)}/${s.date.slice(5, 7)} ${clockAtOffset(s, p.fromMin)}–${clockAtOffset(s, p.toMin)}`;

type SegCore = Pick<StaffSegment, "talentId" | "fromMin" | "toMin">;

/** Vai mà người này đang giữ TRỌN [from, to) (đoạn liền nhau của cùng người ở cùng vai được coi là một); null nếu không. */
export function holdRole(s: LiveSession, talentId: string, from: number, to: number): StaffRole | null {
  for (const role of ["host", "co_host"] as const) {
    const segs = effectiveSegments(s)
      .filter((g) => g.role === role && g.talentId === talentId && g.fromMin < to && g.toMin > from)
      .sort((a, b) => a.fromMin - b.fromMin);
    let cursor = from;
    for (const g of segs) {
      if (g.fromMin > cursor) break;
      cursor = Math.max(cursor, g.toMin);
    }
    if (cursor >= to && segs.length > 0) return role;
  }
  return null;
}

/** Chuyển [from, to) của người giao sang người nhận trong một ca — cùng thuật toán private.swap_move_part (DB). */
export function movePart(
  s: LiveSession,
  giver: string,
  taker: string,
  from: number,
  to: number,
  nameOf: (talentId: string) => string
): { session: LiveSession } | { error: string } {
  const dur = sessionMinutes(s);
  if (from < 0 || to > dur || to <= from) return { error: "Đoạn giờ nằm ngoài ca." };
  const role = holdRole(s, giver, from, to);
  if (!role) return { error: "Người giao không còn giữ trọn đoạn này của ca (lịch đã đổi)." };

  const list: SegCore[] = [];
  for (const g of effectiveSegments(s).filter((x) => x.role === role)) {
    if (g.talentId === giver && g.fromMin < to && g.toMin > from) {
      if (g.fromMin < from) list.push({ talentId: g.talentId, fromMin: g.fromMin, toMin: from });
      if (g.toMin > to) list.push({ talentId: g.talentId, fromMin: to, toMin: g.toMin });
    } else {
      list.push({ talentId: g.talentId, fromMin: g.fromMin, toMin: g.toMin });
    }
  }
  list.push({ talentId: taker, fromMin: from, toMin: to });
  list.sort((a, b) => a.fromMin - b.fromMin);
  const merged: SegCore[] = [];
  for (const g of list) {
    const last = merged[merged.length - 1];
    if (last && last.talentId === g.talentId && last.toMin === g.fromMin) last.toMin = g.toMin;
    else merged.push({ ...g });
  }
  if (merged.length > SWAP_MAX_SEGMENTS_PER_ROLE) return { error: "Ca này đã chia nhiều đoạn (tối đa 3 đoạn mỗi vai) — nhờ trainer sắp lại." };

  // Người chính = người làm nhiều phút nhất của vai (hoà: vào sớm hơn) — cùng luật DB.
  const minutes = new Map<string, { m: number; first: number }>();
  for (const g of merged) {
    const cur = minutes.get(g.talentId) ?? { m: 0, first: g.fromMin };
    cur.m += g.toMin - g.fromMin;
    cur.first = Math.min(cur.first, g.fromMin);
    minutes.set(g.talentId, cur);
  }
  const main = [...minutes.entries()].sort((a, b) => b[1].m - a[1].m || a[1].first - b[1].first)[0][0];
  const whole = merged.length === 1 && merged[0].fromMin === 0 && merged[0].toMin === dur;

  const otherRoleSegs = (s.staffSegments ?? []).filter((g) => g.role !== role);
  const mine: StaffSegment[] = whole ? [] : merged.map((g) => ({ ...g, role, talentName: nameOf(g.talentId) }));
  const next: LiveSession = {
    ...s,
    ...(role === "host" ? { hostId: main, hostName: nameOf(main) } : { coHostId: main, coHostName: nameOf(main) }),
    staffSegments: [...otherRoleSegs, ...mine]
  };
  return { session: next };
}

/** Lịch SAU khi áp yêu cầu (hoặc lỗi nếu người giao không còn giữ đoạn đó). */
export function applySwap(sessions: LiveSession[], req: Pick<ShiftSwapRequest, "kind" | "fromTalent" | "toTalent" | "give" | "take">, nameOf: (id: string) => string): { sessions: LiveSession[] } | { error: string } {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const next = new Map(byId);
  const steps: Array<[SwapPart, string, string]> = [[req.give, req.fromTalent, req.toTalent]];
  if (req.kind === "swap" && req.take) steps.push([req.take, req.toTalent, req.fromTalent]);
  for (const [part, giver, taker] of steps) {
    const s = next.get(part.sessionId);
    if (!s) return { error: "Không thấy ca." };
    const moved = movePart(s, giver, taker, part.fromMin, part.toMin, nameOf);
    if ("error" in moved) return moved;
    next.set(s.id, moved.session);
  }
  return { sessions: sessions.map((s) => next.get(s.id) ?? s) };
}

/** Chỉ mục ngày → ca, nhớ theo mảng `sessions` (mảng mới ⇒ dựng lại). Đo 10/11: không chỉ mục, một lần kiểm mất ~15 ms vì quét + sao chép
 *  cả ~500 ca; danh sách "đổi" cho một ca gọi vài trăm lần kiểm ⇒ 6 giây. */
const dateIndex = new WeakMap<readonly LiveSession[], Map<string, LiveSession[]>>();
function indexOf(sessions: readonly LiveSession[]): Map<string, LiveSession[]> {
  let idx = dateIndex.get(sessions);
  if (!idx) {
    idx = new Map();
    for (const s of sessions) {
      const l = idx.get(s.date);
      if (l) l.push(s);
      else idx.set(s.date, [s]);
    }
    dateIndex.set(sessions, idx);
  }
  return idx;
}

/** Các ca trong cửa sổ ±1 ngày quanh từng ngày bị đụng (hai ngày cách xa nhau thì KHÔNG lấy ca ở giữa) — đủ để kiểm chồng giờ. */
function windowSessions(sessions: readonly LiveSession[], dates: string[]): LiveSession[] {
  const idx = indexOf(sessions);
  const days = new Set<string>();
  for (const d of dates) for (const k of [-1, 0, 1]) days.add(addDays(d, k));
  const out: LiveSession[] = [];
  for (const d of days) for (const s of idx.get(d) ?? []) out.push(s);
  return out;
}

const clashCount = (sessions: LiveSession[], talentId: string): number => findPersonClashes(sessions).filter((c) => c.talentId === talentId).length;

export interface SwapCheckOptions {
  nowMs: number;
  nameOf: (talentId: string) => string;
}

/**
 * Lý do yêu cầu KHÔNG hợp lệ (rỗng = hợp lệ). Thứ tự = thứ tự hiện ra: câu đầu là câu quan trọng nhất.
 * Luật: ca chưa huỷ; còn ≥ 24 giờ; người giao đang giữ trọn đoạn; sau khi đổi không phát sinh chồng giờ mới.
 */
export function swapProblems(sessions: LiveSession[], req: Pick<ShiftSwapRequest, "kind" | "fromTalent" | "toTalent" | "give" | "take">, opts: SwapCheckOptions): string[] {
  const parts = [req.give, ...(req.kind === "swap" && req.take ? [req.take] : [])];
  const involved = parts.map((p) => sessions.find((s) => s.id === p.sessionId));
  if (involved.some((s) => !s)) return ["Không thấy ca."];
  const list = involved as LiveSession[];
  if (list.some((s) => s.status === "Cancelled")) return ["Ca đã huỷ."];
  if (parts.some((p, i) => partStartMs(list[i], p.fromMin) < opts.nowMs + SWAP_LEAD_MINUTES * 60_000)) {
    return ["Còn dưới 24 giờ — dùng “Tôi không đi được ca này”."];
  }
  // Chỉ ca có mặt một trong hai người (hoặc chính các ca bị đụng) mới có thể tạo/mất chồng giờ cho họ ⇒ bỏ phần còn lại (~50 → ~6 ca mỗi lần kiểm).
  const pair = new Set([req.fromTalent, req.toTalent]);
  const scope = windowSessions(sessions, list.map((s) => s.date)).filter((x) => list.includes(x) || effectiveSegments(x).some((g) => pair.has(g.talentId)));
  const applied = applySwap(scope, req, opts.nameOf);
  if ("error" in applied) return [applied.error];
  const afterScope = applied.sessions;
  const out: string[] = [];
  for (const who of [req.fromTalent, req.toTalent]) {
    if (clashCount(afterScope, who) <= clashCount(scope, who)) continue;
    const hit = findPersonClashes(afterScope).find((c) => c.talentId === who && [c.session, c.other].some((x) => x && list.some((l) => l.id === x.id)));
    const other = hit ? ([hit.session, hit.other].find((x) => x && !list.some((l) => l.id === x.id)) ?? hit.other ?? hit.session) : undefined;
    const w = other ? `${other.brandName} ${other.platform} ${other.date.slice(8, 10)}/${other.date.slice(5, 7)} ${other.startTime}–${other.endTime}` : "ca khác";
    out.push(`${opts.nameOf(who)} trùng ca ${w}.`);
  }
  return out;
}

export const talentNameOf = (talents: readonly Talent[]) => {
  const m = new Map(talents.map((t) => [t.id, t]));
  return (id: string): string => talentShortName(m.get(id), id);
};

/** Bước đổi/nhường theo từng 30 phút — đủ mịn cho "nhường 2 giờ 30". */
const STEP_MIN = 30;

/** Đoạn dài nhất BÊN TRONG `part` mà người nhận nhận được (nhỏ hơn đoạn đầy đủ); null nếu không có đoạn nào ≥ 30 phút. */
export function bestPartHint(
  sessions: LiveSession[],
  me: string,
  taker: string,
  part: SwapPart,
  opts: SwapCheckOptions
): { fromMin: number; toMin: number } | null {
  let best: { fromMin: number; toMin: number } | null = null;
  for (let a = part.fromMin; a < part.toMin; a += STEP_MIN) {
    for (let b = part.toMin; b > a; b -= STEP_MIN) {
      if (a === part.fromMin && b === part.toMin) continue;
      if (best && b - a <= best.toMin - best.fromMin) break;
      const req = { kind: "pass" as const, fromTalent: me, toTalent: taker, give: { sessionId: part.sessionId, fromMin: a, toMin: b } };
      if (swapProblems(sessions, req, opts).length === 0) {
        best = { fromMin: a, toMin: b };
        break;
      }
    }
  }
  return best;
}

export interface ReceiverOption {
  talentId: string;
  /** Cả đoạn nhận được. */
  ok: boolean;
  /** Không nhận cả đoạn thì lý do (câu đầu tiên). */
  why?: string;
  /** Không nhận cả đoạn nhưng nhận được một đoạn nhỏ hơn bên trong. */
  hint?: { fromMin: number; toMin: number };
}

/** Người nhận cho "Nhường ca": ok = nhận cả đoạn; còn lại kèm lý do + gợi ý đoạn nhỏ hơn nếu có. */
export function passReceivers(sessions: LiveSession[], me: string, part: SwapPart, talents: readonly Talent[], opts: SwapCheckOptions): ReceiverOption[] {
  const out: ReceiverOption[] = [];
  for (const t of talents) {
    if (t.id === me) continue;
    const req = { kind: "pass" as const, fromTalent: me, toTalent: t.id, give: part };
    const problems = swapProblems(sessions, req, opts);
    if (problems.length === 0) {
      out.push({ talentId: t.id, ok: true });
      continue;
    }
    const hint = bestPartHint(sessions, me, t.id, part, opts);
    out.push({ talentId: t.id, ok: false, why: problems[0], hint: hint ?? undefined });
  }
  return out;
}

export interface SwapCandidate {
  talentId: string;
  take: SwapPart;
}

/** Các ca/đoạn của MỘT người mà `me` đổi được lấy `give` (cả hai chiều không phát sinh chồng giờ), theo thứ tự ngày. Đoạn họ đưa lại =
 *  đúng đoạn họ đang đứng ở ca đó. Chọn người trước rồi mới tính ⇒ chỉ ~13 ca (trung vị tháng 11) thay vì cả tháng × cả agency. */
export function swapWith(sessions: readonly LiveSession[], me: string, give: SwapPart, other: string, opts: SwapCheckOptions): SwapCandidate[] {
  const out: SwapCandidate[] = [];
  if (other === me) return out;
  const horizon = opts.nowMs + SWAP_LEAD_MINUTES * 60_000;
  for (const s of sessions) {
    if (s.id === give.sessionId || s.status === "Cancelled" || s.isBackfill || partStartMs(s, 0) < horizon) continue;
    for (const g of effectiveSegments(s)) {
      if (g.talentId !== other) continue;
      const req = { kind: "swap" as const, fromTalent: me, toTalent: other, give, take: { sessionId: s.id, fromMin: g.fromMin, toMin: g.toMin } };
      if (swapProblems(sessions as LiveSession[], req, opts).length === 0) out.push({ talentId: other, take: req.take });
    }
  }
  return out.sort((a, b) => {
    const sa = sessions.find((x) => x.id === a.take.sessionId)!;
    const sb = sessions.find((x) => x.id === b.take.sessionId)!;
    return partStartMs(sa, a.take.fromMin) - partStartMs(sb, b.take.fromMin);
  });
}

/** Ai có ca đổi được với `give`, kèm số ca — để gợi ý "7 ca đổi được". Nhiều ca đổi được nhất lên đầu. */
export function swapPeople(sessions: readonly LiveSession[], me: string, give: SwapPart, talents: readonly Talent[], opts: SwapCheckOptions): { talentId: string; count: number }[] {
  const out: { talentId: string; count: number }[] = [];
  for (const t of talents) {
    if (t.id === me) continue;
    const count = swapWith(sessions, me, give, t.id, opts).length;
    if (count > 0) out.push({ talentId: t.id, count });
  }
  return out.sort((a, b) => b.count - a.count);
}
