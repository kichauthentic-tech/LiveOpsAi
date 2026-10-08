-- Kiểm 0157 (đánh dấu room inhouse) + 0158 (up lại file cùng kỳ = thay lô đối soát cũ). Chạy trên bản REPLAY SAU 0158.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.must_fail(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'FAIL % : lỗi khác mong đợi: %', label, sqlerrm; end if;
    raise notice 'OK  % (chặn)', label;
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
delete from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
delete from brand_inhouse_rooms where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
delete from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
delete from brands where id = 'b0000000-0000-0000-0000-0000000000c7';
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000c7', 'IH57');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- 0157
select pg_temp.chk('1a đánh dấu 2 room inhouse',
  mark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', 'TikTok', jsonb_build_array(
    jsonb_build_object('room_id', 'rA', 'started_at', '2026-09-10T06:00:00Z', 'ended_at', '2026-09-10T08:00:00Z', 'gmv', 1000, 'orders', 2),
    jsonb_build_object('room_id', 'rB', 'started_at', '2026-09-11T06:00:00Z', 'ended_at', '2026-09-11T08:00:00Z', 'gmv', 500, 'orders', 1))) = 2);
select pg_temp.chk('1b đánh dấu lại không nhân đôi', mark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', 'TikTok',
  jsonb_build_array(jsonb_build_object('room_id', 'rA', 'started_at', '2026-09-10T06:00:00Z', 'ended_at', '2026-09-10T08:00:00Z', 'gmv', 1200))) = 1
  and (select count(*) from brand_inhouse_rooms where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 2);
