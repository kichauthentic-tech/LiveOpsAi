import { supabase } from "../supabaseClient";
import { Studio } from "../../types";

// `??` only catches null/undefined, not "" — an empty string sent to this uuid FK
// column fails with "invalid input syntax for type uuid" instead of clearing to NULL.
const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbStudio {
  id: string;
  name: string;
  room_number: string;
  capacity: number;
  theme: string;
  status: Studio["status"];
  current_session_id: string | null;
  daily_available_hours: number;
}

function fromDb(row: DbStudio): Studio {
  return {
    id: row.id,
    name: row.name,
    roomNumber: row.room_number,
    capacity: row.capacity,
    theme: row.theme,
    status: row.status,
    currentSessionId: row.current_session_id ?? undefined,
    equipmentCount: 0, // computed client-side from the equipments list
    // Fallback nếu chưa áp dụng migration 0020 (cột chưa tồn tại, select("*") không lỗi mà chỉ thiếu field)
    dailyAvailableHours: row.daily_available_hours ?? 16
  };
}

function toDb(s: Studio) {
  return {
    name: s.name,
    room_number: s.roomNumber,
    capacity: s.capacity,
    theme: s.theme,
    status: s.status,
    current_session_id: orNull(s.currentSessionId),
    daily_available_hours: s.dailyAvailableHours
  };
}

export async function fetchStudios(): Promise<Studio[]> {
  const { data, error } = await supabase.from("studios").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbStudio[]).map(fromDb);
}

export async function createStudio(s: Studio): Promise<Studio> {
  const { data, error } = await supabase.from("studios").insert(toDb(s)).select().single();
  if (error) throw error;
  return fromDb(data as DbStudio);
}

export async function updateStudio(s: Studio): Promise<Studio> {
  const { data, error } = await supabase.from("studios").update(toDb(s)).eq("id", s.id).select().single();
  if (error) throw error;
  return fromDb(data as DbStudio);
}

export async function deleteStudio(id: string): Promise<void> {
  const { error } = await supabase.from("studios").delete().eq("id", id);
  if (error) throw error;
}
