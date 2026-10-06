import type { Talent } from "../types";
import { fmtVndFull } from "./format";

// Rate đang áp dụng của một talent — CÙNG thứ tự với lib/pnl.ts: rate/giờ > 0 thắng rate/phiên. Trước 06/10 bảng và
// ngăn chi tiết ở Talent Pool chỉ in rate/phiên, nên người ăn theo giờ hiện "chưa đặt" dù lương vẫn tính. Không có hoa
// hồng theo GMV cho talent (user chốt 06/10) — ô % hoa hồng đã bỏ khỏi form.
export function talentRateLabel(t: Pick<Talent, "ratePerHour" | "ratePerSession">): string | null {
  if ((t.ratePerHour || 0) > 0) return `${fmtVndFull(t.ratePerHour || 0)}/giờ`;
  if ((t.ratePerSession || 0) > 0) return `${fmtVndFull(t.ratePerSession || 0)}/live`;
  return null;
}
