-- Phase 2: brands/projects chưa migrate sang Supabase, nên live_sessions không thể
-- luôn có brand_id/studio_id/host_id hợp lệ (form nhập tay tên thay vì chọn từ bảng thật).
-- Thêm cột text lưu tên hiển thị song song với các cột *_id (đã nullable sẵn) để UI
-- không phụ thuộc vào việc các FK đó có được điền hay không.
alter table live_sessions
  add column if not exists brand_name text default '',
  add column if not exists studio_name text default '',
  add column if not exists host_name text default '';
