-- 0189 — GIỜ THỰC CỦA CA SAU ĐỐI SOÁT KẸP VÀO KHUNG CA (đo 28/10: 440/1.438 ca đối soát có actual_start_at → actual_end_at
-- dài hơn khung ca >15', trung bình +252 phút; 379 ca trong đó live_duration_minutes vẫn ≈ khung ca).
--
-- Lỗi: một phiên (room) khớp nhiều ca thì GMV/số đo được chia đúng cho từng ca (0171/0174), nhưng `actual_start_at` /
-- `actual_end_at` ghi min/max giờ của CẢ PHIÊN cho mọi ca ⇒ ca 21:30 dài 120' hiện "live thật" bắt đầu sớm 120'.
-- Tiền, giờ công, lương KHÔNG đổi (tính theo live_duration_minutes); chỉ sai giờ hiển thị (Sổ Ca, Kế hoạch vs thực tế,
-- timeline ca) và mốc "thật" mà một số màn dùng để sắp thứ tự ca.
--
-- Sửa:
--  1) apply_live_reconciliation: ca có phần của phiên bị CHIA (method <> 'whole') thì giờ thực = giờ phiên kẹp vào
--     [giờ bắt đầu ca, session_boundary_at]. Ca nhận trọn phiên (whole) giữ nguyên giờ phiên (host vào sớm/ra muộn vài phút vẫn thấy).
--  2) Sửa các ca đã ghi: ca đã đối soát (không phải ca nạp bù) có chung room với một ca khác cùng brand + sàn ⇒ kẹp lại.
--     Không đụng GMV/orders/views/duration — chỉ hai cột giờ. Chạy lại nhiều lần được.
-- Thân hàm lấy từ định nghĩa ĐANG CÓ trong DB (như 0166) nên không phụ thuộc bản chữ của 0187.

do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
  if v_def ~ 'session_boundary_at\(l\.id\)' then
    return; -- đã áp dụng
  end if;

  v_new := replace(
    v_def,
    'min(t.started_at) as started_at, max(t.ended_at) as ended_at,',
    'case when bool_and(t.method = ''whole'') then min(t.started_at)
           else greatest(min(t.started_at), min((l.date + l.start_time) at time zone ''Asia/Ho_Chi_Minh'')) end as started_at,
      case when bool_and(t.method = ''whole'') then max(t.ended_at)
           else least(max(t.ended_at), min(session_boundary_at(l.id))) end as ended_at,'
  );
  if v_new = v_def then
    raise exception '0189: không thấy dòng min(started_at)/max(ended_at) trong apply_live_reconciliation';
  end if;
  v_def := v_new;
  v_new := replace(v_def, 'from tmp_share t group by t.session_id', 'from tmp_share t join live_sessions l on l.id = t.session_id group by t.session_id');
  if v_new = v_def then
    raise exception '0189: không thấy "from tmp_share t group by t.session_id" trong apply_live_reconciliation';
  end if;
  execute v_new;
end $$;

-- 2) Sửa ca đã ghi. Chung room = live_room_ids giao nhau với ca khác (cùng brand + sàn, chưa huỷ).
update live_sessions ls set
  actual_start_at = greatest(ls.actual_start_at, (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'),
  actual_end_at = least(ls.actual_end_at, session_boundary_at(ls.id))
where ls.data_source = 'tiktok_reconciled'
  and not ls.is_backfill
  and ls.actual_start_at is not null and ls.actual_end_at is not null
  and (ls.actual_start_at < (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
       or ls.actual_end_at > session_boundary_at(ls.id))
  and exists (
    select 1 from live_sessions o
     where o.id <> ls.id and o.brand_id = ls.brand_id and o.platform = ls.platform and o.status <> 'Cancelled'
       and o.live_room_ids && ls.live_room_ids
  )
  -- Kẹp xong vẫn phải còn khung hợp lệ (phòng khi ca bị dời sau lần đối soát).
  and greatest(ls.actual_start_at, (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh') < least(ls.actual_end_at, session_boundary_at(ls.id));

do $$
begin
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'session_boundary_at\(l\.id\)' then
    raise exception '0189: apply_live_reconciliation chưa kẹp giờ thực vào khung ca';
  end if;
end $$;
