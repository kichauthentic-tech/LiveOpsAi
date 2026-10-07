import { supabase } from "../supabaseClient";
import { AffiliatePlanMonth } from "../../types";
import { DEFAULT_FX_RATE } from "../affiliate/plan";

// Trạng thái kế hoạch Affiliate theo (brand, tháng) — migration 0155: tỷ giá cho cột "Đơn vị $" và "Chốt, gửi brand".
// Brand chỉ đọc được tháng ĐÃ CHỐT (RLS), nên với role brand "không có dòng" = chưa chốt.

interface DbPlanMonth {
  brand_id: string;
  period_month: string;
  fx_rate: number;
  published_at: string | null;
}

const fromDb = (r: DbPlanMonth): AffiliatePlanMonth => ({
  brandId: r.brand_id,
  periodMonth: r.period_month,
  fxRate: Number(r.fx_rate) || DEFAULT_FX_RATE,
  publishedAt: r.published_at ?? undefined
});

/** periodMonth "YYYY-MM-01". Chưa có dòng → null (chưa lập/chưa chốt). Ném lỗi khi DB chưa chạy 0155. */
export async function fetchAffiliatePlanMonth(brandId: string, periodMonth: string): Promise<AffiliatePlanMonth | null> {
  const { data, error } = await supabase
    .from("brand_affiliate_plan_months")
    .select("*")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as DbPlanMonth) : null;
}

/** Chỉ ghi những khoá được truyền: đổi tỷ giá không đụng tới trạng thái chốt và ngược lại. `published` true = chốt, false = thu hồi. */
export async function upsertAffiliatePlanMonth(
  brandId: string,
  periodMonth: string,
  patch: { fxRate?: number; published?: boolean }
): Promise<AffiliatePlanMonth> {
  const row: Record<string, unknown> = { brand_id: brandId, period_month: periodMonth };
  if (patch.fxRate != null) row.fx_rate = patch.fxRate;
  if (patch.published !== undefined) {
    row.published_at = patch.published ? new Date().toISOString() : null;
    row.published_by = patch.published ? (await supabase.auth.getSession()).data.session?.user.id ?? null : null;
  }
  const { data, error } = await supabase
    .from("brand_affiliate_plan_months")
    .upsert(row, { onConflict: "brand_id,period_month" })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbPlanMonth);
}
