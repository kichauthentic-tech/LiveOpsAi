-- Bản Tin CEO (2026-09-25) — % hoa hồng agency theo brand × nền tảng.
--
-- Trước đây % hoa hồng chỉ nhập được TỪNG CA ở Finance & P&L (session_finance.agency_commission_rate),
-- ca chưa có dòng session_finance thì lib/pnl.ts lặng lẽ dùng mặc định 15% trong code. Muốn màn CEO
-- tính doanh thu agency theo brand thì phải có một con số gắn với brand.
--
-- Cột để NULL được: NULL = "chưa đặt" (P&L báo thiếu), khác với 0% = "không thu hoa hồng".
-- Thứ tự ưu tiên trong lib/pnl.ts: session_finance của ca (ops chốt tay) > % của brand > mặc định (báo thiếu).

alter table brand_platform_rates
  add column if not exists commission_rate numeric
  check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));

alter table brand_platform_rate_history
  add column if not exists commission_rate numeric;

-- Theo dõi thêm commission_rate trong cùng 1 dòng lịch sử (pattern của 0039).
create or replace function trg_brand_platform_rate_history() returns trigger as $$
declare
  open_row brand_platform_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, return_rate, commission_rate, effective_from)
    values (new.brand_id, new.platform, new.rate_per_hour, new.return_rate, new.commission_rate, current_date);
    return new;
  end if;

  if new.rate_per_hour is distinct from old.rate_per_hour
     or new.return_rate is distinct from old.return_rate
     or new.commission_rate is distinct from old.commission_rate then
    select * into open_row from brand_platform_rate_history
      where brand_id = new.brand_id and platform = new.platform and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update brand_platform_rate_history
        set rate_per_hour = new.rate_per_hour, return_rate = new.return_rate, commission_rate = new.commission_rate
        where id = open_row.id;
    else
      if open_row.id is not null then
        update brand_platform_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, return_rate, commission_rate, effective_from)
        values (new.brand_id, new.platform, new.rate_per_hour, new.return_rate, new.commission_rate, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

notify pgrst, 'reload schema';
