import { describe, expect, test } from "vitest";
import { adsDate, adsMonthStats, adsNum, adsPrevSameCut, parseAdsCampaignOverview, readAdsDays } from "../src/lib/dataraw/adsCampaignOverview";
import { resolveCampBucketType } from "../src/lib/campaignDays";

// File thật: "Campaign overview data 20260901 - 20260930-2.xlsx" (Franklin T9, TikTok Ads, đọc như sheet_to_json
// header:1 raw:true trả về). Số đối chiếu: slide 22 "ADS INVESTMENT" của deck Franklin T9 — chi 36.047.613đ, ROI 22,1x,
// 52.933đ/đơn SKU (681 đơn), doanh thu gộp 798,1tr, D-Day ROI 42,8x.
const EN_HEADER = ["By Day", "Cost", "SKU orders (Current shop)", "Cost per order (Current shop)", "Gross revenue (Current shop)", "ROI (Current shop)", "Currency"];
const VI_HEADER = ["Theo ngày", "Chi phí", "Số lượng đơn hàng SKU (Cửa hàng hiện tại)", "Chi phí mỗi đơn hàng (Cửa hàng hiện tại)", "Doanh thu gộp (Cửa hàng hiện tại)", "ROI (Cửa hàng hiện tại)", "Tiền tệ"];
const DAYS: [string, number, number, string, number, string][] = [
  ["01", 627695, 10, "62770", 6344998, "10.11"], ["02", 100914, 2, "50457", 6138000, "60.82"], ["03", 545353, 0, "0", 0, "0.00"],
  ["04", 509679, 4, "127420", 6138000, "12.04"], ["05", 1478794, 26, "56877", 52499747, "35.50"], ["06", 1631940, 8, "203993", 17782492, "10.90"],
  ["07", 811103, 51, "15904", 78523488, "96.81"], ["08", 2300000, 24, "95833", 35015160, "15.22"], ["09", 2652354, 116, "22865", 132952442, "50.13"],
  ["10", 667423, 60, "11124", 49665691, "74.41"], ["11", 621041, 16, "38815", 14986972, "24.13"], ["12", 1539961, 25, "61598", 25414150, "16.50"],
  ["13", 1044929, 16, "65308", 24185096, "23.15"], ["14", 3200000, 34, "94118", 32154591, "10.05"], ["15", 560207, 6, "93368", 5099998, "9.10"],
  ["16", 100225, 2, "50113", 4100000, "40.91"], ["17", 695176, 25, "27807", 25279994, "36.36"], ["18", 379717, 2, "189859", 1800000, "4.74"],
  ["19", 809528, 13, "62271", 14484997, "17.89"], ["20", 1671024, 11, "151911", 15040422, "9.00"], ["21", 4969, 0, "0", 0, "0.00"],
  ["22", 801487, 49, "16357", 76003709, "94.83"], ["23", 1547747, 8, "193468", 5820027, "3.76"], ["24", 2274930, 23, "98910", 25624946, "11.26"],
  ["25", 1982087, 19, "104320", 16051611, "8.10"], ["26", 2252533, 46, "48968", 44786037, "19.88"], ["27", 850000, 17, "50000", 16605197, "19.54"],
  ["28", 400077, 6, "66680", 8455299, "21.13"], ["29", 1915091, 41, "46710", 39736036, "20.75"], ["30", 2071629, 21, "98649", 17423850, "8.41"]
];
const TOTAL = ["-", 36047613, 681, 52933, 798112952, "22.14", "VND"];
const franklin = (header = EN_HEADER, days = DAYS, total: unknown[] | null = TOTAL): unknown[][] => [
  header,
  ...days.map(([d, ...rest]) => [`2026-09-${d} 00:00:00`, ...rest, "VND"]),
  ...(total ? [total] : [])
];

