-- Giai đoạn 27 — Rate Card: thêm tỷ lệ hoàn hủy (return/cancellation rate) theo brand +
-- platform để ước tính NMV từ GMV (NMV ước tính = GMV × (1 - tỷ lệ hoàn hủy)), và tách
-- quyền xem tab Rate Card khỏi luồng "vào được Brand Workspace" chung — theo yêu cầu user,
-- kể cả role brand cũng cần được cấp quyền `view_rate_card` mới thấy tab này (không còn
-- mặc định thấy chỉ vì đã ở trong brand workspace).

-- 1) Tỷ lệ hoàn hủy — riêng theo từng platform (TikTok/Shopee có thể khác nhau thật),
-- cùng bảng brand_platform_rates (đã có unique (brand_id, platform)) thay vì bảng brand
-- riêng, vì Rate Card vốn đã hiển thị theo platform.
alter table brand_platform_rates
  add column return_rate numeric not null default 0
  check (return_rate >= 0 and return_rate <= 100);

alter table brand_platform_rate_history
  add column return_rate numeric not null default 0;

-- Trigger cũ (migration 0018) chỉ theo dõi rate_per_hour — mở rộng theo đúng pattern
-- trg_talent_rate_history (theo dõi nhiều field trong cùng 1 row lịch sử).
create or replace function trg_brand_platform_rate_history() returns trigger as $$
declare
  open_row brand_platform_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, return_rate, effective_from)
    values (new.brand_id, new.platform, new.rate_per_hour, new.return_rate, current_date);
    return new;
  end if;

  if new.rate_per_hour is distinct from old.rate_per_hour
     or new.return_rate is distinct from old.return_rate then
    select * into open_row from brand_platform_rate_history
      where brand_id = new.brand_id and platform = new.platform and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update brand_platform_rate_history
        set rate_per_hour = new.rate_per_hour, return_rate = new.return_rate
        where id = open_row.id;
    else
      if open_row.id is not null then
        update brand_platform_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, return_rate, effective_from)
        values (new.brand_id, new.platform, new.rate_per_hour, new.return_rate, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;
-- Trigger trg_brand_platform_rates_history (migration 0018) đã trỏ tới hàm này theo tên,
-- create or replace là đủ, không cần drop/create lại trigger.

-- 2) PermissionKey mới `view_rate_card` — CEO bật/tắt theo role trong Ma Trận Phân Quyền,
-- áp dụng cho MỌI role kể cả `brand` (khác các tab brand-scoped khác vốn không gate theo
-- PermissionKey — xem WORKSPACE_DESIGN.md mục 2 — Rate Card là ngoại lệ vì lộ % hoa hồng/
-- rate thương mại, user chốt cần kiểm soát chặt hơn Calendar/Sessions).
-- Mặc định true cho ceo/admin/operations/brand (giữ đúng hành vi hiện tại, không khoá nhầm
-- ai đang dùng), false cho talent/moderator (chưa từng có quyền này).
update role_permissions
  set permissions = permissions || '{"view_rate_card": true}'::jsonb
  where role in ('ceo', 'admin', 'operations', 'brand');

update role_permissions
  set permissions = permissions || '{"view_rate_card": false}'::jsonb
  where role in ('talent', 'moderator');
