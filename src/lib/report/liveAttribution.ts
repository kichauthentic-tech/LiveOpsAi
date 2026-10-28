import type { ShopDaysMonthSlice } from "../dataraw/monthlyProductSlice";
import type { CampDayBucket } from "../campaignDays";

// Khối "Direct GMV vs Indirect GMV" của trang Toàn shop (Report Tháng, 2026-10-28). Brand hỏi: livestream của
// agency hiệu quả thế nào qua các tháng — tỷ trọng Indirect cao có thể bị đọc thành "live không chốt được đơn".
//
// Nguồn DUY NHẤT tách được là Shop Analytics theo ngày (Seller LIVE GMV = Direct, Seller LIVE indirect GMV =
// Indirect; cộng lại đúng bằng "Linked account LIVE-attributed GMV", đo CROCS T6). File Creator Live Performance
// theo phiên chỉ có cột "Attributed GMV" đã gộp, nên KHÔNG tách theo phiên/host được. Hệ quả: đây là số của MỌI
// phiên trên tài khoản shop (gồm cả live brand tự chạy), không riêng agency — trang phải ghi rõ.
//

export interface AttributionMonth {
  /** GMV chốt ngay trong phiên (TikTok "LIVE GMV" của tài khoản shop). */
  direct: number;
  /** GMV về sau từ người đã xem phiên (TikTok "LIVE indirect GMV"). */
  indirect: number;
  attributed: number;
  /** Indirect ÷ Attributed, điểm %. */
  indirectPct: number;
  days: number;
}

/** null = chưa có file Shop Analytics, hoặc bản chụp cũ chưa lưu cột Direct/Indirect (cần bấm Cập nhật số liệu). */
export function attributionMonth(slice: ShopDaysMonthSlice | null | undefined, start: string, end: string, keep?: (date: string) => boolean): AttributionMonth | null {
  if (!slice?.hasAnyBatch) return null;
  const days = slice.days.filter((d) => d.date >= start && d.date <= end && (!keep || keep(d.date)));
  if (days.length === 0 || days.some((d) => d.liveDirect == null || d.liveIndirect == null)) return null;
  const sum = (pick: (d: (typeof days)[number]) => number | undefined) => days.reduce((a, d) => a + (pick(d) ?? 0), 0);
  const direct = sum((d) => d.liveDirect);
  const indirect = sum((d) => d.liveIndirect);
  const attributed = direct + indirect;
  if (attributed <= 0) return null;
  return {
    direct,
    indirect,
    attributed,
    indirectPct: (indirect / attributed) * 100,
    days: days.length
  };
}

export type AttributionByType = Record<"all" | CampDayBucket, AttributionMonth | null>;

/** Cùng số liệu cắt theo loại ngày (Daily/D-Day/Mid-Month/Pay Day) của tháng — `bucketOf` là khung camp của CHÍNH tháng đó.
 *  Loại ngày không có ngày nào trong cửa sổ ⇒ null. Tỷ trọng là tỷ lệ nên ít nhạy với việc file shop ngắn hơn cửa sổ. */
export function attributionByType(slice: ShopDaysMonthSlice | null | undefined, start: string, end: string, bucketOf: (date: string) => CampDayBucket): AttributionByType {
  const one = (t: CampDayBucket) => attributionMonth(slice, start, end, (d) => bucketOf(d) === t);
  return { all: attributionMonth(slice, start, end), daily: one("daily"), dday: one("dday"), midmonth: one("midmonth"), payday: one("payday") };
}
