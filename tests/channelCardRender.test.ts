// Thẻ kênh + cổng brand vẽ ra HTML (SSR) trên dữ liệu mẫu: không NaN/undefined, đúng một thang nhãn, cổng brand không có nhãn/xác suất.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

import { buildChannelCard } from "../src/lib/performance/channelCard";
import { bulletinFromCard, bulletinText } from "../src/lib/brand/bulletin";
import { CardPill } from "../src/components/dashboard/ChannelCardView";
import { BrandPortal } from "../src/components/brand-workspace/BrandPortal";
import { AccountCard } from "../src/components/runrate/AccountCard";
import type { AccountVM } from "../src/components/runrate/types";
import { todayVn } from "../src/lib/performance/brandCommitment";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import type { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
const ca = (date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: `s${++seq}`, title: "", brandId: "fr", brandName: "Franklin", shopTikTokHandle: "", monthPublished: false, studioId: "", studioName: "",
    hostId: "h1", hostName: "Lê Quang An", assistantName: "", coHostName: "", platform: "TikTok", date, startTime: "11:00", endTime: "14:00",
    status: "Completed", dataSource: "tiktok_reconciled", targetGmv: 0, actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: gmv > 0 ? 3_000 : 0, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, ...extra
  }) as LiveSession;

function world() {
  const hist: LiveSession[] = [];
  for (let d = new Date("2026-08-01T00:00:00"); d < new Date("2026-10-01T00:00:00"); d.setDate(d.getDate() + 1)) hist.push(ca(d.toISOString().slice(0, 10), 15e6));
  const oct: LiveSession[] = [], shifts: ShiftSlot[] = [], slots: BrandMonthPlanSlot[] = [];
  for (let i = 1; i <= 31; i++) {
    const date = `2026-10-${String(i).padStart(2, "0")}`;
    const s = date < "2026-10-19" ? ca(date, 10e6) : ca(date, 0, { status: "Upcoming", totalViews: 0, dataSource: "manual" });
    oct.push(s);
    shifts.push({ id: `sh${i}`, date, startTime: "11:00", endTime: "14:00", brandId: "fr", brandName: "Franklin", platform: "TikTok", studioName: "", notes: "", status: "finalized", sessionId: s.id } as ShiftSlot);
    slots.push({ id: `ps${i}`, planId: "p", date, startTime: "11:00", endTime: "14:00", targetGmv: 24e6, expectedGmv: 0, slotId: `sh${i}`, note: "" });
  }
  const plan = { id: "p", brandId: "fr", month: "2026-10", platform: "TikTok", status: "locked", defaultSlotHours: 3, liveWindowStart: "09:00", liveWindowEnd: "24:00", maxSlotsPerDay: 4, notes: "", blackoutDates: [], targetGmv: 0, campRanges: {}, groupTargets: {}, shopTargetGmv: 0, adsBudget: 0 } as unknown as BrandMonthPlan;
  return buildChannelCard({ brandId: "fr", brandName: "Franklin", platform: "TikTok", name: "Franklin", month: "2026-10", today: "2026-10-21", sessions: [...hist, ...oct], shiftSlots: shifts, plan, planSlots: slots, engineParams: DEFAULT_ENGINE_PARAMS });
}

describe("CardPill", () => {
  test("viên nhãn: một thang kèm % và nói rõ % gì; không NaN/undefined", () => {
    const html = renderToStaticMarkup(React.createElement(CardPill, { card: world() }));
    expect(html).toMatch(/(Chắc đạt|Có thể đạt|Khó đạt|Sẽ hụt) · (khả năng chạm target |dự kiến thiếu ~)\d+%/);
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object|tiến độ|ngã ngũ|giằng co/);
  });
});

describe("Dashboard agency = thẻ run-rate (22/10)", () => {
  const vmOf = (withCard: boolean): AccountVM => {
    const c = world();
    return {
      key: c.key, brand: { id: "fr", name: "Franklin", logo: "" } as AccountVM["brand"], platform: c.platform, name: c.name, planStatus: c.planStatus,
      report: c.report, actualOnly: c.monthActual, completeThrough: c.coverage.completeThrough, missingSessions: c.coverage.missingSessions,
      oldestMissing: c.coverage.oldestMissing, loading: false, card: withCard ? c : undefined
    };
  };
  test("thẻ có thẻ kênh: run-rate % + nhãn khả năng đạt + dự báo cuối tháng; không 'Giữ nhịp'/'tiến độ'", () => {
    const vm = vmOf(true);
    const html = renderToStaticMarkup(React.createElement(AccountCard, { vm, selected: false, onSelect: () => {}, onOpenMonthPlan: () => {} }));
    expect(html).toMatch(/(Chắc đạt|Có thể đạt|Khó đạt|Sẽ hụt) · (khả năng chạm target |dự kiến thiếu ~)\d+%/);
    expect(html).toMatch(/Dự kiến cuối tháng/);
    expect(html).not.toMatch(/Giữ nhịp|tiến độ|NaN|undefined|Infinity/);
  });
});

describe("bản tin + cổng brand", () => {
  test("tin Zalo không có nhãn/xác suất; có số tới nay, nhịp, cuối tháng", () => {
    const t = bulletinText(bulletinFromCard(world()), "Đẩy Ads cho Pay Day", "https://x/brand/franklin/dashboard?san=tiktok");
    expect(t).toMatch(/Franklin · tháng 10\/2026/);
    expect(t).toMatch(/so kế hoạch tới nay/);
    expect(t).toMatch(/Dự kiến cuối tháng ~/);
    expect(t).toContain("Đẩy Ads cho Pay Day");
    expect(t).not.toMatch(/Khó đạt|Sẽ hụt|Chắc đạt|Có thể đạt|khả năng|NaN|undefined/);
  });
  test("cổng brand vẽ được (lịch 7 ngày, báo cáo) khi chưa có bản tin", () => {
    const today = todayVn(); // giờ VN như cổng — UTC lệch ngày từ 0h tới 7h sáng
    const html = renderToStaticMarkup(React.createElement(BrandPortal, { brandId: "fr", brandName: "Franklin", platform: "TikTok", platforms: ["TikTok"], sessions: [ca(today, 0, { status: "Upcoming" })] }));
    expect(html).toContain("Lịch 7 ngày tới · 1 ca");
    expect(html).toContain("Lê Quang An");
    expect(html).toContain("Chưa có báo cáo tháng nào được phát hành");
    expect(html).not.toMatch(/Khó đạt|Sẽ hụt|khả năng|NaN|undefined/);
  });
});
