// Lịch camp cố định, áp dụng cho mọi brand/mọi tháng — không phụ thuộc dữ liệu, không đổi theo thời gian.
// D-Day: ngày double-day (1-1, 2-2, ..., 12-12), kéo dài 3 ngày là D-Day, D-Day-1, D-Day-2.
// Mid-Month: 13-14-15 hàng tháng. Pay-Day: 23-24-25 hàng tháng.
export type CampaignDayType = "dday" | "midmonth" | "payday";

export interface CampaignDayInfo {
  type: CampaignDayType;
  label: string;
  shortLabel: string;
}

const toUTCms = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

// dateStr: "YYYY-MM-DD"
export function getCampaignDayInfo(dateStr: string): CampaignDayInfo | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;

  if (d >= 13 && d <= 15) {
    return { type: "midmonth", label: "Mid-Month Sale (13-15)", shortLabel: "Mid-Month" };
  }
  if (d >= 23 && d <= 25) {
    return { type: "payday", label: "Pay-Day Sale (23-25)", shortLabel: "Pay-Day" };
  }

  // D-Day window = [D-Day - 2, D-Day]. Tính bằng mốc thời gian thực để tự xử lý
  // trường hợp D-Day 1/1 có D-Day-1/D-Day-2 rơi vào 30-31/12 năm trước.
  const dateMs = toUTCms(y, m, d);
  for (let yearOffset = -1; yearOffset <= 1; yearOffset++) {
    for (let ddMonth = 1; ddMonth <= 12; ddMonth++) {
      const ddayMs = toUTCms(y + yearOffset, ddMonth, ddMonth);
      const diffDays = Math.round((ddayMs - dateMs) / 86400000);
      if (diffDays >= 0 && diffDays <= 2) {
        return { type: "dday", label: `D-Day ${ddMonth}/${ddMonth}`, shortLabel: "D-Day" };
      }
    }
  }
  return null;
}

export const CAMPAIGN_DAY_STYLES: Record<
  CampaignDayType,
  { badge: string; ring: string; dot: string; text: string }
> = {
  dday: { badge: "bg-rose-600 text-white", ring: "ring-1 ring-inset ring-rose-500/70", dot: "bg-rose-500", text: "text-rose-400" },
  midmonth: {
    badge: "bg-amber-600 text-white",
    ring: "ring-1 ring-inset ring-amber-500/70",
    dot: "bg-amber-500",
    text: "text-amber-400"
  },
  payday: {
    badge: "bg-violet-600 text-white",
    ring: "ring-1 ring-inset ring-violet-500/70",
    dot: "bg-violet-500",
    text: "text-violet-400"
  }
};
