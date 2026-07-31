-- Giai đoạn 14a — Số hóa lịch đăng ký & chốt ca Host (thay thế file Excel
-- "ĐĂNG KÍ LỊCH THÁNG X" / "LỊCH CHỐT THÁNG X"). Chạy 1 lần, không cần tách bước.

-- ---------------------------------------------------------------------------
-- 1) Platform trên live_sessions (Excel có cột PLATFORM Tiktok/Shopee, hệ
--    thống hiện tại chưa phân biệt — mọi session cũ mặc định 'TikTok' vì
--    trước giờ chỉ có shop_tiktok_handle).
-- ---------------------------------------------------------------------------
create type session_platform as enum ('TikTok', 'Shopee');

alter table live_sessions add column if not exists platform session_platform not null default 'TikTok';

-- ---------------------------------------------------------------------------
-- 2) Co-host (Excel cột ASSISTANT = "trợ live", một talent lên hình cùng
--    host — khác hẳn assistant_id/assistant_name hiện có (đó là "Trợ Lý Vận
--    Hành"/role moderator, một tài khoản ops, không lên hình). Không dùng
--    talent_role riêng vì cùng 1 người có thể là Host ở slot này, Co-host ở
--    slot khác — đây là vai trò theo từng ca, không phải phân loại cố định.
-- ---------------------------------------------------------------------------
alter table live_sessions add column if not exists co_host_id uuid references talents(id) on delete set null;
alter table live_sessions add column if not exists co_host_name text not null default '';

-- update_session_with_children (migration 0007, sửa lại ở 0010) update trực
-- tiếp từng cột theo tên nên phải replace lại để ghi được platform/co_host_*.
create or replace function update_session_with_children(
  p_session_id uuid,
  p_session jsonb,
  p_skus jsonb,
  p_checklist jsonb,
  p_metrics jsonb
) returns live_sessions as $$
declare
  v_row live_sessions;
begin
  update live_sessions set
    title = p_session->>'title',
    brand_id = (p_session->>'brand_id')::uuid,
    brand_name = coalesce(p_session->>'brand_name', ''),
    project_id = (p_session->>'project_id')::uuid,
    shop_tiktok_handle = coalesce(p_session->>'shop_tiktok_handle', ''),
    studio_id = (p_session->>'studio_id')::uuid,
    studio_name = coalesce(p_session->>'studio_name', ''),
    host_id = (p_session->>'host_id')::uuid,
    host_name = coalesce(p_session->>'host_name', ''),
    assistant_id = (p_session->>'assistant_id')::uuid,
    assistant_name = coalesce(p_session->>'assistant_name', ''),
    co_host_id = (p_session->>'co_host_id')::uuid,
    co_host_name = coalesce(p_session->>'co_host_name', ''),
    platform = coalesce((p_session->>'platform')::session_platform, 'TikTok'),
    date = (p_session->>'date')::date,
    start_time = (p_session->>'start_time')::time,
    end_time = (p_session->>'end_time')::time,
    status = (p_session->>'status')::session_status,
    target_gmv = coalesce((p_session->>'target_gmv')::numeric, 0),
    actual_gmv = coalesce((p_session->>'actual_gmv')::numeric, 0),
    total_orders = coalesce((p_session->>'total_orders')::int, 0),
    avg_watch_time_seconds = coalesce((p_session->>'avg_watch_time_seconds')::int, 0),
    peak_viewers = coalesce((p_session->>'peak_viewers')::int, 0),
    total_views = coalesce((p_session->>'total_views')::int, 0),
    ctr_avg = coalesce((p_session->>'ctr_avg')::numeric, 0),
    cvr_avg = coalesce((p_session->>'cvr_avg')::numeric, 0),
    ai_analysis = p_session->'ai_analysis'
  where id = p_session_id
  returning * into v_row;

  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  perform replace_session_children(p_session_id, p_skus, p_checklist, p_metrics);

  return v_row;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- 3) Rate card theo brand + platform — thay cho việc Excel hard-code đơn giá
--    GMV mục tiêu/giờ ngay trong công thức (vd "=3000000*E2"). Sửa 1 chỗ,
--    áp dụng cho mọi slot tương lai của brand đó.
-- ---------------------------------------------------------------------------
create table brand_platform_rates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform session_platform not null,
  rate_per_hour numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform)
);

