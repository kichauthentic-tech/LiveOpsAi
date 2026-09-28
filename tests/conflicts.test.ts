// Audit 2026-09-28 mục 8: một bộ luật kiểm trùng lịch cho mọi cửa xếp/sửa ca.
// Chạy: npx vitest run tests/conflicts.test.ts
import { describe, expect, test } from "vitest";
import { personClash, studioClash } from "../src/lib/scheduling/conflicts";
import { LiveSession, ShiftSlot } from "../src/types";

const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({ id, brandName: "CROCS", date: "2026-10-05", startTime: "19:00", endTime: "22:00", status: "Upcoming", studioId: "r203", hostId: "an", ...over }) as LiveSession;
const slot = (id: string, over: Partial<ShiftSlot>): ShiftSlot =>
  ({ id, brandName: "VERA", date: "2026-10-05", startTime: "20:00", endTime: "23:00", status: "open", studioId: "r201", ...over }) as ShiftSlot;

const sessions = [ca("s1", { coHostId: "binh" }), ca("s2", { date: "2026-10-04", startTime: "23:00", endTime: "01:00", hostId: "chi", studioId: "r101" })];
const want = { date: "2026-10-05", startTime: "20:00", endTime: "21:00" };

describe("personClash — Host hoặc Trợ live của ca khác", () => {
  test("người đang làm Trợ live ca khác cũng bận (Cửa sổ ca cũ bỏ sót)", () => {
    expect(personClash(sessions, want, "binh")?.id).toBe("s1");
  });
  test("ca qua đêm hôm trước chặn ca 00:00 hôm nay", () => {
    expect(personClash(sessions, { date: "2026-10-05", startTime: "00:00", endTime: "02:00" }, "chi")?.id).toBe("s2");
  });
  test("bỏ qua chính ca đang sửa và ca huỷ", () => {
    expect(personClash(sessions, want, "an", "s1")).toBeNull();
    expect(personClash([ca("x", { status: "Cancelled" })], want, "an")).toBeNull();
  });
});

describe("studioClash — ca chờ đăng ký còn mở cũng giữ phòng", () => {
  test("kéo ca sang phòng đang có ca chờ đăng ký ⇒ trùng (LiveCalendar cũ cho qua)", () => {
    const c = studioClash(sessions, [slot("o1", {})], { ...want, studioId: "r201" });
    expect(c?.kind).toBe("open_slot");
  });
  test("ca chờ đã gắn ca thật hoặc đã huỷ không tính lại", () => {
    expect(studioClash([], [slot("o1", { sessionId: "s9" }), slot("o2", { status: "cancelled" })], { ...want, studioId: "r201" })).toBeNull();
  });
  test("ca đã chốt cùng phòng", () => {
    expect(studioClash(sessions, [], { ...want, studioId: "r203" })).toMatchObject({ kind: "session" });
  });
});
