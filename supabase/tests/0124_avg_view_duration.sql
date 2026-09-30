-- Kiểm migration 0124 (Avg. view đọc từ file). Cách chạy: xem supabase/tests/README.md.
-- Điểm cốt lõi là mục B: 2 ca nối nhau dùng chung 1 room. Bê thẳng số trung bình của file
-- cho ca sau sẽ ra 40s (trung bình CẢ room từ lúc mở); số đúng của riêng ca đó là 47s.
\set ON_ERROR_STOP on
create or replace function chk(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '% : got %, want %', label, got, want;
  else raise notice 'OK  % = %', label, got; end if;
end $$;

truncate live_sessions cascade;
truncate live_reconciliation_batches cascade;

-- A) 1 ca, 1 room
insert into live_sessions (id, date, start_time, end_time)
values ('11111111-1111-1111-1111-111111111111', '2026-10-01', '09:00', '12:00');
select apply_session_live_snapshot('11111111-1111-1111-1111-111111111111', 'f.xlsx', 'p',
  '[{"roomId":"RA","startedAt":"2026-10-01T09:00:00+07:00","endedAt":"2026-10-01T12:00:00+07:00",
     "gmv":100,"views":1000,"orders":10,"durationMinutes":180,"watchSeconds":30000}]'::jsonb);
select chk('A avg_watch (30000/1000)', avg_watch_time_seconds, 30) from live_sessions where id='11111111-1111-1111-1111-111111111111';
select chk('A views', total_views, 1000) from live_sessions where id='11111111-1111-1111-1111-111111111111';

-- B) 2 ca NỐI NHAU dùng chung 1 room — phép trừ phải chạy trên giây xem, không trên số trung bình
insert into live_sessions (id, date, start_time, end_time) values
  ('22222222-2222-2222-2222-222222222222', '2026-10-02', '09:00', '12:00'),
  ('33333333-3333-3333-3333-333333333333', '2026-10-02', '12:00', '15:00');
select apply_session_live_snapshot('22222222-2222-2222-2222-222222222222', 'f1.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-02T09:00:00+07:00","endedAt":"2026-10-02T15:00:00+07:00",
     "gmv":100,"views":1000,"orders":10,"durationMinutes":180,"watchSeconds":30000}]'::jsonb);
select apply_session_live_snapshot('33333333-3333-3333-3333-333333333333', 'f2.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-02T09:00:00+07:00","endedAt":"2026-10-02T15:00:00+07:00",
     "gmv":260,"views":2500,"orders":26,"durationMinutes":360,"watchSeconds":100000}]'::jsonb);
select chk('B ca1 avg (30000/1000)', avg_watch_time_seconds, 30) from live_sessions where id='22222222-2222-2222-2222-222222222222';
-- ca2 = (100000-30000) / (2500-1000) = 70000/1500 = 46,67 -> 47.
-- Nếu bê thẳng số trung bình của file thì ra 40 — sai, vì 40 là trung bình CẢ room từ lúc mở.
select chk('B ca2 avg ((100000-30000)/1500)', avg_watch_time_seconds, 47) from live_sessions where id='33333333-3333-3333-3333-333333333333';
select chk('B ca2 views', total_views, 1500) from live_sessions where id='33333333-3333-3333-3333-333333333333';

-- C) File CŨ (up trước 0124, watch_seconds = 0) không được xoá số đang có về 0
insert into live_sessions (id, date, start_time, end_time, avg_watch_time_seconds)
values ('44444444-4444-4444-4444-444444444444', '2026-10-03', '09:00', '12:00', 33);
select apply_session_live_snapshot('44444444-4444-4444-4444-444444444444', 'old.xlsx', 'p',
  '[{"roomId":"RC","startedAt":"2026-10-03T09:00:00+07:00","endedAt":"2026-10-03T12:00:00+07:00",
     "gmv":50,"views":500,"orders":5,"durationMinutes":180}]'::jsonb);
select chk('C giữ nguyên 33 khi file cũ', avg_watch_time_seconds, 33) from live_sessions where id='44444444-4444-4444-4444-444444444444';

-- C2) xoá snapshot phải khôi phục lại 33 (trước 0124 previous_values không chụp cột này)
select delete_session_live_snapshot('44444444-4444-4444-4444-444444444444');
select chk('C2 khôi phục 33 sau khi xoá snapshot', avg_watch_time_seconds, 33) from live_sessions where id='44444444-4444-4444-4444-444444444444';

-- D) Đối soát: file cả ngày, 1 room trải 2 ca, chia theo tỷ lệ đóng góp đã ghi nhận
do $$
declare v_batch uuid;
begin
  v_batch := import_live_reconciliation('recon.xlsx', 'p', '2026-10-02', '2026-10-02',
    '[{"roomId":"RB","startedAt":"2026-10-02T09:00:00+07:00","endedAt":"2026-10-02T15:00:00+07:00",
       "gmv":300,"views":3000,"orders":30,"durationMinutes":360,"watchSeconds":120000}]'::jsonb);
  perform apply_live_reconciliation(v_batch);
end $$;
-- Giây xem chia theo đóng góp: ca1 30000/100000, ca2 70000/100000 của 120000 ⇒ 36000 / 84000.
-- Views chia theo đóng góp views: ca1 1000/2500, ca2 1500/2500 của 3000 ⇒ 1200 / 1800.
select chk('D ca1 avg (36000/1200)', avg_watch_time_seconds, 30) from live_sessions where id='22222222-2222-2222-2222-222222222222';
select chk('D ca2 avg (84000/1800)', avg_watch_time_seconds, 47) from live_sessions where id='33333333-3333-3333-3333-333333333333';

select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
