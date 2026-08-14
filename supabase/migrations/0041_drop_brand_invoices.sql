-- Xoá module Hoá Đơn & Công Nợ Brand (Giai đoạn 20). Công nợ là nghiệp vụ kế toán riêng,
-- ngoài phạm vi app — app chỉ cần cung cấp số liệu doanh thu ước tính (Finance & P&L) để
-- đối soát với sàn/kế toán, không tracking trạng thái thu tiền.
drop table if exists brand_invoices;
