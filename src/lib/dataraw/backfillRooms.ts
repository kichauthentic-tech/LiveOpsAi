import { supabase } from "../supabaseClient";
import { fetchRowsPaged } from "./fetchRowsPaged";
import { fetchCreatorLivePerfMonthSlice } from "./creatorLivePerfSlice";
import { readShopeeStreams, shopeeStreamsToSnapshotRows } from "./shopeeFiles";
import { BackfillRoomPayload, roomToPayload, snapshotRowToPayload } from "../backfill/roomsToSessions";
import type { ReportPlatform } from "../reportPlatform";

// Nguồn "room" cho khối Nạp bù ca của từng sàn (đã chuẩn về payload của RPC create_backfill_sessions):
//   TikTok = file Creator-Live-Performance (một dòng / phòng, Room ID thật)
//   Shopee = file Live List (một dòng / phiên, mã tổng hợp SHP-<ngày>-<giờ> — cùng mã với đối soát/snapshot nên phiên
//            đã có ca được nhận ra là "đã có").
// null trong mảng = dòng thiếu Room ID/giờ (lập kế hoạch đếm vào "thiếu giờ").

interface ShopeeImportLite { id: string; period_start: string | null; period_end: string | null; imported_at: string }

/** Hai lô cùng chứa một phiên (lô full + lô tháng export lại) thì phiên đó chỉ đếm MỘT lần — lấy dòng của lô up SAU. */
export function dedupeShopeePayloads(batches: { importedAt: string; payloads: (BackfillRoomPayload | null)[] }[]): (BackfillRoomPayload | null)[] {
  const out: (BackfillRoomPayload | null)[] = [];
  const seen = new Set<string>();
  for (const b of [...batches].sort((a, c) => c.importedAt.localeCompare(a.importedAt))) {
    for (const p of b.payloads) {
      if (p) {
        if (seen.has(p.room_id)) continue;
        seen.add(p.room_id);
      }
      out.push(p);
    }
  }
  return out;
}

async function fetchShopeeMonthPayloads(brandId: string, monthStart: string, monthEnd: string): Promise<(BackfillRoomPayload | null)[]> {
  const { data, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, period_start, period_end, imported_at")
    .eq("brand_id", brandId)
    .eq("report_type", "shopee_live_list");
  if (error) throw error;
  const overlapping = ((data as ShopeeImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= monthEnd && i.period_end >= monthStart
  );
  if (overlapping.length === 0) return [];
  const rowsByImport = await fetchRowsPaged(overlapping.map((i) => i.id));
  const batches = overlapping.map((imp) => {
    const streams = readShopeeStreams(rowsByImport.get(imp.id) ?? []).filter((s) => s.date >= monthStart && s.date <= monthEnd);
    return { importedAt: imp.imported_at, payloads: shopeeStreamsToSnapshotRows(streams).map(snapshotRowToPayload) };
  });
  return dedupeShopeePayloads(batches);
}

async function fetchTikTokMonthPayloads(brandId: string, monthStart: string, monthEnd: string): Promise<(BackfillRoomPayload | null)[]> {
  const slice = await fetchCreatorLivePerfMonthSlice(brandId, monthStart, monthEnd);
  return slice.rows.map(roomToPayload);
}

// Record đủ mọi sàn ⇒ thêm sàn mà quên nguồn nạp bù là lỗi compile.
const MONTH_PAYLOAD_FETCHERS: Record<ReportPlatform, typeof fetchTikTokMonthPayloads> = {
  TikTok: fetchTikTokMonthPayloads,
  Shopee: fetchShopeeMonthPayloads
};

export const fetchBackfillPayloads = (brandId: string, platform: ReportPlatform, monthStart: string, monthEnd: string) =>
  MONTH_PAYLOAD_FETCHERS[platform](brandId, monthStart, monthEnd);
