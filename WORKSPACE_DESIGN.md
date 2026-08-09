# LiveOps AI — Thiết kế Workspace Model (Agency ↔ Brand)

> **Trạng thái: GIAI ĐOẠN A + B1-B6 + C1-C4 ĐÃ CODE + VERIFY XONG.** Roadmap "6 module mới" gốc ở mục 6 đã hoàn thành. Giai đoạn C (4 module mới, mục 6.1) đã xong toàn bộ: **C1 — Onboarding Checklist theo Brand**, **C2 — GMV Target vs Actual theo Calendar**, **C3 — Scheme khuyến mãi tích hợp Calendar**, **C4 — Price List Import**. Toàn bộ roadmap workspace model (mục 6 + 6.1) đã hoàn thành — phiên sau cần user chỉ hướng đi tiếp theo (module mới ngoài roadmap này, hoặc rà soát/refactor phần đã có).
> Không phụ thuộc `PROJECT_STATUS.md`/`BUSINESS_ROADMAP.md` (đã bị xóa có chủ đích, không khôi phục).
> Đọc `CLAUDE.md` để biết quy ước cập nhật tài liệu — file này thay thế vai trò "trạng thái sống" của module workspace cho tới khi implement xong; sau khi code+verify xong, sáp nhập nội dung "Đã hoàn thành" vào bất kỳ file trạng thái nào user dùng lại sau này.

## Đã hoàn thành — Giai đoạn A (khung workspace)

- **Header switcher + state `workspace`** — [src/components/Header.tsx](src/components/Header.tsx) export `WorkspaceContext` type + `WorkspaceSwitcher` dropdown (chỉ nhận props khi role ceo/admin/operations, ẩn tự động cho role khác). [src/App.tsx](src/App.tsx) giữ state `workspace` (localStorage `liveops_os_v2_workspace`) + tính `effectiveWorkspace`: role `brand` ép cứng vào `assignedBrandId` (không dùng switcher), role `talent`/`moderator` luôn ở Agency (chưa có nhu cầu nghiệp vụ nhìn theo brand), ceo/admin/operations dùng state từ switcher. Đổi workspace qua `handleWorkspaceChange` reset `activeTab` về tab đầu của nhóm mới.
- **`AGENCY_NAV_GROUPS` / `BRAND_NAV_GROUPS`** — tách trong `App.tsx`, đổi label nhóm Agency sang tiếng Việt (Tổng Quan/Vận Hành Live/Tài Nguyên Chung/Kinh Doanh/Tài Chính/Hệ Thống), không đổi component nào. `BRAND_NAV_GROUPS` — 7 tab mới + `account_settings` (thêm ngoài spec gốc để role brand vẫn đổi được mật khẩu/tên), **không gate theo `PermissionKey`** (role `brand` mặc định `manage_calendar`/`view_financials` = false trong `role_permissions` — gate sẽ khoá nhầm chính brand khỏi dữ liệu của họ; cô lập quyền dựa vào việc chỉ ceo/admin/operations/brand mới vào được brand workspace, không dựa vào Ma Trận Phân Quyền).
- **7 component `src/components/brand-workspace/`** — `BrandDashboard`, `BrandCalendar`, `BrandCampaigns` (màn trung tâm, gộp luồng duyệt lịch từ `MyWorkspace.tsx` CampaignApprovalCard + đánh giá cuối kỳ từ `ShiftScheduling.tsx`), `BrandSessions` (dùng lại `computeSessionPnl` từ `lib/pnl.ts`), `BrandRateCard`, `BrandInvoices`, `BrandReviewHistory`. Mỗi component nhận `brandId` + data đã fetch sẵn ở `App.tsx`, tự filter bằng `useMemo`, không fetch riêng.
- **Verify** — đăng nhập thật qua Supabase (role admin), chuyển Agency ↔ JOCKEY ↔ VERA qua switcher, click qua đủ 7 tab brand + account settings, không có lỗi console. Campaign rỗng ở JOCKEY/VERA là đúng dữ liệu thật (Campaign Timeline agency-level cũng rỗng cùng khung tháng — không phải bug filter).

## Đã hoàn thành — Giai đoạn B1 (SKU Showcase & Hero Product Catalog)

- **Bảng `brand_skus`** — [supabase/migrations/0024_brand_skus.sql](supabase/migrations/0024_brand_skus.sql). Cột: `brand_id` (FK cascade), `name`, `sku_code`, `flash_price`/`original_price`, `is_hero`, `pin_order` (thứ tự ghim), `clearance_rate` (0-100, tỷ lệ xả kho), `status` (`active`/`inactive`). RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin` — cùng pattern `brand_platform_rates` (migration 0014), role `brand` không tự ghi trực tiếp DB, cô lập qua workspace access như đã chốt ở mục 2.
- **`src/lib/db/brandSkus.ts`** — `fetchBrandSkus`/`createBrandSku`/`updateBrandSku`/`deleteBrandSku`, cùng pattern `fromDb`/snake↔camel như `brandInvoices.ts`.
- **`src/components/brand-workspace/BrandSkuShowcase.tsx`** — tab mới `brand_skus` trong `BRAND_NAV_GROUPS` (App.tsx), bảng inline-edit (giống `BrandInvoices.tsx`): giá flash-deal/gốc, % xả kho, toggle Hero (star), trạng thái, xoá. `canEdit` gate theo `currentRole` (ceo/admin/operations), role `brand` chỉ xem.
- **Verify** — chạy migration thật trên Supabase, tạo/sửa/xoá 1 SKU qua UI (Franklin brand workspace), reload xác nhận Hero toggle + % xả kho persist đúng, xoá xong quay về empty state, không lỗi console.

## Đã hoàn thành — Giai đoạn B2 (Product Sample Inventory)

- **Bảng `product_samples`** — [supabase/migrations/0025_product_samples.sql](supabase/migrations/0025_product_samples.sql). Cột: `brand_id` (FK cascade), `studio_id` (FK, **nullable** — hàng mẫu có thể "in_transit" chưa gán Studio nào), `product_name`, `sample_code`, `quantity`, `status` (`in_transit`/`at_studio`/`returned`/`damaged`/`lost`), `location_note` (vị trí cụ thể trong Studio, vd "Kệ A3"). RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin` — cùng pattern `brand_skus`/`brand_platform_rates`.
- **`src/lib/db/productSamples.ts`** — `fetchProductSamples`/`createProductSample`/`updateProductSample`/`deleteProductSample`, cùng pattern `fromDb`/snake↔camel như `brandSkus.ts`.
- **`src/components/ProductSampleInventory.tsx`** — **Agency Workspace** (không thuộc Brand Workspace), nhóm nav mới `Content & Quality` trong `AGENCY_NAV_GROUPS` (App.tsx), tab `product_samples`. Agency-wide: Ops cần nhìn xuyên mọi Brand/Studio để biết hàng mẫu đang nằm đâu — filter theo Studio ở đầu trang, bảng hiện cột Brand + Studio (đổi được inline) + SL/Vị trí/Trạng thái, tạo mới qua form chọn Brand+Studio. `canEdit` gate theo `currentRole` (ceo/admin/operations), dùng lại `PermissionKey` **`manage_studios_gear`** (không tạo permission key mới, đúng đề xuất ở mục 5 — module liên kết chặt tới Studio).
- **Verify** — chạy migration thật trên Supabase, tạo 1 hàng mẫu test (JOCKEY, Studio 1 - Fashion, SL 3), sửa vị trí ("Kệ B2") + trạng thái ("Có mặt tại Studio") inline, reload xác nhận persist đúng, xoá xong quay về empty state, không lỗi console.

