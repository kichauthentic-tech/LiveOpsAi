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

## 1. Giai đoạn hiện tại (cập nhật 2026-10-31; mục KH Tháng bản gọn 27/10)

- **31/10: ADS SHOPEE 3 LOẠI — TRANG QUẢNG CÁO REPORT SHOPEE (chưa commit; `0192` ĐÃ CHẠY 31/10)** — Franklin nhận whole shop nên có Livestream Ads + Shop+ Ads + Product Ads (file Seller Centre tiếng Việt, mỗi file cả tháng, không theo ngày). User duyệt demo (artifact PYKMhL6KiG7AwJYnXjPhoS) rồi build. **Code:** `lib/dataraw/shopeeAds.ts` (nhận loại file theo tên cột `detectShopeeAdsKind`, đọc 3 loại, cột tiếng Việt Livestream Ads đổi về tên Anh, `shopeeAdsTotals`; chuẩn hoá NFC vì Seller Centre xuất "ID chiến dịch" dạng tổ hợp; ROAS làm tròn 2 số lẻ nên dung sai tuyệt đối 0,011) · `parseShopeeAdsAuto` (parseDataRawExcel.ts) · `0192` thêm loại `shopee_shop_ads`, `shopee_product_ads` (Livestream Ads vẫn `shopee_ads`) · `ShopeeAdsPanel` thả cả 3 file một ô, lưu từng loại · snapshot thêm `adsSuite` (tuỳ chọn, KHÔNG nâng version; `ads` giữ phần Livestream Ads cho bản cũ; stamps tính cả 2 loại mới) · `lib/report/shopeeAdsInsight.ts` (`analyzeShopeeAds`, Insight 4 khối, tiêu đề) · `report/ShopeeAdsPage.tsx` (4 ô, biểu đồ cột chi phí vs doanh số theo loại, 3 tab, bảng đầy đủ gập). Có Shop+/Product ⇒ trang mới; chỉ có Livestream Ads ⇒ trang cũ + ops được nhắc tải file còn thiếu. Luật: tổng doanh số 3 loại có thể trùng đơn ⇒ luôn kèm ROAS đơn trực tiếp; thêm `METRIC.acos`. **Đo Franklin T10:** chi 31,6M, doanh số 334,5M (10,6x; trực tiếp 6,7x); Livestream Ads 0,25x (camp "Views" 91% chi phí), Shop+ 16,5x (thủ công 21x, tự động 10,5x), Product 12,3x (đang chạy 18,3x, tạm dừng 6,0x; 11 sản phẩm chi 1,55M không ra đơn). **Test:** `tests/shopeeAdsSuite.test.ts` + `tests/shopeeAdsRender.test.ts` (mẫu thật `tests/fixtures/shopee-ads/`); vitest 1256/1257 (1 đỏ có sẵn ở HEAD: `metricGlossary.test` bắt "Total GMV" ở DemoSummaryPages:80, không thuộc đợt này), tsc sạch. **Verify 31/10 trên dev nối DB thật:** 3 file Franklin T10 đã tải ở Nhập Ads + bấm Cập nhật số liệu ⇒ trang 7 đủ 4 ô/biểu đồ/3 tab/Insight, số khớp file (đã sửa: ROAS dưới 1 hiện 2 số lẻ, tên áo giữ màu sau "|"). Dữ liệu này ĐÃ nằm trong DB thật của Franklin. **Chưa làm:** xem bản HTML/PDF gửi brand; chưa có ô "% GMV Ads / cả shop" (Franklin Shopee chưa có file toàn shop); tháng đóng sổ (`monthClose.ts`) vẫn chỉ kiểm file `shopee_ads`.
- **31/10: CRM "ĐIỀU KHOẢN HỢP TÁC" YFB × BRAND (chưa commit; `0191` ĐÃ CHẠY)** — user: "build lại CRM bao hàm mọi phương thức hợp tác, sau này chỉ chọn". Thay công tắc `billingModel` (giờ / %) bằng một GÓI ghép từ mảnh, lưu JSON có phiên bản (`terms.v=1`) ở `brand_service_terms` (theo brand × sàn × GIAI ĐOẠN: `standard` bản mới thay từ ngày bắt đầu, `trial`/`campaign` đè trong khoảng ngày; ca trước ngày bắt đầu điều khoản đầu tiên vẫn tính theo cấu hình cũ). **Ba bước ở CRM → Hợp đồng & giá:** (1) YFB làm gì (live trọn ca / chỉ cấp host / thuê phòng / không có ca + Ads, Affiliate, Đào tạo + brand tự live + ai trả ngân sách Ads); (2) tính phí bằng khoản nào — `per_hour` (đơn giá + phụ thu trợ live + LUẬT GIÁ theo khung giờ / cuối tuần / ngày sale, tính từng phút), `pct_nmv` (NMV hoặc GMV), `fixed_monthly` (retainer, giờ đã gồm + giá giờ vượt), `ads_mgmt` (% chi tiêu Ads + mức tối thiểu), `affiliate_booking` (theo creator + % GMV affiliate) — có 10 gói mẫu; (3) hệ quả cam kết: thiếu giờ (không / bù giờ / giảm phí cố định theo tỷ lệ / trừ mỗi giờ thiếu), thưởng GMV luỹ tiến (có trần), giảm phí khi GMV hụt. Kèm khối **Tính phí tháng** (xem thử bảng tính trên ca thật + nhập chi tiêu Ads / số creator / GMV affiliate vào `brand_month_fee_inputs`) và **Điều khoản về host** (`brand_talent_rules`: ưu tiên / brand không nhận / độc quyền) — Điều Phối Lịch Live cảnh báo + loại khỏi gợi ý (`brandRuleViolation`).
  **Code:** `lib/commercial/terms.ts` (mô hình, chuẩn hoá JSON, `resolveTerms`, `validateTerms`, `describeTerms`, gói mẫu) · `lib/commercial/fees.ts` (`sessionFee`, `settleMonth`, `feeInputOf` — MỘT chỗ tính tiền) · `lib/db/brandTerms.ts` · `components/crm/{TermsPanel,TermsEditor,MonthSettlementPanel,TalentRulesPanel,fields}.tsx` · nối vào `computeSessionPnl` (tham số cuối `termPeriods`), `buildMonthClose` (`termPeriods`, `monthFeeInputs`; `RevenueBasis` có `kind:"terms"`, dòng hợp đồng có `settlement`), `brandPriceSet/Label`, `todoList`, `reportScopeOf(…, periods, asOf)`, `analyzeRoster(…, brandRules)`. **Lưu điều khoản chính đang chạy ⇒ `mirrorLegacy` chép đơn giá/%/phạm vi sang `brand_platform_rates` (chỗ GHI DUY NHẤT của các cột đó khi đã có điều khoản); KHÔNG đổi `brands.billing_model`** (là cấp brand, ca cũ của sàn khác còn dựa vào).
  **Luật chốt khi thiết kế:** khoản cả tháng (cố định, Ads, thưởng…) lấy theo giai đoạn đang chạy NGÀY CUỐI THÁNG; tháng đổi điều khoản giữa chừng ⇒ doanh thu từng ca theo giai đoạn của ca + khoản cả tháng giai đoạn cuối, kèm ghi chú ở Kế Toán. Thiếu giờ tính trên giờ ca theo lịch (cùng cơ sở với doanh thu). Chưa chạy 0191 ⇒ client quay về công tắc + ô giá cũ, hiện dòng báo.
  **Chưa làm (có chủ đích, cần đổi ngoài CRM):** một brand nhiều gian hàng cùng sàn (ca chưa mang kênh; `brand_platform_rates` unique brand × sàn) · sàn mới ngoài TikTok/Shopee (enum + `PlatformProfile`) · FinanceHr (P&L từng ca) CHƯA cộng khoản cả tháng — chỉ Kế Toán + xem thử CRM có · "bù giờ" mới BÁO nợ giờ, chưa tự cộng vào cam kết tháng sau.
  **Verify:** replay 0001→0191 sạch + chạy lại lần 2 không lỗi + `supabase/tests/0191_brand_service_terms.sql` 16 OK (RLS: brand chỉ đọc điều khoản của mình, talent không thấy gì, chặn trùng điều khoản chính, JSON thiếu phiên bản); `tests/commercialTerms.test.ts` (42), `tests/crmTermsRender.test.ts` (3, SSR cả hai chế độ), roster +1; tsc sạch; 1.241/1.242 test xanh (1 đỏ là `metricGlossary` "Total GMV" ở DemoSummaryPages có SẴN từ b9f74fc, không phải của đợt này). Trình duyệt: xem trên trang thử với REST giả (đã xoá) — lưu / bản mới từ ngày sau / chiến dịch 11.11 / thưởng GMV / luật giờ vàng 525.000 / điều khoản host / mobile 375 đều chạy; CHƯA thử trên app thật đăng nhập (0191 chưa chạy).
- **30/10 (tối): TAB BRAND CHỈ CÒN OVERVIEW THÁNG ĐANG CHẠY** — user chốt bỏ từ khối Shop trở xuống (Shop, SKU, Quảng cáo, Khuyến mãi theo tháng); giữ Nhân sự live. `brandBelow.tsx` chỉ còn `TeamSection`; `useBrandFiles` vẫn dùng cho nhóm đối chứng ở `WhySection`. Test `layoutCalm` bỏ brandBelow khỏi danh sách StatTile.
- **31/10: PHỄU LIVE DASHBOARD — CẢ HAI SÀN, LUỸ KẾ THÁNG + 7 NGÀY, HAI MỨC BÁO (chưa commit, KHÔNG migration)** — mục đích user chốt: soi MỖI NGÀY/TUẦN account nào lủng bậc nào để xử lý, không cần quan tâm loại ngày. `channelHealth.funnelViews` → `ChannelCard.funnels: FunnelView[]` gồm 2 cửa sổ, đều so CÙNG KỲ, KHÔNG ghép theo loại ngày (đo 31/10: ghép loại ngày mất >½ số ca và nhiễu hơn ở LIVE CTR/CTOR; riêng so ngày Daily↔Campaign lệch tỷ lệ −31%…+31% nhưng mỗi tháng có đúng một bộ ngày Campaign nên luỹ kế hai tháng tự cân, lệch 0 ngày): **Luỹ kế tháng** (mặc định; `monthToDateLikeForLike` mùng 1 → ngày đủ số so cùng ngày-của-tháng ở tháng trước, ~30 ca) và **7 ngày** (cảnh báo sớm; `weekdayPairedLikeForLike(…, sameType=false)`). Hai kỳ lệch số ngày Campaign ⇒ `note` vàng. `ChannelCard.funnel` = luỹ kế tháng, lùi về 7 ngày nếu thiếu ca. Đã BỎ: tab Hôm qua, chế độ 'Chỉ số hoá', bảng tỷ lệ. **Hai mức báo** theo số ca từng cửa sổ (`noiseBand` của Report, z=1,96 cho 'gãy rõ'/'tốt rõ', z=1,28 cho 'chú ý'; `FunnelRate.band/watchBand/sig/watch`): chỉ 'gãy rõ' (`worst`) vào Hành động đề xuất (`accountActions`, có ghi cửa sổ + ngưỡng); 'chú ý' (`watchRate`) chỉ hiện ở thẻ. < 3 ca có số/kỳ ⇒ ghi lý do chứ không tô đỏ. CV từng bậc: `estimateFunnelCv` tự đo trên kênh (nhóm tháng × cuối tuần × buổi, ≥30 ca), mặc định đo trên 1.075 ca TikTok/373 ca Shopee: ERR 0,22 · LIVE CTR 0,23 · CTOR 0,32 · Orders/ATC 0,42 · ATC/Viewer 0,60 (kẹp 0,15–0,60). **Shopee có phễu Viewers → ATC → Orders** (`shopeeFunnelLite`, chỉ cộng ca có `report.atcCount`), chọn qua `profileOf(platform).liveFunnel` (test `platformProfiles` cấm rẽ nhánh theo tên sàn). UI `components/dashboard/LiveFunnel.tsx` theo format phễu Report Tháng (ô bậc + mũi tên tỷ lệ). Đã cắt chữ (không còn dòng 'Kỳ so', bảng tỷ lệ, 'Chỉ số hoá'; ngưỡng chỉ hiện khi rê chuột). **Tab Brand (`BrandTab.ScopeFunnel`, dưới Key Metrics):** phễu chạy theo ĐÚNG phạm vi trang đang chọn — Tháng/7 ngày/tuần/đợt Campaign/ngày/ca và kỳ so (`scope.cur/base`) — cùng `profileOf(platform).liveFunnel` + ngưỡng theo số ca hai vế; khối cũ trong `WhySection` đã bỏ (thẻ kênh ở Tổng quan account vẫn dùng `card.funnels`: Luỹ kế tháng + 7 ngày). **Report Tháng giữ nguyên logic cũ (user chốt 31/10).** **Backtest 31/10 (87 kênh–tuần, mẫu nhỏ):** cách 7 ngày báo gãy 11% số tuần nhưng tuần bị báo thường HỒI (chỉ 10% giảm >10% GMV/giờ tuần sau vs 49%); luỹ kế tháng: 8/8 tỷ lệ bị báo gãy vẫn giảm tới cuối tháng (phần nào do luỹ kế tới cuối tháng chứa luôn khoảng đang xét). Rủi ro còn lại: so tháng-với-tháng gộp cả thay đổi thật (đổi host/brand mix/chiến dịch) nên 'gãy' chưa chắc là lỗi vận hành; cuối T10 ERR giảm ở 4/5 kênh TikTok cùng lúc ⇒ nhiều khả năng là biến động chung của sàn. Test `tests/funnelWindows.test.ts` (6) + tsc + 1306 test xanh; Browser đã xem.
- **30/10 (tối): AUDIT QUAN HỆ GIỮA MODULE — SỬA 6 ĐIỂM (chưa commit, KHÔNG migration)** — đo import 36 tab + ma trận tab×bảng, đối chiếu luật §5.5/5.6. Đã sửa:
  (1) **Tháng đã đóng sổ ops biết trước khi Lưu:** `lib/closedMonth.ts` (`isSessionMonthClosed(monthlyReports, ca)` — `LiveSession.monthPublished` luôn true với ops nên KHÔNG dùng); App cấp `isMonthClosed` qua `SessionActionsContext`; `SessionWindow` hiện banner + khoá Sửa/Huỷ/Xoá/Loại/Giao ca/Gõ thực tế; `handleUpdateSession`/`SetStaffSegments`/`Delete`/`Cancel`/`SetSessionExcluded` chặn sớm. Màn ghi ngoài `SessionWindow` (nạp bù, đối soát) vẫn chỉ biết qua lỗi DB.
  (2) **Lỗi DB nhắc màn đã gỡ:** `errorMessage` đổi "Điều Phối Phát Hành" → "Toàn Cảnh Brand (cột Report Tháng)" (không viết lại thân hàm SQL 0133/0138/0139).
  (3) **Một đường dự báo cuối tháng:** `planMonthOutlook` (channelCard.ts) là phép nối kế hoạch→run-rate→`monthOutlook` DUY NHẤT cho cuối tháng; thẻ kênh và Report Tuần cùng gọi (Report Tuần trước đó thiếu `engineParams`, target null, ca mở lẫn sàn). `BrandWeeklyReport` đã rút khỏi allowlist `tests/channelCard.test.ts`; còn `OpsMonthView`/`MonthlyReportTabs` (sa bàn / bản chụp sau tháng).
  (4) **Ghi chú migration:** 0165/0186 đã nằm trong main (bb5eab8, aea3acd) — mục "chưa merge" bên dưới là cũ. **0178/0180 chưa xác minh trên DB thật** (ghi chú các nơi mâu thuẫn): chạy truy vấn kiểm tra `to_regprocedure` rồi sửa dòng này.
  (5) **Nguồn số:** `isHandoverFile` (lib/dataSource.ts) + `dataSourceTier`; test `tests/crossModuleGuards.test.ts` quét cấm `.dataSource ===/!== "…"` ngoài lib/dataSource.ts.
  (6) **Khoá người:** `personKey(id, name)` (hostPerformance.ts) là hàm DUY NHẤT; `hostKey`/`coHostKey`/`periodCompare.hostRows` đều gọi (tên cắt khoảng trắng).
  Verify: `tsc --noEmit` sạch, vitest 1196/1196. Chưa thử trên app thật (banner đóng sổ cần một tháng đã phát hành + tài khoản ops).

