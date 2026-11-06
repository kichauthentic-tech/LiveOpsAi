// "Nhận target brand" (06/11, user chốt): lịch tháng sau lập + chốt theo GIỜ trước, target chỉ có sau buổi họp monthly với brand.
// Khi target về, so với DỰ BÁO của lịch đã chốt rồi xử lý theo 3 mức:
//   chênh ≤ 10%  → chỉ chia target (trong sai số dự báo lúc lập ~13%);
//   10% – 30%    → mở ca bổ sung (nằm TRONG kế hoạch, được chia target), tối đa +30% giờ của lịch;
//   > 30%        → không bù bằng ca: báo CEO số giờ cần, thống nhất lại với brand (mua thêm giờ hoặc giữ target).
// Đo T11 (06/11): CROCS +3%, Franklin TikTok 0%, VERA Shopee +20%, Franklin Shopee +47%, VERA TikTok +108%.
// Giờ cần thêm tính theo GMV/giờ dự báo của chính lịch (GMV gần như tỷ lệ với giờ cùng kênh — đo 13/10, Điều Phối Lịch Live).

export const INTAKE_ALLOCATE_MAX = 0.1;
export const INTAKE_ADD_MAX = 0.3;

export type IntakeTier =
  /** Không có dự báo (kênh mới / chưa đủ lịch sử) — chỉ chia target. */
  | "no_forecast"
  /** Target thấp hơn hoặc lệch ≤ 10% so với dự báo — chỉ chia target. */
  | "allocate"
  /** Cao hơn 10–30% — mở ca bổ sung rồi chia. */
  | "add"
  /** Cao hơn > 30% — không bù bằng ca, báo CEO / brand. */
  | "renegotiate";

export interface TargetIntake {
  tier: IntakeTier;
  /** target ÷ dự báo − 1 (âm = target thấp hơn dự báo). null khi không có dự báo. */
  gapPct: number | null;
  /** target − dự báo (VND, có thể âm). */
  gapGmv: number;
  /** Giờ cần thêm để dự báo bằng target, theo GMV/giờ dự báo của lịch. 0 khi không thiếu. */
  hoursNeeded: number;
  /** Trần giờ được mở thêm = 30% giờ của lịch đã chốt. */
  hoursCap: number;
}

export function targetIntake(target: number, forecast: number, scheduleHours: number): TargetIntake {
  const hoursCap = Math.max(0, scheduleHours) * INTAKE_ADD_MAX;
  if (!(forecast > 0) || !(scheduleHours > 0)) return { tier: "no_forecast", gapPct: null, gapGmv: target - Math.max(0, forecast), hoursNeeded: 0, hoursCap };
  const gapPct = target / forecast - 1;
  const gapGmv = target - forecast;
  const hoursNeeded = gapGmv > 0 ? gapGmv / (forecast / scheduleHours) : 0;
  // Làm tròn tới 0,1% để 10,0% / 30,0% đúng nằm trong mức dưới (tránh 0.30000000000000004).
  const g = Math.round(gapPct * 1000) / 1000;
  const tier: IntakeTier = g <= INTAKE_ALLOCATE_MAX ? "allocate" : g <= INTAKE_ADD_MAX ? "add" : "renegotiate";
  return { tier, gapPct, gapGmv, hoursNeeded, hoursCap };
}

export interface ExtraCandidate {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
}

/**
 * Chọn ca bổ sung từ gợi ý của bộ xếp lịch: chỉ ngày SAU `today` (ca hôm nay không kịp mở đăng ký), giữ thứ tự gợi ý (bộ xếp lịch đưa
 * khung tốt nhất lên trước), dừng khi đủ `hoursNeeded`, không vượt `hoursCap`.
 */
export function pickExtraSlots<T extends ExtraCandidate>(candidates: readonly T[], hoursNeeded: number, hoursCap: number, today: string): T[] {
  const out: T[] = [];
  let sum = 0;
  const want = Math.min(hoursNeeded, hoursCap);
  for (const c of candidates) {
    if (sum >= want - 0.25) break;
    if (c.date <= today || c.hours <= 0) continue;
    if (sum + c.hours > hoursCap + 0.01) continue;
    out.push(c);
    sum += c.hours;
  }
  return out;
}
