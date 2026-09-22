// Quy ước của repo (xem WORKSPACE_DESIGN.md): mọi `.update()`/`.delete()` qua PostgREST phải kèm
// `.select()` và ĐẾM số dòng trả về. RLS lọc còn 0 dòng thì PostgREST trả 204 không kèm error, nên
// không đếm thì thao tác bị chặn vẫn "báo thành công" — người dùng tưởng đã xoá/sửa, tới lúc F5 mới
// thấy dữ liệu còn nguyên. Audit 2026-09-21 thấy ~15 hàm trong tầng db còn thiếu, gom về một helper
// để không mỗi chỗ viết một kiểu.
export function assertAffected(rows: unknown[] | null, what: string): void {
  if (!rows || rows.length === 0) {
    throw new Error(`Không ${what} được — tài khoản của bạn không có quyền với dòng này, hoặc nó đã bị xoá.`);
  }
}
