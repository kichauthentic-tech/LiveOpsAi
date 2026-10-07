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

## 1. Giai đoạn hiện tại (cập nhật 2026-10-07)

- **08/10 (muộn): "KẾ HOẠCH VS THỰC TẾ" CỦA CỬA SỔ CA LIVE THÀNH 2 CỘT + NHẬP TAY THỰC TẾ (migration `0152` ĐÃ CHẠY 08/10, user thử OK; tsc, vitest 663/664 — 1 đỏ là Talent Pool `lg:sticky` có sẵn;
  replay 0001→0152 + `supabase/tests/0152_set_session_actuals.sql` 14/14 trên Postgres tạm; user xác nhận chạy được trên app thật; test vẽ SSR `tests/sessionPlanVsActual.test.ts`).**
  `components/SessionPlanVsActual.tsx` (thay khối cũ trong `SessionWindow`): bảng Kế hoạch | Thực tế — Giờ live (giờ ca | giờ live thật), GMV (target | GMV + "% target"), GMV/giờ (target ÷ giờ ca | thực tế).
  Brand: ô Kế hoạch của GMV/GMV/giờ là "—" (không lộ target). **Thực tế có hai đường vào:** (1) file / giao ca / đối soát tự ghi đè như cũ; (2) ops bấm "Nhập tay thực tế" (giờ live từ–đến + GMV)
  ⇒ RPC `set_session_actuals` (0152, `setSessionActuals` ở `lib/db/sessions.ts`). Luật DB: chỉ ceo/operations/admin; ca chưa huỷ, đã bắt đầu; **chỉ ghi khi `data_source = 'manual'`** (đã có số file/giao ca/đối soát thì
  chặn — muốn đổi thì up file mới); giữ `manual` ⇒ vẫn "Tạm tính"; giờ live gõ cả hai hoặc để trống, qua nửa đêm tự tính; tháng đã phát hành Report bị trigger 0133 chặn. Nút ẩn ở client khi tier ≠ manual, đã giao ca, hoặc `s.date > today`.
  **Việc kế:** nhập tay mới chỉ có GMV + giờ live (Orders/Views chưa có ô — nếu cần thì thêm tham số RPC).
- **08/10 (sau): "TẢI LỊCH HOST" CHIA NHÓM HOST / TRỢ LIVE (CHƯA commit; tsc sạch, `uiReadability` xanh lại — đã đổi `text-[10px]`→`[11px]` trong `TalentLoadTimeline.tsx`; đã xem trên app thật 08/10 + 09/10).** Nhóm theo vai CHIẾM NHIỀU GIỜ HƠN trong ngày (hoà → Host); người làm cả hai vai chỉ MỘT hàng (để trùng giờ host×trợ vẫn chồng thẻ, giờ cộng dồn cho mức 6h), dòng phụ "Host 3h + Trợ 6h", thẻ vai phụ viền nét đứt + nhãn vai. Vai tính theo TỪNG ĐOẠN (`effectiveSegments`), không theo cả ca. "Rảnh cả ngày" chia theo vai hồ sơ. Việc còn treo: chưa có bộ lọc/tab riêng Host|Trợ nếu ops cần.
- **08/10: HIỆU SUẤT HOST CHỌN KỲ NGÀY / TUẦN / THÁNG (CHƯA commit; tsc sạch; đã xem trên app thật qua dev server :3100, admin).** `components/HostPerformance.tsx`: nút Ngày | Tuần | Tháng | Tuỳ chọn + ‹ › chuyển kỳ
  (tuần ISO thứ Hai–CN, tháng nhảy theo lịch, không tiến qua kỳ chứa hôm nay); đổi chế độ giữ nguyên mốc `anchor`. Mặc định = **Tháng hiện tại** (trước đây cố định 90 ngày gần nhất); "Tuỳ chọn" giữ ô từ–đến cũ
  (mặc định 90 ngày). Chỉ là bộ lọc `from/to` đưa vào `filterSessions` — mọi bảng/xuất Excel đi theo kỳ đã chọn, chưa có bảng xu hướng host × kỳ.

- **08/10: BỎ MÀN "NHÂN SỰ CA" CỦA AGENCY, TÁCH "ĐĂNG KÝ CA" CỦA TALENT RA MÀN RIÊNG (user chốt "làm cả 2"; CHƯA commit; tsc, vitest 647/649 — 2 test đỏ là LỖI CÓ SẴN không thuộc đợt
  này: Talent Pool `lg:sticky`, `TalentLoadTimeline` text-[10px] —, audit:dead 0; đã xem trên app thật nối DB thật (admin, user đăng nhập hộ): `/nhan-su-ca` → Bảng Vận Hành, menu không còn mục, khối "Việc lập kế hoạch ca" hiện đúng số liệu; CHƯA thử mở dòng ca chưa có người (T10 không có ca mở nào; tạo ca thử sẽ gửi thông báo thật cho talent) và CHƯA thử màn Đăng Ký Ca bằng tài khoản talent).** Lý do: màn ops trùng Bảng Vận Hành /
  Cửa sổ Ca Live (danh sách ca, đăng ký, chốt Host+Trợ live), còn talent chỉ dùng chung component vì `shift_scheduling` là màn duy nhất họ đăng ký ca. `ShiftScheduling.tsx` (1.140 dòng) đã xoá.
  - **Talent:** `components/TalentShiftSignup.tsx` — chỉ liệt kê ca ĐANG MỞ từ hôm nay theo ngày + nút "Tôi rảnh ca này"/huỷ; id tab `shift_scheduling` và route `/nhan-su-ca` giữ cho talent
    (thông báo `shift_open` vẫn trỏ về đây). Test `layoutConventions` cấm màn này import chốt người/gợi ý host/bảng tải.
  - **Ops/CEO/admin:** mục menu "Nhân sự ca" bỏ; link `/nhan-su-ca` và activeTab đã lưu → Bảng Vận Hành (effect ở App, cạnh `firstAllowedTab`). Dòng ca chưa có người ở Bảng Vận Hành mở
    `SlotDetailModal` (chốt Host + Trợ live; nay có gợi ý Host xếp theo GMV/giờ 90 ngày cùng sàn + cảnh báo mệt, `suggestionLabel` ở `lib/performance/hostSuggestion.ts`). Khối mới
    `components/OpsPlanningTodo.tsx` ở cuối Bảng Vận Hành (trên khối Hỗ Trợ Vận Hành): kênh chưa chốt Kế Hoạch Tháng sau · ca mở thiếu người của tháng đang chọn · cam kết hợp đồng còn thiếu giờ
    (chỉ hiện brand thiếu/có ca chưa xác nhận) · Chốt lịch hàng loạt; có chọn tháng. Prefetch đăng ký ở `TAB_DATA_PREFETCH.calendar`.
  - **Bỏ hẳn (đã có chỗ khác):** lịch tháng + danh sách ca của Nhân sự ca, bảng "Số ca của từng host" (xem Lịch & Studio → Tải host / Hiệu Suất Host), nhãn nguồn ca (Tự động/Kế hoạch tháng/Phát sinh),
    bảng xếp hạng chi tiết dưới ô chọn Host (nay gói vào nhãn trong ô chọn). Banner kế hoạch: sửa luôn lỗi tên brand vô hình ở theme sáng (`text-amber-100` → `text-amber-200`).
  - **Việc kế:** khi có ca mở thật thì bấm thử dòng ca chưa có người (SlotDetailModal + gợi ý Host), và xem Đăng Ký Ca bằng tài khoản talent; chuỗi "Nhân sự ca" còn trong comment code/test là lịch sử, không hiển thị.

- **07/10 (đêm): THIẾT KẾ LẠI TALENT POOL — danh sách + hồ sơ cạnh nhau (user duyệt mockup; CHƯA commit; tsc, vitest 650/650, audit:dead 0; đã xem trên app thật
  nối DB thật ở 1440/1024/375px, 40 talent, 0 lỗi console, 0 tràn ngang).** `components/TalentMatcher.tsx`: bảng 11 cột + popup chi tiết → dải 4 số (Talent / Đã chạy ca /
  Giờ host+trợ / Chưa gắn ca, tính trên TOÀN BỘ talent) + nút lọc vai trò có đếm + danh sách một dòng/người (avatar chữ cái, vai trò, ca·giờ host/trợ, thanh khối lượng so với
  người chạy nhiều nhất, tổng ca) + hồ sơ bên phải (4 ô ca/giờ, thanh GMV từng sàn — không tổng gộp, GMV/giờ brand × sàn, rate card chỉ ceo/admin, sửa/xoá). Từ `xl` (1280px)
  hồ sơ là cột dính; dưới `xl` bấm dòng mở hồ sơ thành tấm phủ màn hình (`sheetOpen`). Số cộng từ ca tính một lần (`allRows` useMemo). Bỏ khỏi UI: ô CTR TB gõ tay và cột SĐT/
  Trạng thái riêng (SĐT + trạng thái ≠ Sẵn sàng nằm trong hồ sơ). Không đổi DB/API/quyền; modal Thêm/Sửa, mật khẩu một lần, khối AI gập lại giữ nguyên. Test layout của màn
  này (`layoutConventions.test.ts` mục M6) đã viết lại cho bố cục mới; màu thanh GMV theo sàn qua `GMV_BAR: Record<ReportPlatform,…>` (không `=== "Shopee"`, `platformProfiles.test.ts` canh).

