# LiveOps AI — Trạng thái Workspace (file sống)

> **Đọc file này đầu mỗi phiên.** Nó chỉ giữ cái đang đúng hôm nay: giai đoạn, việc còn treo, kiến trúc, quy ước bắt
> buộc. Lịch sử chi tiết từng đợt (số đo, lý do, bẫy đã gặp) nằm NGUYÊN VĂN ở [docs/WORKSPACE_HISTORY.md](docs/WORKSPACE_HISTORY.md)
> (đóng băng 2026-10-02, ~660 KB — **grep theo tên mục, đừng đọc cả file**; mục lục ở §8).
>
> **Cách cập nhật (CLAUDE.md):** cuối mỗi đợt, SỬA các mục dưới cho đúng hiện trạng — không chép thêm nhật ký dài vào
> đây. Điều đáng giữ của một đợt (quy ước mới, bẫy, quyết định của user) ghi gọn vào đúng mục. Nếu chi tiết thật sự dài
> (số đo, phân tích), append một mục mới vào **cuối** `docs/WORKSPACE_HISTORY.md` (không sửa phần cũ) và thêm một dòng
> vào §8. Giữ file này dưới ~500 dòng.

---

## 1. Giai đoạn hiện tại (cập nhật 2026-10-02)

- **CHẠY THỬ THẬT trên dữ liệu thật** (từ 2026-09-18; mock đã xoá sạch 19/09). DB: 33 hồ sơ talent thật, CROCS T6–T9 nạp
  bù từ file Creator-Live-Performance (229 ca, còn ca chưa gán host). **Không đề xuất tính năng mới**; hỏi user chạy thử
  tới đâu, cái gì kêu, rồi sửa đúng chỗ đó. **Không seed mock lại.**
- **Nợ kỹ thuật đã hết** (đợt P2a-2…P2a-21, 01–02/10) và **audit code chết đã xong** (02/10): `npm run audit:dead` báo 0,
  ESLint 0 lỗi (33 warning `set-state-in-effect` = nợ đã đo, cố ý `warn`), vitest 410/410.
- 🛑 **User chốt 02/10: DỪNG nhánh đo tốc độ tải.** Mạng chỗ user là biến trội nên wall-clock vô nghĩa. Không chạy lại
  các phép đo P2a-17→P2a-20 trừ khi user yêu cầu rõ. Những gì đã sửa thì giữ (chứng minh bằng SỐ REQUEST và source).
- **Quyết định user đã chốt — đừng nêu lại:** luật run-rate (§5.6); Target GMV từng ca ở "Kế Hoạch Tháng Sau" brand ĐƯỢC
  thấy (01/10); tiền không có chữ "đ" (27/09); trung tâm xuất file = một module dùng chung, không dựng tab riêng (02/10);
  gộp menu/IA hoãn tới khi có 2–4 tuần số liệu `ui_tab_views` (bắt đầu đếm 26/09); chỉ ops tạo ca (brand không tự mở).

## 2. Việc còn treo

**Cần user làm:**
1. **24 file Dataraw CROCS T6–T9** chưa up (1 Creator Live Performance full T6→T9 · 4 Khuyến Mãi · 4 Sản Phẩm · 4 Shop
   Analytics · 4 Live Performance · 4 Affiliate Creator List EN · 3 Live Analysis EN T7/T8/T9). `Product Card Traffic Stats`
   chưa có file nào (khối đó trong Report Tháng tự ẩn).
2. **Nhập % hoa hồng/lương** (rate talent, commission brand) — khối tiền của Dashboard CEO và Finance mới có số.
3. Gán host cho ca nạp bù CROCS còn thiếu (Dữ Liệu Gốc → lưới nạp bù).

**Cần tài khoản/mật khẩu mà Claude không có:**
4. Góc nhìn role `brand` bằng JWT thật — DB chưa có tài khoản brand nào (M9 đã đo bằng harness props-only).
5. Thông báo `shift_assigned` / "số đối soát khác số ghi lúc giao ca" tới talent — RLS chỉ chính chủ đọc; tài khoản talent
   test không còn gắn hồ sơ talent sau đợt dọn mock.
