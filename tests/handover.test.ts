// Giao ca (0144, Đợt 2 lịch 2 sàn). Số thật: phiên VERA Shopee 26/09 mã 41439111 chạy 18:00–00:30 qua ba ca; Sheet ghi
// ca 18–20 = 4.267.859 (ATC 228, 5.883 lượt xem). Link thật lấy từ "YFB _ Working File 2026 - NEW.xlsx".
// Chạy: npx vitest run tests/handover.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { fmtCount, handoverOwnerLabel, handoverShare, hasHandover, isHandoverPerson, parseCount, parseDashboardLink } = await import("../src/lib/handover");
const { missingSteps } = await import("../src/lib/sessionLedger");
import type { LiveSession } from "../src/types";

describe("parseDashboardLink", () => {
  test("link TikTok Shop thật trong Working File", () => {
    expect(
      parseDashboardLink("https://shop.tiktok.com/workbench/live/overview?room_id=7533601379126922040&region=vn&btm_ppre=a0.b0.c0.d0&btm_show_id=c3b377a0")
    ).toEqual({ platform: "TikTok", liveRef: "7533601379126922040" });
    expect(parseDashboardLink("https://shop.tiktok.com/workbench/live/trend-analysis?room_id=7533461903122287366&region=vn")?.liveRef).toBe("7533461903122287366");
  });
  test("link Shopee Creator Center thật", () => {
    expect(parseDashboardLink("  https://banhang.shopee.vn/creator-center/dashboard/live/41439111 ")).toEqual({ platform: "Shopee", liveRef: "41439111" });
  });
  test("chữ không phải link (Franklin ghi \"TikTok Ecommerce Live Data Screen\") ⇒ không đọc được", () => {
    expect(parseDashboardLink("TikTok Ecommerce Live Data Screen")).toBeNull();
    expect(parseDashboardLink("https://banhang.shopee.vn/creator-center/dashboard")).toBeNull();
    expect(parseDashboardLink("")).toBeNull();
  });
  test("cùng regex với private.parse_dashboard_link ở migration 0144", () => {
    const sql = readFileSync(new URL("../supabase/migrations/0144_session_handover.sql", import.meta.url), "utf8");
    expect(sql).toContain("'(?i)/live/([0-9]+)'");
    expect(sql).toContain("'(?i)room_id=([0-9]+)'");
    expect(sql).toContain("p_link ~* 'shopee\\.'");
  });
});

describe("số đang thấy trên dashboard", () => {
  test("parseCount nhận mọi kiểu viết nghìn", () => {
    expect(parseCount("11.513.359")).toBe(11513359);
    expect(parseCount("11,513,359")).toBe(11513359);
    expect(parseCount(" 5883 ")).toBe(5883);
    expect(parseCount("")).toBeNull();
    expect(fmtCount(11513359)).toBe("11.513.359");
  });
  test("ca nối: phần của ca = số đang thấy − ca trước cùng phòng", () => {
    const prev = { sessionId: "ca1", startTime: "18:00", endTime: "20:00", cumGmv: 4_267_859, cumOrders: null, cumViews: 5_883, cumAtc: 228 };
    expect(handoverShare({ cumGmv: 12_322_359, cumViews: 15_000, cumOrders: null, cumAtc: 600 }, prev)).toEqual({
      gmv: 8_054_500,
      views: 9_117,
      orders: null,
      atc: 372,
      belowPrevious: false
    });
    expect(handoverShare({ cumGmv: 4_000_000, cumViews: 0, cumOrders: null, cumAtc: null }, prev).belowPrevious).toBe(true);
    expect(handoverShare({ cumGmv: 4_267_859, cumViews: 5_883, cumOrders: 21, cumAtc: null }, null)).toMatchObject({ gmv: 4_267_859, orders: 21, belowPrevious: false });
  });
});

const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({ id: "s", brandId: "vera", brandName: "VERA", platform: "Shopee", date: "2026-10-05", startTime: "18:00", endTime: "20:00", status: "Completed", dataSource: "manual", isBackfill: false, hostId: "my", coHostId: "giang", coHostName: "Trà Giang", ...over }) as LiveSession;

describe("ai giao ca", () => {
  test("trợ live của ca giao; host thì không; ca không trợ ⇒ OPS", () => {
    expect(isHandoverPerson(ca(), "giang")).toBe(true);
    expect(isHandoverPerson(ca(), "my")).toBe(false);
    expect(isHandoverPerson(ca({ coHostId: undefined, staffSegments: [{ talentId: "thao", talentName: "Thảo", role: "co_host", fromMin: 60, toMin: 120 }] }), "thao")).toBe(true);
    expect(handoverOwnerLabel(ca())).toBe("Trợ live Trà Giang giao ca");
    expect(handoverOwnerLabel(ca({ coHostId: undefined, coHostName: undefined }))).toBe("Ca không có trợ — OPS giao ca");
  });
  test("bước còn thiếu: TikTok up file → giao ca → đối soát; Shopee giao ca → đối soát (user chốt 06/10 tối)", () => {
    expect(missingSteps(ca({ platform: "TikTok" }), "2026-10-06")).toEqual(["snapshot", "report", "reconcile"]);
    expect(missingSteps(ca({ platform: "TikTok", dataSource: "live_snapshot" }), "2026-10-06")).toEqual(["report", "reconcile"]);
    expect(missingSteps(ca(), "2026-10-06")).toEqual(["report", "reconcile"]);
    const done = ca({ report: { handoverAt: "2026-10-05T13:20:00Z", submittedAt: "2026-10-05T13:20:00Z" } as LiveSession["report"] });
    expect(hasHandover(done)).toBe(true);
    expect(missingSteps(done, "2026-10-06")).toEqual(["reconcile"]);
  });
});
