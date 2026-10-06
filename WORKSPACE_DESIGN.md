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

## 1. Giai đoạn hiện tại (cập nhật 2026-10-06 chiều)

- **CHẠY THỬ THẬT trên dữ liệu thật** (từ 2026-09-18; mock đã xoá sạch 19/09). DB: 33 hồ sơ talent thật, CROCS T6–T9 nạp
  bù từ file Creator-Live-Performance (229 ca, còn ca chưa gán host). **Không đề xuất tính năng mới**; hỏi user chạy thử
  tới đâu, cái gì kêu, rồi sửa đúng chỗ đó. **Không seed mock lại.**
- **Nợ kỹ thuật đã hết** (đợt P2a-2…P2a-21, 01–02/10) và **audit code chết đã xong** (02/10): `npm run audit:dead` báo 0,
  ESLint 0 lỗi (31 warning `set-state-in-effect` = nợ đã đo, cố ý `warn`), vitest 467/467 (05/10).
- **06/10 tối: LỊCH 2 SÀN — ĐỢT 2 "GIAO CA" (migration `0144` ĐÃ CHẠY 06/10, verify DB thật: link sai/sai sàn bị từ chối P0001 không ghi gì, `handover_previous` chạy, 52 lời nhắc hẹn giờ cho admin (ca không trợ), 0 hiện trước hạn; production đã có bản mới).** Thay dòng Google Sheet trợ live gõ mỗi ca (user chốt: chuyển
  thẳng sang app). Cửa sổ Ca → mục **Giao ca** (`HandoverForm`, cho điện thoại): dán link dashboard (`parseDashboardLink`: TikTok `room_id=`, Shopee
  `/live/<số>` ⇒ sàn + mã phòng/phiên, sai sàn thì chặn) · 3 số ĐANG THẤY (GMV, lượt xem, đơn TikTok / ATC Shopee; xu tuỳ chọn) · chạm chọn sự cố
  (OT/off sớm theo mốc phút, restart, host trễ) · ca nối: gõ số TỔNG, app tự trừ ca trước cùng phòng (RPC `submit_session_handover` +
  `private.apply_handover_chain` tính lại cả chuỗi khi giao/sửa ca giữa hoặc đổi link; số phải nằm giữa ca trước và ca sau). Người giao = trợ live
  (`co_host_id` hoặc đoạn trợ khi đổi người giữa ca), ca không trợ ⇒ OPS (`private.can_handover`). Số của ca vào `live_sessions` bậc 'manual'; ca đã
  snapshot/đối soát giữ số file. Cột mới ở `live_session_reports`: `live_ref, cum_gmv, cum_orders, cum_views, cum_atc, handover_at,
  handover_prev_session_id`. **Nhắc giao ca** không cần máy chủ hẹn giờ: thông báo `handover_due` tạo sẵn khi xếp ca với `created_at` = hết ca + 15
  phút (giờ VN), client chỉ đọc `created_at <= now()`, "đọc hết" không nuốt lời nhắc tương lai; giao xong thì xoá; đổi trợ/giờ thì tạo lại.
  **Gỡ:** form report cũ (`SessionReportForm`, `submitSessionReport`) và bước bắt buộc "up file Creator-Live-Performance" — file nay là đường phụ
  của OPS (chỉ TikTok, gập trong Giao ca). Bước còn thiếu của ca = **chưa giao ca → chưa đối soát** (`MissingStep` bỏ `snapshot`); Ca Của Tôi
  "Cần giao ca" chỉ liệt kê ca mình là trợ. Prop `onSubmitSessionReport` ⇒ `onSessionsUpdated(sessions[])`. Verify: lịch sử `## Lịch 2 sàn — Đợt 2 giao ca (2026-10-06)`.
- **06/10 chiều: LỊCH 2 SÀN — ĐỢT 1, `0143` ĐÃ CHẠY.** User chốt: một người (host HAY trợ) chỉ đứng MỘT ca tại một thời điểm. `PlatformChip` ở mọi
  dòng ca; `findPersonClashes` ⇒ khối đỏ Bảng Vận Hành, viền đỏ thẻ ca, banner Cửa sổ Ca, việc `person-clash`/`no-room`; chặn Lưu/Chốt Lịch khi đưa
  người vào ca thứ hai cùng giờ; trigger 0143 chặn ở DB (chỉ lần ghi đưa người vào/dời giờ; ca trùng sẵn vẫn sửa được phần khác); Tải Lịch Host tính
  cả trợ. Chi tiết + verify: lịch sử `## Lịch 2 sàn — khảo sát + Đợt 1 (2026-10-06)`.
