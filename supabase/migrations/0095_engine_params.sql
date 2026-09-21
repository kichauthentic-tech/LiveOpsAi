-- Tham số engine Kế Hoạch Tháng vặn được từ AI Training Center (admin). Một dòng JSON theo engine_key;
-- chỉ giữ khoá admin đã đổi so với mặc định trong code (src/lib/scheduling/engineParams.ts) —
-- thiếu khoá = mặc định, nên xoá dòng này là engine về nguyên bản, không vỡ.
create table if not exists engine_params (
  engine_key text primary key,
  params jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table engine_params enable row level security;
-- Mọi người đăng nhập đọc được (MonthPlan/Đăng Ký & Chốt Lịch cần tham số), chỉ admin ghi — cùng
-- phạm vi với AI Training Center (ai_agent_prompts, 0012).
create policy "engine_params_read_all" on engine_params for select using (auth.role() = 'authenticated');
create policy "engine_params_write_admin" on engine_params for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');
