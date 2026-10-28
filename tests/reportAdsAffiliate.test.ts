import { expect, test } from "vitest";
import { adsDayPoints, adsPhaseRows, adsRoasRows, adsTypeRows, dayRuns } from "../src/lib/report/adsSlide";
import { affiliateTrackColumns, affiliateTrackGroups, affiliateTrackTotals } from "../src/lib/report/affiliateTrack";
import { adsTrackingMonth, type AdsDayRow } from "../src/lib/ads/adsTracking";
import type { AffiliateActualEntry } from "../src/types";

const side = (live: number, product: number, creator: number) => ({ total: live + product + creator, live, product, creator });
const rows: AdsDayRow[] = [
  { date: "2026-10-01", ttsTarget: null, target: side(4, 0, 0), actual: side(5, 0, 0), note: null },
  { date: "2026-10-02", ttsTarget: null, target: side(6, 2, 2), actual: side(3, 1, 1), note: null },
  { date: "2026-10-03", ttsTarget: null, target: side(10, 0, 0), actual: null, note: null }
];
const bucketOf = (d: string) => (d === "2026-10-02" ? ("dday" as const) : ("daily" as const));

test("bảng theo loại chi cắt luỹ kế ở ngày cuối có số, Target tháng gồm cả ngày chưa tới", () => {
  const t = adsTypeRows(rows, "2026-10");
  const total = t.find((r) => r.key === "total")!;
  expect(total.mtdTarget).toBe(14);
  expect(total.mtdActual).toBe(10);
  expect(total.delta).toBeCloseTo((10 / 14 - 1) * 100, 6);
  expect(total.monthTarget).toBe(24);
  expect(total.pctMonth).toBeCloseTo((10 / 24) * 100, 6);
  expect(t.find((r) => r.key === "live")!.mtdActual).toBe(8);
});

test("bảng theo giai đoạn: tỷ trọng chi cộng 100%, bỏ ngày chưa có số", () => {
  const p = adsPhaseRows(rows, "2026-10", bucketOf);
  expect(p.map((r) => r.bucket)).toEqual(["dday", "daily"]);
  expect(p.reduce((a, r) => a + (r.share ?? 0), 0)).toBeCloseTo(100, 6);
  expect(p.find((r) => r.bucket === "dday")!.days).toBe(1);
});

test("điểm theo ngày phủ cả tháng, ngày chưa có số không có cột", () => {
  const pts = adsDayPoints(rows, "2026-10", bucketOf);
  expect(pts).toHaveLength(31);
  expect(pts[2].hasActual).toBe(false);
  expect(pts[2].target).toBe(10);
  expect(pts[10].target).toBeNull();
  const gray = dayRuns(pts, (p) => (p.hasActual ? null : "x"));
  expect(gray).toEqual([{ from: 3, to: 31, label: "x" }]);
});

test("ROAS Live theo loại ngày dùng LIVE GMV cùng ngày", () => {
  const s = adsTrackingMonth(rows, "2026-10", bucketOf, new Map([["2026-10-01", 100], ["2026-10-02", 30]]));
  const r = adsRoasRows(s);
  expect(r.find((x) => x.bucket === "daily")!.roas).toBe(20);
  expect(r.find((x) => x.bucket === "dday")!.roas).toBe(10);
});

const e = (o: Partial<AffiliateActualEntry>): AffiliateActualEntry => ({ brandId: "b", periodMonth: "2026-10-01", creatorName: "A", status: "done", ...o });

test("cột Affiliate: chỉ phiên đã live, sắp theo ngày, tính % Target / GMV/giờ / ROAS", () => {
  const cols = affiliateTrackColumns([
    e({ id: "2", creatorName: "B", liveDateLabel: "24/10", directGmv: 100, targetGmv: 200, durationHours: 5, adsCost: 10, planTimelineLabel: "10:00-15:00" }),
    e({ id: "1", creatorName: "A", liveDateLabel: "9/10", directGmv: 60, targetGmv: 50, durationHours: 2, adsCost: 20, campName: "D-Day" }),
    e({ id: "3", status: "planned", liveDateLabel: "30/10", directGmv: 0 })
  ]);
  expect(cols.map((c) => c.creator)).toEqual(["A", "B"]);
  expect(cols[0].pctTarget).toBe(120);
  expect(cols[0].gmvPerHour).toBe(30);
  expect(cols[1].roas).toBe(10);
  expect(cols[1].hasPlan).toBe(true);
  expect(cols[0].hasPlan).toBe(true); // targetGmv != null
  const t = affiliateTrackTotals(cols);
  expect(t.directGmv).toBe(160);
  expect(t.hours).toBe(7);
  expect(t.gmvPerHour).toBeCloseTo(160 / 7, 6);
  expect(t.pctTarget).toBeCloseTo((160 / 250) * 100, 6);
  expect(t.roas).toBeCloseTo(160 / 30, 6);
});

test("nhóm hàng theo phễu live, đúng 5 hàng khoá và đủ hàng theo yêu cầu", () => {
  const g = affiliateTrackGroups({ money: String, int: String, fixed: (v, d = 0) => v.toFixed(d) });
  expect(g.map((x) => x.group)).toEqual(["Kế hoạch", "Kết quả", "Lưu lượng", "Chuyển đổi", "Giỏ hàng", "Chi phí Ads"]);
  const rowsAll = g.flatMap((x) => x.rows);
  expect(rowsAll.filter((r) => r.key).map((r) => r.label)).toEqual(["Target GMV", "Direct GMV", "% Target", "GMV/giờ", "ROAS"]);
  expect(rowsAll).toHaveLength(20);
});
