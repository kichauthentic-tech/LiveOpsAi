// File "Shopee Live Ads Report" (0142, 06/10). Mẫu = file thật VERA T9 (Shopee-Live-Ads-Overall-Data-01_09_2026-30_09_2026.csv).
import { describe, expect, test } from "vitest";
import { parseCsvRows } from "../src/lib/dataraw/shopeeFiles";
import { parseShopeeAdsRows, shopeeAdsStats } from "../src/lib/dataraw/shopeeAds";

const VERA_T9 = `\uFEFFShopee Live Ads Report - Shopee Vietnam
Shop Name,VERA Official Store
Shop ID,13346195
Report Creation Time,06/10/2026 01:40
Date Period,01/09/2026 - 30/09/2026

Sequence,Campaign Name,Campaign ID,Status,Objective,Start Date,End Date,Daily Start Time,Daily End Time,Budget,Views,Orders,Conversion Rate,GMV,Expense,ROAS
1,LIVESTREAM ADS,167782702,Ongoing,GMV Max Live Auto Bidding,28/07/2025,Unlimited,All Day,All Day,100000,81460,204,0.25%,70273048,2300302,30.55`;

const parse = (text: string) => parseShopeeAdsRows(parseCsvRows(text));

describe("parseShopeeAdsRows", () => {
  test("file thật VERA T9: kỳ, shop, 1 chiến dịch, số khớp file", () => {
    const p = parse(VERA_T9);
    expect(p.periodStart).toBe("2026-09-01");
    expect(p.periodEnd).toBe("2026-09-30");
    expect(p.periodLabel).toBe("VERA Official Store · Shop ID 13346195");
    expect(p.rows).toHaveLength(1);
    const s = shopeeAdsStats(p.rows, p.summary);
    expect(s.shopId).toBe("13346195");
    expect(s.expense).toBe(2_300_302);
    expect(s.gmv).toBe(70_273_048);
    expect(s.orders).toBe(204);
    expect(s.views).toBe(81_460);
    expect(s.roas).toBeCloseTo(30.55, 2);
    expect(s.costPerOrder).toBeCloseTo(11_276, 0);
    expect(s.campaigns[0]).toMatchObject({ name: "LIVESTREAM ADS", conversionPct: 0.25, budget: 100_000 });
  });
  test("cộng nhiều chiến dịch; ROAS tổng = GMV ÷ chi phí (không cộng ROAS)", () => {
    const two = VERA_T9 + "\n2,LIVE 2,1,Ended,GMV Max,01/09/2026,30/09/2026,All Day,All Day,0,100,10,1%,1000000,500000,2";
    const s = shopeeAdsStats(parse(two).rows);
    expect(s.expense).toBe(2_800_302);
    expect(s.gmv).toBe(71_273_048);
    expect(s.roas).toBeCloseTo(71_273_048 / 2_800_302, 6);
  });
  test("số kiểu Việt (dấu chấm nghìn, phẩy thập phân) vẫn đúng", () => {
    const vn = VERA_T9.replace("70273048,2300302,30.55", '"70.273.048","2.300.302","30,55"');
    expect(shopeeAdsStats(parse(vn).rows).expense).toBe(2_300_302);
  });
  test("chặn ROAS lệch GMV ÷ chi phí (số bị đổi định dạng)", () => {
    expect(() => parse(VERA_T9.replace("2300302,30.55", "2300,30.55"))).toThrow(/ROAS ghi 30.55/);
  });
  test("chặn kỳ không trọn một tháng", () => {
    expect(() => parse(VERA_T9.replace("01/09/2026 - 30/09/2026", "15/09/2026 - 14/10/2026"))).toThrow(/MỘT tháng/);
    expect(() => parse(VERA_T9.replace("01/09/2026 - 30/09/2026", "01/09/2026 - 15/10/2026"))).toThrow(/MỘT tháng/);
  });
  test("chặn file không phải Ads Shopee và file thiếu cột", () => {
    expect(() => parse("Data Period,User Id\n01-09-2026,1")).toThrow(/Shopee Live Ads Report/);
    expect(() => parse(VERA_T9.replace(",ROAS", ""))).toThrow();
  });
});
