// Action plan Report Tháng (27/10) — ví dụ lấy từ deck CROCS T9 slide 31 ("GMV/giờ Daily ≥ 19,9M (target T10)").
import { expect, test } from "vitest";
import type { LiveStats } from "../src/lib/report/monthlyReportInsights";
import {
  gradeAction,
  gradeHeadline,
  parseThreshold,
  readActionPlan,
  trackLabel,
  type ActionGradeContext,
  type ActionItem
} from "../src/lib/report/actionPlan";

const stats = (gmv: number, hours: number, extra: Partial<LiveStats> = {}): LiveStats => ({
  sessions: 10, gmv, hours, views: 1000, orders: 100, skuOrders: 100, itemsSold: 106, productImpressions: 1, productClicks: 8000,
  gmvPerHour: gmv / hours, viewsPerHour: 1000 / hours, gmvPerView: gmv / 1000, ctr: null, ctor: 1.25, aov: null,
  upt: 1.06, avgPrice: null, liveCtr: 52, impressions: 0, errViews: 0, impressionHours: 0, watchSecViews: 0, watchViews: 0,
  err: null, avgViewSec: null, impressionsPerHour: null, ...extra
});

// T10 giả định: Daily 2,2B / 116h = 18,97M/giờ (dưới 19,9M); cả tháng 5,0B trên target 5,14B.
const ctx = (final: boolean): ActionGradeContext => ({
  stats: { all: stats(5_000_000_000, 230), daily: stats(2_200_000_000, 116), dday: stats(1_100_000_000, 37), midmonth: null, payday: stats(900_000_000, 40) },
  targets: { all: 5_141_294_000, daily: 2_313_582_300, dday: 1_079_671_740, midmonth: 822_607_040, payday: 925_432_920 },
  final
});

const item = (over: Partial<ActionItem>): ActionItem => ({ id: "x", action: "Việc", basis: "", target: null, trackText: "", manual: null, ...over });

test("ngưỡng gõ tay: chấm là nghìn, phẩy là thập phân, hậu tố M/B/tr chỉ cho tiền và số đếm", () => {
  expect(parseThreshold("19,9M", "money")).toBeCloseTo(19_900_000);
  expect(parseThreshold("19.900.000", "money")).toBe(19_900_000);
  expect(parseThreshold("1,25B", "money")).toBe(1_250_000_000);
  expect(parseThreshold("1,2 tr", "money")).toBeCloseTo(1_200_000);
  expect(parseThreshold("4.298", "int")).toBe(4298);
  expect(parseThreshold("1,25%", "pct2")).toBe(1.25);
  expect(parseThreshold("1.5", "dec2")).toBe(1.5);
  expect(parseThreshold("5M", "pct2")).toBeNull();
  expect(parseThreshold("abc", "money")).toBeNull();
  expect(parseThreshold("1,2,3", "money")).toBeNull();
});

test("chấm có cấu trúc: GMV/giờ Daily ≥ 19,9M — tháng đã hết thì Đạt / Chưa đạt", () => {
  const a = item({ target: { metric: "gmvPerHour", scope: "daily", op: "gte", value: 19_900_000 } });
  expect(trackLabel(a)).toBe("GMV/giờ · Daily ≥ 19.900.000");
  const g = gradeAction(a, ctx(true));
  expect(g.status).toBe("missed");
  expect(g.actualText).toBe("18.965.517");
  expect(gradeAction({ ...a, target: { ...a.target!, value: 18_000_000 } }, ctx(true)).status).toBe("met");
  // ≤ đảo chiều.
  expect(gradeAction({ ...a, target: { ...a.target!, op: "lte" } }, ctx(true)).status).toBe("met");
});

test("% Target chia đúng target của phạm vi; tháng chưa hết thì không nói đạt/chưa đạt", () => {
  const a = item({ target: { metric: "pctTarget", scope: "all", op: "gte", value: 95 } });
  const g = gradeAction(a, ctx(true));
  expect(g.actual).toBeCloseTo(97.25, 1);
  expect(g.status).toBe("met");
  const mid = gradeAction(a, ctx(false));
  expect(mid.status).toBe("tracking");
  expect(mid.onTrack).toBeNull();
  // Chỉ số tỷ lệ giữa tháng thì nói được đang ở phía nào.
  const ctor = gradeAction(item({ target: { metric: "ctor", scope: "all", op: "gte", value: 1.2 } }), ctx(false));
  expect(ctor).toMatchObject({ status: "tracking", onTrack: true });
});

test("phạm vi không có phiên ⇒ Không có số (không phải Chưa đạt); việc bằng chữ ⇒ chờ ops chấm", () => {
  expect(gradeAction(item({ target: { metric: "gmvPerHour", scope: "midmonth", op: "gte", value: 1 } }), ctx(true)).status).toBe("nodata");
  const manual = item({ trackText: "Số creator hoạt động" });
  expect(gradeAction(manual, ctx(true)).status).toBe("awaiting");
  expect(gradeAction({ ...manual, manual: { status: "met", at: "2026-11-02" } }, ctx(true))).toMatchObject({ status: "met", manual: true });
  expect(trackLabel(manual)).toBe("Số creator hoạt động");
});

test("câu mở khối kết quả đếm đúng; tháng dở chỉ nói đang theo dõi", () => {
  const items = [
    item({ target: { metric: "gmvPerHour", scope: "daily", op: "gte", value: 19_900_000 } }),
    item({ target: { metric: "pctTarget", scope: "all", op: "gte", value: 95 } }),
    item({ trackText: "Số creator hoạt động" })
  ];
  expect(gradeHeadline("Tháng 10", items.map((i) => gradeAction(i, ctx(true))), true)).toBe("Tháng 10: 1/3 việc đạt · 1 chưa đạt · 1 chưa chấm được.");
  expect(gradeHeadline("Tháng 10", items.map((i) => gradeAction(i, ctx(false))), false)).toContain("chưa hết");
});

test("đọc jsonb: bỏ dòng hỏng, chỉ tiêu sai kiểu thành chỉ tiêu bằng chữ, ops chấm chỉ giữ cho việc không có số", () => {
  const p = readActionPlan({
    savedAt: "2026-10-27",
    items: [
      { id: "1", action: "Rà GMV/giờ", basis: "Hour +9%", target: { metric: "gmvPerHour", scope: "daily", op: "gte", value: 19_900_000 }, manual: { status: "met", at: "x" } },
      { id: "2", action: "  ", basis: "trống" },
      { id: "3", action: "Quyết định Linh Ân", target: { metric: "khong-co", scope: "all", op: "gte", value: 1 }, trackText: "GMV/giờ, CTOR", manual: { status: "missed", at: "x" } },
      "rác"
    ]
  })!;
  expect(p.items.map((i) => i.id)).toEqual(["1", "3"]);
  expect(p.items[0].manual).toBeNull();
  expect(p.items[1]).toMatchObject({ target: null, manual: { status: "missed" } });
  expect(readActionPlan({ items: [] })).toBeNull();
  expect(readActionPlan(null)).toBeNull();
});
