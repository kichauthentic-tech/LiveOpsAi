-- Kiểm migration 0178 (sửa ca theo trường, đóng ca không vấp trùng người cũ, quyền theo đoạn người, nhắc giao ca đúng người).
-- Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0178. Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay
-- CHƯA có 0178 thì phải đỏ (mục 1: hàm update_session_fields chưa có; mục 2: complete_past_sessions vấp cặp trùng).
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'), ('a0000000-0000-0000-0000-000000000005', 'tro@t')
  on conflict do nothing;
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng'), ('c0000000-0000-0000-0000-000000000002', 'Thái Toàn'),
  ('c0000000-0000-0000-0000-000000000003', 'Triệu Vương'), ('c0000000-0000-0000-0000-000000000004', 'Minh Phú')
  on conflict do nothing;
insert into profiles (id, name, email, role, assigned_talent_id, status) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin', null, 'Active'),
  ('a0000000-0000-0000-0000-000000000005', 'Thái Toàn', 'tro@t', 'talent', 'c0000000-0000-0000-0000-000000000002', 'Active')
  on conflict (id) do update set role = excluded.role, assigned_talent_id = excluded.assigned_talent_id, status = excluded.status;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS'), ('b0000000-0000-0000-0000-00000000000b', 'JOCKEY')
  on conflict do nothing;
insert into brand_channels (brand_id, platform) select b.id, 'TikTok' from brands b where b.id in ('b0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b')
  on conflict do nothing;
insert into studios (id, name) values ('e0000000-0000-0000-0000-000000000001', 'CROCS'), ('e0000000-0000-0000-0000-000000000002', 'Phòng 2')
  on conflict do nothing;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);

-- Ca tương lai CROCS 12–15: host Sỹ Hùng, trợ Triệu Vương, phòng CROCS.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, co_host_id, co_host_name,
                           studio_id, studio_name, status, platform)
values ('d0000000-0000-0000-0000-000000000001', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 3, '12:00', '15:00',
        'c0000000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'c0000000-0000-0000-0000-000000000003', 'Triệu Vương',
        'e0000000-0000-0000-0000-000000000001', 'CROCS', 'Upcoming', 'TikTok');

-- ============ 1) Sửa ca chỉ ghi trường có trong patch ============
-- Máy khác vừa đổi trợ sang Thái Toàn; bản client cũ chỉ đổi phòng ⇒ trợ phải giữ Thái Toàn (B1/B4).
update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000002', co_host_name = 'Thái Toàn'
 where id = 'd0000000-0000-0000-0000-000000000001';
select update_session_fields('d0000000-0000-0000-0000-000000000001', '{"studio_id":"e0000000-0000-0000-0000-000000000002","studio_name":"Phòng 2"}');
select pg_temp.chk('1a đổi phòng không trả trợ về người cũ',
  (select co_host_id = 'c0000000-0000-0000-0000-000000000002' and studio_id = 'e0000000-0000-0000-0000-000000000002' and studio_name = 'Phòng 2'
     from live_sessions where id = 'd0000000-0000-0000-0000-000000000001'));
select update_session_fields('d0000000-0000-0000-0000-000000000001', '{"co_host_id":"","co_host_name":""}');
select pg_temp.chk('1b khoá có mặt mà rỗng = bỏ trợ',
  (select co_host_id is null and host_id = 'c0000000-0000-0000-0000-000000000001' from live_sessions where id = 'd0000000-0000-0000-0000-000000000001'));
select update_session_fields('d0000000-0000-0000-0000-000000000001', '{"start_time":"13:00","end_time":"16:00"}');
select pg_temp.chk('1c dời giờ ghi đúng giờ, giữ ngày + người',
  (select start_time = '13:00' and end_time = '16:00' and date = current_date + 3 and host_id = 'c0000000-0000-0000-0000-000000000001'
     from live_sessions where id = 'd0000000-0000-0000-0000-000000000001'));