- **30/10 (chiều): AUDIT TRƯỚC KHI XUẤT REPORT T10 GỬI BRAND — SỬA NHÓM B (đã push d6bae4f, KHÔNG migration)** — đi hết trang T10 của CROCS, VERA TikTok/Shopee, JOCKEY, Franklin TikTok/Shopee trên dev nối DB thật. Đã sửa (chung TikTok + Shopee): (1) `summaryBlocks` nêu đúng vế thiếu — cả GMV/giờ và Giờ live dưới 95% ⇒ "thiếu do cả hai, phần lớn hơn là …" (JOCKEY Daily 88%/64% trước đây ghi "không do Giờ live"); Shopee truyền `gphPct/hoursPct` (`ShopeeScoreRow.planHoursToDate`) nên trang 1 Shopee đọc theo kế hoạch như TikTok. (2) Đề xuất trang 1 chỉ nhắc Ads khi `scope.ads` (`withAds`, cả `ShopeeInsightExtra.withAds`). (3) Tiêu đề + Insight trang 1 chọn loại ngày **thiếu nhiều tiền nhất** ("Daily thiếu nhiều nhất (−122M, đạt 50% Target)"), thay tiêu chí % thấp nhất của B8 29/10. (4) Bỏ câu dặn việc nội bộ khỏi Insight gửi brand: chưa có Target ⇒ mọi khối rỗng và khung Insight ẩn ở bản brand (`PageInsight` trả null khi không khối nào); không KPI toàn shop ⇒ bỏ khối Tác động; NMV không dặn nhập CRM; Tháng sau chưa có kế hoạch ⇒ "YFB gửi Target Live … khi chốt kế hoạch"; Shopee đơn huỷ không dặn tải lại Live List; Ads/Affiliate/NMV thiếu file ⇒ khối rỗng. Bảng "Theo dõi Refund rate chính xác theo tháng" bọc `data-export-hide`. (5) `chooseNmvRate` thêm nguồn `provisional_month`: chưa tháng chốt + CRM chưa nhập % hoàn ⇒ dùng Refund rate tạm tính của chính tháng thay 40% (VERA T10 NMV 180,5M → 250M); nhãn nguồn bỏ "(CRM …)". (6) Trang Toàn shop: Seller LIVE luôn tách Livestream YFB (`yfb: true`) + "Seller LIVE khác"/"Brand tự live" ⇒ hết câu "Trao đổi với brand kế hoạch Seller LIVE" (Franklin). (7) `peopleBlocks` nhận `change/band` của khung giờ: khung đổi vượt ngưỡng ⇒ nói là biến động chung (chỉ số cùng loại ngày ≥ 90%) hay riêng khung. Test `tests/reportExportAudit30_10.test.ts` (+ sửa kỳ vọng ở `pageHeadlines`, `pageInsights`, `refundStatus`, `reportAudit29_10`); vitest 1190/1190, tsc sạch. Verify dev: JOCKEY/VERA/Franklin TikTok, VERA Shopee, CROCS T9. **Còn treo (nhóm A — ops làm trong app):** % hoàn CRM của CROCS (chưa có dòng giá)/VERA/JOCKEY; KPI Total GMV T10 JOCKEY (=100M = Target live) và Franklin (650M < Target live 750M); kế hoạch T11 VERA/JOCKEY/Franklin; phạm vi Affiliate Franklin TikTok; Insight sửa tay CROCS T10 đã cũ số; đối soát phiên còn thiếu; Franklin Shopee thiếu 3 file + Ads. **Nhóm C chưa làm:** số phiên lệch giữa trang (Host dùng ca vs Live List), trang Ads Franklin dùng ROI/cửa sổ 1–30, tên SKU dài ở Insight TikTok, nhãn "1–29/09 so với 1–29/10" ngược ở Nguyên nhân Shopee, CROCS T10 báo "thay đổi 4 ca" ngay sau cập nhật. Trang Host Franklin: ô ops-only ẩn host thấp điểm nhưng Insight vẫn nêu tên (theo quyết định giữ trang 7 của user) — chờ user chọn.

- **30/10: REPORT THÁNG — GỘP SỐ/PHÂN TÍCH TRÙNG LẶP (đã push f8e56cd, KHÔNG migration)** — audit CROCS T9/T10: cùng số hiện ở 3–5 chỗ, hai trang đề xuất hai "chỉ số chính" khác nhau. **User chốt: trang 5 Phân tích nguyên nhân và trang 7 Host & khung giờ GIỮ NGUYÊN bản cũ** (Phễu LIVE, bảng Số đo từng loại ngày, ô Trung vị, bảng khung giờ, Insight host nêu cả host thấp hơn — không gộp lại nữa). Đã sửa các trang khác (phần dùng chung áp cả Shopee): Key Metrics đề xuất cùng chỉ số chính với trang Nguyên nhân (`whyMainMetric`, `keyMetricsBlocks.mainMetric`); trang NMV bỏ bảng Total GMV & cơ cấu kênh (thuộc Toàn shop) và 2 ô Refund rate tháng trước; Insight không lặp câu tiêu đề (`dropHeadline` trong pageHeadlines.ts, trừ trang summary/keymetrics/shop/why/people; khối rỗng hoặc "—" bị ẩn); Tổng quan: bảng Kết quả bỏ cột Chênh lệch khi đã có biểu đồ cầu (dòng KPI Total GMV ghi chênh cạnh Target), bảng kế hoạch chỉ còn phần kế hoạch (thực tế + % ở biểu đồ, thêm thanh Cả tháng), ô Total GMV cùng mẫu số "KPI tới nay" với bảng; Insight trang 1 nói thiếu do GMV/giờ hay Giờ live so với kế hoạch (`days[].gphPct/hoursPct`), chỉ phân tích yếu tố phễu khi thiếu kế hoạch; Ads: bảng ROAS gập vào details, ô "Ngày chi lệch" không lặp danh sách ngày; Sản phẩm bỏ ô Top 1 + ô Quà tặng; Affiliate ô "GMV phiên" + "x/y phiên có Target"; trang Tháng sau dùng cùng CV đo trên brand (`NextLivePlanPanel cv`) nên ngưỡng khớp trang Nguyên nhân (Daily T9 ±15% thay ±10%). Trang Toàn shop chưa đụng (phiên phạm vi dịch vụ sửa cùng lúc, đã commit 5b025c9) — còn trùng: biểu đồ tăng trưởng = bảng so sánh, lượt truy cập/CVR lặp. Insight T10 trang 1 của CROCS là bản ops sửa tay. Test `tests/pageInsights.test.ts`, `pageHeadlines.test.ts`. Verify CROCS T9/T10 trên dev nối DB thật.

- **31/10: CA DỰ PHÒNG & MỐC KÍCH HOẠT ở Kế Hoạch Tháng (chưa commit, migration 0194 CHƯA CHẠY)** — user duyệt ý tưởng sau khi plan T11 CROCS: lập TRƯỚC nhóm ca "sẵn sàng" ngoài lưới chính; hụt target ở mốc kiểm nào thì mở ca nào. Tận dụng cái ĐÃ CÓ: mốc kiểm engine v3 (`checkpointsOf`/`checkpointAdvice`, trần +30%, co giãn 0,82 — backtest cũ 9/9 kênh-tháng ≥95% target) và lever "Mốc … thêm N giờ" ở Dashboard (`handlingPlan`); phần MỚI chỉ là nhóm ca cụ thể + đổi số giờ cần bù thành ca nên mở. Code: `lib/scheduling/reservePlan.ts` (thuần: `suggestReservePool` mỗi ngày ≤1 ca, không đè ca chính, xếp theo GMV dự báo; `pickReserve`; `reserveLadder` bảng hụt 5/10/15% × 3 mốc), `components/ReservePlanPanel.tsx` (chèn trong MonthPlan sau thẻ cài đặt), `BrandMonthPlan.reserveSlots` ← cột `brand_month_plans.reserve_slots jsonb` (0194, cùng kiểu group_targets: DB thiếu cột thì không gửi, panel cảnh báo; KHÔNG chặn lưu kế hoạch), `handlingPlan` nhận `reserve` và ghi vào lever mốc "ca dự phòng đã lập sẵn nên mở: …" (loại ca dự phòng đã có ca thật cùng ngày+giờ), `channelCard` truyền `plan.reserveSlots`. QUY ƯỚC: ca dự phòng KHÔNG cộng target tháng/run-rate, KHÔNG sinh shift_slots khi Chốt; chỉ thành ca khi OP mở thật bằng "Mở ca" (ca tăng cường 0165). Verify: tsc sạch, vitest 1292+ (tests/reservePlan.test.ts 7 test), xem trên app dev với CROCS T11 nháp thật (5,835B, 44%): gợi ý ra 14 ca/42h, bảng mốc hiện; CHƯA lưu thử (0194 chưa chạy), CHƯA xem lever Dashboard có dòng dự phòng, CHƯA backtest quy tắc chọn ca (chỉ công thức giờ của engine đã backtest). **Còn lại:** chạy 0194; nút "Kích hoạt" tạo ca mở thẳng từ panel/Bảng Vận Hành (hiện chỉ nêu ca, OP tự mở); hiển thị mốc ở Bảng Vận Hành.
- **31/10: DỮ LIỆU GỐC SHOPEE "CẢ SHOP" (chưa commit, migration 0193 CHƯA CHẠY)** — brand whole shop (Franklin) cần 5 file Seller Centre/tháng ngoài 4 file LIVE + 3 file Ads: `shopee_shop_stats` (12 sheet: doanh số đặt/xác nhận/đã thanh toán theo ngày, theo kênh, theo nguồn con, theo ngày × nguồn, đơn hủy-hoàn, người mua mới-cũ), `shopee_voucher`, `shopee_discount`, `shopee_composition` (ngành hàng, khung giá, người mua mới/cũ), `shopee_shop_products` (TẤT CẢ sản phẩm; sheet "theo sản phẩm" của Shop Stats chỉ top 5/kênh nên cần file này). Đã bỏ: `sales_overview`, `productoverview`, `live_streaming`, 1 trong 2 `overview-v2` (trùng). Code: `lib/dataraw/shopeeShop.ts` (nhận loại theo tên sheet/cột, parse ra dòng PHẲNG có cột `t` = loại dòng, `shopeeShopData`, `reconcileShopLive`), `parseShopeeShopAuto` + `readAllSheets` trong `parseDataRawExcel.ts`, ô thả nhiều file `ShopeeShopPanel.tsx`. Dữ Liệu Gốc Shopee chia 2 nhóm riêng bằng nút "File LIVE" / "File cả shop" (khi `profileOf(sàn).wholeShopFiles`); file Ads vẫn ở Nhập Ads. QUY ƯỚC: GMV = Placed; bốn kênh (thẻ sản phẩm, Live, Video, liên kết) loại trừ nhau và cộng đúng Total, Ads là lát cắt CHỒNG (cờ riêng, không cộng); kỳ phải trong 1 tháng nhưng được thiếu ngày cuối; lệch kênh/ngày/Daily chỉ CẢNH BÁO (`summary.warnings`, panel), không chặn lưu; file sản phẩm không ghi kỳ trong nội dung ⇒ lấy từ tên file. Verify: tsc sạch, vitest 1272/1272 (tests/shopeeShop.test.ts 15 test trên 6 file Franklin T10: Total 1.193.913.200, Seller LIVE 64.544.176 khớp Daily), panel hiện đúng ở /brand/franklin/du-lieu-goc?san=shopee; CHƯA tải file thật lên (0193 chưa chạy, DB thật). **REPORT SHOPEE WHOLE SHOP (cùng ngày, bản chụp bản 7, KHÔNG thêm migration ngoài 0193):** user chốt "luôn đủ trang dù scope" ⇒ report Shopee 11 trang: Tổng quan, Tăng trưởng & khách (MỚI), Kênh bán (MỚI), Key Metrics, Nguyên nhân, Khuyến mãi & voucher (MỚI), Sản phẩm (+ top cả shop, hàng quà tặng tách riêng), Quảng cáo (+ Ads trong Total), Đơn huỷ (+ cả shop đặt/xác nhận), Host, Kế hoạch tháng sau. 3 trang mới luôn hiện; thiếu file thì khung báo ops cần file nào (brand chỉ thấy "chưa có số liệu"). Có Shop Stats ⇒ trang 1 dùng bố cục 4 ô + bảng kênh của TikTok (`SummaryDemoPage` prop `channels`), không có ⇒ bố cục cũ. Code: `lib/report/shopeeShopReport.ts` (`buildShopeeShopSnapshot`, `shopeeShopSplitThrough`, `shopeeShopSpikeDays`), `snapshot.shop` + `snapshot.shopPrev` (so cùng ngày với tháng trước), `report/ShopeeShopPages.tsx`, thứ tự trang + render trong `ShopeeMonthlyReportTabs.tsx`. Số người mua / truy cập lấy từ dòng TỔNG của Shop Stats (cộng ngày sẽ đếm trùng). Phần không do YFB vận hành gắn nhãn "Bối cảnh cả shop". SO SÁNH 3 THÁNG GẦN NHẤT: `snapshot.shopHistory` (tối đa 2 `ShopeeShopMonth` — tóm tắt nhỏ có doanh số theo ngày × nguồn, nối chuỗi qua các bản chụp: bản chụp tháng N lấy `shop` + `shopHistory` của tháng N−1) + `shopeeShopTrend()`; 5 khối: Tổng quan (bảng bốn nguồn), Tăng trưởng (cột 3 tháng + khách hàng), Kênh bán (cơ cấu 100%), Khuyến mãi & Voucher, Đơn huỷ (tỷ lệ xác nhận/hủy). So CÙNG KỲ (1–N ngày) cho doanh số; số duy nhất cả tháng (người mua, truy cập, khuyến mãi, voucher) ghi rõ là cả tháng. Tháng đầu có file cả shop chưa có lịch sử ⇒ không vẽ khối (cần ≥ 2 tháng). THUẬT NGỮ phần cả shop = đúng chữ Seller Centre Shopee (`SHOPEE_SHOP` trong `metricGlossary.ts`: Tổng doanh số, Doanh số (Đơn đã đặt/đã xác nhận), Thẻ sản phẩm, Livestream của người bán, Video của người bán, Tiếp thị liên kết, Dịch vụ Hiển thị Shopee, Đơn đã hủy…), KHÔNG dùng tên TikTok (Total GMV, Seller LIVE, Product card); test metricGlossary chặn viết cứng — dùng hằng. Verify: tsc sạch, vitest 1281/1281 (tests/shopeeShopReport.test.ts), xem SSR HTML trên trình duyệt: Total GMV 1,19B, LIVE 5,9%, Product card 89,3%, khuyến mãi 77%, voucher 52%. CHƯA thử với snapshot thật (cần chạy 0193 + tải 5 file + "Cập nhật số liệu"). **Chưa làm:** ô "KPI toàn shop" ở Kế Hoạch Tháng Shopee; chốt với brand hàng "(Quà tặng không bán)" 657M (55% sales) và cột "Doanh số đơn hủy" 831M (lệch số xác nhận) — chưa dùng cột đó.
- **30/10 (tối): TRANG 1 REPORT THÁNG TIKTOK = "TỔNG QUAN CẢ SHOP" (đã commit b9f74fc, KHÔNG migration)** — user duyệt demo (artifact Wa9vwx86YaMySZewvCnHeY, kiểu Seller Center): 4 ô (Total GMV vs KPI + so tháng trước cùng ngày · LIVE GMV vs Target tới nay/tháng/dự báo · Giờ live vs giờ kế hoạch · GMV/giờ vs GMV/giờ kế hoạch) + khối "Total GMV theo kênh" (donut Seller LIVE / Affiliate LIVE / Video / Product card, % so tháng trước cùng ngày, từ `channelMixes`) + thanh LIVE GMV so Target theo loại ngày. **Đã BỎ khỏi trang 1 TikTok:** biểu đồ cầu, bảng Kết quả, biểu đồ + bảng GMV/giờ theo kế hoạch, khối Quan sát/Insight (prop `insight` vẫn truyền nhưng nhánh mới không vẽ — Insight sửa tay trang summary không còn hiện). Code: `SummaryDemoPage` nhận prop tuỳ chọn `channels`; có `channels` ⇒ bố cục mới (MonthlyReportTabs truyền), **Shopee không truyền ⇒ giữ bố cục cũ**. Verify: tsc sạch, vitest 4 file report/wording 53/53; CHƯA xem trên trình duyệt (cần user đăng nhập). Chưa làm: affiliate booking + "YFB đã làm gì" (user bỏ khỏi demo), Shopee chưa đổi theo.
- **30/10: 4 chip trang Tổng quan & KPI (TikTok + Shopee, chưa commit)** — `SummaryDemoPage` (DemoSummaryPages.tsx) bỏ chip GMV/giờ (đã có ở Key Metrics + biểu đồ kế hoạch), thay bằng 4 chip cam kết/tiến độ: GMV tới nay vs Target tới nay · Giờ live thực hiện vs giờ kế hoạch tháng (+ % thời gian đã qua) · Tiến độ tháng (% Target tháng vs % ngày đã qua, kèm dự báo nếu có) · Total GMV KPI (TikTok có Shop Analytics) hoặc "Còn thiếu so Target tháng" (≈/ngày). tsc + vitest xanh; chưa xem trên trình duyệt.
- **29/10: REPORT THÁNG SHOPEE DÙNG CHUNG TRANG VỚI TIKTOK (chưa commit, KHÔNG migration)** — bản đầu (chiều 29/10) tự dựng trang riêng nên user thấy "chưa cùng format layout logic"; tối 29/10 làm lại: `ShopeeMonthlyReportTabs.tsx` render **chính component của TikTok** — `SummaryDemoPage` (thêm prop `gmvLabel`), `ProductsPageBody` (`ProductsPageData.variant = "shopee"`: cột Orders/Product Clicks, biểu đồ tỷ trọng Product Clicks × Orders/Product Clicks), `HostPageBody` (`HostPageData.variant = "shopee"`: bỏ LIVE CTR/CTOR, Views → Viewers, 2 cặp biểu đồ) đọc **ca Shopee trong app** (`liveSessions`, cùng `byHostDayType/hostReliability/hostVsPeer` như TikTok); Key Metrics / Đơn huỷ / Nguyên nhân cùng markup + thứ tự khối của `KeyMetricsDemoPage` / `NmvDemoPage` / `DemoWhyPage` (phễu theo phiên Viewers → ATC → Orders, bảng "Số đo từng loại ngày"). 8 trang theo `SECTIONS`: Tổng quan & KPI · Key Metrics · **Đơn huỷ** (chỗ trang NMV: Sales(Placed) vs Sales(Confirmed Order) 3 tháng + theo loại ngày) · Nguyên nhân · Sản phẩm & khuyến mãi (xu/voucher chuyển vào đây) · Host & khung giờ · Quảng cáo (**theo `scope.ads` 0190**, VERA không có) · Tháng sau.
  Insight + tiêu đề dùng **chung hàm TikTok** (`summaryBlocks/keyMetricsBlocks/whyBlocks/productsBlocks/peopleBlocks/nextBlocks`, `summaryHeadline/keyMetricsHeadline/observeHeadline`; thêm tham số `gmvLabel`, `impact`, `rateLabel`, `promoNote`) qua `shopeeInsights/shopeeHeadlines` ở `lib/report/shopeePages.ts`. Key Metrics 3 tháng như TikTok; chỉ số quy mô (GMV/Orders/Items/Viewers/ATC) tông `neutral` như Giờ live (VERA T10: GMV +21% chỉ vì giờ +26%). Sửa chung: `peopleBlocks` không còn ô Đề xuất trống (TikTok cũng dính).
  **Bản chụp Shopee bản 6** (`prevProducts` = Product List tháng trước, hạng theo Sales) cho cột hạng Top SKU. VERA T9 + T10 đã bấm Cập nhật số liệu trên dev (bản 6). Kiểm: tsc sạch, vitest 1171/1171; dev nối DB thật đi đủ 8 trang T10 và T9, TikTok VERA T9 không đổi. Chưa thử: bấm tải HTML/PDF gửi brand của Shopee; production còn code cũ ⇒ báo "công thức đổi" tới khi deploy.

