import { LiveSession } from "../../types";

// Thay cho talents.avg_gmv_per_session (số nhập tay, xem TalentMatcher.tsx) ở mọi nơi dùng số
// này để RA QUYẾT ĐỊNH vận hành (target ca, xếp hạng host) — số nhập tay giữ lại trên hồ sơ chỉ
// còn mang tính tham khảo lịch sử, không dùng nữa.
export function computeRealAvgGmvPerSession(sessions: LiveSession[], talentId: string): number {
  const completed = sessions.filter((s) => s.hostId === talentId && s.status === "Completed");
  if (completed.length === 0) return 0;
  const total = completed.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  return total / completed.length;
}