6. Phiên đã đăng nhập mà thiếu dòng `profiles` trên production (trên replay đã đo: 0 dòng sau `0130`).
7. Nhánh `503 ai_not_configured` đầu-cuối; đợt fetch lúc đăng nhập của role talent/brand.

**Hoãn có chủ đích (có lý do, không phải quên):**
8. Gộp menu / IA — chờ số liệu `ui_tab_views`.
9. Tích hợp TikTok API tự động — chờ scope Developer/ISV ở Partner Center. Lịch sử trước T7/2026: không có nguồn.
10. Zalo OA worker gửi `notifications` (cần user đăng ký OA doanh nghiệp; memory `liveops-zalo-notification-plan`).
11. Module tạo ca P2/P3 (khung lịch tuần theo brand, hiệu lực theo hợp đồng) — đã phân tích 19/09, chưa chốt làm.

**Bị auto-mode chặn, không đi đường vòng:** đọc vô danh hàng loạt bảng trên production ("Production Reads"); `git push`
đôi khi bị chặn ("Out-of-Place Publication") — khi đó để user tự push.

## 3. Kiến trúc

- **Stack:** React 19 + Vite 6 + Tailwind 4 (client) · Express (API, `src/server/createApp.ts`) · Supabase (Postgres + Auth
  + RLS). Deploy Vercel: frontend tĩnh từ `dist/`, `/api/*` → `api/index.ts` (Node ESM từng file, KHÔNG bundle).
  `server.ts` chỉ cho dev (`npm run dev`, Vite middleware) và Node truyền thống (`npm start`, phục vụ `dist/`).
- **Hai workspace** chuyển bằng switcher trên Header: **Agency** (ceo/admin/operations, xuyên mọi brand) và **Brand**
  (mỗi brand một workspace: CROCS, JOCKEY, VERA, Franklin; role `brand` bị khoá vào đúng brand qua `assigned_brand_id`).
  Có URL route (`src/lib/routes.ts`): `/so-ca`, `/brand/crocs/report-thang`…
- **Nguồn sự thật của menu:** `agencyNavGroups()`/`brandNavGroups()` ở [src/lib/appNav.ts](src/lib/appNav.ts). Ảnh chụp:
  - Agency: Dashboard (Bản Tin CEO) · Lập Kế Hoạch (Kế Hoạch Tháng, Nhân sự ca) · Vận Hành Hằng Ngày (Bảng Vận Hành, Sổ Ca,
    Đối Soát Số Liệu) · Phân Tích (Hiệu Suất Host, Toàn Cảnh Brand, Điều Phối Phát Hành) · Tài Nguyên (Talent Pool,
    Studios & Gear) · Kinh Doanh (CRM + Rate Card, Cam Kết Hợp Đồng, TikTok API) · Tài Chính (Finance & P&L — khoá cứng
    ceo/admin) · Hệ Thống (Phân Quyền & Role; AI Training Center — chỉ admin). Talent chỉ thấy: Ca Của Tôi, Đăng Ký Ca, Hồ Sơ.
  - Brand: Dashboard · Lịch Vận Hành · Sổ Ca · SKU Showcase · Report Tháng (toggle Tháng/Tuần) · Cam Kết Hợp Đồng (chỉ đọc)
    · Kế Hoạch Tháng Sau (chỉ đọc + xác nhận) · Rate Card (chỉ đọc) · Affiliate · Nhập Ads & Ghi Chú + Dữ Liệu Gốc (ẩn với role brand).
- **Mã nguồn:** `src/App.tsx` (state + handler + render tab, ~2.000 dòng) · `src/hooks/useWorkspaceData.ts` (mọi lượt nạp
  lúc đăng nhập, gate theo role/tab) · `src/components/*` (mỗi tab một chunk lazy qua `lazyNamed`) · `src/lib/db/*` (đọc/ghi
  Supabase) · `src/lib/{performance,report,scheduling,dataraw,liveSnapshot}` (logic thuần, có test) · `tests/*.test.ts` ·
  `scripts/find-dead-code.mjs` (`npm run audit:dead`).
