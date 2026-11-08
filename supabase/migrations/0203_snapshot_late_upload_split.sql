-- 0203 — FILE GIAO CA TẢI TRỄ MÀ ROOM CÒN LIVE SANG CA NỐI: TỰ CẮT GIỜ VỀ MỐC GIAO CA + CHIA TẠM SỐ THEO GIỜ.
--
-- Lỗi (VERA TikTok CN 08/11 18:00–20:00): trợ tải Creator-Live-Performance lúc 21:28, room vẫn live (ca 20:00–23:00 nối tiếp).
-- File là số CỘNG DỒN tới 21:27 ⇒ ca hiện "18:00–21:27 (3,5h)", 6,73M, GMV/giờ 1,9M — gồm luôn 1h27' của ca sau, và khi
-- ca sau up file nó chỉ còn phần từ 21:27. Gõ GMV đúng (0174) sửa được nếu ai đó nhớ số lúc 20:00; không ai nhớ thì số sai
-- tới khi đối soát. Đo DB 08/11: 47/128 snapshot có room chạy quá giờ hết ca > 5'; 26 trong đó có ca nối sau.
--
-- Sửa:
--  1) private.snapshot_auto_split(ca): snapshot chưa gõ GMV, không phải ước lượng của OPS, ca có CA NỐI SAU (liên kết room, hoặc
--     ca cùng brand + sàn bắt đầu đúng giờ hết ca ±5', không huỷ, không loại khỏi báo cáo) ⇒ với room mà file chụp quá giờ hết
--     ca > 5': phần của ca = tỷ lệ thời gian (hết ca − đầu đoạn) / (giờ chụp file − đầu đoạn); mọi chỉ số đếm được nhân theo tỷ
--     lệ đó, thời lượng = tới giờ hết ca (công thức 0174). Số gốc giữ trong raw.orig như 0174; cờ auto_split = true.
--     Đối soát (recon_shares) tự thấy mốc ở đúng giờ hết ca (started_at + duration), giống phép chia theo giờ của chính nó.
--  2) Gọi ở: apply_session_live_snapshot (up / up lại file), link_session_room / unlink_session_room (nối hoặc gỡ ca nối sau
--     khi đã up), set_session_snapshot_gmv(ca, null) — "bỏ số gõ" trở về số chia tạm thay vì số cộng dồn của file.
--  3) recompute_session_from_snapshot: snapshot đã gõ GMV hoặc chia tạm ⇒ giờ kết thúc thực tế kẹp về giờ hết ca
--     (trước: gõ GMV xong vẫn hiện "18:00–21:27 (2h)").
--  4) Thêm/xoá lượt restart: trả về số file cả khi đang chia tạm (như số gõ — 0174).
--  5) Tính lại các ca đang lấy số từ snapshot (data_source = live_snapshot) đủ điều kiện. Ca đã đối soát KHÔNG đụng.
-- Không đổi tiền công (tính theo giờ lịch ± tăng ca/về sớm). Phụ thuộc 0195 + 0202 (view session_room_deltas). Chạy lại được.

do $$
begin
  if to_regprocedure('private.room_rows_comparable(text,uuid,uuid)') is null then
    raise exception '0203: chạy 0195 rồi 0202 trước (view session_room_deltas mới).';
  end if;
end $$;

-- View session_room_deltas chỉ để đọc (khuôn 0198) — 0202 tạo lại view mà file đã chạy chưa có dòng này.
revoke insert, update, delete, truncate, references, trigger on public.session_room_deltas from public, anon, authenticated;

alter table session_live_snapshots add column if not exists auto_split boolean not null default false;
comment on column session_live_snapshots.auto_split is
  '0203: số của room chạy quá giờ hết ca đã được chia tạm theo thời gian (file tải trễ, có ca nối sau). Số gốc ở rows.raw.orig.';

