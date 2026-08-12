-- Mở rộng Scheme khuyến mãi (Giai đoạn C3) để nhúng thẳng vào Brand Workspace Calendar —
-- yêu cầu mới: scheme không còn chỉ agency-wide mà còn theo riêng từng brand, và cần phân
-- loại theo hạng mục (Voucher scheme, Combo Deal, Free Gift...) như file Excel vận hành thật.
--
-- `brand_id` nullable: giữ nguyên khái niệm cũ "scheme áp dụng toàn agency" khi null (không
-- phá vỡ dữ liệu/luồng LiveCalendar hiện có). `category` tự do (không enum) vì hạng mục có
-- thể đổi/thêm bất cứ lúc nào theo nhu cầu vận hành thật — default 'Chung' để dữ liệu cũ hợp lệ.

alter table promo_schemes add column brand_id uuid references brands(id) on delete cascade;
alter table promo_schemes add column category text not null default 'Chung';

create index promo_schemes_brand_id_idx on promo_schemes (brand_id);

-- Role 'brand' được tự quản lý scheme của chính brand mình — cùng pattern
-- live_sessions_insert_brand_own/shift_slots_insert_brand_own (migration 0035).
create policy "promo_schemes_insert_brand_own" on promo_schemes for insert
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());

create policy "promo_schemes_update_brand_own" on promo_schemes for update
  using (current_user_role() = 'brand' and brand_id = current_user_brand_id())
  with check (current_user_role() = 'brand' and brand_id = current_user_brand_id());

create policy "promo_schemes_delete_brand_own" on promo_schemes for delete
  using (current_user_role() = 'brand' and brand_id = current_user_brand_id());