- **AI:** chỉ còn 1 tính năng — chấm điểm ghép host (`/api/gemini/match-talents`, tab Talent Pool; prompt `talent_matcher`
  sửa ở AI Training Center). `GEMINI_API_KEY` đang rỗng trên production ⇒ 503 `ai_not_configured`, UI nói "chưa bật".
- **Đã gỡ khỏi app (đừng dựng lại bản cũ):** Dashboard KPI dự phóng cũ, Toàn Cảnh Agency, Live Sessions Hub, Module
  Campaign, Price List, Co-Funded Voucher, Hoá Đơn & Công Nợ, AI Script Gen, Simulator, Hội Đồng AI, Workflow Automation
  Rules, Report Tháng Chuyên Sâu riêng (đã gộp), Hỗ Trợ Vận Hành riêng (đã gộp vào Dashboard brand), 3 bảng con của ca.

## 4. Luồng dữ liệu

1. **Kế Hoạch Tháng** (`brand_month_plans` + `_slots`): ops lập lưới ca + target từng ca → **Chốt** (`lock_month_plan`) sinh
   `shift_slots` mở → talent đăng ký rảnh → ops chốt người (Nhân sự ca / chốt hàng loạt) ⇒ `live_sessions`.
2. **Số liệu ca — 3 bậc tin cậy** (`live_sessions.data_source`): `manual` (talent tự khai qua report ca) < `live_snapshot`
   (trợ live up file Creator-Live-Performance lúc giao ca, 0078) < `tiktok_reconciled` (ops đối soát cuối kỳ, 0080).
   Snapshot là thứ DUY NHẤT giữ ranh giới giữa 2 ca chung một Room ID (số cộng dồn) — luật ở §5.6.
3. **Dữ Liệu Gốc (Dataraw):** ops tải tay 6 loại report Excel (Seller Center / Streamer), upload theo brand + tháng
   (1 batch / brand / loại / tháng, 0077). Dùng cho Report Tháng (phần shop), Affiliate, nạp bù ca.
4. **Report Tháng** đọc **bản chụp** (`brand_monthly_report_snapshots`, 0119) do ops bấm Tạo/Cập nhật — mở report không tính
   lại. 7 phần: Kết luận · Thị trường hay vận hành · Vì sao · Sản phẩm · Host · Campaign & khung giờ · Tháng sau. Phát hành
   cho brand qua RPC; brand chỉ thấy số của tháng đã phát hành (view `live_sessions_secure`, 0107).
5. **P&L** (`lib/pnl.ts`): NMV ước tính = GMV × (1 − return rate); giờ tính lương = giờ ca + OT − off sớm; ca `is_backfill`
   không vào Finance. Tiền chỉ cộng ca đủ dữ liệu (`missingInputs` rỗng), luôn ghi "tính được X/Y ca".
6. **Thông báo** (`notifications`, 0083/0116): trigger DB ghi, client poll 45s + khi focus; chuông gate theo `session`.

## 5. Quy ước kỹ thuật bắt buộc

### 5.1 Quy trình làm việc
- **Verify trên app thật trước khi báo xong** (Browser pane có sẵn phiên admin; cấu hình `liveops-prod` trong
  `.claude/launch.json` chạy đúng bản build production). Không dừng ở "cần user test". Đo trên **bản build production**,
  không trên dev server (StrictMode nhân đôi request). Pane bị ẩn thì phép đo timing phía client vô giá trị.
- **Kiểm ghi chú "còn lại/chưa làm" với code trước khi làm** — ghi chú hay lạc hậu hơn code.
- **Đầu phiên:** `git status` bẩn mà không phải việc của mình, hoặc một transcript khác vừa ghi trong vài phút ⇒ hỏi user
  trước khi sửa file dùng chung (sự cố 2 phiên sửa cùng working tree, 24/09).
