-- Xóa module "Dự Án Agency" (agency_projects) khỏi CRM & Projects — tính năng project/campaign
-- tracking không còn dùng (đã bị loại khỏi hệ thống từ trước, module Campaign cũ cũng đã drop
-- ở 0034_drop_campaigns.sql). Xóa luôn field "Chiến dịch active" (active_campaigns) trên brands
-- — chỉ là số liệu tĩnh không gắn với campaign/project thật nào, không có UI nào cho sửa.
alter table live_sessions drop column if exists project_id;
drop table if exists agency_projects;
alter table brands drop column if exists active_campaigns;
