// Tên hiển thị của từng tab, tra được cả khi KHÔNG đứng ở workspace đó — màn "Lượt Mở Tab" cần gọi tên mọi tab,
// còn menu trong App.tsx chỉ dựng mục của workspace + role hiện tại. Giữ khớp nhãn menu: tests/routes.test.ts
// so từng `{ id, label }` trong App.tsx với bảng này.

export const AGENCY_TAB_LABELS: Record<string, string> = {
  agency_overview: "Dashboard",
  month_plan: "Kế Hoạch Tháng",
  shift_scheduling: "Nhân sự ca",
  calendar: "Bảng Vận Hành",
  studio_calendar: "Lịch & Studio",
  sessions: "Sổ Ca",
  ops_support: "Hỗ Trợ Vận Hành", // gộp vào Dashboard brand 28/09, rồi khôi phục thành tab agency 07/10 (chỉ còn benchmark ca sắp live)
  host_performance: "Hiệu Suất Host",
  brands_overview: "Toàn Cảnh Brand",
  report_publish_board: "Điều Phối Phát Hành",
  talents: "Talent Pool",
  studios: "Studios & Gear",
  crm: "CRM",
  brand_commitment: "Cam Kết Hợp Đồng", // tab đã gộp vào CRM + Kế Hoạch Tháng (06/10) — giữ tên để "Lượt Mở Tab" đọc được lượt cũ
  tiktok_api: "TikTok API",
  finance: "Finance & P&L",
  user_settings: "Phân Quyền & Role",
  ai_training: "AI Training Center",
  account_settings: "Tài Khoản Của Tôi",
  my_shifts: "Ca Của Tôi",
  my_talent_profile: "Hồ Sơ Của Tôi"
};

// Cùng id nhưng talent thấy tên khác (menu talent).
export const TALENT_TAB_LABELS: Record<string, string> = {
  shift_scheduling: "Đăng Ký Ca"
};

export const BRAND_TAB_LABELS: Record<string, string> = {
  brand_dashboard: "Dashboard",
  brand_calendar: "Lịch Vận Hành",
  brand_sessions: "Sổ Ca",
  brand_skus: "Sản phẩm lên live",
  brand_monthly_report: "Report Tháng",
  brand_commitment_view: "Hợp Đồng",
  brand_next_month_plan: "Kế Hoạch Tháng Sau",
  brand_rate_card: "Rate Card", // đã gộp vào tab Hợp Đồng (06/10) — giữ tên cho lượt mở cũ
  brand_affiliate: "Affiliate",
  brand_ads_report: "Nhập Ads",
  brand_dataraw: "Dữ Liệu Gốc",
  account_settings: "Tài Khoản Của Tôi"
};

export function tabLabel(workspace: "agency" | "brand", tab: string, role?: string): string {
  if (workspace === "brand") return BRAND_TAB_LABELS[tab] ?? tab;
  if (role === "talent" && TALENT_TAB_LABELS[tab]) return TALENT_TAB_LABELS[tab];
  return AGENCY_TAB_LABELS[tab] ?? tab;
}
