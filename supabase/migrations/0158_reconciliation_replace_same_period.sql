-- 0158 — UP LẠI FILE CỦA CÙNG KỲ THÌ CẬP NHẬT LẦN ĐỐI SOÁT CŨ, KHÔNG TẠO THÊM (user 09/10: màn Đối soát số liệu VERA có
-- 3 lần "01/10–08/10", 2 lần "01/09–30/09"... trùng lắp vì mỗi lần up file là một lô mới).
--
-- 1) import_live_reconciliation: trước khi tạo lô mới, xoá lô cũ cùng (brand, sàn, period_start, period_end). Lô cũ chỉ là
--    bản ghi file + rổ khớp (live_reconciliation_rows xoá theo cascade); số liệu đã áp dụng nằm sẵn trong live_sessions và
--    "Áp dụng" tính lại từ đầu theo file mới nên không mất gì. Kỳ KHÁC nhau (vd 01/10–08/10 và 07/10–08/10) vẫn là hai lô.
-- 2) Dọn lô trùng đang có: mỗi nhóm (brand, sàn, kỳ) giữ lô MỚI NHẤT, xoá các lô cũ hơn.
-- Chạy lại nhiều lần được.

drop function if exists import_live_reconciliation(text, text, date, date, jsonb, uuid, text);
create or replace function import_live_reconciliation(
  p_file_name text,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb,
  -- default null CHỈ để client cũ (5 tham số) nhận câu lỗi rõ ràng thay vì "function not found".
  p_brand_id uuid default null,
  -- Sàn của file (0139): file Creator-Live-Performance là TikTok, file Live List của Shopee là Shopee. Chỉ khớp ca ĐÚNG SÀN —
  -- VERA/JOCKEY chạy cả hai sàn, có giờ chồng nhau, khớp lẫn sàn là chia nhầm GMV.
  p_platform text default 'TikTok'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền nạp file đối soát';
  end if;
  if p_platform is null or p_platform not in ('TikTok', 'Shopee') then
    raise exception 'Sàn của file phải là TikTok hoặc Shopee';
  end if;
  if p_brand_id is null then
    raise exception 'Chọn brand của file trước khi up — file Creator-Live-Performance là của MỘT tài khoản, khớp theo giờ với ca của brand khác sẽ chia nhầm GMV.';
  end if;
  -- 0158: up lại file CỦA CÙNG kỳ (cùng brand + sàn + khoảng ngày) = CẬP NHẬT, không thêm một lần đối soát nữa. Lần cũ chỉ là
  -- bản ghi file/rổ khớp — số đã áp dụng nằm sẵn trong live_sessions và apply_live_reconciliation tính lại từ đầu theo file mới.
  delete from live_reconciliation_batches
  where brand_id = p_brand_id and platform = p_platform
    and period_start is not distinct from p_period_start and period_end is not distinct from p_period_end;

  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by, brand_id, platform)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid(), p_brand_id, p_platform)
  returning id into v_batch_id;

  insert into live_reconciliation_rows (
    batch_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
  )
  select
    v_batch_id, r->>'roomId', r->>'roomTitle',
    nullif(r->>'startedAt', '')::timestamptz, nullif(r->>'endedAt', '')::timestamptz,
    coalesce(r->'raw', '{}'::jsonb),
    coalesce((r->>'durationMinutes')::numeric, 0), coalesce((r->>'gmv')::numeric, 0),
    coalesce((r->>'itemsSold')::int, 0), coalesce((r->>'orders')::int, 0),
    coalesce((r->>'skuOrders')::int, 0), coalesce((r->>'views')::bigint, 0),
    coalesce((r->>'impressions')::bigint, 0), coalesce((r->>'productImpressions')::bigint, 0),
    coalesce((r->>'productClicks')::bigint, 0), coalesce((r->>'newFollowers')::int, 0),
    coalesce((r->>'comments')::int, 0), coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0),
    coalesce((r->>'watchSeconds')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'roomId', '') <> '';

  -- Khớp theo GIAO NHAU khung thời gian với ca CỦA ĐÚNG BRAND. Dòng thiếu giờ bắt đầu/kết thúc không khớp
  -- ca nào (để ở rổ "chưa gán" cho ops xem) — bản 0124 coi NULL là khớp mọi thời điểm, tức khớp MỌI ca.
  with m as (
    select rr.id as row_id,
           array_agg(ls.id order by ls.date, ls.start_time) as sess,
           count(*) as n_sess,
           count(*) filter (where exists (select 1 from session_live_snapshots s where s.session_id = ls.id)) as n_snap
    from live_reconciliation_rows rr
    join live_sessions ls
      on ls.status <> 'Cancelled'
     and ls.brand_id = p_brand_id
     and ls.platform::text = p_platform
     and rr.started_at is not null and rr.ended_at is not null
     -- 0136: giao nhau THẬT (< và >), không tính chạm mép. Phiên 15:07→19:17 và ca kế tiếp bắt đầu đúng 19:17
     -- trước đây "khớp" cả hai ca (chung 1 điểm) ⇒ phiên bị đẩy sang rổ "cần xem lại" và chia ước lượng.
     and rr.started_at < session_boundary_at(ls.id)
     and rr.ended_at > (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
    where rr.batch_id = v_batch_id
    group by rr.id
  )
  update live_reconciliation_rows rr set
    matched_session_ids = m.sess,
    bucket = case when m.n_sess > 1 and m.n_snap < m.n_sess then 'review' else 'agency' end
  from m where rr.id = m.row_id;

  return v_batch_id;
end;
$$;
revoke all on function import_live_reconciliation(text, text, date, date, jsonb, uuid, text) from public;
grant execute on function import_live_reconciliation(text, text, date, date, jsonb, uuid, text) to authenticated;

-- Dọn trùng đang có. Lô mới nhất của nhóm thắng; nếu lô cũ hơn đã áp dụng mà lô mới nhất chưa, lô mới nhất vẫn giữ trạng thái
-- "chưa áp dụng" — đúng thực tế vì rổ khớp của nó chưa được chạy.
delete from live_reconciliation_batches b
using (
  select id, row_number() over (
           partition by brand_id, platform, period_start, period_end order by created_at desc, id desc
         ) as rn
  from live_reconciliation_batches
  where brand_id is not null
) d
where b.id = d.id and d.rn > 1;
