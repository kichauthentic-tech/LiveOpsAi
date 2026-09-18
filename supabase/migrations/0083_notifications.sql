-- 0083 — Lớp notification trong app (điểm nghẽn #1 của audit module Vận Hành Live: không có
-- thông báo nào xuyên suốt chốt lịch → thay người khẩn cấp → đối soát ghi đè report).
--
-- QUYẾT ĐỊNH CHÍNH: sinh thông báo bằng TRIGGER trên live_sessions, KHÔNG phải gọi từ client.
-- Lý do: đường ghi vào live_sessions có nhiều hơn một — chốt từng ca, chốt hàng loạt (mỗi ca một
-- lần createSession), thay người khẩn cấp, kéo đổi giờ trên lịch, huỷ ca, và đối soát ghi đè số.
-- Nếu client tự gọi "gửi thông báo" thì mỗi đường mới thêm vào là một chỗ có thể quên — bulk
-- finalize vừa build hôm qua là ví dụ: nó tạo N session qua đúng hàm cũ mà không đụng gì tới UI
-- chốt từng ca. Trigger nhìn thấy MỌI đường, kể cả đường chưa viết.
--
-- Thông báo là BẢN GHI những gì hệ thống đã nói với một người. Người nhận chỉ được đọc và đánh
-- dấu đã đọc — không sửa, không xoá (RLS chỉ mở select; đánh dấu đọc đi qua RPC). Cho phép sửa
-- là cho phép "tôi chưa từng được báo".
--
-- Đây cũng là nền cho kênh Zalo OA sau này: một worker chỉ cần đọc bảng này và gửi đi, không
-- phải biết gì về nghiệp vụ chốt lịch.

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in (
    'shift_assigned',       -- được xếp làm Host/Trợ live cho một ca
    'shift_unassigned',     -- bị rút khỏi ca (thay người khẩn cấp)
    'shift_time_changed',   -- ca mình đang giữ bị đổi ngày/giờ
    'shift_cancelled',      -- ca mình đang giữ bị huỷ
    'report_reconciled'     -- số đối soát khác số mình đã báo
  )),
  title text not null,
  body text not null default '',
  session_id uuid references live_sessions(id) on delete cascade,
  brand_id uuid references brands(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Chuông đọc "của tôi, chưa đọc, mới nhất trước" — đúng 1 index phục vụ cả 2 truy vấn.
create index if not exists idx_notifications_user_unread
  on notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_notifications_user_created
  on notifications (user_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
  for select using (user_id = auth.uid());
-- Cố ý KHÔNG có policy insert/update/delete cho client. Ghi = trigger (chạy dưới owner),
-- đánh dấu đọc = RPC dưới đây.

grant select on notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Đánh dấu đã đọc — RPC thay vì policy update, vì RLS chặn theo dòng chứ không theo cột:
-- mở "update dòng của mình" là mở luôn title/body/kind.
-- ---------------------------------------------------------------------------
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Chưa đăng nhập';
  end if;
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function mark_notifications_read(uuid[]) from public;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger sinh thông báo từ live_sessions.
-- ---------------------------------------------------------------------------

-- Một talent có thể gắn với nhiều tài khoản (hoặc không tài khoản nào). Gửi cho mọi tài khoản
-- đang gắn, trừ chính người vừa thao tác — ops tự xếp mình vào ca thì không cần báo cho mình.
create or replace function notify_talent(
  p_talent_id uuid, p_kind text, p_title text, p_body text, p_session_id uuid, p_brand_id uuid
) returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, p_kind, p_title, p_body, p_session_id, p_brand_id
  from profiles p
  where p_talent_id is not null
    and p.assigned_talent_id = p_talent_id
    and p.status = 'Active'
    and p.id is distinct from auth.uid();
$$;
revoke execute on function notify_talent(uuid, text, text, text, uuid, uuid) from public;

-- "Ca CROCS 20/09 10:00–14:00 · Studio A"
create or replace function session_label(s live_sessions) returns text
language sql stable
as $$
  select 'Ca ' || coalesce(nullif(s.brand_name, ''), 'chưa rõ brand')
      || ' ' || to_char(s.date, 'DD/MM')
      || ' ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI')
      || case when coalesce(s.studio_name, '') <> '' then ' · ' || s.studio_name else '' end;
$$;

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
begin
  -- ===== Xếp người vào ca (chốt lịch, chốt hàng loạt, thay người khẩn cấp - phía người mới) =====
  -- Chỉ báo cho ca CHƯA diễn ra: sửa host của ca tháng trước để dọn số liệu thì không phải "lịch
  -- mới" của ai cả, báo đi chỉ gây nhiễu.
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

  -- ===== Bị rút khỏi ca (thay người khẩn cấp - phía người cũ) =====
  -- Người cũ cần biết NGAY, và ca quá khứ cũng không có lý do bị rút — nên vẫn gate theo v_future.
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

  -- ===== Đổi ngày/giờ (kéo trên lịch) — chỉ báo người VẪN đang giữ ca, người vừa vào đã có
  -- thông báo "được xếp" ở trên với giờ mới rồi =====
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

  -- ===== Đối soát ghi đè số talent đã báo =====
  -- Chỉ khi số CŨ là do talent tự khai (data_source = 'manual') — số từ snapshot/đối soát trước
  -- không phải "báo cáo của họ", lệch với nó không phải chuyện của họ. Ngưỡng 5%: dưới đó là sai
  -- số làm tròn/thời điểm chụp, báo đi chỉ dạy talent bỏ qua chuông.
  if old.data_source = 'manual' and new.data_source = 'tiktok_reconciled'
     and old.data_source is distinct from new.data_source then
    v_old_gmv := coalesce(old.actual_gmv, 0);
    if v_old_gmv > 0 then
      v_diff := abs(coalesce(new.actual_gmv, 0) - v_old_gmv) / v_old_gmv;
      if v_diff >= 0.05 then
        perform notify_talent(new.host_id, 'report_reconciled',
          'Số đối soát khác số bạn đã báo',
          v_label || ': bạn báo ' || replace(to_char(v_old_gmv, 'FM999G999G999G999'), ',', '.') || 'đ, đối soát ra '
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

drop trigger if exists trg_notify_session_changes on live_sessions;
create trigger trg_notify_session_changes
  after insert or update of host_id, co_host_id, status, date, start_time, end_time, data_source, actual_gmv
  on live_sessions
  for each row execute function notify_session_changes();
