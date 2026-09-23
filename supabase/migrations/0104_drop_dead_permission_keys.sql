-- 0104 — Gỡ 5 PermissionKey không gate màn hình nào (audit role × workspace, 2026-09-22).
--
-- Ma Trận Phân Quyền đọc `role_permissions.permissions` rồi vẽ mỗi key thành một công tắc. 5 key
-- dưới đây chưa bao giờ được đọc ở bất kỳ chỗ gate nào trong app — grep toàn `src/` chỉ ra chúng ở
-- đúng 2 nơi: định nghĩa nhãn (`mockData.ts`) và chính bảng này. Tức CEO tắt "Xem Báo Cáo Tài
-- Chính & P&L" cho operations và tin là đã tắt, trong khi việc hiện/ẩn tab Finance được quyết bởi
-- một dòng `currentRole === "ceo" || currentRole === "admin"` cứng trong App.tsx.
--
--   view_financials, manage_finance_hr — Finance & P&L CỐ Ý khoá cứng ceo|admin, không qua Ma Trận.
--   manage_ai_agents                   — "Hội Đồng AI" ẩn khỏi nav từ 2026-09-18.
--   export_reports                     — app chưa có chức năng xuất file nào.
--   view_rate_card                     — Rate Card nằm trong CRM, gate bằng manage_crm_projects.
--
-- Lưu ý lịch sử: 0100 vừa THÊM `export_reports` vào bảng này cho khớp `PermissionKey` của app.
-- Hướng đó sai ở chỗ nó đồng bộ theo danh sách key thay vì theo cái gate thật; 0104 đồng bộ ngược
-- lại — bất biến mới ghi ở types.ts: mỗi key phải gate đúng một nav item.
--
-- Không đổi quyền thực tế của ai: không key nào trong 5 key này từng ảnh hưởng tới màn hình.

update role_permissions
   set permissions = permissions
                     - 'view_financials'
                     - 'manage_finance_hr'
                     - 'manage_ai_agents'
                     - 'export_reports'
                     - 'view_rate_card';

comment on table role_permissions is
  'Ma Trận Phân Quyền. BẤT BIẾN: mỗi key trong cột permissions phải gate đúng một nav item ở AGENCY_NAV_GROUPS (src/App.tsx). Key không gate gì là công tắc giả — xem migration 0104.';