- **06/10 sáng: GỘP CẤU HÌNH — mỗi điều khoản MỘT chỗ nhập (không migration).** User: nhập 2–3 nơi (rate card, cam kết…) ⇒ gom về
  CRM, cam kết tháng đặt ở Kế Hoạch Tháng, sửa luôn mọi chỗ cùng lớp lỗi. Nay: CRM → **"Hợp đồng & giá"** (`BrandConfigPanel`, brand × sàn:
  cách thu phí, giá, hợp đồng tự sinh cam kết từng tháng, phòng mặc định); tab Agency "Cam Kết Hợp Đồng" **đã gỡ**; Kế Hoạch Tháng có ô giờ/GMV
  cam kết của tháng LƯU THẬT; brand: "Cam Kết" + "Rate Card" gộp thành tab **"Hợp Đồng"**. Kèm: Finance bỏ ô % hoa hồng + Ads từng ca (lỗi ngầm:
  dòng Finance đóng băng 15%), Nhập Ads bỏ khung camp/target (chỉ Kế Hoạch Tháng), Talent Pool bỏ % hoa hồng + trạng thái gõ tay, Studios
  "Đang live" suy từ ca, một luật "đã có giá" (`brandPriceSet`). Verify: vitest 548/548, lint/tsc/build/audit sạch, replay +
  `supabase/tests/config_single_source.sql` 6/6, UI trên bản build nối DB thật (chỉ đọc). Chưa đo: ghi hợp đồng thật qua UI. Chi tiết: lịch
  sử `## Gộp cấu hình một chỗ nhập (2026-10-06)`.
- **06/10 khuya: TÁCH SÀN TOÀN APP (S1–S4) — migration `0140`, `0141`, `0142` ĐÃ CHẠY 06/10, code đã push + deploy (`71016d6`).** User chốt:
  hợp đồng **riêng** từng sàn, target **riêng** từng sàn, brand xem **cả riêng lẫn tổng**, chi phí Shopee có **file riêng**. Lý do đo
  được: VERA Shopee GMV/giờ ≈ 1,6× TikTok (T6–T9, Working File) ⇒ trộn sàn làm sai benchmark/xếp host/run-rate. Đã làm:
  **bộ chuyển sàn** Brand workspace (`PlatformScopeBar`, URL `?san=tiktok|shopee|tong`, `PLATFORM_TABS` ở App: Dashboard/Lịch/Sổ Ca có
  "Tổng 2 sàn"; Report/Kế Hoạch Tháng Sau/Cam Kết/Nhập Ads chỉ từng sàn); **Dashboard Tổng** (`BrandDashboardTotal`: mỗi sàn
  run-rate + dự kiến trên kế hoạch của chính nó rồi cộng; dòng Tổng chỉ có target khi MỌI sàn có kế hoạch chốt); Dashboard 1 sàn
  lọc ca/slot/kế hoạch/report đúng sàn, nhóm đối chứng chỉ TikTok; **Kế Hoạch Tháng theo sàn** (0140: khoá brand×tháng×sàn,
  `lock_month_plan` sinh/gắn ca đúng sàn + phòng của sàn; MonthPlan có nút sàn, engine/dự báo chỉ học ca cùng sàn, quy tắc lặp theo sàn);
  **target/ca** (`applyAllocatedTargets`, `lockedPlanTargetsFromRows` khoá theo sàn — trước đó kế hoạch TikTok gán target 0 cho ca Shopee);
  **Bản Tin CEO** outlook theo kênh brand×sàn rồi cộng, cảnh báo theo kênh (tập trung khách vẫn cộng theo brand), lọc sàn; **Hiệu Suất
  Host** mặc định chỉ TikTok; **Cam kết HĐ theo sàn** (0141: cột platform ở hợp đồng + cam kết, generate theo sàn, view
  `brand_commitment_progress` thêm cột); Toàn Cảnh Brand / Nhân sự ca / Việc cần làm theo kênh; **Ads Shopee** (0142: loại
  `shopee_ads`, bộ đọc `lib/dataraw/shopeeAds.ts`, `ShopeeAdsPanel` ở Nhập Ads khi chọn Shopee) + **Report Shopee bản chụp v2** có khối
  "Ads và khuyến mãi" (chi phí, ROAS, chi phí/đơn; xu = Coins Claimed của file overview — VERA T9 499.200 xu). **Lỗi thật đã sửa kèm:**
  bản chụp Report TikTok giữ cả ca Shopee ⇒ số live Report TikTok VERA/JOCKEY cộng lẫn GMV Shopee (`windowSessions` nay chỉ TikTok).
  Verify: replay 0001→0142 sạch, chạy lại 0140–0142 sạch, `supabase/tests/0140_0142_platform.sql` 14/14 (đỏ khi thiếu 0140), 0133/0136/0139 vẫn
  xanh; vitest 543/543 (+`platformSplit`, `shopeeAds`, đột biến rơi đúng test), lint 0 lỗi, build, audit:dead 0; trên bản build nối DB thật:
  Dashboard VERA Tổng (T10 tới 04/10: TikTok 31,5M · Shopee 24,6M), Dashboard Shopee, Kế Hoạch Tháng mở đúng VERA Shopee, Bản Tin CEO, Toàn Cảnh
  7 dòng kênh, Hiệu Suất Host, Nhập Ads Shopee xem trước file thật VERA T9 (2.300.302 · GMV Ads 70.273.048 · ROAS 30,55x — CHƯA lưu). Sau khi chạy
  migration (đo trên DB thật): cột sàn đọc được ở kế hoạch/hợp đồng/cam kết/view; **đã lưu file Ads Shopee VERA T9** (0142 nhận loại shopee_ads)
  + Cập nhật bản chụp Report Shopee VERA T9 (nháp) ⇒ "Ads Shopee Live: chi 2,3M, GMV từ Ads 70,3M (ROAS 30,5x), 11K/đơn — 10,5% GMV live";
  lưu thử kế hoạch nháp VERA **Shopee** T11 ⇒ dòng DB `platform=Shopee`, màn TikTok T11 vẫn trống, rồi XOÁ (DB T11 còn 0 dòng). Report TikTok
  VERA T9 chỉ đếm 70 ca TikTok chưa đối soát. User xác nhận 06/10: Shop ID file Ads (13346195) và User Id Live List (13347498) là CÙNG shop VERA.
  Chưa đo: ghi hợp đồng Shopee (0141 chiều ghi), chốt kế hoạch Shopee thật (đã có bộ kiểm SQL 2a–2c).
