-- Hồ sơ host / trợ live thật (user gửi 2026-09-19). Chạy SAU 0087 (cần enum 'Assistant' + cột nickname).
-- Chạy trong SQL Editor. Không tạo tài khoản đăng nhập (làm ở Phân Quyền & Role khi cần).
-- Rate/hoa hồng để 0 — bổ sung ở Talent Matcher sau; ca nạp bù không tính lương nên chưa cần.
-- Bỏ #4 HUỲNH TUẤN ANH (OP — là admin, không phải talent). HOST/ASSISTANT → nhãn Host (nhãn không
-- chặn gì, người này vẫn chọn được vào ô trợ live).
-- 3 dòng "Nguyễn Thị Kim Vân" (#18 host, #25 host, #26 trợ) tạo thành 3 hồ sơ riêng với tên ngắn tạm
-- "Kim Vân (H1)/(H2)/(Trợ)" — đổi ở Talent Matcher; nếu #18 và #25 thực ra là một người thì xoá một.
-- Giới tính đoán theo tên, sửa nếu sai.

insert into talents (name, nickname, role, gender, niches, availability_status) 
select v.name, v.nickname, v.role::talent_role, v.gender, '{}'::text[], 'Available'
from (values
  /* #2 */ ('Huỳnh Trúc My', 'Trúc My', 'Host', 'Nữ'),
  /* #3 */ ('Huỳnh Tấn Khanh', 'Tấn Khanh', 'Host', 'Nam'),
  /* #5 */ ('Nguyễn Trà Giang', 'Trà Giang', 'Assistant', 'Nữ'),
  /* #6 */ ('Ngô Thị Kiều Trang', 'Kiều Trang', 'Host', 'Nữ'),
  /* #7 */ ('Trần Ngọc Bảo Thy', 'Bảo Thy', 'Host', 'Nữ'),
  /* #8 */ ('Nguyễn Thị Xuân Mai', 'Xuân Mai', 'Host', 'Nữ'),
  /* #9 */ ('Nguyễn Hải Thiện', 'Hải Thiện', 'Host', 'Nam'),
  /* #10 */ ('Bùi Sỹ Hùng', 'Sỹ Hùng', 'Host', 'Nam'),
  /* #11 */ ('Lê Minh Nhật', 'Minh Nhật', 'Host', 'Nam'),
  /* #12 */ ('Lại Minh Phú', 'Minh Phú', 'Host', 'Nam'),
  /* #13 */ ('Lê Quang An', 'Quang An', 'Host', 'Nam'),
  /* #14 */ ('Phan Thị Yến Nhi', 'Yến Nhi', 'Host', 'Nữ'),
  /* #15 */ ('Lê Thị Tố Uyên', 'Tố Uyên', 'Host', 'Nữ'),
  /* #16 */ ('Nguyễn Thị Thanh Hằng', 'Thanh Hằng', 'Host', 'Nữ'),
  /* #17 */ ('Trương Thị Khánh Linh', 'Khánh Linh', 'Host', 'Nữ'),
  /* #18 */ ('Nguyễn Thị Kim Vân', 'Kim Vân (H1)', 'Host', 'Nữ'),
  /* #19 */ ('Lê Bảo Cát Tường', 'Cát Tường', 'Host', 'Nữ'),
  /* #20 */ ('Trần Thị Thu Hiền', 'Thu Hiền', 'Host', 'Nữ'),
  /* #21 */ ('Nguyễn Phúc Diễm My', 'Diễm My', 'Host', 'Nữ'),
  /* #22 */ ('Hồ Phương Hoa', 'Phương Hoa', 'Host', 'Nữ'),
  /* #24 */ ('Dương Hữu Nhơn', 'Hữu Nhơn', 'Host', 'Nam'),
  /* #25 */ ('Nguyễn Thị Kim Vân', 'Kim Vân (H2)', 'Host', 'Nữ'),
  /* #26 */ ('Nguyễn Thị Kim Vân', 'Kim Vân (Trợ)', 'Assistant', 'Nữ'),
  /* #27 */ ('Phạm Thị Phương Loan', 'Phương Loan', 'Assistant', 'Nữ'),
  /* #28 */ ('Dương Thị Anh Thư', 'Anh Thư', 'Assistant', 'Nữ'),
  /* #29 */ ('Trần Thị Hồng Vân', 'Hồng Vân', 'Assistant', 'Nữ'),
  /* #30 */ ('Nguyễn Thị Phương Thảo', 'Phương Thảo', 'Assistant', 'Nữ'),
  /* #31 */ ('Đoàn Nhã Huyền Trang', 'Huyền Trang', 'Assistant', 'Nữ'),
  /* #32 */ ('Văng Hồng Thanh Ngân', 'Thanh Ngân', 'Assistant', 'Nữ'),
  /* #33 */ ('Huỳnh Thái Toàn', 'Thái Toàn', 'Host', 'Nam'),
  /* #34 */ ('Nguyễn Quốc Việt', 'Quốc Việt', 'Assistant', 'Nam'),
  /* #35 */ ('Nguyễn Triệu Vương', 'Triệu Vương', 'Assistant', 'Nam'),
  /* #36 */ ('Hoàng Vĩnh Thịnh', 'Vĩnh Thịnh', 'Assistant', 'Nam'),
  /* #37 */ ('Lê Đức Duy', 'Đức Duy', 'Assistant', 'Nam'),
  /* #38 */ ('Nguyễn Phan Kiều Mỹ Linh', 'Mỹ Linh', 'Assistant', 'Nữ')
) as v(name, nickname, role, gender)
where not exists (select 1 from talents t where t.name = v.name and t.nickname = v.nickname);

select nickname, name, role from talents order by role, name;
