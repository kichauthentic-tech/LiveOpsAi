// Benchmark theo ca (01/11/2026) — lib/performance/shiftBenchmark.ts. Chạy: npx vitest run tests/shiftBenchmark.test.ts
import { describe, expect, test } from "vitest";
import { adsHistoryOf, adviseAds, findHandoverSource, funnelChain, subtractHandover, benchAt, benchBandOf, benchZone, buildShiftBenchmark, checkShift, isBenchHistory, MIN_BENCH_N } from "../src/lib/performance/shiftBenchmark";
import type { LiveSession } from "../src/types";

let seq = 0;
function ca(extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "h", hostName: "H", assistantName: "", coHostName: "", platform: "TikTok", date: "2026-10-01", startTime: "20:00", endTime: "23:00",
    status: "Completed", targetGmv: 0, actualGmv: 10_000_000 + seq * 100_000, totalOrders: 10 + (seq % 5), avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 5_000, impressions: 100_000, productClicks: 2_000, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 120, ...extra
  } as LiveSession;
}
const many = (n: number, extra: Partial<LiveSession> = {}) => Array.from({ length: n }, () => ca(extra));

describe("benchBandOf", () => {
  test("khung giờ theo giờ bắt đầu", () => {
    expect(["09:00", "12:00", "18:00", "22:30"].map(benchBandOf)).toEqual(["Sáng", "Chiều", "Tối", "Khuya"]);
  });
});

describe("isBenchHistory", () => {
  test("loại ca chưa xong, bị loại khỏi báo cáo, không doanh thu, ngắn hơn 1 giờ", () => {
    expect(isBenchHistory(ca())).toBe(true);
    expect(isBenchHistory(ca({ status: "Upcoming" }))).toBe(false);
    expect(isBenchHistory(ca({ excludedFromReports: true }))).toBe(false);
    expect(isBenchHistory(ca({ actualGmv: 0 }))).toBe(false);
    expect(isBenchHistory(ca({ liveDurationMinutes: 45 }))).toBe(false);
    expect(isBenchHistory(ca({ liveDurationMinutes: undefined }))).toBe(false);
  });
});

describe("buildShiftBenchmark", () => {
  test("null khi chưa đủ ca", () => {
    expect(buildShiftBenchmark(many(MIN_BENCH_N - 1), "crocs", "TikTok", "Tối")).toBeNull();
  });
  test("phân vị tăng dần và có đủ phễu TikTok 4 bậc, 3 tỷ lệ", () => {
    const b = buildShiftBenchmark(many(60), "crocs", "TikTok", "Tối")!;
    expect(b.scope).toBe("band");
    expect(b.funnel.map((x) => x.key)).toEqual(["imp", "views", "clicks", "orders"]);
    expect(b.rates.map((x) => x.key)).toEqual(["err", "liveCtr", "ctor"]);
    for (const it of [...b.funnel, ...b.rates, ...b.outcomes]) expect(it.p15 <= it.p40 && it.p40 <= it.p75).toBe(true);
    const gmv = b.outcomes.find((o) => o.key === "gmvPerHour")!;
    expect(gmv.p50).toBeGreaterThan(5_000_000); // 10M+ / 2 giờ
  });
  test("tỷ lệ tính trên cộng của từng ca: ERR = views / impressions", () => {
    const b = buildShiftBenchmark(many(30), "crocs", "TikTok", "Tối")!;
    expect(b.rates.find((r) => r.key === "err")!.p50).toBeCloseTo(5, 5);
  });
  test("khung giờ ít ca ⇒ gộp mọi khung giờ của brand × sàn", () => {
    const b = buildShiftBenchmark([...many(25, { startTime: "10:00" }), ...many(3)], "crocs", "TikTok", "Tối")!;
    expect(b.scope).toBe("all-bands");
    expect(b.n).toBe(28);
  });
  test("không lẫn brand hay sàn khác", () => {
    expect(buildShiftBenchmark(many(40, { brandId: "vera" }), "crocs", "TikTok", "Tối")).toBeNull();
    expect(buildShiftBenchmark(many(40), "crocs", "Shopee", "Tối")).toBeNull();
  });
  test("ca thiếu impressions không kéo tỷ lệ phễu xuống 0", () => {
    const b = buildShiftBenchmark([...many(30), ...many(10, { impressions: 0, productClicks: 0 })], "crocs", "TikTok", "Tối")!;
    expect(b.rates.find((r) => r.key === "err")!.n).toBe(30);
    expect(b.rates.find((r) => r.key === "err")!.p15).toBeGreaterThan(0);
  });
  test("Shopee: phễu Views → ATC → Orders, chỉ ca có ATC vào ATC", () => {
    const rows = many(30, { platform: "Shopee", report: { atcCount: 200 } as LiveSession["report"] });
    const b = buildShiftBenchmark([...rows, ...many(5, { platform: "Shopee" })], "crocs", "Shopee", "Tối")!;
    expect(b.funnel.map((x) => x.key)).toEqual(["views", "orders"]);
    expect(b.rates.map((x) => x.key)).toEqual(["ordersViews"]);
  });
});

