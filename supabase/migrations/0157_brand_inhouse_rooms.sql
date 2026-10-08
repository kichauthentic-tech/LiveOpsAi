-- 0157 — PHÂN LOẠI ROOM TRƯỚC KHI NẠP BÙ CA (user 09/10: "thiếu từ agency mà cũng có thể là ca inhouse").
--
-- Nạp bù ca (0086/0156) coi mọi room trong file chưa thuộc ca nào là ca agency bị thiếu. Room do brand tự live (inhouse)
-- vì thế bị sinh thành ca agency host trống ⇒ phồng số ca/GMV agency. Bảng này ghi "room này là brand tự live":
-- khối Nạp bù ca bỏ các room đó khỏi danh sách sinh ca, và Ops xem/bỏ đánh dấu được.
-- Khoá (brand_id, room_id): cùng room_id không thể thuộc hai brand; Shopee dùng mã tổng hợp SHP-<ngày>-<giờ> như 0154/0156.
-- Giữ lại số đo chính để so hiệu suất agency vs inhouse mà không phải đọc lại file.
-- Chạy lại nhiều lần được.

create table if not exists brand_inhouse_rooms (
  brand_id uuid not null references brands(id) on delete cascade,
  room_id text not null,
  platform text not null default 'TikTok' check (platform in ('TikTok', 'Shopee')),
  room_title text,
  started_at timestamptz,
  ended_at timestamptz,
  gmv numeric not null default 0,
  orders int not null default 0,
  views bigint not null default 0,
  duration_minutes numeric not null default 0,
  marked_by uuid references auth.users(id) on delete set null default auth.uid(),
  marked_at timestamptz not null default now(),
  primary key (brand_id, room_id)
);

alter table brand_inhouse_rooms enable row level security;

revoke all on brand_inhouse_rooms from anon;
grant select, insert, update, delete on brand_inhouse_rooms to authenticated;

-- Đánh dấu hàng loạt (upsert). Room đã được sinh thành ca thì không đánh dấu inhouse nữa (đã là số liệu agency) —
-- trả về số room thực sự ghi nhận.
create or replace function mark_inhouse_rooms(p_brand_id uuid, p_platform text, p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được đánh dấu ca inhouse' using errcode = '42501';
  end if;
  if p_platform not in ('TikTok', 'Shopee') then
    raise exception 'Sàn không hợp lệ: %', p_platform;
  end if;

  with src as (
    select nullif(trim(r->>'room_id'), '') as room_id, r
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  ), ins as (
    insert into brand_inhouse_rooms (brand_id, room_id, platform, room_title, started_at, ended_at, gmv, orders, views, duration_minutes)
    select p_brand_id, s.room_id, p_platform, nullif(s.r->>'room_title', ''),
           nullif(s.r->>'started_at', '')::timestamptz, nullif(s.r->>'ended_at', '')::timestamptz,
           coalesce((s.r->>'gmv')::numeric, 0), coalesce((s.r->>'orders')::int, 0),
           coalesce((s.r->>'views')::bigint, 0), coalesce((s.r->>'duration_minutes')::numeric, 0)
    from src s
    where s.room_id is not null
      and not exists (
        select 1 from live_sessions ls
        where ls.brand_id = p_brand_id and (ls.tiktok_room_id = s.room_id or ls.live_room_ids @> array[s.room_id])
      )
    on conflict (brand_id, room_id) do update set
      platform = excluded.platform, room_title = excluded.room_title, started_at = excluded.started_at,
      ended_at = excluded.ended_at, gmv = excluded.gmv, orders = excluded.orders, views = excluded.views,
      duration_minutes = excluded.duration_minutes, marked_by = auth.uid(), marked_at = now()
    returning 1
  )
  select count(*) into v_n from ins;
  return v_n;
end;
$$;

create or replace function unmark_inhouse_rooms(p_brand_id uuid, p_room_ids text[])
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được bỏ đánh dấu ca inhouse' using errcode = '42501';
  end if;
  delete from brand_inhouse_rooms where brand_id = p_brand_id and room_id = any(coalesce(p_room_ids, '{}'::text[]));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function mark_inhouse_rooms(uuid, text, jsonb) from public;
revoke all on function unmark_inhouse_rooms(uuid, text[]) from public;
grant execute on function mark_inhouse_rooms(uuid, text, jsonb) to authenticated;
grant execute on function unmark_inhouse_rooms(uuid, text[]) to authenticated;

-- Đặt cuối file: tests/sqlGuards.test.ts quét 1200 ký tự sau mỗi `create policy`, đừng để thân hàm ngay dưới bị tính nhầm.
drop policy if exists brand_inhouse_rooms_ops on brand_inhouse_rooms;
create policy brand_inhouse_rooms_ops on brand_inhouse_rooms for all to authenticated
  using ((select current_user_role()) in ('ceo', 'admin', 'operations'))
  with check ((select current_user_role()) in ('ceo', 'admin', 'operations'));
