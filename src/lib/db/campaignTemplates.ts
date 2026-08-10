import { supabase } from "../supabaseClient";
import { CampaignTemplate } from "../../types";

const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbCampaignTemplate {
  id: string;
  brand_id: string | null;
  brand_name: string;
  name: string;
  type: CampaignTemplate["type"];
  target_gmv: number;
  start_day: number;
  end_day: number;
  host_briefing: string;
  active: boolean;
  created_by: string | null;
}

function fromDb(row: DbCampaignTemplate): CampaignTemplate {
  return {
    id: row.id,
    brandId: row.brand_id ?? undefined,
    brandName: row.brand_name,
    name: row.name,
    type: row.type,
    targetGmv: row.target_gmv,
    startDay: row.start_day,
    endDay: row.end_day,
    hostBriefing: row.host_briefing,
    active: row.active,
    createdBy: row.created_by ?? undefined
  };
}

function toDb(t: CampaignTemplate) {
  return {
    brand_id: orNull(t.brandId),
    brand_name: t.brandName ?? "",
    name: t.name,
    type: t.type,
    target_gmv: t.targetGmv,
    start_day: t.startDay,
    end_day: t.endDay,
    host_briefing: t.hostBriefing ?? "",
    active: t.active,
    created_by: orNull(t.createdBy)
  };
}

export async function fetchCampaignTemplates(): Promise<CampaignTemplate[]> {
  const { data, error } = await supabase.from("campaign_templates").select("*").order("start_day", { ascending: true });
  if (error) throw error;
  return (data as DbCampaignTemplate[]).map(fromDb);
}

export async function createCampaignTemplate(t: CampaignTemplate): Promise<CampaignTemplate> {
  const { data, error } = await supabase.from("campaign_templates").insert(toDb(t)).select().single();
  if (error) throw error;
  return fromDb(data as DbCampaignTemplate);
}

export async function updateCampaignTemplate(t: CampaignTemplate): Promise<CampaignTemplate> {
  const { data, error } = await supabase.from("campaign_templates").update(toDb(t)).eq("id", t.id).select().single();
  if (error) throw error;
  return fromDb(data as DbCampaignTemplate);
}

export async function deleteCampaignTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("campaign_templates").delete().eq("id", id);
  if (error) throw error;
}
