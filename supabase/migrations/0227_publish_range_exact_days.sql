-- 0227: công bố theo khoảng ngày CHÍNH XÁC. Trước (0225) tuần vắt qua biên bị công bố trọn tuần: đợt 1–15/12 kéo theo ca 16–20/12.
-- publish_roster_range đặt biến giao dịch app.publish_from / app.publish_to; publish_roster_week (vá bằng replace) chỉ lấy nháp trong khoảng đó
-- khi biến có giá trị. Gọi publish_roster_week trực tiếp (nút "Công bố tuần này") không đặt biến ⇒ vẫn trọn tuần như cũ.
do $$
declare
  def text;
  old_s constant text := E'and d.host_id is not null;';
  new_s constant text := E'and d.host_id is not null\n' ||
    E'     and s.date between coalesce(nullif(current_setting(''app.publish_from'', true), '''')::date, s.date)\n' ||
    E'                    and coalesce(nullif(current_setting(''app.publish_to'', true), '''')::date, s.date);';
begin
  select pg_get_functiondef('public.publish_roster_week(date)'::regprocedure) into def;
  if position('app.publish_from' in def) > 0 then return; end if;
  if position(old_s in def) = 0 then raise exception '0227: chưa có bản vá 0225 trong publish_roster_week'; end if;
  execute replace(def, old_s, new_s);
end $$;

create or replace function public.publish_roster_range(p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_w date;
  v_last date;
  v_n int := 0;
  v_sent int := 0;
  v_weeks int := 0;
  r jsonb;
begin
  perform private.roster_staff_guard();
  if p_to < p_from or p_to - p_from > 40 then
    raise exception 'Khoảng công bố không hợp lệ (tối đa ~1 tháng).';
  end if;
  perform set_config('app.publish_from', p_from::text, true);
  perform set_config('app.publish_to', p_to::text, true);
  v_w := p_from - (extract(isodow from p_from)::int - 1);
  v_last := p_to - (extract(isodow from p_to)::int - 1);
  while v_w <= v_last loop
    if exists (
      select 1 from roster_drafts d join shift_slots s on s.id = d.slot_id
       where s.date between greatest(v_w, p_from) and least(v_w + 6, p_to)
         and s.status = 'open' and s.session_id is null and d.host_id is not null
    ) then
      r := public.publish_roster_week(v_w);
      v_n := v_n + coalesce((r ->> 'published')::int, 0);
      v_sent := v_sent + coalesce((r ->> 'notified')::int, 0);
      v_weeks := v_weeks + 1;
    end if;
    v_w := v_w + 7;
  end loop;
  perform set_config('app.publish_from', '', true);
  perform set_config('app.publish_to', '', true);
  return jsonb_build_object('published', v_n, 'notified', v_sent, 'weeks', v_weeks);
end;
$$;
revoke all on function public.publish_roster_range(date, date) from public;
grant execute on function public.publish_roster_range(date, date) to authenticated;

do $$
begin
  if position('app.publish_from' in pg_get_functiondef('public.publish_roster_week(date)'::regprocedure)) = 0 then
    raise exception '0227 tự kiểm: publish_roster_week chưa được vá';
  end if;
end $$;