describe("benchZone / benchAt", () => {
  const it = { p15: 10, p40: 20, p75: 40 };
  test("bốn vùng, mốc thuộc vùng cao hơn", () => {
    expect([9.9, 10, 19.9, 20, 39.9, 40].map((v) => benchZone(it, v))).toEqual(["off", "act", "act", "ok", "ok", "ot"]);
  });
  test("số theo giờ nhân số giờ, tỷ lệ giữ nguyên", () => {
    const count = { ...it, p50: 25, key: "orders", label: "", kind: "count" as const, perHour: true, n: 30, lead: true };
    expect(benchAt(count, 3)).toEqual({ p15: 30, p40: 60, p50: 75, p75: 120 });
    expect(benchAt({ ...count, perHour: false }, 3)).toEqual({ ...it, p50: 25 });
  });
});

describe("ads: adsHistoryOf / adviseAds", () => {
  const days = (n: number, adsOf: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, live: adsOf(i) }));
  const hist = (n: number, gmvOf: (i: number) => number) =>
    Array.from({ length: n }, (_, i) => ca({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, actualGmv: gmvOf(i), liveDurationMinutes: 180 }));

  test("null khi dưới 20 ngày ghép được; ngày thiếu ads hoặc dưới 2 giờ live bị bỏ", () => {
    expect(adsHistoryOf(hist(25, () => 1e7), days(10, () => 2e6), "crocs", "TikTok")).toBeNull();
    expect(adsHistoryOf(hist(25, () => 1e7), days(25, () => 0), "crocs", "TikTok")).toBeNull();
    expect(adsHistoryOf(hist(25, () => 1e7).map((s) => ({ ...s, liveDurationMinutes: 60 })), days(25, () => 2e6), "crocs", "TikTok")).toBeNull();
  });
  test("ads/giờ = ads ngày ÷ giờ live ngày; tương quan ≈ 0 khi GMV không phụ thuộc ads, ≈ 1 khi cùng chiều", () => {
    const h = adsHistoryOf(hist(25, (i) => 1e7 + ((i * 7) % 5) * 1e5), days(25, (i) => 3e6 + ((i * 3) % 7) * 1e5), "crocs", "TikTok")!;
    expect(h.n).toBe(25);
    expect(h.p50).toBeGreaterThan(1e6); // ~3M / 3 giờ
    expect(Math.abs(h.rho)).toBeLessThan(0.5);
    const up = adsHistoryOf(hist(25, (i) => 1e7 + i * 1e6), days(25, (i) => 3e6 + i * 1e5), "crocs", "TikTok")!;
    expect(up.rho).toBeGreaterThan(0.95);
  });
  const bench = buildShiftBenchmark(many(60), "crocs", "TikTok", "Tối")!;
  const gmvItem = bench.outcomes.find((o) => o.key === "gmvPerHour")!;
  const flat = { n: 30, p25: 1e6, p50: 2e6, p75: 3e6, rho: 0 };
  test("ROAS cần đạt = GMV cần có ÷ ads; mốc GMV không đổi theo ads", () => {
    const a = adviseAds(bench, flat, 2, 2_000_000, null)!;
    expect(a.need.ok.gmv).toBeCloseTo(gmvItem.p40 * 2, 3);
    expect(a.need.ok.roas).toBeCloseTo((gmvItem.p40 * 2) / 2_000_000, 6);
    expect(adviseAds(bench, flat, 2, 4_000_000, null)!.need.ok.gmv).toBeCloseTo(a.need.ok.gmv, 3);
    expect(a.zone).toBeNull();
    expect(a.advice).toBe("");
  });
  test("mức ads so với lịch sử", () => {
    expect(adviseAds(bench, flat, 1, 500_000, null)!.level).toBe("low");
    expect(adviseAds(bench, flat, 1, 2_000_000, null)!.level).toBe("usual");
    expect(adviseAds(bench, flat, 1, 5_000_000, null)!.level).toBe("high");
    expect(adviseAds(bench, null, 1, 5_000_000, null)!.level).toBeNull();
  });
  test("không có số ads ⇒ null", () => {
    expect(adviseAds(bench, flat, 1, 0, null)).toBeNull();
  });
  test("lời khuyên: ads cao mà GMV dưới target ⇒ không tăng ads; ads không kéo GMV ⇒ không bảo tăng ads", () => {
    const low = gmvItem.p15 * 0.5, mid = (gmvItem.p15 + gmvItem.p40) / 2;
    expect(adviseAds(bench, flat, 1, 5_000_000, mid)!.advice).toMatch(/đừng tăng thêm ads/);
    expect(adviseAds(bench, flat, 1, 1_500_000, mid)!.advice).toMatch(/không phải đòn bẩy/);
    expect(adviseAds(bench, { ...flat, rho: 0.5 }, 1, 1_500_000, mid)!.advice).toMatch(/nâng ads/);
    expect(adviseAds(bench, flat, 1, 5_000_000, low)!.advice).toMatch(/kết thúc sớm/);
    expect(adviseAds(bench, flat, 1, 1_500_000, gmvItem.p75 * 2)!.zone).toBe("ot");
  });
});

