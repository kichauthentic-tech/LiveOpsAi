# Master Prompt — gửi cho AI code khác để dựng PROTOTYPE thử UX Workspace/Brand

> Mục đích: đây là prompt để bạn dán vào 1 công cụ "vibe code" khác (Lovable, v0, Bolt, Cursor, Claude khác...)
> nhằm dựng NHANH 1 bản demo độc lập (mock data, không cần backend thật) để test luồng UX Agency ↔ Brand Workspace
> trước khi quay lại xác nhận implement thật vào app chính (LiveOps AI, đang chạy React + TypeScript + Supabase).
> Copy toàn bộ nội dung trong khối bên dưới, dán nguyên văn cho AI kia.

---

## PROMPT (copy từ đây)

Bạn là một senior frontend engineer. Hãy xây dựng một ứng dụng web React + TypeScript + TailwindCSS (dùng `lucide-react` cho icon) mô phỏng phần mềm quản lý vận hành cho một **agency livestream bán hàng** (agency ký hợp đồng với nhiều nhãn hàng — gọi là "Brand" — để tổ chức các phiên livestream bán hàng trên TikTok Shop/Shopee, thuê talent làm host, thuê studio quay).

Đây là bản **PROTOTYPE để test UX**, KHÔNG cần backend thật, KHÔNG cần authentication thật. Dùng mock data cứng trong code (đủ nhiều để nhìn có cảm giác thật — ít nhất 3 Brand, mỗi Brand vài Campaign, mỗi Campaign vài Session), state lưu trong React state hoặc localStorage là đủ. Ưu tiên **luồng điều hướng (navigation flow) và bố cục thông tin (information hierarchy)** đúng như mô tả dưới đây hơn là làm đẹp pixel-perfect.

### 1. Ý tưởng cốt lõi cần test: mô hình "Workspace" 2 lớp

Ứng dụng có 1 **Header** cố định trên cùng, trong đó có 1 **Workspace Switcher** dạng dropdown (giống Slack/Notion switch workspace) ở góc trái header, hiển thị tên workspace đang chọn kèm icon, click vào mở ra list:

- `🏢 Agency (Toàn cảnh)` — luôn có, là lựa chọn mặc định khi mở app.
- 1 dòng cho mỗi Brand đã có trong hệ thống (vd `🏷️ JOCKEY`, `🏷️ VERA`, `🏷️ CROCS`) — có avatar/logo brand nhỏ bên trái tên.

Khi chọn 1 mục trong dropdown, **toàn bộ sidebar điều hướng bên trái đổi hẳn sang bộ tab khác** (xem mục 2 và 3), và vùng nội dung chính load lại theo tab đầu tiên của bộ mới. Đây không phải là "thêm 1 bộ lọc brand" vào cùng 1 giao diện — đây là 2 bộ giao diện khác nhau, chỉ dùng chung Header.

Có 1 khái niệm role đơn giản để test (giả lập bằng 1 dropdown nhỏ ở Header hoặc màn hình login giả): `admin` (nhìn được cả Agency + mọi Brand, có quyền chọn trong switcher) và `brand_user` (chỉ đại diện đúng 1 brand cố định — khi role này, switcher **biến mất hoàn toàn**, app tự khoá cứng vào đúng Brand Workspace của họ, không có lựa chọn Agency hay brand khác).

### 2. Agency Workspace (chọn "🏢 Agency") — sidebar gồm các nhóm/tab sau

**Nhóm "Tổng Quan"**
- `Dashboard Tổng` — hero: tổng GMV toàn agency tháng này, số phiên live hôm nay, số Brand đang active. Bên dưới: 1 dãy card, mỗi card = 1 Brand (tên, logo, GMV tháng này, trạng thái hợp đồng Active/Pending) — **click vào 1 card này phải nhảy thẳng sang Brand Workspace của brand đó** (đây là điểm nối quan trọng giữa 2 lớp, bắt buộc phải có).
- `Việc Của Tôi` — placeholder đơn giản, không cần làm sâu.

**Nhóm "Vận Hành Live" (Live Ops — luôn nhìn xuyên mọi Brand cùng lúc)**
- `Live Sessions` — bảng danh sách mọi phiên live của mọi brand, cột Brand để phân biệt, filter theo status (Scheduled/Live Now/Completed/Cancelled).
- `Lịch Vận Hành` — calendar view (theo tuần/tháng) hiện mọi phiên live của mọi brand cùng lúc, mỗi ô sự kiện có màu theo Brand khác nhau — mục đích là để Ops nhìn thấy đụng lịch Studio/Talent giữa các Brand.
- `Đăng Ký & Chốt Lịch` — danh sách ca (shift) mở cần người đăng ký, không cần làm sâu, để trống form đơn giản cũng được.

**Nhóm "Tài Nguyên Chung" (thuộc sở hữu Agency, KHÔNG thuộc riêng Brand nào)**
- `Talent Pool` — danh sách host/talent (tên, rate/phiên, hoa hồng %, đánh giá) — nhấn mạnh: 1 talent có thể làm việc cho nhiều Brand khác nhau.
- `Studios & Thiết Bị` — danh sách studio quay (tên, số giờ hoạt động/ngày, thiết bị).
- `Tỷ Lệ Lấp Đầy Studio` — biểu đồ đơn giản % sử dụng mỗi studio.

