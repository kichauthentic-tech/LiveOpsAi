// Engine target v3 — dự báo GMV tháng (lib/performance/monthForecast.ts) + gốc lỗi đếm camp hai lần ở suggestEngine (2026-10-10).
// Chạy: npx vitest run tests/monthForecast.test.ts
import { describe, expect, test } from "vitest";
import {
  activeCheckpoint,
  backtestMonthForecast,
  buildMonthForecaster,
  checkpointAdvice,
  checkpointsOf,
  inMonthProjection,
  leadingSignalCheck,
  planOutlook,
  schemeShareOf,
  slotForecasts
} from "../src/lib/performance/monthForecast";
import { monthOutlook } from "../src/lib/performance/ceoBrief";
import { buildHistory, estimateSlots } from "../src/lib/scheduling/suggestEngine";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { eachDay } from "../src/lib/dateUtils";
import { LiveSession } from "../src/types";

const P = DEFAULT_ENGINE_PARAMS;
const fixed = (d: string) => resolveCampBucketType(d);
let seq = 0;
function ca(date: string, startTime: string, hours: number, gmvPerHour: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  const h = Number(startTime.slice(0, 2)) + hours;
  return {
    id: `s${seq}`, title: "", brandId: "b", brandName: "B", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "", hostName: "", assistantName: "", coHostName: "", platform: "TikTok", date, startTime,
    endTime: `${String(Math.floor(h) % 24).padStart(2, "0")}:00`, status: "Completed", targetGmv: 0, actualGmv: gmvPerHour * hours,
    totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: hours * 60,
    dataSource: "tiktok_reconciled", ...extra
  } as LiveSession;
}
const wob = (i: number) => 1 + (((i * 7919) % 11) - 5) * 0.01;

/** Mỗi ngày một ca 3h lúc 19h; ngày camp GMV/giờ = `camp` × ngày thường; mức tháng = `level[m]` (triệu/giờ). */
function world(levels: Record<string, number>, camp = 2.5, platform: "TikTok" | "Shopee" = "TikTok"): LiveSession[] {
  const out: LiveSession[] = [];
  let i = 0;
  for (const [m, lv] of Object.entries(levels)) {
    for (const d of eachDay(`${m}-01`, `${m}-28`)) {
      const mult = fixed(d) === "daily" ? 1 : camp;
      out.push(ca(d, "19:00", 3, lv * 1e6 * mult * wob(i++), { platform }));
    }
  }
  return out;
}

describe("gốc lỗi đếm uplift camp hai lần (buildHistory/estimateSlots)", () => {
  test("ngày thường dự báo theo mức ngày thường, ngày camp × hệ số camp — tổng tháng khớp thực tế", () => {
    const hist = world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 }, 2.5);
    const test = world({ "2026-09": 1 }, 2.5);
    const h = buildHistory(hist, "b", "2026-08-31", { params: P });
    const est = estimateSlots(h, test, {});
    const daily = test.findIndex((s) => fixed(s.date) === "daily");
    const dday = test.findIndex((s) => fixed(s.date) === "dday");
    // Trước bản sửa: ô (gồm cả ngày camp) ≈ 1,4M/giờ rồi nhân camp lần nữa ⇒ ngày thường +40%, cả tháng +30%.
    expect(est[daily] / test[daily].actualGmv).toBeGreaterThan(0.9);
    expect(est[daily] / test[daily].actualGmv).toBeLessThan(1.1);
    expect(est[dday] / test[dday].actualGmv).toBeGreaterThan(0.85);
    expect(est[dday] / test[dday].actualGmv).toBeLessThan(1.15);
    const total = est.reduce((a, v) => a + v, 0) / test.reduce((a, s) => a + s.actualGmv, 0);
    expect(Math.abs(total - 1)).toBeLessThan(0.08);
    expect(h.baseGmvPerHour).toBeLessThan(h.brandGmvPerHour);
  });
});

