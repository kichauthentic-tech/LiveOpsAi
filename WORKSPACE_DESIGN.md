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

- Migration mới nhất: **0087** (`0087_talent_role_assistant_nickname.sql` — đã chạy trên Supabase thật 2026-09-19, verify: 35 talent/13 Assistant/nickname đủ; enum `talent_role` thêm `Assistant`, cột `talents.nickname`, view `talents_secure` thêm cột cuối `nickname`. Test cục bộ 2026-09-19). Trước đó 0086 (`0086_backfill_sessions_from_rooms.sql` — đã chạy trên Supabase thật 2026-09-19 và verify end-to-end trên app: up file CROCS tháng 6 → sinh 62 ca → tách room 15h ngày 06/06 tại 15:00 → Report Tháng 06 CROCS ra 4,56 tỷ, Finance tháng 6 = 0 phiên; xem mục "Nạp bù ca từ file"). 0085 đã chạy trên Supabase thật 2026-09-18 — 3 bảng cũ trả `PGRST205`, RPC cũ `PGRST202`, bảng đối soát mới và `live_sessions` vẫn đọc bình thường; 0083: bảng `notifications` select được, RPC `mark_notifications_read` trả 0, insert thẳng bị RLS chặn `42501`; 0082 verify bằng gọi RPC thẳng từ app: `can_edit_session_snapshot` tồn tại, `recompute_session_from_snapshot` trả `42501 permission denied` kể cả với admin). Quy trình chạy: user tự dán vào Supabase SQL Editor (không có `DATABASE_URL`/Supabase CLI cấu hình trong máy dev).
- **Chạy thử cả chuỗi migration trước khi giao cho user**: có sẵn cách dựng 1 Postgres 18 cô lập trên máy + schema `auth` giả (`auth.users`, `auth.uid()` đọc từ GUC `test.uid` để giả lập "ai đang đăng nhập"), rồi `psql -f` lần lượt 0001→mới nhất. Hai cái bẫy của cách này: (a) `initdb --locale=C` và phải có `LANG=C LC_ALL=C` trong môi trường `pg_ctl`, kèm `-c unix_socket_directories=` cho đường dẫn socket khỏi quá dài; (b) nếu `drop schema public` rồi `create schema public` bằng tay thì **mất grant mặc định** — thiếu `grant usage on schema public to authenticated` là mọi lời gọi hàm báo `function ... does not exist` (không phải `permission denied`), rất dễ đuổi nhầm hướng.
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
- **Mọi RPC `security definer` PHẢI tự guard quyền trong thân hàm.** Ba lý do cộng lại, thiếu một cái là hiểu sai vấn đề: (1) hàm definer chạy dưới quyền owner, mà owner **bỏ qua RLS** — policy trên bảng không chặn được đường RPC (repo này không bảng nào bật `force row level security`); (2) Postgres **mặc định cấp execute cho `PUBLIC`** trên mọi function mới, nên dòng `grant execute ... to authenticated` chỉ là trang trí, muốn đóng thật phải `revoke ... from public`; (3) guard chỉ đặt được trong thân hàm khi điều kiện phụ thuộc tham số (vd "người này có phải Host của đúng ca `p_session_id` không"). Migration 0082 vá 7 hàm của tầng snapshot/đối soát vốn đang thiếu guard hoàn toàn.
- **Guard bằng `current_user_role()` phải bọc `coalesce(...::text, '')`.** Hàm trả NULL khi người gọi không có dòng `profiles`; `NULL not in ('ceo', ...)` ra **NULL** chứ không ra true, và `if NULL then raise` thì không chạy — guard im lặng cho qua đúng trường hợp đáng chặn nhất. Viết `if coalesce(current_user_role()::text, '') not in (...)`.
- **`date_trunc('month', <cột kiểu date>)` KHÔNG dùng được trong index expression** nếu không ép kiểu: trong họ kiểu ngày giờ thì `timestamptz` là kiểu ưu tiên nên Postgres chọn bản `date_trunc(text, timestamptz)` — STABLE, và index bắt buộc IMMUTABLE ⇒ `ERROR: functions in index expression must be marked IMMUTABLE`. Ép `period_start::timestamp` (đã sửa trong 0077).
- **Handler ở `App.tsx` bọc try/catch + `window.alert` không tái sử dụng được cho form cần hiện lỗi tại chỗ** — handler đó trả `void` và đã nuốt lỗi.
- **`isTabAllowed`**: "không tìm thấy nav item" phải coi là KHÔNG được phép (không phải mặc định cho qua) — tab ẩn khỏi sidebar vẫn có thể mở lại qua `activeTab` cũ trong localStorage nếu không chặn đúng.
- **State UI mang ý nghĩa phân quyền** (`activeTab`, `workspace`) phải reset khi đổi user — localStorage không tách theo user trên máy dùng chung. Cơ chế: lưu `uiStateOwner` = id user, khác chủ thì reset.
- **Không sửa RLS policy bằng vòng lặp quét `pg_tables`/`information_schema`** — luôn liệt kê bảng tường minh trong migration, tránh lỡ tay đụng bảng không liên quan.
- **`@types/react`/`@types/react-dom` phải luôn có trong devDependencies — đừng gỡ.** Trước 2026-09-17 repo không cài chúng dù React nằm trong `dependencies`, nên mọi JSX trong `.tsx` rơi về `any`: bước "Typecheck" của CI (`tsc --noEmit`) kiểm tra logic TS thuần nhưng **không kiểm props, kiểu component hay kiểu hook** — thử truyền một prop bịa hoàn toàn vào `App.tsx` vẫn ra exit 0. Đó là lý do prop `sessions` truyền cho `MyTalentProfile` sống sót nhiều lần CI xanh dù component không khai prop đó (màn Hồ Sơ Của Tôi vẫn đọc cột cũ), và 2 prop chết `onSubmitSessionReport` truyền cho `LiveCalendar`/`BrandCalendar` tồn tại từ đầu mà không ai biết. Cài xong chỉ lòi ra đúng 2 lỗi (đã xoá).
- **`"strict": true` đã bật (2026-09-17)** — gồm cả `strictNullChecks`/`strictFunctionTypes`/`noImplicitAny`. Chỉ có 10 lỗi phải sửa, không phải hàng trăm như lo ban đầu. **Đừng tắt lại.** Hai bẫy đã gặp, code mới nên tránh lặp: (1) viết KIỂU bằng `typeof x.y` khi `x` có thể null vẫn lỗi dù thân hàm đã guard `x?.y` — dùng `NonNullable<typeof x>["y"]`; (2) formatter của `<Tooltip>` recharts nhận `ValueType | undefined` (string | number | mảng) chứ không phải `number` — đi qua `chartNum()` trong `MonthlyReportTabs.tsx`, đừng khai `(v: number)` rồi ép kiểu.
- **Lỗi từ supabase-js KHÔNG phải `instanceof Error`** — `PostgrestError` là object thường `{message, details, hint, code}`, nên `e instanceof Error ? e.message : String(e)` rơi vào `String()` và hiện đúng chữ `[object Object]` trên màn hình, nuốt mất thông tin chẩn đoán duy nhất. Mọi chỗ bắt lỗi của tầng dữ liệu phải đi qua `errorMessage()` ([src/lib/errorMessage.ts](src/lib/errorMessage.ts)).
- **`brand_dataraw_imports` chỉ được 1 batch/`brand_id`+`report_type`+tháng của `period_start`** (unique index `idx_brand_dataraw_imports_brand_type_month`, migration 0077 — khớp `monthKey()`/`findExistingImportForMonth()` trong `lib/db/brandDataRaw.ts`). **Lịch sử đáng nhớ:** bản 0077 commit 2026-09-17 viết câu tạo index không ép kiểu nên không chạy được (xem quy ước `date_trunc` ở trên); chạy lại bản đã sửa trên Supabase thật ngày 2026-09-18 trả về `CREATE INDEX` — tức là **từ 2026-09-08 tới 2026-09-18 index này chưa từng tồn tại**, chống-trùng-batch Dataraw chỉ có ở tầng app suốt thời gian đó. Từ giờ mới có hàng rào DB thật.

