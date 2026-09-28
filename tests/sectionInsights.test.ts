// Khung Insight từng phần của Report Tháng — số mẫu lấy từ CROCS thật (T8/T9 2026), đo lúc build 2026-09-26.
import { expect, test } from "vitest";
import type { CampCompareRow, ChannelMix, LiveStats, SkuMoves } from "../src/lib/report/monthlyReportInsights";
import {
  contextInsight,
  hostVsPeer,
  insightToText,
  parseInsightText,
  peopleInsight,
  productsInsight,
  sectionNextSteps,
  shopInsight,
  shortSku,
  whyInsight
} from "../src/lib/report/sectionInsights";

const stats = (gmv: number, hours: number, views: number, extra: Partial<LiveStats> = {}): LiveStats => ({
  sessions: 1, gmv, hours, views, orders: 1, skuOrders: 1, itemsSold: 1, productImpressions: 1, productClicks: 1,
  gmvPerHour: gmv / hours, viewsPerHour: views / hours, gmvPerView: gmv / views, ctr: null, ctor: null, aov: null,
  upt: null, pricePerItem: null, liveCtr: null, ...extra
});

test("văn bản Insight: dòng đầu kết luận, dòng '→' là việc cần làm — đi 2 chiều không mất gì", () => {
  const i = { headline: "Kết luận.", points: ["Số 1.", "Số 2."], action: "Làm X." };
  expect(parseInsightText(insightToText(i))).toEqual(i);
  expect(parseInsightText("- Kết luận\n• chứng minh\n→ việc")).toEqual({ headline: "Kết luận", points: ["chứng minh"], action: "việc" });
  expect(parseInsightText("  \n ")).toBeNull();
});

test("Vì sao — CROCS 1–22/09 vs 1–22/08: tiêu đề là nhóm ngày kéo kết quả (thừa số đã ở Kết luận), không phải do lịch camp", () => {
  const t8 = stats(4_309_000_000, 153.6, 526_400, { liveCtr: 55.98, ctor: 1.35, upt: 1.2, aov: 1_084_000 });
  const t9 = stats(3_517_000_000, 177.8, 496_400, { liveCtr: 52.43, ctor: 1.18, upt: 1.06, aov: 1_146_000 });
  const g = (key: "daily" | "camp", a: number, b: number) => ({ key, prev: stats(a * 10, 10, 1000), cur: stats(b * 10, 10, 1000) });
  const w = whyInsight(t8, t9, {
    groups: [g("daily", 28_800_000, 17_900_000), g("camp", 27_300_000, 22_100_000)],
    mixRate: { delta: -8_300_000, mix: -100_000, rate: -8_200_000 }
  })!;
  expect(w.headline).toBe("Hụt dồn vào ngày thường: GMV/giờ ngày thường −38%, ngày camp −19%.");
  expect(w.points[0]).toBe("GMV/giờ −29%: Views/giờ −19%, LIVE CTR −6%, CTOR −13%, AOV +6% — cả traffic lẫn chuyển đổi cùng giảm.");
  expect(w.points[1]).toMatch(/^Không phải do lịch camp: cơ cấu giờ live giữa các loại ngày chỉ giải thích −100K\/giờ, hiệu suất trong từng loại ngày −8,2M\/giờ\.$/);
  // Quà tặng đã ở Kết luận + bảng Xu hướng — không nhắc lần ba.
  expect(w.points.join("\n")).not.toMatch(/Quà tặng/);
  // Bước yếu nhất theo %: Views/giờ −19% ⇒ traffic (không còn "giỏ hàng/UPT" — UPT đổi theo quà tặng).
  expect(w.action).toMatch(/traffic/);
});

test("Vì sao — CROCS T8 vs T7: chuyển đổi kéo lên, traffic bù một phần; thiếu Views ⇒ không bịa", () => {
  const t7 = stats(5_187_000_000, 213.6, 724_500, { liveCtr: 54.16, ctor: 1.23, aov: 1_072_000 });
  const t8 = stats(5_885_000_000, 228.6, 725_100, { liveCtr: 56.28, ctor: 1.31, aov: 1_104_000 });
  const w = whyInsight(t7, t8)!;
  expect(w.headline).toContain("chuyển đổi kéo lên, traffic bù một phần");
  // Hai nhóm ngày lệch < 10 điểm ⇒ tiêu đề vẫn là dòng thừa số, nhóm ngày xuống gạch đầu dòng.
  const g = (key: "daily" | "camp", a: number, b: number) => ({ key, prev: stats(a * 10, 10, 1000), cur: stats(b * 10, 10, 1000) });
  const close = whyInsight(t7, t8, { groups: [g("daily", 24_000_000, 25_000_000), g("camp", 26_000_000, 27_500_000)] })!;
  expect(close.headline).toBe(w.headline);
  expect(close.points[0]).toMatch(/^Ngày thường: 24M → 25M\/giờ/);
  expect(w.points).toEqual([]);
  expect(whyInsight(t7, { ...t8, viewsPerHour: null, gmvPerView: null })).toBeNull();
});

