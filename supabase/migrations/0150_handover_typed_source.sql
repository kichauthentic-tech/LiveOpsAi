-- 0150 — Thang nguồn số ĐÚNG cho Shopee: bậc mới 'handover_typed' (số dashboard gõ lúc giao ca).
--
-- Audit đa sàn 07/10 (Bước 4 lộ trình user duyệt): thang nguồn số của ca có 3 bậc dựng cho TikTok — 'manual' (tự khai / nạp từ bảng
-- tính) < 'live_snapshot' (file Creator-Live-Performance lúc giao ca) < 'tiktok_reconciled' (đối soát). Giao ca Shopee (0144) là dán
-- link dashboard + gõ số TỔNG, app trừ ca nối — nhưng ghi 'manual', nên ca Shopee ĐÃ giao ca mang cùng nhãn "Tạm tính" với số nạp từ
-- Working File, và ops không phân biệt được ca Shopee đã giao ca hay chưa nhìn vào nhãn.
--
--   1) Ràng buộc data_source nhận thêm 'handover_typed'.
--   2) private.apply_handover_chain: ca chưa có số từ file / đối soát ⇒ ghi 'handover_typed' (thay 'manual').
--   3) publish_brand_monthly_report: 'handover_typed' vẫn tính là CHƯA đối soát (số gõ lúc giao ca thấp hơn số chốt 16–23%).
--   4) notify_session_changes: đối soát ghi đè số giao ca gõ tay lệch ≥ 5% cũng báo (cùng luật bậc 'live_snapshot').
--   5) Ca Shopee đã giao ca mà còn 'manual' ⇒ 'handover_typed' (đo 07/10: 0 ca — chưa ai giao ca trong app).
--   6) apply_live_reconciliation: lô đối soát SHOPEE (Live List) ghi thêm ATC của phiên vào báo cáo ca (atc_count), chia cho các ca
--      cùng phiên theo tỷ lệ lượt xem đã chia (user chốt 07/10: ATC lấy từ Live List khi đối soát, trợ live không phải gõ). Live List
--      KHÔNG có CO (checkout) và Xu theo phiên — hai số đó chỉ có ở file tổng quan tháng (Report Shopee).
-- Hàm 2–4, 6 sửa bằng cách bọc định nghĩa ĐANG CHẠY (pg_get_functiondef + thay đúng một đoạn, khuôn 0130/0139) — không chép tay thân hàm
-- để khỏi lùi mất phần các migration sau đã thêm. Thiếu đoạn cần thay ⇒ dừng, không áp gì.
-- Thứ tự deploy: chạy migration TRƯỚC khi deploy client mới (client cũ không biết giá trị mới ⇒ ca 'handover_typed' hiện như "Tạm tính",
-- không vỡ gì). Chạy lại nhiều lần không sao.

alter table live_sessions drop constraint if exists live_sessions_data_source_check;
alter table live_sessions add constraint live_sessions_data_source_check
  check (data_source in ('manual', 'handover_typed', 'live_snapshot', 'tiktok_reconciled'));

do $$
declare
  v_def text;
  v_new text;
begin
  -- 2) Chuỗi ca nối của giao ca
  v_def := pg_get_functiondef('private.apply_handover_chain(uuid, text, text)'::regprocedure);
  if v_def !~ 'data_source = ''handover_typed''' then
    v_new := replace(v_def, 'data_source = ''manual'',', 'data_source = ''handover_typed'',');
    if v_new = v_def then
      raise exception '0150: không thấy đoạn data_source = ''manual'' trong private.apply_handover_chain';
    end if;
    execute v_new;
  end if;

  -- 3) Phát hành report: số gõ lúc giao ca chưa phải số chốt
  v_def := pg_get_functiondef('public.publish_brand_monthly_report(uuid, boolean)'::regprocedure);
  if v_def !~ 'data_source in \(''manual'', ''handover_typed''\)' then
    v_new := replace(v_def, 'and data_source = ''manual''', 'and data_source in (''manual'', ''handover_typed'')');
    if v_new = v_def then
      raise exception '0150: không thấy đoạn and data_source = ''manual'' trong publish_brand_monthly_report';
    end if;
    execute v_new;
  end if;

  -- 4) Thông báo "đối soát khác số đã ghi"
  v_def := pg_get_functiondef('public.notify_session_changes()'::regprocedure);
  if v_def !~ 'in \(''manual'', ''handover_typed'', ''live_snapshot''\)' then
    v_new := replace(v_def, 'coalesce(old.data_source, ''manual'') in (''manual'', ''live_snapshot'')', 'coalesce(old.data_source, ''manual'') in (''manual'', ''handover_typed'', ''live_snapshot'')');
    if v_new = v_def then
      raise exception '0150: không thấy đoạn bậc nguồn số trong notify_session_changes';
    end if;
    execute v_new;
  end if;

  -- 6) Đối soát Shopee ghi ATC của phiên
  v_def := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
  if v_def !~ 'live_session_reports \(session_id, atc_count\)' then
    v_new := replace(
      v_def,
      '  update live_reconciliation_batches set applied_at = now() where id = p_batch_id;',
      '  -- 0150: lô Shopee (Live List) mang ATC của phiên trong raw.atc — chia cho ca theo tỷ lệ lượt xem đã chia.
  insert into live_session_reports (session_id, atc_count)
  select t.session_id,
         round(sum((rr.raw->>''atc'')::numeric * case when rr.views > 0 then t.views / rr.views when rr.gmv > 0 then t.gmv / rr.gmv else 1 end))::int
    from tmp_share t
    join live_reconciliation_rows rr on rr.batch_id = p_batch_id and rr.room_id = t.room_id
   where rr.raw ? ''atc''
   group by t.session_id
  on conflict (session_id) do update set atc_count = excluded.atc_count;

  update live_reconciliation_batches set applied_at = now() where id = p_batch_id;'
    );
    if v_new = v_def then
      raise exception '0150: không thấy chỗ chèn ATC trong apply_live_reconciliation';
    end if;
    execute v_new;
  end if;
end $$;

-- 5) Ca Shopee đã giao ca mà còn ghi 'manual'
update live_sessions s
   set data_source = 'handover_typed'
  from live_session_reports r
 where r.session_id = s.id
   and r.handover_at is not null
   and s.platform::text = 'Shopee'
   and s.data_source = 'manual';

-- Chốt tự kiểm
do $$
begin
  if pg_get_functiondef('private.apply_handover_chain(uuid, text, text)'::regprocedure) !~ 'data_source = ''handover_typed''' then
    raise exception '0150: apply_handover_chain chưa ghi handover_typed';
  end if;
  if pg_get_functiondef('public.publish_brand_monthly_report(uuid, boolean)'::regprocedure) !~ 'handover_typed' then
    raise exception '0150: publish_brand_monthly_report chưa tính handover_typed là chưa đối soát';
  end if;
  if pg_get_functiondef('public.notify_session_changes()'::regprocedure) !~ 'handover_typed' then
    raise exception '0150: notify_session_changes chưa nhận bậc handover_typed';
  end if;
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'live_session_reports \(session_id, atc_count\)' then
    raise exception '0150: apply_live_reconciliation chưa ghi ATC của Shopee';
  end if;
end $$;
