# LiveOps AI — Trạng thái Workspace (Agency ↔ Brand)

> File này được viết lại gọn ngày 2026-09-08 — bản cũ (1459 dòng, đã vượt giới hạn đọc 1 lần của Claude Code) vẫn còn nguyên trong Git (`git log -- WORKSPACE_DESIGN.md`), tra lại lịch sử chi tiết từng bug/migration bằng lệnh đó thay vì mở file này. Từ nay giữ nguyên tắc: file này chỉ ghi **trạng thái hiện tại**, không tường thuật quá trình.

## Kiến trúc tổng quan

App tách 2 lớp workspace, chuyển qua dropdown switcher trên Header (không dùng URL routing):

- **Agency Workspace** (mặc định — `ceo`/`admin`/`operations`) — nhóm nav: Tổng Quan, Vận Hành Live, Tài Nguyên Chung, Kinh Doanh (CRM + TikTok API), Tài Chính, Hệ Thống.
- **Brand Workspace** (1 cho mỗi brand: JOCKEY, VERA, CROCS, Franklin) — role `brand` tự động bị khoá vào đúng 1 brand qua `assigned_brand_id`, không có switcher.

Ground truth luôn là `AGENCY_NAV_GROUPS`/`BRAND_NAV_GROUPS` ở [src/App.tsx:1357](src/App.tsx:1357) — danh sách dưới đây chỉ là ảnh chụp, lệch thì tin code.

**Agency:** Dashboard · Live Sessions · Lịch Vận Hành · Đăng Ký & Chốt Lịch · Talent Pool · Studios & Gear · CRM (gồm Rate Card từng brand) · TikTok API · Finance & P&L · Hội Đồng AI · Phân Quyền & Role · AI Training Center.

**Brand:** Dashboard · Lịch Vận Hành · Sessions · SKU Showcase · Hiệu Suất Xem & Chuyển Đổi · Report Tháng (có toggle chế độ xem Tháng/Tuần) · Dữ Liệu Gốc (Dataraw — ẩn với role `brand`, chỉ ceo/admin/operations).

**Đã xoá khỏi roadmap** (không phải thiếu, mà chủ động gỡ vì trùng lặp/ngoài phạm vi): Module Campaign, Price List Import, Co-Funded Voucher, Hoá Đơn & Công Nợ Brand (P&L giờ tính trên NMV ước tính thay vì công nợ), AI Script Gen, End-to-End Simulator, Onboarding Checklist theo Brand, Rate Card tab riêng trong Brand Workspace (gộp vào CRM, set tập trung 1 chỗ cho mọi brand).

## Luồng dữ liệu chính (đã verify qua Supabase + browser thật)

1. **Tầng 0 — Dữ Liệu Gốc (Dataraw):** ops tải tay 5 loại report Excel từ TikTok Shop Seller Center (Shop Promotion List, Product List, Live Analysis, Shop Analytics, Transaction Analysis Creator List) mỗi tuần/tháng, upload vào kho theo brand. Đây là bằng chứng gốc, tự động gộp/ghi đè theo tháng khi upload lại. **Chưa có pipeline API tự động** — cần scope `data.shop_analytics.public.read`, đang treo ở bước đăng ký Developer/ISV TikTok Shop Partner Center.
2. **Đối soát:** Talent tự nhập report ca (tạm tính, `data_source='manual'`) → Ops đối soát cuối kỳ bằng số đọc thẳng từ Dataraw, ghi đè thành `data_source='tiktok_reconciled'`. Nộp lại report sau khi đã đối soát **không tự xoá cờ** nếu số liệu đối soát (GMV/orders/views/CTR/watch-time) không đổi (migration 0075).
3. **Report Tháng Brand Workspace** (5 tab: Tổng Quan/Livestream/Sản Phẩm & Khuyến Mãi/Affiliate/Kế Hoạch Tháng Sau) — đạt chuẩn brief thật Crocs x YFB, đọc thẳng từ Dataraw + `live_sessions` thật, không số bịa. Toggle Tháng/Tuần dùng chung 1 màn hình.
4. **P&L** (`lib/pnl.ts`) tính trên NMV ước tính = `actualGmv × (1 − returnRate/100)`, giờ công thực tế = giờ ca + OT − off sớm, rate/giờ song song với rate/phiên cũ (data cũ không đổi).

## Hạ tầng Supabase

