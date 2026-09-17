import { supabase } from "../supabaseClient";
import { BrandContract, BrandMonthlyCommitment, GenerateCommitmentsResult } from "../../types";

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
    skippedOtherContract: r.skipped_other_contract ?? 0
  };
}

// Ops sửa tay 1 tháng => luôn đóng dấu is_override để lần sinh lại từ hợp đồng không xoá mất.
// Không để component tự quyết cờ này: quên set một lần là mất ngoại lệ đã nhập, mà lỗi chỉ lộ ra
// vào lần bấm "sinh lại" sau đó rất lâu.
export async function upsertMonthlyCommitment(input: {
  brandId: string;
  periodMonth: string;
  committedHours: number;
  committedGmv?: number;
  note?: string;
}): Promise<BrandMonthlyCommitment> {
  const { data, error } = await supabase
    .from("brand_monthly_commitments")
    .upsert(
      {
        brand_id: input.brandId,
        period_month: input.periodMonth,
        committed_hours: input.committedHours,
        committed_gmv: input.committedGmv ?? null,
        note: input.note || null,
        is_override: true
      },
      { onConflict: "brand_id,period_month" }
    )
    .select()
    .single();
  if (error) throw error;
  return commitmentFromDb(data as DbBrandMonthlyCommitment);
}

export async function deleteMonthlyCommitment(id: string): Promise<void> {
  const { data, error } = await supabase.from("brand_monthly_commitments").delete().eq("id", id).select();
  if (error) throw error;
  if (((data as DbBrandMonthlyCommitment[]) ?? []).length === 0) {
    throw new Error("Không xoá được cam kết tháng — có thể bạn không đủ quyền.");
  }
}
