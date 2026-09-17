import { LiveSession, SessionFinance } from "../../types";

// Nguồn chuẩn = live_session_reports.ads_cost (trợ live nhập ngay sau ca, TikTok-only — Shopee
// chưa có input này nên mặc định 0).
// session_finance.ads_cost giữ nguyên schema cũ (not null default 0, áp dụng mọi platform) nhưng
// ĐỔI VAI TRÒ: không còn là nguồn nhập độc lập, chỉ còn là "điều chỉnh nội bộ agency" — thắng khi
// ops đã thật sự gõ 1 số khác 0 vào Finance & P&L (quy ước tạm bợ do bước 1 không đổi schema; cột
// chưa nullable nên không phân biệt được "0 vì chưa ai đụng" với "0 vì ops cố tình đặt 0" — sẽ có
// migration làm nullable đúng nghĩa ở bước 3/4).
export function getCanonicalAdsCost(session: LiveSession, finance?: Pick<SessionFinance, "adsCost">): number {
  if (finance && finance.adsCost !== 0) return finance.adsCost;
  return session.report?.adsCost ?? 0;
}
