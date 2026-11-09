// Ô "Hiệu suất theo brand × sàn × vai" ở tab Tôi (09/11): chỉ số của chính talent, vai trợ chỉ ca + giờ, không cộng hai sàn.
// Chạy: npx vitest run tests/talentChannelSummary.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { myChannelRoleSummary, channelReach } = await import("../src/lib/talent/channelSummary");
import type { LiveSession } from "../src/types";

const ME = "ngan";
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "vera",
    brandName: "VERA",
    platform: "TikTok",
    date: "2026-11-05",
    startTime: "20:00",
    endTime: "23:00",
    status: "Completed",
    hostId: "ai-do",
    hostName: "Ai Đó",
    coHostId: ME,
    coHostName: "Ngân",
    actualGmv: 6e6,
    dataSource: "tiktok_reconciled",
    isBackfill: false,
    ...over
  }) as LiveSession;

describe("myChannelRoleSummary", () => {
  test("vai trợ chỉ có ca + giờ, GMV luôn 0 (GMV của ca tính cho host)", () => {
    const rows = myChannelRoleSummary([ca("a"), ca("b", { date: "2026-11-06" })], ME, "2026-11-01", "2026-11-30");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ brandName: "VERA", platform: "TikTok", role: "assistant", sessions: 2, gmv: 0, gmvPerHour: 0 });
    expect(rows[0].hours).toBeCloseTo(6, 5);
  });

  test("vai host có GMV và GMV/giờ; tách theo sàn, không cộng TikTok với Shopee", () => {
    const xs = [
      ca("h1", { hostId: ME, coHostId: undefined, platform: "Shopee", actualGmv: 6e6 }),
      ca("h2", { hostId: ME, coHostId: undefined, platform: "Shopee", actualGmv: 3e6, date: "2026-11-07" }),
      ca("h3", { hostId: ME, coHostId: undefined, platform: "TikTok", actualGmv: 9e6 })
    ];
    const rows = myChannelRoleSummary(xs, ME, "2026-11-01", "2026-11-30");
    const shopee = rows.find((r) => r.platform === "Shopee")!;
    const tiktok = rows.find((r) => r.platform === "TikTok")!;
    expect(shopee).toMatchObject({ role: "host", sessions: 2, gmv: 9e6 });
    expect(shopee.gmvPerHour).toBeCloseTo(9e6 / 6, 3);
    expect(tiktok).toMatchObject({ role: "host", sessions: 1, gmv: 9e6 });
  });

  test("người vừa host vừa trợ ở cùng kênh ra hai dòng; ca ngoài kỳ hoặc chưa có số bị bỏ", () => {
    const xs = [
      ca("t1"),
      ca("h1", { hostId: ME, coHostId: undefined }),
      ca("old", { date: "2026-08-01" }),
      ca("upcoming", { status: "Upcoming", actualGmv: 0 })
    ];
    const rows = myChannelRoleSummary(xs, ME, "2026-11-01", "2026-11-30");
    expect(rows.map((r) => r.role).sort()).toEqual(["assistant", "host"]);
  });

  test("không có talentId thì rỗng; channelReach đếm brand và sàn khác nhau", () => {
    expect(myChannelRoleSummary([ca("a")], undefined, "2026-11-01", "2026-11-30")).toEqual([]);
    const rows = myChannelRoleSummary([ca("a"), ca("b", { brandId: "fuj", brandName: "FUJIWA" }), ca("c", { platform: "Shopee" })], ME, "2026-11-01", "2026-11-30");
    const reach = channelReach(rows);
    expect(reach.brands.sort()).toEqual(["FUJIWA", "VERA"]);
    expect(reach.platforms.sort()).toEqual(["Shopee", "TikTok"]);
  });
});
