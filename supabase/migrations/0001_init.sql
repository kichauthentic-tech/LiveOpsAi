-- LiveOps AI — Phase 0: Core schema
-- Mirrors src/types.ts. Run this in Supabase SQL Editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role as enum ('ceo', 'operations', 'brand', 'talent');
create type user_status as enum ('Active', 'Inactive');
create type contract_status as enum ('Active', 'Pending', 'Completed');
create type talent_role as enum ('Host', 'KOC', 'KOL', 'MC');
create type availability_status as enum ('Available', 'Busy', 'On Live');
create type studio_status as enum ('Live Now', 'Booked', 'Available', 'Maintenance');
create type equipment_category as enum ('Camera', 'Lighting', 'Audio', 'PC/Switcher', 'Teleprompter');
create type equipment_status as enum ('In Use', 'In Stock', 'Maintenance', 'Damaged');
create type session_status as enum ('Live Now', 'Upcoming', 'Completed', 'Cancelled');
create type checklist_category as enum ('Tech', 'Studio', 'Product', 'Host & Script', 'TikTok App');
create type project_status as enum ('In Progress', 'Planning', 'Completed', 'Paused');
create type directive_department as enum ('Operations', 'Content & AI', 'Talent Management', 'Brand Client', 'Finance & Admin');
create type directive_priority as enum ('Urgent', 'High', 'Medium');
create type directive_status as enum ('Pending', 'In Progress', 'Needs BOD Support', 'Completed');
create type audit_category as enum ('Permission Change', 'Role Update', 'User Status', 'Security Alert');

-- ============================================================
-- PROFILES (extends auth.users) & PERMISSIONS
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  role user_role not null default 'talent',
  custom_role_title text not null default '',
  avatar text default '',
  status user_status not null default 'Active',
  assigned_brand_id uuid,
  assigned_talent_id uuid,
  last_login timestamptz,
  custom_permission_overrides jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role user_role primary key,
  permissions jsonb not null default '{}'::jsonb
);

-- ============================================================
-- MASTER DATA
-- ============================================================
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo text default '',
  industry text default '',
  contact_name text default '',
  phone text default '',
  email text default '',
  active_campaigns int default 0,
  total_gmv numeric default 0,
  contract_status contract_status not null default 'Pending',
  owner text default '',
  owner_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table talents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text default '',
  role talent_role not null default 'Host',
  gender text default '',
  niches text[] default '{}',
  followers_tiktok bigint default 0,
  avg_gmv_per_session numeric default 0,
  ctr_avg numeric default 0,
  cvr_avg numeric default 0,
  rate_per_session numeric default 0,
  commission_rate numeric default 0,
  overall_score numeric default 0,
  availability_status availability_status not null default 'Available',
  brands_worked_with text[] default '{}',
  phone text default '',
  profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  room_number text default '',
  capacity int default 0,
  theme text default '',
  status studio_status not null default 'Available',
  current_session_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table equipments (
  id uuid primary key default gen_random_uuid(),
  qr_code text unique not null,
  name text not null,
  category equipment_category not null,
  model text default '',
  assigned_studio_id uuid references studios(id) on delete set null,
  status equipment_status not null default 'In Stock',
  last_check_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- PROJECTS & LIVE SESSIONS
-- ============================================================
create table agency_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand_id uuid references brands(id) on delete cascade,
  budget numeric default 0,
  kpi_gmv numeric default 0,
  actual_gmv numeric default 0,
  start_date date,
  end_date date,
  status project_status not null default 'Planning',
  total_sessions_planned int default 0,
  team_lead text default '',
  team_lead_user_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  brand_id uuid references brands(id) on delete set null,
  project_id uuid references agency_projects(id) on delete set null,
  shop_tiktok_handle text default '',
  studio_id uuid references studios(id) on delete set null,
  host_id uuid references talents(id) on delete set null,
  assistant_name text default '',
  date date not null,
  start_time time not null,
  end_time time not null,
  status session_status not null default 'Upcoming',
  target_gmv numeric default 0,
  actual_gmv numeric default 0,
  total_orders int default 0,
  avg_watch_time_seconds int default 0,
  peak_viewers int default 0,
  total_views int default 0,
  ctr_avg numeric default 0,
  cvr_avg numeric default 0,
  ai_analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table studios
  add constraint studios_current_session_fk
  foreign key (current_session_id) references live_sessions(id) on delete set null;

create table session_skus (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  code text not null,
  name text not null,
  category text default '',
  original_price numeric default 0,
  live_price numeric default 0,
  commission numeric default 0,
  stock int default 0,
  sold_in_session int default 0,
  click_count int default 0,
  ctr numeric default 0,
  cvr numeric default 0
);

create table session_checklist_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  task text not null,
  category checklist_category not null,
  completed boolean not null default false,
  assigned_to text default ''
);

create table session_minute_metrics (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  minute int not null,
  time_string text not null,
  viewers int default 0,
  peak_viewers int default 0,
  gmv_cumulative numeric default 0,
  gmv_per_minute numeric default 0,
  ctr numeric default 0,
  cvr numeric default 0,
  product_clicks int default 0,
  comments int default 0,
  event_trigger text
);

