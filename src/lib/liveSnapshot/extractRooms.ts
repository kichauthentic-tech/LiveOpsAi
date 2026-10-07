import { parseDataRawExcel, type ParsedDataRawImport } from "../dataraw/parseDataRawExcel";
import { mapCreatorLivePerfRows } from "../dataraw/creatorLivePerfSlice";

// Một dòng room đã chuẩn hoá, sẵn sàng đẩy vào RPC apply_session_live_snapshot (migration 0078).
// Chỉ các trường ĐẾM ĐƯỢC được tách riêng — mọi tỷ lệ (AOV, GPM, CTR, CTOR, *_rate) nằm trong
// `raw` để tra cứu/kiểm chứng chứ không bao giờ đem trừ, vì hiệu của 2 tỷ lệ cộng dồn vô nghĩa.
// `watchSeconds` là trường thứ 14, thêm 2026-09-30 (migration 0124): Avg. view là tỷ lệ nên phải
// quy về đại lượng cộng được trước khi trừ — xem chú thích của chính trường đó.
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
  /**
   * Tổng GIÂY XEM của room = "Avg. viewing duration" × Views.
   *
   * File chỉ có số trung bình, mà trung bình là TỶ LỆ — không được đem trừ giữa 2 lần up như 13
   * cột đếm được kia (xem chú thích bảng `session_live_snapshot_rows`, migration 0078). Nhân
   * ngược lên thành đại lượng CỘNG ĐƯỢC rồi mới trừ/cộng, cuối cùng chia lại cho Views: đúng
   * trung bình có trọng số mà `keyMetrics.ts` (`watchSecViews`/`watchViews`) đang dùng để gộp
   * Avg. view của nhiều ca — hai chỗ phải ra cùng một số.
   *
   * Mẫu số là Views, xác nhận bằng chính file: bản export có 2 cột trùng y hệt giá trị,
   * "Avg. viewing duration" và "Avg. viewing duration per view" (đo trên 228 dòng đối soát thật
   * 2026-09-30: 26,74 / 41,62 / 37,47 giây).
   */
  watchSeconds: number;
  raw: Record<string, unknown>;
}

export interface ParsedSnapshotFile {
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  rows: SnapshotRoomRow[];
}

/** Giây xem cộng dồn của room. Xem chú thích `SnapshotRoomRow.watchSeconds` cho lý do nhân ngược. */
export function watchSecondsOf(avgViewDurationSec: number, views: number): number {
  if (!Number.isFinite(avgViewDurationSec) || !Number.isFinite(views)) return 0;
  if (avgViewDurationSec <= 0 || views <= 0) return 0;
  return Math.round(avgViewDurationSec * views);
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
  return snapshotRowsFromParsed(await parseDataRawExcel(file, "creator_live_performance"));
}

/** Cùng phép chuẩn hoá cho dữ liệu đã đọc sẵn — file vừa up, hoặc batch Creator-Live-Performance đã lưu ở Dữ Liệu Gốc
 *  (`columns` + `rows` lưu nguyên, nên dựng lại được đúng các dòng room mà không cần file gốc). */
export function snapshotRowsFromParsed(parsed: ParsedDataRawImport): ParsedSnapshotFile {
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
      watchSeconds: watchSecondsOf(r.avgViewDurationSec, r.views),
      raw: r.sourceRow
    });
  }

  if (rows.length === 0) {
    throw new Error('File không có dòng phiên live nào đọc được — kiểm tra lại đúng file "Creator-Live-Performance" tải từ TikTok Creator Center.');
  }

  return { periodLabel: parsed.periodLabel, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, rows };
}
