# Module Kế Toán — phạm vi tính toán trên app (đề xuất 2026-10-23, bản 2 thu hẹp)

> Trạng thái: **K1 đã build 23/10** (tab Kế Toán, chưa commit); K2 chưa làm. User chốt 23/10: kế toán trên app **chỉ dừng ở tính toán từ dữ liệu app**. KHÔNG làm: thuế (VAT/TNCN),
> hoá đơn điện tử, theo dõi thu tiền/công nợ, khấu hao, chi phí khác ngoài app, kê khai, hồ sơ MST/CCCD/ngân hàng, trạng thái đã chuyển khoản.
> Bản 1 (6 nhóm, 5 bước K0–K5) bị bỏ vì overscope.

## 1. Kế toán cần app tính ra gì mỗi tháng

| # | Số cần ra | Nguồn có sẵn trong app |
|---|-----------|------------------------|
| A | **Doanh thu theo hợp đồng** (user chốt 23/10: tách theo hợp đồng; hợp đồng = brand × sàn × khoảng tháng, tra bằng `contractCovering`): hợp đồng thu theo giờ ⇒ giờ giao × đơn giá, kèm giờ cam kết; hợp đồng thu theo % NMV ⇒ NMV × %, xem mục 1b | ca đủ bằng chứng (`isPnlSession`, `billableSessionHours`), `brand_platform_rates` + lịch sử, `brand_contracts`, `brand_monthly_commitments` |
| B | **Công talent theo người:** giờ host / giờ trợ, rate, tiền công | `computeSessionPnl().payouts`, `staffSegments`, `talent_rate_history` |
| C | **Chi phí ca đã có trong app:** studio, Ads theo ca | `session_finance.studio_cost`, `live_session_reports.ads_cost` |
| D | **Lãi gộp tháng** = A − B − C, theo brand × sàn và toàn agency | cộng từ A, B, C |

Không có nhóm nào ngoài bốn nhóm này.

### 1b. Hợp đồng thu theo % NMV: ước tính trước, chính thức sau (user chốt 23/10)

NMV chỉ có số thật sau ~15 ngày kể từ ngày cuối tháng (hoàn/huỷ chạy xong). Vì vậy dòng doanh thu % NMV có 2 trạng thái:
- **Ước tính** (từ cuối tháng tới khi có NMV thật): NMV = GMV × (1 − % hoàn huỷ dự kiến), % lấy từ `returnRate` của `brand_platform_rates` (đúng công thức `computeSessionPnl` đang dùng). Nhãn "ước tính", ghi % hoàn huỷ đang dùng.
- **Chính thức**: khi có NMV thật của tháng, thay số ước tính; hiện chênh lệch ước tính ↔ thật để kế toán thấy mức lệch.
Lãi gộp của hợp đồng % NMV thừa hưởng nhãn này (tháng còn ước tính ⇒ lãi gộp cũng "ước tính").
**Nguồn NMV thật (user chốt 23/10): file Seller Center ở Dữ Liệu Gốc.** Đã đọc code `shopAnalyticsDays.ts`: file `shop_analytics` có cột `Hoàn tiền/Refunds` và `GMV` **theo ngày, cho CẢ shop (mọi kênh, không riêng live)**; không có cột NMV. Vậy NMV thật của live KHÔNG đọc thẳng được, phải suy: **% hoàn thật của tháng = Σ Hoàn tiền ÷ Σ GMV của shop**, rồi NMV live chính thức = GMV live × (1 − % hoàn thật). Đây là xấp xỉ (live có thể hoàn khác phần còn lại của shop) — user cần chấp nhận; bảng ghi rõ "% hoàn lấy từ cả shop". **User chấp nhận xấp xỉ này (23/10)** — UI luôn ghi "NMV suy từ % hoàn của cả shop (xấp xỉ)". Chưa kiểm: cột Hoàn tiền tính theo ngày đặt hay ngày hoàn, và Shopee có cột tương đương không (`shopeeFiles.ts` chưa thấy) — việc kiểm đầu tiên của K1 trên file thật (so tổng Hoàn tiền tháng 9 với ước tính của brand đang thu % NMV).

## 2. Hiện trạng (đã đọc code)

