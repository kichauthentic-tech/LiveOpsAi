import { supabase } from "../supabaseClient";
import { CoFundedVoucher } from "../../types";

interface DbCoFundedVoucher {
  id: string;
  session_id: string;
  brand_id: string;
  voucher_code: string;
  description: string;
  total_value: number;
  brand_contribution_pct: number;
  agency_contribution_pct: number;
  platform_contribution_pct: number;
  approval_status: CoFundedVoucher["approvalStatus"];
  sent_at: string | null;
  approved_at: string | null;
  revision_note: string;
  created_by: string | null;
}

function fromDb(row: DbCoFundedVoucher): CoFundedVoucher {
  return {
    id: row.id,
    sessionId: row.session_id,
    brandId: row.brand_id,
    voucherCode: row.voucher_code,
    description: row.description,
    totalValue: row.total_value,
    brandContributionPct: row.brand_contribution_pct,
    agencyContributionPct: row.agency_contribution_pct,
    platformContributionPct: row.platform_contribution_pct,
    approvalStatus: row.approval_status,
    sentAt: row.sent_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    revisionNote: row.revision_note ?? "",
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchCoFundedVouchers(): Promise<CoFundedVoucher[]> {
  const { data, error } = await supabase.from("co_funded_vouchers").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbCoFundedVoucher[]).map(fromDb);
}

export async function createCoFundedVoucher(
  v: Pick<CoFundedVoucher, "sessionId" | "brandId" | "voucherCode" | "description" | "totalValue" | "brandContributionPct" | "agencyContributionPct" | "platformContributionPct"> & {
    createdBy?: string;
  }
): Promise<CoFundedVoucher> {
  const { data, error } = await supabase
    .from("co_funded_vouchers")
    .insert({
      session_id: v.sessionId,
      brand_id: v.brandId,
      voucher_code: v.voucherCode,
      description: v.description,
      total_value: v.totalValue,
      brand_contribution_pct: v.brandContributionPct,
      agency_contribution_pct: v.agencyContributionPct,
      platform_contribution_pct: v.platformContributionPct,
      created_by: v.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbCoFundedVoucher);
}

export async function updateCoFundedVoucher(
  id: string,
  patch: Partial<
    Pick<
      CoFundedVoucher,
      "sessionId" | "voucherCode" | "description" | "totalValue" | "brandContributionPct" | "agencyContributionPct" | "platformContributionPct"
    >
  >
): Promise<CoFundedVoucher> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.sessionId !== undefined) row.session_id = patch.sessionId;
  if (patch.voucherCode !== undefined) row.voucher_code = patch.voucherCode;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.totalValue !== undefined) row.total_value = patch.totalValue;
  if (patch.brandContributionPct !== undefined) row.brand_contribution_pct = patch.brandContributionPct;
  if (patch.agencyContributionPct !== undefined) row.agency_contribution_pct = patch.agencyContributionPct;
  if (patch.platformContributionPct !== undefined) row.platform_contribution_pct = patch.platformContributionPct;

  const { data, error } = await supabase.from("co_funded_vouchers").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbCoFundedVoucher);
}

export async function deleteCoFundedVoucher(id: string): Promise<void> {
  const { error } = await supabase.from("co_funded_vouchers").delete().eq("id", id);
  if (error) throw error;
}

// Ops gửi voucher cho brand duyệt — partial update, không đụng field khác.
export async function sendVoucherForApproval(id: string): Promise<CoFundedVoucher> {
  const { data, error } = await supabase
    .from("co_funded_vouchers")
    .update({ approval_status: "sent_for_approval", sent_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbCoFundedVoucher);
}

// Brand duyệt (= cấp quyền áp trực tiếp) hoặc yêu cầu sửa — khớp đúng 2 hướng
// RLS "co_funded_vouchers_update_approval_brand" (xem migration 0028).
export async function respondToVoucherApproval(
  id: string,
  decision: "approved" | "revision_requested",
  revisionNote?: string
): Promise<CoFundedVoucher> {
  const patch: Record<string, unknown> = { approval_status: decision };
  if (decision === "approved") patch.approved_at = new Date().toISOString();
  if (decision === "revision_requested") patch.revision_note = revisionNote ?? "";
  const { data, error } = await supabase.from("co_funded_vouchers").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbCoFundedVoucher);
}
