-- Kiểm migration 0153 (ca nối tường minh + ca bị ngắt room). Cách chạy: supabase/tests/README.md, nạp thêm
-- _fixture_room_links.sql sau 0124 và trước 0153.
\set ON_ERROR_STOP on
create or replace function chk(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception '% : got %, want %', label, got, want;
  else raise notice 'OK  % = %', label, got; end if;
end $$;
create or replace function expect_err(label text, stmt text, frag text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then
    if sqlerrm like '%' || frag || '%' then raise notice 'OK  % (lỗi đúng: %)', label, sqlerrm; return; end if;
    raise exception '% : sai lỗi: %', label, sqlerrm;
  end;
  raise exception '% : lẽ ra phải lỗi', label;
end $$;

truncate live_sessions cascade;
-- brand 1 = ...b1, brand 2 = ...b2
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-00000000000a', 'b1000000-0000-0000-0000-000000000001', '2026-10-05', '09:00', '12:00'),
  ('a0000000-0000-0000-0000-00000000000b', 'b1000000-0000-0000-0000-000000000001', '2026-10-05', '12:00', '15:00'),
  ('a0000000-0000-0000-0000-00000000000c', 'b1000000-0000-0000-0000-000000000001', '2026-10-05', '15:00', '18:00'),
  ('a0000000-0000-0000-0000-00000000000d', 'b2000000-0000-0000-0000-000000000002', '2026-10-05', '12:00', '15:00'),
  ('a0000000-0000-0000-0000-00000000000e', 'b1000000-0000-0000-0000-000000000001', '2026-10-05', '21:00', '23:00');

-- ========== A) Liên kết: ca B chờ mốc của ca A, rồi A up ⇒ B ra số đúng ==========
-- Ứng viên ca sau của A: chỉ B. Ca khác brand (D) không có; C (15:00 = A hết + 3h) và E (21:00) quá 2h nên bị loại.
select chk('A candidates chỉ còn 1 ca', count(*), 1) from room_link_candidates('a0000000-0000-0000-0000-00000000000a');
select chk('A candidates đúng là B', count(*), 1) from room_link_candidates('a0000000-0000-0000-0000-00000000000a') where session_id = 'a0000000-0000-0000-0000-00000000000b';
select expect_err('A khác brand bị chặn', $$select link_session_room('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000d')$$, 'khác brand');
select expect_err('A ca sau cách >2h bị chặn', $$select link_session_room('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000e')$$, 'hơn 2 giờ');
select expect_err('A ca sau không được trước ca trước', $$select link_session_room('a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000a')$$, 'bắt đầu sau');
select link_session_room('a0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000b');
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-0000000000c0', 'b1000000-0000-0000-0000-000000000001', '2026-10-05', '10:00', '12:30');
select expect_err('A ca B đã có ca trước khác', $$select link_session_room('a0000000-0000-0000-0000-0000000000c0','a0000000-0000-0000-0000-00000000000b')$$, 'đã được nối');

-- B up TRƯỚC khi A có mốc ⇒ số của B bị khoá (không ghi đè, vẫn 0)
select apply_session_live_snapshot('a0000000-0000-0000-0000-00000000000b', 'f2.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-05T09:00:00+07:00","endedAt":"2026-10-05T15:00:00+07:00",
     "gmv":260,"views":2500,"orders":26,"durationMinutes":360,"watchSeconds":100000}]'::jsonb);
select chk('A ca B bị khoá khi A chưa up (gmv giữ 0)', actual_gmv, 0) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select chk('A view không trả dòng cho ca chờ', count(*), 0) from session_room_deltas where session_id='a0000000-0000-0000-0000-00000000000b';

-- Một ca KHÔNG liên kết cùng room, boundary nằm giữa A và B: không được làm mốc của B (cách cũ lấy "snapshot gần nhất")
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-0000000000f1', 'b2000000-0000-0000-0000-000000000002', '2026-10-05', '10:00', '13:00');
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000f1', 'noise.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-05T09:00:00+07:00","endedAt":"2026-10-05T15:00:00+07:00",
     "gmv":200,"views":2000,"orders":20,"durationMinutes":240,"watchSeconds":0}]'::jsonb);