- Đã có đủ công thức: P&L từng ca (`lib/pnl.ts`), rate có lịch sử theo ngày, công từng người kể cả đổi người giữa ca, duyệt chi phí ca. Màn Finance & P&L (`FinanceHr.tsx`) hiện chỉ ceo/admin xem.
- Thiếu so với nhu cầu kế toán: (1) **bảng tổng hợp tháng theo brand × sàn** và **theo người** có thể đưa kế toán đối chiếu; (2) xuất Excel đúng mảng đang hiển thị; (3) cách **chốt số tháng** để số đã đưa kế toán không tự đổi khi rate/đối soát sửa sau; (4) role xem cho kế toán.
- Rate talent phần lớn chưa nhập ⇒ tiền công đang là "chưa biết", không phải 0; module phải nói rõ (`missingInputs`) và liệt kê người thiếu rate lên đầu.

## 3. Kế hoạch build (2 bước, không đụng thuế/hoá đơn)

**K1 — Tab "Kế Toán" chỉ đọc + Excel (không migration).** Chọn tháng bằng `MonthPicker`, 3 bảng:
- *Doanh thu theo brand × sàn* (A) — kèm số ca bị loại (chờ xác nhận, nạp bù, thiếu rate) và lý do, luôn ghi "tính được X/Y ca".
- *Công talent theo người* (B) — người thiếu rate đứng đầu; bấm người xem từng ca đã tính.
- *Chi phí ca & lãi gộp* (C, D) — theo brand × sàn, dòng tổng agency.
Nút Tải Excel dùng đúng mảng đang render (`exportXlsx.ts`). Giá trị: kế toán có số thật tháng 10 để đối chiếu với sổ của họ, phát hiện lệch sớm. Lệch giữa Finance & P&L cũ và tab mới = lỗi, phải là một nguồn tính (gom về `pnl.ts`, không viết công thức thứ hai).

**K2 — Chốt số tháng (migration nhỏ).** Bản chụp tháng (khuôn bản chụp Report 0119): bấm "Chốt" lưu các bảng K1 vào snapshot; sau đó kế toán xem bản chụp, app báo "số hiện tại đã khác bản chụp" nếu rate/đối soát đổi. Có thể kèm khoá sửa ca/rate của tháng đã chốt (khuôn `trg_guard_published_month_sessions`) — **chỉ làm nếu user muốn khoá**, mặc định chỉ báo lệch. Role `accountant` xem-chỉ-đọc (khuôn `trainer`: enum riêng rồi mới phần còn lại); nếu chưa cần role riêng thì cấp quyền xem cho tài khoản kế toán qua ceo/admin trước.

## 4. Quy ước áp dụng

- Số tiền chỉ lấy từ `computeSessionPnl`/`staffSegments`; hiển thị `fmtVndFull`, không chữ "đ". Ca `is_backfill` và ca chờ xác nhận không vào tiền nhưng phải đếm và nói ra.
- Tiền agency cộng được hai sàn, nhưng bảng luôn tách dòng theo sàn (hợp đồng riêng từng sàn).
- Tab mới vào `TAB_CHUNKS`, `PageHeader`, `MonthPicker`; thuật ngữ mới vào `GlossaryDialog`; thiếu rate thêm một việc vào `todoList.ts`.

## 5. Đã chốt / còn mở

- Đã chốt 23/10: (1) doanh thu tách theo hợp đồng; (2) có brand thu % NMV, NMV chờ ~15 ngày ⇒ ước tính theo % hoàn huỷ dự kiến (mục 1b); (4) không có bảng kế toán cũ để đối chiếu ⇒ K1 tự kiểm bằng cách so với Finance & P&L hiện tại và đối chiếu tay vài hợp đồng với ops.
- Đã chốt: NMV thật = GMV live × (1 − % hoàn thật cả shop từ file Seller Center), ghi rõ xấp xỉ.
- Còn mở: brand nào đang thu % NMV và % hoàn huỷ dự kiến của từng hợp đồng đã nhập chưa?
- Câu 3 (chốt số tháng): xem giải thích gửi user; mặc định K2 = bản chụp "tạm tính" khi chốt sớm, "chính thức" sau khi có NMV thật, chỉ báo lệch, không khoá.
