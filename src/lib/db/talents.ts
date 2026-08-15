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
  // Mask thành null bởi view `talents_secure` nếu người đọc không phải ceo/admin/chính
  // talent đó — xem 0047_talent_rate_and_finance_security.sql.
  rate_per_session: number | null;
  commission_rate: number | null;
  overall_score: number;
  availability_status: Talent["availabilityStatus"];
  brands_worked_with: string[];
  phone: string;
  date_of_birth: string | null;
  profile_id: string | null;
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
    ratePerSession: row.rate_per_session ?? 0,
    commissionRate: row.commission_rate ?? 0,
    overallScore: row.overall_score,
    availabilityStatus: row.availability_status,
    brandsWorkedWith: row.brands_worked_with ?? [],
    phone: row.phone,
    dateOfBirth: row.date_of_birth ?? undefined,
    profileId: row.profile_id ?? undefined
  };
}

function toDb(t: Partial<Talent>) {
  const patch: Record<string, unknown> = {};
  if (t.name !== undefined) patch.name = t.name;
  if (t.avatar !== undefined) patch.avatar = t.avatar;
  if (t.role !== undefined) patch.role = t.role;
  if (t.gender !== undefined) patch.gender = t.gender;
  if (t.niches !== undefined) patch.niches = t.niches ?? [];
  if (t.followersTikTok !== undefined) patch.followers_tiktok = t.followersTikTok;
  if (t.avgGmvPerSession !== undefined) patch.avg_gmv_per_session = t.avgGmvPerSession;
  if (t.ctrAvg !== undefined) patch.ctr_avg = t.ctrAvg;
  if (t.cvrAvg !== undefined) patch.cvr_avg = t.cvrAvg;
  if (t.ratePerSession !== undefined) patch.rate_per_session = t.ratePerSession;
  if (t.commissionRate !== undefined) patch.commission_rate = t.commissionRate;
  if (t.overallScore !== undefined) patch.overall_score = t.overallScore;
  if (t.availabilityStatus !== undefined) patch.availability_status = t.availabilityStatus;
  if (t.brandsWorkedWith !== undefined) patch.brands_worked_with = t.brandsWorkedWith ?? [];
  if (t.phone !== undefined) patch.phone = t.phone;
  if (t.dateOfBirth !== undefined) patch.date_of_birth = t.dateOfBirth || null;
  return patch;
}

// Đọc qua view `talents_secure` (không phải bảng gốc `talents`) — view này mask
// rate_per_session/commission_rate thành null cho người không phải ceo/admin/chính
// talent đó. Bảng gốc đã revoke SELECT trực tiếp khỏi role authenticated.
export async function fetchTalents(): Promise<Talent[]> {
  const { data, error } = await supabase.from("talents_secure").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbTalent[]).map(fromDb);
}

// Sau insert/update trên bảng gốc, đọc lại qua `talents_secure` thay vì dùng thẳng
// `.select()` của câu insert/update đó — nếu không, RETURNING trả nguyên rate/commission
// thật cho bất kỳ ai có quyền ghi (kể cả operations qua manage_talents), phá mất mục đích
// mask ở tầng đọc.
async function fetchOneSecure(id: string): Promise<Talent> {
  const { data, error } = await supabase.from("talents_secure").select("*").eq("id", id).single();
  if (error) throw error;
  return fromDb(data as DbTalent);
}

// Partial update — chỉ gửi field thực sự có trong `patch`. Bắt buộc phải partial (không
// phải full-row) vì người sửa không phải ceo/admin/chính chủ đọc rate/commission từ
// `talents_secure` sẽ luôn thấy 2 field này = null; nếu gửi full object sẽ vô tình ghi đè
// rate/commission thật thành null.
export async function updateTalent(id: string, patch: Partial<Talent>): Promise<Talent> {
  const { error } = await supabase.from("talents").update(toDb(patch)).eq("id", id);
  if (error) throw error;
  return fetchOneSecure(id);
}

export async function deleteTalent(id: string): Promise<void> {
  const { error } = await supabase.from("talents").delete().eq("id", id);
  if (error) throw error;
}
