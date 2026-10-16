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

## 1. Giai đoạn hiện tại (cập nhật 2026-10-13)

- **16/10: APP TALENT BẢN 2 — ĐÃ BUILD + COMMIT + PUSH; migration `0177` CHƯA CHẠY.** Đề xuất + số đo + bản mẫu: https://claude.ai/artifact/JVFAC43zih6h2AaS1anErA (đo: 1/39 tài khoản talent từng mở app từ 11/10, 0 lần "Đã nhận"; Hôm nay dài 3.451px, ca kế tiếp ở 734px; chấm đỏ 26; 0/182 ca mở; 96/105 dòng hiệu suất "unclear"). **User chốt 16/10:** GIỮ tab Đăng ký riêng; BỎ giao ca khỏi app talent (admin giao trên máy phòng live); nhận lịch MỘT nút; làm cả link Zalo + link lịch điện thoại (.ics).
  **Code:** 4 tab Ca Của Tôi (`my_shifts`, slug mới `/ca-cua-toi`, `/hom-nay` vẫn mở) · Cả Agency (`talent_calendar`, `components/talent/TalentAgency.tsx`: thanh 7 ngày + Sáng/Chiều/Tối; nút "Lịch tuần / tháng" render `LiveCalendar` App truyền vào) · Đăng Ký Ca · Tôi (`MyTalentProfile` viết lại: giờ + thu nhập → bảng công → hiệu suất chỉ dòng có kết luận → link lịch → phần cá nhân gập). `TalentToday.tsx` = Ca của tôi: ca kế tiếp đầu màn, 1 dòng trùng giờ (bấm cuộn tới ca), thanh "N ca mới · Đã xem", danh sách Tuần này/Tuần sau/Sau nữa (mỗi ca một lần, nhãn "Ca mới"/"Đổi giờ" trên dòng), bỏ thẻ hướng dẫn + khối cần giao + 7 ngày tới. `lib/talent/agenda.ts` (`agendaRanges`, `agendaDays`, `myBadgeCount`, `splitStanding`, `standingSentence`, `weekScheduleMessage`). Chấm đỏ: Ca của tôi = (có ca chờ nhận ? 1 : 0) + số chỗ trùng; Đăng ký = ca mở mình chưa báo rảnh. Bàn Trainer thêm "Chép tin Zalo" (ca đã chốt của tuần theo từng người + link `/ca-cua-toi`, không cần đã công bố). `LiveCalendar` sắp `filteredSessions` theo ngày + giờ (lỗi thật: Lịch Tuần hiện 20:00 trước 11:00). Bỏ `handoverDue`, `nextWeekLoad`.
  **.ics (0177):** bảng `talent_calendar_feeds(talent_id pk, token unique)` RLS bật, không policy, revoke anon/authenticated. `src/server/calendarFeed.ts` (tự chứa, không import lib khác vì ESM Vercel): `GET /api/me/calendar-feed` (lấy/tạo mã), `POST /api/me/calendar-feed/rotate`, `GET /api/calendar/<token>.ics` (14 ngày trước → 62 ngày sau, bỏ ca huỷ/nạp bù, đổi người giữa ca theo đoạn, VALARM 60 phút, giờ VN → UTC). Client `lib/db/calendarFeed.ts` + `components/talent/CalendarFeedCard.tsx` (iPhone: webcal; khác: Google `render?cid=`; 501 ⇒ "chưa bật").
  **Verify:** tsc 0 lỗi; eslint 0 lỗi mới; audit:dead sạch; vitest 940/943 (3 đỏ có sẵn: GmvEditor 22px + 2 Shopee VERA T9); `tests/talentAppV2.test.ts` 10. 0177 chạy thử trên Postgres tạm: chạy lại được, anon/authenticated bị chặn, 1 dòng/người, xoá talent thì xoá theo. App thật (giả lập hồ sơ Khanh trong trình duyệt, chặn ghi, 375×812): Ca của tôi 1.691px, ca kế tiếp ở 68px, chấm 3; Cả agency ca đầu ở 246px; Tôi 1.501px (trước 3.120px). Tin Zalo tuần 19–25/10: 33 người, 240 dòng. **Laptop/PC (cùng ngày, user hỏi):** đổi bố cục theo BỀ RỘNG cửa sổ, không đoán máy (`TALENT_WIDE_QUERY` ≥1024px, `TALENT_WEEK_GRID_QUERY` ≥1280px trong `lib/talent/agenda.ts`). Đo trước: ở 1440px nội dung chỉ dùng 768/1184px. Sau: Ca của tôi = ca kế tiếp | việc cần làm cạnh nhau + lưới tuần 7 cột T2–CN (≥1280; 1024–1279 lưới 3 cột theo ngày — ở 1100px cột 7 chỉ 107px, thẻ chỉ còn giờ); Cả agency mở sẵn Lịch tuần/tháng, theo ngày thì mỗi buổi một cột; Tôi 2 cột (bảng công bên phải, 835px vừa 1 màn ở 1440). **Đăng ký ca làm lại (user 16/10: bản lịch 7 cột "rất khó dùng"):** MỘT CA = MỘT Ô TO, chạm cả ô là báo rảnh / huỷ (viền đứt "Chạm để đăng ký" → viền xanh ✓ "Bạn đã đăng ký · Chạm để huỷ"; user 16/10: chữ "Đăng ký" thay "Tôi rảnh/báo rảnh" ở màn talent + nút trong SlotDetailModal). **User chốt cùng ngày:** ca mở là ca THÁNG SAU ⇒ lọc Tháng (nút mỗi tháng có ca mở) → Tuần trong tháng ("Cả tháng" + từng tuần T2–CN cắt theo tháng, đếm ca) → Buổi → Brand (ô chọn) + "Chỉ ca chưa báo" + "Bỏ lọc"; "Rảnh hết N ca đang hiện" theo bộ lọc. **ĐĂNG KÝ KHÔNG ÁP LUẬT:** không khoá ô vì trùng giờ (trùng do trainer/OP xử lý lúc chốt — SlotDetailModal + DB 0143); chỉ hạn báo rảnh của trainer (0176, DB chặn) mới khoá; ca đã chốt của mình chỉ là dòng "Bạn đã có: …". Đã gỡ `slotClashWithMine`. Ngày có ca mỗi ngày một cột `repeat(auto-fill,minmax(220px,1fr))` (thuần CSS). Thử với 60 ca mở giả tháng 11 trong trình duyệt (không ghi DB): 1440px 4 cột, 7 nút tuần, không tràn ngang. Điện thoại không đổi. Bẫy đo: Browser pane ẩn ⇒ đổi cỡ giả lập không phát `change`/`resize` (phải mở lại tab để đo). **Chưa thử:** tài khoản talent thật trên điện thoại; link .ics (cần 0177 + deploy, vì server đọc hồ sơ thật); dán tin dài vào Zalo thật.

- **13/10 (khuya): BÀN TRAINER + ROLE `trainer` — nhánh `feat/trainer-module` ĐÃ GỘP vào main 13/10 (chưa push/deploy); migration `0175` (enum) + `0176` CHƯA CHẠY (đổi số 2 lần vì phiên song song dùng 0171–0174).** Đề xuất + demo trên lịch thật: https://claude.ai/artifact/FZG3a19r8r6KD9J9CdoAgS. **User chốt 13/10:** role RIÊNG `trainer` (thấy rate + Finance chỉ đọc); quy trình tuần = Kế Hoạch Tháng chốt ⇒ ca mở → trainer tự đặt HẠN ĐĂNG KÝ → talent báo rảnh → trainer xếp NHÁP → "Công bố tuần" (một transaction, mỗi người MỘT tin) → sau công bố đổi người/dời giờ phải có lý do; 48 giờ/tuần CHẶN, còn lại cảnh báo (ngưỡng sửa được); trainer được xếp người + dời giờ + thêm/bớt ca (ca thêm = ca tăng cường 0165); gợi ý KHÔNG theo GMV host (đo: xếp lại host theo thành tích tháng trước +0,7/−0,3/+0,4% GMV) — theo người đã báo rảnh, quen kênh 90 ngày, giờ tuần, luật nghỉ, và chế độ "Chi phí thấp" (rate × giờ, cùng luật pnl.ts).
  **DB:** `0175_trainer_role.sql` chỉ `alter type user_role add value 'trainer'` (phải commit trước khi dùng ⇒ file riêng, chạy TRƯỚC 0176). `0176_trainer_roster.sql`: dòng `role_permissions` trainer + key `manage_roster`; 16 policy liệt kê tường minh thêm trainer (đọc kế hoạch/kênh/phòng/đoạn người/nhận lịch/giá; ghi `shift_slots`, `live_sessions`, `session_availability`; đọc `talent_rate_history` + `session_finance`); `talents_secure` cho trainer thấy rate; guard 5 RPC nhận trainer (finalize_shift_slot, cancel_session, set_session_staff_segments, bulk_assign_session_hosts, generate_shift_slots) + `notify_ops` gửi cả trainer; bảng `roster_weeks` (hạn, công bố), `roster_drafts` (nháp, talent/brand không đọc), `roster_changes` (nhật ký, chỉ ghi qua RPC), `roster_rules` (ngưỡng); `private.slot_open_for_registration` chặn talent báo rảnh/rút sau hạn; thông báo `roster_published`, `signup_open`; `notify_session_changes` im "được xếp ca" khi cờ `app.roster_publish`; RPC `set_roster_deadline`, `publish_roster_week` (chặn nháp thiếu host + quá giờ/tuần; trùng người do 0143 ⇒ huỷ cả lần), `roster_reassign`, `roster_move_session` (ca có số không dời — cùng luật `hasSessionData`).
  **Client:** `lib/roster/rules.ts` (`buildRosterShifts`, `analyzeRoster` 11 mã luật, `personEntries` đi qua staffSegments), `lib/roster/candidates.ts` (`buildFamiliarity`, `rankCandidates`, `plannedCost`, `autofillWeek`, `planCostCut` best-first ≤ N lần, rẻ hơn ≥ 15%, +≤ 9 giờ/người), `lib/db/roster.ts`, `components/RosterBoard.tsx` + `components/roster/{ShiftPanel,panels}.tsx` (6 tab: Lịch tuần · Kiểm lịch · Báo nghỉ · Ma trận kênh · Giờ & chi phí · Luật & nhật ký). Menu "Nhân Sự Live → Bàn Trainer" (id `roster`, route `/ban-trainer`, quyền `manage_roster`); trainer mặc định vào đây; Finance mở cho trainer (`readOnly`); LiveCalendar/SessionWindow cho trainer sửa/huỷ ca (không giao ca/up số/đối soát/xoá); Phân Quyền có role trainer; server `ASSIGNABLE_ROLES` + trainer; Đăng Ký Ca talent hiện hạn + khoá sau hạn.
  **Verify:** replay 0001→0176 sạch, 0176 chạy 2 lần sạch, `supabase/tests/0176_trainer_roster.sql` 42 mục OK (đỏ khi chỉ tới 0174; replay có cả `0174_typed_shift_gmv` của phiên song song); `tests/roster.test.ts` 10 (mutation luật nghỉ ⇒ đỏ); tsc 0, lint không thêm cảnh báo, audit:dead sạch, build OK, vitest còn đúng 2 đỏ Shopee có sẵn. **Chưa xem trên app thật bằng tài khoản thật** (cổng mới không có phiên) — đã bấm đầu-cuối trên harness (dữ liệu thật đọc DB 13/10 + DB giả trong trình duyệt, đã xoá): tuần 19–25/10 thành ca mở → Tự lấp 182 vị trí 0 lỗi → Giảm chi phí 10 lần đổi (rate giả lập) → Công bố; tuần 12/10 ra đúng 6 trùng người, 1 người 51,5 giờ; 375px 0 tràn. Số đo nền: lịch sử `## Bàn Trainer (2026-10-13)`.
