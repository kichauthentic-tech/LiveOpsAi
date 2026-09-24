-- 0113 — Huỷ ca: cho phép MỞ LẠI ca chờ đăng ký (điểm đứt Đ2, chạy thử workflow 2026-09-24).
--
-- 0097 đặt slot 'finalized' -> 'cancelled' mỗi khi huỷ ca, và KHÔNG có đường nào đưa slot về
-- 'open': grep toàn repo chỉ thấy trigger reopen_slot_on_session_delete (chạy khi XOÁ ca) và
-- OpenSlotModal (tạo slot MỚI). Verify trên app: sau khi huỷ, card ở Nhân sự ca còn đúng chữ
-- "ĐÃ HUỶ", không select, không nút.
--
-- Hệ quả thật: brand dời lịch / cả host lẫn trợ bận -> ops muốn tìm người khác thì phải tạo slot
-- mới, MẤT hết đăng ký rảnh cũ VÀ mất liên kết với ca kế hoạch (brand_month_plan_slots.slot_id
-- vẫn trỏ slot đã huỷ) -> Hỗ Trợ Vận Hành đếm là "mất target" dù ca vẫn sẽ chạy.
--
-- Sửa: thêm tham số p_reopen_slot. TRUE = slot về 'open' và nhả session_id — đăng ký rảnh cũ vốn
-- nằm ở session_availability theo slot_id nên tự còn nguyên, liên kết plan slot cũng giữ nguyên
-- vì nó trỏ theo slot_id chứ không phải session_id. Ca vẫn ở 'Cancelled' làm lịch sử và trigger
-- 0083 vẫn báo host/trợ như cũ.
--
-- PHẢI drop bản 2 tham số của 0097 trước: để song song thì lời gọi 2 tham số khớp được CẢ HAI
-- (bản mới có default cho tham số thứ 3) -> Postgres/PostgREST báo "function is not unique".

drop function if exists cancel_session(uuid, text);

create or replace function cancel_session(
  p_session_id uuid,
  p_reason text default '',
  p_reopen_slot boolean default false
)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được huỷ ca' using errcode = '42501';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status = 'Cancelled' then
    return v_s;
  end if;
  if coalesce(v_s.data_source, 'manual') <> 'manual' or coalesce(v_s.actual_gmv, 0) > 0 then
    raise exception 'Ca đã có số liệu (%), không huỷ được — sửa tay nếu thật sự cần', v_s.data_source;
  end if;

  update live_sessions
     set status = 'Cancelled', cancel_reason = coalesce(p_reason, ''), cancelled_at = now()
   where id = p_session_id
   returning * into v_s;

  if p_reopen_slot then
    -- Nhả session_id để slot khớp lại đúng hình "ca chờ đăng ký" mà ShiftScheduling/OpsBoard đọc
    -- (cả hai lọc status = 'open'); không nhả thì card hiện lại nhưng bấm Chốt sẽ gắn nhầm ca cũ.
    update shift_slots
       set status = 'open', session_id = null
     where session_id = p_session_id and status = 'finalized';
  else
    update shift_slots
       set status = 'cancelled'
     where session_id = p_session_id and status = 'finalized';
  end if;

  return v_s;
end;
$$;

revoke all on function cancel_session(uuid, text, boolean) from public;
grant execute on function cancel_session(uuid, text, boolean) to authenticated;
