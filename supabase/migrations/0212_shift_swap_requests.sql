-- 0212 — Talent nhường ca / đổi ca cho nhau, trainer/OPs duyệt (nhánh feat/doi-ca-pass-ca, CHƯA chạy trên DB thật).
--
-- Hai loại yêu cầu KHÁC NHAU:
--   pass = nhường một chiều: người A giao cả ca hoặc MỘT ĐOẠN (1 giờ, 2 giờ 30...) cho người B.
--   swap = đổi hai ca: A đưa B một ca/đoạn, B đưa lại A một ca/đoạn.
-- Luồng: talent gửi → người kia đồng ý → trainer/OPs duyệt (ai bấm trước thắng) → hệ thống áp dụng NGUYÊN TỬ → thông báo mọi bên.
-- Ca chia đoạn dùng lại session_staff_segments (0138): nhường một đoạn = cắt đoạn của người giao, thêm đoạn cho người nhận.
--
-- MỘT luật chặn duy nhất (user chốt 10/11): sau khi đổi, lịch của mỗi người KHÔNG phát sinh chồng giờ mới so với trước khi đổi
-- (chồng giờ có sẵn từ trước không bị tính). Không có luật giờ/tuần (trainer tự cân đối — cùng tinh thần 0206).
-- Ngoài ra chỉ có các điều kiện "yêu cầu còn nghĩa": ca chưa huỷ/chưa phát hành report, người giao đang thật sự giữ đoạn đó,
-- còn ≥ 24 giờ đến giờ bắt đầu đoạn bị đổi (gấp hơn thì dùng "Tôi không đi được ca này" 0116), tối đa 3 đoạn mỗi vai mỗi ca.
-- Điều khoản brand về host (brand_talent_rules) vẫn chỉ là cảnh báo ở giao diện, DB không chặn.
--
-- Kiểm tra chạy ở DB bằng cách ÁP THỬ rồi so số cặp chồng giờ trước/sau, trong một khối con có thể lui (dry-run); kiểm lại
-- lúc người kia đồng ý và lúc trainer duyệt, nên hai yêu cầu cùng chờ mà gộp lại chồng nhau thì yêu cầu duyệt sau bị từ chối.

-- ============================================================================
-- 1) Thông báo: thêm loại
-- ============================================================================
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'shift_assigned', 'shift_unassigned', 'shift_time_changed', 'shift_cancelled', 'report_reconciled',
  'shift_open', 'shift_dropout_request', 'handover_due', 'roster_published', 'signup_open',
  'swap_request', 'swap_peer_answer', 'swap_pending_ops', 'swap_decided']));

-- ============================================================================
-- 2) Bảng yêu cầu
-- ============================================================================
create table if not exists public.shift_swap_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pass', 'swap')),
  status text not null default 'pending_peer'
    check (status in ('pending_peer', 'pending_ops', 'approved', 'declined', 'rejected', 'cancelled')),
  -- Người gửi (giao) và người nhận. Tên lưu lúc tạo để thông báo/hàng đợi không phải tra lại.
  from_talent uuid not null references public.talents(id) on delete cascade,
  to_talent uuid not null references public.talents(id) on delete cascade,
  from_name text not null default '',
  to_name text not null default '',
  -- Ca/đoạn người gửi giao đi: phút kể từ giờ bắt đầu ca.
  session_id uuid not null references public.live_sessions(id) on delete cascade,
  from_min integer not null check (from_min >= 0),
  to_min integer not null,
  -- Chỉ có ở loại swap: ca/đoạn người nhận đưa lại.
  swap_session_id uuid references public.live_sessions(id) on delete cascade,
  swap_from_min integer,
  swap_to_min integer,
  reason text not null default '',
  peer_answered_at timestamptz,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now(),
  constraint shift_swap_range check (to_min > from_min),
  constraint shift_swap_distinct check (from_talent <> to_talent),
  constraint shift_swap_kind_shape check (
    (kind = 'pass' and swap_session_id is null and swap_from_min is null and swap_to_min is null)
    or (kind = 'swap' and swap_session_id is not null and swap_from_min is not null and swap_to_min is not null
        and swap_to_min > swap_from_min and swap_session_id <> session_id)
  )
);

create index if not exists shift_swap_requests_open_idx on public.shift_swap_requests (status, created_at desc)
  where status in ('pending_peer', 'pending_ops');
