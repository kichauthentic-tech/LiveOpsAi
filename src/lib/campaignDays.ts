// Lịch camp cố định, áp dụng cho mọi brand/mọi tháng — không phụ thuộc dữ liệu, không đổi theo thời gian.
// D-Day: ngày double-day (1-1, 2-2, ..., 12-12), kéo dài 3 ngày là D-Day, D-Day-1, D-Day-2.
// Mid-Month: 13-14-15 hàng tháng. Pay-Day: 23-24-25 hàng tháng.
export type CampaignDayType = "dday" | "midmonth" | "payday";

export interface CampaignDayInfo {
  type: CampaignDayType;
  label: string;
  shortLabel: string;
  /** Nhãn dài hiển thị trên dải banner bao trùm cả 3 ngày. */
  bannerLabel: string;
  /** Vị trí của ngày này trong dải camp: 0 = ngày mở màn, spanLength-1 = ngày chốt. */
  spanIndex: number;
  /** Tổng số ngày của dải camp (luôn 3 với logic hiện tại). */
  spanLength: number;
}

const CAMP_SPAN_DAYS = 3;

const toUTCms = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

// dateStr: "YYYY-MM-DD"
export function getCampaignDayInfo(dateStr: string): CampaignDayInfo | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;

  if (d >= 13 && d <= 15) {
    return {
      type: "midmonth",
      label: "Mid-Month Sale (13-15)",
      shortLabel: "Mid-Month",
      bannerLabel: "MID-MONTH SALE · 13-15",
      spanIndex: d - 13,
      spanLength: CAMP_SPAN_DAYS
    };
  }
  if (d >= 23 && d <= 25) {
    return {
      type: "payday",
      label: "Pay-Day Sale (23-25)",
      shortLabel: "Pay-Day",
      bannerLabel: "PAY-DAY SALE · 23-25",
      spanIndex: d - 23,
      spanLength: CAMP_SPAN_DAYS
    };
  }

  // D-Day window = [D-Day - 2, D-Day]. Tính bằng mốc thời gian thực để tự xử lý
  // trường hợp D-Day 1/1 có D-Day-1/D-Day-2 rơi vào 30-31/12 năm trước.
  const dateMs = toUTCms(y, m, d);
  for (let yearOffset = -1; yearOffset <= 1; yearOffset++) {
    for (let ddMonth = 1; ddMonth <= 12; ddMonth++) {
      const ddayMs = toUTCms(y + yearOffset, ddMonth, ddMonth);
      const diffDays = Math.round((ddayMs - dateMs) / 86400000);
      if (diffDays >= 0 && diffDays <= 2) {
        const startDay = ddMonth - 2;
        // Dải luôn nằm trong 1 tháng trừ D-Day 1/1 (bắt đầu 30/12 năm trước).
        const rangeLabel = startDay >= 1 ? `${startDay}-${ddMonth}/${ddMonth}` : `30/12-1/1`;
        return {
          type: "dday",
          label: `D-Day ${ddMonth}/${ddMonth}`,
          shortLabel: "D-Day",
          bannerLabel: `D-DAY ${ddMonth}.${ddMonth} · ${rangeLabel}`,
          spanIndex: CAMP_SPAN_DAYS - 1 - diffDays,
          spanLength: CAMP_SPAN_DAYS
        };
      }
    }
  }
  return null;
}

export const CAMPAIGN_DAY_STYLES: Record<
  CampaignDayType,
  { badge: string; ring: string; cell: string; dot: string; text: string; banner: string; glow: string }
> = {
  dday: {
    badge: "bg-rose-600 text-white",
    ring: "ring-1 ring-inset ring-rose-500/70",
    // `cell` = nền phủ CẢ ô ngày thuộc dải camp (không phải badge nhỏ trong ô) — cùng với `ring`
    // làm 3 ngày của đợt camp đọc ra như một khối liền dưới dải banner. Dark mode cần opacity/màu
    // đậm hơn light mode nhiều vì nền cell tối (slate-900) đã gần trùng amber/rose-950 mờ.
    cell: "bg-rose-50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700/80",
    dot: "bg-rose-500",
    text: "text-rose-400",
    banner: "bg-gradient-to-r from-rose-600 via-red-500 to-orange-500",
    glow: "shadow-rose-500/40"
  },
  midmonth: {
    badge: "bg-amber-600 text-white",
    ring: "ring-1 ring-inset ring-amber-500/70",
    cell: "bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700/80",
    dot: "bg-amber-500",
    text: "text-amber-400",
    banner: "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600",
    glow: "shadow-amber-500/40"
  },
  payday: {
    badge: "bg-violet-600 text-white",
    ring: "ring-1 ring-inset ring-violet-500/70",
    cell: "bg-violet-50 dark:bg-violet-950/50 border-violet-300 dark:border-violet-700/80",
    dot: "bg-violet-500",
    text: "text-violet-400",
    banner: "bg-gradient-to-r from-violet-600 via-fuchsia-600 to-purple-600",
    glow: "shadow-violet-500/40"
  }
};