- **Migration:** user tự dán vào Supabase SQL Editor (không có DB URL/CLI). Luôn nhắc rõ khi có migration mới **và thứ tự so
  với deploy**. Đừng tin "đã chạy đủ" — đo: gọi RPC chỉ migration đó tạo (`PGRST202` = chưa chạy); bảng còn hay không thì
  hỏi production (`HEAD …?select=*` + `Prefer: count=exact`: 404 hay `content-range`), **không suy từ chuỗi migration**
  (production từng bị xoá bảng tay; `0126` drop bằng `execute format(...)` nên grep `drop table` không thấy).
- **Trước khi đưa migration bảo mật/DDL lớn: replay `0001 → mới nhất`** trên Postgres cô lập ([supabase/tests/README.md](supabase/tests/README.md);
  Homebrew có `initdb`/`psql`; đường dẫn socket quá 103 byte ⇒ `-c unix_socket_directories='' -c listen_addresses=127.0.0.1`).
  Bẫy: `grant all on all tables … to authenticated` trên bản replay sẽ xoá grant theo cột của 0047/0048 — đừng dùng khi đo quyền cột.
- **Trước khi đóng một đợt sửa:** `npm run lint && npm run typecheck && npm test && npm run build && npm run audit:dead`.
- **Không giữ code "phòng khi cần lại"** (màn ẩn, kiểu "làm tài liệu", re-export "để import cũ không đổi") — git giữ lịch sử.
  **Tính năng chỉ có UI mà không có phần chạy thật thì gỡ** — "Đã chạy N lần"/"Giả lập…" là hứa sai với người dùng.
- **Trước khi tối ưu, đếm dòng thật trên production** — từng song song hoá một thứ lẽ ra nên xoá (3 bảng con 0 dòng).
- Test mới đặt ở `tests/*.test.ts`. Mutation test phải xác nhận mutation rơi ĐÚNG DÒNG.

### 5.2 Client (React / TS)
- `strict` + `noUnusedLocals` bật; `@types/react*` phải có trong devDependencies (thiếu là JSX thành `any`, CI xanh giả).
- **Giao diện** (`tests/layoutConventions.test.ts` canh): đầu trang dùng `PageHeader`; chọn tháng dùng `MonthPicker`, không
  `<input type="month">`; trạng thái DB hiển thị qua `statusLabel()`; tab đọc ca/talent/report tự được cổng `coreDataReady`
  che (tab không cần thì thêm vào `TABS_WITHOUT_CORE_DATA`); phần tử bấm ≥ 24px; 0 tràn ngang ở 375px.
- **Màu brand** qua `getBrandTheme(brandName)`; **logo** qua `<BrandLogo>`; **ca trên lịch** qua `<SessionEventCard>`
  (`buildSessionMeta`/`buildSlotMeta`). Theme sáng là lớp chuyển màu CSS cuối `index.css` — component cứ viết dark-first.
- **Tiền:** `fmtVndShort` (chỗ chật: "50M", "1,23B") / `fmtVndFull` (con số chính xác) trong `lib/format.ts`; không "đ",
  không tự ghép "tr/triệu/tỷ/k" (`tests/uiReadability.test.ts` quét).
- **Tên chỉ số** chỉ lấy từ `lib/metricGlossary.ts` (`METRIC`, kèm `metricHint` công thức); bộ chỉ số live map từ
  `KEY_METRICS` + `keyMetricValue` + `fmtKeyMetric` (`lib/report/keyMetrics.ts`) — không tự liệt kê, không tự viết công thức.
- `effectiveWorkspace` (không phải `workspace` thô) là nguồn sự thật cho brand hiện tại. `isTabAllowed`: không tìm thấy nav
  item = KHÔNG được phép. `activeTab`/`workspace` reset khi đổi user (`uiStateOwner`).
- Nav item Brand workspace `perm: undefined`; module Agency mới tái dùng `PermissionKey` có sẵn. **Mỗi PermissionKey gate
  đúng MỘT nav item** (bất biến ghi ở `types.ts`) — thêm key không gắn màn là công tắc giả trong Ma Trận Phân Quyền.
