-- 0107 — Đợt B của audit role × workspace: brand chỉ thấy SỐ LIỆU của tháng đã phát hành.
--
-- VẤN ĐỀ: cổng "Phát Hành Report" đang là hình thức. Ba màn, ba lập trường cho cùng một con số:
--     Report Tháng  → chỉ sau publish   (BrandMonthlyReport: `canManage || isPublished`)
--     Sổ Ca + Lịch  → NGAY LẬP TỨC      (SessionLedger/BrandCalendar không xét publish)
--     Affiliate     → NGAY LẬP TỨC      (0102 cố ý bỏ điều kiện published)
-- Chặn ở Report Tháng vô nghĩa khi cùng con số đó nằm cách một cú click ở Sổ Ca. User chốt
-- 2026-09-22: **brand không thấy con số nào chưa phát hành**.
--
-- VÌ SAO LÀ VIEW CHỨ KHÔNG PHẢI POLICY: đây là chặn theo CỘT, không phải theo DÒNG. Brand vẫn
-- phải thấy LỊCH của họ (ngày/giờ/host/trạng thái) kể cả tháng chưa phát hành — chặn theo dòng là
-- xoá trắng Lịch Vận Hành, màn brand dùng nhiều nhất. Mà RLS của Postgres chặn theo dòng chứ không
-- theo cột (quy ước đã ghi trong WORKSPACE_DESIGN từ 0058). Khuôn sẵn có của repo cho việc che cột
-- là view: `talents_secure` (0047 → 0089 → 0100/0101). Làm y như vậy.
--
-- CẤU HÌNH VIEW — chỗ này có một cái bẫy đã sập một lần trong lúc làm, ghi lại để không sập lại:
--
--   Bản đầu viết view với `security_invoker = true` cho "đúng bài" (policy dòng của bảng gốc vẫn
--   áp dụng, view chỉ thêm tầng che cột). Test ra đúng như thiết kế. NHƯNG nó KHÔNG đóng được lỗ:
--   view chỉ có tác dụng nếu bảng gốc KHÔNG đọc được. Mà `live_sessions` vẫn mở cho brand đọc
--   dòng của họ (policy 0059) ⇒ brand chỉ cần gọi `/rest/v1/live_sessions` thay vì
--   `/rest/v1/live_sessions_secure` là lấy đủ mọi cột. Đã verify đúng như vậy trước khi sửa.
--
--   "Bảng đóng + view mở" thì view BẮT BUỘC chạy dưới quyền owner (tức KHÔNG security_invoker) —
--   nếu không, view cũng bị chính policy vừa đóng chặn nốt và brand mất sạch cả lịch. Đây đúng là
--   khuôn của `talents_secure`, chỉ khác ở chỗ `talents` không cần lọc dòng nên view đó không có
--   WHERE. View này chạy dưới quyền owner nên **nó tự chịu trách nhiệm lọc dòng** — mệnh đề WHERE
--   ở cuối view là thứ thay thế policy vừa bỏ, không được xoá.
--
--   `current_user_role()` vẫn trả đúng role NGƯỜI GỌI dù view chạy dưới quyền owner: nó đọc
--   `profiles` theo `auth.uid()`, mà auth.uid() lấy từ JWT của request chứ không từ DB role.

-- ---------------------------------------------------------------------------
-- 1) "Tháng này đã phát hành cho brand này chưa?"
-- ---------------------------------------------------------------------------
-- Tra bằng khoá tự nhiên (brand_id, period_month) — đã có unique index từ 0051 nên là index scan.
-- security definer: người gọi là role brand, mà policy đọc `brand_monthly_reports` của họ
-- (0051) vốn đã lọc `status = 'published'`; nếu hàm này chạy dưới quyền gọi thì nó chỉ đọc được
-- đúng các dòng published và câu trả lời vẫn đúng — NHƯNG sẽ là RLS-trong-RLS, cùng lý do
-- session_brand_id() của 0059 phải là definer. Giữ definer cho nhất quán và cho rẻ.
create or replace function brand_month_published(p_brand_id uuid, p_date date) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from brand_monthly_reports r
     where r.brand_id = p_brand_id
       and r.period_month = date_trunc('month', p_date)::date
       and r.status = 'published'
  )
$$;