-- A up ⇒ B hết chờ, trừ ĐÚNG snapshot của A (100), không phải của ca nhiễu (200)
select apply_session_live_snapshot('a0000000-0000-0000-0000-00000000000a', 'f1.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-05T09:00:00+07:00","endedAt":"2026-10-05T15:00:00+07:00",
     "gmv":100,"views":1000,"orders":10,"durationMinutes":180,"watchSeconds":30000}]'::jsonb);
select chk('A ca A gmv', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-00000000000a';
select chk('A ca B gmv = 260-100 (không trừ ca nhiễu)', actual_gmv, 160) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select chk('A ca B views', total_views, 1500) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select chk('A ca B avg view (70000/1500=46,67→47)', avg_watch_time_seconds, 47) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select chk('A ca B duration (360-180)', live_duration_minutes, 180) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';

-- Xoá file A khi B đang dựa vào ⇒ bị chặn
select expect_err('A xoá mốc khi ca nối đã up', $$select delete_session_live_snapshot('a0000000-0000-0000-0000-00000000000a')$$, 'Gỡ liên kết');

-- ========== B) Chuỗi A→B→C: A up lại số khác ⇒ B tính lại, C không đổi ==========
select link_session_room('a0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000c');
select apply_session_live_snapshot('a0000000-0000-0000-0000-00000000000c', 'f3.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-05T09:00:00+07:00","endedAt":"2026-10-05T18:00:00+07:00",
     "gmv":360,"views":3000,"orders":36,"durationMinutes":540,"watchSeconds":0}]'::jsonb);
select chk('B ca C gmv = 360-260', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-00000000000c';
select chk('B ca B vẫn 160', actual_gmv, 160) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select apply_session_live_snapshot('a0000000-0000-0000-0000-00000000000a', 'f1b.xlsx', 'p',
  '[{"roomId":"RB","startedAt":"2026-10-05T09:00:00+07:00","endedAt":"2026-10-05T15:00:00+07:00",
     "gmv":120,"views":1000,"orders":12,"durationMinutes":180,"watchSeconds":30000}]'::jsonb);
select chk('B ca B = 260-120 sau khi A đổi', actual_gmv, 140) from live_sessions where id='a0000000-0000-0000-0000-00000000000b';
select chk('B ca C không đổi', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-00000000000c';

-- Gỡ liên kết B→C: C quay về cách cũ (snapshot gần nhất trước nó của cùng room = B) ⇒ vẫn 100
select unlink_session_room('a0000000-0000-0000-0000-00000000000b');
select chk('B gỡ liên kết, ca C (cách cũ) vẫn 100', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-00000000000c';
select chk('B số dòng liên kết còn lại', count(*), 1) from session_room_links;

-- ========== C) Lối thoát: ước lượng chia theo thời gian ==========
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-0000000000a2', 'b1000000-0000-0000-0000-000000000001', '2026-10-06', '09:00', '12:00'),
  ('a0000000-0000-0000-0000-0000000000b2', 'b1000000-0000-0000-0000-000000000001', '2026-10-06', '12:00', '15:00');
select link_session_room('a0000000-0000-0000-0000-0000000000a2','a0000000-0000-0000-0000-0000000000b2');
select expect_err('C chưa có số ca sau thì không ước lượng', $$select estimate_handover_split('a0000000-0000-0000-0000-0000000000a2')$$, 'chưa up file');
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000b2', 'f.xlsx', 'p',
  '[{"roomId":"RE","startedAt":"2026-10-06T09:00:00+07:00","endedAt":"2026-10-06T15:00:00+07:00",
     "gmv":600,"views":6000,"orders":60,"durationMinutes":360,"watchSeconds":0}]'::jsonb);