create index if not exists shift_swap_requests_from_idx on public.shift_swap_requests (from_talent, created_at desc);
create index if not exists shift_swap_requests_to_idx on public.shift_swap_requests (to_talent, created_at desc);

alter table public.shift_swap_requests enable row level security;

-- Đọc: người trong cuộc (hai talent) và người xếp lịch. Ghi: CHỈ qua các hàm bên dưới (không có policy ghi).
drop policy if exists shift_swap_requests_read on public.shift_swap_requests;
create policy shift_swap_requests_read on public.shift_swap_requests for select
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer')
    or from_talent = (select p.assigned_talent_id from public.profiles p where p.id = (select auth.uid()))
    or to_talent = (select p.assigned_talent_id from public.profiles p where p.id = (select auth.uid()))
  );

-- ============================================================================
-- 3) Hàm nền (schema private)
-- ============================================================================
-- Đoạn HIỆU LỰC của một ca (giống effectiveSegments ở client): vai có đoạn thì lấy đoạn; vai không có thì host_id/co_host_id làm cả ca.
create or replace function private.swap_eff(p_session uuid)
returns table (talent_id uuid, role text, from_min integer, to_min integer)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select id, host_id, co_host_id,
           (extract(epoch from (end_time - start_time)) / 60)::int + case when end_time <= start_time then 1440 else 0 end as dur
      from live_sessions where id = p_session
  )
  select g.talent_id, g.role, g.from_min, g.to_min from session_staff_segments g where g.session_id = p_session
  union all
  select s.host_id, 'host', 0, s.dur from s
   where s.host_id is not null and not exists (select 1 from session_staff_segments g where g.session_id = p_session and g.role = 'host')
  union all
  select s.co_host_id, 'co_host', 0, s.dur from s
   where s.co_host_id is not null and not exists (select 1 from session_staff_segments g where g.session_id = p_session and g.role = 'co_host')
$$;
revoke all on function private.swap_eff(uuid) from public;

