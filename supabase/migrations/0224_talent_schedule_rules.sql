-- 0224: QUY LUẬT ĐẶT GIỜ TỪNG NGƯỜI (Điều Phối Lịch Live → "Luật đặt giờ từng người"), thay phần chữ trong ngoặc của ô MỨC CAST
-- ở sheet TỶ LỆ LỊCH LÀM ("6-7-CN, camp", "daily", "ca đêm", "JK camp, daily crocs"...). Một dòng / người (không theo tháng — luật ngày,
-- brand, khung giờ ít đổi; giờ cam kết vẫn theo tháng ở talent_month_commitments).
-- clauses = [{ "brandId": "<id>"?, "days": ["weekend"|"camp"|"regular", ...] }]; ca khớp khi khớp ÍT NHẤT MỘT điều kiện. night = chỉ nhận ca đêm.
-- Bộ xếp tự fill coi đây là luật MỀM mạnh (trừ điểm, tham số rosterRuleMissPenalty ở AI Training), không chặn khi không còn ai khác.
create table if not exists talent_schedule_rules (
  talent_id uuid primary key references talents(id) on delete cascade,
  clauses jsonb not null default '[]'::jsonb,
  night boolean not null default false,
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table talent_schedule_rules enable row level security;
drop policy if exists "talent_schedule_rules_read_staff" on talent_schedule_rules;
create policy "talent_schedule_rules_read_staff" on talent_schedule_rules for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "talent_schedule_rules_write_staff" on talent_schedule_rules;
create policy "talent_schedule_rules_write_staff" on talent_schedule_rules for all
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