- **06/10 tối: REPORT TÁCH THEO SÀN (TikTok / Shopee) — migration `0139` (ĐÃ CHẠY + ĐÃ DEPLOY 06/10).** Yêu cầu user: hai report
  độc lập, phát hành/thu hồi/đóng sổ riêng, brand chỉ thấy số của sàn đã phát hành; Shopee có file riêng. **GMV Shopee = doanh số ĐẶT
  (Placed)**, doanh số xác nhận hiện riêng là "thực nhận" (user chốt). DB: cột `platform` ở `brand_monthly_reports`, `brand_monthly_report_snapshots`,
  `live_reconciliation_batches` (dòng cũ = TikTok), khoá (brand, tháng, sàn); `private.brand_month_published(brand,date)` giữ nghĩa "TikTok" + bản 3 tham số
  theo sàn; view `live_sessions_secure` và trigger đóng sổ xét sàn của ca; phát hành chỉ đếm ca chưa đối soát CỦA SÀN ĐÓ; `import_live_reconciliation(..., p_platform)`
  khớp/ghi ca đúng sàn; 4 loại Dữ Liệu Gốc `shopee_live_list|shopee_product_list|shopee_daily|shopee_overview`. Client: `lib/dataraw/shopeeFiles.ts`
  (bộ đọc 4 file, kể cả CSV tự đọc để SheetJS khỏi đổi ngày; khớp 4 file VERA Shopee T9: 50 phiên · 668.841.274đ đặt / 633.141.515đ xác nhận · 2.232 đơn · 175,3h · 29 ngày · 140 SP · 10 nguồn traffic),
  `lib/report/shopeeSnapshot.ts` + `shopeeSnapshotBuild.ts` (bản chụp Shopee: kết quả, theo ngày, phễu + nguồn traffic, khung giờ, loại ngày camp, host, sản phẩm, "cách tính và điểm cần xác nhận"),
  `ShopeeMonthlyReportTabs.tsx`, chọn sàn ở Report Tháng + Điều Phối Phát Hành + Đối Soát (file Live List) + Dữ Liệu Gốc. `fetchAllMonthlyReports` giữ khoá TikTok `brandId|YYYY-MM`,
  Shopee có hậu tố `|Shopee`. **Thứ tự deploy đúng là push client TRƯỚC rồi chạy 0139 NGAY SAU (lần này user chạy 0139 trước, push sau vài phút — không mất gì)** — client mới + DB cũ: màn report lỗi đọc; client cũ + DB mới: lưu report/bản chụp lỗi (ON CONFLICT);
  không mất dữ liệu ở cả hai trạng thái. Verify: replay 0001→0139 sạch + chạy lại 0139 sạch, bộ kiểm SQL 24 mục (`supabase/tests/0139_*.sql`; 0133/0136/0138 vẫn xanh), vitest 521/521 (+35: shopeeFiles/shopeeSnapshot/shopeeReportRender,
  14 đột biến rơi đúng dòng), lint 0 lỗi, build, audit:dead 0; trên bản build nối DB thật: Dữ Liệu Gốc đọc đủ 4 file Shopee trong trình duyệt (xem trước, chưa lưu), Đối Soát có chọn sàn.
  **VERA Shopee T9 đã làm thật (06/10):** up 4 file Shopee → Dữ Liệu Gốc (overview 182 · sản phẩm 140 · Live List 50 · theo ngày 29); đối soát bằng Live List ĐÃ ÁP DỤNG: 61/61 ca khớp, GMV ca 521,8M → 663,3M (file 668,8M; chênh 5,5M = phiên 23/09 11:00 không có ca trong app, user chọn để trống), 5 phiên dài chia nhiều ca (09/09 · 15/09 · 26/09 · 24/09 · 29/09) chỉ đúng tổng, ước lượng từng ca; Report Shopee VERA T9 là NHÁP (chưa phát hành), bản chụp đã cập nhật sau đối soát.
