// Tổng quan account (24/10/2026) — lib/performance/accountOverview.ts: một dòng mỗi kênh, đọc từ thẻ kênh, xếp theo rủi ro.
// Chạy: npx vitest run tests/accountOverview.test.ts
import { describe, expect, test } from "vitest";
import { accountActions, accountRow, landingText, platformPace, sortAccounts } from "../src/lib/performance/accountOverview";
import type { ChannelCard } from "../src/lib/performance/channelCard";
import type { LiveSession } from "../src/types";

function card(over: Record<string, unknown> = {}): ChannelCard {
  return {
    key: "b|TikTok", brandId: "b", brandName: "VERA", platform: "TikTok", name: "VERA", month: "2026-10", state: "live", planStatus: "locked",
    target: 650e6, monthActual: 252.9e6,
    pace: { runRate: 0.54, actual: 252.9e6, targetToDate: 465.9e6, asOf: "2026-10-22", lastShift: null },
    forecast: { p50: 356.6e6, lo: 333.8e6, hi: 379.5e6 }, landing: { key: "short", pHit: 0 }, newChannel: false,
    coverage: { completeThrough: "2026-10-20", missingSessions: 1, oldestMissing: "2026-10-22" },
    shownThrough: "2026-10-20", causes: [], need: { perHour: 6.2e6, hours: 64, blended: 1.6e6 }, stableSince: null,
    commitment: { committedHours: 250, deliveredHours: 152, scheduledHours: 58, gapHours: 40 },
    trend: [{ month: "2026-10", gmv: 252.9e6, hours: 147, gmvPerHour: 1.72e6 }], action: null,
    plan: { remainingHours: 63.5, checkpoint: { needPct: 3.21, pct: 0.3, capped: true, extraHours: 19.1, projectedAfter: 384.9e6, gap: 293.4e6 } },
    tree: null,
    ...over
  } as unknown as ChannelCard;
}

describe("accountRow — đọc thẻ kênh, không tính lại", () => {
  test("hụt và vượt giới hạn +30% ⇒ 'cannot', ghi giờ thêm tối đa + dự báo khi thêm đủ", () => {
    const r = accountRow(card());
    expect(r.tone).toBe("bad");
    expect(r.status).toBe("Hụt target · dự báo thiếu ~45%");
    expect(r.rescue.kind).toBe("cannot");
    expect(r.rescue.extraHours).toBe(20);
    expect(r.rescue.projectedAfter).toBe(384.9e6);
    expect(r.rescue.needRate).toBe(6.2e6);
    expect(r.rescue.nowRate).toBe(1.6e6);
    expect(r.hours?.gap).toBe(40);
  });

  test("hụt nhưng trong giới hạn ⇒ 'save'; Rủi ro dùng xác suất", () => {
    const r = accountRow(card({ landing: { key: "unlikely", pHit: 0.23 }, plan: { remainingHours: 70, checkpoint: { needPct: 0.15, pct: 0.15, capped: false, extraHours: 10.6, projectedAfter: 5.15e9, gap: 1 } } }));
    expect(r.tone).toBe("warn");
    expect(r.status).toBe("Rủi ro · xác suất đạt 23%");
    expect(r.rescue.kind).toBe("save");
    expect(r.rescue.extraHours).toBe(11);
  });

  test("dự báo đạt ⇒ 'on_track', không đề xuất thêm giờ", () => {
    const r = accountRow(card({ landing: { key: "safe", pHit: 0.92 }, forecast: { p50: 700e6, lo: 650e6, hi: 750e6 } }));
    expect(r.tone).toBe("good");
    expect(r.rescue.kind).toBe("on_track");
    expect(r.rescue.extraHours).toBeNull();
  });

  test("kênh mới chưa có dự báo ⇒ GMV/giờ cần = phần còn thiếu ÷ giờ đã xếp", () => {
    const r = accountRow(card({ forecast: null, landing: null, newChannel: true, target: 250e6, pace: { runRate: 0.29, actual: 44.2e6, targetToDate: 151.5e6, asOf: "2026-10-20", lastShift: null }, commitment: { committedHours: 90, deliveredHours: 50, scheduledHours: 28, gapHours: 12 } }));
    expect(r.status).toBe("Kênh mới · chưa có dự báo");
    expect(r.rescue.kind).toBe("no_forecast");
    expect(r.rescue.needRate).toBeCloseTo((250e6 - 44.2e6) / 28);
    expect(r.rescue.nowRate).toBeCloseTo(1.72e6);
  });

  test("không có ca nhưng có cam kết chưa xếp ⇒ 'Chưa có lịch live' đứng đầu", () => {
    const r = accountRow(card({ state: "off", planStatus: "none", target: null, pace: null, forecast: null, landing: null, commitment: { committedHours: 180, deliveredHours: 0, scheduledHours: 0, gapHours: 180 } }));
    expect(r.status).toBe("Chưa có lịch live");
    expect(r.rescue.kind).toBe("no_schedule");
    expect(r.rank).toBe(0);
  });

  test("tạm dừng ⇒ ghi ngày có ca live gần nhất, đứng cuối", () => {
    const s = (date: string) => ({ date, status: "Completed", actualGmv: 1e6, dataSource: "tiktok_reconciled" }) as unknown as LiveSession;
    const r = accountRow(card({ state: "off", planStatus: "none", target: null, pace: null, forecast: null, landing: null, commitment: null }), [s("2026-09-10"), s("2026-09-30")]);
    expect(r.status).toBe("Tạm dừng tháng 10");
    expect(r.lastLive).toBe("2026-09-30");
    expect(r.rank).toBe(900);
  });

  test("chưa từng có ca live (brand mới, hợp đồng bắt đầu tháng sau) ⇒ 'Chưa chạy', không gọi là tạm dừng", () => {
    const r = accountRow(card({ state: "off", planStatus: "none", target: null, pace: null, forecast: null, landing: null, commitment: null }), []);
    expect(r.status).toBe("Chưa chạy tháng 10");
    expect(r.lastLive).toBeNull();
  });
});