## Đã hoàn thành — Giai đoạn B3 (Live Stream Incident Log)

- **Bảng `live_stream_incidents`** — [supabase/migrations/0026_live_stream_incidents.sql](supabase/migrations/0026_live_stream_incidents.sql). Cột: `session_id` (FK `live_sessions`, cascade), `category` (`network_drop`/`cart_locked`/`host_late`/`voucher_exhausted`/`other`), `severity` (`low`/`medium`/`high`/`critical`), `description`, `resolution`, `status` (`open`/`resolved`). RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin`. **Lệch nhẹ so với gợi ý "append-only như audit_logs" ở mục 6** — incident cần sửa `resolution`/`status` sau khi Ops xử lý xong, nên dùng full CRUD như `product_samples`/`brand_skus` thay vì append-only thuần (xem comment trong migration).
- **`src/lib/db/liveStreamIncidents.ts`** — `fetchLiveStreamIncidents`/`createLiveStreamIncident`/`updateLiveStreamIncident`/`deleteLiveStreamIncident`, cùng pattern `fromDb` như các module trước.
- **`src/components/LiveStreamIncidentLog.tsx`** — **Agency Workspace**, thêm vào nhóm nav `Content & Quality` (cùng nhóm với Product Sample Inventory) trong `AGENCY_NAV_GROUPS`, tab `live_incidents`. Filter theo trạng thái ở đầu trang, đếm nhanh "N sự cố đang mở", tạo mới qua form chọn Live Session + loại sự cố + mức độ + mô tả, bảng cho sửa inline category/severity/resolution/status. `canEdit` gate theo `currentRole` (ceo/admin/operations), dùng lại `PermissionKey` **`manage_sessions`** (liên kết chặt tới Live Session, không tạo permission key mới).
- **Verify** — chạy migration thật trên Supabase, tạo 1 sự cố test (CROCS session, Khoá giỏ hàng, mức Cao), sửa ghi chú xử lý + đổi trạng thái sang "Đã xử lý" inline, reload xác nhận persist đúng + counter "sự cố đang mở" cập nhật đúng, xoá xong quay về empty state, không lỗi console.

## Đã hoàn thành — Giai đoạn B4 (Script & Teleprompter Library)

- **Phạm vi đã chốt với user trước khi code** (roadmap gốc flag đây là điểm mơ hồ cần làm rõ): (1) làm cả thư viện lưu trữ CRUD **và** chế độ đọc teleprompter fullscreen trong cùng 1 phiên; (2) nội dung kịch bản lưu dạng **text/markdown đơn giản** + metadata (hook, thứ tự ghim SKU), **không** parse lại cấu trúc JSON nhiều Part như `ScriptGenerator.tsx`.
- **Ranh giới với `ScriptGenerator.tsx` (AI Script Gen)** — `ScriptGenerator` là công cụ SINH kịch bản mới bằng Gemini AI, không lưu trữ (kết quả chỉ tồn tại trong state, mất khi rời trang). `ScriptLibrary` là nơi LƯU LẠI kịch bản đã có để tái sử dụng + đọc qua teleprompter. Không có luồng tự động nối 2 module (chưa có nút "Lưu vào Library" ngay trong ScriptGenerator) — nếu cần, đó là việc của phiên sau.
- **Bảng `script_library`** — [supabase/migrations/0027_script_library.sql](supabase/migrations/0027_script_library.sql). Cột: `brand_id` (FK, **nullable** — kịch bản có thể dùng chung mọi Brand), `title`, `hook`, `content` (text/markdown), `platform` (`TikTok`/`Shopee`, cùng giá trị với `LiveSession.platform`), `pinned_sku_order` (text tự do), `tags`. RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin`.
- **`src/lib/db/scriptLibrary.ts`** — `fetchScriptLibrary`/`createLibraryScript`/`updateLibraryScript`/`deleteLibraryScript`, cùng pattern `fromDb` như các module trước.
- **`src/components/ScriptLibrary.tsx`** — **Agency Workspace**, nhóm nav `Content & Quality`, tab `script_library`. Hai chế độ hiển thị trong 1 component: (1) danh sách thẻ kịch bản (tạo mới, sửa inline mở rộng ngay dưới thẻ, xoá), (2) **Teleprompter fullscreen** (`position: fixed inset-0`) khi bấm nút "Teleprompter" trên 1 thẻ — chữ lớn, có nút phóng to/thu nhỏ cỡ chữ (`fontScale` state), nút đóng quay lại danh sách. `canEdit` gate theo `currentRole` (ceo/admin/operations); dùng lại `PermissionKey` **`generate_scripts`** (cùng nhóm quyền AI Script Gen, role `talent` mặc định có quyền này nên thấy được tab để đọc teleprompter khi live).
- **Verify** — chạy migration thật trên Supabase, tạo 1 kịch bản test (JOCKEY, TikTok, có hook + nội dung nhiều dòng), mở Teleprompter fullscreen + test nút phóng to chữ, đóng lại, sửa inline thêm "Thứ tự ghim SKU", reload xác nhận persist đúng, xoá xong quay về empty state, không lỗi console.

## Đã hoàn thành — Giai đoạn B5 (Co-Funded Voucher Request Center)

