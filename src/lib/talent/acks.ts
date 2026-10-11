import type { LiveSession } from "../../types";
import type { ShiftAck } from "../db/shiftAcks";
import { sessionWindowMs } from "../sessionStatus";
import { effectiveSegments } from "../staffSegments";
import { mySessions } from "./myShifts";

// "Đã nhận lịch" (app talent T2, migration 0169). Một dòng nhận chỉ đúng với ngày/giờ lúc bấm: OP đổi giờ sau đó thì người
// đứng ca phải nhận lại — màn talent hiện "giờ cũ → giờ mới", OP thấy người đó là "chưa nhận".

const key = (sessionId: string, talentId: string) => `${sessionId}|${talentId}`;

export type AckIndex = Map<string, ShiftAck>;
export const indexAcks = (acks: ShiftAck[]): AckIndex => new Map(acks.map((a) => [key(a.sessionId, a.talentId), a]));

export type AckState = { kind: "acked" } | { kind: "new" } | { kind: "changed"; before: ShiftAck };

/** Người này đã nhận đúng ngày/giờ hiện tại của ca chưa. */
export function ackState(s: LiveSession, talentId: string, idx: AckIndex): AckState {
  const a = idx.get(key(s.id, talentId));
  if (!a) return { kind: "new" };
  return a.date === s.date && a.startTime === s.startTime && a.endTime === s.endTime ? { kind: "acked" } : { kind: "changed", before: a };
}

/** Ca phải nhận: chưa bắt đầu, chưa huỷ (ca đã chạy thì không hỏi lại — có hỏi cũng muộn). */
const awaitsAck = (s: LiveSession, nowMs: number) => s.status !== "Cancelled" && !s.isBackfill && sessionWindowMs(s)[0] > nowMs;

export interface PendingAck {
  session: LiveSession;
  state: Exclude<AckState, { kind: "acked" }>;
}

/** Ca của tôi chưa nhận (mới xếp hoặc đã đổi giờ), theo giờ bắt đầu. */
export function myPendingAcks(sessions: LiveSession[], talentId: string | undefined, acks: ShiftAck[], nowMs: number): PendingAck[] {
  if (!talentId) return [];
  const idx = indexAcks(acks);
  const out: PendingAck[] = [];
  for (const s of mySessions(sessions, talentId)) {
    if (!awaitsAck(s, nowMs)) continue;
    const st = ackState(s, talentId, idx);
    if (st.kind !== "acked") out.push({ session: s, state: st });
  }
  return out;
}

export interface UnackedPerson {
  talentId: string;
  name: string;
  sessions: LiveSession[];
  /** Giờ vào ca sớm nhất trong số ca chưa nhận. */
  firstStartMs: number;
}

/** Cho OP: người đứng ca bắt đầu trong `withinHours` giờ tới mà chưa nhận lịch (gồm người ở một đoạn khi đổi người giữa ca).
 *  Người có ca sát giờ nhất trước. */
export function unackedSoon(sessions: LiveSession[], acks: ShiftAck[], nowMs: number, withinHours = 48): UnackedPerson[] {
  const idx = indexAcks(acks);
  const limit = nowMs + withinHours * 3600_000;
  const byPerson = new Map<string, UnackedPerson>();
  for (const s of sessions) {
    if (!awaitsAck(s, nowMs)) continue;
    const start = sessionWindowMs(s)[0];
    if (start > limit) continue;
    const seen = new Set<string>();
    for (const g of effectiveSegments(s)) {
      if (seen.has(g.talentId)) continue;
      seen.add(g.talentId);
      if (ackState(s, g.talentId, idx).kind === "acked") continue;
      const p = byPerson.get(g.talentId) ?? { talentId: g.talentId, name: g.talentName || "?", sessions: [], firstStartMs: start };
      p.sessions.push(s);
      p.firstStartMs = Math.min(p.firstStartMs, start);
      byPerson.set(g.talentId, p);
    }
  }
  const people = [...byPerson.values()];
  for (const p of people) p.sessions.sort((a, b) => sessionWindowMs(a)[0] - sessionWindowMs(b)[0]);
  return people.sort((a, b) => a.firstStartMs - b.firstStartMs || a.name.localeCompare(b.name, "vi"));
}
