-- 0138 — Đổi người GIỮA CA (host đổi, trợ live vào/ra giữa chừng) — theo dõi đúng giờ từng người.
--
-- Vấn đề (06/10): mỗi ca chỉ lưu MỘT host_id và MỘT co_host_id, lương tính bằng rate x giờ cả ca. Ca VERA Shopee
-- 25/06 15:00-17:30 ghi "Trợ: Trúc Như 2h, Thảo 30p" không có chỗ ghi người thứ hai: Thảo mất giờ, mất lương, mất
-- thống kê; Trúc Như bị tính nhầm 2,5h.
--
-- Cách làm: giữ ca là MỘT đơn vị (một room, một GMV, một target, một lần đếm vào cam kết giờ). Thêm bảng "đoạn giờ
-- theo người": mỗi dòng = một người, một vai (host | co_host), từ phút thứ X đến phút thứ Y tính từ giờ bắt đầu ca
-- (offset phút, nên ca qua đêm không phải xử lý riêng). Ca không có đoạn nào = tính như cũ (host_id / co_host_id làm
-- cả ca) nên mọi số đang có không đổi.
--
-- Quy ước:
--   * Vai nào có đoạn thì đoạn là nguồn sự thật cho vai đó; vai không có đoạn vẫn theo host_id / co_host_id cả ca.
--   * host_id / co_host_id luôn được RPC đồng bộ về "người chính" của vai (nhiều phút nhất; hoà thì người vào trước) để
--     các màn chỉ đọc một tên (Sổ Ca, lịch, thông báo) vẫn hiện một cái tên hợp lý.
--   * Cùng vai không chồng giờ; một người không đứng hai vai chồng giờ trong cùng ca. Khoảng trống (không ai) được phép.
--   * Ghi CHỈ qua RPC set_session_staff_segments (thay toàn bộ đoạn của ca trong một transaction). Bảng không có
--     policy ghi cho người dùng.
--   * Tháng đã phát hành Report là đóng sổ: RPC từ chối (cùng luật 0133). Ca có đoạn thì không dời giờ/đổi độ dài ca
--     được (offset sẽ lệch) — phải xoá đoạn trước (trigger bên dưới); hàm tách ca nạp bù cũng bị chặn theo.
--   * Không có hoa hồng theo GMV ở đây (user chốt 06/10): lương = rate theo giờ x giờ của từng người.
--
-- Thứ tự với deploy: chạy migration TRƯỚC khi deploy bản client mới (client cũ không đọc bảng này nên vô hại; client
-- mới gọi RPC sẽ lỗi nếu migration chưa chạy). Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Bảng
-- ============================================================================
create table if not exists session_staff_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  talent_id uuid not null references talents(id) on delete cascade,
  -- Tên lúc ghi (giống host_name/co_host_name của ca): màn hiển thị và hiệu suất không phải tra lại Talent Pool.
  talent_name text not null default '',
  role text not null check (role in ('host', 'co_host')),
  from_min integer not null check (from_min >= 0),
  to_min integer not null,
  created_at timestamptz not null default now(),
  constraint session_staff_segments_range check (to_min > from_min)
);

create index if not exists session_staff_segments_session_idx on session_staff_segments (session_id);
create index if not exists session_staff_segments_talent_idx on session_staff_segments (talent_id);