- **13/10: ĐỐI SOÁT CHIA THEO MỐC + GÕ GMV ĐÚNG CỦA CA.** `0171`–`0173` ĐÃ CHẠY 13/10, commit `dde4983`; `0174` ĐÃ CHẠY 13/10 (kiểm DB thật: 24/24 lô xem trước được, chậm nhất 0,43 giây, mọi phiên tổng chia = file, bản chia không đổi so với trước 0174, chưa có số gõ nào), chưa commit. Chi tiết + số đo: lịch sử `## Đối soát chia theo mốc snapshot (2026-10-13)`.
  **0171–0173:** `private.recon_shares` là phép chia DUY NHẤT (Áp dụng + xem trước). Mốc snapshot = giờ TẢI file (snapshot thật up trễ trung vị 54 phút) — room còn live = bắt đầu + thời lượng, Shopee thời lượng 0 = giờ up; phần giữa hai mốc rải theo giờ; tổng = file. Ca `tiktok_reconciled` không bị up/xoá snapshot đổi số. Màn Đối soát hiện số chia trên ô ca (≈ = ước lượng), nhắc Áp Dụng Lại khi ca do chính lô đó ghi lệch > 1%. 0172 sửa tốc độ (CTE materialized + `enable_nestloop off`); 0173 gắn lại ca nạp bù tách sau Áp dụng (CROCS T9).
  **0174 (user 13/10: "up file snapshot là gõ luôn"):** file tải trễ ⇒ số cộng dồn lẫn phần ca sau (ca đúng 10M, file 12M). (1) `set_session_snapshot_gmv(ca, gmv|null)` (quyền như up file): quy room CÒN LIVE lúc hết ca về giờ hết ca — mọi chỉ số đếm được × k = % GMV, thời lượng = tới giờ hết ca; room đã tắt trước giờ hết ca giữ nguyên; số gốc ở `raw.orig`; ca sau tự nhận phần dư; mốc gõ tay vào đối soát tại giờ hết ca (snapshot ước lượng đã gõ cũng thành mốc thật); thêm/xoá lượt restart hoặc up lại file ⇒ bỏ số gõ. UI: form Giao ca (`SessionLiveSnapshotUpload`) tự mở ô gõ ngay sau khi up nếu room live quá giờ hết ca (`GmvEditor`). (2) Đối soát: `recon_gmv_overrides(ca, room)` + `set_recon_gmv_override` (ceo/admin/ops) — bấm ô ca ở phiên khớp ≥ 2 ca để gõ; ca gõ giữ số, phần còn lại chia cho ca kia theo tỷ lệ bản chia tự động, chỉ số theo % GMV, nhãn `manual` (✎). Khoá (ca, room) nên lô file mới hơn giữ số gõ. `private.recon_shares` = `recon_shares_base` (0172 + mốc gõ tay) + lớp số gõ. Test `supabase/tests/0174_typed_shift_gmv.sql` 27 mục OK (đỏ khi thiếu 0174); 0171/0173 vẫn xanh; replay 0174 chạy 2 lần sạch; lô giả 578 phiên + 200 ca gõ 0,32 giây. Đã xem UI trên app thật (ô gõ ở chip đối soát + form giao ca CROCS 11/10 09–12 báo "room vẫn live sau giờ hết ca") — chưa lưu thử vì prod chưa có 0174.
- **11/10 (tối): PHÒNG ĐIỀU HÀNH — mục mới dưới Dashboard (id `control_room`, route `/phong-dieu-hanh`, quyền `manage_sessions`); migration `0170` CHƯA CHẠY; CHƯA commit; tsc 0 lỗi, lint 0 lỗi mới, vitest chỉ còn đỏ có sẵn (2 Shopee + 2 file đỏ khi không có `.env`), build OK; CHƯA xem trên app thật (cổng mới chưa đăng nhập).** Đề xuất + bản thử: https://claude.ai/artifact/Hu2U23dfazeNpkbfJ518n9 (bản 1 "Bảng Cục Diện" https://claude.ai/artifact/5bgQfsfQ81KjKoCq83GebC bị user chê đơn giản). **User chốt 11/10:** thêm mục (không thay Dashboard/Run-rate); brand THẤY khả năng về đích, KHÔNG thấy bộ thương lượng target (chưa build); sa bàn chỉ tạo CA NHÁP để OP xác nhận/sửa; hỏi số liệu dùng cả Claude + Gemini, user chọn bên trước, hết lượt tự chuyển.
  **Code:** `lib/performance/controlRoom.ts` (test `tests/controlRoom.test.ts` 14): `buildChannelRoom` (kỳ vọng từng ca = `slotForecasts` engine v3; khả năng về đích `pHitOf` = đúng công thức `landingOf`; đường theo ngày; ca xoay chuyển = khả năng hiện tại − khả năng nếu ca đó đúng kỳ vọng), `sandboxCandidates` (khung 10/14/20h × 3 giờ, phòng kênh trống, host/trợ quen kênh ≥ 3 ca/90 ngày còn rảnh ≤ 9h/ngày, ×0,8 giờ thêm), `autoPlan` (tham lam theo điểm xác suất hoặc GMV, không trùng người), `hostSkillTable` (tay nghề sau khi trừ khung giờ, co về 0, SD 0,13, ≥ 8 ca, qua `hostPortions`), `monthBridge` (giờ · cơ cấu ca · năng suất nền). `lib/performance/askContext.ts` (bản tóm tắt gửi kèm câu hỏi). UI `components/ControlRoom.tsx` + `components/control-room/*` (2 lớp "Toàn cảnh" / "Sa bàn & người", bản đồ tháng, hộp việc, ca nháp, ngăn Hỏi số liệu). Dashboard brand: thẻ "Khả năng về đích" (`control-room/BrandLanding.tsx`) — ops tính từ ca, role brand đọc RPC chỉ có xác suất. Server `src/server/askData.ts` → `POST /api/ai/ask` (ceo/admin/operations; Claude `claude-opus-5-5` effort low + `fallbacks: "default"`, Gemini `gemini-flash-latest`; mỗi bên ≤ 25 giây để kịp chuyển trong 60 giây của Vercel; `/api/health` thêm `anthropicConfigured`). Thêm `@anthropic-ai/sdk`. Phòng Điều Hành cũng ghi dòng `daily` vào sổ dự báo (0163) như Dashboard.
  **0170:** bảng `session_drafts` (RLS ceo/ops/admin) + RPC `accept_session_draft` (tạo shift_slot rồi `finalize_shift_slot` trong MỘT transaction ⇒ chặn trùng người như ca thường, kênh đã chốt kế hoạch thì trigger 0165 sinh ca tăng cường) + `private.normal_cdf` + RPC `brand_landing_series(brand, month)` (chỉ ngày/sàn/xác suất/target từ sổ dự báo — brand không được thấy GMV tháng chưa phát hành). Replay 0001→0170 sạch, chạy lần 2 sạch, `supabase/tests/0170_control_room.sql` 22 mục OK, đỏ khi thiếu 0170. Số đo nền: lịch sử `## Phòng Điều Hành (2026-10-11)`.

- **11/10 (khuya): CHỌN PHÒNG/PHIÊN LÚC UP FILE — CHỈ GỢI Ý, KHÔNG KHOÁ (migration `0168` ĐÃ CHẠY 11/10; đã commit + push; tsc 0 lỗi, vitest còn đúng 2 đỏ có sẵn của Shopee).** User báo: Live List Shopee tải giữa phiên (ca nối giao ca) để Duration 0 ⇒ giờ kết thúc = giờ bắt đầu ⇒ picker coi là "ngoài giờ ca" và khoá hết, không tick được gì.
  **Code:** `shopeeFiles.readShopeeStreams` — Duration 0 ⇒ `endAt` undefined (= "đang live"). `roomSelection.classifyRooms(rows, win, now, carryRoomIds)` — gợi ý thêm phòng còn live và phòng ca trước đã có (ca nối). `SnapshotRoomPicker` — mọi dòng tick được, nhãn "gợi ý", dòng ngoài giờ chỉ mờ + cảnh báo khi tick; dòng gửi đi mang `raw.picked = true`. `0168_trust_picked_rooms.sql` — view `session_room_deltas` + `apply_segment_checkpoint_file` (nguyên văn 0154) bỏ luật cửa sổ cho dòng có `raw.picked` (snapshot cũ không có cờ giữ luật cũ).
  **Verify:** file thật VERA Shopee 11/10 14:37: phiên 09:59 thành "đang live", tick sẵn cho ca 10:00–13:00 (65%) và ca nối 13:00–15:00 (35%); test mới ở `roomSelection.test.ts` (2) + `shopeeFiles.test.ts` (1). Replay 0001→0168 sạch, 0168 chạy lần 2 sạch, `supabase/tests/0168_trust_picked_rooms.sql` 3 mục OK (đỏ khi chỉ replay tới 0167). Chưa bấm thử trên app thật.
