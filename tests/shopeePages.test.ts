// Report Shopee theo khung trang TikTok (29/10): cùng kỳ, ngưỡng dao động, tách nguyên nhân, bảng điểm Target.
import { describe, expect, test } from "vitest";
import { buildShopeeSnapshot, type ShopeeReportSnapshot } from "../src/lib/report/shopeeSnapshot";
import { shopeeCounts, shopeeDrivers, shopeeOutsideYfb, shopeeKmTable, shopeeMonths, shopeePageModel, shopeeScore, streamsOf } from "../src/lib/report/shopeePages";
import type { ShopeeStream } from "../src/lib/dataraw/shopeeFiles";

const stream = (date: string, time: string, hours: number, gmv: number, viewers: number, atc: number, orders = Math.round(gmv / 300_000)): ShopeeStream => ({
  no: 0, name: "live", date, time, startAt: `${date}T${time}:00+07:00`, durationSec: hours * 3600,
  viewers, engaged: Math.round(viewers * 0.1), comments: 0, atc, avgViewSec: 60, ordersPlaced: orders, ordersConfirmed: orders,
  itemsPlaced: orders, itemsConfirmed: orders, salesPlaced: gmv, salesConfirmed: gmv * 0.95
});
const month = (m: string, days: number, f: (d: number) => ShopeeStream) => Array.from({ length: days }, (_, i) => f(i + 1)).map((s) => ({ ...s, date: `${m}-${s.date}`, startAt: `${m}-${s.date}T${s.time}:00+07:00` }));
const dd = (d: number) => String(d).padStart(2, "0");

function snap(over: Partial<Parameters<typeof buildShopeeSnapshot>[0]> = {}): ShopeeReportSnapshot {
  // T9 đủ tháng: 3h/phiên, 6M, 1.000 viewers, 100 ATC. T10 tới 26/10: viewers giảm 30%, ATC/viewer giữ, GMV/ATC giữ.
  const prev = month("2026-09", 30, (d) => stream(dd(d), "20:00", 3, 6_000_000, 1000, 100));
  const cur = month("2026-10", 26, (d) => stream(dd(d), "20:00", 3, 4_200_000, 700, 70));
  return buildShopeeSnapshot({
    brandId: "b", month: "2026-10", sessions: [], streams: cur, days: [], products: [], overview: null,
    files: { live: true, daily: false, products: false, overview: false }, prev: null, stamps: [],
    history: [{ month: "2026-09", streams: prev }],
    computedAt: "2026-10-27T03:00:00Z",
    ...over
  });
}

describe("so cùng kỳ", () => {
  test("tháng còn dở ⇒ cắt mọi tháng tới ngày cuối có phiên", () => {
    const m = shopeeMonths(snap());
    expect(m.cutDay).toBe(26);
    expect(m.months.map((x) => x.month)).toEqual(["2026-09", "2026-10"]);
    expect(streamsOf(m.months[0], "all", m.cutDay)).toHaveLength(26);
  });
  test("chốt sau khi hết tháng ⇒ so cả tháng", () => {
    expect(shopeeMonths(snap({ computedAt: "2026-11-02T03:00:00Z" })).cutDay).toBeNull();
  });
});

describe("Key Metrics + ngưỡng dao động", () => {
  test("Viewers/giờ −30% vượt ngưỡng ⇒ down; ATC/Viewer không đổi ⇒ noise; Giờ live trung tính", () => {
    const s = snap();
    const t = shopeeKmTable(shopeeMonths(s), "all", 0.35);
    const row = (k: string) => t.rows.find((r) => r.def.key === k)!;
    expect(t.bands[1]).toBeCloseTo(196 * 0.35 * Math.sqrt(2 / 26), 5);
    expect(row("viewersPerHour").changes[1]).toBeCloseTo(-30, 5);
    expect(row("viewersPerHour").tones[1]).toBe("down");
    expect(row("atcRate").tones[1]).toBe("noise");
    expect(row("hours").tones[1]).toBe("neutral");
    // chỉ số quy mô đi theo Giờ live ⇒ không tô tốt/xấu dù đổi vượt ngưỡng
    expect(row("viewers").changes[1]).toBeCloseTo(-30, 5);
    expect(row("viewers").tones[1]).toBe("neutral");
  });
});