- Migration mới nhất: **0076** (đã chạy trên Supabase thật, xem `supabase/migrations/`). Quy trình chạy: user tự dán vào Supabase SQL Editor (không có `DATABASE_URL`/Supabase CLI cấu hình trong máy dev).
- Project Supabase này **không còn chia sẻ với app nào khác** (đã dọn 15 bảng CRM/outreach không liên quan ngày 2026-09-07, xem migration 0076 nếu cần đối chiếu).
- RLS: mọi bảng có `brand_id` trực tiếp đã cô lập theo brand ở tầng đọc (không chỉ tầng UI) — công thức chuẩn `current_user_role() is distinct from 'brand' or brand_id = current_user_brand_id()`.

## ĐỀ XUẤT treo — Tái cấu trúc tầng dữ liệu (chưa code, chưa migration)

**Bối cảnh:** rà 76 migration + toàn bộ điểm đọc/ghi số liệu, phát hiện 4 lỗi kiến trúc gốc đều đã verify bằng đọc code:

- **A.** Fact đối soát bị lưu đè lên dimension row (`live_sessions.actual_gmv`) — chỉ 1 ô nên đối soát = ghi đè phá huỷ, và ô đó dùng tính lương nên mọi thao tác đối soát là thao tác tài chính.
- **B.** Không có định nghĩa metric duy nhất — `ads_cost` có 2 nguồn nhập độc lập không ràng buộc (`live_session_reports` vs `session_finance`), `talents.avg_gmv_per_session` là số nhập tay nhưng chạy thẳng vào vận hành, CTR/CVR lấy trung bình cộng qua session (sai toán học).
- **C.** Chuẩn hoá xảy ra lúc ĐỌC thay vì lúc GHI — 5 file `src/lib/dataraw/` lặp lại pattern lọc/cộng bằng JS với luật không nhất quán; TikTok đổi tên cột thì report im lặng ra 0đ kèm cờ "có dữ liệu".
- **D.** Không có tầng aggregate — `fetchSessions()` kéo toàn bộ session mọi brand không lọc/phân trang, `live_sessions` chưa có index trên `date`.

**Mô hình đích:** tách 3 grain đang bị gộp — `shifts` (ca lao động/lương) + `broadcasts` (phiên phát sóng thật) + `broadcast_shift_allocations` (cầu nối N-N theo % overlap phút, giải quyết "ca nối" trung thực) + bảng fact bất biến `metric_facts` (chỉ insert, đối soát = insert fact nguồn ưu tiên cao hơn, không update) + semantic layer `metric_definitions` (tỷ lệ không bao giờ lưu sẵn, luôn tử+mẫu) + `ingest_contracts` (hợp đồng cột file TikTok, validate lúc upload). Schema SQL đầy đủ + lộ trình 5 bước (strangler, schema cũ sống song song tới bước 4): xem bản kỹ thuật đầy đủ tại `git show eede2c2:WORKSPACE_DESIGN.md` (commit gốc chứa toàn bộ đề xuất, trước khi file này được viết gọn lại) hoặc artifact https://claude.ai/code/artifact/9255e287-cf73-4d83-bdbe-4fc3a53236c4.

**4 quyết định nghiệp vụ cần chốt trước khi code bước nào:**
1. Nguồn `ads_cost` chuẩn? (đề xuất: `live_session_reports`, Finance chuyển thành điều chỉnh có ghi vết)
2. Ca nối chia theo phút chồng lấn hay chia đều? (đề xuất: theo phút, cho ops sửa tay)
3. Report đã phát hành có cập nhật khi số đối soát về muộn? (đề xuất: KHÔNG, ghim `observed_at`, chênh lệch đưa vào điều chỉnh tháng sau)
4. Giữ `session_minute_metrics`? (đề xuất: giữ nhưng tách khỏi luồng tải chính)

## Còn lại — chưa làm / còn mock

- **Tích hợp TikTok API tự động** — hiện 100% nhập tay qua Dataraw, chờ scope Developer/ISV.
- **Theme toggle (light/dark) chưa phủ hết app** — hạ tầng có sẵn app-wide, nhưng chỉ 3 calendar (`LiveCalendar`/`BrandCalendar`/`GmvCalendar`) có class `dark:`, phần còn lại (sidebar, Header, Dashboards, mọi modal/bảng) vẫn hardcode màu dark cũ — không vỡ, chỉ không đổi màu khi toggle. Làm dần khi có yêu cầu, không có deadline.
- **Đề xuất tái cấu trúc data 3-grain ở trên** — chờ user chốt 4 quyết định nghiệp vụ.

## Quy ước kỹ thuật bắt buộc tuân theo

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

## Giai đoạn tiếp theo

Chưa chốt — chờ user chọn hướng: (a) code bước 1 của đề xuất tái cấu trúc data (gom định nghĩa metric về `src/lib/metrics/`, không đụng DB), (b) retrofit theme toggle cho phần còn lại của app, (c) module/nghiệp vụ khác.
