-- 0135 — Bỏ KAM mặc định của brand (tiếp 0134, audit người mới 2026-10-04).
--
-- Sau 0134 (đã chạy 05/10) CRM vẫn hiện KAM "Lê Quốc Bảo (KAM Lead)" ở cả 4 brand: 0134 chỉ xoá khi owner_user_id
-- null, nhưng đo 05/10 cả 4 brand đều gắn tài khoản HTA (admin). Form cũ khi thêm brand tự chọn tài khoản đầu danh
-- sách (`staffUsers[0]`) VÀ tự điền chữ "Lê Quốc Bảo (KAM Lead)"; chọn KAM thật trong form thì chữ đổi thành tên tài
-- khoản. Chữ mẫu còn nguyên ⇒ chưa ai từng chọn KAM ⇒ cả chữ lẫn tài khoản gắn kèm đều là giá trị form tự điền.
-- Xoá cả hai; ops chọn lại KAM thật ở CRM. Chạy lại nhiều lần không sao. Không phụ thuộc thứ tự deploy.

update brands set owner = '', owner_user_id = null
 where owner = 'Lê Quốc Bảo (KAM Lead)';

do $$
begin
  if exists (select 1 from brands where owner = 'Lê Quốc Bảo (KAM Lead)') then
    raise exception '0135: vẫn còn KAM mẫu trong brands';
  end if;
end $$;
