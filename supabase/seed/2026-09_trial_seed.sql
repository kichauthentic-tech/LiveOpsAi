-- SEED CHẠY THỬ THẬT (2026-09-18) — chạy 1 lần trong Supabase SQL Editor.
-- KHÔNG phải migration: dữ liệu mẫu để tuần chạy thử có số mà nhìn. Gỡ bằng
-- 2026-09_trial_seed_rollback.sql. Mọi dòng seed đều đánh dấu để gỡ được:
--   live_sessions.title bắt đầu bằng '[SEED] ', shift_slots.notes / brand_monthly_reports.promotion_notes
--   = 'SEED chạy thử'. 4 hồ sơ Talent A/B/C/D là hồ sơ mẫu có sẵn, chỉ sửa rate card.
--
-- Nội dung:
--   1. Rate card 4 talent mẫu về mức thực tế (A/B/D theo phiên, C theo giờ) + lịch sử rate mở từ 01/07
--   2. Kế hoạch tháng JOCKEY & VERA: dòng T8 (kế hoạch cho T9) + dòng T9 (khung camp T9 + kế hoạch cho T10)
--   3. Ca mở VERA 20–30/09 12:00–15:00 (JOCKEY đã có 13 ca 18–30/09 do ops tạo — giữ nguyên)
--   4. Talent đăng ký rảnh: A → JOCKEY cả 13 ca; B → JOCKEY ngày lẻ + VERA; C → VERA; D → JOCKEY ngày chẵn
--   5. 17 ca JOCKEY đã xong 01–17/09 (1 ca huỷ 12/09) kèm report tay — để Finance/Report Tháng có số
--
-- Chưa chốt ca nào (bước "Chốt hàng loạt" + chuông thông báo để ops tự bấm trong tuần chạy thử).

begin;

-- ---------- 1. Rate card ----------
update talents set rate_per_session = 400000, rate_per_hour = 0,      commission_rate = 2 where id = '6ad34a98-d213-4ef0-a20e-66a7c45e3104'; -- Talent A
update talents set rate_per_session = 300000, rate_per_hour = 0,      commission_rate = 3 where id = '91d09294-b6fc-47d4-9ac4-693a589405fe'; -- Talent B
update talents set rate_per_session = 0,      rate_per_hour = 150000, commission_rate = 1 where id = '701bfb56-25e2-49f0-9b55-48d8825eccad'; -- Talent C (theo giờ)
update talents set rate_per_session = 350000, rate_per_hour = 0,      commission_rate = 2 where id = 'a1411dde-8b66-4982-adf8-fef2e055dbd7'; -- Talent D

-- Trigger trg_talents_rate_history vừa mở dòng mới từ hôm nay → ca tháng 8-9 sẽ dùng rate cũ 5tr.
-- Viết lại lịch sử: đúng 1 dòng mở từ 01/07 cho mỗi talent.
delete from talent_rate_history where talent_id in (
  '6ad34a98-d213-4ef0-a20e-66a7c45e3104','91d09294-b6fc-47d4-9ac4-693a589405fe',
  '701bfb56-25e2-49f0-9b55-48d8825eccad','a1411dde-8b66-4982-adf8-fef2e055dbd7');
insert into talent_rate_history (talent_id, rate_per_session, rate_per_hour, commission_rate, effective_from, effective_to)
select id, rate_per_session, rate_per_hour, commission_rate, date '2026-07-01', null
from talents where id in (
  '6ad34a98-d213-4ef0-a20e-66a7c45e3104','91d09294-b6fc-47d4-9ac4-693a589405fe',
  '701bfb56-25e2-49f0-9b55-48d8825eccad','a1411dde-8b66-4982-adf8-fef2e055dbd7');

-- ---------- 2. Kế hoạch tháng ----------
-- Quy ước app: dòng tháng X−1 giữ "Kế hoạch tháng sau" (plan_*), dòng tháng X giữ khung camp (camp_*).
insert into brand_monthly_reports (brand_id, period_month, promotion_notes,
  plan_target_gmv, plan_target_nmv, plan_target_hours, plan_pct_daily, plan_pct_dday, plan_pct_midmonth, plan_pct_payday,
  camp_dday_start, camp_dday_end, camp_midmonth_start, camp_midmonth_end, camp_payday_start, camp_payday_end)
