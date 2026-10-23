import { supabase } from "../supabaseClient";
import type { ReportPlatform } from "../reportPlatform";
import type { Bulletin, BulletinPayload } from "../brand/bulletin";

// Bản tin cho brand (0179). Ghi qua RPC publish_brand_bulletin (ceo/operations/admin); đọc thẳng bảng — RLS: ops mọi kênh, brand chỉ
// kênh của mình. DB chưa chạy 0179 ⇒ đọc trả `missing`, gửi ném lỗi nói rõ phải chạy migration nào.

const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
export const BULLETIN_MISSING_TEXT = "Chưa chạy migration 0179 nên chưa gửi được bản tin cho brand.";

export async function publishBrandBulletin(x: { brandId: string; platform: ReportPlatform; month: string; asOf: string | null; payload: BulletinPayload; note: string }): Promise<string> {
  const { data, error } = await supabase.rpc("publish_brand_bulletin", {
    p_brand_id: x.brandId,
    p_platform: x.platform,
    p_month: `${x.month}-01`,
    p_as_of: x.asOf,
    p_payload: x.payload,
    p_note: x.note
  });
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new Error(BULLETIN_MISSING_TEXT);
    throw error;
  }
  return String(data);
}

/** Bản tin của một kênh, mới → cũ (tối đa 50). */
export async function fetchBrandBulletins(brandId: string, platform: ReportPlatform): Promise<{ rows: Bulletin[]; missing: boolean }> {
  const { data, error } = await supabase
    .from("brand_bulletins")
    .select("id,brand_id,platform,month,as_of,payload,note,published_at")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) {
    if (MISSING.has(error.code ?? "")) return { rows: [], missing: true };
    throw error;
  }
  return {
    missing: false,
    rows: ((data as Record<string, unknown>[]) ?? []).map((r) => ({
      id: String(r.id),
      brandId: String(r.brand_id),
      platform: r.platform as ReportPlatform,
      month: String(r.month).slice(0, 7),
      asOf: r.as_of ? String(r.as_of) : null,
      payload: r.payload as BulletinPayload,
      note: String(r.note ?? ""),
      publishedAt: String(r.published_at)
    }))
  };
}
