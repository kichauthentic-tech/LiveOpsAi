# LiveOps AI — Trạng thái Workspace (Agency ↔ Brand)

> File này được viết lại gọn ngày 2026-09-08 — bản cũ (1459 dòng, đã vượt giới hạn đọc 1 lần của Claude Code) vẫn còn nguyên trong Git (`git log -- WORKSPACE_DESIGN.md`), tra lại lịch sử chi tiết từng bug/migration bằng lệnh đó thay vì mở file này. Từ nay giữ nguyên tắc: file này chỉ ghi **trạng thái hiện tại**, không tường thuật quá trình.

> **Cập nhật 2026-09-13:** Các phần dưới đây được viết ở các thời điểm khác nhau và nghiệp vụ/code đã đổi khá nhiều kể từ đó. Từ nay **không coi nội dung cũ trong file này là ground truth mặc định** — mọi mục (kiến trúc, luồng dữ liệu, quy ước kỹ thuật...) cần được re-verify bằng đọc code hiện tại trước khi dựa vào để quyết định, đặc biệt là mục nào chưa có ghi chú "đã audit lại". Đang làm 1 vòng rà soát UX/workflow theo từng module (xem "Giai đoạn tiếp theo") — mỗi module audit xong sẽ cập nhật lại đúng phần liên quan trong file.

## Kiến trúc tổng quan

App tách 2 lớp workspace, chuyển qua dropdown switcher trên Header (không dùng URL routing):

- **Agency Workspace** (mặc định — `ceo`/`admin`/`operations`) — nhóm nav: Vận Hành Live, Tài Nguyên Chung, Kinh Doanh (CRM + TikTok API), Tài Chính, Hệ Thống.
- **Brand Workspace** (1 cho mỗi brand: JOCKEY, VERA, CROCS, Franklin) — role `brand` tự động bị khoá vào đúng 1 brand qua `assigned_brand_id`, không có switcher.

Ground truth luôn là `AGENCY_NAV_GROUPS`/`BRAND_NAV_GROUPS` ở [src/App.tsx](src/App.tsx) — danh sách dưới đây chỉ là ảnh chụp, lệch thì tin code.

**Agency:** Live Sessions · Lịch Vận Hành · Đăng Ký & Chốt Lịch · Talent Pool · Studios & Gear · CRM (gồm Rate Card từng brand) · TikTok API · Finance & P&L · Hội Đồng AI · Phân Quyền & Role · AI Training Center.

**Brand:** Lịch Vận Hành · Sessions · SKU Showcase · Report Tháng (có toggle chế độ xem Tháng/Tuần) · Dữ Liệu Gốc (Dataraw — ẩn với role `brand`, chỉ ceo/admin/operations).

> Module **Dashboard** (agency lẫn brand) đã bị xoá hẳn ngày 2026-09-13 — xem mục "Rà soát UX/workflow theo module" bên dưới.

**Đã xoá khỏi roadmap** (không phải thiếu, mà chủ động gỡ vì trùng lặp/ngoài phạm vi): Module Campaign, Price List Import, Co-Funded Voucher, Hoá Đơn & Công Nợ Brand (P&L giờ tính trên NMV ước tính thay vì công nợ), AI Script Gen, End-to-End Simulator, Onboarding Checklist theo Brand, Rate Card tab riêng trong Brand Workspace (gộp vào CRM, set tập trung 1 chỗ cho mọi brand).

## Luồng dữ liệu chính (đã verify qua Supabase + browser thật)

