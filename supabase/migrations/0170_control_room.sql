-- 0170 — Phòng Điều Hành (11/10/2026): ca nháp từ sa bàn + khả năng về đích cho brand.
--
-- Đề xuất + bản thử trên số thật: https://claude.ai/artifact/Hu2U23dfazeNpkbfJ518n9. User chốt 11/10:
--   (3) Sa bàn "Tự xếp" KHÔNG tạo ca thật ngay — tạo CA NHÁP để OP xác nhận / sửa giờ, người rồi mới thành ca.
--   (2) Brand được thấy khả năng về đích (không thấy bộ thương lượng target).
--
-- 1) Bảng session_drafts: ca nháp (brand × sàn × ngày giờ + host/trợ gợi ý + GMV kỳ vọng). Chỉ ceo/operations/admin đọc ghi.
--    RPC accept_session_draft: OP xác nhận ⇒ trong MỘT transaction tạo ca chờ đăng ký (shift_slots) rồi chốt người bằng đúng
--    finalize_shift_slot (0133) — đi đường của ca OP mở tay, nên: trùng người/phòng bị chặn như mọi ca (0143), kênh có Kế Hoạch
--    Tháng đã chốt thì trigger 0165 tự sinh dòng "ca tăng cường" (target đề xuất, KHÔNG cộng vào target tháng / run-rate).
--    Lỗi bất kỳ bước nào ⇒ rollback cả lần xác nhận, ca nháp giữ nguyên.
-- 2) RPC brand_landing_series: chuỗi khả năng về đích theo ngày của MỘT brand trong một tháng, tính từ sổ dự báo 0163
--    (dự phóng p50, biên hi, target) — CHỈ trả ngày, sàn, xác suất, target. KHÔNG trả GMV/dự phóng: role brand không được thấy số
--    của tháng chưa phát hành (live_sessions_secure 0107/0114, "phát hành = đóng sổ" 0133); xác suất là con số duy nhất được
--    phép lộ. Công thức = landingOf (forecastCone.ts): σ = (hi − p50) ÷ 1,2816, P = 1 − Φ((target − p50) ÷ σ).
--
-- Thứ tự deploy: chạy migration TRƯỚC hay SAU client đều được. Client mới gặp DB chưa có bảng/hàm ⇒ màn báo "Chưa chạy migration
-- 0170" ở đúng khối đó, phần còn lại của Phòng Điều Hành vẫn chạy. Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Ca nháp
-- ============================================================================
create table if not exists session_drafts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null default 'TikTok',
  date date not null,
  start_time time not null,
  end_time time not null,
  host_id uuid references talents(id) on delete set null,
  co_host_id uuid references talents(id) on delete set null,
  studio_id uuid references studios(id) on delete set null,
  expected_gmv numeric not null default 0,
  reason text not null default '',
  status text not null default 'draft',
  shift_slot_id uuid references shift_slots(id) on delete set null,
  session_id uuid references live_sessions(id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'session_drafts_platform_check') then
    alter table session_drafts add constraint session_drafts_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_drafts_status_check') then
    alter table session_drafts add constraint session_drafts_status_check check (status in ('draft', 'accepted', 'dismissed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_drafts_people_check') then
    alter table session_drafts add constraint session_drafts_people_check check (host_id is null or co_host_id is null or host_id <> co_host_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'session_drafts_numbers_check') then
    alter table session_drafts add constraint session_drafts_numbers_check check (expected_gmv >= 0 and start_time <> end_time);
  end if;
end $$;

create index if not exists idx_session_drafts_open on session_drafts(status, date);

-- Kênh phải tồn tại (0149) — cùng luật với các bảng có cột sàn.
drop trigger if exists trg_guard_channel_exists on session_drafts;
create trigger trg_guard_channel_exists before insert or update of brand_id, platform on session_drafts
  for each row execute function private.guard_channel_exists();

create or replace function accept_session_draft(
  p_draft_id uuid,
  p_date date,
  p_start time,
  p_end time,
  p_host_id uuid,
  p_co_host_id uuid default null,
  p_studio_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft session_drafts;
  v_brand_name text;
  v_studio_name text := '';
  v_slot uuid;
  v_row live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'Chỉ ceo/operations/admin xác nhận ca nháp' using errcode = '42501';
  end if;
  select * into v_draft from session_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'Không tìm thấy ca nháp.';
  end if;
  if v_draft.status <> 'draft' then
    raise exception 'Ca nháp này đã được xử lý (%).', v_draft.status;
  end if;
  if p_date is null or p_start is null or p_end is null or p_start = p_end then
    raise exception 'Ngày giờ ca không hợp lệ.';
  end if;
  if p_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ngày % đã qua — sửa ngày trước khi xác nhận.', to_char(p_date, 'DD/MM');
  end if;
  if p_host_id is null then
    raise exception 'Chọn Host trước khi xác nhận.';
  end if;

  select name into v_brand_name from brands where id = v_draft.brand_id;
  if p_studio_id is not null then
    select name into v_studio_name from studios where id = p_studio_id;
  end if;

  begin
    insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name, notes, status, created_by)
    values (p_date, p_start, p_end, v_draft.brand_id, coalesce(v_brand_name, ''), v_draft.platform::session_platform, p_studio_id, coalesce(v_studio_name, ''),
            'Ca thêm từ Phòng Điều Hành', 'open', auth.uid())
    returning id into v_slot;
  exception when unique_violation then
    raise exception '% đã có ca % – % ngày % rồi.', coalesce(v_brand_name, 'Brand này'), to_char(p_start, 'HH24:MI'), to_char(p_end, 'HH24:MI'), to_char(p_date, 'DD/MM');
  end;

  -- Chốt người đi ĐÚNG hàm của ca thường (khoá dòng, kiểm trùng người, sinh live_sessions).
  select * into v_row from finalize_shift_slot(v_slot, p_host_id, p_co_host_id);

  update session_drafts set
    date = p_date, start_time = p_start, end_time = p_end,
    host_id = p_host_id, co_host_id = p_co_host_id, studio_id = p_studio_id,
    status = 'accepted', shift_slot_id = v_slot, session_id = v_row.id,
    decided_by = auth.uid(), decided_at = now()
  where id = p_draft_id;
  return v_row.id;
end;
$$;
revoke all on function accept_session_draft(uuid, date, time, time, uuid, uuid, uuid) from public;
grant execute on function accept_session_draft(uuid, date, time, time, uuid, uuid, uuid) to authenticated;

-- ============================================================================
-- 2) Khả năng về đích cho brand (không lộ GMV)
-- ============================================================================
-- Φ(x) — Abramowitz–Stegun 7.1.26, cùng xấp xỉ với normalCdf ở client (forecastCone.ts).
create or replace function private.normal_cdf(x double precision) returns double precision
language sql
immutable
set search_path = public
as $$
  select case when x = 0 then 0.5 else
    0.5 * (1 + sign(x) * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-(x * x) / 2)))
  end
  from (select 1 / (1 + 0.3275911 * abs(x) / sqrt(2.0)) as t) q
