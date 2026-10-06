import { supabase } from "../supabaseClient";
import { BrandContract, BrandMonthlyCommitment, GenerateCommitmentsResult } from "../../types";
import { prefetchable } from "./prefetch";
import { platformOf, type ReportPlatform } from "../reportPlatform";

// Lớp cam kết hợp đồng (migration 0081). RLS chỉ mở cho ceo/admin/operations — talent và role
// brand query thẳng 2 bảng này sẽ ra rỗng chứ không ra lỗi, nên đừng dựa vào "fetch được = có
// quyền" ở phía UI, luôn gate bằng nav perm như các module thương mại khác.

interface DbBrandContract {
  id: string;
  brand_id: string;
  contract_code: string | null;
  start_month: string;
  end_month: string | null;
  monthly_hours: number;
  monthly_gmv: number | null;
  /** 0141 — thiếu (DB chưa chạy 0141) = TikTok. */
  platform?: ReportPlatform | null;
  status: BrandContract["status"];
  note: string | null;
}

interface DbBrandMonthlyCommitment {
  id: string;
  brand_id: string;
  contract_id: string | null;
  period_month: string;
  committed_hours: number;
  committed_gmv: number | null;
  platform?: ReportPlatform | null;
  is_override: boolean;
  note: string | null;
}

function contractFromDb(row: DbBrandContract): BrandContract {
  return {
    id: row.id,
    brandId: row.brand_id,
    contractCode: row.contract_code ?? undefined,
    startMonth: row.start_month,
    endMonth: row.end_month ?? undefined,
    monthlyHours: row.monthly_hours,
    monthlyGmv: row.monthly_gmv ?? undefined,
    platform: platformOf(row),
    status: row.status,
    note: row.note ?? undefined
  };
}

function commitmentFromDb(row: DbBrandMonthlyCommitment): BrandMonthlyCommitment {
  return {
    id: row.id,
    brandId: row.brand_id,
    contractId: row.contract_id ?? undefined,
    periodMonth: row.period_month,
    platform: platformOf(row),
    committedHours: row.committed_hours,
    committedGmv: row.committed_gmv ?? undefined,
    isOverride: row.is_override,
    note: row.note ?? undefined
  };
}

export async function fetchBrandContracts(): Promise<BrandContract[]> {
  const { data, error } = await supabase
    .from("brand_contracts")
    .select("*")
    .order("start_month", { ascending: false });
  if (error) throw error;
  return ((data as DbBrandContract[]) ?? []).map(contractFromDb);
}

export async function fetchBrandMonthlyCommitments(): Promise<BrandMonthlyCommitment[]> {
  const { data, error } = await supabase
    .from("brand_monthly_commitments")
    .select("*")
    .order("period_month", { ascending: true });
  if (error) throw error;
  return ((data as DbBrandMonthlyCommitment[]) ?? []).map(commitmentFromDb);
}

export async function createBrandContract(input: Omit<BrandContract, "id">): Promise<BrandContract> {
  const { data, error } = await supabase
    .from("brand_contracts")
    .insert({
      brand_id: input.brandId,
      contract_code: input.contractCode || null,
      start_month: input.startMonth,
      end_month: input.endMonth || null,
      monthly_hours: input.monthlyHours,
      monthly_gmv: input.monthlyGmv ?? null,
      platform: platformOf(input),
      status: input.status,
      note: input.note || null
    })
    .select()
    .single();
  if (error) throw error;
  return contractFromDb(data as DbBrandContract);
}

export async function updateBrandContract(id: string, input: Omit<BrandContract, "id" | "brandId">): Promise<BrandContract> {
  const { data, error } = await supabase
    .from("brand_contracts")
    .update({
      contract_code: input.contractCode || null,
      start_month: input.startMonth,
      end_month: input.endMonth || null,
      monthly_hours: input.monthlyHours,
      monthly_gmv: input.monthlyGmv ?? null,
      platform: platformOf(input),
      status: input.status,
      note: input.note || null
    })
    .eq("id", id)
    .select();
  if (error) throw error;
  // RLS lọc còn 0 dòng thì PostgREST trả 204 không kèm error — phải tự đếm, nếu không thao tác bị
  // chặn vẫn "báo thành công" (quy ước bắt buộc, xem WORKSPACE_DESIGN.md).
  const rows = (data as DbBrandContract[]) ?? [];
  if (rows.length === 0) throw new Error("Không sửa được hợp đồng — có thể bạn không đủ quyền.");
  return contractFromDb(rows[0]);
}

export async function deleteBrandContract(id: string): Promise<void> {
  const { data, error } = await supabase.from("brand_contracts").delete().eq("id", id).select();
  if (error) throw error;
  if (((data as DbBrandContract[]) ?? []).length === 0) {
    throw new Error("Không xoá được hợp đồng — có thể bạn không đủ quyền.");
  }
}

