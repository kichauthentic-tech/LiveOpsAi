import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { Brand } from "../../types";

// `users`/profiles is a real Supabase table now (Phase 4) and the owner picker in
// CrmProjects.tsx only offers real profile IDs, so a plain empty-string-to-null
// coercion is enough — no more UUID sniffing needed (see Phase 5 in PROJECT_STATUS.md).
const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbBrand {
  id: string;
  name: string;
  logo: string;
  industry: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  total_gmv: number | null;
  contract_status: Brand["contractStatus"];
  owner: string;
  owner_user_id: string | null;
  billing_model: Brand["billingModel"] | null;
}

function fromDb(row: DbBrand): Brand {
  return {
    id: row.id,
    name: row.name,
    logo: row.logo,
    industry: row.industry,
    // null = view che với role talent (0198).
    contactName: row.contact_name ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    totalGmv: row.total_gmv ?? 0,
    contractStatus: row.contract_status,
    owner: row.owner,
    ownerUserId: row.owner_user_id ?? undefined,
    billingModel: row.billing_model ?? "gmv_commission"
  };
}

function toDb(b: Brand) {
  return {
    name: b.name,
    logo: b.logo,
    industry: b.industry,
    contact_name: b.contactName,
    phone: b.phone,
    email: b.email,
    total_gmv: b.totalGmv,
    contract_status: b.contractStatus,
    owner: b.owner,
    owner_user_id: orNull(b.ownerUserId),
    billing_model: b.billingModel
  };
}

// PostgREST báo view chưa có (migration 0198 chưa chạy) bằng PGRST205; Postgres trần là 42P01.
const VIEW_MISSING = new Set(["PGRST205", "42P01"]);

// Đọc qua view brands_secure (0198): role talent bị đóng bảng gốc, view che liên hệ / tổng GMV / hình thức tính phí với talent.
// Ghi vẫn vào bảng `brands` (nhân viên agency đọc lại được dòng vừa ghi qua RLS bảng gốc). DB chưa có view ⇒ đọc bảng gốc như cũ,
// để client deploy trước migration không làm mất danh sách brand.
export async function fetchBrands(): Promise<Brand[]> {
  const viaView = await supabase.from("brands_secure").select("*").order("created_at", { ascending: false });
  if (viaView.error && VIEW_MISSING.has(viaView.error.code)) {
    const { data, error } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data as DbBrand[]).map(fromDb);
  }
  if (viaView.error) throw viaView.error;
  return (viaView.data as DbBrand[]).map(fromDb);
}

export async function createBrand(b: Brand): Promise<Brand> {
  const { data, error } = await supabase.from("brands").insert(toDb(b)).select().single();
  if (error) throw error;
  return fromDb(data as DbBrand);
}

export async function updateBrand(b: Brand): Promise<Brand> {
  const { data, error } = await supabase.from("brands").update(toDb(b)).eq("id", b.id).select().single();
  if (error) throw error;
  return fromDb(data as DbBrand);
}

export async function deleteBrand(id: string): Promise<void> {
  const { data, error } = await supabase.from("brands").delete().eq("id", id).select("id");
  if (error) throw error;
  assertAffected(data, "xoá brand");
}
