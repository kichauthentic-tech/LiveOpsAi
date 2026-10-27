-- 0185 — Kế Hoạch Tháng: vá các điểm gãy của audit 27/10.
--
-- Phần 1  lock_month_plan: "Chốt lại" KHÔNG mở lại ca kế hoạch đã huỷ. Trước đây vòng lặp nhận cả ca có shift_slot 'cancelled'
--         (OP huỷ ca ở Bảng Vận Hành) ⇒ ca ngày sắp tới bị sinh lại thành ca chờ đăng ký + báo talent; ca ngày đã qua bị đếm vào
--         "bỏ qua N ca ngày đã qua (ca nào đã live thì mở bù)". Nay: ca đã huỷ chỉ được gắn lại khi trên lịch đã có ca THẬT thay thế
--         đúng giờ (OP tạo lại ca), còn không thì giữ nguyên trạng thái huỷ (luật run-rate: ca kế hoạch huỷ giữ target). Trả thêm
--         `kept_cancelled`. Thân hàm còn lại = 0151 + guard trainer của 0180.
-- Phần 2  guard_locked_plan_slot: sau chốt, đổi target một ca (không qua RPC chia lại) chỉ ceo/admin — cùng mức với
--         rebase_month_plan; mọi thay đổi target tháng sau chốt (sửa ca, thêm ca, bỏ ca) ghi plan_target_audit. Nới thêm một chỗ:
--         đồng bộ giờ ca kế hoạch theo ca thật (Phần 3) được dời ca, kể cả ca đã qua / đã chốt người.
-- Phần 3  OP dời giờ/ngày ca thật ⇒ ca chờ (shift_slot) + ca kế hoạch gắn với nó dời theo (đo 27/10: CROCS 27, 30, 31/10 kế hoạch
--         20–23h, ca thật 21–24h; Franklin Shopee 11/10 tương tự). Ca dời sang tháng khác thì ca kế hoạch giữ nguyên. Đụng khoá duy
--         nhất (đã có ca cùng giờ) thì bỏ qua dòng đó. Kèm đồng bộ một lần cho các ca đang lệch.
-- Phần 4  replace_plan_slots: lưu lưới trong MỘT transaction (trước: client xoá ca cũ rồi mới upsert — lỗi giữa chừng là mất ca),
--         một batch nhật ký cho cả lượt lưu.
-- Thứ tự deploy: chạy TRƯỚC khi deploy client mới (client mới gọi replace_plan_slots; DB chưa có thì client tự rơi về cách cũ).
-- Chạy lại nhiều lần không sao.