select pg_temp.chk('1c room đã thành ca thì không đánh dấu inhouse', (
  create_backfill_sessions('b0000000-0000-0000-0000-0000000000c7', jsonb_build_array(
    jsonb_build_object('room_id', 'rC', 'started_at', '2026-09-12T06:00:00Z', 'ended_at', '2026-09-12T08:00:00Z', 'gmv', 10)))->>'inserted')::int = 1
  and mark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', 'TikTok', jsonb_build_array(jsonb_build_object('room_id', 'rC'))) = 0);
select pg_temp.chk('1d bỏ nhãn trả 1', unmark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', array['rA']) = 1);
select pg_temp.chk('1e còn đúng 1 room inhouse', (select count(*) from brand_inhouse_rooms where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 1);

-- 0158
create temp table _b on commit preserve rows as select 1 as n;
select pg_temp.chk('2a up lần 1 cho kỳ 01–30/09', import_live_reconciliation('f1.xlsx', 'T9', '2026-09-01', '2026-09-30',
  jsonb_build_array(jsonb_build_object('roomId', 'x1', 'startedAt', '2026-09-20T01:00:00Z', 'endedAt', '2026-09-20T02:00:00Z', 'gmv', 1)),
  'b0000000-0000-0000-0000-0000000000c7', 'TikTok') is not null);
select import_live_reconciliation('f2.xlsx', 'T9', '2026-09-01', '2026-09-30',
    jsonb_build_array(jsonb_build_object('roomId', 'x1', 'startedAt', '2026-09-20T01:00:00Z', 'endedAt', '2026-09-20T02:00:00Z', 'gmv', 2),
                      jsonb_build_object('roomId', 'x2', 'startedAt', '2026-09-21T01:00:00Z', 'endedAt', '2026-09-21T02:00:00Z', 'gmv', 3)),
    'b0000000-0000-0000-0000-0000000000c7', 'TikTok');
select pg_temp.chk('2b up lại cùng kỳ ⇒ vẫn đúng 1 lô, là lô mới',
  (select count(*) from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 1
  and (select file_name from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 'f2.xlsx'
  and (select count(*) from live_reconciliation_rows rr join live_reconciliation_batches b on b.id = rr.batch_id
        where b.brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 2);
select import_live_reconciliation('f3.xlsx', 'T10', '2026-10-01', '2026-10-08', '[]'::jsonb, 'b0000000-0000-0000-0000-0000000000c7', 'TikTok');
select pg_temp.chk('2c kỳ khác ⇒ lô riêng', (select count(*) from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 2);
select import_live_reconciliation('f4.xlsx', 'T9', '2026-09-01', '2026-09-30', '[]'::jsonb, 'b0000000-0000-0000-0000-0000000000c7', 'Shopee');
select pg_temp.chk('2d sàn khác cùng kỳ ⇒ lô riêng', (select count(*) from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7') = 3);

-- 0159: rổ đối soát theo kịp ca nạp bù / xoá ca nạp bù / nhãn inhouse
delete from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
delete from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
delete from brand_inhouse_rooms where brand_id = 'b0000000-0000-0000-0000-0000000000c7';
select import_live_reconciliation('g.xlsx', 'T9', '2026-09-01', '2026-09-30',
  jsonb_build_array(
    jsonb_build_object('roomId', 'u1', 'startedAt', '2026-09-20T01:00:00Z', 'endedAt', '2026-09-20T03:00:00Z', 'gmv', 100),
    jsonb_build_object('roomId', 'u2', 'startedAt', '2026-09-21T01:00:00Z', 'endedAt', '2026-09-21T03:00:00Z', 'gmv', 200)),
  'b0000000-0000-0000-0000-0000000000c7', 'TikTok');
select pg_temp.chk('3a cả 2 dòng ở rổ unassigned', (select count(*) from live_reconciliation_rows where bucket = 'unassigned' and batch_id in
  (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7')) = 2);
select create_backfill_sessions('b0000000-0000-0000-0000-0000000000c7', jsonb_build_array(
  jsonb_build_object('room_id', 'u1', 'started_at', '2026-09-20T01:00:00Z', 'ended_at', '2026-09-20T03:00:00Z', 'gmv', 100)));
select pg_temp.chk('3b sinh ca bù từ u1 ⇒ dòng u1 sang agency, gắn đúng 1 ca', (select bucket = 'agency' and cardinality(matched_session_ids) = 1
  from live_reconciliation_rows where room_id = 'u1' and batch_id in (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7')));
select pg_temp.chk('3c dòng u2 vẫn unassigned', (select bucket from live_reconciliation_rows where room_id = 'u2' and batch_id in
  (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7')) = 'unassigned');
select mark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', 'TikTok', jsonb_build_array(jsonb_build_object('room_id', 'u2', 'gmv', 200)));
select pg_temp.chk('3d đánh dấu inhouse ⇒ dòng u2 sang inhouse', (select bucket from live_reconciliation_rows where room_id = 'u2' and batch_id in
  (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7')) = 'inhouse');
select unmark_inhouse_rooms('b0000000-0000-0000-0000-0000000000c7', array['u2']);
select pg_temp.chk('3e bỏ nhãn ⇒ u2 về unassigned', (select bucket from live_reconciliation_rows where room_id = 'u2' and batch_id in
  (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7')) = 'unassigned');
select delete_backfill_session((select id from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000c7' and tiktok_room_id = 'u1'));
select pg_temp.chk('3f xoá ca bù ⇒ u1 về unassigned, không còn ca', (select bucket = 'unassigned' and cardinality(matched_session_ids) = 0
  from live_reconciliation_rows where room_id = 'u1' and batch_id in (select id from live_reconciliation_batches where brand_id = 'b0000000-0000-0000-0000-0000000000c7'))
  and not exists (select 1 from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000c7'));
insert into live_sessions (title, brand_id, brand_name, platform, date, start_time, end_time, status, is_backfill)
  values ('thường', 'b0000000-0000-0000-0000-0000000000c7', 'IH57', 'TikTok', '2026-09-22', '10:00', '12:00', 'Upcoming', false);
select pg_temp.must_fail('3g ca không phải nạp bù không xoá được', format('select delete_backfill_session(%L)', (select id from live_sessions where title = 'thường' and brand_id = 'b0000000-0000-0000-0000-0000000000c7')), 'ca do nạp bù');
