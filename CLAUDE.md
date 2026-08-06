# LiveOps AI — Hướng dẫn cho Claude Code

## Bối cảnh dự án
Đang thực hiện lộ trình biến app từ demo UI/mock-data thành hệ thống vận hành thật, chia theo từng giai đoạn (Giai đoạn 0, 1, 2...). Tiến độ và quyết định kỹ thuật của từng giai đoạn được lưu ở **`WORKSPACE_DESIGN.md`** — luôn đọc file đó đầu tiên khi bắt đầu phiên làm việc mới hoặc một giai đoạn mới, trước khi đọc code.

> `PROJECT_STATUS.md`/`BUSINESS_ROADMAP.md` đã bị xoá có chủ đích, không khôi phục — `WORKSPACE_DESIGN.md` thay thế vai trò "trạng thái sống" của dự án.

## Quy ước bắt buộc: cập nhật WORKSPACE_DESIGN.md cuối mỗi giai đoạn

Ngay sau khi hoàn thành và verify xong một giai đoạn trong roadmap (không cần người dùng nhắc), phải **tự động cập nhật `WORKSPACE_DESIGN.md`** ở thư mục gốc với:

1. **Đã hoàn thành** — thêm mục cho giai đoạn vừa xong: những gì đã build, file/module liên quan, cách đã test/verify.
2. **Còn lại** — cập nhật danh sách phần vẫn đang mock/localStorage/chưa động tới.
3. **Quy ước kỹ thuật** — pattern/convention mới phát sinh trong giai đoạn đó mà giai đoạn sau cần tuân theo (vd: cấu trúc service layer, RLS pattern, cách đặt tên...).
4. **Giai đoạn tiếp theo** — mô tả ngắn gọn scope của giai đoạn kế tiếp.

Giữ file này là **một file sống duy nhất** (không tạo file riêng theo từng giai đoạn) — ghi đè/cập nhật mục tương ứng, không append lặp lại toàn bộ lịch sử. Mục tiêu: một session Claude Code mới có thể đọc riêng file này là đủ để tiếp tục làm việc mà không cần thấy lại lịch sử chat trước đó.

## Vì sao có quy ước này
Người dùng thường mở session mới cho mỗi giai đoạn để tiết kiệm token (session dài tích lũy context tốn kém hơn). `WORKSPACE_DESIGN.md` là cầu nối ngữ cảnh giữa các session.
