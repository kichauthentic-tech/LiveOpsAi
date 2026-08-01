# LiveOps AI — Lộ trình mở rộng theo workflow agency thật (Giai đoạn 15+)

> **File này là bản đặc tả chi tiết cho các giai đoạn SẮP làm** (khác với `PROJECT_STATUS.md`, vốn chỉ ghi những gì ĐÃ xong). Đọc cả 2 file khi bắt đầu phiên mới:
> - `PROJECT_STATUS.md` → biết hệ thống đang ở đâu, quy ước kỹ thuật đã chốt.
> - File này → biết bước tiếp theo làm gì, phạm vi tới đâu, test thế nào.
>
> **Quy trình cho mỗi giai đoạn dưới đây:** làm xong 1 giai đoạn → verify theo checklist trong mục đó → cập nhật `PROJECT_STATUS.md` theo đúng quy ước ở `CLAUDE.md` (thêm mục "Đã hoàn thành", cập nhật "Còn lại"/"Quy ước kỹ thuật"/"Giai đoạn tiếp theo") → quay lại **đánh dấu trạng thái ở file này** (đổi `[ ]` → `[x]`, cập nhật dòng "Trạng thái"). Không xoá các giai đoạn đã xong khỏi file này — giữ lại làm lịch sử quyết định thiết kế, giống cách `PROJECT_STATUS.md` đang làm.
>
> **Thứ tự không bắt buộc phải tuần tự tuyệt đối** — có ghi rõ "Phụ thuộc" ở mỗi giai đoạn để biết cái gì cần làm trước. Người dùng chọn giai đoạn nào làm trước ở đầu mỗi phiên, giống thói quen đã có từ Giai đoạn 9-14.

---

## Bối cảnh gốc — vì sao có lộ trình này

Sau khi làm việc trong 1 công ty outsourcing livestream thật, user phát hiện workflow thật chi tiết hơn nhiều so với những gì app hiện đang mô hình hoá. Tóm tắt workflow thật (giữ nguyên làm tài liệu tham chiếu):

1. **Brand** có 2 hình thức thu phí: theo % GMV, hoặc theo giờ live — ảnh hưởng trực tiếp tài chính/kế toán.
2. Mỗi tháng brand có **campaign** (Daily / Mega D-Day / Mid-month / Payday...) với **KPI GMV đã chốt trước** — từ đó phân bổ số giờ live cho phù hợp studio + mục tiêu GMV.
3. Lịch live có khung giờ tương đối cố định nhưng ngày không cố định — xuất **bảng phân bổ gửi brand duyệt**, brand có thể yêu cầu tăng/giảm/đổi ngày, chốt xong mới sang bước sau.
4. ~30 host/trợ live (full-time + part-time) **đăng ký lịch trống** theo slot đã mở → hệ thống lọc người phù hợp nhất khi nhiều người đăng ký 1 ca, cảnh báo khi thiếu Host hoặc Trợ live (hoặc cả hai) → chốt ca → tính **workload** làm cơ sở lương.
5. Sau khi live: nạp **report thật từ TikTok** (tài khoản Seller + tài khoản Live, có thể lệch số) → tính ra **17 chỉ số** (Item sold, Orders, UPT, Avg price, GPM, GMV/hour, Hour, View/hour, GMV/Product view, Product view, Product click, CTR, CTOR, View, Live impressions, Enter room live, Duration) → **dashboard trực quan** so sánh ngày/tháng/kỳ.
6. Phân tích lý do tăng/giảm GMV theo **4 nguồn** (Total live GMV, Aff GMV, Product card GMV, Video GMV) — biến động 10-15% chấp nhận được, lớn hơn phải tìm lý do. Có **AI Agent riêng theo từng brand**, được training với context/research riêng brand đó.
7. Cuối tháng: **tài chính/kế toán** — workload talent × ratecard → chi phí lương, đối soát kế toán; doanh thu agency thu về theo billing model của brand → tài chính sơ bộ công ty.

Phân tích với vai trò dev 20 năm + vận hành agency livestream 20 năm: hệ thống hiện tại (xem `PROJECT_STATUS.md` Giai đoạn 0-14c) đã làm rất tốt phần (4) — đăng ký/chốt ca, lịch ma trận, workload theo giờ. Các phần (1)(2)(3)(5)(6)(7) **chưa có** hoặc có nền nhưng thiếu field/bảng quan trọng. Ngoài ra, với kinh nghiệm vận hành agency thật, có thêm **7 điểm tối ưu workflow chưa được user nhắc tới** nhưng sẽ trở thành nút thắt khi công ty scale (xem mục "Đề xuất bổ sung" bên dưới) — quan trọng nhất là **rate card phải có lịch sử theo thời gian** (nếu không, sửa đơn giá tháng này sẽ làm sai lệch số liệu lương/P&L của các tháng trước đó khi hệ thống tính lại).

