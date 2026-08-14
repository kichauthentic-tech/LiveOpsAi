import { PermissionDefinition } from "../types";

export const ALL_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: "view_financials",
    label: "Xem Báo Cáo Tài Chính & P&L",
    category: "Tổng Quan & Báo Cáo",
    description: "Cho phép truy cập số liệu doanh thu agency, lợi nhuận ròng, commission và dòng tiền P&L."
  },
  {
    key: "manage_sessions",
    label: "Quản Lý Phiên Livestream",
    category: "Vận Hành & Studio",
    description: "Tạo mới, chỉnh sửa, ghim SKU, chạy kịch bản live và cập nhật kết quả GMV."
  },
  {
    key: "manage_calendar",
    label: "Điều Phối Lịch Vận Hành Studio",
    category: "Vận Hành & Studio",
    description: "Xếp lịch sử dụng Studio, gán Host & Assistant, duyệt khung giờ trùng."
  },
  {
    key: "generate_scripts",
    label: "Sử Dụng AI Script Generator",
    category: "Nội Dung & AI",
    description: "Truy cập công cụ sinh kịch bản livestream tự động bằng Gemini AI cho các ngành hàng."
  },
  {
    key: "manage_talents",
    label: "Quản Lý Talent Pool & Matcher",
    category: "Nội Dung & AI",
    description: "Thêm, cập nhật profile Host/KOC/KOL, chấm điểm skill và duyệt mức thù lao/commission."
  },
  {
    key: "manage_studios_gear",
    label: "Quản Lý Studio & Thiết Bị QR",
    category: "Vận Hành & Studio",
    description: "Quản lý phòng studio, kiểm kê thiết bị bằng mã QR, cập nhật bảo trì gear."
  },
  {
    key: "manage_crm_projects",
    label: "Quản Lý CRM & Dự Án Brand",
    category: "Tổng Quan & Báo Cáo",
    description: "Quản lý danh sách Brand khách hàng, hợp đồng cam kết KPI GMV và ngân sách campaign."
  },
  {
    key: "manage_tiktok_api",
    label: "Cấu Hình TikTok API & Automation",
    category: "Quản Trị System & Tài Chính",
    description: "Quản lý OAuth token, Webhook đồng bộ đơn hàng real-time và thiết lập workflow quy trình."
  },
  {
    key: "manage_finance_hr",
    label: "Quản Lý Lương, Phụ Cấp & Commission",
    category: "Quản Trị System & Tài Chính",
    description: "Duyệt bảng lương Host/KOC, tính hoa hồng theo ca live và chi phí vận hành studio."
  },
  {
    key: "manage_ai_agents",
    label: "Điều Hành Hội Đồng AI Agents",
    category: "Nội Dung & AI",
    description: "Truy cập các AI Agent tư vấn chiến lược (Traffic, Conversion, Pricing, Host Performance)."
  },
  {
    key: "manage_users_permissions",
    label: "Quản Lý Phân Quyền & Người Dùng",
    category: "Quản Trị System & Tài Chính",
    description: "Quyền tối cao Admin: Tạo tài khoản, custom phân quyền theo role và xem Audit Log."
  },
  {
    key: "export_reports",
    label: "Xuất Báo Cáo Chi Tiết (Export)",
    category: "Tổng Quan & Báo Cáo",
    description: "Tải file dữ liệu Excel, PDF báo cáo hiệu suất chiến dịch cho Brand & Ban giám đốc."
  },
  {
    key: "view_rate_card",
    label: "Xem Rate Card & Tỷ Lệ Hoàn Hủy Brand",
    category: "Quản Trị System & Tài Chính",
    description: "Xem/sửa rate đ/giờ live, tỷ lệ hoàn hủy và NMV ước tính theo từng brand & nền tảng — áp dụng cho mọi role kể cả Brand (khác các tab khác trong Brand Workspace vốn không cần permission riêng)."
  }
];

