// Phòng Điều Hành (11/10/2026; 24/10 là Bảng Vận Hành · Cả tháng) — luật của lib/performance/controlRoom.ts.
// Chạy: npx vitest run tests/controlRoom.test.ts
import { describe, expect, test } from "vitest";
import {
  autoPlan,
  buildChannelRoom,
  MARGINAL_SESSION_FACTOR,
  monthBridge,
  pHitOf,
  pWithAdds,
  sandboxCandidates,
  type ChannelRoom
} from "../src/lib/performance/controlRoom";
import { landingOf } from "../src/lib/performance/forecastCone";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { hostOrder } from "../src/lib/performance/hostSuggestion";
import { eachDay } from "../src/lib/dateUtils";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import type { LiveSession } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "room-crocs", studioName: "CROCS", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed", dataSource: "tiktok_reconciled",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 6_000, ctrAvg: 0, cvrAvg: 0, productImpressions: 100_000, productClicks: 3_000,
    liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const bucketOf = (d: string) => resolveCampBucketType(d);
const params = DEFAULT_ENGINE_PARAMS;

/** 3 tháng lịch sử ổn định: mỗi ngày một ca tối (host h1 hoặc h2 xen kẽ) + ngày chẵn thêm một ca sáng (h3). */
function history(): LiveSession[] {
  const out: LiveSession[] = [];
  for (const d of eachDay("2026-07-01", "2026-09-30")) {
    const day = Number(d.slice(8, 10));
    const camp = bucketOf(d) !== "daily";
    out.push(ca(d, { hostId: day % 2 ? "h1" : "h2", hostName: day % 2 ? "Host 1" : "Host 2", actualGmv: (camp ? 60 : 30) * 1e6 * (1 + ((day * 7) % 5) / 20) }));
    if (day % 2 === 0) out.push(ca(d, { startTime: "10:00", endTime: "13:00", hostId: "h3", hostName: "Host 3", coHostId: "a2", coHostName: "Trợ 2", actualGmv: (camp ? 40 : 20) * 1e6 }));
  }
  return out;
}
/** Tháng 10: lịch cả tháng một ca tối/ngày; số có tới 10/10. */
function october(gmvOf: (d: string) => number = () => 30e6): LiveSession[] {
  return eachDay("2026-10-01", "2026-10-31").map((d) =>
    d <= "2026-10-10" ? ca(d, { actualGmv: gmvOf(d) }) : ca(d, { status: "Upcoming", actualGmv: 0, totalViews: 0, totalOrders: 0, dataSource: "manual" })
  );
}

describe("pHitOf — cùng công thức với landingOf của Dashboard", () => {
  test("khớp landingOf với coneCoef = band", () => {
    const o = { actual: 400e6, projected: 1_000e6, projectionMethod: "gmv_per_hour" as const, target: { total: 1_100e6, byDate: new Map() }, coneCoef: 0.22 };
    expect(pHitOf(1_000e6, 400e6, 0.22, 1_100e6)).toBeCloseTo(landingOf(o).pHit!, 6);
  });
  test("đã vượt target ⇒ 1; không target ⇒ null; hết phần chưa về ⇒ 0/1", () => {
    expect(pHitOf(1e9, 1.2e9, 0.3, 1e9)).toBe(1);
    expect(pHitOf(1e9, 0, 0.3, null)).toBeNull();
    expect(pHitOf(9e8, 9e8, 0.3, 1e9)).toBe(0);
  });
});

