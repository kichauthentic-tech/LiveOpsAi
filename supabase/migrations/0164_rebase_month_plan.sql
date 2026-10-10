-- 0164 — "Chia lại theo lịch hiện có": MỘT RPC chia lại target cả tháng trên TOÀN BỘ ca đang có trên lịch của kênh.
--
-- Bối cảnh (10/10): 0162 chỉ đổi target của ca ĐÃ nằm trong kế hoạch. Ca OP tạo thêm ngoài kế hoạch (Lịch & Studio, ca nạp bù) và
-- ca đã qua không vào được kế hoạch đã chốt (trigger 0133 chặn thêm ca ngày đã qua; client lọc ngày ≥ hôm nay) ⇒ target 0, không
-- nằm trong Σ target tháng. User chốt 3 luật cho chia lại:
--   1) ca đã qua CÓ bị chia lại target;
--   2) ca đã huỷ BỎ khỏi phần chia (target về 0, tổng tháng = Σ ca còn chạy) — khác luật run-rate "ca kế hoạch huỷ giữ target"
--      vốn chỉ áp cho plan BAN ĐẦU, không áp khi user chủ động chia lại cả tháng;
--   3) ca OP thêm TÍNH NGAY vào kế hoạch (giờ + Σ target).
--
-- rebase_month_plan(plan, items, note), một transaction, chỉ ceo/admin, chỉ kế hoạch đã chốt. Mỗi phần tử của p_items:
--   {"id": <plan slot id>, "target": n}                       đổi target ca kế hoạch có sẵn (huỷ ⇒ target 0)
--   {"id": ..., "target": n, "session_id"|"shift_slot_id": x}  ca kế hoạch có sẵn nhưng chưa gắn ca thật ⇒ gắn rồi đổi target
--   {"target": n, "date","start_time","end_time", "session_id"|"shift_slot_id": x, "expected": n}
--                                                             ca trên lịch CHƯA có trong kế hoạch ⇒ thêm dòng kế hoạch + gắn ca thật
-- Gắn ca thật: ca live_sessions có sẵn → dùng shift_slot chưa huỷ trỏ tới nó, chưa có thì tạo shift_slot 'finalized' (cùng hình
-- dạng 0151, KHÔNG mở đăng ký); shift_slot 'open' không có phiên (ca OP mở chờ đăng ký) → gắn thẳng.
-- Trigger guard_locked_plan_slot nới thêm đúng một chỗ: INSERT ca ngày đã qua ĐƯỢC khi app.retarget_plan = id kế hoạch (RPC đặt local).
-- brand_month_plans.target_gmv = Σ target ca; nhật ký plan_target_audit (0162) ghi cả dòng thêm mới (target cũ 0).
--
-- Thứ tự deploy: chạy migration TRƯỚC khi dùng nút mới ở client. Client cũ (0162) không bị ảnh hưởng. Chạy lại nhiều lần không sao.

create or replace function guard_locked_plan_slot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_status text;
  v_moved boolean;
  v_retarget boolean;
begin
  if tg_op = 'INSERT' then
    select status into v_status from brand_month_plans where id = new.plan_id;
    -- 0164: rebase_month_plan đặt app.retarget_plan = id kế hoạch (local theo transaction) để đưa ca OP đã qua vào kế hoạch.
    if v_status = 'locked' and new.date < v_today
       and coalesce(current_setting('app.retarget_plan', true), '') <> new.plan_id::text then
      raise exception 'Kế hoạch đã chốt: không thêm ca vào ngày đã qua (%) — target các ngày đã qua giữ như lúc chốt.', to_char(new.date, 'DD/MM');
    end if;
    return new;
  end if;

  select status into v_status from brand_month_plans where id = old.plan_id;
  if not found or v_status is distinct from 'locked' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_moved := tg_op = 'DELETE' or new.date <> old.date or new.start_time <> old.start_time or new.end_time <> old.end_time;
  v_retarget := tg_op = 'UPDATE' and coalesce(current_setting('app.retarget_plan', true), '') = old.plan_id::text;

  if v_moved and old.slot_id is not null and exists (
    select 1 from shift_slots s join live_sessions ls on ls.id = s.session_id
     where s.id = old.slot_id and s.status = 'finalized' and ls.status <> 'Cancelled'
  ) then
    raise exception 'Ca kế hoạch % %–% đã chốt người — không bỏ/dời trong lưới được (chốt lại sẽ giữ ca cũ và mở thêm ca mới). Huỷ ca ở Cửa sổ Ca Live trước.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if old.date < v_today and (v_moved or (new.target_gmv <> old.target_gmv and not v_retarget)) then
    raise exception 'Kế hoạch đã chốt: ca ngày đã qua (% %–%) giữ nguyên giờ và target như lúc chốt — đó là mẫu số run-rate.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function guard_locked_plan_slot() from public;

