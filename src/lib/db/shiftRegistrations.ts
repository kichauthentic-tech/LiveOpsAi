import { supabase } from "../supabaseClient";
import { ShiftRegistration } from "../../types";

interface DbShiftRegistration {
  id: string;
  slot_id: string;
  talent_id: string;
  registered_at: string;
}

function fromDb(row: DbShiftRegistration): ShiftRegistration {
  return {
    id: row.id,
    slotId: row.slot_id,
    talentId: row.talent_id,
    registeredAt: row.registered_at
  };
}

// Presence/absence of a row is the whole model — no update, only insert
// ("đăng ký") and delete ("hủy đăng ký"), same shape as auditLogs.ts.
export async function fetchShiftRegistrations(): Promise<ShiftRegistration[]> {
  const { data, error } = await supabase.from("session_availability").select("*");
  if (error) throw error;
  return (data as DbShiftRegistration[]).map(fromDb);
}

export async function registerForSlot(slotId: string, talentId: string): Promise<ShiftRegistration> {
  const { data, error } = await supabase
    .from("session_availability")
    .insert({ slot_id: slotId, talent_id: talentId })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbShiftRegistration);
}

export async function unregisterFromSlot(slotId: string, talentId: string): Promise<void> {
  const { error } = await supabase
    .from("session_availability")
    .delete()
    .eq("slot_id", slotId)
    .eq("talent_id", talentId);
  if (error) throw error;
}