select chk('C ca sau chờ (gmv 0)', actual_gmv, 0) from live_sessions where id='a0000000-0000-0000-0000-0000000000b2';
select estimate_handover_split('a0000000-0000-0000-0000-0000000000a2');
select chk('C ca trước ước lượng = nửa room', actual_gmv, 300) from live_sessions where id='a0000000-0000-0000-0000-0000000000a2';
select chk('C ca sau = phần còn lại', actual_gmv, 300) from live_sessions where id='a0000000-0000-0000-0000-0000000000b2';
select chk('C snapshot ước lượng gắn cờ', count(*), 1) from session_live_snapshots where session_id='a0000000-0000-0000-0000-0000000000a2' and is_estimated;
-- A up file thật thay thế bản ước lượng
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000a2', 'real.xlsx', 'p',
  '[{"roomId":"RE","startedAt":"2026-10-06T09:00:00+07:00","endedAt":"2026-10-06T15:00:00+07:00",
     "gmv":250,"views":2500,"orders":25,"durationMinutes":180,"watchSeconds":0}]'::jsonb);
select chk('C file thật thay ước lượng: ca trước', actual_gmv, 250) from live_sessions where id='a0000000-0000-0000-0000-0000000000a2';
select chk('C ca sau tính lại = 600-250', actual_gmv, 350) from live_sessions where id='a0000000-0000-0000-0000-0000000000b2';
select chk('C hết cờ ước lượng', count(*), 0) from session_live_snapshots where is_estimated;

-- ========== D) Ca bị ngắt room: mảnh 2, tổng hợp, lý do ==========
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-0000000000d1', 'b1000000-0000-0000-0000-000000000001', '2026-10-07', '09:00', '12:00');
select expect_err('D chưa có mảnh đầu', $$select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000d1','network',null,'x','p','[]'::jsonb)$$, 'mảnh đầu');
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000d1', 'half1.xlsx', 'p',
  '[{"roomId":"R1","startedAt":"2026-10-07T09:00:00+07:00","endedAt":"2026-10-07T10:30:00+07:00",
     "gmv":100,"views":1000,"orders":10,"durationMinutes":90,"watchSeconds":30000}]'::jsonb);
select chk('D mảnh 1 gmv', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select expect_err('D lý do sai', $$select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000d1','bậy',null,'x','p','[]'::jsonb)$$, 'Lý do');
select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000d1', 'network', 'rớt wifi', 'half2.xlsx', 'p',
  '[{"roomId":"R2","startedAt":"2026-10-07T10:40:00+07:00","endedAt":"2026-10-07T12:00:00+07:00",
     "gmv":60,"views":800,"orders":6,"durationMinutes":80,"watchSeconds":16000}]'::jsonb);
select chk('D tổng gmv 100+60', actual_gmv, 160) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D tổng views 1000+800', total_views, 1800) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D giờ live = 90+80 (khoảng nghỉ 10p không tính)', live_duration_minutes, 170) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D avg view (46000/1800=25,6→26)', avg_watch_time_seconds, 26) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D live_room_ids có 2 room', array_length(live_room_ids,1), 2) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D mảnh ghi nhận part_no=2', part_no, 2) from session_snapshot_parts where session_id='a0000000-0000-0000-0000-0000000000d1';
-- up lại cùng Room ID R2 (file mới hơn) ⇒ thay bản cũ, không cộng dôi
select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000d1', 'manual_restart', null, 'half2b.xlsx', 'p',
  '[{"roomId":"R2","startedAt":"2026-10-07T10:40:00+07:00","endedAt":"2026-10-07T12:00:00+07:00",
     "gmv":70,"views":900,"orders":7,"durationMinutes":80,"watchSeconds":18000}]'::jsonb);