create or replace function rebase_month_plan(p_plan_id uuid, p_items jsonb, p_note text default '') returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan brand_month_plans%rowtype;
  v_platform session_platform;
  v_batch uuid := gen_random_uuid();
  v_item jsonb;
  v_slot brand_month_plan_slots%rowtype;
  v_id uuid;
  v_new_id uuid;
  v_target numeric;
  v_seen uuid[] := '{}';
  v_seen_ses uuid[] := '{}';
  v_changed int := 0;
  v_past_changed int := 0;
  v_added int := 0;
  v_linked int := 0;
  v_zeroed int := 0;
  v_old_total numeric;
  v_new_total numeric;
  v_ses_id uuid;
  v_ss_id uuid;
  v_ls live_sessions%rowtype;
  v_ss shift_slots%rowtype;
  v_date date;
  v_start time;
  v_end time;
  v_brand_name text;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin') then
    raise exception 'Chỉ ceo/admin được chia lại target kế hoạch đã chốt' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  if v_plan.status <> 'locked' then
    raise exception 'Kế hoạch chưa chốt — chia lại target ở lưới nháp';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Thiếu danh sách ca';
  end if;
  v_platform := coalesce(v_plan.platform, 'TikTok')::session_platform;
  select name into v_brand_name from brands where id = v_plan.brand_id;
  select coalesce(sum(target_gmv), 0) into v_old_total from brand_month_plan_slots where plan_id = p_plan_id;

  perform set_config('app.retarget_plan', p_plan_id::text, true);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_target := (v_item->>'target')::numeric;
    if v_target is null or v_target < 0 then
      raise exception 'Target ca phải là số không âm';
    end if;
    v_ses_id := nullif(v_item->>'session_id', '')::uuid;
    v_ss_id := nullif(v_item->>'shift_slot_id', '')::uuid;
    v_id := nullif(v_item->>'id', '')::uuid;
    v_new_id := null;

    -- ---- Tìm / tạo ca thật (shift_slot) để gắn, nếu phần tử có session_id hoặc shift_slot_id ----
    if v_ses_id is not null then
      if v_ses_id = any (v_seen_ses) then
        raise exception 'Ca thật % xuất hiện hai lần trong danh sách', v_ses_id;
      end if;
      v_seen_ses := v_seen_ses || v_ses_id;
      select * into v_ls from live_sessions where id = v_ses_id;
      if v_ls.id is null or v_ls.brand_id is distinct from v_plan.brand_id or v_ls.platform::text is distinct from v_platform::text then
        raise exception 'Ca thật % không thuộc kênh của kế hoạch này', v_ses_id;
      end if;
      if v_ls.status = 'Cancelled' then
        raise exception 'Ca thật % đã huỷ — không đưa vào kế hoạch', v_ses_id;
      end if;
      select * into v_ss from shift_slots where session_id = v_ses_id and status <> 'cancelled' order by created_at limit 1;
      if v_ss.id is null then
        -- Chỉ mục duy nhất theo (brand, ngày, giờ, sàn) cho ca chưa huỷ: đã có ca mở chờ đăng ký đúng giờ thì dùng nó, ca khác
        -- phiên thì từ chối rõ ràng (hai ca song song cùng giờ không vào chung một kế hoạch được).
        select * into v_ss from shift_slots
         where brand_id = v_plan.brand_id and date = v_ls.date and start_time = v_ls.start_time and end_time = v_ls.end_time
           and platform = v_platform and status <> 'cancelled' limit 1;
        if v_ss.id is not null and v_ss.session_id is not null and v_ss.session_id <> v_ses_id then
          raise exception 'Ca ngày % % trùng giờ với một ca khác của brand — không đưa được hai ca cùng giờ vào kế hoạch', to_char(v_ls.date, 'DD/MM'), to_char(v_ls.start_time, 'HH24:MI');
        end if;
      end if;
      if v_ss.id is null then
        insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                                 notes, status, session_id, created_by)
        values (v_ls.date, v_ls.start_time, v_ls.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), v_platform,
                v_ls.studio_id, coalesce(v_ls.studio_name, ''), '', 'finalized', v_ls.id, auth.uid())
        returning * into v_ss;
      end if;
      v_ss_id := v_ss.id;
      v_date := v_ls.date; v_start := v_ls.start_time; v_end := v_ls.end_time;
    elsif v_ss_id is not null then
      select * into v_ss from shift_slots where id = v_ss_id;
      if v_ss.id is null or v_ss.brand_id is distinct from v_plan.brand_id or v_ss.platform::text is distinct from v_platform::text or v_ss.status = 'cancelled' then
        raise exception 'Ca % không dùng được cho kế hoạch này', v_ss_id;
      end if;
      v_date := v_ss.date; v_start := v_ss.start_time; v_end := v_ss.end_time;
    end if;

    if v_id is not null then
      -- ---- Ca kế hoạch có sẵn ----
      if v_id = any (v_seen) then
        raise exception 'Ca % xuất hiện hai lần trong danh sách', v_id;
      end if;
      v_seen := v_seen || v_id;
      select * into v_slot from brand_month_plan_slots where id = v_id and plan_id = p_plan_id for update;
      if v_slot.id is null then
        raise exception 'Ca % không thuộc kế hoạch này', v_id;
      end if;
      if v_ss_id is not null and v_slot.slot_id is null then
        update brand_month_plan_slots set slot_id = v_ss_id where id = v_slot.id;
        v_linked := v_linked + 1;
      end if;
      if v_slot.target_gmv is distinct from v_target then
        insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
        values (v_batch, p_plan_id, v_slot.id, v_slot.date, v_slot.start_time, v_slot.end_time, v_slot.target_gmv, v_target, coalesce(p_note, ''), auth.uid());
        update brand_month_plan_slots set target_gmv = v_target where id = v_slot.id;
        v_changed := v_changed + 1;
        if v_slot.date < v_today then v_past_changed := v_past_changed + 1; end if;
        if v_target = 0 then v_zeroed := v_zeroed + 1; end if;
      end if;
    else
      -- ---- Ca trên lịch chưa có trong kế hoạch ⇒ thêm dòng kế hoạch ----
      if v_ss_id is null then
        raise exception 'Ca thêm mới phải có session_id hoặc shift_slot_id';
      end if;
      if v_date < v_plan.month or v_date >= (v_plan.month + interval '1 month')::date then
        raise exception 'Ca % ngoài tháng của kế hoạch', to_char(v_date, 'DD/MM');
      end if;
      if exists (select 1 from brand_month_plan_slots where slot_id = v_ss_id and plan_id = p_plan_id) then
        raise exception 'Ca ngày % % đã có trong kế hoạch', to_char(v_date, 'DD/MM'), to_char(v_start, 'HH24:MI');
      end if;
      if exists (select 1 from brand_month_plan_slots where plan_id = p_plan_id and date = v_date and start_time = v_start and end_time = v_end) then
        raise exception 'Kế hoạch đã có ca ngày % % trùng giờ — không thêm được ca thứ hai cùng giờ', to_char(v_date, 'DD/MM'), to_char(v_start, 'HH24:MI');
      end if;
      insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv, slot_id, note, expected_gmv)
      values (p_plan_id, v_date, v_start, v_end, v_target, v_ss_id, 'Ca thêm theo lịch', greatest(coalesce((v_item->>'expected')::numeric, 0), 0))
      returning id into v_new_id;
      insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
      values (v_batch, p_plan_id, v_new_id, v_date, v_start, v_end, 0, v_target, coalesce(p_note, ''), auth.uid());
      v_added := v_added + 1;
    end if;
  end loop;
  perform set_config('app.retarget_plan', '', true);

  select coalesce(sum(target_gmv), 0) into v_new_total from brand_month_plan_slots where plan_id = p_plan_id;
  update brand_month_plans set target_gmv = v_new_total where id = p_plan_id;

  return jsonb_build_object(
    'batch_id', v_batch, 'changed', v_changed, 'past_changed', v_past_changed, 'added', v_added, 'linked', v_linked,
    'zeroed', v_zeroed, 'old_total', v_old_total, 'new_total', v_new_total
  );
end;
$$;

revoke all on function rebase_month_plan(uuid, jsonb, text) from public;
grant execute on function rebase_month_plan(uuid, jsonb, text) to authenticated;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if position('app.retarget_plan' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0 then
    raise exception '0164 chốt 1: guard_locked_plan_slot chưa có nhánh retarget';
  end if;
  if position('không thêm ca vào ngày đã qua' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0 then
    raise exception '0164 chốt 2: guard_locked_plan_slot mất luật chặn thêm ca ngày đã qua của 0133';
  end if;
  if not exists (select 1 from pg_proc where proname = 'rebase_month_plan') then
    raise exception '0164 chốt 3: thiếu rebase_month_plan';
  end if;
  if has_function_privilege('anon', 'public.rebase_month_plan(uuid,jsonb,text)', 'execute') then
    raise exception '0164 chốt 4: anon gọi được rebase_month_plan';
  end if;
end $$;
