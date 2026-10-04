import { PermissionDefinition } from "../types";

// Nhãn + mô tả của từng PermissionKey cho lưới Ma Trận Phân Quyền. Dữ liệu tĩnh của app (trước
// 2026-10-02 nằm ở src/data/mockData.ts dù chẳng có gì là mock). Bất biến key ↔ nav item: types.ts.
//
// Mô tả = ĐÚNG những màn công tắc này mở trong menu (appNav.ts), không hơn (audit người mới 2026-10-04: bản cũ
// còn hứa "ghim SKU, chạy kịch bản live", "kiểm kê thiết bị bằng mã QR", "chấm điểm skill" — đều đã gỡ hoặc chưa
// từng có). Đổi gate trong appNav.ts thì sửa câu ở đây theo.
export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: "manage_sessions",
    label: "Kế hoạch, ca và số liệu",
    category: "Vận hành",
    description: "Mở Dashboard, Kế Hoạch Tháng, Sổ Ca, Đối Soát Số Liệu, Hiệu Suất Host, Toàn Cảnh Brand và Điều Phối Phát Hành."
  },
  {
    key: "manage_calendar",
    label: "Bảng Vận Hành",
    category: "Vận hành",
    description: "Mở Bảng Vận Hành: ca hôm nay/tuần, lịch theo phòng live, mở ca chờ đăng ký."
  },
  {
    key: "manage_talents",
    label: "Talent Pool",
    category: "Nhân sự",
    description: "Mở Talent Pool: thêm/sửa hồ sơ host và trợ live, rate, gợi ý ghép host bằng AI."
  },
  {
    key: "manage_studios_gear",
    label: "Studios & Gear",
    category: "Vận hành",
    description: "Mở Studios & Gear: phòng live và thiết bị gắn với từng phòng."
  },
  {
    key: "manage_crm_projects",
    label: "CRM và hợp đồng",
    category: "Kinh doanh",
    description: "Mở CRM (thông tin brand, cách thu phí, Rate Card) và Cam Kết Hợp Đồng (giờ cam kết mỗi tháng)."
  },
  {
    key: "manage_tiktok_api",
    label: "TikTok API",
    category: "Hệ thống",
    description: "Mở màn kết nối TikTok Shop. Chưa dùng được: đang chờ TikTok cấp quyền."
  },
  {
    key: "manage_users_permissions",
    label: "Phân quyền và tài khoản",
    category: "Hệ thống",
    description: "Mở Phân Quyền & Role: tạo tài khoản, đổi quyền theo vai trò hoặc từng người, xem nhật ký."
  }
];
