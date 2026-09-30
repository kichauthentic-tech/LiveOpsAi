import { LiveSession } from "../../types";
import { isCountable, sessionHours } from "../performance/hostPerformance";

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
  /**
   * Ca người này chạy với vai TRỢ (`coHostId`). Tách riêng chứ không cộng vào `sessionCount`:
   * GMV của ca tính cho host, cộng sang trợ là đếm đôi. Nhưng bỏ hẳn thì Talent Pool nói
   * "chưa có ca nào có số" về người đã trợ 86 ca (audit UX lần 2 — M6).
   */
  assistSessionCount: number;
  /** Giờ live thật của các ca host có số (`liveDurationMinutes` nếu có, không thì giờ theo lịch). */
  hours: number;
  /**
   * GMV ÷ Giờ live. Đây mới là thước đo so được giữa các host: ca dài 5 giờ và ca 2 giờ không
   * cùng cỡ, nên GMV/ca phụ thuộc độ dài ca hơn là năng lực người chạy. Cùng định nghĩa với
   * `METRIC.gmvPerHour` ở Hiệu Suất Host / Report Tháng.
   */
  gmvPerHour: number;
}

// Talent Pool trước đây đọc thẳng cột nhập tay `talents.total_gmv`/`avg_gmv_per_session` — trên DB
// thật cả 33 talent đều = 0 trong khi tab "Hiệu Suất Host" cộng từ live_sessions ra hàng tỷ, tức
// hai màn nói hai số về cùng một người (audit 2026-09-21). Từ nay Talent Pool cũng cộng từ ca.
export function computeTalentRealTotals(sessions: LiveSession[], talentId: string): TalentRealTotals {
  const completed = sessions.filter((s) => s.hostId === talentId && isCountable(s));
  const totalGmv = completed.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  const hours = completed.reduce((sum, s) => sum + sessionHours(s), 0);
  return {
    sessionCount: completed.length,
    totalGmv,
    avgGmvPerSession: completed.length > 0 ? totalGmv / completed.length : 0,
    assistSessionCount: sessions.filter((s) => s.coHostId === talentId && isCountable(s)).length,
    hours,
    gmvPerHour: hours > 0 ? totalGmv / hours : 0
  };
}
