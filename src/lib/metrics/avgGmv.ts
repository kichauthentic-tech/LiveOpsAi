import { LiveSession } from "../../types";
import { hostPortions, isCountable, sessionHours } from "../performance/hostPerformance";
import { personRoleMinutes, sessionMinutes } from "../staffSegments";
import { MIN_SESSIONS_FOR_CONFIDENCE } from "../performance/hostSuggestion";

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
  /** Giờ live thật của các ca làm HOST (`liveDurationMinutes` nếu có, không thì giờ theo lịch). */
  hours: number;
  /** Giờ live của các ca làm TRỢ — tách riêng như `assistSessionCount`, không cộng vào `hours`
   *  (vì `hours` là mẫu số của GMV/giờ, mà GMV của ca tính cho host). */
  assistHours: number;
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
  // Đổi host giữa ca (0138): chỉ tính PHẦN của talent này (số + giờ chia theo giờ đứng ca).
  const completed = sessions.flatMap((s) => (isCountable(s) ? hostPortions(s).filter((p) => p.hostId === talentId) : []));
  const totalGmv = completed.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  const hours = completed.reduce((sum, s) => sum + sessionHours(s), 0);
  const assisted = sessions.filter((s) => isCountable(s) && personRoleMinutes(s, talentId, "co_host") > 0);
  const assistHours = assisted.reduce((sum, s) => {
    const dur = sessionMinutes(s);
    return sum + (dur > 0 ? sessionHours(s) * (personRoleMinutes(s, talentId, "co_host") / dur) : 0);
  }, 0);
  return {
    sessionCount: completed.length,
    totalGmv,
    avgGmvPerSession: completed.length > 0 ? totalGmv / completed.length : 0,
    assistSessionCount: assisted.length,
    assistHours,
    hours,
    gmvPerHour: hours > 0 ? totalGmv / hours : 0
  };
}

export interface TalentBrandPerf {
  brandId: string;
  sessions: number;
  hours: number;
  gmv: number;
  gmvPerHour: number;
  /** "ok" = đủ mẫu; "low" = có ca nhưng dưới ngưỡng, số chỉ để tham khảo; "none" = chưa chạy ca nào. */
  confidence: "none" | "low" | "ok";
}

/**
 * GMV/giờ của một talent TÁCH THEO BRAND.
 *
 * Không có bản "gộp mọi brand": GMV/giờ phụ thuộc ngành hàng và giá bán của brand nhiều hơn phụ
 * thuộc người chạy, nên cộng chung rồi xếp hạng là so host bán giày với host bán đồ lót. Đo trên
 * dữ liệu thật (2026-09-30, toàn bộ 229 ca đều CROCS nên dùng tháng làm đại diện cho "bối cảnh"):
 * chênh lệch GIỮA các host là 1,40×, trong khi CÙNG MỘT host dao động giữa các tháng tới 1,55×
 * (trung vị) — nhiễu bối cảnh đã lớn hơn tín hiệu năng lực ngay cả khi chỉ có một brand.
 * Ngưỡng "đủ mẫu" dùng chung `MIN_SESSIONS_FOR_CONFIDENCE` với hostSuggestion.
 */
export function computeTalentBrandPerf(sessions: LiveSession[], talentId: string, brandIds: string[]): TalentBrandPerf[] {
  const mine = sessions.flatMap((s) => (isCountable(s) ? hostPortions(s).filter((p) => p.hostId === talentId) : []));
  // Brand có ca đứng trước, brand chưa chạy dồn xuống cuối — cùng luật với thứ tự dòng ở Talent Pool.
  return brandIds
    .map((brandId): TalentBrandPerf => {
      const rows = mine.filter((s) => s.brandId === brandId);
      const gmv = rows.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
      const hours = rows.reduce((sum, s) => sum + sessionHours(s), 0);
      return {
        brandId,
        sessions: rows.length,
        hours,
        gmv,
        gmvPerHour: hours > 0 ? gmv / hours : 0,
        confidence: rows.length === 0 ? "none" : rows.length < MIN_SESSIONS_FOR_CONFIDENCE ? "low" : "ok"
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}
