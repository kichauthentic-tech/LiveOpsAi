import { supabase } from "../supabaseClient";
import { Equipment } from "../../types";

interface DbEquipment {
  id: string;
  qr_code: string;
  name: string;
  category: Equipment["category"];
  model: string;
  assigned_studio_id: string | null;
  status: Equipment["status"];
  last_check_date: string | null;
}

function fromDb(row: DbEquipment): Equipment {
  return {
    id: row.id,
    qrCode: row.qr_code,
    name: row.name,
    category: row.category,
    model: row.model,
    assignedStudioId: row.assigned_studio_id ?? undefined,
    status: row.status,
    lastCheckDate: row.last_check_date ?? ""
  };
}

function toDb(e: Equipment) {
  return {
    qr_code: e.qrCode,
    name: e.name,
    category: e.category,
    model: e.model,
    assigned_studio_id: e.assignedStudioId || null,
    status: e.status,
    last_check_date: e.lastCheckDate || null
  };
}

export async function fetchEquipments(): Promise<Equipment[]> {
  const { data, error } = await supabase.from("equipments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbEquipment[]).map(fromDb);
}

export async function createEquipment(e: Equipment): Promise<Equipment> {
  const { data, error } = await supabase.from("equipments").insert(toDb(e)).select().single();
  if (error) throw error;
  return fromDb(data as DbEquipment);
}

export async function updateEquipment(e: Equipment): Promise<Equipment> {
  const { data, error } = await supabase.from("equipments").update(toDb(e)).eq("id", e.id).select().single();
  if (error) throw error;
  return fromDb(data as DbEquipment);
}

export async function deleteEquipment(id: string): Promise<void> {
  const { error } = await supabase.from("equipments").delete().eq("id", id);
  if (error) throw error;
}
