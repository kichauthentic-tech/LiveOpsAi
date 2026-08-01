-- Giai đoạn 19 — Rate Card Versioning (Talent + Brand)
--
-- Bối cảnh: talents.rate_per_session/commission_rate và brand_platform_rates.rate_per_hour
-- là giá trị đơn, sửa là ghi đè — không có lịch sử theo thời gian. Rủi ro tài chính: đổi rate
-- tháng sau, nếu tính lại P&L của session tháng trước (FinanceHr.tsx) sẽ vô tình dùng nhầm
-- rate mới, vì trước giai đoạn này FinanceHr đọc thẳng giá trị hiện tại của talents/
-- brand_platform_rates cho MỌI session bất kể ngày diễn ra.
--
-- Giải pháp: 2 bảng lịch sử mới, tự động ghi bởi trigger mỗi khi talents/brand_platform_rates
-- đổi rate — không cần sửa lớp ghi hiện có (talents.ts/brandPlatformRates.ts giữ nguyên hành vi
-- upsert-tại-chỗ, kể cả khi sửa tay qua SQL Editor vẫn được version đúng). Tầng ứng dụng
-- (FinanceHr.tsx) tra rate "đúng tại effective_from <= session.date <= effective_to" thay vì
-- đọc giá trị hiện tại của talents/brand_platform_rates.

create table talent_rate_history (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talents(id) on delete cascade,
  rate_per_session numeric not null default 0,
  commission_rate numeric not null default 0,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now()
);
create index idx_talent_rate_history_talent on talent_rate_history(talent_id, effective_from);

create table brand_platform_rate_history (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform session_platform not null,
  rate_per_hour numeric not null default 0,
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now()
);
create index idx_brand_platform_rate_history_brand on brand_platform_rate_history(brand_id, platform, effective_from);

alter table talent_rate_history enable row level security;
create policy "talent_rate_history_read_all" on talent_rate_history for select using (auth.role() = 'authenticated');
create policy "talent_rate_history_write_ceo_ops" on talent_rate_history for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

alter table brand_platform_rate_history enable row level security;
create policy "brand_platform_rate_history_read_all" on brand_platform_rate_history for select using (auth.role() = 'authenticated');
create policy "brand_platform_rate_history_write_ceo_ops" on brand_platform_rate_history for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

-- Trigger: mỗi lần talents.rate_per_session/commission_rate đổi, đóng dòng lịch sử đang mở
-- (effective_to is null) và mở dòng mới bắt đầu hôm nay — trừ khi dòng đang mở CŨNG bắt đầu
-- hôm nay (sửa nhiều lần trong cùng 1 ngày = ghi đè tại chỗ, tránh version rỗng cùng ngày).
create or replace function trg_talent_rate_history() returns trigger as $$
declare
  open_row talent_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into talent_rate_history (talent_id, rate_per_session, commission_rate, effective_from)
    values (new.id, new.rate_per_session, new.commission_rate, current_date);
    return new;
  end if;

  if new.rate_per_session is distinct from old.rate_per_session
     or new.commission_rate is distinct from old.commission_rate then
    select * into open_row from talent_rate_history
      where talent_id = new.id and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update talent_rate_history
        set rate_per_session = new.rate_per_session, commission_rate = new.commission_rate
        where id = open_row.id;
    else
      if open_row.id is not null then
        update talent_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into talent_rate_history (talent_id, rate_per_session, commission_rate, effective_from)
        values (new.id, new.rate_per_session, new.commission_rate, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_talents_rate_history
  after insert or update on talents
  for each row execute function trg_talent_rate_history();

-- Tương tự cho brand_platform_rates, khoá theo (brand_id, platform) thay vì talent_id.
create or replace function trg_brand_platform_rate_history() returns trigger as $$
declare
  open_row brand_platform_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, effective_from)
    values (new.brand_id, new.platform, new.rate_per_hour, current_date);
    return new;
  end if;

  if new.rate_per_hour is distinct from old.rate_per_hour then
    select * into open_row from brand_platform_rate_history
      where brand_id = new.brand_id and platform = new.platform and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update brand_platform_rate_history set rate_per_hour = new.rate_per_hour where id = open_row.id;
    else
      if open_row.id is not null then
        update brand_platform_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, effective_from)
        values (new.brand_id, new.platform, new.rate_per_hour, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_brand_platform_rates_history
  after insert or update on brand_platform_rates
  for each row execute function trg_brand_platform_rate_history();

-- Backfill: mỗi talent / brand_platform_rate hiện có → 1 dòng lịch sử đang mở (effective_to
-- null), effective_from = ngày tạo record. Không có dữ liệu rate thật trước đó nên áp dụng
-- ngược cho mọi session cũ — đúng hành vi hiện tại của app trước giai đoạn này, không đổi số
-- liệu P&L quá khứ đã duyệt.
insert into talent_rate_history (talent_id, rate_per_session, commission_rate, effective_from)
select id, rate_per_session, commission_rate, created_at::date from talents;

insert into brand_platform_rate_history (brand_id, platform, rate_per_hour, effective_from)
select brand_id, platform, rate_per_hour, created_at::date from brand_platform_rates;
