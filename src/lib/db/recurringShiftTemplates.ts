import { supabase } from "../supabaseClient";
import { RecurringShiftTemplate } from "../../types";

const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbRecurringShiftTemplate {
  id: string;
  weekday: number;
  brand_id: string | null;
  brand_name: string;
  platform: RecurringShiftTemplate["platform"];
  start_time: string;
  end_time: string;
  studio_id: string | null;
  studio_name: string;
  notes: string;
  active: boolean;
  created_by: string | null;
  campaign_id: string | null;
}

const toHhMm = (t: string) => t.slice(0, 5);

function fromDb(row: DbRecurringShiftTemplate): RecurringShiftTemplate {
  return {
    id: row.id,
    weekday: row.weekday,
    brandId: row.brand_id ?? undefined,
    brandName: row.brand_name,
    platform: row.platform,
    startTime: toHhMm(row.start_time),
    endTime: toHhMm(row.end_time),
    studioId: row.studio_id ?? undefined,
    studioName: row.studio_name,
    notes: row.notes,
    active: row.active,
    createdBy: row.created_by ?? undefined,
    campaignId: row.campaign_id ?? undefined
  };
}

function toDb(t: RecurringShiftTemplate) {
  return {
    weekday: t.weekday,
    brand_id: orNull(t.brandId),
    brand_name: t.brandName ?? "",
    platform: t.platform,
    start_time: t.startTime,
    end_time: t.endTime,
    studio_id: orNull(t.studioId),
    studio_name: t.studioName ?? "",
    notes: t.notes ?? "",
    active: t.active,
    created_by: orNull(t.createdBy),
    campaign_id: orNull(t.campaignId)
  };
}

export async function fetchRecurringShiftTemplates(): Promise<RecurringShiftTemplate[]> {
  const { data, error } = await supabase
    .from("recurring_shift_templates")
    .select("*")
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data as DbRecurringShiftTemplate[]).map(fromDb);
}

export async function createRecurringShiftTemplate(t: RecurringShiftTemplate): Promise<RecurringShiftTemplate> {
  const { data, error } = await supabase.from("recurring_shift_templates").insert(toDb(t)).select().single();
  if (error) throw error;
  return fromDb(data as DbRecurringShiftTemplate);
}

export async function updateRecurringShiftTemplate(t: RecurringShiftTemplate): Promise<RecurringShiftTemplate> {
  const { data, error } = await supabase.from("recurring_shift_templates").update(toDb(t)).eq("id", t.id).select().single();
  if (error) throw error;
  return fromDb(data as DbRecurringShiftTemplate);
}

export async function deleteRecurringShiftTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("recurring_shift_templates").delete().eq("id", id);
  if (error) throw error;
}