- **30/10: SHOP CHỈ NHẬN LIVESTREAM / BRAND TỰ LIVE — TRANG TOÀN SHOP ĐỌC LẠI NGHĨA (KHÔNG migration)** — sửa quyết định 29/10 "tự live ⇒ bỏ nhóm đối chứng": `controlGroup` đã lấy phía livestream = GMV phiên YFB (`agencyLiveByDate`), phía còn lại = Total GMV − TOÀN BỘ Seller LIVE ⇒ phiên brand tự live không nằm bên nào, đối chứng vẫn đúng; shop chỉ nhận livestream (`liveOnly = !scope.ads && !scope.affiliate`) thì là đối chứng sạch. Đo VERA T8→T9: phiên YFB −23%, các kênh còn lại +29% (Video +67M, Affiliate LIVE brand tự book +41M), brand tự live 94M → 148M; JOCKEY: YFB −40%, còn lại +18%. Ads brand VERA đi ngang 67–80M/tháng trong khi Viewers/giờ ca YFB 743 → 433 ⇒ Ads không giải thích. Đã làm: bỏ `controlUsed` (mọi phạm vi dùng `control`); `DemoShopPage(inhouseLive, liveOnly)`: ô KPI thứ 4 = "Brand tự live (Seller LIVE ngoài phiên YFB)", cơ cấu kênh tách Livestream YFB + Brand tự live, cầu kênh đổi nhãn "Brand tự live", lời đối chứng theo `liveOnly`; Direct/Indirect (trang Toàn shop + dòng Direct % ở Key Metrics) ẩn khi tự live (số của cả tài khoản). `shopBlocks(liveOnly, channels[].yfb)`: Insight tách kênh Livestream YFB / Brand tự live; kênh khác giảm ⇒ "Thông tin cho brand: … YFB không có việc ở kênh này" (CROCS giữ lời cũ). Trang 1 không đổi (`SummaryDemoPage` vốn để LIVE GMV YFB đầu, Total GMV chỉ khi có KPI toàn shop; `metrics.summary` không được vẽ). Test `tests/reportScope.test.ts`. Verify dev DB thật: VERA T9 trang Toàn shop đủ 3 bảng/biểu đồ + Insight "kém hơn các kênh còn lại"; CROCS 10 trang không đổi.
- **29/10: PHẠM VI DỊCH VỤ THEO BRAND × SÀN → REPORT THÁNG TIKTOK CHỌN TRANG (`0190` ĐÃ CHẠY 29/10)** — user: CROCS = live + Ads toàn shop + creator affiliate (report như cũ); VERA/JOCKEY = chỉ live, brand có tự live, không theo dõi affiliate. Đo: VERA có file Ads Campaign overview T6–T10 + Live Analysis Affiliate T8–T10 dù YFB không làm ⇒ luật cũ "trang hiện khi có số" sẽ đưa trang Ads/Affiliate vào report VERA. Đề xuất: https://claude.ai/artifact/8Gqj1aVV1ojN5DyzDvET9n.
  `0190`: 3 cột `brand_platform_rates.scope_ads / scope_affiliate` (mặc định true) + `has_inhouse_live` (false), seed VERA/JOCKEY mọi kênh = false/false/true (upsert, không đụng giá). Khai ở CRM → Hợp đồng & giá (`ServiceScope` trong `BrandConfigPanel`, `upsertBrandServiceScope`). `lib/report/reportScope.ts` (`reportScopeOf`, `outOfScopeLabel`, test `tests/reportScope.test.ts`); `BrandMonthlyReport` đọc phạm vi SỐNG từ rates (không vào bản chụp) và truyền `scope` cho `MonthlyReportTabs`. Tắt Ads ⇒ ẩn trang Ads + Insight context Ads; tắt Affiliate ⇒ ẩn trang Affiliate, `BookingPlanPanel`, ô Target/Booking Creator, `nextBlocks(withCreator)`; tự live ⇒ `DemoShopPage(inhouseLive)` chỉ còn Total GMV + Tỷ trọng livestream YFB + cơ cấu kênh (nhãn "gồm cả các phiên brand tự live"), Insight/tóm tắt dùng `controlUsed = []` (không controlLine/controlOps), `shopBlocks(inhouseLive)` nói rõ vì sao không so. Chốt tháng (`closeRow(scope)`, `MonthClosePanel` nhận `brandPlatformRates`) ghi "ngoài phạm vi". Ops thấy 1 dòng phạm vi đầu report (`data-export-hide`). Kèm sửa: `hasReturnRateConfig` chỉ tính dòng đúng sàn có % hoàn > 0 (dòng giá chỉ để khai phạm vi không làm NMV thành 0%; JOCKEY TikTok trước đây có dòng 0% bị coi là đã nhập). Verify dev nối DB thật: CROCS 10 trang không đổi; VERA (ép phạm vi tạm qua localStorage, đã gỡ) 8 trang, Toàn shop rút gọn, Tháng sau không Booking; CRM hiện 3 ô. Sau khi chạy 0190 (29/10) kiểm lại không ép: DB VERA/JOCKEY TikTok+Shopee = false/false/true, report VERA T9 8 trang + dòng phạm vi, CRM 3 ô đúng giá trị. Report Tháng Shopee đọc phạm vi từ 29/10 tối (trang Quảng cáo theo `scope.ads`). **30/10: Shopee đọc đủ 3 công tắc** — dòng phạm vi ops ghi cả Affiliate + tự live (Shopee chưa có trang Affiliate); `shopeeOutsideYfb` (`shopeePages.ts`, test `tests/shopeePages.test.ts`) đếm phiên Live List bắt đầu ngoài mọi ca Shopee YFB (trừ ca huỷ, nới 30 phút hai đầu, ca qua nửa đêm) ⇒ dòng "Chỉ ops thấy · X/Y phiên ngoài ca YFB"; tự live bật + ≥ `OUTSIDE_YFB_LABEL_SHARE` (3%) GMV ⇒ nhãn số tổng `GMV (gồm phiên brand tự live)`; tự live tắt mà ≥3% ⇒ dòng màu vàng nhắc bật công tắc hoặc thêm ca. Không tách số, không đổi bản chụp. Đo thật VERA Shopee: T9 1/50 phiên (0,8% GMV), T10 1/59 (0%) ⇒ nhãn giữ GMV. Còn treo: trang Toàn shop + Affiliate cho shop Shopee vận hành toàn shop (Franklin) — cần file Business Insights toàn shop + file Affiliate (AMS), chưa có.
- **29/10: AUDIT LOGIC REPORT THÁNG — SỬA 5 LỖI NẶNG A1–A5 (chưa commit, KHÔNG migration)** — A1/A2 trang NMV: bỏ chữ "hoàn hủy" (chưa có số hủy), tiêu đề "Hoàn & NMV ước tính", ghi nguồn tỷ lệ đang trừ (`nmvSource`) vs tỷ lệ tại ngày xuất file của tháng trước, ghi chú Refund rate là của cả shop. A3 `scoreRows(..., toDate.shop)`: KPI Total GMV tháng dở chia cho target tới nay (= target × actual ÷ dự báo). A4 `whyBlocks`/tiêu đề trang Nguyên nhân: Giờ live (`key: "hours"`) không được chọn làm nguyên nhân của GMV/giờ. A5 `controlGap(days)` 10/15/20 điểm theo số ngày nhóm đối chứng, lời "nhóm đối chứng gần đúng" (YFB có đặt creator + Ads Product/Creator), "cần rà soát vận hành" thay "nguyên nhân nằm ở vận hành". Test `tests/reportAudit29_10.test.ts`. **Nhóm B cũng đã sửa (29/10):** B6 GMV/giờ thực cả tháng ở trang 1 trọng số theo giờ thực; B7 một ngưỡng 95% kế hoạch (thanh đỏ = phụ đề = cột %); B8 Insight trang 1 chọn loại ngày yếu nhất theo % Target như tiêu đề; B9 tiêu đề Key Metrics bỏ chỉ số kết quả như Insight; B10 NMV cùng cửa sổ ngày với Refund rate (`nmvEndDay` bỏ), trang 1 ghi khi LIVE và KPI shop khác ngày cuối; B11 `nmvBlocks` không in chênh Refund rate khi một tháng chốt một tháng chưa (`curProvisional/prevProvisional`). **Kiểm CROCS T10 trên app (29/10) tìm thêm N1–N5, đã sửa + verify:** N1 Insight trang 1 chỉ nói "vượt ngưỡng" cho GMV/giờ của loại ngày, yếu tố chỉ "cũng vượt" khi |đổi| ≥ ngưỡng; N2 tile GMV/giờ trang 1 chỉ đỏ khi vượt ngưỡng cả tháng (`gmvPerHourBand`, ghi "trong ngưỡng ±8%"); N3 câu Tác động NMV bỏ "ước tính theo ước tính", nhắc nhập % hoàn ở Hợp đồng & giá khi đang dùng 40% mặc định; N4 ghi chú Target tháng gồm target ca huỷ (`cancelledPlanTarget`, CROCS T10: 46,2M) nên lớn hơn tổng bảng kế hoạch; N5 `whyBlocks(factorBand)` ưu tiên yếu tố vượt ngưỡng, không có thì nói "chưa kết luận". **Nốt N6 + C12–C14 (29/10, chưa commit):** N6 Đề xuất trang Toàn shop có thêm việc cho kênh giảm lớn nhất kể cả khi livestream cũng cần rà soát; C12 `estimateSessionCv` (brandReport.ts) đo CV GMV/giờ một phiên trên ca của chính brand (nhóm tháng × loại ngày × buổi, cần ≥30 ca, kẹp 0,15–0,45, thiếu thì mặc định `SESSION_CV` 0,26 của CROCS) và truyền qua `noiseBand/keyMetricsTable/dayTypeFactorRows(…, cv)`; trang Key Metrics ghi nguồn CV (CROCS T10 đo ±31% ⇒ ngưỡng cả tháng ±10% thay ±8%, kết luận không đổi); C13 `slotRows[].cur.index` = GMV thực ÷ GMV kỳ vọng theo loại ngày, Insight Host xếp/đề xuất dời khung theo chỉ số này; C14 phiên creator gọi "GMV phiên" (không "Direct GMV"), dòng Direct % ở Key Metrics ghi rõ lấy từ Shop Analytics mọi phiên của tài khoản shop. Không còn việc treo của audit này.
- **28/10: REPORT THÁNG — KHỐI "DIRECT vs INDIRECT" Ở TRANG TOÀN SHOP (chưa commit, KHÔNG migration)** — brand hỏi hiệu quả live của agency qua các tháng; Indirect cao dễ bị đọc thành "live không chốt đơn".
  `lib/report/liveAttribution.ts` (`attributionMonth`, `attributionRead`, test `tests/liveAttribution.test.ts`) + khối mới trong `DemoShopPage` (cột chồng Direct/Indirect + bảng 4 tháng cùng số ngày, test render `tests/shopAttributionBlock.test.ts`).
  **Nguồn chỉ có Shop Analytics theo ngày** (Seller LIVE GMV = Direct, Seller LIVE indirect GMV = Indirect; cộng = `liveLinked`): file Creator Live Performance theo phiên chỉ có `Attributed GMV` đã gộp ⇒ KHÔNG tách theo phiên/host; số là mọi phiên trên tài khoản shop (cả live brand tự chạy). `ShopDayLite` thêm `liveDirect/liveIndirect/affDirect/affIndirect` (optional); **`PIECE_VERSION` 2→3** ⇒ mọi bản chụp cũ báo "công thức đổi", bấm Cập nhật số liệu mới có khối. Affiliate LIVE làm đối chứng XU HƯỚNG (mức Indirect khác xa: CROCS T6–T8 Seller 25,9→26,8→29,3%, Affiliate 5,2→6,4→7,5%, Attributed 4,6B→5,2B→5,9B) — câu tự sinh chỉ nêu số, không kết luận tốt/xấu.
  **Bản chốt (user bảo gọn, cùng ngày):** trang Toàn shop chỉ còn (a) bảng Direct/Indirect/Attributed/Indirect % qua 4 tháng + cột "So tháng trước" và (b) bảng chi tiết theo loại ngày (Daily/D-Day/Mid-Month/Pay Day) của THÁNG GẦN NHẤT kèm so tháng trước. Chênh tô màu từ 5 điểm (đỏ tăng/xanh giảm; ngưỡng chọn tay, chưa backtest). Đã BỎ: biểu đồ cột chồng, cột/đối chứng Affiliate (cùng `affDirect/affIndirect`), `attributionRead`. Key Metrics giữ hàng "Direct % (Seller LIVE)" theo tab, chênh bằng điểm, không tô màu. `attributionByType` dùng khung camp của chính từng tháng (`bucketAny`).
  Kiểm: tsc sạch, vitest 1122/1122 (`liveAttribution`, `shopAttributionBlock`, `keyMetricsDirectShare`); preview của Claude chưa có số (bản chụp cũ, cần bấm Cập nhật số liệu), user đã tự xem trên máy họ.