- Không `useState(prop[0]…)` với prop mảng nạp async — đồng bộ lại bằng effect. `useMemo` theo nhịp thời gian phải giữ
  identity mảng khi không đổi. Guard đọc state async phân biệt *đang nạp / lỗi / bị từ chối*.
- Prop callback đổi chữ ký ⇒ sửa kiểu ở MỌI lớp trung gian (tsc cho gán hàm ít tham số vào kiểu nhiều tham số).
- **Lọc một lần ở chỗ hợp dòng:** ca `excludedFromReports` lọc ở `activeSessions` (App.tsx) cho cả app — không lọc lại từng
  màn, không đọc `sessions` thô ở màn có cộng số. Nút xuất Excel đọc **cùng mảng** bảng đang render.
- Lỗi supabase-js không phải `instanceof Error` — luôn qua `errorMessage()`. Handler App.tsx (`try/catch + toast`) trả `void`
  — form cần hiện lỗi tại chỗ phải gọi lớp db trực tiếp.
- Hook chỉ dành cho test đặt tiền tố `__` (vd `__resetInFlight`). Biến cố ý không dùng: tiền tố `_`.
- App không dùng Realtime/Storage của Supabase: 2 thư viện đó bị thay bằng shim ở bundle client (`src/shims/README.md`) —
  thêm `.channel()`/`.storage` sẽ ném lỗi ngay lúc dev.

### 5.3 Lớp dữ liệu (PostgREST / Supabase / server)
- **PostgREST cắt 1.000 dòng/request, KHÔNG báo lỗi** — đọc cả bảng lớn dần phải qua `fetchAllPages`/`fetchRowsPaged`
  (cổng canh quét cả `src/`). Bảng con không nạp cả kho lúc mở app; nạp theo ca đang mở.
- **Lượt đọc không dùng dữ liệu `profile` thì gate theo `session`** (lên chặng 1 của đợt nạp). Đừng thêm throttle vào lớp
  đọc (bắn song song nhanh nhất; giới hạn luồng chậm 2–5×). Gộp lời gọi trùng đang bay bằng `dedupeInFlight` — KHÔNG cache.
- **Mọi `.update()`/`.delete()` kèm `.select()` + `assertAffected`** — RLS lọc 0 dòng thì PostgREST trả 204 im lặng.
- ĐỌC ca qua view `live_sessions_secure`, GHI vào bảng `live_sessions` (brand bị đóng bảng gốc từ 0107).
- Mỗi loại file Dataraw một dialect số — KHÔNG dùng chung `num()` (product_list: chấm = nghìn; creator_live_performance:
  chấm = thập phân). Parser nhận song ngữ Việt/Anh. product_list dò cột theo VỊ TRÍ + kiểm nhãn (`colAt`).
- **Bản chụp Report Tháng:** đổi công thức `fetch*Slice` ⇒ tăng `PIECE_VERSION`; đổi tổng hợp product_list ⇒ tăng
  `PRODUCT_AGG_VERSION`; report đọc trường mới của ca ⇒ thêm vào `SNAPSHOT_SESSION_FIELDS` (+ `SESSION_SIG_FIELDS`). jsonb
  không giữ thứ tự khoá — so theo giá trị, không so `JSON.stringify`.
- **Server** (`src/server/*`, `api/*`): import tương đối PHẢI có đuôi `.js` (`tests/serverImports.test.ts`). Xác thực qua
  `authUserOf` / `requireRoleCaller(req, roles)`. Sau deploy: `curl https://live-ops-ai.vercel.app/api/health` phải 200.

### 5.4 SQL / RLS / migration
- **Công thức RLS chuẩn (0105):** khẳng định role được phép + bọc `(select …)`:
  `(select current_user_role()) in ('ceo','operations','admin') or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))`.
  `in (...)` hỏng về phía ĐÓNG khi role NULL; `not in`/`is distinct from` hỏng về phía MỞ. Bảng mới phải tự có policy —
  mặc định cũ của 0001 là `read_all`.
