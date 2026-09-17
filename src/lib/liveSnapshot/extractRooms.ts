import { parseDataRawExcel } from "../dataraw/parseDataRawExcel";
import { mapCreatorLivePerfRows } from "../dataraw/creatorLivePerfSlice";

// Một dòng room đã chuẩn hoá, sẵn sàng đẩy vào RPC apply_session_live_snapshot (migration 0078).
// Chỉ 13 trường ĐẾM ĐƯỢC được tách riêng — mọi tỷ lệ (AOV, GPM, CTR, CTOR, *_rate) nằm trong
// `raw` để tra cứu/kiểm chứng chứ không bao giờ đem trừ, vì hiệu của 2 tỷ lệ cộng dồn vô nghĩa.
export interface SnapshotRoomRow {
  roomId: string;
  roomTitle?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes: number;
  gmv: number;
  itemsSold: number;
  orders: number;
  skuOrders: number;
  views: number;
  impressions: number;
  productImpressions: number;
  productClicks: number;
  newFollowers: number;
  comments: number;
  shares: number;
  likes: number;
  raw: Record<string, unknown>;
}

export interface ParsedSnapshotFile {
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  rows: SnapshotRoomRow[];
}

// Cột "Duration" trong file làm tròn xuống phút ("0h50m" cho phiên dài 50m17s), dùng nó thì
// GMV/giờ lệch ~1%. Đối chiếu với cột "GMV per hour"/"Impressions Per Hour" TikTok tự tính cho
// thấy chúng dùng đúng hiệu End−Start theo giây, nên lấy mốc thời gian làm chuẩn, chỉ rơi về cột
// Duration khi phiên chưa có End Time (đang live).
function exactDurationMinutes(startedAt?: string, endedAt?: string, fallbackHours = 0): number {
  if (startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    // 4 chữ số thập phân ≈ 0,006 giây: làm tròn tới 2 chữ số là đủ lệch GMV/giờ ở chữ số hàng nghìn.
    if (Number.isFinite(ms) && ms > 0) return Math.round((ms / 60000) * 10000) / 10000;
  }
  return Math.round(fallbackHours * 60 * 10000) / 10000;
}

export async function parseSnapshotFile(file: File): Promise<ParsedSnapshotFile> {
  const parsed = await parseDataRawExcel(file, "creator_live_performance");
  const mapped = mapCreatorLivePerfRows(parsed.columns, parsed.rows);

  const rows: SnapshotRoomRow[] = [];
  for (const r of mapped) {
    if (!r.roomId) continue; // không có Room ID thì không có khoá để trừ ở lần up sau
    rows.push({
      roomId: r.roomId,
      roomTitle: r.roomTitle,
      startedAt: r.startTime,
      endedAt: r.endTime,
      durationMinutes: exactDurationMinutes(r.startTime, r.endTime, r.hours),
      gmv: r.gmv,
      itemsSold: r.itemsSold,
      orders: r.orders,
      skuOrders: r.skuOrders,
      views: r.views,
      impressions: r.impressions,
      productImpressions: r.productImpressions,
      productClicks: r.productClicks,
      newFollowers: r.newFollowers,
      comments: r.comments,
      shares: r.shares,
      likes: r.likes,
      raw: r.sourceRow
    });
  }

  if (rows.length === 0) {
    throw new Error('File không có dòng phiên live nào đọc được — kiểm tra lại đúng file "Creator-Live-Performance" tải từ TikTok Creator Center.');
  }

  return { periodLabel: parsed.periodLabel, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, rows };
}
