// Ads theo ngày dán từ file tracking của brand (0184). Chạy: npx vitest run tests/adsTracking.test.ts
import { expect, test } from "vitest";
import { adsTrackingMonth, defaultPasteYear, parseAdsTrackingPaste, parseDayCell, parseVnNumber, pasteMonths } from "../src/lib/ads/adsTracking";
import { resolveCampBucketType } from "../src/lib/campaignDays";

// Dòng thật copy từ sheet "Daily Ads Report" của CROCS (dán 28/10) — tab giữa các ô, số dạng Việt Nam.
const t = (...c: (string | number)[]) => c.join("\t");
const PASTE = [
  t("1", "", "2", "3", "4", "5"),
  t("", "DAILY ADS REPORT"),
  t("Month", "Date", "DAILY ADS TARGET", "", "", "", "", "DAILY ADS ACTUAL", "", "", "", "Daily Runrate", "", "MTD ADS TARGET"),
  t("", "", "Target by TTS", "Total", "Live", "Product (GMV max)", "Creator", "Total", "Live", "Product", "Creator", "", "", "Total", "Live", "Product", "Creator", "Total", "Live", "Product", "Creator", "", "NOTE", "Timegone", "% Runrate "),
  t("3", "04/03", "7.464.852", "10.100.000", "1.200.000", "500.000", "8.400.000", "9.358.155", "1.200.000", "500.000", "7.658.155", "-7%", "", "39.628.081", "30.028.081", "1.200.000", "8.400.000", "38.886.236", "30.028.081", "1.200.000", "7.658.155", "-1,9%", "741.845", "Off camp sớm hơn dự kiến - không spent hết tiền"),
  t("3", "13/03", "7.464.852", "3.384.787", "2.934.787", "450.000", "", "3.384.787", "2.934.787", "450.000", "", "0%", "", "74.842.914", "62.180.580", "4.262.334", "8.400.000", "74.200.940", "62.180.580", "4.362.205", "7.658.155", "-0,9%", "Acc het tien toi"),
  t("10", "23/10", "7.624.285", "16.500.000", "16.000.000", "500.000", "", "15.520.000", "15.000.000", "520.000", "", "-6%"),
  t("10", "24/10", "7.624.285", "36.500.000", "24.000.000", "1.500.000", "11.000.000", "40.900.829", "30.650.000", "1.320.000", "8.930.829", "12%"),
  t("10", "25/10", "7.624.285", "31.000.000", "25.000.000", "1.500.000", "4.500.000", "32.748.957", "26.918.576", "1.320.000", "4.510.381", "6%"),
  t("10", "26/10", "7.624.285", "1.950.000", "1.500.000", "450.000", "", "0", "", "", "", "-100%"),
  t("10", "31/10", "7.624.285", "4.350.000", "3.900.000", "450.000", "", "0", "", "", "", "-100%"),
  t("", "", "", "378.300.000", "311.900.000", "21.900.000", "44.500.000", "342.496.314", "298.006.334", "20.781.595", "23.708.385"),
  t("", "", "", "", "", "", "", "", "95,55%", "94,89%")
].join("\n");

test("số dạng Việt Nam và dạng Excel thô", () => {
  expect(parseVnNumber("7.464.852")).toBe(7464852);
  expect(parseVnNumber("741.845")).toBe(741845);
  expect(parseVnNumber("7464852.387")).toBeCloseTo(7464852.387);
  expect(parseVnNumber("7,464,852")).toBe(7464852);
  expect(parseVnNumber("1,5")).toBe(1.5);
  expect(parseVnNumber("0")).toBe(0);
  expect([parseVnNumber(""), parseVnNumber("-7%"), parseVnNumber("Acc het tien"), parseVnNumber("#DIV/0!")]).toEqual([null, null, null, null]);
  expect(parseDayCell("04/03", 2026)).toBe("2026-03-04");
  expect(parseDayCell("2026-10-24 00:00:00", 2026)).toBe("2026-10-24");
  expect(parseDayCell("31/02", 2026)).toBeNull();
  expect(parseDayCell("DAILY ADS REPORT", 2026)).toBeNull();
});

