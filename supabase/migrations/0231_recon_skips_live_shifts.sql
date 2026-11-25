-- 0231 — CA ĐANG LIVE KHÔNG BỊ ĐỐI SOÁT, VÀ ĐỐI SOÁT SỚM KHÔNG KHOÁ SNAPSHOT (24/11).
--
-- Lỗi đo trên DB thật 24/11: CROCS TikTok ca 15–18h được đối soát lúc 16:57 (ca còn 1 giờ nữa mới hết) ⇒ ghi 56,5M, đánh dấu
-- tiktok_reconciled. Từ đó 0171 khoá ca: snapshot lúc giao ca 18h up lên KHÔNG cập nhật số nữa ("ca đã đối soát giữ số file sàn").
-- File tải giữa lúc đang live thì số chưa đủ, và ca bị khoá ở số thiếu đó.
--
-- Luật mới:
--  1) Áp dụng / Xem trước đối soát chỉ ghi ca ĐÃ KẾT THÚC (session_boundary_at ≤ now()). Ca đang live hoặc chưa tới giờ bị bỏ qua;
--     file tải lại sau khi ca xong rồi bấm Áp Dụng Lại.
--  2) Ca bị đối soát TRƯỚC giờ hết ca (reconciled_at < session_boundary_at) không còn bị khoá: snapshot up lên vẫn ghi số
--     (recompute_session_from_snapshot chỉ giữ ca đã đối soát SAU khi ca kết thúc). Mở khoá luôn cho các ca đang kẹt như CROCS 15–18h.
-- Bọc định nghĩa đang chạy (khuôn 0189/0230), chạy lại nhiều lần được.

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'session_boundary_at\(sh\.session_id\) <= now\(\)' then
    v_new := replace(
      v_def,
      'and not rr.excluded
     and rr.id not in (select private.recon_empty_rows(p_batch_id));',
      'and not rr.excluded
     and rr.id not in (select private.recon_empty_rows(p_batch_id))
     and session_boundary_at(sh.session_id) <= now();'
    );
    if v_new = v_def then
      raise exception '0231: không thấy điều kiện lọc 0230 trong apply_live_reconciliation (chạy 0230 trước)';
    end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef('public.preview_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'session_boundary_at\(sh\.session_id\) <= now\(\)' then
    v_new := replace(
      v_def,
      'where sh.row_id not in (select private.recon_empty_rows(p_batch_id));',
      'where sh.row_id not in (select private.recon_empty_rows(p_batch_id))
       and session_boundary_at(sh.session_id) <= now();'
    );
    if v_new = v_def then
      raise exception '0231: không thấy điều kiện lọc 0230 trong preview_live_reconciliation (chạy 0230 trước)';
    end if;
    execute v_new;
  end if;

  v_def := pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure);
  if v_def !~ 'reconciled_at >= session_boundary_at' then
    v_new := replace(
      v_def,
      'and data_source::text = ''tiktok_reconciled'') then',
      'and data_source::text = ''tiktok_reconciled'' and reconciled_at >= session_boundary_at(id)) then'
    );
    if v_new = v_def then
      raise exception '0231: không thấy chốt ca đã đối soát trong recompute_session_from_snapshot';
    end if;
    execute v_new;
  end if;
end $$;

do $$
begin
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'session_boundary_at\(sh\.session_id\) <= now\(\)' then
    raise exception '0231: apply_live_reconciliation chưa bỏ qua ca đang live';
  end if;
  if pg_get_functiondef('public.preview_live_reconciliation(uuid)'::regprocedure) !~ 'session_boundary_at\(sh\.session_id\) <= now\(\)' then
    raise exception '0231: preview_live_reconciliation chưa bỏ qua ca đang live';
  end if;
  if pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure) !~ 'reconciled_at >= session_boundary_at' then
    raise exception '0231: recompute_session_from_snapshot vẫn khoá ca đối soát sớm';
  end if;
end $$;
