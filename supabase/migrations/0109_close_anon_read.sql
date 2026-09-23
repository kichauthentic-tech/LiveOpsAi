-- 0109 — ĐÓNG ĐƯỜNG ĐỌC CHO REQUEST KHÔNG ĐĂNG NHẬP (phát hiện 2026-09-23 khi audit phân quyền
-- tab 05 "Phân Tích Sâu").
--
-- LỖ HỔNG (đã verify bằng request thật, chỉ dùng khoá anon công khai có sẵn trong bundle trình
-- duyệt, KHÔNG đăng nhập):
--     GET /rest/v1/live_sessions          -> 229 dòng, đủ cột: ngày, host_name, actual_gmv, brand_id
--     GET /rest/v1/live_sessions_secure   -> 229 dòng
--     GET /rest/v1/brands                 -> 4 dòng
--   Các bảng khác (talents, profiles, studios, brand_dataraw_*, session_finance,
--   brand_affiliate_actuals, live_reconciliation_*) đều trả 0 dòng — không dính.
--
-- NGUYÊN NHÂN: policy viết `current_user_role() is distinct from 'brand'`. Với request không có
-- phiên đăng nhập thì auth.uid() = null ⇒ current_user_role() = NULL, mà trong SQL
-- `null is distinct from 'brand'` = **TRUE**. Ý định là "loại brand ra", nhưng nó hoá thành "cho
-- qua tất trừ brand" — kể cả người lạ. Lỗi này KHÔNG bắt được bằng test đăng nhập vì mọi role
-- thật đều có profile nên không bao giờ NULL.
--
-- Cũng dính người dùng đã đăng nhập mà KHÔNG có dòng profiles: handle_new_user() (0002) bắt
-- exception và chỉ `raise warning`, nên trường hợp này có thật chứ không phải giả thuyết.
--
-- VÁ 3 LỚP, cố ý chồng nhau:
--   1. Thu hồi toàn bộ quyền của role `anon` trên schema public. Đăng ký/đăng nhập đi qua schema
--      `auth`, còn dòng profiles do trigger `handle_new_user` (security definer) tạo, nên không
--      luồng nào của app cần anon đọc bảng — đã kiểm trước khi thu hồi.
--   2. Thêm vế `is not null` vào 3 policy đang dùng khuôn sai.
--   3. Thêm vế `is not null` vào WHERE của view `live_sessions_secure`. Bắt buộc phải làm riêng:
--      view này chạy dưới quyền OWNER (xem ghi chú dài trong 0107), nên policy ở lớp 2 KHÔNG che
--      nó — chính WHERE của view mới là hàng rào.
--
-- Chạy lại nhiều lần được (idempotent).

-- ---------------------------------------------------------------------------
-- 1) Thu hồi quyền của anon trên schema public
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------------
-- 2) Siết 3 policy dùng khuôn `is distinct from 'brand'`
-- ---------------------------------------------------------------------------
drop policy if exists "live_sessions_read_no_brand" on live_sessions;
create policy "live_sessions_read_no_brand" on live_sessions for select using (
  (select current_user_role()) is not null
  and (select current_user_role()) is distinct from 'brand'
);

drop policy if exists "brands_read_scoped" on brands;
create policy "brands_read_scoped" on brands for select using (
  (select current_user_role()) is not null
  and (
    (select current_user_role()) is distinct from 'brand'
    or id = (select current_user_brand_id())
  )
);

-- session_skus hiện rỗng nên chưa rò gì, nhưng cùng một khuôn sai — vá luôn thay vì đợi nó có dữ liệu.
drop policy if exists "session_skus_read_published" on session_skus;
create policy "session_skus_read_published" on session_skus for select using (
  (select current_user_role()) is not null
  and (
    (select current_user_role()) is distinct from 'brand'
    or (
      session_brand_id(session_id) = (select current_user_brand_id())
      and coalesce(session_month_published(session_id), false)
    )
  )
);

-- ---------------------------------------------------------------------------
-- 3) Dựng lại view live_sessions_secure — nguyên văn 0107, chỉ siết mệnh đề WHERE cuối
-- ---------------------------------------------------------------------------
create or replace view live_sessions_secure as
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
-- SIẾT 2026-09-23: thêm vế `is not null`. Trước đây chỉ có `is distinct from 'brand'`, mà
-- current_user_role() trả NULL cho request KHÔNG có phiên đăng nhập — và `null is distinct from
-- 'brand'` là TRUE, nên mệnh đề này cho qua tất. View chạy quyền OWNER nên policy của bảng gốc
-- không đỡ hộ: chính WHERE này là hàng rào duy nhất.
where (select current_user_role()) is not null
  and (
    (select current_user_role()) is distinct from 'brand'
    or ls.brand_id = (select current_user_brand_id())
  );
grant select on live_sessions_secure to authenticated;
