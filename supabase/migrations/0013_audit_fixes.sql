-- Giai đoạn "Audit" — 4 fixes phát hiện qua rà soát toàn bộ schema/RLS. Chạy độc lập
-- 1 lần bình thường (không cần tách nhiều lần Run như 0009-0012), NHƯNG giả định
-- 0001-0012 đã được áp dụng đầy đủ trước đó (index ở mục 4 tham chiếu cột
-- live_sessions.assistant_id, cột này chỉ tồn tại sau khi 0010_moderator_setup.sql
-- đã chạy — nếu chưa, bỏ dòng idx_live_sessions_assistant_id hoặc chạy 0009/0010 trước).

-- ============================================================
-- 1) audit_logs phải là append-only thật sự ở tầng RLS, không chỉ ở tầng app.
-- `audit_logs_write_ceo_ops` hiện là policy "for all" (insert+update+delete) vì nó
-- được sinh chung với 11 bảng CRUD khác ở 0001_init.sql/0012 — nhưng src/lib/db/auditLogs.ts
-- chỉ có fetchAuditLogs()/createAuditLog(), không có update/delete (nhật ký audit đúng
-- bản chất chỉ được thêm, không được sửa/xoá). Nếu chỉ dựa vào app không gọi update/delete,
-- bất kỳ ceo/operations/admin nào gọi thẳng Supabase REST vẫn sửa/xoá được nhật ký dùng để
-- ghi lại chính các thay đổi quyền/role — thay policy "for all" bằng policy insert-only.
-- ============================================================
drop policy if exists "audit_logs_write_ceo_ops" on audit_logs;
create policy "audit_logs_insert_ceo_ops" on audit_logs for insert
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

-- ============================================================
-- 2) agency_projects.brand_id dùng "on delete cascade" — khác với mọi FK khác từ
-- live_sessions/session_finance trỏ về brands/agency_projects đều dùng "on delete set null"
-- để giữ lại lịch sử. Xoá 1 Brand hiện tại sẽ xoá cứng toàn bộ Project (ngân sách/KPI/
-- actual_gmv) của brand đó — không nhất quán và có thể mất dữ liệu ngoài ý muốn. Đổi
-- sang "set null" cho khớp pattern chung của schema.
-- ============================================================
alter table agency_projects drop constraint if exists agency_projects_brand_id_fkey;
alter table agency_projects
  add constraint agency_projects_brand_id_fkey
  foreign key (brand_id) references brands(id) on delete set null;

-- ============================================================
-- 3) profiles.assigned_brand_id/assigned_talent_id chưa có FK constraint (khai báo
-- "uuid" trơn từ 0001_init.sql) — mọi cột tham chiếu chéo khác trong schema đều có FK rõ
-- ràng. Thêm FK "set null" (không xoá profile khi brand/talent bị xoá, chỉ gỡ liên kết).
-- ============================================================
alter table profiles
  add constraint profiles_assigned_brand_id_fkey
  foreign key (assigned_brand_id) references brands(id) on delete set null;
alter table profiles
  add constraint profiles_assigned_talent_id_fkey
  foreign key (assigned_talent_id) references talents(id) on delete set null;

-- ============================================================
-- 4) Index cho các cột FK được lọc/join thường xuyên — chưa có index nào trên FK trong
-- toàn bộ migration trước đó, mọi lookup theo session_id/brand_id/studio_id/... đang phải
-- sequential scan.
-- ============================================================
create index if not exists idx_session_skus_session_id on session_skus(session_id);
create index if not exists idx_session_checklist_items_session_id on session_checklist_items(session_id);
create index if not exists idx_session_minute_metrics_session_id on session_minute_metrics(session_id);
create index if not exists idx_live_sessions_brand_id on live_sessions(brand_id);
create index if not exists idx_live_sessions_project_id on live_sessions(project_id);
create index if not exists idx_live_sessions_studio_id on live_sessions(studio_id);
create index if not exists idx_live_sessions_host_id on live_sessions(host_id);
create index if not exists idx_live_sessions_assistant_id on live_sessions(assistant_id);
create index if not exists idx_agency_projects_brand_id on agency_projects(brand_id);
create index if not exists idx_agency_projects_team_lead_user_id on agency_projects(team_lead_user_id);
create index if not exists idx_talents_profile_id on talents(profile_id);
create index if not exists idx_equipments_assigned_studio_id on equipments(assigned_studio_id);
create index if not exists idx_profiles_assigned_brand_id on profiles(assigned_brand_id);
create index if not exists idx_profiles_assigned_talent_id on profiles(assigned_talent_id);
