-- 0213 — GIỜ CA = GIỜ ROOM BẬT + ĐỦ GIỜ THEO LỊCH, CA SAU NỐI TIẾP (user chốt 10/11).
--
-- Vì sao: giờ thực của ca nối dùng để tính lương nhưng đang phụ thuộc LÚC TRỢ TẢI FILE. Mốc giao ca (0204/0205/0209) = giờ hết
-- ca + "trễ" suy ra từ file, file tải trễ/sớm thì số đổi; giờ bắt đầu ca sau = giờ bật room của ca trước (28/29 ca nối T11 ghi
-- 18:00 cho ca 21:00); Shopee tải đúng giờ mà ra 0' / 361' (VERA Shopee 09/11). Nhãn OT/sớm vì thế sai theo giờ tải.
--
-- Luật (user 10/11, chạy thử trên 26 chuỗi ca nối T11: 23 khớp giờ room tắt thật ±5', 2 dài hơn = OT ca cuối không khai,
-- 1 room còn live lúc tải, 0 ngắn hơn):
--   * Ca đầu chuỗi bắt đầu lúc room bật trong file (bỏ room thử < 5' không có GMV). Giờ tải file không dùng ở đâu cả.
--   * Mỗi ca live đủ số phút theo lịch + OT − kết thúc sớm − trễ (ba số trợ khai ở "Ca có gì khác?"). Đếm phút ROOM ĐANG LIVE:
--     restart tắt room 10' thì ca kéo dài thêm 10'.
--   * Ca sau bắt đầu đúng lúc ca trước đủ giờ (18:03 → 21:03 → 00:03). Room mới bật sau đó (restart lúc giao) ⇒ bắt đầu lúc room bật.
--   * Ca cuối chuỗi (và ca đơn) kết thúc lúc room tắt thật. Room còn live lúc xuất file ⇒ "chờ" (end_pending), không gắn nhãn gì,
--     tính lại khi có file sau giờ tắt.
--   * Hai ca kề nhau cùng brand + sàn là MỘT chuỗi khi có liên kết room (0153) hoặc một room chạy qua giờ giao (một tài khoản chỉ
--     live một room một lúc ⇒ room đó nối từ ca trước) — nên ca trước QUÊN tải file thì file ca sau vẫn đủ để tính giờ.
--   * Kiểm cuối chuỗi: end_gap_minutes = phút live thật của ca cuối − phút phải live. Lệch > 5' sau khi đã giao ca ⇒ Cần xử lý.
--     Ca đầu chuỗi room bật trễ (file_late_minutes) ≥ 30' ⇒ Cần xử lý kiểm lý do (có thể là sự cố, không mặc định lỗi team).
--
-- Nhận biết room còn live: ended_at rỗng (Shopee) hoặc trùng giờ xuất file ±2' (TikTok ghi ended_at = giờ xuất). Giờ xuất đọc từ
-- tên file: Creator-Live-Performance_YYYYMMDDHHMMSS = UTC; Shopee ..._live_stream_list_...-YYYYMMDDHHMMSS = UTC+8 (đo 153 file:
-- lệch giờ tải 0–21'); không đọc được thì dùng giờ tải.
--
-- Thay đổi:
--   1. live_session_reports.late_minutes (trễ mà KHÔNG live bù; trừ vào giờ ca + giờ tính lương). host_late giữ = late_minutes > 0.
--   2. Bảng session_time_checks: giờ ca đã tính của từng ca (đọc cho Giao ca + Cần xử lý). Chỉ ghi qua hàm.
--   3. private.session_time_chain(uuid): tính cả chuỗi chứa ca, thuần từ lịch + 3 số khai + giờ room trong file.
--   4. private.session_flex_boundary_at (mốc giao ca, 0209) = giờ kết thúc tính theo luật ⇒ phần chia GMV (0203/0174) theo mốc mới.
--   5. recompute_session_from_snapshot: sau khi cộng số, ghi actual_start_at / actual_end_at / live_duration_minutes theo luật.
--   6. Trigger trên live_session_reports: đổi OT / sớm / trễ ⇒ tính lại cả chuỗi (ca sau dịch theo).
--   7. submit_file_handover nhận thêm p_late_minutes.
--   8. Tính lại mọi ca đang lấy số từ file. Tháng đã phát hành Report KHÔNG đụng (đã đóng sổ). GMV mỗi room không đổi; chỉ phần chia
--      tạm giữa hai ca nối (file tải trễ) đổi theo mốc mới.
-- Tiền công: giờ lịch + OT − sớm − TRỄ (pnl.ts). Ca cũ late_minutes = 0 ⇒ không đổi tiền ca cũ.
-- Phụ thuộc 0209 + 0210. Chạy lại được.

do $$
begin
  if to_regprocedure('private.session_flex_boundary_at(uuid)') is null
     or to_regprocedure('private.refresh_boundaries_around_session()') is null then
    raise exception '0213: chạy 0209 + 0210 trước.';
  end if;
end $$;

-- 1. Trễ không bù (phút) ------------------------------------------------------------------------------------------------
alter table live_session_reports add column if not exists late_minutes int not null default 0;
alter table live_session_reports drop constraint if exists live_session_reports_late_minutes_check;
alter table live_session_reports add constraint live_session_reports_late_minutes_check check (late_minutes between 0 and 600);

-- 2. Giờ ca đã tính -----------------------------------------------------------------------------------------------------
create table if not exists session_time_checks (
  session_id uuid primary key references live_sessions(id) on delete cascade,
  head_session_id uuid not null,
  prev_session_id uuid,
  is_last boolean not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  live_minutes numeric not null,
  target_minutes numeric not null,
  end_pending boolean not null default false,
  file_late_minutes int,
  end_gap_minutes int,
  computed_at timestamptz not null default now()
);
comment on table session_time_checks is
  '0213: giờ ca theo luật giờ room bật + đủ giờ lịch (± OT/sớm/trễ khai), ca sau nối tiếp. file_late_minutes: chỉ ca đầu chuỗi, room bật trễ so với lịch. end_gap_minutes: chỉ ca cuối chuỗi khi room đã tắt, phút live thật − phút phải live.';
alter table session_time_checks enable row level security;
drop policy if exists session_time_checks_read on session_time_checks;
create policy session_time_checks_read on session_time_checks for select to authenticated
  using ((select current_user_role()) = any (array['ceo', 'operations', 'admin']::user_role[]) or can_edit_session_snapshot(session_id));
revoke all on session_time_checks from public, anon;
grant select on session_time_checks to authenticated;

-- 3. Chuỗi ca -----------------------------------------------------------------------------------------------------------
-- Giờ xuất file (xem đầu file). Không đọc được / lệch xa giờ tải ⇒ giờ tải.
create or replace function private.snapshot_export_at(p_file_name text, p_captured_at timestamptz) returns timestamptz
language plpgsql
stable
as $$
declare
  v_digits text := substring(coalesce(p_file_name, '') from '(\d{14})');
  v_at timestamptz;
begin
  if v_digits is null then
    return p_captured_at;
  end if;
  begin
    v_at := to_timestamp(v_digits, 'YYYYMMDDHH24MISS')::timestamp at time zone
            case when p_file_name ilike 'Creator-Live-Performance%' then 'UTC' else 'Asia/Singapore' end;
  exception when others then
    return p_captured_at;
  end;
  if v_at > p_captured_at + interval '5 minutes' or v_at < p_captured_at - interval '1 day' then
    return p_captured_at;
  end if;
  return v_at;
end;
$$;

-- Hai ca kề nhau (a hết ca đúng lúc b bắt đầu ±5', cùng brand + sàn) có chung room không: liên kết room, hoặc một room trong file
-- của a hay b chạy qua giờ giao.
create or replace function private.session_time_linked(p_a uuid, p_b uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from session_room_links l where l.prev_session_id = p_a and l.next_session_id = p_b)
      or exists (
        select 1
          from live_sessions b
          join session_live_snapshots x on x.session_id in (p_a, p_b)
          join session_live_snapshot_rows r on r.snapshot_id = x.id
         where b.id = p_b
           and r.started_at is not null
           and r.started_at < ((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') - interval '5 minutes'
           and coalesce(r.ended_at, x.captured_at) > ((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') + interval '5 minutes'
           and private.room_rows_comparable(r.room_id, x.session_id, p_b)
      );
$$;

create or replace function private.session_time_prev(p_session_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.prev_session_id from session_room_links l where l.next_session_id = p_session_id limit 1),
    (select a.id
       from live_sessions b
       join live_sessions a on a.brand_id = b.brand_id and a.platform = b.platform and a.id <> b.id and a.date between b.date - 1 and b.date
      where b.id = p_session_id
        and a.status::text <> 'Cancelled'
        and not coalesce(a.excluded_from_reports, false)
        and abs(extract(epoch from (((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') - session_boundary_at(a.id)))) <= 300
        and private.session_time_linked(a.id, b.id)
      order by a.date desc, a.start_time desc
      limit 1)
  );
$$;

create or replace function private.session_time_next(p_session_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.next_session_id from session_room_links l where l.prev_session_id = p_session_id limit 1),
    (select b.id
       from live_sessions a
       join live_sessions b on b.brand_id = a.brand_id and b.platform = a.platform and b.id <> a.id and b.date between a.date and a.date + 1
      where a.id = p_session_id
        and b.status::text <> 'Cancelled'
        and not coalesce(b.excluded_from_reports, false)
        and abs(extract(epoch from (((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') - session_boundary_at(a.id)))) <= 300
        and private.session_time_linked(a.id, b.id)
      order by b.date, b.start_time
      limit 1)
  );
$$;

-- Tính giờ cả chuỗi chứa p_session_id. Trả một dòng mỗi ca trong chuỗi (không ghi gì). Không có room nào ⇒ không trả dòng.
create or replace function private.session_time_chain(p_session_id uuid)
returns setof session_time_checks
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_head uuid := p_session_id;
  v_prev uuid;
  v_members uuid[] := '{}';
  v_cur uuid;
  v_guard int := 0;
  v_win_from timestamptz;
  v_win_to timestamptz;
  -- khoảng room đang live (đã gộp), theo thứ tự
  v_s timestamptz[] := '{}';
  v_e timestamptz[] := '{}';
  v_tail_open boolean := false;
  r record;
  v_n int;
  k int;
  i int;
  s live_sessions;
  v_ot numeric; v_early numeric; v_late numeric;
  v_plan_start timestamptz; v_plan_min numeric; v_target numeric;
  v_t timestamptz;          -- giờ kết thúc ca trước
  v_start timestamptz; v_end timestamptz;
  v_rem numeric; v_seg_from timestamptz; v_avail numeric; v_reached boolean;
  v_live numeric; v_pending boolean; v_gap int; v_late_file int;
  v_out session_time_checks;
begin
  -- Ca đầu chuỗi
  loop
    v_prev := private.session_time_prev(v_head);
    exit when v_prev is null or v_prev = any (v_members) or v_guard > 12;
    v_members := v_members || v_head;
    v_head := v_prev;
    v_guard := v_guard + 1;
  end loop;
  -- Các ca trong chuỗi, từ đầu tới cuối
  v_members := array[v_head];
  v_cur := v_head;
  v_guard := 0;
  loop
    v_cur := private.session_time_next(v_cur);
    exit when v_cur is null or v_cur = any (v_members) or v_guard > 12;
    v_members := v_members || v_cur;
    v_guard := v_guard + 1;
  end loop;
  v_n := array_length(v_members, 1);

  select (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' into v_win_from from live_sessions ls where ls.id = v_head;
  v_win_to := session_boundary_at(v_members[v_n]) + interval '3 hours';

  -- Room của cả chuỗi: mỗi room lấy bản trong file tải muộn nhất. Bỏ room thử (< 5', GMV 0) và room tắt trước giờ bắt đầu ca đầu.
  for r in
    with latest as (
      select distinct on (rw.room_id)
             rw.room_id, rw.started_at, rw.ended_at, x.captured_at, x.session_id,
             private.snapshot_export_at(x.file_name, x.captured_at) as export_at,
             coalesce((rw.raw->'orig'->>'gmv')::numeric, rw.gmv) as gmv
        from session_live_snapshots x
        join session_live_snapshot_rows rw on rw.snapshot_id = x.id
       where x.session_id = any (v_members)
         and rw.started_at is not null
         and private.room_rows_comparable(rw.room_id, x.session_id, v_head)
       order by rw.room_id, x.captured_at desc
    )
    select started_at,
           greatest(coalesce(ended_at, export_at), started_at) as ended_at,
           (ended_at is null or abs(extract(epoch from (ended_at - export_at))) <= 120) as open
      from latest
     where coalesce(ended_at, export_at) > v_win_from + interval '5 minutes'
       and started_at < v_win_to
       and not (coalesce(ended_at, export_at) - started_at < interval '5 minutes' and coalesce(gmv, 0) = 0)
     order by started_at
  loop
    i := coalesce(array_length(v_s, 1), 0);
    if i > 0 and r.started_at <= v_e[i] then
      if r.ended_at >= v_e[i] then
        v_e[i] := r.ended_at;
        v_tail_open := r.open;
      end if;
    else
      v_s := v_s || r.started_at;
      v_e := v_e || r.ended_at;
      v_tail_open := r.open;
    end if;
  end loop;
  i := coalesce(array_length(v_s, 1), 0);
  if i = 0 then
    return;
  end if;

  v_t := null;
  for k in 1..v_n loop
    select * into s from live_sessions where id = v_members[k];
    select coalesce(rp.ot_minutes, 0), coalesce(rp.early_leave_minutes, 0), coalesce(rp.late_minutes, 0)
      into v_ot, v_early, v_late
      from live_sessions ls left join live_session_reports rp on rp.session_id = ls.id
     where ls.id = s.id;
    v_plan_start := (s.date + s.start_time) at time zone 'Asia/Ho_Chi_Minh';
    v_plan_min := extract(epoch from (session_boundary_at(s.id) - v_plan_start)) / 60;
    v_target := greatest(v_plan_min + v_ot - v_early - v_late, 0);

    -- Bắt đầu: ca đầu = room bật đầu tiên; ca sau = lúc ca trước đủ giờ, hoặc lúc room bật lại nếu khi đó không có room nào live.
    if k = 1 then
      v_start := v_s[1];
    else
      v_start := v_t;
      if not exists (select 1 from generate_subscripts(v_s, 1) j where v_s[j] <= v_start and v_e[j] > v_start) then
        select min(v_s[j]) into v_seg_from from generate_subscripts(v_s, 1) j where v_s[j] > v_start;
        if v_seg_from is not null then
          v_start := v_seg_from;
        end if;
      end if;
    end if;

    -- Đi theo đồng hồ live từ v_start cho đủ v_target phút.
    v_rem := v_target;
    v_reached := false;
    v_end := v_start;
    for j in 1..i loop
      continue when v_e[j] <= v_end;
      v_seg_from := greatest(v_s[j], v_end);
      v_avail := extract(epoch from (v_e[j] - v_seg_from)) / 60;
      if v_avail >= v_rem then
        v_end := v_seg_from + v_rem * interval '1 minute';
        v_rem := 0;
        v_reached := true;
        exit;
      end if;
      v_rem := v_rem - v_avail;
      v_end := v_e[j];
    end loop;

    v_pending := false;
    v_gap := null;
    if k < v_n then
      -- OPS đã nhập tay giờ giao ca thực (0205) ⇒ theo giờ đó.
      select z.boundary_at into v_seg_from from session_live_snapshots z where z.session_id = s.id and z.boundary_manual;
      if found then
        v_end := greatest(v_seg_from, v_start);
      elsif not v_reached and v_tail_open then
        v_end := v_e[i] + v_rem * interval '1 minute'; -- room còn live lúc xuất file: chưa đủ dữ liệu, dự tính
        v_pending := true;
      end if;
    else
      if v_tail_open then
        if not v_reached then
          v_end := v_e[i] + v_rem * interval '1 minute';
        end if;
        v_pending := true;
      else
        v_end := greatest(v_e[i], v_start); -- ca cuối: room tắt thật
      end if;
    end if;

    select coalesce(sum(greatest(extract(epoch from (least(v_e[j], v_end) - greatest(v_s[j], v_start))), 0)) / 60, 0)
      into v_live
      from generate_subscripts(v_s, 1) j;
    if k = v_n and not v_pending then
      v_gap := round(v_live - v_target);
    end if;
    v_late_file := case when k = 1 then round(extract(epoch from (v_start - v_plan_start)) / 60)::int end;

    v_out := row(s.id, v_head, case when k > 1 then v_members[k - 1] end, k = v_n, v_start, v_end, round(v_live, 2), round(v_target, 2),
                 v_pending, v_late_file, v_gap, now())::session_time_checks;
    return next v_out;
    v_t := v_end;
  end loop;
end;
$$;

-- Ghi giờ cả chuỗi: bảng kiểm + giờ thực của các ca đang lấy số từ file (tháng đã phát hành Report thì không đụng).
create or replace function private.session_time_apply(p_session_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c session_time_checks;
  n int := 0;
begin
  for c in select * from private.session_time_chain(p_session_id) loop
    n := n + 1;
    insert into session_time_checks select c.*
    on conflict (session_id) do update set
      head_session_id = excluded.head_session_id, prev_session_id = excluded.prev_session_id, is_last = excluded.is_last,
      start_at = excluded.start_at, end_at = excluded.end_at, live_minutes = excluded.live_minutes,
      target_minutes = excluded.target_minutes, end_pending = excluded.end_pending,
      file_late_minutes = excluded.file_late_minutes, end_gap_minutes = excluded.end_gap_minutes, computed_at = now();
    update live_sessions ls set
      actual_start_at = c.start_at,
      actual_end_at = c.end_at,
      live_duration_minutes = c.live_minutes
     where ls.id = c.session_id
       and ls.data_source::text = 'live_snapshot'
       and not private.session_waits_for_prev(ls.id)
       and not private.brand_month_published(ls.brand_id, ls.date, ls.platform::text)
       and (ls.actual_start_at, ls.actual_end_at, ls.live_duration_minutes) is distinct from (c.start_at, c.end_at, c.live_minutes);
  end loop;
  if n = 0 then
    delete from session_time_checks where session_id = p_session_id;
  end if;
end;
$$;

revoke all on function private.snapshot_export_at(text, timestamptz) from public, anon, authenticated;
revoke all on function private.session_time_linked(uuid, uuid) from public, anon, authenticated;
revoke all on function private.session_time_prev(uuid) from public, anon, authenticated;
revoke all on function private.session_time_next(uuid) from public, anon, authenticated;
revoke all on function private.session_time_chain(uuid) from public, anon, authenticated;
revoke all on function private.session_time_apply(uuid) from public, anon, authenticated;

-- 4. Mốc giao ca = giờ kết thúc theo luật (thay công thức trễ + phút nghỉ + room tắt của 0204/0205/0209) ---------------------
create or replace function private.session_flex_boundary_at(p_session_id uuid) returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_end timestamptz;
begin
  select c.end_at into v_end from private.session_time_chain(p_session_id) c where c.session_id = p_session_id;
  return coalesce(v_end, session_boundary_at(p_session_id));
end;
$$;
revoke all on function private.session_flex_boundary_at(uuid) from public, anon, authenticated;

-- 5. Cộng số xong thì ghi giờ theo luật (vá định nghĩa ĐANG CÓ, như 0209) ------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure);
  if v_def ~ 'session_time_apply' then
    return;
  end if;
  v_new := replace(v_def,
    '  -- Ca Shopee: ATC của phiên',
    '  perform private.session_time_apply(p_session_id); -- 0213: giờ ca theo luật giờ room bật + đủ giờ lịch

  -- Ca Shopee: ATC của phiên');
  if v_new = v_def then
    raise exception '0213: không thấy chỗ vá trong recompute_session_from_snapshot';
  end if;
  execute v_new;
end $$;

-- 6. Đổi OT / sớm / trễ ⇒ tính lại cả chuỗi ------------------------------------------------------------------------------
create or replace function private.trg_report_time_changed() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if tg_op = 'UPDATE'
     and new.ot_minutes is not distinct from old.ot_minutes
     and new.early_leave_minutes is not distinct from old.early_leave_minutes
     and new.late_minutes is not distinct from old.late_minutes then
    return null;
  end if;
  if tg_op = 'INSERT' and coalesce(new.ot_minutes, 0) = 0 and coalesce(new.early_leave_minutes, 0) = 0 and coalesce(new.late_minutes, 0) = 0 then
    return null;
  end if;
  for v_id in select c.session_id from private.session_time_chain(new.session_id) c order by c.start_at loop
    begin
      if exists (select 1 from session_live_snapshots z where z.session_id = v_id and not z.is_estimated) then
        perform private.snapshot_auto_split(v_id); -- làm mới mốc giao ca + phần chia tạm
        perform private.snapshot_recompute_after(v_id);
      end if;
    exception when others then
      raise warning '0213: không tính lại được giờ ca %: %', v_id, sqlerrm;
    end;
  end loop;
  perform private.session_time_apply(new.session_id);
  return null;
end;
$$;
revoke all on function private.trg_report_time_changed() from public, anon, authenticated;
drop trigger if exists trg_report_time_changed on live_session_reports;
create trigger trg_report_time_changed
  after insert or update of ot_minutes, early_leave_minutes, late_minutes on live_session_reports
  for each row execute function private.trg_report_time_changed();

-- 7. Giao ca nhận "Trễ X'" --------------------------------------------------------------------------------------------------
drop function if exists public.submit_file_handover(uuid, integer, integer, integer, boolean, text, text);
create or replace function public.submit_file_handover(
  p_session_id uuid,
  p_ot_minutes integer default 0,
  p_early_leave_minutes integer default 0,
  p_restart_count integer default 0,
  p_host_late boolean default false,
  p_status_note text default '',
  p_early_leave_reason text default null,
  p_late_minutes integer default 0
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_reason text := case when coalesce(p_early_leave_minutes, 0) > 0 then nullif(p_early_leave_reason, '') end;
  v_late int := least(greatest(coalesce(p_late_minutes, 0), 0), 600);
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Tải lên file số liệu của ca (%) trước, rồi mới giao ca.',
      case when s.platform::text = 'Shopee' then 'Live List của Shopee' else 'Creator-Live-Performance của TikTok' end using errcode = 'P0001';
  end if;
  if v_reason is not null and v_reason not in ('low_sales', 'technical', 'staff', 'brand', 'other') then
    raise exception 'Lý do kết thúc sớm không hợp lệ: %', v_reason using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, early_leave_reason, restart_count, host_late, late_minutes, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0), v_reason,
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false) or v_late > 0, v_late, coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    early_leave_reason = excluded.early_leave_reason,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    late_minutes = excluded.late_minutes,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  select * into s from live_sessions where id = p_session_id;
  return s;
end;
$$;
revoke all on function public.submit_file_handover(uuid, integer, integer, integer, boolean, text, text, integer) from public, anon;
grant execute on function public.submit_file_handover(uuid, integer, integer, integer, boolean, text, text, integer) to authenticated;

-- 8. Tính lại ca cũ: theo thứ tự giờ (ca trước xong mới tới ca sau), tháng đã phát hành bỏ qua ------------------------------
do $$
declare
  r record;
  v_n int := 0;
  v_err int := 0;
begin
  for r in
    select s.session_id
      from session_live_snapshots s
      join live_sessions ls on ls.id = s.session_id
     where ls.data_source::text = 'live_snapshot'
       and not s.is_estimated
       and not private.brand_month_published(ls.brand_id, ls.date, ls.platform::text)
     order by ls.date, ls.start_time
  loop
    begin
      if not (select boundary_manual from session_live_snapshots where session_id = r.session_id) then
        perform private.snapshot_auto_split(r.session_id);
      end if;
      perform recompute_session_from_snapshot(r.session_id);
      v_n := v_n + 1;
    exception when others then
      v_err := v_err + 1;
      raise warning '0213: ca %: %', r.session_id, sqlerrm;
    end;
  end loop;
  -- Bảng kiểm cho mọi ca có file (cả ca đã đối soát / tháng đã phát hành: chỉ ghi bảng kiểm, không đụng giờ ca).
  for r in select s.session_id from session_live_snapshots s loop
    perform private.session_time_apply(r.session_id);
  end loop;
  raise notice '0213: đã tính lại % ca, % ca lỗi', v_n, v_err;
end $$;

do $$
begin
  if to_regprocedure('private.session_time_chain(uuid)') is null
     or to_regprocedure('public.submit_file_handover(uuid,integer,integer,integer,boolean,text,text,integer)') is null then
    raise exception '0213 DỪNG: thiếu hàm';
  end if;
  raise notice '0213 OK';
end $$;