-- ============ 2) Đóng ca quá giờ không vấp cặp trùng người cũ (B3) ============
-- Hôm qua: Minh Phú JOCKEY 11–13 (cờ giữ trùng 0160) + CROCS 12–15 (không cờ) + một ca không liên quan.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform, allow_person_clash) values
  ('d0000000-0000-0000-0000-000000000011', 'JOCKEY', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date - 1, '11:00', '13:00',
   'c0000000-0000-0000-0000-000000000004', 'Upcoming', 'TikTok', false),
  ('d0000000-0000-0000-0000-000000000013', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 1, '20:00', '23:00',
   null, 'Upcoming', 'TikTok', false);
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform, allow_person_clash) values
  ('d0000000-0000-0000-0000-000000000012', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 1, '12:00', '15:00',
   'c0000000-0000-0000-0000-000000000004', 'Upcoming', 'TikTok', true);
select pg_temp.chk('2a complete_past_sessions chạy được dù có cặp trùng', complete_past_sessions() >= 3);
select pg_temp.chk('2b cả 3 ca hôm qua đã Completed',
  (select count(*) = 3 from live_sessions where id in ('d0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000013') and status = 'Completed'));

-- ============ 3) Người đứng ca theo đoạn được up file; nhắc giao ca gửi trợ đứng cuối ca (B2) ============
-- Ca tương lai 18–21: trợ chính Triệu Vương; chia đoạn: Vương 0–60', Thái Toàn 60–180'.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, co_host_id, status, platform) values
  ('d0000000-0000-0000-0000-000000000021', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 4, '18:00', '21:00',
   'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Upcoming', 'TikTok');
insert into session_staff_segments (session_id, talent_id, role, from_min, to_min) values
  ('d0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000003', 'co_host', 0, 60),
  ('d0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000002', 'co_host', 60, 180),
  ('d0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000001', 'host', 0, 180);
select pg_temp.chk('3a nhắc giao ca gửi trợ đứng đoạn cuối (Thái Toàn)',
  (select count(*) = 1 from notifications n where n.session_id = 'd0000000-0000-0000-0000-000000000021' and n.kind = 'handover_due'
     and n.user_id = 'a0000000-0000-0000-0000-000000000005'));

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
set local role authenticated;
select pg_temp.chk('3b trợ theo đoạn được up file ca đó', can_edit_session_snapshot('d0000000-0000-0000-0000-000000000021'));
select pg_temp.chk('3c không được up file ca không đứng', not can_edit_session_snapshot('d0000000-0000-0000-0000-000000000001'));
reset role;

-- ============ 4) live_evidence cho brand: biết ca có diễn ra, KHÔNG thấy số tháng chưa phát hành ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000009', 'brand@t') on conflict do nothing;
insert into profiles (id, name, email, role, assigned_brand_id, status) values
  ('a0000000-0000-0000-0000-000000000009', 'Brand CROCS', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a', 'Active')
  on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform, actual_gmv, data_source) values
  ('d0000000-0000-0000-0000-000000000031', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 2, '09:00', '11:00',
   null, 'Completed', 'TikTok', 12000000, 'tiktok_reconciled'),
  ('d0000000-0000-0000-0000-000000000032', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 2, '15:00', '17:00',
   null, 'Completed', 'TikTok', 0, 'manual');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', true);
set local role authenticated;
select pg_temp.chk('4a brand: ca có số ⇒ live_evidence true, GMV vẫn bị che',
  (select live_evidence and actual_gmv is null and month_published = false from live_sessions_secure where id = 'd0000000-0000-0000-0000-000000000031'));
select pg_temp.chk('4b brand: ca quá giờ không bằng chứng ⇒ live_evidence false',
  (select live_evidence = false from live_sessions_secure where id = 'd0000000-0000-0000-0000-000000000032'));
reset role;

rollback;