describe("buildChannelRoom", () => {
  const hist = history();
  const make = (gmvOf?: (d: string) => number, target = 1_200e6) =>
    buildChannelRoom({ sessions: [...hist, ...october(gmvOf)], month: "2026-10", today: "2026-10-10", target, bucketOf, params })!;

  test("đường khả năng: điểm đầu tháng + mỗi ngày 1→10; điểm cuối = khả năng hiện tại", () => {
    const r = make();
    expect(r).not.toBeNull();
    expect(r.curve.map((p) => p.asOf)).toEqual(["2026-09-30", ...eachDay("2026-10-01", "2026-10-10")]);
    expect(r.curve[r.curve.length - 1].pHit).toBeCloseTo(r.now.pHit!, 9);
    expect(r.curve[0].actual).toBe(0);
    expect(r.start.p80).toBeLessThan(r.start.p50);
  });

  test("ca bán vượt kỳ vọng kéo xác suất LÊN, ca hụt kéo XUỐNG", () => {
    const r = make((d) => (d === "2026-10-05" ? 90e6 : d === "2026-10-06" ? 5e6 : 30e6));
    const up = r.swings.find((s) => s.date === "2026-10-05")!;
    const down = r.swings.find((s) => s.date === "2026-10-06")!;
    expect(up.deltaP!).toBeGreaterThan(0);
    expect(down.deltaP!).toBeLessThan(0);
    expect(r.swings).toHaveLength(10);
  });

  test("số thật tốt hơn kỳ vọng ⇒ ratio > 1 và mức chiếu phần còn lại nâng lên", () => {
    const r = make(() => 45e6);
    expect(r.ratio!).toBeGreaterThan(1);
    expect(r.levelFactor).toBeGreaterThan(1);
  });

  test("target quá xa ⇒ đã ngã ngũ", () => {
    expect(make(undefined, 10_000e6).decided).toBe(true);
  });

  test("ca huỷ và ca loại khỏi báo cáo không vào lịch của tháng", () => {
    const oct = october();
    oct[12] = { ...oct[12], status: "Cancelled" };
    oct[13] = { ...oct[13], excludedFromReports: true };
    const r = buildChannelRoom({ sessions: [...hist, ...oct], month: "2026-10", today: "2026-10-10", target: 1e9, bucketOf, params })!;
    expect(r.sessions).toHaveLength(29);
  });
});

