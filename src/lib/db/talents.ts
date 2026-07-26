import { supabase } from "../supabaseClient";
import { Talent } from "../../types";

interface DbTalent {
  id: string;
  name: string;
  avatar: string;
  role: Talent["role"];
  gender: string;
  niches: string[];
  followers_tiktok: number;
  avg_gmv_per_session: number;
  ctr_avg: number;
  cvr_avg: number;
  rate_per_session: number;
  commission_rate: number;
  overall_score: number;
  availability_status: Talent["availabilityStatus"];
  brands_worked_with: string[];
  phone: string;
}

function fromDb(row: DbTalent): Talent {
  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar,
    role: row.role,
    gender: row.gender,
    niches: row.niches ?? [],
    followersTikTok: row.followers_tiktok,
    avgGmvPerSession: row.avg_gmv_per_session,
    ctrAvg: row.ctr_avg,
    cvrAvg: row.cvr_avg,
    ratePerSession: row.rate_per_session,
    commissionRate: row.commission_rate,
    overallScore: row.overall_score,
    availabilityStatus: row.availability_status,
    brandsWorkedWith: row.brands_worked_with ?? [],
    phone: row.phone
  };
}

function toDb(t: Talent) {
  return {
    name: t.name,
    avatar: t.avatar,
    role: t.role,
    gender: t.gender,
    niches: t.niches ?? [],
    followers_tiktok: t.followersTikTok,
    avg_gmv_per_session: t.avgGmvPerSession,
    ctr_avg: t.ctrAvg,
    cvr_avg: t.cvrAvg,
    rate_per_session: t.ratePerSession,
    commission_rate: t.commissionRate,
    overall_score: t.overallScore,
    availability_status: t.availabilityStatus,
    brands_worked_with: t.brandsWorkedWith ?? [],
    phone: t.phone
  };
}

export async function fetchTalents(): Promise<Talent[]> {
  const { data, error } = await supabase.from("talents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbTalent[]).map(fromDb);
}

export async function createTalent(t: Talent): Promise<Talent> {
  const { data, error } = await supabase.from("talents").insert(toDb(t)).select().single();
  if (error) throw error;
  return fromDb(data as DbTalent);
}

export async function updateTalent(t: Talent): Promise<Talent> {
  const { data, error } = await supabase.from("talents").update(toDb(t)).eq("id", t.id).select().single();
  if (error) throw error;
  return fromDb(data as DbTalent);
}

export async function deleteTalent(id: string): Promise<void> {
  const { error } = await supabase.from("talents").delete().eq("id", id);
  if (error) throw error;
}
