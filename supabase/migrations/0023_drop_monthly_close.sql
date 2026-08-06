-- Gỡ bỏ module Đóng Sổ Tháng (Giai đoạn 20) — trùng chức năng với Finance & P&L (P&L theo
-- session) và Brand Invoices (theo dõi công nợ brand), UI đã bị xóa khỏi App.tsx. Trigger khoá
-- session_finance theo tháng cũng gỡ theo vì không còn nơi nào set monthly_closes.status='locked'
-- nữa — giữ lại trigger sẽ chỉ chặn sửa Finance mà không ai mở khoá lại được.
--
-- brand_invoices KHÔNG bị đụng tới — bảng này vẫn phục vụ tính năng Brand Invoices (brand
-- workspace) đang giữ lại.

drop trigger if exists trg_session_finance_lock_check on session_finance;
drop function if exists trg_block_session_finance_when_locked();

drop table if exists monthly_closes;
