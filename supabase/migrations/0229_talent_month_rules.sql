-- 0229: BẢNG LUẬT ĐẶT GIỜ THEO THÁNG × NGƯỜI × VAI (Điều Phối Lịch Live → "Luật đặt giờ từng người", lưới kiểu Excel).
-- Thay hai bảng rời: talent_month_commitments (0223: giờ theo tháng) và talent_schedule_rules (0224: luật ngày/brand/ca đêm, không theo tháng).
-- Bộ xếp tự fill đọc bảng này. Hai bảng cũ GIỮ NGUYÊN (không xoá) làm nguồn backfill; app chuyển sang đọc bảng mới.
--
-- Một dòng = (month, talent_id, role). Người làm cả host lẫn trợ có hai dòng.
--   max_hours / first_half_max : trần giờ THÁNG và trần nửa đầu — dùng chung cả hai vai của người đó (app ghi đồng bộ cả hai dòng).
--   role_hours   : trần giờ riêng của vai này (chia quỹ giờ giữa 2 vai). null = không chia.
--   day_kinds    : loại ngày nhận chung ['weekend','camp','regular']; rỗng = mọi ngày.
--   night        : 'any' (không đặt) | 'only' (chỉ ca đêm) | 'no' (không nhận ca đêm).
--   brand_rules  : { "<brandId>": { "hours": số | "x" | null, "days": [...] | null, "night": "any"|"only"|"no"|null } } — "x" = không nhận brand;
--                  days/night null = theo luật chung.
--   lane_hours   : { "<brandId>|<TikTok|Shopee|Website>": số | "x" } — trần giờ làn brand × sàn; "x" = không xếp làn đó.
-- Mọi trần là trần TỐI ĐA (không phải giờ chia cố định). Không có dòng = người đó chỉ chịu luật mặc định của bộ xếp (trần tự suy).
--
-- KHOÁ THÁNG ĐÃ QUA bằng trigger: ghi/sửa/xoá dòng của tháng đã kết thúc (ngày cuối tháng < hôm nay theo giờ Việt Nam) bị từ chối ở mọi
-- nơi (app, REST, SQL editor), kể cả admin. Mở khoá có chủ đích = `alter table talent_month_rules disable trigger talent_month_rules_lock`.

create table if not exists talent_month_rules (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  talent_id uuid not null references talents(id) on delete cascade,
  role text not null check (role in ('host', 'assistant')),
  max_hours numeric check (max_hours is null or max_hours > 0),
  first_half_max numeric check (first_half_max is null or first_half_max >= 0),
  role_hours numeric check (role_hours is null or role_hours >= 0),
  day_kinds jsonb not null default '[]'::jsonb,
  night text not null default 'any' check (night in ('any', 'only', 'no')),
  brand_rules jsonb not null default '{}'::jsonb,
  lane_hours jsonb not null default '{}'::jsonb,
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (month, talent_id, role)
);
create index if not exists idx_talent_month_rules_month on talent_month_rules (month);

alter table talent_month_rules enable row level security;
drop policy if exists "talent_month_rules_read_staff" on talent_month_rules;
create policy "talent_month_rules_read_staff" on talent_month_rules for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "talent_month_rules_write_staff" on talent_month_rules;
create policy "talent_month_rules_write_staff" on talent_month_rules for all
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));

-- ---------------------------------------------------------------------------------------------------------------------------
-- Backfill từ hai bảng cũ (làm TRƯỚC khi tạo trigger khoá để chép được cả tháng cũ).
-- Giờ cam kết (0223) → dòng của vai chính hồ sơ ở đúng tháng đó. Luật (0224, không theo tháng) → chép vào tháng hiện tại và tháng kế.
-- clauses [{brandId?, days[]}]: điều kiện không brand ⇒ day_kinds (hợp các điều kiện); điều kiện có brand ⇒ brand_rules[brand].days.
-- ---------------------------------------------------------------------------------------------------------------------------
do $$
declare
  cur_month text := to_char((now() at time zone 'Asia/Ho_Chi_Minh')::date, 'YYYY-MM');
  next_month text := to_char(((now() at time zone 'Asia/Ho_Chi_Minh')::date + interval '1 month')::date, 'YYYY-MM');
  r record;
  cl jsonb;
  m text;
  v_days jsonb;
  v_brands jsonb;
  v_role text;
begin
  if to_regclass('public.talent_month_commitments') is not null then
    insert into talent_month_rules (month, talent_id, role, max_hours, first_half_max, note)
    select c.month, c.talent_id, case when t.role::text = 'Assistant' then 'assistant' else 'host' end, c.max_hours, c.first_half_max, coalesce(c.note, '')
    from talent_month_commitments c join talents t on t.id = c.talent_id
    on conflict (month, talent_id, role) do nothing;
  end if;

  if to_regclass('public.talent_schedule_rules') is not null then
    for r in select s.talent_id, s.clauses, s.night, s.note, t.role::text as trole from talent_schedule_rules s join talents t on t.id = s.talent_id loop
      v_role := case when r.trole = 'Assistant' then 'assistant' else 'host' end;
      v_days := '[]'::jsonb;
      v_brands := '{}'::jsonb;
      for cl in select * from jsonb_array_elements(case when jsonb_typeof(r.clauses) = 'array' then r.clauses else '[]'::jsonb end) loop
        if coalesce(cl->>'brandId', '') = '' then
          select coalesce(jsonb_agg(distinct d), '[]'::jsonb) into v_days
            from (select jsonb_array_elements_text(v_days) as d union select jsonb_array_elements_text(coalesce(cl->'days', '[]'::jsonb))) u;
        else
          v_brands := v_brands || jsonb_build_object(cl->>'brandId', jsonb_build_object('hours', null, 'days', coalesce(cl->'days', '[]'::jsonb), 'night', null));
        end if;
      end loop;
      foreach m in array array[cur_month, next_month] loop
        insert into talent_month_rules (month, talent_id, role, day_kinds, night, brand_rules, note)
        values (m, r.talent_id, v_role, v_days, case when r.night then 'only' else 'any' end, v_brands, coalesce(r.note, ''))
        on conflict (month, talent_id, role) do update
          set day_kinds = excluded.day_kinds, night = excluded.night, brand_rules = excluded.brand_rules;
      end loop;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------------
-- Khoá tháng đã qua.
-- ---------------------------------------------------------------------------------------------------------------------------
create or replace function talent_month_rules_lock() returns trigger language plpgsql as $$
declare
  m text := coalesce(case when tg_op = 'DELETE' then old.month else new.month end, '');
  last_day date := ((m || '-01')::date + interval '1 month' - interval '1 day')::date;
begin
  if last_day < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Tháng % đã khoá, không sửa được luật đặt giờ của tháng đã qua', m using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  -- đổi tháng của một dòng cũng không được kéo dòng ra khỏi/vào tháng đã khoá
  if tg_op = 'UPDATE' and old.month <> new.month and (((old.month || '-01')::date + interval '1 month' - interval '1 day')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date) then
    raise exception 'Tháng % đã khoá', old.month using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists talent_month_rules_lock on talent_month_rules;
create trigger talent_month_rules_lock before insert or update or delete on talent_month_rules
  for each row execute function talent_month_rules_lock();
