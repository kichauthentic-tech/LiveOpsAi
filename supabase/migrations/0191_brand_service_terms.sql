-- 0191 — ĐIỀU KHOẢN HỢP TÁC YFB × BRAND (31/10). Thay công tắc billing_model hai giá trị (giờ / % doanh số) bằng một "gói"
-- ghép từ các mảnh: YFB làm dịch vụ nào · tính phí bằng khoản nào (giờ, %, cố định, Ads, booking) · cam kết hụt/vượt thì sao.
-- Gói lưu dạng JSON có phiên bản (terms.v = 1) — thêm kiểu phí mới là đổi client, không đổi bảng.
--
--   brand_service_terms     — các GIAI ĐOẠN điều khoản của brand × sàn: 'standard' (điều khoản chính, bản mới hơn thay từ
--                             ngày bắt đầu của nó), 'trial' (gói thử), 'campaign' (chiến dịch 11.11…) đè lên điều khoản chính
--                             trong khoảng ngày của nó. Ca trước ngày bắt đầu của điều khoản đầu tiên vẫn tính theo cấu hình
--                             cũ (billing_model + brand_platform_rates) — lịch sử không bị tính lại.
--   brand_month_fee_inputs  — số của MỘT tháng chưa có nguồn tự động để tính phí: chi tiêu Ads, số creator đã book, GMV affiliate.
--   brand_talent_rules      — điều khoản về người: host ưu tiên / cấm / độc quyền cho brand.
--
-- RLS khuôn 0105/0176: ceo/operations/admin ghi; ceo/operations/trainer/admin đọc; brand chỉ đọc điều khoản của chính nó
-- (giống đơn giá đã đọc được ở brand_platform_rates); số nhập tháng và luật về người chỉ nhân viên agency thấy.
--
-- Thứ tự deploy: chạy migration TRƯỚC hoặc SAU client đều được — client thiếu bảng thì quay về cấu hình cũ, hiện một dòng báo.
-- Chạy lại nhiều lần không sao.

create table if not exists brand_service_terms (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null check (platform in ('TikTok', 'Shopee')),
  kind text not null default 'standard' check (kind in ('standard', 'trial', 'campaign')),
  label text not null default '',
  start_date date not null,
  end_date date,
  terms jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_service_terms_dates check (end_date is null or end_date >= start_date),
  -- coalesce: thiếu khoá cho NULL, mà CHECK coi NULL là đạt ⇒ phải ép về false.
  constraint brand_service_terms_shape check (coalesce(jsonb_typeof(terms) = 'object' and (terms ->> 'v') = '1' and jsonb_typeof(terms -> 'fees') = 'array', false))
);

-- Hai điều khoản chính cùng ngày bắt đầu thì không biết cái nào thắng ⇒ chặn. Chiến dịch/gói thử được chồng nhau (cái bắt đầu muộn hơn thắng).
create unique index if not exists uq_brand_service_terms_standard_start
  on brand_service_terms (brand_id, platform, start_date) where kind = 'standard';
create index if not exists idx_brand_service_terms_brand on brand_service_terms (brand_id, platform, start_date);

drop trigger if exists trg_brand_service_terms_updated_at on brand_service_terms;
create trigger trg_brand_service_terms_updated_at before update on brand_service_terms
  for each row execute function set_updated_at();

alter table brand_service_terms enable row level security;
drop policy if exists "brand_service_terms_read_scoped" on brand_service_terms;
create policy "brand_service_terms_read_scoped" on brand_service_terms for select using (
  (select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin')
  or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
);
drop policy if exists "brand_service_terms_write_staff" on brand_service_terms;
create policy "brand_service_terms_write_staff" on brand_service_terms for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));

-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists brand_month_fee_inputs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null check (platform in ('TikTok', 'Shopee')),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  ads_spend numeric check (ads_spend is null or ads_spend >= 0),
  creators_booked integer check (creators_booked is null or creators_booked >= 0),
  affiliate_gmv numeric check (affiliate_gmv is null or affiliate_gmv >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, platform, period_month)
);

drop trigger if exists trg_brand_month_fee_inputs_updated_at on brand_month_fee_inputs;
create trigger trg_brand_month_fee_inputs_updated_at before update on brand_month_fee_inputs
  for each row execute function set_updated_at();

alter table brand_month_fee_inputs enable row level security;
drop policy if exists "brand_month_fee_inputs_read_staff" on brand_month_fee_inputs;
create policy "brand_month_fee_inputs_read_staff" on brand_month_fee_inputs for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "brand_month_fee_inputs_write_staff" on brand_month_fee_inputs;
create policy "brand_month_fee_inputs_write_staff" on brand_month_fee_inputs for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));

-- ---------------------------------------------------------------------------------------------------------------------
-- preferred = ưu tiên xếp cho brand này · blocked = brand không nhận host này · exclusive = host chỉ làm cho brand này.
create table if not exists brand_talent_rules (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  talent_id uuid not null references talents(id) on delete cascade,
  rule text not null check (rule in ('preferred', 'blocked', 'exclusive')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (brand_id, talent_id)
);
create index if not exists idx_brand_talent_rules_talent on brand_talent_rules (talent_id);

alter table brand_talent_rules enable row level security;
drop policy if exists "brand_talent_rules_read_staff" on brand_talent_rules;
create policy "brand_talent_rules_read_staff" on brand_talent_rules for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "brand_talent_rules_write_staff" on brand_talent_rules;
create policy "brand_talent_rules_write_staff" on brand_talent_rules for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));
