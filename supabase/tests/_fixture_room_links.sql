-- Phần bổ sung cho _fixture_snapshot_recon.sql để chạy được migration 0153 (bảng profiles, schema private, các cột
-- live_sessions mà 0153 đọc). Nạp SAU fixture + 0124, TRƯỚC 0153. Cũng chỉ là đủ dùng, không phải schema thật.
create schema if not exists private;
create table if not exists profiles (id uuid primary key);
alter table live_sessions
  add column if not exists brand_id uuid,
  add column if not exists platform text not null default 'TikTok',
  add column if not exists excluded_from_reports boolean not null default false,
  add column if not exists host_name text not null default '',
  add column if not exists co_host_name text not null default '',
  add column if not exists studio_name text not null default '';