1. **Tầng 0 — Dữ Liệu Gốc (Dataraw):** ops tải tay 5 loại report Excel từ TikTok Shop Seller Center (Shop Promotion List, Product List, Live Analysis, Shop Analytics, Transaction Analysis Creator List) mỗi tuần/tháng, upload vào kho theo brand. Đây là bằng chứng gốc, tự động gộp/ghi đè theo tháng khi upload lại. **Chưa có pipeline API tự động** — cần scope `data.shop_analytics.public.read`, đang treo ở bước đăng ký Developer/ISV TikTok Shop Partner Center.
2. **Đối soát:** Talent tự nhập report ca (tạm tính, `data_source='manual'`) → Ops đối soát cuối kỳ bằng số đọc thẳng từ Dataraw, ghi đè thành `data_source='tiktok_reconciled'`. Nộp lại report sau khi đã đối soát **không tự xoá cờ** nếu số liệu đối soát (GMV/orders/views/CTR/watch-time) không đổi (migration 0075).
3. **Report Tháng Brand Workspace** (5 tab: Tổng Quan/Livestream/Sản Phẩm & Khuyến Mãi/Affiliate/Kế Hoạch Tháng Sau) — đạt chuẩn brief thật Crocs x YFB, đọc thẳng từ Dataraw + `live_sessions` thật, không số bịa. Toggle Tháng/Tuần dùng chung 1 màn hình.
4. **P&L** (`lib/pnl.ts`) tính trên NMV ước tính = `actualGmv × (1 − returnRate/100)`, giờ công thực tế = giờ ca + OT − off sớm, rate/giờ song song với rate/phiên cũ (data cũ không đổi).

*(re-confirmed đúng qua audit module "Vận Hành Live" ngày 2026-09-13 — xem mục Giai đoạn tiếp theo)*

## Hạ tầng Supabase

- Migration mới nhất: **0077** (đã chạy trên Supabase thật, xem `supabase/migrations/`). Quy trình chạy: user tự dán vào Supabase SQL Editor (không có `DATABASE_URL`/Supabase CLI cấu hình trong máy dev).
- Project Supabase này **không còn chia sẻ với app nào khác** (đã dọn 15 bảng CRM/outreach không liên quan ngày 2026-09-07, xem migration 0076 nếu cần đối chiếu).
- RLS: mọi bảng có `brand_id` trực tiếp đã cô lập theo brand ở tầng đọc (không chỉ tầng UI) — công thức chuẩn `current_user_role() is distinct from 'brand' or brand_id = current_user_brand_id()`.

## Đề xuất tái cấu trúc data 3-grain — tạm dừng, không còn là hướng đang theo

Đề xuất cũ (tách `shifts`/`broadcasts`/`metric_facts`, 4 quyết định nghiệp vụ chờ chốt...) **không còn được coi là đã chốt** — quyết định 2026-09-13: ưu tiên rà soát và sửa workflow/UX trên schema hiện tại trước, tạm gác bài toán tái cấu trúc data. Không xoá khỏi lịch sử: bản kỹ thuật đầy đủ vẫn xem lại được tại `git show eede2c2:WORKSPACE_DESIGN.md` hoặc artifact https://claude.ai/code/artifact/9255e287-cf73-4d83-bdbe-4fc3a53236c4 nếu sau này cần quay lại, nhưng **không dùng làm ground truth** — mọi nhận định trong đó (lỗi kiến trúc A/B/C/D...) cần verify lại bằng đọc code hiện tại trước khi hành động theo, không lấy nguyên từ bản cũ.

## Còn lại — chưa làm / còn mock

- **Tích hợp TikTok API tự động** — hiện 100% nhập tay qua Dataraw, chờ scope Developer/ISV.
- **Theme toggle (light/dark) chưa phủ hết app** — hạ tầng có sẵn app-wide, nhưng chỉ 2 calendar (`LiveCalendar`/`BrandCalendar`) có class `dark:`, phần còn lại (sidebar, Header, mọi modal/bảng) vẫn hardcode màu dark cũ — không vỡ, chỉ không đổi màu khi toggle. Làm dần khi có yêu cầu, không có deadline.

## Quy ước kỹ thuật bắt buộc tuân theo

*(chưa re-audit theo đợt 2026-09-13 — các mục dưới vẫn là quy ước hợp lệ trừ khi đọc code thấy khác, nhưng coi là "cần xác nhận lại" chứ không mặc định đúng 100%)*

