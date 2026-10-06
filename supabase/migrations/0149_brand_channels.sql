-- 0149 — KÊNH (brand × sàn) thành một thực thể thật: bảng brand_channels.
--
-- Audit đa sàn 07/10 (Bước 1 của lộ trình user duyệt): trước 0149 "sàn" chỉ là cột chữ platform dán vào 12 bảng, mặc định
-- 'TikTok'. Không bảng nào nói "VERA có kênh Shopee", nên app phải ĐOÁN brand chạy sàn nào từ việc đã có ca/phòng hay chưa
-- (7 chỗ đoán theo 5 kiểu khác nhau) — kênh mới phải tạo ca trước mới "hiện ra", và danh sách kênh lệch giữa các màn.
--
--   1) Bảng brand_channels: một dòng = một gian hàng của brand trên một sàn (tên gian hàng, mã shop ngoài, trạng thái,
--      ngày bắt đầu). Khoá (brand_id, platform).
--   2) Nạp sẵn mọi cặp (brand, sàn) đang có ở 12 bảng — đo 07/10: 7 kênh (CROCS TikTok; VERA, JOCKEY, Franklin hai sàn).
--   3) Chốt chặn: 12 bảng có cột sàn KHÔNG nhận dòng của kênh chưa tồn tại (trigger, vì cột sàn của các bảng khác kiểu nhau:
--      enum session_platform ở ca/ca mở/mẫu lặp/giá/lịch sử giá/phòng mặc định, text ở kế hoạch/hợp đồng/cam kết/report/bản
--      chụp/lô đối soát — khoá ngoại ghép không nối được hai kiểu). Kênh không xoá được, chỉ tạm dừng (status = 'paused').
--   4) RLS khuôn 0105: ceo/operations/admin đọc + ghi; brand đọc kênh của mình. Không ai xoá.
--
-- Thứ tự deploy: chạy migration TRƯỚC, deploy client sau. Client cũ không đọc bảng này và chỉ ghi dòng cho kênh đã có (đã
-- nạp sẵn ở bước 2) nên vẫn chạy; client mới thiếu bảng thì tự suy kênh như cũ. Chạy lại nhiều lần không sao.

create table if not exists brand_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null check (platform in ('TikTok', 'Shopee')),
  shop_name text not null default '',
  shop_ref text not null default '',
  status text not null default 'active' check (status in ('active', 'paused')),
  started_on date,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform)
);

-- ============================================================================
-- Nạp sẵn kênh từ dữ liệu đang có
-- ============================================================================
insert into brand_channels (brand_id, platform, started_on)
select brand_id, platform, min(first_date)
  from (
    select brand_id, platform::text as platform, min(date) as first_date from live_sessions where brand_id is not null group by 1, 2
    union all select brand_id, platform::text, min(date) from shift_slots where brand_id is not null group by 1, 2
    union all select brand_id, platform::text, null::date from recurring_shift_templates where brand_id is not null group by 1, 2
    union all select brand_id, platform::text, null::date from brand_platform_rates group by 1, 2
    union all select brand_id, platform::text, null::date from brand_platform_rate_history group by 1, 2
    union all select brand_id, platform::text, null::date from brand_studios group by 1, 2
    union all select brand_id, platform, null::date from brand_month_plans group by 1, 2
    union all select brand_id, platform, null::date from brand_contracts group by 1, 2
    union all select brand_id, platform, null::date from brand_monthly_commitments group by 1, 2
    union all select brand_id, platform, null::date from brand_monthly_reports group by 1, 2
    union all select brand_id, platform, null::date from brand_monthly_report_snapshots group by 1, 2
    union all select brand_id, platform, null::date from live_reconciliation_batches where brand_id is not null group by 1, 2
  ) x
 where brand_id in (select id from brands)
 group by brand_id, platform
on conflict (brand_id, platform) do nothing;