- **07/10 (tối): THIẾT KẾ LẠI THẺ CA TRÊN MỌI LỊCH (user duyệt mockup + 3 quyết định; CHƯA commit; tsc, lint 0 lỗi, vitest 644/644, audit:dead 0, build; đã xem trên
  trang thử không đăng nhập ở 1440/1280, 4 theme, Agency tháng/tuần/ngày + Brand tháng/danh sách; CHƯA xem trên app thật có dữ liệu thật; Nhân sự ca chỉ qua tsc — cùng thẻ + PosterDayCell với Brand).**
  `SessionEventCard` viết lại: nền = màu brand pha loãng vào nền ô (color-mix, `.sc` ở index.css) + logo brand 22–24px; nền tảng = logo (`PlatformLogo`,
  `lib/platformLogos.ts`, ảnh ở `src/assets/platforms/`), hết chip chữ TikTok/Shopee; trạng thái = biểu tượng (xanh tích xong / X đỏ huỷ + giờ gạch + mờ / chấm LIVE /
  đồng hồ chờ ĐK), hết nhãn XONG/HUỶ (`statusLabel`, `SESSION_STATUS_LABEL` đã xoá, `tone` quyết định); Target GMV = viên thuốc đặc `BrandTheme.ink` (đo ≥7:1 sáng/tối,
  `tests/sessionCardTheme.test.ts`). **Quyết định user:** (A) thẻ hẹp bỏ tên brand (≥200px mới hiện); (B) ô lịch tháng/tuần/PosterDayCell **cao ra theo số thẻ, không cuộn trong
  ô** (hàng tuần dài khi ngày nhiều ca — chủ ý); (C) chip Host/Trợ live giữ tên rút gọn + biểu tượng, không còn `metaLimit`/"+N". Bố cục theo **độ rộng của chính thẻ**
  (container query: ≤100px vi mô · gọn · ≥200px vừa · ≥460px một hàng). Lịch Ngày (LiveCalendar): trục tối thiểu 64px/giờ (`HOUR_PX`), ca chồng giờ cùng phòng xếp làn
  (`layoutLanes`, `LANE_H` 124) thay vì đè. Lịch Brand tháng: danh sách chữ bên dưới nay là thẻ tầng rộng + cột GMV đã ghi nhận. `EventPill` xoá (hết nơi dùng).
  Quy ước: thẻ ca mới KHÔNG tự đặt màu/nhãn — thêm brand ⇒ khai `accent/ink/inkDark` ở `BRAND_THEMES` (không khai thì tự suy, vẫn qua test tương phản); thông tin phụ thêm
  vào mảng `meta`; chú giải dùng `SessionCardLegend`. Chưa làm: đổi chữ TikTok/Shopee thành logo ở Sổ Ca / Bản Tin CEO / Hiệu suất Host (đã loại khỏi phạm vi).

- **08/10: TINH CHỈNH THẺ CA + LỊCH NGÀY (CHƯA commit; tsc, vitest mới 24/24; xem trên thẻ mẫu dựng ở trang đăng nhập, CHƯA xem trên app thật có dữ liệu).** Lịch Ngày: mọi thẻ cao
  ĐÚNG `LANE_H` (prop `fill` của `SessionEventCard`, Target GMV ghim đáy; chỉ rộng đổi theo giờ), phòng trống thu còn `EMPTY_ROW_H` 56px, nhãn đầu/cuối trục giờ căn vào trong
  (hết bị cắt `:00`/`23:`). Thẻ (mọi lịch): ca ĐANG LIVE = viền chớp đỏ (`sc-blink`, tắt khi reduced-motion; huy hiệu LIVE đứng yên); `buildSessionMeta` thêm chip đỏ
  "Chưa có host" (ca Upcoming/Live, không hiện cho brand) và chip "A → B" khi đổi người giữa ca (tooltip ghi giờ đổi, `SessionCardMeta.warn`); viền đỏ trùng người nay có
  tooltip "X cũng đang ở ca …" (`clashDescriptions` ở `lib/scheduling/conflicts.ts`, `clashTip` ở LiveCalendar). Huy hiệu hổ phách "+12p" (vào live trễ, `lateStartInfo` ở `lib/sessionStatus.ts`, `buildLateBadge`, chỉ lịch Agency, nằm hàng đầu thẻ để không thêm chiều cao; `LANE_H` 116→124 vì ca 2h có Host+Trợ+Target đo được ~121px): CHỈ có sau
  khi file số liệu được up (ca đang live thường chưa có) và chỉ báo khi muộn 10–180p, vì `actual_start_at` = giờ SỚM NHẤT của room trong file (0078), ca nối tiếp trong room đã live từ ca trước sẽ có giờ thật sớm hơn kế hoạch. Chưa làm: đánh dấu
  `excludedFromReports` trên thẻ, "off sớm" (cùng nguồn `actual_end_at`). 2 test đang đỏ KHÔNG do đợt này: `layoutConventions` (Talent Pool `lg:sticky`), `uiReadability` (TalentLoadTimeline `text-[10px]`).

- **07/10 (cuối ngày): GIẢM THỜI GIAN MỞ APP (đã commit 8058e6f; tsc, vitest 650/650, đã đo trên trình duyệt).** Cổ chai = danh sách ca (1.501 ca, ~95% byte lúc mở) giữ
  `coreDataReady` ~10 s trên mạng yếu của user. Đã làm: 2 trang ca song song + `SESSION_READ_COLUMNS` + tải sẵn xlsx (commit 5615c13); **Dữ Liệu Gốc + Nhập Ads chờ `shellDataReady`
  (brand + kênh), không chờ ca** — hiện ~0,8 s dù ca về 6,5 s; Nạp bù/Đối soát tự chờ `coreReady`. Số đo + hướng đã cân và BỎ (cắt cửa sổ ca, cache IndexedDB) → HISTORY §"Giảm thời gian mở app".
  **Mốc quay lại:** ~1.800 ca hoặc user thấy chậm ⇒ `PAGES_PER_WAVE` 3, rồi tải theo phạm vi từng màn. Hạn JWT (Auth → Sessions → Access token expiry) đã tăng 3600 → 86400 s ngày 07/10; cần đăng nhập lại để nhận hạn mới.