-- ============================================================================
-- 2) RPC: thay toàn bộ đoạn giờ của một ca
-- ============================================================================
-- p_segments: [{ talent_id, role: 'host'|'co_host', from_min, to_min }]. Mảng rỗng = xoá hết đoạn (ca về cách tính cũ).
create or replace function set_session_staff_segments(p_session_id uuid, p_segments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions%rowtype;
  v_dur integer;
  v_role text;
  v_main uuid;
  v_main_name text;
  v_n integer;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được sửa người theo đoạn giờ của ca' using errcode = '42501';
  end if;

  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca' using errcode = 'P0002';
  end if;
  if s.brand_id is not null and private.brand_month_published(s.brand_id, s.date) then
    raise exception 'Tháng %/% của % đã phát hành Report cho brand — số và lịch đã đóng sổ. Thu hồi report ở Điều Phối Phát Hành trước khi sửa người của ca này.',
      to_char(s.date, 'MM'), to_char(s.date, 'YYYY'), coalesce(nullif(s.brand_name, ''), 'brand')
      using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không sửa người của ca' using errcode = 'P0001';
  end if;

  p_segments := coalesce(p_segments, '[]'::jsonb);
  if jsonb_typeof(p_segments) <> 'array' then
    raise exception 'p_segments phải là mảng' using errcode = '22023';
  end if;

  v_dur := (extract(epoch from (s.end_time - s.start_time)) / 60)::integer;
  if v_dur <= 0 then v_dur := v_dur + 1440; end if;

  drop table if exists _seg;
  create temp table _seg on commit drop as
    select (e.v ->> 'talent_id')::uuid as talent_id, e.v ->> 'role' as role,
           (e.v ->> 'from_min')::integer as from_min, (e.v ->> 'to_min')::integer as to_min, e.n
      from jsonb_array_elements(p_segments) with ordinality as e(v, n);

  if exists (select 1 from _seg where talent_id is null or role not in ('host', 'co_host') or from_min is null or to_min is null) then
    raise exception 'Mỗi đoạn cần người, vai (host hoặc co_host), từ phút và đến phút' using errcode = '22023';
  end if;
  if exists (select 1 from _seg where from_min < 0 or to_min <= from_min or to_min > v_dur) then
    raise exception 'Đoạn giờ phải nằm trong ca (0 đến % phút) và có giờ kết thúc sau giờ bắt đầu', v_dur using errcode = '22023';
  end if;
  if exists (select 1 from _seg g where not exists (select 1 from talents t where t.id = g.talent_id)) then
    raise exception 'Có người không tồn tại trong Talent Pool' using errcode = '22023';
  end if;
  if exists (
    select 1 from _seg a join _seg b on a.n < b.n
     where a.from_min < b.to_min and b.from_min < a.to_min
       and (a.role = b.role or a.talent_id = b.talent_id)
  ) then
    raise exception 'Hai đoạn chồng giờ: cùng một vai không được có hai người một lúc, và một người không đứng hai vai một lúc' using errcode = '22023';
  end if;

  delete from session_staff_segments where session_id = p_session_id;
  insert into session_staff_segments (session_id, talent_id, talent_name, role, from_min, to_min)
    select p_session_id, g.talent_id, coalesce(t.name, ''), g.role, g.from_min, g.to_min
      from _seg g join talents t on t.id = g.talent_id;
  get diagnostics v_n = row_count;

  -- Đồng bộ người chính của từng vai có đoạn.
  foreach v_role in array array['host', 'co_host'] loop
    select talent_id into v_main
      from _seg where role = v_role
     group by talent_id
     order by sum(to_min - from_min) desc, min(from_min) asc
     limit 1;
    if v_main is not null then
      select name into v_main_name from talents where id = v_main;
      if v_role = 'host' then
        update live_sessions set host_id = v_main, host_name = coalesce(v_main_name, '') where id = p_session_id;
      else
        update live_sessions set co_host_id = v_main, co_host_name = coalesce(v_main_name, '') where id = p_session_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('segments', v_n, 'duration_min', v_dur);
end;
$$;

revoke all on function set_session_staff_segments(uuid, jsonb) from public;
grant execute on function set_session_staff_segments(uuid, jsonb) to authenticated;

-- ============================================================================
-- 3) Ca có đoạn giờ thì không đổi độ dài / giờ bắt đầu (offset phút sẽ lệch)
-- ============================================================================
create or replace function guard_staff_segments_schedule() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time)
     and exists (select 1 from session_staff_segments where session_id = old.id) then
    raise exception 'Ca này đang chia người theo đoạn giờ — xoá các đoạn (Đổi người giữa ca) trước khi dời giờ hoặc tách ca.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_staff_segments_schedule on live_sessions;
create trigger trg_guard_staff_segments_schedule
  before update of start_time, end_time on live_sessions
  for each row execute function guard_staff_segments_schedule();

-- ============================================================================
-- 4) Gán host hàng loạt (0086) bỏ qua ca đã chia người theo đoạn
-- ============================================================================
-- Lưới gán host ở Dữ Liệu Gốc ghi đè host_id/co_host_id của từng ca; với ca đã chia đoạn thì người chính đang được
-- RPC set_session_staff_segments giữ đồng bộ — ghi đè sẽ làm lệch với đoạn. Ca đó chỉ sửa qua "Đổi người giữa ca".
create or replace function bulk_assign_session_hosts(p_assignments jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb;
  v_session_id uuid;
  v_host uuid;
  v_cohost uuid;
  v_host_name text;
  v_cohost_name text;
  v_updated int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được gán host hàng loạt' using errcode = '42501';
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    v_session_id := (a->>'session_id')::uuid;
    v_host := nullif(a->>'host_id', '')::uuid;
    v_cohost := nullif(a->>'co_host_id', '')::uuid;
    if v_session_id is null then continue; end if;
    if v_host is not null and v_cohost is not null and v_host = v_cohost then
      raise exception 'Host và trợ live không được là cùng một người (ca %)', v_session_id;
    end if;

    v_host_name := '';
    v_cohost_name := '';
    if v_host is not null then
      select name into v_host_name from talents where id = v_host;
      if v_host_name is null then raise exception 'Talent % không tồn tại', v_host; end if;
    end if;
    if v_cohost is not null then
      select name into v_cohost_name from talents where id = v_cohost;
      if v_cohost_name is null then raise exception 'Talent % không tồn tại', v_cohost; end if;
    end if;

    update live_sessions set
      host_id = v_host, host_name = v_host_name,
      co_host_id = v_cohost, co_host_name = v_cohost_name
    where id = v_session_id
      and (host_id is distinct from v_host or co_host_id is distinct from v_cohost)
      and not exists (select 1 from session_staff_segments g where g.session_id = live_sessions.id);
    if found then v_updated := v_updated + 1; end if;
  end loop;

  return v_updated;
end;
$$;

-- ============================================================================
-- 4b) RLS: đọc theo role; KHÔNG có policy ghi (chỉ RPC security definer ghi được)
-- ============================================================================
alter table session_staff_segments enable row level security;

drop policy if exists session_staff_segments_read on session_staff_segments;
create policy session_staff_segments_read on session_staff_segments
  for select to authenticated
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or ((select current_user_role()) = 'talent' and talent_id = (select current_user_talent_id()))
  );

revoke all on session_staff_segments from anon;
revoke insert, update, delete on session_staff_segments from authenticated;
grant select on session_staff_segments to authenticated;

-- ============================================================================
-- 5) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if to_regclass('public.session_staff_segments') is null then
    raise exception '0138: thiếu bảng session_staff_segments';
  end if;
  if to_regprocedure('public.set_session_staff_segments(uuid,jsonb)') is null then
    raise exception '0138: thiếu hàm set_session_staff_segments';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_staff_segments_schedule') then
    raise exception '0138: thiếu trigger trg_guard_staff_segments_schedule';
  end if;
end $$;