- **28/10: ĐỐI SOÁT — ĐỢT 1 "KIỂM TRA THEO NHÓM LIÊN THÔNG" (chưa commit, KHÔNG migration, không đổi số liệu)** — `lib/reconciliation/groupCheck.ts` (hàm thuần, test `tests/reconGroupCheck.test.ts`) gom ca ↔ phiên thành nhóm liên thông (ca nối, restart, ngắt dùng chung một phép kiểm) rồi báo: tổng ca ≠ tổng file (>0,5%), số trên ca lệch bản chia đúng (thay `staleSessions` cũ), phiên ngoài khung ca >15', ca nối hở >15', ca đã diễn ra trong kỳ file mà không phiên nào khớp. Mỗi nhóm có mức Chuẩn / Ước tính theo giờ / Cần check; khối "Kiểm tra đối soát" nằm đầu `ReconciliationPanel`, chip ca có lỗi viền đỏ. Đo thật 28/10 (toàn app T9–T10): 63% GMV ở phòng ≥2 ca, chỉ 12/101 phòng có snapshot ⇒ 55% GMV chia theo giờ. VERA T9 trên app: 49 nhóm = 30 chuẩn / 15 ước tính / 4 cần check. **Đợt 2 (28/10, UI-only): `ReconciliationPanel` còn hai màn — "Kết quả" (một bảng phiên khớp ca gộp agency+review, chip Chuẩn/Ước tính/Cần check, chọn phiên, gõ GMV ca ✎, phiên ngoài lịch gập trong `<details>`) và "Cần check" (lỗi của `groupCheck` + gợi ý gộp restart); nút Áp Dụng Lại/Xoá luôn ở thanh trên; bỏ các rổ màu + đoạn giải thích dài.** Việc còn: Đợt 3 quy trình snapshot lúc hết ca cho phòng nhiều ca (quyết định vận hành).


- **27/10: AUDIT THUẬT NGỮ CHUYÊN NGÀNH TOÀN APP (chưa commit, không migration)** — quét ~5.000 dòng chữ hiển thị, thay khẩu ngữ bằng
  thuật ngữ ecommerce/livestream/digital marketing ở ~110 file (Report Tháng TikTok/Shopee, câu Insight tự sinh, Dashboard, kế hoạch xử lý,
  cổng brand + bản tin, Sổ Ca, giao ca, đối soát, Finance, engine). Bảng từ ở §5.2 "Thuật ngữ chuẩn"; `tests/uiWording.test.ts` chặn từ cũ quay lại.
  Kiểm: tsc sạch, vitest chỉ còn 3 lỗi có sẵn từ trước (layoutConventions h2, platformProfiles, uiReadability 11px — không do đợt này);
  Browser pane: Sổ Ca ("Chưa tải lên file số liệu", "ca có số liệu"), Finance ("P&L từng ca"), Dashboard ("target luỹ kế", "ca chưa có số liệu"), 0 lỗi console.
  Vòng 2 cùng ngày: ĐỌC HẾT 4.411 câu chữ hiển thị (trích chuỗi + text JSX, gộp trùng, bỏ className/import) — sửa thêm ~70 chỗ
  (về đích→xác suất đạt target, Đã chạy→Đã live ở Cam Kết brand, Nhịp bán→GMV theo ngày, Off sớm→Kết thúc sớm, bảo chứng→được xác thực,
  PAY-DAY→PAY DAY, Đặt lại MK, % commission→% hoa hồng…), mẫu mới thêm vào `tests/uiWording.test.ts`. Vòng 3 (28/10): `0187_error_wording.sql`
  định nghĩa lại NGUYÊN VĂN 10 hàm (bản mới nhất), chỉ đổi 14 câu `raise exception` "up file/up số/off sớm" → "tải lên file/cập nhật số liệu/kết thúc sớm";
  đã kiểm diff (chỉ 14 dòng raise khác nguồn) + parse trên Postgres tạm. **`0187` ĐÃ CHẠY 28/10.** Vòng 3b: quét chuỗi trong bản mới nhất của MỌI hàm SQL ⇒ `0188_function_text_wording.sql` sửa
  4 hàm còn sót (nhắc giao ca "up file", "up nhầm ca", "khả năng về đích", "GMV cộng dồn") + sửa chữ thông báo nhắc giao ca đã gửi;
  `tests/uiWording.test.ts` có thêm test quét hàm SQL bản mới nhất. **`0188` ĐÃ CHẠY 28/10.**
- **27/10: TARGET CA TĂNG CƯỜNG HIỆN KHẮP APP + DB TỰ ĐIỀN TARGET TẠM (đã push `aea3acd`; `0186` ĐÃ CHẠY 27/10 — JOCKEY TikTok 11/10 20–23 = 4.918.033 = 100M ÷ 61h × 3h, đúng)** — check engine target trên DB thật:
  ca OP mở sau chốt có target đề xuất ở `plan_boost_slots` nhưng `applyAllocatedTargets` gán 0 cho mọi ca ngoài kế hoạch ⇒ Lịch/Sổ Ca/Bảng
  Vận Hành/app talent hiện 0 (CROCS 24/10 15–18 52,8M; 27, 30, 31/10 18–21 66,5M); target chỉ được điền khi có người mở Kế Hoạch Tháng
  (JOCKEY TikTok 11/10 chờ 16 ngày). Sửa: (1) `fetchBoostTargets` + effect theo chữ ký `shiftSlots` ở `useWorkspaceData` ⇒ ca mang target
  đề xuất + cờ `LiveSession.boostTarget`; nhãn "đề xuất" ở Sổ Ca / SessionPlanVsActual / thẻ ca; (2) `0186`: `ensure_boost_slot` chèn target
  TẠM = Σ target ÷ Σ giờ ca kế hoạch gốc × giờ ca (ca qua đêm +24h), `target_pending` vẫn true để engine thay khi mở Kế Hoạch Tháng; điền một lần
  các dòng đang chờ có target 0. Lưới hiện "target tạm", Việc cần làm chỉ nhắc ca chưa có số nào (`boostLacksTarget`). Kiểm: replay cả chuỗi
  + `supabase/tests/0186_boost_provisional_target.sql` (đỏ trước 0186, 7/7 sau, 0185 vẫn 21/21); vitest targetAllocation/boost/noCrossPlatformPerf;
  dev nối DB thật: Sổ Ca CROCS 27/10 18–21 "66,5M đề xuất". Số đo độ lệch engine T10 (thực/target 47–99%, thực/dự báo VERA ~60%, lệch theo
  khung giờ sáng/chiều) ghi ở memory `project_engine_target_v3` — chưa làm backtest/sửa engine.
