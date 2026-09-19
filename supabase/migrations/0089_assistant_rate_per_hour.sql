-- Rate trợ live theo GIỜ, tách khỏi rate host (user chốt 2026-09-19: "rate host/trợ tính theo giờ").
--
-- Bối cảnh: mỗi talent 1 rate card (rate_per_session / rate_per_hour / commission_rate) dùng chung
-- cho cả khi làm host lẫn khi làm trợ live (co_host) của một ca. Thực tế agency cùng một người hôm
-- nay host mai trợ với 2 mức tiền khác nhau — chốt lương tháng 10 sẽ sai nếu không tách.
--
-- Cách làm: thêm `assistant_rate_per_hour` SONG SONG, không diễn giải lại cột cũ:
--   - Ca có co_host: nếu co_host có assistant_rate_per_hour > 0 → lương trợ = rate đó × giờ tính
--     lương của ca. Bằng 0 → giữ nguyên công thức cũ (rate_per_hour host, rồi rate_per_session) nên
--     P&L mọi ca cũ không đổi một đồng sau migration này.
--   - Host vẫn dùng rate_per_hour / rate_per_session như 0055.
-- Versioning theo ngày (talent_rate_history, trigger 0018/0055/0063) và mask trên talents_secure
-- (0047/0048/0055/0087) áp dụng y hệt cột lương khác. Trigger 0058 (talent tự sửa hồ sơ) là
-- whitelist cứng 3 cột nên cột mới tự động không sửa được từ phía talent.

alter table talents add column if not exists assistant_rate_per_hour numeric not null default 0;
alter table talent_rate_history add column if not exists assistant_rate_per_hour numeric not null default 0;

-- View: chỉ được THÊM cột ở cuối (sau nickname của 0087).
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
    then rate_per_hour else null end as rate_per_hour,
  nickname,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then assistant_rate_per_hour else null end as assistant_rate_per_hour
from talents;

grant select on talents_secure to authenticated;

-- Trigger versioning: thân 0063 (đã pin search_path) + cột mới ở cả điều kiện lẫn dòng ghi.
create or replace function trg_talent_rate_history() returns trigger as $$
declare
  open_row talent_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, assistant_rate_per_hour, effective_from)
    values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, new.assistant_rate_per_hour, current_date);
    return new;
  end if;

  if new.rate_per_session is distinct from old.rate_per_session
     or new.commission_rate is distinct from old.commission_rate
     or new.rate_per_hour is distinct from old.rate_per_hour
     or new.assistant_rate_per_hour is distinct from old.assistant_rate_per_hour then
    select * into open_row from talent_rate_history
      where talent_id = new.id and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update talent_rate_history
        set rate_per_session = new.rate_per_session,
            commission_rate = new.commission_rate,
            rate_per_hour = new.rate_per_hour,
            assistant_rate_per_hour = new.assistant_rate_per_hour
        where id = open_row.id;
    else
      if open_row.id is not null then
        update talent_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, assistant_rate_per_hour, effective_from)
        values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, new.assistant_rate_per_hour, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Dòng lịch sử đang mở lấy giá trị hiện tại (đều 0 lúc chạy) — tra theo ngày không trả null.
update talent_rate_history h
  set assistant_rate_per_hour = t.assistant_rate_per_hour
  from talents t
  where h.talent_id = t.id and h.effective_to is null;
