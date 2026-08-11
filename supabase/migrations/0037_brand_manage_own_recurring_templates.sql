-- Cho phép role 'brand' tự tạo/sửa/xoá Quy Tắc Lặp (RecurringShiftTemplate)
-- cho đúng brand của mình — mở rộng module Lịch Vận Hành hợp nhất sang cả
-- Brand Workspace (trước đây Quy Tắc Lặp chỉ có ở Agency).
create policy "recurring_shift_templates_write_brand_own" on recurring_shift_templates for all
  using (current_user_role() = 'brand' and brand_id = current_user_brand_id())
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());
