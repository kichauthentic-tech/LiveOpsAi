import { LiveSession } from "../types";

export interface DailyGmv {
  target: number;
  actual: number;
  sessionCount: number;
  completedCount: number;
}

// Gộp target/actual GMV theo từng ngày (session.date) — dùng cho view lịch
// GMV Target vs Actual. Target lấy tổng targetGmv của mọi session rơi vào
// ngày đó (không chia đều target theo ngày, giữ đơn giản + khớp đúng cách
// actualGmv cũng tính theo session).
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
