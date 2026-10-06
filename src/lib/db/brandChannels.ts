import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import type { BrandChannel } from "../../types";

// Kênh brand × sàn (0149). Đọc nhỏ (một dòng mỗi kênh), nạp một lần lúc đăng nhập cùng giá / phòng mặc định.

interface DbBrandChannel {
  id: string;
  brand_id: string;
  platform: BrandChannel["platform"];
  shop_name: string | null;
  shop_ref: string | null;
  status: BrandChannel["status"];
  started_on: string | null;
  note: string | null;
}

const COLS = "id, brand_id, platform, shop_name, shop_ref, status, started_on, note";

const fromDb = (r: DbBrandChannel): BrandChannel => ({
  id: r.id,
  brandId: r.brand_id,
  platform: r.platform === "Shopee" ? "Shopee" : "TikTok",
  shopName: r.shop_name ?? "",
  shopRef: r.shop_ref ?? "",
  status: r.status === "paused" ? "paused" : "active",
  startedOn: r.started_on ?? undefined,
  note: r.note ?? ""
});

// PostgREST báo bảng chưa có (migration 0149 chưa chạy) bằng PGRST205; Postgres trần là 42P01.
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);

/** null = bảng chưa có trên DB (0149 chưa chạy) — App tự suy kênh từ dữ liệu như trước 0149. */
export async function fetchBrandChannels(): Promise<BrandChannel[] | null> {
  const { data, error } = await supabase.from("brand_channels").select(COLS);
  if (error) {
    if (TABLE_MISSING.has((error as { code?: string }).code ?? "")) return null;
    throw error;
  }
  return (data as DbBrandChannel[]).map(fromDb);
}

export async function createBrandChannel(brandId: string, platform: BrandChannel["platform"], fields: Partial<Pick<BrandChannel, "shopName" | "shopRef" | "startedOn" | "note">> = {}): Promise<BrandChannel> {
  const { data, error } = await supabase
    .from("brand_channels")
    .insert({
      brand_id: brandId,
      platform,
      shop_name: fields.shopName ?? "",
      shop_ref: fields.shopRef ?? "",
      started_on: fields.startedOn ?? null,
      note: fields.note ?? ""
    })
    .select(COLS)
    .single();
  if (error) throw error;
  return fromDb(data as DbBrandChannel);
}

/** Sửa thông tin kênh. Brand + sàn của kênh không đổi được (DB chặn) — muốn đổi thì tạo kênh mới, kênh cũ tạm dừng. */
export async function updateBrandChannel(id: string, patch: Partial<Pick<BrandChannel, "shopName" | "shopRef" | "status" | "startedOn" | "note">>): Promise<BrandChannel> {
  const row: Record<string, unknown> = {};
  if (patch.shopName !== undefined) row.shop_name = patch.shopName;
  if (patch.shopRef !== undefined) row.shop_ref = patch.shopRef;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.startedOn !== undefined) row.started_on = patch.startedOn || null;
  if (patch.note !== undefined) row.note = patch.note;
  const { data, error } = await supabase.from("brand_channels").update(row).eq("id", id).select(COLS);
  if (error) throw error;
  assertAffected(data, "sửa kênh");
  return fromDb((data as DbBrandChannel[])[0]);
}
