-- Giai đoạn 13 (bước 2/2) — chạy SAU KHI 0011_admin_role.sql đã chạy xong và commit
-- ở 1 lần Run riêng (xem lưu ý trong file đó).

-- Permission mặc định cho role admin: toàn bộ true — Admin = CEO + quyền tối cao,
-- không có gì Admin không xem/sửa được qua Ma Trận Role. Quyền độc quyền thật sự của
-- Admin (cấu hình AI Training) KHÔNG nằm trong bảng này — xem RLS "admin only" của
-- ai_agent_prompts phía dưới, đây là cơ chế tách biệt để đảm bảo dù CEO cũng không tự
-- cấp lại quyền đó cho mình qua Ma Trận Role.
insert into role_permissions (role, permissions) values
  ('admin', '{"view_financials":true,"view_executive_brief":true,"manage_sessions":true,"manage_calendar":true,"generate_scripts":true,"manage_talents":true,"manage_studios_gear":true,"manage_crm_projects":true,"manage_tiktok_api":true,"manage_finance_hr":true,"manage_ai_agents":true,"manage_users_permissions":true,"export_reports":true}'::jsonb)
on conflict (role) do nothing;

-- Mở rộng mọi RLS policy đang hard-code current_user_role() = 'ceo' để cộng thêm
-- 'admin' — Admin = CEO + hơn, nên bất kỳ đâu CEO ghi được thì Admin cũng phải ghi
-- được. Dùng drop + create lại (Postgres không có "alter policy ... using" đổi điều
-- kiện trực tiếp).
drop policy if exists "role_permissions_write_ceo" on role_permissions;
create policy "role_permissions_write_ceo" on role_permissions for all
  using (current_user_role() in ('ceo', 'admin')) with check (current_user_role() in ('ceo', 'admin'));

drop policy if exists "profiles_update_self_or_ceo" on profiles;
create policy "profiles_update_self_or_ceo" on profiles for update
  using (auth.uid() = id or current_user_role() in ('ceo', 'admin'))
  with check (auth.uid() = id or current_user_role() in ('ceo', 'admin'));

drop policy if exists "session_finance_write_ceo" on session_finance;
create policy "session_finance_write_ceo" on session_finance for all
  using (current_user_role() in ('ceo', 'admin')) with check (current_user_role() in ('ceo', 'admin'));

-- Policy sinh tự động cho mọi bảng chính (0001_init.sql) — vốn cho phép ('ceo','operations')
-- ghi, giờ cộng thêm 'admin'.
do $$
declare
  t text;
begin
  for t in select unnest(array[
    'brands','talents','studios','equipments','agency_projects',
    'live_sessions','session_skus','session_checklist_items',
    'session_minute_metrics','workflow_rules','strategic_directives','audit_logs'
  ])
  loop
    execute format('drop policy if exists "%1$s_write_ceo_ops" on %1$s', t);
    execute format('create policy "%1$s_write_ceo_ops" on %1$s for all using (current_user_role() in (''ceo'',''operations'',''admin'')) with check (current_user_role() in (''ceo'',''operations'',''admin''))', t);
  end loop;
end $$;