values
  -- JOCKEY
  ('8dc7d749-6483-4843-869e-4c4a8b4c6531', '2026-08-01', 'SEED chạy thử',
     900000000, 810000000, 90, 55, 15, 15, 15, null, null, null, null, null, null),
  ('8dc7d749-6483-4843-869e-4c4a8b4c6531', '2026-09-01', 'SEED chạy thử',
    1000000000, 900000000, 93, 55, 15, 15, 15,
    '2026-09-09', '2026-09-09', '2026-09-15', '2026-09-17', '2026-09-25', '2026-09-28'),
  -- VERA
  ('3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb', '2026-08-01', 'SEED chạy thử',
     450000000, 405000000, 60, 60, 10, 15, 15, null, null, null, null, null, null),
  ('3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb', '2026-09-01', 'SEED chạy thử',
     500000000, 450000000, 66, 60, 10, 15, 15,
    '2026-09-09', '2026-09-09', '2026-09-15', '2026-09-17', '2026-09-25', '2026-09-28')
on conflict (brand_id, period_month) do update set
  promotion_notes = excluded.promotion_notes,
  plan_target_gmv = excluded.plan_target_gmv, plan_target_nmv = excluded.plan_target_nmv, plan_target_hours = excluded.plan_target_hours,
  plan_pct_daily = excluded.plan_pct_daily, plan_pct_dday = excluded.plan_pct_dday,
  plan_pct_midmonth = excluded.plan_pct_midmonth, plan_pct_payday = excluded.plan_pct_payday,
  camp_dday_start = excluded.camp_dday_start, camp_dday_end = excluded.camp_dday_end,
  camp_midmonth_start = excluded.camp_midmonth_start, camp_midmonth_end = excluded.camp_midmonth_end,
  camp_payday_start = excluded.camp_payday_start, camp_payday_end = excluded.camp_payday_end,
  updated_at = now();

-- ---------- 3. Ca mở VERA 20–30/09 ----------
insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name, notes, status)
select d::date, '12:00', '15:00', '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb', 'VERA', 'TikTok',
       '64848951-28c7-4b9c-ba3c-6ca42578c112', 'VERA TTS', 'SEED chạy thử', 'open'
