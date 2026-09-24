-- Đo 0114/0115/0116 đã vào chưa. CHỈ ĐỌC, không sửa gì — chạy bao nhiêu lần cũng được.
-- Mọi dòng phải ra ok = true. Dòng nào false thì migration tương ứng chưa chạy (hoặc chạy lỗi giữa chừng).
select '0114 · cột excluded_from_reports' as muc,
       to_regclass('public.live_sessions') is not null
       and exists (select 1 from information_schema.columns
                    where table_name='live_sessions' and column_name='excluded_from_reports') as ok
union all
select '0114 · RPC set_session_excluded',
       exists (select 1 from pg_proc where proname='set_session_excluded')
union all
-- View phải MANG cột mới, không chỉ tồn tại: nếu 0114 chạy nửa chừng thì view cũ vẫn còn đó.
select '0114 · view live_sessions_secure có cột mới',
       exists (select 1 from information_schema.columns
                where table_name='live_sessions_secure' and column_name='excluded_from_reports')
union all
select '0115 · RPC delete_month_plan',
       exists (select 1 from pg_proc where proname='delete_month_plan')
union all
select '0116 · RPC request_shift_dropout',
       exists (select 1 from pg_proc where proname='request_shift_dropout')
union all
select '0116 · hàm notify_ops',
       exists (select 1 from pg_proc where proname='notify_ops')
union all
-- Điểm dễ hỏng ÂM THẦM nhất của cả đợt: constraint cũ còn sống thì mọi thứ khác đúng hết,
-- chỉ tới lúc trigger bắn thật mới chết. Hỏi thẳng định nghĩa constraint.
select '0116 · constraint kind nhận shift_open + shift_dropout_request',
       exists (select 1 from pg_constraint con
                join pg_class rel on rel.oid = con.conrelid
               where rel.relname='notifications' and con.contype='c'
                 and pg_get_constraintdef(con.oid) like '%shift_open%'
                 and pg_get_constraintdef(con.oid) like '%shift_dropout_request%')
       and (select count(*) from pg_constraint con
             join pg_class rel on rel.oid = con.conrelid
            where rel.relname='notifications' and con.contype='c'
              and pg_get_constraintdef(con.oid) ilike '%kind%') = 1  -- đúng MỘT, không còn cái cũ
union all
select '0116 · trigger trg_notify_slot_opened',
       exists (select 1 from pg_trigger where tgname='trg_notify_slot_opened' and not tgisinternal)
union all
select '0116 · trigger trg_notify_plan_locked',
       exists (select 1 from pg_trigger where tgname='trg_notify_plan_locked' and not tgisinternal)
union all
-- Đ8: điều kiện cũ `old.data_source = 'manual'` phải BIẾN MẤT khỏi thân hàm.
select '0116 · notify_session_changes bắt cả live_snapshot',
       exists (select 1 from pg_proc where proname='notify_session_changes'
                 and prosrc like '%''manual'', ''live_snapshot''%');