-- ============================================================================
-- Chốt chặn: dòng của kênh chưa tồn tại bị từ chối
-- ============================================================================
create or replace function private.guard_channel_exists()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand text;
begin
  if new.brand_id is null then
    return new;
  end if;
  if exists (select 1 from brand_channels c where c.brand_id = new.brand_id and c.platform = new.platform::text) then
    return new;
  end if;
  select name into v_brand from brands where id = new.brand_id;
  raise exception 'Brand % chưa có kênh %. Thêm kênh ở CRM (thẻ brand → Kênh) rồi làm lại.', coalesce(v_brand, new.brand_id::text), new.platform::text
    using errcode = 'P0001';
end;
$$;
revoke all on function private.guard_channel_exists() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'live_sessions', 'shift_slots', 'recurring_shift_templates', 'brand_platform_rates', 'brand_platform_rate_history',
    'brand_studios', 'brand_month_plans', 'brand_contracts', 'brand_monthly_commitments', 'brand_monthly_reports',
    'brand_monthly_report_snapshots', 'live_reconciliation_batches'
  ] loop
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists trg_guard_channel_exists on %I', t);
    execute format(
      'create trigger trg_guard_channel_exists before insert or update of brand_id, platform on %I for each row execute function private.guard_channel_exists()',
      t
    );
  end loop;
end $$;

-- updated_at tự cập nhật.
create or replace function private.touch_brand_channel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_brand_channel() from public;
drop trigger if exists trg_touch_brand_channel on brand_channels;
create trigger trg_touch_brand_channel before update on brand_channels for each row execute function private.touch_brand_channel();

-- Không đổi brand/sàn của một kênh đã có (dòng ở 12 bảng đang trỏ theo cặp này): muốn đổi thì tạo kênh mới.
create or replace function private.guard_channel_identity()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.brand_id is distinct from old.brand_id or new.platform is distinct from old.platform then
    raise exception 'Không đổi được brand hoặc sàn của một kênh đã có. Tạo kênh mới, kênh cũ thì tạm dừng.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_channel_identity() from public;
drop trigger if exists trg_guard_channel_identity on brand_channels;
create trigger trg_guard_channel_identity before update on brand_channels for each row execute function private.guard_channel_identity();

-- ============================================================================
-- RLS
-- ============================================================================
alter table brand_channels enable row level security;

drop policy if exists brand_channels_read on brand_channels;
create policy brand_channels_read on brand_channels
  for select to authenticated
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
  );

drop policy if exists brand_channels_insert on brand_channels;
create policy brand_channels_insert on brand_channels
  for insert to authenticated
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));

drop policy if exists brand_channels_update on brand_channels;
create policy brand_channels_update on brand_channels
  for update to authenticated
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));

revoke all on brand_channels from anon;
revoke delete on brand_channels from authenticated;
grant select, insert, update on brand_channels to authenticated;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
declare
  v_missing int;
begin
  if to_regclass('public.brand_channels') is null then
    raise exception '0149: thiếu bảng brand_channels';
  end if;
  select count(*) into v_missing
    from (select distinct brand_id, platform::text as platform from live_sessions where brand_id is not null) s
   where not exists (select 1 from brand_channels c where c.brand_id = s.brand_id and c.platform = s.platform);
  if v_missing > 0 then
    raise exception '0149: % cặp brand × sàn của ca chưa có kênh', v_missing;
  end if;
  select count(*) into v_missing
    from unnest(array[
      'live_sessions', 'shift_slots', 'recurring_shift_templates', 'brand_platform_rates', 'brand_platform_rate_history',
      'brand_studios', 'brand_month_plans', 'brand_contracts', 'brand_monthly_commitments', 'brand_monthly_reports',
      'brand_monthly_report_snapshots', 'live_reconciliation_batches'
    ]) t
   where to_regclass('public.' || t) is not null
     and not exists (select 1 from pg_trigger g where g.tgname = 'trg_guard_channel_exists' and g.tgrelid = ('public.' || t)::regclass);
  if v_missing > 0 then
    raise exception '0149: % bảng chưa có trigger chặn kênh chưa tồn tại', v_missing;
  end if;
end $$;