-- ===== Phần 1 =====
create or replace function lock_month_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
  v_platform session_platform;
  v_brand_name text;
  v_studio_id uuid;
  v_studio_name text := '';
  v_ps record;
  v_existing uuid;
  v_new uuid;
  v_sess_id uuid;
  v_sess_studio uuid;
  v_sess_studio_name text;
  v_linked_sessions int := 0;
  v_created int := 0;
  v_linked int := 0;
  v_cancelled int := 0;
  v_kept_registered int := 0;
  v_kept int := 0;
  v_skipped_past int := 0;
  v_kept_cancelled int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations', 'trainer') then
    raise exception 'Chỉ ceo/admin/operations được chốt kế hoạch' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  v_platform := coalesce(v_plan.platform, 'TikTok')::session_platform;
  select name into v_brand_name from brands where id = v_plan.brand_id;
  select bs.studio_id, st.name into v_studio_id, v_studio_name
    from brand_studios bs join studios st on st.id = bs.studio_id
   where bs.brand_id = v_plan.brand_id and bs.platform = v_platform;

  -- Huỷ ca mở mồ côi: sinh từ plan này (plan_id), không còn ca kế hoạch trỏ tới, chưa ai đăng ký.
  for v_ps in
    select s.id from shift_slots s
    where s.plan_id = p_plan_id and s.status = 'open'
      and not exists (select 1 from brand_month_plan_slots ps where ps.slot_id = s.id)
  loop
    if exists (select 1 from session_availability a where a.slot_id = v_ps.id) then
      v_kept_registered := v_kept_registered + 1;
    else
      update shift_slots set status = 'cancelled' where id = v_ps.id;
      v_cancelled := v_cancelled + 1;
    end if;
  end loop;

  for v_ps in
    select ps.*, (s.id is not null and s.status = 'cancelled') as was_cancelled
      from brand_month_plan_slots ps
      left join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and (ps.slot_id is null or s.id is null or s.status = 'cancelled')
    order by ps.date, ps.start_time
  loop
    -- Chỉ gắn ca ĐÚNG SÀN: VERA live TikTok và Shopee cùng giờ, gắn lẫn sàn là đổ target TikTok xuống ca Shopee.
    select id into v_existing from shift_slots s
      where s.brand_id = v_plan.brand_id and s.date = v_ps.date and s.start_time = v_ps.start_time
        and s.end_time = v_ps.end_time and s.platform = v_platform and s.status <> 'cancelled'
      limit 1;
    if v_existing is not null then
      -- Gắn để đổ target, KHÔNG gán plan_id: ca này không phải của kế hoạch.
      update brand_month_plan_slots set slot_id = v_existing where id = v_ps.id;
      if v_studio_id is not null then
        update shift_slots set studio_id = v_studio_id, studio_name = coalesce(v_studio_name, '')
         where id = v_existing and studio_id is null;
      end if;
      v_linked := v_linked + 1;
    else
      -- 0151: ca thật nạp sẵn (chưa có shift_slot nào trỏ tới) cùng brand|ngày|giờ|sàn.
      select ls.id, ls.studio_id, ls.studio_name into v_sess_id, v_sess_studio, v_sess_studio_name
        from live_sessions ls
       where ls.brand_id = v_plan.brand_id and ls.platform = v_platform and ls.date = v_ps.date
         and ls.start_time = v_ps.start_time and ls.end_time = v_ps.end_time and ls.status <> 'Cancelled'
         and not exists (select 1 from shift_slots x where x.session_id = ls.id and x.status <> 'cancelled')
       order by ls.created_at, ls.id
       limit 1;
      if v_sess_id is not null then
        -- Ca 'finalized' trỏ tới ca thật (cùng hình dạng finalize_shift_slot tạo): target đổ xuống ca thật, không mở đăng ký.
        insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                                 notes, status, session_id, created_by)
        values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), v_platform,
                v_sess_studio, coalesce(v_sess_studio_name, ''), v_ps.note, 'finalized', v_sess_id, auth.uid())
        returning id into v_new;
        update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
        v_linked_sessions := v_linked_sessions + 1;
      elsif v_ps.was_cancelled then
        -- 0185: ca đã huỷ mà lịch không có ca thay thế ⇒ giữ huỷ, KHÔNG mở lại chờ đăng ký.
        v_kept_cancelled := v_kept_cancelled + 1;
      elsif v_ps.date < v_today then
        v_skipped_past := v_skipped_past + 1;
      else
        insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                                 notes, status, created_by, plan_id)
        values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), v_platform,
                v_studio_id, coalesce(v_studio_name, ''), v_ps.note, 'open', auth.uid(), p_plan_id)
        returning id into v_new;
        update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
        v_created := v_created + 1;
      end if;
    end if;
    v_existing := null;
    v_sess_id := null;
  end loop;

  select count(*) into v_kept from brand_month_plan_slots ps
    join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and s.status <> 'cancelled';

  update brand_month_plans set status = 'locked', locked_at = now(), locked_by = auth.uid() where id = p_plan_id;

  return jsonb_build_object('created', v_created, 'linked', v_linked, 'cancelled', v_cancelled,
                            'kept_registered', v_kept_registered, 'total_slots', v_kept,
                            'skipped_past', v_skipped_past,
                            'linked_sessions', v_linked_sessions,
                            'kept_cancelled', v_kept_cancelled);
end $$;

revoke all on function lock_month_plan(uuid) from public;
grant execute on function lock_month_plan(uuid) to authenticated;

-- ===== Phần 2 =====
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
  v_sync boolean;
  v_batch uuid := coalesce(nullif(current_setting('app.plan_edit_batch', true), '')::uuid, gen_random_uuid());
