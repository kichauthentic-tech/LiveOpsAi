import { supabase } from "../supabaseClient";
import { ShiftSlot } from "../../types";
import { PlannedSlot } from "../scheduling/planMonthSlots";

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

// Sinh hàng loạt ca từ quy tắc lặp — RPC generate_shift_slots (0088) dedupe ở server theo khoá
// tự nhiên brand|ngày|giờ|nền tảng và bỏ qua ca đã có; trả về đúng những dòng vừa chèn để cộng vào
// state. Không insert thẳng nữa: 2 ops bấm cùng lúc / bấm 2 lần đều không trùng.
export interface GenerateSlotsResult {
  inserted: ShiftSlot[];
  skippedExisting: number;
}

export async function generateShiftSlots(slots: PlannedSlot[]): Promise<GenerateSlotsResult> {
  if (slots.length === 0) return { inserted: [], skippedExisting: 0 };
  const payload = slots.map((s) => ({
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    brand_id: orNull(s.brandId),
    brand_name: s.brandName,
    platform: s.platform,
    studio_id: orNull(s.studioId),
    studio_name: s.studioName,
    notes: s.notes,
    template_id: s.templateId
  }));
  const { data, error } = await supabase.rpc("generate_shift_slots", { p_slots: payload });
  if (error) throw error;
  const r = data as { inserted: number; skipped_existing: number; rows: DbShiftSlot[] };
  return { inserted: (r.rows ?? []).map(fromDb), skippedExisting: r.skipped_existing };
}

export async function updateShiftSlot(s: ShiftSlot): Promise<ShiftSlot> {
  const { data, error } = await supabase.from("shift_slots").update(toDb(s)).eq("id", s.id).select().single();
  if (error) throw error;
  return fromDb(data as DbShiftSlot);
}

export async function deleteShiftSlot(id: string): Promise<void> {
  const { error } = await supabase.from("shift_slots").delete().eq("id", id);
  if (error) throw error;
}