- **06/10 chiều: gán host + dọn rác + "đổi người giữa ca".** Đo hiện trạng (1.501 ca): chỉ CROCS T6–T9 đã đối soát, VERA/JOCKEY/Franklin
  T6–T9 còn "Tạm tính". Đã dọn (user duyệt): 4 dòng `promo_schemes` test, lô đối soát 22/09 không gắn brand (228 dòng), 3 report nháp
  (Franklin T8, CROCS T8/T9; bản chụp của chúng GIỮ NGUYÊN, Tạo/Cập nhật là ghi đè). Gán host/trợ từ tiêu đề ca bằng `bulk_assign_session_hosts`:
  214 ca (Mia = Nguyễn Thị Xuân Mai, Su = Nguyễn Thị Thanh Hằng, H.Dung = Hoàng Dung, Đạt, T.Linh = Tiểu Linh, trợ Trúc Như/Diễm Phương,
  "BIN" = profile **Hồng Toàn**, user xác nhận 06/10). Còn 29 ca chưa host (mục 2). **Đổi người giữa ca (migration `0138`, đã chạy)**:
  bảng `session_staff_segments` (người · vai host|co_host · phút vào/ra tính từ giờ ca), ghi qua RPC `set_session_staff_segments`;
  logic dùng chung `lib/staffSegments.ts` đọc bởi `pnl.ts` (mỗi người một dòng `payouts`, lương = rate giờ x giờ của MÌNH, OT/off sớm gắn người
  đứng tới cuối ca), `conflicts.ts` (bận đúng khoảng đứng ca), `hostPerformance` (`hostPortions`: GMV/giờ chia theo giờ đứng ca), Thu nhập talent, Finance,
  snapshot Report Tháng; UI = Sửa ca → "Đổi người giữa ca" (`StaffSegmentsEditor`, hành động qua `SessionActionsContext`). **Không có hoa hồng
  theo GMV** (user chốt 06/10, đừng nghĩ tới). Verify: replay 0001→0138 sạch + bộ kiểm SQL 27 mục (`supabase/tests/0138_*.sql`, đỏ khi thiếu 0138),
  vitest 486/486 (+19 `tests/staffSegments.test.ts`, 5 đột biến rơi đúng dòng), lint 0 lỗi, build, audit:dead 0; UI mở trên bản build nối DB thật:
  trình soạn hiện, kiểm lỗi trực tiếp; client chịu được thiếu bảng (404 → coi như chưa ca nào đổi người). **0138 ĐÃ CHẠY 06/10;** ghi thật qua RPC đã đo: ca VERA Shopee 25/06 nhập Trúc Như 0–120p + Thảo 120–150p, người chính trợ = Trúc Như, Sổ Ca hiện "Đổi người giữa ca", 0 request lỗi.
- **06/10: lịch T10 chốt tay → nạp 330 ca Upcoming 06→31/10** từ bảng tính "Bảng tính không có tiêu đề.xlsx" (VERA TikTok 66/Shopee 84, JOCKEY TikTok 25,
  Franklin TikTok 48/Shopee 32, CROCS 75), ghi REST bằng phiên admin, không qua Kế Hoạch Tháng (lock_month_plan chỉ TikTok + mở đăng ký).
  Không có target (cột TARGET trống). Bỏ qua: 01–04/10 (đã nạp thật từ trước; 05/10 nạp bù thêm 2 ca VERA Shopee + CROCS TikTok, còn Upcoming), 16 dòng CANCLE, 36 ca brand JEW (chưa là
  brand trong hệ thống). Host/trợ chưa có hồ sơ (Mia, Su, Đạt, H.Dung, T.Linh, trợ Bin) để trống, tên ghi trong tiêu đề ca.