alter table brand_platform_rates enable row level security;
create policy "brand_platform_rates_read_all" on brand_platform_rates for select using (auth.role() = 'authenticated');
create policy "brand_platform_rates_write_ceo_ops" on brand_platform_rates for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create trigger trg_brand_platform_rates_updated_at before update on brand_platform_rates
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 4) Slot mở đăng ký (tab "ĐĂNG KÍ LỊCH THÁNG X") — tách khỏi live_sessions
--    vì phần lớn slot mở đăng ký chưa có host/assistant thật, không nên tạo
--    hàng trăm live_sessions "rỗng" mỗi tháng chỉ để gom lượt đăng ký. Khi
--    admin chốt xong (chọn host + co-host), slot mới sinh ra 1 live_sessions
--    thật và lưu lại session_id để tra ngược.
-- ---------------------------------------------------------------------------
create table shift_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  start_time time not null,
  end_time time not null,
  brand_id uuid references brands(id) on delete set null,
  brand_name text not null default '',
  platform session_platform not null default 'TikTok',
  studio_id uuid references studios(id) on delete set null,
  studio_name text not null default '',
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'finalized', 'cancelled')),
  session_id uuid references live_sessions(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table shift_slots enable row level security;
create policy "shift_slots_read_all" on shift_slots for select using (auth.role() = 'authenticated');
create policy "shift_slots_write_ceo_ops" on shift_slots for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create trigger trg_shift_slots_updated_at before update on shift_slots
  for each row execute function set_updated_at();

create index idx_shift_slots_date on shift_slots(date);
create index idx_shift_slots_status on shift_slots(status);

-- ---------------------------------------------------------------------------
-- 5) Đăng ký ca (thay ma trận TRUE/FALSE theo cột host trong Excel) — mỗi
--    dòng = 1 talent nói "tôi rảnh/muốn nhận slot này". Host tự ghi qua tài
--    khoản của chính họ (profiles.assigned_talent_id), không cần admin tick
--    hộ như file Excel.
-- ---------------------------------------------------------------------------
create table session_availability (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references shift_slots(id) on delete cascade,
  talent_id uuid not null references talents(id) on delete cascade,
  registered_at timestamptz not null default now(),
  unique (slot_id, talent_id)
);

alter table session_availability enable row level security;

-- Helper: talent_id gắn với tài khoản đang đăng nhập (qua profiles.assigned_talent_id).
-- security definer để đọc được profiles của chính user dù RLS profiles có siết sau này.
create or replace function current_user_talent_id() returns uuid as $$
  select assigned_talent_id from profiles where id = auth.uid();
$$ language sql stable security definer;

create policy "session_availability_read_all" on session_availability for select using (auth.role() = 'authenticated');
create policy "session_availability_insert_self_or_ceo_ops" on session_availability for insert
  with check (talent_id = current_user_talent_id() or current_user_role() in ('ceo', 'operations', 'admin'));
create policy "session_availability_delete_self_or_ceo_ops" on session_availability for delete
  using (talent_id = current_user_talent_id() or current_user_role() in ('ceo', 'operations', 'admin'));

create index idx_session_availability_slot on session_availability(slot_id);
create index idx_session_availability_talent on session_availability(talent_id);

-- ---------------------------------------------------------------------------
-- 6) Index cho cột FK mới trên live_sessions (đúng convention đã áp dụng ở
--    migration 0013 cho các FK khác).
-- ---------------------------------------------------------------------------
create index idx_live_sessions_co_host on live_sessions(co_host_id);
