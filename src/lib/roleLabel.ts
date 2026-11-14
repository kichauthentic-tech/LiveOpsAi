import type { UserRole } from "../types";

// Tên vai trò bằng tiếng Việt — MỘT chỗ (§5.2 "một chỗ nhập cho mỗi khái niệm").
//
// Trước 14/11 chỉ màn Phân Quyền có bảng tên này (hàm `getRoleDefaultTitle` nằm trong
// UserRoleSettings.tsx), nên màn chặn quyền ở App.tsx in thẳng mã role viết hoa ("ADMIN") cho người
// dùng đọc. Tách ra đây để hai nơi gọi cùng một tên.
export function roleLabel(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Quản trị hệ thống";
    case "ceo":
      return "CEO";
    case "operations":
      return "Vận hành";
    case "brand":
      return "Đại diện brand";
    case "talent":
      return "Host / Trợ live";
    case "trainer":
      return "Trainer";
  }
}