- **06/10: chốt lịch + target/ca CROCS T10.** Lịch chốt (user): 20/10 có 09–12, 12–15, 18–21, 21–00; 21/10 và 22/10 thêm ca
  11–14 (2 ca mới, chưa host); 26/10, 27/10 có ca 11–14; 31/10 là 11–14 + 21–00 (ca 20–23 đổi giờ). DB CROCS T10 nay **89 ca** (01→31/10; 11 ca 01–04/10 tạo 06/10 theo user, status Completed, `data_source='manual'`, chưa host/GMV). Target/ca
  tính lại theo logic app (`targetAllocation.ts`): benchmark GMV/giờ theo loại ngày (D-Day 8–10, Mid-Month 13–15, Pay Day
  23–25 — lịch camp cố định của app; 12/10 và 22/10 là ngày thường, user xác nhận) × khung giờ (T7+T8; ô thiếu — ngày thường
  khung sáng, Mid-Month chiều — lấy từ DB) × số giờ ca, co đều để tổng **= 5.141.294.000** (Target Livestream T10 trong
  Target 2026), làm tròn nghìn, dư 5.000đ dồn vào 1 ca. Đã ghi `target_gmv` cho cả 89 ca (gồm ca đã qua), tổng DB khớp. Kế Hoạch Tháng T10
  CROCS vẫn nháp, target tạm 5,5 tỷ — user bảo để yên. Host/trợ Mia, Su, Đạt là **nickname** (user sẽ điền tên thật sau);
  chỉ **H.Dung / Hoàng Dung là host mới** (cần tạo hồ sơ talent).
- **05/10 tối: nạp lịch ca T6→05/10 từ file "YFB _ Working File 2026 - NEW.xlsx"** (6 sheet: VERA/JOCKEY × TikTok/Shopee,
  Franklin, CROCS). Nạp **893 ca** VERA (TikTok 298, Shopee 259), JOCKEY (TikTok 176, Shopee 72), Franklin (88; bắt đầu từ
  06/08) với host/trợ khớp hồ sơ talent, GMV từ cột "GMV Live" (trống thì cột "GMV"; riêng VERA Shopee cột đó là ATC nên
  không dùng), `data_source='manual'` (= nhãn **Tạm tính / chưa đối soát**; chờ up file đối soát từng brand ở Đối Soát
  Số Liệu để lên "Đã chốt"), `is_backfill` = true tới 30/09, ca 01–05/10 là ca thật. Ghi trực tiếp REST bằng phiên admin
  ở Browser pane (script nháp ở scratchpad, không commit). **CROCS không nạp lại** (247 ca room đã đối soát, tốt hơn
  bảng tính; sheet có nhiều dòng ca nhỏ trong cùng một room) — chỉ điền host/trợ cho 14/35 ca thiếu host khi MỘT dòng sheet
  phủ ≥70% room; đợt 2 (06/10): 13 room trải 2–4 ca khác host đã tách bằng `split_backfill_session` theo mốc đầu từng ca trong file (13 → 29 ca, tổng GMV CROCS giữ nguyên 20.848.133.466) + `bulk_assign_session_hosts`; CROCS nay 263 ca, còn 8 ca chưa host (mục 2). Ca 20/09 19:22: bỏ dòng file chồng lấn, tách tại 21:00; ca 30/09: khoảng 20–21h không có ca trong file, thuộc host ca đầu. Bỏ qua: 8 dòng
  thiếu/sai giờ hoặc năm sai (JOCKEY TTS dòng 77, 214; CROCS 8, 380, 396, 411, 455, 471), 7 ô GMV dạng "a/b" (ghi 0,
  không đoán), 3 dòng JOCKEY trùng nhau gộp. Host/trợ **chưa có hồ sơ talent**: Mia (52), Su (41), Đạt (8), Dung (4);
  trợ Trúc Như (84), Diễm Phương (9) ⇒ ca để trống host/trợ, tên ghi trong tiêu đề ca `(Host: …)`. Ô trợ ghi nhiều người
  ("Toàn 1h + Loan 2h") chỉ lấy người ghi nhiều giờ nhất. Tên trùng phụ thuộc vai: Vân/Trang/Linh ở cột host = Kim Vân/Kiều
  Trang/Khánh Linh, ở cột trợ = Hồng Vân/Huyền Trang/Mỹ Linh. Verify: đếm DB khớp (VERA 557, JOCKEY 248, Franklin 88 ca),
  Sổ Ca VERA hiện ca T10 nhãn "Tạm tính". Phát hành report T6–T9 sẽ bị chặn tới khi đối soát xong (`unreconciled_sessions`).
