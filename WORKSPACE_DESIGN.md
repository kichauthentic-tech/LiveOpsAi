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

2b. **Snapshot số liệu theo ca (migration 0078/0079, 2026-09-17) — nguồn sự thật MỚI, đang thay dần việc nhập tay.** Trợ live tải file `Creator-Live-Performance` (TikTok Creator Center, 1 dòng/Room ID) rồi up thẳng vào đúng ca đang trực; ca đã biết host/brand nên file không cần cột định danh. Bậc tin cậy thứ 3 `data_source='live_snapshot'` nằm giữa `manual` và `tiktok_reconciled`. Chi tiết cơ chế xem mục "Tầng dữ liệu gốc mới" bên dưới.
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

## Tầng dữ liệu gốc mới — snapshot theo ca (Giai đoạn 1, xong 2026-09-17)

Quyết định nghiệp vụ: **mọi số liệu hiệu suất của toàn app từ nay lấy từ đúng 1 loại file chuẩn** `Creator-Live-Performance`, thay cho 5 loại Dataraw phức tạp. 5 loại cũ **giữ nguyên, không đụng tới** — dành cho module report cuối tháng sẽ build sau.

**Vì sao phải lưu từng lần up thành snapshot riêng:** file là số CỘNG DỒN từ lúc mở room. Ca nối nhau mà host không tắt stream thì 2 ca dùng chung 1 Room ID, nên số ca sau = lần up này TRỪ lần up trước của cùng room. Snapshot lúc giao ca là thứ **duy nhất** ghi lại được ranh giới giữa 2 ca trong cùng một room — file đối soát cuối ngày chỉ có tổng cả room, không tách ngược được. Trợ quên up lúc giao ca ⇒ mất ranh giới vĩnh viễn, chỉ còn chia tay ước lượng.

Bảng/hàm: `session_live_snapshots` + `session_live_snapshot_rows`, RPC `apply_session_live_snapshot` / `delete_session_live_snapshot` / `recompute_session_from_snapshot` (0078, sửa ở 0079). Code: [extractRooms.ts](src/lib/liveSnapshot/extractRooms.ts), [metrics.ts](src/lib/liveSnapshot/metrics.ts), [sessionLiveSnapshots.ts](src/lib/db/sessionLiveSnapshots.ts), UI [SessionLiveSnapshotUpload.tsx](src/components/SessionLiveSnapshotUpload.tsx) nhúng trong ShiftScheduling.

**Quy ước bắt buộc của tầng này:**

- **Chỉ 13 cột ĐẾM ĐƯỢC mới được đem trừ** (GMV, items, orders, SKU orders, views, impressions, product impressions, product clicks, new followers, comments, shares, likes, duration). Mọi tỷ lệ (AOV, GPM, CTR, CTOR, *_rate) **tính lại lúc đọc** từ số đã trừ — hiệu của 2 tỷ lệ cộng dồn là số vô nghĩa. Vẫn lưu nguyên cả 35 cột vào `raw` làm bằng chứng + để kiểm chứng công thức.
- **Mốc chia ranh giới là GIỜ KẾT THÚC CA (`boundary_at`), không phải giờ bấm up.** Lấy giờ up sẽ sai ngay khi up bù/up lại ca cũ: mốc nhảy ra sau ca kế tiếp rồi trừ nhầm số ca sau thành âm. Ca vắt qua nửa đêm phải cộng sang ngày hôm sau (`session_boundary_at()`).
- **Room thuộc ca khi khung thời gian GIAO NHAU cả 2 đầu**: bắt đầu trước khi ca kết thúc VÀ kết thúc sau khi ca bắt đầu. Thiếu vế đầu trên (lỗi đã sửa ở 0079) thì up bù 1 ca cũ sẽ hút hết phiên của mọi ngày sau đó vào ca đó.
- Up lại cho cùng 1 ca là **thay thế** snapshot (unique index theo `session_id`), không cộng dồn. `previous_values` giữ nguyên trạng trước lần up ĐẦU TIÊN để xoá là khôi phục đúng gốc.
- Mọi thay đổi snapshot đều **tự tính lại các ca sau đó dùng chung room** trong cùng transaction.
- Công thức tỷ lệ đã đối chiếu khớp tuyệt đối với cột TikTok tự ghi trên 89 phiên thật: `LIVE CTR` = click sản phẩm/lượt xem (KHÔNG phải lượt xem/hiển thị — cái đó là `Tap through rate`), `SKU order rate` = đơn SKU/lượt xem, `CTR` = click/hiển thị sản phẩm, `CTOR` = đơn/click, `Show GPM` = GMV/1000 hiển thị. Thời lượng phải tính từ hiệu mốc giờ, **không** dùng cột `Duration` (làm tròn xuống phút). `Follow rate`/`Like rate` của TikTok chia cho mẫu số KHÔNG có trong file (phiên mẫu 489 trong khi Views = 456) nên cố tình tính trên lượt xem và sẽ lệch — đừng "sửa" cho khớp.

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

