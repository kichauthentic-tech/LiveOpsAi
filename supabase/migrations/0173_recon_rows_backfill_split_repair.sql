-- 0173 — Sửa dữ liệu: dòng đối soát rổ agency/review thiếu các ca nạp bù được TÁCH ra sau lần Áp dụng (user chạy 0172 ngày 13/10).
--
-- Đo trên DB thật 13/10 (sau 0172, xem trước mọi lô): lô CROCS TikTok T9 có 13 phiên chỉ còn khớp 1 ca trong khi room đó đã
-- thuộc 2–4 ca nạp bù. Ngày 05/10: 05:58 sinh ca nạp bù trọn phiên (vd 24/09 11:26 -> 00:39, 350,2M), 06:01 Áp dụng lô T9,
-- 17:00 ca đó được tách thành 4 ca và chia số theo giờ (94,3 / 79,5 / 79,5 / 97,0 = 350,3M — số ca ĐÚNG). Trigger 0159 (09/10)
-- chỉ gắn ca nạp bù MỚI vào dòng đối soát, bước đồng bộ một lần của 0159 chỉ sửa rổ 'unassigned' ⇒ 3 ca tách ra không bao giờ
-- vào matched_session_ids. Hệ quả: bấm Áp dụng lại lô T9 (cách cũ lẫn 0171) dồn trọn 350,2M vào ca 11:26–15:00 trong khi 3 ca kia
-- giữ số ⇒ đếm trùng ~256M; màn đối soát (0171) còn báo 15 ca "lệch bản chia mới" và nhắc Áp Dụng Lại.
--
-- Sửa: chạy lại đúng luật 0159 (ca is_backfill cùng brand + sàn, room trùng) cho cả rổ agency/review. Không đụng live_sessions.
-- Sau khi chạy, bản chia mới của các phiên này = số đang ghi trên ca (đã chia theo giờ). Chạy lại nhiều lần không sao.

update live_reconciliation_rows rr set
  matched_session_ids = rr.matched_session_ids || s.id
from live_reconciliation_batches b, live_sessions s
where b.id = rr.batch_id and s.is_backfill and s.brand_id = b.brand_id and s.platform::text = b.platform
  and rr.bucket in ('agency', 'review') and (s.tiktok_room_id = rr.room_id or s.live_room_ids @> array[rr.room_id])
  and not (rr.matched_session_ids @> array[s.id]);

-- Một dòng có thể thiếu nhiều ca (update ... from chỉ ghi MỘT ca mỗi dòng mỗi lần) ⇒ lặp tới khi hết.
do $$
declare
  v_n int;
  v_guard int := 0;
begin
  loop
    update live_reconciliation_rows rr set
      matched_session_ids = rr.matched_session_ids || s.id
    from live_reconciliation_batches b, live_sessions s
    where b.id = rr.batch_id and s.is_backfill and s.brand_id = b.brand_id and s.platform::text = b.platform
      and rr.bucket in ('agency', 'review') and (s.tiktok_room_id = rr.room_id or s.live_room_ids @> array[rr.room_id])
      and not (rr.matched_session_ids @> array[s.id]);
    get diagnostics v_n = row_count;
    v_guard := v_guard + 1;
    exit when v_n = 0 or v_guard > 20;
  end loop;
  if exists (
    select 1 from live_reconciliation_rows rr
      join live_reconciliation_batches b on b.id = rr.batch_id
      join live_sessions s on s.is_backfill and s.brand_id = b.brand_id and s.platform::text = b.platform
                          and (s.tiktok_room_id = rr.room_id or s.live_room_ids @> array[rr.room_id])
     where rr.bucket in ('agency', 'review') and not (rr.matched_session_ids @> array[s.id])
  ) then
    raise exception '0173: vẫn còn dòng đối soát thiếu ca nạp bù cùng room';
  end if;
end $$;