- **27/10: KẾ HOẠCH THÁNG BẢN GỌN (đã push `db5311c`, không migration; đề xuất + demo https://claude.ai/artifact/WCc9XbDXLCf4n7BAQAdAYY, user duyệt cả 4 quyết định)** —
  đầu trang = dải 4 bước (Giờ & target · Lưới · Chốt · Theo dõi/Target tháng) + hàng 5 số (ⓘ thay dòng giải thích) + MỘT dòng tham số ("sửa" mở khung;
  kế hoạch mới mở sẵn) thay 3 thẻ 704px; lưới tách sang `components/monthplan/PlanMonthGrid.tsx`: ca = một nút rút gọn, sửa trong khung nổi; đã chốt ⇒ ca
  tới hạn hiện thực đạt xanh/đỏ, đầu ô ngày + cột **Tuần** = % target tới nay (`lib/scheduling/planWeeks.ts` `summarizePlanSpan`, cùng luật run-rate,
  nguồn `planRunRate(...).slots`); ca tăng cường + ca ngoài kế hoạch thành dòng viền đứt trong ô ngày (bỏ 2 khối + cảnh báo riêng + khối "Kế hoạch vs thực tế").
  Kế hoạch đã chốt mà Σ target = 0 (lối "Mở lịch tháng sau" của Điều Phối) ⇒ thẻ **"Bước tiếp: đặt target tháng"** mở thẳng khung chia lại (RPC 0164, ceo/admin;
  role khác thấy "báo ceo/admin"); banner tháng sau trỏ "Mở lịch tháng N ở Điều Phối" (`onOpenRoster`). Bỏ hẳn: Quy tắc lặp + Nạp từ quy tắc (0 quy tắc
  trong DB; xoá `RecurringRulesPanel`, `lib/db/recurringShiftTemplates.ts`, `planMonthSlots.ts`, `mergeFromTemplates`, kiểu `RecurringShiftTemplate`;
  bảng `recurring_shift_templates` ở DB vẫn còn), ô Ghi chú (cột `notes` giữ), ô chọn phương án (chọn ở bảng so 3 phương án). Đo trên dev nối DB thật,
  CROCS TikTok T10, 1440×900: lưới bắt đầu 539px (trước 1.385), lưới cao 839px (trước 2.420), ô nhập luôn mở 2 (trước 281), chữ trên lưới 142 từ (trước 461);
  tuần 122/111/89/73%, "95% target tới nay" khớp Dashboard; khung sửa ca: ca đã qua khoá target + giờ, ca tương lai đã chốt người khoá giờ; 375px không
  tràn. Chưa thử được trên dữ liệu thật: thẻ "đặt target" (T11 chưa có kế hoạch nào). Test: `tests/planWeeks.test.ts`; sửa test bố cục M5/layoutCalm.
- **27–28/10: AUDIT + SỬA KẾ HOẠCH THÁNG (đã push `ff61f96`; `0185` ĐÃ CHẠY 28/10 — `replace_plan_slots` có, 0/369 ca kế hoạch lệch giờ ca thật)** — 12 điểm gãy, sửa hết:
  P1 — Chốt lại không mở lại ca đã huỷ (`lock_month_plan` giữ huỷ, trả `kept_cancelled`); sau chốt đổi target ca có sẵn chỉ ceo/admin + mọi đổi
  target tháng (sửa/thêm/bỏ ca) ghi `plan_target_audit` (guard 0185; ô target khoá theo `role`); cấm live ngày trên kế hoạch đã chốt phải xác nhận;
  target nhóm ngày báo khi phần còn lại không có ca nào nhận; OP dời giờ ca thật ⇒ shift_slot + ca kế hoạch dời theo (trigger
  `trg_sync_session_plan_time`, 0185 đồng bộ một lần 4 ca đang lệch: CROCS 27/30/31, Franklin Shopee 11/10); cảnh báo "N ca đã live ngoài kế hoạch"
  lấy đúng `planRunRate(...).offPlan` (đính chính audit: VERA TikTok 15 ca ngoài kế hoạch nhưng 14 đã "loại khỏi báo cáo" ⇒ chỉ 1 ca 03/10 2,1M, 53,3% vs 52,9%;
  CROCS 1 ca 24/10 37,6M). Kiểm trên app (dev, DB thật, không lưu gì) 28/10: cảnh báo VERA T10 "1 ca … từ 03/10 … GMV 2,1M"; hỏi khi rời trang có cam kết gõ dở;
  cảnh báo nhóm ngày "Phần còn lại 300M … KHÔNG có ca nào để chia". Chưa thử được trên app: hộp hỏi cấm live (mọi ca tương lai thật đã chốt người), ô target khoá với role ops.
  P2 — `crossBrandCheck` tính cả chính brand ở sàn kia; banner "tháng này còn nháp" đọc lại sau chốt/xoá; cam kết gõ dở tính là chưa lưu;
  "+ ca" lấp khoảng trống đủ dài, không sinh ca sau ca qua đêm; ca tăng cường engine không dự báo được nhận target/giờ của kế hoạch;
  lưu lưới = RPC `replace_plan_slots` một transaction (DB chưa có thì rơi về cách cũ). Kiểm: `supabase/tests/0185_month_plan_integrity.sql`
  21 mục trên bản replay (trước 0185 đỏ ở mục 1); vitest monthPlanGrid/boost/workflowIntegrity. Chi tiết: lịch sử `## Audit + sửa Kế Hoạch Tháng (2026-10-27/28)`.

- **29/10: Tự điền Target Live tháng sau ở Report Tháng trang "Tháng sau" (chưa commit, tsc sạch, chưa thử trên app thật)** — khi loại ngày chưa có Kế Hoạch Tháng, ops tự gõ Giờ live + Target GMV (triệu) vào `NextLivePlanPanel`; lưu vào `section_notes` key `next_live_target` của report tháng hiện tại (không migration), brand thấy số đã lưu (chỉ đọc), bản xuất có. Có plan thì dùng plan như cũ. Code: `report/NextMonthPanels.tsx` (`encode/decodeLiveTarget`), `MonthlyReportTabs.tsx`.
- **28/10: Bảng điểm Report Tháng khớp Dashboard (chưa commit, chưa kiểm trên app thật)** — tháng còn dở (`cmp.partial`) + plan đã chốt: % Target tính trên **target tới nay** (`planRunRate.buckets[].targetToDate`, cùng số run-rate Dashboard; Daily 103% thay vì 81%, cả tháng 95% thay vì 86%), ô Target hiện "tới nay · cả tháng". Tháng đủ: không đổi. Dòng Total GMV (file shop) giữ nguyên. Code: `scoreRows(..., toDate)` ở `lib/report/brandReport.ts`, `planRR` memo ở `MonthlyReportTabs.tsx`, test trong `tests/brandReport.test.ts`.
- **28/10: ADS THEO NGÀY DÁN TỪ FILE TRACKING (đã push, `0184` ĐÃ CHẠY 28/10; CROCS T3→T10 đã dán, 245 ngày)** — CROCS theo dõi Ads bằng file "Performance Tracking" (sheet "Daily Ads
  Report": target + actual × Live/Product/Creator mỗi ngày). Nhập Ads có khung dán (`AdsTrackingPanel`, bộ đọc `lib/ads/adsTracking.ts`, bảng `brand_ads_daily`
  qua `lib/db/adsDaily.ts`); Report Tháng trang Quảng cáo có khối "Ngân sách Ads theo kế hoạch" (`report/AdsPlanPanel.tsx`). Chi tiết: lịch sử `## Ads theo ngày dán từ file tracking (2026-10-28)`.
- **27/10: tab up riêng "Live Analysis — Affiliate" (loại `affiliate_live_analysis`, `0183` ĐÃ CHẠY 27/10)** — view "linked accounts" không ra phiên của tài khoản affiliate nên thêm loại file mới (cùng 28 cột, dùng chung `parseLiveAnalysis`). Trang Affiliate (`affiliateLiveSessionSlice`) chỉ đọc `affiliate_live_analysis` (file shop `live_analysis` chứa phiên inhouse nên không đưa vào); mục Affiliate của Chốt tháng (`monthClose.ts`) chỉ tính `affiliate_live_analysis`; Report Tuần vẫn chỉ đọc `live_analysis` nên số affiliate không lọt vào cột đối chiếu. Chạy `0183` trước khi up file (không thì DB báo check_violation). Chưa up thử file mẫu thật `Live Analysis20261027035737.xlsx` (T10, 6 phiên, 3 creator) vào app.
- **28/10: XUẤT REPORT THÁNG RA FILE HTML GỬI BRAND (chưa commit, không migration)** — nút "Tải bản gửi brand" ở đầu Report Tháng (ops/CEO/admin, cả TikTok lẫn Shopee). Dựng ẨN (portal ngoài màn hình, rộng 1180px) một bản report y như brand thấy (`canManage=false` + prop mới `forBrand` ở `MonthlyReportTabs`: kế hoạch tháng chưa Chốt và lịch Affiliate tháng sau chưa Chốt bị lọc, vì RLS không lọc hộ khi ops đứng ra xuất) rồi `lib/report/exportStandaloneHtml.ts` đóng gói DOM + CSS thành 1 file .html (~0,5 MB): không URL/title/favicon/script của app, biểu đồ recharts là SVG co theo khung, mục lục là link cuộn, `<details>` vẫn mở/gập; mất tooltip khi rê chuột. Verify: CROCS T9 — file 494 KB, 0 chuỗi liveops/localhost/supabase, không có nút Xuất Excel/ghi chú "Chỉ ops thấy", 5 biểu đồ có chiều cao thật + chú giải, mục lục cuộn đúng. Bẫy: khung ẩn có style fixed phải bỏ khỏi bản clone (lần đầu file ra trống); nút nên bấm khi cửa sổ ≥768px (dưới đó report gập chi tiết như điện thoại). **Khớp report dựng lại 28/10 (đã sửa + verify trên CROCS T9):** report mới vẽ biểu đồ bằng SVG tự dựng (`demoCharts.ts`, 0 `.recharts-wrapper`, không tooltip) nên `captureChartTooltips` hiện chỉ có tác dụng với biểu đồ recharts còn sót (0 cái ở T9). **Chạy y hệt app (29/10, user yêu cầu): từng trang một.** Xuất truyền `showAll` (render đủ 10 trang trong khung ẩn để biểu đồ có kích thước) nhưng dùng CHÍNH `PageRail` của app (`data-rail`, bỏ nhánh mục lục cuộn `mr-toc`/`data-sec`); script trong file ẩn các `section#mr-*` trừ trang đang chọn, bấm thanh trang hoặc nút Trang trước/sau (script tự dựng vì `PagePager` mang `data-export-hide`) để đổi trang, nhớ trang qua hash `#mr-<id>`, in thì hiện đủ trang. Thử trên file thật CROCS T9: chuyển 10 trang, tab trong trang, Trang trước/sau đều đúng. **PDF gửi brand (29/10, nút "Tải PDF gửi brand", chỉ TikTok):** KHÔNG ngắt A4 (ngắt giữa biểu đồ/bảng/Insight, 45 trang rác) — mỗi trang report = 1 trang PDF cao vừa nội dung, rộng 1280px (`printStandaloneHtml` trong `exportStandaloneHtml.ts`: iframe ẩn nạp file xuất bản `pdf=true`, `__preparePdf` đo chiều cao từng `section#mr-*` rồi ghi `@page p_<id>` riêng + 48px dư, rồi `print()` — người dùng chọn đích "Lưu dưới dạng PDF"). Bẫy đã đo: (1) Chrome tính `@media` theo khổ giấy mặc định ~816px nên PDF ra bố cục điện thoại ⇒ `flattenWidthMedia(css, 1280)` tính sẵn @media chỉ-có-chiều-rộng (test `tests/flattenWidthMedia.test.ts`); (2) padding/gap của khung chứa các section nằm ở trang mặc định ⇒ sinh trang trắng đầu file, bỏ bằng `.pdf-sections{padding:0;gap:0}`; (3) bảng `.tw` cuộn ngang bị cắt cột ⇒ `overflow:visible` khi in; (4) bảng có tab in nối tiếp mọi tab (mỗi bản có hàng tab sáng làm nhãn). Tên gợi ý trong hộp thoại in = `document.title` của trang cha (đổi tạm). **Tên file mặc định (HTML + PDF):** `<brand>_<sàn>_Report-Thang_<MM>-<YYYY>` vd `CROCS_TikTok_Report-Thang_09-2026`. Verify: in thử file thật bằng Chrome headless = đúng 10 trang, đủ Insight, không trang trắng; chưa thử hộp thoại in thật của Edge/Safari (Safari có thể không nhận khổ riêng từng trang). Nút HTML đổi tên "Tải HTML gửi brand". **Kế hoạch tháng sau trong bản gửi brand (29/10, user quyết "cho brand thấy kế hoạch đâu có sao"):** `MonthlyReportTabs` không còn lọc "chỉ khi Chốt" cho Kế Hoạch Tháng của THÁNG SAU và lịch Affiliate tháng sau (các tháng khác vẫn chỉ lấy khi đã Chốt; RLS vẫn chặn role brand thật). Khối nhập tay ở mục 10 (`NextLivePlanPanel`, `BookingPlanPanel` prop `canEdit`) ẩn hẳn khi không phải ops và không có kế hoạch/số đã lưu — trước đó file gửi brand lộ ô chọn loại ngày, nút xoá, "+ Thêm phiên". **Tab:** `captureTabVariants` nhận `.tabs`/`role=tablist` và panel `.pn` (cấu trúc cũ `rounded-2xl overflow-hidden` không còn ⇒ trước đó cả 4 bảng tab — Phễu LIVE, Views/giờ × CTOR, Host PFM theo loại ngày, Key Metrics — chỉ còn tab đầu); mỗi tab một bản chụp (`data-tabgroup`/`data-variant`), script đổi bản khi bấm `.tabs button` — thử trong iframe: bấm tab 3 ⇒ đúng bản 3. Component mới có hàng `.tabs` trong `.pn` là tự được xuất; control khác giữ state React sẽ đứng yên. Còn lại: PDF (chưa làm), kiểm tay bản Shopee.
- **29/10: ĐÃ GỠ Action plan khỏi Report Tháng** (user bỏ: không còn bảng "Đánh giá lại"/"Việc tháng sau", ô "Việc đề xuất" ở Tóm tắt, dòng chấm việc ở Insight trang Tháng sau). Còn nguyên cột `action_plan` (0182), `lib/report/actionPlan.ts`, `report/ActionPlan.tsx`, `saveMonthlyReportActionPlan` nhưng không ai gọi — xoá nếu chắc không dùng lại.
- **27/10 tối (ĐÃ GỠ 29/10): ACTION PLAN REPORT THÁNG (chưa commit, `0182` ĐÃ CHẠY 27/10 — đọc được cột qua REST)** — học deck CROCS T9 slide "Plans for OCT": trang "Tháng sau" có bảng
  Hành động · Căn cứ · Chỉ tiêu theo dõi (`ActionPlanPanel`, report/ActionPlan.tsx); plan lưu ở report tháng VIẾT ra nó (`brand_monthly_reports.action_plan`,
  đường ghi riêng `saveMonthlyReportActionPlan`); report tháng sau có khối "Kết quả action plan tháng trước" tự chấm (`gradeAction`, lib/report/actionPlan.ts,
  test `tests/actionPlan.test.ts`). Ô "Việc tháng sau" trong khung sửa kết luận đã bỏ (một chỗ nhập). Verify bản build production nối DB thật: CROCS T9
  lập plan (GMV/giờ Daily ≥ "19,9M" lưu 19.900.000, % Target, việc chữ) → report T10 "Đang theo dõi · đang dưới mức" 19.366.638 (Key Metrics Daily 19,4M),
  % Target 86,0% = bảng điểm; 375px không tràn; xoá plan về null (dòng T9 nháp rỗng còn lại). Chưa thử được: nút ops tự chấm (chỉ hiện khi tháng chấm đã hết), góc nhìn brand.
- **27/10: AUDIT REPORT THÁNG + SỬA A + CHỐT THÁNG B (đã push main 27/10, không migration)** — audit https://claude.ai/artifact/Hh4aiZB3EuFpr7J9HVwith.
  A: 7 lỗi report (Affiliate % target/ROAS chỉ trên phiên có số `creatorRates`; host yếu → `peopleOpsNote` chỉ ops; ô trang 1 cùng kỳ; ẩn trang Toàn shop/Sản phẩm
  với brand khi trống; Insight trang 7 mở bằng khung giờ; report Shopee bản 4: khung camp theo Kế Hoạch Tháng, chữ "phiên", ghi chú `shopeeNotes(s,"brand"|"ops")`).
  B: khối **Chốt tháng** ở Toàn Cảnh Brand (`MonthClosePanel`, `lib/report/monthClose.ts`) + `publishBlocker` ở cả hai nút Phát hành. Chi tiết: lịch sử `## Report Tháng: sửa 7 lỗi + Chốt tháng (2026-10-27)`.
- **25/10: ĐIỀU PHỐI LỊCH LIVE BẢN GỌN (demo duyệt https://claude.ai/artifact/6YoM6U3rE89iGcSNESPUyq)** — Đợt 1 (b26eed3): MỘT màn = thẻ tháng (`MonthStrip`,
  `monthStatus.ts`) + "Việc cần làm" có nút + lưới tuần có giờ tháng cạnh kênh; màn phụ ở menu "Thêm". Đợt 2 (82ac9cd; `0181` ĐÃ CHẠY 25/10, RPC kiểm trên DB thật): "Mở lịch tháng sau" 3 bước
  (`OpenMonthWizard`, `openMonth.ts`) ghi qua đường Kế Hoạch Tháng (cam kết → plan + ca target 0 → `lock_month_plans` → hạn) + "Chép khung giờ tuần trước"
  (`create_open_slots`). Target T11: CEO/admin "Chia lại target". Chi tiết: lịch sử `## Điều Phối Lịch Live bản gọn đợt 1–2 (2026-10-25)`.
- **24–25/10: BẢNG VẬN HÀNH (gộp Phòng Điều Hành e5d9364 + làm theo audit 073c231; đã push, không migration)** — 2 chế độ "Hôm nay & tuần" /
  "Cả tháng" (`OpsMonthView`, khối lập kế hoạch + cam kết giờ ở đây); khối **Cần xử lý** (ca qua giờ chưa có số, trùng người theo ngày, chip lọc); nhãn đỏ
  "chưa có số" = `isUnconfirmedPast`; kỳ vọng GMV trên dòng ca (`useShiftExpectations`) + phễu (`OpsSupport`); Việc cần làm = hôm nay (≤ 48 giờ) + việc tháng
  gom nhóm (`groupTodos`); ca nháp sa bàn = việc + dòng + bộ lọc. Audit/demo/verify: lịch sử `## Gộp Phòng Điều Hành…`, `## Audit Bảng Vận Hành…`, `## Bảng Vận Hành theo audit…`.
- **24/10:** Dashboard **Tổng quan account** (9f31121) + **Report Tháng 10 trang** (3049ecc) — lịch sử `## §1 mục 24/10 Dashboard + Report Tháng (chuyển khỏi WORKSPACE 25/10)`.
- **23/10:** audit trùng màn (11b2069; OP vẫn chốt người/mở/huỷ/dời ca) + **Kế Toán K1** (`Accounting.tsx`, chưa commit) — lịch sử `## §1 mục 23/10 audit trùng màn + Kế Toán K1 (chuyển khỏi WORKSPACE 24/10)`.
- **23/10: Dashboard "so cùng kỳ"** (đã push b7d8315) — lịch sử `## §1 mục 23/10 Dashboard so cùng kỳ (chuyển khỏi WORKSPACE 24/10)`.
- **16–22/10** (đã thay): một thẻ kênh + cổng brand (`0179` ĐÃ CHẠY), bố cục bớt rối, audit sidebar (`0178` CHƯA CHẠY) — lịch sử `## §1 mục 21–22/10 …`, `## §1 mục 17–19/10 …`, `## §1 mục 16–17/10 …`.
- **07–16/10** (nguyên văn: lịch sử `## §1 mục 07–16/10 (chuyển khỏi WORKSPACE 24/10)`, từ đó trỏ tiếp mục chi tiết từng đợt): app talent bản 2
  (0177 ĐÃ CHẠY), Bàn Trainer + role `trainer` (0175 rồi 0176 CHƯA CHẠY), đối soát chia theo mốc (0171–0174 ĐÃ CHẠY, `private.recon_shares` là phép
  chia duy nhất), Phòng Điều Hành 0170 (24/10 gộp vào Bảng Vận Hành), run-rate theo ca, audit đa sàn 0149–0161 (ĐÃ CHẠY). **Còn treo:** brand `JEW`
  chưa tạo; 15 cặp trùng người do sheet chờ user rà; `C.Đình`/`P.Thảo` chưa có rate; `create_backfill_sessions` chưa tự bỏ room inhouse; chưa thử
  trên app thật: Giao ca Shopee bằng file, Ca nối/ngắt room, "Sinh ca" VERA Shopee, đăng ký ca bằng tài khoản talent, góc nhìn role brand.
- **CHẠY THỬ THẬT trên dữ liệu thật** (từ 2026-09-18; mock đã xoá sạch 19/09). DB: 33 hồ sơ talent thật, CROCS T6–T9 nạp
  bù từ file Creator-Live-Performance (229 ca, còn ca chưa gán host). **Không đề xuất tính năng mới**; hỏi user chạy thử
  tới đâu, cái gì kêu, rồi sửa đúng chỗ đó. **Không seed mock lại.**
- **Các đợt 04–07/10 trước audit đa sàn** (lịch 2 sàn 0143–0145, giao ca, cấp 27 tài khoản host/trợ, gộp cấu hình một chỗ nhập 0146,
  tách sàn 0139–0142, đổi người giữa ca 0138/0147/0148, nạp Working File, audit 0133–0136) — nguyên văn: lịch sử `## §1 các đợt 04–07/10 (chuyển khỏi WORKSPACE 07/10)`.
- **Quyết định user đã chốt — đừng nêu lại:** luật run-rate (§5.6); Target GMV từng ca ở "Kế Hoạch Tháng Sau" brand ĐƯỢC
  thấy (01/10); tiền không có chữ "đ" (27/09); trung tâm xuất file = một module dùng chung, không dựng tab riêng (02/10);
  gộp menu/IA chờ số liệu `ui_tab_views` — tiền đề này sai (app chưa vận hành, số mở tab chỉ là user + Claude thử; 18/10 đã gộp
  NHÓM sidebar, chưa gộp/bỏ màn nào); chỉ ops tạo ca (brand không tự mở).

## 2. Việc còn treo

**Cần user làm:**
- **Điều khoản hợp tác (31/10, `0191` ĐÃ CHẠY):** CRM → Hợp đồng & giá từng brand × sàn → "Tạo từ cấu hình hiện tại" (hoặc chọn gói mẫu) → đặt ngày áp dụng (gợi ý: đầu tháng) → Lưu. Brand có Ads/booking: nhập chi tiêu Ads / số creator ở khối "Tính phí tháng". Rồi mở Kế Toán so doanh thu hợp đồng với sổ. **HOÃN theo user (31/10) tới khi có hình thức hợp tác thật của từng brand:** hình thức live (trọn ca/cấp host/thuê phòng/không có ca) mới là nhãn; khoản cả tháng chưa vào Finance & P&L từng ca; bù giờ chưa tự cộng sang tháng sau; chi tiêu Ads/creator nhập tay ở tab Tính phí tháng; chưa brand nào khai điều khoản. Bố cục CRM = 4 tab (Điều khoản · Hợp đồng · Tính phí tháng · Kênh, host, phòng); Kế Toán có "chi tiết phí" chỉ đọc.
- **Kế Hoạch Tháng bản gọn (27/10, đã push `db5311c`):** deploy; sau khi "Mở lịch tháng 11" ở Điều Phối, vào Kế Hoạch Tháng từng kênh bấm "Đặt target…" (ceo/admin).
- **Kế Hoạch Tháng (28/10, `0185` ĐÃ CHẠY + push `ff61f96`):** còn thử bằng tài khoản ops: ô target ca đã chốt bị khoá, DB từ chối đổi target. T11 chưa có kế
  hoạch nào (27/10) — "Mở lịch tháng 11" ở Điều Phối Lịch Live.
- **Ads theo ngày (28/10, 0184 ĐÃ CHẠY, CROCS T3→T10 đã dán):** cuối mỗi ngày/tháng dán lại khối "Daily Ads Report" để cập nhật actual (ghi đè ngày trùng).
- **Action plan (27/10, 0182 ĐÃ CHẠY):** commit + deploy; lập plan thật cho CROCS T10 (deck T9 có 9 việc) trước khi chốt T10; đầu T11 ops chấm các việc "Ops tự chấm" ở report T10.
- **0179 ĐÃ CHẠY 21/10.** Còn: mở Dashboard brand Franklin (ops) → "Gửi bản tin cho brand" → đăng nhập tài khoản brand Franklin xem trang Tổng quan.
- **0178 (17/10):** chạy `0178_ops_flow_integrity.sql` — trước hay sau deploy đều được (client chưa có hàm ⇒ quay về `update_session_with_children`;
  view chưa có cột ⇒ đọc lại không có `live_evidence`, mỗi lần mở app tốn 2 request 400 tới khi chạy). Sau khi chạy: Bảng Vận Hành / Sổ Ca
  thấy ca quá giờ tự "Đã xong" lại (trước đó `complete_past_sessions` lỗi cả lô vì cặp trùng người). Nên bật pg_cron (Database → Extensions)
  để ca được đóng cả khi không ai mở app. Code đã push `9426932` (19/10, gồm run-rate theo ca 11/10 + bố cục 18–19/10) — Vercel tự deploy từ main.
- **Điều Phối Lịch Live (25/10):** `0181` ĐÃ CHẠY + code đã push (b26eed3, 82ac9cd). Việc của user:
  bấm "Mở lịch tháng 11" (đã thử tới bước 3 trên DB thật: 7 kênh, 525 ca, 1.327 giờ — CHƯA bấm tạo). Còn: tài khoản Trainer; rate/giá; GMV hợp đồng FUJIWA (450 → 450M).
- **Đối soát / GMV ca (13/10):** 0174 ĐÃ CHẠY. Còn: deploy client; Áp dụng lô CROCS T10 01–13/10, Áp Dụng Lại lô VERA Shopee 08–10/10 (Claude bị chặn bấm — user bấm); ca CROCS 11/10 09–12 (file tải 13:35) nên gõ GMV đúng ở form Giao ca trước khi Áp dụng.
- **Bảng Vận Hành · Cả tháng (Phòng Điều Hành cũ, 0170 ĐÃ CHẠY):** đặt `ANTHROPIC_API_KEY` trên Vercel nếu muốn hỏi bằng Claude (thiếu thì chỉ Gemini). Role brand chỉ thấy điểm của ngày sổ dự báo đã ghi (Dashboard được mở ngày đó).
- **0166–0168 ĐÃ CHẠY 11/10.** Còn thử thật: (0168) deploy rồi up Live List giữa phiên ở một ca nối Shopee; (0167) xem lại rồi Áp dụng lô VERA Shopee 01–10/10 đã gộp, TikTok chưa kiểm nhóm restart; (0166) bỏ tick vài phiên → Áp dụng → ca khớp phiên bỏ tick phải giữ nguyên số.
- **App talent bản 2 (16/10): ĐÃ deploy + 0177 ĐÃ chạy (phiên 16/10 tối kiểm trên bản thật, link .ics chạy).** Còn lại: deploy → ở Bàn Trainer bấm "Chép tin Zalo" dán vào nhóm host → nhờ 1–2 host mở link, bấm "Đã xem", thêm lịch vào điện thoại. Đo lại ~30/10: số người mở app (`ui_tab_views` role talent), số người có dòng `shift_acks`, số dòng `talent_calendar_feeds`.
- **App talent T1+T2 (11/10, đã commit):** đăng nhập thử bằng một tài khoản host/trợ thật trên điện thoại rồi báo chỗ sai; muốn tab Đăng ký có nội dung thì OP mở ca qua Kế Hoạch Tháng → Chốt (hiện lịch xếp từ sheet nên 0 ca mở); nhập rate ở Talent Pool để Hồ Sơ có thu nhập. Đo lại sau 2 tuần: lượt mở của role talent (Lượt Mở Tab) + tỷ lệ ca có trợ được giao trong app.
- **0165 ĐÃ CHẠY + kiểm trên DB thật 10/10; code đã commit `bb5eab8` trên nhánh `feat/ca-tang-cuong-0164-0165` (ĐÃ merge vào main — bb5eab8 + aea3acd/0186 là tổ tiên của main, xác minh 30/10).** Còn lại: nhờ OP mở thử một ca ở Lịch & Studio cho kênh đã chốt: dòng "Ca tăng cường" phải hiện ở Kế Hoạch Tháng, target đề xuất tự điền, target tháng không đổi (tôi không tự tạo ca trên dữ liệu thật).
- **0164 ĐÃ CHẠY + áp dụng 10/10** (VERA Shopee T10, CROCS TikTok T10). Còn lại: chưa thử bằng tài khoản ops (phải bị chặn); JOCKEY Shopee T10 chưa chốt kế hoạch; chạy lại "Chia lại theo lịch hiện có…" khi có ca nạp bù/OP thêm mới.
- **0155 ĐÃ CHẠY 08/10.** Thử tab Affiliate → Kế hoạch với kế hoạch T10 thật: dán sheet → Lưu → Chốt, gửi brand; khi tháng 10 có file Live Analysis thì Nạp Từ Dữ Liệu Gốc để khớp (chưa thử lưu kết quả khớp thật).
- **0153 + 0154 ĐÃ CHẠY 08/10. Thử trên app thật** — Shopee: mở ca → Giao ca → up file Live List → chọn phiên → Giao ca; TikTok: mở một ca TikTok → "Room của ca này" → Ca nối / Ca bị ngắt; 
- **Việc treo cũ 04–08/10** (Đợt 3 tài khoản, 0143 trùng người, 0139–0142 tách sàn, 29 ca chưa host, CROCS T10, file Ads, CROCS T9 lô cũ, KAM thật,
  Sentry, nạp lịch sử T6–T9 cho 4 brand, nhập giá + lương, gán host ca nạp bù) — nguyên văn: lịch sử `## §2 việc treo 04–08/10 (chuyển khỏi WORKSPACE 21/10)`.

**Cần tài khoản/mật khẩu mà Claude không có:**
4. Góc nhìn role `brand` bằng JWT thật — DB có 1 tài khoản brand (Franklin, tạo 27/07) nhưng Claude không có mật khẩu; cổng brand 21/10 kiểm bằng test SSR + bộ kiểm SQL 0179.
5. Thông báo `shift_assigned` / "số đối soát khác số ghi lúc giao ca" tới talent — RLS chỉ chính chủ đọc; tài khoản talent
   test không còn gắn hồ sơ talent sau đợt dọn mock.
6. Phiên đã đăng nhập mà thiếu dòng `profiles` trên production (trên replay đã đo: 0 dòng sau `0130`).
7. Nhánh `503 ai_not_configured` đầu-cuối; đợt fetch lúc đăng nhập của role talent/brand.

**Hoãn có chủ đích (có lý do, không phải quên):**
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
  phạm vi khai ở `TAB_CHANNEL_SCOPE` (appNav): `"all"` = Sổ Ca, Hiệu Suất Host, Toàn Cảnh Brand, Lịch +
  Sổ Ca brand — thêm "Tất cả kênh" (agency: `perPlatformBlocks` xếp khối riêng từng sàn; Sổ Ca: số vận hành cộng, GMV/đơn/GMV giờ ghi
  từng sàn); `"one"` = Dashboard agency (23/10: không có "Tất cả" — hiệu suất hai sàn không cộng), Kế Hoạch
  Tháng, Hỗ Trợ Vận Hành và các tab brand còn lại (Dữ Liệu Gốc gồm cả đối soát). State: `agencyChoice/agencySingle`, `brandChoice/brandSingle` →
  `resolveChannelScope` (reportPlatform.ts); URL `?san=tiktok|shopee|tat-ca`. Tab không có nguồn ở một sàn (hồ sơ `hiddenBrandTabs`) chỉ
  ẩn khỏi sidebar khi MỌI kênh của brand đều không có nguồn; thanh sàn chỉ liệt kê sàn hợp lệ cho tab.
  Có URL route (`src/lib/routes.ts`): `/so-ca`, `/brand/crocs/report-thang`…
- **Nguồn sự thật của menu:** `agencyNavGroups()`/`brandNavGroups()` ở [src/lib/appNav.ts](src/lib/appNav.ts). Ảnh chụp (nhóm gộp 18/10):
  - Agency: Dashboard — **Kế hoạch:** Kế Hoạch Tháng · Điều Phối Lịch Live (Bàn Trainer cũ) — **Vận hành hằng ngày:** Bảng Vận Hành (id `calendar`; 2 chế độ "Hôm nay & tuần" /
    "Cả tháng" = Phòng Điều Hành cũ, 24/10; khối Hỗ Trợ Vận Hành cuối trang) · Lịch & Studio (`studio_calendar`) · Sổ Ca (Run-rate gộp vào Dashboard 22/10) — **Phân tích:** Hiệu Suất Host · Toàn Cảnh Brand (gồm phát hành Report
    Tháng, 23/10) — **Nguồn lực & khách hàng:** Talent Pool · Studios & Gear · CRM ("Hợp đồng & giá") · TikTok API — **Quản trị:** Kế Toán (ceo/admin, 23/10) · Finance & P&L (ceo/admin,
    trainer chỉ đọc) · Phân Quyền & Role · AI Training Center (admin). Talent: Ca Của Tôi · Cả Agency · Đăng Ký Ca · Tôi (điện thoại: thanh tab dưới đáy).
  - Brand: Dashboard · Lịch Vận Hành · Sổ Ca — **Kế hoạch & báo cáo:** Kế Hoạch Tháng Sau · Sản phẩm lên live · Report Tháng · Affiliate · Hợp Đồng
    (chỉ đọc) — **Nhập số liệu** (ẩn với role brand): Nhập Ads · Dữ Liệu Gốc.
- **Mã nguồn:** `src/App.tsx` (state + handler + render tab, ~2.000 dòng) · `src/hooks/useWorkspaceData.ts` (mọi lượt nạp
  lúc đăng nhập, gate theo role/tab) · `src/components/*` (mỗi tab một chunk lazy qua `lazyNamed`) · `src/lib/db/*` (đọc/ghi
  Supabase) · `src/lib/{performance,report,scheduling,dataraw,liveSnapshot}` (logic thuần, có test) · `tests/*.test.ts` ·
  `scripts/find-dead-code.mjs` (`npm run audit:dead`).
- **AI:** chỉ còn 1 tính năng — chấm điểm ghép host (`/api/gemini/match-talents`, tab Talent Pool; prompt `talent_matcher`
  sửa ở AI Training Center). Production đã có `GEMINI_API_KEY` (`/api/health` báo `geminiConfigured: true`, 02/10); thiếu key thì 503 `ai_not_configured`, UI nói "chưa bật".
- **Đã gỡ khỏi app (đừng dựng lại bản cũ):** Dashboard KPI dự phóng cũ, Toàn Cảnh Agency, Live Sessions Hub, Module
  Campaign, Price List, Co-Funded Voucher, Hoá Đơn & Công Nợ, AI Script Gen, Simulator, Hội Đồng AI, Workflow Automation
  Rules, Report Tháng Chuyên Sâu riêng (đã gộp), Hỗ Trợ Vận Hành riêng (đã gộp vào Dashboard brand), 3 bảng con của ca, tab Theo kỳ / Sức khoẻ
  của Dashboard (23/10 — thay bằng bộ chọn kỳ + so cùng kỳ), kỳ "Tháng trước"/"Tự chọn" của Dashboard + màn Điều Phối Phát Hành riêng (23/10 tối).

## 4. Luồng dữ liệu

0. **CRM → "Hợp đồng & giá"** (một lần mỗi brand × sàn, chỗ nhập DUY NHẤT): cách thu phí, giá (`brand_platform_rates`), hợp đồng
   (`brand_contracts`; lưu đang hiệu lực ⇒ `generate_contract_commitments` đổ `brand_monthly_commitments` từng tháng), phòng mặc định
   (`brand_studios`). Số riêng của một tháng sửa ở Kế Hoạch Tháng (`upsertMonthlyCommitment`, `is_override` = khác điều khoản hợp đồng).
1. **Kế Hoạch Tháng** (`brand_month_plans` + `_slots`): ops lập lưới ca + target từng ca → **Chốt** (`lock_month_plan`) sinh
   `shift_slots` mở → talent đăng ký rảnh (RLS 0133: chỉ ca còn mở, chưa qua ngày) → ops chốt người qua RPC
   `finalize_shift_slot` (0133: một transaction, khoá dòng slot, từ chối slot không còn mở) ⇒ `live_sessions`. Kế hoạch
   đã chốt: ca đã chốt người không dời/bỏ trong lưới, ca ngày đã qua giữ giờ + target (trigger `trg_guard_locked_plan_slot`);
   **0185:** đổi target ca có sẵn sau chốt chỉ ceo/admin, mọi đổi target tháng sau chốt có dòng `plan_target_audit`; ca kế hoạch huỷ thì Chốt lại
   GIỮ huỷ (chỉ gắn lại khi đã có ca thật thay thế đúng giờ); giờ ca kế hoạch đi theo ca thật (`sync_session_plan_time`, trừ dời sang tháng khác);
   lưu lưới chỉ qua `replace_plan_slots` (KHÔNG `insert … on conflict` trên bảng này — BEFORE INSERT chạy cả với dòng rơi vào conflict, guard coi là thêm ca ngày đã qua);
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
   lại. 10 trang (24/10): Tổng quan & KPI · Toàn shop · Nguyên nhân · Sản phẩm & khuyến mãi · Quảng cáo · Hủy, hoàn & NMV · Host & khung giờ · Affiliate ·
   Tháng sau · Key Metrics (`SECTIONS` ở report/theme.ts). Phát hành
   cho brand qua RPC; brand chỉ thấy số của tháng đã phát hành (view `live_sessions_secure`, 0107). **Phát hành = đóng
   sổ** (0133): chỉ phát hành tháng đã hết; tháng đã phát hành thì mọi ghi số/lịch/người/loại/huỷ/thêm/xoá ca của
   brand-tháng đó bị trigger `trg_guard_published_month_sessions` chặn (trừ vòng đời Upcoming→Completed) — muốn sửa thì
   thu hồi report. Phát hành ở Toàn Cảnh Brand (`useReportPublish`) kiểm độ mới bản chụp trước khi phát hành (cũ ⇒ hỏi cập nhật rồi mới phát hành).
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
- **Thuật ngữ chuẩn (audit 27/10, `tests/uiWording.test.ts` canh):** tải lên / tải lại file (không "up"); chọn / bỏ chọn (không "tick");
  số liệu (không "có số / chưa có số" trơn); Campaign / Daily (không "ngày camp", "ngày thường"); trung bình nhóm (không "mặt bằng", "TB");
  dự báo, xác suất đạt, đạt target (không dự phóng/dự kiến cuối tháng/chạm target); Target luỹ kế (không "cộng dồn"); đúng tiến độ, theo tốc độ
  cùng kỳ (không "nhịp"); chương trình khuyến mãi (không "scheme KM"); P&L (không "lãi/lỗ"); giờ live đã thực hiện, ca đã live (không "đã chạy");
  tăng traffic / tăng ATC / tăng New followers (không đẩy traffic, kéo giỏ, kéo follow); hiệu quả nhất, hiệu suất cao (không bán tốt, giỏi);
  mức thông thường (không "mọi khi"); có chi phí Ads nhưng không phát sinh đơn (không "tiêu tiền mà 0 đơn"); Product CTR cao nhưng CTOR thấp
  (không "bấm nhiều nhưng ít chốt"). Prompt gửi model AI (`server/askData.ts`, `askContext.ts`) không bị canh.
- **Chữ gửi brand (Report Tháng + câu Insight tự sinh, 24/10):** "phiên" (không "ca"), "YFB"/"livestream YFB" (không "agency"), "trung bình các host"
  (không "mặt bằng"), "yếu tố" (không "thừa số"), "campaign" (không "camp"), "các kênh còn lại" (không "phần còn lại"), "Daily" (không "ngày thường"),
  "có ý nghĩa / trong ngưỡng dao động" — KHÔNG BAO GIỜ "vượt biên" (nghĩa khác trong tiếng Việt). Tên kênh/loại ngày theo `CHANNEL`/`DAY_TYPE` (Product card,
  Daily). Ghi chú nội bộ (bản chụp cũ, thiếu file) chỉ hiện cho ops (`canManage`). Màn ops nội bộ vẫn được nói "ca".
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
  Bố cục 18/10 (`tests/layoutCalm.test.ts` canh): `PageHeader` KHÔNG khung (màn mới đừng tự vẽ thẻ tiêu đề); màn "mọi kênh" dựng
  trong `perPlatformBlocks(render, lead?)` + component dùng `PageHeader` (đọc `PlatformBlockContext`); thanh sàn chỉ qua `channelBar()`;
  tab đang chọn = class `seg-on`, accent đặc chỉ cho nút hành động chính (nút lặp từng dòng = nút viền); nhóm sidebar có tiêu đề ≥ 2 mục;
  cảnh báo giống nhau mọi dòng nói một lần ở khối trên; danh sách dùng `divide-y` thay vì hộp viền mỗi dòng; tuần bắt đầu Thứ 2; "Sắp tới" không màu vàng cảnh báo.
  Đợt 2 (19/10): ô số = `StatTile` (`frame` theo nền sau nó: `card`/`box`/`plain`; Report Tháng: `KpiTile`, trong Panel `plain`); không `uppercase` (test đếm toàn app; đầu bảng `text-[11px] font-semibold`, tiêu đề mục `text-xs font-bold`);
  giải thích phương pháp dài gập vào `Explain` / `MethodNote` (Report) — số, kết luận, chú thích màu vẫn hiện; một mốc ("Số đủ tới") nói MỘT chỗ.
  Đợt 3 (19/10): ô ngày lịch (`PosterDayCell`) không viền, chỉ nền; cửa sổ/ngăn kéo gom chỉ số vào MỘT khung (`KV_GRID` SessionWindow); khối con nằm
  trong form đã có khung + tiêu đề bước thì `embedded` (vd `SessionRoomCase`); tiêu đề cửa sổ = thông tin chính (ngày · giờ), không tiêu đề chung.
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
- **Sửa lịch/người của ca = `updateSession(next, base)`** (0178): `base` là bản ca lúc người dùng bắt đầu sửa (form) hoặc bản trong state (kéo
  thẻ) — chỉ trường khác base được ghi (`update_session_fields`), không gửi cả bộ cột từ bản client có thể đã cũ. Danh sách ca tự nạp lại
  (`useWorkspaceData`): mọi lần ghi ca phải đi qua `setSessions` của hook (đánh dấu lần ghi để lượt nạp nền cũ hơn không đè).
- **So với kỳ trước luôn cùng độ dài:** kỳ đang dở (số tới thứ Năm, file shop tới 22/09) ⇒ kỳ trước cắt cùng số ngày; tỷ trọng live/tổng
  shop chia hai số CÙNG khoảng ngày; đợt camp chỉ so khi đã đủ số (`pendingCount === 0`). Trạng thái đợt theo LỊCH + theo SỐ tách riêng
  ("chờ số" ≠ "sắp tới").
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
**Thẻ kênh (21/10):** kết quả tháng của một kênh (tới nay, dự báo cuối tháng, nhãn, nguyên nhân, GMV/giờ cần, xu hướng 5 tháng, dự báo đứng yên
từ ngày nào) CHỈ dựng ở `buildChannelCard` (lib/performance/channelCard.ts), nạp qua `useChannelCards`; Chi tiết kênh vẽ bằng `ChannelCardView`, Dashboard (tab Toàn sàn) vẽ thẻ run-rate (`runrate/AccountCard` với `vm.card`). Component
không tự gọi `landingOf`/`monthOutlook`/`buildChannelRoom`/`pHitOf` ngoài danh sách trong `tests/channelCard.test.ts`. Thang nhãn duy nhất =
`LANDING_LABEL` (24/10: Đạt target / Sát target / Rủi ro / Hụt target), luôn kèm % và nói % gì — một câu duy nhất `accountOverview.landingText`
("Rủi ro · xác suất đạt 23%", "Hụt target · dự báo thiếu ~34%"). **Từ ngữ Dashboard (user duyệt 24/10):** dự báo (không dự phóng/dự kiến), xác suất đạt
(không khả năng chạm), Target luỹ kế, Dữ liệu đầy đủ đến / dữ liệu đến, ca chưa có số liệu, ca đã live, Phân rã GMV/giờ · ngày Daily, Yếu tố giảm mạnh
nhất / Đầu mối xử lý, vượt giới hạn +30%, hiển thị mờ, Nhân sự live, Lên live trễ; không để tên biến/module nội bộ lọt ra chữ hiển thị.
**Tổng quan account (24/10):** dòng = `accountRow(thẻ kênh)`; không tự tính dự báo/giờ bù — "Bù được" = `plan.checkpoint` chưa kẹp, "Không bù kịp" = kẹp +30%.
**So cùng kỳ (23/10):** kỳ + kỳ so sánh chỉ qua `resolvePeriod`; cộng số một khoảng qua `aggregate` (assertOnePlatform); chỉ số so với chính kênh qua
`indexBy`/`channelGph` (KHÔNG chia trung bình sàn); host = `hostRows` (chỉ ca làm host, chia phần khi đổi host), trợ live = `coRows` (chỉ ca + giờ, giờ
đổi để xám); dưới `WEAK_SESSIONS` (5) ca một bên ⇒ mũi tên xám; lệch giờ lên sóng > `LATE_MAX_MIN` (180) không vào % trễ. Bảng tuần/đợt của tab Brand
qua `brandLens.weekRows/waveRows` (cộng đúng target tháng); Key Metrics/đội live theo nút qua `lensScope`. File brand (shop, SKU, ads, khuyến mãi, Shopee
theo ngày) chỉ có số theo THÁNG ⇒ không hiện ở nút Đợt/Ngày/Ca. "Số đủ tới" hiển thị = `shownThroughOf` (không vượt ngày cuối có số).
Ngưỡng giờ/tuần của người = `engineParams.fatigueWeekHours` (bỏ 40h riêng của PĐH). Bản tin brand = `bulletinFromCard`/`bulletinText` (lib/brand/bulletin.ts).
**0180:** Kế Hoạch Tháng gate bằng `manage_month_plan` (DB thiếu key ⇒ suy từ `manage_sessions`); hạn đăng ký theo THÁNG (`signupDeadlineOf` = hạn sớm
hơn giữa tháng và tuần cũ, theo NGÀY của ca); lý do off sớm `EARLY_REASON_LABEL`, client chỉ gửi `p_early_leave_reason` khi có.
**Giờ cam kết (24/10):** đếm GIỜ LIVE THẬT = `liveHoursOf`/`realLiveHoursOf` (brandCommitment.ts; ca chưa có giờ thật tính theo lịch, OT > `OT_MAX_MIN` lấy giờ
lịch, ca nạp bù = giờ lịch); giờ lịch giữ ở `deliveredPlannedHours`. Doanh thu brand theo giờ (pnl.ts, Kế Toán) vẫn theo giờ lịch. **Hao hụt / giờ phòng
hờ** = `shrinkSums`/`channelShrinkage`/`hoursToSchedule` (lib/roster/monthDesk.ts: huỷ + ngắn hơn lịch, 60 ngày, kẹp 3–15%, kênh < 30 giờ dùng TB agency;
CHIA cho 1 − hao hụt). Màn theo tháng của Điều Phối Lịch Live đọc dự báo/khả năng bù từ `accountRow` (một nguồn với Dashboard), dùng `activeSessions`.
**Điều Phối Lịch Live (Bàn Trainer cũ, 13/10):** luật lịch tuần (trùng, quá giờ/tuần, nghỉ sau ca khuya, đổi phòng sát giờ, giờ/ngày, ngày liền, host chưa quen kênh) = `analyzeRoster` (lib/roster/rules.ts); gợi ý người + chi phí ca theo lịch = `rankCandidates` / `plannedCost` (lib/roster/candidates.ts, cùng luật rate của pnl.ts). Không xếp/gợi ý người theo GMV/giờ của host. Nháp chỉ cho ca MỞ; ca đã lên lịch đổi qua RPC có lý do. Bản gọn 25/10: trạng thái tháng = `monthStatus` (thuần, có test), giờ kênh = `channelVerdict` (một câu, phần GMV "không kịp" là việc báo quản lý riêng). Mở ca HÀNG LOẠT phải qua `create_open_slots` / `lock_month_plans` (0181: trigger báo từng ca/kế hoạch im lặng theo cờ `app.quiet_slot_notify`, gửi 1 tin tóm tắt/người) — không insert từng ca từ client.
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
`buildTodos` (lib/todoList.ts) · GMV kỳ vọng của ca / khả năng về đích theo ngày / ca xoay chuyển / ca có thể thêm = `controlRoom.ts` (khả năng = `pHitOf`, đúng công thức `landingOf`; kỳ vọng ca sắp tới ở mọi màn = `ChannelRoom.expectedNowById`, 24/10) · ca "chưa có số" (nhãn đỏ dòng ca, khối Cần xử lý, việc cần làm) = `isUnconfirmedPast` — không cảnh báo thiếu form Giao ca khi ca đã có số (user chốt 25/10) · việc cần làm mới: khai `id` vào `DAY_IDS` (hạn ≤ 48 giờ, mức theo hạn) hoặc một nhóm `MONTH_GROUPS` (todoList.ts), việc mở Bảng Vận Hành dùng `view` (BoardView) chứ không trỏ trơn `tab: "calendar"` · thứ tự host gợi ý = `suggestHosts` / `hostOrder` (một cách xếp cho cửa sổ chốt ca, chốt hàng loạt, sa bàn) · giờ tuần của một người = phút theo lịch của đoạn đứng ca (`peopleLoad` = `suggestHosts.weekHours`) · dự kiến cuối tháng = `projectMonthEnd` /
`MonthOutlook` · trùng lịch = `personClash`/`studioClash` (scheduling/conflicts) · giờ kế hoạch = `sessionDurationHours`, giờ
live = `sessionHours`. GMV/giờ đem NHÂN với giờ lịch thì chia trên giờ kế hoạch; GMV/giờ BÁO CÁO chia trên giờ live. Thước
đo xếp host là **GMV/giờ**, không phải GMV/ca. Cam kết hợp đồng đếm **giờ ca theo lịch** (kể cả ca GMV 0 đã có bằng chứng diễn ra), loại ca huỷ và ca chờ xác nhận.

### 5.6 Luật nghiệp vụ đã chốt
- **Điều khoản hợp tác (31/10):** tiền phí từ brand CHỈ tính qua `lib/commercial/fees.ts` (`sessionFee` từng ca, `settleMonth` cả tháng) — không nơi nào tự nhân giờ × đơn giá khi đã có điều khoản. Điều khoản chọn theo NGÀY qua `resolveTerms` (chiến dịch/gói thử đè điều khoản chính). Thêm kiểu phí mới = thêm biến thể `FeeComponent` + nhánh trong `fees.ts` + ô trong `TermsEditor` (không đổi bảng). Chữ hiển thị tiền đi qua `fmtVndFull/fmtVndShort` (test `uiReadability` chặn "đ", "tr", `toFixed`).
- **Một thẻ kênh (21/10, user chốt cả 4):** (1) một thang nhãn cho mọi màn, kèm %; (2) run-rate trên thẻ chỉ là SỐ — không chữ "Đúng/Chậm tiến
  độ", không tô theo ngưỡng run-rate (22/10 bỏ cả ở thẻ run-rate Dashboard; màu = nhãn khả năng đạt), cuối tháng chỉ một số = dự báo thẻ kênh (backtest 14/10: run-rate ≥ 95% mà khả năng < 50% ⇒ chỉ 17% đạt); (3) kênh < 15 ca lịch sử (engine v3 không
  dựng được) KHÔNG dự báo cuối tháng, chỉ "tới nay"; (4) brand KHÔNG thấy nhãn/xác suất — số trong tháng tới brand chỉ qua bản tin ops gửi (đổi
  quyết định 11/10 "brand thấy khả năng về đích").