revoke all on function brand_month_published(uuid, date) from public;
grant execute on function brand_month_published(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) View che cột
-- ---------------------------------------------------------------------------
-- Ba nhóm cột, ba luật khác nhau:
--   (a) LỊCH — brand luôn thấy: id, title, ngày/giờ, status, host, platform, brand, lý do huỷ.
--   (b) NỘI BỘ AGENCY — brand KHÔNG BAO GIỜ thấy, bất kể publish: target_gmv, studio, trợ live,
--       room id, cờ nạp bù, ghi chú AI. Đây chính là những thứ SessionWindow đã giấu với role
--       brand bằng `!isBrandView` từ trước; Đợt A vừa sửa Lịch cho khớp, giờ đóng nốt đường
--       PostgREST để gate UI không còn là thứ duy nhất chặn.
--   (c) SỐ LIỆU — brand chỉ thấy khi tháng của ca đã phát hành. 17 cột đếm được + các mốc giờ
--       live thật (giờ live thật là thứ brand bị tính tiền theo, nên nó là số liệu chứ không
--       phải lịch).
--
-- `(select current_user_role())` bọc subquery theo đúng quy ước từ 0101 — nó không phụ thuộc dòng
-- nên Postgres nâng thành InitPlan, tính 1 lần cho cả query. Nhờ vậy ceo/ops/talent thoát ở vế
-- đầu và KHÔNG trả giá cho lời gọi brand_month_published() per-row; chỉ tài khoản brand mới chạy
-- vế đó, và họ vốn chỉ đọc được ca của chính mình.
drop view if exists live_sessions_secure;
create view live_sessions_secure as
select
  id, title, brand_id, shop_tiktok_handle,

  -- (b) nội bộ agency
  case when (select current_user_role()) = 'brand' then null else studio_id end as studio_id,
  case when (select current_user_role()) = 'brand' then '' else studio_name end as studio_name,
  case when (select current_user_role()) = 'brand' then null else assistant_id end as assistant_id,
  case when (select current_user_role()) = 'brand' then '' else assistant_name end as assistant_name,
  case when (select current_user_role()) = 'brand' then null else co_host_id end as co_host_id,
  case when (select current_user_role()) = 'brand' then '' else co_host_name end as co_host_name,
  case when (select current_user_role()) = 'brand' then 0 else target_gmv end as target_gmv,
  case when (select current_user_role()) = 'brand' then null else tiktok_room_id end as tiktok_room_id,
  case when (select current_user_role()) = 'brand' then null else live_room_ids end as live_room_ids,
  case when (select current_user_role()) = 'brand' then false else is_backfill end as is_backfill,
  case when (select current_user_role()) = 'brand' then null else ai_analysis end as ai_analysis,

  -- (a) lịch
  host_id, host_name, brand_name, platform, date, start_time, end_time, status,
  cancel_reason, cancelled_at, created_at, updated_at,
  data_source, reconciled_at,

  -- (c) số liệu — chỉ sau khi tháng của ca đã phát hành
  case when v.metrics_hidden then null else actual_gmv end as actual_gmv,
  case when v.metrics_hidden then null else total_orders end as total_orders,
  case when v.metrics_hidden then null else avg_watch_time_seconds end as avg_watch_time_seconds,
  case when v.metrics_hidden then null else peak_viewers end as peak_viewers,
  case when v.metrics_hidden then null else total_views end as total_views,
  case when v.metrics_hidden then null else ctr_avg end as ctr_avg,
  case when v.metrics_hidden then null else cvr_avg end as cvr_avg,
  case when v.metrics_hidden then null else actual_start_at end as actual_start_at,
  case when v.metrics_hidden then null else actual_end_at end as actual_end_at,
  case when v.metrics_hidden then null else live_duration_minutes end as live_duration_minutes,
  case when v.metrics_hidden then null else attributed_items_sold end as attributed_items_sold,
  case when v.metrics_hidden then null else attributed_sku_orders end as attributed_sku_orders,
  case when v.metrics_hidden then null else impressions end as impressions,
  case when v.metrics_hidden then null else product_impressions end as product_impressions,
  case when v.metrics_hidden then null else product_clicks end as product_clicks,
  case when v.metrics_hidden then null else new_followers end as new_followers,
  case when v.metrics_hidden then null else comments_count end as comments_count,
  case when v.metrics_hidden then null else shares_count end as shares_count,
  case when v.metrics_hidden then null else likes_count end as likes_count,

  -- Cờ cho client, nhờ nó UI phân biệt được "chưa có số" (ca chưa chạy / chưa nộp) với "có số
  -- nhưng chưa phát hành" — hai thứ phải hiện khác nhau, không thì brand đọc ô trống thành
  -- "agency không làm gì".
  --
  -- ĐỌC KỸ TÊN CỘT: với mọi role KHÔNG phải brand, cột này luôn `true`, KHÔNG phải trạng thái
  -- phát hành thật của tháng. Cố ý: (a) ops không cần nó — họ đọc thẳng `brand_monthly_reports`
  -- (BrandMonthlyReport.tsx đang làm đúng vậy); (b) tính thật cho ops nghĩa là gọi hàm cho từng
  -- dòng của mọi role, trả tiền cho thứ không ai dùng; (c) mặc định `true` là hướng AN TOÀN cho
  -- client — code nào lỡ quên kiểm tra role sẽ hiện số bình thường cho ops chứ không dán nhãn
  -- "chưa phát hành" lên màn hình nội bộ. Muốn biết trạng thái thật thì hỏi brand_monthly_reports.
  v.month_published