- **RPC `security definer` tự guard quyền trong thân** (owner bỏ qua RLS; `create function` tự cấp EXECUTE cho PUBLIC mà
  `anon` thừa hưởng ⇒ phải `revoke … from public`). Guard bằng `coalesce(current_user_role()::text, '') not in (...)`.
  Helper RLS nhận ID dòng của người khác ⇒ để trong schema `private` (0128). `tests/sqlGuards.test.ts` quét thân hàm,
  policy và view.
- **View** không `security_invoker` chạy quyền owner — `drop view` + `create view` lại thì phải giữ mọi vế bảo mật (0114 từng
  xoá vế `is not null` của 0109; 0130 vá bằng cách bọc định nghĩa đang chạy).
- User sửa dữ liệu của chính mình ⇒ RPC whitelist cột, không mở policy "update dòng của mình" (RLS chặn theo dòng, không cột).
- **Drop column/table/function:** grep thân MỌI hàm plpgsql còn nhắc tên đó và `create or replace` trong cùng migration
  (Postgres chỉ plan thân hàm lúc gọi lần đầu). Không `cascade`. Drop bảng phải có chốt "còn dòng thì raise" (khuôn 0126/0132)
  và chốt tự kiểm cuối file.
- Thêm tham số CÓ DEFAULT vào RPC đã có bằng `drop` + `create` ⇒ drop chữ ký cũ (song song là `function is not unique`).
  Đổi chữ ký RPC client đang gọi ⇒ giữ tương thích (default) hoặc nói rõ thứ tự migration/deploy.
- Không sửa policy bằng vòng lặp quét `pg_tables` — liệt kê bảng tường minh; vòng lặp nhiều bảng bọc
  `continue when to_regclass(...) is null`. Dump cột thật trước khi viết (đừng suy tên cột theo họ bảng:
  `brand_month_plans.month` vs `period_month`; `talents` không có cột `status`).
- **Không dùng ký tự kẻ khung (┐├┘…) trong file migration** — `0132` bản đầu có chúng trong comment: psql chạy sạch
  nhưng Supabase SQL Editor báo `42601 syntax error at end of input (LINE 0)`, không áp gì; bỏ đi thì chạy được.
  `tests/sqlGuards.test.ts` chặn. Gặp lỗi SQL Editor mà psql sạch: kiểm production xem có áp dở gì không trước.
- `date_trunc` trên cột `date` trong index phải ép `::timestamp`. Thông báo hàng loạt: đếm trước khi bắn (gom theo sự kiện lô).

### 5.5 Một khái niệm — một hàm (audit 28/09)
"Ca có số" = `isCountable` (hostPerformance) · ca tính tiền = `isPnlSession` (pnl) · dự kiến cuối tháng = `projectMonthEnd` /
`MonthOutlook` · trùng lịch = `personClash`/`studioClash` (scheduling/conflicts) · giờ kế hoạch = `sessionDurationHours`, giờ
live = `sessionHours`. GMV/giờ đem NHÂN với giờ lịch thì chia trên giờ kế hoạch; GMV/giờ BÁO CÁO chia trên giờ live. Thước
đo xếp host là **GMV/giờ**, không phải GMV/ca. Cam kết hợp đồng đếm **giờ ca theo lịch** (kể cả ca GMV 0), chỉ loại ca huỷ.

### 5.6 Luật nghiệp vụ đã chốt
- **Run-rate chỉ tính bằng `planRunRate`** (28/09): target = Σ target ca của Kế Hoạch Tháng đã chốt (không chia lại khi lịch
  đổi); ca kế hoạch huỷ GIỮ target; ca ngoài kế hoạch target 0; ca thêm vào lưới sau khi chốt nhận target = dự báo.
- **Report Tháng là nơi DUY NHẤT nói số một tháng SAU khi hết tháng** (đọc bản chụp; so cùng kỳ cắt 1..N khi tháng chưa hết).
  Dashboard brand là màn TRONG tháng, dùng chung hàm. Phân tích mới thì thêm vào 1 trong 7 phần, không dựng trang riêng.