- **11/10 (đêm): APP TALENT T2 — "Đã nhận lịch" + "Chuẩn bị ca" (migration `0169` ĐÃ CHẠY 11/10 và đã kiểm trên DB thật: đọc `shift_acks` = 0 dòng, RPC admin bị chặn "chưa gắn hồ sơ" (42501, không PGRST202), Bảng Vận Hành hiện "20 người chưa nhận lịch 16 ca trong 48 giờ tới"; đã commit 11/10).** Talent bấm "Đã nhận" ca mới xếp/đổi giờ (khối ở Hôm Nay dưới thẻ ca kế tiếp, cộng vào chấm đỏ tab); OP thấy việc "N người chưa nhận lịch M ca trong 48 giờ tới" ở Việc cần làm (đỏ khi có ca ≤ 12 giờ). Dòng nhận = phiên bản giờ lúc bấm (`shift_acks`: ngày/giờ đã nhận) ⇒ OP đổi giờ thì phải nhận lại, màn hiện "trước: 10:00–13:00"; rút người khỏi ca ⇒ constraint trigger HOÃN xoá dòng (`set_session_staff_segments` xoá-rồi-chèn đoạn trong 1 lệnh). Ghi chỉ qua RPC `ack_my_shifts`. "Chuẩn bị ca" trên thẻ ca kế tiếp: ngày camp (lịch cố định), target ca, ca trước CÙNG brand × sàn có GMV, ca trước trong cùng phòng — KHÔNG dựng phần sản phẩm/ghi chú vì đo DB 11/10: 0 SKU, 0 khuyến mãi, 1/347 ca có ghi chú. Code: `lib/db/shiftAcks.ts`, `hooks/useShiftAcks.ts`, `lib/talent/acks.ts` + `prep.ts`, `TodoPanel`/`todoList` (id `unacked-shifts`).
  **Verify:** `supabase/tests/0169_shift_acks.sql` 16/16 OK trên replay cả chuỗi (đỏ khi chưa nạp 0169); `tests/talentAcks.test.ts` 5; harness 375px: Sỹ Hùng 20 ca chờ nhận → bấm → khối + chấm đỏ mất, danh sách OP 20 người bỏ tên Hùng; giả lập đổi giờ hiện "Đổi giờ · trước". DB chưa có 0169 ⇒ app ẩn khối nhận + bỏ việc OP (PGRST205), không báo lỗi. **Tiếp (T3):** đổi ca có OP duyệt (nâng từ "báo không đi được" 0116), bảng công cuối tháng talent xác nhận, Zalo OA khi user có OA.