test("Người — so mặt bằng cùng loại ngày: host bán ngày thường tốt hơn host chỉ live D-Day dù GMV/giờ thô thấp hơn", () => {
  const hosts = [
    { name: "Camp", gmv: 300, hours: 10, byBucket: { dday: { gmv: 300, hours: 10 } } },
    { name: "Thường", gmv: 200, hours: 10, byBucket: { daily: { gmv: 200, hours: 10 } } },
    { name: "Thường 2", gmv: 100, hours: 10, byBucket: { daily: { gmv: 100, hours: 10 } } }
  ];
  const p = Object.fromEntries(hostVsPeer(hosts).map((x) => [x.name, x]));
  expect(p["Camp"].gmvPerHour).toBeGreaterThan(p["Thường"].gmvPerHour!);
  expect(p["Camp"].vsPeer).toBeCloseTo(0); // D-Day chỉ có mình host này ⇒ bằng mặt bằng
  expect(p["Thường"].vsPeer).toBeCloseTo(33.33, 1); // ngày thường mặt bằng 15/giờ, bán 20/giờ
  expect(p["Thường 2"].gap).toBeCloseTo(-50);
});

test("Người — chỉ nêu tên khi so mặt bằng 4 tháng chắc chắn; còn lại ghi 'chưa đủ ca để kết luận'", () => {
  const mk = (name: string, gmv: number, hours: number) => ({ name, gmv, hours, byBucket: { daily: { gmv, hours } } });
  const hosts = [mk("Hùng", 1_710_000_000, 66.5), mk("Thy", 170_000_000, 11.3), mk("Phú", 300_000_000, 15), mk("An", 90_000_000, 5)];
  // Số thật CROCS T6–T9 (đo 2026-09-26): Hùng 59 ca, khoảng 1,02–1,23; Thy tháng này −24% nhưng 4 tháng cắt qua 1.
  const rel = [
    { key: "h", name: "Hùng", sessions: 59, ratio: 1.11, lo: 1.02, hi: 1.23, verdict: "above" as const },
    { key: "t", name: "Thy", sessions: 7, ratio: 1.02, lo: 0.84, hi: 1.2, verdict: "unclear" as const },
    { key: "p", name: "Phú", sessions: 18, ratio: 0.95, lo: 0.86, hi: 1.04, verdict: "unclear" as const },
    { key: "a", name: "An", sessions: 2, ratio: 0.83, lo: null, hi: null, verdict: "unclear" as const }
  ];
  const i = peopleInsight(hosts, rel)!;
  expect(i.headline).toBe("Hùng dẫn đầu GMV (1,71B, 75% tổng host); là host duy nhất vượt mặt bằng với khoảng tin cậy 95% nằm hẳn trên mặt bằng (59 ca): +11% (+2% … +23%).");
  // Cận dưới sát mặt bằng ⇒ nói rõ là kết luận yếu (số thật CROCS sau khi dùng phân phối t: +0,0% … +23%).
  expect(peopleInsight(hosts, [{ ...rel[0], lo: 1.0003 }, ...rel.slice(1)])!.headline).toMatch(/\+11% \(\+0,0% … \+23%\) — sát ngưỡng, cần thêm tháng để chắc\.$/);
  expect(i.points).toEqual(["3 host còn lại: khoảng tin cậy còn cắt qua mặt bằng — chưa đủ ca để kết luận hơn hay kém."]);
  expect(i.points.join(" ")).not.toContain("Thy");
  expect(i.action).toBeNull(); // Hùng live nhiều giờ nhất ⇒ không gợi ý thêm ca
  // Host dưới mặt bằng chắc chắn ⇒ nêu tên + việc cần làm.
  const j = peopleInsight(hosts, [...rel.slice(0, 1), { ...rel[2], lo: 0.8, hi: 0.93, ratio: 0.86, verdict: "below" as const }])!;
  expect(j.points[0]).toBe("Phú: dưới mặt bằng −14% (−20% … −7%) qua 18 ca.");
  expect(j.action).toMatch(/^Xem lại khung ca và nhóm SKU của Phú/);
  expect(peopleInsight([mk("Một mình", 100, 5)])).toBeNull();
});

