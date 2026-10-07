// Quét trùng người trên lịch (user chốt 06/10: host hay trợ đều chỉ đứng MỘT ca tại một thời điểm). Tình huống lấy từ
// lịch T10 thật đã nạp: 20/10 Sỹ Hùng host CROCS 18–21 và Franklin TikTok 19–22; 10/10 Thái Toàn vừa host vừa trợ
// JOCKEY 20–23; 25/10 Lê Minh Nhật host Franklin TikTok 19–22 và Franklin Shopee 21:30–23:30.
// Chạy: npx vitest run tests/personClash.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { findPersonClashes, clashedSessionIds, clashDescriptions } = await import("../src/lib/scheduling/conflicts");
const { buildTodos } = await import("../src/lib/todoList");
import type { Brand, LiveSession } from "../src/types";

const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "crocs",
    brandName: "CROCS",
    platform: "TikTok",
    date: "2026-10-20",
    startTime: "18:00",
    endTime: "21:00",
    status: "Upcoming",
    studioId: "room-crocs",
    hostId: "hung",
    hostName: "Bùi Sỹ Hùng",
    isBackfill: false,
    ...over
  }) as LiveSession;

describe("findPersonClashes", () => {
  test("host ở hai ca chồng giờ (20/10 Sỹ Hùng CROCS 18–21 + Franklin 19–22)", () => {
    const got = findPersonClashes([ca("a"), ca("b", { brandId: "franklin", brandName: "Franklin", startTime: "19:00", endTime: "22:00" })]);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ talentId: "hung", talentName: "Bùi Sỹ Hùng" });
    expect([got[0].session.id, got[0].other?.id]).toEqual(["a", "b"]);
  });

  test("trợ live cũng tính, khác sàn cũng tính", () => {
    const got = findPersonClashes([
      ca("a", { hostId: "x", coHostId: "toan", coHostName: "Thái Toàn" }),
      ca("b", { platform: "Shopee", hostId: "toan", hostName: "Thái Toàn", startTime: "20:00", endTime: "23:00" })
    ]);
    expect(got.map((c) => c.talentName)).toEqual(["Thái Toàn"]);
  });

  test("vừa host vừa trợ của chính một ca (10/10 Thái Toàn JOCKEY 20–23)", () => {
    const got = findPersonClashes([ca("a", { hostId: "toan", hostName: "Thái Toàn", coHostId: "toan", coHostName: "Thái Toàn" })]);
    expect(got).toEqual([expect.objectContaining({ talentId: "toan", other: null })]);
  });

  test("chạm mép không tính; ca huỷ, ca nạp bù không tính", () => {
    expect(findPersonClashes([ca("a"), ca("b", { startTime: "21:00", endTime: "23:00" })])).toEqual([]);
    expect(findPersonClashes([ca("a"), ca("b", { startTime: "19:00", status: "Cancelled" })])).toEqual([]);
    expect(findPersonClashes([ca("a", { isBackfill: true }), ca("b", { startTime: "19:00", isBackfill: true })])).toEqual([]);
  });

  test("ca qua đêm hôm trước chồng ca sáng sớm hôm sau", () => {
    const got = findPersonClashes([ca("a", { startTime: "21:00", endTime: "00:30" }), ca("b", { date: "2026-10-21", startTime: "00:00", endTime: "02:00" })]);
    expect(got).toHaveLength(1);
    expect(got[0].session.id).toBe("a");
  });

  test("đổi người giữa ca: chỉ khoảng người đó đứng mới chiếm họ", () => {
    // Ca 21–23, trợ Vĩnh Thịnh chỉ đứng 22–23 ⇒ ca khác 21:00–21:45 của Vĩnh Thịnh không trùng.
    const split = ca("a", {
      startTime: "21:00",
      endTime: "23:00",
      staffSegments: [{ talentId: "thinh", talentName: "Vĩnh Thịnh", role: "co_host", fromMin: 60, toMin: 120 }]
    });
    expect(findPersonClashes([split, ca("b", { hostId: "thinh", startTime: "21:00", endTime: "21:45" })])).toEqual([]);
    expect(findPersonClashes([split, ca("b", { hostId: "thinh", startTime: "22:30", endTime: "23:30" })])).toHaveLength(1);
  });

  test("from: bỏ chỗ trùng trước ngày đó; clashedSessionIds gom tên theo ca", () => {
    const list = [ca("a"), ca("b", { startTime: "19:00" }), ca("c", { date: "2026-10-01" }), ca("d", { date: "2026-10-01", startTime: "19:00" })];
    expect(findPersonClashes(list, { from: "2026-10-06" })).toHaveLength(1);
    const m = clashedSessionIds(findPersonClashes(list));
    expect([...m.keys()].sort()).toEqual(["a", "b", "c", "d"]);
    expect(m.get("a")).toEqual(["Bùi Sỹ Hùng"]);
  });
});

describe("Việc cần làm", () => {
  const input = (sessions: LiveSession[]) => ({
    today: "2026-10-06",
    brands: [{ id: "crocs", name: "CROCS" } as Brand],
    channels: [{ id: "c", brandId: "crocs", platform: "TikTok" as const, shopName: "", shopRef: "", status: "active" as const, note: "" }],
    sessions,
    shiftSlots: [],
    plansThisMonth: new Map(),
    plansNextMonth: new Map(),
    commitments: [],
    rates: [],
    monthlyReports: new Map(),
    talents: [],
    canSeeMoney: false
  });
  test("trùng người sắp tới ⇒ việc đỏ; ca sắp tới chưa có phòng ⇒ việc vàng", () => {
    const t = buildTodos(input([ca("a"), ca("b", { startTime: "19:00", studioId: "" })]));
    expect(t.find((x) => x.id === "person-clash")).toMatchObject({ level: "high", title: "1 chỗ trùng người trên lịch từ hôm nay", tab: "calendar" });
    expect(t.find((x) => x.id === "no-room")).toMatchObject({ level: "medium", title: "1 ca sắp tới chưa có phòng live" });
  });
  test("trùng đã qua ngày thì không nhắc", () => {
    const t = buildTodos(input([ca("a", { date: "2026-10-01" }), ca("b", { date: "2026-10-01", startTime: "19:00" })]));
    expect(t.find((x) => x.id === "person-clash")).toBeUndefined();
  });
});

describe("clashDescriptions (tooltip viền đỏ)", () => {
  test("ghi rõ người đó còn ở ca nào, hai phía đều có câu giải thích", () => {
    const a = ca("a");
    const b = ca("b", { brandName: "FRANKLIN", startTime: "19:00", endTime: "22:00", studioName: "Room 202" });
    const why = clashDescriptions(findPersonClashes([a, b]));
    expect(why.get("a")).toEqual(["Bùi Sỹ Hùng cũng đang ở ca FRANKLIN 19:00–22:00 (Room 202)"]);
    expect(why.get("b")).toEqual(["Bùi Sỹ Hùng cũng đang ở ca CROCS 18:00–21:00"]);
  });
  test("vừa host vừa trợ cùng một ca", () => {
    const why = clashDescriptions(findPersonClashes([ca("a", { coHostId: "hung", coHostName: "Bùi Sỹ Hùng" })]));
    expect(why.get("a")).toEqual(["Bùi Sỹ Hùng vừa là Host vừa là Trợ live của chính ca này"]);
  });
});