- **05/10: Ads lấy từ FILE, không gõ tay** (user yêu cầu). File "Campaign overview data" của TikTok Ads (GMV Max, theo
  ngày, toàn cửa hàng — gồm LIVE + Product GMV Max) tải ở **Nhập Ads** (chỗ nhập Ads DUY NHẤT) → lưu vào kho Dữ
  Liệu Gốc loại `ads_campaign_overview` (migration **`0137`**, 1 file / brand / tháng, không liệt kê ở màn Dữ Liệu Gốc)
  → Report Tháng phần 6 khối "Ads toàn cửa hàng" (chi phí, ROI, chi phí/đơn SKU, doanh thu gộp, so tháng trước cắt cùng
  số ngày, ROI theo loại ngày theo `effectiveCamp`, biểu đồ theo ngày, nhận xét tự sinh, câu Ads trong Insight phần 6)
  + 2 sheet Excel. Bỏ 2 ô "Ads cost bổ sung"/"ROAS ghi đè" (không màn nào đọc; cột `ads_spend/roas` giữ giá trị cũ).
  Bộ đọc: `lib/dataraw/adsCampaignOverview.ts` (nhận tiêu đề Anh/Việt; từ chối file không theo ngày / trải 2 tháng /
  không phải đồng / dòng tổng lệch quá dung sai — TikTok làm tròn lệch 2đ). Test đối chiếu số Franklin T9 với slide 22
  deck Franklin (36.047.613 · 22,1x · 52.933/đơn · D-Day 42,8x). **0137 ĐÃ CHẠY 05/10.** Verify trên bản build nối DB
  thật: xem trước đúng cả 2 file Anh/Việt; đã up file Ads Franklin T9 (bản `-2`, tiếng Anh) + Tạo report Franklin T9
  (nháp, chưa phát hành) ⇒ phần 6 ra đúng số deck (Mid-Month 12,8x, Pay Day 8,2x, 23/09 3,8x), Insight phần 6 nói Ads
  kể cả khi brand chưa có ca. Chưa đo: so tháng trước (Franklin chưa có file Ads T8).
  **Gọn trang cùng ngày (user: "thừa quá"):** tab đổi tên **"Nhập Ads"**; bỏ 3 ô ghi chú Promotion/Customer
  Insight/Account Health + nút Lưu (nhận xét viết bằng "Sửa Insight" ở từng phần Report; khối "Ghi chú của agency"
  phần 7 bỏ theo), khối Ads theo ca từ Report Ca (Finance vẫn đọc `ads_cost`), khối "Target và lịch tháng sau". Khung
  camp (`ReportPlanningInputs`) chỉ hiện ở tháng KHÔNG có Kế Hoạch Tháng, gập thành 1 dòng "lịch cố định: …". Đo trước
  khi bỏ (bộ dòng report app nạp lúc đăng nhập): 4/4 dòng `brand_monthly_reports` trống cả 3 ô ghi chú, khung camp gõ
  tay, `ads_spend/roas`.
- **05/10: audit toàn app lần 3** (chi tiết: mục `## Audit toàn app lần 3 (2026-10-05)` cuối file lịch sử). Lỗ lớn nhất:
  **mọi tài khoản tự đổi được role/brand/quyền của chính mình** qua `profiles` (policy 0012) — vá bằng migration
  **`0136` (ĐÃ CHẠY 05/10)**, kèm đối soát hết khớp chạm mép và chốt
  kế hoạch gắn được ca ngày đã qua do ops mở sẵn. Phía client: engine hết "khung giờ mạnh" ảo 0–2h, Việc cần làm đếm ca
  thiếu host theo tháng chưa phát hành (35), Nhập Ads tách ca nạp bù, hết ngày dạng `2026-10-05`/"Assistant". Server:
  chỉ Admin tạo/xoá Admin. vitest 456/456. Backup DB: 60/60 lần đỏ vì secret trỏ sai project — user sửa secret, **xanh lần đầu 05/10 07:55** (bản dump 2,0 MB).
