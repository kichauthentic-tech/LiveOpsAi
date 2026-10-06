-- Kiểm migration 0143 (chặn một người ở hai ca cùng giờ). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0143.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay CHƯA có 0143 thì phải đỏ ngay mục 1.
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
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 110);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

create or replace function pg_temp.must_pass(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise notice 'OK  %', label;
exception when others then
  raise exception 'FAIL % : %', label, sqlerrm;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS'), ('b0000000-0000-0000-0000-00000000000b', 'Franklin');
-- 0149: dòng của kênh chưa tồn tại bị từ chối — tạo đủ kênh cho brand thử (bỏ qua khi replay chưa tới 0149).
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;

insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng'),
  ('c0000000-0000-0000-0000-000000000002', 'Thái Toàn'),
  ('c0000000-0000-0000-0000-000000000003', 'Minh Nhật'),
  ('c0000000-0000-0000-0000-000000000004', 'Đức Duy');

-- Ca gốc: CROCS TikTok 18:00–21:00, host Sỹ Hùng, trợ Thái Toàn (ngày +5)
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, co_host_id, status, platform)
values ('d0000000-0000-0000-0000-000000000001', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 5,
        '18:00', '21:00', 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'TikTok');

-- ============ 1) Thêm ca trùng người bị chặn ============
select pg_temp.must_fail('1a host đã làm host ca khác chồng 2h (20/10 Sỹ Hùng CROCS 18–21 + Franklin 19–22)',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('Franklin', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5, '19:00', '22:00',
             'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'TikTok')$q$, 'Trùng người: Sỹ Hùng đã có ca CROCS TikTok');
select pg_temp.must_fail('1b người làm trợ ca này, làm host ca khác sàn khác cùng giờ',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('Franklin S', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5, '20:00', '23:00',
             'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'Shopee')$q$, 'Thái Toàn');
select pg_temp.must_fail('1c vừa host vừa trợ cùng một ca',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, co_host_id, status, platform)
     values ('JOCKEY', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 6, '11:00', '13:00',
             'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 'Upcoming', 'TikTok')$q$, 'vừa là Host vừa là Trợ live');
select pg_temp.must_fail('1d ca qua đêm hôm trước (21:00–00:30) chồng ca 00:00 hôm sau',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('X', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5, '21:00', '00:30',
             'c0000000-0000-0000-0000-000000000003', 'Upcoming', 'TikTok');
     insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('Y', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 6, '00:00', '02:00',
             'c0000000-0000-0000-0000-000000000003', 'Upcoming', 'TikTok')$q$, 'Minh Nhật');

-- ============ 2) Những gì KHÔNG được chặn ============
select pg_temp.must_pass('2a chạm mép (21:00 bắt đầu khi ca kia kết thúc 21:00)',
  $q$insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('d0000000-0000-0000-0000-000000000002', 'Franklin', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5,
             '21:00', '23:00', 'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'TikTok')$q$);
select pg_temp.must_pass('2b ca nạp bù không bị kiểm',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform, is_backfill)
     values ('cũ', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5, '18:30', '20:00',
             'c0000000-0000-0000-0000-000000000001', 'Completed', 'TikTok', true)$q$);
select pg_temp.must_pass('2c ca đã huỷ không giữ người',
  $q$insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('d0000000-0000-0000-0000-000000000003', 'huỷ', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5,
             '19:00', '20:00', 'c0000000-0000-0000-0000-000000000004', 'Cancelled', 'TikTok')$q$);
select pg_temp.must_pass('2d ca mới không đụng ca đã huỷ',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('ok', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 5, '19:00', '20:00',
             'c0000000-0000-0000-0000-000000000004', 'Upcoming', 'Shopee')$q$);

-- ============ 3) Đổi người / dời giờ ============
select pg_temp.must_fail('3a đổi host ca 19–20 thành Thái Toàn (đang trợ ca 18–21)',
  $q$update live_sessions set host_id = 'c0000000-0000-0000-0000-000000000002' where title = 'ok'$q$, 'Thái Toàn');
select pg_temp.must_fail('3b dời ca 21–23 của Sỹ Hùng sớm 1 giờ ⇒ chồng ca 18–21',
  $q$update live_sessions set start_time = '20:00' where id = 'd0000000-0000-0000-0000-000000000002'$q$, 'Sỹ Hùng');
select pg_temp.must_fail('3c khôi phục ca đã huỷ mà người đã có ca khác cùng giờ',
  $q$update live_sessions set status = 'Upcoming' where id = 'd0000000-0000-0000-0000-000000000003'$q$, 'Đức Duy');

-- Ca trùng có sẵn từ trước (giả lập lịch nạp trước 0143): tắt trigger, chèn, bật lại.
insert into talents (id, name) values ('c0000000-0000-0000-0000-000000000005', 'Vĩnh Thịnh');
alter table live_sessions disable trigger trg_guard_person_clash;
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, co_host_id, status, platform)
values ('d0000000-0000-0000-0000-000000000009', 'trùng sẵn', 'b0000000-0000-0000-0000-00000000000b', 'Franklin', current_date + 5,
        '19:00', '22:00', 'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'TikTok');
alter table live_sessions enable trigger trg_guard_person_clash;
select pg_temp.must_pass('3d ca đang trùng sẵn vẫn sửa được cột khác (tiêu đề)',
  $q$update live_sessions set title = 'đổi tên' where id = 'd0000000-0000-0000-0000-000000000009'$q$);
select pg_temp.must_fail('3e gỡ trùng sang một người cũng bận (Đức Duy host ca 19–20) bị chặn',
  $q$update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000004' where id = 'd0000000-0000-0000-0000-000000000009'$q$, 'Đức Duy');
select pg_temp.must_pass('3f gỡ trùng sang người rảnh',
  $q$update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000005' where id = 'd0000000-0000-0000-0000-000000000009'$q$);

-- ============ 4) Đổi người giữa ca (0138) ============
-- Ca 21–23 (Sỹ Hùng). Ca 9 (19–22) nay trợ Vĩnh Thịnh.
select pg_temp.must_fail('4a đoạn trợ Vĩnh Thịnh 21:00–21:30 chồng ca 9 (19–22)',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000002',
     '[{"talent_id":"c0000000-0000-0000-0000-000000000005","role":"co_host","from_min":0,"to_min":30}]'::jsonb)$q$, 'Vĩnh Thịnh');
select pg_temp.must_pass('4b đoạn trợ Vĩnh Thịnh 22:00–23:00 (chạm mép ca 9) được',
  $q$select set_session_staff_segments('d0000000-0000-0000-0000-000000000002',
     '[{"talent_id":"c0000000-0000-0000-0000-000000000005","role":"co_host","from_min":60,"to_min":120}]'::jsonb)$q$);
update live_sessions set co_host_id = null where id = 'd0000000-0000-0000-0000-000000000009';
select pg_temp.must_pass('4c Vĩnh Thịnh nhận host ca 21:00–21:45 khác: ở ca 21–23 chỉ đứng đoạn 22–23 nên rảnh',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('ngắn', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 5, '21:00', '21:45',
             'c0000000-0000-0000-0000-000000000005', 'Upcoming', 'Shopee')$q$);
