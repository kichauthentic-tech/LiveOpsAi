import { supabase } from "../supabaseClient";
import { Campaign } from "../../types";

const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbCampaign {
  id: string;
  brand_id: string;
  brand_name: string;
  name: string;
  type: Campaign["type"];
  target_gmv: number;
  start_date: string;
  end_date: string;
  status: Campaign["status"];
  host_briefing: string;
  created_by: string | null;
  approval_status: Campaign["approvalStatus"];
  sent_at: string | null;
  approved_at: string | null;
}

function fromDb(row: DbCampaign): Campaign {
  return {
    id: row.id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    name: row.name,
    type: row.type,
    targetGmv: row.target_gmv,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    hostBriefing: row.host_briefing,
    createdBy: row.created_by ?? undefined,
    approvalStatus: row.approval_status,
    sentAt: row.sent_at ?? undefined,
    approvedAt: row.approved_at ?? undefined
  };
}

function toDb(c: Campaign) {
  return {
    brand_id: c.brandId,
    brand_name: c.brandName,
    name: c.name,
    type: c.type,
    target_gmv: c.targetGmv,
    start_date: c.startDate,
    end_date: c.endDate,
    status: c.status,
    host_briefing: c.hostBriefing,
    created_by: orNull(c.createdBy),
    approval_status: c.approvalStatus,
    sent_at: orNull(c.sentAt),
    approved_at: orNull(c.approvedAt)
  };
}

export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase.from("campaigns").select("*").order("start_date", { ascending: false });
  if (error) throw error;
  return (data as DbCampaign[]).map(fromDb);
}

export async function createCampaign(c: Campaign): Promise<Campaign> {
  const { data, error } = await supabase.from("campaigns").insert(toDb(c)).select().single();
  if (error) throw error;
  return fromDb(data as DbCampaign);
}

export async function updateCampaign(c: Campaign): Promise<Campaign> {
  const { data, error } = await supabase.from("campaigns").update(toDb(c)).eq("id", c.id).select().single();
  if (error) throw error;
  return fromDb(data as DbCampaign);
}

export async function deleteCampaign(id: string): Promise<void> {
  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) throw error;
}

// Ops gửi campaign cho brand duyệt — partial update, không đụng field khác.
export async function sendCampaignForApproval(id: string): Promise<Campaign> {
  const { data, error } = await supabase
    .from("campaigns")
    .update({ approval_status: "sent_for_approval", sent_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbCampaign);
}

// Brand duyệt hoặc yêu cầu sửa — partial update, khớp đúng 2 hướng RLS
// "campaigns_update_approval_brand" cho phép (xem migration 0017).
export async function respondToCampaignApproval(
  id: string,
  decision: "approved" | "revision_requested"
): Promise<Campaign> {
  const patch: Record<string, unknown> = { approval_status: decision };
  if (decision === "approved") patch.approved_at = new Date().toISOString();
  const { data, error } = await supabase.from("campaigns").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbCampaign);
}
