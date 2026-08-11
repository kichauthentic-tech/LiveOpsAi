-- Cho phép role 'brand' tự tạo/sửa Live Session và mở Ca (Shift Slot) cho đúng brand
-- của mình — module "Lịch Vận Hành" hợp nhất (Agency + Brand cùng tạo/sửa session,
-- xem WORKSPACE_DESIGN.md mục "Đề xuất thiết kế: Module Lịch Vận Hành hợp nhất").
-- Không đổi policy ceo/operations/admin hiện có (vẫn full quyền xuyên brand) — chỉ
-- CỘNG THÊM 2 policy permissive mới cho brand, giới hạn brand_id = current_user_brand_id().

create policy "live_sessions_insert_brand_own" on live_sessions for insert
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());

create policy "live_sessions_update_brand_own" on live_sessions for update
  using (current_user_role() = 'brand' and brand_id = current_user_brand_id())
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());

create policy "shift_slots_insert_brand_own" on shift_slots for insert
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());