describe("buildMonthForecaster", () => {
  test("dưới 15 ca ⇒ null (nơi gọi rơi về cách cũ)", () => {
    expect(buildMonthForecaster(world({ "2026-08": 1 }).slice(0, 10), "2026-09", P)).toBeNull();
  });
  test("tổng tháng khớp khi mức không đổi; dải theo cỡ kênh", () => {
    const hist = world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 });
    const f = buildMonthForecaster(hist, "2026-09", P)!;
    const test = world({ "2026-09": 1 });
    const p = planOutlook(f, test, fixed, 0);
    expect(p.p50 / test.reduce((a, s) => a + s.actualGmv, 0)).toBeCloseTo(1, 1);
    expect(f.band).toBe(P.fcBandSmall); // 28 ca/tháng < 40 ⇒ kênh ít lịch sử
    expect(p.lo).toBeCloseTo(p.p50 * (1 - P.fcBandSmall), 0);
  });
  test("mức = trung bình nhân của mức gần đây và 3 tháng — tháng mới tăng thì dự báo tăng nhưng không bằng hẳn tháng mới", () => {
    const f = buildMonthForecaster(world({ "2026-06": 1, "2026-07": 1, "2026-08": 2 }), "2026-09", P)!;
    const p = planOutlook(f, world({ "2026-09": 1 }), fixed, 0).p50;
    const flat = planOutlook(buildMonthForecaster(world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 }), "2026-09", P)!, world({ "2026-09": 1 }), fixed, 0).p50;
    expect(p / flat).toBeGreaterThan(1.3);
    expect(p / flat).toBeLessThan(2);
  });
  test("lịch sử chỉ của tháng TRƯỚC tháng dự báo (không lộ số tháng đang đoán)", () => {
    const all = world({ "2026-07": 1, "2026-08": 1, "2026-09": 5 });
    const a = buildMonthForecaster(all, "2026-09", P)!;
    const b = buildMonthForecaster(all.filter((s) => s.date < "2026-09-01"), "2026-09", P)!;
    expect(a.level).toBeCloseTo(b.level, 6);
  });
  test("lẫn hai sàn ⇒ ném lỗi (dev/test)", () => {
    const mixed = [...world({ "2026-07": 1, "2026-08": 1 }), ...world({ "2026-07": 1 }, 2.5, "Shopee")];
    expect(() => buildMonthForecaster(mixed, "2026-09", P)).toThrow(/lẫn TikTok và Shopee/);
  });
  test("lệch các tháng trước được đo; tự hiệu chỉnh chỉ khi bật", () => {
    const hist = world({ "2026-05": 1, "2026-06": 1.3, "2026-07": 1.7, "2026-08": 2.2 });
    const off = buildMonthForecaster(hist, "2026-09", P)!;
    expect(off.pastErrors.length).toBeGreaterThanOrEqual(2);
    expect(off.pastErrors.every((e) => e.error < 0)).toBe(true); // tăng đều ⇒ luôn đoán thấp
    expect(off.biasFactor).toBe(1);
    const on = buildMonthForecaster(hist, "2026-09", { ...P, fcBiasCorrect: true })!;
    expect(on.biasFactor).toBeGreaterThan(1);
  });
});

describe("giờ vượt vùng lịch sử", () => {
  test("ngày có giờ gấp đôi p90 lịch sử: phần vượt chỉ tính fcOutOfRangeFactor", () => {
    const f = buildMonthForecaster(world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 }), "2026-09", P)!;
    const one = [{ date: "2026-09-02", startTime: "19:00", endTime: "22:00" }];
    const two = [...one, { date: "2026-09-02", startTime: "13:00", endTime: "16:00" }];
    const a = slotForecasts(f, one, fixed).reduce((x, y) => x + y, 0);
    const b = slotForecasts(f, two, fixed).reduce((x, y) => x + y, 0);
    const linear = slotForecasts({ ...f, params: { ...f.params, fcOutOfRangeFactor: 1 } }, two, fixed).reduce((x, y) => x + y, 0);
    expect(b / linear).toBeCloseTo(0.75, 1); // 3h trong vùng + 3h × 0,5
    expect(b).toBeGreaterThan(a);
    expect(planOutlook(f, two, fixed, 0).excessHours).toBeCloseTo(3, 5);
  });
});