describe("tách nguyên nhân", () => {
  test("4 thừa số cộng đúng ΔGMV; toàn bộ phần giảm nằm ở Viewers/giờ", () => {
    const m = shopeeMonths(snap());
    const d = shopeeDrivers(shopeeCounts(streamsOf(m.months[0], "all", 26)), shopeeCounts(streamsOf(m.months[1], "all", 26)))!;
    expect(d.parts.map((p) => p.key)).toEqual(["hours", "viewersPerHour", "atcRate", "gmvPerAtc"]);
    expect(d.parts.reduce((a, p) => a + p.value, 0)).toBeCloseTo(d.delta, 3);
    expect(d.parts.find((p) => p.key === "viewersPerHour")!.value).toBeCloseTo(d.delta, 3);
  });
  test("bản chụp cũ thiếu ATC theo phiên ⇒ 3 thừa số", () => {
    const s = snap();
    const old = { ...s, streams: s.streams.map(({ atc: _a, ...x }) => x), history: s.history!.map((h) => ({ ...h, streams: h.streams.map(({ atc: _a, ...x }) => x) })) };
    const p = shopeePageModel(old);
    expect(p.drivers!.parts.map((x) => x.key)).toEqual(["hours", "viewersPerHour", "gmvPerViewer"]);
  });
});

describe("bảng điểm Target", () => {
  test("Target tới nay = ca kế hoạch tới ngày cuối có số; loại ngày theo khung camp", () => {
    const slots = Array.from({ length: 31 }, (_, i) => ({ date: `2026-10-${dd(i + 1)}`, startTime: "20:00", endTime: "23:00", targetGmv: 5_000_000 }));
    const s = snap({ plan: { targetGmv: 155_000_000, locked: true, slots } });
    const rows = shopeeScore(s, shopeeMonths(s));
    const all = rows.find((r) => r.key === "all")!;
    expect(all.target).toBe(155_000_000);
    expect(all.targetToDate).toBe(130_000_000);
    expect(all.actual).toBe(26 * 4_200_000);
    expect(all.pct).toBeCloseTo((26 * 4_200_000) / 130_000_000 * 100, 5);
    expect(all.requiredPerHour).toBeCloseTo(5_000_000 / 3, 3);
    // 10/10 D-Day (lịch cố định: 8–10/10) có trong bảng
    expect(rows.find((r) => r.key === "dday")!.sessions).toBe(3);
  });
  test("không có kế hoạch ⇒ không có % Target, không bịa", () => {
    const s = snap();
    const all = shopeeScore(s, shopeeMonths(s)).find((r) => r.key === "all")!;
    expect(all.target).toBeNull();
    expect(all.pct).toBeNull();
  });
});

describe("shopeeOutsideYfb — phiên Live List ngoài ca YFB", () => {
  const row = (date: string, time: string, gmv: number) => ({ date, time, hours: 2, gmv, confirmed: gmv, orders: 1, viewers: 100 });
  const ca = (date: string, startTime: string, endTime: string, status = "Completed") => ({ date, startTime, endTime, status }) as never;
  test("phiên trong ca (nới 30 phút), qua nửa đêm, ca huỷ không tính", () => {
    const r = shopeeOutsideYfb(
      [row("2026-10-01", "19:40", 10), row("2026-10-02", "00:30", 10), row("2026-10-03", "13:00", 30), row("2026-10-04", "20:00", 50)],
      [ca("2026-10-01", "20:00", "22:00"), ca("2026-10-01", "22:00", "01:00"), ca("2026-10-04", "20:00", "22:00", "Cancelled")]
    );
    expect(r.streams).toBe(2);
    expect(r.gmv).toBe(80);
    expect(r.share).toBeCloseTo(80);
  });
  test("không có Live List ⇒ share null", () => {
    expect(shopeeOutsideYfb([], []).share).toBeNull();
  });
});
