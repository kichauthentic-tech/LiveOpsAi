-- 0218 — Đối soát: gán nhãn rổ cho TỪNG DÒNG ĐƯỢC CHỌN (trước đây chỉ có nút "cả rổ").
-- Chạy tay trên Supabase SQL Editor; chạy lại nhiều lần không sao. Client cũ không gọi hàm này nên chạy trước/sau đều được.
--
-- VÌ SAO: rổ "chưa gán" (phiên không khớp ca nào) đo 14/11 trên DB thật có 440 dòng — một lô VERA 192 dòng,
-- JOCKEY 78, FUJIWA 132. Nút duy nhất là `set_reconciliation_bucket` = đổi CẢ rổ sang 'inhouse', nên ops phải
-- chấp nhận "được ăn cả ngã về không": số dòng đã gán nhãn inhouse trên DB thật = 0, tức là chưa ai dám bấm.
-- Nay chọn vài dòng rồi gán — phần còn lại giữ nguyên 'unassigned'.
--
-- Guard trong THÂN hàm như 0082 (security definer bỏ qua RLS): chỉ ceo/admin/operations.
-- Bẫy: current_user_role() trả NULL khi người gọi không có dòng profiles ⇒ phải coalesce về '' trước khi so.

create or replace function set_reconciliation_rows_bucket(
  p_batch_id uuid,
  p_row_ids uuid[],
  p_to_bucket text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền sửa nhãn đối soát';
  end if;
  if p_to_bucket not in ('agency', 'review', 'unassigned', 'inhouse') then
    raise exception 'Nhãn không hợp lệ: %', p_to_bucket;
  end if;
  if p_row_ids is null or array_length(p_row_ids, 1) is null then
    return 0;
  end if;
  -- Chỉ đổi qua lại giữa hai rổ KHÔNG ghi vào ca ('unassigned' ↔ 'inhouse'). Kéo một dòng sang 'agency' bằng tay
  -- sẽ ghi số vào ca mà không qua phép khớp giờ của import_live_reconciliation — đóng đường đó luôn.
  update live_reconciliation_rows
     set bucket = p_to_bucket
   where batch_id = p_batch_id
     and id = any(p_row_ids)
     and bucket in ('unassigned', 'inhouse')
     and p_to_bucket in ('unassigned', 'inhouse');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function set_reconciliation_rows_bucket(uuid, uuid[], text) from public;
grant execute on function set_reconciliation_rows_bucket(uuid, uuid[], text) to authenticated;

do $$
begin
  if to_regprocedure('public.set_reconciliation_rows_bucket(uuid, uuid[], text)') is null then
    raise exception '0218 chưa tạo được hàm set_reconciliation_rows_bucket';
  end if;
  raise notice '0218 OK — gán nhãn rổ theo dòng đã chọn.';
end;
$$;
