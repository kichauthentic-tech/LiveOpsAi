import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { assertAffected } from "./assertAffected";
import { ShiftSlot } from "../../types";
import { LEGACY_PLATFORM } from "../reportPlatform";

const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbShiftSlot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  brand_id: string | null;
  brand_name: string;
  platform: ShiftSlot["platform"];
  studio_id: string | null;
  studio_name: string;
  notes: string;
  status: ShiftSlot["status"];
  session_id: string | null;
  created_by: string | null;
  template_id: string | null;
  plan_id: string | null;
}

const toHhMm = (t: string) => t.slice(0, 5);

function fromDb(row: DbShiftSlot): ShiftSlot {
  return {
    id: row.id,
    date: row.date,
    startTime: toHhMm(row.start_time),
    endTime: toHhMm(row.end_time),
    brandId: row.brand_id ?? undefined,
    brandName: row.brand_name,
    platform: row.platform,
    studioId: row.studio_id ?? undefined,
    studioName: row.studio_name,
    notes: row.notes,
    status: row.status,
    sessionId: row.session_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    templateId: row.template_id ?? undefined,
    planId: row.plan_id ?? undefined
  };
}

function toDb(s: ShiftSlot) {
  return {
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    brand_id: orNull(s.brandId),
    brand_name: s.brandName ?? "",
    platform: s.platform,
    studio_id: orNull(s.studioId),
    studio_name: s.studioName ?? "",
    notes: s.notes ?? "",
    status: s.status,
    session_id: orNull(s.sessionId),
    created_by: orNull(s.createdBy),
    template_id: orNull(s.templateId),
    plan_id: orNull(s.planId)
  };
}

export async function fetchShiftSlots(): Promise<ShiftSlot[]> {
  // Một dòng cho mỗi ca đã xếp — chỉ tăng. Cuộn trang để không âm thầm mất ca khi qua 1.000
  // (xem src/lib/db/fetchAllPages.ts). Xếp ASC nên trần cắt mất đúng các ca MỚI nhất.
  const rows = await fetchAllPages<DbShiftSlot>((from, to) =>
    supabase
      .from("shift_slots")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map(fromDb);
}

// Index idx_shift_slots_natural_key (0088): cùng brand + ngày + giờ + nền tảng đã có ca chưa huỷ.
const isDuplicateSlotError = (e: { code?: string } | null) => e?.code === "23505";

export async function createShiftSlot(s: ShiftSlot): Promise<ShiftSlot> {
  const { data, error } = await supabase.from("shift_slots").insert(toDb(s)).select().single();
  if (isDuplicateSlotError(error)) {
    throw new Error(`${s.brandName || "Brand này"} đã có ca ${s.startTime}-${s.endTime} ngày ${s.date} rồi (chưa huỷ).`);
  }
  if (error) throw error;
  return fromDb(data as DbShiftSlot);
}

/**
 * Mở nhiều ca mở một lần ("Chép khung giờ tuần trước", Điều Phối Lịch Live 25/10) qua RPC create_open_slots (0181): một
 * transaction, bỏ ca trùng khoá tự nhiên, MỘT tin tóm tắt cho mỗi talent thay vì một tin mỗi ca (34 ca ≈ 900 tin trước 0181).
 * DB chưa chạy 0181 ⇒ lỗi PGRST202 (isRosterBackendMissing) — nơi gọi chặn, không rơi về insert từng ca.
 */
export async function createOpenSlots(list: ShiftSlot[], notify = true): Promise<{ created: number; skipped: number; notified: number }> {
  const { data, error } = await supabase.rpc("create_open_slots", {
    p_slots: list.map((s) => ({
      date: s.date,
      start_time: s.startTime,
      end_time: s.endTime,
      brand_id: s.brandId ?? "",
      brand_name: s.brandName ?? "",
      platform: s.platform ?? LEGACY_PLATFORM,
      studio_id: s.studioId ?? "",
      studio_name: s.studioName ?? "",
      notes: s.notes ?? ""
    })),
    p_notify: notify
  });
  if (error) throw error;
  const d = (data as { created?: number; skipped?: number; notified?: number } | null) ?? {};
  return { created: Number(d.created ?? 0), skipped: Number(d.skipped ?? 0), notified: Number(d.notified ?? 0) };
}

// Sinh ca hàng loạt: RPC generate_shift_slots (0088) vẫn tồn tại nhưng app không gọi từ 0090 —
// Kế Hoạch Tháng chốt qua lock_month_plan (tự sinh shift_slots cùng khoá chống trùng).

export async function deleteShiftSlot(id: string): Promise<void> {
  const { data, error } = await supabase.from("shift_slots").delete().eq("id", id).select("id");
  if (error) throw error;
  assertAffected(data, "xoá ca chờ đăng ký");
}

/** Dời ngày/giờ một ca CÒN MỞ (chưa chốt người) — Điều Phối Lịch Live. Ca đã chốt thì dời qua RPC roster_move_session (có lý do). */
export async function updateOpenSlotTime(id: string, v: { date: string; startTime: string; endTime: string }): Promise<ShiftSlot> {
  const { data, error } = await supabase
    .from("shift_slots")
    .update({ date: v.date, start_time: v.startTime, end_time: v.endTime })
    .eq("id", id)
    .eq("status", "open")
    .is("session_id", null)
    .select();
  if (isDuplicateSlotError(error)) throw new Error(`Brand này đã có ca ${v.startTime}-${v.endTime} ngày ${v.date} rồi (chưa huỷ).`);
  if (error) throw error;
  assertAffected(data, "dời giờ ca chờ đăng ký");
  return fromDb((data as DbShiftSlot[])[0]);
}
