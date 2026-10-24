import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { fetchSessionById } from "./sessions";
import type { LiveSession } from "../../types";
import { DEFAULT_ROSTER_RULES, type RosterRules } from "../roster/rules";

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

export interface RosterMonth {
  /** "YYYY-MM" */
  month: string;
  signupDeadline?: string;
}

/** Hạn đăng ký theo THÁNG (0180, user chốt 24/10: một hạn cho cả tháng). Chưa chạy 0180 ⇒ lỗi PGRST205 (isRosterBackendMissing). */
export async function fetchRosterMonths(fromMonth: string): Promise<RosterMonth[]> {
  const { data, error } = await supabase.from("roster_months").select("month, signup_deadline").gte("month", `${fromMonth}-01`).order("month");
  if (error) throw error;
  return (data as { month: string; signup_deadline: string | null }[]).map((r) => ({ month: r.month.slice(0, 7), signupDeadline: r.signup_deadline ?? undefined }));
}

/** Đặt (hoặc xoá, deadline = null) hạn đăng ký của THÁNG. DB báo mỗi host/trợ một tin khi đặt một hạn mới ở tương lai và tháng còn ca mở. */
export async function setRosterMonthDeadline(month: string, deadlineIso: string | null): Promise<{ notified: number; openSlots: number }> {
  const { data, error } = await supabase.rpc("set_roster_month_deadline", { p_month: `${month}-01`, p_deadline: deadlineIso });
  if (error) throw error;
  const d = (data as { notified?: number; open_slots?: number } | null) ?? {};
  return { notified: Number(d.notified ?? 0), openSlots: Number(d.open_slots ?? 0) };
}

/** Hạn đăng ký đang áp cho một ngày: hạn THÁNG (0180) hoặc hạn tuần cũ (0176, không còn UI đặt) — lấy hạn sớm hơn, đúng như DB chặn. */
export function signupDeadlineOf(date: string, months: readonly RosterMonth[], weeks: readonly RosterWeek[], weekStartOf: (d: string) => string): string | undefined {
  const m = months.find((x) => x.month === date.slice(0, 7))?.signupDeadline;
  const w = weeks.find((x) => x.weekStart === weekStartOf(date))?.signupDeadline;
  if (!m) return w;
  if (!w) return m;
  return new Date(m) <= new Date(w) ? m : w;
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
