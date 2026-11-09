-- 0206 — Luật 48 giờ/tuần chỉ CẢNH BÁO, DB không chặn nữa (09/11, user chốt sau audit mở lịch/đăng ký/chốt ca).
--
-- Lý do: lịch sheet T11 đã đẩy sẵn vài người vượt 48 giờ (tuần 9/11 Toàn 56,5h; tuần 23/11 Toàn 67,5h + Ngân 61,5h). Ở bản 0176,
-- publish_roster_week cộng giờ MỌI người trong tuần rồi từ chối cả lần công bố nếu bất kỳ ai quá ngưỡng — kể cả người không có
-- trong nháp — nên 9/12 ca mở T11 không công bố được. User: "chỉ hiện cảnh báo khi chốt lịch cho từng người, không cần chặn hẳn".
--
-- Bỏ đúng khối kiểm giờ tuần ở 3 hàm của 0176 (publish_roster_week, roster_reassign, roster_move_session); phần còn lại GIỮ NGUYÊN:
--   · trùng người vẫn do trigger 0143 chặn (lỗi ở finalize_shift_slot làm huỷ cả lần công bố, như cũ);
--   · công bố vẫn bắt buộc mọi ca nháp có host; đổi người vẫn bắt buộc lý do, host ≠ trợ, ca chưa có số...
-- roster_rules.max_week_hours vẫn là ngưỡng: client dùng nó để cảnh báo (hộp xác nhận công bố, bộ chọn người, tab Kiểm tra).
-- Vá bằng cách cắt đúng khối bằng regexp trên định nghĩa hiện hành (không chép lại cả thân hàm ⇒ không lệch các bản vá sau 0176).

do $$
declare
  def text;
  new_def text;
begin
  -- 1) publish_roster_week: bỏ khối "Luật chặn: quá max_week_hours" (with h as (...) ... raise exception 'Quá % giờ/tuần...').
  select pg_get_functiondef('public.publish_roster_week(date)'::regprocedure) into def;
  if position('Quá % giờ/tuần' in def) > 0 then
    new_def := regexp_replace(def, '  with h as \(.*?raise exception ''Quá % giờ/tuần[^;]*;\s*end if;\n', E'  -- 0206: giờ tuần vượt ngưỡng chỉ cảnh báo ở client, DB không chặn.\n', 's');
    if new_def = def or position('Quá % giờ/tuần' in new_def) > 0 then
      raise exception '0206: không cắt được khối kiểm giờ tuần ở publish_roster_week — kiểm tay';
    end if;
    execute new_def;
  end if;

  -- 2) roster_reassign: bỏ vòng foreach kiểm giờ tuần của người mới vào ca.
  select pg_get_functiondef('public.roster_reassign(uuid,uuid,uuid,text)'::regprocedure) into def;
  if position('tối đa %' in def) > 0 then
    new_def := regexp_replace(def, '  foreach v_tid in array array_remove\(array\[p_host_id, p_co_host_id\], null\) loop.*?    end if;\n  end loop;\n', E'  -- 0206: giờ tuần vượt ngưỡng chỉ cảnh báo ở client, DB không chặn.\n', 's');
    if new_def = def or position('tối đa %' in new_def) > 0 then
      raise exception '0206: không cắt được khối kiểm giờ tuần ở roster_reassign — kiểm tay';
    end if;
    execute new_def;
  end if;

  -- 3) roster_move_session: bỏ vòng foreach kiểm giờ tuần của host/trợ khi dời giờ.
  select pg_get_functiondef('public.roster_move_session(uuid,date,time,time,text)'::regprocedure) into def;
  if position('tối đa %' in def) > 0 then
    new_def := regexp_replace(def, '  foreach v_tid in array array_remove\(array\[v_s.host_id, v_s.co_host_id\], null\) loop.*?    end if;\n  end loop;\n', E'  -- 0206: giờ tuần vượt ngưỡng chỉ cảnh báo ở client, DB không chặn.\n', 's');
    if new_def = def or position('tối đa %' in new_def) > 0 then
      raise exception '0206: không cắt được khối kiểm giờ tuần ở roster_move_session — kiểm tay';
    end if;
    execute new_def;
  end if;
end $$;

-- ===== Chốt tự kiểm =====
do $$
begin
  if position('Quá % giờ/tuần' in pg_get_functiondef('public.publish_roster_week(date)'::regprocedure)) > 0
     or position('tối đa %' in pg_get_functiondef('public.roster_reassign(uuid,uuid,uuid,text)'::regprocedure)) > 0
     or position('tối đa %' in pg_get_functiondef('public.roster_move_session(uuid,date,time,time,text)'::regprocedure)) > 0 then
    raise exception '0206 tự kiểm: còn khối chặn giờ tuần';
  end if;
  -- Phần giữ nguyên phải còn: bắt buộc host khi công bố, lý do khi đổi người / dời ca.
  if position('chưa có host' in pg_get_functiondef('public.publish_roster_week(date)'::regprocedure)) = 0
     or position('Ghi lý do đổi người' in pg_get_functiondef('public.roster_reassign(uuid,uuid,uuid,text)'::regprocedure)) = 0
     or position('Ghi lý do dời ca' in pg_get_functiondef('public.roster_move_session(uuid,date,time,time,text)'::regprocedure)) = 0 then
    raise exception '0206 tự kiểm: cắt nhầm phần không liên quan';
  end if;
end $$;