$$;
revoke all on function private.normal_cdf(double precision) from public;

create or replace function brand_landing_series(p_brand_id uuid, p_month date)
returns table (as_of date, platform text, p_hit numeric, target numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin')
     and not (coalesce(current_user_role()::text, '') = 'brand' and p_brand_id is not distinct from current_user_brand_id()) then
    raise exception 'Không có quyền xem khả năng về đích của brand này' using errcode = '42501';
  end if;
  return query
    select f.as_of, f.platform,
      round((case
        when f.actual is not null and f.actual >= f.target then 1
        when coalesce(f.hi, f.p50) - f.p50 <= 0 then case when f.p50 >= f.target then 1 else 0 end
        else 1 - private.normal_cdf(((f.target - f.p50) / ((f.hi - f.p50) / 1.2816))::double precision)
      end)::numeric, 4) as p_hit,
      f.target
    from forecast_snapshots f
    where f.brand_id = p_brand_id
      and f.month = date_trunc('month', p_month)::date
      and f.kind = 'daily'
      and f.target is not null and f.target > 0
    order by f.platform, f.as_of;
end;
$$;
revoke all on function brand_landing_series(uuid, date) from public;
grant execute on function brand_landing_series(uuid, date) to authenticated;

-- RLS ở cuối file: tests/sqlGuards quét 1200 ký tự sau mỗi `create policy`.
alter table session_drafts enable row level security;
revoke all on session_drafts from anon;
grant select, insert, update, delete on session_drafts to authenticated;
drop policy if exists "session_drafts_staff" on session_drafts;
create policy "session_drafts_staff" on session_drafts for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));