begin
  if tg_op = 'INSERT' then
    select status into v_status from brand_month_plans where id = new.plan_id;
    -- 0164: rebase_month_plan đặt app.retarget_plan = id kế hoạch (local theo transaction) để đưa ca OP đã qua vào kế hoạch.
    if v_status = 'locked' and new.date < v_today
       and coalesce(current_setting('app.retarget_plan', true), '') <> new.plan_id::text then
      raise exception 'Kế hoạch đã chốt: không thêm ca vào ngày đã qua (%) — target các ngày đã qua giữ như lúc chốt.', to_char(new.date, 'DD/MM');
    end if;
    -- 0185: thêm ca sau chốt làm tăng target tháng ⇒ ghi nhật ký (RPC chia lại tự ghi của nó).
    if v_status = 'locked' and coalesce(new.target_gmv, 0) <> 0
       and coalesce(current_setting('app.retarget_plan', true), '') <> new.plan_id::text then
      insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
      values (v_batch, new.plan_id, new.id, new.date, new.start_time, new.end_time, 0, new.target_gmv, 'Thêm ca sau chốt', auth.uid());
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
  -- 0185: đồng bộ giờ theo ca thật (sync_session_plan_time) — chỉ dời giờ, không đổi target.
  v_sync := tg_op = 'UPDATE' and coalesce(current_setting('app.plan_time_sync', true), '') = old.plan_id::text
            and new.target_gmv is not distinct from old.target_gmv;

  if v_sync then
    return new;
  end if;

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

  -- 0185: đổi target một ca sau chốt = đổi mẫu số run-rate của tháng ⇒ cùng quyền với "Chia lại theo lịch hiện có", có nhật ký.
  if tg_op = 'UPDATE' and not v_retarget and new.target_gmv is distinct from old.target_gmv then
    if coalesce(current_user_role()::text, '') not in ('ceo', 'admin') then
      raise exception 'Kế hoạch đã chốt: chỉ ceo/admin đổi được target ca (% %–%). Ca thêm mới sau chốt vẫn tự nhận target = dự báo.',
        to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI') using errcode = '42501';
    end if;
    insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
    values (v_batch, old.plan_id, old.id, old.date, old.start_time, old.end_time, old.target_gmv, new.target_gmv, 'Sửa tay ở lưới', auth.uid());
  end if;

  if tg_op = 'DELETE' and coalesce(old.target_gmv, 0) <> 0 then
    insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
    values (v_batch, old.plan_id, old.id, old.date, old.start_time, old.end_time, old.target_gmv, 0, 'Bỏ ca khỏi kế hoạch', auth.uid());
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function guard_locked_plan_slot() from public;

-- ===== Phần 3 =====
create or replace function sync_session_plan_time(p_session_id uuid) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ls live_sessions%rowtype;
  v_ss record;
  v_ps record;
  v_n int := 0;
begin
  select * into v_ls from live_sessions where id = p_session_id;
  if v_ls.id is null or v_ls.status = 'Cancelled' then
    return 0;
  end if;
  for v_ss in select * from shift_slots where session_id = p_session_id and status <> 'cancelled' loop
    if v_ss.date <> v_ls.date or v_ss.start_time <> v_ls.start_time or v_ss.end_time <> v_ls.end_time then
      begin
        update shift_slots set date = v_ls.date, start_time = v_ls.start_time, end_time = v_ls.end_time where id = v_ss.id;
      exception when unique_violation then
        null; -- đã có ca chờ khác đúng giờ mới: để nguyên, ops xử tay
      end;
    end if;
    for v_ps in
      select ps.id, ps.plan_id, ps.date, ps.start_time, ps.end_time, p.month
        from brand_month_plan_slots ps join brand_month_plans p on p.id = ps.plan_id
       where ps.slot_id = v_ss.id
    loop
      continue when v_ps.date = v_ls.date and v_ps.start_time = v_ls.start_time and v_ps.end_time = v_ls.end_time;
      -- Ca dời sang tháng khác: không kéo ca kế hoạch ra khỏi tháng của nó.
      continue when date_trunc('month', v_ls.date)::date <> v_ps.month;
      perform set_config('app.plan_time_sync', v_ps.plan_id::text, true);
      begin
        update brand_month_plan_slots set date = v_ls.date, start_time = v_ls.start_time, end_time = v_ls.end_time where id = v_ps.id;
        v_n := v_n + 1;
      exception when unique_violation then
        null; -- kế hoạch đã có ca đúng giờ mới
      end;
      perform set_config('app.plan_time_sync', '', true);
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke all on function sync_session_plan_time(uuid) from public, anon, authenticated;

create or replace function trg_sync_session_plan_time() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform sync_session_plan_time(new.id);
  return new;
end;
$$;
revoke all on function trg_sync_session_plan_time() from public, anon, authenticated;

drop trigger if exists trg_sync_session_plan_time on live_sessions;
create trigger trg_sync_session_plan_time
  after update of date, start_time, end_time on live_sessions
  for each row
  when (new.date is distinct from old.date or new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time)
  execute function trg_sync_session_plan_time();

-- Đồng bộ một lần các ca đang lệch.
do $$
declare
  r record;