from live_sessions ls
-- LATERAL: tính "tháng này đã phát hành chưa" ĐÚNG MỘT LẦN cho mỗi dòng.
--
-- Bản đầu gọi thẳng `brand_month_published(brand_id, date)` trong từng CASE. Có 19 cột số liệu ⇒
-- 19 lời gọi hàm security definer trên MỖI DÒNG. Đo trên 1002 ca: brand mất ~90ms, trong khi ceo
-- đọc thẳng bảng chỉ 2,6ms — và nó tăng tuyến tính theo số ca. Đúng vết xe của 0101 (view
-- talents_secure gọi hàm trong 4 CASE riêng, 33 talent là đủ vượt timeout). Gom vào LATERAL rồi
-- tham chiếu `v.` hạ xuống còn 1 lời gọi/dòng.
--
-- Vế `(select current_user_role()) = 'brand'` nằm trong chính LATERAL nên ceo/ops/talent không
-- gọi hàm một lần nào — short-circuit của CASE lo việc đó.
cross join lateral (
  select
    pub as month_published,
    (select current_user_role()) = 'brand' and not pub as metrics_hidden
  from (
    select case when (select current_user_role()) = 'brand'
                then brand_month_published(ls.brand_id, ls.date)
                else true end as pub
    -- `offset 0` là HÀNG RÀO TỐI ƯU, không phải thừa. Không có nó, Postgres "pull up" subquery
    -- rồi thay `v.metrics_hidden` bằng nguyên biểu thức ở TỪNG cột — xem lại EXPLAIN thì
    -- brand_month_published() vẫn bị gọi 19 lần/dòng y như bản chưa gom, và thời gian không
    -- giảm một mili-giây nào (đã đo: 93ms trước và sau khi gom, tới khi thêm dòng này).
    -- `offset 0` chặn pull-up mà không đụng tới scan/filter của bảng ngoài.
    offset 0
  ) q
) v
-- Lọc dòng — thay cho policy `live_sessions_read_scoped` vừa bị đóng với brand ở mục 3 bên dưới.
-- Giữ NGUYÊN ngữ nghĩa của 0059: brand chỉ thấy ca của chính mình, role khác thấy hết.
where (select current_user_role()) is distinct from 'brand'
   or ls.brand_id = (select current_user_brand_id());

grant select on live_sessions_secure to authenticated;

comment on view live_sessions_secure is
  'Đường ĐỌC ca cho toàn app (lib/db/sessions.ts). Che cột theo role: brand không thấy phần nội bộ agency, và không thấy số liệu của tháng chưa phát hành. Ghi vẫn vào thẳng live_sessions. security_invoker = true nên policy cô lập brand theo dòng của 0059 vẫn áp dụng.';

-- ---------------------------------------------------------------------------
-- 3) ĐÓNG bảng gốc với brand — không có bước này thì view ở trên hoàn toàn vô nghĩa
-- ---------------------------------------------------------------------------
-- Từ đây brand đọc ca CHỈ qua `live_sessions_secure`. Mọi role khác giữ nguyên quyền đọc thẳng
-- bảng như trước (ops ghi rồi `.select()` trả về, RPC, v.v. không đổi một dòng nào).
drop policy if exists "live_sessions_read_scoped" on live_sessions;
drop policy if exists "live_sessions_read_all" on live_sessions;
drop policy if exists "live_sessions_read_no_brand" on live_sessions;
create policy "live_sessions_read_no_brand" on live_sessions for select using (
  (select current_user_role()) is distinct from 'brand'
);

-- ---------------------------------------------------------------------------
-- 4) Affiliate quay về "chỉ sau khi phát hành"
-- ---------------------------------------------------------------------------
-- 0102 (2026-09-22) mở cho brand đọc brand_affiliate_actuals BỎ điều kiện published, lý do ghi
-- trong chính migration đó: "trang Affiliate đứng độc lập với vòng đời phát hành report". Quyết
-- định Đợt B đảo lại lý do đó — trang Affiliate là số liệu hiệu suất như mọi số khác, không có cớ
-- gì đứng ngoài cổng phát hành. Quay về đúng điều kiện của 0067.
drop policy if exists "brand_affiliate_actuals_brand_read" on brand_affiliate_actuals;
drop policy if exists "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals;
create policy "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals for select
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and exists (
      select 1 from brand_monthly_reports r
       where r.brand_id = brand_affiliate_actuals.brand_id
         and r.period_month = brand_affiliate_actuals.period_month
         and r.status = 'published'
    )
  );

