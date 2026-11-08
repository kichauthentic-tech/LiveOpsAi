-- 0201 — Dự báo tháng: kịch bản brand, sổ dự báo nhiều mô hình, xác nhận ca bán 0 (07/11, user "làm cả 5" theo đề xuất
-- https://claude.ai/artifact/PBSannSs6WyaW5wyudi7a9).
--
-- Phần 1  brand_month_plans.brand_scenario — các dòng điều chỉnh CEO nhập sau buổi họp monthly (Ads, voucher, hàng mới, hết hàng,
--         mức tham gia campaign sàn, mùa vụ). Mảng jsonb [{id, label, pct, reason, at, by}], pct là tỷ lệ (+0.06 = +6%), giới hạn ±50%.
--         Dự báo cuối = dự báo engine × Π(1 + pct). Ghi thẳng bảng (RLS write_ceo_ops như mọi cột khác của kế hoạch).
-- Phần 2  forecast_snapshots ghi được NHIỀU mô hình cho cùng kênh × tháng × ngày × loại: khoá duy nhất thêm cột `model`
--         ('v3' engine chính, 'sched' bộ xếp ca, 'v3_kb' v3 × kịch bản brand). Cuối tháng chấm mô hình nào đúng hơn. RPC ghi viết lại
--         đầy đủ (guard role GIỮ trainer như 0180).
-- Phần 3  RPC confirm_zero_sales — ca đã qua giờ, không có số nào, ops xác nhận "có live, bán 0": nguồn số = 'handover_typed' (bậc "số
--         lúc giao ca", cùng bậc ops gõ số Shopee cũ — file/đối soát về sau vẫn ghi đè như mọi ca chưa có file), giờ live = giờ kế hoạch,
--         GMV/đơn = 0 ⇒ ca có số (hết nằm ở "Cần xử lý", vào run-rate) và vào lịch sử dự báo như kết quả thật. Đo 06/11: JOCKEY T10 6 ca
--         nhập tay không số từ 20/10 khiến dự báo cuối tháng cao hơn thực tế 19%.
--
-- Thứ tự deploy: client mới gặp DB chưa có 0201 thì ẩn ô kịch bản (báo "chưa chạy 0201"), sổ dự báo chỉ ghi mô hình v3 như cũ, nút
-- "Bán 0" báo chưa chạy migration. Chạy lại nhiều lần không sao. Kiểm: supabase/tests/0201_forecast_scenario_zero_sales.sql.

-- ===== Phần 1 =====
alter table brand_month_plans add column if not exists brand_scenario jsonb not null default '[]'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_scenario_check') then
    alter table brand_month_plans add constraint brand_month_plans_scenario_check
      check (jsonb_typeof(brand_scenario) = 'array' and jsonb_array_length(brand_scenario) <= 20);
  end if;
end $$;

-- ===== Phần 2 =====
alter table forecast_snapshots alter column model set default 'v3';
update forecast_snapshots set model = 'v3' where model is null;
alter table forecast_snapshots alter column model set not null;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'forecast_snapshots_one_per_day') then
    alter table forecast_snapshots drop constraint forecast_snapshots_one_per_day;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_one_per_day_model') then
    alter table forecast_snapshots add constraint forecast_snapshots_one_per_day_model unique (brand_id, platform, month, as_of, kind, model);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_model_check') then
    alter table forecast_snapshots add constraint forecast_snapshots_model_check check (model in ('v3', 'sched', 'v3_kb'));
  end if;
end $$;

create or replace function record_forecast_snapshots(p_rows jsonb) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_n int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin', 'trainer') then
    raise exception 'Chỉ ceo/operations/admin/trainer ghi sổ dự báo' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows phải là mảng';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Tối đa 200 dòng mỗi lần ghi';
  end if;
  for v_item in select * from jsonb_array_elements(p_rows) loop
    insert into forecast_snapshots (brand_id, platform, month, as_of, kind, p50, lo, hi, actual, target, seen_share, ratio, model, recorded_by, recorded_at)
    values (
      (v_item->>'brand_id')::uuid,
      coalesce(v_item->>'platform', 'TikTok'),
      (v_item->>'month')::date,
      coalesce((v_item->>'as_of')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
      v_item->>'kind',
      round((v_item->>'p50')::numeric),
      round((v_item->>'lo')::numeric),
      round((v_item->>'hi')::numeric),
      round((v_item->>'actual')::numeric),
      round((v_item->>'target')::numeric),
      (v_item->>'seen_share')::numeric,
      (v_item->>'ratio')::numeric,
      coalesce(nullif(v_item->>'model', ''), 'v3'),
      auth.uid(),
      now()
    )
    on conflict (brand_id, platform, month, as_of, kind, model) do update set
      p50 = excluded.p50, lo = excluded.lo, hi = excluded.hi, actual = excluded.actual, target = excluded.target,
      seen_share = excluded.seen_share, ratio = excluded.ratio,
      recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function record_forecast_snapshots(jsonb) from public;
grant execute on function record_forecast_snapshots(jsonb) to authenticated;

-- ===== Phần 3 =====
create or replace function confirm_zero_sales(p_session_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_minutes numeric;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin', 'trainer') then
    raise exception 'Chỉ ceo/operations/admin/trainer xác nhận ca bán 0' using errcode = '42501';
  end if;
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca' using errcode = 'P0002';
  end if;
  if s.status::text <> 'Completed' then
    raise exception 'Chỉ xác nhận bán 0 cho ca đã qua giờ (trạng thái Completed)';
  end if;
  if coalesce(s.actual_gmv, 0) > 0 or coalesce(s.total_views, 0) > 0 or coalesce(s.live_duration_minutes, 0) > 0
     or s.data_source::text <> 'manual' or coalesce(s.is_backfill, false) then
    raise exception 'Ca đã có số liệu — không cần xác nhận bán 0';
  end if;
  v_minutes := extract(epoch from (s.end_time - s.start_time)) / 60;
  if v_minutes <= 0 then
    v_minutes := v_minutes + 24 * 60; -- ca qua nửa đêm (21:00–00:30)
  end if;
  update live_sessions
     set data_source = 'handover_typed',
         live_duration_minutes = round(v_minutes, 2),
         actual_gmv = 0,
         total_orders = 0
   where id = p_session_id;
end;
$$;
revoke all on function confirm_zero_sales(uuid) from public;
grant execute on function confirm_zero_sales(uuid) to authenticated;
