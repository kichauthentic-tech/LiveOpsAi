import { PermissionDefinition } from "../types";

export const ALL_PERMISSION_DEFINITIONS: PermissionDefinition[] = [
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
    key: "manage_users_permissions",
    label: "Quản Lý Phân Quyền & Người Dùng",
    category: "Quản Trị System & Tài Chính",
    description: "Quyền tối cao Admin: Tạo tài khoản, custom phân quyền theo role và xem Audit Log."
  }
];