**Lộ trình tầng dữ liệu gốc mới (chốt 2026-09-17, làm tuần tự từng giai đoạn, verify xong mới sang giai đoạn sau):**

1. ~~Nạp snapshot theo ca~~ — **xong 2026-09-17**, đã verify end-to-end trên Supabase thật (ca nối chia đúng ranh giới, up nhầm xoá khôi phục đúng, phiên ngày khác không lọt vào, 10/10 công thức khớp cột TikTok trên 89 phiên thật). Xem mục "Tầng dữ liệu gốc mới" ở trên.
2. ~~Module đối soát cho Operation~~ — **xong 2026-09-17**, verify end-to-end trên Supabase thật. Tab "Đối Soát Số Liệu" ([LiveReconciliation.tsx](src/components/LiveReconciliation.tsx)) đặt trong nhóm Vận Hành Live cạnh Live Sessions, **không** nhét trong tab TikTok API như luồng đối soát cũ (điểm nghẽn #2 của audit). Migration 0080: `live_reconciliation_batches`/`live_reconciliation_rows`, RPC `import_live_reconciliation` / `set_reconciliation_bucket` / `apply_live_reconciliation`.

   **Quy tắc phân bổ số về trễ** (đã verify bằng số thật): rổ `agency` giữ NGUYÊN tỷ lệ đóng góp mà snapshot lúc giao ca ghi nhận rồi scale lên số cuối — ranh giới ca nối từ giai đoạn 1 chính là thứ làm được việc này. Rổ `review` (chuỗi ca nối có ca quên up snapshot) KHÔNG được dùng tỷ lệ snapshot vì tỷ lệ đó thiếu, sẽ dồn hết vào ca có snapshot và bỏ đói ca kia — buộc chia theo số giây khung ca giao với khung phiên. Rổ `unassigned`/`inhouse` không đụng số liệu ca nào.

   Ca inhouse dùng CHUNG creator account với agency nên chỉ phân biệt được bằng khớp khung giờ ca đã chốt: phiên không khớp ca nào mặc định vào rổ `unassigned`, ops bấm 1 nút gán cả rổ thành `inhouse`.
3. ~~Tầng hiệu suất đọc ra~~ — **xong 2026-09-17**. Tab "Hiệu Suất Host" ([HostPerformance.tsx](src/components/HostPerformance.tsx)) + module thuần [hostPerformance.ts](src/lib/performance/hostPerformance.ts). **Không cần migration** — tổng hợp phía client từ `sessions` đã nạp sẵn trong state, đúng pattern có sẵn của app.

   Quy ước của tầng này: thước đo phân bổ ca là **GMV/giờ** (không phải GMV/ca — GMV/ca thiên vị host được xếp ca dài). Giờ lấy `liveDurationMinutes` (giờ live thật) khi có, rơi về giờ kế hoạch khi chưa có snapshot. Ca `Cancelled`/`Upcoming` và ca không có số đều bị loại. Gom nhóm host bằng `hostKey()` = `hostId` rồi rơi về **tên** — `host_id` có thể null (talent bị xoá, ca tạo tay) trong khi `host_name` denormalized vẫn còn, gom thẳng theo id sẽ trộn nhiều host thành một dòng. Màn hình luôn hiện tỷ lệ nguồn dữ liệu (đã đối soát / lúc giao ca / tự khai tay) để ops biết mức tin cậy trước khi ra quyết định.

4. **Lớp cam kết hợp đồng (chưa làm)** — brand cam kết bao nhiêu giờ/tháng với agency. Bảng độc lập, chưa có gì trong hệ thống, không phụ thuộc giai đoạn nào ở trên. Nên bắt đầu ghi nhận càng sớm càng tốt: dữ liệu hiệu suất thì đã có sẵn lịch sử, còn cam kết hợp đồng mà tới lúc cần mới bắt đầu nhập thì phải chờ thêm vài tháng mới đủ để so sánh run-rate với cam kết.

> **Cảnh báo cho session sau — KHÔNG "sửa" quyền của bảng `talents`.** Query thẳng `talents` từ client trả `permission denied for table talents`; đây **không phải lỗi** mà là biện pháp bảo vệ có chủ đích của migration 0047 (`revoke select on talents from authenticated`): rate/lương talent phải được che, nên mọi lượt đọc đi qua view `talents_secure` — view mask cột nhạy cảm trừ khi người đọc là ceo/admin hoặc chính talent đó (0048 giải thích chi tiết vì sao view phải ở chế độ definer). Cấp lại `grant select on talents` sẽ hở toàn bộ rate cho mọi user đăng nhập. **Mọi code mới cần đọc talent phải dùng `talents_secure`.** Rà ngày 2026-09-17: trong 38 bảng app dùng, đây là bảng DUY NHẤT client không đọc trực tiếp được, và đúng như thiết kế.

**Module tiếp theo (chưa audit):** (2) Điều hướng/UI tổng thể toàn app, (3) Báo cáo/số liệu (Report Tháng, P&L) — riêng phần "Dashboard" của mục (3) không còn áp dụng, đã xử lý ở trên. Audit xong module nào thì cập nhật đúng mục này, không tạo file riêng.