- **Dashboard (10/10, user chốt):** (1) **ngày đủ số** = ngày cuối mà ≥ 90% giờ ca đã chạy có số (từ 11/10 run-rate brand/module Run-rate đi tiếp theo từng ca sau mốc này — `runRateLive`) (`channelHealth.dataCoverage`; ngày không có ca không kéo lùi mốc; hôm nay không tính) — run-rate, mũi tên so sánh, KPI đầu màn cắt ở mốc này, không ở "ngày cuối có số bất kỳ"; (2) xem theo tháng thì so **cùng loại ngày** (`matchedPrevDays`/`likeForLike`: ngày thường thứ k ↔ thứ k, đợt camp cùng vị trí; ngày không có cặp thì không so), không so ngày lịch; (3) **mỗi kênh một kết luận** = khả năng đạt (`landingOf`), run-rate chỉ là số phụ; nguyên nhân gốc theo `channelVerdict` (ngưỡng target cao **1,3×** GMV/giờ 28 ngày trước tháng, năng suất ±10%, số chưa về chỉ đứng đầu khi tạm tính ≥ 5% dự phóng); (4) xếp host/trợ chỉ bằng `hostReliability` trong CÙNG kênh — không xếp GMV/giờ thô qua brand (brand giải thích 81% chênh lệch); (5) "Hôm qua/Hôm nay/đang làm" thuộc Bảng Vận Hành, không đưa lại vào màn CEO; (6) brand được thấy tỷ trọng live trong Total GMV (role brand đọc từ bản chụp Report đã phát hành).
- **Đa sàn (07/10, luật cứng):** dữ liệu gốc TikTok và Shopee khác hoàn toàn (file, cột, đơn vị dòng: TikTok một phòng / Shopee một phiên;
  GMV TikTok gồm huỷ/hoàn, Shopee = doanh số đặt). Không gộp parser/kho. **Không cộng, gộp, trung bình hay xếp hạng gộp chỉ số hiệu suất
  giữa hai sàn**; màn xem nhiều kênh đặt khối TikTok | Shopee cạnh nhau. Cộng được: số vận hành (ca, giờ, người, phòng) và tiền agency.
