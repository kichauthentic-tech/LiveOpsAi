-- 0156 — NẠP BÙ CA TỪ FILE CHO SHOPEE (user báo 08/10: "SPE chưa có nạp bù ca từ file").
--
-- Nạp bù ca (0086) chỉ sinh ca TikTok (cứng 'TikTok') từ file Creator-Live-Performance. Shopee có file tương đương —
-- Live List (một dòng / phiên, mã room tổng hợp SHP-<ngày>-<giờ> giống đường đối soát/snapshot 0154) — nên cho
-- create_backfill_sessions nhận thêm p_platform ('TikTok' mặc định ⇒ client cũ gọi 2 đối số vẫn chạy y như trước).
-- Khác biệt cho Shopee: ca sinh ra mang platform 'Shopee' (guard kênh 0149 vẫn yêu cầu brand có kênh Shopee), và
-- phần tử p_rows có thêm khoá tuỳ chọn atc ⇒ live_session_reports.atc_count. Mọi thứ khác (skip room đã thuộc ca,
-- is_backfill, data_source 'tiktok_reconciled' = "đã đối soát từ file sàn", host trống) giữ nguyên.
-- bulk_assign_session_hosts / split_backfill_session không đổi (đã theo s.platform).
-- Chạy lại nhiều lần được. Hàm cũ 2 đối số bị thay bằng hàm 3 đối số (p_platform có default) để lời gọi 2 đối số không mơ hồ.

drop function if exists create_backfill_sessions(uuid, jsonb);

create or replace function create_backfill_sessions(p_brand_id uuid, p_rows jsonb, p_platform text default 'TikTok')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_name text;
  r jsonb;
  v_room text;
  v_start timestamptz;
  v_end timestamptz;
  v_start_vn timestamp;
  v_end_vn timestamp;
  v_views bigint;
  v_orders int;
  v_clicks bigint;
  v_duration numeric;
  v_platform text := coalesce(nullif(trim(p_platform), ''), 'TikTok');
  v_session_id uuid;
  v_atc numeric;
  v_inserted int := 0;
  v_skipped_existing int := 0;
  v_skipped_invalid int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được sinh ca từ file' using errcode = '42501';
  end if;

  if v_platform not in ('TikTok', 'Shopee') then
    raise exception 'Sàn không hợp lệ: %', v_platform;
  end if;

  select name into v_brand_name from brands where id = p_brand_id;
  if v_brand_name is null then
    raise exception 'Brand không tồn tại';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_room := nullif(trim(r->>'room_id'), '');
    v_start := (r->>'started_at')::timestamptz;
    v_end := (r->>'ended_at')::timestamptz;
    if v_room is null or v_start is null or v_end is null or v_end <= v_start then
      v_skipped_invalid := v_skipped_invalid + 1;
      continue;
    end if;
    -- Room đã thuộc ca nào của brand này (snapshot lúc giao ca, đối soát, hoặc lần sinh trước) → bỏ qua.
    if exists (
      select 1 from live_sessions
      where brand_id = p_brand_id
        and (tiktok_room_id = v_room or live_room_ids @> array[v_room])
    ) then
      v_skipped_existing := v_skipped_existing + 1;
      continue;
    end if;

    v_start_vn := v_start at time zone 'Asia/Ho_Chi_Minh';
    v_end_vn := v_end at time zone 'Asia/Ho_Chi_Minh';
    v_views := coalesce((r->>'views')::bigint, 0);
    v_orders := coalesce((r->>'orders')::int, 0);
    v_clicks := coalesce((r->>'product_clicks')::bigint, 0);
    v_duration := coalesce((r->>'duration_minutes')::numeric, extract(epoch from (v_end - v_start)) / 60);

    insert into live_sessions (
      title, brand_id, brand_name, shop_tiktok_handle, studio_id, studio_name,
      host_id, host_name, co_host_id, co_host_name, platform,
      date, start_time, end_time, status, target_gmv,
      actual_gmv, total_orders, avg_watch_time_seconds, peak_viewers, total_views, ctr_avg, cvr_avg,
      data_source, reconciled_at, tiktok_room_id, live_room_ids,
      actual_start_at, actual_end_at, live_duration_minutes,
      attributed_items_sold, attributed_sku_orders, impressions, product_impressions, product_clicks,
      new_followers, comments_count, shares_count, likes_count, is_backfill
    ) values (
      coalesce(nullif(trim(r->>'room_title'), ''), v_brand_name || ' live ' || to_char(v_start_vn, 'DD/MM')),
      p_brand_id, v_brand_name, '', null, '',
      null, '', null, '', v_platform::session_platform,
      v_start_vn::date, date_trunc('minute', v_start_vn)::time, date_trunc('minute', v_end_vn)::time, 'Completed', 0,
      coalesce((r->>'gmv')::numeric, 0), v_orders, coalesce((r->>'avg_view_duration_sec')::numeric, 0), 0, v_views,
      case when v_views > 0 then round((v_clicks::numeric / v_views) * 100, 4) else 0 end,
      case when v_views > 0 then round((v_orders::numeric / v_views) * 100, 4) else 0 end,
      'tiktok_reconciled', now(), v_room, array[v_room],
      v_start, v_end, v_duration,
      coalesce((r->>'items_sold')::int, 0), coalesce((r->>'sku_orders')::int, 0),
      coalesce((r->>'impressions')::bigint, 0), coalesce((r->>'product_impressions')::bigint, 0), v_clicks,
      coalesce((r->>'new_followers')::int, 0), coalesce((r->>'comments')::int, 0),
      coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0), true
    ) returning id into v_session_id;
    v_inserted := v_inserted + 1;

    -- Shopee: ATC của phiên (Live List) ghi vào cùng cột mà đối soát 0150 / snapshot 0154 ghi.
    v_atc := coalesce((r->>'atc')::numeric, 0);
    if v_platform = 'Shopee' and v_atc > 0 then
      insert into live_session_reports (session_id, atc_count) values (v_session_id, round(v_atc)::int)
      on conflict (session_id) do update set atc_count = excluded.atc_count;
    end if;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'skipped_invalid', v_skipped_invalid
  );
end;
$$;

revoke all on function create_backfill_sessions(uuid, jsonb, text) from public;
grant execute on function create_backfill_sessions(uuid, jsonb, text) to authenticated;