- **Brand workspace nav item**: `perm: undefined` (không gate `PermissionKey` — role `brand` không có key agency-wide). **Agency Workspace module mới**: ngược lại, tái dùng `PermissionKey` sẵn có, chỉ tạo key mới nếu module không liên quan permission nào đã có.
- **`effectiveWorkspace`** (không phải `workspace` raw state) là nguồn sự thật duy nhất cho brandId hiện tại.
- **Màu brand** luôn qua `getBrandTheme(brandName)` (`src/lib/brandTheme.ts`) — không hash id ra màu, không hardcode hex. **Logo brand** luôn qua `<BrandLogo>` (`src/components/ui/BrandLogo.tsx`) — brand chưa có ảnh tự rơi về emoji.
- **Session/ca trên lịch** luôn render bằng `<SessionEventCard>` — không tự vẽ div. Muốn thêm info thì sửa `buildSessionMeta`/`buildSlotMeta` (áp dụng đồng thời mọi view lịch).
- **Không khởi tạo `useState` bằng giá trị suy từ prop mảng fetch async** (vd `useState(brands[0]?.id ?? "")`) — prop rỗng lúc mount đầu, state kẹt vĩnh viễn. Phải đồng bộ lại bằng `useEffect` khi mảng load xong.
- **Khi `drop column`/`drop table` trong migration**: phải grep lại thân mọi function plpgsql còn tham chiếu tên đó và `create or replace` chúng TRONG CÙNG migration — Postgres chỉ plan thân plpgsql ở lần gọi đầu, migration drop chạy "thành công" nhưng hàm chết im lặng tới khi user thật bấm nút.
- **Mọi `.update()`/`.delete()` qua PostgREST phải kèm `.select()` và kiểm tra số dòng trả về** — RLS lọc còn 0 dòng thì PostgREST trả 204 không kèm error, không đếm lại thì thao tác bị chặn vẫn "báo thành công".
- **Cho user tự sửa dữ liệu của chính mình → RPC `security definer` với whitelist cột, KHÔNG mở policy RLS** — RLS chặn theo DÒNG chứ không theo CỘT, mở policy "sửa dòng của mình" là mở luôn mọi cột trong dòng đó.
- **Handler ở `App.tsx` bọc try/catch + `window.alert` không tái sử dụng được cho form cần hiện lỗi tại chỗ** — handler đó trả `void` và đã nuốt lỗi.
- **`isTabAllowed`**: "không tìm thấy nav item" phải coi là KHÔNG được phép (không phải mặc định cho qua) — tab ẩn khỏi sidebar vẫn có thể mở lại qua `activeTab` cũ trong localStorage nếu không chặn đúng.
- **State UI mang ý nghĩa phân quyền** (`activeTab`, `workspace`) phải reset khi đổi user — localStorage không tách theo user trên máy dùng chung. Cơ chế: lưu `uiStateOwner` = id user, khác chủ thì reset.
- **Không sửa RLS policy bằng vòng lặp quét `pg_tables`/`information_schema`** — luôn liệt kê bảng tường minh trong migration, tránh lỡ tay đụng bảng không liên quan.
- **`brand_dataraw_imports` chỉ được 1 batch/`brand_id`+`report_type`+tháng của `period_start`** (unique index `idx_brand_dataraw_imports_brand_type_month`, migration 0077 — khớp `monthKey()`/`findExistingImportForMonth()` trong `lib/db/brandDataRaw.ts`). Mọi ghi mới vào bảng này phải qua `createOrReplaceDataRawImport()`, không insert thẳng — hàm đã dịch lỗi `23505` (trùng batch do race/double-submit) sang message tiếng Việt, đừng bọc thêm lần nữa ở component.

## Rà soát UX/workflow theo module (bắt đầu 2026-09-13)

Mục tiêu: app hiện đúng chức năng nhưng chưa tiện lợi cho vận hành thật — rà từng cụm module (theo nhóm nav), audit hiện trạng bằng đọc code thật, tìm điểm nghẽn, rồi sửa dần. Không đợi tái cấu trúc data ở trên xong mới làm — 2 việc độc lập.

**Module 1 — Vận Hành Live (đăng ký ca → chốt lịch → report ca → đối soát): đã audit, chưa fix.**

Luồng thật: talent bấm "Tôi rảnh ca này" ([ShiftScheduling.tsx](src/components/ShiftScheduling.tsx)) → ops chọn Host/Co-host, bấm "Chốt Lịch" (`handleFinalizeShiftSlot`, `src/App.tsx:1256-1316`) → talent nhập [SessionReportForm.tsx](src/components/SessionReportForm.tsx) tay 100% → ops đối soát ở [TikTokLiveReconciliation.tsx](src/components/TikTokLiveReconciliation.tsx) (nhúng trong tab "TikTok API").

