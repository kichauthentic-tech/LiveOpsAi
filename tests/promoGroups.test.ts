// CTKM gom theo loại (user 27/11). Tên lấy từ file Shop Promotion List CROCS T11 + Franklin T11.
import { describe, expect, it } from "vitest";
import { promoGroups, promoKind, promoRate } from "../src/lib/report/promoGroups";
import { productsBlocks } from "../src/lib/report/pageInsights";
import type { PromotionRow } from "../src/lib/dataraw/monthlyProductSlice";

const p = (name: string, gmv: number, discount: number, type?: string, discountRate?: number): PromotionRow => ({ name, status: "", period: "", gmv, orders: 10, aov: 0, itemsSold: 10, discount, type, discountRate });

describe("promoKind", () => {
  it("cột Loại thắng khi có", () => {
    expect(promoKind(p("MD price 3.11 - TBU", 1, 1, "fix price"))).toBe("markdown");
    expect(promoKind(p("Alsway on", 1, 1, "percentage off"))).toBe("markdown");
    expect(promoKind(p("EOL JB Pack Buy 2 get 50% off", 1, 1, "bmsm"))).toBe("bundle");
    expect(promoKind(p("Live flash sale 20261106", 1, 0, "creator flash sale"))).toBe("flash");
  });
  it("cột Loại trống ⇒ suy theo tên", () => {
    expect(promoKind(p("[Double day 9-12.11] VC 10%", 1, 1))).toBe("voucher");
    expect(promoKind(p("[VC 20%] Baya Pearl white - Black Friday", 1, 1))).toBe("voucher");
    expect(promoKind(p("Voucher LIVE - 100K - ALL ORDER", 1, 1))).toBe("voucher");
    expect(promoKind(p("[23-27.11] Tặng 1JB chain cho đơn 1.3M", 1, 0))).toBe("gift");
    expect(promoKind(p("[Baya PF] Free 1 JB chain for bill 1.5M", 1, 0))).toBe("gift");
    expect(promoKind(p("Every order - Get Free X-40 Ball", 1, 0))).toBe("gift");
    expect(promoKind(p("Quà vợt đay", 1, 0))).toBe("gift");
    expect(promoKind(p("Gía Black Friday 20 - 27.11", 1, 1))).toBe("markdown");
    expect(promoKind(p("MD 1.10 - TBU", 1, 1))).toBe("markdown");
    expect(promoKind(p("Combo 2 áo", 1, 0))).toBe("bundle");
  });
});

describe("promoRate", () => {
  it("dùng số TikTok; thiếu thì tiền giảm ÷ giá trước giảm; quà tặng = null", () => {
    expect(promoRate(p("x", 993.7e6, 750.8e6, "fix price", 43))).toBe(43);
    expect(promoRate(p("x", 695.1e6, 97.6e6))).toBeCloseTo((97.6 / (695.1 + 97.6)) * 100, 3);
    expect(promoRate(p("x", 100, 0))).toBeNull();
  });
});

describe("promoGroups", () => {
  const items = [p("MD price 3.11 - TBU", 993e6, 750e6, "fix price", 43), p("[Double day 9-12.11] VC 10%", 937e6, 100e6, undefined, 12), p("[Black Friday 23-27.11] VC 5%", 399e6, 25e6, undefined, 6), p("[10-12.11] Tặng 1JB chain", 937e6, 0)];
  const g = promoGroups(items);
  it("nhóm nhiều tiền giảm xếp trước, tỷ trọng cộng 100%, mức giảm theo khoảng", () => {
    expect(g.map((x) => x.kind)).toEqual(["markdown", "voucher", "gift"]);
    expect(g[0].share! + g[1].share!).toBeCloseTo(100, 6);
    expect([g[1].rateMin, g[1].rateMax]).toEqual([6, 12]);
    expect(g[2].discount).toBe(0);
    expect(g[2].rateMin).toBeNull();
  });
  it("Insight Sản phẩm nêu tiền giảm đi vào loại nào, quà tặng không có tiền giảm trong file", () => {
    const b = productsBlocks({
      topN: 0, risers: [], fallers: [], lead: { name: "A", share: 20 },
      promo: { name: items[0].name, rate: 43, discount: 750e6, totalDiscount: 875e6, otherRates: [12, 6], groups: g.map((x) => ({ label: x.label, count: x.count, discount: x.discount, share: x.share })) }
    });
    expect(b.impact).toContain("Giảm giá sản phẩm 86% (1 chương trình)");
    expect(b.impact).toContain("Voucher 14% (2 chương trình)");
    expect(b.impact).toContain("Quà tặng 1 chương trình không có tiền giảm trong file");
  });
});

