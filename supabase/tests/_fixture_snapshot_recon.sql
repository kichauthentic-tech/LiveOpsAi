do $r$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if; end $r$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create function current_user_role() returns text language sql stable as $$ select 'admin'::text $$;

create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null, start_time time not null, end_time time not null,
  status text not null default 'Completed',
  actual_gmv numeric not null default 0,
  total_orders int not null default 0,
  total_views bigint not null default 0,
  ctr_avg numeric not null default 0,
  avg_watch_time_seconds int not null default 0,
  attributed_items_sold int not null default 0,
  attributed_sku_orders int not null default 0,
  impressions bigint not null default 0,
  product_impressions bigint not null default 0,
  product_clicks bigint not null default 0,
  new_followers int not null default 0,
  comments_count int not null default 0,
  shares_count int not null default 0,
  likes_count int not null default 0,
  live_duration_minutes numeric,
  actual_start_at timestamptz, actual_end_at timestamptz,
  live_room_ids text[] not null default '{}'::text[],
  data_source text not null default 'manual',
  reconciled_at timestamptz
);

create table session_live_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  file_name text, period_label text,
  boundary_at timestamptz not null, captured_at timestamptz not null default now(),
  row_count int not null default 0, previous_values jsonb,
  uploaded_by uuid, created_at timestamptz not null default now()
);
create unique index on session_live_snapshots(session_id);

create table session_live_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references session_live_snapshots(id) on delete cascade,
  room_id text not null, room_title text,
  started_at timestamptz, ended_at timestamptz, raw jsonb not null default '{}'::jsonb,
  duration_minutes numeric not null default 0, gmv numeric not null default 0,
  items_sold int not null default 0, orders int not null default 0, sku_orders int not null default 0,
  views bigint not null default 0, impressions bigint not null default 0,
  product_impressions bigint not null default 0, product_clicks bigint not null default 0,
  new_followers int not null default 0, comments int not null default 0,
  shares int not null default 0, likes int not null default 0
);

create table live_reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text, period_label text, period_start date, period_end date,
  row_count int not null default 0, applied_at timestamptz, uploaded_by uuid,
  created_at timestamptz not null default now()
);
create table live_reconciliation_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references live_reconciliation_batches(id) on delete cascade,
  room_id text not null, room_title text,
  started_at timestamptz, ended_at timestamptz, raw jsonb not null default '{}'::jsonb,
  duration_minutes numeric not null default 0, gmv numeric not null default 0,
  items_sold int not null default 0, orders int not null default 0, sku_orders int not null default 0,
  views bigint not null default 0, impressions bigint not null default 0,
  product_impressions bigint not null default 0, product_clicks bigint not null default 0,
  new_followers int not null default 0, comments int not null default 0,
  shares int not null default 0, likes int not null default 0,
  bucket text not null default 'unassigned' check (bucket in ('agency','review','unassigned','inhouse')),
  matched_session_ids uuid[] not null default '{}'::uuid[]
);

create function session_boundary_at(p_session_id uuid) returns timestamptz language sql stable as $$
  select ((ls.date + case when ls.end_time <= ls.start_time then interval '1 day' else interval '0 day' end) + ls.end_time)
         at time zone 'Asia/Ho_Chi_Minh'
  from live_sessions ls where ls.id = p_session_id $$;
create function can_edit_session_snapshot(p_session_id uuid) returns boolean language sql stable as $$ select true $$;

-- view + recompute như 0080 (bản TRƯỚC 0124) để mô phỏng đúng trạng thái đang chạy
create or replace view session_room_deltas as
with snap as (
  select s.id as snapshot_id, s.session_id, s.boundary_at,
         (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' as session_start
  from session_live_snapshots s join live_sessions ls on ls.id = s.session_id)
select sn.session_id, sn.session_start, sn.boundary_at, c.room_id, c.started_at, c.ended_at,
  c.gmv - coalesce(p.gmv,0) as gmv, c.items_sold - coalesce(p.items_sold,0) as items_sold,
  c.orders - coalesce(p.orders,0) as orders, c.sku_orders - coalesce(p.sku_orders,0) as sku_orders,
  c.views - coalesce(p.views,0) as views, c.impressions - coalesce(p.impressions,0) as impressions,
  c.product_impressions - coalesce(p.product_impressions,0) as product_impressions,
  c.product_clicks - coalesce(p.product_clicks,0) as product_clicks,
  c.new_followers - coalesce(p.new_followers,0) as new_followers,
  c.comments - coalesce(p.comments,0) as comments, c.shares - coalesce(p.shares,0) as shares,
  c.likes - coalesce(p.likes,0) as likes, c.duration_minutes - coalesce(p.duration_minutes,0) as duration_minutes
from snap sn join session_live_snapshot_rows c on c.snapshot_id = sn.snapshot_id
left join lateral (select pr.* from session_live_snapshot_rows pr
  join session_live_snapshots ps on ps.id = pr.snapshot_id
  where pr.room_id = c.room_id and ps.boundary_at < sn.boundary_at
  order by ps.boundary_at desc limit 1) p on true
where (c.gmv - coalesce(p.gmv,0) > 0 or c.views - coalesce(p.views,0) > 0
    or c.orders - coalesce(p.orders,0) > 0 or c.duration_minutes - coalesce(p.duration_minutes,0) > 0)
  and (c.ended_at is null or c.ended_at >= sn.session_start)
  and (c.started_at is null or c.started_at <= sn.boundary_at);
