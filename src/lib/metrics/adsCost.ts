import { LiveSession } from "../../types";

// Chi phí Ads của MỘT ca (chỉ cho lãi/lỗ từng ca ở Finance) = số trợ live nhập ở report ca (TikTok; Shopee không có ô
// này). Ads của cả tháng lấy từ file TikTok/Shopee Ads ở Nhập Ads — không cộng hai số.
// Gộp cấu hình 06/10: bỏ ô Ads từng ca ở Finance (`session_finance.ads_cost` — trước đó "thắng khi khác 0", thành hai
// chỗ nhập cho cùng một số). Đo 06/10: 0 dòng session_finance, 0 report ca có ads_cost khác 0 trên production.
export function sessionAdsCost(session: LiveSession): number {
  return session.report?.adsCost ?? 0;
}
