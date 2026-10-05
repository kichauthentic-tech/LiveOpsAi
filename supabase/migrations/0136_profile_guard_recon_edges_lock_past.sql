-- 0136 — Audit toàn app lần 3 (2026-10-05). Ba chỗ, đều là thân hàm/trigger — không đổi bảng, không đổi chữ ký RPC.
--
--   1) BẢO MẬT — tài khoản tự nâng quyền. Policy `profiles_update_self_or_ceo` (0012) cho mọi người dùng UPDATE
--      dòng profiles của CHÍNH MÌNH, mọi cột. Đo trên bản replay 0001 -> 0135: tài khoản talent gửi
--      `update profiles set role = 'admin' where id = <mình>` -> thành công, current_user_role() ra 'admin'.
--      Cùng đường đó: brand đổi assigned_brand_id để đọc số brand khác, talent tự bật quyền ở
--      custom_permission_overrides, tài khoản bị khoá tự đổi status về Active. Trên production cột này ghi
--      được (ResetPasswordScreen tự ghi must_change_password qua đúng policy đó).
--      Vá bằng trigger, không đổi policy: người không phải ceo/admin chỉ đổi được name, avatar,
--      must_change_password, last_login của chính mình. CEO không cấp/thu/sửa tài khoản Admin (user chốt
--      23/09: admin > CEO). service_role (server tạo tài khoản) và SQL Editor không bị trigger chặn.
--   2) Đối soát khớp phiên với ca theo khung giờ ĐÓNG (<=, >=) nên chạm mép cũng tính là giao nhau: CROCS T9
--      có 3 phiên bị đưa vào rổ "cần xem lại" chỉ vì ca kế tiếp bắt đầu đúng phút phiên trước tắt. Nay < và >.
--      Lô đã nạp giữ kết quả khớp cũ — up lại file ở Đối Soát để khớp lại.
--   3) Chốt Kế Hoạch Tháng giữa tháng: ca kế hoạch ngày đã qua bị bỏ qua TRƯỚC khi tìm ca đã mở sẵn cùng giờ,
--      nên ca ops tự mở cho ngày đã qua (để ghi ca đã live) không bao giờ được gắn với kế hoạch -> target của
--      ca kế hoạch không đổ xuống ca thật. Nay: có ca cùng giờ thì gắn, không có thì vẫn bỏ qua như 0099.
--
-- Thứ tự với deploy: không phụ thuộc. Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) profiles: chặn tự đổi role / brand / talent / quyền / trạng thái
-- ============================================================================
create or replace function guard_profile_update() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_role text;
begin
  -- SECURITY INVOKER có chủ ý: current_user là role của người gọi. Chỉ lời gọi bằng JWT người dùng
  -- (authenticated) mới bị kiểm; service_role và postgres (SQL Editor, RPC security definer) đi thẳng.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  v_role := coalesce(current_user_role()::text, '');
  if v_role = 'admin' then
    return new;
  end if;
  if v_role = 'ceo' then
    if old.role = 'admin' or new.role = 'admin' then
      raise exception 'Chỉ Admin được cấp, thu hoặc sửa tài khoản Admin.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id is distinct from old.id
     or new.email is distinct from old.email
     or new.role is distinct from old.role
     or new.custom_role_title is distinct from old.custom_role_title
     or new.status is distinct from old.status
     or new.assigned_brand_id is distinct from old.assigned_brand_id
     or new.assigned_talent_id is distinct from old.assigned_talent_id
     or new.custom_permission_overrides is distinct from old.custom_permission_overrides
     or new.created_at is distinct from old.created_at then
    raise exception 'Bạn chỉ sửa được tên hiển thị và mật khẩu của mình — vai trò, brand, hồ sơ talent và quyền do CEO/Admin đổi ở Phân Quyền & Role.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function guard_profile_update() from public;

drop trigger if exists trg_guard_profile_update on profiles;
create trigger trg_guard_profile_update
  before update on profiles
  for each row execute function guard_profile_update();