- **Bảng `co_funded_vouchers`** — [supabase/migrations/0028_co_funded_vouchers.sql](supabase/migrations/0028_co_funded_vouchers.sql). Cột: `session_id` (FK `live_sessions`, cascade — voucher gắn riêng 1 phiên live), `brand_id` (FK `brands`, cascade), `voucher_code`, `description`, `total_value`, `brand_contribution_pct`/`agency_contribution_pct`/`platform_contribution_pct` (0-100, tỷ lệ đồng tài trợ 3 bên), `approval_status` (`draft`/`sent_for_approval`/`revision_requested`/`approved`), `sent_at`/`approved_at`, `revision_note`. **Tái dùng đúng pattern duyệt 2 chiều của Campaign** (migration 0017): Ops/CEO tạo request (draft) → gửi Brand duyệt → Brand duyệt (**approved coi như "cấp quyền áp trực tiếp"** — đúng ý roadmap mục 6) hoặc yêu cầu sửa. RLS: đọc mọi authenticated; `co_funded_vouchers_write_ceo_ops` cho ceo/operations/admin toàn quyền; `co_funded_vouchers_update_approval_brand` cho brand tự chuyển đúng 2 hướng hợp lệ khi đang `sent_for_approval` — copy nguyên pattern `campaigns_update_approval_brand`. Khác Campaign ở chỗ `revision_note` lưu trực tiếp trên row thay vì bảng note riêng (đơn giản hơn, không cần lịch sử nhiều note).
- **`src/lib/db/coFundedVouchers.ts`** — `fetchCoFundedVouchers`/`createCoFundedVoucher`/`updateCoFundedVoucher`/`deleteCoFundedVoucher` + `sendVoucherForApproval`/`respondToVoucherApproval` (partial update khớp đúng RLS, cùng pattern `campaigns.ts`).
- **`src/components/brand-workspace/BrandVoucherRequests.tsx`** — **Brand Workspace**, tab `brand_vouchers` "Voucher Đồng Tài Trợ" trong `BRAND_NAV_GROUPS`. Khác với Campaign (tạo ở Agency/`ShiftScheduling`, duyệt ở Brand/`BrandCampaigns` — 2 component riêng), module này gộp **tạo + duyệt trong cùng 1 component** vì không có màn Agency-side nào phù hợp để đặt form tạo (đơn giản hơn, vẫn đúng roadmap "chỉ thêm vào nav riêng brand"). Form tạo (chọn phiên live của brand, mã voucher, tổng giá trị, mô tả, 3 input % đồng tài trợ + cảnh báo nếu tổng ≠ 100%) chỉ hiện với `canManage` (ceo/admin/operations). Nút "Gửi Brand Duyệt" hiện khi `draft`/`revision_requested`; nút "Xoá" luôn hiện với `canManage` bất kể trạng thái (Ops cần huỷ được request gửi nhầm). Khối duyệt (nút Duyệt & Cấp Quyền Áp / Yêu Cầu Sửa + textarea ghi chú) chỉ hiện với `currentRole === "brand"` khi `sent_for_approval` — cùng UI pattern `BrandCampaigns.tsx`.
- **Verify** — chạy migration thật trên Supabase, tạo 1 voucher test (CROCS, phiên 2026-08-12, tổng 1.000.000đ, 50/30/20%), gửi Brand duyệt (trạng thái đổi đúng "Đang chờ Brand duyệt"), reload xác nhận persist đúng, xoá xong quay về empty state, không lỗi console. **Không verify được nhánh Brand tự duyệt qua UI thật** (không có tài khoản test role `brand` trong Supabase hiện tại) — RLS policy `co_funded_vouchers_update_approval_brand` copy nguyên logic đã chạy thật của `campaigns_update_approval_brand` (migration 0017, đã verify ở Giai đoạn 16 trước đây), rủi ro thấp nhưng nên test tay 1 lần với tài khoản brand thật khi có.

## Đã hoàn thành — Giai đoạn B6 (Live Audience & Conversion Analytics)

- **Không có migration mới** — 4 cột `peak_viewers`/`total_views`/`ctr_avg`/`cvr_avg` đã tồn tại sẵn trên `live_sessions` từ migration 0001 (`actual_gmv` cũng đã có sẵn), chỉ chưa có UI nhập tay thật.
- **Bug đã sửa: số liệu giả trong `LiveSessionHub.tsx`** — trước Giai đoạn B6, mỗi lần tạo/sửa session, code set cứng `peakViewers: editingSession?.peakViewers || 1500`, `totalViews: ... || 25000`, `ctrAvg: ... || 8.5`, `cvrAvg: ... || 4.2` — **ghi số giả vào DB thật** dù UI không hề có ô nhập cho 4 field này, vi phạm nguyên tắc "không giả lập số liệu" của dự án (CLAUDE.md). Đã sửa: thêm 4 state (`sessPeakViewers`/`sessTotalViews`/`sessCtrAvg`/`sessCvrAvg`) + 4 input thật trong modal "Chỉnh Sửa/Thêm Phiên Live" (PCU, Tổng Lượt Xem, CTR TB %, CVR TB %), mặc định 0 cho session mới, giữ giá trị thật khi sửa session cũ. Phạm vi sửa **chỉ 4 field này** — `totalOrders`/`avgWatchTimeSeconds` (cũng có default cứng 0/120) nằm ngoài phạm vi đã chốt với user, để nguyên.
- **`src/components/brand-workspace/BrandAudienceAnalytics.tsx`** — **Brand Workspace**, tab `brand_audience_analytics` "Hiệu Suất Xem & Chuyển Đổi" trong `BRAND_NAV_GROUPS`. Read-only (không có form nhập liệu ở đây — nhập liệu diễn ra ở `LiveSessionHub.tsx` phía Agency, cùng nơi Ops quản lý session). Filter theo trạng thái session, 4 thẻ tổng hợp (PCU/CTR/CVR trung bình, tổng GMV thực nhận), bảng chi tiết theo từng phiên. Session chưa có số liệu (`peakViewers/totalViews/actualGmv` đều 0) hiện "Chưa có số liệu" và **loại khỏi tính trung bình** (không tính 0 giả vào KPI thật) — kèm banner cảnh báo đếm số phiên thiếu số liệu. Không dùng `PermissionKey` (Brand Workspace, theo quy ước mục 2).
- **Phạm vi đã chốt với user trước khi code** — chỉ số tổng theo phiên (PCU/CTR/CVR/GMV), **không** làm Product Pin CTR theo từng SKU dù bảng `session_skus` đã có sẵn cột `click_count`/`ctr`/`cvr` từ migration 0001 (bảng này chưa có type/db-layer/UI nào — để phiên sau nếu cần, phạm vi rộng hơn 1 giai đoạn vì cần thêm UI quản lý SKU trong phiên trước).
- **Verify** — qua Supabase + browser thật: sửa 1 session CROCS thật (chuyển Upcoming→Completed, nhập PCU 3.200/Tổng lượt xem 42.000/CTR 7.5%/CVR 3.8%/GMV 50.000.000đ) qua modal LiveSessionHub, xác nhận Brand Workspace → Hiệu Suất Xem & Chuyển Đổi hiển thị đúng số vừa nhập (cả summary cards lẫn bảng chi tiết), Brand Dashboard GMV tháng cũng cập nhật đúng. Revert lại session về Upcoming + toàn bộ field = 0 sau khi verify xong, không lỗi console liên quan tới thay đổi (có 1 lỗi console không liên quan từ `UserRoleSettings` do thao tác điều hướng nhầm trong lúc test, không phải do code Giai đoạn B6).

## Đã hoàn thành — Giai đoạn C1 (Onboarding Checklist theo Brand)