describe("parseAdsCampaignOverview", () => {
  test("file Franklin T9 bản tiếng Anh: 30 ngày, đúng kỳ, bỏ dòng tổng khỏi dữ liệu", () => {
    const p = parseAdsCampaignOverview(franklin());
    expect(p.rows).toHaveLength(30);
    expect(p.periodStart).toBe("2026-09-01");
    expect(p.periodEnd).toBe("2026-09-30");
    expect(p.summary?.totals).toMatchObject({ Cost: 36047613 });
  });

  test("bản tiếng Việt cho cùng số với bản tiếng Anh", () => {
    const en = parseAdsCampaignOverview(franklin());
    const vi = parseAdsCampaignOverview(franklin(VI_HEADER));
    expect(readAdsDays(vi.columns, vi.rows)).toEqual(readAdsDays(en.columns, en.rows));
  });

  test("dòng tổng lệch 2đ do TikTok làm tròn vẫn nhận; lệch thật (thiếu một ngày) thì từ chối", () => {
    expect(() => parseAdsCampaignOverview(franklin())).not.toThrow();
    expect(() => parseAdsCampaignOverview(franklin(EN_HEADER, DAYS.slice(1)))).toThrow(/không khớp/);
  });

  test("từ chối file gộp theo tuần, file trải 2 tháng, file không phải VND, file lạ", () => {
    expect(() => parseAdsCampaignOverview(franklin(["By Week", ...EN_HEADER.slice(1)], DAYS, null))).toThrow(/Theo ngày/);
    const twoMonths = franklin(EN_HEADER, DAYS, null);
    twoMonths.push(["2026-10-01 00:00:00", 1, 0, "0", 0, "0", "VND"]);
    expect(() => parseAdsCampaignOverview(twoMonths)).toThrow(/2 tháng/);
    const usd = franklin(EN_HEADER, DAYS, null);
    usd[1] = [...usd[1].slice(0, 6), "USD"];
    expect(() => parseAdsCampaignOverview(usd)).toThrow(/chỉ nhận tiền Việt/);
    expect(() => parseAdsCampaignOverview([["Room ID", "GMV"], ["1", 2]])).toThrow(/Campaign overview/);
  });
});

describe("adsMonthStats — khớp slide Ads của deck Franklin T9", () => {
  const p = parseAdsCampaignOverview(franklin());
  const days = readAdsDays(p.columns, p.rows);
  const st = adsMonthStats(days, (d) => resolveCampBucketType(d));

  test("tổng chi, đơn, doanh thu, ROI, chi phí/đơn", () => {
    expect(st.cost).toBe(36047613);
    expect(st.orders).toBe(681);
    expect(st.revenue).toBe(798112950); // Σ từng ngày — dòng tổng file ghi 798.112.952
    expect(st.roi!.toFixed(2)).toBe("22.14");
    expect(Math.round(st.costPerOrder!)).toBe(52933);
  });

  test("ngày tiêu tiền mà 0 đơn: 03/09 và 21/09; ROI thấp nhất có chi đáng kể: 23/09 (3,8x)", () => {
    expect(st.zeroOrderDays.map((d) => d.date)).toEqual(["2026-09-03", "2026-09-21"]);
    expect(st.lowRoiDays[0].date).toBe("2026-09-23");
    expect(st.lowRoiDays[0].roi.toFixed(1)).toBe("3.8");
  });

  test("ROI theo loại ngày: D-Day 7–9/09 = 42,8x", () => {
    expect(st.byBucket!.dday.days).toBe(3);
    expect(st.byBucket!.dday.roi!.toFixed(1)).toBe("42.8");
    const n = Object.values(st.byBucket!).reduce((a, b) => a + b.days, 0);
    expect(n).toBe(30);
  });
});

describe("đọc ô", () => {
  test("adsNum / adsDate", () => {
    expect(adsNum("10.11")).toBe(10.11);
    expect(adsNum("1,234,567")).toBe(1234567);
    expect(adsNum("-")).toBe(0);
    expect(adsDate("2026-09-01 00:00:00")).toBe("2026-09-01");
    expect(adsDate("01/09/2026")).toBe("2026-09-01");
    expect(adsDate(46266)).toBe("2026-09-01");
    expect(adsDate("-")).toBeNull();
  });

  test("tháng chưa đủ ngày ⇒ tháng trước cắt cùng số ngày", () => {
    const cur = [{ date: "2026-10-01", cost: 1, orders: 0, revenue: 0 }, { date: "2026-10-05", cost: 1, orders: 0, revenue: 0 }];
    const prev = ["01", "05", "06", "30"].map((d) => ({ date: `2026-09-${d}`, cost: 1, orders: 0, revenue: 0 }));
    expect(adsPrevSameCut(cur, prev, "2026-10-31").map((d) => d.date)).toEqual(["2026-09-01", "2026-09-05"]);
    expect(adsPrevSameCut([{ ...cur[0], date: "2026-10-31" }], prev, "2026-10-31")).toHaveLength(4);
  });
});
