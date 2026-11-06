import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { fetchSessionById } from "./sessions";
import type { LiveSession } from "../../types";
import { DEFAULT_ROSTER_RULES, type RosterRules } from "../roster/rules";
import { slotDeadline, type MonthMilestones } from "../roster/milestones";

// Điều Phối Lịch Live (migration 0176): tuần xếp lịch (hạn đăng ký, đã công bố), nháp người cho ca mở, ngưỡng luật, nhật ký đổi lịch sau
// công bố. Đặt hạn / công bố / đổi người / dời giờ chỉ qua RPC (guard + thông báo ở DB); nháp và ngưỡng ghi thẳng bằng RLS.

export interface RosterWeek {
  weekStart: string;
  signupDeadline?: string;
  publishedAt?: string;
}

export interface RosterDraft {
  slotId: string;
  hostId?: string;
  coHostId?: string;
}

export interface RosterChange {
  id: string;
  sessionId?: string;
  kind: "reassign" | "move";
  reason: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedAt: string;
}

/** Migration 0176 chưa chạy: bảng/hàm chưa có ⇒ màn báo "chưa chạy migration 0176" thay vì lỗi lạ. */
export function isRosterBackendMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01";
}

export async function fetchRosterWeeks(fromWeek: string): Promise<RosterWeek[]> {
  const { data, error } = await supabase
    .from("roster_weeks")
    .select("week_start, signup_deadline, published_at")
    .gte("week_start", fromWeek)
    .order("week_start", { ascending: true });
  if (error) throw error;
  return (data as { week_start: string; signup_deadline: string | null; published_at: string | null }[]).map((r) => ({
    weekStart: r.week_start,
    signupDeadline: r.signup_deadline ?? undefined,
    publishedAt: r.published_at ?? undefined
  }));
}

export async function fetchRosterDrafts(): Promise<RosterDraft[]> {
  // Nháp chỉ tồn tại tới lúc công bố (RPC xoá) — vài trăm dòng mỗi tháng, không cần phân trang.
  const { data, error } = await supabase.from("roster_drafts").select("slot_id, host_id, co_host_id").order("slot_id").limit(1000);
  if (error) throw error;
  return (data as { slot_id: string; host_id: string | null; co_host_id: string | null }[]).map((r) => ({
    slotId: r.slot_id,
    hostId: r.host_id ?? undefined,
    coHostId: r.co_host_id ?? undefined
  }));
}

