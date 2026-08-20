-- Giai đoạn 3 lộ trình đối soát: Rate Card Talent theo GIỜ + khai báo OT / off sớm sau phiên.
--
-- Bối cảnh + 2 quyết định user đã chốt:
--   1. `talents.rate_per_session` hiện tại là tiền/PHIÊN cố định và ĐANG CÓ DATA THẬT — không
--      diễn giải lại thành tiền/giờ. Thêm `rate_per_hour` SONG SONG; talent nào đặt
--      rate_per_hour > 0 thì tính theo giờ, còn lại giữ nguyên công thức flat như cũ. Nhờ vậy
--      P&L của mọi session cũ không đổi một đồng nào sau migration này.
--   2. Giờ công tính lương lấy theo số host khai + ops duyệt (đối soát TikTok ở Giai đoạn 2 chỉ
--      cảnh báo lệch, không ghi đè) — nên OT/off sớm phải là field HOST TỰ KHAI trong report
--      sau phiên, không suy ra từ số liệu TikTok.
--
-- Giờ tính lương = (giờ ca theo lịch) + ot_minutes − early_leave_minutes.

-- ============================================================
-- 1. Rate theo giờ cho Talent (+ versioning như rate cũ)
-- ============================================================
alter table talents add column if not exists rate_per_hour numeric not null default 0;
alter table talent_rate_history add column if not exists rate_per_hour numeric not null default 0;

-- View talents_secure (migration 0047/0048) phải mask rate_per_hour cùng mức nhạy cảm như
-- rate_per_session — nếu không, cột lương mới sẽ lộ cho mọi role qua view. `create or replace
-- view` chỉ cho phép THÊM cột ở cuối nên giữ nguyên thứ tự cột cũ.
create or replace view talents_secure as
select
  id, name, avatar, role, gender, niches, avg_gmv_per_session, total_gmv, ctr_avg, cvr_avg,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then rate_per_session else null end as rate_per_session,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then commission_rate else null end as commission_rate,
  overall_score, availability_status, brands_worked_with, phone, date_of_birth, profile_id,
  created_at, updated_at,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then rate_per_hour else null end as rate_per_hour
from talents;

grant select on talents_secure to authenticated;

-- Trigger versioning cũ (migration 0018) chỉ theo dõi rate_per_session/commission_rate — bổ sung
-- rate_per_hour vào cả điều kiện phát hiện thay đổi lẫn dòng lịch sử ghi ra.
create or replace function trg_talent_rate_history() returns trigger as $$
declare
  open_row talent_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, effective_from)
    values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, current_date);
    return new;
  end if;

  if new.rate_per_session is distinct from old.rate_per_session
     or new.commission_rate is distinct from old.commission_rate
     or new.rate_per_hour is distinct from old.rate_per_hour then
    select * into open_row from talent_rate_history
      where talent_id = new.id and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update talent_rate_history
        set rate_per_session = new.rate_per_session,
            commission_rate = new.commission_rate,
            rate_per_hour = new.rate_per_hour
        where id = open_row.id;
    else
      if open_row.id is not null then
        update talent_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, effective_from)
        values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

-- Backfill: dòng lịch sử đang mở của mỗi talent lấy rate_per_hour hiện tại (đều = 0 lúc chạy
-- migration), để tra rate theo ngày không trả null cho session cũ.
update talent_rate_history h
  set rate_per_hour = t.rate_per_hour
  from talents t
  where h.talent_id = t.id and h.effective_to is null;

-- ============================================================
-- 2. OT / off sớm trong report sau phiên
-- ============================================================
alter table live_session_reports
  add column if not exists ot_minutes int not null default 0,
  add column if not exists early_leave_minutes int not null default 0;

comment on column live_session_reports.ot_minutes is
  'Số phút host live thêm ngoài giờ ca (host tự khai, ops duyệt). Cộng vào giờ tính lương.';