-- Số gốc của file: bỏ cả số gõ lẫn số chia tạm (nguyên văn 0174 + xoá cờ auto_split).
create or replace function private.snapshot_restore_file_numbers(p_snapshot_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update session_live_snapshot_rows r set
    gmv = (x.o->>'gmv')::numeric,
    items_sold = (x.o->>'items_sold')::int,
    orders = (x.o->>'orders')::int,
    sku_orders = (x.o->>'sku_orders')::int,
    views = (x.o->>'views')::bigint,
    impressions = (x.o->>'impressions')::bigint,
    product_impressions = (x.o->>'product_impressions')::bigint,
    product_clicks = (x.o->>'product_clicks')::bigint,
    new_followers = (x.o->>'new_followers')::int,
    comments = (x.o->>'comments')::int,
    shares = (x.o->>'shares')::int,
    likes = (x.o->>'likes')::int,
    duration_minutes = (x.o->>'duration_minutes')::numeric,
    watch_seconds = (x.o->>'watch_seconds')::numeric,
    raw = case when x.o ? 'atc' then (r.raw - 'orig') || jsonb_build_object('atc', x.o->'atc') else r.raw - 'orig' end
  from (select id, raw->'orig' as o from session_live_snapshot_rows where snapshot_id = p_snapshot_id and raw ? 'orig') x
  where r.id = x.id;
  update session_live_snapshots set typed_gmv = null, typed_by = null, typed_at = null, auto_split = false
   where id = p_snapshot_id and (typed_gmv is not null or auto_split);
end;
$$;
revoke all on function private.snapshot_restore_file_numbers(uuid) from public;

-- Ca có ca nối sau: liên kết room tường minh, hoặc ca cùng brand + sàn bắt đầu đúng lúc ca này hết (±5').
create or replace function private.session_has_next_shift(p_session_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from session_room_links l where l.prev_session_id = p_session_id)
      or exists (
        select 1
          from live_sessions a
          join live_sessions b
            on b.brand_id = a.brand_id and b.platform = a.platform and b.id <> a.id
           and b.date between a.date and a.date + 1
         where a.id = p_session_id
           and b.status::text <> 'Cancelled'
           and not coalesce(b.excluded_from_reports, false)
           and abs(extract(epoch from (((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') - session_boundary_at(a.id)))) <= 300
      );
$$;
revoke all on function private.session_has_next_shift(uuid) from public, anon, authenticated;

-- Chia tạm theo giờ. Trả true nếu số của snapshot đã đổi (chia mới hoặc bỏ lần chia cũ) ⇒ người gọi phải tính lại ca.
-- Không tự tính lại ca: người gọi quyết định (apply / link / set_session_snapshot_gmv đều đã có bước tính lại riêng).
create or replace function private.snapshot_auto_split(p_session_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap session_live_snapshots;
  v_was boolean;
  v_n int;
begin
  select * into v_snap from session_live_snapshots where session_id = p_session_id for update;
  if not found or v_snap.typed_gmv is not null or v_snap.is_estimated then
    return false;
  end if;
  v_was := v_snap.auto_split;
  if v_was then
    perform private.snapshot_restore_file_numbers(v_snap.id);
  end if;
  if private.session_waits_for_prev(p_session_id) or not private.session_has_next_shift(p_session_id) then
    return v_was;
  end if;

  update session_live_snapshot_rows r set
    raw = r.raw
      || jsonb_build_object('orig', jsonb_build_object(
           'gmv', r.gmv, 'items_sold', r.items_sold, 'orders', r.orders, 'sku_orders', r.sku_orders, 'views', r.views,
           'impressions', r.impressions, 'product_impressions', r.product_impressions, 'product_clicks', r.product_clicks,
           'new_followers', r.new_followers, 'comments', r.comments, 'shares', r.shares, 'likes', r.likes,
           'duration_minutes', r.duration_minutes, 'watch_seconds', r.watch_seconds)
         || case when r.raw ? 'atc' then jsonb_build_object('atc', r.raw->'atc') else '{}'::jsonb end)
      || case when r.raw ? 'atc' and x.atc is not null
              then jsonb_build_object('atc', round(coalesce((r.raw->>'atc')::numeric, 0) - (1 - x.k) * x.atc))
              else '{}'::jsonb end,
    gmv = r.gmv - (1 - x.k) * x.gmv,
    items_sold = round(r.items_sold - (1 - x.k) * x.items_sold),
    orders = round(r.orders - (1 - x.k) * x.orders),
    sku_orders = round(r.sku_orders - (1 - x.k) * x.sku_orders),
    views = round(r.views - (1 - x.k) * x.views),
    impressions = round(r.impressions - (1 - x.k) * x.impressions),
    product_impressions = round(r.product_impressions - (1 - x.k) * x.product_impressions),
    product_clicks = round(r.product_clicks - (1 - x.k) * x.product_clicks),
    new_followers = round(r.new_followers - (1 - x.k) * x.new_followers),
    comments = round(r.comments - (1 - x.k) * x.comments),
    shares = round(r.shares - (1 - x.k) * x.shares),
    likes = round(r.likes - (1 - x.k) * x.likes),
    watch_seconds = r.watch_seconds - (1 - x.k) * x.watch_seconds,
    -- Thời lượng tới giờ hết ca (không vượt số file khi file có thời lượng, không dưới mốc trước) — công thức 0174.
    duration_minutes = least(
      greatest(round((extract(epoch from (x.boundary_at - x.started_at)) / 60)::numeric, 2), r.duration_minutes - x.duration_minutes),
      case when r.duration_minutes > 0 then r.duration_minutes else 1e9 end)
  from (
    select d.room_id, d.boundary_at, d.started_at, d.gmv, d.items_sold, d.orders, d.sku_orders, d.views, d.impressions,
           d.product_impressions, d.product_clicks, d.new_followers, d.comments, d.shares, d.likes, d.watch_seconds,
           d.duration_minutes, d.atc,
           case when t.t1 <= t.t0 then 1::numeric
                else least(greatest((extract(epoch from (d.boundary_at - t.t0)) / extract(epoch from (t.t1 - t.t0)))::numeric, 0), 1)
           end as k
      from session_room_deltas d
      join session_live_snapshot_rows c on c.snapshot_id = v_snap.id and c.room_id = d.room_id
      cross join lateral (
        select greatest(d.started_at, d.session_start) as t0,
               -- Giờ chụp của số cộng dồn: room đã tắt ⇒ giờ tắt; còn live ⇒ bắt đầu + thời lượng (TikTok), không có ⇒ giờ tải.
               coalesce(d.ended_at,
                        case when c.duration_minutes > 0 then d.started_at + c.duration_minutes * interval '1 minute' end,
                        v_snap.captured_at) as t1
      ) t
     where d.session_id = p_session_id
       and d.started_at is not null
       and t.t1 > d.boundary_at + interval '5 minutes'
  ) x
  where r.snapshot_id = v_snap.id and r.room_id = x.room_id;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return v_was;
  end if;
  update session_live_snapshots set auto_split = true where id = v_snap.id;
  return true;
end;
$$;
revoke all on function private.snapshot_auto_split(uuid) from public, anon, authenticated;

-- Tính lại ca + chuỗi ca nối sau nó + ca sau dùng chung room (cùng bước với apply_session_live_snapshot / 0174).
create or replace function private.snapshot_recompute_after(p_session_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap session_live_snapshots;
  v_affected uuid;
begin
  perform private.recompute_chain_from(p_session_id);
  select * into v_snap from session_live_snapshots where session_id = p_session_id;
  if not found then
    return;
  end if;
  for v_affected in
    select distinct s.session_id
      from session_live_snapshots s
      join session_live_snapshot_rows r on r.snapshot_id = s.id
     where s.boundary_at > v_snap.boundary_at
       and r.room_id in (select room_id from session_live_snapshot_rows where snapshot_id = v_snap.id)
       and private.room_rows_comparable(r.room_id, s.session_id, p_session_id)
  loop
    perform recompute_session_from_snapshot(v_affected);
  end loop;
end;
$$;
revoke all on function private.snapshot_recompute_after(uuid) from public, anon, authenticated;

-- Thêm/xoá lượt restart: số gõ HOẶC số chia tạm hết nghĩa ⇒ về số file (0174 chỉ xét số gõ).
create or replace function private.reset_typed_gmv_on_parts() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap uuid;
begin
  select id into v_snap from session_live_snapshots
   where session_id = coalesce(new.session_id, old.session_id) and (typed_gmv is not null or auto_split);
  if v_snap is not null then
    perform private.snapshot_restore_file_numbers(v_snap);
  end if;
  return null;
end;
$$;

-- Vá các hàm từ định nghĩa ĐANG CÓ trong DB (như 0189/0202) để không lùi mất bản vá của migration khác.
do $$
declare
  v_def text;
  v_new text;
begin
  -- a) Up / up lại file.
  v_def := pg_get_functiondef('public.apply_session_live_snapshot(uuid,text,text,jsonb)'::regprocedure);
  if v_def !~ 'snapshot_auto_split' then
    v_new := replace(v_def,
      '  return query select * from live_sessions where id = p_session_id;',
      '  -- 0203: file tải trễ, room còn live sang ca nối ⇒ chia tạm theo giờ.
  if private.snapshot_auto_split(p_session_id) then
    perform private.snapshot_recompute_after(p_session_id);
  end if;

  return query select * from live_sessions where id = p_session_id;');
    if v_new = v_def then
      raise exception '0203: không thấy dòng return query trong apply_session_live_snapshot';
    end if;
    execute v_new;
  end if;

  -- b) Bỏ số gõ ⇒ về số chia tạm (nếu đủ điều kiện) thay vì số cộng dồn của file.
  v_def := pg_get_functiondef('public.set_session_snapshot_gmv(uuid,numeric)'::regprocedure);
  if v_def !~ 'snapshot_auto_split' then
    v_new := replace(v_def,
      '  perform private.snapshot_restore_file_numbers(v_snap.id);',
      '  perform private.snapshot_restore_file_numbers(v_snap.id);
  if p_gmv is null then
    perform private.snapshot_auto_split(p_session_id); -- 0203
  end if;');
    if v_new = v_def then
      raise exception '0203: không thấy bước khôi phục số file trong set_session_snapshot_gmv';
    end if;
    execute v_new;
  end if;

  -- c) Nối room sau khi đã up file của ca trước.
  v_def := pg_get_functiondef('public.link_session_room(uuid,uuid)'::regprocedure);
  if v_def !~ 'snapshot_auto_split' then
    v_new := replace(v_def,
      '  perform private.recompute_chain_from(p_next);
  return jsonb_build_object(',
      '  perform private.recompute_chain_from(p_next);
  if private.snapshot_auto_split(p_prev) then
    perform private.snapshot_recompute_after(p_prev); -- 0203
  end if;
  return jsonb_build_object(');
    if v_new = v_def then
      raise exception '0203: không thấy bước tính lại chuỗi trong link_session_room';
    end if;
    execute v_new;
  end if;

  -- d) Gỡ nối room.
  v_def := pg_get_functiondef('public.unlink_session_room(uuid)'::regprocedure);
  if v_def !~ 'snapshot_auto_split' then
    v_new := replace(v_def,
      '  perform private.recompute_chain_from(v_next);
end;',
      '  perform private.recompute_chain_from(v_next);
  if private.snapshot_auto_split(p_prev) then
    perform private.snapshot_recompute_after(p_prev); -- 0203
  end if;
end;');
    if v_new = v_def then
      raise exception '0203: không thấy bước tính lại chuỗi trong unlink_session_room';
    end if;
    execute v_new;
  end if;

  -- e) Giờ kết thúc thực tế: số đã quy về giờ hết ca (gõ hoặc chia tạm) ⇒ kẹp về giờ hết ca.
  v_def := pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure);
  if v_def !~ 'auto_split' then
    v_new := replace(v_def,
      'min(started_at) as started_at, max(ended_at) as ended_at,',
      'min(started_at) as started_at,
      case when exists (select 1 from session_live_snapshots z
                         where z.session_id = p_session_id and (z.typed_gmv is not null or z.auto_split))
           then least(max(ended_at), min(boundary_at)) else max(ended_at) end as ended_at, -- 0203');
    if v_new = v_def then
      raise exception '0203: không thấy min(started_at)/max(ended_at) trong recompute_session_from_snapshot';
    end if;
    execute v_new;
  end if;
end $$;

-- Ca cũ: chỉ ca đang lấy số từ snapshot (ca đã đối soát giữ số file sàn). Theo thứ tự mốc để chuỗi ca nối tính đúng.
-- Ca đã gõ GMV: tính lại để giờ kết thúc kẹp về giờ hết ca.
do $$
declare
  r record;
begin
  for r in
    select s.session_id, s.typed_gmv
      from session_live_snapshots s
      join live_sessions ls on ls.id = s.session_id
     where ls.data_source::text = 'live_snapshot'
     order by s.boundary_at
  loop
    if private.snapshot_auto_split(r.session_id) or r.typed_gmv is not null then
      perform private.snapshot_recompute_after(r.session_id);
    end if;
  end loop;
end $$;

-- Chốt tự kiểm.
do $$
begin
  if pg_get_functiondef('public.apply_session_live_snapshot(uuid,text,text,jsonb)'::regprocedure) !~ 'snapshot_auto_split'
     or pg_get_functiondef('public.set_session_snapshot_gmv(uuid,numeric)'::regprocedure) !~ 'snapshot_auto_split'
     or pg_get_functiondef('public.link_session_room(uuid,uuid)'::regprocedure) !~ 'snapshot_auto_split'
     or pg_get_functiondef('public.unlink_session_room(uuid)'::regprocedure) !~ 'snapshot_auto_split'
     or pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure) !~ 'auto_split' then
    raise exception '0203 DỪNG: thiếu bản vá ở một trong các hàm';
  end if;
  raise notice '0203 OK';
end $$;