describe("checkShift: gãy ở đâu, làm gì, kết luận theo cả phễu", () => {
  // Phễu lịch sử có biến động nhẹ để P15 < P50 < P75 (ca nào cũng 120 phút).
  const hist = Array.from({ length: 80 }, (_, i) => ca({
    totalViews: 4_000 + (i % 10) * 200, impressions: 80_000 + (i % 10) * 4_000, productClicks: 1_600 + (i % 10) * 90, totalOrders: 20 + (i % 10) * 2,
    actualGmv: 20_000_000 + (i % 10) * 1_000_000
  }));
  const bench = buildShiftBenchmark(hist, "crocs", "TikTok", "Tối")!;
  const avg = (key: string) => bench.funnel.find((f) => f.key === key)!.p50 * 2; // tích luỹ sau 120 phút
  const rate = (key: string) => bench.rates.find((r) => r.key === key)!.p50;
  const healthy = { minutes: 120, gmv: bench.outcomes.find((o) => o.key === "gmvPerHour")!.p50 * 2, ads: null, counts: { imp: avg("imp"), views: avg("views"), clicks: avg("clicks"), orders: avg("orders") } };

  test("đúng trung bình ⇒ không gãy, đúng target", () => {
    const c = checkShift(bench, healthy, null)!;
    expect(c.breaks).toEqual([]);
    expect(c.verdict).toBe("ok");
  });
  test("không có số phút ⇒ null; chưa có kết quả ⇒ chưa kết luận, không bịa", () => {
    expect(checkShift(bench, { ...healthy, minutes: 0 }, null)).toBeNull();
    expect(checkShift(bench, { ...healthy, gmv: null, counts: { imp: null, views: null, clicks: null, orders: null } }, null)!.verdict).toBeNull();
  });
  test("LIVE CTR gãy một mình ⇒ chỉ báo LIVE CTR, action của host; click/đơn thấp theo sau không thành việc riêng", () => {
    const clicks = (avg("views") * rate("liveCtr")) / 100 * 0.3;
    const c = checkShift(bench, { ...healthy, counts: { ...healthy.counts, clicks, orders: clicks * (rate("ctor") / 100) } }, null)!;
    expect(c.breaks.map((b) => b.key)).toEqual(["liveCtr"]);
    expect(c.breaks[0].action).toMatch(/ghim/);
    expect(c.breaks[0].vsAvg).toBeLessThan(-0.5);
    expect(c.verdict).not.toBe("ok");
  });
  test("lượng vào phễu gãy ⇒ gốc là traffic, đứng đầu danh sách", () => {
    const c = checkShift(bench, { ...healthy, counts: { ...healthy.counts, imp: avg("imp") * 0.2, views: avg("views") * 0.2 } }, null)!;
    expect(c.breaks[0].key).toBe("imp");
    expect(c.breaks[0].kind).toBe("volume");
    expect(c.breaks[0].action).toMatch(/Ads/);
  });
  test("kết thúc sớm cần kết quả yếu nhất VÀ từ 2 bậc gãy nặng; chỉ 1 bậc gãy ⇒ cần action", () => {
    const bad = { imp: avg("imp") * 0.2, views: avg("views") * 0.2, clicks: 5, orders: 1 };
    expect(checkShift(bench, { ...healthy, gmv: 500_000, counts: bad }, null)!.verdict).toBe("off");
    const one = checkShift(bench, { ...healthy, gmv: 500_000, counts: { ...healthy.counts, clicks: 5, orders: 1 } }, null)!;
    expect(one.breaks.filter((b) => b.zone === "off").length).toBeLessThan(2);
    expect(one.verdict).toBe("act");
  });
  test("đơn đủ mà GMV/giờ thấp ⇒ gãy ở AOV, action combo/quà tặng", () => {
    const c = checkShift(bench, { ...healthy, gmv: healthy.gmv * 0.4 }, null)!;
    const b = c.breaks.find((x) => x.key === "aov")!;
    expect(b.kind).toBe("value");
    expect(b.action).toMatch(/combo/);
    expect(c.verdict).toBe("act");
  });
  test("không bậc nào gãy và kết quả vượt ⇒ có thể xin OT", () => {
    const top = bench.outcomes.find((o) => o.key === "gmvPerHour")!.p75 * 2 * 1.2;
    const c = checkShift(bench, { ...healthy, gmv: top, counts: { imp: avg("imp") * 1.3, views: avg("views") * 1.3, clicks: avg("clicks") * 1.3, orders: avg("orders") * 1.3 } }, null)!;
    expect(c.breaks).toEqual([]);
    expect(c.verdict).toBe("ot");
  });
  test("có ads ⇒ kèm dòng ads; không có ads ⇒ trống", () => {
    expect(checkShift(bench, healthy, null)!.ads).toBeNull();
    const a = checkShift(bench, { ...healthy, ads: 2_000_000, gmv: 1_000_000 }, null)!;
    expect(a.ads!.adsPerHour).toBe(1_000_000);
    expect(a.adsLine).not.toBe("");
  });
});

