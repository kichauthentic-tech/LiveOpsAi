-- 0116 — Ba mắt xích thông báo còn hở (Đ7/Đ8/Đ9, chạy thử workflow 2026-09-24).
--
-- Gom một migration vì cả ba đụng cùng một bảng và cùng một quy ước của 0083: thông báo sinh bằng
-- TRIGGER, không phải client gọi — trigger nhìn thấy mọi đường ghi, kể cả đường viết sau này. Chỉ
-- Đ7 là ngoại lệ có lý do (xem mục 3).
--
--  Đ8. `report_reconciled` gần như CHẾT trong luồng chuẩn hiện tại: điều kiện là
--      `old.data_source = 'manual'`, nhưng luồng chuẩn bây giờ là trợ live up file TRƯỚC ⇒ ca ở bậc
--      `live_snapshot` khi đối soát chạy. Đo trên ca test: GMV 60tr → 72,5tr (+20,8%), 0 thông báo.
--  Đ9. Mở ca chờ đăng ký không sinh thông báo nào — `notifications` chỉ có trigger trên
--      `live_sessions`. Mắt xích "mở ca → có người đăng ký" không có cú hích nào.
--  Đ7. Talent không có đường "báo bận" sau khi ca đã chốt: U2 (2026-09-21) chuyển "Báo bận / thay
--      người" sang Cửa sổ Ca Live của OPS, và cửa sổ đó chỉ mở sửa cho ops. Talent bận thì nhắn
--      ngoài app — chuỗi hai chiều đang một chiều.

-- ---------------------------------------------------------------------------
-- 0) Hai `kind` mới
-- ---------------------------------------------------------------------------
-- Bỏ MỌI check constraint đang có trên cột `kind` thay vì gọi tên `notifications_kind_check` —
-- tên đó là tên Postgres TỰ sinh cho `check (...)` viết inline ở 0083, không phải tên mình đặt.
-- Đoán sai tên thì `drop ... if exists` im lặng không làm gì, constraint CŨ còn nguyên, và thêm
-- constraint mới bên cạnh nó: insert 'shift_open' vẫn bị chặn — hỏng lúc chạy, không phải lúc
-- migrate. Tra pg_constraint thì không phải đoán.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'notifications' and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_assigned',         -- được xếp làm Host/Trợ live cho một ca
  'shift_unassigned',       -- bị rút khỏi ca (thay người khẩn cấp)
  'shift_time_changed',     -- ca mình đang giữ bị đổi ngày/giờ
  'shift_cancelled',        -- ca mình đang giữ bị huỷ
  'report_reconciled',      -- số đối soát khác số đã ghi trước đó
  'shift_open',             -- 0116/Đ9: có ca đang mở chờ đăng ký
  'shift_dropout_request'   -- 0116/Đ7: talent báo không đi được ca đã chốt (gửi cho OPS)
));