-- ============================================================
-- WORKFLOW, DIRECTIVES, AUDIT
-- ============================================================
create table workflow_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_desc text not null,
  action_desc text not null,
  enabled boolean not null default true,
  last_run timestamptz,
  executions_count int default 0,
  created_at timestamptz not null default now()
);

create table strategic_directives (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text default '',
  department directive_department not null,
  assigned_role text not null, -- user_role value or 'all'
  assignee_name text default '',
  priority directive_priority not null default 'Medium',
  target_kpi text default '',
  deadline date,
  status directive_status not null default 'Pending',
  progress_percent int default 0,
  notes_from_lead text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  performed_by uuid references profiles(id) on delete set null,
  performed_by_name text not null,
  action text not null,
  details text default '',
  category audit_category not null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at triggers
-- ============================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_brands_updated_at before update on brands for each row execute function set_updated_at();
create trigger trg_talents_updated_at before update on talents for each row execute function set_updated_at();
create trigger trg_studios_updated_at before update on studios for each row execute function set_updated_at();
create trigger trg_equipments_updated_at before update on equipments for each row execute function set_updated_at();
create trigger trg_projects_updated_at before update on agency_projects for each row execute function set_updated_at();
create trigger trg_sessions_updated_at before update on live_sessions for each row execute function set_updated_at();
create trigger trg_directives_updated_at before update on strategic_directives for each row execute function set_updated_at();

-- ============================================================
-- Auto-create profile row when a new auth user signs up
-- ============================================================
create or replace function handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, name, email, role, custom_role_title)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'talent'),
    coalesce(new.raw_user_meta_data->>'custom_role_title', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Seed default role permissions
-- ============================================================
insert into role_permissions (role, permissions) values
  ('ceo', '{"view_financials":true,"view_executive_brief":true,"manage_sessions":true,"manage_calendar":true,"generate_scripts":true,"manage_talents":true,"manage_studios_gear":true,"manage_crm_projects":true,"manage_tiktok_api":true,"manage_finance_hr":true,"manage_ai_agents":true,"manage_users_permissions":true,"export_reports":true}'::jsonb),
  ('operations', '{"view_financials":false,"view_executive_brief":true,"manage_sessions":true,"manage_calendar":true,"generate_scripts":true,"manage_talents":true,"manage_studios_gear":true,"manage_crm_projects":true,"manage_tiktok_api":true,"manage_finance_hr":false,"manage_ai_agents":true,"manage_users_permissions":false,"export_reports":true}'::jsonb),
  ('brand', '{"view_financials":false,"view_executive_brief":false,"manage_sessions":false,"manage_calendar":false,"generate_scripts":true,"manage_talents":false,"manage_studios_gear":false,"manage_crm_projects":false,"manage_tiktok_api":false,"manage_finance_hr":false,"manage_ai_agents":false,"manage_users_permissions":false,"export_reports":true}'::jsonb),
  ('talent', '{"view_financials":false,"view_executive_brief":false,"manage_sessions":false,"manage_calendar":false,"generate_scripts":true,"manage_talents":false,"manage_studios_gear":false,"manage_crm_projects":false,"manage_tiktok_api":false,"manage_finance_hr":false,"manage_ai_agents":false,"manage_users_permissions":false,"export_reports":false}'::jsonb);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
alter table role_permissions enable row level security;
alter table brands enable row level security;
alter table talents enable row level security;
alter table studios enable row level security;
alter table equipments enable row level security;
alter table agency_projects enable row level security;
alter table live_sessions enable row level security;
alter table session_skus enable row level security;
alter table session_checklist_items enable row level security;
alter table session_minute_metrics enable row level security;
alter table workflow_rules enable row level security;
alter table strategic_directives enable row level security;
alter table audit_logs enable row level security;

-- Helper: current user's role
create or replace function current_user_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Every authenticated user can read; only ceo/operations can write.
-- (Refine per-module in later phases — this is a safe, permissive-read / restrictive-write baseline.)
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'brands','talents','studios','equipments','agency_projects',
    'live_sessions','session_skus','session_checklist_items',
    'session_minute_metrics','workflow_rules','strategic_directives','audit_logs'
  ])
  loop
    execute format('create policy "%1$s_read_all" on %1$s for select using (auth.role() = ''authenticated'')', t);
    execute format('create policy "%1$s_write_ceo_ops" on %1$s for all using (current_user_role() in (''ceo'',''operations'')) with check (current_user_role() in (''ceo'',''operations''))', t);
  end loop;
end $$;

create policy "profiles_read_all" on profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_self_or_ceo" on profiles for update
  using (auth.uid() = id or current_user_role() = 'ceo')
  with check (auth.uid() = id or current_user_role() = 'ceo');

create policy "role_permissions_read_all" on role_permissions for select using (auth.role() = 'authenticated');
create policy "role_permissions_write_ceo" on role_permissions for all
  using (current_user_role() = 'ceo') with check (current_user_role() = 'ceo');
