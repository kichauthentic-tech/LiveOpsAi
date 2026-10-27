-- 0184 — Ads theo ngày: target + thực tế, tách Live / Product (GMV Max) / Creator (2026-10-28).
--
-- CROCS theo dõi Ads bằng file "Performance Tracking" riêng (sheet "Daily Ads Report": mỗi ngày target + actual cho Live,
-- Product, Creator, cộng "Target by TTS"). File TikTok Ads của app (ads_campaign_overview, 0137) chỉ cho một số chi phí cả
-- cửa hàng mỗi ngày, không có target và không tách Creator — nên ops dán khối sheet đó vào Nhập Ads, app đọc từng ngày
-- (src/lib/ads/adsTracking.ts) và lưu vào bảng này. Cột MTD / runrate của sheet KHÔNG lưu: app tự tính, cắt ở ngày cuối có
-- số thực (sheet cộng cả target những ngày chưa tới nên runrate cuối tháng tụt giả).
--
-- Một dòng = (brand, sàn, ngày). Dán lại cùng ngày = ghi đè. actual_* null = ngày chưa có số thực (khác 0 đồng).

create table if not exists brand_ads_daily (
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null default 'TikTok' check (platform in ('TikTok', 'Shopee')),
  date date not null,
  tts_target numeric check (tts_target is null or tts_target >= 0),
  target_total numeric check (target_total is null or target_total >= 0),
  target_live numeric check (target_live is null or target_live >= 0),
  target_product numeric check (target_product is null or target_product >= 0),
  target_creator numeric check (target_creator is null or target_creator >= 0),
  actual_total numeric check (actual_total is null or actual_total >= 0),
  actual_live numeric check (actual_live is null or actual_live >= 0),
  actual_product numeric check (actual_product is null or actual_product >= 0),
  actual_creator numeric check (actual_creator is null or actual_creator >= 0),
  note text,
  updated_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, platform, date)
);

comment on table brand_ads_daily is
  'Ads theo ngày do ops dán từ file tracking của brand: target + thực tế tách Live / Product (GMV Max) / Creator. Không lưu cột MTD/runrate.';
comment on column brand_ads_daily.tts_target is 'Cột "Target by TTS" của file tracking (target ngày TikTok Shop giao).';
comment on column brand_ads_daily.actual_total is 'null = ngày chưa có số thực; 0 = có chạy mà chi 0.';

drop trigger if exists trg_brand_ads_daily_updated_at on brand_ads_daily;
create trigger trg_brand_ads_daily_updated_at before update on brand_ads_daily
  for each row execute function set_updated_at();

alter table brand_ads_daily enable row level security;

drop policy if exists brand_ads_daily_ops on brand_ads_daily;
create policy brand_ads_daily_ops on brand_ads_daily for all to authenticated
  using ((select current_user_role()) in ('ceo', 'admin', 'operations'))
  with check ((select current_user_role()) in ('ceo', 'admin', 'operations'));

-- Brand đọc khi Report Tháng của đúng sàn đã phát hành (cùng mốc với bản chụp, 0119/0139).
drop policy if exists brand_ads_daily_brand_read on brand_ads_daily;
create policy brand_ads_daily_brand_read on brand_ads_daily for select to authenticated
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and private.brand_month_published(brand_id, date, platform)
  );

revoke all on brand_ads_daily from anon;
grant select, insert, update, delete on brand_ads_daily to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'brand_ads_daily') then
    raise exception '0184: bảng brand_ads_daily chưa có';
  end if;
  if (select count(*) from pg_policies where tablename = 'brand_ads_daily') <> 2 then
    raise exception '0184: brand_ads_daily phải có đúng 2 policy';
  end if;
end $$;
