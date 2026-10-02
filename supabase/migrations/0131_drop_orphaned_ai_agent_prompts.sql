-- Dọn 4 agent prompt không còn route nào đọc (cùng kiểu 0042/0043/0044). Audit code chết 2026-10-02.
--
--   agent_chat_ceo, agent_chat_data_analyst — màn "Hội Đồng AI & Simulator" (AiMultiAgent) ẩn khỏi
--     menu từ 2026-09-18 và không còn đường vào (isTabAllowed chặn tab không có nav item); đã gỡ
--     hẳn component + route /api/gemini/agent-chat trong cùng đợt.
--   session_analyst — màn phân tích phiên của Live Sessions Hub, đã xoá 2026-09-13.
--   schedule_optimizer — route /api/gemini/optimize-schedule, đã gỡ 2026-10-01.
--
-- Không đụng 'talent_matcher': route /api/gemini/match-talents (tab Talent Pool) vẫn đọc prompt đó.
-- Sau migration này AI Training Center chỉ còn đúng 1 prompt — đúng bằng số tính năng AI còn chạy.
delete from ai_agent_prompts
where agent_key in ('agent_chat_ceo', 'agent_chat_data_analyst', 'session_analyst', 'schedule_optimizer');