## Rà soát UX/workflow theo module (bắt đầu 2026-09-13)

Mục tiêu: app hiện đúng chức năng nhưng chưa tiện lợi cho vận hành thật — rà từng cụm module (theo nhóm nav), audit hiện trạng bằng đọc code thật, tìm điểm nghẽn, rồi sửa dần. Không đợi tái cấu trúc data ở trên xong mới làm — 2 việc độc lập.

**Module 1 — Vận Hành Live (đăng ký ca → chốt lịch → report ca → đối soát): đã audit và fix xong cả 4 điểm nghẽn (2026-09-17 → 18).**

Luồng thật: talent bấm "Tôi rảnh ca này" ([ShiftScheduling.tsx](src/components/ShiftScheduling.tsx)) → ops chọn Host/Co-host, bấm "Chốt Lịch" (`handleFinalizeShiftSlot`, `src/App.tsx:1256-1316`) → talent nhập [SessionReportForm.tsx](src/components/SessionReportForm.tsx) tay 100% → ops đối soát ở [TikTokLiveReconciliation.tsx](src/components/TikTokLiveReconciliation.tsx) (nhúng trong tab "TikTok API").

Điểm nghẽn tìm thấy (chưa fix):
1. ~~Không có notification nào xuyên suốt cả 3 bước~~ — **đã fix 2026-09-18**, xem mục 8 lộ trình bên dưới.
2. ~~Đối soát bị tách khỏi ngữ cảnh~~ — **đã fix 2026-09-17** bởi mục 2 lộ trình (tab "Đối Soát Số Liệu" nằm trong nhóm Vận Hành Live).
3. ~~Chốt lịch xử lý từng ca một, không có thao tác hàng loạt~~ — **đã fix 2026-09-18**, xem mục 6 lộ trình bên dưới.
4. ~~Report ca nhập tay 100%, không prefill từ Dataraw~~ — **đã fix 2026-09-18** theo hướng khác đề xuất ban đầu (khoá thay vì prefill từ Dataraw — tầng snapshot đã thay vai trò nguồn), xem mục 9 lộ trình bên dưới.

**Cả 4 điểm nghẽn đã fix (2026-09-17 → 2026-09-18).** Module 1 coi là xong vòng audit này.

**Module Dashboard (Agency + Brand) — đã xoá hẳn ngày 2026-09-13.** Lý do: mọi số liệu KPI trên dashboard (GMV forecast, KPI comparison, deviation alerts, GMV calendar, "Hiệu Suất Xem & Chuyển Đổi"...) tính live từ cấu trúc dữ liệu phiên live hiện tại — cấu trúc này chưa chốt (xem mục "Đề xuất tái cấu trúc data 3-grain" ở trên, đang tạm dừng) nên số hiển thị chưa đáng tin. Quyết định: xoá dứt điểm thay vì giữ hiển thị số sai, sẽ custom/build lại module này sau khi cấu trúc data raw hoàn thiện.

Đã xoá: `src/components/Dashboards.tsx`, `src/components/brand-workspace/BrandDashboard.tsx`, `src/components/brand-workspace/BrandAudienceAnalytics.tsx`, cùng các widget chỉ phục vụ riêng 2 file trên (`KpiComparison.tsx`, `GmvGrowthTrendline.tsx`, `PerformanceDeviationAlerts.tsx`, `GmvCalendar.tsx`, `src/lib/gmvMetrics.ts`) và 1 file mồ côi có sẵn từ trước liên quan (`PerformanceMetricsWidget.tsx`). Xoá kèm nav item "Tổng Quan"/"Dashboard" (agency) và "Dashboard"/"Hiệu Suất Xem & Chuyển Đổi" (brand) trong `src/App.tsx`. Tab mặc định sau khi đăng nhập đổi từ "dashboard"/"brand_dashboard" (không còn tồn tại) sang `getDefaultTabForRole()` (`src/App.tsx`) — agency về "Live Sessions", brand về "Lịch Vận Hành", **talent về "Đăng Ký & Chốt Lịch"** (sửa 2026-09-18: trước đó talent cũng về "Live Sessions" — tab gate `manage_sessions` mà talent không có — nên vừa đăng nhập đã đập vào màn Access Restricted; lộ ra khi verify chuông bằng tài khoản talent thật).

**Không đụng** (không phải dashboard, có workflow/ghi dữ liệu thật riêng): `BrandMonthlyReport.tsx`/`MonthlyReportTabs.tsx`/`BrandWeeklyReport.tsx` (report tháng/tuần, có publish workflow), `src/lib/pnl.ts`, `src/lib/metrics/*`, `src/lib/db/brandDataRaw.ts`.

**Lộ trình tầng dữ liệu gốc mới (chốt 2026-09-17, làm tuần tự từng giai đoạn, verify xong mới sang giai đoạn sau):**

