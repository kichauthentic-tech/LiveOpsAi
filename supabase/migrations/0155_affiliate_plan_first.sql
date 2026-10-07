-- 0155 — Affiliate: LẬP KẾ HOẠCH trước, nạp số thực tế sau (2026-10-08, user chốt 3 điểm).
--
-- Trang Affiliate trước đây chỉ có số ĐÃ XẢY RA (nạp từ file Live Analysis) + target gõ tay: tháng 9 chỉ 1/4 phiên có target.
-- Ops vẫn lập kế hoạch affiliate hằng tháng ở Google Sheet (Ngày · Creator · Camp · Timeline · Duration · Target GMV ·
-- GMV/hour · $ · Budget Ads · Note), nên trang này nhận luôn bản kế hoạch đó, rồi file thực tế khớp vào đúng dòng.
--
--   1) brand_affiliate_actuals thêm cột — MỘT dòng = một phiên, từ lúc còn là kế hoạch tới lúc có số (không tạo bảng kế hoạch
--      riêng: ghép hai bảng theo creator + ngày hay lệch vì tên không khớp, vd plan "Khói" ↔ file "Kiot Khói"):
--        status               'planned' (mới lập) | 'done' (đã live, có số) | 'cancelled' (huỷ/dời). Dòng cũ = 'done'.
--        camp_name            D-Day / Mid-Month / Pay Day / Daily — tách khỏi campaign_type (Big/Medium = quy mô, giữ nguyên).
--        plan_timeline_label  khung giờ KẾ HOẠCH ("10h - 18h"); timeline_label (0102) vẫn là giờ THỰC từ file.
--        plan_duration_hours  giờ kế hoạch (app suy từ timeline, ops sửa được); duration_hours vẫn là giờ thực.
--        plan_budget_ads      ngân sách Ads kế hoạch; ads_cost vẫn là chi phí thực.
--        note                 ghi chú.
--      Target GMV kế hoạch dùng lại cột target_gmv sẵn có.
--   2) brand_affiliate_plan_months — trạng thái theo (brand, tháng): tỷ giá cho cột "Đơn vị $" (mặc định 26.300, đúng sheet
--      của ops: 700.000.000 → $26.616) và published_at = "Chốt, gửi brand".
--   3) QUYỀN brand: chỉ đọc tháng đã chốt (published_at not null). Sau chốt ops vẫn sửa được, brand thấy ngay số mới — không
--      có bước "chốt lại". Thay policy `..._brand_read_when_published` của 0107 (brand đọc khi REPORT THÁNG đã phát hành).
--      Nạp sẵn "đã chốt" cho đúng những tháng Report đã phát hành, để brand không mất thứ đang xem; mọi tháng khác (kể cả
--      tháng đã có dòng nhưng Report chưa phát hành) giữ nguyên là brand chưa thấy, tới khi ops bấm Chốt.
--      LƯU Ý: chốt là cổng DUY NHẤT — số thực tế vào dòng sau khi chốt hiện cho brand ngay, không đợi phát hành Report.
--
-- Thứ tự deploy: chạy migration TRƯỚC, deploy client sau. Client cũ không biết các cột mới nên vẫn ghi/đọc được dòng 'done'.
-- Chạy lại nhiều lần không sao.

alter table brand_affiliate_actuals add column if not exists status text not null default 'done';
alter table brand_affiliate_actuals add column if not exists camp_name text;
alter table brand_affiliate_actuals add column if not exists plan_timeline_label text;
alter table brand_affiliate_actuals add column if not exists plan_duration_hours numeric;
alter table brand_affiliate_actuals add column if not exists plan_budget_ads numeric;
alter table brand_affiliate_actuals add column if not exists note text;

alter table brand_affiliate_actuals drop constraint if exists brand_affiliate_actuals_status_chk;
alter table brand_affiliate_actuals add constraint brand_affiliate_actuals_status_chk
  check (status in ('planned', 'done', 'cancelled'));

comment on column brand_affiliate_actuals.status is
  'planned = mới lập kế hoạch, chưa có số; done = đã live (số từ file Live Analysis hoặc gõ tay); cancelled = huỷ/dời.';
comment on column brand_affiliate_actuals.camp_name is
  'Khung camp: D-Day / Mid-Month / Pay Day / Daily. Khác campaign_type (Big/Medium = quy mô).';
comment on column brand_affiliate_actuals.plan_timeline_label is
  'Khung giờ KẾ HOẠCH dạng "10h - 18h". Giờ thực từ file ở timeline_label.';
comment on column brand_affiliate_actuals.plan_duration_hours is
  'Giờ live kế hoạch. Giờ thực ở duration_hours.';
comment on column brand_affiliate_actuals.plan_budget_ads is
  'Ngân sách Ads kế hoạch. Chi phí thực ở ads_cost.';

create table if not exists brand_affiliate_plan_months (
  brand_id uuid not null references brands(id) on delete cascade,
  period_month date not null,
  fx_rate numeric not null default 26300 check (fx_rate > 0),
  published_at timestamptz,
  published_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, period_month)
);

comment on table brand_affiliate_plan_months is
  'Trạng thái kế hoạch Affiliate theo (brand, tháng): tỷ giá cho cột $ và published_at = đã chốt, brand mới thấy.';

drop trigger if exists trg_brand_affiliate_plan_months_updated_at on brand_affiliate_plan_months;
create trigger trg_brand_affiliate_plan_months_updated_at before update on brand_affiliate_plan_months
  for each row execute function set_updated_at();

-- Tháng có dòng: đã chốt nếu Report Tháng của nó đã phát hành (đúng thứ brand đang thấy theo 0107), chưa chốt nếu không.
-- on conflict để chạy lại không ghi đè tháng ops đã Thu hồi.
insert into brand_affiliate_plan_months (brand_id, period_month, published_at)
select distinct a.brand_id, a.period_month,
       case when exists (select 1 from brand_monthly_reports r
                          where r.brand_id = a.brand_id and r.period_month = a.period_month and r.status = 'published')
            then now() end
  from brand_affiliate_actuals a
on conflict (brand_id, period_month) do nothing;

alter table brand_affiliate_plan_months enable row level security;

drop policy if exists brand_affiliate_plan_months_ops on brand_affiliate_plan_months;
create policy brand_affiliate_plan_months_ops on brand_affiliate_plan_months for all to authenticated
  using ((select current_user_role()) in ('ceo', 'admin', 'operations'))
  with check ((select current_user_role()) in ('ceo', 'admin', 'operations'));

drop policy if exists brand_affiliate_plan_months_brand_read on brand_affiliate_plan_months;
create policy brand_affiliate_plan_months_brand_read on brand_affiliate_plan_months for select to authenticated
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and published_at is not null
  );

revoke all on brand_affiliate_plan_months from anon;
grant select, insert, update on brand_affiliate_plan_months to authenticated;

-- Brand đọc dòng của tháng ĐÃ CHỐT. Subquery đi qua RLS của bảng tháng (brand chỉ thấy tháng đã chốt của mình) nên điều kiện
-- published_at lặp lại ở đây chỉ để đọc rõ ý, không phải để chặn thêm.
drop policy if exists "brand_affiliate_actuals_brand_read" on brand_affiliate_actuals;
drop policy if exists "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals;
create policy "brand_affiliate_actuals_brand_read" on brand_affiliate_actuals for select
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and exists (
      select 1 from brand_affiliate_plan_months m
      where m.brand_id = brand_affiliate_actuals.brand_id
        and m.period_month = brand_affiliate_actuals.period_month
        and m.published_at is not null
    )
  );