- **07/10 (user chốt): GỘP "Đối Soát Số Liệu" VÀO "Dữ Liệu Gốc" — một file chỉ up MỘT lần (CHƯA commit, CHƯA verify trên trình duyệt: phiên Claude không
  có đăng nhập).** Màn riêng + mục menu + route `/doi-soat` đã xoá. Ở Dữ Liệu Gốc của brand: loại file đối soát của sàn (`RECON_TYPE` ở `BrandDataRaw.tsx`:
  TikTok = Creator Live Performance, Shopee = Live List) — Xác nhận import ⇒ ghi kho Dữ Liệu Gốc NHƯ CŨ rồi tự tạo lô đối soát từ chính dữ liệu vừa đọc
  (`importReconciliationFromParsed`, `lib/db/liveReconciliation.ts`); mỗi lần tải trong Lịch Sử Import có nút **Đối soát** (dựng lại từ columns + dòng đã lưu,
  không cần up lại — dùng cho T9/T10 đã up sẵn). `ReconciliationPanel.tsx` (rổ khớp ca + Áp dụng + xoá lô) nằm trên khối Nạp bù. KHÔNG đổi DB/RPC
  (`import_live_reconciliation` / `apply_live_reconciliation` giữ nguyên, lô cũ vẫn xem được); `snapshotRowsFromParsed` (extractRooms.ts) là phép chuẩn hoá
  chung. Lỗi tạo lô sau khi đã lưu import không làm mất import (báo riêng + nút thử lại). Link CeoBrief "reconcile" nay mở Toàn Cảnh Brand.
  **Luật cho ca nối thiếu snapshot giữa ca:** ĐỪNG Sinh ca / tách ca khi ca sau đã có trong lịch/kế hoạch — Đối soát khớp room vào cả 2 ca có sẵn (rổ "Cần xem
  lại"), chia theo thời gian chồng, tổng đúng bằng file, host/target giữ nguyên. Nay `planBackfill(rows, linked, sessionWindows)` bỏ room chồng giờ ca có sẵn
  (đếm `overlapping`) và nút "tách" ẩn khi `hasOverlappingSession` (client; RPC `split_backfill_session` CHƯA chặn — nếu cần thì migration mới). Khối Nạp bù có
  nút Ẩn/Hiện (localStorage `liveops.backfillFromRooms.hidden`). Test: `tests/roomsToSessions.test.ts` +4; vitest 631/631, tsc, audit:dead 0, build.
  **Việc kế:** user đăng nhập thử luồng up → Đối soát → Áp dụng trên 1 brand (Claude không được nhập mật khẩu); cân nhắc chặn tách ở RPC.
- **07/10: AUDIT ĐA SÀN + LỘ TRÌNH 6 BƯỚC (đang làm, user bảo làm hết theo thứ tự).** Báo cáo: https://claude.ai/artifact/NhFbjXqFhMnMXCaJkLUDww
  (5 nguyên nhân gốc: sàn chỉ là cột dán vào 12 bảng, không có thực thể Kênh; ~250 nhánh `if Shopee`; 10 workspace; lọc sàn tự giác từng màn;
  quyết định đảo liên tục). **User chốt 07/10 (luật cứng, §5.6):** dữ liệu gốc hai sàn khác hoàn toàn; **KHÔNG BAO GIỜ cộng/gộp/xếp hạng gộp
  bất kỳ chỉ số hiệu suất nào giữa TikTok và Shopee** (GMV, target GMV, đơn, view, GMV/giờ, tỷ lệ); số vận hành (ca, giờ, người, phòng) và
  TIỀN của agency (doanh thu, lương, chi phí, lãi — một bảng lãi/lỗ, cột theo kênh) thì cộng được; ATC/CO/Xu Shopee lấy từ file Live List khi
  đối soát, không bắt trợ gõ; **đóng băng tính năng mới tới hết Bước 3** (chỉ sửa lỗi + nhập dữ liệu thật).
  - **Bước 0 XONG (07/10):** gợi ý host + chốt hàng loạt chỉ tính GMV/giờ cùng sàn của ca (`SlotContext.platform`, mệt mỏi vẫn đếm mọi sàn);
    Talent Pool / AI ghép host / Hồ Sơ Của Tôi tách GMV theo sàn (`TalentRealTotals.perf[sàn]`, không còn `totalGmv`; AI ghép host có ô chọn sàn);
    Bảng Vận Hành "GMV đã ghi nhận" và "Target" từng ngày ở Lịch & Studio tách theo sàn; tập trung khách ở Bản Tin CEO tính riêng từng sàn;
    Finance bỏ tổng GMV; việc "Kế hoạch VERA Shopee…" và nút ở Bảng Vận Hành / CRM mở đúng sàn (`openMonthPlanFor` ở App, bỏ `loadRememberedPlatform`
    chết). Khoá bằng code: `lib/platforms/perf.ts` (`sumByPlatform`, `assertOnePlatform` — ném lỗi ở dev/test khi mảng ca lẫn sàn, gắn ở
    `keyMetricsOfSessions`, `shopeeKeyMetricsOfSessions`, `byHost`, `byHostShopee`, `buildHistory`, `summarize`) + `tests/noCrossPlatformPerf.test.ts`
    (hành vi + bộ quét: phép cộng số hiệu suất viết tay chỉ được ở file trong `SINGLE_PLATFORM_FILES`). Verify: tsc, lint 0 lỗi, vitest 613/613,
    audit:dead 0, đột biến bỏ lọc sàn ở `suggestHosts` ⇒ đúng 1 test đỏ; 14 màn agency trên bản dev nối DB thật không lỗi, Talent Pool hiện
    cột GMV TikTok / GMV Shopee. Việc của ops: gán phòng cho 87 ca Shopee (JOCKEY 72/72 chưa có phòng mặc định, Franklin 15/32).
  - **Bước 1 XONG (07/10) — migration `0149` ĐÃ CHẠY 07/10** (verify DB thật: 7 kênh nạp sẵn; thêm ca mở CROCS·Shopee bị chặn "Brand CROCS chưa có kênh Shopee"; CRM hiện "Thêm kênh Shopee" cho CROCS). Bảng `brand_channels`
    (brand × sàn, tên gian hàng, mã shop, active/paused, không xoá), nạp sẵn mọi cặp đang có (DB thật: 7 kênh); trigger
    `trg_guard_channel_exists` trên 12 bảng có cột sàn từ chối dòng của kênh chưa tạo (cột sàn khác kiểu enum/text nên không dùng khoá
    ngoại ghép). Client: `lib/channels.ts` (`platformsOfBrand`, `channelsOfBrand`, `findChannel`; `deriveChannels` CHỈ khi DB chưa có bảng)
    thay hẳn `brandPlatformsOf` (đã xoá) ở App/Header/Kế Hoạch Tháng/Toàn Cảnh/Bản Tin CEO/Nhân sự ca/Việc cần làm/CRM; CRM là chỗ duy
    nhất thêm / sửa / tạm dừng kênh (thẻ brand: "+ Thêm kênh Shopee", khối "Kênh {sàn}" trong Hợp đồng & giá); việc mới `channel-<brand>`
    khi brand chưa có kênh đang chạy. Kèm sửa lỗi: "Mở ca chờ đăng ký" từng ghi cứng `platform: "TikTok"` ⇒ nay chọn kênh của brand.
    Verify: replay 0001→0149 sạch, `supabase/tests/0149_brand_channels.sql` 19/19 + 11 bộ kiểm SQL cũ xanh trên chuỗi mới (đã thêm
    khối tạo kênh cho brand thử; 0138 8c theo 0147, 0139/0140 "sàn lạ" theo trigger kênh); vitest 613/613, lint 0 lỗi, audit:dead 0;
    bản dev nối DB thật (chưa có bảng) suy đủ 7 kênh, 10 màn không lỗi. Chưa đo: thêm kênh thật qua UI (cần 0149).
  - **Bước 2 XONG (07/10, không migration): HỒ SƠ SÀN.** `src/lib/platforms/profiles.ts` (`PLATFORM_PROFILES`, `profileOf(sàn | dòng)`):
    nhãn, màu chip, định nghĩa GMV, "phòng"/"phiên", Views/Viewers, cách giao ca (`handover: file|link`, `handoverThird`, xu), số lúc đổi host,
    bộ đếm TikTok trong Cửa sổ Ca, file đối soát, loại Dữ Liệu Gốc + file Ads, tab ẩn, Shop Analytics, phễu (`funnel`), ô KPI CEO, và
    `metrics` = bộ chỉ số tầng 2 (`defs`, `groups`, `ofSessions`, `value`, `fmt`, `drivers`, `coverageNotes`, `hostRanking`). Report Tháng /
    Điều Phối Phát Hành dùng `lib/report/reportEngines.ts` (`REPORT_ENGINES[sàn]`: build, freshness, coverage, headlineChange); khung hiển thị
    `REPORT_VIEWS`, khung Ads `ADS_PANELS`, bộ dựng dòng đối soát `RECON_ROW_BUILDERS` — đều `Record<ReportPlatform, …>` (thêm sàn mà quên là lỗi
    compile). `platformOf` / `brandMonthKey` / `channelTitle` / `platformIdSuffix` / `LEGACY_PLATFORM` ở `lib/reportPlatform.ts`. Số nhánh so
    tên sàn ngoài lõi: ~210 ⇒ 0 (`tests/platformProfiles.test.ts` quét; chỉ `lib/platforms/`, `lib/reportPlatform.ts`, `server/`, `lib/appNav.ts`
    — appNav gỡ ở Bước 3). Kèm sửa lỗi có từ trước: Report Tháng sập một nhịp khi chuyển VERA·Shopee → CROCS (bản chụp kênh cũ còn trong state ⇒
    nay khoá theo brand|tháng|sàn); Nhập Ads Shopee không còn đọc file Ads TikTok ngầm. Verify: vitest 619/619, lint 0 lỗi, audit:dead 0, build;
    bản dev nối DB thật: 21 màn hai sàn không lỗi, VERA·Shopee hiện Viewers/ATC/phễu Shopee, CROCS hiện CTOR/phễu TikTok, CEO Shopee ô Viewers/GPM.
  - **Bước 3 XONG (07/10, không migration): GỘP MENU.** Bỏ 3 workspace Agency·TikTok/Shopee/Chung + 7 workspace brand·sàn ⇒ switcher 5 mục
    (Agency + 4 brand), thanh "Sàn" trong trang (xem §3). Gỡ `PLATFORM_AGENCY_TABS`/`TIKTOK_ONLY_AGENCY_TABS`/`filterAgencyNav`, `handlePickAgency`,
    `handlePickChannel`. Vòng chốt tháng nay chỉ đi qua 2 workspace (Agency, brand). Verify: vitest 620/620, lint 0 lỗi, audit:dead 0, build;
    bản dev nối DB thật: 13 màn hai phạm vi không lỗi, Dashboard "Tất cả kênh" có bảng toàn agency (366 ca T10, GMV cộng riêng TikTok 73,5M /
    Shopee 24,6M) + khối TikTok + khối Shopee; Sổ Ca "Tất cả" ghi "TikTok 73,5M · Shopee 24,6M"; Affiliate VERA tự về TikTok.
  - **Bước 4 XONG (07/10) — migration `0150` ĐÃ CHẠY 07/10** (verify DB thật: `data_source = handover_typed` được nhận; hàm vá có chốt tự kiểm trong migration). (a) Thang nguồn số một cho mọi sàn:
    `lib/dataSource.ts` (`dataSourceTier`: manual < handover < reconciled); 0150 thêm giá trị `handover_typed` = số dashboard GÕ lúc giao ca
    (Shopee) — trước đó ghi `manual`, nhãn "Tạm tính" chung với số nạp bảng tính; badge "Số Lúc Giao Ca" giải thích theo hồ sơ sàn; phát
    hành report vẫn coi `handover_typed` là chưa đối soát; thông báo "đối soát lệch ≥5%" nhận bậc này. (b) User chốt: ATC/CO/Xu lấy từ Live
    List khi đối soát, trợ không gõ ⇒ 0150 cho `apply_live_reconciliation` ghi ATC của phiên (raw.atc, chia theo lượt xem) vào `atc_count`;
    giao ca / số lúc đổi host Shopee chỉ còn link + GMV + lượt xem (`handoverThird: null`, bỏ ô Xu). **Live List KHÔNG có CO và Xu theo
    phiên** (Xu chỉ ở file tổng quan tháng) ⇒ bỏ CO, CO/ATC, Xu, Xu/GMV khỏi bộ chỉ số Shopee theo ca (Report Shopee tháng vẫn đọc Xu từ
    file tổng quan). (c) Finance & P&L: bảng lãi/lỗ theo kênh + dòng "Toàn agency" (tiền cộng được). DB `tiktok_reconciled` giữ tên (đổi
    tên giá trị phải viết lại ~10 hàm SQL — để sau, màn hình đọc qua `dataSourceTier`). Verify: replay + `supabase/tests/0150_*.sql` 9/9
    (gồm đối soát Live List ghi ATC 140), bộ giao ca 0144/0145 25/25 với 0150; vitest 620/620, lint 0 lỗi, audit:dead 0; Finance trên bản
    dev nối DB thật hiện 4 kênh + Toàn agency 23 ca.
  - **Đồng bộ tên chỉ số Shopee XONG (07/10 tối, không migration):** user bảo dashboard/report Shopee dùng chung khuôn TikTok nên có chỉ số
    không tồn tại hoặc tự chế. Đối chiếu với 4 file Shopee + file Live Ads thật ⇒ tên đúng cột Shopee ở `METRIC` (`metricGlossary.ts`: Viewers,
    Engaged Viewers, ATC, ABS, Items Sold, Sales (Confirmed Order), CTR, Order Rate, GPM, Coins Claimed, Shop/Special Live Voucher Claimed, Sales Ratio,
    Live Views/Viewers, Expense, Budget, Conversion Rate…, tooltip ghi "tự tính" cho số không có trong file). Bộ chỉ số THEO CA của Shopee còn 9 ô:
    GMV, GMV/giờ, Giờ live, Orders, **ABS (không phải AOV)**, Items Sold, Viewers, Viewers/giờ, ATC (Live List chỉ có bấy nhiêu theo phiên); **bỏ** CO, CO/ATC,
    Orders/ATC, ATC/giờ, Xu đã tung, GPM theo ca (GPM Shopee chia cho Total Views mà Live List không có — bản cũ chia cho Viewers là sai định nghĩa).
    `PlatformProfile.basketLabel` (AOV/ABS), `briefKpis` Shopee = Viewers + ATC. Report Tháng Shopee: nhãn theo cột Shopee, thêm khối Engagement (GPM, Sales Per Buyer,
    Avg. Viewing Duration, PCU, Total Likes/Shares/Comments, Live New Followers), Ads/khuyến mãi theo Expense/Coins Claimed/Voucher; `SHOPEE_SNAPSHOT_VERSION` 3
    (bản chụp cũ vẫn mở được, hiện "cần cập nhật số liệu" — ops bấm Cập nhật để có nhãn mới). Bảng Ads Shopee đủ cột của file. Form giao ca/đổi host Shopee ghi "Viewers".
    Giữ nguyên "GMV" làm tên chính (user chốt 06/10 GMV = Sales(Placed Order)); đổi sang "Sales" chỉ cần sửa `METRIC.gmv` cho Shopee nếu user muốn. Khoá bằng
    `tests/shopeeMetricNames.test.ts` (quét chữ hiển thị file thuần Shopee + bộ 9 ô). Verify: tsc, lint 0 lỗi, vitest 622/622, audit:dead 0, build; bản build nối DB
    thật: Dashboard VERA·Shopee, Report Tháng (bản chụp cũ), Bản Tin CEO Shopee không lỗi, đúng tên mới.
  - **07/10 — chốt tháng 10 khi lịch đã nhập bằng file (migration `0151`, ĐÃ CHẠY 07/10 — user xác nhận):** DB thật lúc đo: T10 có 366 ca `live_sessions` (6 kênh), 0
    `shift_slots`, chỉ một kế hoạch nháp (CROCS TikTok 75 ca / 5,5 tỷ, chỉ 26 ca khớp giờ ca thật). `lock_month_plan` (0140) chỉ nhận ra
    SHIFT_SLOT có sẵn ⇒ Chốt sẽ mở ~44 ca chờ đăng ký TRÙNG ca đã có host (kèm thông báo cho mọi talent) và để 63 ca thật "ngoài kế hoạch,
    target 0". Sửa: `0151` — ca kế hoạch trùng brand|ngày|giờ|sàn với ca thật chưa huỷ (chưa shift_slot nào trỏ tới) ⇒ tạo `shift_slots`
    `finalized` + `session_id` (hình dạng `finalize_shift_slot`), không mở đăng ký, kể cả ngày đã qua; trả thêm `linked_sessions`. Client: nút
    **"Dựng lưới từ N ca đã nhập"** ở Kế Hoạch Tháng (`draftsFromSessions`, `monthPlanGrid.ts`) dựng lưới đúng theo ca đã nhập, giữ target ghi
    trên ca (CROCS 5,141 tỷ), tự nới khung giờ/số ca-ngày; `validateDrafts` nhận ca QUA NỬA ĐÊM (`endsAfterMidnight`: kết thúc ≤ 06:00 và < giờ
    bắt đầu). (`0151` đã chạy nên bấm Chốt an toàn.) Verify: replay 0001→0151 sạch,
    `supabase/tests/0151_*.sql` 11/11 (đỏ khi thiếu 0151) + `0140_0142` vẫn 14 OK; vitest 625/625, lint 0 lỗi, audit:dead 0, build; dựng thử
    từ DB thật cả 6 kênh = 0 lỗi lưới. CHƯA xem trên giao diện (cần đăng nhập). Việc user: mỗi kênh (6): Kế Hoạch Tháng → T10 →
    "Dựng lưới từ … ca đã nhập" → nhập Target GMV tháng + "Chia lại target" (CROCS đã có target từng ca) → Chốt.
  - **07/10 — sửa chia target ca (Kế Hoạch Tháng + Dashboard brand, mục "Kế Hoạch Tháng Sau"):** mô hình trọng số (`targetWeightModel`) từng dựng lịch sử bằng khung camp NHẬP TAY của tháng đang lập ⇒ nhập D-Day 8–11 làm ngày D-Day T7–T9 thành "ngày thường", GMV/giờ D-Day = ngày thường, target ca D-Day bằng ca thường (thấp hơn dự báo). Nay lịch sử luôn xếp loại theo lịch cố định (`resolveCampBucketType(d)`), khung nhập tay chỉ xếp loại CA CỦA THÁNG. Test: `tests/slotInsights.test.ts`. Quy ước: lịch sử cho mô hình không bao giờ áp khung camp của tháng khác. Chưa rõ: sửa ngày camp trong lưới chưa thấy tự chia lại target trong lần thử tay — cần bấm "Chia lại target".
  - **07/10 — sửa dự báo ca QUA NỬA ĐÊM (`estimateSlots`, `suggestEngine.ts`):** ca 21:00–00:00 / 21:00–00:30 có độ dài ÂM ⇒ dự báo 0 ⇒ lưới CROCS T10 thiếu dự báo 16/86 ca, cảnh báo "dự báo 4,85B thiếu 6% so với target 5,15B" SAI CHIỀU (đủ 86 ca dự báo 6,03B, target = 0,85× dự báo, đều 0,83–0,92 ở mọi khung/loại ngày) và gợi ý "bù ~15h" sai theo. Nay cộng 24h khi kết thúc ≤ bắt đầu, phần sau nửa đêm lấy thứ kế tiếp. Test `tests/estimateSlotsOvernight.test.ts` (đỏ trước khi sửa). Quy ước: mọi chỗ tính độ dài ca từ chuỗi giờ phải xử lý qua nửa đêm (dùng `sessionDurationHours` hoặc cộng 24h).
  - Bước tiếp: 5 chạy thật 2–4 tuần (không tính năng mới): giao ca thật, chốt tháng 10 trong app cho ít nhất một kênh mỗi sàn.

- **CHẠY THỬ THẬT trên dữ liệu thật** (từ 2026-09-18; mock đã xoá sạch 19/09). DB: 33 hồ sơ talent thật, CROCS T6–T9 nạp
  bù từ file Creator-Live-Performance (229 ca, còn ca chưa gán host). **Không đề xuất tính năng mới**; hỏi user chạy thử
  tới đâu, cái gì kêu, rồi sửa đúng chỗ đó. **Không seed mock lại.**
- **Nợ kỹ thuật đã hết** (đợt P2a-2…P2a-21, 01–02/10) và **audit code chết đã xong** (02/10): `npm run audit:dead` báo 0,
  ESLint 0 lỗi (31 warning `set-state-in-effect` = nợ đã đo, cố ý `warn`), vitest 467/467 (05/10).
- **Các đợt 04–07/10 trước audit đa sàn** (chi tiết nguyên văn + cách verify: lịch sử `## §1 các đợt 04–07/10 (chuyển khỏi WORKSPACE 07/10)`):
  lịch 2 sàn + chặn trùng người (0143); giao ca: TikTok up file Creator-Live-Performance + chọn sự cố (0145), Shopee dán link + số (0144,
  ca nối tự trừ, nhắc `handover_due`); cấp tài khoản host/trợ theo tên (27 tài khoản, `TalentAccountGrants`); gộp cấu hình một chỗ nhập
  (CRM "Hợp đồng & giá", Kế Hoạch Tháng cho số một tháng, Ads ngân sách 0146); tách sàn report/kế hoạch/hợp đồng (0139–0142); bộ chỉ số
  Shopee riêng (`shopeeKeyMetrics.ts`); Hỗ Trợ Vận Hành thành tab agency; đổi host giữa ca có số riêng (0147 Shopee gõ, 0148 TikTok up file,
  `segmentCheckpoints.ts`); chọn phòng khi up file (`SnapshotRoomPicker`); đổi người giữa ca (0138, `staffSegments.ts`, không hoa hồng GMV);
  nạp lịch T6→31/10 từ Working File (893 + 330 ca, nhãn Tạm tính); CROCS T10 89 ca target tổng 5,141 tỷ; Ads từ file TikTok Ads (0137);
  audit lần 3 (0136 vá tự nâng quyền); audit người mới (0134/0135); audit vòng đời (0133); cắt vòng mạng nối tiếp lúc tải.
- **Quyết định user đã chốt — đừng nêu lại:** luật run-rate (§5.6); Target GMV từng ca ở "Kế Hoạch Tháng Sau" brand ĐƯỢC
  thấy (01/10); tiền không có chữ "đ" (27/09); trung tâm xuất file = một module dùng chung, không dựng tab riêng (02/10);
  gộp menu/IA hoãn tới khi có 2–4 tuần số liệu `ui_tab_views` (bắt đầu đếm 26/09); chỉ ops tạo ca (brand không tự mở).

## 2. Việc còn treo

**Cần user làm:**
000000000. **Đợt 3 tài khoản XONG 06/10:** user cấp 27 tài khoản đăng nhập bằng tên (Thái Toàn + 26 người có ca), app đếm 37 tài khoản, khối vàng còn 5 hồ sơ chưa có ca sắp tới; 27 tài khoản gắn đúng hồ sơ cùng tên. Còn: thêm email thật khi có (nút "Thêm email"); 6 tài khoản talent cũ mang email thử (hhhhh@ / test@ / hostesttt@…) — nếu là người thật thì Đặt lại MK + gửi lại. Chưa đo: một lần giao ca THẬT đầu-cuối.
00000000. **0143 ĐÃ CHẠY 06/10** (user xác nhận). Sửa 27 chỗ trùng người T10 (Bảng Vận Hành → khối đỏ "chỗ trùng người", hoặc Việc cần làm) — 0143 KHÔNG chặn ca trùng sẵn,
   chỉ chặn lần ghi đưa người vào ca/dời giờ; 32 ca Franklin Shopee T10 chưa có phòng (đặt phòng mặc định ở CRM → Hợp đồng & giá, ca đã tạo thì Sửa ca).
   **Lịch + giao ca 2 sàn — đề xuất** https://claude.ai/artifact/J4Kk16eZYeTtrkKDYvQWpY: Đợt 1 + Đợt 2 XONG, Đợt 3 có màn cấp tài khoản (§1). Còn: **Đợt 3** user cấp tài khoản cho host/trợ — user chốt 06/10 **CHUYỂN THẲNG sang app, KHÔNG chạy song song Google Sheet**
   (nên Đợt 2 phải xong + verify kỹ trước khi phát tài khoản; GMV mất thì lấy lại từ đối soát, OT/sự cố thì không) · **Đợt 4** checklist cuối tháng
   7 kênh ở Điều Phối Phát Hành, chia ca nối theo số giao ca, ước tính số chốt (sau backtest). User chốt 06/10: ca không có trợ ⇒ **OP giao ca**;
   host/trợ dùng điện thoại riêng được. Số đo nền: lịch sử `## Lịch 2 sàn — khảo sát + Đợt 1 (2026-10-06)`.
0000000. **0139–0142 đã chạy 06/10.** Việc còn lại của user: lập Kế Hoạch Tháng + target cho từng sàn (VERA/JOCKEY/Franklin Shopee);
   nhập hợp đồng ở CRM → "Hợp đồng & giá" (chọn sàn); up file Ads Shopee các tháng/brand khác ở Nhập Ads (chọn Shopee — VERA T9 đã có). Phần 0139: Sau đó: up 4 file Shopee mỗi tháng/brand ở Dữ Liệu Gốc → chọn Shopee (VERA/JOCKEY T6–T9; Franklin Shopee từ T10); đối soát ca Shopee bằng Live List ở Đối Soát (chọn brand + sàn Shopee); tạo + phát hành Report Shopee ở Report Tháng (nút Shopee). Chưa có file Shopee tháng 6, 7, 8 nào; JOCKEY chưa gửi file. Shopee không có Ads/khuyến mãi/GMV trực tiếp–gián tiếp (ghi trong "cách tính" của report).
000000. 29 ca chưa host (user tự rà và gán sau): CROCS 21 (8 ca T6–T9 chờ user gửi, 11 ca 01–04/10, 21–22/10 11–14), VERA 7 (25/09, 26/09, 06/10, 18/10, 24/10, 25/10, 30/10), Franklin 26/09.
00000. CROCS T10: user tự gán host cho các ca (gồm 11 ca 01–04/10 và 21/10, 22/10 11–14); tên thật của Mia/Su/Đạt; hồ sơ talent Hoàng Dung. Sửa target tạm 5,5 tỷ của Kế Hoạch Tháng nháp trước khi chốt (user bảo để yên tạm thời).
0000. Up file Ads (TikTok Ads → "Campaign overview data", xem theo ngày, mỗi file một tháng) cho các tháng/brand khác
   có chạy Ads ở Nhập Ads — Franklin T8 để report T9 có cột so tháng trước. Muốn có "% ngân sách Ads" như deck
   Franklin thì chốt chỗ nhập ngân sách (đề xuất: Kế Hoạch Tháng).
000. Muốn bỏ 3 phiên "cần xem lại" của CROCS T9 (lô cũ khớp theo luật trước 0136): up lại file Creator Live
   Performance T9 ở Dữ Liệu Gốc (CROCS) rồi bấm "Đối soát" ở lần tải đó và Áp dụng.
00. **Chọn KAM thật + nhập SĐT người đại diện cho 4 brand ở CRM** — 0134/0135 (đã chạy 05/10) xoá hết liên hệ/KAM mẫu,
   nay cả 4 brand "KAM: Chưa chọn", đại diện chỉ còn tên (Stan, Tuấn, Mai, Khanh).
0b. **Sentry chưa cấu hình** (`/api/health` → `sentryConfigured: false`): lỗi phía người dùng không ai thấy. Muốn có thì
   tạo project Sentry, đặt `SENTRY_DSN` trên Vercel.
1. **Nạp lịch sử T6–T9 cho 4 brand — user chốt 05/10:** JOCKEY/VERA/Franklin CÓ live T6–T9 và có sheet vận hành ⇒ nạp bù
   như CROCS; Report T6–T9 mọi brand PHÁT HÀNH (đóng sổ) sau khi đủ số + gán host xong (**CROCS T7 đã phát hành 05/10**);
   ca T10 (kể cả 01–05/10) tạo thành ca THẬT, user tự nhập — KHÔNG nạp bù T10 (ca `is_backfill` không vào Finance).
   User 05/10: chốt TRỌN CROCS trước, 3 brand kia user tự up sau. **CROCS T9 đã đủ 01→30/09 (05/10):** up file Creator
   Live Performance tháng 9 (export 05/10, 65 room) vào ô tháng 9 + Sinh 18 ca + Đối Soát lô CROCS ⇒ 65 ca, GMV
   5.217,1M = tổng file (số 01–22/09 lên +159M vì export mới hơn). Lô full cũ 01/06→22/09 vẫn ở ô tháng 6 ⇒ 2 lô chồng
   tháng 9 — an toàn nhờ `dedupeRoomsAcrossBatches` (creatorLivePerfSlice.ts: trùng Room ID giữa các lô thì lấy lô up
   sau). **Còn thiếu để phát hành CROCS T6/T8/T9:** host cho 8 ca (06/10 đã tách + gán nốt từ Working File, xem mục 1) — 27/06 19:59–23:59, 11/08 19:57–20:07,
   16/08 11:00–14:00, 23/08 13:10–15:01, 18/09 22:15–23:05, 22/09 11:01–14:01, 23/09 09:00–13:10 và 13:11–00:31 (file
   không có dòng ca hoặc chỉ phủ một phần) — user gửi; 5 file shop T9 (Khuyến Mãi, Sản Phẩm, Shop Analytics, Live
   Performance, Live Analysis) mới tới 21–22/09. Cách Claude up file: chạy `liveops-prod` (localhost:3100, đã đăng nhập
   admin, nối DB thật), chép file vào `dist/__upload/` rồi `fetch` cùng origin + gán vào `input[type=file]` — xoá file
   sau khi up.
   Franklin T9 đủ bộ có sẵn ở `~/Downloads` (export 03/10: Creator Live Performance 47 room 01→30/09, Khuyến Mãi,
   product_list_20260901, Core Stats, Shop Analytics_20261003) — chưa up.
   JOCKEY/VERA/Franklin: đã có ca T6→05/10 từ file Working File (05/10 tối, nhãn Tạm tính) — còn chờ file đối soát + tạo talent Mia/Su/Đạt/Dung/Trúc Như/Diễm Phương rồi gán host.
2. **Nhập giá + lương**: giá brand (đơn giá/giờ hoặc % hoa hồng, tỷ lệ hoàn huỷ) + hợp đồng ở CRM → "Hợp đồng & giá"; rate talent ở
   Talent Pool — đo 06/10: 0 hợp đồng, 1 dòng giá (JOCKEY = 0), talent rate = 0. Khối tiền của Dashboard CEO và Finance mới có số.
3. Gán host cho ca nạp bù CROCS còn thiếu: 8/263 ca (xem mục 1). Trợ live lưu ở `co_host_id`.

**Cần tài khoản/mật khẩu mà Claude không có:**
4. Góc nhìn role `brand` bằng JWT thật — DB chưa có tài khoản brand nào (M9 đã đo bằng harness props-only).
5. Thông báo `shift_assigned` / "số đối soát khác số ghi lúc giao ca" tới talent — RLS chỉ chính chủ đọc; tài khoản talent
   test không còn gắn hồ sơ talent sau đợt dọn mock.
6. Phiên đã đăng nhập mà thiếu dòng `profiles` trên production (trên replay đã đo: 0 dòng sau `0130`).
7. Nhánh `503 ai_not_configured` đầu-cuối; đợt fetch lúc đăng nhập của role talent/brand.

**Hoãn có chủ đích (có lý do, không phải quên):**
8. Gộp menu / IA — chờ số liệu `ui_tab_views`. Đo 04/10: 1.309 lượt mở đều của MỘT tài khoản (admin — phần lớn là các
   phiên Claude verify) ⇒ chưa có tín hiệu nào; cần người dùng thật khác vài tuần.
8b. Cột/bảng client KHÔNG còn đọc/ghi — drop sau khi đếm dòng trên production (khuôn 0126/0132): bảng `brand_affiliate_plans`;
   `brand_monthly_reports`: `plan_target_gmv/nmv/hours`, `plan_pct_*` (04/10), `ads_spend`, `roas`, 3 cột ghi chú (05/10), `camp_*_start/end/target_gmv`
   (06/10, gộp cấu hình); `session_finance`: `agency_commission_rate`, `ads_cost` (06/10, pnl.ts không đọc), `host_fix_rate_override`,
   `host_commission_rate_override` (không UI nào ghi, pnl.ts vẫn đọc — bỏ cùng lúc drop); `talents.commission_rate` (06/10, không ô nhập; pnl.ts vẫn đọc,
   mọi dòng 0). `talents.availability_status`/`studios.status` giữ (chỉ còn giá trị nền Available/Bảo trì).
9. Tích hợp TikTok API tự động — chờ scope Developer/ISV ở Partner Center. Lịch sử trước T7/2026: không có nguồn.
10. Zalo OA worker gửi `notifications` (cần user đăng ký OA doanh nghiệp; memory `liveops-zalo-notification-plan`).
11. Module tạo ca P2/P3 (khung lịch tuần theo brand, hiệu lực theo hợp đồng) — đã phân tích 19/09, chưa chốt làm.

**Bị auto-mode chặn, không đi đường vòng:** đọc vô danh hàng loạt bảng trên production ("Production Reads"); `git push`
đôi khi bị chặn ("Out-of-Place Publication") — khi đó để user tự push.

## 3. Kiến trúc

- **Stack:** React 19 + Vite 6 + Tailwind 4 (client) · Express (API, `src/server/createApp.ts`) · Supabase (Postgres + Auth
  + RLS). Deploy Vercel: frontend tĩnh từ `dist/`, `/api/*` → `api/index.ts` (Node ESM từng file, KHÔNG bundle).
  `server.ts` chỉ cho dev (`npm run dev`, Vite middleware) và Node truyền thống (`npm start`, phục vụ `dist/`).
- **Workspace (Bước 3 đa sàn, 07/10):** switcher trên Header = **Agency** (ceo/admin/operations, mọi brand, mọi kênh) + **một mục mỗi
  brand** (CROCS, JOCKEY, VERA, Franklin; kênh của brand ghi cạnh tên). Role `brand` khoá vào brand của mình qua `assigned_brand_id`, không
  có switcher. **Sàn KHÔNG phải workspace:** sidebar không đổi khi đổi sàn; màn theo sàn có thanh **"Sàn"** đầu nội dung (`ChannelBar`),
  phạm vi khai ở `TAB_CHANNEL_SCOPE` (appNav): `"all"` = Dashboard CEO, Sổ Ca, Hiệu Suất Host, Toàn Cảnh Brand, Điều Phối Phát Hành, Lịch +
  Sổ Ca brand — thêm "Tất cả kênh" (agency: `perPlatformBlocks` xếp khối riêng từng sàn; Sổ Ca: số vận hành cộng, GMV/đơn/GMV giờ ghi
  từng sàn; Dashboard có thêm `AgencyChannelSummary` = ca/giờ/tiền toàn agency + GMV từng kênh, cộng trong một sàn); `"one"` = Kế Hoạch
  Tháng, Hỗ Trợ Vận Hành và các tab brand còn lại (Dữ Liệu Gốc gồm cả đối soát). State: `agencyChoice/agencySingle`, `brandChoice/brandSingle` →
  `resolveChannelScope` (reportPlatform.ts); URL `?san=tiktok|shopee|tat-ca`. Tab không có nguồn ở một sàn (hồ sơ `hiddenBrandTabs`) chỉ
  ẩn khỏi sidebar khi MỌI kênh của brand đều không có nguồn; thanh sàn chỉ liệt kê sàn hợp lệ cho tab.
  Có URL route (`src/lib/routes.ts`): `/so-ca`, `/brand/crocs/report-thang`…
- **Nguồn sự thật của menu:** `agencyNavGroups()`/`brandNavGroups()` ở [src/lib/appNav.ts](src/lib/appNav.ts). Ảnh chụp:
  - Agency: Dashboard (Bản Tin CEO) · Lập Kế Hoạch (Kế Hoạch Tháng; "Nhân sự ca" đã bỏ 08/10 — chốt người ở Bảng Vận Hành) · Vận Hành Hằng Ngày (Bảng Vận Hành, Lịch & Studio — tách tab con
    thành mục riêng 07/10, id `studio_calendar`, `opsView` đã gỡ —, Sổ Ca; Hỗ Trợ Vận Hành đã gộp 08/10 thành khối thu gọn cuối Bảng Vận Hành, `OpsSupportTab` tự chọn brand × sàn, link cũ `/ho-tro-van-hanh` và activeTab lưu `ops_support` chuyển về `calendar`) · Phân Tích (Hiệu Suất Host, Toàn Cảnh Brand, Điều Phối Phát Hành) · Tài Nguyên (Talent Pool,
    Studios & Gear) · Kinh Doanh (CRM — gồm "Hợp đồng & giá", TikTok API) · Tài Chính (Finance & P&L — khoá cứng
    ceo/admin) · Hệ Thống (Phân Quyền & Role; AI Training Center — chỉ admin). Talent chỉ thấy: Ca Của Tôi, Đăng Ký Ca (`TalentShiftSignup`, id `shift_scheduling`), Hồ Sơ.
    (Kinh Doanh chỉ còn CRM + TikTok API — "Cam Kết Hợp Đồng" gộp vào CRM/Kế Hoạch Tháng 06/10.)
  - Brand: Dashboard · Lịch Vận Hành · Sổ Ca · SKU Showcase · Report Tháng (toggle Tháng/Tuần) · Hợp Đồng (chỉ đọc: cam kết + giá)
    · Kế Hoạch Tháng Sau (chỉ đọc + xác nhận) · Affiliate · Nhập Ads + Dữ Liệu Gốc (ẩn với role brand).
- **Mã nguồn:** `src/App.tsx` (state + handler + render tab, ~2.000 dòng) · `src/hooks/useWorkspaceData.ts` (mọi lượt nạp
  lúc đăng nhập, gate theo role/tab) · `src/components/*` (mỗi tab một chunk lazy qua `lazyNamed`) · `src/lib/db/*` (đọc/ghi
  Supabase) · `src/lib/{performance,report,scheduling,dataraw,liveSnapshot}` (logic thuần, có test) · `tests/*.test.ts` ·
  `scripts/find-dead-code.mjs` (`npm run audit:dead`).
- **AI:** chỉ còn 1 tính năng — chấm điểm ghép host (`/api/gemini/match-talents`, tab Talent Pool; prompt `talent_matcher`
  sửa ở AI Training Center). Production đã có `GEMINI_API_KEY` (`/api/health` báo `geminiConfigured: true`, 02/10); thiếu key thì 503 `ai_not_configured`, UI nói "chưa bật".
- **Đã gỡ khỏi app (đừng dựng lại bản cũ):** Dashboard KPI dự phóng cũ, Toàn Cảnh Agency, Live Sessions Hub, Module
  Campaign, Price List, Co-Funded Voucher, Hoá Đơn & Công Nợ, AI Script Gen, Simulator, Hội Đồng AI, Workflow Automation
  Rules, Report Tháng Chuyên Sâu riêng (đã gộp), Hỗ Trợ Vận Hành riêng (đã gộp vào Dashboard brand), 3 bảng con của ca.

## 4. Luồng dữ liệu

0. **CRM → "Hợp đồng & giá"** (một lần mỗi brand × sàn, chỗ nhập DUY NHẤT): cách thu phí, giá (`brand_platform_rates`), hợp đồng
   (`brand_contracts`; lưu đang hiệu lực ⇒ `generate_contract_commitments` đổ `brand_monthly_commitments` từng tháng), phòng mặc định
   (`brand_studios`). Số riêng của một tháng sửa ở Kế Hoạch Tháng (`upsertMonthlyCommitment`, `is_override` = khác điều khoản hợp đồng).
1. **Kế Hoạch Tháng** (`brand_month_plans` + `_slots`): ops lập lưới ca + target từng ca → **Chốt** (`lock_month_plan`) sinh
   `shift_slots` mở → talent đăng ký rảnh (RLS 0133: chỉ ca còn mở, chưa qua ngày) → ops chốt người qua RPC
   `finalize_shift_slot` (0133: một transaction, khoá dòng slot, từ chối slot không còn mở) ⇒ `live_sessions`. Kế hoạch
   đã chốt: ca đã chốt người không dời/bỏ trong lưới, ca ngày đã qua giữ giờ + target (trigger `trg_guard_locked_plan_slot`);
   không còn "Lưu nháp"/"Gợi ý"/"Chia lại target"/"Xoá hết" — chỉ "Chốt lại". Lưới cảnh báo trùng phòng với brand khác +
   số ca song song toàn agency (`crossBrandCheck`, chỉ đề xuất).
2. **Số liệu ca — 3 bậc tin cậy** (`live_sessions.data_source`): `manual` (talent tự khai qua report ca) < `live_snapshot`
   (trợ live up file Creator-Live-Performance lúc giao ca, 0078) < `tiktok_reconciled` (ops đối soát cuối kỳ, 0080).
   Snapshot là thứ DUY NHẤT giữ ranh giới giữa 2 ca chung một Room ID (số cộng dồn) — luật ở §5.6.
3. **Dữ Liệu Gốc (Dataraw):** ops tải tay 6 loại report Excel (Seller Center / Streamer), upload theo brand + tháng
   (1 batch / brand / loại / tháng, 0077). Dùng cho Report Tháng (phần shop), Affiliate, nạp bù ca. Loại thứ 7
   `ads_campaign_overview` (0137, file TikTok Ads) dùng chung kho nhưng tải/xoá ở Nhập Ads; Report Tháng đọc
   qua piece `ads` của bản chụp (tháng report + tháng trước). Ads theo ca (`live_session_reports.ads_cost`) chỉ còn cho
   lãi/lỗ từng ca ở Finance, là một phần của file — không cộng hai số.
4. **Report Tháng** đọc **bản chụp** (`brand_monthly_report_snapshots`, 0119) do ops bấm Tạo/Cập nhật — mở report không tính
   lại. 7 phần: Kết luận · Thị trường hay vận hành · Vì sao · Sản phẩm · Host · Campaign & khung giờ · Tháng sau. Phát hành
   cho brand qua RPC; brand chỉ thấy số của tháng đã phát hành (view `live_sessions_secure`, 0107). **Phát hành = đóng
   sổ** (0133): chỉ phát hành tháng đã hết; tháng đã phát hành thì mọi ghi số/lịch/người/loại/huỷ/thêm/xoá ca của
   brand-tháng đó bị trigger `trg_guard_published_month_sessions` chặn (trừ vòng đời Upcoming→Completed) — muốn sửa thì
   thu hồi report. Điều Phối Phát Hành kiểm độ mới bản chụp trước khi phát hành (cũ ⇒ hỏi cập nhật rồi mới phát hành).
   **Đối soát** (0133): mỗi lô gắn MỘT brand (chọn trước khi up), chỉ khớp ca của brand đó; dòng thiếu giờ không khớp ca
   nào; lô cũ không gắn brand ⇒ `apply_live_reconciliation` từ chối.
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
  CI (GitHub Actions) chạy KHÔNG có `.env`: test nào import (kể cả gián tiếp) `supabaseClient` phải
  `vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }))` — local có `.env` nên vẫn xanh. Thử như CI:
  `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vitest run`. (CI đỏ liên tục từ trước 3ed3b30 tới b901273 vì
  rhythm/watchSeconds thiếu mock — vá 04/10.)
- **Không giữ code "phòng khi cần lại"** (màn ẩn, kiểu "làm tài liệu", re-export "để import cũ không đổi") — git giữ lịch sử.
  **Tính năng chỉ có UI mà không có phần chạy thật thì gỡ** — "Đã chạy N lần"/"Giả lập…" là hứa sai với người dùng.
- **Trước khi tối ưu, đếm dòng thật trên production** — từng song song hoá một thứ lẽ ra nên xoá (3 bảng con 0 dòng).
- Test mới đặt ở `tests/*.test.ts`. Mutation test phải xác nhận mutation rơi ĐÚNG DÒNG.

### 5.2 Client (React / TS)
- Nhãn vai trò talent qua `talentRoleLabel` (lib/talentName.ts) — DB lưu "Assistant", màn hình nói "Trợ live".
- `strict` + `noUnusedLocals` bật; `@types/react*` phải có trong devDependencies (thiếu là JSX thành `any`, CI xanh giả).
- **Cho người mới (audit 04/10 tối):** (1) mỗi thông tin MỘT chỗ nhập — màn khác chỉ hiện để đọc + nút sang chỗ nhập. Bản đồ chỗ
  nhập (06/10): điều khoản thương mại + phòng mặc định ⇒ CRM "Hợp đồng & giá" (nút từ màn khác: `requestCrmFocus(brand, sàn)` + `navigateTo("crm")`
  bung sẵn đúng khối); giờ/GMV cam kết + target + khung camp của một tháng ⇒ Kế Hoạch Tháng; rate talent ⇒ Talent Pool; Ads tháng ⇒ file ở
  Nhập Ads, Ads theo ca ⇒ report ca; chi phí studio theo ca ⇒ Finance. Thứ app suy được (trạng thái phòng/talent đang live) KHÔNG có ô gõ;
  (2) form không điền sẵn giá trị mẫu, không có fallback "Nguyễn Văn A"; không có ô gõ tay cho số app tự tính được;
  (3) ngày/tháng hiển thị qua `fmtMonth`/`fmtDateVn`/`fmtPeriodLabel` (lib/format.ts), không in `2026-10`; (4) mỗi con số
  ghi kỳ + cách đếm ngay cạnh, không vá bằng câu chú thích ở màn khác; (5) ô "chưa có" kèm nút tới chỗ nhập
  (`App.navigateTo(tab, brandId?)`); (6) bước nhập liệu mới mà thiếu thì làm hỏng màn khác ⇒ thêm một việc vào
  `lib/todoList.ts`; thuật ngữ mới ⇒ thêm vào `GlossaryDialog.tsx`; (7) không chữ tiếng Anh/kỹ thuật lộ ra (Completed,
  Supabase, batch, "Chưa có dòng"…) — tên chỉ số thì vẫn theo `metricGlossary.ts`.
- **Tab mới phải vào `TAB_CHUNKS`** (App.tsx; `tests/bundleSplit.test.ts` canh) để chunk tải song song với dữ liệu. Component
  lazy lồng trong tab mà chỉ hiện sau một lượt đọc ⇒ gọi `X.preload()` cùng lúc bắn lượt đọc (khuôn `MonthlyReportTabs`).
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
- **Nạp trước lượt đọc của màn** (`lib/db/prefetch.ts`, test `tests/prefetch.test.ts`): màn export `prefetchX(ctx)` khai
  `prefetchable(name, fn)` và effect MOUNT gọi `.take(...)`; App gọi qua `TAB_DATA_PREFETCH` CHỈ khi `!coreDataReady`.
  Giao đúng một lần, hết hạn 30 s, đổi tab là xoá — KHÔNG phải cache: đường đọc-sau-khi-ghi luôn gọi thẳng hàm db.
  Hai component không được `take` cùng key — truyền dữ liệu xuống bằng prop. Lượt đọc DÙNG CHUNG nhiều màn định nghĩa
  MỘT lần cạnh hàm db (`planStatusesRead`, `monthPlanRead`, `commitmentsRead`…) — test cấm trùng tên `prefetchable`.
  Màn mount sau một lượt đọc của cha (khuôn `ReportPlanningInputs`) thì cha gọi `prefetchX` cùng lúc lượt đọc của nó.
  App xoá kho trong `useLayoutEffect` khi đổi tab (effect thường của con chạy TRƯỚC cha ⇒ sẽ xoá nhầm).
- **Đọc ca = `fetchAllSessionRows`** (sessions.ts): đợt trang song song + cột tường minh `SESSION_READ_COLUMNS` (test `pagedQueries` canh khớp `sessionFromDb`). Thêm cột vào
  `sessionFromDb` thì thêm vào danh sách. Màn có ô chọn file Excel gọi `preloadSpreadsheetReader()` lúc mở (xlsx là chunk động 500 KB).
- **Cổng dữ liệu theo tab:** `tabDataReady` (App.tsx) = `shellDataReady` cho tab trong `TABS_NEEDING_SHELL_ONLY` (appNav.ts), còn lại `coreDataReady`. Thêm tab vào tập đó chỉ khi nó không đọc
  `sessions`/`talents`/`monthlyReports` ngoài khối tự chờ `coreReady` — không vẽ "0 ca" giả; test `tests/shellOnlyTabs.test.ts`.
- **Tab lazy chỉ qua `lazyNamed`** (không `React.lazy` trực tiếp): chunk đã tải thì render thẳng, tránh fallback
  Suspense bị React giữ 300 ms (`tests/lazyNamed.test.ts`, mutation đã thử).
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
  `profiles` là ngoại lệ còn sót từ 0012 — đã bịt bằng trigger `guard_profile_update` (0136): thêm cột mới vào
  `profiles` mà người dùng KHÔNG được tự đổi ⇒ thêm vào danh sách so sánh trong trigger đó. Admin chỉ do Admin cấp/thu.
- Khớp khung giờ (đối soát, snapshot) dùng giao nhau MỞ (`<`, `>`): chạm mép không tính (0136).
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
**Đa sàn (lộ trình 07/10, bắt buộc):** (1) brand chạy sàn nào = bảng `brand_channels` qua `lib/channels.ts` (`platformsOfBrand`), KHÔNG suy
từ ca/phòng; thêm kênh chỉ ở CRM; DB chặn dòng của kênh chưa tạo (0149). (2) Khác biệt giữa sàn = hồ sơ sàn `profileOf(...)`
(`lib/platforms/profiles.ts`) hoặc `Record<ReportPlatform, …>` (REPORT_ENGINES, REPORT_VIEWS, ADS_PANELS, RECON_FILE_READERS) — không viết
`=== "Shopee"` ngoài `lib/platforms/`, `lib/reportPlatform.ts`, `server/` (`tests/platformProfiles.test.ts` quét). (3) Màn theo sàn khai
ở `TAB_CHANNEL_SCOPE`; "all" = khối riêng từng sàn, không có số hiệu suất gộp (`tests/noCrossPlatformPerf.test.ts`). (5) Tên chỉ số Shopee = tên cột file Shopee qua `METRIC`, không dịch/tự đặt, không mượn tên TikTok (AOV→ABS, Views≠Viewers); chỉ số file không có thì KHÔNG hiện. (4) Nguồn số đọc bậc
qua `dataSourceTier` (lib/dataSource.ts), không so chuỗi `data_source`.
**Sàn (06/10) = một chiều ngang hàng brand:** khoá Map dùng `brandMonthKey(brand, tháng, sàn)` (TikTok giữ khoá cũ `brandId|YYYY-MM`,
Shopee thêm `|Shopee`) và `brandPlatformKey(brand, sàn)` (Map kế hoạch theo tháng); sàn brand đang chạy = `brandPlatformsOf`; lọc =
`inPlatformScope`. Mọi phép so (target, run-rate, benchmark, xếp host, engine) chỉ trong MỘT sàn; **KHÔNG số hiệu suất nào cộng hai sàn (kể cả GMV, đơn — user chốt 07/10)**; cộng số hiệu suất của mảng có thể lẫn sàn ⇒ `sumByPlatform` (lib/platforms/perf.ts); hàm tổng hợp nhận ca ⇒ `assertOnePlatform`; file mới muốn cộng tay ⇒ vào `SINGLE_PLATFORM_FILES` của `tests/noCrossPlatformPerf.test.ts` kèm lý do.
Đọc kế hoạch/hợp đồng bằng `select *` rồi lọc sàn phía client (thiếu cột = TikTok). Bộ chuyển sàn chỉ một chỗ: App (`PLATFORM_TABS`);
màn con nhận `platform` qua prop, không tự giữ state sàn. Nút sang Kế Hoạch Tháng nhớ sàn qua `rememberBrandId(brand, sàn)`.
Sàn của report = `lib/reportPlatform.ts` (`ReportPlatform`); mọi đọc/ghi report và bản chụp đi qua `lib/db/monthlyReports.ts` / `monthlyReportSnapshots.ts` với tham số `platform` (mặc định TikTok — TikTok giữ nguyên khoá nạp-trước, chỉ truyền sàn khi là Shopee). Ca/đối soát/phát hành luôn lọc theo sàn của ca, không trộn.
Tài khoản chưa có email = email nội bộ qua `lib/loginName.ts` (`isAliasEmail`/`loginLabel` khi hiện, không gửi thư tới đó). Tài khoản cho người ĐÃ có hồ sơ talent = `TalentAccountGrants` (`assignedTalentId`, server chặn hồ sơ đã có tài khoản); đường `newTalentProfile` chỉ cho người mới.
Trùng người = `personClash` (một người, lúc sửa) / `findPersonClashes` + `clashedSessionIds` (quét cả lịch) trong `scheduling/conflicts.ts`, DB
chặn bằng 0143 cùng luật — đừng viết vòng so giờ riêng.
Nhãn sàn trên một ca = `<PlatformChip>` (components/common). Giao ca = `lib/handover.ts` (đọc link, phần của ca, ai giao) + RPC 0144 — regex
link giữ GIỐNG HỆT `private.parse_dashboard_link` (test canh); số của ca nối chỉ tính ở `private.apply_handover_chain`, client chỉ xem trước.
Ai đứng ca nào, bao lâu = `lib/staffSegments.ts` (`effectiveSegments`, `personRoleMinutes`, `personWindows`, `roleShares`) — ca không có đoạn thì host_id/co_host_id làm cả ca; mọi màn tính lương/giờ/trùng lịch/hiệu suất theo người PHẢI đi qua đây (hoặc `computeSessionPnl().payouts`, `hostPortions`), không đọc `hostId`/`coHostId` thô cho số liệu. "Ca có số" = `isCountable` (hostPerformance) · ca tính tiền = `isPnlSession` (pnl, từ 04/10 đòi `hasLiveEvidence`) · ca
đã diễn ra thật = `hasLiveEvidence`, ca quá giờ chờ xác nhận = `isUnconfirmedPast`, ca có số ở DB (khoá dời giờ) =
`hasSessionData` (cả ba ở sessionStatus) · khung camp hiệu lực = `effectiveCamp(planCamp)` (campaignDays — MỌI
màn; chỉ khung của Kế Hoạch Tháng, thiếu khung thì lịch cố định — 06/10 bỏ ô Nhập Ads cho tháng không có kế hoạch) · đã có giá =
`brandPriceSet`/`brandPriceLabel` (lib/brandPricing.ts) · cam kết của một tháng = `monthCommitmentOf` (dòng tháng thắng `contractCovering`) ·
rate talent đang áp = `talentRateLabel` · tháng mở sẵn của màn = `lib/defaultMonth.ts` (xem số: tháng gần nhất có ca;
Report/Nhập Ads: tháng đã hết gần nhất; Kế Hoạch Tháng: tháng này nếu brand đang mở còn nháp) · việc cần làm =
`buildTodos` (lib/todoList.ts) · dự kiến cuối tháng = `projectMonthEnd` /
`MonthOutlook` · trùng lịch = `personClash`/`studioClash` (scheduling/conflicts) · giờ kế hoạch = `sessionDurationHours`, giờ
live = `sessionHours`. GMV/giờ đem NHÂN với giờ lịch thì chia trên giờ kế hoạch; GMV/giờ BÁO CÁO chia trên giờ live. Thước
đo xếp host là **GMV/giờ**, không phải GMV/ca. Cam kết hợp đồng đếm **giờ ca theo lịch** (kể cả ca GMV 0 đã có bằng chứng diễn ra), loại ca huỷ và ca chờ xác nhận.

### 5.6 Luật nghiệp vụ đã chốt
- **Đa sàn (07/10, luật cứng):** dữ liệu gốc TikTok và Shopee khác hoàn toàn (file, cột, đơn vị dòng: TikTok một phòng / Shopee một phiên;
  GMV TikTok gồm huỷ/hoàn, Shopee = doanh số đặt). Không gộp parser/kho. **Không cộng, gộp, trung bình hay xếp hạng gộp chỉ số hiệu suất
  giữa hai sàn**; màn xem nhiều kênh đặt khối TikTok | Shopee cạnh nhau. Cộng được: số vận hành (ca, giờ, người, phòng) và tiền agency.
- **Ads (05/10):** nguồn duy nhất = file TikTok Ads theo ngày (`ads_campaign_overview`). ROI = doanh thu gộp ÷ chi phí
  (cùng cách TikTok). Doanh thu gộp tính trước huỷ/hoàn (Franklin T9: 798tr > GMV shop 771tr) ⇒ KHÔNG trình bày như %
  GMV, không cộng vào GMV. Chưa có ngân sách Ads dự kiến trong app (deck Franklin có "95,3% ngân sách" — user chưa chốt
  nhập ở đâu, chỉ số đó chưa có).
- **Run-rate chỉ tính bằng `planRunRate`** (28/09): target = Σ target ca của Kế Hoạch Tháng đã chốt (không chia lại khi lịch
  đổi); ca kế hoạch huỷ GIỮ target; ca ngoài kế hoạch target 0; ca thêm vào lưới sau khi chốt nhận target = dự báo.
- **Report Tháng là nơi DUY NHẤT nói số một tháng SAU khi hết tháng** (đọc bản chụp; so cùng kỳ cắt 1..N khi tháng chưa hết).
  Dashboard brand là màn TRONG tháng, dùng chung hàm. Phân tích mới thì thêm vào 1 trong 7 phần, không dựng trang riêng.
- Số "live agency" lấy TỪ CA; Shop Analytics "Linked account" chỉ dùng cho vế "phần còn lại của shop". File Live Performance
  Core Stats gồm cả creator affiliate — không dùng làm số agency. CTOR = Orders ÷ Product clicks. Kết luận về host cần
  khoảng tin cậy nhiều tháng (phân phối t). So sánh cắt theo **ngày cuối có số**, không theo lịch.
- **Luật vòng đời (04/10, audit logic):** ca quá giờ không bằng chứng (số/report/giờ live/nạp bù) KHÔNG tính là đã giao
  giờ cam kết, KHÔNG vào lương/doanh thu — hiện "chờ xác nhận" ở Finance, Cam Kết, Bảng Vận Hành, Cửa sổ Ca Live; role brand
  tháng chưa phát hành (view che số) vẫn tính như cũ. Ca "loại khỏi báo cáo": vẫn trả công theo giờ, bỏ doanh thu +
  hoa hồng theo GMV (`SessionPnl.excluded`); Finance/Thu nhập talent đọc `sessions` (gồm ca loại), màn phân tích/brand
  vẫn `activeSessions`. Target tháng chỉ nhập ở Kế Hoạch Tháng; ô "Kế hoạch tháng sau" của Report đã bỏ (04/10 tối),
target khung camp ở Nhập Ads bỏ 06/10 — tháng không có kế hoạch chốt thì không có target (ca giữ số DB). Sửa ca
  (`update_session_with_children`) chỉ ghi cột lịch + người, trạng thái DB tự suy, ca có số không dời ngày/giờ. Kéo-thả ca
  sang ngày khác kiểm trùng người/phòng, chặn ca có số và ngày đã qua. Hợp đồng nháp không sinh cam kết; lưu hợp đồng đang hiệu lực ở CRM tự sinh lại (dọn
  tháng ngoài khung, giữ tháng sửa riêng ở Kế Hoạch Tháng). % hoa hồng agency chỉ theo giá brand × sàn (không sửa từng ca).
- Snapshot theo ca: chỉ 13 cột ĐẾM ĐƯỢC mới đem trừ, tỷ lệ tính lại lúc đọc; mốc ranh giới = **giờ kết thúc ca**
  (`session_boundary_at`); room thuộc ca khi khung giao nhau cả 2 đầu; up lại cho cùng ca = thay thế.
- Talent không bao giờ ghi đè số đã có snapshot/đối soát (RPC chặn). Thông báo "số khác số bạn báo" chỉ khi số cũ là
  `manual` và lệch ≥ 5%. Ca `is_backfill` không vào Finance. Planner/gợi ý chỉ ĐỀ XUẤT, không bao giờ tự chốt ngầm.

## 6. Hạ tầng Supabase

- 151 migration (`supabase/migrations/`) — **`0151` (chốt kế hoạch gắn vào ca đã nhập sẵn) ĐÃ CHẠY 07/10 (user xác nhận; chưa verify bằng lần Chốt thật);** **`0149` (kênh brand × sàn) và `0150` (bậc nguồn số giao ca gõ + ATC từ Live List) ĐÃ CHẠY 07/10;** `0147` (số lúc đổi host, Shopee gõ) ĐÃ CHẠY, **`0148` (TikTok up file lúc đổi host) ĐÃ CHẠY (đo 07/10);** `0145` (giao ca TikTok bằng file) ĐÃ CHẠY 06/10; `0144` (giao ca) ĐÃ CHẠY 06/10; `0143` (chặn trùng người) ĐÃ CHẠY 06/10; **`0139`–`0142` (report / kế hoạch / hợp đồng theo sàn, file Ads Shopee) ĐÃ CHẠY 06/10**;, chạy tay theo thứ tự — **`0138` (đổi người giữa ca) ĐÃ CHẠY 06/10.** `0137` đã chạy 05/10. **`0136` ĐÃ CHẠY 05/10** (verify production: lô đối soát thử với phòng kết thúc đúng phút ca CROCS 30/09 11:01 bắt đầu ⇒ không khớp, phòng chồng 29 phút ⇒ khớp; lô thử đã xoá; trigger profiles nằm trước đoạn đó trong cùng file + chốt tự kiểm cuối file), bộ kiểm
  `supabase/tests/0136_profile_guard_recon_edges_lock_past.sql` (replay, DB trắng): 16 OK, đỏ khi thiếu 0136. **Tới `0132` đều ĐÃ CHẠY** (0131 + 0132 ngày 02/10);
  **`0133` ĐÃ CHẠY 04/10** (verify ở §1); **`0134` ĐÃ CHẠY 05/10** (verify: CRM không còn SĐT mẫu); **`0135` ĐÃ CHẠY 05/10** (verify: 4 brand KAM "Chưa chọn", form sửa cũng "Chưa chọn"). Lô đối soát cũ (06–09/2026, không gắn brand) không áp dụng lại được — đo
  04/10 nó chỉ khớp ca CROCS nên chưa có số nào bị chia nhầm. Replay `0001 → 0133`: sạch, chạy lần 2 không lỗi; bộ kiểm hành vi
  `supabase/tests/0133_workflow_integrity.sql` chạy trên bản replay (in `OK ...`, 34 mục).
  Replay `0001 → 0132` trên Postgres cô lập: sạch.
- `0132` bỏ: bảng `workflow_rules`, `session_skus`, `session_checklist_items`, `session_minute_metrics` (cả 4 đều 0 dòng trên
  production, đếm 02/10); hàm `replace_session_children`, `private.session_brand_id`, `private.session_month_published`;
  enum `checklist_category` + 4 enum mồ côi từ trước (`directive_*`, `project_status`). `update_session_with_children` giữ
  tên, 3 tham số con thành `default null` và bị bỏ qua. Đo trên replay: chỉ đúng các object trên biến mất, 4 view và mọi
  policy khác không đổi; chạy lần 2 không lỗi; bảng còn dòng thì migration dừng mà không xoá gì. **Verify trên production
  sau khi chạy:** 4 bảng + `replace_session_children` trả 404; `update_session_with_children` gọi 2 hoặc 5 tham số đều
  vào tới thân hàm (P0001 not found với id giả); Sổ Ca vẫn `47 ca · 177,8h · 3,52B`, 24/24 request của trang 200.
- Project Supabase chỉ phục vụ app này (`lpacyuwpkvuclxdnuauw`). Backup: GitHub Action `backup-supabase.yml` (pg_dump
  hằng ngày 03:00 UTC, artifact giữ 30 ngày, secret `SUPABASE_DB_URL` dạng Session pooler) — xanh từ 05/10; trước đó
  secret trỏ project cũ `licqfomsrjkavipomplz` nên chưa từng có bản nào.
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
| `## §1 các đợt 04–07/10 (chuyển khỏi WORKSPACE 07/10)` | nguyên văn §1 cũ: lịch 2 sàn, giao ca, cấp tài khoản, gộp cấu hình, tách sàn, đổi host, nạp Working File, audit 04–05/10 |
| `## Cắt vòng mạng nối tiếp (2026-10-03/04)` | 10 vòng mạng đã cắt (cache assets, TAB_CHUNKS, prefetch, lazyNamed, song song hoá) + chỗ còn lại có chủ đích |
| `## Giảm thời gian mở app (2026-10-07)` | số đo mạng/dung lượng, vì sao danh sách ca là cổ chai, kiểm kê ảnh hưởng nếu cắt cửa sổ ca, thiết kế cache bị hoãn, cổng theo màn |
| `## Gộp cấu hình một chỗ nhập (2026-10-06)` | số đo trước khi gộp, từng chỗ nhập trùng đã bỏ, luật mới (is_override, generateThroughMonth, effectiveCamp 1 tham số), cách verify |
| `## Tách sàn TikTok/Shopee — report (0139) + toàn app S1–S4 (0140–0142) (2026-10-06)` | nguyên văn mục §1 tách sàn: bộ chuyển sàn, Dashboard Tổng, kế hoạch/cam kết/Ads theo sàn, 4 file Shopee, VERA Shopee T9 làm thật, thứ tự deploy 0139 |
| `## Lịch 2 sàn — giao ca TikTok bằng file (0145) + Đợt 3 tài khoản (2026-10-06)` | nguyên văn mục §1 của 0143/0144/0145/Đợt 3 trước khi gộp; Đợt 3 cấp tài khoản cho hồ sơ có sẵn |
| `## Lịch 2 sàn — Đợt 2 giao ca (2026-10-06)` | 0144: giao ca, ca nối tự trừ, nhắc giao ca hẹn giờ, gỡ form report cũ — cách verify |
| `## Lịch 2 sàn — khảo sát + Đợt 1 (2026-10-06)` | số đo lịch/giao ca 2 sàn, Working File, số giao ca lệch số chốt, 0143 chặn trùng người |
| `## Audit toàn app lần 3 (2026-10-05)` | lỗ tự nâng quyền qua profiles (0136), backup sai project, đối soát chạm mép, chốt kế hoạch ngày đã qua, engine ô 1 phút, chữ/ngày lộ |
| `## Audit logic vòng đời (2026-10-04)` | 14 điểm gãy hợp đồng→report + cách sửa; 0133 (đối soát theo brand, chốt người 1 transaction, đóng sổ tháng, khoá ca kế hoạch đã chốt, đăng ký chỉ ca mở) |
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
