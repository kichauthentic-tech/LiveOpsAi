import type { LiveSession, ShiftSlot } from "../../types";
import { sessionWindowMs } from "../sessionStatus";
import { findPersonClashes, type PersonClash } from "../scheduling/conflicts";
import { personRoleMinutes, sessionMinutes, hasStaffSegments } from "../staffSegments";

// Logic thuần của app talent (T1 11/10, bản 2 16/10): tab Ca của tôi, Đăng ký, Tôi. Giao ca không còn ở app talent (admin giao
// trên máy phòng live, user chốt 16/10). Mọi phép "ca của tôi" đi qua đây để ba tab nói
// cùng một số về cùng một người. Giờ theo người đọc từ staffSegments (đổi người giữa ca, 0138) — không đọc hostId/coHostId
// thô cho số liệu (WORKSPACE §5.5).

export type MyRole = "host" | "co_host";

/** Người này đứng ca (Host, Trợ live, hoặc một đoạn khi đổi người giữa ca). */
export function isMine(s: LiveSession, talentId: string | undefined): boolean {
  if (!talentId) return false;
  return s.hostId === talentId || s.coHostId === talentId || (s.staffSegments ?? []).some((g) => g.talentId === talentId);
}

/** Vai chính của người này ở ca — vai đứng lâu hơn khi có đổi người giữa ca. */
export function myRole(s: LiveSession, talentId: string): MyRole | null {
  if (!isMine(s, talentId)) return null;
  const host = personRoleMinutes(s, talentId, "host");
  const co = personRoleMinutes(s, talentId, "co_host");
  if (host === 0 && co === 0) return s.hostId === talentId ? "host" : s.coHostId === talentId ? "co_host" : null;
  return host >= co ? "host" : "co_host";
}

const byStart = (a: LiveSession, b: LiveSession) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);

/** Ca của tôi (bỏ ca nạp bù — lịch sử đọc từ file, không phải lịch được xếp), theo giờ bắt đầu. */
export function mySessions(sessions: LiveSession[], talentId: string | undefined): LiveSession[] {
  if (!talentId) return [];
  return sessions.filter((s) => !s.isBackfill && isMine(s, talentId)).sort(byStart);
}

export interface TimelineItem {
  session: LiveSession;
  /** Phút từ hết ca trước tới đầu ca này (âm = chồng giờ); null ở ca đầu ngày. */
  gapMin: number | null;
}

/** Ca chưa huỷ của tôi trong một ngày, kèm khoảng nghỉ với ca trước (để nhắc ca nối / chồng giờ). */
export function dayTimeline(mine: LiveSession[], date: string): TimelineItem[] {
  const day = mine.filter((s) => s.date === date && s.status !== "Cancelled");
  return day.map((s, i) => {
    if (i === 0) return { session: s, gapMin: null };
    const prevEnd = sessionWindowMs(day[i - 1])[1];
    return { session: s, gapMin: Math.round((sessionWindowMs(s)[0] - prevEnd) / 60000) };
  });
}

/** Khoảng nghỉ ≤ ngưỡng này (phút) giữa hai ca của cùng một người = ca nối: giao ca trước rồi vào ca sau ngay. */
export const BACK_TO_BACK_MIN = 30;

export interface HeroShift {
  session: LiveSession;
  live: boolean;
  /** Phút tới giờ vào ca (sắp tới) hoặc tới giờ hết ca (đang live). */
  minutesLeft: number;
}

/** Ca đang live của tôi, không có thì ca sắp tới gần nhất (trong `withinDays` ngày). */
export function heroShift(mine: LiveSession[], nowMs: number, withinDays = 7): HeroShift | null {
  const active = mine.filter((s) => s.status !== "Cancelled");
  for (const s of active) {
    const [start, end] = sessionWindowMs(s);
    if (nowMs >= start && nowMs < end) return { session: s, live: true, minutesLeft: Math.ceil((end - nowMs) / 60000) };
  }
  const limit = nowMs + withinDays * 86400000;
  const next = active.find((s) => {
    const start = sessionWindowMs(s)[0];
    return start > nowMs && start <= limit;
  });
  return next ? { session: next, live: false, minutesLeft: Math.ceil((sessionWindowMs(next)[0] - nowMs) / 60000) } : null;
}

