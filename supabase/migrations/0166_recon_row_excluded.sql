-- 0166: chọn phiên nào đối soát, phiên nào không.
-- Trước đây "Áp dụng đối soát" ghi đè TOÀN BỘ phiên ở rổ agency + review. Nay mỗi dòng có cờ `excluded`:
-- dòng bị loại không đóng góp vào phép chia ⇒ ca khớp với nó giữ nguyên số hiện có (chỉ ca có phiên khác được chọn mới bị ghi đè).
-- Cờ nằm trên dòng của lô nên chạy lại "Áp dụng" vẫn giữ lựa chọn; nạp lại file (lô mới) thì chọn lại từ đầu.
-- Ghi cờ bằng UPDATE trực tiếp — RLS `live_recon_rows_ceo_admin_ops` đã chỉ cho ceo/admin/operations.

alter table live_reconciliation_rows add column if not exists excluded boolean not null default false;

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'rr\.bucket in \(''agency'', ''review''\) and not rr\.excluded' then
    v_new := replace(
      v_def,
      'where rr.batch_id = p_batch_id and rr.bucket in (''agency'', ''review'')',
      'where rr.batch_id = p_batch_id and rr.bucket in (''agency'', ''review'') and not rr.excluded'
    );
    if v_new = v_def then
      raise exception '0166: không thấy điều kiện rổ agency/review trong apply_live_reconciliation';
    end if;
    execute v_new;
  end if;
end $$;

do $$
begin
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'not rr\.excluded' then
    raise exception '0166: apply_live_reconciliation chưa bỏ qua dòng bị loại';
  end if;
end $$;
