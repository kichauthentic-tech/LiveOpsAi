-- Kiểm migration 0169 (talent bấm "Đã nhận" lịch ca). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0169.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay CHƯA có 0169 thì phải đỏ ngay mục 1.
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
  ('a0000000-0000-0000-0000-000000000002', 'host@t'),
  ('a0000000-0000-0000-0000-000000000003', 'tro@t'),
  ('a0000000-0000-0000-0000-000000000004', 'brand@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng'),
  ('c0000000-0000-0000-0000-000000000002', 'Trà Giang'),
  ('c0000000-0000-0000-0000-000000000003', 'Thái Toàn');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('a0000000-0000-0000-0000-000000000002', 'Host', 'host@t', 'talent', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'Tro', 'tro@t', 'talent', 'c0000000-0000-0000-0000-000000000002')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a0000000-0000-0000-0000-000000000004', 'Brand', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = 'brand';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ca 1: host Sỹ Hùng, trợ Trà Giang. Ca 2: chỉ Thái Toàn. Ca 3: đã huỷ, host Sỹ Hùng.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, co_host_id, co_host_name, status) values
  ('d1690000-0000-0000-0000-000000000001', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 2, '10:00', '13:00',
   'c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'c0000000-0000-0000-0000-000000000002', 'Trà Giang', 'Upcoming'),
  ('d1690000-0000-0000-0000-000000000002', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 2, '14:00', '16:00',
   'c0000000-0000-0000-0000-000000000003', 'Thái Toàn', null, '', 'Upcoming'),
  ('d1690000-0000-0000-0000-000000000003', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 3, '10:00', '13:00',
   'c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng', null, '', 'Cancelled');

-- ============ 1) Talent nhận: chỉ ca của mình, bỏ ca huỷ ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('1a host nhận 3 id ⇒ chỉ ghi 1 (ca 2 không phải của mình, ca 3 đã huỷ)',
  ack_my_shifts(array['d1690000-0000-0000-0000-000000000001', 'd1690000-0000-0000-0000-000000000002', 'd1690000-0000-0000-0000-000000000003']::uuid[]) = 1);
select pg_temp.chk('1b dòng ghi đúng giờ lúc nhận',
  (select acked_date = current_date + 2 and acked_start = '10:00' and acked_end = '13:00' from shift_acks
    where session_id = 'd1690000-0000-0000-0000-000000000001' and talent_id = 'c0000000-0000-0000-0000-000000000001'));
select pg_temp.chk('1c nhận lại cùng ca = cập nhật, không nhân dòng',
  ack_my_shifts(array['d1690000-0000-0000-0000-000000000001']::uuid[]) = 1
  and (select count(*) from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001') = 1);
select pg_temp.chk('1d mảng null không lỗi', ack_my_shifts(null) = 0);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.chk('1e trợ nhận ca 1', ack_my_shifts(array['d1690000-0000-0000-0000-000000000001']::uuid[]) = 1);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.must_fail('1f admin không có hồ sơ talent ⇒ chặn',
  $q$select ack_my_shifts(array['d1690000-0000-0000-0000-000000000002']::uuid[])$q$, 'chưa gắn');

-- ============ 2) RLS đọc ============
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('2a talent chỉ thấy dòng của mình', (select count(*) from shift_acks) = 1
  and (select bool_and(talent_id = 'c0000000-0000-0000-0000-000000000001') from shift_acks));
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
select pg_temp.chk('2b brand không thấy gì', (select count(*) from shift_acks) = 0);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.chk('2c admin thấy hết', (select count(*) from shift_acks) = 2);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.must_fail('2d talent không ghi thẳng vào bảng',
  $q$insert into shift_acks (session_id, talent_id, acked_date, acked_start, acked_end) values ('d1690000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003', current_date, '10:00', '11:00')$q$,
  'permission denied');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- ============ 3) Đổi giờ: dòng còn, giờ cũ giữ để client so ============
update live_sessions set start_time = '11:00', end_time = '14:00' where id = 'd1690000-0000-0000-0000-000000000001';
select pg_temp.chk('3a đổi giờ không xoá dòng nhận (client tự thấy lệch)',
  (select count(*) = 2 and bool_and(acked_start = '10:00') from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001'));

-- ============ 4) Rút người ⇒ xoá dòng của người đó, giữ người còn lại ============
update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000003', co_host_name = 'Thái Toàn' where id = 'd1690000-0000-0000-0000-000000000001';
select pg_temp.chk('4a trợ bị thay ⇒ dòng của trợ cũ bị xoá, host giữ',
  (select array_agg(talent_id::text order by talent_id) = array['c0000000-0000-0000-0000-000000000001'] from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001'));

-- ============ 5) Đoạn giờ (0138): xoá-rồi-chèn lại trong một lệnh không làm mất dòng của người chỉ có ở đoạn ============
-- Trà Giang quay lại ca 1 dưới dạng một đoạn trợ (0–60'), Thái Toàn đoạn còn lại (60–180').
select set_session_staff_segments('d1690000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'co_host', 'from_min', 60, 'to_min', 180),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000002', 'role', 'co_host', 'from_min', 0, 'to_min', 60)));
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.chk('5a người chỉ có ở đoạn nhận được ca', ack_my_shifts(array['d1690000-0000-0000-0000-000000000001']::uuid[]) = 1);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
-- Ghi lại y nguyên đoạn (RPC xoá hết rồi chèn lại).
select set_session_staff_segments('d1690000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'co_host', 'from_min', 60, 'to_min', 180),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000002', 'role', 'co_host', 'from_min', 0, 'to_min', 60)));
select pg_temp.chk('5b ghi lại đoạn y nguyên ⇒ dòng của Trà Giang còn',
  exists (select 1 from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001' and talent_id = 'c0000000-0000-0000-0000-000000000002'));
-- Bỏ đoạn của Trà Giang.
select set_session_staff_segments('d1690000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'co_host', 'from_min', 0, 'to_min', 180)));
select pg_temp.chk('5c bỏ đoạn của Trà Giang ⇒ dòng của Trà Giang bị xoá',
  not exists (select 1 from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001' and talent_id = 'c0000000-0000-0000-0000-000000000002'));

-- ============ 6) Xoá ca ⇒ dòng đi theo ============
delete from live_sessions where id = 'd1690000-0000-0000-0000-000000000001';
select pg_temp.chk('6a xoá ca xoá dòng nhận', (select count(*) from shift_acks where session_id = 'd1690000-0000-0000-0000-000000000001') = 0);
