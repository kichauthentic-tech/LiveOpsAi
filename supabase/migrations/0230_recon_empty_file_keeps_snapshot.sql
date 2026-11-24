-- 0230 — FILE ĐỐI SOÁT CHƯA CÓ DOANH SỐ KHÔNG ĐƯỢC ĐÈ SỐ SNAPSHOT (24/11).
--
-- Lỗi đo trên DB thật 24/11: VERA Shopee 24/11 ca 10–12 và 12–15 có snapshot đủ số (1.305.000 lúc 12h, 6.001.500 lúc hết room
-- SHP-2026-11-24-1000) nhưng file Live List Shopee up lúc 17:00 để đối soát ghi gmv = 0 / salesConfirmed = 0 cho CÙNG room
-- (Seller Centre chưa điền doanh số phòng vừa live xong; views 4.759 vẫn khớp). "File sàn luôn thắng" (13/10) ⇒ apply ghi đè
-- cả hai ca thành 0 đ và đánh dấu tiktok_reconciled — snapshot còn nguyên trong DB nhưng bị bỏ qua. Franklin Shopee 11–13 cùng kiểu.
--
-- Luật mới (user duyệt 24/11): dòng file có gmv = 0 mà snapshot THẬT của ca khớp có GMV > 0 cho cùng room ⇒ coi là "file chưa
-- có số" — KHÔNG ghi đè (ca giữ số snapshot, lô vẫn áp được cho các dòng còn lại). File có số > 0 vẫn thắng như cũ.
--
--  1) private.recon_empty_rows(batch): các dòng như trên.
--  2) apply_live_reconciliation + preview_live_reconciliation bỏ các dòng đó (bọc định nghĩa đang chạy, khuôn 0189).
--  3) Khôi phục ca đã bị ghi 0: ca tiktok_reconciled có dòng file gmv = 0 như trên ⇒ trả về live_snapshot rồi tính lại từ snapshot.
--     Chạy lại nhiều lần được (lần sau không còn ca nào khớp).

create or replace function private.recon_empty_rows(p_batch_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select rr.id
    from live_reconciliation_rows rr
   where rr.batch_id = p_batch_id
     and coalesce(rr.gmv, 0) = 0
     and exists (
       select 1
         from unnest(coalesce(rr.matched_session_ids, '{}'::uuid[])) as sid
         join session_live_snapshots s on s.session_id = sid and (not s.is_estimated or s.typed_gmv is not null)
         join session_live_snapshot_rows sr on sr.snapshot_id = s.id and coalesce(sr.gmv, 0) > 0
        where sr.room_id = rr.room_id
           or sr.room_id in (
             select m->>'roomId'
               from jsonb_array_elements(case when jsonb_typeof(rr.raw->'merged_from') = 'array' then rr.raw->'merged_from' else '[]'::jsonb end) m
           )
     );
$$;
revoke all on function private.recon_empty_rows(uuid) from public, anon, authenticated;

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'recon_empty_rows' then
    v_new := replace(
      v_def,
      'where rr.bucket in (''agency'', ''review'') and not rr.excluded;',
      'where rr.bucket in (''agency'', ''review'') and not rr.excluded
     and rr.id not in (select private.recon_empty_rows(p_batch_id));'
    );
    if v_new = v_def then
      raise exception '0230: không thấy điều kiện lọc dòng trong apply_live_reconciliation';
    end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef('public.preview_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'recon_empty_rows' then
    v_new := replace(
      v_def,
      'join live_sessions ls on ls.id = sh.session_id;',
      'join live_sessions ls on ls.id = sh.session_id
     where sh.row_id not in (select private.recon_empty_rows(p_batch_id));'
    );
    if v_new = v_def then
      raise exception '0230: không thấy câu join cuối trong preview_live_reconciliation';
    end if;
    execute v_new;
  end if;
end $$;

-- 3) Khôi phục. Ca bị ghi 0 do dòng file rỗng ⇒ về live_snapshot (recompute_session_from_snapshot bỏ qua ca tiktok_reconciled)
-- rồi tính lại cả chuỗi ca nối từ snapshot.
do $$
declare
  v_ids uuid[];
  v_id uuid;
begin
  select coalesce(array_agg(distinct ls.id), '{}') into v_ids
    from live_sessions ls
   where ls.data_source::text = 'tiktok_reconciled'
     and coalesce(ls.actual_gmv, 0) = 0
     and exists (
       select 1
         from live_reconciliation_batches b
         join live_reconciliation_rows rr on rr.batch_id = b.id
        where b.applied_at is not null
          and ls.id = any(rr.matched_session_ids)
          and rr.id in (select private.recon_empty_rows(b.id))
     );

  update live_sessions set data_source = 'live_snapshot' where id = any(v_ids);
  foreach v_id in array v_ids loop
    perform private.snapshot_recompute_after(v_id);
  end loop;
  raise notice '0230: khôi phục % ca về số snapshot', coalesce(array_length(v_ids, 1), 0);
end $$;

do $$
begin
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'recon_empty_rows' then
    raise exception '0230: apply_live_reconciliation chưa lọc dòng file rỗng';
  end if;
  if pg_get_functiondef('public.preview_live_reconciliation(uuid)'::regprocedure) !~ 'recon_empty_rows' then
    raise exception '0230: preview_live_reconciliation chưa lọc dòng file rỗng';
  end if;
end $$;