- **2 bảng `onboarding_checklist_templates` + `brand_onboarding_checklists`** — [supabase/migrations/0029_onboarding_checklist.sql](supabase/migrations/0029_onboarding_checklist.sql). `onboarding_checklist_templates` (agency-wide, không có `brand_id`): `title`, `description`, `order_index`, `is_active`. `brand_onboarding_checklists`: `brand_id` (FK cascade), `title`/`description` (copy tại thời điểm khởi tạo, không link động tới template), `assignee` (PIC dạng text tự do, không FK tới `profiles`/`talents`), `deadline` (date), `status` (`pending`/`in_progress`/`completed`), `order_index`, `source_template_item_id` (FK nullable, chỉ để truy vết nguồn gốc). RLS cả 2 bảng: đọc mọi authenticated, ghi `ceo`/`operations`/`admin` — cùng pattern các bảng B+ trước.
- **`src/lib/db/onboardingChecklist.ts`** — CRUD riêng cho từng bảng (`fetchOnboardingChecklistTemplates`/`create`/`update`/`delete...TemplateItem`, `fetchBrandOnboardingChecklists`/`create`/`update`/`delete...ChecklistItem`) + `instantiateBrandOnboardingChecklist(brandId, templateItems, createdBy)` — copy toàn bộ template item đang `isActive` thành insert hàng loạt vào `brand_onboarding_checklists`, giữ nguyên `orderIndex` + gắn `sourceTemplateItemId`.
- **`src/components/OnboardingChecklist.tsx`** — **Agency Workspace**, nhóm nav `Kinh Doanh` (cạnh CRM & Projects), tab `onboarding_checklist`, dùng lại `PermissionKey` **`manage_crm_projects`** (gắn liền quan hệ Brand mới, không tạo key riêng). 2 phần trong 1 component: (1) "Quản lý Template chuẩn" — ẩn/hiện qua toggle, sửa inline title/mô tả/Active, thêm/xoá bước; (2) chọn 1 Brand qua dropdown → nếu chưa có checklist thì hiện nút "Khởi tạo checklist từ Template (N bước)", nếu đã có thì hiện bảng sửa inline PIC/deadline/trạng thái + thêm việc riêng ngoài template + tiến độ "X/Y hoàn thành". `canEdit` gate theo `currentRole` (ceo/admin/operations), role khác chỉ xem.
- **Bug phát sinh trong lúc verify (đã sửa)** — `selectedBrandId` khởi tạo bằng `useState(brands[0]?.id ?? "")` nhưng `brands` fetch async ở `App.tsx` nên rỗng lúc component mount lần đầu → state kẹt ở `""` vĩnh viễn dù dropdown `<select>` vẫn hiển thị brand đầu tiên (do trình duyệt tự chọn option đầu khi `value` không khớp option nào) — kết quả: khởi tạo/hiện checklist luôn filter sai, brand nào cũng hiện "chưa có checklist" dù DB có dữ liệu. Sửa bằng `useEffect` chốt lại `selectedBrandId` khi `brands` load xong (xem mục "Quy ước kỹ thuật phát sinh" bên dưới — pattern áp dụng cho mọi dropdown chọn brand default trong tương lai).
- **Verify** — chạy migration thật trên Supabase (user tự chạy qua SQL Editor), đăng nhập thật (role admin), thêm 1 bước template test, khởi tạo checklist cho brand Franklin, gán PIC + deadline + đổi trạng thái "Hoàn thành" inline, reload xác nhận persist đúng (kể cả sau khi phát hiện + sửa bug `selectedBrandId` ở trên), xoá sạch checklist item + template item test, reload lần cuối xác nhận về đúng empty state, không lỗi console.

## Đã hoàn thành — Giai đoạn C2 (GMV Target vs Actual theo Calendar)

- **Không có migration mới** — đúng phạm vi đã chốt ở mục 6.1: `LiveSession.targetGmv`/`.actualGmv`/`.date` (đã có sẵn) là đủ để dựng view lịch, không cần bảng/field mới. Nguồn target cho từng ngày = **tổng `targetGmv` của mọi session rơi vào ngày đó** (quyết định chốt với user, không chia đều target campaign theo ngày — giữ đơn giản, khớp đúng cách `actualGmv` cũng tính theo session).
- **`src/lib/campaignMetrics.ts`** — thêm `computeGmvByDate(sessions)` trả về `Map<"YYYY-MM-DD", DailyGmv>` (`target`/`actual`/`sessionCount`/`completedCount`), cùng file với `computeCampaignActualGmv` đã có.
- **`src/components/GmvCalendar.tsx`** — component **dùng chung** (không phải brand-only hay agency-only), nhận thẳng `sessions: LiveSession[]` đã filter sẵn ở call-site + `title`/`subtitle` tuỳ biến theo ngữ cảnh gọi. Copy pattern grid tháng từ `BrandCalendar.tsx` (state `month` dạng `"YYYY-MM"`, `shiftMonth`, leading-blanks + `grid-cols-7`), thay ô session-chip bằng ô target/actual + % (màu xanh ≥100%, vàng 70-99%, đỏ <70%, chỉ tô màu cho ngày đã qua — ngày tương lai không đánh giá %). 3 thẻ tổng hợp đầu trang: Target tháng, Actual tháng (+% đạt), **Dự phóng cuối tháng** (run-rate: `actualElapsed / daysElapsed * daysInMonth`, chỉ tính khi đang xem đúng tháng hiện tại và đã có ≥1 ngày trôi qua trong tháng — tháng khác hoặc chưa đủ dữ liệu thì hiện placeholder thay vì số sai).
- **Gắn vào 2 chỗ theo quyết định user (cả Agency lẫn Brand, không chỉ 1 trong 2)**:
  - **Agency Dashboard** ([src/components/Dashboards.tsx](src/components/Dashboards.tsx)) — sub-tab mới `"gmv_calendar"` cạnh `overview/gmv_forecast/kpi_comparison/alerts` đã có (cùng `dashboardSubTab` state pattern), nhận `sessions` toàn agency (không filter brand) → view tổng hợp mọi brand.
  - **Brand Dashboard** ([src/components/brand-workspace/BrandDashboard.tsx](src/components/brand-workspace/BrandDashboard.tsx)) — thêm thẳng vào cuối trang (không phải sub-tab, brand dashboard vốn không có sub-tab), nhận `brandSessions` (đã filter theo `brandId` sẵn có trong component) → view riêng đúng 1 brand.
- **Verify** — qua Supabase thật + browser thật (role admin): Agency Dashboard → sub-tab "Lịch GMV Target/Actual" hiện đúng target 200 triệu (Franklin, ngày 2/8) tô đỏ do actual=0 (0% <70%), ô hôm nay (7/8) có viền xanh nổi bật, 3 thẻ tổng hợp tính đúng; chuyển sang Brand Workspace Franklin → Brand Dashboard cuối trang hiện đúng lịch riêng Franklin cùng dữ liệu ngày 2/8, không lộ dữ liệu brand khác (đúng nguyên tắc cô lập workspace ở mục 5). Không có lỗi console. `npx tsc --noEmit` sạch.

## Đã hoàn thành — Giai đoạn C3 (Scheme khuyến mãi tích hợp Calendar)