---

## Workflow doanh nghiệp 11 bước — đã vẽ sơ đồ, đang chờ CEO xác nhận

Sau khi viết lộ trình kỹ thuật (mục dưới đây), user yêu cầu vẽ lại **workflow thuần nghiệp vụ** (không phải trạng thái hệ thống) thành sơ đồ trực quan để gửi CEO duyệt — publish dạng artifact (link riêng, không nằm trong repo). Sơ đồ chốt tại thời điểm viết file này gồm **11 bước tuần tự, lặp lại hàng tháng**, tô màu theo vai trò thực hiện (Brand / Agency-Ops / Host & Trợ live / AI Agent / Kế toán):

1. Ký Hợp Đồng & Giao KPI — 2. Lên Kế Hoạch Campaign — 3. Phân Bổ Lịch Live — 4. Duyệt Lịch Với Brand (vòng lặp) — 5. Đăng Ký & Chốt Ca Nhân Sự — 6. **Chuẩn Bị Trước Live** *(mới)* — 7. Thực Hiện Phiên Live — 8. Cập Nhật Kết Quả Sau Live — 9. Phân Tích Nguyên Nhân & AI Tư Vấn — 10. Tài Chính & Kế Toán Cuối Tháng — 11. **Đánh Giá Cuối Campaign & Gia Hạn** *(mới)* → quay lại Bước 2.

So với mô tả gốc ở trên, đã bổ sung **8 điểm** (rà theo góc nhìn vận hành thật, không phải audit code). **CEO đã duyệt toàn bộ workflow, đồng ý hết 8 điểm bổ sung (2026-08-01)** — coi tất cả là quyết định chốt, không còn là đề xuất:

| # | Bổ sung vào workflow | Trạng thái CEO duyệt | Map vào giai đoạn kỹ thuật |
|---|---|---|---|
| 1 | Chuẩn bị nội dung & kỹ thuật trước live (chọn SKU, hàng mẫu tại studio, kiểm tra thiết bị/kết nối) — Bước 6 mới | ✅ Đã duyệt | Không cần entity mới — mở rộng `checklist` có sẵn trên session (`LiveSessionHub.tsx`), thêm checklist-template theo loại chuẩn bị |
| 2 | Xử lý thay người khẩn cấp khi Host/Trợ live báo bận sát giờ (danh sách dự phòng/on-call) | ✅ Đã duyệt | **Giai đoạn 15c** (mới, xem bên dưới) |
| 3 | Xuất hoá đơn & theo dõi công nợ Brand (tính doanh thu xong không có nghĩa đã thu tiền) | ✅ Đã duyệt | Mở rộng phạm vi **Giai đoạn 20** |
| 4 | Đánh giá cuối campaign: hiệu suất Host + quyết định gia hạn/cảnh báo rủi ro rời Brand — Bước 11 mới | ✅ Đã duyệt | **Giai đoạn 25** (mới, xem bên dưới) |
| 5 | Ưu tiên hoá khi 2-3 Brand cùng cần 1 studio/khung giờ vàng | ✅ Đã duyệt | Mở rộng phạm vi **Giai đoạn 15** |
| 6 | Đào tạo/brief Host định kỳ theo từng campaign mới (không chỉ brief lẻ theo phiên) | ✅ Đã duyệt | Mở rộng phạm vi **Giai đoạn 15** (gắn vào Campaign, ưu tiên thấp) |
| 7 | Đánh giá hiệu suất Host sau mỗi campaign (feed vào chọn người campaign sau) | ✅ Đã duyệt | Mở rộng phạm vi **Giai đoạn 24** (đổi tên thành "Đánh giá & Độ tin cậy Talent") |
| 8 | Checkpoint giữa chu kỳ campaign — GMV lệch target giữa tháng thì quay lại Bước 3 điều chỉnh ngay, không chờ cuối tháng | ✅ Đã duyệt | Mở rộng phạm vi **Giai đoạn 18** |

**CEO đã duyệt toàn bộ workflow (2026-08-01)** — không còn việc gì treo ở mục này trước khi code. Các giai đoạn đánh dấu "chờ CEO xác nhận" (15c, 25) ở bên dưới nay đã được chốt phạm vi, có thể code theo đúng phạm vi dự kiến đã ghi.

---

## Đề xuất bổ sung (góc nhìn vận hành, ngoài phạm vi user mô tả)

Đây là các vấn đề sẽ phát sinh khi agency scale lên (nhiều brand hơn, nhiều talent hơn, nhiều tháng dữ liệu hơn) mà workflow user mô tả chưa đề cập, nhưng kinh nghiệm vận hành cho thấy sẽ cần sớm muộn:

| # | Vấn đề | Vì sao quan trọng | Gắn vào giai đoạn nào |
|---|---|---|---|
| A | **Rate card không có lịch sử** — `Talent.ratePerSession/commissionRate` và `brand_platform_rates.ratePerHour` là giá trị đơn, sửa là mất giá trị cũ | Đóng sổ tháng 7 xong, tháng 8 đổi rate — nếu tính lại tháng 7 sẽ ra số sai. Đây là lỗi tài chính nghiêm trọng, phải chặn trước khi công ty dựa vào hệ thống để trả lương thật | **Giai đoạn 19** |
| B | **Không khoá số liệu sau khi đóng sổ** — GMV/report có thể bị TikTok cập nhật lại sau vài ngày, nếu không snapshot thì báo cáo đã gửi brand có thể "tự đổi số" sau này | Mất uy tín với brand khi số liệu đã duyệt lại thay đổi | Gắn vào **Giai đoạn 17/20** (đóng sổ = khoá snapshot) |
| C | **Brand Client Portal chưa dùng** — role `brand` đã tồn tại sẵn trong hệ thống (`UserRoleSettings.tsx`, mô tả "Cổng báo cáo dành cho Khách hàng") nhưng chưa gắn tính năng gì thật — trong khi workflow cần "gửi brand duyệt lịch" | Thay vì export file → gửi email → chờ phản hồi (chậm, dễ thất lạc), có thể cho brand tự login duyệt ngay trong app, mọi thứ có audit log | **Giai đoạn 16** |
| D | **Không có cảnh báo tập trung** — thiếu Host/Trợ live, GMV lệch >15%, campaign chờ duyệt quá lâu, KPI brand có nguy cơ không đạt — hiện mỗi thứ nằm rải rác 1 dashboard riêng | Vận hành thật cần 1 nơi tổng hợp, không phải nhớ vào từng tab kiểm tra | **Giai đoạn 22** |
| E | **Không có báo cáo hiệu suất Studio (utilization)** — studio là tài nguyên khan hiếm nhất (giống host), nhưng chưa có dashboard "studio nào đang idle nhiều, studio nào quá tải" | Cơ sở quyết định đầu tư thêm studio hay không — quyết định vốn lớn cần dữ liệu | **Giai đoạn 23** |
| F | **Không track độ tin cậy của Talent** (no-show, huỷ sát giờ) — AI matching hiện chỉ chấm theo CVR/GMV/followers, không có "độ đáng tin" | Talent giỏi số nhưng hay bùng ca vẫn được xếp lịch tiếp — rủi ro vận hành thật | **Giai đoạn 24** (thấp ưu tiên, làm sau khi có dữ liệu vài tháng) |
| G | **Xuất báo cáo PDF thương hiệu hoá cho brand** — dashboard đẹp trong app là 1 chuyện, nhưng brand thường cần file gửi được qua email/trình bày họp | Khách hàng B2B vẫn quen nhận file, không phải lúc nào cũng vào app xem | Gắn vào **Giai đoạn 18** |

---

## Bảng tổng quan các giai đoạn đề xuất

| Giai đoạn | Tên | Phụ thuộc | Trạng thái |
|---|---|---|---|
| 15 | Billing Model (GMV% / giờ live) + Campaign entity *(+ ưu tiên hoá studio, + đào tạo Host theo campaign)* | Không | [x] Code xong (2026-08-01) — chờ user áp dụng migration `0016` + verify qua browser thật |
| 15b | Quick win: tách cảnh báo thiếu Host / thiếu Co-host | Không | [x] HOÀN THÀNH (2026-08-01) |
| 15c | Danh sách dự phòng/on-call — thay người khẩn cấp sát giờ live | 5 (đã có sẵn từ Giai đoạn 14a) | [x] HOÀN THÀNH (2026-08-01) |
| 16 | Luồng duyệt Campaign với Brand (Brand Client Portal) | 15 | [ ] Chưa bắt đầu |
| 17 | Nạp report TikTok thật (17 chỉ số + GMV theo 4 nguồn) | Không (độc lập, nhưng nên làm sớm vì 18/21 phụ thuộc) | [ ] Chưa bắt đầu |
| 18 | Dashboard/Report nâng cấp + export PDF thương hiệu hoá *(+ checkpoint giữa chu kỳ campaign — chờ CEO duyệt)* | 17 | [ ] Chưa bắt đầu |
| 19 | Rate Card Versioning (Talent + Brand) | Không (nhưng nên làm trước 20) | [ ] Chưa bắt đầu |
| 20 | Đóng Sổ Tháng (Payroll + Revenue reconciliation) *(+ xuất hoá đơn & công nợ Brand — chờ CEO duyệt)* | 15, 19, (14a đã có workload) | [ ] Chưa bắt đầu |
| 21 | AI Agent theo từng Brand (context + market research riêng) | 17 (cần dữ liệu thật để phân tích) | [ ] Chưa bắt đầu |
| 22 | Notification/Alert Hub tổng hợp | 15b, 17 | [ ] Chưa bắt đầu |
| 23 | Studio Utilization & Capacity Planning | Không | [ ] Chưa bắt đầu |
| 24 | Đánh giá & Độ tin cậy Talent (no-show/huỷ sát giờ *(+ đánh giá hiệu suất sau campaign — chờ CEO duyệt)*) | Không (nên có vài tháng dữ liệu thật trước) | [ ] Chưa bắt đầu |
| 25 | Đánh giá cuối Campaign & Quyết định gia hạn Brand *(mới — chờ CEO duyệt)* | 15 | [ ] Chưa bắt đầu |

