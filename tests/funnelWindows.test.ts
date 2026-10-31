// Phễu LIVE theo cửa sổ: ngưỡng dao động phải rộng ra khi ít ca, và chỉ tỷ lệ giảm VƯỢT ngưỡng mới là chỗ gãy.
// Chạy: npx vitest run tests/funnelWindows.test.ts
import { describe, expect, test } from "vitest";
import type { LiveSession } from "../src/types";
import { liveFunnelLite, monthToDateLikeForLike, shopeeFunnelLite, watchRate, weekdayPairedLikeForLike, type LikeForLike } from "../src/lib/performance/channelHealth";

const tt = (imp: number, views: number, clicks: number, orders: number) => ({ impressions: imp, totalViews: views, productClicks: clicks, totalOrders: orders }) as LiveSession;
const many = (n: number, s: LiveSession) => Array.from({ length: n }, () => s);
const pair = (prev: LiveSession[], cur: LiveSession[]): LikeForLike => ({ pairs: new Map(), prev, cur });

describe("phễu theo cửa sổ", () => {
  test("ngưỡng dao động rộng hơn khi ít ca (cùng mức giảm)", () => {
    const base = tt(100000, 2400, 1200, 20), drop = tt(100000, 2000, 1200, 20); // ERR 2,4% → 2,0% = −17%
    const few = liveFunnelLite(pair(many(3, base), many(3, drop)))!;
    const lots = liveFunnelLite(pair(many(30, base), many(30, drop)))!;
    expect(few.rates[0].band!).toBeGreaterThan(lots.rates[0].band!);
    expect(few.rates[0].sig).toBe(false); // 3 ca: ±~36% ⇒ −17% chưa kết luận
    expect(lots.rates[0].sig).toBe(true); // 30 ca: ±~11% ⇒ −17% là chỗ gãy
    expect(lots.worst?.label).toBe(lots.rates[0].label);
    expect(few.worst).toBeNull();
  });
  test("dưới 3 ca có số ⇒ không dựng phễu", () => {
    expect(liveFunnelLite(pair(many(2, tt(1, 1, 1, 1)), many(5, tt(1, 1, 1, 1))))).toBeNull();
  });
  test("Shopee chỉ cộng ca có ATC", () => {
    const sp = (atc: number | undefined) => ({ totalViews: 1000, totalOrders: 20, report: atc == null ? undefined : { atcCount: atc } }) as LiveSession;
    const f = shopeeFunnelLite(pair([...many(4, sp(100)), sp(undefined)], [...many(4, sp(100)), sp(undefined), sp(undefined)]))!;
    expect(f.curSessions).toBe(4);
    expect(f.prevSessions).toBe(4);
    expect(f.steps[0].cur).toBe(4000);
  });
  test("ghép theo thứ: chỉ giữ cặp cùng loại ngày", () => {
    const l = weekdayPairedLikeForLike([], "2026-10-29", 7, (d) => (d === "2026-10-25" ? "campaign" : "daily") as never);
    expect(l.pairs.has("2026-10-29")).toBe(true);
    expect(l.pairs.get("2026-10-29")).toBe("2026-10-22");
    expect(l.pairs.has("2026-10-25")).toBe(false);
    expect(l.pairs.size).toBe(6);
  });
  test("hai mức: chú ý (80%) hẹp hơn gãy rõ (95%); chỉ gãy rõ vào worst", () => {
    const base = tt(100000, 2400, 1200, 20);
    // 12 ca/kỳ: ERR giảm ~13% — nằm giữa ngưỡng 80% và 95%
    const mid = liveFunnelLite(pair(many(12, base), many(12, tt(100000, 2090, 1200, 20))))!;
    expect(mid.rates[0].watchBand!).toBeLessThan(mid.rates[0].band!);
    expect(mid.rates[0].watch).toBe(true);
    expect(mid.rates[0].sig).toBe(false);
    expect(mid.worst).toBeNull();
    expect(watchRate(mid)?.label).toBe(mid.rates[0].label);
    const big = liveFunnelLite(pair(many(12, base), many(12, tt(100000, 1700, 1200, 20))))!;
    expect(big.rates[0].sig).toBe(true);
    expect(big.rates[0].watch).toBe(false);
    expect(big.worst?.label).toBe(big.rates[0].label);
  });
  test("luỹ kế tháng: mùng 1 → ngày E ghép cùng ngày-của-tháng ở tháng trước, không phân loại ngày", () => {
    const l = monthToDateLikeForLike([], "2026-10", "2026-10-10");
    expect(l.pairs.size).toBe(10);
    expect(l.pairs.get("2026-10-10")).toBe("2026-09-10");
    const m = monthToDateLikeForLike([], "2026-03", "2026-03-31"); // tháng 2 chỉ có 28 ngày
    expect(m.pairs.size).toBe(28);
  });
});
