-- 0114 — "Loại ca khỏi báo cáo" (điểm đứt Đ10, chạy thử workflow 2026-09-24).
--
-- Hiện trạng và vì sao nó đúng: `cancel_session` (0097) chặn khi `data_source <> 'manual'` hoặc
-- `actual_gmv > 0`, và `SessionWindow` ẩn nút xoá khi ca đã có số. Chủ ý là "số đã ghi là bằng
-- chứng, không ai được xoá dấu vết" — giữ nguyên.
--
-- Nhưng hệ quả thì sai: ca nhập nhầm brand, ca test, ca nạp bù trùng room… dính số một lần là
-- KẸT VĨNH VIỄN trong mọi tổng hợp (Report Tháng, Hiệu Suất Host, cam kết giờ, P&L), chỉ gỡ được
-- bằng SQL tay. Chính phiên chạy thử 2026-09-24 phải làm đúng việc đó.
--
-- Sửa: cờ `excluded_from_reports` — dòng và số Ở LẠI làm lịch sử, nhưng mọi tổng hợp bỏ qua. Đây
-- là "tách khỏi sổ", không phải "xoá": bắt buộc có lý do, ghi ai loại và loại lúc nào, và đảo
-- lại được. Khác hẳn `status = 'Cancelled'` (= ca KHÔNG diễn ra) — ca bị loại VẪN đã diễn ra thật,
-- chỉ là không được tính vào con số nào.

alter table live_sessions
  add column if not exists excluded_from_reports boolean not null default false,
  add column if not exists excluded_reason text not null default '',
  add column if not exists excluded_at timestamptz,
  add column if not exists excluded_by uuid references profiles(id) on delete set null;

comment on column live_sessions.excluded_from_reports is
  'Ops đã tách ca này khỏi mọi tổng hợp (0114). Dòng + số giữ nguyên làm lịch sử. KHÔNG phải status Cancelled: ca bị loại vẫn đã diễn ra thật.';

-- Partial index: số ca bị loại luôn là thiểu số tuyệt đối, nên chỉ cần index đúng nhánh true để
-- màn "Ca đã loại" không phải quét cả bảng.
create index if not exists live_sessions_excluded_idx
  on live_sessions (brand_id, date) where excluded_from_reports;