comment on column live_session_reports.early_leave_minutes is
  'Số phút host nghỉ sớm so với giờ ca (host tự khai, ops duyệt). Trừ khỏi giờ tính lương.';

-- RPC đổi chữ ký (thêm 2 tham số) nên phải DROP bản cũ trước: `create or replace function` với
-- danh sách tham số khác sẽ tạo OVERLOAD thứ 2 chứ không thay thế, và PostgREST sẽ không biết
-- chọn bản nào.
drop function if exists submit_live_session_report(
  uuid, numeric, int, numeric, int, int, boolean, boolean, text, numeric, text, text,
  bigint, numeric, numeric, numeric, numeric, int, numeric, int, numeric
);

create or replace function submit_live_session_report(
  p_session_id uuid,
  p_actual_gmv numeric,
  p_total_views int,
  p_ctr_avg numeric,
  p_avg_watch_time_seconds int,
  p_restart_count int,
  p_cross_live boolean,
  p_host_late boolean,
  p_status_note text,
  p_gmv_total numeric,
  p_dashboard_link_1 text,
  p_dashboard_link_2 text,
  p_impression_count bigint,
  p_ads_cost numeric,
  p_enter_room_rate numeric,
  p_ctor numeric,
  p_avg_order_value numeric,
  p_atc_count int,
  p_gpm numeric,
  p_checkout_count int,
  p_coin_spent numeric,
  p_ot_minutes int,
  p_early_leave_minutes int
) returns live_sessions as $$
declare
  v_session live_sessions;
  v_role user_role := current_user_role();
  v_talent_id uuid := current_user_talent_id();
begin
  select * into v_session from live_sessions where id = p_session_id;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  if v_role = 'talent' then
    if v_talent_id is null
        or (v_session.host_id is distinct from v_talent_id and v_session.co_host_id is distinct from v_talent_id) then
      raise exception 'not authorized to submit report for this session';
    end if;
  elsif v_role not in ('ceo', 'operations', 'admin') then
    raise exception 'not authorized to submit session report';
  end if;

  update live_sessions set
    actual_gmv = coalesce(p_actual_gmv, actual_gmv),
    total_views = coalesce(p_total_views, total_views),
    ctr_avg = coalesce(p_ctr_avg, ctr_avg),
    avg_watch_time_seconds = coalesce(p_avg_watch_time_seconds, avg_watch_time_seconds)
  where id = p_session_id
  returning * into v_session;

  insert into live_session_reports (
    session_id, restart_count, cross_live, host_late, status_note, gmv_total,
    dashboard_link_1, dashboard_link_2, impression_count, ads_cost, enter_room_rate, ctor,
    avg_order_value, atc_count, gpm, checkout_count, coin_spent,
    ot_minutes, early_leave_minutes,
    submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    p_session_id, coalesce(p_restart_count, 0), coalesce(p_cross_live, false), coalesce(p_host_late, false),
    coalesce(p_status_note, ''), p_gmv_total, p_dashboard_link_1, p_dashboard_link_2,
    p_impression_count, p_ads_cost, p_enter_room_rate, p_ctor, p_avg_order_value,
    p_atc_count, p_gpm, p_checkout_count, p_coin_spent,
    greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    v_talent_id, v_role, now(), now()
  )
  on conflict (session_id) do update set
    restart_count = excluded.restart_count,
    cross_live = excluded.cross_live,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    gmv_total = excluded.gmv_total,
    dashboard_link_1 = excluded.dashboard_link_1,
    dashboard_link_2 = excluded.dashboard_link_2,
    impression_count = excluded.impression_count,
    ads_cost = excluded.ads_cost,
    enter_room_rate = excluded.enter_room_rate,
    ctor = excluded.ctor,
    avg_order_value = excluded.avg_order_value,
    atc_count = excluded.atc_count,
    gpm = excluded.gpm,
    checkout_count = excluded.checkout_count,
    coin_spent = excluded.coin_spent,
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  return v_session;
end;
$$ language plpgsql security definer;
