# LiveOps AI — Thiết kế Workspace Model (Agency ↔ Brand)

> **Trạng thái: GIAI ĐOẠN A (khung workspace) + GIAI ĐOẠN B1 (SKU Showcase) + GIAI ĐOẠN B2 (Product Sample Inventory) + GIAI ĐOẠN B3 (Live Stream Incident Log) ĐÃ CODE + VERIFY XONG.** Xem mục "Đã hoàn thành" bên dưới.
> Còn lại ở mục 6/Giai đoạn B+: Script & Teleprompter Library, Co-Funded Voucher Request Center, Live Audience & Conversion Analytics — chưa bắt đầu.
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

## Quy ước kỹ thuật phát sinh

- Brand workspace nav items để `perm: undefined` toàn bộ — không dùng lại `PermissionKey` hiện có cho tab brand-scoped, vì các key đó được thiết kế cho ngữ cảnh agency-wide và role `brand` không có chúng theo default.
- `effectiveWorkspace` (không phải `workspace` raw state) là nguồn sự thật duy nhất cho brandId hiện tại — luôn dùng nó khi cần biết "đang ở brand nào", không đọc thẳng `workspace` vì role `brand` không dùng state đó.
- Module mới ở **Agency Workspace** (nhóm `Content & Quality` trở đi) thì ngược lại — **dùng lại `PermissionKey` agency-wide sẵn có** (vd `manage_studios_gear` cho Product Sample Inventory) thay vì tạo key mới, để tránh phình `RolePermissionsMap`/`ALL_PERMISSION_DEFINITIONS`/`UserRoleSettings.tsx`. Chỉ tạo `PermissionKey` mới nếu module không liên quan rõ ràng tới permission nào đã có.
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
| Overview | Việc Của Tôi, Command Brief, Dashboard tổng | `MyWorkspace`, `ExecutiveBrief`, `Dashboards` | giữ nguyên |
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

## 7. Thứ tự triển khai tổng thể

1. **Giai đoạn A — Khung workspace:** Header switcher + state `workspace` (khung sườn, chưa nội dung mới) → Agency Workspace (đổi label nhóm, nối module hiện có, không đổi component) → Brand Dashboard → Brand Campaigns (module trung tâm nhất) → các module Brand còn lại (Calendar/Sessions/Rate Card/Invoices/Review History). **Đây là việc cần làm trước, không phụ thuộc gì ở mục 6.**
2. **Giai đoạn B+ — 6 module mới (mục 6):** làm sau khi khung workspace đã xong và verify, mỗi module 1 giai đoạn độc lập, thứ tự do user chọn ở đầu mỗi phiên (giống quy ước chọn giai đoạn cũ).
