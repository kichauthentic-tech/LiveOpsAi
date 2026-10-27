-- 0186 — Ca tăng cường có target TẠM ngay lúc tạo ca (không chờ ai mở Kế Hoạch Tháng).
--
-- Bối cảnh (check 27/10): trigger 0165 chèn dòng tăng cường với target 0 + target_pending; target chỉ được điền khi có người mở
-- Kế Hoạch Tháng của đúng kênh (engine chạy ở client). Ca JOCKEY TikTok 11/10 20–23 "chờ target" 16 ngày, đã live xong vẫn 0.
-- User chốt 27/10: DB tự điền target tạm khi tạo ca.
--
--   target tạm = (Σ target ca kế hoạch gốc ÷ Σ giờ ca kế hoạch gốc) × giờ của ca tăng cường
--
-- Cùng con số với nhánh dự phòng của client (boostFillItems: "target/giờ của chính kế hoạch × giờ ca"). target_pending VẪN true
-- (= engine chưa tính): mở Kế Hoạch Tháng thì client thay bằng dự báo engine của chính ca như cũ. Kế hoạch Σ target = 0 (lịch
-- tháng sau vừa mở, chưa đặt target) ⇒ target tạm 0, dòng vẫn chờ.
--
-- Không đổi luật 0165: target ca tăng cường KHÔNG cộng vào target tháng / run-rate.
-- Thứ tự deploy: chạy trước hay sau client đều được. Chạy lại nhiều lần không sao.

create or replace function boost_provisional_target(p_plan_id uuid, p_start time, p_end time) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- Giờ một ca: ca qua đêm (21:00–00:30) có end < start ⇒ cộng 24h. Ca 0 giờ không tính.
  with h as (
    select ps.target_gmv,
           case when ps.end_time > ps.start_time then extract(epoch from ps.end_time - ps.start_time)
                else extract(epoch from ps.end_time - ps.start_time) + 86400 end / 3600.0 as hours
      from brand_month_plan_slots ps
     where ps.plan_id = p_plan_id
  ), rate as (
    select case when sum(hours) > 0 then sum(greatest(target_gmv, 0)) / sum(hours) else 0 end as per_hour
      from h where hours > 0
  )
  select coalesce(round(rate.per_hour *
           (case when p_end > p_start then extract(epoch from p_end - p_start)
                 else extract(epoch from p_end - p_start) + 86400 end / 3600.0)), 0)
    from rate;
$$;
revoke all on function boost_provisional_target(uuid, time, time) from public, anon, authenticated;

create or replace function ensure_boost_slot(p_slot_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s shift_slots%rowtype;
  p brand_month_plans%rowtype;
begin
  select * into s from shift_slots where id = p_slot_id;
  if s.id is null or s.status = 'cancelled' or s.brand_id is null then
    return;
  end if;
  -- rebase_month_plan (0164) đang đưa ca vào kế hoạch GỐC trong cùng transaction: không sinh dòng tăng cường chen vào.
  if coalesce(current_setting('app.retarget_plan', true), '') <> '' then
    return;
  end if;
  select * into p from brand_month_plans
   where brand_id = s.brand_id and platform = s.platform::text
     and month = date_trunc('month', s.date)::date and status = 'locked';
  if p.id is null then
    return;
  end if;
  -- Đã là ca kế hoạch gốc (gắn slot, hoặc cùng giờ — lúc Chốt/Chốt lại sinh ca cho dòng kế hoạch) thì không phải ca tăng cường.
  if exists (
    select 1 from brand_month_plan_slots ps
     where ps.plan_id = p.id
       and (ps.slot_id = s.id or (ps.date = s.date and ps.start_time = s.start_time and ps.end_time = s.end_time))
  ) then
    return;
  end if;
  -- 0186: target tạm ngay lúc tạo; target_pending (mặc định true) = engine chưa tính, client thay bằng dự báo khi mở Kế Hoạch Tháng.
  insert into plan_boost_slots (plan_id, shift_slot_id, date, start_time, end_time, target_gmv)
  values (p.id, s.id, s.date, s.start_time, s.end_time, boost_provisional_target(p.id, s.start_time, s.end_time))
  on conflict (plan_id, date, start_time, end_time) do nothing;
end;
$$;
revoke all on function ensure_boost_slot(uuid) from public, anon, authenticated;

-- Dòng đang chờ mà chưa có số (JOCKEY TikTok 11/10 trên DB thật) ⇒ điền target tạm một lần.
update plan_boost_slots b
   set target_gmv = boost_provisional_target(b.plan_id, b.start_time, b.end_time)
 where b.target_pending and b.target_gmv = 0;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if has_function_privilege('authenticated', 'public.boost_provisional_target(uuid,time,time)', 'execute') then
    raise exception '0186 chốt 1: boost_provisional_target không được gọi trực tiếp từ client';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_boost_slot(uuid)', 'execute') then
    raise exception '0186 chốt 2: ensure_boost_slot không được gọi trực tiếp từ client';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_shift_slots_boost' and not tgisinternal) then
    raise exception '0186 chốt 3: thiếu trigger trg_shift_slots_boost (0165 chưa chạy?)';
  end if;
end $$;
