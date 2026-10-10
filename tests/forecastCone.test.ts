// Dải tin cậy dự phóng + khả năng đạt target + phương án xử lý (lib/performance/forecastCone.ts, handlingPlan.ts).
// Chạy: npx vitest run tests/forecastCone.test.ts
import { describe, expect, test } from "vitest";
import { combineCones, coneOf, coneHalf, forecastFlags, landingOf, normalCdf, CONE_COEF } from "../src/lib/performance/forecastCone";
import { dayElasticity, handlingPlan } from "../src/lib/performance/handlingPlan";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { addDays } from "../src/lib/dateUtils";
import { LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `c${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 5_000, ctrAvg: 0, cvrAvg: 0, productImpressions: 100_000, productClicks: 3_000,
    liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const open = (date: string, extra: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id: `sl-${date}-${seq++}`, date, startTime: "20:00", endTime: "23:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioName: "", notes: "", status: "open", ...extra }) as ShiftSlot;

/** Lịch sử 1–9/09 mỗi ngày một ca 3h × 30M (10M/giờ); hôm nay 10/09; ca tương lai 11–30/09 (trừ ngày camp 13–15 và 23–25). */
function scenario(opts: { targetTotal?: number; futureDays?: number; extraOpen?: number } = {}) {
  const hist: LiveSession[] = [];
  for (let d = 1; d <= 9; d++) hist.push(ca(`2026-09-0${d}`));
  const future: LiveSession[] = [];
  const nFuture = opts.futureDays ?? 20;
  for (let i = 0; i < nFuture; i++) future.push(ca(addDays("2026-09-11", i), { status: "Upcoming", actualGmv: 0, totalViews: 0, totalOrders: 0 }));
  const opens = Array.from({ length: opts.extraOpen ?? 0 }, (_, i) => open(addDays("2026-09-11", i)));
  const target = opts.targetTotal ? monthTargetOf("2026-09", opts.targetTotal, [{ date: "2026-09-05", target: opts.targetTotal }]) : null;
  const o = monthOutlook("2026-09", "2026-09-10", [...hist, ...future], opens, target, undefined);
  return { o, sessions: [...hist, ...future] };
}

describe("normalCdf", () => {
  test("điểm chuẩn", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2816)).toBeCloseTo(0.9, 3);
    expect(normalCdf(-1.2816)).toBeCloseTo(0.1, 3);
    expect(normalCdf(3)).toBeGreaterThan(0.998);
  });
});

describe("coneOf — dải rộng dần theo phần còn lại", () => {
  test("cuối dải = 35% phần dự phóng còn lại; ngày cuối có số dải bằng 0", () => {
    const { o } = scenario();
    const c = coneOf(o);
    const first = c.points[0], last = c.points[c.points.length - 1];
    expect(first.hi - first.lo).toBe(0);
    expect(last.mid).toBeCloseTo(o.projected, 0);
    expect(CONE_COEF).toBe(0.35); // user chốt 09/10 — đổi hệ số = chạy lại backtest 13 kênh-tháng
    expect(last.hi - last.mid).toBeCloseTo(0.35 * (o.projected - o.actual), 0);
    expect(c.hi - c.lo).toBeCloseTo(2 * coneHalf(o.actual, o.projected), 0);
    // đơn điệu: càng xa càng rộng
    const widths = c.points.map((p) => p.hi - p.lo);
    for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1] - 1e-6);
  });
  test("không chiếu theo giờ (không còn ca) ⇒ không có dải", () => {
    const { o } = scenario({ futureDays: 0 });
    expect(coneOf(o).points).toEqual([]);
  });
});

describe("landingOf — khả năng đạt target", () => {
  test("dự phóng đúng bằng target ⇒ ~50%", () => {
    const { o } = scenario();
    const l = landingOf({ ...o, target: { total: o.projected, byDate: new Map() } });
    expect(l.pHit).toBeCloseTo(0.5, 2);
    expect(l.key).toBe("likely");
  });
  test("target cách xa một dải ⇒ chắc đạt / sẽ hụt", () => {
    const { o } = scenario();
    const half = coneHalf(o.actual, o.projected);
    expect(landingOf({ ...o, target: { total: o.projected - 1.5 * half, byDate: new Map() } }).key).toBe("safe");
    expect(landingOf({ ...o, target: { total: o.projected + 1.5 * half, byDate: new Map() } }).key).toBe("short");
  });
  test("ngưỡng giữa các nhãn: z=0,8 (≈79%) là 'có thể đạt', z=1,5 (≈93%) mới 'chắc đạt'; z=−0,5 (≈31%) 'khó đạt'", () => {
    const { o } = scenario();
    const sigma = coneHalf(o.actual, o.projected) / 1.2816;
    const at = (z: number) => landingOf({ ...o, target: { total: o.projected - z * sigma, byDate: new Map() } });
    expect(at(0.8).pHit).toBeCloseTo(0.788, 2);
    expect(at(0.8).key).toBe("likely");
    expect(at(1.5).key).toBe("safe");
    expect(at(-0.5).key).toBe("unlikely");
    expect(at(-1).key).toBe("short");
  });
  test("không target ⇒ không có xác suất; tháng hết ⇒ 0/1 dứt khoát", () => {
    const { o } = scenario();
    expect(landingOf({ ...o, target: null })).toMatchObject({ key: "no_target", pHit: null });
    const done = { actual: 100, projected: 100, projectionMethod: "gmv_per_hour" as const };
    expect(landingOf({ ...done, target: { total: 90, byDate: new Map() } }).pHit).toBe(1);
    expect(landingOf({ ...done, target: { total: 110, byDate: new Map() } }).pHit).toBe(0);
  });
});

describe("combineCones — các kênh độc lập cộng theo căn bậc hai", () => {
  test("hai kênh bằng nhau ⇒ nửa dải = √2 × một kênh, nhỏ hơn cộng thẳng", () => {
    const a = { actual: 100, projected: 300 };
    const c = combineCones([a, a]);
    expect(c.projected).toBe(600);
    expect(c.half).toBeCloseTo(Math.SQRT2 * coneHalf(100, 300), 6);
    expect(c.half).toBeLessThan(2 * coneHalf(100, 300));
  });
});

describe("forecastFlags", () => {
  test("ca mở chiếm ≥ 10% phần còn lại và ca đã chạy chưa có số đều được gắn cờ", () => {
    const { o } = scenario({ extraOpen: 5 });
    const past = { ...o, pending: [...o.pending, { date: "2026-09-08", hours: 3, forecast: 30_000_000, kind: "session" as const, bucket: "daily" as const }] };
    const flags = forecastFlags(past, "2026-09-10");
    expect(flags.some((f) => /chưa có số/.test(f.text))).toBe(true);
    expect(flags.some((f) => /ca mở chưa có người/.test(f.text))).toBe(true);
  });
  test("không chiếu được ⇒ cờ cảnh báo duy nhất", () => {
    const flags = forecastFlags({ pending: [], rates: null, projectionMethod: "none", actual: 0, projected: 0 }, "2026-09-10");
    expect(flags).toHaveLength(1);
    expect(flags[0].level).toBe("warn");
  });
});

describe("dayElasticity", () => {
  const mk = (n: number, hoursOf: (i: number) => number, gmvOf: (h: number) => number) => {
    const out: LiveSession[] = [];
    for (let i = 0; i < n; i++) {
      const h = hoursOf(i);
      out.push(ca(addDays("2026-08-01", i), { startTime: "10:00", endTime: `${String(10 + Math.floor(h)).padStart(2, "0")}:${h % 1 ? "30" : "00"}`, actualGmv: gmvOf(h) }));
    }
    return out;
  };
  test("GMV ∝ giờ^0,8 ⇒ hồi quy ra 0,8", () => {
    const xs = mk(25, (i) => 2 + (i % 5), (h) => 10_000_000 * Math.pow(h, 0.8));
    // loại ngày camp: 8/13–15 không rơi vào 1–25/08 ngoài D-Day 6–8/08 ⇒ bỏ ca ở các ngày đó
    const e = dayElasticity(xs, "2026-08-25");
    expect(e.reliable).toBe(true);
    expect(e.value).toBeGreaterThan(0.7);
    expect(e.value).toBeLessThanOrEqual(1);
  });
  test("ít ngày hoặc giờ không đổi ⇒ không đo được, dùng 1", () => {
    expect(dayElasticity(mk(5, () => 3, () => 30_000_000), "2026-08-05")).toMatchObject({ value: 1, reliable: false });
    expect(dayElasticity(mk(25, () => 3, (h) => 30_000_000 * h), "2026-08-25")).toMatchObject({ value: 1, reliable: false });
  });
});

describe("handlingPlan", () => {
  test("không target ⇒ chế độ no_target, không đòn bẩy tăng giờ", () => {
    const { o, sessions } = scenario();
    const p = handlingPlan({ outlook: o, today: "2026-09-10", sessions });
    expect(p.mode).toBe("no_target");
    expect(p.levers.find((l) => l.id === "add_hours")).toBeUndefined();
  });
  test("thiếu target ⇒ có đòn bẩy thêm giờ, số giờ ≈ thiếu ÷ GMV/giờ, và ca mở được nêu riêng", () => {
    const base = scenario();
    const target = base.o.projected * 1.3;
    const { o, sessions } = scenario({ targetTotal: target, extraOpen: 4 });
    const p = handlingPlan({ outlook: o, today: "2026-09-10", sessions });
    expect(["short", "unlikely"]).toContain(p.mode);
    const add = p.levers.find((l) => l.id === "add_hours")!;
    expect(add).toBeTruthy();
    expect(add.hours).toBeGreaterThan(0);
    // GMV/giờ = 10M, co giãn không đo được (=1) ⇒ giờ cần = thiếu ÷ 10M
    expect(add.hours!).toBe(Math.ceil((p.gap ?? 0) / 10_000_000));
    expect(p.levers.find((l) => l.id === "open_slots")!.hours).toBe(12);
    expect(p.needRate).not.toBeNull();
  });
  test("giờ thêm tính theo GMV/giờ × co giãn (đo được < 1) chứ không theo GMV/giờ trung bình", () => {
    const hist: LiveSession[] = [];
    let i = 0;
    for (let d = "2026-07-25"; d <= "2026-09-19"; d = addDays(d, 1), i++) {
      const h = 2 + (i % 5);
      hist.push(ca(d, { startTime: "10:00", endTime: `${String(10 + h).padStart(2, "0")}:00`, actualGmv: 10_000_000 * Math.pow(h, 0.6) }));
    }
    const future = Array.from({ length: 10 }, (_, k) => ca(addDays("2026-09-21", k), { status: "Upcoming", actualGmv: 0, totalViews: 0, totalOrders: 0, startTime: "10:00", endTime: "13:00" }));
    const sessions = [...hist, ...future];
    const base = monthOutlook("2026-09", "2026-09-20", sessions, [], null, undefined);
    // Thiếu nhỏ (3%) để không chạm trần +30% của mốc điều chỉnh (engine target v3).
    const target = monthTargetOf("2026-09", base.projected * 1.03, [{ date: "2026-09-05", target: base.projected * 1.03 }]);
    const o = monthOutlook("2026-09", "2026-09-20", sessions, [], target, undefined);
    const p = handlingPlan({ outlook: o, today: "2026-09-20", sessions });
    expect(p.elasticity.reliable).toBe(true);
    expect(p.elasticity.value).toBeGreaterThan(0.5);
    expect(p.elasticity.value).toBeLessThan(0.8);
    expect(p.marginalRate!).toBeCloseTo(o.rates!.daily * p.elasticity.value, 3);
    expect(p.marginalRate!).toBeLessThan(o.rates!.daily);
    // 10/10: giờ cần theo công thức mốc điều chỉnh ((R̂ + thiếu) ÷ R̂)^(1 ÷ co giãn) − 1 trên giờ còn lại — co giãn < 1 ⇒ cần NHIỀU
    // giờ hơn cách tỷ lệ thẳng (thiếu ÷ GMV/giờ trung bình của phần còn lại).
    const add = p.levers.find((l) => l.id === "add_hours")!;
    const R = p.futureForecast;
    const need = p.remainingHours * (Math.pow((R + p.gap!) / R, 1 / p.elasticity.value) - 1);
    expect(p.checkpoint!.capped).toBe(false);
    expect(add.hours).toBe(Math.ceil(need));
    expect(need).toBeGreaterThan(p.gap! / (R / p.remainingHours));
  });
  test("vượt xa target ⇒ chế độ chắc đạt, đòn bẩy mở rộng + đề xuất nâng target", () => {
    const base = scenario();
    const { o, sessions } = scenario({ targetTotal: base.o.projected * 0.6 });
    const p = handlingPlan({ outlook: o, today: "2026-09-10", sessions });
    expect(p.mode).toBe("safe");
    expect(p.levers.map((l) => l.id)).toEqual(expect.arrayContaining(["scale_hours", "raise_target"]));
    expect(p.levers.find((l) => l.id === "add_hours")).toBeUndefined();
  });
  test("ca đã chạy chưa có số xếp đầu danh sách (sửa số trước khi bàn đòn bẩy)", () => {
    const base = scenario();
    const { o, sessions } = scenario({ targetTotal: base.o.projected * 1.3 });
    const withMissing = { ...o, pending: [...o.pending, { date: "2026-09-08", hours: 3, forecast: 30_000_000, kind: "session" as const, bucket: "daily" as const }] };
    const p = handlingPlan({ outlook: withMissing, today: "2026-09-10", sessions });
    expect(p.levers[0].id).toBe("data_missing");
  });
});