---

## Giai đoạn 15 — Billing Model (GMV% / giờ live) + Campaign entity

**Bối cảnh:** `Brand` ([src/types.ts:52](src/types.ts:52)) không có field mô hình thu phí. `SessionFinance.agencyCommissionRate` ([src/types.ts:216](src/types.ts:216)) đang giả định **mọi brand đều thu theo % GMV** — sai với brand thu theo giờ live. Không có entity Campaign — `Brand.activeCampaigns` chỉ là số đếm tĩnh, không phải bảng thật, nên không lưu được KPI GMV đã chốt, loại campaign, ngân sách phân bổ.

**Phạm vi:**
- Migration: `brands` thêm cột `billing_model` (`'gmv_commission' | 'hourly'`, default `'gmv_commission'` để không phá dữ liệu cũ).
- Bảng `campaigns` mới: `id, brand_id, name, type (daily|mega|mid_month|payday|other), target_gmv, start_date, end_date, status (draft|active|completed|cancelled), created_by`. RLS: đọc mọi authenticated, ghi `ceo/operations/admin` (giống pattern `brand_platform_rates`).
- `shift_slots` và `recurring_shift_templates` thêm cột `campaign_id` (nullable, FK set null) — không bắt buộc, vì vẫn cần hỗ trợ slot không thuộc campaign nào (vd slot lẻ phát sinh ngoài kế hoạch).
- Sửa công thức tính doanh thu agency trong `FinanceHr.tsx`/`src/lib/db/finance.ts`: nếu `billing_model === 'hourly'`, doanh thu agency = (giờ live thật của session) × `brand_platform_rates.rate_per_hour`, không phải `actualGmv × agencyCommissionRate`. Giữ nguyên nhánh `gmv_commission` như hiện tại.
- UI: `CrmProjects.tsx` (nơi quản lý Brand) thêm chọn `billing_model` khi tạo/sửa Brand. Component mới hoặc mở rộng `ShiftScheduling.tsx` để tạo/xem Campaign, gán slot vào campaign.

