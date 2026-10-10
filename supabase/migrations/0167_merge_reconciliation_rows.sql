-- 0167: gộp các dòng đối soát của cùng một ca bị restart / ngắt giữa chừng thành MỘT dòng.
-- Mỗi lần tắt bật stream sàn sinh một room mới (đôi khi chỉ 0–2 phút, GMV 0) ⇒ một dòng đối soát riêng + (khi nạp bù) một ca
-- 2 phút bị "loại khỏi report" nên màn đối soát chỉ gắn được nhãn "ca" trơn. Hàm này gộp nhóm dòng do client đề xuất/ops chọn:
--   * dòng giữ lại = dòng GMV lớn nhất (hoà thì dài nhất, rồi sớm nhất); các dòng còn lại bị xoá;
--   * giờ = [sớm nhất, muộn nhất]; mọi số đo (gmv, orders, views, thời lượng…) CỘNG LẠI — tổng không đổi;
--   * ca khớp = hợp các ca khớp, trừ ca đã loại khỏi report (trừ khi loại hết thì giữ nguyên hợp);
--   * rổ = review nếu có dòng review, ngược lại agency; chỉ gộp dòng ở rổ agency/review;
--   * `raw.merged_from` giữ lại room/giờ/GMV từng dòng bị gộp (và `raw.atc` cộng dồn cho lô Shopee).
-- Không đụng live_sessions — số của ca chỉ đổi khi ops bấm "Áp dụng" sau đó.

create or replace function merge_reconciliation_rows(p_batch_id uuid, p_groups jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group jsonb;
  v_ids uuid[];
  v_keep uuid;
  v_removed int := 0;
  v_n int;
  v_matched uuid[];
  v_visible uuid[];
  v_has_atc boolean;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền gộp dòng đối soát';
  end if;
  if not exists (select 1 from live_reconciliation_batches where id = p_batch_id) then
    raise exception 'Không thấy lô đối soát %', p_batch_id;
  end if;
  if jsonb_typeof(p_groups) <> 'array' then
    raise exception 'Danh sách nhóm gộp không hợp lệ';
  end if;

  for v_group in select * from jsonb_array_elements(p_groups) loop
    select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(v_group) x;
    if v_ids is null or cardinality(v_ids) < 2 then
      raise exception 'Mỗi nhóm gộp cần ít nhất 2 dòng';
    end if;
    select count(*) into v_n from live_reconciliation_rows
      where batch_id = p_batch_id and id = any(v_ids) and bucket in ('agency', 'review');
    if v_n <> cardinality(v_ids) then
      raise exception 'Có dòng không thuộc lô này hoặc không nằm ở rổ khớp ca / cần xem lại';
    end if;

    select id into v_keep from live_reconciliation_rows
      where id = any(v_ids)
      order by gmv desc, duration_minutes desc, started_at asc nulls last, id
      limit 1;

    select array_agg(distinct m) into v_matched
      from live_reconciliation_rows rr, unnest(rr.matched_session_ids) m where rr.id = any(v_ids);
    select array_agg(distinct m) into v_visible
      from unnest(coalesce(v_matched, '{}'::uuid[])) m
      join live_sessions ls on ls.id = m and not ls.excluded_from_reports;
    select bool_or(raw ? 'atc') into v_has_atc from live_reconciliation_rows where id = any(v_ids);

    update live_reconciliation_rows k set
      started_at = a.started_at, ended_at = a.ended_at,
      duration_minutes = a.duration_minutes, gmv = a.gmv, items_sold = a.items_sold, orders = a.orders,
      sku_orders = a.sku_orders, views = a.views, impressions = a.impressions,
      product_impressions = a.product_impressions, product_clicks = a.product_clicks,
      new_followers = a.new_followers, comments = a.comments, shares = a.shares, likes = a.likes,
      watch_seconds = a.watch_seconds,
      matched_session_ids = coalesce(v_visible, v_matched, '{}'::uuid[]),
      bucket = case when a.any_review then 'review' else 'agency' end,
      excluded = a.all_excluded,
      raw = k.raw
        || jsonb_build_object('merged_from', a.merged_from)
        || case when v_has_atc then jsonb_build_object('atc', a.atc) else '{}'::jsonb end
    from (
      select min(started_at) as started_at, max(ended_at) as ended_at,
             sum(duration_minutes) as duration_minutes, sum(gmv) as gmv, sum(items_sold) as items_sold,
             sum(orders) as orders, sum(sku_orders) as sku_orders, sum(views) as views,
             sum(impressions) as impressions, sum(product_impressions) as product_impressions,
             sum(product_clicks) as product_clicks, sum(new_followers) as new_followers,
             sum(comments) as comments, sum(shares) as shares, sum(likes) as likes,
             sum(watch_seconds) as watch_seconds,
             sum(coalesce((raw->>'atc')::numeric, 0)) as atc,
             bool_or(bucket = 'review') as any_review, bool_and(excluded) as all_excluded,
             jsonb_agg(jsonb_build_object('roomId', room_id, 'startedAt', started_at, 'endedAt', ended_at, 'gmv', gmv)
                       order by started_at) filter (where id <> v_keep) as merged_from
        from live_reconciliation_rows where id = any(v_ids)
    ) a
    where k.id = v_keep;

    delete from live_reconciliation_rows where id = any(v_ids) and id <> v_keep;
    v_removed := v_removed + cardinality(v_ids) - 1;
  end loop;

  update live_reconciliation_batches set row_count = (select count(*) from live_reconciliation_rows where batch_id = p_batch_id)
    where id = p_batch_id;
  return v_removed;
end;
$$;
revoke all on function merge_reconciliation_rows(uuid, jsonb) from public;
grant execute on function merge_reconciliation_rows(uuid, jsonb) to authenticated;