describe("sortAccounts + platformPace", () => {
  test("rủi ro cao lên trên: chưa có lịch → dự báo thấp → dự báo cao → chưa kế hoạch → tạm dừng", () => {
    const rows = [
      accountRow(card({ key: "crocs", brandName: "CROCS", landing: { key: "unlikely", pHit: 0.23 }, target: 100, forecast: { p50: 96, lo: 0, hi: 0 } })),
      accountRow(card({ key: "off", brandName: "JOCKEY", state: "off", target: null, pace: null, forecast: null, landing: null, commitment: null })),
      accountRow(card({ key: "vera", brandName: "VERA", target: 100, forecast: { p50: 55, lo: 0, hi: 0 } })),
      accountRow(card({ key: "fuji", brandName: "FUJIWA", state: "off", target: null, pace: null, forecast: null, landing: null, commitment: { committedHours: 180, deliveredHours: 0, scheduledHours: 0, gapHours: 180 } })),
      accountRow(card({ key: "draft", brandName: "X", state: "no_plan", planStatus: "draft", target: null, pace: null, forecast: null, landing: null, commitment: null }))
    ];
    expect(sortAccounts(rows).map((r) => r.key)).toEqual(["fuji", "vera", "crocs", "draft", "off"]);
  });

  test("platformPace cộng trong một sàn, bỏ kênh không chạy", () => {
    const p = platformPace([card(), card({ key: "x", state: "off", target: 999, pace: { runRate: 1, actual: 5, targetToDate: 5, asOf: null, lastShift: null } })]);
    expect(p.actual).toBe(252.9e6);
    expect(p.target).toBe(650e6);
    expect(p.forecast).toBe(356.6e6);
  });

  test("landingText: một câu cho mọi màn", () => {
    expect(landingText(card({ landing: { key: "likely", pHit: 0.004 } }))).toBe("Sát target · xác suất đạt ≈ 0%");
    expect(landingText(card({ landing: null }))).toBeNull();
  });
});

describe("accountActions — chỉ ghép số đã có trên dòng", () => {
  const fmt = (v: number) => `${Math.round(v / 1e6)}M`;
  test("vượt giới hạn: báo brand + điều chỉnh target; còn giờ cam kết; ca chưa có số liệu", () => {
    const a = accountActions(accountRow(card()), "2026-10-23", fmt, {});
    expect(a[0]).toBe("Cần thêm +321% giờ, vượt giới hạn +30%: thêm tối đa ~20 giờ chỉ đưa dự báo lên ~385M (59% target). Báo brand sớm và đề xuất điều chỉnh target.");
    expect(a).toContain("Còn 40 giờ cam kết chưa xếp lịch live.");
    expect(a).toContain("Cập nhật số liệu 1 ca đã live còn thiếu để dự báo chính xác hơn.");
  });
  test("chưa có lịch: giờ live mỗi ngày còn lại", () => {
    const a = accountActions(accountRow(card({ state: "off", planStatus: "none", target: null, pace: null, forecast: null, landing: null, coverage: { completeThrough: null, missingSessions: 0, oldestMissing: null }, commitment: { committedHours: 180, deliveredHours: 0, scheduledHours: 0, gapHours: 180 } })), "2026-10-23", fmt, {});
    expect(a[0]).toContain("còn 9 ngày (~20 giờ live/ngày)");
  });
});
