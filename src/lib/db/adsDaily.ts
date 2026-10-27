import { supabase } from "../supabaseClient";
import type { AdsDayRow } from "../ads/adsTracking";
import type { ReportPlatform } from "../reportPlatform";
import { assertAffected } from "./assertAffected";

// Ads theo ngày dán từ file tracking của brand (migration 0184, lib/ads/adsTracking.ts). Một dòng = (brand, sàn, ngày); dán lại
// cùng ngày thì ghi đè. Đọc theo tháng — bảng nhỏ (≤ 31 dòng / brand / tháng), không vào bản chụp report.

interface DbAdsDaily {
  date: string;
  tts_target: number | null;
  target_total: number | null;
  target_live: number | null;
  target_product: number | null;
  target_creator: number | null;
  actual_total: number | null;
  actual_live: number | null;
  actual_product: number | null;
  actual_creator: number | null;
  note: string | null;
}

const num = (v: number | string | null) => (v == null ? null : Number(v));

function fromDb(r: DbAdsDaily): AdsDayRow {
  const actualKnown = r.actual_total != null || r.actual_live != null || r.actual_product != null || r.actual_creator != null;
  return {
    date: r.date,
    ttsTarget: num(r.tts_target),
    target: { total: num(r.target_total), live: num(r.target_live), product: num(r.target_product), creator: num(r.target_creator) },
    actual: actualKnown ? { total: num(r.actual_total), live: num(r.actual_live), product: num(r.actual_product), creator: num(r.actual_creator) } : null,
    note: r.note
  };
}

const monthBounds = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { start: `${month}-01`, end: `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
};

/** Các ngày của tháng `YYYY-MM`. Bảng chưa có (DB chưa chạy 0184) ⇒ ném lỗi; nơi gọi tự quyết bỏ qua hay báo. */
export async function fetchAdsDaily(brandId: string, month: string, platform: ReportPlatform = "TikTok"): Promise<AdsDayRow[]> {
  const { start, end } = monthBounds(month);
  const { data, error } = await supabase
    .from("brand_ads_daily")
    .select("date, tts_target, target_total, target_live, target_product, target_creator, actual_total, actual_live, actual_product, actual_creator, note")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .gte("date", start)
    .lte("date", end)
    .order("date");
  if (error) throw error;
  return ((data as DbAdsDaily[]) ?? []).map(fromDb);
}

/** Ghi đè các ngày trong khối dán (upsert theo brand × sàn × ngày). Trả số dòng đã ghi. */
export async function saveAdsDaily(brandId: string, platform: ReportPlatform, rows: AdsDayRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const payload = rows.map((r) => ({
    brand_id: brandId,
    platform,
    date: r.date,
    tts_target: r.ttsTarget,
    target_total: r.target.total,
    target_live: r.target.live,
    target_product: r.target.product,
    target_creator: r.target.creator,
    actual_total: r.actual?.total ?? null,
    actual_live: r.actual?.live ?? null,
    actual_product: r.actual?.product ?? null,
    actual_creator: r.actual?.creator ?? null,
    note: r.note
  }));
  let written = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const { data, error } = await supabase.from("brand_ads_daily").upsert(payload.slice(i, i + 200), { onConflict: "brand_id,platform,date" }).select("date");
    if (error) throw error;
    assertAffected(data, "lưu Ads theo ngày");
    written += data!.length;
  }
  return written;
}

/** Xoá mọi ngày của một tháng (dán nhầm brand / nhầm tháng). */
export async function deleteAdsDailyMonth(brandId: string, platform: ReportPlatform, month: string): Promise<number> {
  const { start, end } = monthBounds(month);
  const { data, error } = await supabase.from("brand_ads_daily").delete().eq("brand_id", brandId).eq("platform", platform).gte("date", start).lte("date", end).select("date");
  if (error) throw error;
  return data?.length ?? 0;
}