test("Hàng — SKU dẫn đầu giảm mạnh: nêu ở kết luận, không lặp ở 'Đi xuống', vẫn là việc cần làm; bắt SKU bấm nhiều chốt ít", () => {
  const row = (name: string, rank: number, prevRank: number | null, gmv: number, gmvChange: number | null, ctr: number, ctor: number) => ({
    name, rank, prevRank, gmv, prevGmv: null, gmvChange, gmvLive: gmv / 2, orders: 1, itemsSold: 1, ctr, ctor
  });
  const skus: SkuMoves = {
    rows: [
      row("Baya Platform - Winter White - 208186-11S", 1, 1, 490_900_000, -32.3, 3.0, 1.21),
      row("Classic - Bone - 10001-2Y2", 2, 2, 298_800_000, -12.4, 4.27, 1.0),
      row("Classic - Atmosphere - 10001-1FT", 3, 3, 247_400_000, 1.5, 4.3, 0.87),
      row("Baya - White - 10126-100", 4, 4, 225_300_000, 1.6, 4.1, 0.85),
      row("Bayaband - White - 205089-126", 5, 20, 170_200_000, 78.4, 3.36, 1.39),
      row("Baya Platform - Barely Pink - 208186-6PI", 6, 3, 151_300_000, -28.4, 2.85, 0.98),
      row("Classic - White - 10001-100", 7, 5, 219_300_000, 0.1, 3.99, 1.04),
      row("Bayaband - Winter White - 205089-1LI", 8, 13, 217_600_000, 71.9, 4.35, 1.29),
      row("Platform Classic - Bone - 206750-2Y2", 9, 9, 195_000_000, -3, 3.29, 1.05),
      row("Bella - Winter White - 210062-11S", 10, 6, 180_400_000, -15.2, 3.16, 1.23)
    ],
    perDay: true,
    curDays: 22,
    prevDays: 31,
    prevLimit: 30
  };
  const i = productsInsight(skus, { name: "[Double day 7-9.9] VC 10% bill 900K", gmv: 570_000_000, orders: 559 })!;
  expect(i.headline).toMatch(/^Baya Platform - Winter White giữ hạng 1 \(.*GMV mỗi ngày −32%\)/);
  const down = i.points.find((l) => l.startsWith("Đi xuống"))!;
  expect(down).not.toContain("Baya Platform - Winter White");
  expect(down).toContain("Baya Platform - Barely Pink (3 → 6");
  expect(i.points.find((l) => l.startsWith("Lên hạng"))).toContain("Bayaband - White (20 → 5");
  expect(i.points.some((l) => /^Baya - White được bấm nhiều/.test(l))).toBe(true);
  expect(i.action).toMatch(/^Rà Baya Platform - Winter White/);
  expect(productsInsight(null, null)).toBeNull();
  expect(shortSku("Classic - Bone - 10001-2Y2")).toBe("Classic - Bone");
  expect(shortSku("Túi vải")).toBe("Túi vải");
});

test("Toàn shop — CROCS 1–22/09 vs cùng kỳ 1–22/08: tỷ trọng cùng kỳ, không nêu Seller LIVE cạnh tỷ trọng agency", () => {
  const mix = (month: string, shopGmv: number, liveLinked: number, affiliate: number, video: number, refunds: number): ChannelMix => ({
    month, shopGmv, liveLinked, affiliate, video, card: shopGmv - liveLinked - affiliate - video, coverage: 100, refundRate: (refunds / shopGmv) * 100
  });
  const shop = (gmv: number) => ({ gmv, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0, days: 22, through: null });
  // Shop Analytics thật cắt 1–22 (bản chụp CROCS T9, đo 2026-09-29) + LIVE GMV từ ca cùng kỳ.
  const input = {
    months: ["2026-08", "2026-09"],
    mixes: [mix("2026-08", 6_748_363_789, 4_272_482_378, 863_731_259, 384_126_606, 1_003_838_438), mix("2026-09", 5_207_099_451, 3_624_809_178, 354_174_072, 289_099_841, 813_125_407)],
    agencyGmv: [4_309_000_000, 3_517_000_000],
    labels: ["1–22/08", "1–22/09"],
    shopCur: shop(5_207_099_451),
    shopPrev: shop(6_748_363_789),
    windowLabel: "1–22/09 so với 1–22/08"
  };
  const i = shopInsight(input)!;
  expect(i.headline).toContain("agency live chiếm 67,5% (1–22/08: 63,9%)");
  // Trước đây so với T8 TRỌN tháng: −4,2 điểm.
  expect(i.points).toContain("Affiliate LIVE: 12,8% → 6,8% tổng shop (−6 điểm).");
  expect(i.points.join("\n")).not.toMatch(/Seller LIVE/);
  expect(i.action).toMatch(/Affiliate LIVE/);

  // Có nhóm đối chứng: câu ngày thường đã ở Kết luận ⇒ tiêu đề là ngày camp, Total GMV lùi xuống.
  const row = (key: "daily" | "camp" | "all", liveChg: number, restChg: number) => ({
    key, days: 1, liveCur: 1, livePrev: 1, shopLiveCur: 1, shopLivePrev: 1, restCur: 1, restPrev: 1, visitorsCur: 1, visitorsPrev: 1,
    cvrCur: null, cvrPrev: null, liveChg, restChg, visitorsChg: -4
  });
  const c = shopInsight({ ...input, control: [row("daily", -22.7, 1), row("camp", -13.6, -69), row("all", -18.4, -36)] })!;
  expect(c.headline).toBe("Ngày camp: live agency −14%, phần còn lại −69% ⇒ thị trường giảm mạnh hơn, agency giữ tốt hơn.");
  expect(c.headline).not.toMatch(/ngày thường/i);
  expect(c.points[0]).toMatch(/^Total GMV 5,21B/);
});