-- ---------------------------------------------------------------------------
-- 1) Gửi cho OPS (đối xứng với notify_talent của 0083)
-- ---------------------------------------------------------------------------
-- 0083 chỉ có đường agency → talent. Đ7 cần đường ngược lại, nên cần hàm gửi cho người trực ca.
create or replace function notify_ops(
  p_kind text, p_title text, p_body text, p_session_id uuid, p_brand_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, p_kind, p_title, p_body, p_session_id, p_brand_id
  from profiles p
  where p.role in ('ceo', 'operations', 'admin')
    and p.status = 'Active'
    and p.id is distinct from auth.uid();
$$;
revoke execute on function notify_ops(text, text, text, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- 2) Đ8 — mở điều kiện `report_reconciled` cho cả bậc live_snapshot
-- ---------------------------------------------------------------------------
-- Giữ nguyên toàn bộ phần còn lại của notify_session_changes (0083), sửa đúng khối cuối. Tiêu đề
-- phải đổi theo bậc cũ: số ở bậc `live_snapshot` KHÔNG phải "số bạn báo" (trợ live up file, không
-- phải host tự khai) — dán nhãn sai thì talent tưởng mình khai sai.
create or replace function notify_session_changes() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_label text := session_label(new);
  v_future boolean := new.date >= v_today;
  v_old_gmv numeric;
  v_diff numeric;
  v_was_manual boolean;
begin
  -- ===== Xếp người vào ca =====
  if v_future and new.status <> 'Cancelled' then
    if new.host_id is not null and (tg_op = 'INSERT' or new.host_id is distinct from old.host_id) then
      perform notify_talent(new.host_id, 'shift_assigned',
        'Bạn được xếp làm Host', v_label, new.id, new.brand_id);
    end if;
    if new.co_host_id is not null and (tg_op = 'INSERT' or new.co_host_id is distinct from old.co_host_id) then
      perform notify_talent(new.co_host_id, 'shift_assigned',
        'Bạn được xếp làm Trợ live', v_label, new.id, new.brand_id);
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- ===== Bị rút khỏi ca =====
  if v_future then
    if old.host_id is not null and new.host_id is distinct from old.host_id then
      perform notify_talent(old.host_id, 'shift_unassigned',
        'Bạn không còn là Host ca này', v_label
          || case when coalesce(new.host_name, '') <> '' then ' — người thay: ' || new.host_name else '' end,
        new.id, new.brand_id);
    end if;
    if old.co_host_id is not null and new.co_host_id is distinct from old.co_host_id then
      perform notify_talent(old.co_host_id, 'shift_unassigned',
        'Bạn không còn là Trợ live ca này', v_label
          || case when coalesce(new.co_host_name, '') <> '' then ' — người thay: ' || new.co_host_name else '' end,
        new.id, new.brand_id);
    end if;
  end if;

  -- ===== Huỷ ca =====
  if new.status = 'Cancelled' and old.status <> 'Cancelled' and v_future then
    perform notify_talent(new.host_id, 'shift_cancelled', 'Ca của bạn đã bị huỷ', v_label, new.id, new.brand_id);
    perform notify_talent(new.co_host_id, 'shift_cancelled', 'Ca của bạn đã bị huỷ', v_label, new.id, new.brand_id);
  end if;

  -- ===== Đổi ngày/giờ =====
  if v_future and new.status <> 'Cancelled'
     and (new.date <> old.date or new.start_time <> old.start_time or new.end_time <> old.end_time) then
    if new.host_id is not null and new.host_id = old.host_id then
      perform notify_talent(new.host_id, 'shift_time_changed', 'Ca của bạn đổi giờ',
        v_label || ' (trước: ' || to_char(old.date, 'DD/MM') || ' ' || to_char(old.start_time, 'HH24:MI')
          || '–' || to_char(old.end_time, 'HH24:MI') || ')', new.id, new.brand_id);
    end if;
    if new.co_host_id is not null and new.co_host_id = old.co_host_id then
      perform notify_talent(new.co_host_id, 'shift_time_changed', 'Ca của bạn đổi giờ',
        v_label || ' (trước: ' || to_char(old.date, 'DD/MM') || ' ' || to_char(old.start_time, 'HH24:MI')
          || '–' || to_char(old.end_time, 'HH24:MI') || ')', new.id, new.brand_id);
    end if;
  end if;

  -- ===== Đối soát ghi đè số đã ghi trước đó (Đ8: nhận cả bậc live_snapshot) =====
  -- Ngưỡng 5% giữ nguyên: dưới đó là sai số làm tròn/thời điểm chụp, báo đi chỉ dạy talent bỏ qua
  -- chuông. Bậc `tiktok_reconciled` cũ thì KHÔNG báo — đối soát lại số đã đối soát là chuyện nội bộ.
  if coalesce(old.data_source, 'manual') in ('manual', 'live_snapshot')
     and new.data_source = 'tiktok_reconciled'
     and old.data_source is distinct from new.data_source then
    v_old_gmv := coalesce(old.actual_gmv, 0);
    v_was_manual := coalesce(old.data_source, 'manual') = 'manual';
    if v_old_gmv > 0 then
      v_diff := abs(coalesce(new.actual_gmv, 0) - v_old_gmv) / v_old_gmv;
      if v_diff >= 0.05 then
        perform notify_talent(new.host_id, 'report_reconciled',
          case when v_was_manual then 'Số đối soát khác số bạn đã báo'
               else 'Số đối soát khác số ghi lúc giao ca' end,
          v_label || ': ' || case when v_was_manual then 'bạn báo ' else 'lúc giao ca ' end
            || replace(to_char(v_old_gmv, 'FM999G999G999G999'), ',', '.') || 'đ, đối soát ra '
            || replace(to_char(coalesce(new.actual_gmv, 0), 'FM999G999G999G999'), ',', '.') || 'đ ('
            || case when new.actual_gmv >= v_old_gmv then '+' else '−' end
            || to_char(round(v_diff * 100), 'FM990') || '%)',
          new.id, new.brand_id);
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Đ9 — báo khi có ca mở chờ đăng ký
-- ---------------------------------------------------------------------------
-- HAI đường mở ca, hai nhịp khác nhau, nên hai thông báo khác nhau:
--
--  (a) Ca PHÁT SINH (OpenSlotModal — `plan_id is null`): mỗi ca một thông báo. Đây đúng là ca cần
--      người, thường gấp, và mỗi tháng chỉ vài ca.
--
--  (b) Chốt Kế Hoạch Tháng: MỘT thông báo tổng cho cả tháng. Không được bắn theo từng ca — 34
--      talent × 60 ca = 2.040 dòng cho một lần bấm, chuông thành rác và talent học cách bỏ qua nó.
--      Trigger đặt trên `brand_month_plans.locked_at` chứ không trên `shift_slots` vì
--      `lock_month_plan` (0091/0093/0098/0099) chèn từng ca bằng từng câu INSERT riêng — trigger
--      statement-level trên shift_slots vẫn ra 60 lần, không gom được. `locked_at` thì đặt ĐÚNG MỘT
--      LẦN, và đặt ở CUỐI hàm (đã đọc lại 0099 để chắc) nên lúc trigger chạy, ca đã sinh xong và
--      đếm được. Thêm lợi ích: không phải viết lại lock_month_plan.
--
-- Cả hai chỉ báo ca ở NGÀY TƯƠNG LAI: slot quá khứ là nạp bù (Đ6), không ai đăng ký được.
--
-- Người nhận = `profiles` role talent, status Active, ĐÃ gắn talent. Bản đầu tôi viết thêm
-- `join talents t ... and t.status = 'Active'` — SAI, `talents` KHÔNG CÓ cột `status` (chỉ có
-- `availability_status`, và nó nghĩa là Available/Busy/On Live, không phải "còn làm hay không").
-- Đã dump cột thật của bảng trước khi sửa, đúng bài học đã ghi ở WORKSPACE_DESIGN.md sau vụ
-- `brand_month_plans.month` vs `period_month`. Trạng thái "còn làm" hiện chỉ tồn tại ở
-- `profiles.status` — cùng điều kiện mà `notify_talent` (0083) đang dùng.
-- `assigned_talent_id is not null` là vế bắt buộc: tài khoản talent chưa gắn profile không đăng ký
-- ca được (mọi đăng ký đi theo talent_id), báo cho họ chỉ là chuông rác.
create or replace function notify_slot_opened() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if new.status <> 'open' or new.plan_id is not null or new.date < v_today then
    return new;
  end if;
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, 'shift_open', 'Có ca mới đang mở đăng ký',
    'Ca ' || coalesce(nullif(new.brand_name, ''), 'chưa rõ brand')
      || ' ' || to_char(new.date, 'DD/MM')
      || ' ' || to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI')
      || case when coalesce(new.notes, '') <> '' then ' — ' || new.notes else '' end
      || '. Vào Đăng Ký Ca để báo rảnh.',
    null, new.brand_id
  from profiles p
  where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
    and p.id is distinct from auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_notify_slot_opened on shift_slots;
create trigger trg_notify_slot_opened
  after insert on shift_slots
  for each row execute function notify_slot_opened();

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
    coalesce(v_brand, 'Brand') || ': ' || v_open || ' ca đang chờ đăng ký. Vào Đăng Ký Ca để báo ca bạn rảnh.',
    null, new.brand_id
  from profiles p
  where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
    and p.id is distinct from auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_notify_plan_locked on brand_month_plans;
create trigger trg_notify_plan_locked
  after update of locked_at on brand_month_plans
  for each row
  when (new.locked_at is distinct from old.locked_at and new.locked_at is not null)
  execute function notify_plan_locked();

-- ---------------------------------------------------------------------------
-- 4) Đ7 — talent báo không đi được ca đã chốt
-- ---------------------------------------------------------------------------
-- Đây là chỗ DUY NHẤT của 0116 dùng RPC chứ không dùng trigger, và có lý do: nó không phải hệ quả
-- của một lần ghi dữ liệu nào cả. Không có cột nào đổi — talent KHÔNG được tự đổi lịch (việc đổi
-- người vẫn là của ops, giữ đúng U2), nên không có gì để trigger bám vào. Đây là một lời nhắn.
--
-- Cố ý KHÔNG tự huỷ ca / tự nhả slot: hai người bận cùng lúc mà hệ thống tự nhả thì brand mất ca
-- mà không ai biết. Ops đọc thông báo rồi mở Cửa sổ Ca Live thay người như hiện nay.
create or replace function request_shift_dropout(p_session_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_me uuid;
  v_role text;
  v_name text;
begin
  v_me := (select assigned_talent_id from profiles where id = auth.uid());
  if v_me is null then
    raise exception 'Tài khoản chưa gắn với talent nào' using errcode = '42501';
  end if;

  select * into v_s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;

  -- Chỉ người ĐANG giữ ca được báo bận ca đó. Không có vế này thì bất kỳ talent nào cũng gửi được
  -- thông báo về ca của người khác.
  if v_s.host_id = v_me then
    v_role := 'Host';
  elsif v_s.co_host_id = v_me then
    v_role := 'Trợ live';
  else
    raise exception 'Bạn không phải Host/Trợ live của ca này' using errcode = '42501';
  end if;

  if v_s.status = 'Cancelled' then
    raise exception 'Ca này đã huỷ' using errcode = 'P0001';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca đã diễn ra, không báo bận được' using errcode = 'P0001';
  end if;

  select name into v_name from talents where id = v_me;
  perform notify_ops('shift_dropout_request',
    coalesce(v_name, 'Talent') || ' báo không đi được ca (' || v_role || ')',
    session_label(v_s) || case when coalesce(btrim(p_reason), '') <> '' then ' — lý do: ' || btrim(p_reason) else '' end
      || '. Ca CHƯA đổi gì — vào Cửa sổ Ca Live để thay người hoặc huỷ.',
    v_s.id, v_s.brand_id);
end;
$$;

revoke all on function request_shift_dropout(uuid, text) from public;
grant execute on function request_shift_dropout(uuid, text) to authenticated;