/** Ghi nháp người cho một ca mở. Cả hai vai trống ⇒ xoá dòng nháp. */
export async function saveRosterDraft(d: RosterDraft, userId: string | undefined): Promise<void> {
  if (!d.hostId && !d.coHostId) {
    const { error } = await supabase.from("roster_drafts").delete().eq("slot_id", d.slotId);
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase
    .from("roster_drafts")
    .upsert(
      { slot_id: d.slotId, host_id: d.hostId ?? null, co_host_id: d.coHostId ?? null, updated_by: userId ?? null, updated_at: new Date().toISOString() },
      { onConflict: "slot_id" }
    )
    .select("slot_id");
  if (error) throw error;
  assertAffected(data, "lưu nháp người cho ca");
}

export async function saveRosterDrafts(rows: RosterDraft[], userId: string | undefined): Promise<void> {
  const keep = rows.filter((d) => d.hostId || d.coHostId);
  if (keep.length > 0) {
    const { data, error } = await supabase
      .from("roster_drafts")
      .upsert(
        keep.map((d) => ({ slot_id: d.slotId, host_id: d.hostId ?? null, co_host_id: d.coHostId ?? null, updated_by: userId ?? null, updated_at: new Date().toISOString() })),
        { onConflict: "slot_id" }
      )
      .select("slot_id");
    if (error) throw error;
    assertAffected(data, "lưu nháp người cho ca");
  }
  const drop = rows.filter((d) => !d.hostId && !d.coHostId).map((d) => d.slotId);
  if (drop.length > 0) {
    const { error } = await supabase.from("roster_drafts").delete().in("slot_id", drop);
    if (error) throw error;
  }
}

interface DbRules {
  max_week_hours: number;
  warn_week_hours: number;
  min_rest_hours: number;
  late_end_time: string;
  max_day_hours: number;
  max_streak_days: number;
  min_room_change_minutes: number;
}

export async function fetchRosterRules(): Promise<RosterRules> {
  const { data, error } = await supabase.from("roster_rules").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_ROSTER_RULES;
  const r = data as DbRules;
  return {
    maxWeekHours: Number(r.max_week_hours),
    warnWeekHours: Number(r.warn_week_hours),
    minRestHours: Number(r.min_rest_hours),
    lateEndTime: r.late_end_time.slice(0, 5),
    maxDayHours: Number(r.max_day_hours),
    maxStreakDays: Number(r.max_streak_days),
    minRoomChangeMinutes: Number(r.min_room_change_minutes)
  };
}

export async function updateRosterRules(r: RosterRules, userId: string | undefined): Promise<void> {
  const { data, error } = await supabase
    .from("roster_rules")
    .update({
      max_week_hours: r.maxWeekHours,
      warn_week_hours: r.warnWeekHours,
      min_rest_hours: r.minRestHours,
      late_end_time: r.lateEndTime,
      max_day_hours: r.maxDayHours,
      max_streak_days: r.maxStreakDays,
      min_room_change_minutes: r.minRoomChangeMinutes,
      updated_by: userId ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", 1)
    .select("id");
  if (error) throw error;
  assertAffected(data, "lưu ngưỡng luật lịch");
}

export async function fetchRosterChanges(fromIso: string): Promise<RosterChange[]> {
  const { data, error } = await supabase
    .from("roster_changes")
    .select("id, session_id, kind, reason, before, after, changed_at")
    .gte("changed_at", fromIso)
    .order("changed_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data as { id: string; session_id: string | null; kind: RosterChange["kind"]; reason: string; before: Record<string, unknown>; after: Record<string, unknown>; changed_at: string }[]).map((r) => ({
    id: r.id,
    sessionId: r.session_id ?? undefined,
    kind: r.kind,
    reason: r.reason,
    before: r.before,
    after: r.after,
    changedAt: r.changed_at
  }));
}

/** Mốc lịch của một tháng (0180 hạn đợt 1 + 0200 hạn đợt 2 và 2 ngày chốt lịch) — xem lib/roster/milestones.ts. */
export type RosterMonth = MonthMilestones;

interface DbRosterMonth {
  month: string;
  signup_deadline: string | null;
  signup_deadline_2?: string | null;
  publish_by_1?: string | null;
  publish_by_2?: string | null;
}

/** Mốc theo THÁNG. Chưa chạy 0180 ⇒ lỗi PGRST205 (isRosterBackendMissing); chưa chạy 0200 ⇒ đọc lại chỉ hạn đợt 1. */
export async function fetchRosterMonths(fromMonth: string): Promise<RosterMonth[]> {
  const read = (cols: string) => supabase.from("roster_months").select(cols).gte("month", `${fromMonth}-01`).order("month");
  let res = await read("month, signup_deadline, signup_deadline_2, publish_by_1, publish_by_2");
  if (res.error?.code === "42703") res = await read("month, signup_deadline");
  if (res.error) throw res.error;
  return (res.data as unknown as DbRosterMonth[]).map((r) => ({
    month: r.month.slice(0, 7),
    signupDeadline: r.signup_deadline ?? undefined,
    signupDeadline2: r.signup_deadline_2 ?? undefined,
    publishBy1: r.publish_by_1 ?? undefined,
    publishBy2: r.publish_by_2 ?? undefined
  }));
}

/** Đặt (hoặc xoá, deadline = null) hạn đăng ký của THÁNG — một hạn cho cả tháng (dùng khi DB chưa chạy 0200). */
export async function setRosterMonthDeadline(month: string, deadlineIso: string | null): Promise<{ notified: number; openSlots: number }> {
  const { data, error } = await supabase.rpc("set_roster_month_deadline", { p_month: `${month}-01`, p_deadline: deadlineIso });
  if (error) throw error;
  const d = (data as { notified?: number; open_slots?: number } | null) ?? {};
  return { notified: Number(d.notified ?? 0), openSlots: Number(d.open_slots ?? 0) };
}

/**
 * Đặt 4 mốc của tháng (0200): hạn đăng ký đợt 1 (ca 1–15), đợt 2 (ca 16–cuối), ngày chốt lịch mỗi đợt. DB báo mỗi host/trợ MỘT tin
 * khi có hạn mới ở tương lai và tháng còn ca mở. Chưa chạy 0200 ⇒ PGRST202 (isRosterBackendMissing).
 */
export async function setRosterMonthMilestones(month: string, m: { deadline1: string | null; deadline2: string | null; publishBy1: string | null; publishBy2: string | null }): Promise<{ notified: number; openSlots: number }> {
  const { data, error } = await supabase.rpc("set_roster_month_milestones", {
    p_month: `${month}-01`,
    p_deadline_1: m.deadline1,
    p_deadline_2: m.deadline2,
    p_publish_1: m.publishBy1,
    p_publish_2: m.publishBy2
  });
  if (error) throw error;
  const d = (data as { notified?: number; open_slots?: number } | null) ?? {};
  return { notified: Number(d.notified ?? 0), openSlots: Number(d.open_slots ?? 0) };
}

/** Hạn đăng ký đang áp cho một ca, đúng như DB chặn (0200): hạn riêng của ca → hạn đợt theo ngày → hạn tuần cũ (lấy hạn sớm hơn). */
export function signupDeadlineOf(slot: { date: string; signupDeadline?: string }, months: readonly RosterMonth[], weeks: readonly RosterWeek[], weekStartOf: (d: string) => string): string | undefined {
  const w = weeks.find((x) => x.weekStart === weekStartOf(slot.date))?.signupDeadline;
  return slotDeadline(slot.date, months.find((x) => x.month === slot.date.slice(0, 7)), w, slot.signupDeadline);
}

/** Đặt (hoặc xoá, deadline = null) hạn đăng ký của tuần. DB báo talent khi đặt một hạn mới ở tương lai. Trả về số tin đã gửi. */
export async function setRosterDeadline(weekStart: string, deadlineIso: string | null): Promise<number> {
  const { data, error } = await supabase.rpc("set_roster_deadline", { p_week_start: weekStart, p_deadline: deadlineIso });
  if (error) throw error;
  return Number((data as { notified?: number } | null)?.notified ?? 0);
}

/** Công bố tuần: chốt mọi ca nháp trong MỘT transaction (lỗi một ca là không ca nào được chốt), gửi mỗi người một tin. */
export async function publishRosterWeek(weekStart: string): Promise<{ published: number; notified: number }> {
  const { data, error } = await supabase.rpc("publish_roster_week", { p_week_start: weekStart });
  if (error) throw error;
  const d = (data ?? {}) as { published?: number; notified?: number };
  return { published: Number(d.published ?? 0), notified: Number(d.notified ?? 0) };
}

/** Đổi người của ca đã lên lịch (bắt buộc lý do; DB chặn quá giờ/tuần, trùng người, ca đã chia đoạn). */
export async function rosterReassign(sessionId: string, hostId: string, coHostId: string | null, reason: string): Promise<LiveSession> {
  const { error } = await supabase.rpc("roster_reassign", { p_session_id: sessionId, p_host_id: hostId, p_co_host_id: coHostId, p_reason: reason });
  if (error) throw error;
  return fetchSessionById(sessionId);
}

/** Dời ngày/giờ ca đã lên lịch (bắt buộc lý do; ca đã có số không dời). */
export async function rosterMoveSession(sessionId: string, date: string, startTime: string, endTime: string, reason: string): Promise<LiveSession> {
  const { error } = await supabase.rpc("roster_move_session", { p_session_id: sessionId, p_date: date, p_start: startTime, p_end: endTime, p_reason: reason });
  if (error) throw error;
  return fetchSessionById(sessionId);
}
