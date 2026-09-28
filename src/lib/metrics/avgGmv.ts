import { LiveSession } from "../../types";
import { isCountable } from "../performance/hostPerformance";

// Ca tính vào GMV/ca của talent = "ca có số" (isCountable) như Hiệu Suất Host — trước audit 2026-09-28 mục 6 là
// mọi ca Completed, nên ca đã xong mà chưa có file kéo GMV/ca xuống và số ca lệch Hiệu Suất Host.

// Thay cho talents.avg_gmv_per_session (số nhập tay, xem TalentMatcher.tsx) ở mọi nơi dùng số
// này để RA QUYẾT ĐỊNH vận hành (target ca, xếp hạng host) — số nhập tay giữ lại trên hồ sơ chỉ
// còn mang tính tham khảo lịch sử, không dùng nữa.
export function computeRealAvgGmvPerSession(sessions: LiveSession[], talentId: string): number {
  const completed = sessions.filter((s) => s.hostId === talentId && isCountable(s));
  if (completed.length === 0) return 0;
  const total = completed.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  return total / completed.length;
}

export interface TalentRealTotals {
  sessionCount: number;
  totalGmv: number;
  avgGmvPerSession: number;
}

// Talent Pool trước đây đọc thẳng cột nhập tay `talents.total_gmv`/`avg_gmv_per_session` — trên DB
// thật cả 33 talent đều = 0 trong khi tab "Hiệu Suất Host" cộng từ live_sessions ra hàng tỷ, tức
// hai màn nói hai số về cùng một người (audit 2026-09-21). Từ nay Talent Pool cũng cộng từ ca.
export function computeTalentRealTotals(sessions: LiveSession[], talentId: string): TalentRealTotals {
  const completed = sessions.filter((s) => s.hostId === talentId && isCountable(s));
  const totalGmv = completed.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  return {
    sessionCount: completed.length,
    totalGmv,
    avgGmvPerSession: completed.length > 0 ? totalGmv / completed.length : 0
  };
}
