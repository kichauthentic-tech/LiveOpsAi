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

export interface DailyGmv {
  target: number;
  actual: number;
  sessionCount: number;
  completedCount: number;
}

// Gộp target/actual GMV theo từng ngày (session.date) — dùng cho view lịch
// GMV Target vs Actual (Giai đoạn C2). Target lấy tổng targetGmv của mọi
// session rơi vào ngày đó (đã chốt với user: không chia đều target campaign
// theo ngày, giữ đơn giản + khớp đúng cách actualGmv cũng theo session).
export function computeGmvByDate(sessions: LiveSession[]): Map<string, DailyGmv> {
  const map = new Map<string, DailyGmv>();
  sessions.forEach((s) => {
    const entry = map.get(s.date) ?? { target: 0, actual: 0, sessionCount: 0, completedCount: 0 };
    entry.target += s.targetGmv || 0;
    entry.actual += s.actualGmv || 0;
    entry.sessionCount += 1;
    if (s.status === "Completed") entry.completedCount += 1;
    map.set(s.date, entry);
  });
  return map;
}