**Nhóm "Tài Chính"**
- `Finance & P&L Tổng` — bảng P&L gộp mọi phiên live mọi Brand.
- `Đóng Sổ Tháng` — chọn tháng, xem tổng doanh thu/lương/lợi nhuận công ty, nút "Đóng Sổ" (chỉ để demo UI, không cần logic khoá thật).

**Nhóm "Hệ Thống"**
- `Phân Quyền & Role`, `Tài Khoản Của Tôi` — để trống hoặc làm rất sơ sài, không phải trọng tâm.

### 3. Brand Workspace (chọn 1 brand cụ thể, vd "🏷️ JOCKEY") — sidebar đổi hẳn sang bộ tab RIÊNG, THIẾT KẾ KHÁC với Agency (không phải copy màn Agency rồi lọc)

Nguyên tắc quan trọng nhất: **khi đang ở trong 1 Brand Workspace, tuyệt đối không hiển thị bất kỳ dữ liệu nào của Brand khác.** Không có bộ lọc "chọn Brand" nào xuất hiện bên trong các màn hình này nữa vì đã ở trong context của đúng 1 Brand rồi (khác hẳn Agency Workspace là nơi luôn thấy nhiều Brand cùng lúc).

- `Dashboard [Tên Brand]` — bố cục gọn hơn Agency Dashboard nhiều: 1 hero card GMV tháng này của riêng brand này + so với KPI mục tiêu (progress bar), trạng thái Campaign đang chạy, số dư công nợ hiện tại. Không cần dãy card so sánh nhiều brand (vì ở đây chỉ có 1 brand).
- `Lịch Vận Hành [Tên Brand]` — calendar chỉ hiện phiên live của riêng brand này, không có cột/màu phân biệt brand (vì chỉ có 1).
- `Campaign` — đây là màn hình TRUNG TÂM nhất của Brand Workspace. Hiển thị dạng timeline dọc theo tháng: mỗi Campaign là 1 khối card gồm — tên campaign, khoảng ngày, KPI mục tiêu GMV, GMV thực tế đạt được (progress bar %), trạng thái duyệt (`Nháp / Đang chờ Brand duyệt / Brand yêu cầu sửa / Đã duyệt`), danh sách các phiên live thuộc campaign đó (thu gọn/mở rộng được), và ở cuối kỳ (khi campaign đã hoàn thành) hiện thêm khối "Đánh giá cuối kỳ": đạt KPI hay không, quyết định gia hạn (`Gia hạn / Có rủi ro / Ngừng hợp tác`), ghi chú.
- `Sessions [Tên Brand]` — bảng danh sách phiên live riêng brand này, kèm P&L rút gọn mỗi dòng (GMV, hoa hồng agency, trả host, lợi nhuận).
- `Rate Card` — bảng rate hiện tại của brand này theo từng nền tảng (TikTok/Shopee, đồng/giờ), kèm lịch sử thay đổi rate theo thời gian (bảng effective_from → effective_to).
- `Hoá Đơn & Công Nợ` — danh sách hoá đơn theo tháng của riêng brand này, trạng thái Chưa thu/Thu 1 phần/Đã thu đủ.

### 4. Yêu cầu về phong cách UI

- Theme tối (dark mode), nền `slate-900`/`slate-950`, card nền `slate-800` bo góc, viền `slate-700` mờ, chữ trắng/xám nhạt.
- Accent màu xanh dương (`blue-500`) cho hành động chính, xanh lá (`emerald`) cho trạng thái tốt/đã duyệt/live, vàng/hổ phách (`amber`) cho cảnh báo/đang chờ, đỏ (`red`) cho lỗi/thiếu người/quá hạn.
- Sidebar bên trái cố định, có thể thu gọn trên mobile.
- Đây là B2B internal tool, không cần responsive hoàn hảo cho mobile nhưng nên chạy được ở màn hình laptop bình thường (1440px) không vỡ layout.

### 5. Việc KHÔNG cần làm (ngoài phạm vi test này)

- Không cần kết nối backend/database thật.
- Không cần authentication thật (chỉ cần dropdown giả role như mô tả ở mục 1).
- Không cần làm sâu AI Script Generator, TikTok API integration, CRM & Projects, Hội Đồng AI — các module này KHÔNG nằm trong phạm vi test UX lần này, có thể bỏ qua hoàn toàn hoặc để 1 tab trống ghi "Coming soon".
- Không cần responsive mobile-first.

**Trọng tâm duy nhất cần đánh giá được sau khi bạn code xong:** luồng chuyển đổi Agency ↔ Brand Workspace qua dropdown switcher có mượt/dễ hiểu không, và bố cục riêng của Brand Workspace (đặc biệt màn `Campaign`) có đủ rõ ràng, đủ thông tin, không rối mắt không.

---

## Sau khi bạn test xong bản prototype này

Quay lại đây báo cho tôi: cái gì work tốt (giữ nguyên khi implement thật), cái gì cần đổi (bố cục, tên tab, thứ tự nhóm, thêm/bớt module) — tôi sẽ cập nhật `WORKSPACE_DESIGN.md` theo phản hồi thật trước khi bắt đầu chỉnh code vào app chính.
