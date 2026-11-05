-- 0199 — Kéo ca sang phòng của sàn khác thì đổi luôn sàn của ca (05/11).
--
-- Vấn đề (user 05/11): ở "Phòng Studio theo giờ", kéo ca Franklin Shopee 19–22 từ phòng FRANKLIN SPE xuống phòng FRANKLIN
-- (phòng TikTok của Franklin theo brand_studios 0098) ⇒ chỉ đổi phòng, thẻ ca vẫn mang logo Shopee. update_session_fields
-- (0178) chỉ ghi ngày/giờ/phòng/người — không có đường nào trong app đổi sàn của ca đã chốt.
--
-- Đổi sàn không chỉ là một cột: ca chốt từ Kế Hoạch Tháng nối theo chuỗi brand_month_plan_slots.slot_id → shift_slots.session_id
-- → live_sessions, và target của ca lấy từ ca kế hoạch (planTargetBySessionId). Giữ nguyên chuỗi đó thì target kế hoạch Shopee
-- sẽ bị cộng vào kênh TikTok (luật không cộng chéo sàn). Hàm này làm trong MỘT transaction:
--   1) Chặn: ca đã huỷ, ca đã có số (số đó là số của sàn cũ — file/giao ca/đối soát theo sàn), phòng đích không phải phòng
--      mặc định của brand ở sàn mới.
--   2) Tách ca khỏi kế hoạch sàn cũ (slot_id = null): ca kế hoạch đó thành "chưa có ca" ở sàn cũ — đúng sự thật, sàn cũ không live.
--   3) shift_slot đã chốt của ca: nếu sàn mới đã có ca chờ đăng ký đúng brand|ngày|giờ (thường là ca kế hoạch sàn mới đang
--      trống) ⇒ chốt ca chờ đó vào ca này, huỷ shift_slot cũ; ca chờ đó đã có ca thật khác ⇒ chặn (trùng ca). Không có ⇒ đổi
--      sàn/phòng của shift_slot cũ, và gắn vào ca kế hoạch sàn mới đã chốt đúng giờ còn trống (nếu có).
--   4) Ghi sàn + phòng mới lên ca.
-- Trigger kênh (0149) tự chặn khi brand chưa có kênh ở sàn mới.
--
-- Thứ tự deploy: chạy migration TRƯỚC khi deploy client (client mới gọi RPC này khi thả ca sang phòng sàn khác; chưa chạy thì
-- client báo lỗi PGRST202 và không đổi gì). Chạy lại nhiều lần không sao.

create or replace function switch_session_platform(p_session_id uuid, p_platform session_platform, p_studio_id uuid)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ls live_sessions%rowtype;
  v_studio_name text;
  v_ss record;
  v_other record;
  v_ps record;
  v_slot_id uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được đổi sàn của ca' using errcode = '42501';
  end if;

  select * into v_ls from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;
  if v_ls.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không đổi sàn được.';
  end if;
  if v_ls.platform = p_platform then
    raise exception 'Ca đã ở sàn % rồi.', p_platform::text;
  end if;
  if coalesce(v_ls.data_source, 'manual') <> 'manual'
     or coalesce(v_ls.actual_gmv, 0) > 0
     or coalesce(v_ls.total_views, 0) > 0
     or exists (select 1 from session_live_snapshots s where s.session_id = p_session_id) then
    raise exception 'Ca % %–% đã có số liệu của sàn % — không đổi sàn được. Xoá số/snapshot của ca trước nếu ca thật sự live ở sàn khác.',
      to_char(v_ls.date, 'DD/MM'), to_char(v_ls.start_time, 'HH24:MI'), to_char(v_ls.end_time, 'HH24:MI'), v_ls.platform::text;
  end if;
  if not exists (select 1 from brand_studios b where b.brand_id = v_ls.brand_id and b.platform = p_platform and b.studio_id = p_studio_id) then
    raise exception 'Phòng này không phải phòng % của brand (xem "Phòng live mặc định" của brand).', p_platform::text;
  end if;
  select name into v_studio_name from studios where id = p_studio_id;

  for v_ss in select * from shift_slots where session_id = p_session_id and status <> 'cancelled' for update loop
    -- (2) rời kế hoạch sàn cũ
    update brand_month_plan_slots set slot_id = null where slot_id = v_ss.id;

    select * into v_other from shift_slots o
     where o.id <> v_ss.id and o.brand_id = v_ls.brand_id and o.date = v_ls.date
       and o.start_time = v_ls.start_time and o.end_time = v_ls.end_time
       and o.platform = p_platform and o.status <> 'cancelled'
     for update;
    if found then
      if v_other.session_id is not null or v_other.status <> 'open' then
        raise exception 'Sàn % đã có ca % %–% của brand này — không đổi sàn được (sẽ thành 2 ca trùng).',
          p_platform::text, to_char(v_ls.date, 'DD/MM'), to_char(v_ls.start_time, 'HH24:MI'), to_char(v_ls.end_time, 'HH24:MI');
      end if;
      -- (3a) ca chờ đúng giờ ở sàn mới ⇒ chốt vào ca này (giữ liên kết kế hoạch sàn mới của ca chờ đó)
      update shift_slots set status = 'cancelled' where id = v_ss.id;
      update shift_slots set status = 'finalized', session_id = p_session_id, studio_id = p_studio_id, studio_name = coalesce(v_studio_name, '')
       where id = v_other.id;
    else
      -- (3b) đổi sàn shift_slot cũ, gắn vào ca kế hoạch sàn mới đã chốt đúng giờ còn trống
      update shift_slots set platform = p_platform, studio_id = p_studio_id, studio_name = coalesce(v_studio_name, '')
       where id = v_ss.id;
      select ps.id into v_ps from brand_month_plan_slots ps join brand_month_plans p on p.id = ps.plan_id
       where p.brand_id = v_ls.brand_id and p.platform = p_platform::text and p.status = 'locked'
         and ps.date = v_ls.date and ps.start_time = v_ls.start_time and ps.end_time = v_ls.end_time
         and (ps.slot_id is null or exists (select 1 from shift_slots c where c.id = ps.slot_id and c.status = 'cancelled'))
       limit 1;
      if found then
        update brand_month_plan_slots set slot_id = v_ss.id where id = v_ps.id;
      end if;
    end if;
  end loop;

  update live_sessions set platform = p_platform, studio_id = p_studio_id, studio_name = coalesce(v_studio_name, '')
   where id = p_session_id
  returning * into v_ls;
  return v_ls;
end;
$$;
revoke all on function switch_session_platform(uuid, session_platform, uuid) from public;
revoke all on function switch_session_platform(uuid, session_platform, uuid) from anon;
grant execute on function switch_session_platform(uuid, session_platform, uuid) to authenticated;
