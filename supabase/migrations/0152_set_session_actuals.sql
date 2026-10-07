-- 0152 — Ops gõ tay "Thực tế" của ca (GMV + giờ live thật) ở cột Thực tế của Cửa sổ Ca Live.
--
-- Vì sao cần RPC riêng: từ 0133 `update_session_with_children` chỉ ghi lịch + người, bỏ qua mọi cột số (client có thể
-- cũ hơn số trợ live vừa up). Số thực tế chỉ có 3 đường vào: file Creator-Live-Performance (0078), giao ca gõ số
-- (0144) và đối soát (0079/0150). Chưa có đường cho ops sửa tay một ca chưa có file — hàm này là đường đó.
--
-- Luật (user chốt 08/10: "thực tế nhập tay hoặc khi import file tự update"):
--   * chỉ ceo/operations/admin; ca chưa huỷ, đã bắt đầu;
--   * CHỈ ghi đè khi nguồn số là 'manual'. Ca đã có số từ file / giao ca / đối soát thì số đó là bằng chứng — muốn đổi
--     thì up file mới (file ghi đè số tay, đúng thứ tự tin cậy manual < handover < reconciled của lib/dataSource.ts);
--   * data_source giữ 'manual' ⇒ vẫn hiện "Tạm tính", file up sau tự nâng bậc;
--   * giờ live (tuỳ chọn, gõ cả hai hoặc không gõ): kết thúc ≤ bắt đầu thì tính qua nửa đêm, như giờ ca.
--   * tháng đã phát hành Report cho brand: trigger guard_published_month_sessions (0133) tự chặn.

create or replace function set_session_actuals(
  p_session_id uuid,
  p_gmv numeric,
  p_live_start time default null,
  p_live_end time default null
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_start timestamptz;
  v_end timestamptz;
  v_minutes numeric;
  v_row live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'Chỉ OPS mới nhập tay số thực tế của ca.' using errcode = 'P0001';
  end if;
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không nhập số.' using errcode = 'P0001';
  end if;
  if coalesce(s.data_source::text, 'manual') <> 'manual' then
    raise exception 'Ca này đã có số từ file / giao ca / đối soát — up file mới để cập nhật, không gõ đè tay.' using errcode = 'P0001';
  end if;
  if (s.date + s.start_time) at time zone 'Asia/Ho_Chi_Minh' > now() then
    raise exception 'Ca chưa bắt đầu — chưa có số thực tế để nhập.' using errcode = 'P0001';
  end if;
  if p_gmv is null or p_gmv < 0 then
    raise exception 'GMV không được để trống hoặc âm.' using errcode = 'P0001';
  end if;
  if (p_live_start is null) <> (p_live_end is null) then
    raise exception 'Giờ live: gõ cả giờ bắt đầu và giờ kết thúc, hoặc để trống cả hai.' using errcode = 'P0001';
  end if;

  if p_live_start is not null then
    if p_live_start = p_live_end then
      raise exception 'Giờ bắt đầu và giờ kết thúc live không được trùng nhau.' using errcode = 'P0001';
    end if;
    -- Giờ bắt đầu live ở ngày của ca; ca qua nửa đêm mà live bắt đầu sau 00:00 thì thuộc ngày hôm sau.
    v_start := ((s.date + case when s.end_time <= s.start_time and p_live_start < s.start_time then 1 else 0 end) + p_live_start)
               at time zone 'Asia/Ho_Chi_Minh';
    v_end := ((s.date + case when s.end_time <= s.start_time and p_live_start < s.start_time then 1 else 0 end
                      + case when p_live_end <= p_live_start then 1 else 0 end) + p_live_end)
             at time zone 'Asia/Ho_Chi_Minh';
    v_minutes := extract(epoch from (v_end - v_start)) / 60;
    if v_minutes > 24 * 60 then
      raise exception 'Giờ live dài quá 24 giờ — kiểm tra lại.' using errcode = 'P0001';
    end if;
  end if;

  update live_sessions set
    actual_gmv = p_gmv,
    actual_start_at = v_start,
    actual_end_at = v_end,
    live_duration_minutes = v_minutes,
    data_source = 'manual',
    reconciled_at = null
  where id = p_session_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function set_session_actuals(uuid, numeric, time, time) from public;
grant execute on function set_session_actuals(uuid, numeric, time, time) to authenticated;