- Số "live agency" lấy TỪ CA; Shop Analytics "Linked account" chỉ dùng cho vế "phần còn lại của shop". File Live Performance
  Core Stats gồm cả creator affiliate — không dùng làm số agency. CTOR = Orders ÷ Product clicks. Kết luận về host cần
  khoảng tin cậy nhiều tháng (phân phối t). So sánh cắt theo **ngày cuối có số**, không theo lịch.
- Snapshot theo ca: chỉ 13 cột ĐẾM ĐƯỢC mới đem trừ, tỷ lệ tính lại lúc đọc; mốc ranh giới = **giờ kết thúc ca**
  (`session_boundary_at`); room thuộc ca khi khung giao nhau cả 2 đầu; up lại cho cùng ca = thay thế.
- Talent không bao giờ ghi đè số đã có snapshot/đối soát (RPC chặn). Thông báo "số khác số bạn báo" chỉ khi số cũ là
  `manual` và lệch ≥ 5%. Ca `is_backfill` không vào Finance. Planner/gợi ý chỉ ĐỀ XUẤT, không bao giờ tự chốt ngầm.

## 6. Hạ tầng Supabase

- 132 migration (`supabase/migrations/`), chạy tay theo thứ tự — **tới `0132` đều ĐÃ CHẠY** (0131 + 0132 ngày 02/10).
  Replay `0001 → 0132` trên Postgres cô lập: sạch.
- `0132` bỏ: bảng `workflow_rules`, `session_skus`, `session_checklist_items`, `session_minute_metrics` (cả 4 đều 0 dòng trên
  production, đếm 02/10); hàm `replace_session_children`, `private.session_brand_id`, `private.session_month_published`;
  enum `checklist_category` + 4 enum mồ côi từ trước (`directive_*`, `project_status`). `update_session_with_children` giữ
  tên, 3 tham số con thành `default null` và bị bỏ qua. Đo trên replay: chỉ đúng các object trên biến mất, 4 view và mọi
  policy khác không đổi; chạy lần 2 không lỗi; bảng còn dòng thì migration dừng mà không xoá gì. **Verify trên production
  sau khi chạy:** 4 bảng + `replace_session_children` trả 404; `update_session_with_children` gọi 2 hoặc 5 tham số đều
  vào tới thân hàm (P0001 not found với id giả); Sổ Ca vẫn `47 ca · 177,8h · 3,52B`, 24/24 request của trang 200.
- Project Supabase chỉ phục vụ app này. Backup: GitHub Action `backup-supabase.yml` (pg_dump hằng ngày, cần secret
  `SUPABASE_DB_URL` dạng Session pooler).
- Tài khoản test & phiên admin của Browser pane: memory `liveops-test-login` / `testing-self-serve`.

## 7. Bẫy khi tự verify bằng Browser pane (không phải lỗi app)

- `window.confirm`/`window.prompt` bị pane tự trả `false`/`null` — stub trong một lời gọi riêng RỒI mới bấm.
- Click theo toạ độ hay trượt (nhất là khi `resize_window` đang giả lập kích thước) — dùng `find` → `ref`, hoặc
  `element.click()` qua `javascript_tool` cho nút icon trong lưới chật.
- Scope selector vào chính dialog; React không ghi lại `value` xuống DOM khi prop không đổi — kiểm bằng hệ quả (banner hiện/
  mất), đổi state bằng `nativeInputValueSetter` + `dispatchEvent('input')`.
- Pane ẩn thì timer bị siết (vòng lặp `setTimeout` chạy rất chậm) — chia việc thành nhiều lời gọi ngắn.
- Shell: zsh không tách biến thành lệnh (`$PS -f x` lỗi "command not found") — dùng `bash -c` hoặc hàm.

## 8. Mục lục lịch sử ([docs/WORKSPACE_HISTORY.md](docs/WORKSPACE_HISTORY.md) — grep đúng tên mục)

