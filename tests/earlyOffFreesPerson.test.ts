// Ca KẾT THÚC SỚM trả người về rảnh từ giờ off (user 25/11): "plan 13–15 nhưng 14h đã off thì xếp host ca đó cho khung 14h
// được". Cùng luật DB private.person_windows (0232). Giờ theo lịch / giờ lương không đổi.
// Chạy: npx vitest run tests/earlyOffFreesPerson.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { personClash, findPersonClashes } = await import("../src/lib/scheduling/conflicts");
const { busyWindows, personWindows } = await import("../src/lib/staffSegments");
const R = await import("../src/lib/roster/rules");
import type { LiveSession, LiveSessionReport, ShiftSlot } from "../src/types";

const report = (earlyLeaveMinutes: number) => ({ sessionId: "x", restartCount: 0, crossLive: false, hostLate: false, otMinutes: 0, earlyLeaveMinutes, lateMinutes: 0, statusNote: "" }) as LiveSessionReport;
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "vera",
    brandName: "VERA",
    platform: "TikTok",
    studioId: "r-vera",
    date: "2026-11-25",
    startTime: "13:00",
    endTime: "15:00",
    status: "Upcoming",
    hostId: "hung",
    hostName: "Hùng",
    coHostId: "thy",
    coHostName: "Thy",
    isBackfill: false,
    ...over
  }) as LiveSession;
const want = { date: "2026-11-25", startTime: "14:00", endTime: "16:00" };

describe("busyWindows — kết thúc sớm", () => {
  test("ca 13–15 off sớm 60' ⇒ host + trợ bận 13–14; giờ theo lịch giữ nguyên", () => {
    const s = ca("a", { report: report(60) });
    expect(busyWindows(s, "hung")).toEqual([{ date: "2026-11-25", startTime: "13:00", endTime: "14:00" }]);
    expect(busyWindows(s, "thy")).toEqual([{ date: "2026-11-25", startTime: "13:00", endTime: "14:00" }]);
    expect(personWindows(s, "hung")).toHaveLength(1);
    expect(personWindows(s, "hung")[0].endTime).toBe("15:00");
  });

  test("ca chia đoạn: đoạn nằm sau giờ off bỏ hẳn, đoạn vắt qua bị cắt", () => {
    const s = ca("a", {
      startTime: "12:00",
      endTime: "16:00",
      report: report(90), // off lúc 14:30
      staffSegments: [
        { talentId: "hung", talentName: "Hùng", role: "host", fromMin: 0, toMin: 120 },
        { talentId: "khanh", talentName: "Khanh", role: "host", fromMin: 120, toMin: 180 },
        { talentId: "ngan", talentName: "Ngân", role: "host", fromMin: 180, toMin: 240 }
      ]
    });
    expect(busyWindows(s, "hung")).toEqual([{ date: "2026-11-25", startTime: "12:00", endTime: "14:00" }]);
    expect(busyWindows(s, "khanh")).toEqual([{ date: "2026-11-25", startTime: "14:00", endTime: "14:30" }]);
    expect(busyWindows(s, "ngan")).toEqual([]);
  });

  test("ca qua đêm 22–01 off sớm 120' ⇒ bận 22–23", () => {
    const s = ca("a", { startTime: "22:00", endTime: "01:00", report: report(120) });
    expect(busyWindows(s, "hung")).toEqual([{ date: "2026-11-25", startTime: "22:00", endTime: "23:00" }]);
  });
});

describe("kiểm trùng người theo giờ off", () => {
  test("personClash: xếp host vào ca 14h được khi ca 13–15 đã off 14h; chưa khai thì vẫn chặn", () => {
    expect(personClash([ca("a", { report: report(60) })], want, "hung")).toBeNull();
    expect(personClash([ca("a", { report: report(30) })], want, "hung")?.id).toBe("a");
    expect(personClash([ca("a")], want, "hung")?.id).toBe("a");
  });

  test("findPersonClashes không tô đỏ cặp ca nối sau giờ off", () => {
    const b = ca("b", { brandId: "crocs", brandName: "CROCS", studioId: "r-crocs", startTime: "14:00", endTime: "16:00", coHostId: undefined, coHostName: undefined });
    expect(findPersonClashes([ca("a", { report: report(60) }), b])).toHaveLength(0);
    expect(findPersonClashes([ca("a"), b])).toHaveLength(1);
  });

  test("Điều Phối: nháp xếp host vào ca mở 14h không còn bị chặn trùng giờ", () => {
    const open: ShiftSlot = { id: "o1", date: "2026-11-25", startTime: "14:00", endTime: "16:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioId: "r-crocs", studioName: "CROCS", notes: "", status: "open" };
    const codes = (s: LiveSession) =>
      R.analyzeRoster(R.buildRosterShifts([s], [open], [{ slotId: "o1", hostId: "hung" }], [], "2026-11-24", "2026-11-30"), R.DEFAULT_ROSTER_RULES, "2026-11-24", (id) => id)
        .issues.filter((i) => i.talentId === "hung")
        .map((i) => i.code);
    expect(codes(ca("a", { report: report(60) }))).not.toContain("clash");
    expect(codes(ca("a"))).toContain("clash");
  });
});
