-- 0096 — Vòng đời trạng thái ca (audit N1, 2026-09-21).
--
-- Trước đây KHÔNG có gì chuyển live_sessions.status từ 'Upcoming' sang 'Completed': RPC report
-- (0046/0075/0084), snapshot (0078/0079), đối soát (0080/0082) đều không đụng status; chỉ ca nạp bù
-- (0086) sinh ra đã là Completed. Hệ quả: ca tạo từ chốt lịch sẽ Upcoming mãi và bị loại khỏi
-- engine gợi ý, Finance & P&L, Report Tháng/Tuần (RPC 0051 lọc status='Completed'), GMV TB host,
-- đánh giá kế hoạch vs thực tế, cam kết giờ.
--
-- Cách sửa: (1) trigger BEFORE UPDATE — bất kỳ lần ghi số liệu nào (snapshot/report/đối soát) vào
-- ca đã qua giờ kết thúc thì status := 'Completed'; (2) hàm complete_past_sessions() quét ca đã qua
-- giờ mà chưa có số (không ai up gì) — app gọi lúc mở, và pg_cron gọi mỗi giờ nếu extension có bật;
-- (3) client suy "Đang live" theo giờ để hiển thị, không ghi DB. 'Cancelled' không bao giờ bị đổi.

-- Mốc kết thúc thật của ca theo giờ VN; ca qua đêm (end <= start) thuộc ngày hôm sau.
create or replace function session_end_at(p_date date, p_start time, p_end time)
returns timestamptz
language sql immutable
as $$
  select ((p_date + case when p_end <= p_start then 1 else 0 end) + p_end) at time zone 'Asia/Ho_Chi_Minh';
$$;

create or replace function complete_session_on_data() returns trigger
language plpgsql
as $$
begin
  if new.status in ('Upcoming', 'Live Now')
     and session_end_at(new.date, new.start_time, new.end_time) <= now() then
    new.status := 'Completed';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_complete_session_on_data on live_sessions;
create trigger trg_complete_session_on_data
  before update of actual_gmv, data_source, live_duration_minutes, actual_end_at, reconciled_at
  on live_sessions
  for each row execute function complete_session_on_data();

-- Quét ca đã qua giờ kết thúc mà chưa có ai ghi số. Idempotent; ai đăng nhập cũng gọi được (chỉ
-- đóng ca đã qua giờ, không có gì để lạm dụng). Trả về số ca vừa đóng.
create or replace function complete_past_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if auth.uid() is null then
    raise exception 'Cần đăng nhập';
  end if;
  update live_sessions
     set status = 'Completed'
   where status in ('Upcoming', 'Live Now')
     and session_end_at(date, start_time, end_time) <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function complete_past_sessions() from public;
grant execute on function complete_past_sessions() to authenticated;

-- pg_cron: chỉ lên lịch khi extension đã bật (Supabase: Database → Extensions → pg_cron). Không
-- bật thì app vẫn tự gọi lúc mở, chỉ thiếu phần chạy nền khi không ai mở app.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'complete_past_sessions_hourly';
    perform cron.schedule('complete_past_sessions_hourly', '5 * * * *',
      $job$ update live_sessions set status = 'Completed'
             where status in ('Upcoming', 'Live Now')
               and session_end_at(date, start_time, end_time) <= now(); $job$);
  end if;
end $$;

-- Đóng luôn những ca đã qua giờ đang tồn tại (hiện tại chỉ có ca nạp bù = đã Completed sẵn).
update live_sessions
   set status = 'Completed'
 where status in ('Upcoming', 'Live Now')
   and session_end_at(date, start_time, end_time) <= now();