describe("Shopee: phễu theo chỉ số Dashboard Shopee", () => {
  const hist = Array.from({ length: 60 }, (_, i) => ca({
    platform: "Shopee", impressions: undefined, productClicks: undefined, totalViews: 5_000 + (i % 10) * 300, totalOrders: 20 + (i % 10) * 2,
    actualGmv: 8_000_000 + (i % 10) * 500_000, avgWatchTimeSeconds: 30 + (i % 10) * 3
  }));
  const bench = buildShiftBenchmark(hist, "crocs", "Shopee", "Tối")!;
  test("phễu Views → Orders + Orders/Views; kết quả GMV/giờ, GPM (trên Views), AOV, Xem TB — không còn ATC", () => {
    expect(bench.funnel.map((f) => f.key)).toEqual(["views", "orders"]);
    expect(bench.rates.map((r) => r.key)).toEqual(["ordersViews"]);
    expect(bench.outcomes.map((o) => o.key)).toEqual(["gmvPerHour", "gpm", "aov", "watch"]);
    expect(funnelChain(bench, () => true).arrows.map((a) => a?.key)).toEqual(["ordersViews"]);
  });
  test("GPM Shopee = GMV ÷ Views × 1.000 và so với lịch sử cùng công thức", () => {
    const gpm = bench.outcomes.find((o) => o.key === "gpm")!;
    const expected = (8_000_000 + 4 * 500_000) / (5_000 + 4 * 300) * 1000; // ca giữa dãy
    expect(gpm.p50).toBeGreaterThan(expected * 0.7);
    expect(gpm.p50).toBeLessThan(expected * 1.3);
    const avgViews = bench.funnel.find((f) => f.key === "views")!.p50 * 2;
    const c = checkShift(bench, { minutes: 120, gmv: 10_000_000, ads: null, counts: { views: avgViews, orders: 30 }, watchSeconds: 17 }, null)!;
    expect(c.outcomes.find((o) => o.key === "gpm")!.value).toBeCloseTo((10_000_000 / avgViews) * 1000, 3);
    expect(c.outcomes.find((o) => o.key === "watch")!.value).toBe(17);
  });
  test("chuyển đổi Orders/Views thấp ⇒ gãy ở Orders/Views với việc cần làm", () => {
    const avgViews = bench.funnel.find((f) => f.key === "views")!.p50 * 2;
    const c = checkShift(bench, { minutes: 120, gmv: 5_000_000, ads: null, counts: { views: avgViews, orders: 8 } }, null)!;
    expect(c.breaks.map((b) => b.key)).toContain("ordersViews");
    expect(c.breaks.find((b) => b.key === "ordersViews")!.action).toMatch(/chốt đơn/);
  });
});

