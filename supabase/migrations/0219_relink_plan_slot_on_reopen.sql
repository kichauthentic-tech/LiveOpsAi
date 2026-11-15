-- 0219 — Ca kế hoạch bị huỷ rồi tạo lại cùng khung: tự nối dòng kế hoạch sang ca mới.
--
-- Vết đo 15/11/2026 (VERA TikTok 15–18h, target 11.196.329 ₫): ca gốc của kế hoạch đã chốt bị huỷ ngày 05/11
-- (shift_slot → 'cancelled'), OP tạo lại ca đúng khung ngày 14/11 ⇒ shift_slot MỚI. Dòng `brand_month_plan_slots`
-- vẫn trỏ `slot_id` = slot đã huỷ, nên:
--   • `fetchLockedPlanTargets` (bySlotId) không đổ target xuống ca thật ⇒ ca hiện target 0, thẻ Lịch không có viên Target,
--     target ngày + run-rate theo ca thiếu đúng số đó (tổng target tháng vẫn đủ — monthTotals cộng mọi dòng kế hoạch).
--   • `ensure_boost_slot` (0165/0186) cũng không coi đây là ca tăng cường, vì đã có dòng kế hoạch CÙNG GIỜ ⇒ không có
--     target đề xuất nào thay thế. Ca rơi vào khe giữa hai đường.
-- Trước đây chỉ "Chốt lại" (lock_month_plan, 0185) mới gắn lại — tức phải có người nhớ bấm.
--
-- Nay: mỗi khi một shift_slot không huỷ xuất hiện/đổi giờ, nếu đúng brand × sàn × ngày × giờ của một dòng kế hoạch ĐÃ CHỐT
-- đang mồ côi (slot_id null, slot không còn, hoặc slot đã huỷ) thì nối thẳng. Dùng đúng luật gắn của 0185: chỉ gắn ca cùng
-- SÀN, không đụng `plan_id` của ca, không mở lại ca đã huỷ, không đổi target.
-- Chạy lại nhiều lần không sao.

create or replace function relink_orphan_plan_slot(p_slot_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s shift_slots%rowtype;
  p brand_month_plans%rowtype;
  v_ps uuid;
begin
  select * into s from shift_slots where id = p_slot_id;
  if s.id is null or s.status = 'cancelled' or s.brand_id is null then
    return;
  end if;
  -- Ca đã là ca của một dòng kế hoạch rồi: không cướp dòng khác.
  if exists (select 1 from brand_month_plan_slots where slot_id = s.id) then
    return;
  end if;
  -- rebase_month_plan (0164) đang sắp xếp lại kế hoạch trong cùng transaction: để nó tự gắn.
  if coalesce(current_setting('app.retarget_plan', true), '') <> '' then
    return;
  end if;
  select * into p from brand_month_plans
   where brand_id = s.brand_id and coalesce(platform, 'TikTok') = s.platform::text
     and month = date_trunc('month', s.date)::date and status = 'locked';
  if p.id is null then
    return;
  end if;
  select ps.id into v_ps
    from brand_month_plan_slots ps
    left join shift_slots old on old.id = ps.slot_id
   where ps.plan_id = p.id and ps.date = s.date and ps.start_time = s.start_time and ps.end_time = s.end_time
     and (ps.slot_id is null or old.id is null or old.status = 'cancelled')
   order by ps.id
   limit 1;
  if v_ps is null then
    return;
  end if;
  -- Chỉ đổi slot_id: guard_locked_plan_slot (0185) cho qua (không dời giờ, không đổi target) và
  -- trg_plan_slots_drop_boost (0165) tự xoá dòng tăng cường nếu có.
  update brand_month_plan_slots set slot_id = s.id where id = v_ps;
end;
$$;
revoke all on function relink_orphan_plan_slot(uuid) from public, anon, authenticated;

create or replace function trg_shift_slots_plan_relink() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform relink_orphan_plan_slot(new.id);
  return new;
end;
$$;
revoke all on function trg_shift_slots_plan_relink() from public, anon, authenticated;

drop trigger if exists trg_shift_slots_plan_relink on shift_slots;
create trigger trg_shift_slots_plan_relink
  after insert or update of date, start_time, end_time, status, platform, brand_id on shift_slots
  for each row execute function trg_shift_slots_plan_relink();

-- Vá các ca đang mồ côi sẵn (đo 15/11/2026 trên DB thật: 0 dòng — ca VERA 15/11 đã sửa tay trước đó).
do $$
declare r record; n int := 0;
begin
  for r in
    select distinct s.id
      from shift_slots s
      join brand_month_plans p on p.brand_id = s.brand_id and coalesce(p.platform, 'TikTok') = s.platform::text
                              and p.month = date_trunc('month', s.date)::date and p.status = 'locked'
      join brand_month_plan_slots ps on ps.plan_id = p.id and ps.date = s.date
                                    and ps.start_time = s.start_time and ps.end_time = s.end_time
      left join shift_slots old on old.id = ps.slot_id
     where s.status <> 'cancelled'
       and (ps.slot_id is null or old.id is null or old.status = 'cancelled')
       and not exists (select 1 from brand_month_plan_slots x where x.slot_id = s.id)
  loop
    perform relink_orphan_plan_slot(r.id);
    n := n + 1;
  end loop;
  raise notice '0219: đã nối lại % ca kế hoạch mồ côi', n;
end $$;
