-- Kiểm migration 0170 (Phòng Điều Hành: ca nháp + khả năng về đích cho brand). Chạy trên bản REPLAY cả chuỗi (README.md)
-- SAU khi nạp 0170. Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0170 thì phải đỏ ngay (bảng/hàm chưa có).
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

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

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'), ('a0000000-0000-0000-0000-000000000002', 'ops@t'),
  ('a0000000-0000-0000-0000-000000000003', 'brand@t'), ('a0000000-0000-0000-0000-000000000004', 'brand2@t')
  on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA'), ('b0000000-0000-0000-0000-00000000000b', 'KHAC') on conflict do nothing;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin', null),
  ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations', null),
  ('a0000000-0000-0000-0000-000000000003', 'Brand', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a'),
  ('a0000000-0000-0000-0000-000000000004', 'Brand2', 'brand2@t', 'brand', 'b0000000-0000-0000-0000-00000000000b')
  on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;
insert into brand_channels (brand_id, platform) values
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok'), ('b0000000-0000-0000-0000-00000000000b', 'TikTok') on conflict do nothing;
insert into talents (id, name, role) values
  ('d0000000-0000-0000-0000-000000000001', 'Host A', 'Host'), ('d0000000-0000-0000-0000-000000000002', 'Tro B', 'Assistant'),
  ('d0000000-0000-0000-0000-000000000003', 'Host C', 'Host')
  on conflict do nothing;
insert into studios (id, name) values ('e0000000-0000-0000-0000-000000000001', 'VERA TTS') on conflict do nothing;

create temp table t_ctx as select (now() at time zone 'Asia/Ho_Chi_Minh')::date as today;
grant select on t_ctx to authenticated;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);  -- ops
set local role authenticated;

-- 1) Ops tạo ca nháp qua bảng (RLS cho phép); brand thì không thấy
insert into session_drafts (id, brand_id, platform, date, start_time, end_time, host_id, co_host_id, studio_id, expected_gmv, reason) values
  ('f0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select today from t_ctx) + 3, '10:00', '13:00',
   'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001', 5000000, '+5 điểm'),
  ('f0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select today from t_ctx) + 4, '20:00', '23:00',
   'd0000000-0000-0000-0000-000000000001', null, null, 4000000, '');
select pg_temp.chk('1. ops tạo được ca nháp', (select count(*) from session_drafts) = 2);
select pg_temp.must_fail('1b. kênh chưa tạo bị chặn', $q$insert into session_drafts (brand_id, platform, date, start_time, end_time) values ('b0000000-0000-0000-0000-00000000000b', 'Shopee', current_date + 3, '10:00', '13:00')$q$, '');
select pg_temp.must_fail('1c. host = trợ bị chặn', $q$insert into session_drafts (brand_id, platform, date, start_time, end_time, host_id, co_host_id) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', current_date + 3, '10:00', '13:00', 'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')$q$, 'session_drafts_people_check');

reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);  -- brand
set local role authenticated;
select pg_temp.chk('2. brand không đọc được ca nháp', (select count(*) from session_drafts) = 0);
select pg_temp.must_fail('2b. brand không xác nhận được', $q$select accept_session_draft('f0000000-0000-0000-0000-000000000001', current_date + 3, '10:00', '13:00', 'd0000000-0000-0000-0000-000000000001')$q$, 'Chỉ ceo/operations/admin');

reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);  -- ops
set local role authenticated;

-- 3) Xác nhận (sửa giờ 10:00 → 10:30): sinh shift_slot finalized + live_sessions đúng người, ca nháp accepted
select pg_temp.chk('3. xác nhận trả id ca', accept_session_draft('f0000000-0000-0000-0000-000000000001', (select today from t_ctx) + 3, '10:30', '13:30',
  'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000001') is not null);
select pg_temp.chk('3b. ca nháp chuyển accepted, giữ giờ đã sửa, gắn slot + ca',
  (select status = 'accepted' and start_time = '10:30' and shift_slot_id is not null and session_id is not null from session_drafts where id = 'f0000000-0000-0000-0000-000000000001'));
reset role;  -- đọc bảng gốc bằng quyền chủ (replay không cấp select live_sessions cho authenticated)
select pg_temp.chk('3c. ca thật có đúng host, trợ, phòng, giờ',
  (select count(*) from live_sessions s join session_drafts d on d.session_id = s.id
    where d.id = 'f0000000-0000-0000-0000-000000000001' and s.host_id = 'd0000000-0000-0000-0000-000000000001'
      and s.co_host_id = 'd0000000-0000-0000-0000-000000000002' and s.start_time = '10:30' and s.studio_id = 'e0000000-0000-0000-0000-000000000001') = 1);
select pg_temp.chk('3d. shift_slot của ca nháp đã finalized',
  (select status = 'finalized' from shift_slots where id = (select shift_slot_id from session_drafts where id = 'f0000000-0000-0000-0000-000000000001')));