-- ---------------------------------------------------------------------------
-- 1) RPC bật/tắt cờ
-- ---------------------------------------------------------------------------
-- security definer vì brand không có (và không được có) quyền UPDATE nào trên live_sessions —
-- guard role nằm trong thân hàm như mọi RPC khác (quy ước từ 0082).
create or replace function set_session_excluded(
  p_session_id uuid,
  p_excluded boolean,
  p_reason text default ''
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
    raise exception 'Chỉ ceo/admin/operations được loại ca khỏi báo cáo' using errcode = '42501';
  end if;

  -- Lý do là BẮT BUỘC khi loại: cờ này làm con số của cả tháng đổi, người đọc report tháng sau
  -- phải trả lời được "vì sao ca 12/09 không có trong tổng". Bỏ cờ thì không cần lý do.
  if p_excluded and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Phải ghi lý do khi loại ca khỏi báo cáo' using errcode = '22023';
  end if;

  update live_sessions
     set excluded_from_reports = p_excluded,
         excluded_reason = case when p_excluded then btrim(p_reason) else '' end,
         excluded_at = case when p_excluded then now() else null end,
         excluded_by = case when p_excluded then auth.uid() else null end
   where id = p_session_id
   returning * into v_s;

  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;

  return v_s;
end;
$$;

revoke all on function set_session_excluded(uuid, boolean, text) from public;
grant execute on function set_session_excluded(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Ca bị loại không tính là "chưa đối soát" khi phát hành report
-- ---------------------------------------------------------------------------
-- Không sửa chỗ này thì cờ vô nghĩa đúng ở chỗ quan trọng nhất: ca nhập nhầm vẫn chặn phát hành
-- report tháng, và cách duy nhất để đi tiếp lại là `p_force` — tức bỏ luôn cả cái chốt thật.
--
-- Nhân đây vá 2 thứ của bản 0051 (bản đang chạy — grep cả repo, không migration nào khác sửa hàm
-- này): (1) guard thiếu `coalesce` nên role NULL cho `NULL not in (...)` = NULL = `if` không chạy
-- = ĐI QUA được, đúng lỗ 0111/0112 đã vá cho các policy; (2) thiếu `set search_path = public` trên
-- một hàm security definer, đúng lỗ 0063 đã vá cho 4 hàm khác.
create or replace function publish_brand_monthly_report(p_report_id uuid, p_force boolean default false)
returns brand_monthly_reports as $$
declare
  v_report brand_monthly_reports;
  v_period_start date;
  v_period_end date;
  v_unreconciled_count int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to publish monthly report';
  end if;

  select * into v_report from brand_monthly_reports where id = p_report_id;
  if not found then
    raise exception 'brand_monthly_reports row % not found', p_report_id;
  end if;

  v_period_start := date_trunc('month', v_report.period_month)::date;
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  select count(*) into v_unreconciled_count
  from live_sessions
  where brand_id = v_report.brand_id
    and date >= v_period_start and date <= v_period_end
    and status = 'Completed'
    and data_source = 'manual'
    and not excluded_from_reports;

  if v_unreconciled_count > 0 and not p_force then
    raise exception 'unreconciled_sessions:%', v_unreconciled_count;
  end if;

  update brand_monthly_reports set
    status = 'published',
    published_at = now(),
    published_by = auth.uid()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- 3) View đọc: thêm cột cho ops, ẨN HẲN dòng với brand
-- ---------------------------------------------------------------------------
-- Giữ nguyên từng dòng của 0107 (che cột theo role + LATERAL 1 lời gọi/dòng + `offset 0` chặn
-- pull-up), chỉ thêm: 3 cột cờ, và một vế WHERE nữa.
--
-- Vì sao brand KHÔNG thấy dòng bị loại thay vì thấy kèm nhãn: cờ này nghĩa là "ca không thuộc về
-- con số nào". Để dòng lại cho brand thì mọi màn brand phải tự nhớ lọc — đúng loại lỗi sẽ quên ở
-- màn thứ tư. Che ở view là chốt một lần cho mọi đường đọc của brand, kể cả code viết sau này.
-- Ops thì PHẢI còn thấy: không thấy thì không ai bỏ cờ được nữa.
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

  -- (d) cờ "đã loại khỏi báo cáo" (0114). Chỉ ops đọc tới — brand không có dòng nào để đọc.
  excluded_from_reports, excluded_reason, excluded_at,

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
-- LATERAL: tính "tháng này đã phát hành chưa" ĐÚNG MỘT LẦN cho mỗi dòng. (Xem 0107 để biết vì
-- sao — 19 CASE gọi thẳng hàm = ~90ms/1002 ca, gom lại còn 1 lời gọi/dòng.)
cross join lateral (
  select
    pub as month_published,
    (select current_user_role()) = 'brand' and not pub as metrics_hidden
  from (
    select case when (select current_user_role()) = 'brand'
                then brand_month_published(ls.brand_id, ls.date)
                else true end as pub
    -- `offset 0` là HÀNG RÀO TỐI ƯU, không phải thừa: không có nó Postgres pull-up subquery rồi
    -- gọi lại brand_month_published() ở TỪNG cột, y như bản chưa gom (đã đo, 0107).
    offset 0
  ) q
) v
where ((select current_user_role()) is distinct from 'brand'
   or ls.brand_id = (select current_user_brand_id()))
  -- 0114: ca đã tách khỏi sổ thì với brand nó không tồn tại.
  and (not ls.excluded_from_reports or (select current_user_role()) is distinct from 'brand');

grant select on live_sessions_secure to authenticated;

comment on view live_sessions_secure is
  'Đường ĐỌC ca cho toàn app (lib/db/sessions.ts). Che cột theo role: brand không thấy phần nội bộ agency, và không thấy số liệu của tháng chưa phát hành. Từ 0114 brand cũng không thấy ca đã loại khỏi báo cáo (excluded_from_reports). Ghi vẫn vào thẳng live_sessions.';