describe("sa bàn", () => {
  const hist = history();
  const oct = october();
  const all = [...hist, ...oct];
  const room = buildChannelRoom({ sessions: all, month: "2026-10", today: "2026-10-10", target: 1_200e6, bucketOf, params })!;
  const cands = sandboxCandidates({ channelKey: "crocs", room, channelSessions: all, allSessions: all, shiftSlots: [], studioId: "room-crocs", bucketOf });

  test("không đề xuất khung phòng đã có ca (20h mỗi ngày đã kín) — chỉ 10h và 14h", () => {
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.every((c) => c.startTime !== "20:00")).toBe(true);
    expect(cands.every((c) => c.date >= "2026-10-11")).toBe(true);
  });

  test("ca thêm tính hệ số giờ thêm và có người quen kênh", () => {
    const c = cands[0];
    expect(c.hosts.length).toBeGreaterThan(0);
    expect(c.assistants.length).toBeGreaterThan(0);
    expect(c.hosts.some((h) => c.assistants.slice(0, 1).some((a) => a.id === h.id))).toBe(false);
    expect(MARGINAL_SESSION_FACTOR).toBe(0.8);
  });

  test("người đã có ca trùng giờ ở kênh khác không được gợi ý", () => {
    const busy = ca("2026-10-12", { brandId: "vera", studioId: "room-vera", startTime: "09:30", endTime: "12:00", hostId: "h3", coHostId: "zz" });
    const c2 = sandboxCandidates({ channelKey: "crocs", room, channelSessions: all, allSessions: [...all, busy], shiftSlots: [], studioId: "room-crocs", bucketOf });
    const at = c2.find((c) => c.date === "2026-10-12" && c.startTime === "10:00");
    expect(at?.hosts.some((h) => h.id === "h3") ?? false).toBe(false);
  });

  test("thêm ca ⇒ xác suất tăng; tự xếp không cho một người hai ca cùng giờ", () => {
    expect(pWithAdds(room, cands.slice(0, 3)).pHit!).toBeGreaterThan(room.now.pHit!);
    const rooms = new Map<string, ChannelRoom>([["crocs", room]]);
    const plan = autoPlan(rooms, cands, 6, "probability");
    expect(plan.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const p of plan) {
      for (const id of [p.host.id, p.assistant.id]) {
        const k = `${id}|${p.candidate.date}|${p.candidate.startTime}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      expect(p.host.id).not.toBe(p.assistant.id);
    }
  });

  test("kênh đã ngã ngũ: tự xếp theo xác suất không thêm ca nào", () => {
    const dead = buildChannelRoom({ sessions: all, month: "2026-10", today: "2026-10-10", target: 50_000e6, bucketOf, params })!;
    expect(autoPlan(new Map([["crocs", dead]]), cands, 5, "probability")).toHaveLength(0);
    expect(autoPlan(new Map([["crocs", dead]]), cands, 5, "gmv").length).toBe(5);
  });
});

describe("một số kỳ vọng mỗi ca (24/10)", () => {
  test("expectedNowById = phần còn lại của dự kiến cuối tháng, có cả ca chờ đăng ký; ca đã có số không có kỳ vọng", () => {
    const all = [...history(), ...october()];
    const open = [{ id: "slot-1", date: "2026-10-20", startTime: "10:00", endTime: "13:00", status: "open" as const, sessionId: undefined }];
    const r = buildChannelRoom({ sessions: all, month: "2026-10", today: "2026-10-10", target: 1_200e6, bucketOf, params, openSlots: open })!;
    const future = [...r.expectedNowById.values()].reduce((a, v) => a + v, 0);
    expect(r.now.actual + future).toBeCloseTo(r.now.projected, 0);
    expect(r.expectedNowById.get("slot-1")!).toBeGreaterThan(0);
    const past = r.sessions.find((s) => s.date === "2026-10-05")!;
    expect(r.expectedNowById.has(past.id)).toBe(false);
  });
});

describe("một cách xếp host (24/10)", () => {
  test("sa bàn xếp host theo hostOrder — cùng thứ tự gợi ý của cửa sổ chốt ca", () => {
    const all = [...history(), ...october()];
    const room = buildChannelRoom({ sessions: all, month: "2026-10", today: "2026-10-10", target: 1_200e6, bucketOf, params })!;
    const order = hostOrder(["h1", "h2", "h3"], all, "crocs", "TikTok", "2026-07-12");
    const cands = sandboxCandidates({ channelKey: "crocs", room, channelSessions: all, allSessions: all, shiftSlots: [], studioId: "room-crocs", bucketOf, hostRankOf: (id) => order.get(id) ?? 99 });
    const c = cands.find((x) => x.hosts.length >= 2)!;
    const ranks = c.hosts.map((h) => order.get(h.id) ?? 99);
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
    // Đảo thứ hạng ⇒ đảo thứ tự gợi ý.
    const rev = sandboxCandidates({ channelKey: "crocs", room, channelSessions: all, allSessions: all, shiftSlots: [], studioId: "room-crocs", bucketOf, hostRankOf: (id) => -(order.get(id) ?? 99) });
    expect(rev.find((x) => x.key === c.key)!.hosts[0].id).toBe(c.hosts[c.hosts.length - 1].id);
  });
});

describe("cầu GMV hai tháng", () => {
  test("ba phần cộng đúng chênh lệch; thêm giờ cùng năng suất ⇒ phần giờ dương, năng suất ~0", () => {
    const xs: LiveSession[] = [];
    for (const d of eachDay("2026-06-01", "2026-09-30")) {
      xs.push(ca(d));
      if (d >= "2026-09-01") xs.push(ca(d, { startTime: "10:00", endTime: "13:00", actualGmv: 30e6 }));
    }
    const b = monthBridge(xs, "2026-08", "2026-09", bucketOf, params)!;
    expect(b).not.toBeNull();
    expect(b.hours + b.mix + b.level).toBeCloseTo(b.gmvB - b.gmvA, 0);
    expect(b.hours).toBeGreaterThan(0);
  });
});