- **Định nghĩa đã chốt với user (khác giả định ban đầu)** — Scheme là **kế hoạch khuyến mãi theo khoảng ngày**, không gắn session/brand cụ thể (áp dụng toàn agency). Chỉ 3 field nghiệp vụ: `title`, khoảng ngày (`startDate`/`endDate`), `description` tự do (đủ chứa mã voucher nếu cần, không cấu trúc hoá thêm field riêng — quyết định đơn giản hoá đã chốt).
- **Bảng `promo_schemes`** — [supabase/migrations/0030_promo_schemes.sql](supabase/migrations/0030_promo_schemes.sql). Cột: `title`, `description`, `start_date`/`end_date` (check `end_date >= start_date`). RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin` — cùng pattern các bảng B+/C1 trước.
- **`src/lib/db/promoSchemes.ts`** — CRUD chuẩn (`fetchPromoSchemes`/`createPromoScheme`/`updatePromoScheme`/`deletePromoScheme`), cùng pattern `fromDb` các module trước.
- **`src/lib/schemeUtils.ts`** — `schemesForDate(schemes, dateStr)` lọc scheme active cho 1 ngày (so sánh string "YYYY-MM-DD" trực tiếp, inclusive 2 đầu) — dùng chung cho mọi nơi cần hiện badge theo ngày.
- **`src/components/SchemeManager.tsx`** — panel CRUD (list inline-edit + form thêm), nhúng vào `LiveCalendar.tsx` qua nút toggle "Quản lý Scheme khuyến mãi (N)" — **không phụ thuộc `viewMode`** (hiện cố định phía trên các view Month/Week/Day Matrix/Talent Workload/List), chỉ hiện cho `canEditSchemes` (ceo/admin/operations, prop `currentRole` mới thêm vào `LiveCalendarProps`).
- **UX hiển thị đã chốt với user** — badge nhỏ 🏷️ trên ô ngày (không phải dòng riêng hay khối tách rời), `title` attribute native browser tooltip liệt kê tên + mô tả mọi scheme active ngày đó. Áp dụng ở **2 nơi**: `LiveCalendar.tsx` (Month view + Week view — 2 view có ô theo ngày; không áp dụng Day Matrix/Talent Workload/List vì không có cấu trúc ô-ngày), và `BrandCalendar.tsx` (grid tháng, read-only — brand không có quyền quản lý scheme, chỉ xem badge).
- **`App.tsx`** — fetch 1 lần agency-level (`promoSchemes` state, effect riêng `phaseC3Loading`/`phaseC3Error` cùng pattern các phase trước), 3 handler CRUD (`handleAddPromoScheme`/`handleUpdatePromoScheme`/`handleDeletePromoScheme`), truyền `schemes`/callback vào `LiveCalendar` (đầy đủ CRUD) và `BrandCalendar` (chỉ `schemes`, không có onAdd/onUpdate/onDelete — component đó vốn không cho sửa).
- **Verify** — chạy migration thật trên Supabase (user tự chạy qua SQL Editor), qua browser thật (role admin): tạo scheme test "ZZZ Test Flash Sale 8.8" (08/08–09/08/2026) qua panel quản lý ở Agency `Lịch Vận Hành` → Lịch Tháng, xác nhận badge 🏷️ hiện đúng trên ô ngày 8 và 9; chuyển sang Brand Workspace Franklin → Lịch Vận Hành xác nhận badge cũng hiện đúng (schemes không gắn brand nên hiện ở mọi brand, đúng thiết kế "áp dụng toàn agency" — không phải lỗi lộ dữ liệu vì scheme vốn không phải dữ liệu riêng brand nào). Xoá scheme test, xác nhận quay về "Chưa có scheme khuyến mãi nào." Không lỗi console. `npx tsc --noEmit` sạch.

## Đã hoàn thành — Giai đoạn C4 (Price List Import)

- **Bảng `sku_platform_prices`** — [supabase/migrations/0031_sku_platform_prices.sql](supabase/migrations/0031_sku_platform_prices.sql). Cột: `brand_id` (FK cascade), `sku_code`, `sku_name`, `platform` (`TikTok`/`Shopee`), `rrp` (giá niêm yết), `markdown_price` (giá sau markdown), `is_eol`, `imported_at`, `created_by`. RLS: đọc mọi authenticated, ghi `ceo`/`operations`/`admin` — cùng pattern các bảng B+/C1/C3. Khác `brand_platform_rates` (đó là % hoa hồng agency) — bảng này là giá bán SKU thực tế trên sàn.
- **`src/lib/db/skuPlatformPrices.ts`** — `fetchSkuPlatformPrices` + `deleteSkuPlatformPrice` chuẩn, cùng pattern `fromDb`. Riêng `importSkuPlatformPrices(brandId, rows, createdBy)` **thay thế toàn bộ** danh sách giá hiện tại của brand đó (delete theo `brand_id` rồi insert hàng loạt) thay vì merge/upsert từng dòng — đúng quyết định "mỗi lần import là 1 snapshot mới nhất", tránh tích luỹ SKU trùng qua nhiều lần upload.
- **Thư viện parse Excel: `xlsx` (SheetJS)** — bản từ npm registry (0.18.5) có 2 lỗ hổng cao (Prototype Pollution + ReDoS) không có fix trên npm; đã cài bản vá thật từ CDN chính chủ (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, ghi thẳng trong `package.json`), `npm audit` sạch 0 lỗ hổng. **Quy ước cho phiên sau nếu cần cập nhật/cài lại xlsx**: luôn cài từ `cdn.sheetjs.com`, không dùng `npm install xlsx` trực tiếp (bản npm registry là bản cũ không vá).
- **`src/components/brand-workspace/PriceListImport.tsx`** — **Brand Workspace**, tab `brand_price_list` "Price List Import" trong `BRAND_NAV_GROUPS`. Chỉ 1 luồng: chọn file `.xlsx/.xls/.csv` → parse client-side (hàm `parseWorkbook`, khớp cột theo tên đã chuẩn hoá bỏ dấu tiếng Việt qua `normalizeHeader` — chấp nhận "Mã SKU"/"SKU Code", "Tên SKU"/"SKU Name", "Nền Tảng"/"Platform", "Giá Niêm Yết"/"RRP", "Giá Sau Markdown", "EOL"/"Ngừng Bán") → preview bảng + đếm dòng hợp lệ/bị bỏ qua → nút "Xác Nhận Import" gọi `onImport` (ghi đè). Dòng thiếu Tên SKU hoặc Platform không khớp TikTok/Shopee bị bỏ qua (đếm hiển thị, không chặn toàn bộ file). Bảng hiện tại phía dưới cho xoá từng dòng (`canEdit` = ceo/admin/operations), role brand chỉ xem — **không có form CRUD chi tiết từng field**, đúng phạm vi đã chốt ở mục 6.1 ("chỉ 1 tab import").
- **Verify** — qua Supabase thật + browser thật (role admin): tạo file Excel test (2 dòng: TikTok + Shopee, có 1 dòng EOL), upload qua Brand Workspace Franklin → Price List Import, xác nhận preview đọc đúng 2/2 dòng, bấm Xác Nhận Import → bảng chính hiện đúng dữ liệu + timestamp "Lần import gần nhất", reload xác nhận persist đúng trên Supabase thật, xoá từng dòng test, reload lần cuối xác nhận về đúng empty state. Không lỗi console. `npx tsc --noEmit` sạch.

## Quy ước kỹ thuật phát sinh

- Brand workspace nav items để `perm: undefined` toàn bộ — không dùng lại `PermissionKey` hiện có cho tab brand-scoped, vì các key đó được thiết kế cho ngữ cảnh agency-wide và role `brand` không có chúng theo default.
- `effectiveWorkspace` (không phải `workspace` raw state) là nguồn sự thật duy nhất cho brandId hiện tại — luôn dùng nó khi cần biết "đang ở brand nào", không đọc thẳng `workspace` vì role `brand` không dùng state đó.
- Module mới ở **Agency Workspace** (nhóm `Content & Quality` trở đi) thì ngược lại — **dùng lại `PermissionKey` agency-wide sẵn có** (vd `manage_studios_gear` cho Product Sample Inventory) thay vì tạo key mới, để tránh phình `RolePermissionsMap`/`ALL_PERMISSION_DEFINITIONS`/`UserRoleSettings.tsx`. Chỉ tạo `PermissionKey` mới nếu module không liên quan rõ ràng tới permission nào đã có.
- **Không khởi tạo `useState` bằng giá trị suy ra từ 1 prop mảng fetch async** (vd `useState(brands[0]?.id ?? "")` cho dropdown chọn brand mặc định) — prop đó rỗng lúc component mount lần đầu (fetch chưa xong ở `App.tsx`), state kẹt vĩnh viễn ở giá trị rỗng dù UI trông như đã chọn đúng (browser tự hiển thị option đầu khi `value` không khớp). Phải đồng bộ lại bằng `useEffect` khi mảng đó load xong (xem bug đã sửa ở Giai đoạn C1, `OnboardingChecklist.tsx`) — áp dụng cho mọi component mới có dropdown chọn brand/entity mặc định dựa trên prop fetch async.
>
> **Quyết định chiến lược (đã chốt sau khi cân nhắc "xây lại từ đầu" vs "nâng cấp"):** KHÔNG rebuild hệ thống từ đầu. Giữ nguyên toàn bộ Supabase schema + business logic đã verify qua 27 giai đoạn (công thức P&L, rate history, trigger khoá sổ tháng, RLS 4 role, luồng duyệt Campaign...) — rebuild lại đống này tốn effort hơn viết mới, không phải ít hơn, và rủi ro sai số tiền/lương thật. Chỉ **viết lại lớp UI/`App.tsx`** theo kiến trúc workspace ở dưới — đây vốn dĩ đã là "viết lại giao diện gần như hoàn toàn" (đổi cách tổ chức nav/layout), nên giải quyết đúng nỗi đau "flat tab khó mở rộng" mà không cần đánh đổi phần backend đã chạy thật.

## 1. Bối cảnh & mục tiêu

App hiện tại là **flat tab list** — 1 sidebar duy nhất với 6 nhóm (`navGroups` trong `src/App.tsx:1338`), toàn bộ 28 tab ngang hàng, không phân biệt "toàn agency" vs "riêng 1 brand". Dữ liệu thì đã sẵn sàng: hầu hết entity chính đã có `brand_id`/`brandId` thật (không phải suy luận) nhờ các giai đoạn trước — `live_sessions.campaign_id`/brand qua campaign (Giai đoạn 26), `campaigns.brand_id`, `shift_slots`, `brand_platform_rates`, `brand_platform_rate_history`, `brand_invoices`.

Mục tiêu: tách UI thành 2 lớp workspace:
- **Agency Workspace** — bức tranh toàn cảnh, module dùng chung/tổng hợp toàn agency. Mặc định cho `ceo`/`admin`/`operations`.
- **Brand Workspace** (1 cho mỗi brand: JOCKEY, VERA, CROCS...) — mọi thứ scope theo đúng 1 brand, **thiết kế UI riêng** (không phải agency view + filter).

Role `brand` (đã có `assigned_brand_id` từ Giai đoạn 16) tự động sống trong đúng 1 Brand Workspace của họ, **không có switcher** — họ không cần thấy khái niệm "chuyển workspace" vì chỉ có 1 lựa chọn.

## 2. Quyết định đã chốt (từ trao đổi với user)

| Câu hỏi | Quyết định |
|---|---|
| Cơ chế chuyển workspace | **Dropdown switcher trên Header**, không dùng URL routing (app chưa có `react-router`, không thêm dependency mới cho việc này) |
| Mức độ rework module brand | **Thiết kế lại giao diện riêng cho brand** — không chỉ filter component agency theo `brandId`, brand workspace có bố cục/UX riêng phù hợp scope hẹp hơn (1 brand, ít data hơn nhiều) |
| Phạm vi phiên thiết kế này | Chỉ chốt kiến trúc, **implement ở phiên sau** |

## 3. Phân chia module

### 🏢 Agency Workspace (mặc định — ceo/admin/operations)

Giữ nguyên tinh thần các nhóm nav hiện tại, đổi tên nhóm đầu thành rõ nghĩa "toàn cảnh":

| Nhóm | Module | Component hiện tại | Ghi chú |
|---|---|---|---|
| Overview | Dashboard tổng | `Dashboards` | `MyWorkspace`/`ExecutiveBrief` (Việc Của Tôi, Command Brief) đã gỡ bỏ khỏi codebase theo yêu cầu — không còn trong roadmap |
| Live Ops | Live Sessions (toàn agency), Lịch Vận Hành (toàn agency), Đăng Ký & Chốt Lịch | `LiveSessionHub`, `LiveCalendar`, `ShiftScheduling` | giữ nguyên — đây chính là nơi Ops cần nhìn **xuyên brand** để tránh đụng lịch studio/talent |
| Resources (dùng chung, KHÔNG thuộc brand nào) | Talent Pool, Studios & Gear, AI Script Gen | `TalentMatcher`, `StudioEquipment`, `ScriptGenerator` | tài nguyên agency sở hữu, brand không có bản riêng |
| Business | CRM & Projects, TikTok API | `CrmProjects`, `TikTokApiAutomation` | giữ nguyên, agency-level |
| Finance | Finance & P&L tổng | `FinanceHr` | giữ nguyên |
| System | Hội Đồng AI, Phân Quyền & Role, Tài Khoản, AI Training Center | không đổi | giữ nguyên |

> **Đã gỡ bỏ (không còn trong roadmap):** `CampaignTimeline` (trùng lặp với Brand Campaigns/`ShiftScheduling` — GMV campaign đã dùng chung `lib/campaignMetrics.ts`), `StudioUtilization` (chưa có nhu cầu nghiệp vụ rõ ràng), `MonthlyClose` (trùng chức năng với Finance & P&L theo-session + Brand Invoices — xem migration `0023_drop_monthly_close.sql`, đã apply). Component + `monthly_closes` table + trigger khoá sổ đã xoá khỏi codebase/Supabase.

**Không đổi gì về code cho các module này ở giai đoạn 1** — chỉ đổi label nhóm và (tuỳ chọn) thêm khối "Tổng quan Brand" trên Dashboard tổng (card GMV theo từng brand, click vào card = nhảy sang Brand Workspace tương ứng — dùng lại data `brands`/`campaigns` đã fetch sẵn, không cần API mới).

### 🏷️ Brand Workspace (chọn 1 brand qua switcher)

Thiết kế riêng, **component mới**, không tái sử dụng y nguyên bản agency:

| Module | Nguồn dữ liệu (đã có FK thật) | Thiết kế khác agency ở điểm nào |
|---|---|---|
| **Brand Dashboard** | `campaigns` (KPI/GMV), `live_sessions` filter `brand_id`, `brand_invoices` | Bố cục rút gọn: 1 hero card GMV tháng này + trạng thái campaign hiện tại + công nợ, không cần bộ lọc theo brand (đã cố định) như `Dashboards.tsx`/`KpiComparison.tsx` hiện có |
| **Lịch vận hành của Brand** | `live_sessions` filter theo `brand_id` (qua `campaign.brandId` hoặc `session.campaignId`) | Calendar chỉ hiện session của brand này — bỏ cột/filter chọn brand vì đã ở trong context 1 brand |
| **Campaign của Brand** | `campaigns` filter `brand_id`, `campaign_revision_notes` | Đây là màn hình trung tâm nhất của brand workspace (Campaign = "xương sống", Giai đoạn 26) — timeline dọc các campaign theo tháng, mỗi campaign mở rộng ra session/KPI/duyệt/đánh giá cuối kỳ, gộp lại các luồng hiện đang nằm rải rác ở `ShiftScheduling.tsx` (khối Campaign Tháng) + `MyWorkspace.tsx` (CampaignApprovalCard) |
| **Session của Brand** | `live_sessions` filter `brand_id` | List + P&L rút gọn theo session, không cần chọn brand |
| **Rate Card của Brand** | `brand_platform_rates`, `brand_platform_rate_history` | Bảng rate hiện tại + lịch sử, không có ở agency-level UI nào hiện tại (rate hiện chỉ sửa được qua `FinanceHr`/form ẩn) |
| **Hoá đơn & Công nợ** | `brand_invoices` filter `brand_id` | Rút gọn từ khối "Hoá Đơn & Công Nợ Brand" trong `MonthlyClose.tsx`, chỉ hiện đúng 1 brand |
| **Báo cáo cuối kỳ** | `campaigns.outcome/renewalDecision/reviewNotes` (Giai đoạn 25) | Danh sách lịch sử đánh giá qua các kỳ, hiện xu hướng renew/at_risk/churned theo thời gian — dữ liệu đã có, chưa có UI tổng hợp nào hiển thị lịch sử này (hiện chỉ thấy campaign đang xét, không thấy trend) |

## 4. Kiến trúc kỹ thuật

### 4.1 State mới ở `App.tsx`

```ts
type WorkspaceContext = { type: "agency" } | { type: "brand"; brandId: string };
const [workspace, setWorkspace] = useState<WorkspaceContext>(() => loadStorage("workspace", { type: "agency" }));
```

- Role `brand`: bỏ qua state này hoàn toàn, luôn ép `{ type: "brand", brandId: profile.assignedBrandId }` — không cho chọn lại (giữ đúng ranh giới quyền hiện tại, brand chỉ thấy `MyWorkspace`).
- Đổi brand qua switcher → reset `activeTab` về tab đầu tiên hợp lệ của workspace mới (tránh giữ `activeTab="finance"` khi vừa nhảy vào brand workspace không có tab đó).
- Lưu `localStorage` giống pattern `activeTab` hiện có (`loadStorage`/`saveStorage`, `STORAGE_PREFIX`).

### 4.2 `navGroups` chia theo workspace

Thay 1 mảng `navGroups` cố định bằng hàm theo `workspace.type`:

```ts
const navGroups = workspace.type === "agency" ? AGENCY_NAV_GROUPS : BRAND_NAV_GROUPS;
```

`BRAND_NAV_GROUPS` là danh sách tab mới hoàn toàn (brand_dashboard, brand_calendar, brand_campaigns, brand_sessions, brand_rates, brand_invoices, brand_reviews) — permission gate giữ nguyên `PermissionKey` hiện có (vd `manage_calendar`, `view_financials`) vì quyền theo role không đổi, chỉ đổi phạm vi dữ liệu.

### 4.3 Component mới cần tạo (phiên implement)

- `src/components/Header.tsx` — thêm `WorkspaceSwitcher` (dropdown: "🏢 Agency" + list brand từ prop `brands`), chỉ hiện cho role khác `brand`.
- `src/components/brand-workspace/BrandDashboard.tsx`
- `src/components/brand-workspace/BrandCalendar.tsx` (có thể tái dùng phần lớn logic conflict-check của `LiveCalendar.tsx` qua hàm helper dùng chung, KHÔNG copy nguyên component)
- `src/components/brand-workspace/BrandCampaigns.tsx` — gộp luồng Campaign Timeline + duyệt + đánh giá cuối kỳ cho 1 brand
- `src/components/brand-workspace/BrandSessions.tsx`
- `src/components/brand-workspace/BrandRateCard.tsx`
- `src/components/brand-workspace/BrandInvoices.tsx`
- `src/components/brand-workspace/BrandReviewHistory.tsx`

Mỗi component nhận thẳng `brandId` (không tự chọn) + slice dữ liệu đã filter sẵn ở `App.tsx` (giữ nguyên pattern hiện tại: `App.tsx` filter bằng `useMemo`, component chỉ nhận props đã lọc — giống `activeProjects`/`activeStudios` hiện có), **không fetch riêng** — toàn bộ data vẫn fetch 1 lần ở agency-level `useEffect` hiện có, brand workspace chỉ là lát cắt hiển thị khác của cùng 1 state.

### 4.4 Không đổi

- Không đổi schema Supabase — mọi FK cần thiết đã tồn tại.
- Không đổi `src/lib/db/*.ts` — không cần fetch API mới.
- Không thêm router — điều hướng vẫn qua `activeTab` string như hiện tại, chỉ thêm 1 lớp `workspace` phía trên.

## 5. Việc còn mở (quyết định ở phiên implement, không chặn thiết kế)

- Brand workspace có cần riêng 1 `PermissionKey` mới để CEO tắt/bật quyền truy cập brand workspace theo role không, hay dùng lại permission hiện có (`view_financials`, `manage_calendar`...) cho từng tab con? → đề xuất dùng lại, tránh phình `RolePermissionsMap`.
- Brand Dashboard có cần thêm biểu đồ so sánh giữa các brand (xem nhanh JOCKEY vs VERA) hay tuyệt đối không nhìn thấy brand khác khi đang trong 1 brand workspace? → đề xuất: brand workspace **tuyệt đối không lộ dữ liệu brand khác**, đúng tinh thần "workspace cô lập" — so sánh liên-brand chỉ có ở Agency Dashboard.

## 6. Roadmap module mới (SAU khi khung workspace xong — mỗi cái là 1 Giai đoạn riêng, KHÔNG thiết kế schema ở đây)

Phát sinh từ vòng test prototype UX (AI khác đề xuất, đã được duyệt về mặt ý tưởng, đúng domain agency livestream thật). Đây chỉ là **danh sách chỗ đứng trong roadmap**, chưa thiết kế bảng/RLS/CRUD — mỗi module cần 1 phiên riêng theo đúng quy trình migration + verify qua Supabase thật như các Giai đoạn trước.

**Agency Workspace — thêm nhóm "Content & Quality" mới:**
- `Script & Teleprompter Library` — kho kịch bản mẫu, hook 3 giây đầu, thứ tự ghim SKU, chế độ xem teleprompter theo nền tảng. Liên quan tới `ScriptGenerator.tsx` hiện có (AI Script Gen) — cần làm rõ ranh giới: cái cũ generate mới, cái này là thư viện lưu/tái sử dụng kịch bản đã có.
- `Product Sample Inventory` — tracking hàng mẫu vật lý brand gửi tới từng Studio (mã code, tình trạng, vị trí). Có liên hệ tới `Studio` (Giai đoạn 1) — cần bảng mới `product_samples` liên kết `studio_id` + `brand_id`.
- `Live Stream Incident Log` — nhật ký sự cố khi live (rớt mạng, khoá giỏ hàng, host trễ, hết voucher), mức độ nghiêm trọng, xử lý khắc phục. Liên kết `session_id` — có thể tái dùng pattern append-only của `audit_logs`.

**Brand Workspace — thêm vào nav riêng brand:**
- `SKU Showcase & Hero Product Catalog` — danh sách SKU lên sóng, giá flash-deal, hero SKU, tỷ lệ xả kho, thứ tự ghim. Bảng mới `brand_skus`, liên kết `brand_id`.
- `Co-Funded Voucher Request Center` — voucher riêng phiên live, tỷ lệ đồng tài trợ Brand/Agency/Sàn, brand tự duyệt cấp quyền áp trực tiếp. Có thể tái dùng pattern duyệt 2 chiều giống luồng duyệt Campaign (Giai đoạn 16).
- `Live Audience & Conversion Analytics` — PCU, Product Pin CTR, CVR, GMV thực nhận theo phiên. Cần làm rõ nguồn dữ liệu: nhập tay hay chờ tích hợp TikTok API thật (Giai đoạn 9 hạ tầng đã có nhưng chưa có credentials thật) — nếu chưa có API thật thì module này ban đầu là nhập tay giống `session_finance`, không giả lập số.

**Nguyên tắc khi thiết kế từng module ở phiên riêng:** theo đúng convention đã có toàn dự án — RLS rõ ràng theo role, không giả lập số liệu (nhập tay + ghi rõ "chưa tích hợp thật" nếu chưa có nguồn dữ liệu thật), verify qua Supabase + browser thật trước khi đánh dấu hoàn thành.

## 6.1 Giai đoạn C — 4 module bổ sung (đối chiếu file vận hành thật YFB x Crocs, 2026-08-07)

Rút ra từ việc đọc file Excel vận hành thật của agency (40 sheet: calendar, target, price list, sample, host, checklist...). Phần lớn sheet trong file đã khớp với module đã build (B1-B6) — 4 mục dưới đây là phần **chưa có chỗ đứng trong roadmap**, đã chốt phạm vi với user (KHÔNG làm tràn lan theo đúng những gì file có — nhiều sheet đã bị loại vì trùng module cũ, xem ghi chú "Loại khỏi roadmap" cuối mục). **C1 + C2 + C3 đã code+verify xong** (xem "Đã hoàn thành — Giai đoạn C1"/"C2"/"C3" ở trên); còn 1 module chưa code:

| Module | Phạm vi đã chốt | Ghi chú |
|---|---|---|
| ~~**GMV Target vs Actual theo Calendar**~~ | **✅ Đã xong (Giai đoạn C2)** — xem "Đã hoàn thành — Giai đoạn C2" ở trên. | `computeGmvByDate` trong `campaignMetrics.ts`, component `GmvCalendar.tsx`, gắn cả Agency Dashboard lẫn Brand Dashboard. |
| **Price List Import (SKU pricing theo platform)** | **Chỉ 1 tab import** — brand/ops upload file Excel giá niêm yết theo platform (Shopee/TikTok, RRP/giá sau markdown/EOL), không cần form CRUD chi tiết từng field như các module trước. Khác `brand_platform_rates` (đó là % hoa hồng agency, cái này là giá bán SKU). | Cần chọn: parse Excel bằng thư viện nào (đã có sẵn trong stack hay cần thêm dependency) — quyết định ở phiên implement. Chưa code. |
| ~~**Scheme (khung giờ vàng/voucher) tích hợp vào Calendar**~~ | **✅ Đã xong (Giai đoạn C3)** — xem "Đã hoàn thành — Giai đoạn C3" ở trên. Định nghĩa cuối cùng khác giả định ban đầu: kế hoạch khuyến mãi theo khoảng ngày, không gắn session. | `promo_schemes`, component `SchemeManager.tsx` nhúng vào `LiveCalendar.tsx`, badge 🏷️ trên ô ngày ở cả `LiveCalendar.tsx` và `BrandCalendar.tsx`. |
| ~~**Onboarding Checklist theo Brand (template + assign task)**~~ | **✅ Đã xong (Giai đoạn C1)** — xem "Đã hoàn thành — Giai đoạn C1" ở trên. | `onboarding_checklist_templates` + `brand_onboarding_checklists`, component `OnboardingChecklist.tsx`. |

**Loại khỏi roadmap (đã có module tương đương, không làm thêm):**
- **Affiliate/Creator (KOC) tracking** — user xác nhận đa số host/trợ live của công ty là người ngoài, đăng ký ca theo session → đã được `Talent Pool` (`TalentMatcher.tsx`) phủ đúng, không cần module riêng.
- **List thu hồi / Request sample / Request retock / Giỏ hàng - Tiktok / Q&A (brand input) / Profile Host / QUY TRÌNH SAMPLE / YFB Team PIC / LƯU Ý ACCOUNT** — các sheet còn lại trong file đối chiếu đều trùng phạm vi với module đã build (Product Sample Inventory B2, Script Library B4, Talent Pool) hoặc là tài liệu nội bộ không cần model hoá thành tính năng riêng.

## 7. Thứ tự triển khai tổng thể

1. **Giai đoạn A — Khung workspace:** Header switcher + state `workspace` (khung sườn, chưa nội dung mới) → Agency Workspace (đổi label nhóm, nối module hiện có, không đổi component) → Brand Dashboard → Brand Campaigns (module trung tâm nhất) → các module Brand còn lại (Calendar/Sessions/Rate Card/Invoices/Review History). **Đây là việc cần làm trước, không phụ thuộc gì ở mục 6.**
2. **Giai đoạn B+ — 6 module mới (mục 6):** làm sau khi khung workspace đã xong và verify, mỗi module 1 giai đoạn độc lập, thứ tự do user chọn ở đầu mỗi phiên (giống quy ước chọn giai đoạn cũ).
