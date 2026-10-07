// "Kế hoạch vs thực tế" của Cửa sổ Ca Live: hai cột Kế hoạch | Thực tế, vẽ SSR để bắt NaN/undefined và rò target cho brand.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { SessionPlanVsActual } = await import("../src/components/SessionPlanVsActual");
import type { LiveSession } from "../src/types";

const base = {
  id: "s1", title: "Franklin", brandName: "Franklin", platform: "Shopee", date: "2026-10-08", startTime: "19:00", endTime: "22:00",
  status: "Upcoming", targetGmv: 0, actualGmv: 0, dataSource: "manual"
} as unknown as LiveSession;

const render = (s: LiveSession, o: Partial<{ liveHours: number; hideMetrics: boolean; isBrandView: boolean; canEnter: boolean }> = {}) =>
  renderToStaticMarkup(
    React.createElement(SessionPlanVsActual, { session: s, planHours: 3, liveHours: 0, hideMetrics: false, isBrandView: false, canEnter: false, onSaved: () => {}, ...o })
  );

const noBadText = (html: string) => expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);

describe("SessionPlanVsActual", () => {
  test("ca chưa có số: hai cột, thực tế trống, không có target", () => {
    const html = render(base);
    expect(html).toContain("Kế hoạch");
    expect(html).toContain("Thực tế");
    expect(html).toContain("19:00–22:00 (3h)");
    expect(html).toContain("chưa có target");
    noBadText(html);
  });

  test("ca có target + số: kế hoạch GMV/giờ = target/giờ ca, % target ở cột thực tế", () => {
    const s = { ...base, targetGmv: 30_000_000, actualGmv: 15_000_000, actualStartAt: "2026-10-08T12:05:00Z", actualEndAt: "2026-10-08T15:00:00Z" } as LiveSession;
    const html = render(s, { liveHours: 2.9 });
    expect(html).toContain("50% target");
    expect(html).toContain("(2,9h)");
    expect(html).toContain("10M"); // 30M / 3h
    noBadText(html);
  });

  test("nút nhập tay chỉ hiện khi canEnter", () => {
    expect(render(base, { canEnter: false })).not.toContain("Nhập tay thực tế");
    expect(render(base, { canEnter: true })).toContain("Nhập tay thực tế");
    expect(render(base, { canEnter: true, hideMetrics: true })).not.toContain("Nhập tay thực tế");
  });

  test("brand không thấy target / % target / kế hoạch GMV", () => {
    const s = { ...base, targetGmv: 30_000_000, actualGmv: 15_000_000 } as LiveSession;
    const html = render(s, { isBrandView: true, liveHours: 3 });
    expect(html).not.toContain("target");
    expect(html).not.toContain("30M");
    expect(html).not.toContain("10M");
    noBadText(html);
  });

  test("brand, tháng chưa phát hành: không lộ số", () => {
    const s = { ...base, targetGmv: 30_000_000, actualGmv: 15_000_000 } as LiveSession;
    const html = render(s, { isBrandView: true, hideMetrics: true });
    expect(html).toContain("chưa phát hành");
    expect(html).not.toContain("15M");
  });
});
