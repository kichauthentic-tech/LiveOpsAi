-- 0134 — Dọn liên hệ MẪU còn nằm trong bảng brands (audit người mới 2026-10-04).
--
-- Form "Thêm thương hiệu" ở CRM từng điền sẵn SĐT "0909 123 456", email "contact@brand.com", KAM
-- "Lê Quốc Bảo (KAM Lead)" và để trống thì tự lưu "Nguyễn Văn A" / "0909 123 456" / "info@brand.com".
-- Đo trên production 04/10: Franklin và CROCS cùng SĐT 0909 123 456, JOCKEY 0909 333 444, VERA 0909 111 222;
-- cả 4 brand KAM = "Lê Quốc Bảo (KAM Lead)" trong khi không có tài khoản nào tên đó (Phân Quyền → Tài khoản: 4
-- tài khoản). Client đã bỏ giá trị điền sẵn; file này xoá phần đã lỡ lưu.
--
-- Chỉ xoá đúng các chuỗi mẫu đã biết; tên người đại diện (Stan, Khanh, Tuấn, Mai) giữ nguyên. KAM chỉ xoá khi
-- không gắn tài khoản nào (owner_user_id null). Chạy lại nhiều lần không sao. Không phụ thuộc thứ tự deploy.

update brands set phone = ''
 where phone in ('0909 123 456', '0909 333 444', '0909 111 222');

update brands set email = ''
 where email in ('contact@brand.com', 'info@brand.com');

update brands set contact_name = ''
 where contact_name = 'Nguyễn Văn A';

update brands set owner = ''
 where owner = 'Lê Quốc Bảo (KAM Lead)' and owner_user_id is null;

-- Tự kiểm: không còn chuỗi mẫu nào.
do $$
begin
  if exists (
    select 1 from brands
     where phone in ('0909 123 456', '0909 333 444', '0909 111 222')
        or email in ('contact@brand.com', 'info@brand.com')
        or contact_name = 'Nguyễn Văn A'
        or (owner = 'Lê Quốc Bảo (KAM Lead)' and owner_user_id is null)
  ) then
    raise exception '0134: vẫn còn liên hệ mẫu trong brands';
  end if;
end $$;
