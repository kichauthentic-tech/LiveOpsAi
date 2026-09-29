// Nhãn tiếng Việt cho giá trị trạng thái lưu trong DB (giá trị giữ nguyên tiếng Anh vì là enum/cột DB).
// Trước đây các màn in thẳng giá trị thô: "Available", "Active", "In Stock"… lẫn giữa giao diện tiếng
// Việt (audit UX 2026-09-29, Đợt 0 #6). Tên CHỈ SỐ tiếng Anh (Sessions, Orders…) là quy ước riêng —
// xem lib/metricGlossary.ts, không thuộc bảng này.

const LABELS: Record<string, string> = {
  // Talent (TalentMatcher) + phòng studio
  Available: "Sẵn sàng",
  Busy: "Đang bận",
  "On Live": "Đang live",
  Booked: "Đã đặt",
  "Live Now": "Đang live",
  Maintenance: "Bảo trì",
  // Thiết bị
  "In Stock": "Trong kho",
  "In Use": "Đang dùng",
  Damaged: "Hỏng",
  // Hợp đồng brand (CRM) + tài khoản
  Active: "Đang chạy",
  Pending: "Đang đàm phán",
  Completed: "Đã xong",
  Inactive: "Tạm khoá"
};

/** Nhãn hiển thị; giá trị lạ giữ nguyên để không giấu dữ liệu. */
export function statusLabel(value: string | null | undefined): string {
  if (!value) return "";
  return LABELS[value] ?? value;
}

/** Tài khoản đăng nhập: "Active" nghĩa là đang hoạt động, không phải "đang chạy" như hợp đồng. */
export function accountStatusLabel(value: string | null | undefined): string {
  return value === "Active" ? "Hoạt động" : statusLabel(value);
}