-- ============================================================================
-- 2) Đối soát: khớp theo giao nhau thật (thân hàm = 0133, chỉ đổi 2 dòng so sánh)
-- ============================================================================
create or replace function import_live_reconciliation(
  p_file_name text,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb,
  -- default null CHỈ để client cũ (5 tham số) nhận câu lỗi rõ ràng thay vì "function not found".
  p_brand_id uuid default null
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
  if p_brand_id is null then
    raise exception 'Chọn brand của file trước khi up — file Creator-Live-Performance là của MỘT tài khoản, khớp theo giờ với ca của brand khác sẽ chia nhầm GMV.';
  end if;
  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by, brand_id)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid(), p_brand_id)
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
revoke all on function import_live_reconciliation(text, text, date, date, jsonb, uuid) from public;
grant execute on function import_live_reconciliation(text, text, date, date, jsonb, uuid) to authenticated;

-- ============================================================================
-- 3) Chốt Kế Hoạch Tháng: ca kế hoạch ngày đã qua vẫn gắn được với ca ops đã mở sẵn (thân hàm = 0099)
-- ============================================================================
create or replace function lock_month_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
  v_brand_name text;
  v_studio_id uuid;
  v_studio_name text := '';
  v_ps record;
  v_existing uuid;
  v_new uuid;
  v_created int := 0;
  v_linked int := 0;
  v_cancelled int := 0;
  v_kept_registered int := 0;
  v_kept int := 0;
  v_skipped_past int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được chốt kế hoạch' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  select name into v_brand_name from brands where id = v_plan.brand_id;
  select bs.studio_id, st.name into v_studio_id, v_studio_name
    from brand_studios bs join studios st on st.id = bs.studio_id
   where bs.brand_id = v_plan.brand_id and bs.platform = 'TikTok';

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
    select ps.* from brand_month_plan_slots ps
    left join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and (ps.slot_id is null or s.id is null or s.status = 'cancelled')
    order by ps.date, ps.start_time
  loop
    select id into v_existing from shift_slots s
      where s.brand_id = v_plan.brand_id and s.date = v_ps.date and s.start_time = v_ps.start_time
        and s.end_time = v_ps.end_time and s.platform = 'TikTok' and s.status <> 'cancelled'
      limit 1;
    if v_existing is not null then
      -- Gắn để đổ target, KHÔNG gán plan_id: ca này không phải của kế hoạch.
      update brand_month_plan_slots set slot_id = v_existing where id = v_ps.id;
      if v_studio_id is not null then
        update shift_slots set studio_id = v_studio_id, studio_name = coalesce(v_studio_name, '')
         where id = v_existing and studio_id is null;
      end if;
      v_linked := v_linked + 1;
    elsif v_ps.date < v_today then
      -- Q7 (0099): ngày đã qua thì KHÔNG sinh ca mới (không ai đăng ký được nữa). 0136: nhưng nếu ops đã tự mở
      -- ca đúng giờ đó (Lịch & Studio, nhánh "nạp bù ca đã live") thì vẫn GẮN ở nhánh trên để target đổ xuống ca.
      v_skipped_past := v_skipped_past + 1;
    else
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                               notes, status, created_by, plan_id)
      values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), 'TikTok',
              v_studio_id, coalesce(v_studio_name, ''), v_ps.note, 'open', auth.uid(), p_plan_id)
      returning id into v_new;
      update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
      v_created := v_created + 1;
    end if;
    v_existing := null;
  end loop;

  select count(*) into v_kept from brand_month_plan_slots ps
    join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and s.status <> 'cancelled';

  update brand_month_plans set status = 'locked', locked_at = now(), locked_by = auth.uid() where id = p_plan_id;

  return jsonb_build_object('created', v_created, 'linked', v_linked, 'cancelled', v_cancelled,
                            'kept_registered', v_kept_registered, 'total_slots', v_kept,
                            'skipped_past', v_skipped_past);
end $$;

grant execute on function lock_month_plan(uuid) to authenticated;

-- ============================================================================
-- 4) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_profile_update') then
    raise exception '0136 chốt 1: thiếu trigger trg_guard_profile_update';
  end if;
  if pg_get_functiondef('public.import_live_reconciliation(text, text, date, date, jsonb, uuid)'::regprocedure)
       !~ 'rr\.started_at < session_boundary_at' then
    raise exception '0136 chốt 2: import_live_reconciliation vẫn khớp theo khung đóng';
  end if;
  if pg_get_functiondef('public.lock_month_plan(uuid)'::regprocedure) !~ 'elsif v_ps\.date < v_today' then
    raise exception '0136 chốt 3: lock_month_plan vẫn bỏ qua ngày đã qua trước khi tìm ca có sẵn';
  end if;
end $$;
