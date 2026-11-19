-- 0225: công bố MỘT LẦN cả đợt (15 ngày), ca còn thiếu trợ vẫn chốt; ca chưa có host giữ mở.
--
-- Luật cũ (0176 + 0207): publish_roster_week
--   * nháp chỉ có trợ, chưa host  ⇒ raise "Ca nháp chưa có host" (chặn cả lần công bố);
--   * nháp có host mà chưa trợ / chưa No Asst ⇒ bỏ qua ca (không công bố).
-- Luật mới (user 19/11): lịch chốt một lần cho cả đợt để talent biết việc của mình; thiếu trợ chốt sau.
--   * nháp có host (trợ hoặc không) ⇒ thành ca thật. Thiếu trợ ⇒ ca đã công bố ở trạng thái "chưa có trợ"
--     (cảnh báo no_co), chị Trainer thêm trợ / No Asst sau bằng thao tác đổi người của ca đã công bố.
--   * ca chưa có host (kể cả nháp chỉ có trợ) ⇒ KHÔNG chặn, giữ là ca mở ("Cần host" ở talent), nháp giữ nguyên.
-- publish_roster_range(from, to): gọi publish_roster_week cho từng tuần chạm khoảng ngày — một giao dịch, lỗi ở tuần nào thì
-- huỷ cả lần (không còn "đã công bố nửa chừng"). Tuần vắt qua biên khoảng vẫn được công bố trọn tuần.
-- Vá bằng replace() trên định nghĩa hiện hành (như 0206/0207), chạy trước hay sau 0207 đều được.

do $$
declare
  def text;
  new_def text;
  sel_0207 constant text := E'and (d.host_id is null or d.co_host_id is not null or d.no_assistant);';
  sel_base constant text := E'where s.date between p_week_start and v_end and s.status = ''open'' and s.session_id is null;';
  sel_new  constant text := E'and d.host_id is not null;';
begin
  select pg_get_functiondef('public.publish_roster_week(date)'::regprocedure) into def;
  if position(sel_0207 in def) > 0 then
    new_def := replace(def, sel_0207, sel_new);
  elsif position(sel_base in def) > 0 then
    new_def := replace(def, sel_base, E'where s.date between p_week_start and v_end and s.status = ''open'' and s.session_id is null\n     and d.host_id is not null;');
  elsif position('and d.host_id is not null;' in def) > 0 then
    return; -- đã vá
  else
    raise exception '0225: không tìm thấy đoạn chọn ca trong publish_roster_week — kiểm tay';
  end if;
  execute new_def;
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
  v_w := p_from - (extract(isodow from p_from)::int - 1);
  v_last := p_to - (extract(isodow from p_to)::int - 1);
  while v_w <= v_last loop
    if exists (
      select 1 from roster_drafts d join shift_slots s on s.id = d.slot_id
       where s.date between v_w and v_w + 6 and s.status = 'open' and s.session_id is null and d.host_id is not null
    ) then
      r := public.publish_roster_week(v_w);
      v_n := v_n + coalesce((r ->> 'published')::int, 0);
      v_sent := v_sent + coalesce((r ->> 'notified')::int, 0);
      v_weeks := v_weeks + 1;
    end if;
    v_w := v_w + 7;
  end loop;
  return jsonb_build_object('published', v_n, 'notified', v_sent, 'weeks', v_weeks);
end;
$$;
revoke all on function public.publish_roster_range(date, date) from public;
grant execute on function public.publish_roster_range(date, date) to authenticated;

do $$
declare
  def text := pg_get_functiondef('public.publish_roster_week(date)'::regprocedure);
begin
  if position('and d.host_id is not null;' in def) = 0 then
    raise exception '0225 tự kiểm: publish_roster_week chưa được vá';
  end if;
end $$;
