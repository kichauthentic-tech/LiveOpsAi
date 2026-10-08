-- 0159 — RỔ ĐỐI SOÁT THEO KỊP CA NẠP BÙ + XOÁ CA NẠP BÙ (user 09/10).
--
-- (1) Rổ "Chưa gán nhãn" của Đối soát chỉ tính MỘT LẦN lúc up file (matched_session_ids). Sinh ca nạp bù từ chính các phiên đó
--     xong, rổ vẫn đứng yên ⇒ phiên vẫn "chưa gán nhãn" dù đã có ca. Nay:
--       - ca nạp bù (is_backfill) được tạo / đổi mã room  ⇒ các dòng đối soát cùng brand + sàn + room_id chưa là inhouse được gắn
--         vào ca đó; dòng 'unassigned' chuyển sang 'agency' (số của ca đã là số cuối từ file nên "Áp dụng lại" ra đúng số cũ).
--       - ca bị xoá ⇒ gỡ id khỏi dòng; dòng không còn ca nào quay về 'unassigned' (room lại sinh ca bù được).
--       - room được đánh dấu inhouse (0157) ⇒ dòng 'unassigned' cùng room sang 'inhouse'; bỏ nhãn ⇒ về 'unassigned'.
-- (2) delete_backfill_session: xoá ca do nạp bù sinh ra (nạp nhầm / room là inhouse) ngay ở lưới gán host. Chỉ ca is_backfill;
--     ca lịch/kế hoạch/giao ca thật không xoá được bằng đường này.
-- Chạy lại nhiều lần được. Tính cho các dòng đang có: bước backfill cuối file.

create or replace function sync_recon_rows_with_backfill_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rooms text[];
begin
  v_rooms := coalesce(new.live_room_ids, '{}'::text[])
             || case when new.tiktok_room_id is null then '{}'::text[] else array[new.tiktok_room_id] end;
  if cardinality(v_rooms) = 0 then return new; end if;
  update live_reconciliation_rows rr set
    matched_session_ids = rr.matched_session_ids || new.id,
    bucket = case when rr.bucket = 'unassigned' then 'agency' else rr.bucket end
  from live_reconciliation_batches b
  where b.id = rr.batch_id
    and b.brand_id = new.brand_id
    and b.platform = new.platform::text
    and rr.room_id = any(v_rooms)
    and rr.bucket <> 'inhouse'
    and not (rr.matched_session_ids @> array[new.id]);
  return new;
end;
$$;

drop trigger if exists trg_sync_recon_rows_backfill on live_sessions;
create trigger trg_sync_recon_rows_backfill
  after insert or update of tiktok_room_id, live_room_ids on live_sessions
  for each row when (new.is_backfill)
  execute function sync_recon_rows_with_backfill_session();

create or replace function drop_session_from_recon_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update live_reconciliation_rows rr set
    matched_session_ids = array_remove(rr.matched_session_ids, old.id),
    bucket = case when cardinality(array_remove(rr.matched_session_ids, old.id)) = 0 and rr.bucket in ('agency', 'review')
                  then 'unassigned' else rr.bucket end
  where rr.matched_session_ids @> array[old.id];
  return old;
end;
$$;

drop trigger if exists trg_drop_session_from_recon_rows on live_sessions;
create trigger trg_drop_session_from_recon_rows
  after delete on live_sessions
  for each row execute function drop_session_from_recon_rows();

create or replace function sync_recon_rows_with_inhouse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update live_reconciliation_rows rr set bucket = 'unassigned'
    from live_reconciliation_batches b
    where b.id = rr.batch_id and b.brand_id = old.brand_id
      and rr.room_id = old.room_id and rr.bucket = 'inhouse' and cardinality(rr.matched_session_ids) = 0;
    return old;
  end if;
  update live_reconciliation_rows rr set bucket = 'inhouse'
  from live_reconciliation_batches b
  where b.id = rr.batch_id and b.brand_id = new.brand_id
    and rr.room_id = new.room_id and rr.bucket = 'unassigned';
  return new;
end;
$$;

drop trigger if exists trg_sync_recon_rows_inhouse on brand_inhouse_rooms;
create trigger trg_sync_recon_rows_inhouse
  after insert or update or delete on brand_inhouse_rooms
  for each row execute function sync_recon_rows_with_inhouse();

create or replace function delete_backfill_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_backfill boolean;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được xoá ca nạp bù' using errcode = '42501';
  end if;
  select is_backfill into v_is_backfill from live_sessions where id = p_session_id;
  if v_is_backfill is null then
    raise exception 'Không tìm thấy ca';
  end if;
  if not v_is_backfill then
    raise exception 'Chỉ xoá được ca do nạp bù sinh ra (ca lịch/kế hoạch xoá ở màn Lịch Vận Hành)';
  end if;
  delete from live_sessions where id = p_session_id;
end;
$$;

revoke all on function delete_backfill_session(uuid) from public;
grant execute on function delete_backfill_session(uuid) to authenticated;

-- Đồng bộ các dòng đối soát ĐÃ có từ trước: phiên đã được sinh ca nạp bù nhưng vẫn nằm rổ 'unassigned'.
update live_reconciliation_rows rr set
  matched_session_ids = rr.matched_session_ids || s.id,
  bucket = 'agency'
from live_reconciliation_batches b, live_sessions s
where b.id = rr.batch_id and s.is_backfill and s.brand_id = b.brand_id and s.platform::text = b.platform
  and rr.bucket = 'unassigned' and (s.tiktok_room_id = rr.room_id or s.live_room_ids @> array[rr.room_id])
  and not (rr.matched_session_ids @> array[s.id]);