test("đọc khối dán: bỏ tiêu đề + dòng tổng, giữ ghi chú chữ, ngày chưa tới = chưa có số", () => {
  const r = parseAdsTrackingPaste(PASTE, 2026);
  expect(r.rows.map((x) => x.date)).toEqual(["2026-03-04", "2026-03-13", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-31"]);
  expect(r.skipped).toBe(6);
  expect(r.warnings).toEqual([]);
  const d4 = r.rows[0];
  expect(d4.ttsTarget).toBe(7464852);
  expect(d4.target).toEqual({ total: 10_100_000, live: 1_200_000, product: 500_000, creator: 8_400_000 });
  expect(d4.actual).toEqual({ total: 9_358_155, live: 1_200_000, product: 500_000, creator: 7_658_155 });
  expect(d4.note).toBe("Off camp sớm hơn dự kiến - không spent hết tiền"); // 741.845 ở cột NOTE là số sheet tự tính ⇒ bỏ
  expect(r.rows[1].note).toBe("Acc het tien toi");
  expect(r.rows[5].actual).toBeNull();
});

test("tháng: runrate cắt ở ngày cuối có số — sheet cộng cả target ngày chưa tới", () => {
  const rows = parseAdsTrackingPaste(PASTE, 2026).rows;
  const oct = adsTrackingMonth(rows, "2026-10", (d) => resolveCampBucketType(d));
  expect(oct.lastActual).toBe("2026-10-25");
  expect(oct.monthTarget).toBe(16_500_000 + 36_500_000 + 31_000_000 + 1_950_000 + 4_350_000);
  expect(oct.mtdTarget).toBe(84_000_000);
  expect(oct.mtdActual).toBe(15_520_000 + 40_900_829 + 32_748_957);
  expect(oct.runrate!).toBeCloseTo((89_169_786 / 84_000_000 - 1) * 100, 6);
  expect(oct.parts.creator).toEqual({ target: 15_500_000, actual: 13_441_210 });
  expect(oct.buckets.payday?.days).toBe(3); // 23–25/10 theo lịch cố định
  expect(oct.buckets.daily).toBeUndefined(); // 26/10, 31/10 chưa có số
  expect(oct.ttsTargetDaily).toBe(7624285);
  // ROAS Live = LIVE GMV YFB ÷ Ads Live, chỉ các ngày đã có số thực (26/10 có GMV nhưng chưa có Ads ⇒ không cộng).
  const live = new Map([["2026-10-23", 300e6], ["2026-10-24", 700e6], ["2026-10-25", 500e6], ["2026-10-26", 90e6]]);
  const withGmv = adsTrackingMonth(rows, "2026-10", (d) => resolveCampBucketType(d), live);
  expect(withGmv.buckets.payday).toMatchObject({ liveAds: 72_568_576, liveGmv: 1_500e6 });
  expect(withGmv.liveRoas!).toBeCloseTo(1_500e6 / 72_568_576, 6);
  expect(oct.liveRoas).toBeNull();
  const mar = adsTrackingMonth(rows, "2026-03", () => "daily");
  expect(mar.offDays).toEqual([]); // 04/03 lệch −7%, dưới 30%
  expect(pasteMonths(rows).map((m) => [m.month, m.days, m.lastActual])).toEqual([["2026-03", 2, "2026-03-13"], ["2026-10", 5, "2026-10-25"]]);
});

test("Total khác tổng các phần ⇒ cảnh báo; năm mặc định", () => {
  const r = parseAdsTrackingPaste(t("10", "02/10", "", "9.000.000", "7.000.000", "500.000", ""), 2026);
  expect(r.warnings[0]).toMatch(/02: target Total 9\.000\.000 khác tổng/);
  expect(defaultPasteYear(PASTE, "2026-10-28")).toBe(2026);
  expect(defaultPasteYear(t("12", "01/12"), "2027-01-05")).toBe(2026);
});

test("trang Quảng cáo của report vẽ được khối kế hoạch Ads (CROCS T10), không NaN / undefined, chữ gửi brand", async () => {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AdsPlanPanel } = await import("../src/components/brand-workspace/report/AdsPlanPanel");
  const rows = parseAdsTrackingPaste(PASTE, 2026).rows;
  const live = new Map([["2026-10-23", 300e6], ["2026-10-24", 700e6], ["2026-10-25", 500e6]]);
  const s = adsTrackingMonth(rows, "2026-10", (d) => resolveCampBucketType(d), live);
  const html = renderToStaticMarkup(React.createElement(AdsPlanPanel, { s, month: "2026-10" })).replace(/ title="[^"]*"/g, "");
  expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
  for (const w of ["Ngân sách Ads theo kế hoạch", "Target Ads cả tháng", "tới 25/10", "Pay Day", "ROAS Live", "Live", "Creator"]) expect(html).toContain(w);
  for (const w of ["ca ", "agency", "Runrate"]) expect(html).not.toContain(w);
});