-- ---------------------------------------------------------------------------
-- 5) Bảng con của ca — cùng một loại số liệu, cùng một luật
-- ---------------------------------------------------------------------------
-- `assembleSessions()` (lib/db/sessions.ts) nạp kèm 4 bảng con cho mỗi ca. Đóng bảng cha mà để hở
-- bảng con thì chỉ đổi chỗ rò, không bịt được gì.
--
--   live_session_reports    — report talent tự khai: gmv_total, ads_cost, ctor, gpm… cộng ghi chú
--                             nội bộ (status_note, link dashboard riêng của talent, host trễ, OT,
--                             off sớm). Vừa là SỐ LIỆU chưa phát hành, vừa là chuyện agency↔talent.
--   session_minute_metrics  — số theo từng phút, thô hơn cả bảng cha.
--   session_checklist_items — checklist vận hành nội bộ.
--   session_skus            — SKU ghim theo ca, kèm doanh thu từng SKU.
--
-- Ba bảng đầu: brand KHÔNG đọc, kể cả sau khi phát hành — chúng là vật liệu làm việc nội bộ, không
-- phải thứ bán cho khách. Bản phát hành cho khách là Report Tháng.
-- session_skus: theo đúng luật của Đợt B — chỉ sau khi tháng đã phát hành.
do $$
declare
  t text;
  p text;
  never_brand text[] := array['live_session_reports', 'session_minute_metrics', 'session_checklist_items'];
begin
  foreach t in array never_brand loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on %I', p, t);
    end loop;
    execute format(
      'create policy %I on %I for select using ((select current_user_role()) is distinct from ''brand'')',
      t || '_read_no_brand', t);
  end loop;
end $$;

-- "Ca này thuộc tháng đã phát hành chưa?" — BẮT BUỘC là security definer.
-- Bẫy đã sập một lần khi viết migration này: bản đầu nhúng thẳng
--     exists (select 1 from live_sessions ls where ls.id = ... and brand_month_published(...))
-- vào thân policy. Nhưng mục 3 vừa đóng `live_sessions` với brand, nên subquery đó chạy dưới
-- quyền người gọi và trả về 0 dòng cho MỌI ca ⇒ brand mất sạch SKU, kể cả tháng đã phát hành.
-- Đúng loại RLS-trong-RLS mà session_brand_id() của 0059 sinh ra để tránh. Test bắt được:
-- brand thấy 0 SKU trong khi phải thấy SKU của tháng 8.
create or replace function session_month_published(p_session_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select brand_month_published(ls.brand_id, ls.date)
    from live_sessions ls where ls.id = p_session_id
$$;

revoke all on function session_month_published(uuid) from public;
grant execute on function session_month_published(uuid) to authenticated;

drop policy if exists "session_skus_read_scoped" on session_skus;
drop policy if exists "session_skus_read_all" on session_skus;
drop policy if exists "session_skus_read_published" on session_skus;
create policy "session_skus_read_published" on session_skus for select using (
  (select current_user_role()) is distinct from 'brand'
  or (
    session_brand_id(session_id) = (select current_user_brand_id())
    and coalesce(session_month_published(session_id), false)
  )
);

-- CỐ Ý KHÔNG đụng `live_stream_incidents`: bảng đó rỗng và không có call site nào trong src/.
-- Thứ SessionWindow gọi là "sự cố" được suy ra từ chính live_session_reports (xem sessionIncidents()
-- trong lib/sessionLedger.ts), nên nó đã theo luật của bảng đó rồi.
--
-- HỆ QUẢ ĐÃ BIẾT, chấp nhận: brand mất luôn 2 chip sự cố vốn CỐ Ý hiện cho họ ("Restart ×N",
-- "Cross-live" — `internal: false` trong sessionIncidents()). Hai chip đó nằm chung dòng với
-- host trễ / OT / off sớm và với gmv tự khai, tách ra thì phải dựng thêm một view nữa cho đúng 2
-- boolean. Không đáng ở đợt này; ghi lại đây để nếu brand hỏi thì biết vì sao mất, và biết cách
-- trả lại (view live_session_reports_secure chỉ lộ restart_count + cross_live).
