import { supabase } from "../supabaseClient";
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
  contact_name: string;
  phone: string;
  email: string;
  total_gmv: number;
  contract_status: Brand["contractStatus"];
  owner: string;
  owner_user_id: string | null;
  billing_model: Brand["billingModel"];
}

function fromDb(row: DbBrand): Brand {
  return {
    id: row.id,
    name: row.name,
    logo: row.logo,
    industry: row.industry,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    totalGmv: row.total_gmv,
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

export async function fetchBrands(): Promise<Brand[]> {
  const { data, error } = await supabase.from("brands").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbBrand[]).map(fromDb);
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
  const { error } = await supabase.from("brands").delete().eq("id", id);
  if (error) throw error;
}