- **Ads (05/10):** nguồn duy nhất = file TikTok Ads theo ngày (`ads_campaign_overview`). ROI = doanh thu gộp ÷ chi phí
  (cùng cách TikTok). Doanh thu gộp tính trước huỷ/hoàn (Franklin T9: 798tr > GMV shop 771tr) ⇒ KHÔNG trình bày như %
  GMV, không cộng vào GMV. **Kế hoạch Ads theo ngày (28/10, 0184):** dán từ file tracking của brand vào `brand_ads_daily` (target +
  thực tế × Live/Product/Creator; actual null = chưa có số). Không lưu cột MTD/runrate của sheet — so target luỹ kế cắt ở ngày
  cuối có số thực (`adsTrackingMonth`). Hai nguồn không cộng nhau: file TikTok Ads = chi phí cả cửa hàng do TikTok xuất; bảng dán = kế hoạch brand.
- **Run-rate chỉ tính bằng `planRunRate`** (28/09): target = Σ target ca của Kế Hoạch Tháng đã chốt (không chia lại khi lịch
  đổi); ca kế hoạch huỷ GIỮ target; ca ngoài kế hoạch target 0; ca thêm vào lưới sau khi chốt nhận target = dự báo. **Ca tăng cường (0165, 10/10):** ca OP mở thêm sau chốt có dòng ở `plan_boost_slots` với target đề xuất của engine, KHÔNG cộng vào target tháng/run-rate — mọi chỗ cộng target tháng chỉ đọc `brand_month_plan_slots`, đừng đưa bảng boost vào đó. **Từ 27/10:** ca tăng cường mang target đề xuất trên `LiveSession.targetGmv` kèm cờ `boostTarget` (để hiện) ⇒ MỌI phép cộng target ca (ngày/kỳ/tháng/run-rate, bản chụp report brand) đọc `planTargetOf(s)`, không đọc thẳng `targetGmv` (`tests/noCrossPlatformPerf` canh cả `planTargetOf`); target tạm do DB tính lúc tạo ca (0186), engine thay khi mở Kế Hoạch Tháng. **Ngoại lệ do user chủ động "Chia lại theo lịch hiện có" (0164, 10/10):** ca huỷ về 0, ca OP thêm (kể cả đã qua) vào kế hoạch, Σ target = target mới.
