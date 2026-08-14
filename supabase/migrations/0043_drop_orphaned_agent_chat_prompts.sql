-- Hội Đồng AI & Simulator đã bỏ 2 persona chat "Host Coach AI" và "Talent Matcher AI"
-- (xem AiMultiAgent.tsx) — xoá luôn prompt tương ứng khỏi bảng cấu hình AI Training.
-- Không đụng agent_key 'talent_matcher' (không tiền tố agent_chat_) vì đó là prompt
-- khác, vẫn dùng cho route /api/gemini/match-talents ở tab Talent Pool.
delete from ai_agent_prompts where agent_key in ('agent_chat_host_coach', 'agent_chat_talent_matcher');