/** Chỗ tôi bị xếp hai ca cùng lúc, từ hôm nay (cùng luật quét lịch của ops — findPersonClashes). */
export function myClashes(sessions: LiveSession[], talentId: string | undefined, today: string): PersonClash[] {
  if (!talentId) return [];
  return findPersonClashes(sessions, { from: today }).filter((c) => c.talentId === talentId);
}

const hoursOf = (s: LiveSession, talentId: string): number => {
  if (!hasStaffSegments(s)) return sessionMinutes(s) / 60;
  return (personRoleMinutes(s, talentId, "host") + personRoleMinutes(s, talentId, "co_host")) / 60;
};

export interface LoadSummary {
  count: number;
  /** Giờ theo lịch tôi đứng (theo đoạn khi đổi người giữa ca). */
  hours: number;
}

/** Ca chưa huỷ của tôi từ `from` tới `to` (gồm hai đầu). */
export function loadBetween(mine: LiveSession[], talentId: string, from: string, to: string): LoadSummary {
  const xs = mine.filter((s) => s.status !== "Cancelled" && s.date >= from && s.date <= to);
  return { count: xs.length, hours: xs.reduce((a, s) => a + hoursOf(s, talentId), 0) };
}

export interface MonthSummary {
  done: { count: number; hostCount: number; coCount: number; hostHours: number; coHours: number };
  upcoming: LoadSummary;
}

/** Tháng `month` (YYYY-MM) của tôi: ca đã chạy (tách Host / Trợ live, giờ theo lịch) và ca đã chốt còn lại. Gồm cả ca nạp
 *  bù (tháng cũ chỉ có ca nạp bù — bỏ thì tháng 6–9 thành 0 ca dù người đó đã làm). */
export function monthSummary(sessions: LiveSession[], talentId: string, month: string): MonthSummary {
  const xs = sessions.filter((s) => s.date.startsWith(month) && s.status !== "Cancelled" && isMine(s, talentId));
  const done = xs.filter((s) => s.status === "Completed");
  const out: MonthSummary = { done: { count: done.length, hostCount: 0, coCount: 0, hostHours: 0, coHours: 0 }, upcoming: { count: 0, hours: 0 } };
  for (const s of done) {
    const segs = hasStaffSegments(s);
    const h = segs ? personRoleMinutes(s, talentId, "host") / 60 : s.hostId === talentId ? sessionMinutes(s) / 60 : 0;
    const c = segs ? personRoleMinutes(s, talentId, "co_host") / 60 : s.coHostId === talentId ? sessionMinutes(s) / 60 : 0;
    out.done.hostHours += h;
    out.done.coHours += c;
    if (myRole(s, talentId) === "host") out.done.hostCount++;
    else out.done.coCount++;
  }
  const up = xs.filter((s) => s.status === "Upcoming" || s.status === "Live Now");
  out.upcoming = { count: up.length, hours: up.reduce((a, s) => a + hoursOf(s, talentId), 0) };
  return out;
}

// ---------- Đăng ký ca ----------

export type DayPart = "morning" | "afternoon" | "evening";
export const DAY_PART_LABEL: Record<DayPart, string> = { morning: "Sáng", afternoon: "Chiều", evening: "Tối" };

/** Buổi theo giờ bắt đầu: trước 12h sáng, 12–18h chiều, từ 18h tối. */
export function dayPartOf(startTime: string): DayPart {
  const h = Number(startTime.slice(0, 2));
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

/** Ca đang mở đăng ký từ hôm nay, theo ngày rồi giờ (talent chỉ đăng ký được ca còn mở chưa qua ngày — RLS 0133). */
export function openSlotsFrom(slots: ShiftSlot[], today: string): ShiftSlot[] {
  return slots
    .filter((s) => s.status === "open" && s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

/** Giờ của một ca mở theo lịch. */
export const slotHours = (slot: ShiftSlot): number => sessionMinutes(slot) / 60;