describe("planOutlook — khả năng đạt", () => {
  test("target = P50 ⇒ 50%; target thấp hơn nhiều ⇒ gần 100%", () => {
    const f = buildMonthForecaster(world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 }), "2026-09", P)!;
    const test = world({ "2026-09": 1 });
    const p50 = planOutlook(f, test, fixed, 0).p50;
    expect(planOutlook(f, test, fixed, p50).pHit).toBeCloseTo(0.5, 5);
    expect(planOutlook(f, test, fixed, p50 * 0.5).pHit!).toBeGreaterThan(0.98); // dải ±30% ⇒ σ ≈ 23%: nửa P50 cách 2,1σ
    expect(planOutlook(f, test, fixed, 0).pHit).toBeNull();
  });
});

describe("inMonthProjection", () => {
  const f = buildMonthForecaster(world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 }), "2026-09", { ...P, fcCredibility: 0 })!;
  const month = world({ "2026-09": 1 });
  test("nửa tháng đầu bán 80% kỳ vọng ⇒ phần còn lại chiếu 80% (tin hẳn khi c = 0)", () => {
    const exp = slotForecasts(f, month, fixed);
    const items = month.map((s, i) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.date <= "2026-09-14" ? exp[i] * 0.8 : null }));
    const r = inMonthProjection(f, items, fixed);
    expect(r.ratio).toBeCloseTo(0.8, 6);
    const restExp = exp.reduce((a, v, i) => a + (items[i].actual === null ? v : 0), 0);
    expect(r.projected - r.actual).toBeCloseTo(restExp * 0.8, 0);
  });
  test("ca đã qua chưa có số KHÔNG bị coi là 0", () => {
    const exp = slotForecasts(f, month, fixed);
    const items = month.map((s, i) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.date <= "2026-09-10" && i % 2 === 0 ? exp[i] : null }));
    expect(inMonthProjection(f, items, fixed).ratio).toBeCloseTo(1, 6);
  });
  test("độ tin c > 0 kéo một phần về mức lúc lập", () => {
    const g = { ...f, params: { ...f.params, fcCredibility: 0.5 } };
    const exp = slotForecasts(f, month, fixed);
    const items = month.map((s, i) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.date <= "2026-09-05" ? exp[i] * 0.5 : null }));
    const r = inMonthProjection(g, items, fixed);
    expect(r.level / f.level).toBeGreaterThan(0.5);
    expect(r.level / f.level).toBeLessThan(1);
  });
});

describe("monthOutlook dùng engine v3 khi đủ lịch sử", () => {
  test("forecastModel = shape, dải theo kênh, dự phóng gần thực tế cả tháng", () => {
    const hist = world({ "2026-06": 1, "2026-07": 1, "2026-08": 1 });
    const sep = world({ "2026-09": 1 });
    const cut = "2026-09-15";
    const masked = [...hist, ...sep.map((s) => (s.date > cut ? { ...s, status: "Upcoming" as const, actualGmv: 0, totalViews: 0, dataSource: "manual" as const } : s))];
    const o = monthOutlook("2026-09", cut, masked, [], null, undefined);
    expect(o.forecastModel).toBe("shape");
    expect(o.coneCoef).toBe(P.fcBandSmall);
    const actual = sep.reduce((a, s) => a + s.actualGmv, 0);
    expect(Math.abs(o.projected / actual - 1)).toBeLessThan(0.05);
  });
  test("chưa đủ lịch sử ⇒ cách cũ (GMV/giờ 28 ngày), không có hệ số dải riêng", () => {
    const few = world({ "2026-09": 1 }).filter((s) => s.date <= "2026-09-08");
    const o = monthOutlook("2026-09", "2026-09-08", few, [], null, undefined);
    expect(o.forecastModel).toBe("rate28");
    expect(o.coneCoef).toBeUndefined();
  });
});