begin
  for r in
    select distinct ls.id
      from brand_month_plan_slots ps
      join shift_slots s on s.id = ps.slot_id and s.status <> 'cancelled'
      join live_sessions ls on ls.id = s.session_id and ls.status <> 'Cancelled'
     where ps.date <> ls.date or ps.start_time <> ls.start_time or ps.end_time <> ls.end_time
        or s.date <> ls.date or s.start_time <> ls.start_time or s.end_time <> ls.end_time
  loop
    perform sync_session_plan_time(r.id);
  end loop;
end $$;

-- ===== Phần 4 =====
-- p_slots: [{id?, date, start_time, end_time, target_gmv, expected_gmv, note}]. Ca cũ không còn trong danh sách (theo khoá
-- ngày|giờ) bị xoá; còn lại upsert theo khoá. Trigger guard vẫn chạy cho từng dòng — lỗi là rollback cả lượt.
create or replace function replace_plan_slots(p_plan_id uuid, p_slots jsonb) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations', 'trainer') then
    raise exception 'Không có quyền sửa kế hoạch tháng' using errcode = '42501';
  end if;
  if not exists (select 1 from brand_month_plans where id = p_plan_id) then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'Danh sách ca không hợp lệ';
  end if;
  perform set_config('app.plan_edit_batch', gen_random_uuid()::text, true);

  delete from brand_month_plan_slots ps
   where ps.plan_id = p_plan_id
     and not exists (
       select 1 from jsonb_array_elements(p_slots) x
        where (x->>'date')::date = ps.date and (x->>'start_time')::time = ps.start_time and (x->>'end_time')::time = ps.end_time
     );

  -- UPDATE dòng có sẵn rồi INSERT dòng mới, KHÔNG dùng insert … on conflict: trigger BEFORE INSERT chạy cả với dòng sẽ rơi vào
  -- nhánh conflict, nên upsert lại một ca ngày đã qua của kế hoạch đã chốt bị guard coi là "thêm ca vào ngày đã qua".
  update brand_month_plan_slots ps
     set target_gmv = coalesce((x->>'target_gmv')::numeric, 0), expected_gmv = coalesce((x->>'expected_gmv')::numeric, 0),
         note = coalesce(x->>'note', '')
    from jsonb_array_elements(p_slots) x
   where ps.plan_id = p_plan_id
     and (x->>'date')::date = ps.date and (x->>'start_time')::time = ps.start_time and (x->>'end_time')::time = ps.end_time
     and (ps.target_gmv is distinct from coalesce((x->>'target_gmv')::numeric, 0)
          or ps.expected_gmv is distinct from coalesce((x->>'expected_gmv')::numeric, 0)
          or ps.note is distinct from coalesce(x->>'note', ''));

  insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv, expected_gmv, note)
  select distinct on ((x->>'date')::date, (x->>'start_time')::time, (x->>'end_time')::time)
         p_plan_id, (x->>'date')::date, (x->>'start_time')::time, (x->>'end_time')::time,
         coalesce((x->>'target_gmv')::numeric, 0), coalesce((x->>'expected_gmv')::numeric, 0), coalesce(x->>'note', '')
    from jsonb_array_elements(p_slots) x
   where not exists (
     select 1 from brand_month_plan_slots ps
      where ps.plan_id = p_plan_id
        and ps.date = (x->>'date')::date and ps.start_time = (x->>'start_time')::time and ps.end_time = (x->>'end_time')::time
   );

  perform set_config('app.plan_edit_batch', '', true);
  select count(*) into v_n from brand_month_plan_slots where plan_id = p_plan_id;
  return v_n;
end;
$$;
revoke all on function replace_plan_slots(uuid, jsonb) from public, anon;
grant execute on function replace_plan_slots(uuid, jsonb) to authenticated;

-- ===== Chốt tự kiểm =====
do $$
begin
  if position('kept_cancelled' in pg_get_functiondef('public.lock_month_plan(uuid)'::regprocedure)) = 0
     or position('trainer' in pg_get_functiondef('public.lock_month_plan(uuid)'::regprocedure)) = 0 then
    raise exception '0185: lock_month_plan chưa đúng bản mới';
  end if;
  if position('app.plan_time_sync' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0
     or position('app.retarget_plan' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0 then
    raise exception '0185: guard_locked_plan_slot chưa đúng bản mới';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_sync_session_plan_time') then
    raise exception '0185: thiếu trigger đồng bộ giờ';
  end if;
end $$;
