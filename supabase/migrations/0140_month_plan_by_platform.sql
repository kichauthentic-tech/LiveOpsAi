-- 0140 — Kế Hoạch Tháng + target TÁCH THEO SÀN (TikTok / Shopee).
--
-- User chốt 06/10: target riêng từng sàn (CROCS T10 5,141 tỷ là target TikTok), mỗi sàn một kế hoạch, một lịch camp,
-- một KPI cả shop. Trước 0140 khoá kế hoạch là (brand, tháng) và lock_month_plan ghi cứng sàn 'TikTok' + phòng TikTok,
-- nên ca Shopee của VERA/JOCKEY/Franklin không có kế hoạch nào và bị tính "ngoài kế hoạch, target 0" ở run-rate.
--
--   1) brand_month_plans.platform ('TikTok' mặc định — mọi kế hoạch cũ là TikTok); khoá (brand, tháng, sàn).
--   2) lock_month_plan: sinh/gắn ca ĐÚNG SÀN của kế hoạch, lấy phòng của sàn đó (brand_studios theo sàn).
--   3) Thông báo mở đăng ký ghi rõ sàn khi là Shopee.
-- Bảng brand_month_plan_slots không đổi: sàn của ca kế hoạch là sàn của kế hoạch chứa nó.
--
-- Thứ tự với deploy: chạy NGAY SAU 0139, cùng lúc deploy client mới. Client mới đọc kế hoạch bằng select * rồi lọc sàn
-- phía client (DB cũ thiếu cột thì coi là TikTok) — đọc chạy cả hai phía. Ghi: client cũ + DB mới thì "Lưu" kế hoạch báo
-- lỗi ON CONFLICT (khoá đã đổi thành brand, tháng, sàn); client mới + DB cũ thì lưu kế hoạch báo thiếu cột platform. Không
-- mất dữ liệu ở cả hai trạng thái. Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Cột sàn + khoá
-- ============================================================================
alter table brand_month_plans add column if not exists platform text not null default 'TikTok';

do $$
declare
  c record;
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_platform_check') then
    alter table brand_month_plans add constraint brand_month_plans_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  -- Khoá cũ đặt tên brand_month_plans_unique (0090); tìm theo định nghĩa để chắc chắn.
  for c in
    select conname from pg_constraint
     where conrelid = 'brand_month_plans'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (brand_id, month)'
  loop
    execute format('alter table brand_month_plans drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_brand_month_platform_key') then
    alter table brand_month_plans add constraint brand_month_plans_brand_month_platform_key unique (brand_id, month, platform);
  end if;
end $$;

-- ============================================================================
-- 2) Chốt kế hoạch theo sàn (thân hàm = 0136, chỉ thay 'TikTok' cứng bằng sàn của kế hoạch)
-- ============================================================================
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
    select ps.* from brand_month_plan_slots ps
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

revoke all on function lock_month_plan(uuid) from public;
grant execute on function lock_month_plan(uuid) to authenticated;

-- ============================================================================
-- 3) Thông báo mở đăng ký ghi sàn (thân hàm = 0116)
-- ============================================================================
create or replace function notify_plan_locked() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_open int;
  v_brand text;
begin
  select count(*) into v_open from shift_slots
   where plan_id = new.id and status = 'open' and date >= v_today;
  if v_open = 0 then
    return new;
  end if;
  select name into v_brand from brands where id = new.brand_id;
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, 'shift_open',
    'Lịch tháng ' || to_char(new.month, 'MM/YYYY') || ' đã mở đăng ký',
    coalesce(v_brand, 'Brand') || case when new.platform = 'Shopee' then ' Shopee' else '' end
      || ': ' || v_open || ' ca đang chờ đăng ký. Vào Đăng Ký Ca để báo ca bạn rảnh.',
    null, new.brand_id
  from profiles p
  where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
    and p.id is distinct from auth.uid();
  return new;
end;
$$;
revoke all on function notify_plan_locked() from public;

-- ============================================================================
-- 4) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_brand_month_platform_key') then
    raise exception '0140 chốt 1: thiếu khoá (brand, tháng, sàn)';
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'brand_month_plans'::regclass and contype = 'u'
              and pg_get_constraintdef(oid) = 'UNIQUE (brand_id, month)') then
    raise exception '0140 chốt 2: khoá cũ (brand, tháng) vẫn còn';
  end if;
  if pg_get_functiondef('public.lock_month_plan(uuid)'::regprocedure) ~ '''TikTok''\s*(,|and|$)' then
    raise exception '0140 chốt 3: lock_month_plan vẫn ghi cứng sàn TikTok';
  end if;
end $$;