Điểm nghẽn tìm thấy (chưa fix):
1. **Không có notification nào xuyên suốt** cả 3 bước (chốt lịch, emergency swap, report bị lệch sau đối soát) — người dùng phải tự mở lại tab để biết trạng thái đổi.
2. **Đối soát bị tách khỏi ngữ cảnh** — nằm trong tab "TikTok API" thay vì cạnh Live Sessions/lịch, ops phải nhảy 3 màn hình (Brand Workspace upload Dataraw → Agency Workspace nạp/khớp batch → quay lại xem kết quả).
3. **Chốt lịch xử lý từng ca một, không có thao tác hàng loạt** (đối soát đã có "Áp Dụng Tất Cả", chốt lịch thì chưa).
4. **Report ca nhập tay 100%, không prefill từ Dataraw** dù phần lớn số sẽ bị đối soát ghi đè sau — cùng 1 số gõ 2 lần độc lập.

Ưu tiên đề xuất: #1 rẻ nhất (không đụng schema, thêm 1 lớp notification) → #2, #3 (thuần UI/điều hướng) → #4 nên làm sau khi hướng data ở trên rõ hơn (đụng đúng ô `actual_gmv` hay bị nêu là ghi-đè-phá-huỷ). **Chưa fix — plan bị người dùng yêu cầu dừng lại để bổ sung insight nghiệp vụ sâu hơn (2026-09-13), xem lại trước khi tiếp tục.**

**Module Dashboard (Agency + Brand) — đã xoá hẳn ngày 2026-09-13.** Lý do: mọi số liệu KPI trên dashboard (GMV forecast, KPI comparison, deviation alerts, GMV calendar, "Hiệu Suất Xem & Chuyển Đổi"...) tính live từ cấu trúc dữ liệu phiên live hiện tại — cấu trúc này chưa chốt (xem mục "Đề xuất tái cấu trúc data 3-grain" ở trên, đang tạm dừng) nên số hiển thị chưa đáng tin. Quyết định: xoá dứt điểm thay vì giữ hiển thị số sai, sẽ custom/build lại module này sau khi cấu trúc data raw hoàn thiện.

Đã xoá: `src/components/Dashboards.tsx`, `src/components/brand-workspace/BrandDashboard.tsx`, `src/components/brand-workspace/BrandAudienceAnalytics.tsx`, cùng các widget chỉ phục vụ riêng 2 file trên (`KpiComparison.tsx`, `GmvGrowthTrendline.tsx`, `PerformanceDeviationAlerts.tsx`, `GmvCalendar.tsx`, `src/lib/gmvMetrics.ts`) và 1 file mồ côi có sẵn từ trước liên quan (`PerformanceMetricsWidget.tsx`). Xoá kèm nav item "Tổng Quan"/"Dashboard" (agency) và "Dashboard"/"Hiệu Suất Xem & Chuyển Đổi" (brand) trong `src/App.tsx`. Tab mặc định sau khi đăng nhập đổi từ "dashboard"/"brand_dashboard" (không còn tồn tại) sang `getDefaultTabForRole()` (`src/App.tsx`) — agency về "Live Sessions", brand về "Lịch Vận Hành".

**Không đụng** (không phải dashboard, có workflow/ghi dữ liệu thật riêng): `BrandMonthlyReport.tsx`/`MonthlyReportTabs.tsx`/`BrandWeeklyReport.tsx` (report tháng/tuần, có publish workflow), `src/lib/pnl.ts`, `src/lib/metrics/*`, `src/lib/db/brandDataRaw.ts`.

**Module tiếp theo (chưa audit):** (2) Điều hướng/UI tổng thể toàn app, (3) Báo cáo/số liệu (Report Tháng, P&L) — riêng phần "Dashboard" của mục (3) không còn áp dụng, đã xử lý ở trên. Audit xong module nào thì cập nhật đúng mục này, không tạo file riêng.
