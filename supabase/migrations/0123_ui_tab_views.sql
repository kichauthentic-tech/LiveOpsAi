-- 0123 — Đếm lượt mở từng tab (audit UX 2026-09-26, P2). Trước khi gộp/bỏ mục menu (app có 18 tab agency +
-- 10 tab brand) cần biết tab nào người dùng thật mở — hiện không có số nào, gộp menu lúc này là đoán.
--
-- Mỗi lần mở tab = 1 dòng. Ai đang đăng nhập / role gì do TRIGGER điền từ auth.uid() + profiles, KHÔNG nhận
-- từ client — nên không ai ghi hộ người khác hay tự khai role khác để làm lệch số. Chỉ ceo/admin đọc được.
-- Không có update/delete từ app (bảng chỉ ghi thêm). Khối lượng dự kiến: ~10 người × vài chục lượt/ngày.

create table if not exists ui_tab_views (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  workspace text not null check (workspace in ('agency', 'brand')),
  brand_id uuid references brands(id) on delete set null,
  tab text not null check (tab ~ '^[a-z_]{1,64}$'),
  viewed_at timestamptz not null default now()
);

create index if not exists idx_ui_tab_views_viewed_at on ui_tab_views (viewed_at desc);

create or replace function ui_tab_views_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.role := (select p.role::text from profiles p where p.id = auth.uid());
  new.viewed_at := now();
  if new.user_id is null or new.role is null then
    raise exception 'ui_tab_views: chưa đăng nhập hoặc chưa có profile' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ui_tab_views_fill on ui_tab_views;
create trigger trg_ui_tab_views_fill before insert on ui_tab_views
  for each row execute function ui_tab_views_fill();

alter table ui_tab_views enable row level security;

drop policy if exists "ui_tab_views_insert_own" on ui_tab_views;
create policy "ui_tab_views_insert_own" on ui_tab_views for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "ui_tab_views_read_ceo_admin" on ui_tab_views;
create policy "ui_tab_views_read_ceo_admin" on ui_tab_views for select to authenticated
  using ((select current_user_role()) in ('ceo', 'admin'));

revoke all on ui_tab_views from anon;
grant select, insert on ui_tab_views to authenticated;

-- Tổng hợp N ngày gần nhất theo (workspace, tab, role). SECURITY INVOKER: đi qua RLS ở trên, nên role khác
-- ceo/admin gọi được nhưng nhận 0 dòng — không cần guard riêng trong thân hàm.
create or replace function tab_usage_summary(p_days int default 30)
returns table (workspace text, tab text, role text, opens bigint, users bigint, first_viewed timestamptz, last_viewed timestamptz)
language sql stable security invoker set search_path = public as $$
  select v.workspace, v.tab, v.role, count(*), count(distinct v.user_id), min(v.viewed_at), max(v.viewed_at)
  from ui_tab_views v
  where v.viewed_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  group by v.workspace, v.tab, v.role
  order by count(*) desc;
$$;

revoke all on function tab_usage_summary(int) from public, anon;
grant execute on function tab_usage_summary(int) to authenticated;
