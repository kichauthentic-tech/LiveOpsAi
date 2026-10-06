-- Kiểm migration 0138 (đổi người giữa ca). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0138.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay CHƯA có 0138 thì phải đỏ ngay mục 1.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

create or replace function pg_temp.must_fail(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'FAIL % : lỗi khác mong đợi: %', label, sqlerrm; end if;
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 90);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'talent@t'),
  ('a0000000-0000-0000-0000-000000000003', 'talent2@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
-- 0149: dòng của kênh chưa tồn tại bị từ chối — tạo đủ kênh cho brand thử (bỏ qua khi replay chưa tới 0149).
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;

insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Trúc Như'),
  ('c0000000-0000-0000-0000-000000000002', 'Thảo'),
  ('c0000000-0000-0000-0000-000000000003', 'Khánh Linh');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('a0000000-0000-0000-0000-000000000002', 'Talent', 'talent@t', 'talent', 'c0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003', 'Talent2', 'talent2@t', 'talent', 'c0000000-0000-0000-0000-000000000003')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- ca 15:00-17:30 (150 phút), host Khánh Linh
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status)
values ('d0000000-0000-0000-0000-000000000001', 'VERA Shopee 25/06', 'b0000000-0000-0000-0000-00000000000a', 'VERA',
        current_date + 5, '15:00', '17:30', 'c0000000-0000-0000-0000-000000000003', 'Khánh Linh', 'Upcoming');

-- ============ 1) Ghi hợp lệ + đồng bộ người chính ============
select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000001', 'role', 'co_host', 'from_min', 0, 'to_min', 120),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000002', 'role', 'co_host', 'from_min', 120, 'to_min', 150)));
select pg_temp.chk('1a có 2 đoạn', count(*) = 2) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1a2 tên người được ghi cùng đoạn', bool_and(talent_name in ('Trúc Như','Thảo')) and count(distinct talent_name) = 2) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1b trợ chính = Trúc Như (120 phút > 30 phút)', co_host_id = 'c0000000-0000-0000-0000-000000000001' and co_host_name = 'Trúc Như')
  from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1c host không đụng (vai không có đoạn)', host_id = 'c0000000-0000-0000-0000-000000000003')
  from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';

