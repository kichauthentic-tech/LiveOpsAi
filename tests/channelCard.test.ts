// Thẻ kênh (21/10/2026) — lib/performance/channelCard.ts. Một kênh = một lần tính; các màn chỉ vẽ lại.
// Chạy: npx vitest run tests/channelCard.test.ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { agencyTodos, buildChannelCard, monthlyTrend, shownThroughOf, stableSinceOf, type ChannelCard } from "../src/lib/performance/channelCard";
import { dataCoverage } from "../src/lib/performance/channelHealth";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { buildAccountRunRate, resolveAsOf } from "../src/lib/performance/runRateUpdate";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import type { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed", dataSource: "tiktok_reconciled",
    targetGmv: 0, actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: gmv > 0 ? 5_000 : 0, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const shift = (id: string, date: string, sessionId?: string): ShiftSlot =>
  ({ id, date, startTime: "20:00", endTime: "23:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioName: "", notes: "", status: "finalized", sessionId }) as ShiftSlot;
const planSlot = (id: string, date: string, target: number, slotId?: string): BrandMonthPlanSlot =>
  ({ id, planId: "p", date, startTime: "20:00", endTime: "23:00", targetGmv: target, expectedGmv: 0, slotId, note: "" });
const plan = (status: "locked" | "draft" = "locked"): BrandMonthPlan =>
  ({ id: "p", brandId: "crocs", month: "2026-10", platform: "TikTok", status, defaultSlotHours: 3, liveWindowStart: "09:00", liveWindowEnd: "24:00", maxSlotsPerDay: 4, notes: "", blackoutDates: [], targetGmv: 0, campRanges: {}, groupTargets: {}, shopTargetGmv: 0, adsBudget: 0 }) as unknown as BrandMonthPlan;

/** 60 ngày lịch sử mỗi ngày một ca (đủ để engine v3 chiếu) + tháng 10 có kế hoạch 31 ca × 30M. */
function crocs(today = "2026-10-12") {
  const hist: LiveSession[] = [];
  for (let d = new Date("2026-08-01T00:00:00"); d < new Date("2026-10-01T00:00:00"); d.setDate(d.getDate() + 1)) hist.push(ca(d.toISOString().slice(0, 10), 28e6));
  const oct: LiveSession[] = [], shifts: ShiftSlot[] = [], slots: BrandMonthPlanSlot[] = [];
  for (let i = 1; i <= 31; i++) {
    const date = `2026-10-${String(i).padStart(2, "0")}`;
    const s = date < today ? ca(date, 27e6) : ca(date, 0, { status: "Upcoming", totalViews: 0, dataSource: "manual" });
    oct.push(s);
    shifts.push(shift(`sh${i}`, date, s.id));
    slots.push(planSlot(`ps${i}`, date, 30e6, `sh${i}`));
  }
  return { sessions: [...hist, ...oct], shifts, slots };
}
const input = (x: ReturnType<typeof crocs>, over: Partial<Parameters<typeof buildChannelCard>[0]> = {}) => ({
  brandId: "crocs", brandName: "CROCS", platform: "TikTok" as const, name: "CROCS", month: "2026-10", today: "2026-10-12",
  sessions: x.sessions, shiftSlots: x.shifts, plan: plan(), planSlots: x.slots, engineParams: DEFAULT_ENGINE_PARAMS, ...over
});

describe("buildChannelCard — một lần tính cho mọi màn", () => {
  test("'tới nay' đúng số của module Run-rate (planRunRate → buildAccountRunRate, tới ca mới nhất)", () => {
    const x = crocs();
    const card = buildChannelCard(input(x));
    const rr = planRunRate("2026-10", x.slots, x.shifts, x.sessions, "2026-10-12");
    const cov = dataCoverage(x.sessions, "2026-10-12", "2026-10-01", "2026-10-31");
    const module = buildAccountRunRate(rr, resolveAsOf("2026-10", rr.through, null, rr.through), cov.completeThrough);
    expect(card.pace?.runRate).toBe(module.total.runRate);
    expect(card.pace?.actual).toBe(module.total.actual);
    expect(card.pace?.asOf).toBe(module.asOf);
    expect(card.pace?.runRate).toBeCloseTo(0.9);
    expect(card.target).toBe(31 * 30e6);
  });

  test("có dự báo + nhãn một thang (forecastCone) khi kênh đủ lịch sử", () => {
    const card = buildChannelCard(input(crocs()));
    expect(card.newChannel).toBe(false);
    expect(card.forecast).not.toBeNull();
    expect(card.forecast!.lo).toBeLessThan(card.forecast!.p50);
    expect(card.landing).not.toBeNull();
    expect(["safe", "likely", "unlikely", "short"]).toContain(card.landing!.key);
    expect(card.state).toBe("live");
  });

  test("kênh mới (dưới 15 ca lịch sử) ⇒ không dự báo cuối tháng, không nhãn, có dòng giải thích (luật 3, user chốt 21/10)", () => {
    const x = crocs();
    const recent = x.sessions.filter((s) => s.date >= "2026-10-01");
    const card = buildChannelCard(input(x, { sessions: recent }));
    expect(card.newChannel).toBe(true);
    expect(card.forecast).toBeNull();
    expect(card.landing).toBeNull();
    expect(card.pace?.runRate).not.toBeNull();
    expect(card.causes.some((c) => c.key === "new_channel")).toBe(true);
  });

  test("chưa chốt kế hoạch ⇒ không target, không nhịp, việc = chốt kế hoạch", () => {
    const card = buildChannelCard(input(crocs(), { plan: plan("draft"), planSlots: null }));
    expect(card.state).toBe("no_plan");
    expect(card.target).toBeNull();
    expect(card.pace).toBeNull();
    expect(card.landing).toBeNull();
    expect(card.action?.kind).toBe("month_plan");
  });

  test("không ca, không kế hoạch ⇒ 'Không chạy'", () => {
    const card = buildChannelCard(input(crocs(), { sessions: [], plan: null, planSlots: null }));
    expect(card.state).toBe("off");
    expect(card.causes.map((c) => c.text)).toEqual(["Không có ca tháng 10, chưa có kế hoạch"]);
  });
});

describe("shownThroughOf — 'số đủ tới' không vượt ngày cuối có số", () => {
  test("ngày đủ số 19/10 nhưng 19/10 không có ca ⇒ hiện 18/10 (21/10: Franklin TikTok một màn 18/10, một màn 19/10)", () => {
    const xs = [ca("2026-10-17", 10e6), ca("2026-10-18", 10e6), ca("2026-10-20", 0, { totalViews: 0, dataSource: "manual" })];
    const cov = dataCoverage(xs, "2026-10-21", "2026-10-01", "2026-10-31");
    expect(cov.completeThrough).toBe("2026-10-19");
    expect(shownThroughOf(cov, xs)).toBe("2026-10-18");
  });
});

describe("stableSinceOf — dự báo đứng yên từ ngày nào", () => {
  const rows = [
    { month: "2026-10", asOf: "2026-10-10", kind: "daily", p50: 330 },
    { month: "2026-10", asOf: "2026-10-11", kind: "daily", p50: 386 },
    { month: "2026-10", asOf: "2026-10-14", kind: "daily", p50: 385 },
    { month: "2026-10", asOf: "2026-10-18", kind: "daily", p50: 368 }
  ];
  test("VERA TikTok: 386 → 368 trong ±5% ⇒ đứng từ 11/10; 10/10 lệch hơn 5% thì dừng", () => {
    expect(stableSinceOf(rows, "2026-10", 368, "2026-10-21")).toBe("2026-10-11");
  });
  test("mới đổi (< 3 ngày) hoặc khác hẳn mọi dòng sổ ⇒ không nói", () => {
    expect(stableSinceOf(rows, "2026-10", 300, "2026-10-21")).toBeNull();
    expect(stableSinceOf([...rows, { month: "2026-10", asOf: "2026-10-20", kind: "daily", p50: 420 }], "2026-10", 420, "2026-10-21")).toBeNull();
  });
});

describe("monthlyTrend — GMV/giờ 5 tháng", () => {
  test("tháng đang chạy cắt ở ngày đủ số; tháng không có ca = null", () => {
    const xs = [ca("2026-07-05", 30e6), ca("2026-10-05", 15e6), ca("2026-10-20", 99e6)];
    const t = monthlyTrend(xs, "2026-10", "2026-10-10");
    expect(t.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(t[0].gmvPerHour).toBeNull();
    expect(t[1].gmvPerHour).toBeCloseTo(10e6);
    expect(t[4].gmvPerHour).toBeCloseTo(5e6);
  });
});

describe("agencyTodos — tối đa 5, đỏ trước", () => {
  const base = (over: Partial<ChannelCard>): ChannelCard =>
    ({ key: "k", brandId: "b", brandName: "B", platform: "TikTok", name: "B", month: "2026-10", state: "live", target: 100e6, forecast: { p50: 80e6, lo: 70e6, hi: 90e6 }, landing: { key: "short", pHit: 0 }, coverage: { missingSessions: 0, oldestMissing: null }, commitment: null, ...over }) as unknown as ChannelCard;
  test("số chờ, báo hụt, chốt tháng sau, kênh không chạy", () => {
    const cards = [
      base({ key: "a", name: "Franklin", coverage: { missingSessions: 2, oldestMissing: "2026-10-19" } as never }),
      base({ key: "b", name: "VERA", landing: { key: "safe", pHit: 0.9 } }),
      base({ key: "c", name: "JOCKEY Shopee", state: "off", landing: null, forecast: null, target: null })
    ];
    const todos = agencyTodos(cards, { today: "2026-10-21", nextPlanLocked: () => false });
    expect(todos[0].tone).toBe("bad");
    expect(todos.map((t) => t.text).join(" | ")).toMatch(/Báo sớm brand: 1 kênh dự kiến hụt target/);
    expect(todos.some((t) => /Up số 2 ca/.test(t.text))).toBe(true);
    expect(todos.some((t) => /Chốt Kế Hoạch tháng sau cho 2 kênh — còn 10 ngày/.test(t.text))).toBe(true);
    expect(todos.some((t) => /JOCKEY Shopee: không có ca tháng 10/.test(t.text))).toBe(true);
    expect(todos.length).toBeLessThanOrEqual(5);
  });
});

// Canh: một thang nhãn cho cả app, và không màn nào tự dựng kết luận kênh ngoài chỗ đã duyệt.
describe("một thang nhãn, một chỗ tính (21/10)", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
    });
  const src = files(join(__dirname, "../src"));
  test("không còn nhãn riêng của Phòng Điều Hành cũ", () => {
    const bad = src.filter((f) => /"(Đã ngã ngũ|Đang giằng co|Gần như chắc)"/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
  test("component chỉ dựng kết luận kênh qua thẻ kênh (landingOf / monthOutlook / buildChannelRoom chỉ ở các màn đã duyệt)", () => {
    const allowed = new Set([
      // Sa bàn: điểm % khi thêm ca (cùng engine, không chữ kết luận).
      "components/ControlRoom.tsx",
      // Benchmark ca sắp live: hệ số k của engine.
      "components/OpsSupportTab.tsx",
      // Report Tháng / Tuần: bản chụp sau tháng.
      "components/brand-workspace/MonthlyReportTabs.tsx",
      "components/brand-workspace/BrandWeeklyReport.tsx"
    ]);
    const offenders = src
      .filter((f) => f.includes("/components/"))
      .filter((f) => /\b(landingOf|monthOutlook|buildChannelRoom|pHitOf)\(/.test(readFileSync(f, "utf8")))
      .map((f) => f.slice(f.indexOf("components/")))
      .filter((f) => !allowed.has(f));
    expect(offenders).toEqual([]);
  });
});
