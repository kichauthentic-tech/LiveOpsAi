import { supabase } from "../supabaseClient";
import { ShiftSlot } from "../../types";

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
    templateId: row.template_id ?? undefined
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
    template_id: orNull(s.templateId)
  };
}

export async function fetchShiftSlots(): Promise<ShiftSlot[]> {
  const { data, error } = await supabase
    .from("shift_slots")
    .select("*")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data as DbShiftSlot[]).map(fromDb);
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

// Sinh ca hàng loạt: RPC generate_shift_slots (0088) vẫn tồn tại nhưng app không gọi từ 0090 —
// Kế Hoạch Tháng chốt qua lock_month_plan (tự sinh shift_slots cùng khoá chống trùng).

export async function updateShiftSlot(s: ShiftSlot): Promise<ShiftSlot> {
  const { data, error } = await supabase.from("shift_slots").update(toDb(s)).eq("id", s.id).select().single();
  if (error) throw error;
  return fromDb(data as DbShiftSlot);
}

export async function deleteShiftSlot(id: string): Promise<void> {
  const { error } = await supabase.from("shift_slots").delete().eq("id", id);
  if (error) throw error;
}