-- ============ 2) Từ chối đầu vào sai ============
select pg_temp.must_fail('2a đoạn vượt quá ca (150 phút)',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":151}]'::jsonb)$q$, 'nằm trong ca');
select pg_temp.must_fail('2b cùng vai chồng giờ',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":100},{"talent_id":"c0000000-0000-0000-0000-000000000002","role":"co_host","from_min":90,"to_min":150}]'::jsonb)$q$, 'chồng giờ');
select pg_temp.must_fail('2c một người hai vai cùng lúc',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":100},{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"host","from_min":50,"to_min":150}]'::jsonb)$q$, 'chồng giờ');
select pg_temp.must_fail('2d vai sai',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"boss","from_min":0,"to_min":10}]'::jsonb)$q$, 'vai');
select pg_temp.must_fail('2e talent không tồn tại',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-0000000000ff","role":"co_host","from_min":0,"to_min":10}]'::jsonb)$q$, 'không tồn tại');
select pg_temp.chk('2f lần ghi hỏng không làm mất đoạn cũ', count(*) = 2) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('2g khoảng trống giữa hai đoạn cùng vai được phép',
  (select (set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":60},{"talent_id":"c0000000-0000-0000-0000-000000000002","role":"co_host","from_min":90,"to_min":150}]'::jsonb) ->> 'segments')::int = 2));

-- ============ 3) Host đổi giữa ca ============
select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000002', 'role', 'host', 'from_min', 60, 'to_min', 150)));
select pg_temp.chk('3a host chính = Thảo (90 phút)', host_id = 'c0000000-0000-0000-0000-000000000002')
  from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';

-- ============ 4) Ca có đoạn không dời giờ ============
select pg_temp.must_fail('4a dời giờ ca có đoạn',
  $q$update live_sessions set end_time = '18:00' where id = 'd0000000-0000-0000-0000-000000000001'$q$, 'chia người theo đoạn giờ');
update live_sessions set title = 'x' where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('4b đổi title không bị chặn', title = 'x') from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';

-- ============ 5) Xoá hết đoạn = về cách tính cũ, dời giờ lại được ============
select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', '[]'::jsonb);
select pg_temp.chk('5a hết đoạn', count(*) = 0) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001';
update live_sessions set end_time = '18:00' where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('5b dời giờ được sau khi xoá đoạn', end_time = '18:00') from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';

-- ============ 6) Ca qua đêm: độ dài tính đúng ============
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status)
values ('d0000000-0000-0000-0000-000000000002', 'qua đêm', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 6, '21:00', '00:30', 'Upcoming');
select pg_temp.chk('6a đoạn 0-210 trong ca 21:00-00:30',
  (select (set_session_staff_segments('d0000000-0000-0000-0000-000000000002', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":210}]'::jsonb) ->> 'duration_min')::int = 210));
select pg_temp.must_fail('6b 211 phút vượt ca qua đêm',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000002', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":211}]'::jsonb)$q$, 'nằm trong ca');

-- ============ 7) Đóng sổ tháng đã phát hành ============
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status)
values ('d0000000-0000-0000-0000-000000000003', 'tháng đóng', 'b0000000-0000-0000-0000-00000000000a', 'VERA', date '2026-06-25', '15:00', '17:30', 'Completed');
insert into brand_monthly_reports (brand_id, period_month, status, published_at) values ('b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'published', now());
select pg_temp.must_fail('7a tháng đã phát hành bị chặn',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000003', '[{"talent_id":"c0000000-0000-0000-0000-000000000001","role":"co_host","from_min":0,"to_min":60}]'::jsonb)$q$, 'đã phát hành');

-- ============ 8) Quyền ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
select pg_temp.must_fail('8a talent không gọi được RPC',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000002', '[]'::jsonb)$q$, 'Chỉ CEO');
select pg_temp.must_fail('8b talent không ghi thẳng vào bảng',
  $q$insert into session_staff_segments (session_id, talent_id, role, from_min, to_min) values ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', 'host', 0, 10)$q$, 'permission denied');
reset role;
-- đặt đoạn của Thảo (talent 2) và Trúc Như để kiểm đọc theo chính chủ
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select set_session_staff_segments('d0000000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000001', 'role', 'co_host', 'from_min', 0, 'to_min', 100),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000002', 'role', 'co_host', 'from_min', 100, 'to_min', 210)));
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
-- 0147 mở rộng: talent đứng ca thấy ĐỦ đoạn của ca đó (để trợ biết lúc host đổi). Trước 0147: chỉ đoạn của mình.
select pg_temp.chk('8c talent chỉ đọc đoạn của chính mình (sau 0147: đoạn của ca mình đứng)',
  case when to_regprocedure('private.talent_on_session(uuid)') is null
       then count(*) = 1 and bool_and(talent_id = 'c0000000-0000-0000-0000-000000000002')
       else count(*) >= 1 and bool_or(talent_id = 'c0000000-0000-0000-0000-000000000002') end) from session_staff_segments;
reset role;
set role anon;
select pg_temp.must_fail('8d anon không đọc được', $q$select count(*) from session_staff_segments$q$, 'permission denied');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;
select pg_temp.chk('8e admin đọc hết', count(*) = 2) from session_staff_segments;
reset role;

-- ============ 9) Xoá ca kéo theo xoá đoạn ============
delete from live_sessions where id = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.chk('9a xoá ca ⇒ hết đoạn', count(*) = 0) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000002';

-- ============ 10) Lưới gán host hàng loạt không ghi đè ca đã chia đoạn ============
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status)
values ('d0000000-0000-0000-0000-000000000004', 'chia đoạn', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 7, '10:00', '13:00', 'c0000000-0000-0000-0000-000000000003', 'Khánh Linh', 'Upcoming'),
       ('d0000000-0000-0000-0000-000000000005', 'không chia', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 7, '14:00', '17:00', 'c0000000-0000-0000-0000-000000000003', 'Khánh Linh', 'Upcoming');
select set_session_staff_segments('d0000000-0000-0000-0000-000000000004', '[{"talent_id":"c0000000-0000-0000-0000-000000000003","role":"host","from_min":0,"to_min":90},{"talent_id":"c0000000-0000-0000-0000-000000000002","role":"host","from_min":90,"to_min":180}]'::jsonb);
select pg_temp.chk('10a bulk_assign trả 1 (chỉ ca không chia)',
  bulk_assign_session_hosts(jsonb_build_array(
    jsonb_build_object('session_id', 'd0000000-0000-0000-0000-000000000004', 'host_id', 'c0000000-0000-0000-0000-000000000001', 'co_host_id', null),
    jsonb_build_object('session_id', 'd0000000-0000-0000-0000-000000000005', 'host_id', 'c0000000-0000-0000-0000-000000000001', 'co_host_id', null))) = 1);
select pg_temp.chk('10b ca chia đoạn giữ người chính cũ, ca thường đổi', 
  (select host_id from live_sessions where id = 'd0000000-0000-0000-0000-000000000004') = 'c0000000-0000-0000-0000-000000000003'
  and (select host_id from live_sessions where id = 'd0000000-0000-0000-0000-000000000005') = 'c0000000-0000-0000-0000-000000000001');