import { promoReach, promoWindow } from "../src/lib/report/promoGroups";
describe("promoReach — % đơn shop dùng chương trình (CROCS T11, Shop Analytics 1–25/11)", () => {
  // Đơn/GMV shop 9–12/11 trong file Shop Analytics_Key metrics_20261126.
  const days = [
    { date: "2026-11-08", gmv: 210.1e6, orders: 187 },
    { date: "2026-11-09", gmv: 600.9e6, orders: 578 },
    { date: "2026-11-10", gmv: 468.2e6, orders: 430 },
    { date: "2026-11-11", gmv: 691.4e6, orders: 622 },
    { date: "2026-11-12", gmv: 368.1e6, orders: 331 },
    { date: "2026-11-13", gmv: 270.7e6, orders: 246 }
  ];
  const vc = { period: "2026-11-09 00:00 - 2026-11-12 23:59", gmv: 937.75e6, orders: 941, discount: 113e6 };
  it("kỳ chạy đọc đúng giờ VN, hết phút cuối", () => {
    const w = promoWindow(vc.period)!;
    expect(w.end - w.start).toBe(4 * 86_400_000);
  });
  it("VC 10% Double Day: 941 / 1.961 đơn shop ≈ 48%, giỏ thấp hơn đơn thường", () => {
    const r = promoReach(vc, days, "2026-11-01", "2026-11-26")!;
    expect(r.reach).toBeCloseTo((941 / 1961) * 100, 1);
    expect(r.aovVsShop).toBeLessThan(0);
    expect(r.perOrder).toBeCloseTo(113e6 / 941, 0);
  });
  it("chương trình vài giờ, hoặc kỳ chạy ra ngoài ngày có Shop Analytics ⇒ không tính", () => {
    expect(promoReach({ ...vc, period: "2026-11-09 11:00 - 2026-11-09 14:04" }, days, "2026-11-01")).toBeNull();
    expect(promoReach({ ...vc, period: "2026-11-12 00:00 - 2026-11-16 23:59" }, days, "2026-11-01")).toBeNull();
  });
  it("phạm vi file cắt kỳ chạy: chỉ so đơn shop tới ngày cuối file", () => {
    const r = promoReach({ ...vc, period: "2026-11-11 00:00 - 2026-11-20 23:59" }, days, "2026-11-01", "2026-11-13")!;
    expect(r.reach).toBeCloseTo((941 / (622 + 331)) * 100, 1);
  });
});

describe("Insight Sản phẩm nêu độ phủ của chương trình tốn tiền nhất", () => {
  it("phủ rộng, giỏ không lớn hơn ⇒ nêu số và đề xuất xem lại ngưỡng", () => {
    const b = productsBlocks({ topN: 0, risers: [], fallers: [], lead: { name: "A", share: 20 }, promo: { name: "MD", rate: 43, reach: { name: "[Double day 9-12.11] VC 10%", rate: 12, reach: 48, aovVsShop: -8 } } });
    expect(b.impact).toContain("được dùng ở 48% đơn của shop");
    expect(b.impact).toContain("thấp hơn 8% so với");
    expect(b.advise).toContain("Cân nhắc nâng ngưỡng đơn tối thiểu");
  });
  it("phủ hẹp hoặc giỏ lớn hơn ⇒ không đề xuất ngưỡng", () => {
    const b = productsBlocks({ topN: 0, risers: [], fallers: [], lead: { name: "A", share: 20 }, promo: { name: "MD", rate: 43, reach: { name: "MD price", rate: 43, reach: 19, aovVsShop: -18 } } });
    expect(b.advise).not.toContain("ngưỡng");
  });
});
