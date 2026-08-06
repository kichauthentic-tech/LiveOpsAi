import { Campaign, LiveSession } from "../types";

// Nguồn tính GMV thật của 1 campaign — dùng chung cho các màn hình cần đọc
// GMV campaign, tránh lặp lại 2 bản logic khác nhau.
// Ưu tiên session.campaignId (FK thật, migration 0022); fallback về suy luận
// brand+khoảng ngày cho session cũ chưa được backfill.
export function computeCampaignActualGmv(campaigns: Campaign[], sessions: LiveSession[]): Map<string, number> {
  const map = new Map<string, number>();
  campaigns.forEach((c) => {
    const total = sessions
      .filter((s) => s.status === "Completed")
      .filter((s) => (s.campaignId ? s.campaignId === c.id : s.brandId === c.brandId && s.date >= c.startDate && s.date <= c.endDate))
      .reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    map.set(c.id, total);
  });
  return map;
}
