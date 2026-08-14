-- Xoá module Voucher Đồng Tài Trợ (Co-Funded Voucher Request Center, Giai đoạn B5).
-- Feature bị bỏ khỏi sản phẩm; xoá bảng cùng index/policy được tạo ở migration 0028.

drop table if exists co_funded_vouchers;