// Sinh/cập nhật các dòng cam kết theo tháng từ 1 hợp đồng. throughMonth ("YYYY-MM-01") bắt buộc
// khi hợp đồng chưa có tháng kết thúc — DB tự raise nếu thiếu.
export async function generateContractCommitments(
  contractId: string,
  throughMonth?: string
): Promise<GenerateCommitmentsResult> {
  const { data, error } = await supabase.rpc("generate_contract_commitments", {
    p_contract_id: contractId,
    p_through_month: throughMonth ?? null
  });
  if (error) throw error;
  const r = (data ?? {}) as Record<string, number>;
  return {
    inserted: r.inserted ?? 0,
    updated: r.updated ?? 0,
    skippedOverride: r.skipped_override ?? 0,
    skippedOtherContract: r.skipped_other_contract ?? 0,
    removed: r.removed ?? 0
  };
}

// Ghi cam kết của MỘT tháng — chỉ Kế Hoạch Tháng gọi (gộp cấu hình 06/10). `isOverride` do NƠI GỌI tính bằng cách so
// với điều khoản hợp đồng phủ tháng đó: khác ⇒ true (sinh lại từ hợp đồng sẽ không ghi đè), bằng ⇒ false + gắn
// `contractId` (sửa hợp đồng ở CRM thì tháng này đổi theo). Không có hợp đồng ⇒ luôn là số sửa riêng.
export async function upsertMonthlyCommitment(input: {
  brandId: string;
  periodMonth: string;
  platform?: ReportPlatform;
  committedHours: number;
  committedGmv?: number;
  contractId?: string;
  isOverride: boolean;
  note?: string;
}): Promise<BrandMonthlyCommitment> {
  const { data, error } = await supabase
    .from("brand_monthly_commitments")
    .upsert(
      {
        brand_id: input.brandId,
        period_month: input.periodMonth,
        platform: platformOf(input),
        committed_hours: input.committedHours,
        committed_gmv: input.committedGmv ?? null,
        contract_id: input.contractId ?? null,
        note: input.note || null,
        is_override: input.isOverride || !input.contractId
      },
      { onConflict: "brand_id,period_month,platform" }
    )
    .select()
    .single();
  if (error) throw error;
  return commitmentFromDb(data as DbBrandMonthlyCommitment);
}

// ---------------------------------------------------------------------------
// Đường đọc cho Brand Workspace (migration 0108)
// ---------------------------------------------------------------------------
// Role `brand` KHÔNG có policy nào trên `brand_contracts`/`brand_monthly_commitments` (0081 khoá ở
// ceo/admin/ops, và 0108 cố ý không nới), nên 2 hàm fetch bên trên trả về mảng rỗng cho họ. Đường
// đọc duy nhất của brand là view `brand_commitment_progress` — nó đã bỏ sẵn cột `note` (ghi chú
// nội bộ agency) và tự lọc theo brand đang đăng nhập.
//
// ops đọc view này được luôn, và thấy MỌI brand — cố ý, để mở Brand Workspace hộ khách qua
// switcher là thấy đúng cái khách thấy.
export interface BrandCommitmentRow {
  brandId: string;
  periodMonth: string;
  platform: ReportPlatform;
  committedHours: number;
  committedGmv?: number;
  isOverride: boolean;
  contractCode?: string;
  contractStartMonth?: string;
  contractEndMonth?: string;
}

interface DbBrandCommitmentRow {
  brand_id: string;
  period_month: string;
  platform?: ReportPlatform | null;
  committed_hours: number | string | null;
  committed_gmv: number | string | null;
  is_override: boolean | null;
  contract_code: string | null;
  contract_start_month: string | null;
  contract_end_month: string | null;
}

// Postgres `numeric` về PostgREST là STRING, không phải number — cộng thẳng sẽ nối chuỗi.
const num = (v: number | string | null): number => (v == null ? 0 : typeof v === "number" ? v : Number(v) || 0);

export async function fetchBrandCommitmentProgress(brandId: string): Promise<BrandCommitmentRow[]> {
  const { data, error } = await supabase
    .from("brand_commitment_progress")
    .select("*")
    .eq("brand_id", brandId)
    .order("period_month", { ascending: true });
  if (error) throw error;
  return ((data as DbBrandCommitmentRow[]) ?? []).map((r) => ({
    brandId: r.brand_id,
    periodMonth: r.period_month,
    platform: platformOf(r),
    committedHours: num(r.committed_hours),
    committedGmv: r.committed_gmv == null ? undefined : num(r.committed_gmv),
    isOverride: !!r.is_override,
    contractCode: r.contract_code ?? undefined,
    contractStartMonth: r.contract_start_month ?? undefined,
    contractEndMonth: r.contract_end_month ?? undefined
  }));
}

// Lượt đọc nạp-trước-được (lib/db/prefetch.ts) — định nghĩa MỘT chỗ cạnh hàm db để mọi màn dùng chung đúng key.
export const contractsRead = prefetchable("brandContracts", fetchBrandContracts);
export const commitmentsRead = prefetchable("monthlyCommitments", fetchBrandMonthlyCommitments);
export const commitmentProgressRead = prefetchable("commitmentProgress", fetchBrandCommitmentProgress);
