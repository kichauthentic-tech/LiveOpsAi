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
  campaign_id: string | null;
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
    campaignId: row.campaign_id ?? undefined
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
    campaign_id: orNull(s.campaignId)
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

export async function createShiftSlot(s: ShiftSlot): Promise<ShiftSlot> {
  const { data, error } = await supabase.from("shift_slots").insert(toDb(s)).select().single();
  if (error) throw error;
  return fromDb(data as DbShiftSlot);
}

// Sinh hàng loạt ca từ quy tắc lặp (xem recurringShiftTemplates.ts) — 1 lần
// insert cho cả tháng thay vì gọi createShiftSlot lặp lại từng ca.
export async function createShiftSlots(slots: ShiftSlot[]): Promise<ShiftSlot[]> {
  if (slots.length === 0) return [];
  const { data, error } = await supabase.from("shift_slots").insert(slots.map(toDb)).select();
  if (error) throw error;
  return (data as DbShiftSlot[]).map(fromDb);
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