| Mục trong file lịch sử | Tóm tắt |
|---|---|
| `## Audit code chết (2026-10-02)` | gỡ Hội Đồng AI, Workflow Rules, quét QR giả, ~25 export chết, 3 bảng con khỏi client; lỗi `"std-a"` ở Studios; `audit:dead`; 0131 (viết trước 0132) |
| `"Cần làm ngay" bản 2026-10-02` | nhật ký P2a-8…P2a-21: lỗi chốt hàng loạt trợ live, cam kết hợp đồng, nạp bù, 0125–0130 bảo mật, đo hiệu năng (đã dừng) |
| `## BẢO MẬT — /rpc/session_boundary_at …` | 0130; 0114 từng xoá vế `is not null` của 0109; replay chứng minh |
| `## BẢO MẬT — lỗ hổng đọc không cần đăng nhập` | 0109; kiểm lại 02/10 bằng dựng quyền từ chuỗi migration |
| `## BẢO MẬT — tự phong role khi đăng ký …` | 0111/0112; tắt signup trên Dashboard Supabase |
| `## Audit UX/UI lần 2 (2026-09-29)` | Đợt 0 + M1–M9: bố cục từng màn, màn talent, role brand (harness props-only) |
| `## Audit UX/UI (2026-09-26)` + `### P2a-…` | tách bundle, đợt fetch lúc đăng nhập, trần 1.000 dòng, tách App.tsx/MonthlyReportTabs, bỏ AI bịa, private schema, `(select …)` trong policy, đo production |
| `## Rà lại E2E #4–#7` · `## Avg. view đọc từ file (0124)` | lỗi phát hành report, lưu lưới sai brand; `watch_seconds` |
| `## Audit toàn diện code base (2026-09-23)` | ảnh chụp dữ liệu thật 23/09, 4 bản vá, danh sách còn lại lúc đó |
| `## Chạy thử TOÀN BỘ workflow trên app thật (2026-09-24)` | 12 điểm đứt gãy Đ1–Đ12 (huỷ ca, rate chưa nhập, target, thông báo, cold start) |
| `## Ưu tiên #5 — ESLint + test` | dựng ESLint, 175 lỗi đầu tiên, sự cố 2 phiên sửa cùng working tree |
| `## Bản Tin CEO / Dashboard …` | 6 luật của màn CEO (cắt theo ngày có số, dự phóng, target theo ngày, tiền chỉ ca đủ dữ liệu) |
| `## Dashboard trong Brand Workspace …` | luật run-rate, quy tắc đề xuất đã backtest |
| `## Report Tháng …` (8 phần · chuyên sâu · bỏ trùng lặp · bản chụp · gộp phân tích sâu) | cấu trúc 7 phần, bản chụp 0119, control group, quà tặng/UPT, khoảng tin cậy host |
| `## Key Metrics 18 chỉ số` · `## Chuẩn hoá tên chỉ số` | `keyMetrics.ts`, `metricGlossary.ts` |
| `## Tầng dữ liệu gốc mới — snapshot theo ca …` | cơ chế snapshot, công thức tỷ lệ đối chiếu 89 phiên thật |
| `## Nạp bù ca từ file Creator-Live-Performance …` | 0086, quy trình chuẩn khi có file mới, gán host ca nạp bù |
| `## Module "Kế Hoạch Tháng" …` · `## Module tạo ca — P1 …` | 0088, 0090–0099: lưới, chốt, camp ranges, phòng live |
| `## Sổ Ca …` · `## Module hỗ trợ vận hành …` · `## Tái cấu trúc màn hình Vận Hành Live …` | 3 màn vận hành và luật của chúng |
| `## Trang Affiliate …` · `## Còn lại của mảng Affiliate` | 0102, parser song ngữ, file Live Analysis linked accounts |
| `## Audit Role × Workspace (2026-09-22) …` | Đợt A/B/C (0103–0110), xuất file, sự cố 0105 bị bỏ sót, bảng bị xoá tay |
| `## Rà soát UX/workflow theo module (bắt đầu 2026-09-13)` | Module 1–N: đăng ký/chốt ca, cam kết, gợi ý host, chốt hàng loạt, thông báo |
| `## Hạ tầng Supabase` (bản cũ) | trạng thái từng migration 0082–0123 kèm cách đã verify |