describe("mốc điều chỉnh (P6)", () => {
  test("ba mốc theo khung camp của tháng, bỏ trùng, sắp theo ngày", () => {
    const camp = { dday: { start: "2026-10-08", end: "2026-10-11" } };
    const days = eachDay("2026-10-01", "2026-10-31");
    const cps = checkpointsOf("2026-10", days, (d) => resolveCampBucketType(d, camp));
    expect(cps.map((c) => `${c.key}@${c.date}`)).toEqual(["after_dday@2026-10-12", "after_midmonth@2026-10-16", "day20@2026-10-20"]);
    expect(activeCheckpoint(cps, "2026-10-10")).toBeNull();
    expect(activeCheckpoint(cps, "2026-10-17")?.key).toBe("after_midmonth");
  });
  test("co giãn 1, thiếu 10% phần còn lại ⇒ +10% giờ; co giãn < 1 cần nhiều hơn; kẹp trần", () => {
    const cp = { key: "day20" as const, date: "2026-10-20" };
    const a = checkpointAdvice(cp, 110, 100, 100, 50, 1, 0.3)!;
    expect(a.pct).toBeCloseTo(0.1, 6);
    expect(a.extraHours).toBeCloseTo(5, 6);
    expect(a.projectedAfter).toBeCloseTo(110, 6);
    const b = checkpointAdvice(cp, 110, 100, 100, 50, 0.8, 0.3)!;
    expect(b.pct).toBeGreaterThan(0.1);
    expect(b.projectedAfter).toBeCloseTo(110, 4);
    const c = checkpointAdvice(cp, 200, 100, 100, 50, 1, 0.3)!;
    expect(c.capped).toBe(true);
    expect(c.pct).toBeCloseTo(0.3, 6);
    expect(checkpointAdvice(cp, 90, 100, 100, 50, 1, 0.3)!.pct).toBe(0); // đang vượt: không cắt giờ
  });
});

describe("backtest + tín hiệu dẫn", () => {
  test("backtest walk-forward bỏ tháng đang chạy, mức không đổi ⇒ sai số nhỏ, mô phỏng đạt", () => {
    const ch = world({ "2026-05": 1, "2026-06": 1, "2026-07": 1, "2026-08": 1, "2026-09": 1, "2026-10": 1 });
    const r = backtestMonthForecast(ch, P, "2026-10-10");
    expect(r.folds.map((f) => f.month)).not.toContain("2026-10");
    expect(r.folds.length).toBeGreaterThanOrEqual(3);
    expect(r.planMape!).toBeLessThan(0.05);
    expect(r.within5AtDay18.hit).toBe(r.within5AtDay18.of);
    expect(r.reach95.hit).toBe(r.reach95.of);
  });
  test("dưới 3 tháng ⇒ chưa kết luận; quan hệ rõ ⇒ có lợi", () => {
    const few = leadingSignalCheck([{ month: "2026-08", planError: 0.1, adsBudget: 100, schemeShare: 0 }]);
    expect(few[0].slope).toBeNull();
    expect(few[1].months).toBe(0); // chưa nhập scheme nào
    // Ads gấp đôi ⇒ thực tế cao hơn dự báo 20% (dự báo chưa biết Ads).
    const rows = [50, 100, 200, 100, 50, 200].map((b, i) => ({ month: `2026-0${i + 1}`, planError: 1 / (1 + 0.2 * Math.log2(b / 100)) - 1, adsBudget: b, schemeShare: 0 }));
    const ads = leadingSignalCheck(rows)[0];
    expect(ads.months).toBe(6);
    expect(ads.helps).toBe(true);
    expect(ads.mapeAfter!).toBeLessThan(0.01);
  });
  test("phần ngày có scheme", () => {
    expect(schemeShareOf("2026-09", [{ start: "2026-09-01", end: "2026-09-15" }])).toBeCloseTo(0.5, 6);
    expect(schemeShareOf("2026-09", [])).toBe(0);
  });
});
