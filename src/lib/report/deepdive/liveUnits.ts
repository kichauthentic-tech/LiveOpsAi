import { LiveSession } from "../../../types";
import { CreatorLivePerfRow, vnDateOf } from "../../dataraw/creatorLivePerfSlice";

// ---------------------------------------------------------------------------
// THỐNG NHẤT NGUỒN SỐ CA (chốt với user 2026-09-23).
//
// Trước đây Report Tháng đọc `live_sessions` còn Report Chuyên Sâu đọc thẳng Dataraw
// (creator_live_performance) — cùng một tháng, hai con số. Đúng hôm chốt, tháng 9 lệch 61,8 triệu
// vì 16 ca chưa được đối soát lại. Hai trang cùng nói về một tháng mà ra hai số là đường chắc chắn
// dẫn tới mất niềm tin vào báo cáo.
//
// Quy tắc từ nay:
//   - Chỉ số theo CA (GMV/phiên, giờ live, phễu, ma trận, campaign, host) -> `live_sessions`.
//     Đây là bản đã đối soát, có host, và gộp được cả ca nhập tay lẫn ca sinh từ file.
//   - Dataraw chỉ là DỰ PHÒNG cho tháng chưa có ca nào (backfill cũ, brand mới).
//   - Cái gì ca KHÔNG có thì vẫn lấy từ Dataraw, nhưng ở ĐỘ CHI TIẾT KHÁC nên không đụng nhau:
//     số toàn shop theo ngày (shop_analytics), GMV LIVE toàn sàn kể cả creator affiliate
//     (live_performance_core_stats), SKU (product_list), khuyến mãi (shop_promotion).
//
// Mọi TỶ LỆ đều tính lại từ SỐ ĐẾM ở đây thay vì đọc cột tỷ lệ có sẵn của từng nguồn — hai nguồn
// định nghĩa khác nhau (live_sessions.ctr_avg là clicks/views, còn cột CTR của Dataraw là
// clicks/product impressions), đọc thẳng sẽ ra hai thang số không so được với nhau.
// ---------------------------------------------------------------------------

export type LiveSourceKind = "sessions" | "dataraw" | "none";

/** Một buổi live đã chuẩn hoá, bất kể đến từ nguồn nào. Chỉ chứa SỐ ĐẾM. */
export interface LiveUnit {
  key: string;
  title: string;
  date: string;
  /** Giờ bắt đầu theo giờ VN (0-23). */
  startHour: number;
  hours: number;
  gmv: number;
  skuOrders: number;
  itemsSold: number;
  views: number;
  productImpressions: number;
  productClicks: number;
  newFollowers: number;
  comments: number;
  likes: number;
  shares: number;
  hostName?: string;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnHourOf(iso?: string, fallbackClock?: string): number {
  if (iso) {
    const t = Date.parse(iso);
    if (!Number.isNaN(t)) return new Date(t + VN_OFFSET_MS).getUTCHours();
  }
  const m = (fallbackClock ?? "").match(/^(\d{1,2}):/);
  return m ? Number(m[1]) : 0;
}

/** "HH:MM" -> phút; dùng để suy thời lượng khi ca chưa có liveDurationMinutes. */
function clockToMinutes(v?: string): number | null {
  const m = (v ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function hoursOfSession(s: LiveSession): number {
  if (s.liveDurationMinutes && s.liveDurationMinutes > 0) return s.liveDurationMinutes / 60;
  // Ca nhập tay chưa có snapshot: lấy khung giờ kế hoạch. Qua nửa đêm thì cộng 24h thay vì ra âm.
  const a = clockToMinutes(s.startTime);
  const b = clockToMinutes(s.endTime);
  if (a == null || b == null) return 0;
  return ((b - a + 24 * 60) % (24 * 60)) / 60;
}

function fromSessions(sessions: LiveSession[]): LiveUnit[] {
  return sessions
    .filter((s) => s.status !== "Cancelled")
    .map((s) => ({
      key: s.id,
      title: s.title ?? "",
      date: s.date,
      startHour: vnHourOf(s.actualStartAt, s.startTime),
      hours: hoursOfSession(s),
      gmv: s.actualGmv ?? 0,
      skuOrders: s.attributedSkuOrders ?? s.totalOrders ?? 0,
      itemsSold: s.attributedItemsSold ?? 0,
      views: s.totalViews ?? 0,
      productImpressions: s.productImpressions ?? 0,
      productClicks: s.productClicks ?? 0,
      newFollowers: s.newFollowers ?? 0,
      comments: s.commentsCount ?? 0,
      likes: s.likesCount ?? 0,
      shares: s.sharesCount ?? 0,
      hostName: (s.hostName ?? "").trim() || undefined
    }))
    .sort((a, b) => (a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date)));
}

function fromDataraw(rows: CreatorLivePerfRow[]): LiveUnit[] {
  return rows
    .map((r) => ({
      key: r.roomId ?? r.startTime,
      title: r.roomTitle ?? "",
      date: vnDateOf(r.startTime),
      startHour: vnHourOf(r.startTime),
      hours: r.hours,
      gmv: r.gmv,
      skuOrders: r.skuOrders,
      itemsSold: r.itemsSold,
      views: r.views,
      productImpressions: r.productImpressions,
      productClicks: r.productClicks,
      newFollowers: r.newFollowers,
      comments: r.comments,
      likes: r.likes,
      shares: r.shares,
      hostName: undefined // file Creator Center không có tên host — đó là lý do ưu tiên live_sessions
    }))
    .sort((a, b) => (a.date === b.date ? a.startHour - b.startHour : a.date.localeCompare(b.date)));
}

export function pickLiveUnits(sessions: LiveSession[], dataraw: CreatorLivePerfRow[]): { units: LiveUnit[]; source: LiveSourceKind } {
  const fromLs = fromSessions(sessions);
  if (fromLs.length > 0) return { units: fromLs, source: "sessions" };
  if (dataraw.length > 0) return { units: fromDataraw(dataraw), source: "dataraw" };
  return { units: [], source: "none" };
}

export const LIVE_SOURCE_LABEL: Record<LiveSourceKind, string> = {
  sessions: "Ca đã đối soát (Lịch Vận Hành)",
  dataraw: "Dữ Liệu Gốc — Creator Live Performance (chưa có ca nào cho tháng này)",
  none: "Chưa có nguồn"
};