test("Bối cảnh — đếm khung camp tăng/giảm cùng khung tháng trước, bỏ khung chưa chạy; việc cần làm là khung tụt GMV/giờ mạnh nhất", () => {
  const camp = (key: CampCompareRow["key"], cur: [number, number], prev: [number, number]): CampCompareRow => ({
    key,
    cur: { ...stats(cur[0] || 1, cur[1] || 1, 1), gmv: cur[0], sessions: cur[0] ? 3 : 0, gmvPerHour: cur[1] ? cur[0] / cur[1] : null },
    prev: { ...stats(prev[0], prev[1], 1), sessions: 3 },
    target: null
  });
  const i = contextInsight(
    [camp("dday", [968_200_000, 36.5], [1_172_000_000, 37.5]), camp("midmonth", [790_900_000, 43], [863_000_000, 37]), camp("payday", [0, 0], [985_800_000, 42.9]), camp("daily", [1_760_000_000, 98.3], [2_270_000_000, 79.3])],
    [
      { label: "Sáng (trước 12h)", cur: { n: 18, gmvPerHour: 19_500_000 }, prev: { n: 14, gmvPerHour: 27_900_000 } },
      { label: "Tối (từ 17h)", cur: { n: 22, gmvPerHour: 20_500_000 }, prev: { n: 23, gmvPerHour: 28_100_000 } }
    ]
  )!;
  expect(i.headline).toBe("Daily −22,5% GMV so với cùng kỳ tháng trước; 0/2 khung Campaign đã chạy tăng GMV so với cùng khung tháng trước.");
  // Không đọc lại từng dòng bảng Campaign — chỉ còn câu khung giờ.
  expect(i.points).toEqual(["Khung giờ bắt đầu ca: tối (từ 17h) bán tốt nhất (20,5M/giờ), sáng (trước 12h) thấp nhất (19,5M/giờ, 18 ca)."]);
  expect(i.action).toMatch(/^Xem lại cách chạy Daily: GMV\/giờ −37%/);
});

test("Việc cần làm của các phần gom về phần 7, bỏ việc autoNextSteps đã nói", () => {
  const ins = (action: string | null) => ({ headline: "x", points: [], action });
  const all = {
    shop: ins("Ngày thường hụt vì vận hành live, không phải thị trường — xem phần Vì sao để biết thừa số nào tụt và sửa ở lịch tháng sau."),
    why: ins("Điểm nghẽn ở traffic — rà khung giờ live, ảnh bìa/tiêu đề phiên và ngân sách đẩy live."),
    products: ins("Rà Baya Platform - Winter White: tồn kho, giá và thời lượng giới thiệu trên live (GMV mỗi ngày −32%)."),
    people: ins(null),
    context: ins("Xem lại cách chạy Daily: GMV/giờ −38% so với cùng kỳ tháng trước.")
  };
  // CROCS T9: ngày thường hụt do vận hành ⇒ chỉ còn việc về SKU.
  expect(sectionNextSteps(all, "daily")).toEqual(["Rà Baya Platform - Winter White: tồn kho, giá và thời lượng giới thiệu trên live (GMV mỗi ngày −32%)."]);
  // Không có nhóm hụt do vận hành ⇒ việc Daily + việc của phần 2 (vd affiliate) là việc mới.
  const noOps = sectionNextSteps({ ...all, shop: ins("Tỷ trọng Affiliate LIVE giảm — rà lịch creator và gói hỗ trợ affiliate cho tháng sau.") }, null);
  expect(noOps).toHaveLength(3);
  expect(noOps.join("\n")).not.toMatch(/traffic/);
});