describe("ca nối: trừ số lúc giao ca", () => {
  const base = { minutes: 120, gmv: 10_000_000, ads: null, counts: { views: 4_000, orders: 20, imp: null, clicks: null } };
  test("trừ từng mục; mục thiếu số lúc giao ca ⇒ null, không đoán", () => {
    const r = subtractHandover({ minutes: 180, gmv: 16_000_000, ads: 900_000, counts: { views: 6_500, orders: 30, imp: 80_000, clicks: 2_500 } }, base)!;
    expect(r.minutes).toBe(60);
    expect(r.gmv).toBe(6_000_000);
    expect(r.counts.views).toBe(2_500);
    expect(r.counts.orders).toBe(10);
    expect(r.counts.imp).toBeNull();
    expect(r.counts.clicks).toBeNull();
    expect(r.ads).toBeNull();
  });
  test("không có số phút lúc giao ca, hoặc phút hiện tại không lớn hơn ⇒ null (không chấm)", () => {
    expect(subtractHandover({ minutes: 180, gmv: 1, ads: null, counts: {} }, { ...base, minutes: null })).toBeNull();
    expect(subtractHandover({ minutes: 120, gmv: 1, ads: null, counts: {} }, base)).toBeNull();
  });
  test("số hiện tại nhỏ hơn số lúc giao ca (đọc sai) ⇒ null thay vì số âm", () => {
    expect(subtractHandover({ minutes: 180, gmv: 5_000_000, ads: null, counts: { views: 3_000, orders: 25 } }, base)!.gmv).toBeNull();
    expect(subtractHandover({ minutes: 180, gmv: 5_000_000, ads: null, counts: { views: 3_000, orders: 25 } }, base)!.counts.views).toBeNull();
  });
  test("findHandoverSource: lấy số cộng dồn của ca kết thúc muộn nhất, ước số phút từ lúc mở phòng của chuỗi ca nối", () => {
    const a = ca({ id: "a", date: "2026-11-01", startTime: "18:00", endTime: "20:00", report: { cumGmv: 6e6, cumViews: 2000, cumOrders: 9 } as LiveSession["report"] });
    const b = ca({ id: "b", date: "2026-11-01", startTime: "20:00", endTime: "22:00", report: { cumGmv: 12e6, cumViews: 4500, cumOrders: 21 } as LiveSession["report"] });
    const c = ca({ id: "c", date: "2026-11-01", startTime: "22:00", endTime: "24:00", status: "Upcoming" });
    const src = findHandoverSource([a, b, c], "crocs", "TikTok", "2026-11-01", ["imp", "views", "clicks", "orders"])!;
    expect(src.session.id).toBe("b");
    expect(src.base.minutes).toBe(240);
    expect(src.base.gmv).toBe(12e6);
    expect(src.base.counts).toEqual({ imp: null, views: 4500, clicks: null, orders: 21 });
    expect(findHandoverSource([c], "crocs", "TikTok", "2026-11-01", ["views"])).toBeNull();
  });
});