1. ~~Nạp snapshot theo ca~~ — **xong 2026-09-17**, đã verify end-to-end trên Supabase thật (ca nối chia đúng ranh giới, up nhầm xoá khôi phục đúng, phiên ngày khác không lọt vào, 10/10 công thức khớp cột TikTok trên 89 phiên thật). Xem mục "Tầng dữ liệu gốc mới" ở trên.
2. ~~Module đối soát cho Operation~~ — **xong 2026-09-17**, verify end-to-end trên Supabase thật. Tab "Đối Soát Số Liệu" ([LiveReconciliation.tsx](src/components/LiveReconciliation.tsx)) đặt trong nhóm Vận Hành Live cạnh Live Sessions, **không** nhét trong tab TikTok API như luồng đối soát cũ (điểm nghẽn #2 của audit). Migration 0080: `live_reconciliation_batches`/`live_reconciliation_rows`, RPC `import_live_reconciliation` / `set_reconciliation_bucket` / `apply_live_reconciliation`.

   **Quy tắc phân bổ số về trễ** (đã verify bằng số thật): rổ `agency` giữ NGUYÊN tỷ lệ đóng góp mà snapshot lúc giao ca ghi nhận rồi scale lên số cuối — ranh giới ca nối từ giai đoạn 1 chính là thứ làm được việc này. Rổ `review` (chuỗi ca nối có ca quên up snapshot) KHÔNG được dùng tỷ lệ snapshot vì tỷ lệ đó thiếu, sẽ dồn hết vào ca có snapshot và bỏ đói ca kia — buộc chia theo số giây khung ca giao với khung phiên. Rổ `unassigned`/`inhouse` không đụng số liệu ca nào.

   Ca inhouse dùng CHUNG creator account với agency nên chỉ phân biệt được bằng khớp khung giờ ca đã chốt: phiên không khớp ca nào mặc định vào rổ `unassigned`, ops bấm 1 nút gán cả rổ thành `inhouse`.
3. ~~Tầng hiệu suất đọc ra~~ — **xong 2026-09-17**. Tab "Hiệu Suất Host" ([HostPerformance.tsx](src/components/HostPerformance.tsx)) + module thuần [hostPerformance.ts](src/lib/performance/hostPerformance.ts). **Không cần migration** — tổng hợp phía client từ `sessions` đã nạp sẵn trong state, đúng pattern có sẵn của app.

   Quy ước của tầng này: thước đo phân bổ ca là **GMV/giờ** (không phải GMV/ca — GMV/ca thiên vị host được xếp ca dài). Giờ lấy `liveDurationMinutes` (giờ live thật) khi có, rơi về giờ kế hoạch khi chưa có snapshot. Ca `Cancelled`/`Upcoming` và ca không có số đều bị loại. Gom nhóm host bằng `hostKey()` = `hostId` rồi rơi về **tên** — `host_id` có thể null (talent bị xoá, ca tạo tay) trong khi `host_name` denormalized vẫn còn, gom thẳng theo id sẽ trộn nhiều host thành một dòng. Màn hình luôn hiện tỷ lệ nguồn dữ liệu (đã đối soát / lúc giao ca / tự khai tay) để ops biết mức tin cậy trước khi ra quyết định.

4. ~~Lớp cam kết hợp đồng~~ — **xong 2026-09-17**, verify end-to-end trên Supabase thật. Tab "Cam Kết Hợp Đồng" ([BrandCommitment.tsx](src/components/BrandCommitment.tsx)) đặt trong nhóm **Kinh Doanh** cạnh CRM (CRM đang giữ Rate Card = ĐƠN GIÁ mỗi giờ, cam kết là KHỐI LƯỢNG giờ mỗi tháng — hai nửa của cùng một điều khoản thương mại). Migration 0081: `brand_contracts` + `brand_monthly_commitments`, RPC `generate_contract_commitments`. Logic thuần: [brandCommitment.ts](src/lib/performance/brandCommitment.ts).

   **Quy ước bắt buộc của tầng này:**

   - **Giờ tính vào cam kết là GIỜ CA THEO LỊCH (`sessionDurationHours`), KHÔNG phải giờ live thật.** Lý do: `computeSessionPnl` (`src/lib/pnl.ts`) tính doanh thu brand hourly = giờ ca theo lịch × rate. Cam kết và hoá đơn phải đếm cùng một loại giờ, nếu không con số theo dõi không bao giờ khớp con số xuất hoá đơn. Giờ live thật vẫn tính song song (`actualLiveHours`) nhưng CHỈ để cảnh báo, không bao giờ đem trừ vào cam kết. *(Ghi chú: comment ở `types.ts` mô tả `billingModel: "hourly"` là "giờ live thật" — sai, code mới đúng.)*
   - **Số đo chính là "còn thiếu bao nhiêu giờ phải xếp" = cam kết − (ca đã live + ca đang xếp)**, không phải dự phóng theo nhịp. Dự phóng chỉ nói "đang chậm", số kia nói thẳng phải làm gì. Đây là thứ nối tầng này về lại bài toán sắp lịch.
   - **Loại ca khác `hostPerformance.ts`**: ở đó ca không có số liệu bị loại (không nói lên hiệu suất); ở đây ca lên sóng mà GMV = 0 VẪN giao đủ giờ cho brand nên vẫn phải đếm. Chỉ ca `Cancelled` bị loại hoàn toàn.
   - **Unique (brand_id, period_month)** — 1 brand 1 tháng đúng 1 con số cam kết. Nới ràng buộc này là làm mọi phép so run-rate thành mơ hồ (chia cho dòng nào?).
   - **Cờ `is_override`**: ops sửa tay tháng nào thì `generate_contract_commitments` bỏ qua tháng đó. `upsertMonthlyCommitment()` luôn tự đóng dấu cờ này — đừng để component tự quyết, quên một lần là mất ngoại lệ đã nhập (tháng Tết/camp) mà lỗi chỉ lộ ra vào lần "sinh lại" rất lâu sau.
   - **Xoá hợp đồng KHÔNG xoá cam kết các tháng** (`on delete set null`): tháng đã qua thì con số đó là sự thật đã xảy ra, không được viết lại quá khứ. Dòng mồ côi vẫn hợp lệ, UI hiện "hợp đồng đã xoá".
   - `generate_contract_commitments` **không giành tháng của hợp đồng khác** (2 hợp đồng chồng khung) — trả về jsonb tóm tắt `{inserted, updated, skipped_override, skipped_other_contract}` để ops biết đã bỏ qua gì, thay vì im lặng.
   - Ngày "hôm nay" phải lấy qua `todayVn()` (Intl + `Asia/Ho_Chi_Minh`), **không** `toISOString()` — UTC lúc 0-7h sáng VN trả về ngày hôm trước, đầu tháng thì lệch cả THÁNG và làm sai toàn bộ run-rate.
   - RLS chỉ mở cho ceo/admin/operations (khớp `manage_crm_projects`, mặc định đúng 3 role này). **Role `brand` CHƯA được mở** — cột `note` là ghi chú nội bộ agency; muốn cho brand xem sau này thì thêm policy select riêng và tách `note` ra khỏi payload brand đọc được, đừng nới policy hiện tại.

5. ~~Đưa 2 tín hiệu vào thẳng màn xếp ca~~ — **xong 2026-09-17**, verify end-to-end trên Supabase thật. Giai đoạn 3 và 4 sinh ra số đúng nhưng nằm ở 2 tab tách rời màn [ShiftScheduling.tsx](src/components/ShiftScheduling.tsx), ops phải nhớ số rồi nhảy màn hình mới xếp được. Giai đoạn này nhúng cả hai vào đúng chỗ ra quyết định. **Không cần migration.**

   **Tín hiệu 1 — mở bao nhiêu ca (đầu màn hình):** banner cam kết hợp đồng của tháng đang xem. Con số chính là **"cần mở thêm bao nhiêu giờ"** = cam kết − đã live − đã chốt chưa live − **đang mở chờ chốt**. Vế cuối là điểm khác biệt bắt buộc so với màn run-rate: ca đã MỞ chưa chốt thì chưa sinh `LiveSession` nên `scheduledHours` không thấy nó; bỏ qua vế này thì con số bị thổi phồng và ops mở thừa ca. Hàm: `computeSchedulingGaps` / `openSlotHoursByBrand` ([brandCommitment.ts](src/lib/performance/brandCommitment.ts)). Brand chưa đặt cam kết không hiện — không có mẫu số thì không có gì để nói.

   **Tín hiệu 2 — chọn ai (ngay tại ô chọn Host):** [hostSuggestion.ts](src/lib/performance/hostSuggestion.ts) tính hiệu suất của đúng những người đã đăng ký ca đó, với đúng brand và đúng thứ của ca, trong **90 ngày gần nhất** (lấy cả đời thì phong độ nửa năm trước vẫn kéo trung bình).

   **Quy ước của tầng này:**

   - **Xếp hạng ưu tiên người ĐÃ từng live cho đúng brand đó**, kể cả khi người khác có GMV/giờ chung cao hơn. Đã verify bằng số thật: host có 100tr/h chung nhưng chưa live brand này bị xếp DƯỚI host 20tr/h đã live brand này 4 ca. Số chung không dự đoán được kết quả trên một brand chưa từng chạy.
   - **Nhãn phải nói rõ số đang hiện là của brand này hay số chung** (`headlineFor()` trả kèm `scope`). Ops tưởng số chung là số của brand rồi xếp nhầm là kiểu sai nguy hiểm nhất màn này gây ra được.
   - **Dưới 3 ca thì gắn cờ "ít dữ liệu, chỉ tham khảo"** nhưng VẪN hiện số — giấu số đi thì ops không có gì để cân nhắc, còn hiện số trần thì ops tin quá mức vào trung bình của 1-2 phiên.
   - **Ô Trợ live cố ý KHÔNG hiện GMV/giờ** — số đó là hiệu suất khi làm HOST, gắn vào vai trợ live sẽ khiến ops xếp người theo con số không nói gì về vai trò họ sắp làm.
   - `hostSuggestion.ts` **import lại** `isCountable`/`sessionHours`/`weekdayOf` từ `hostPerformance.ts` chứ không chép — hai màn hình không bao giờ được nói hai con số khác nhau về cùng một host.
   - Bấm 1 dòng xếp hạng = chọn luôn làm Host; nếu người đó đang là Trợ live thì ô Trợ live tự xoá (không ai vừa là host vừa là trợ live).
   - `ShiftScheduling` tự nạp `brand_monthly_commitments` (không truyền từ `App.tsx`) và **không chặn màn hình khi lỗi/thiếu quyền** — banner ẩn đi, việc xếp ca vẫn chạy. RLS của bảng đúng bằng `isAdminRole()` nên talent gọi cũng chỉ ra mảng rỗng.

6. ~~Chốt lịch hàng loạt~~ — **xong 2026-09-18** (điểm nghẽn #3 của audit module Vận Hành Live), verify end-to-end trên Supabase thật. [BulkFinalizePanel.tsx](src/components/BulkFinalizePanel.tsx) + logic thuần [bulkFinalize.ts](src/lib/performance/bulkFinalize.ts). **Không cần migration.**

   **Cái bẫy bắt buộc phải biết trước khi sửa file này:** `checkConflicts()` trong `ShiftScheduling` chỉ đối chiếu với `sessions` ĐÃ TỒN TẠI. Trong một mẻ chốt hàng loạt thì chưa ca nào trong mẻ được tạo, nên nếu tự gán host giỏi nhất cho 5 ca trùng giờ thì cả 5 đều "không trùng" khi xét riêng lẻ — chốt xong mới lòi ra một người bị xếp 5 ca cùng lúc. `planBulkFinalize` vì thế giữ **sổ riêng cho những gì mẻ này đã gán** (`BatchLedger`) và xét trùng trên cả hai nguồn. Đã verify bằng số thật: 3 ca cùng 10:00–14:00 cùng ngày, cả 3 người đăng ký cả 3 ca ⇒ ra 3 host khác nhau; ca 19:00 không trùng thì host giỏi nhất được dùng lại.

   **Quy ước của tầng này:**

   - **Planner chỉ ĐỀ XUẤT, không bao giờ tự chốt ngầm.** Mọi dòng hiện ra cho ops sửa/bỏ tick trước khi bấm. Dòng vướng trùng lịch hoặc không gán được ai thì **không tự tick**.
   - **Xếp tham lam theo thứ tự thời gian**, không tối ưu toàn cục — ops sửa tay được, và thuật toán "tối ưu" mà ops không đoán được nó nghĩ gì thì tệ hơn là tốt.
   - **Mọi sửa tay đều quét lại CẢ MẺ** (`recheckPlan`), không sửa cục bộ: đổi 1 dòng có thể giải phóng hoặc gây trùng ở dòng bất kỳ khác. Đã verify: đổi host dòng 2 trùng dòng 1 thì **cả hai** dòng bị gắn cờ, bỏ tick 1 dòng thì dòng kia hết cờ.
   - **Chỉ dòng ĐANG TICK mới tính vào trùng-trong-mẻ** — dòng đã bỏ tick không được chốt nên không chiếm chỗ của ai.
   - **Kế hoạch lập MỘT LẦN lúc mở panel**, không tính lại theo `sessions` đang đổi: mỗi ca chốt xong là `App` nạp lại sessions, tính lại giữa chừng sẽ xoá sạch phần ops vừa sửa tay.
   - **Chạy tuần tự, không `Promise.all`** — mỗi lần chốt ghi DB rồi `App` nạp lại state; bắn song song sẽ đua nhau và ops không biết ca nào hỏng. Hỏng một phần thì liệt kê đúng ca hỏng, ca đó vẫn để mở.

7. **Vá lỗ phân quyền 7 RPC `security definer`** — migration `0082_rpc_role_guards.sql`, **đã chạy trên Supabase thật 2026-09-18**. Đây không phải tính năng mới mà là lỗ hổng phát hiện khi chuẩn bị làm mục notification.

   **Lỗ hổng:** `apply_session_live_snapshot`, `delete_session_live_snapshot`, `recompute_session_from_snapshot` (0078), `import_live_reconciliation`, `set_reconciliation_bucket`, `apply_live_reconciliation` (0080) và `generate_contract_commitments` (0081) đều là `security definer` nhưng **không hàm nào kiểm tra quyền người gọi**. Hàm definer chạy dưới quyền owner nên bỏ qua RLS — policy "chỉ ceo/admin/operations" trên các bảng đối soát chỉ chặn đường PostgREST đọc/ghi thẳng, gọi RPC là đi vòng qua hết. Hệ quả: bất kỳ tài khoản talent/brand nào (thậm chí chưa có `profiles`) cũng gọi được `import_live_reconciliation` + `apply_live_reconciliation` với số bịa và **ghi đè `actual_gmv`/`total_orders`/`live_duration_minutes` của bất kỳ ca nào** — đúng những con số P&L và lương talent đọc vào. Ẩn tab ở UI không chặn được gì.

   **Cách vá và vì sao vá kiểu đó:** guard đặt trong THÂN hàm. Với 3 RPC đối soát + sinh cam kết là admin-only. Với 2 RPC snapshot thì **không siết được về admin-only** — trợ live (role `talent`) chính là người up file lúc giao ca — nên dùng `can_edit_session_snapshot(p_session_id)`: admin, hoặc `current_user_talent_id()` đúng là Host/Trợ live của **đúng ca đó**, khớp nguyên điều kiện UI đang dùng ở `ShiftScheduling.tsx:1006`. `recompute_session_from_snapshot` không có call site client nào nên `revoke execute ... from public` luôn.

   **Thân 5 hàm được trích NGUYÊN VĂN từ migration gốc bằng script rồi diff lại từng dòng**, chỉ chèn thêm khối guard — chép tay 90 dòng SQL của `apply_live_reconciliation` là cách chắc chắn nhất để làm lệch logic mà không ai phát hiện.

   **Verify:** dựng Postgres 18 cô lập, chạy sạch cả chuỗi 0001→0082, rồi test 13 lời gọi dưới 4 danh tính (talent ngoài ca / không có profile / Host của chính ca đó / ops). Talent ngoài ca bị chặn 7/7; người không profile bị chặn (đây là case bắt được bẫy NULL); Host của ca up + xoá snapshot được nhưng vẫn bị chặn đối soát; ops qua hết.

   *Test bắt được 2 lỗi trong chính bản vá trước khi nó rời máy: (1) bẫy NULL của `current_user_role()` ở trên; (2) `revoke execute from authenticated` không có tác dụng vì Postgres mặc định cấp execute cho `PUBLIC`. Cả 2 đều "trông đúng" khi đọc code.*

8. **Lớp notification trong app** — điểm nghẽn #1 của audit, migration `0083_notifications.sql` (đã chạy trên Supabase thật 2026-09-18). Bảng `notifications` + RPC `mark_notifications_read` + trigger `trg_notify_session_changes` trên `live_sessions`. Client: [notifications.ts](src/lib/db/notifications.ts), [useNotifications.tsx](src/hooks/useNotifications.tsx), [NotificationBell.tsx](src/components/NotificationBell.tsx) nhúng trong Header.

   **Quyết định chính — sinh thông báo bằng TRIGGER, không gọi từ client.** Đường ghi vào `live_sessions` có nhiều hơn một: chốt từng ca, chốt hàng loạt, thay người khẩn cấp, kéo đổi giờ trên lịch, huỷ ca, đối soát ghi đè số. Client tự gọi "gửi thông báo" thì mỗi đường mới là một chỗ có thể quên — bulk finalize (mục 6) là ví dụ: nó tạo N session qua đúng hàm cũ mà không đụng gì UI chốt từng ca. Trigger nhìn thấy mọi đường, kể cả đường chưa viết. **Vì vậy `notifications.ts` cố ý KHÔNG có hàm tạo thông báo** — thêm vào là mở lại đúng cái bẫy trigger sinh ra để đóng.

   5 loại: `shift_assigned` / `shift_unassigned` / `shift_time_changed` / `shift_cancelled` / `report_reconciled`. Quy ước:

   - **Người nhận là talent qua `profiles.assigned_talent_id`** (1 talent có thể gắn nhiều tài khoản → gửi hết; talent không tài khoản → im lặng). **Bỏ qua chính người thao tác** (`auth.uid()`) — ops tự xếp mình vào ca thì không tự báo mình.
   - **Chỉ báo ca CHƯA diễn ra** (`date >= hôm nay VN`) cho 4 loại lịch — sửa host ca tháng trước để dọn số không phải "lịch mới" của ai cả. `report_reconciled` thì ngược lại, luôn là ca quá khứ.
   - **`report_reconciled` chỉ khi số CŨ là `data_source='manual'`** (talent tự khai) và lệch **≥ 5%** — số từ snapshot không phải "báo cáo của họ"; dưới 5% là sai làm tròn, báo đi chỉ dạy talent bỏ qua chuông.
   - **Thông báo là BẢN GHI hệ thống đã nói gì với ai** — RLS chỉ mở `select` của chính chủ, không insert/update/delete cho client; đánh dấu đọc đi qua RPC (RLS chặn theo dòng, mở "update dòng của mình" là mở luôn title/body).
   - Client **poll 45s + nạp lại khi focus**, không Realtime — app chưa bật Realtime cho bảng nào và chuông trễ 45s là đủ với nghiệp vụ xếp ca theo ngày. Lỗi fetch (kể cả chưa chạy migration) bị nuốt, chuông hiện trống, app không hỏng.
   - Bấm 1 thông báo → đánh dấu đọc + nhảy tab `shift_scheduling` (mọi loại đều về một ca của chính người nhận).
   - Đây là nền cho kênh Zalo OA đã chốt hướng (xem memory `liveops-zalo-notification-plan`): worker sau này chỉ đọc bảng này rồi gửi, không cần biết nghiệp vụ.

   **Verify:** 9 kịch bản trên Postgres 18 cô lập với cả chuỗi 0001→0083: chốt (2 tài khoản của cùng talent đều nhận), thay người (người cũ nhận kèm tên người mới, người mới không tài khoản → im), đổi giờ (kèm giờ cũ), huỷ, ca quá khứ đổi host → 0 dòng, đối soát −20% → có, lệch 2% → 0 dòng, ops tự xếp mình → không tự báo, RLS + RPC chỉ đụng dòng của mình, update/delete thẳng bị `permission denied`. **Verify trọn vòng trên Supabase thật 2026-09-18** bằng tài khoản talent test (xem memory `liveops_test_login`): admin chốt ca → thay người → xếp lại → đổi giờ → huỷ (đi qua đúng `createSession`/`updateSession` mà UI gọi) ⇒ talent đăng nhập thấy chuông **5** với đúng 5 dòng đúng nội dung; admin (người thao tác) nhận 0. Bấm 1 dòng → nhảy "Đăng Ký & Chốt Lịch", badge còn 4; "Đánh dấu đã đọc hết" → badge tắt, DB 0 chưa đọc. Xoá session → notifications cascade sạch. Riêng `report_reconciled` chỉ verify trên Postgres cô lập (cần batch đối soát thật để đi qua `apply_live_reconciliation`).

9. **Report ca không hạ bậc số đã có nguồn tốt hơn** — điểm nghẽn #4, migration `0084_report_no_downgrade_snapshot.sql` (đã chạy trên Supabase thật 2026-09-18). UI: [SessionReportForm.tsx](src/components/SessionReportForm.tsx), [DataSourceBadge.tsx](src/components/common/DataSourceBadge.tsx).

   **Đề xuất ban đầu của #4 là prefill từ Dataraw — không làm theo.** Từ 0078, 5 cột đối soát của ca (`actual_gmv`/`total_orders`/`total_views`/`ctr_avg`/`avg_watch_time_seconds`) đã đến từ file Creator-Live-Performance up lúc giao ca, tức "gõ lần một" không còn cần thiết, không phải cần điền sẵn. Vấn đề còn lại nguy hiểm hơn: `submit_live_session_report` (0075) hễ thấy 5 cột đổi là reset `data_source` về `'manual'` — talent mở form sau khi trợ live đã up file, sửa GMV cho "tròn", là **số thật từ TikTok bị thay bằng số gõ tay mà không ai biết**. Đã tái hiện đúng lỗ này trên Supabase thật bằng tài khoản talent gọi RPC thẳng: `live_snapshot` 12.345.678đ → `manual` 10.000.000đ.

   **Quy ước của tầng này:**

   - **Ca có `data_source` ∈ {`live_snapshot`, `tiktok_reconciled`} thì form KHOÁ 5 ô số**, talent chỉ khai phần máy không biết (OT/off sớm/host trễ/restart/ghi chú/link). Submit vẫn gửi đủ 5 số nhưng là **số hiện tại của ca** ⇒ RPC thấy không đổi ⇒ giữ nguyên bậc (đúng cơ chế 0075).
   - **RPC từ chối talent gửi số khác lên ca đã có snapshot/đối soát** (guard trong thân hàm — UI khoá không phải hàng rào, xem quy ước 0082). ceo/admin/operations vẫn sửa được nhưng form bắt bật công tắc "Sửa tay 5 ô số (hạ bậc về Tạm Tính)" — hạ bậc phải là hành động có chủ đích, không phải tác dụng phụ.
   - **Prefill sidecar TikTok lần nhập đầu** từ snapshot: Impression đọc thẳng `impressions`, CTOR = đơn / click sản phẩm, AVG.price = GMV / đơn — cùng công thức `lib/liveSnapshot/metrics.ts`. Vẫn cho sửa vì là cột report, không phải cột đối soát.
   - **`DataSourceBadge` có bậc thứ 3 "Số Lúc Giao Ca"** — trước đó `live_snapshot` rơi chung vào "Tạm Tính", ops nhìn ca đã có file vẫn tưởng số gõ tay.
   - Check role trong RPC bọc `coalesce` (bẫy NULL của 0082) — bản 0075 chưa có.

   **Verify:** Postgres cô lập 5 kịch bản (talent chỉ thêm OT → giữ `live_snapshot`; talent đổi GMV → chặn; ops đổi GMV → qua, về `manual`; talent đổi GMV trên ca `manual` → qua như cũ; không profile → chặn). Supabase thật bằng tài khoản talent: form khoá đúng 5 ô, banner "Số Lúc Giao Ca", Impression/CTOR/AVG.price điền sẵn 55.000 / 7% / 293.945, chốt OT +30 ⇒ report lưu, ca vẫn `live_snapshot` 12.345.678đ. Tầng RPC trên Supabase thật sau khi chạy 0084, gọi RPC thẳng: talent đổi GMV → bị từ chối đúng thông báo; talent gửi đúng số + OT 45 → qua, vẫn `live_snapshot`; admin đổi GMV → qua, về `manual`. Dữ liệu ZZZ đã dọn sạch (4 brand thật, 158 slot nguyên vẹn).

> **Cảnh báo cho session sau — KHÔNG "sửa" quyền của bảng `talents`.** Query thẳng `talents` từ client trả `permission denied for table talents`; đây **không phải lỗi** mà là biện pháp bảo vệ có chủ đích của migration 0047 (`revoke select on talents from authenticated`): rate/lương talent phải được che, nên mọi lượt đọc đi qua view `talents_secure` — view mask cột nhạy cảm trừ khi người đọc là ceo/admin hoặc chính talent đó (0048 giải thích chi tiết vì sao view phải ở chế độ definer). Cấp lại `grant select on talents` sẽ hở toàn bộ rate cho mọi user đăng nhập. **Mọi code mới cần đọc talent phải dùng `talents_secure`.** Rà ngày 2026-09-17: trong 38 bảng app dùng, đây là bảng DUY NHẤT client không đọc trực tiếp được, và đúng như thiết kế.

**Module 3 — Báo cáo/số liệu (Report Tháng, Report Tuần, Finance & P&L): đã audit 2026-09-18, phần kỹ thuật đã fix, còn 4 câu nghiệp vụ chờ chốt.**

Lý do audit ngay sau Module 1: 4 phase vừa rồi đổi nguồn số của ca (snapshot → đối soát → khoá report), mà P&L và Report Tháng đọc `actual_gmv` không biết gì về `data_source`.

Đã fix (không cần migration):

- **Tab 02 Livestream của Report Tháng tự gom "Host Performance" bằng vòng lặp riêng** — giờ KẾ HOẠCH thay vì giờ live thật, đếm cả ca GMV = 0, gom theo tên, kèm cột CVR mà không luồng nào ghi (`cvr_avg` chỉ được chép qua lại, chưa từng có nguồn). Kết quả: brand đọc ra GMV/giờ KHÁC tab "Hiệu Suất Host" của agency về cùng một host. Giờ import thẳng `byHost`/`filterSessions`/`dataQuality` từ [hostPerformance.ts](src/lib/performance/hostPerformance.ts) — cùng quy ước đã đặt cho `hostSuggestion.ts`. Cột CVR bỏ.
- **2 panel Host bị giấu sau điều kiện "đã up file Creator-Live-Performance vào Dataraw tháng này"** dù chúng tính từ session nội bộ, không dính gì file đó — chưa up Dataraw là cả tab Livestream trống, kể cả phần vốn có số. Đã kéo ra ngoài điều kiện.
- **Cảnh báo "chưa đối soát" ở Report Tháng/Tuần gộp `live_snapshot` với `manual`** ("số talent tự nhập") — nói sai về phần lớn ca sau khi có tầng snapshot, ops sẽ học cách bỏ qua. Giờ tách 2 con số. Kèm sửa hướng dẫn cũ "TikTok API → Đối Soát Số Liệu TikTok" (tab đó đã bị thay bởi "Vận Hành Live → Đối Soát Số Liệu" từ mục 2 lộ trình).
- **Finance & P&L**: (a) trước là MỘT danh sách mọi ca Completed từ đầu tới giờ, tổng cộng dồn cả đời — thêm lọc tháng, mặc định tháng hiện tại VN; (b) mỗi dòng GMV giờ có `DataSourceBadge`, và một dòng tóm tắt "N đã đối soát / N số lúc giao ca / N tự khai" trên tổng — ký duyệt số tự khai và số đã đối soát là hai việc khác nhau, màn tiền phải nói rõ.

Verify trên Supabase thật với 3 ca ZZZ (manual/snapshot/reconciled): Finance hiện đúng 3 badge + dòng tóm tắt "1 đã đối soát, 1 số lúc giao ca, 1 talent tự khai"; Tab 02 Report Tháng hiện host với 4h (1h kế hoạch + 2×1.5h live thật), 1,5 triệu/giờ, CTR 2% — đúng quy tắc `hostPerformance.ts`; banner Report Tháng tách "1 phiên tự khai, 1 phiên có số lúc giao ca". Đã dọn sạch.

**Đã chốt với user 2026-09-18 (cả 4 câu):**

1. **Trợ live CÓ được trả công.** `computeSessionPnl` giờ tính `coHostPayout` theo rate card của **chính trợ live** (`talent_rate_history` tại ngày ca, rơi về `talents`), cùng công thức với host: giờ tính lương của ca × rate/giờ nếu có, không thì rate/phiên, cộng % GMV theo `commission_rate` của họ nếu có đặt. Không có override tay ở Finance cho trợ live. Ca có `co_host_id` nhưng hồ sơ talent đã xoá thì Finance hiện dòng đỏ "chưa tính công" chứ không im lặng ra 0. Unit test: 4h ca + OT 30p, host 200k/h + 2% GMV, trợ 300k/phiên, brand hourly 1tr/h ⇒ gross 4.000.000 (không cộng OT), host 1.100.000, trợ 300.000, net 2.600.000.
2. **OT là agency chịu** — hành vi hiện tại đúng, giữ nguyên, đã ghi comment ở `billableSessionHours` để không ai "sửa cho khớp".

3 + 4. **Target GMV phân bổ TỪ TRÊN XUỐNG theo kế hoạch tháng, ca huỷ không mang target** (user chốt 2026-09-18). Module thuần [targetAllocation.ts](src/lib/performance/targetAllocation.ts), nối vào App ở đúng MỘT chỗ: `sessions` = `applyAllocatedTargets(rawSessions, monthlyReports)` — mọi màn hình bên dưới (2 calendar, LiveSessionHub, Report Tháng) nhận `targetGmv` đã đúng mà không phải sửa gì. **Không cần migration.**

   **Mô hình** (đã có sẵn ở Tab 05 "Kế Hoạch Tháng Sau", chỉ chưa nối xuống từng ca): tháng X có 1 tổng target (dòng `brand_monthly_reports` tháng X−1: `plan_target_gmv` + `plan_pct_*` chia 4 khung Daily/D-Day/Mid-Month/Pay-Day; % gợi ý từ lịch sử Dataraw, ops sửa được). Target riêng từng camp của dòng tháng X (`camp_*_target_gmv`) nếu ops đã điền thì **thắng** % kế hoạch. Khung camp lấy override tháng X, fallback khung cố định `campaignDays.ts`. Target mỗi khung chia cho các ca **chưa huỷ** trong khung theo **giờ ca kế hoạch**.

   **Quy ước của tầng này:**

   - **Ca huỷ không mang target; target khung tự dồn sang ca còn lại trong khung** — ca bù agency xếp thêm tự gánh phần đó. **Khung không còn ca nào thì target khung dồn sang mọi ca còn lại của tháng** — tổng target tháng là cam kết với brand, không được bốc hơi.
   - **Lúc chốt lịch ghi `targetGmv = 0`**, không còn gán GMV trung bình của host (`computeRealAvgGmvPerSession` vẫn dùng ở Hồ Sơ Talent, chỉ bỏ ở finalize). Tháng/brand chưa có kế hoạch thì giữ số đang có trong DB (số cũ/ops gõ tay) — không xoá thứ chưa thay được, nhưng ca mới chốt sẽ là 0 = "chưa có target", không bịa.
   - `resolveCampBucketType`/`CampOverrides`/`CAMP_DAY_BUCKET_*` chuyển từ `dataraw/creatorLivePerfMetrics.ts` sang `campaignDays.ts` (re-export giữ import cũ) — module thuần phải chạy được trong unit test không có `import.meta.env`, kéo `supabaseClient` qua chuỗi import là hỏng.
   - App nạp lại `brand_monthly_reports` mỗi khi đổi tab (Tab 05 lưu kế hoạch không có callback lên App; bảng nhỏ).
   - Tổng "Target GMV (Lịch Vận Hành)" ở Tab 01 Report Tháng lọc `status !== 'Cancelled'` — khi có kế hoạch, tổng này = đúng tổng kế hoạch tháng.

   **Verify:** 16 unit test (chia theo giờ trong khung, ca huỷ = 0, khung trống dồn sang tháng, override camp thắng %, brand không kế hoạch giữ số cũ). Supabase thật: kế hoạch 1 tỷ (40/20/25/15) + 6 ca ZZZ tháng 09 ⇒ Lịch Vận Hành brand hiện đúng 133,3M / 266,7M (daily 2h/4h) / 200M (D-Day) / 250M (Mid) / 150M (Pay), ca huỷ không số; Report Tháng Tab 01 "Target GMV (Lịch Vận Hành)" = **1 tỷ đ**. Đã dọn.

**Module 2 — Điều hướng/UI tổng thể: đã audit 2026-09-18.** Cách audit: đọc `AGENCY_NAV_GROUPS`/`BRAND_NAV_GROUPS`/Header, rồi đăng nhập admin bấm qua 14 tab agency (0 lỗi console, không tab nào Access Denied), đăng nhập talent và brand-workspace xem landing.

Đã fix (không cần migration):

- **Landing của ceo/admin/operations đổi từ "Live Sessions" sang "Đăng Ký & Chốt Lịch"** (`getDefaultTabForRole`). Live Sessions Hub là màn chi tiết từng phiên thời demo (dropdown chọn phiên, chart theo phút, checklist) — mở app ra thấy một dropdown và trạng thái trống, không nói gì về việc hôm nay phải làm; vòng việc hằng ngày của ops (mở ca, chốt, cam kết còn thiếu, snapshot, report) nằm hết ở Đăng Ký & Chốt Lịch.
- **Workspace trỏ vào brand đã bị xoá** (state sống ở localStorage): Header hiện chữ "Brand" trống, sidebar là Brand Workspace rỗng, không có lối thoát ngoài mở switcher. `effectiveWorkspace` giờ về Agency khi brands đã nạp xong mà không có id đó (phải chờ `phase1Loading` xong, không thì lần mở đầu luôn văng về Agency). Kèm sửa Header nhận `effectiveWorkspace` thay vì `workspace` thô — trước đó nội dung đã về Agency mà nhãn switcher vẫn "Brand".
- **Bỏ badge LIVE/SMART/NEW/CUSTOM/ADMIN trên nav** (8 chỗ), bỏ `animate-pulse`. Chỉ giữ "DEMO" — đánh dấu module mock, thật sự cần biết trước khi bấm. "NEW" trên tab đã có nhiều tháng; badge nào cũng có thì không badge nào được đọc.
- **`<title>` vẫn là "My Google AI Studio App"** từ template, `lang="en"`, không favicon — tab trình duyệt của một hệ thống vận hành thật mang tên template. Đổi "LiveOps AI", `lang="vi"`, favicon SVG inline.
- `.claude/launch.json`: dev server chuyển sang cổng **3100** (`PORT=3100`) — máy dev có app khác (Next.js "YFB Live Agency OS") chiếm cổng 3000 qua IPv6, `localhost:3000` trỏ nhầm sang nó.

**4 đề xuất — user chốt và đã làm 2026-09-18:**

1. **Gỡ module đối soát cũ** (`TikTokLiveReconciliation.tsx` + `lib/db/tiktokReconciliation.ts` + tab "Đối Soát Số Liệu TikTok" trong TikTok API + 4 type `TikTokLiveImport*`/`LiveSessionReconciliation*`). Một lối vào duy nhất: "Vận Hành Live → Đối Soát Số Liệu" (0080). Phần parse Dataraw thuần (`mapDataRawToImportRows`/`vnParts`) mà Report Tuần vẫn cần được tách sang [liveAnalysisRows.ts](src/lib/dataraw/liveAnalysisRows.ts). Bảng `tiktok_live_imports`/`tiktok_live_import_rows`/`live_session_reconciliations` + RPC `apply_tiktok_reconciliation`/`_chain` + `reconciliation_thresholds()` **đã drop bằng migration 0085** (đã chạy trên Supabase thật 2026-09-18 — user chốt dọn luôn, lịch sử đối soát cũ mất theo). 3 cột `data_source`/`reconciled_at`/`tiktok_room_id` trên `live_sessions` (thêm ở 0050) giữ nguyên — tầng mới vẫn dùng.
2. **"Hội Đồng AI & Simulator" ẩn khỏi nav** tới khi có bản thật. Component `AiMultiAgent` + nhánh render vẫn còn; `isTabAllowed` chặn mở lại qua localStorage.
3. **Tiêu đề trang rút về đúng tên tab** (10 màn): "Hệ Thống Quản Lý Talent & Khớp Nối Host Thông Minh" → "Talent Pool", kicker "Modules 11 & 12: Finance, Unit Economics & HR" → tên nhóm nav "Tài Chính", bỏ "Module 14"/"Operational Data Graph Nexus"...
4. **Header/sidebar chỉ hiện chức danh** (`customRoleTitle || role`) — chức danh đã chứa role, in role phía trước là lặp "ADMIN • ... (ADMIN)".

Verify: admin bấm qua 13 tab (Hội Đồng AI đã ẩn) — tiêu đề khớp tên tab, kicker = tên nhóm nav, 0 lỗi console; TikTok API còn đúng 2 sub-tab.

**Vòng audit UX/workflow theo module (3 module) đã đi hết một lượt, kể cả đề xuất phát sinh.**

## Nạp bù ca từ file Creator-Live-Performance (2026-09-19, migration 0086)

**Vì sao:** app chạy thật từ 9/2026 nhưng brand đã live từ 4/2026; user muốn nạp bù lịch sử coi như số chính xác. File Creator-Live-Performance có đủ ngày/giờ/số liệu từng room — thứ duy nhất không có là host. Tạo tay 60 ca/tháng/brand rồi gán từng ca là không khả thi → sinh ca tự động, gán host theo mẫu.

**Chốt với user về file (quan trọng):** một loại file duy nhất `Creator-Live-Performance` từ TikTok Creator Center, bản tiếng Anh, **mỗi tháng 1 file** (bộ lọc ngày đúng 01→cuối tháng). File trải nhiều tháng sẽ làm tháng bị **đếm đôi** khi up thêm file tháng lẻ sau đó — kho Dataraw khoá 1 batch/tháng theo `period_start` nhưng Report đọc mọi batch có khoảng ngày chạm tháng. Đã kiểm parser với file thật CROCS 04→09/2026: 340 room, 35 cột, 0 lỗi; file 6 tháng đó đã tách sẵn thành 6 file tháng trong `~/Downloads/Creator-Live-Performance_CROCS_YYYY-MM.xlsx`. Report Tháng là module riêng với bộ file riêng (5 loại cũ) — không gộp.

**Cơ chế (Brand WS → Dữ Liệu Gốc → tab Creator Live Performance → panel "Nạp bù ca từ file"):**
1. *Sinh ca từ room* — RPC `create_backfill_sessions(brand, rows jsonb)`: 1 room → 1 ca `Completed`, `data_source='tiktok_reconciled'`, `is_backfill=true`, host trống, `tiktok_room_id` + `live_room_ids=[room]`, giờ VN từ `actual_start_at/actual_end_at`. Room đã thuộc ca nào (snapshot/đối soát/lần sinh trước) thì bỏ qua → chạy lại vô hại. **Parse file chỉ ở client** (`creatorLivePerfSlice.ts`), RPC nhận số đã chuẩn hoá — một parser cho mọi đường đi của file. Ca quá khứ nên trigger thông báo 0083 không bắn.
2. *Gán host hàng loạt* — lưới ngày × Ca 1..N (thứ tự theo giờ bắt đầu trong ngày) với "Điền theo thứ" (chọn thứ + cột + host/trợ, tuỳ chọn chỉ ô trống), "Sao chép tháng trước" (khớp theo thứ + cột, lấy người xuất hiện nhiều nhất), lưu qua RPC `bulk_assign_session_hosts(jsonb)` chỉ gửi ca có thay đổi.
3. *Tách room dài* — room ≥ 5h (host không tắt stream giữa 2 ca) có nút "tách": RPC `split_backfill_session(id, mốc)` chia số đếm theo tỷ lệ thời gian, phần 2 = tổng − phần 1, cả 2 giữ room id.

Code: [roomsToSessions.ts](src/lib/backfill/roomsToSessions.ts) (thuần, có test), [backfillSessions.ts](src/lib/db/backfillSessions.ts), [BackfillFromRooms.tsx](src/components/brand-workspace/BackfillFromRooms.tsx) nhúng trong `BrandDataRaw` (nhận thêm `sessions/talents/onSessionsChanged` từ App).

**Trạng thái dữ liệu thật (2026-09-19, sau khi dọn mock bằng `2026-09_clear_all_mock.sql`):** DB thật KHÔNG còn mock — 0 seed session/slot/plan, 0 đăng ký rảnh, talent mẫu đã xoá. Có: 34 hồ sơ talent thật (user xoá 1 dòng Kim Vân trùng; còn "Kim Vân" host + "Kim Vân (Trợ)"), ca backfill CROCS tháng 6/7/8/9 = 63/59/60/36 (tháng 9 tới 19/09 — up lại file cả tháng cuối tháng thì "Sinh ca" chỉ tạo room mới), host trống — user tự gán bằng lưới; 29 slot JOCKEY tháng 9 do ops tạo, tài khoản `kichauthentic@gmail.com` role talent chưa gắn hồ sơ. Tháng 4,5 CROCS và 3 brand còn lại: user tự up (file CROCS tách sẵn trong `~/Downloads`). Tuần chạy thử giờ chạy trên dữ liệu thật, không seed lại.

**Hồ sơ talent thật (2026-09-19):** user gửi danh sách 35 host/trợ → `supabase/seed/2026-09_talents_real.sql` (chạy sau 0087 và sau `2026-09_clear_all_mock.sql`). Quyết định kèm theo: **nhãn vai trò chỉ còn Host / Assistant** (KOC/KOL/MC bỏ khỏi UI, giữ trong enum), nhãn không chặn gì — ai cũng chọn được vào ô host lẫn ô trợ của từng ca. **`talents.nickname`** = tên ngắn hiện trên lịch/lưới (3 người trùng "Kim Vân"); helper [talentName.ts](src/lib/talentName.ts) (`talentShortName`: nickname → 2 từ cuối; `talentOptionLabel` cho dropdown), `buildSessionMeta(s, lookup)` nhận lookup talent để chip lịch dùng nickname, ma trận Đăng Ký & Chốt Lịch và lưới backfill cũng dùng. Rate/hoa hồng của 35 người còn = 0, ops bổ sung ở Talent Matcher. Hàng đợi: rate theo VỊ TRÍ (host ≠ trợ cho cùng người) — hiện 1 rate card/người dùng cho cả hai.

**Quy ước:**
- **Ca `is_backfill` không vào Finance & P&L** (rate card tháng cũ không chuẩn) — `FinanceHr` lọc cờ này. Có vào hiệu suất host, giờ live theo khung, lịch sử phân bổ target. Dùng cùng lưới cho tháng đang chạy khi trợ quên up lúc giao ca cũng được (room chưa khớp ca sẽ ra ca mới).
- **`fetchSessions()` phân trang 1000 dòng và chia lô `.in()` 50 ca** — PostgREST cắt 1000 dòng/request KHÔNG báo lỗi; trước 0086 chưa chạm ngưỡng, sau nạp bù 4 brand × 6 tháng là vượt. Bảng nào khác có nguy cơ > 1000 dòng phải làm tương tự.

## Giai đoạn hiện tại (từ 2026-09-18): CHẠY THỬ THẬT — không build thêm tính năng

User chốt: dừng build, cho một tuần vận hành thật đi qua app. Tới lúc chốt, `live_sessions` = 0 — mọi thứ đã build chỉ mới verify bằng dữ liệu dựng. Session mới đọc file này: **đừng đề xuất tính năng mới**; hỏi user chạy thử tới đâu, cái gì kêu, rồi sửa đúng chỗ đó.

Vòng chạy thử (đúng luồng app hiện có):
1. Tab 05 Report Tháng — lưu kế hoạch tháng 10 từng brand (không có thì ca tháng 10 "chưa có target").
2. Đăng Ký & Chốt Lịch — mở ca tuần tới; mỗi talent thật có tài khoản gắn `assigned_talent_id`; talent tự đăng ký trên điện thoại.
3. Chốt hàng loạt → talent thấy chuông.
4. Ca đầu tiên: trợ live up file Creator-Live-Performance lúc giao ca (kiểm parser với file thật).
5. Cuối tuần: Đối Soát Số Liệu với file thật → xem Finance & P&L.

**Seed cho tuần chạy thử** (user yêu cầu 2026-09-18, vì DB thật chưa có talent thật / kế hoạch tháng / ca đã xong): `supabase/seed/2026-09_trial_seed.sql` — rate card 4 talent mẫu về mức thật (C theo giờ), kế hoạch tháng JOCKEY & VERA (dòng T8 + T9), 11 ca VERA 20–30/09, 48 lượt đăng ký rảnh, 17 ca JOCKEY 01–17/09 đã xong kèm report tay (1 ca huỷ). Chạy trong SQL Editor; đã test trên Postgres cục bộ (85 migration + seed + rollback). Gỡ bằng `2026-09_trial_seed_rollback.sql`. Dấu nhận biết: title `[SEED] …`, notes/promotion_notes `SEED chạy thử`. Chưa chốt ca nào — bước 3 để ops tự bấm. Thư mục `supabase/seed/` KHÔNG phải migration, không bao giờ chạy tự động.

**Bàn thêm 2026-09-19 (chưa chốt làm, đã phân tích với user):** (a) Module tạo ca — quy tắc lặp hiện tại có lỗi thật (xoá mẫu rồi tạo lại → sinh ca trùng vì `template_id` on delete set null, không có unique brand+ngày+giờ) và UX rời rạc; đề xuất 3 giai đoạn P1 (vá + gom về Đăng Ký & Chốt Lịch + RPC sinh ca có dry-run so giờ cam kết) → P2 (khung lịch tuần theo brand, hiệu lực theo hợp đồng, ngoại lệ) → P3 (camp + nhắc việc). User chốt: chỉ ops tạo ca (bỏ quyền brand tự mở — RLS 0035); ngày camp xử lý lúc sinh tháng; **để từ từ, chưa làm**. (b) Gợi ý lịch từ lịch sử: tích hợp làm lớp gợi ý trong cùng module (không tách module, không auto-commit), chỉ ăn ca `tiktok_reconciled`, cần ≥ 2 tháng đối soát — làm sau P2 khi có dữ liệu thật (nạp bù 0086 chính là để có dữ liệu đó sớm). (c) Phân bổ target: khung camp nhập tay hiện *cộng thêm* vào lịch cố định (D-Day 3 ngày, Mid 13–15, Pay 23–25) chứ không thay thế — user chưa chọn giữ hay đổi.

Chờ sau chạy thử: Zalo OA worker (đọc bảng `notifications` rồi gửi — cần user đăng ký OA doanh nghiệp trước, xem memory `liveops-zalo-notification-plan`); pipeline TikTok API (chờ scope Partner Center); theme phủ hết app.
