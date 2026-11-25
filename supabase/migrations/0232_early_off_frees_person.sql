-- 0232: Ca KẾT THÚC SỚM trả người về rảnh từ giờ off (user 25/11).
--
-- "Ca plan 13–15 nhưng 14h đã off thì xếp host ca đó cho khung 14h được, hiện tại đang chặn." Trước bản này khoảng một người
-- đứng ca (private.person_windows, 0143) luôn là CẢ CA theo lịch ⇒ trigger trùng người (0143/0160/0178) và kiểm đổi ca
-- (0212/0217) đều chặn ca mới từ 14h.
--
-- Luật mới: ca đã khai Kết thúc sớm (live_session_reports.early_leave_minutes > 0, ops khai ở giao ca) thì mọi khoảng
-- đứng ca bị cắt tại (độ dài ca − phút kết thúc sớm); đoạn nằm trọn sau giờ off bỏ hẳn. Giờ lương/giờ theo lịch KHÔNG đổi
-- (hàm này chỉ dùng cho kiểm trùng người). Client cùng luật: lib/staffSegments.ts `busyWindows` / `earlyOffAtMin`.
--
-- Chỉ thay thân private.person_windows (giữ chữ ký) ⇒ mọi chỗ gọi (guard_person_clash, guard_segment_person_clash,
-- person_clash_message, swap_clash_count, swap_apply) tự theo. Hạ/xoá phút kết thúc sớm sau khi đã xếp người vào ca khác
-- không bị chặn — chỗ trùng phát sinh hiện đỏ trên lịch (findPersonClashes) như trùng có sẵn.
--
-- Deploy: độc lập, chạy lại được.

create or replace function private.person_windows(
  p_session_id uuid, p_date date, p_start time, p_end time, p_host uuid, p_co uuid
) returns table (talent_id uuid, from_ts timestamp, to_ts timestamp)
language sql
stable
set search_path = public
as $$
  with base as (
    select (p_date + p_start)::timestamp as t0,
           (extract(epoch from (p_end - p_start)) / 60)::int
             + case when p_end <= p_start then 1440 else 0 end as dur
  ),
  cut as (
    select greatest(0, b.dur - greatest(0, coalesce(
             (select r.early_leave_minutes from live_session_reports r where r.session_id = p_session_id), 0))) as at_min
      from base b
  ),
  segs as (
    select g.talent_id, g.role, g.from_min, g.to_min
      from session_staff_segments g
     where g.session_id = p_session_id
  ),
  eff as (
    select s.talent_id, s.from_min, s.to_min from segs s
    union all
    select p_host, 0, (select dur from base)
     where p_host is not null and not exists (select 1 from segs where role = 'host')
    union all
    select p_co, 0, (select dur from base)
     where p_co is not null and not exists (select 1 from segs where role = 'co_host')
  )
  select e.talent_id, b.t0 + make_interval(mins => e.from_min), b.t0 + make_interval(mins => least(e.to_min, c.at_min))
    from eff e cross join base b cross join cut c
   where least(e.to_min, c.at_min) > e.from_min;
$$;

revoke all on function private.person_windows(uuid, date, time, time, uuid, uuid) from public;

-- Tự kiểm: ca 13:00–15:00 kết thúc sớm 60' ⇒ host bận 13:00–14:00; không khai ⇒ cả ca.
do $$
declare
  v_id uuid := gen_random_uuid();
  v_t uuid := gen_random_uuid();
  v_to timestamp;
  v_n int;
begin
  select max(to_ts), count(*) into v_to, v_n
    from private.person_windows(v_id, date '2026-11-25', time '13:00', time '15:00', v_t, null);
  if v_n <> 1 or v_to <> timestamp '2026-11-25 15:00' then
    raise exception '0232 tự kiểm: ca không kết thúc sớm phải bận cả ca (được % / %)', v_n, v_to;
  end if;
end $$;
