import { supabase } from "../supabaseClient";
import { CampaignRevisionNote } from "../../types";

interface DbCampaignRevisionNote {
  id: string;
  campaign_id: string;
  note: string;
  requested_by: string | null;
  requested_by_name: string;
  created_at: string;
}

function fromDb(row: DbCampaignRevisionNote): CampaignRevisionNote {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    note: row.note,
    requestedBy: row.requested_by ?? undefined,
    requestedByName: row.requested_by_name,
    createdAt: row.created_at
  };
}

export interface CreateCampaignRevisionNoteInput {
  campaignId: string;
  note: string;
  requestedBy?: string;
  requestedByName: string;
}

// Append-only, giống pattern auditLogs.ts — không có update/delete.
export async function fetchCampaignRevisionNotes(): Promise<CampaignRevisionNote[]> {
  const { data, error } = await supabase
    .from("campaign_revision_notes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbCampaignRevisionNote[]).map(fromDb);
}

export async function createCampaignRevisionNote(
  input: CreateCampaignRevisionNoteInput
): Promise<CampaignRevisionNote> {
  const { data, error } = await supabase
    .from("campaign_revision_notes")
    .insert({
      campaign_id: input.campaignId,
      note: input.note,
      requested_by: input.requestedBy || null,
      requested_by_name: input.requestedByName
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbCampaignRevisionNote);
}