set local role authenticated;
select pg_temp.must_fail('3e. xác nhận lần hai bị chặn', $q$select accept_session_draft('f0000000-0000-0000-0000-000000000001', current_date + 3, '10:30', '13:30', 'd0000000-0000-0000-0000-000000000001')$q$, 'đã được xử lý');

-- 4) Trùng người: Host A đã có ca 10:30–13:30 ngày +3 ⇒ ca nháp 2 dời sang cùng giờ phải bị chặn và rollback cả lần xác nhận
select pg_temp.must_fail('4. trùng người bị chặn', format($q$select accept_session_draft('f0000000-0000-0000-0000-000000000002', %L, '11:00', '14:00', 'd0000000-0000-0000-0000-000000000001')$q$, (select today from t_ctx) + 3), '');
reset role;
select pg_temp.chk('4b. sau khi bị chặn: ca nháp vẫn draft, không sinh slot mồ côi',
  (select status = 'draft' and shift_slot_id is null from session_drafts where id = 'f0000000-0000-0000-0000-000000000002')
  and (select count(*) from shift_slots where notes = 'Ca thêm từ Phòng Điều Hành') = 1);
set local role authenticated;
select pg_temp.must_fail('4c. ngày đã qua bị chặn', format($q$select accept_session_draft('f0000000-0000-0000-0000-000000000002', %L, '20:00', '23:00', 'd0000000-0000-0000-0000-000000000003')$q$, (select today from t_ctx) - 1), 'đã qua');
select pg_temp.must_fail('4d. thiếu host bị chặn', format($q$select accept_session_draft('f0000000-0000-0000-0000-000000000002', %L, '20:00', '23:00', null)$q$, (select today from t_ctx) + 4), 'Chọn Host');

-- 5) Bỏ ca nháp = cập nhật trạng thái
update session_drafts set status = 'dismissed', decided_at = now() where id = 'f0000000-0000-0000-0000-000000000002';
select pg_temp.chk('5. bỏ ca nháp', (select status from session_drafts where id = 'f0000000-0000-0000-0000-000000000002') = 'dismissed');

-- 6) Khả năng về đích cho brand
reset role;
insert into forecast_snapshots (brand_id, platform, month, as_of, kind, p50, lo, hi, actual, target) values
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok', date_trunc('month', (select today from t_ctx))::date, (select today from t_ctx) - 1, 'daily', 1000, 800, 1200, 400, 1000),
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok', date_trunc('month', (select today from t_ctx))::date, (select today from t_ctx), 'daily', 900, 771.84, 1028.16, 500, 1000),
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok', date_trunc('month', (select today from t_ctx))::date, (select today from t_ctx) - 2, 'daily', 500, 500, 500, 500, null),
  ('b0000000-0000-0000-0000-00000000000b', 'TikTok', date_trunc('month', (select today from t_ctx))::date, (select today from t_ctx), 'daily', 1000, 800, 1200, 1100, 1000);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);  -- brand VERA
set local role authenticated;
select pg_temp.chk('6. brand đọc được chuỗi của brand mình (bỏ dòng không có target)',
  (select count(*) from brand_landing_series('b0000000-0000-0000-0000-00000000000a', (select today from t_ctx))) = 2);
select pg_temp.chk('6b. p50 = target ⇒ 50%', (select p_hit from brand_landing_series('b0000000-0000-0000-0000-00000000000a', (select today from t_ctx)) where as_of = (select today from t_ctx) - 1) = 0.5);
select pg_temp.chk('6c. p50 dưới target 1 sigma ⇒ ~15,9%', (select abs(p_hit - 0.1587) < 0.002 from brand_landing_series('b0000000-0000-0000-0000-00000000000a', (select today from t_ctx)) where as_of = (select today from t_ctx)));
select pg_temp.chk('6d. kết quả không có cột GMV', (select count(*) from information_schema.columns where table_name = 'forecast_snapshots') > 0
  and not exists (select 1 from pg_proc p where p.proname = 'brand_landing_series' and pg_get_function_result(p.oid) ~ '(p50|actual|hi|lo)\b'));
select pg_temp.must_fail('6e. brand đọc brand khác bị chặn', $q$select * from brand_landing_series('b0000000-0000-0000-0000-00000000000b', current_date)$q$, 'Không có quyền');
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);  -- brand KHAC: đã vượt target ⇒ 1
set local role authenticated;
select pg_temp.chk('6f. đã vượt target ⇒ 1', (select p_hit from brand_landing_series('b0000000-0000-0000-0000-00000000000b', (select today from t_ctx))) = 1);
reset role;
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select pg_temp.must_fail('6g. phiên không có profile bị chặn', $q$select * from brand_landing_series('b0000000-0000-0000-0000-00000000000a', current_date)$q$, 'Không có quyền');
select pg_temp.chk('6h. phiên không có profile không đọc được ca nháp', (select count(*) from session_drafts) = 0);
reset role;

rollback;
