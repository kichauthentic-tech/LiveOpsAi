-- Xoá tính năng "AI Brand Meeting Summarizer & Action Item Generator" khỏi CRM & Projects
-- (route /api/gemini/summarize-meeting, khối UI tóm tắt cuộc họp) theo yêu cầu user —
-- xoá luôn agent prompt tương ứng khỏi bảng cấu hình AI Training.
delete from ai_agent_prompts where agent_key = 'meeting_summarizer';