select chk('D R2 thay bản cũ: gmv 100+70', actual_gmv, 170) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
select chk('D chỉ 2 dòng room', count(*), 2) from session_live_snapshot_rows r join session_live_snapshots s on s.id=r.snapshot_id where s.session_id='a0000000-0000-0000-0000-0000000000d1';
-- chỉ ghi nhận lý do (không file)
select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000d1', 'device_change', 'đổi máy', null, null, '[]'::jsonb);
select chk('D 3 mảnh (2 mảnh sau + 1 ghi chú)', count(*), 3) from session_snapshot_parts where session_id='a0000000-0000-0000-0000-0000000000d1';
select chk('D ghi chú không đổi số', actual_gmv, 170) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
-- xoá mảnh 2 (R2 thứ nhất đã bị thay bằng mảnh 3: part 3 mới có rows) -> xoá mảnh có rows ⇒ số lùi
select delete_session_snapshot_part(id) from session_snapshot_parts where session_id='a0000000-0000-0000-0000-0000000000d1' and room_ids <> '{}';
select chk('D xoá mảnh có room ⇒ về mảnh 1', actual_gmv, 100) from live_sessions where id='a0000000-0000-0000-0000-0000000000d1';
-- up lại bình thường thay thế snapshot ⇒ mảnh cũ bị dọn
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000d1', 'all.xlsx', 'p',
  '[{"roomId":"R1","startedAt":"2026-10-07T09:00:00+07:00","endedAt":"2026-10-07T10:30:00+07:00","gmv":100,"views":1000,"orders":10,"durationMinutes":90}]'::jsonb);
select chk('D up lại thay snapshot ⇒ hết mảnh', count(*), 0) from session_snapshot_parts where session_id='a0000000-0000-0000-0000-0000000000d1';

-- ========== E) Nối + ngắt room cùng lúc: ca B có thêm room mới (restart) ngoài room nối từ A ==========
insert into live_sessions (id, brand_id, date, start_time, end_time) values
  ('a0000000-0000-0000-0000-0000000000a3', 'b1000000-0000-0000-0000-000000000001', '2026-10-08', '09:00', '12:00'),
  ('a0000000-0000-0000-0000-0000000000b3', 'b1000000-0000-0000-0000-000000000001', '2026-10-08', '12:00', '15:00');
select link_session_room('a0000000-0000-0000-0000-0000000000a3','a0000000-0000-0000-0000-0000000000b3');
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000a3', 'a.xlsx', 'p',
  '[{"roomId":"RX","startedAt":"2026-10-08T09:00:00+07:00","endedAt":"2026-10-08T13:00:00+07:00","gmv":100,"views":1000,"orders":10,"durationMinutes":240}]'::jsonb);
select apply_session_live_snapshot('a0000000-0000-0000-0000-0000000000b3', 'b.xlsx', 'p',
  '[{"roomId":"RX","startedAt":"2026-10-08T09:00:00+07:00","endedAt":"2026-10-08T13:00:00+07:00","gmv":150,"views":1500,"orders":15,"durationMinutes":240}]'::jsonb);
select apply_session_snapshot_part('a0000000-0000-0000-0000-0000000000b3', 'platform_cut', null, 'b2.xlsx', 'p',
  '[{"roomId":"RY","startedAt":"2026-10-08T13:10:00+07:00","endedAt":"2026-10-08T15:00:00+07:00","gmv":40,"views":400,"orders":4,"durationMinutes":110}]'::jsonb);
select chk('E ca B = (150-100 từ RX) + 40 từ RY', actual_gmv, 90) from live_sessions where id='a0000000-0000-0000-0000-0000000000b3';

-- ========== F) room_link_state: ca trước/ca sau cùng trạng thái file ==========
select chk('F ca B có ca trước = A', (prev_session_id = 'a0000000-0000-0000-0000-0000000000a3')::int, 1) from room_link_state('a0000000-0000-0000-0000-0000000000b3');
select chk('F ca trước đã có file', prev_has_snapshot::int, 1) from room_link_state('a0000000-0000-0000-0000-0000000000b3');
select chk('F ca trước có 1 room (RX)', array_length(prev_room_ids, 1), 1) from room_link_state('a0000000-0000-0000-0000-0000000000b3');
select chk('F ca A có ca sau = B, đã up', next_has_snapshot::int, 1) from room_link_state('a0000000-0000-0000-0000-0000000000a3');
select chk('F ca không liên kết trả 1 dòng rỗng', (prev_session_id is null and next_session_id is null)::int, 1) from room_link_state('a0000000-0000-0000-0000-0000000000d1');

select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