- **Report Tháng là nơi DUY NHẤT nói số một tháng SAU khi hết tháng** (đọc bản chụp; so cùng kỳ cắt 1..N khi tháng chưa hết).
- **Trang/khối theo PHẠM VI DỊCH VỤ, không theo "có file"** (0190): mảng YFB không làm (Ads, Affiliate) hay brand tự live đọc `reportScopeOf(rates, brand, sàn)` (tự live KHÔNG bỏ nhóm đối chứng — phía livestream là phiên YFB, phía còn lại đã trừ cả Seller LIVE; số lấy Seller LIVE cả tài khoản như Direct/Indirect thì ẩn); trang/khối/Insight mới thuộc Ads/Affiliate/nhóm đối chứng phải tôn trọng `scope`. Phạm vi đọc sống từ CRM, không lưu vào bản chụp.
  Dashboard brand là màn TRONG tháng, dùng chung hàm. Phân tích mới thì thêm vào 1 trong 10 trang, không dựng trang riêng.
- **Chốt tháng (27/10):** hạn chốt = ngày 3 tháng sau (`closeDeadline`); độ phủ file đếm từ ngày có ca đầu tiên của kênh (`firstDueDay`); file toàn shop
  (`SHOP_FILE`: TikTok Shop Analytics, Shopee theo ngày) đã tải mà thiếu ngày ⇒ `publishBlocker` chặn phát hành — chưa tải gì thì được (bản chỉ livestream,
  trang toàn shop tự ẩn với brand). Nút Phát hành mới phải gọi `publishBlocker`. Tỷ lệ gộp (% target, ROAS, GMV/giờ) chỉ trên phần tử có đủ tử lẫn mẫu.
- **Action plan (27/10):** chỉ tiêu tự chấm = một Key Metric (`KEY_METRICS`) hoặc % Target, phạm vi Cả tháng / một loại ngày, ≥/≤ ngưỡng; chấm bằng
  bộ số của report tháng SAU (`actionCtx`: `liveCurStats` + `campDetailRows`, target Kế Hoạch Tháng đã chốt). Tháng chấm còn dở (`cmp.partial`) ⇒ chỉ
  "Đang theo dõi", không Đạt/Chưa đạt; % Target giữa tháng không nói đang đạt hay không. Phạm vi không có phiên ⇒ "Không có số" (không phải Chưa đạt).
  Việc không đo bằng số ⇒ ops chấm ở report tháng sau, ghi ngược vào `items[].manual` của dòng tháng viết plan. Tiền in đủ số (`fmtVndFull`).
- **Report gửi brand (24/10):** mọi % thay đổi theo loại ngày / khung giờ / Key Metrics chỉ tô màu khi vượt **ngưỡng dao động** `noiseBand`
  (1,96 × 26% × √(1/n₁+1/n₂), `SESSION_CV` ở brandReport.ts) — dưới ngưỡng ghi "trong ngưỡng dao động"; giờ live không đánh giá tốt/xấu. Mọi phép so có
  dùng file shop đi qua `shopCompareWindow` (cắt cả hai tháng tới ngày cuối file shop); Key Metrics chỉ đọc số phiên nên chỉ cắt khi số PHIÊN còn dở.
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
  **Giờ thực ca đối soát (0189, 28/10, ĐÃ CHẠY 28/10):** ca có phần của phiên bị chia thì `actual_start_at/end_at` kẹp vào [giờ vào ca, `session_boundary_at`] (ca nhận trọn phiên giữ giờ phiên); migration cũng sửa ~440 ca cũ (đo 28/10: 31% ca có giờ thực dài hơn khung ca, TB +252'). Tiền/lương không đổi. Test: `supabase/tests/0189_recon_actual_time_clamped.sql` (xanh trên replay cả chuỗi). **28/10 nạp tỷ lệ Working File (user duyệt):** 154 ca / ~70 phiên nhiều-ca nạp bằng `set_recon_gmv_override` (số = GMV file × tỷ lệ sheet, tổng phiên = file) rồi Áp Dụng Lại 8 lô theo thứ tự áp dụng cũ (VERA TikTok ×4, VERA Shopee, CROCS ×2, Franklin); ~279 triệu GMV đổi ca, tổng brand×sàn×tháng không đổi. 68 ca đã có override tay từ 23/10 (28 dòng) KHÔNG bị ghi đè. Số Working File thấp hơn app 4–36% (gõ lúc hết ca) ⇒ chỉ dùng làm TỶ LỆ. Đo 28/10 cùng đợt: ~93% ca nhiều-ca chia theo giờ (DB chỉ 35 snapshot); rổ 'chưa gán' = 3,4% GMV, phần lớn live ngoài lịch.
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
| `## Report Tháng giai đoạn 1: mỗi trang một màn (2026-10-28)` | thanh trang + hash `#mr-id`, hàng ≤4 ô chỉ số + huy hiệu %, tiêu đề kết luận (`pageHeadlines.ts`), `showAll` cho file xuất |
| `## Report Tháng giai đoạn 2: biểu đồ/bảng theo demo T10` | Cầu Target/traffic×CVR×AOV, GMV/giờ kế hoạch, bảng dọc loại ngày, scatter SKU + ảnh SKU (section_notes), scatter cặp host |
| **Report Tháng dựng lại 1:1 theo demo chốt (28/10, đã commit 9bb4c33…970a693, đẩy main)** | `report/demo.css` (CSS demo, mọi selector tiền tố `.rt`) + `report/demoCharts.ts` (hàm SVG/bảng của demo, trả chuỗi HTML — không tự chỉnh, đổi giao diện thì đổi demo trước); trang dựng bằng `DemoBlocks/DemoShopWhy/DemoSummaryPages/ProductsPage/HostPage`, `PageHead`/`PageInsight` trong `ui.tsx` xuất markup demo. Action plan: `ActionItem` có Deadline/Status/PIC/Note/`autoKey` (jsonb `action_plan`, không migration); bảng "Đánh giá lại" (`ActionResultsPanel`) và "Việc tháng sau" (`ActionPlanPanel`) dùng chung `ActionEditor`, cột Kết quả tự điền từ Ads theo ngày / Affiliate / Shop Analytics / dự báo LIVE. Mục 1–2 trang Kế hoạch tháng sau đọc Kế Hoạch Tháng + tab Affiliate (ô nhập tay chỉ để tính thử). T9 CROCS đã có 8 việc. Còn lại: file xuất HTML (`exportStandaloneHtml.ts`, `BrandMonthlyReport.tsx`) chưa commit; thanh trang vẫn là hàng tab ngang (demo là cột trái) |
| `## Affiliate: gộp đoạn restart của một phiên (2026-10-28)` | `mergeRestartSessions` (nghỉ ≤ 30 phút, cùng creator, cùng ngày), test, gộp tay Khói 9/10 CROCS T10, bản sao trước khi gộp |
| `## Audit + sửa Kế Hoạch Tháng (2026-10-27/28)` | 12 điểm gãy, số đo DB thật T10 (ca huỷ, ca lệch giờ, ca ngoài kế hoạch), mô phỏng; bẫy upsert + BEFORE INSERT; SQL 21 mục |
| `## Điều Phối Lịch Live bản gọn đợt 1–2 (2026-10-25)` | 1 màn + thẻ tháng + việc có nút; trình mở tháng 3 bước; 0181 thông báo hàng loạt (34 ca ≈ 900 tin); thử DB thật tới bước 3 (525 ca) |
| `## Điều Phối Lịch Live — vì sao khó dùng (2026-10-24)` | đếm màn/nút/chữ, luồng chưa ai đi (94% ca T10 nạp từ Sheet), tuần lặp 20% giờ/5% host, đề xuất 1 màn + 4 quyết định |
| `## Điều Phối Lịch Live — audit (2026-10-24)` + `… đợt 1 (2026-10-24)` + `… đợt 2 (2026-10-24)` | audit: hao hụt theo kênh, ca tắt sớm = ca yếu · đợt 1: giờ live thật cho cam kết, verify tab 3100 nạp code 3102 · đợt 2: 0180, SQL 21 mục |
| `## §1 mục 24/10 Dashboard + Report Tháng (chuyển khỏi WORKSPACE 25/10)` | nguyên văn 2 mục §1 ngày 24/10 trước khi rút gọn |
| `## Bảng Vận Hành theo audit (2026-10-25)` | những gì đã đổi theo 3 quyết định, chỗ khác demo có chủ đích, cách verify trên app thật |
| `## Audit Bảng Vận Hành (2026-10-24)` | số đo nhãn giả, hàng đợi ẩn, 31 việc, lặp trên một màn, tốc độ Cả tháng, chuẩn ngoài, 3 quyết định chờ |
| `## Gộp Phòng Điều Hành vào Bảng Vận Hành (2026-10-24)` | 4 chỗ trùng đã gộp, chỗ còn khác nhau có chủ đích, cách verify trên app thật, việc còn mở |
| `## §1 mục 23/10 audit trùng màn + Kế Toán K1 (chuyển khỏi WORKSPACE 24/10)` | nguyên văn hai mục §1 ngày 23/10 trước khi rút gọn |
| `## §1 mục 07–16/10 (chuyển khỏi WORKSPACE 24/10)` | nguyên văn 3 mục §1 (13–16/10, 10–11/10, 07–09/10) trước khi gộp thành một dòng |
| `## Dashboard Tổng quan account (2026-10-24)` | tab mới mọi account, nguồn số từ thẻ kênh, bộ từ ngữ cũ → mới, chuyển 4 khối sang Hiệu Suất Host, số đo app thật, cách verify |
| `## §1 mục 23/10 Dashboard so cùng kỳ (chuyển khỏi WORKSPACE 24/10)` | nguyên văn §1: Dashboard 2 tab so cùng kỳ, gộp Chi tiết kênh, bỏ/thêm khối theo demo |
| `## Report Tháng 10 trang (2026-10-24)` | cấu trúc 10 trang, lỗi đối chứng (−38%/−51% → −15%/−36%), ngưỡng dao động, bộ từ brand, cách verify, việc còn mở |
| `## Audit Report Tháng trên dữ liệu thật (2026-10-27)` + `## Report Tháng: sửa 7 lỗi + Chốt tháng (2026-10-27)` | số đo audit (1/22 phát hành, Affiliate 117,7% vs 36%); A sửa lỗi + B Chốt tháng: file, verify, việc còn mở |
| `## §1 mục 17–19/10 (chuyển khỏi WORKSPACE 24/10)` | nguyên văn §1: bố cục 18–19/10 (3 đợt, số trước/sau) + audit toàn app 17/10 (0178, cách verify) |
| `## Audit trùng màn (2026-10-23)` | đếm cửa trùng (chốt người 6, mở ca 5, tải người 4, host 6, việc cần làm 5, cam kết 4), quyết định user, 3 sửa đợt 3 + cách verify, việc còn mở |
| `## Dashboard so cùng kỳ (2026-10-23)` + `## §1 mục 21–22/10 Dashboard (chuyển khỏi WORKSPACE 23/10)` | luật lấy từ audit demo (2 mốc cắt, chỉ số so chính kênh, trễ > 3 tiếng, chia target chưa xếp, host/trợ), số đo app thật 23/10, những gì bỏ so với 3 tab cũ; nguyên văn §1 21–22/10 |
| `## Dashboard "một thẻ kênh" (2026-10-21)` | 9 mâu thuẫn đo trên app thật, độ dài từng màn, xu hướng 5 tháng, sổ dự báo, 4 quyết định, vá quyền brand (0179) + bộ kiểm |
| `## §1 mục 16–17/10 brand workspace (chuyển khỏi WORKSPACE 21/10)` | nguyên văn: số đo brand workspace, lỗ quyền role brand, cách giả lập role brand có che số |
| `## Sắp lại bố cục đợt 2: ô KPI, Report Tháng, AI Training (2026-10-19)` + mục ngay sau `## Dọn nốt chữ viết hoa bằng CSS: 61 → 14 chỗ (2026-10-19)` | script đo dán được (thêm chữ viết hoa + độ sâu lồng hộp), số trước/sau, StatTile/Explain/MethodNote; đợt 2b: từng màn trước/sau, 14 chỗ giữ cố ý + lý do, test đếm toàn app |
| `## §1 mục 17/10 (chuyển khỏi WORKSPACE 19/10)` | nguyên văn mục §1 audit toàn app theo sidebar 17/10 trước khi rút gọn |
| `## Sắp lại bố cục đợt 3: cửa sổ ca, chốt người, lịch brand, Bàn Trainer (2026-10-19)` | giả lập vai talent/brand chặn ghi (cách làm), số trước/sau 5 màn, cửa sổ chốt người kiểm bằng render (DB 0 ca mở) |
| `## Sắp lại bố cục cho bớt rối (2026-10-18)` | cách đo độ rối (hộp, hộp lồng, nhãn, nút vàng đặc, dòng giải thích), 5 lỗi chung + lỗi từng màn, đã sửa gì, bảng số trước/sau, thứ cố ý không đổi |
| `## §1 các đợt 13–16/10 (chuyển khỏi WORKSPACE 18/10)` | nguyên văn §1 cũ: app talent bản 2 (0177), audit Dashboard 14/10, Bàn Trainer (0175/0176), đối soát theo mốc + gõ GMV ca (0171–0174) |
| `## §1 các đợt 10–11/10 (chuyển khỏi WORKSPACE 17/10)` | nguyên văn §1 cũ: Phòng Điều Hành 0170, run-rate theo ca, 0163–0169, module Run-rate, Dashboard đợt 1, bố cục 10/10 — kèm cách verify |
| `## Audit toàn app theo sidebar (2026-10-17)` | từng module: lỗi tìm thấy (số trên app thật) → cách sửa → cách verify; 0178 (sửa ca theo trường, đóng ca, quyền theo đoạn, nhắc giao ca, `live_evidence`) |
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
