-- Giai đoạn 9: TikTok Shop Partner API tích hợp thật (OAuth + Webhook).
-- Thay thế toàn bộ trạng thái giả lập ("AUTHORIZED", webhook logs cứng) trong TikTokApiAutomation.tsx.

-- Singleton-ish: 1 dòng / shop đã kết nối. Không dùng pattern 4-hàm CRUD chuẩn vì access/refresh
-- token là dữ liệu nhạy cảm — chỉ server (service_role key) được đọc/ghi bảng này, không có
-- policy nào cho phép client (anon/authenticated) SELECT trực tiếp, kể cả CEO. Client luôn phải
-- đi qua endpoint /api/tiktok/status ở server.ts (server dùng admin client trả về bản đã lược bỏ token).
create table if not exists tiktok_shop_connections (
  id uuid primary key default gen_random_uuid(),
  shop_id text not null unique,
  shop_name text not null default '',
  access_token text not null,
  access_token_expires_at timestamptz not null,
  refresh_token text not null,
  refresh_token_expires_at timestamptz not null,
  scope text not null default '',
  connected_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tiktok_shop_connections enable row level security;
-- Không tạo bất kỳ policy select/insert/update/delete nào cho role authenticated/anon —
-- RLS mặc định chặn tất cả, chỉ service_role (bypass RLS) trong server.ts mới truy cập được.

create trigger trg_tiktok_shop_connections_updated_at
  before update on tiktok_shop_connections
  for each row execute function set_updated_at();

-- Nhật ký sự kiện webhook nhận từ TikTok Shop — append-only, giống pattern audit_logs
-- nhưng nghiêm ngặt hơn: chỉ server (webhook receiver dùng admin client) mới được insert,
-- vì đây là dữ liệu do TikTok gửi đã verify chữ ký, không phải hành động của user trong app.
create table if not exists tiktok_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  shop_id text not null default '',
  payload jsonb not null default '{}'::jsonb,
  session_id uuid references live_sessions(id) on delete set null,
  received_at timestamptz not null default now()
);

alter table tiktok_webhook_events enable row level security;

-- Đọc = mọi authenticated user (để hiển thị log trong UI), ghi = chỉ server (service_role).
create policy "tiktok_webhook_events_read_all" on tiktok_webhook_events
  for select using (auth.role() = 'authenticated');
