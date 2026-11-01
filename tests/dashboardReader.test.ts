// Đọc số từ ảnh Dashboard TikTok (01/11/2026) — lib/ocr/dashboardReader.ts.
// Fixture = chữ + khung do tesseract trả về trên ảnh chụp thật (đảo màu, phóng 2 lần, chế độ chữ rời): tests/fixtures/dashboard-ocr/.
// Chạy: npx vitest run tests/dashboardReader.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseDashNumber, parseDashPercent, readDashboard } from "../src/lib/ocr/dashboardReader";

describe("parseDashNumber", () => {
  test("dấu phẩy nghìn, hậu tố K/M, số đơn", () => {
    expect(parseDashNumber("3,236,853")?.value).toBe(3236853);
    expect(parseDashNumber("1.69K")?.value).toBe(1690);
    expect(parseDashNumber("1.09M")?.value).toBe(1090000);
    expect(parseDashNumber("12")).toMatchObject({ value: 12, guessed: false });
    expect(parseDashNumber("1.351")?.value).toBe(1351); // dấu chấm nghìn kiểu Việt
  });
  test("mất chữ K ở cột thường hiển thị K ⇒ đoán và gắn cờ", () => {
    expect(parseDashNumber("1.69", true)).toMatchObject({ value: 1690, guessed: true });
    expect(parseDashNumber("537.51k", true)).toMatchObject({ value: 537510, guessed: false });
  });
  test("chữ nhầm trong số: a→8, x→K, ghi cờ đoán", () => {
    expect(parseDashNumber("44.a2x", true)).toMatchObject({ value: 44820, guessed: true });
  });
  test("không phải số ⇒ null", () => {
    expect(parseDashNumber("abc")).toBeNull();
  });
});

describe("parseDashPercent", () => {
  test("khoảng trắng thay dấu phẩy, dấu phẩy, dấu chấm", () => {
    expect(parseDashPercent("41 93%")?.value).toBe(41.93);
    expect(parseDashPercent("1,76%")?.value).toBe(1.76);
    expect(parseDashPercent("6.09%")?.value).toBe(6.09);
  });
  test("thiếu dấu % hoặc quá 100 ⇒ null", () => {
    expect(parseDashPercent("41")).toBeNull();
    expect(parseDashPercent("4193%")).toBeNull();
  });
});

describe("readDashboard trên ảnh Dashboard thật", () => {
  const f = JSON.parse(readFileSync("tests/fixtures/dashboard-ocr/tiktok-live-words.json", "utf8"));
  const r = readDashboard(f.text, f.words);
  test("đọc đúng 7 số của phiên live 2 giờ 58 phút", () => {
    expect(r.minutes?.value).toBe(178);
    expect(r.gmv?.value).toBe(3236853);
    expect(r.views?.value).toBe(1690);
    expect(r.impressions?.value).toBe(44820);
    expect(r.ads?.value).toBe(537510);
    expect(r.liveCtr?.value).toBe(41.93);
    expect(r.orders?.value).toBe(12);
  });
  test("số đoán (mất chữ K, nhầm chữ) có cờ guessed để UI tô vàng", () => {
    expect(r.views?.guessed).toBe(true);
    expect(r.impressions?.guessed).toBe(true);
    expect(r.gmv?.guessed).toBe(false);
    expect(r.orders?.guessed).toBe(false);
  });
  test("ảnh không phải Dashboard ⇒ không bịa số", () => {
    expect(readDashboard("xin chào", [])).toEqual({});
  });
});

describe("readDashboard trên Dashboard Shopee thật", () => {
  const f = JSON.parse(readFileSync("tests/fixtures/dashboard-ocr/shopee-live-words.json", "utf8"));
  test("nhận ra Shopee và đọc đúng Sales, Total Views, Orders, thời lượng live (không lẫn Avg. Viewing Duration)", () => {
    const r = readDashboard(f.text, f.words);
    expect(r.platform).toBe("Shopee");
    expect(r.gmv?.value).toBe(10729000);
    expect(r.views?.value).toBe(10104);
    expect(r.orders?.value).toBe(49);
    expect(r.minutes?.value).toBe(265); // 04:24:44, không phải 00:00:17
    expect(r.impressions).toBeUndefined(); // Shopee không có
    expect(r.watchSeconds?.value).toBe(17); // Avg. Viewing Duration 00:00:17
    expect(r.ctr?.value).toBe(8.2);
    expect(r.co?.value).toBe(5.9);
  });
  test("bố cục đổi chỗ: dịch cả ảnh và hoán đổi hai cột vẫn đọc đúng theo nhãn → số ngay dưới", () => {
    const w = (text: string, x0: number, y0: number, wd = 90, h = 28) => ({ text, x0, y0, x1: x0 + wd, y1: y0 + h });
    const words = [
      w("Orders", 700, 300), w("49", 700, 350, 60, 50), // cột Orders ở chỗ cũ của Total Views
      w("Total", 200, 300, 50), w("Views", 260, 300, 60), w("10.104", 205, 350, 110, 50),
      w("Sales", 450, 120, 70), w("10.729.000,00", 380, 160, 300, 70),
      w("Duration:", 900, 800, 110), w("04:24:44", 1020, 800, 110),
      w("Avg.", 100, 600, 50), w("Viewing", 160, 600, 90), w("Duration", 260, 600, 100), w("00:00:17", 270, 640, 100)
    ];
    const r = readDashboard("Real-time Insight Total Views", words);
    expect(r).toMatchObject({ platform: "Shopee", gmv: { value: 10729000 }, views: { value: 10104 }, orders: { value: 49 }, minutes: { value: 265 } });
  });
});