- **11/10 (tối): APP TALENT T1 — 4 tab cho host/trợ live (không migration; đã commit 11/10 cùng T2; tsc/eslint 0 lỗi mới, audit:dead sạch, build OK, vitest còn đúng 2 đỏ có sẵn của Shopee).** Đề xuất + số đo + prototype: https://claude.ai/artifact/KjJ4fQ9pVqd7WYAkyJqudk (đo 11/10: 0 lượt mở màn của role talent từ 26/09; 67/92 ca tuần 05–11/10 "chưa giao ca"; 0 ca mở đăng ký tuần 12–18/10). **User chốt 4 điểm:** (A) talent thấy số ca người khác NHƯ OPS (không che); (B) chỉ đăng ký từng ca mở (không khai giờ rảnh); (C) hiệu suất chỉ số của mình so mặt bằng cùng kênh, không tên người khác; (D) giao ca trên MÁY TÍNH ở phòng live (điện thoại chỉ nhắc).
  **Code:** tab **Hôm Nay** (id cũ `my_shifts`, `components/talent/TalentToday.tsx`: ca đang live/kế tiếp, Cần giao ca theo ngày, trùng giờ của mình, nối ca ≤30', 7 ngày tới, thẻ hướng dẫn lần đầu localStorage) · **Lịch** (id mới `talent_calendar` = `LiveCalendar` cách nhìn talent: Của tôi/Toàn agency, mở sẵn Lịch Tuần, không kéo-thả/mở ca/Tải Lịch Host, ngày trống một dòng chữ) · **Đăng Ký Ca** (`TalentShiftSignup` viết lại: thẻ `SessionEventCard` pending + "Tôi rảnh", lọc brand/buổi, "Rảnh cả N ca đang lọc", chặn ca trùng ca đã có) · **Hồ Sơ** (`MyTalentProfile` + khối "Ca và giờ làm" của tháng chọn, "Hiệu suất so mặt bằng" = `hostReliability` 90 ngày theo kênh, nút Đổi mật khẩu; thu nhập không in 0 khi chưa có rate). Thanh tab dưới đáy `TalentTabBar` (md:hidden; chỉ mục không gắn quyền; nút ☰ ẩn khi talent không có quyền thêm). Logic thuần `lib/talent/myShifts.ts` + `lib/talent/standing.ts` (test `tests/talentMyShifts.test.ts` 15). Bỏ `OpsBoard mode="mine"`. Sửa lỗi có sẵn: `LiveCalendar` thả thẻ khi thiếu `onUpdateSession` vẫn báo "Đã chuyển". Chi tiết: lịch sử `## App talent T1 (2026-10-11)`.
  **Verify:** harness 375px với dữ liệu thật (Trà Giang, Sỹ Hùng; Lịch 3 chế độ 0 tràn/0 thẻ kéo được; Đăng ký với ca mở mô phỏng trong bộ nhớ). Admin: Lịch & Studio + Bảng Vận Hành không đổi. **Chưa thử bằng tài khoản talent thật** — RLS: talent không đọc Kế Hoạch Tháng ⇒ có thể thiếu viên Target.

- **11/10 (sau): ĐỐI SOÁT — GỘP CA BỊ RESTART / NGẮT GIỮA CHỪNG (migration `0167` ĐÃ CHẠY 11/10; đã gộp thật VERA Shopee 01–10/10; tsc 0 lỗi, audit:dead sạch, vitest còn đúng 2 đỏ có sẵn của Shopee).**
  Nguyên nhân nhãn "ca" trơn ở cột "Ca khớp" (đã truy DB thật, lô Shopee VERA T10): đó là ca nạp bù cực ngắn (mảnh restart 0–2 phút, GMV 0) đã bị `excluded_from_reports` nên `activeSessions` không có ⇒ panel không gắn được giờ; mỗi lần tắt bật stream sàn sinh một room mới ⇒ một dòng đối soát + một ca rác. Nhãn không tìm thấy nay là "ca ẩn".
  **Code:** `0167_merge_reconciliation_rows.sql` — RPC `merge_reconciliation_rows(batch, [[row ids]])` (ceo/admin/ops): dòng giữ = GMV lớn nhất; giờ = sớm nhất→muộn nhất; mọi số CỘNG (tổng không đổi); ca khớp = hợp trừ ca đã loại khỏi report; rổ review nếu có dòng review; `raw.merged_from` ghi lại dòng bị gộp (+ `raw.atc` cộng cho Shopee); cập nhật `row_count`; KHÔNG đụng `live_sessions` (số ca chỉ đổi khi bấm Áp dụng). Client: `lib/reconciliation/mergeRestarts.ts` (`suggestMergeGroups`: mảnh ≤10 phút dính vào dòng liền kề GẦN nhất nếu nghỉ ≤10 phút; hai room dài nghỉ ≤5 phút VÀ cùng khớp một ca; chỉ rổ agency/review; test `tests/mergeRestarts.test.ts` 5 mục), `mergeReconciliationRows` ở `lib/db/liveReconciliation.ts`, khối tím "Ca bị restart / ngắt giữa chừng · N nhóm" ở đầu `ReconciliationPanel.tsx` (mỗi nhóm một ô tick mặc định bật, nút "Gộp N nhóm đã chọn"; DB chưa có 0167 ⇒ báo "Chưa chạy migration 0167").
  **Cố ý:** gộp KHÔNG hoàn lại được (tạo lại lần đối soát từ file nếu cần tách); ca nạp bù 2 phút vẫn nằm trên lịch (đã loại khỏi report, có thể đã gán host) — gộp chỉ dọn dòng đối soát + nhãn, muốn xoá ca rác dùng "xoá ca nạp bù" ở lưới gán host.
  **Verify:** replay 0001→0167 sạch, 0167 chạy lần 2 sạch, `supabase/tests/0167_merge_reconciliation_rows.sql` 9 mục OK (nhóm 1 dòng bị chặn, dòng giữ, cộng số, bỏ ca ẩn, raw.merged_from, row_count, Áp dụng sau gộp ghi đúng GMV, dòng đã xoá không gộp lại). Trên app thật (VERA Shopee lô 01–10/10, chưa chạy 0167): gợi ý đúng 4 nhóm (03/10 20:00, 04/10 20:04, 07/10 10:59, 08/10 21:44) — **đã bấm Gộp thật 11/10 (user đồng ý): 23 → 19 dòng, 4 nhóm, Σ GMV 99.169.034 / đơn 297 / lượt xem 37.047 / thời lượng 4.360 phút giữ NGUYÊN; rổ agency 16 → 12 phiên vẫn 48.135.109; hết nhãn "ca" trơn; lô chưa Áp dụng.** Phiên khác đang sửa song song luồng ca nối/restart ở Lịch (`SessionRoomCase` v.v.) — hai việc độc lập.

- **11/10: ĐỐI SOÁT — CHỌN PHIÊN NÀO ĐỐI SOÁT, PHIÊN NÀO KHÔNG (migration `0166` ĐÃ CHẠY 11/10; tsc 0 lỗi, eslint không thêm lỗi, vitest còn đúng 2 đỏ có sẵn của Shopee, build OK).**
  Yêu cầu user (màn Dữ Liệu Gốc → Creator Live Performance / Live List → "Khớp ca agency"): được tick phiên nào đối soát, phiên nào không. Trước đây "Áp dụng" ghi đè mọi phiên ở rổ agency + review.
  **Code:** `0166_recon_row_excluded.sql` — cột `live_reconciliation_rows.excluded boolean default false` + vá `apply_live_reconciliation` bằng `pg_get_functiondef`/`replace` (cùng cách 0150) thêm `and not rr.excluded` vào rổ agency/review ⇒ dòng bị loại không vào phép chia, ca khớp với nó giữ nguyên số + nguồn. Ghi cờ bằng UPDATE trực tiếp (RLS `live_recon_rows_ceo_admin_ops` đã đủ, không RPC mới). Client: `setReconciliationRowsExcluded` + cột `excluded` ở `lib/db/liveReconciliation.ts` (đọc tolerate DB chưa có cột — mã 42703 ⇒ đọc như cũ; ghi khi chưa có cột ⇒ thông báo "Chưa chạy migration 0166"); `ReconciliationPanel.tsx`: ô tick từng dòng ở hai rổ agency/review (các rổ khác không được ghi nên không có), "Chọn tất cả / Bỏ chọn tất cả" + dòng "Đối soát X/Y phiên · GMV" từng rổ, rổ agency/review hiện ĐỦ dòng (bỏ giới hạn 20), nút Áp dụng khoá khi 0 phiên được chọn, hộp xác nhận nêu số phiên bỏ qua.
  **Cố ý:** lựa chọn nằm trên dòng của lô ⇒ nạp lại file (lô mới) chọn lại từ đầu; bỏ tick SAU khi đã áp dụng không hoàn số đã ghi (đã nói trong màn); ca có hai phiên mà chỉ một phiên được chọn sẽ nhận phần của phiên được chọn (không còn đủ tổng) — user tự chịu khi bỏ tick.
  **Verify:** replay 0001→0166 sạch trên Postgres cục bộ, chạy 0166 lần 2 sạch, `supabase/tests/0166_recon_row_excluded.sql` 7 mục OK (mặc định không loại; phiên chọn ghi đè; phiên loại giữ số cũ + nguồn `manual`; chọn lại + áp dụng lại; loại hết ⇒ áp dụng trả 0, số không đổi). Trên app thật (VERA TikTok) sau khi chạy 0166: bỏ tick 1 phiên → tải lại vẫn giữ (cờ ghi vào DB) → tick lại về 0 phiên bị loại. **Chưa thử:** bấm Áp dụng thật với phiên bị loại (tránh ghi đè số ca thật; đã kiểm bằng test SQL); Shopee (Live List) cùng panel nên cùng hành vi.
- **11/10: MODULE RUN-RATE (cập nhật cho sếp + brand) — user yêu cầu build RIÊNG, dashboard nghiên cứu sau. Không migration, không ghi DB; chưa commit; tsc/eslint 0 lỗi, audit:dead sạch, build OK, vitest còn đúng 2 đỏ có sẵn của Shopee (Live List 50 phiên, Report bản chụp); đã xem trên app thật 1440/800/375px.**
  Nhu cầu: mỗi ngày / tuần / khi vào đợt campaign, user phải báo run-rate từng tài khoản cho sếp + brand, theo ca / ngày / campaign / tháng. Mục sidebar mới **"Run-rate"** (nhóm Vận Hành Hằng Ngày, id `run_rate`, quyền `manage_sessions`, route `/run-rate`; KHÔNG khai ở `TAB_CHANNEL_SCOPE` — tự liệt kê cả hai sàn, mỗi sàn một nhóm thẻ).
  **Số = đúng `planRunRate`** (luật 28/09; đã đối chiếu: VERA TikTok 49%, Franklin 104%, JOCKEY 111%, CROCS 106%, VERA Shopee 35%, Franklin Shopee 10% khớp từng số với Dashboard "Tháng này"). `lib/performance/runRateUpdate.ts` (test `tests/runRateUpdate.test.ts`) chỉ (1) cắt kết quả ở ngày **"số tới"** — mặc định ngày đủ số từng tài khoản (`dataCoverage`), user chọn được một ngày chung cho mọi thẻ (`resolveAsOf` kẹp trong [đầu tháng, ngày cuối có số]; sau ngày đủ số thì gắn "Tạm tính") — rồi chia tháng / tuần (thứ Hai→CN) / đợt camp (D-Day, Mid, Pay Day, ngày thường) / ngày / ca (`buildAccountRunRate`); (2) xuất Excel 4 sheet (`runRateExportSheets`). Ngăn "Soạn cập nhật" (bản tin chữ cho Zalo) đã BỎ theo yêu cầu user (tự chụp màn hình gửi) — đừng dựng lại.
  **UI:** `components/RunRateBoard.tsx` (nạp `planStatusesRead` + `monthPlanRead` như CeoBrief) + `components/runrate/` (`AccountCard`, `AccountDetail` = đồng hồ run-rate + 4 góc nhìn, `lenses.tsx`, `parts.tsx` = gauge/biểu đồ SVG, . Chọn thẻ ⇒ cuộn xuống chi tiết; điện thoại: thẻ thành hàng cuộn ngang; bảng nhiều cột chỉ bật từ `lg` (container hẹp vì sidebar).
  **Góc "Từng đợt" có nút "Tiến độ / Cả đợt"** (11/10, user: 95% run-rate dễ hiểu lầm là "mai chỉ cần 5%"): Tiến độ = run-rate (mặc định, luật không đổi); Cả đợt = đạt ÷ target cả đợt, thanh thang 0–100% với vạch = mức kỳ vọng tới nay, "Còn thiếu", và "còn N ngày phải chạy X% target các ngày đó" (`RRWave.gap/daysLeft/needRate`, cũng vào sheet Excel "Theo đợt"). Màu vẫn theo run-rate. Lựa chọn nhớ ở localStorage `runrate.waveMode`.
  **Giới hạn (cố ý):** chưa có "lịch sử bản đã gửi" / xuất bản cho brand xem trong app (cần bảng + RLS ⇒ migration — làm khi user muốn); tài khoản chưa chốt Kế Hoạch Tháng chỉ hiện số đã đạt, không có run-rate; chưa xem bằng tài khoản role khác ops (tab chỉ ceo/admin/operations). Quan sát có sẵn, KHÔNG phải của đợt này: mỗi lần mở app có 1 request 400 tới RPC `complete_past_sessions` (`lib/db/sessions.ts:485`).
- **10/10 (đêm): CA TĂNG CƯỜNG — migration `0165` ĐÃ CHẠY 10/10 và ĐÃ KIỂM trên DB thật: `pg_proc` có đủ 4 hàm (`ensure_boost_slot`, `set_boost_targets`, `trg_shift_slots_boost`, `trg_plan_slots_drop_boost`) + 2 trigger; `set_boost_targets(plan, [])` gọi từ app trả 0; `fetchPlanCoverage('2026-10')` đọc đúng 6 kế hoạch đã chốt (74/95/87/53/28/32 ca). Bài học: lần chạy đầu trên SQL editor chỉ tạo được bảng (hàm/trigger thiếu, API báo PGRST202) — chạy lại cả file mới đủ; kiểm bằng `select proname from pg_proc where proname like '%boost%'` TÁCH từng câu (ô kết quả chỉ hiện câu cuối). Chưa thử OP mở ca thật → dòng tăng cường. tsc 0 lỗi, audit:dead sạch, eslint 0 lỗi mới, vitest còn đúng 2 đỏ có sẵn của Shopee.**
  Vấn đề gốc (hỏi 10/10): ca OP mở ở Lịch & Studio chỉ ghi `shift_slots` (rồi `live_sessions` khi chốt người), không có dòng nào ở `brand_month_plan_slots` ⇒ nằm ngoài kế hoạch; ca nạp bù (`create_backfill_sessions`) chỉ ghi `live_sessions`. "Chốt/Chốt lại" chỉ đi một chiều kế hoạch → ca thật. **User chốt:** ca tăng cường có target ĐỀ XUẤT từ engine (dự báo riêng của ca), các ca khác KHÔNG đổi, target đó KHÔNG cộng vào target tháng / run-rate (luật run-rate 28/09 giữ nguyên); GMV ca tăng cường vẫn cộng vào thực đạt.
  **Code:** `0165_plan_boost_slots.sql` — bảng RIÊNG `plan_boost_slots` (không chung `brand_month_plan_slots` vì mọi nơi cộng bảng đó thành target tháng: `lockedPlanTargets.monthTotals`, `planRunRate`, Report, Dashboard); trigger `trg_shift_slots_boost` (INSERT / đổi ngày giờ / mở lại ca): kênh có kế hoạch ĐÃ CHỐT mà chưa có ca kế hoạch/dòng tăng cường cùng giờ ⇒ chèn dòng `target_pending`; trigger `trg_plan_slots_drop_boost` xoá dòng tăng cường khi ca vào kế hoạch gốc (Chốt lại / `rebase_month_plan`); RPC `set_boost_targets(plan, items)` (ceo/admin/operations); RLS: chỉ ceo/ops/admin đọc, không policy ghi. Client: `lib/scheduling/boost.ts` (`boostFillItems`, `summarizeBoost`), `fetchBoostSlots`/`setBoostTargets` trong `lib/db/monthPlans.ts`, kiểu `BoostSlot`; `MonthPlan.tsx` tự điền target = `forecastsFor(ca)` khi mở Kế Hoạch Tháng của kênh + khối "Ca tăng cường (N)" (không cộng vào target tháng). Tolerate DB chưa chạy 0165 (bảng chưa có ⇒ `[]`).
  **Verify:** replay 0001→0165 sạch trên Postgres cục bộ, chạy 0165 lần 2 sạch, `supabase/tests/0165_plan_boost_slots.sql` 21 mục OK (và ĐỎ khi chưa có 0165): sinh dòng cho ca OP thêm (kể cả đã qua), KHÔNG sinh cho sàn khác/kế hoạch nháp/tháng chưa có kế hoạch/ca huỷ/ca nạp bù/ca cùng giờ ca kế hoạch gốc, brand không đọc được, client không ghi trực tiếp, target tháng + Σ ca kế hoạch không đổi, dời giờ → dòng mới chờ target, huỷ ca giữ dòng, Chốt lại + `rebase_month_plan` không xung đột. `tests/boost.test.ts` 4 mục.
  **Cảnh báo ở "Việc cần làm" (Bảng Vận Hành, không migration):** `TodoPanel` nạp `fetchPlanCoverage(tháng)` (ca kế hoạch của plan đã chốt + dòng tăng cường) → `buildTodos` đếm bằng `collectRebase` số ca trên lịch chưa có trong kế hoạch gốc của từng kênh (`plan-outside-*`, mức vừa; ca tăng cường KHÔNG đếm vì cố ý nằm ngoài) + nhắc ca tăng cường còn thiếu target (`plan-boost-*`, mức thấp). Bấm mở Kế Hoạch Tháng đúng brand × sàn. `tests/todoList.test.ts` +4 mục.
  **Giới hạn (cố ý, nói thẳng):** (1) ca nạp bù từ file KHÔNG sinh dòng tăng cường (phiên không có shift_slot) — vẫn ngoài kế hoạch tới khi bấm "Chia lại theo lịch hiện có…"; (2) dời giờ ca đã gắn ca kế hoạch GỐC chưa sửa dòng kế hoạch (`update_session_with_children` chỉ sửa phiên) — vẫn là việc của "Chốt lại"; (3) target đề xuất do CLIENT điền (engine chạy ở client) nên chỉ có sau khi ai đó mở Kế Hoạch Tháng của kênh — trước đó dòng ở trạng thái "chờ target"; (4) target ca tăng cường mới chỉ hiện ở khối trong Kế Hoạch Tháng, chưa đổ xuống Lịch/Dashboard/chấm ca; (5) ca tăng cường được đưa vào kế hoạch gốc (target tính vào tổng) CHỈ khi user chủ động bấm "Chia lại theo lịch hiện có…".
- **10/10 (tối): KẾ HOẠCH THÁNG — "CHIA LẠI THEO LỊCH HIỆN CÓ" (migration `0164` — ĐÃ CHẠY 10/10 (user chạy ở SQL editor) và ĐÃ ÁP DỤNG trên DB thật cho VERA Shopee T10 + CROCS TikTok T10, xem dòng Verify; code đã commit `bb5eab8`; tsc/eslint 0 lỗi ở file đã sửa, audit:dead sạch, vitest còn đúng 2 đỏ có sẵn của Shopee — Live List 50 phiên, Report bản chụp; build OK).**
  Yêu cầu user: module cần HAI chức năng — (1) sinh lịch theo plan (giờ + GMV + phân tích tháng cũ + chia target theo target tổng; chức năng chính sau launch — đã có đủ: Gợi ý phân bổ / Xếp theo target / Chia lại target ở lưới Nháp) và (2) sinh lại từ lịch ĐÃ CÓ để chia lại target mới, lấy TOÀN BỘ ca trên lịch kể cả ca từ module sinh lịch + ca OP thêm. Cái (2) trước đây là 3 nút rời (Dựng lưới → Chốt lại → Chia lại 0162), ca đã qua ngoài kế hoạch không vào được (trigger 0133 + client lọc ngày ≥ hôm nay) nên target 0 và nằm ngoài Σ. **User chốt 3 luật:** (a) ca đã qua CÓ bị chia lại; (b) ca đã huỷ BỎ khỏi phần chia (target về 0 — khác luật run-rate "ca kế hoạch huỷ giữ target", luật đó vẫn đúng cho plan ban đầu); (c) ca OP thêm TÍNH NGAY vào kế hoạch (giờ + Σ target).
  **Code:** `0164_rebase_month_plan.sql` — RPC `rebase_month_plan(plan, items, note)` (ceo/admin, kế hoạch đã chốt, một transaction): item `{id,target}` đổi target ca có sẵn · `{id,target,session_id|shift_slot_id}` gắn thêm ca thật · `{target,session_id|shift_slot_id,expected}` THÊM dòng kế hoạch cho ca trên lịch (tạo shift_slot `finalized` trỏ tới phiên như 0151, hoặc gắn thẳng ca mở không phiên; không mở đăng ký); trigger `guard_locked_plan_slot` nới thêm đúng một chỗ (INSERT ngày đã qua khi `app.retarget_plan` = id kế hoạch); ghi `plan_target_audit` cả dòng thêm (cũ 0); `brand_month_plans.target_gmv` = Σ ca. `retarget_month_plan` (0162) còn nguyên nhưng client không gọi nữa. `lib/scheduling/rebase.ts` (`collectRebase` → `activeDrafts` → chia → `mergeAllocated` → `buildRebase`; test `tests/rebase.test.ts`, 11): ca kế hoạch ĐÃ LƯU phân loại active / cancelled (ca hoặc phiên huỷ) / nosession (ca mở ngày đã qua, hoặc chưa gắn mà lịch không có gì); ca trên lịch chưa trong kế hoạch = phiên không huỷ cùng brand × sàn × tháng + ca mở không phiên; trùng đúng giờ với ca khác thì bỏ (unique plan_id+date+giờ). `MonthPlan.tsx`: nút "Chia lại theo lịch hiện có…" (thay "Chia lại target cả lưới…"), panel nhập target mới + target nhóm ngày → Xem trước (tóm tắt: ca đổi / ca thêm / ca bỏ, bảng nhóm ngày, chi tiết từng ca) → Áp dụng; không còn đòi "Chốt lại" trước, sửa chưa lưu trên lưới bị bỏ (confirm có nhắc). Nút "Dựng lưới từ … ca đã nhập" chỉ còn ở lưới Nháp (khi đã chốt dùng nút mới). `db/monthPlans.ts`: `rebaseMonthPlan`, bỏ `retargetMonthPlan`/`buildRetarget`.
  **Verify:** replay 0001→0164 trên Postgres cục bộ sạch; `supabase/tests/0164_rebase_month_plan.sql` 19 mục OK (ops bị chặn, thêm trực tiếp ca đã qua vẫn bị chặn, ca khác sàn/huỷ/ngoài tháng/trùng/id lạ/âm bị từ chối và rollback cả batch, ca OP đã qua + tương lai vào kế hoạch, nhật ký, Σ). Trên app thật (VERA Shopee T10, dev server): Xem trước 750M → "94 ca còn chạy · 78 ca đổi (19 đã qua) · 17 ca OP chưa có trong kế hoạch (5 đã qua: 02–04/10, 08–09/10) · 1 ca bỏ (03/10 20:00–20:02 target cũ 78K)". **ĐÃ ÁP DỤNG 10/10 sau khi 0164 chạy (user đồng ý trong chat):** VERA Shopee T10 17:29 — 78 ca đổi, thêm 17 ca OP, 1 ca về 0, Σ 750M giữ nguyên, lưới 78 → 95 ca; Xem trước lại = 0 đổi / 0 ngoài kế hoạch; CROCS TikTok T10 17:31 — thêm ca 17/10 11:00–14:00, ca huỷ 19/10 (47,5M) về 0, Σ 5,15B, lưới 86 → 87 ca. Quét Xem trước mọi kênh T10 (chưa ghi): Franklin/JOCKEY/VERA TikTok + Franklin Shopee = 0 ca ngoài kế hoạch; JOCKEY Shopee chưa chốt kế hoạch (không có nút); CROCS không có kênh Shopee. **Nguyên nhân gốc "ca có trên lịch mà không có trong kế hoạch":** `create_backfill_sessions` (0086/0156) chỉ insert `live_sessions` (target 0, `is_backfill`), không tạo `shift_slots`/ca kế hoạch; ca OP tự mở ở Lịch & Studio cũng vậy, và "Chốt lại" chỉ đi một chiều kế hoạch → ca thật. Cách xử: nút "Chia lại theo lịch hiện có…". Lưu ý vận hành: các ca nạp bù/OP thêm MỚI phát sinh sau này vẫn nằm ngoài kế hoạch tới khi chạy lại nút này (chạy lại an toàn).
- **10/10 (chiều): DASHBOARD AGENCY + BRAND LÀM LẠI ĐỢT 1 (không migration; commit ngay sau commit engine target v3 `334121e` — hai đợt tách hai commit; tsc/eslint 0 lỗi ở file đã sửa, audit:dead sạch, vitest còn đúng 2 đỏ có sẵn của Shopee — Live List 50 phiên, Report bản chụp; build OK; đã xem trên app thật 1024px + 375px, TikTok + Shopee + brand CROCS T9/T10).** Đề xuất + số đo: https://claude.ai/artifact/DKuM9K9dLJy1nTvFPPtYNX — user đồng ý cả 4 điểm: gộp tab, ngưỡng target cao 1,3×, ngày đủ số ≥ 90% giờ ca, brand thấy tỷ trọng live trong Total GMV. Chi tiết: lịch sử `## Dashboard agency + brand làm lại đợt 1 (2026-10-10)`.
  **Agency:** 4 tab cũ → 2 tab. **"Tháng này"** (`components/dashboard/ThisMonth.tsx`): dải độ tin số → 3 ô (cuối tháng về đâu · tới ngày đủ số so cùng loại ngày · đợt kế tiếp giờ lịch/mọi khi) → **bảng mỗi kênh MỘT kết luận** (landingOf) + nguyên nhân gốc + run-rate phụ → việc kinh doanh (≤ 5) tách việc dữ liệu → chi tiết kênh chọn: cây GMV/giờ ngày thường, thị trường hay mình (controlGroup, chỉ TikTok + ops), run-rate theo đợt, `ChannelPlan` (từ ActionPlan), DrillDown (`channelId`) gập lại → ô KPI. **"Sức khoẻ"** (`Health.tsx`): AgencyHealth · xu hướng lưu lượng/chuyển đổi 3 tháng + tháng này · tải người (theo đoạn, cả 2 sàn, ngưỡng `fatigueWeekHours` + 6h/ngày) · host VÀ trợ live so mặt bằng trong CÙNG kênh 90 ngày (`hostReliability(..., "assistant")` mới) · cam kết giờ + kỷ luật dữ liệu · Tài chính. Bỏ: Cockpit, MonthOverMonth (bảng 20 chỉ số), StaffSection (xếp GMV/giờ thô qua brand), thang run-rate có Hôm qua/Hôm nay (`runRateLadder.ts` + test đã xoá — việc hôm nay là của Bảng Vận Hành), 2 ô tiền "Chưa tính được" khi 0 ca có tiền.
  **Brand** (`BrandDashboard.tsx`): thẻ "Tóm tắt" lớp khách ở đầu (kết quả so target + nhãn · Live trong Total GMV — ops đọc Shop Analytics, role brand đọc piece `shopDays` của bản chụp đã phát hành qua `shopDaysPiece` · giờ đã giao/cam kết · GMV/giờ ngày thường cùng loại ngày); run-rate cắt ở ngày đủ số + nhãn khả năng đạt; "Cần mỗi ngày còn lại" → **"GMV/giờ cần"** (target − đã có) ÷ giờ ca còn trong lịch, so 28 ngày; KPI + "Vì sao GMV đổi" so cùng loại ngày.
  **Lib mới** `lib/performance/channelHealth.ts` (test `tests/channelHealth.test.ts` 24): `dataCoverage`, `runRateThrough`/`runRateByWave`, `matchedPrevDays`/`likeForLike`/`likeForLikeMany`, `gmvTree` + `LEVER_OWNER`, `targetFeasibility`, `nextWaveReadiness`, `channelVerdict`, `dataDiscipline`, `peopleLoad`, `runRateTone`. `buildIssues` gắn `code` (`DATA_ISSUES`, `BOARD_ISSUES`).
  **Đo 10/10 trên app:** TikTok mũi tên GMV tới 08/10 **+2,1%** cùng loại ngày (màn cũ "−36%"); VERA TikTok GMV/giờ ngày thường −47% (Views/giờ −30%); JOCKEY TikTok target ×1,73, VERA Shopee ×1,55 lịch sử; CROCS T9 live = 70,6% Total GMV. **Dữ liệu sai màn mới bắt được, CHƯA sửa (việc user):** `brand_month_plans.target_gmv` CROCS TikTok T10 = 5.210.333.436 ≠ Σ 86 ca 5.154.124.000; VERA Shopee T10 = 1.288.999.301 ≠ Σ 78 ca 1.100.000.000 (cả hai `updated_at` 2026-10-09 19:17–19:18 UTC); cam kết giờ VERA TikTok T10 = 550.000.000. Run-rate vẫn lấy Σ target ca (đúng luật).
  **Chưa làm (đợt 2–3 của đề xuất):** cảnh báo target > 1,3× ngay lúc Chốt Kế Hoạch Tháng; up Shop Analytics hằng tuần cho 4 brand (hiện chỉ CROCS tới 22/09) + Ads theo ngày; tiền khi có rate. Chưa xem bằng tài khoản role brand thật.

- **10/10 (khuya): ENGINE TARGET v3 ĐÃ CODE (user "làm tất cả") — migration `0163` ĐÃ CHẠY 10/10 (user xác nhận; đã thấy 5 dòng `daily` 10/10 trên DB — 4 kênh TikTok + VERA Shopee; Franklin Shopee chưa đủ 15 ca nên chưa vào sổ; thẻ Training hiện "Sổ dự báo đã ghi"); đã commit `334121e`; tsc 0 lỗi, test mới xanh.** Đề xuất + số đo: https://claude.ai/artifact/Go5jTAAtVzjCCHxz7H9J98.
  **Code:** `lib/performance/monthForecast.ts` (bộ dự báo một kênh: mức = trung bình nhân 28 ngày & 3 tháng × trọng số hình dạng của `allocationModel`; giờ/ngày vượt p90 lịch sử chỉ tính `fcOutOfRangeFactor`; `planOutlook` P50 + dải 80% (0,22 kênh lớn / 0,30 nhỏ) + khả năng đạt; `inMonthProjection` cập nhật theo số đã có, ca chưa có số không tính là 0; `checkpointsOf`/`checkpointAdvice` 3 mốc bù giờ; `backtestMonthForecast`; `leadingSignalCheck` Ads/scheme). **Gốc lỗi sửa:** `buildHistory` rải GMV đã chia hệ số camp/lễ/scheme vào ô (thêm `baseGmvPerHour`) — `estimateSlots` cũ hết đếm camp hai lần (31% → 11%). `monthOutlook` (Dashboard, run-rate, Hỗ Trợ Vận Hành, Report) dùng v3 khi kênh ≥ 15 ca (`forecastModel`, `coneCoef`, `shape`), không đủ thì GMV/giờ 28 ngày; dải theo kênh thay 35% cố định. `handlingPlan`: đòn bẩy "thêm giờ" theo công thức mốc (co giãn + trần `fcCheckpointCap`), ActionPlan có khối "Mốc điều chỉnh giờ". Kế Hoạch Tháng: dự báo/chia/xếp theo target dùng v3 (`forecastsFor`, `schedulerTarget`), khối "Dự báo GMV của lưới". 7 tham số `fc*` ở EngineParams. AI Training Center: thẻ `ForecastTrainingCard` (4 chỉ số, backtest, sổ, tín hiệu dẫn) + sửa lỗi có sẵn trang sập ở dev khi brand có 2 sàn (`buildHistory` nay theo sàn chọn).
  **0163:** bảng `forecast_snapshots` + RPC `record_forecast_snapshots` (ceo/ops/admin); Dashboard tháng này ghi dòng `daily`/kênh/ngày, Chốt Kế Hoạch Tháng ghi `plan`. Replay 0001→0163 sạch, chạy 2 lần sạch, `supabase/tests/0163_forecast_snapshots.sql` 15 OK. Chưa chạy ⇒ ghi bị bỏ qua, thẻ báo "chưa chạy migration 0163".
  **Số đo trên app thật (CROCS+VERA, walk-forward T7–T9):** lúc lập 13%; trong tháng ngày 8/15/18: 7,7% / 4,7% / 2,8% (Dashboard cũ 12/8/6%), dải 80% bao 9/9; tự hiệu chỉnh lệch CÓ HẠI (mặc định tắt). Đã xem trên app thật (10/10 sáng): thẻ Training (T10 dở dang không còn vào "lệch các tháng trước"), Dashboard tab Action (VERA/JOCKEY TikTok — khối 3 mốc, mốc tới tô sáng), Kế Hoạch Tháng VERA TikTok T10 (P50 524,3M, dải 409–639,7M, khả năng đạt 39%). eslint 0 lỗi (2 cảnh báo có sẵn); vitest còn đúng 3 đỏ có sẵn (Talent Pool, Live List 50, Report bản chụp). **Dữ liệu sai cần user sửa:** VERA TikTok T10 `brand_commitment_progress.committed_hours = 550.000.000` (target gõ vào ô giờ, ô GMV trống) ⇒ Kế Hoạch Tháng hiện "thiếu 549.999.787,7h"; đã chặn lưu giờ cam kết > 2.000 ở `saveCommitment`.

- **10/10: sắp lại bố cục cả app + bố cục Kế Hoạch Tháng + chia lại target cả lưới (0162)** — nguyên văn: lịch sử `## §1 các đợt 10/10 bố cục + 0162 (chuyển khỏi WORKSPACE 13/10)`.

- **Các đợt 07–09/10** (chi tiết nguyên văn + cách verify: lịch sử `## §1 các đợt 07–09/10 (chuyển khỏi WORKSPACE 10/10)`):
  audit đa sàn Bước 0–4 (kênh `brand_channels` 0149, hồ sơ sàn `profileOf`, một workspace Agency + thanh Sàn, thang nguồn số 0150, tên chỉ số Shopee);
  chốt T10 khi lịch nhập bằng file (0151, "Dựng lưới từ N ca đã nhập"); gộp Đối Soát vào Dữ Liệu Gốc; giảm thời gian mở app (mốc quay lại ~1.800 ca);
  thẻ ca mới trên mọi lịch (+ % Target, OT/Off, bỏ "+12p"); Talent Pool danh sách + hồ sơ; bỏ màn "Nhân sự ca" (talent dùng `TalentShiftSignup`);
  Hiệu Suất Host theo kỳ; Tải lịch host chia Host/Trợ; Kế hoạch vs thực tế + nhập tay (0152); ca nối/ca ngắt room (0153); Shopee giao ca bằng
  Live List (0154); Affiliate lập kế hoạch trước (0155); nạp bù ca Shopee (0156); nhãn inhouse + đối soát không trùng + xoá ca nạp bù (0157–0159);
  cờ giữ ca trùng người theo sheet (0160); target theo nhóm ngày + mốc đỏ 60% (0161); engine chia target v2 (`allocationModel.ts`); Dashboard agency 4 tab.
  Mọi migration 0149–0161 ĐÃ CHẠY. **Còn treo từ các đợt này:** brand `JEW` (36 ca TikTok T10) chưa tạo; 15 cặp trùng người do sheet chờ user rà;
  hồ sơ `C.Đình`/`P.Thảo` chưa có rate; `create_backfill_sessions` chưa tự bỏ room inhouse (chỉ client lọc); `BrandDashboard.planCheck` vẫn dùng
  `targetWeightModel` cũ; chưa thử trên app thật: Giao ca Shopee bằng file, Ca nối/ngắt room với DB thật, "Sinh ca" VERA Shopee, lưu/tải target
  nhóm, đăng ký ca bằng tài khoản talent, góc nhìn role brand; `apply_segment_checkpoint_file` vẫn lấy mốc ngầm; nhập tay thực tế chưa có Orders/Views.
  Bước tiếp của lộ trình đa sàn: chạy thật 2–4 tuần (không tính năng mới).

- **CHẠY THỬ THẬT trên dữ liệu thật** (từ 2026-09-18; mock đã xoá sạch 19/09). DB: 33 hồ sơ talent thật, CROCS T6–T9 nạp
  bù từ file Creator-Live-Performance (229 ca, còn ca chưa gán host). **Không đề xuất tính năng mới**; hỏi user chạy thử
  tới đâu, cái gì kêu, rồi sửa đúng chỗ đó. **Không seed mock lại.**
- **Nợ kỹ thuật đã hết** (đợt P2a-2…P2a-21, 01–02/10) và **audit code chết đã xong** (02/10): `npm run audit:dead` báo 0,
  ESLint 0 lỗi (31 warning `set-state-in-effect` = nợ đã đo, cố ý `warn`), vitest 467/467 (05/10).
- **Các đợt 04–07/10 trước audit đa sàn** (chi tiết nguyên văn + cách verify: lịch sử `## §1 các đợt 04–07/10 (chuyển khỏi WORKSPACE 07/10)`):
  lịch 2 sàn + chặn trùng người (0143); giao ca: TikTok up file Creator-Live-Performance + chọn sự cố (0145), Shopee dán link + số (0144; BỎ 08/10, nay file Live List — 0154;
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
- **Bàn Trainer (13/10, đã gộp main, chưa push):** chạy `0175_trainer_role.sql` RỒI MỚI chạy `0176_trainer_roster.sql` (hai lần chạy riêng; 0176 cần giá trị enum đã commit) → deploy. Tạo tài khoản role Trainer ở Phân Quyền rồi đăng nhập thử. Nhập rate ở Talent Pool để có chi phí ca. Muốn dùng quy trình tuần thì Kế Hoạch Tháng 11 phải chốt để có ca mở (lịch T10 nhập từ sheet nên tuần T10 chỉ có ca đã lên lịch). Còn mở: host/trợ trả theo giờ hay có người trả theo ca.
- **Đối soát / GMV ca (13/10):** 0174 ĐÃ CHẠY. Còn: deploy client; Áp dụng lô CROCS T10 01–13/10, Áp Dụng Lại lô VERA Shopee 08–10/10 (Claude bị chặn bấm — user bấm); ca CROCS 11/10 09–12 (file tải 13:35) nên gõ GMV đúng ở form Giao ca trước khi Áp dụng.
- **Phòng Điều Hành (11/10):** chạy `0170_control_room.sql` (trước hay sau deploy đều được — client tự báo "chưa chạy 0170" ở khối ca nháp; thẻ brand ẩn khi chưa có RPC); đặt `ANTHROPIC_API_KEY` trên Vercel nếu muốn hỏi bằng Claude (thiếu thì chỉ Gemini). Role brand chỉ thấy điểm của ngày sổ dự báo đã ghi (Dashboard / Phòng Điều Hành được mở ngày đó).
- **0168 ĐÃ CHẠY 11/10.** Còn lại: deploy client rồi thử up Live List giữa phiên ở một ca nối Shopee thật.
- **App talent bản 2 (16/10, đã push, chưa deploy):** chạy `0177_talent_calendar_feeds.sql` (trước hay sau deploy đều được — chưa chạy thì thẻ "Thêm lịch vào điện thoại" ẩn ở Ca của tôi, tab Tôi ghi "chưa bật") → deploy → ở Bàn Trainer bấm "Chép tin Zalo" dán vào nhóm host → nhờ 1–2 host mở link, bấm "Đã xem", thêm lịch vào điện thoại. Đo lại ~30/10: số người mở app (`ui_tab_views` role talent), số người có dòng `shift_acks`, số dòng `talent_calendar_feeds`.
- **App talent T1+T2 (11/10, đã commit):** đăng nhập thử bằng một tài khoản host/trợ thật trên điện thoại rồi báo chỗ sai; muốn tab Đăng ký có nội dung thì OP mở ca qua Kế Hoạch Tháng → Chốt (hiện lịch xếp từ sheet nên 0 ca mở); nhập rate ở Talent Pool để Hồ Sơ có thu nhập. Đo lại sau 2 tuần: lượt mở của role talent (Lượt Mở Tab) + tỷ lệ ca có trợ được giao trong app.
- **0167 ĐÃ CHẠY + đã gộp VERA Shopee 01–10/10.** Còn lại: xem lại bảng rồi Áp dụng lô đó; TikTok chưa kiểm xem có nhóm restart nào cần gộp.
- **0166 ĐÃ CHẠY 11/10.** Còn lại: thử thật bỏ tick vài phiên → Áp dụng → ca khớp phiên bỏ tick phải giữ nguyên số.
- **0165 ĐÃ CHẠY + kiểm trên DB thật 10/10; code đã commit `bb5eab8` trên nhánh `feat/ca-tang-cuong-0164-0165` (CHƯA merge vào main / chưa deploy — client mới chỉ có sau khi merge).** Còn lại: nhờ OP mở thử một ca ở Lịch & Studio cho kênh đã chốt: dòng "Ca tăng cường" phải hiện ở Kế Hoạch Tháng, target đề xuất tự điền, target tháng không đổi (tôi không tự tạo ca trên dữ liệu thật).
- **0164 ĐÃ CHẠY + áp dụng 10/10** (VERA Shopee T10, CROCS TikTok T10). Còn lại: chưa thử bằng tài khoản ops (phải bị chặn); JOCKEY Shopee T10 chưa chốt kế hoạch; chạy lại "Chia lại theo lịch hiện có…" khi có ca nạp bù/OP thêm mới.
- Sửa **giờ cam kết VERA TikTok T10** ở Kế Hoạch Tháng: đang lưu 550.000.000 giờ (target gõ nhầm vào ô giờ), ô Target GMV trống. Nhập ô Ngân sách Ads mỗi tháng từ T11 để đo tín hiệu dẫn.
- **0155 ĐÃ CHẠY 08/10.** Thử tab Affiliate → Kế hoạch với kế hoạch T10 thật: dán sheet → Lưu → Chốt, gửi brand; khi tháng 10 có file Live Analysis thì Nạp Từ Dữ Liệu Gốc để khớp (chưa thử lưu kết quả khớp thật).
- **0153 + 0154 ĐÃ CHẠY 08/10. Thử trên app thật** — Shopee: mở ca → Giao ca → up file Live List → chọn phiên → Giao ca; TikTok: mở một ca TikTok → "Room của ca này" → Ca nối / Ca bị ngắt; 
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
    thành mục riêng 07/10, id `studio_calendar`, `opsView` đã gỡ —, Sổ Ca, **Run-rate** (11/10); Hỗ Trợ Vận Hành đã gộp 08/10 thành khối thu gọn cuối Bảng Vận Hành, `OpsSupportTab` tự chọn brand × sàn, link cũ `/ho-tro-van-hanh` và activeTab lưu `ops_support` chuyển về `calendar`) · Phân Tích (Hiệu Suất Host, Toàn Cảnh Brand, Điều Phối Phát Hành) · Tài Nguyên (Talent Pool,
    Studios & Gear) · Kinh Doanh (CRM — gồm "Hợp đồng & giá", TikTok API) · Tài Chính (Finance & P&L — khoá cứng
    ceo/admin) · Hệ Thống (Phân Quyền & Role; AI Training Center — chỉ admin). Talent (bản 2 16/10) chỉ thấy: Ca Của Tôi (`my_shifts`), Cả Agency (`talent_calendar`), Đăng Ký Ca (`shift_scheduling`), Tôi (`my_talent_profile`) — điện thoại dùng thanh tab dưới đáy.
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
   không còn "Lưu nháp"/"Gợi ý"/"Chia lại target"/"Xoá hết" — chỉ "Chốt lại" + "Chia lại theo lịch hiện có…" (0164, ceo/admin). Lưới cảnh báo trùng phòng với brand khác +
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
   nào; lô cũ không gắn brand ⇒ `apply_live_reconciliation` từ chối. **Chia số (0171):** chỉ qua `private.recon_shares` —
   mốc snapshot theo GIỜ TẢI FILE, không theo giờ hết ca; ca đã đối soát không bị snapshot đè (chỉ Áp Dụng Lại đổi số).
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
- **App talent (11/10, bản 2 16/10):** màn talent đổi bố cục theo bề rộng (`useMediaQuery(TALENT_WIDE_QUERY)` / class `lg:`), KHÔNG theo user-agent (user-agent chỉ dùng để chọn nút Lịch iPhone hay Google Calendar). "ca của tôi / trùng giờ của tôi / giờ tháng" chỉ qua `lib/talent/myShifts.ts` (đi qua staffSegments); danh sách theo tuần, chấm đỏ, câu hiệu suất, tin Zalo chỉ qua `lib/talent/agenda.ts`. App talent KHÔNG nhắc giao ca (admin giao). Chấm đỏ chỉ đếm việc host làm được trên điện thoại. Mỗi ca hiện MỘT lần trên một màn (không lặp ở khối khác). File lịch .ics: luật đổi người giữa ca chép trong `server/calendarFeed.ts` (`personWindows`) — đổi `effectiveSegments` thì sửa cả hai; hiệu suất của talent chỉ `myChannelStanding` (so mặt bằng cùng kênh, không tên người khác). Thẻ ca của talent = `SessionEventCard` + `buildSessionMeta(..., meId)` (chip "Bạn"), không dựng thẻ riêng. Màn dùng chung với ops thì mở theo `currentRole === "talent"` + quyền ghi (`canEdit = canManageSlots && !!onUpdateSession`), không truyền callback ghi cho talent. "Đã nhận lịch" (0169) chỉ qua `lib/talent/acks.ts` (`ackState` so ngày/giờ đã nhận với giờ hiện tại của ca — không thêm cờ "đã nhận" vào `live_sessions`).
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
  Bố cục (10/10): nút/bộ chọn của trang vào `actions` của `PageHeader`, thanh tab/công cụ/bộ lọc vào `children` — không
  dải rời dưới tiêu đề; nhiều cảnh báo trên một trang gộp MỘT khối (mỗi lý do một dòng chấm màu); cột phụ dính dùng
  `xl:grid-cols-[minmax(0,1fr)_400px]` + `<aside className="xl:sticky xl:top-0">`; phần co giãn trong hàng `flex-wrap`
  cần `flex-1 basis-40 min-w-0` (flex-wrap ngắt dòng theo basis, không theo min-w); thanh nằm dính trên bảng có cột
  dính (`z-10`) phải `z-20`.
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
**Bàn Trainer (13/10):** luật lịch tuần (trùng, quá giờ/tuần, nghỉ sau ca khuya, đổi phòng sát giờ, giờ/ngày, ngày liền, host chưa quen kênh) = `analyzeRoster` (lib/roster/rules.ts); gợi ý người + chi phí ca theo lịch = `rankCandidates` / `plannedCost` (lib/roster/candidates.ts, cùng luật rate của pnl.ts). Không xếp/gợi ý người theo GMV/giờ của host. Nháp chỉ cho ca MỞ; ca đã lên lịch đổi qua RPC có lý do.
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
`buildTodos` (lib/todoList.ts) · GMV kỳ vọng của ca / khả năng về đích theo ngày / ca xoay chuyển / ca có thể thêm = `controlRoom.ts` (khả năng = `pHitOf`, đúng công thức `landingOf`) · dự kiến cuối tháng = `projectMonthEnd` /
`MonthOutlook` · trùng lịch = `personClash`/`studioClash` (scheduling/conflicts) · giờ kế hoạch = `sessionDurationHours`, giờ
live = `sessionHours`. GMV/giờ đem NHÂN với giờ lịch thì chia trên giờ kế hoạch; GMV/giờ BÁO CÁO chia trên giờ live. Thước
đo xếp host là **GMV/giờ**, không phải GMV/ca. Cam kết hợp đồng đếm **giờ ca theo lịch** (kể cả ca GMV 0 đã có bằng chứng diễn ra), loại ca huỷ và ca chờ xác nhận.

### 5.6 Luật nghiệp vụ đã chốt
- **Dashboard (10/10, user chốt):** (1) **ngày đủ số** = ngày cuối mà ≥ 90% giờ ca đã chạy có số (`channelHealth.dataCoverage`; ngày không có ca không kéo lùi mốc; hôm nay không tính) — run-rate, mũi tên so sánh, KPI đầu màn cắt ở mốc này, không ở "ngày cuối có số bất kỳ"; (2) xem theo tháng thì so **cùng loại ngày** (`matchedPrevDays`/`likeForLike`: ngày thường thứ k ↔ thứ k, đợt camp cùng vị trí; ngày không có cặp thì không so), không so ngày lịch; (3) **mỗi kênh một kết luận** = khả năng đạt (`landingOf`), run-rate chỉ là số phụ; nguyên nhân gốc theo `channelVerdict` (ngưỡng target cao **1,3×** GMV/giờ 28 ngày trước tháng, năng suất ±10%, số chưa về chỉ đứng đầu khi tạm tính ≥ 5% dự phóng); (4) xếp host/trợ chỉ bằng `hostReliability` trong CÙNG kênh — không xếp GMV/giờ thô qua brand (brand giải thích 81% chênh lệch); (5) "Hôm qua/Hôm nay/đang làm" thuộc Bảng Vận Hành, không đưa lại vào màn CEO; (6) brand được thấy tỷ trọng live trong Total GMV (role brand đọc từ bản chụp Report đã phát hành).
- **Đa sàn (07/10, luật cứng):** dữ liệu gốc TikTok và Shopee khác hoàn toàn (file, cột, đơn vị dòng: TikTok một phòng / Shopee một phiên;
  GMV TikTok gồm huỷ/hoàn, Shopee = doanh số đặt). Không gộp parser/kho. **Không cộng, gộp, trung bình hay xếp hạng gộp chỉ số hiệu suất
  giữa hai sàn**; màn xem nhiều kênh đặt khối TikTok | Shopee cạnh nhau. Cộng được: số vận hành (ca, giờ, người, phòng) và tiền agency.
- **Ads (05/10):** nguồn duy nhất = file TikTok Ads theo ngày (`ads_campaign_overview`). ROI = doanh thu gộp ÷ chi phí
  (cùng cách TikTok). Doanh thu gộp tính trước huỷ/hoàn (Franklin T9: 798tr > GMV shop 771tr) ⇒ KHÔNG trình bày như %
  GMV, không cộng vào GMV. Chưa có ngân sách Ads dự kiến trong app (deck Franklin có "95,3% ngân sách" — user chưa chốt
  nhập ở đâu, chỉ số đó chưa có).
- **Run-rate chỉ tính bằng `planRunRate`** (28/09): target = Σ target ca của Kế Hoạch Tháng đã chốt (không chia lại khi lịch
  đổi); ca kế hoạch huỷ GIỮ target; ca ngoài kế hoạch target 0; ca thêm vào lưới sau khi chốt nhận target = dự báo. **Ca tăng cường (0165, 10/10):** ca OP mở thêm sau chốt có dòng ở `plan_boost_slots` với target đề xuất của engine, KHÔNG cộng vào target tháng/run-rate — mọi chỗ cộng target tháng chỉ đọc `brand_month_plan_slots`, đừng đưa bảng boost vào đó. **Ngoại lệ do user chủ động "Chia lại theo lịch hiện có" (0164, 10/10):** ca huỷ về 0, ca OP thêm (kể cả đã qua) vào kế hoạch, Σ target = target mới.
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
- **Đối soát (13/10, user chốt):** số file sàn luôn thắng; snapshot chỉ là mốc chia, tính theo giờ TẢI file (snapshot thật
  up trễ trung vị 54 phút — không được coi là số lúc hết ca). Ca có mốc thì chia theo mốc, chỉ phần không có mốc mới rải theo
  giờ. Ca `tiktok_reconciled` không bị up/xoá snapshot đổi số — muốn đổi thì bấm Áp Dụng Lại.
  **GMV gõ tay (0174)** thắng mốc tự động: ở snapshot là số lúc hết ca (chỉ số khác theo % GMV, phần dư sang ca sau); ở đối
  soát ca gõ giữ số, phần còn lại chia cho ca kia — tổng vẫn = file.
- Snapshot theo ca: chỉ 13 cột ĐẾM ĐƯỢC mới đem trừ, tỷ lệ tính lại lúc đọc; mốc ranh giới = **giờ kết thúc ca**
  (`session_boundary_at`); room thuộc ca khi khung giao nhau cả 2 đầu; up lại cho cùng ca = thay thế. **Ca nối phải xác nhận tường minh (0153):** có `session_room_links` thì mốc trừ = snapshot của đúng ca trước, ca trước chưa up ⇒ số ca sau khoá; ca ngắt room = nhiều room trong snapshot, mỗi lần ngắt là một mảnh có lý do.
  **Lượt live (11/10, UI-only, không migration):** mỗi room = một LƯỢT. Khối `SessionRoomCase` nằm TRONG form Giao ca (bước 2, `FileHandover`); tick ≥ 2 room ở bước 1 ⇒ `SessionLiveSnapshotUpload` chia thành snapshot (lượt 1) + một mảnh/lượt kèm lý do (`SnapshotRoomPicker.askRestartReasons`); lượt chưa có trong file thêm sau bằng "Thêm lượt restart (up file riêng)". Room chưa kết thúc/kết thúc sau giờ hết ca (`runOverRoom`, dung sai 5') ⇒ tự mở danh sách ca sau để trợ chỉ xác nhận (bấm "Không" lưu localStorage); room bắt đầu trước giờ vào ca mà chưa có liên kết ⇒ cảnh báo + OPS xác nhận nối từ ca liền trước; dải chuỗi ca liền kề (≤30', `adjacentShiftChain`/`chainBoundaries`, đọc `session_room_links` qua `fetchRoomLinksAmong`): ⛓ nối / ○ chưa nối / 🔒 chờ file. Logic thuần ở `roomCases.ts` (có test). **Chưa thử trên app thật** (phiên Browser chưa đăng nhập).
- **Chia target ca CHỈ qua `allocationModel.ts`** (`buildAllocator` → `allocatorWeights`; 09/10): trọng số = giờ × loại ngày × khung giờ × vị trí ngày, fit trên lịch sử MỘT kênh (assertOnePlatform), lịch sử xếp loại ngày theo lịch cố định. Muốn đổi logic: sửa file đó + `EngineParams.alloc*`, mở bảng backtest ở AI Training Center (cả hai sàn, nhiều brand), chỉ nâng khi sai số gộp thấp hơn ≥ 2 tháng; danh sách thứ đã thử-không-giúp nằm ở đầu file và trong thẻ.
- Talent không bao giờ ghi đè số đã có snapshot/đối soát (RPC chặn). Thông báo "số khác số bạn báo" chỉ khi số cũ là
  `manual` và lệch ≥ 5%. Ca `is_backfill` không vào Finance. Planner/gợi ý chỉ ĐỀ XUẤT, không bao giờ tự chốt ngầm.

## 6. Hạ tầng Supabase

- 163 migration (`supabase/migrations/`) — **`0163` (sổ dự báo `forecast_snapshots`) ĐÃ CHẠY 10/10 (user xác nhận; verify: RPC 200, 5 dòng 10/10).** **`0156` (nạp bù ca từ file Live List cho Shopee, `create_backfill_sessions` nhận sàn) ĐÃ CHẠY 08/10 (user xác nhận).** **`0155` (Affiliate lập kế hoạch trước, chốt cho brand) ĐÃ CHẠY 08/10 (user xác nhận).** **`0154` (Shopee giao ca/đổi host bằng file Live List, ATC theo phiên) và `0153` (ca nối tường minh + ca bị ngắt room) ĐÃ CHẠY 08/10 (user xác nhận).** **`0151` (chốt kế hoạch gắn vào ca đã nhập sẵn) ĐÃ CHẠY 07/10 (user xác nhận; chưa verify bằng lần Chốt thật);** **`0149` (kênh brand × sàn) và `0150` (bậc nguồn số giao ca gõ + ATC từ Live List) ĐÃ CHẠY 07/10;** `0147` (số lúc đổi host, Shopee gõ) ĐÃ CHẠY, **`0148` (TikTok up file lúc đổi host) ĐÃ CHẠY (đo 07/10);** `0145` (giao ca TikTok bằng file) ĐÃ CHẠY 06/10; `0144` (giao ca) ĐÃ CHẠY 06/10; `0143` (chặn trùng người) ĐÃ CHẠY 06/10; **`0139`–`0142` (report / kế hoạch / hợp đồng theo sàn, file Ads Shopee) ĐÃ CHẠY 06/10**;, chạy tay theo thứ tự — **`0138` (đổi người giữa ca) ĐÃ CHẠY 06/10.** `0137` đã chạy 05/10. **`0136` ĐÃ CHẠY 05/10** (verify production: lô đối soát thử với phòng kết thúc đúng phút ca CROCS 30/09 11:01 bắt đầu ⇒ không khớp, phòng chồng 29 phút ⇒ khớp; lô thử đã xoá; trigger profiles nằm trước đoạn đó trong cùng file + chốt tự kiểm cuối file), bộ kiểm
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
| `## §1 các đợt 07–09/10 (chuyển khỏi WORKSPACE 10/10)` | nguyên văn §1 cũ: audit đa sàn Bước 0–4 (0149–0151), thẻ ca, Talent Pool, bỏ Nhân sự ca, 0152–0161, engine chia target v2, Dashboard agency 4 tab — kèm cách verify từng đợt |
| `## Bàn Trainer (2026-10-13)` | số đo nền đề xuất module trainer: host ICC, xếp lại host walk-forward, co giãn GMV theo giờ, khung giờ, ramp/cặp/kinh nghiệm ≈ 0, lỗi lịch T10, độ sâu dự bị kênh, quyết định user |
| `## §1 các đợt 10/10 bố cục + 0162 (chuyển khỏi WORKSPACE 13/10)` | nguyên văn: sắp lại bố cục cả app, bố cục Kế Hoạch Tháng + dựng lưới từ ca đã nhập, chia lại target cả lưới 0162 |
| `## Phòng Điều Hành (2026-10-11)` | số đo nền của Phòng Điều Hành: kỳ vọng từng ca, dải 80%, khả năng đầu tháng T10, host vs khung giờ, phễu, mệt, phòng, cầu GMV, thứ đã bỏ |
| `## Sắp lại bố cục cả app (2026-10-10)` | từng trang đã đổi gì và vì sao, số đo trước/sau, chỗ cố ý không đổi |
| `## Dashboard agency + brand làm lại đợt 1 (2026-10-10)` | audit 10 điểm, khung chuyên gia, 6 phép đo (views/giờ −20–38%, "−36%" ảo, brand giải thích 81%, độ trễ số, target ×1,5/×1,69), 2 tab mới, luật ngày đủ số / cùng loại ngày / một kết luận |
| `## Dashboard agency làm lại (2026-10-09)` | 4 tab, dải dự báo 35% (backtest 13 kênh-tháng), khả năng đạt target, đòn bẩy xử lý + co giãn, thang run-rate khớp planRunRate, đo trên số thật |
| `## Engine chia target ca v2 (2026-10-09)` | backtest walk-forward so cách cũ / công thức user / GLM / trộn, thứ đã thử và không giúp, hệ số CROCS, so target nhóm user với lịch sử |
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
| `## App talent T1 (2026-10-11)` | 4 tab cho host/trợ (Hôm Nay, Lịch, Đăng Ký Ca, Hồ Sơ): số đo 11/10, 4 quyết định user, bẫy khi đo, cách dựng harness; T2 "Đã nhận lịch" (0169) + "Chuẩn bị ca" |
| `## App talent bản 2 (2026-10-16)` | 1/39 talent từng mở app; số đo chiều cao màn trước/sau; cách giả lập hồ sơ talent trong trình duyệt; 4 quyết định user; .ics 0177 |
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
| `## Ca nối + ca bị ngắt room (2026-10-08)` | 0153: bảng liên kết/mảnh, view trừ số theo liên kết, ước lượng chia theo thời gian, cách đã test |
| `## Đối soát chia theo mốc snapshot (2026-10-13)` | 0171–0173: lỗ cũ, số đo up trễ, sửa tốc độ, ca nạp bù tách, ngưỡng nhắc 1% |
| `## Lượt live + ca nối trong Giao ca (2026-10-11)` | số đo T6–T10 (7,6% ca restart, 55% ranh giới nối), quyết định user, luật phân loại room |
| `## Nạp bù ca từ file Creator-Live-Performance …` | 0086, quy trình chuẩn khi có file mới, gán host ca nạp bù |
| `## Module "Kế Hoạch Tháng" …` · `## Module tạo ca — P1 …` | 0088, 0090–0099: lưới, chốt, camp ranges, phòng live |
| `## Sổ Ca …` · `## Module hỗ trợ vận hành …` · `## Tái cấu trúc màn hình Vận Hành Live …` | 3 màn vận hành và luật của chúng |
| `## Trang Affiliate …` · `## Còn lại của mảng Affiliate` | 0102, parser song ngữ, file Live Analysis linked accounts |
| `## Audit Role × Workspace (2026-09-22) …` | Đợt A/B/C (0103–0110), xuất file, sự cố 0105 bị bỏ sót, bảng bị xoá tay |
| `## Rà soát UX/workflow theo module (bắt đầu 2026-09-13)` | Module 1–N: đăng ký/chốt ca, cam kết, gợi ý host, chốt hàng loạt, thông báo |
| `## Hạ tầng Supabase` (bản cũ) | trạng thái từng migration 0082–0123 kèm cách đã verify |
