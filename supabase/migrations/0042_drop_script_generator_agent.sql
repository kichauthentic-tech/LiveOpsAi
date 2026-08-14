-- Xoá module AI Script Gen. Sinh kịch bản livestream không còn là tính năng của app —
-- gỡ route /api/gemini/generate-script, tab UI và permission generate_scripts, đồng thời
-- xoá agent prompt tương ứng khỏi bảng cấu hình AI Training.
delete from ai_agent_prompts where agent_key = 'script_generator';