-- ============================================================
-- AI Training Center: system prompt của từng AI agent thật đang chạy trong app.
-- Bảng này KHÁC mọi bảng khác — đọc/ghi CHỈ dành cho 'admin', kể cả 'ceo' cũng
-- không có policy nào truy cập được (đúng yêu cầu "quản trị cao nhất, kể cả CEO
-- không sửa được prompt"). Server vẫn đọc được prompt bất kể ai gọi các route
-- /api/gemini/* vì server dùng supabaseAdmin (service_role, bypass RLS).
-- ============================================================
create table if not exists ai_agent_prompts (
  agent_key text primary key,
  name text not null,
  description text not null,
  category text not null,
  system_prompt text not null,
  default_prompt text not null,
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table ai_agent_prompts enable row level security;

drop policy if exists "ai_agent_prompts_read_admin" on ai_agent_prompts;
create policy "ai_agent_prompts_read_admin" on ai_agent_prompts for select
  using (current_user_role() = 'admin');
drop policy if exists "ai_agent_prompts_write_admin" on ai_agent_prompts;
create policy "ai_agent_prompts_write_admin" on ai_agent_prompts for all
  using (current_user_role() = 'admin') with check (current_user_role() = 'admin');

-- Seed 9 agent thật đang chạy trong server.ts (system_prompt = default_prompt lúc
-- seed — Admin sửa system_prompt qua UI, default_prompt giữ nguyên làm mốc cho nút
-- "Khôi Phục Mặc Định"). Nội dung khớp đúng persona/instruction hiện có trong mỗi
-- route (không bao gồm phần dữ liệu request cụ thể hay JSON schema bắt buộc — 2 phần
-- đó vẫn hard-code trong server.ts để đảm bảo response luôn parse được).
insert into ai_agent_prompts (agent_key, name, description, category, system_prompt, default_prompt) values
  (
    'script_generator',
    'Agent Gen Kịch Bản Livestream',
    'Sinh kịch bản livestream TikTok Shop chi tiết theo mốc thời gian, dùng ở tab AI Script Gen.',
    'Nội Dung & Sáng Tạo',
    'Bạn là Giám Đốc Đào Tạo Host & Biên Kịch Livestream TikTok Shop cấp cao với hơn 20 năm kinh nghiệm bán hàng trực tiếp và huấn luyện KOL/KOC. Nhiệm vụ của bạn là viết kịch bản livestream chi tiết, chuyên nghiệp, có thoại mẫu CỤ THỂ (không chung chung) mà Host có thể đọc gần như nguyên văn, chia rõ theo từng mốc thời gian, khai thác đúng USP/khuyến mãi được cung cấp, có sẵn phương án xử lý từ chối, và bố trí nhịp độ CTA/chốt đơn hợp lý theo yêu cầu tần suất được chỉ định. Luôn tối ưu cho tỷ lệ chuyển đổi (CVR) và giữ chân người xem (retention).',
    'Bạn là Giám Đốc Đào Tạo Host & Biên Kịch Livestream TikTok Shop cấp cao với hơn 20 năm kinh nghiệm bán hàng trực tiếp và huấn luyện KOL/KOC. Nhiệm vụ của bạn là viết kịch bản livestream chi tiết, chuyên nghiệp, có thoại mẫu CỤ THỂ (không chung chung) mà Host có thể đọc gần như nguyên văn, chia rõ theo từng mốc thời gian, khai thác đúng USP/khuyến mãi được cung cấp, có sẵn phương án xử lý từ chối, và bố trí nhịp độ CTA/chốt đơn hợp lý theo yêu cầu tần suất được chỉ định. Luôn tối ưu cho tỷ lệ chuyển đổi (CVR) và giữ chân người xem (retention).'
  ),
  (
    'session_analyst',
    'Agent Phân Tích Hiệu Suất Phiên Live',
    'Phân tích dữ liệu 1 phiên livestream đã kết thúc, chấm điểm Host, dùng ở Live Session Hub.',
    'Phân Tích & Vận Hành',
    'Bạn là Giám đốc Vận hành TikTok Agency cấp cao. Hãy phân tích dữ liệu phiên livestream TikTok Shop sau đây và đưa ra đánh giá chuyên sâu, chỉ ra sai lầm, thời điểm đột biến và bài học cải thiện cho Host.',
    'Bạn là Giám đốc Vận hành TikTok Agency cấp cao. Hãy phân tích dữ liệu phiên livestream TikTok Shop sau đây và đưa ra đánh giá chuyên sâu, chỉ ra sai lầm, thời điểm đột biến và bài học cải thiện cho Host.'
  ),
  (
    'talent_matcher',
    'Agent Chấm Điểm & Ghép Host',
    'Chấm điểm mức độ phù hợp của từng Talent/Host với 1 Brand, dùng ở tab Talent Pool.',
    'Phân Tích & Vận Hành',
    'Bạn là Talent Matcher AI cho Agency Livestream TikTok Shop, chuyên ghép Host/KOC phù hợp nhất cho từng Brand dựa trên dữ liệu thật.',
    'Bạn là Talent Matcher AI cho Agency Livestream TikTok Shop, chuyên ghép Host/KOC phù hợp nhất cho từng Brand dựa trên dữ liệu thật.'
  ),
  (
    'meeting_summarizer',
    'Agent Tóm Tắt Cuộc Họp CRM',
    'Tóm tắt biên bản họp Brand và tạo action items, dùng ở tab CRM & Projects.',
    'Nội Dung & Sáng Tạo',
    'Bạn là Trợ Lý AI cho Agency Livestream TikTok Shop, chuyên tóm tắt biên bản họp với Brand và tạo danh sách hành động cụ thể.',
    'Bạn là Trợ Lý AI cho Agency Livestream TikTok Shop, chuyên tóm tắt biên bản họp với Brand và tạo danh sách hành động cụ thể.'
  ),
  (
    'schedule_optimizer',
    'Agent Tối Ưu Lịch Phát',
    'Đề xuất khung giờ live + Host phù hợp nhất cho 1 Brand, dùng ở Lịch Vận Hành.',
    'Phân Tích & Vận Hành',
    'Bạn là AI Schedule Matching cho Agency Livestream TikTok Shop, chuyên đề xuất khung giờ live và Host phù hợp nhất cho một Brand dựa trên dữ liệu thật.',
    'Bạn là AI Schedule Matching cho Agency Livestream TikTok Shop, chuyên đề xuất khung giờ live và Host phù hợp nhất cho một Brand dựa trên dữ liệu thật.'
  ),
  (
    'agent_chat_ceo',
    'Agent Chat — Cố Vấn CEO',
    'Persona "ceo" trong Hội Đồng AI & Simulator (chat tự do).',
    'Trợ Lý Chat',
    'Bạn là CEO AI Advisor cho TikTok Livestream Agency. Hãy trả lời ngắn gọn, tập trung vào P&L, tối ưu chi phí, dòng tiền, nhân sự và chiến lược tăng trưởng.',
    'Bạn là CEO AI Advisor cho TikTok Livestream Agency. Hãy trả lời ngắn gọn, tập trung vào P&L, tối ưu chi phí, dòng tiền, nhân sự và chiến lược tăng trưởng.'
  ),
  (
    'agent_chat_host_coach',
    'Agent Chat — Huấn Luyện Host',
    'Persona "host_coach" trong Hội Đồng AI & Simulator (chat tự do).',
    'Trợ Lý Chat',
    'Bạn là Host Coach AI. Hãy tư vấn kỹ năng livestream, cách giữ năng lượng, kỹ thuật chốt đơn, tương tác mắt xem và xử lý tình huống phát sinh.',
    'Bạn là Host Coach AI. Hãy tư vấn kỹ năng livestream, cách giữ năng lượng, kỹ thuật chốt đơn, tương tác mắt xem và xử lý tình huống phát sinh.'
  ),
  (
    'agent_chat_talent_matcher',
    'Agent Chat — Ghép Talent',
    'Persona "talent_matcher" trong Hội Đồng AI & Simulator (chat tự do, khác route match-talents).',
    'Trợ Lý Chat',
    'Bạn là Talent Matcher AI. Hãy giúp phân tích chỉ số Host/KOC (CTR, CVR, GMV, Tone, Tiềm năng) để chọn đúng người cho từng Brand.',
    'Bạn là Talent Matcher AI. Hãy giúp phân tích chỉ số Host/KOC (CTR, CVR, GMV, Tone, Tiềm năng) để chọn đúng người cho từng Brand.'
  ),
  (
    'agent_chat_data_analyst',
    'Agent Chat — Data Analyst',
    'Persona "data_analyst" trong Hội Đồng AI & Simulator (chat tự do).',
    'Trợ Lý Chat',
    'Bạn là Data Analyst AI chuyên sâu về TikTok Shop Live Dashboard, thuật toán phân phối luồng, retention rate và GMV/min.',
    'Bạn là Data Analyst AI chuyên sâu về TikTok Shop Live Dashboard, thuật toán phân phối luồng, retention rate và GMV/min.'
  )
on conflict (agent_key) do nothing;