-- Số cặp khoảng đứng ca chồng nhau của một người trong cửa sổ ngày [p_lo, p_hi] (cả hai vai, mọi brand/sàn; bỏ ca huỷ/nạp bù).
-- Một người đứng hai vai cùng lúc trong cùng ca cũng tính là một cặp chồng.
create or replace function private.swap_clash_count(p_talent uuid, p_lo date, p_hi date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with w as (
    select row_number() over (order by o.id, pw.from_ts, pw.to_ts) as rn, pw.from_ts, pw.to_ts
      from live_sessions o
      cross join lateral private.person_windows(o.id, o.date, o.start_time, o.end_time, o.host_id, o.co_host_id) pw
     where pw.talent_id = p_talent
       and o.status <> 'Cancelled' and not o.is_backfill
       and o.date between p_lo and p_hi
  )
  select count(*)::int from w a join w b on a.rn < b.rn and a.from_ts < b.to_ts and b.from_ts < a.to_ts
$$;
revoke all on function private.swap_clash_count(uuid, date, date) from public;

-- Ghi lại danh sách đoạn (đã gộp đoạn liền nhau cùng người) của MỘT vai trong ca, rồi đồng bộ người chính.
-- p_list: jsonb [{talent_id, from_min, to_min}] đã sắp theo from_min. Một người phủ cả ca ⇒ xoá đoạn của vai đó, quay về host_id/co_host_id.
create or replace function private.swap_write_role(p_session uuid, p_role text, p_list jsonb, p_dur integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_main uuid;
  v_main_name text;
  v_n integer;
begin
  v_n := jsonb_array_length(p_list);
  if v_n > 3 then
    raise exception 'Ca này đã chia nhiều đoạn (tối đa 3 đoạn mỗi vai) — nhờ trainer sắp lại ở Cửa sổ Ca Live.' using errcode = 'P0001';
  end if;
  delete from session_staff_segments where session_id = p_session and role = p_role;
  if v_n = 1 and (p_list -> 0 ->> 'from_min')::int = 0 and (p_list -> 0 ->> 'to_min')::int = p_dur then
    v_main := (p_list -> 0 ->> 'talent_id')::uuid;
  else
    insert into session_staff_segments (session_id, talent_id, talent_name, role, from_min, to_min)
      select p_session, (e.v ->> 'talent_id')::uuid, coalesce(t.name, ''), p_role, (e.v ->> 'from_min')::int, (e.v ->> 'to_min')::int
        from jsonb_array_elements(p_list) e(v) join talents t on t.id = (e.v ->> 'talent_id')::uuid;
    select (e.v ->> 'talent_id')::uuid into v_main
      from jsonb_array_elements(p_list) e(v)
     group by (e.v ->> 'talent_id')
     order by sum((e.v ->> 'to_min')::int - (e.v ->> 'from_min')::int) desc, min((e.v ->> 'from_min')::int) asc
     limit 1;
  end if;
  select name into v_main_name from talents where id = v_main;
  if p_role = 'host' then
    update live_sessions set host_id = v_main, host_name = coalesce(v_main_name, '') where id = p_session;
  else
    update live_sessions set co_host_id = v_main, co_host_name = coalesce(v_main_name, '') where id = p_session;
  end if;
end;
$$;
revoke all on function private.swap_write_role(uuid, text, jsonb, integer) from public;

-- Chuyển [p_from, p_to) của người giao sang người nhận trong một ca. Trả về vai của người giao.
create or replace function private.swap_move_part(p_session uuid, p_giver uuid, p_taker uuid, p_from integer, p_to integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions%rowtype;
  v_dur integer;
  v_role text;
  v_list jsonb := '[]'::jsonb;
  v_merged jsonb := '[]'::jsonb;
  r record;
  v_last jsonb;
begin
  select * into s from live_sessions where id = p_session;
  v_dur := (extract(epoch from (s.end_time - s.start_time)) / 60)::int + case when s.end_time <= s.start_time then 1440 else 0 end;
  if p_from < 0 or p_to > v_dur or p_to <= p_from then
    raise exception 'Đoạn giờ nằm ngoài ca.' using errcode = 'P0001';
  end if;

  -- Vai mà người giao đang giữ TRỌN đoạn [p_from, p_to) (các đoạn liền nhau của cùng người ở cùng vai được coi là một).
  select e.role into v_role
    from private.swap_eff(p_session) e
   where e.talent_id = p_giver
   group by e.role
  having coalesce(sum(least(e.to_min, p_to) - greatest(e.from_min, p_from)) filter (where e.from_min < p_to and e.to_min > p_from), 0) = p_to - p_from
   limit 1;
  if v_role is null then
    raise exception 'Người giao không còn giữ trọn đoạn này của ca (lịch đã đổi) — tạo lại yêu cầu.' using errcode = 'P0001';
  end if;

  -- Dựng danh sách đoạn mới của vai đó: cắt phần [p_from, p_to) khỏi đoạn của người giao, thêm đoạn của người nhận.
  for r in
    select e.talent_id, e.from_min, e.to_min from private.swap_eff(p_session) e where e.role = v_role order by e.from_min
  loop
    if r.talent_id = p_giver and r.from_min < p_to and r.to_min > p_from then
      if r.from_min < p_from then
        v_list := v_list || jsonb_build_object('talent_id', r.talent_id, 'from_min', r.from_min, 'to_min', p_from);
      end if;
      if r.to_min > p_to then
        v_list := v_list || jsonb_build_object('talent_id', r.talent_id, 'from_min', p_to, 'to_min', r.to_min);
      end if;
    else
      v_list := v_list || jsonb_build_object('talent_id', r.talent_id, 'from_min', r.from_min, 'to_min', r.to_min);
    end if;
  end loop;
  v_list := v_list || jsonb_build_object('talent_id', p_taker, 'from_min', p_from, 'to_min', p_to);

  -- Sắp theo giờ vào rồi gộp đoạn liền nhau cùng người.
  for r in
    select (e.v ->> 'talent_id')::uuid as talent_id, (e.v ->> 'from_min')::int as from_min, (e.v ->> 'to_min')::int as to_min
      from jsonb_array_elements(v_list) e(v)
     order by 2
  loop
    v_last := case when jsonb_array_length(v_merged) > 0 then v_merged -> (jsonb_array_length(v_merged) - 1) end;
    if v_last is not null and (v_last ->> 'talent_id')::uuid = r.talent_id and (v_last ->> 'to_min')::int = r.from_min then
      v_merged := jsonb_set(v_merged, array[(jsonb_array_length(v_merged) - 1)::text, 'to_min'], to_jsonb(r.to_min));
    else
      v_merged := v_merged || jsonb_build_object('talent_id', r.talent_id, 'from_min', r.from_min, 'to_min', r.to_min);
    end if;
  end loop;

  perform private.swap_write_role(p_session, v_role, v_merged, v_dur);
  return v_role;
end;
$$;
revoke all on function private.swap_move_part(uuid, uuid, uuid, integer, integer) from public;

-- Giờ bắt đầu (giờ VN) của đoạn [from_min] trong ca — để kiểm luật 24 giờ.
create or replace function private.swap_part_start(p_session uuid, p_from integer)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (((s.date + s.start_time)::timestamp + make_interval(mins => p_from)) at time zone 'Asia/Ho_Chi_Minh')
    from live_sessions s where s.id = p_session
$$;
revoke all on function private.swap_part_start(uuid, integer) from public;

-- Áp dụng yêu cầu rồi kiểm "không phát sinh chồng giờ mới". Lỗi ⇒ raise (người gọi lui giao dịch). p_commit=false ⇒ áp thử rồi lui.
create or replace function private.swap_apply(p_req uuid, p_commit boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_swap_requests%rowtype;
  s1 live_sessions%rowtype;
  s2 live_sessions%rowtype;
  v_lo date;
  v_hi date;
  v_before_a int; v_before_b int; v_after_a int; v_after_b int;
  v_orig1 boolean; v_orig2 boolean;
  v_role1 text; v_role2 text;
  v_msg text;
  w record;
begin
  select * into r from shift_swap_requests where id = p_req;

  -- Khoá các ca theo thứ tự id (tránh khoá chéo khi hai yêu cầu đụng nhau).
  perform 1 from live_sessions where id in (r.session_id, coalesce(r.swap_session_id, r.session_id)) order by id for update;
  select * into s1 from live_sessions where id = r.session_id;
  if r.kind = 'swap' then select * into s2 from live_sessions where id = r.swap_session_id; end if;

  if s1.status = 'Cancelled' or (r.kind = 'swap' and s2.status = 'Cancelled') then
    raise exception 'Ca đã huỷ.' using errcode = 'P0001';
  end if;
  if (s1.brand_id is not null and private.brand_month_published(s1.brand_id, s1.date))
     or (r.kind = 'swap' and s2.brand_id is not null and private.brand_month_published(s2.brand_id, s2.date)) then
    raise exception 'Tháng của ca này đã phát hành Report cho brand — lịch đã đóng sổ.' using errcode = 'P0001';
  end if;
  if private.swap_part_start(r.session_id, r.from_min) < now() + interval '24 hours'
     or (r.kind = 'swap' and private.swap_part_start(r.swap_session_id, r.swap_from_min) < now() + interval '24 hours') then
    raise exception 'Còn dưới 24 giờ đến giờ bắt đầu — dùng “Tôi không đi được ca này”.' using errcode = 'P0001';
  end if;

  v_lo := least(s1.date, coalesce(s2.date, s1.date)) - 1;
  v_hi := greatest(s1.date, coalesce(s2.date, s1.date)) + 1;
  v_before_a := private.swap_clash_count(r.from_talent, v_lo, v_hi);
  v_before_b := private.swap_clash_count(r.to_talent, v_lo, v_hi);

  -- Bật cờ allow_person_clash trong lúc ghi (hai bước ghi liên tiếp của đổi ca có thể tạm chồng nhau); kiểm tổng ở dưới mới là luật thật.
  v_orig1 := s1.allow_person_clash;
  update live_sessions set allow_person_clash = true where id = r.session_id;
  if r.kind = 'swap' then
    v_orig2 := s2.allow_person_clash;
    update live_sessions set allow_person_clash = true where id = r.swap_session_id;
  end if;

  v_role1 := private.swap_move_part(r.session_id, r.from_talent, r.to_talent, r.from_min, r.to_min);
  if r.kind = 'swap' then
    v_role2 := private.swap_move_part(r.swap_session_id, r.to_talent, r.from_talent, r.swap_from_min, r.swap_to_min);
  end if;

  update live_sessions set allow_person_clash = v_orig1 where id = r.session_id;
  if r.kind = 'swap' then
    update live_sessions set allow_person_clash = v_orig2 where id = r.swap_session_id;
  end if;

  v_after_a := private.swap_clash_count(r.from_talent, v_lo, v_hi);
  v_after_b := private.swap_clash_count(r.to_talent, v_lo, v_hi);
  if v_after_a > v_before_a or v_after_b > v_before_b then
    -- Tìm ca đang vướng để báo đúng tên (người nào tăng cặp chồng thì xét người đó).
    for w in
      select t.tid, pw.from_ts, pw.to_ts, o.id as sid
        from (values (r.from_talent, v_after_a > v_before_a), (r.to_talent, v_after_b > v_before_b)) as t(tid, bad)
        join live_sessions o on o.id in (r.session_id, coalesce(r.swap_session_id, r.session_id))
        cross join lateral private.person_windows(o.id, o.date, o.start_time, o.end_time, o.host_id, o.co_host_id) pw
       where t.bad and pw.talent_id = t.tid
    loop
      v_msg := private.person_clash_message(w.sid, w.tid, w.from_ts, w.to_ts);
      exit when v_msg is not null;
    end loop;
    raise exception '%', coalesce(v_msg, 'Sau khi đổi, có người bị trùng giờ với ca khác.') using errcode = 'P0001';
  end if;

  if p_commit then
    -- Trigger notify_session_changes (0116) vừa bắn "Bạn được xếp làm Host / không còn là Host" khi người chính của ca đổi —
    -- sai nghĩa với nhường MỘT đoạn và trùng với thông báo "Đã duyệt" của yêu cầu. Xoá đúng các dòng do chính giao dịch này sinh ra.
    delete from notifications
     where kind in ('shift_assigned', 'shift_unassigned')
       and created_at >= transaction_timestamp()
       and session_id in (r.session_id, coalesce(r.swap_session_id, r.session_id));

    insert into roster_changes (session_id, kind, reason, before, after, changed_by)
    values (r.session_id, 'reassign', 'Đổi/nhường ca giữa talent (yêu cầu ' || r.id || ')',
      jsonb_build_object('host_id', s1.host_id, 'host_name', s1.host_name, 'co_host_id', s1.co_host_id, 'co_host_name', s1.co_host_name),
      (select jsonb_build_object('host_id', x.host_id, 'host_name', x.host_name, 'co_host_id', x.co_host_id, 'co_host_name', x.co_host_name)
         from live_sessions x where x.id = r.session_id),
      auth.uid());
  end if;
end;
$$;
revoke all on function private.swap_apply(uuid, boolean) from public;

-- Kiểm hợp lệ KHÔNG ghi gì: áp thử trong khối con rồi lui. Lỗi nghiệp vụ nổi lên nguyên văn.
create or replace function private.swap_dry_run(p_req uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform private.swap_apply(p_req, false);
    raise exception 'SWAP_DRYRUN_OK' using errcode = 'P0900';
  exception when sqlstate 'P0900' then
    null;
  end;
end;
$$;
revoke all on function private.swap_dry_run(uuid) from public;

create or replace function private.swap_my_talent()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select assigned_talent_id from profiles where id = auth.uid()
$$;
revoke all on function private.swap_my_talent() from public;

-- Nhãn ngắn của yêu cầu cho thông báo: "CROCS 12/11 15:00–17:00".
create or replace function private.swap_part_label(p_session uuid, p_from integer, p_to integer)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(s.brand_name, ''), 'ca') || ' ' || s.platform || ' ' || to_char(s.date, 'DD/MM') || ' '
         || to_char((s.start_time + make_interval(mins => p_from))::time, 'HH24:MI') || '–'
         || to_char((s.start_time + make_interval(mins => p_to))::time, 'HH24:MI')
    from live_sessions s where s.id = p_session
$$;
revoke all on function private.swap_part_label(uuid, integer, integer) from public;

-- ============================================================================
-- 4) RPC cho talent: gửi / trả lời / thu hồi
-- ============================================================================
create or replace function public.shift_swap_create(
  p_kind text, p_session_id uuid, p_from_min integer, p_to_min integer, p_to_talent uuid,
  p_swap_session_id uuid default null, p_swap_from_min integer default null, p_swap_to_min integer default null,
  p_reason text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := private.swap_my_talent();
  v_id uuid;
  v_s live_sessions%rowtype;
  v_from_name text;
  v_to_name text;
  v_label text;
begin
  if v_me is null then
    raise exception 'Tài khoản chưa gắn với talent nào' using errcode = '42501';
  end if;
  if p_to_talent is null or p_to_talent = v_me then
    raise exception 'Chọn người khác để nhường/đổi.' using errcode = 'P0001';
  end if;
  select * into v_s from live_sessions where id = p_session_id;
  if not found then raise exception 'Không thấy ca.' using errcode = 'P0002'; end if;
  select coalesce(nullif(nickname, ''), name) into v_from_name from talents where id = v_me;
  select coalesce(nullif(nickname, ''), name) into v_to_name from talents where id = p_to_talent;
  if v_to_name is null then raise exception 'Không thấy người nhận.' using errcode = 'P0002'; end if;

  insert into shift_swap_requests (kind, from_talent, to_talent, from_name, to_name, session_id, from_min, to_min,
                                   swap_session_id, swap_from_min, swap_to_min, reason)
  values (p_kind, v_me, p_to_talent, coalesce(v_from_name, ''), v_to_name, p_session_id, p_from_min, p_to_min,
          p_swap_session_id, p_swap_from_min, p_swap_to_min, btrim(coalesce(p_reason, '')))
  returning id into v_id;

  -- Kiểm hợp lệ ngay (áp thử rồi lui): sai thì cả yêu cầu không được tạo.
  perform private.swap_dry_run(v_id);

  v_label := private.swap_part_label(p_session_id, p_from_min, p_to_min);
  perform notify_talent(p_to_talent, 'swap_request',
    coalesce(v_from_name, 'Một talent') || case when p_kind = 'swap' then ' muốn đổi ca với bạn' else ' muốn nhường ca cho bạn' end,
    case when p_kind = 'swap'
      then 'Họ đưa ' || v_label || ', bạn đưa lại ' || private.swap_part_label(p_swap_session_id, p_swap_from_min, p_swap_to_min)
      else v_label end
      || case when btrim(coalesce(p_reason, '')) <> '' then ' — lý do: ' || btrim(p_reason) else '' end
      || '. Lịch CHƯA đổi — bạn đồng ý rồi trainer/OPs duyệt mới đổi.',
    p_session_id, v_s.brand_id);
  return v_id;
end;
$$;
revoke all on function public.shift_swap_create(text, uuid, integer, integer, uuid, uuid, integer, integer, text) from public;
grant execute on function public.shift_swap_create(text, uuid, integer, integer, uuid, uuid, integer, integer, text) to authenticated;

create or replace function public.shift_swap_respond(p_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_swap_requests%rowtype;
  v_me uuid := private.swap_my_talent();
  v_s live_sessions%rowtype;
  v_label text;
begin
  select * into r from shift_swap_requests where id = p_id for update;
  if not found then raise exception 'Không thấy yêu cầu.' using errcode = 'P0002'; end if;
  if v_me is null or r.to_talent <> v_me then
    raise exception 'Yêu cầu này không gửi cho bạn.' using errcode = '42501';
  end if;
  if r.status <> 'pending_peer' then
    raise exception 'Yêu cầu không còn chờ bạn trả lời.' using errcode = 'P0001';
  end if;
  select * into v_s from live_sessions where id = r.session_id;
  v_label := private.swap_part_label(r.session_id, r.from_min, r.to_min);

  if not p_accept then
    update shift_swap_requests set status = 'declined', peer_answered_at = now() where id = p_id;
    perform notify_talent(r.from_talent, 'swap_peer_answer', r.to_name || ' không nhận', v_label || ' — lịch của bạn giữ nguyên.', r.session_id, v_s.brand_id);
    return;
  end if;

  -- Lúc đồng ý lịch có thể đã khác (yêu cầu khác được duyệt trước): kiểm lại.
  perform private.swap_dry_run(p_id);
  update shift_swap_requests set status = 'pending_ops', peer_answered_at = now() where id = p_id;
  perform notify_talent(r.from_talent, 'swap_peer_answer', r.to_name || ' đã đồng ý', v_label || ' — chờ trainer/OPs duyệt.', r.session_id, v_s.brand_id);
  perform notify_ops('swap_pending_ops',
    case when r.kind = 'swap' then r.from_name || ' ⇄ ' || r.to_name || ' xin đổi ca' else r.from_name || ' → ' || r.to_name || ' xin nhường ca' end,
    v_label || case when r.kind = 'swap' then ' ⇄ ' || private.swap_part_label(r.swap_session_id, r.swap_from_min, r.swap_to_min) else '' end
      || '. Hai bên đã đồng ý — lịch CHƯA đổi, vào Cần xử lý để duyệt.',
    r.session_id, v_s.brand_id);
end;
$$;
revoke all on function public.shift_swap_respond(uuid, boolean) from public;
grant execute on function public.shift_swap_respond(uuid, boolean) to authenticated;

create or replace function public.shift_swap_cancel(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_swap_requests%rowtype;
  v_me uuid := private.swap_my_talent();
begin
  select * into r from shift_swap_requests where id = p_id for update;
  if not found then raise exception 'Không thấy yêu cầu.' using errcode = 'P0002'; end if;
  if v_me is null or r.from_talent <> v_me then
    raise exception 'Chỉ người gửi được thu hồi.' using errcode = '42501';
  end if;
  if r.status not in ('pending_peer', 'pending_ops') then
    raise exception 'Yêu cầu đã xử lý xong.' using errcode = 'P0001';
  end if;
  update shift_swap_requests set status = 'cancelled' where id = p_id;
end;
$$;
revoke all on function public.shift_swap_cancel(uuid) from public;
grant execute on function public.shift_swap_cancel(uuid) to authenticated;

-- ============================================================================
-- 5) RPC cho trainer/OPs: duyệt / từ chối
-- ============================================================================
create or replace function public.shift_swap_decide(p_id uuid, p_approve boolean, p_note text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_swap_requests%rowtype;
  v_s live_sessions%rowtype;
  v_label text;
begin
  perform private.roster_staff_guard();
  select * into r from shift_swap_requests where id = p_id for update;
  if not found then raise exception 'Không thấy yêu cầu.' using errcode = 'P0002'; end if;
  if r.status <> 'pending_ops' then
    raise exception 'Yêu cầu đã được xử lý (hoặc chưa được người kia đồng ý).' using errcode = 'P0001';
  end if;
  select * into v_s from live_sessions where id = r.session_id;
  v_label := private.swap_part_label(r.session_id, r.from_min, r.to_min)
    || case when r.kind = 'swap' then ' ⇄ ' || private.swap_part_label(r.swap_session_id, r.swap_from_min, r.swap_to_min) else '' end;

  if not p_approve then
    if btrim(coalesce(p_note, '')) = '' then
      raise exception 'Ghi lý do từ chối.' using errcode = 'P0001';
    end if;
    update shift_swap_requests set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(p_note) where id = p_id;
    perform notify_talent(r.from_talent, 'swap_decided', 'Không duyệt đổi/nhường ca', v_label || ' — lý do: ' || btrim(p_note) || '. Lịch giữ nguyên.', r.session_id, v_s.brand_id);
    perform notify_talent(r.to_talent, 'swap_decided', 'Không duyệt đổi/nhường ca', v_label || ' — lý do: ' || btrim(p_note) || '. Lịch giữ nguyên.', r.session_id, v_s.brand_id);
    return;
  end if;

  perform private.swap_apply(p_id, true);
  update shift_swap_requests set status = 'approved', decided_by = auth.uid(), decided_at = now(), decision_note = btrim(coalesce(p_note, '')) where id = p_id;
  perform notify_talent(r.from_talent, 'swap_decided', 'Đã duyệt đổi/nhường ca', v_label || ' — lịch đã đổi.', r.session_id, v_s.brand_id);
  perform notify_talent(r.to_talent, 'swap_decided', 'Đã duyệt đổi/nhường ca', v_label || ' — lịch đã đổi.', r.session_id, v_s.brand_id);
  -- Báo các trainer/OPs khác để hàng đợi của họ không còn treo yêu cầu này.
  perform notify_ops('swap_decided', 'Đã duyệt đổi/nhường ca', r.from_name || ' ↔ ' || r.to_name || ' · ' || v_label, r.session_id, v_s.brand_id);
end;
$$;
revoke all on function public.shift_swap_decide(uuid, boolean, text) from public;
grant execute on function public.shift_swap_decide(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 6) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if to_regclass('public.shift_swap_requests') is null
     or to_regprocedure('public.shift_swap_create(text,uuid,integer,integer,uuid,uuid,integer,integer,text)') is null
     or to_regprocedure('public.shift_swap_respond(uuid,boolean)') is null
     or to_regprocedure('public.shift_swap_cancel(uuid)') is null
     or to_regprocedure('public.shift_swap_decide(uuid,boolean,text)') is null then
    raise exception '0212 tự kiểm: thiếu bảng hoặc hàm';
  end if;
  if pg_get_functiondef('public.guard_segment_person_clash()'::regprocedure) !~ 'allow_person_clash' then
    raise exception '0212 tự kiểm: guard_segment_person_clash chưa nhận cờ allow_person_clash (cần 0160)';
  end if;
end $$;
