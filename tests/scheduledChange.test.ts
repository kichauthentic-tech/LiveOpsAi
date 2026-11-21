// Đợt 1 gom việc trên ca (21/11): một luật cho đổi người / dời giờ ca đã lên lịch.
// Chạy: npx vitest run tests/scheduledChange.test.ts
import { describe, expect, test } from "vitest";
import { planScheduledChange } from "../src/lib/scheduling/scheduledChange";
import { DEFAULT_CHANGE_REASON, changeReasonChoices, effectiveChangeReason } from "../src/lib/scheduling/changeReasons";
import { LiveSession } from "../src/types";

const TODAY = "2026-11-21";
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({ id: "s1", brandName: "CROCS", date: "2026-11-22", startTime: "19:00", endTime: "22:00", status: "Upcoming", studioId: "r1", hostId: "an", coHostId: "binh", ...over }) as LiveSession;
const edit = (s: LiveSession, over: Partial<LiveSession> = {}) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, studioId: s.studioId, hostId: s.hostId, coHostId: s.coHostId, ...over });

describe("planScheduledChange", () => {
  test("ca ngày mai đổi host ⇒ đường Điều Phối (lý do + sổ roster_changes)", () => {
    const s = ca();
    const p = planScheduledChange(s, edit(s, { hostId: "chi" }), TODAY);
    expect(p).toMatchObject({ peopleChanged: true, timeChanged: false, viaRoster: true });
  });
  test("ca hôm nay dời giờ ⇒ đường Điều Phối", () => {
    const s = ca({ date: TODAY });
    expect(planScheduledChange(s, edit(s, { startTime: "20:00" }), TODAY).viaRoster).toBe(true);
  });
  test("chỉ đổi phòng ⇒ không phải đổi lịch, sửa thẳng", () => {
    const s = ca();
    expect(planScheduledChange(s, edit(s, { studioId: "r2" }), TODAY)).toMatchObject({ studioChanged: true, viaRoster: false, directWhy: "" });
  });
  test("ca đã qua ⇒ sửa thẳng cho đúng thực tế", () => {
    const s = ca({ date: "2026-11-20" });
    const p = planScheduledChange(s, edit(s, { coHostId: "dung" }), TODAY);
    expect(p.viaRoster).toBe(false);
    expect(p.directWhy).toMatch(/đã qua/);
  });
  test("ca chia đoạn người ⇒ sửa thẳng (RPC Điều Phối không nhận)", () => {
    const s = ca({ staffSegments: [{ talentId: "an", role: "host", fromMin: 0, toMin: 60 }] } as Partial<LiveSession>);
    expect(planScheduledChange(s, edit(s, { coHostId: "dung" }), TODAY).viaRoster).toBe(false);
  });
  test("bỏ trống host ⇒ sửa thẳng", () => {
    const s = ca();
    expect(planScheduledChange(s, edit(s, { hostId: "" }), TODAY).viaRoster).toBe(false);
  });
  test("ca đã có số mà dời giờ ⇒ không đi Điều Phối", () => {
    const s = ca({ date: TODAY, actualGmv: 1_000_000 });
    expect(planScheduledChange(s, edit(s, { startTime: "20:00" }), TODAY).viaRoster).toBe(false);
  });
  test("không đổi gì ⇒ không đi Điều Phối", () => {
    const s = ca();
    expect(planScheduledChange(s, edit(s), TODAY)).toMatchObject({ viaRoster: false, timeChanged: false, peopleChanged: false });
  });
});

describe("lý do đổi lịch chọn nhanh (21/11: không bắt gõ)", () => {
  test("đổi người ⇒ lựa chọn về người, mặc định đứng đầu", () => {
    const c = changeReasonChoices(true, false);
    expect(c[0]).toBe(DEFAULT_CHANGE_REASON);
    expect(c).toContain("Talent báo bận");
    expect(c).not.toContain("Brand đổi khung live");
  });
  test("đổi cả người lẫn giờ ⇒ gộp, không lặp", () => {
    const c = changeReasonChoices(true, true);
    expect(c).toContain("Brand đổi khung live");
    expect(new Set(c).size).toBe(c.length);
  });
  test("không gõ gì ⇒ ghi lý do mặc định, không bao giờ trống", () => {
    expect(effectiveChangeReason("  ")).toBe(DEFAULT_CHANGE_REASON);
    expect(effectiveChangeReason(" Host ốm ")).toBe("Host ốm");
  });
});
