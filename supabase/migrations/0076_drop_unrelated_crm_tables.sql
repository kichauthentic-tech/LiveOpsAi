-- Xóa 15 bảng không thuộc LiveOps, phát hiện khi introspect schema thật (2026-08-20) —
-- xem "⚠️ Supabase project này ĐANG CHIA SẺ với một app khác" trong WORKSPACE_DESIGN.md.
--
-- Đây là schema của một app CRM/outreach creator khác (naming camelCase: creatorIds,
-- workspaceId, startDate, isMock — khác hẳn convention snake_case của LiveOps), không xuất
-- hiện trong bất kỳ migration LiveOps nào, không dòng code nào trong src/ đụng tới.
--
-- User xác nhận (2026-09-07) app kia đã ngừng hẳn, không còn được dùng ở đâu — an toàn để xóa.
-- Re-check qua REST trước khi xóa: cả 15 bảng vẫn 0 dòng (không đổi từ lúc phát hiện 2026-08-20).
--
-- Liệt kê TƯỜNG MINH từng bảng theo tên (không quét pg_tables/information_schema) — đúng cảnh
-- báo đã ghi trong WORKSPACE_DESIGN.md: một vòng lặp "xóa mọi bảng lạ" có thể lỡ tay đụng bảng
-- LiveOps nếu naming trùng khớp về sau. CASCADE để dọn luôn FK giữa các bảng này với nhau
-- (vd creator_campaign_assignments -> creators/campaigns) — không bảng LiveOps nào tham chiếu
-- tới các bảng này nên CASCADE không lan sang schema LiveOps.

drop table if exists creator_campaign_assignments cascade;
drop table if exists bulk_outreach_jobs cascade;
drop table if exists unmatched_inbound_emails cascade;
drop table if exists outreach_emails cascade;
drop table if exists conversations cascade;
drop table if exists posted_videos cascade;
drop table if exists content_reviews cascade;
drop table if exists tasks cascade;
drop table if exists notifications cascade;
drop table if exists activities cascade;
drop table if exists campaigns cascade;
drop table if exists creators cascade;
drop table if exists settings cascade;
drop table if exists app_config cascade;
drop table if exists workspaces cascade;