**Test/Verify:**
- [x] `npx tsc --noEmit` + `npm run build` pass.
- [x] Tạo 1 brand `billing_model=hourly`, 1 brand `billing_model=gmv_commission`, tạo session cho mỗi brand, xác nhận `FinanceHr.tsx` tính đúng 2 công thức khác nhau — khớp chính xác phép tính tay (10tr theo giờ, 6.5tr net theo %GMV).
- [x] Tạo Campaign, gán vài slot vào campaign, xác nhận filter/hiển thị đúng theo campaign ở `ShiftScheduling.tsx` — filter đúng từ 12 ca xuống 1 ca.
- [x] Reload xác nhận persist thật (không phải state cục bộ).
- [x] Tạo 2 ca cùng studio/khung giờ nhưng khác brand → xác nhận cảnh báo "ưu tiên hoá" hiện đúng (mục #5) — cả lúc tạo lẫn trong danh sách ca.

**Trạng thái:** ✅ HOÀN THÀNH (2026-08-01) — đã verify đầy đủ qua Supabase thật + browser thật với tài khoản `tuananh1902.skt@gmail.com` (role `admin`). Xem chi tiết ở `PROJECT_STATUS.md` mục Giai đoạn 15. Dữ liệu test đã dọn sạch, không còn sót lại.

---

## Giai đoạn 15b — Quick win: tách cảnh báo thiếu Host / thiếu Co-host

**Bối cảnh:** Dashboard "N ca chưa có ai đăng ký" ở `ShiftScheduling.tsx` (Giai đoạn 14a) hiện đếm chung, không phân biệt thiếu Host, thiếu Co-host (trợ live), hay thiếu cả hai — user mô tả rõ đây là 3 tình huống cảnh báo khác nhau trong workflow thật.

**Phạm vi:** sửa thuần logic hiển thị trong `ShiftScheduling.tsx`, không cần migration — dựa vào `shift_slots`/`session_availability` đã có, phân loại theo số lượng đăng ký đã chốt Host vs Co-host.

**Test/Verify:**
- [x] `npx tsc --noEmit` pass.
- [x] Tạo slot có 0 đăng ký, slot có Host nhưng chưa Co-host, slot đủ cả hai — xác nhận 3 badge cảnh báo khác nhau hiển thị đúng.

**Trạng thái:** ✅ HOÀN THÀNH (2026-08-01) — đã verify qua Supabase thật + browser thật với tài khoản `tuananh1902.skt@gmail.com` (dùng `SUPABASE_SERVICE_ROLE_KEY` qua curl để mô phỏng đăng ký, vì không có mật khẩu tài khoản `talent` thật). Xem chi tiết ở `PROJECT_STATUS.md` mục Giai đoạn 15b. Dữ liệu test đã dọn sạch.

---

## Giai đoạn 15c — Thay người khẩn cấp (danh sách dự phòng/on-call)

> ✅ **CEO đã duyệt** (mục #2 trong bảng "Workflow doanh nghiệp 11 bước" ở đầu file, 2026-08-01) — phạm vi dự kiến bên dưới có thể code.

**Bối cảnh:** Ca đã chốt Host/Co-host qua `session_availability`/`shift_slots` (Giai đoạn 14a), nhưng nếu người đã chốt báo bận sát giờ live, hiện chưa có quy trình tìm người thay — Ops phải tự nhớ ai đang rảnh, nhắn tay từng người.

**Phạm vi (dự kiến, sẽ chốt lại sau khi CEO duyệt phạm vi):**
- Không cần bảng mới — tận dụng `session_availability` (ai đã đăng ký rảnh khung giờ đó nhưng không được chọn) làm danh sách ứng viên thay thế đầu tiên.
- `ShiftScheduling.tsx` (hoặc `LiveSessionHub.tsx`): thêm hành động "Báo bận / Tìm người thay" trên 1 ca đã chốt — đổi `host_id`/`co_host_id` của session, giữ nguyên `shift_slot` gốc, ghi log lý do đổi (tận dụng `audit_logs` có sẵn, không cần bảng mới).
- Cảnh báo (nối vào Giai đoạn 22 - Notification Hub khi giai đoạn đó làm) nếu tới sát giờ live (vd <4h) mà ca vẫn ở trạng thái "đang tìm người thay".

**Test/Verify:**
- [x] `npx tsc --noEmit` + build pass.
- [x] Chốt 1 ca test với Host + Co-host, bấm "Báo bận / Tìm người thay" cho Host → chọn 1 ứng viên khác đã đăng ký rảnh ca đó (không phải Host/Co-host hiện tại) → xác nhận thay người thành công, `live_sessions.host_name` đổi đúng qua Supabase thật (không phải state cục bộ), Co-host giữ nguyên không bị đổi nhầm, có ghi 1 dòng `audit_logs` mô tả rõ đổi từ ai sang ai + lý do.
- [x] Reload xác nhận persist.

**Trạng thái:** ✅ HOÀN THÀNH (2026-08-01) — đã verify qua Supabase thật + browser thật với tài khoản `tuananh1902.skt@gmail.com` (dùng `SUPABASE_SERVICE_ROLE_KEY` qua curl để mô phỏng đăng ký, vì không có mật khẩu tài khoản `talent` thật). Xem chi tiết ở `PROJECT_STATUS.md` mục Giai đoạn 15c. Dữ liệu test đã dọn sạch (bao gồm cả dòng `audit_logs` vừa tạo). Cảnh báo <4h trước giờ live khi ca vẫn "đang tìm người thay" (nhắc ở phạm vi dự kiến ban đầu) chưa làm — nối vào Giai đoạn 22 (Notification Hub) khi giai đoạn đó triển khai, đúng như phạm vi đã ghi ở trên.

---

## Giai đoạn 16 — Luồng duyệt Campaign với Brand (tận dụng Brand Client Portal có sẵn)

**Bối cảnh:** Chưa có bước "gửi brand duyệt lịch". Phát hiện quan trọng: role `brand` **đã tồn tại sẵn** trong hệ thống ([src/components/UserRoleSettings.tsx:483](src/components/UserRoleSettings.tsx:483), mô tả sẵn "Cổng báo cáo dành cho Khách hàng") nhưng chưa gắn tính năng duyệt lịch nào — nên ưu tiên xây **cổng duyệt trong app** thay vì chỉ xuất file gửi email (giảm vòng lặp thủ công, có audit log tự động qua `audit_logs` đã có).

**Phạm vi:**
- `campaigns` (từ Giai đoạn 15) thêm `approval_status` (`draft → sent_for_approval → revision_requested → approved`), `sent_at`, `approved_at`.
- Bảng `campaign_revision_notes` (campaign_id, note, requested_by, created_at) — brand ghi yêu cầu sửa trực tiếp, ops đọc và điều chỉnh slot.
- UI Brand Portal: brand login thấy đúng campaign của brand mình (`profiles.assigned_brand_id` đã có sẵn từ Giai đoạn 12), xem bảng phân bổ lịch (đọc từ `shift_slots` filter theo campaign), nút "Duyệt" / "Yêu cầu sửa" (kèm ghi chú).
- Vẫn giữ nút "Xuất Excel/PDF" cho trường hợp brand muốn file offline (không bắt buộc phải qua portal).

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Login bằng tài khoản `brand` thật, xác nhận chỉ thấy đúng campaign của brand mình (RLS + filter đúng), không thấy brand khác.
- [ ] Bấm "Yêu cầu sửa" kèm ghi chú → ops thấy ghi chú → sửa slot → gửi lại → brand duyệt → trạng thái chuyển `approved`, có timestamp.
- [ ] Reload xác nhận persist.

---

## Giai đoạn 17 — Nạp report TikTok thật (17 chỉ số + GMV theo 4 nguồn)

**Bối cảnh:** `LiveSession` ([src/types.ts:150](src/types.ts:150)) chỉ có 6 chỉ số thô (`actualGmv, totalOrders, avgWatchTimeSeconds, peakViewers, totalViews, ctrAvg, cvrAvg`), thiếu 11+ chỉ số user liệt kê (Item sold, UPT, Avg price, GPM, GMV/hour, View/hour, GMV/Product view, Product view, Product click, CTOR, Live impressions, Enter room live), và **không có GMV breakdown theo nguồn** (Total live / Aff / Product card / Video) — thứ bắt buộc để trả lời "vì sao GMV tăng/giảm". Đây là giai đoạn quan trọng nhất vì Giai đoạn 18/21 phụ thuộc dữ liệu này.

**Phạm vi:**
- Bảng mới `session_report_metrics` (sidecar 1-1 theo `session_id`, giống pattern `session_finance`): đủ field cho 17 chỉ số + `gmv_live, gmv_aff, gmv_product_card, gmv_video` (4 nguồn) + `source_account` (`seller | live`, vì 2 tài khoản TikTok có thể lệch số — cho phép lưu cả 2 bộ số nếu cần, hoặc chỉ 1 bộ chính thức + ghi chú lệch).
- Tính năng **import file** (dùng skill `xlsx` sẵn có trong hệ thống Claude Code để dựng parser Excel/CSV): upload file export từ TikTok Shop → preview mapping cột → xác nhận → ghi vào `session_report_metrics`, khớp theo session (chọn tay hoặc match theo ngày+brand).
  ⚠️ **Cần user cung cấp 1 file export mẫu thật** (giống cách Giai đoạn 14 dùng file Excel host thật để thiết kế đúng) trước khi code phần map cột — tránh đoán sai cấu trúc cột của TikTok.
- Các chỉ số suy ra được từ chỉ số khác (vd `GMV/hour = actualGmv / duration`) tính ở tầng ứng dụng, không lưu trùng trong DB (tránh lệch dữ liệu khi 1 trong 2 số đổi).

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Import 1 file mẫu thật → xác nhận đúng số dòng, đúng cột map vào đúng field.
- [ ] Tính tay 2-3 chỉ số suy ra (GMV/hour, CTOR) từ dữ liệu import, đối chiếu khớp UI.
- [ ] Reload xác nhận persist qua Supabase thật.

---

## Giai đoạn 18 — Dashboard/Report nâng cấp + export PDF thương hiệu hoá

**Phụ thuộc:** Giai đoạn 17 (cần bảng `session_report_metrics` có dữ liệu).

**Phạm vi:**
- Mở rộng `KpiComparison.tsx`/`Dashboards.tsx` (không xây mới — đã có cơ chế so sánh kỳ-này-vs-kỳ-trước thật từ Giai đoạn 8) để hiển thị đủ 17 chỉ số + 4 nguồn GMV, nhiều dạng biểu đồ (line/bar/area) so sánh ngày/tháng/quý.
- Rule cảnh báo: biến động >15% ở bất kỳ nguồn GMV nào → badge "Cần giải thích" (đỏ); 10-15% → badge "Bình thường" (vàng); <10% → không cảnh báo.
- Export PDF/hình ảnh thương hiệu hoá theo từng brand (logo, màu brand nếu có) — dùng cho brand không muốn vào app xem trực tiếp.

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Tạo dữ liệu test có biến động >15% ở 1 nguồn GMV → xác nhận badge cảnh báo đúng màu.
- [ ] Export PDF thử 1 brand → mở file xác nhận số liệu khớp dashboard.

---

## Giai đoạn 19 — Rate Card Versioning (Talent + Brand)

**Bối cảnh:** `Talent.ratePerSession/commissionRate` ([src/types.ts:79-80](src/types.ts:79)) và `brand_platform_rates.rate_per_hour` là giá trị đơn, sửa là ghi đè — không có lịch sử theo thời gian. Đây là **rủi ro tài chính**: nếu đổi rate tháng 9, mọi tính toán lương/doanh thu tháng 7-8 (nếu tính lại) sẽ dùng nhầm rate mới.

**Phạm vi:**
- Bảng `talent_rate_history` (talent_id, rate_per_session, commission_rate, effective_from, effective_to nullable) — thay vì sửa trực tiếp `talents.rate_per_session`, tạo dòng mới với `effective_from = hôm nay`, đóng dòng cũ bằng `effective_to`.
- Tương tự `brand_platform_rate_history` (hoặc mở rộng `brand_platform_rates` thêm `effective_from/effective_to`).
- Mọi chỗ tính P&L/lương (Finance module, Đóng sổ tháng) phải tra rate **theo đúng ngày của session**, không tra giá trị hiện tại — đây là thay đổi quan trọng nhất, cần rà lại toàn bộ chỗ đang đọc `talent.ratePerSession` trực tiếp.

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Đổi rate 1 talent → tạo session mới (dùng rate mới) và xác nhận session cũ (tháng trước) khi tính lại P&L vẫn dùng đúng rate cũ tại thời điểm đó.

---

## Giai đoạn 20 — Đóng Sổ Tháng (Payroll + Revenue reconciliation)

**Phụ thuộc:** Giai đoạn 15 (billing model), Giai đoạn 19 (rate history) — nên làm sau 2 giai đoạn này để số liệu đúng ngay từ đầu, tránh phải sửa lại.

**Phạm vi:**
- Báo cáo "Đóng Sổ Tháng {X}" — nối dữ liệu đã có sẵn (không tạo lại): workload từ dashboard "Tải Theo Host" (Giai đoạn 14a) × rate card đúng thời điểm (Giai đoạn 19) → tổng lương từng talent trong tháng, export được cho kế toán đối soát.
- Doanh thu agency theo brand trong tháng, tính đúng theo `billing_model` (Giai đoạn 15) → tổng doanh thu công ty.
- P&L sơ bộ công ty = doanh thu - lương talent - chi phí studio/ads (đã có ở `session_finance` từ Giai đoạn 7).
- **Khoá sổ (snapshot):** sau khi "Đóng Sổ" 1 tháng, số liệu tháng đó nên được đánh dấu `locked` (không cho sửa `session_report_metrics`/`session_finance` của session thuộc tháng đã khoá trừ khi mở khoá tay bởi CEO/Admin) — tránh số liệu "tự đổi" sau khi đã báo cáo brand/kế toán.

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Đối chiếu tay 1 tháng test: tổng lương = Σ(giờ × rate đúng thời điểm), tổng doanh thu = Σ(theo billing model từng brand) — khớp UI.
- [ ] Khoá sổ xong, thử sửa session_finance của session thuộc tháng đã khoá → bị chặn đúng như kỳ vọng.

---

## Giai đoạn 21 — AI Agent theo từng Brand (context + market research riêng)

**Phụ thuộc:** Giai đoạn 17 (cần dữ liệu report thật để agent phân tích có ý nghĩa).

**Bối cảnh:** AI Training Center (Giai đoạn 13) đã có 9 agent dùng `system_prompt` chung theo loại agent, chưa phân biệt theo brand. User muốn mỗi brand có ngữ cảnh riêng (thông tin brand, research thị trường/đối thủ) khi AI phân tích.

**Phạm vi:**
- Bảng `brand_ai_context` (brand_id, market_research text, competitor_notes text, custom_instructions text, updated_by, updated_at) — không cần agent riêng biệt về hạ tầng, chỉ tham số hoá theo brand.
- Route phân tích GMV/session theo brand (mở rộng `analyze-session` hoặc route mới `analyze-brand-period`) ghép `brand_ai_context` + dữ liệu `session_report_metrics` (Giai đoạn 17, đã breakdown 4 nguồn GMV) vào prompt trước khi gọi Gemini — trả về narrative "tháng qua tốt ở đâu/xấu ở đâu/vì sao/đề xuất".
- UI: CEO/Admin nhập/sửa `brand_ai_context` per brand (form đơn giản, giống pattern `AiTrainingCenter.tsx`).

**Test/Verify:**
- [ ] `npx tsc --noEmit` + build pass.
- [ ] Nhập context khác nhau cho 2 brand, chạy phân tích cùng 1 tập dữ liệu số → xác nhận narrative trả về khác nhau, có tham chiếu đúng context đã nhập (giống cách Giai đoạn 13 verify prompt admin có hiệu lực).

---

## Giai đoạn 22 — Notification/Alert Hub tổng hợp

**Phụ thuộc:** Giai đoạn 15b (cảnh báo thiếu người), Giai đoạn 17/18 (cảnh báo GMV lệch).

**Phạm vi:** gom các cảnh báo đang rải rác (slot thiếu Host/Co-host, GMV lệch >15%, campaign chờ duyệt quá N ngày) vào 1 nơi + kênh gửi thật (Telegram, đã tạm hoãn từ Giai đoạn 10 vì chưa có Bot Token — làm cùng lúc khi có token, theo đúng pattern hạ tầng-trước/credentials-sau đã dùng ở Giai đoạn 9).

**Test/Verify:**
- [ ] Test từng loại cảnh báo trigger đúng điều kiện, gửi đúng kênh.

---

## Giai đoạn 23 — Studio Utilization & Capacity Planning

**Phạm vi:** dashboard tỷ lệ lấp đầy từng studio theo tuần/tháng (số giờ đã dùng / tổng giờ khả dụng), giúp quyết định đầu tư thêm studio hay không. Dữ liệu đã có sẵn ở `live_sessions`/`shift_slots`, chỉ cần tầng tổng hợp mới.

---

## Giai đoạn 24 — Đánh giá & Độ tin cậy Talent (đổi tên từ "Talent Reliability Tracking")

**Phạm vi gốc:** track no-show/huỷ sát giờ (cần định nghĩa "huỷ sát giờ" là gì — vd huỷ trong vòng <24h trước giờ live), tính "độ tin cậy" bổ sung cho `TalentMatcher.tsx` bên cạnh điểm AI hiện tại (CVR/GMV/followers). Nên làm sau khi có vài tháng dữ liệu thật để điểm có ý nghĩa thống kê.

**Phạm vi bổ sung** *(mục #7 trong bảng "Workflow doanh nghiệp 11 bước" — ⏳ chờ CEO xác nhận):* đánh giá hiệu suất Host/Trợ live sau mỗi campaign (không chỉ đo độ tin cậy no-show, mà cả chất lượng: chốt đơn, tương tác, tuân thủ Do & Don't), feed điểm này ngược vào việc chọn người cho campaign sau — gắn với `TalentMatcher.tsx` cùng chỗ với điểm AI hiện tại. Cần định nghĩa cụ thể "đánh giá hiệu suất" lấy input từ đâu (CEO/Ops chấm tay theo thang điểm, hay suy ra tự động từ `session_report_metrics` của Giai đoạn 17) — chốt cùng CEO trước khi thiết kế bảng.

---

## Giai đoạn 25 — Đánh giá cuối Campaign & Quyết định gia hạn Brand

> ✅ **CEO đã duyệt** (mục #4 trong bảng "Workflow doanh nghiệp 11 bước" ở đầu file, 2026-08-01) — phạm vi dự kiến bên dưới có thể code. Đây là Bước 11 (cuối) trong sơ đồ workflow 11 bước.

**Bối cảnh:** Vòng lặp hiện tại (Giai đoạn 15 → ... → 20 → quay lại 15 cho tháng sau) mặc định hợp tác với Brand luôn tiếp tục. Thực tế cần 1 điểm quyết định rõ ràng cuối mỗi campaign/tháng: KPI có đạt không, có tiếp tục hợp tác/tái ký không, Brand có dấu hiệu rủi ro rời đi không (vd GMV lệch target nhiều tháng liên tiếp, phản hồi duyệt lịch ở Giai đoạn 16 ngày càng khó khăn).

**Phạm vi (dự kiến, sẽ chốt lại sau khi CEO duyệt):**
- `campaigns` (Giai đoạn 15) thêm bước đóng: `outcome` (`kpi_met | kpi_missed | partial`), `renewal_decision` (`renew | at_risk | churned`), `review_notes`.
- UI: sau khi 1 campaign hoàn tất (đã qua Giai đoạn 10 - đóng sổ), hiện màn hình đánh giá — so KPI mục tiêu (Giai đoạn 1) vs GMV thật đạt được, CEO/Ops điền quyết định gia hạn.
- Cân nhắc liên kết với Giai đoạn 21 (AI theo Brand): AI có thể gợi ý `renewal_decision` dựa trên xu hướng nhiều tháng, nhưng quyết định cuối vẫn do người — không tự động hoá bước này.

**Test/Verify:** (bổ sung khi bắt đầu code, sau khi CEO chốt phạm vi chính xác)

---

## Ghi chú kỹ thuật áp dụng chung cho mọi giai đoạn trên

- Theo đúng quy ước đã chốt ở `PROJECT_STATUS.md` (mục "Quy ước kỹ thuật cần theo khi làm tiếp") — 4-hàm CRUD + mapper cho entity mới, RLS đọc-mọi-người/ghi-ceo-ops-admin trừ khi có lý do khác (nêu rõ nếu khác).
- Mọi migration mới: nhắc rõ user tự áp dụng lên Supabase thật (SQL Editor), vì môi trường hiện tại chưa `supabase link`.
- Sidecar 1-1 theo session (`session_finance`, `session_report_metrics`) dùng `upsert`, không phải 4-hàm CRUD chuẩn — đúng pattern đã có.
- Trước khi implement 1 pivot thiết kế dựa trên suy luận trừu tượng, đối chiếu lại dữ liệu/file nguồn thật nếu có (bài học từ Giai đoạn 14b).