from generate_series(date '2026-09-20', date '2026-09-30', interval '1 day') d
where not exists (select 1 from shift_slots s where s.brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb' and s.date = d::date and s.start_time = '12:00');

-- ---------- 4. Talent đăng ký rảnh ----------
insert into session_availability (slot_id, talent_id)
select s.id, t.talent_id
from shift_slots s
cross join (values
  ('6ad34a98-d213-4ef0-a20e-66a7c45e3104'::uuid), ('91d09294-b6fc-47d4-9ac4-693a589405fe'),
  ('701bfb56-25e2-49f0-9b55-48d8825eccad'),       ('a1411dde-8b66-4982-adf8-fef2e055dbd7')) t(talent_id)
where s.status = 'open' and s.date >= '2026-09-18'
  and (
    -- Talent A: mọi ca JOCKEY
    (t.talent_id = '6ad34a98-d213-4ef0-a20e-66a7c45e3104' and s.brand_id = '8dc7d749-6483-4843-869e-4c4a8b4c6531')
    -- Talent B: JOCKEY ngày lẻ + mọi ca VERA
    or (t.talent_id = '91d09294-b6fc-47d4-9ac4-693a589405fe' and (
          (s.brand_id = '8dc7d749-6483-4843-869e-4c4a8b4c6531' and extract(day from s.date)::int % 2 = 1)
          or s.brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb'))
    -- Talent C: mọi ca VERA
    or (t.talent_id = '701bfb56-25e2-49f0-9b55-48d8825eccad' and s.brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb')
    -- Talent D: JOCKEY ngày chẵn
    or (t.talent_id = 'a1411dde-8b66-4982-adf8-fef2e055dbd7' and s.brand_id = '8dc7d749-6483-4843-869e-4c4a8b4c6531' and extract(day from s.date)::int % 2 = 0)
  )
on conflict (slot_id, talent_id) do nothing;

-- ---------- 5. Ca JOCKEY đã xong 01–17/09 + report tay ----------
-- Ca quá khứ → trigger thông báo (0083) không bắn. target_gmv để 0: app tự phân bổ từ kế hoạch tháng.
do $$
declare
  r record;
  v_id uuid;
  v_orders int;
  v_views int;
begin
  for r in
    select * from (values
      -- ngày,        host, cohost, gmv,      status,      ot, early, late,  restart, ads
      ('2026-09-01', 'A', null, 28000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-02', 'B', null, 24000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-03', 'D', null, 26000000, 'Completed', 0,  0,  false, 1, 0),
      ('2026-09-04', 'A', 'C',  31000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-05', 'B', null, 22000000, 'Completed', 0,  15, false, 0, 0),
      ('2026-09-06', 'D', null, 35000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-07', 'A', null, 27000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-08', 'B', null, 30000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-09', 'D', 'C',  88000000, 'Completed', 30, 0,  false, 0, 1500000), -- D-Day 9/9
      ('2026-09-10', 'A', null, 29000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-11', 'B', null, 25000000, 'Completed', 0,  0,  true,  0, 0),
      ('2026-09-12', 'D', null, 0,        'Cancelled', 0,  0,  false, 0, 0),
      ('2026-09-13', 'A', null, 33000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-14', 'B', null, 26000000, 'Completed', 0,  0,  false, 0, 0),
      ('2026-09-15', 'D', 'C',  58000000, 'Completed', 0,  0,  false, 0, 800000),  -- Mid-Month
      ('2026-09-16', 'A', 'C',  62000000, 'Completed', 30, 0,  false, 0, 800000),
      ('2026-09-17', 'B', null, 55000000, 'Completed', 0,  0,  false, 0, 800000)
    ) as v(d, host, cohost, gmv, st, ot, early, late, restart, ads)
  loop
    v_orders := round(r.gmv / 175000.0);
    v_views := v_orders * 45;

    insert into live_sessions (title, brand_id, brand_name, shop_tiktok_handle, studio_id, studio_name,
      host_id, host_name, co_host_id, co_host_name, platform, date, start_time, end_time, status,
      target_gmv, actual_gmv, total_orders, avg_watch_time_seconds, peak_viewers, total_views, ctr_avg, cvr_avg,
      data_source)
    values ('[SEED] JOCKEY live tối ' || to_char(r.d::date, 'DD/MM'),
      '8dc7d749-6483-4843-869e-4c4a8b4c6531', 'JOCKEY', '', 'e0a643bc-320d-4a05-b96f-17f08b38be59', 'JOCKEY',
      case r.host when 'A' then '6ad34a98-d213-4ef0-a20e-66a7c45e3104'::uuid
                  when 'B' then '91d09294-b6fc-47d4-9ac4-693a589405fe'::uuid
                  when 'D' then 'a1411dde-8b66-4982-adf8-fef2e055dbd7'::uuid end,
      'Talent ' || r.host,
      case r.cohost when 'C' then '701bfb56-25e2-49f0-9b55-48d8825eccad'::uuid else null end,
      case when r.cohost is null then '' else 'Talent ' || r.cohost end,
      'TikTok', r.d::date, '19:00', '22:00', r.st::session_status,
      0, r.gmv, v_orders, 48, greatest(v_views / 12, 0), v_views, 2.5,
      case when v_views > 0 then round(v_orders * 100.0 / v_views, 2) else 0 end,
      'manual')
    returning id into v_id;

    if r.st = 'Completed' then
      insert into live_session_reports (session_id, restart_count, cross_live, host_late, status_note,
        gmv_total, impression_count, ads_cost, ot_minutes, early_leave_minutes,
        submitted_by_talent_id, submitted_by_role, submitted_at, updated_at)
      values (v_id, r.restart, false, r.late, 'SEED — báo cáo tay sau ca',
        r.gmv, v_views * 6, nullif(r.ads, 0), r.ot, r.early,
        null, 'operations', (r.d::date + time '22:30')::timestamptz, now());
    end if;
  end loop;
end $$;

commit;

-- Kiểm tra nhanh sau khi chạy:
select 'sessions' as k, count(*) from live_sessions where title like '[SEED] %'
union all select 'reports', count(*) from live_session_reports r join live_sessions s on s.id = r.session_id where s.title like '[SEED] %'
union all select 'vera_slots', count(*) from shift_slots where notes = 'SEED chạy thử'
union all select 'availability', count(*) from session_availability
union all select 'plans', count(*) from brand_monthly_reports where promotion_notes = 'SEED chạy thử';