- **04/10 tối: audit "người mới dùng khó"** (tài liệu cho user: Claude Doc "Audit LiveOps AI cho người mới dùng",
  https://claude.ai/code/artifact/304c57ba-c36e-466b-bc54-337147d9f736) — user bảo sửa hết, đã làm 5 bước, mỗi bước 1 commit
  đã push: `62cbff0` dọn chữ/dữ liệu mẫu (form CRM/Studio, mô tả quyền, chữ tiếng Anh, ngày `2026-10` → `10/2026`,
  migration `0134` + `0135` ĐÃ CHẠY 05/10) · `fae158e` mở đúng tháng (`lib/defaultMonth.ts`) + ô thiếu có nút dẫn đường ·
  `b1257cb` số ghi kỳ/cách đếm (Hiệu Suất Host, Talent Pool, Sổ Ca, Rate Card) · `69aa4c7` một thông tin một chỗ nhập
  (khung camp + target chỉ ở Kế Hoạch Tháng; bỏ ô "phân bổ target tháng sau" + "kế hoạch affiliate tháng sau" ở Nhập
  Ads; bỏ ô GMV/CVR gõ tay ở talent, AI ghép host nhận số thật) · `738c7a0` khối **Việc cần làm** trên Bảng Vận Hành
  (`lib/todoList.ts`) + **Từ điển và cách dùng** (nút ? trên Header) · bước 6: menu màn hẹp nhớ lựa chọn mở. Phát hiện
  lớn nhất: từ 23/09 không có ca nào được ghi vào app — chỉ bước "up file TikTok" đang được dùng (0 hợp đồng, 0 giá, 0
  snapshot, 0 tự khai, kế hoạch duy nhất là T10 CROCS nháp).
- **04/10: audit LOGIC vòng đời** (hợp đồng → kế hoạch → ca → đăng ký → chốt → vận hành → đối soát → report) theo yêu
  cầu user, user bảo "sửa hết": 14 điểm gãy đã sửa trong code + migration **`0133` (ĐÃ CHẠY trên production 04/10,
  commit `b901273` đã push)**. Chi tiết: mục `## Audit logic vòng đời (2026-10-04)` cuối file lịch sử. Verify: bộ kiểm SQL 34/34 trên bản
  replay `0001→0133` (đỏ ngay khi thiếu 0133), vitest 434/434, đột biến rơi đúng test; UI đọc trên bản build local nối DB
  production. Sau khi user chạy 0133: 5 RPC gọi với id giả/thiếu brand đều vào tới thân hàm bản 0133
  (`finalize_shift_slot` "Không thấy ca chờ đăng ký", import thiếu brand "Chọn brand của file"…), cột
  `live_reconciliation_batches.brand_id` có. Chưa đo trên production: `apply` lô cũ bị từ chối (auto-mode chặn vì coi là
  ghi — đã có test 3f trên replay); luồng chốt người/up đối soát thật (chờ ops dùng).
- 🛑 **User chốt 02/10: DỪNG nhánh đo tốc độ tải.** Mạng chỗ user là biến trội nên wall-clock vô nghĩa. Không chạy lại
  các phép đo P2a-17→P2a-20 trừ khi user yêu cầu rõ. Những gì đã sửa thì giữ (chứng minh bằng SỐ REQUEST và source).
- **03/10–04/10: cắt vòng mạng nối tiếp lúc tải** (cache `/assets/*` immutable, chunk tab tải song song dữ liệu, nạp trước lượt đọc màn,
  `lazyNamed` bỏ fallback 300 ms…). Chi tiết: lịch sử `## Cắt vòng mạng nối tiếp (2026-10-03/04)`. **Sau deploy phải kiểm:** `curl -sI
  https://live-ops-ai.vercel.app/assets/<file>.js` có `immutable`.
- **Quyết định user đã chốt — đừng nêu lại:** luật run-rate (§5.6); Target GMV từng ca ở "Kế Hoạch Tháng Sau" brand ĐƯỢC
  thấy (01/10); tiền không có chữ "đ" (27/09); trung tâm xuất file = một module dùng chung, không dựng tab riêng (02/10);
  gộp menu/IA hoãn tới khi có 2–4 tuần số liệu `ui_tab_views` (bắt đầu đếm 26/09); chỉ ops tạo ca (brand không tự mở).

## 2. Việc còn treo

**Cần user làm:**
000000000. **0144 ĐÃ CHẠY 06/10.** Chưa đo: một lần giao ca THẬT đầu-cuối (chờ ca thật + số thật). Tiếp: tạo tài khoản cho host/trợ (Phân Quyền & Role, gắn hồ sơ talent) — Đợt 3; hướng dẫn trợ live: hết ca mở Ca Của Tôi → ca → Giao ca.
00000000. **0143 ĐÃ CHẠY 06/10** (user xác nhận). Sửa 27 chỗ trùng người T10 (Bảng Vận Hành → khối đỏ "chỗ trùng người", hoặc Việc cần làm) — 0143 KHÔNG chặn ca trùng sẵn,
   chỉ chặn lần ghi đưa người vào ca/dời giờ; 32 ca Franklin Shopee T10 chưa có phòng (đặt phòng mặc định ở CRM → Hợp đồng & giá, ca đã tạo thì Sửa ca).
   **Lịch + giao ca 2 sàn — đề xuất** https://claude.ai/artifact/J4Kk16eZYeTtrkKDYvQWpY: Đợt 1 + Đợt 2 XONG (§1). Còn: **Đợt 3** tài khoản cho 39 host/trợ — user chốt 06/10 **CHUYỂN THẲNG sang app, KHÔNG chạy song song Google Sheet**
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
   Performance T9 ở Đối Soát (chọn CROCS) rồi Áp dụng.
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
- **Hai workspace** chuyển bằng switcher trên Header: **Agency** (ceo/admin/operations, xuyên mọi brand) và **Brand**
  (mỗi brand một workspace: CROCS, JOCKEY, VERA, Franklin; role `brand` bị khoá vào đúng brand qua `assigned_brand_id`).
  Có URL route (`src/lib/routes.ts`): `/so-ca`, `/brand/crocs/report-thang`…
- **Nguồn sự thật của menu:** `agencyNavGroups()`/`brandNavGroups()` ở [src/lib/appNav.ts](src/lib/appNav.ts). Ảnh chụp:
  - Agency: Dashboard (Bản Tin CEO) · Lập Kế Hoạch (Kế Hoạch Tháng, Nhân sự ca) · Vận Hành Hằng Ngày (Bảng Vận Hành, Sổ Ca,
    Đối Soát Số Liệu) · Phân Tích (Hiệu Suất Host, Toàn Cảnh Brand, Điều Phối Phát Hành) · Tài Nguyên (Talent Pool,
    Studios & Gear) · Kinh Doanh (CRM — gồm "Hợp đồng & giá", TikTok API) · Tài Chính (Finance & P&L — khoá cứng
    ceo/admin) · Hệ Thống (Phân Quyền & Role; AI Training Center — chỉ admin). Talent chỉ thấy: Ca Của Tôi, Đăng Ký Ca, Hồ Sơ.
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
**Sàn (06/10) = một chiều ngang hàng brand:** khoá Map dùng `brandMonthKey(brand, tháng, sàn)` (TikTok giữ khoá cũ `brandId|YYYY-MM`,
Shopee thêm `|Shopee`) và `brandPlatformKey(brand, sàn)` (Map kế hoạch theo tháng); sàn brand đang chạy = `brandPlatformsOf`; lọc =
`inPlatformScope`. Mọi phép so (target, run-rate, benchmark, xếp host, engine) chỉ trong MỘT sàn; chỉ GMV/giờ/đơn mới cộng hai sàn.
Đọc kế hoạch/hợp đồng bằng `select *` rồi lọc sàn phía client (thiếu cột = TikTok). Bộ chuyển sàn chỉ một chỗ: App (`PLATFORM_TABS`);
màn con nhận `platform` qua prop, không tự giữ state sàn. Nút sang Kế Hoạch Tháng nhớ sàn qua `rememberBrandId(brand, sàn)`.
Sàn của report = `lib/reportPlatform.ts` (`ReportPlatform`); mọi đọc/ghi report và bản chụp đi qua `lib/db/monthlyReports.ts` / `monthlyReportSnapshots.ts` với tham số `platform` (mặc định TikTok — TikTok giữ nguyên khoá nạp-trước, chỉ truyền sàn khi là Shopee). Ca/đối soát/phát hành luôn lọc theo sàn của ca, không trộn.
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
  giờ cam kết, KHÔNG vào lương/doanh thu — hiện "chờ xác nhận" ở Finance, Cam Kết, Nhân sự ca, Cửa sổ Ca Live; role brand
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

- 144 migration (`supabase/migrations/`) — `0144` (giao ca) ĐÃ CHẠY 06/10; `0143` (chặn trùng người) ĐÃ CHẠY 06/10; **`0139`–`0142` (report / kế hoạch / hợp đồng theo sàn, file Ads Shopee) ĐÃ CHẠY 06/10**;, chạy tay theo thứ tự — **`0138` (đổi người giữa ca) ĐÃ CHẠY 06/10.** `0137` đã chạy 05/10. **`0136` ĐÃ CHẠY 05/10** (verify production: lô đối soát thử với phòng kết thúc đúng phút ca CROCS 30/09 11:01 bắt đầu ⇒ không khớp, phòng chồng 29 phút ⇒ khớp; lô thử đã xoá; trigger profiles nằm trước đoạn đó trong cùng file + chốt tự kiểm cuối file), bộ kiểm
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
| `## Cắt vòng mạng nối tiếp (2026-10-03/04)` | 10 vòng mạng đã cắt (cache assets, TAB_CHUNKS, prefetch, lazyNamed, song song hoá) + chỗ còn lại có chủ đích |
| `## Gộp cấu hình một chỗ nhập (2026-10-06)` | số đo trước khi gộp, từng chỗ nhập trùng đã bỏ, luật mới (is_override, generateThroughMonth, effectiveCamp 1 tham số), cách verify |
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
