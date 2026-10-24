// Điều Phối Lịch Live đợt 1 (24/10): hao hụt kênh, giờ cần xếp, việc nên làm tháng này, 6 bước mở lịch tháng sau.
import { expect, test } from "vitest";
import { channelShrinkage, hoursToSchedule, nextRow, nowActions, nowHours, shrinkSums, SHRINK_CAP, SHRINK_FLOOR, type NextInput } from "../src/lib/roster/monthDesk";
import type { AccountRow } from "../src/lib/performance/accountOverview";
import type { LiveSession, ShiftSlot } from "../src/types";
import { brandPlatformKey } from "../src/lib/reportPlatform";
import { signupDeadlineOf } from "../src/lib/db/roster";
import { isoWeekStart } from "../src/lib/dateUtils";

const B = "b1";
const ses = (id: string, date: string, start: string, end: string, status: LiveSession["status"], extra: Partial<LiveSession> = {}): LiveSession =>
  ({ id, title: id, brandId: B, brandName: "VERA", platform: "TikTok", date, startTime: start, endTime: end, status, targetGmv: 0, actualGmv: 1, monthPublished: true, ...extra }) as LiveSession;
const slot = (id: string, date: string, extra: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id, date, startTime: "19:00", endTime: "22:00", brandId: B, brandName: "VERA", platform: "TikTok", studioName: "", notes: "", status: "open", ...extra }) as ShiftSlot;
const KEY = brandPlatformKey(B, "TikTok");

test("hao hụt = huỷ + live ngắn hơn lịch × (1 − huỷ); bỏ ca nạp bù, ca chưa tới, ca ngoài 60 ngày", () => {
  const sessions = [
    ...Array.from({ length: 10 }, (_, i) => ses(`a${i}`, "2026-10-05", "09:00", "12:00", "Completed", { liveDurationMinutes: 180 })), // 30h đủ giờ
    ses("short", "2026-10-06", "09:00", "12:00", "Completed", { liveDurationMinutes: 120 }), // thiếu 1h
    ses("cancel", "2026-10-07", "09:00", "12:00", "Cancelled"), // 3h huỷ
    ses("backfill", "2026-10-08", "09:00", "12:00", "Completed", { isBackfill: true, liveDurationMinutes: 10 }),
    ses("future", "2026-10-30", "09:00", "12:00", "Upcoming"),
    ses("old", "2026-07-01", "09:00", "12:00", "Cancelled")
  ];
  const s = channelShrinkage(shrinkSums(sessions, "2026-10-24"), KEY);
  expect(s.source).toBe("channel");
  expect(s.plannedHours).toBe(36);
  expect(s.cancelRate).toBeCloseTo(3 / 36, 6);
  expect(s.shortRate).toBeCloseTo(1 / 33, 6);
  expect(s.rate).toBeCloseTo(3 / 36 + (1 / 33) * (33 / 36), 6);
  expect(s.applied).toBeCloseTo(s.rate, 6);
});

test("hao hụt kẹp 3%–15%; kênh ít dữ liệu dùng trung bình agency; không có gì thì sàn 3%", () => {
  const many = Array.from({ length: 12 }, (_, i) => ses(`x${i}`, "2026-10-05", "09:00", "12:00", "Completed", { brandId: "b2", liveDurationMinutes: 90 }));
  const sums = shrinkSums([...many, ses("one", "2026-10-05", "09:00", "12:00", "Completed", { liveDurationMinutes: 180 })], "2026-10-24");
  expect(channelShrinkage(sums, brandPlatformKey("b2", "TikTok")).applied).toBe(SHRINK_CAP); // 50% → 15%
  const fallback = channelShrinkage(sums, KEY);
  expect(fallback.source).toBe("agency");
  expect(fallback.applied).toBe(SHRINK_CAP);
  expect(channelShrinkage(shrinkSums([], "2026-10-24"), KEY)).toMatchObject({ source: "floor", applied: SHRINK_FLOOR });
});

test("giờ cần xếp CHIA cho (1 − hao hụt), không cộng", () => {
  expect(hoursToSchedule(250, 0.08)).toBeCloseTo(271.74, 2);
  expect(hoursToSchedule(0, 0.08)).toBe(0);
});

test("tháng này: giờ live thật, ca mở từ hôm nay, phần còn thiếu đã tính phòng hờ", () => {
  const sessions = [
    ses("d1", "2026-10-05", "09:00", "12:00", "Completed", { liveDurationMinutes: 150 }), // 2,5h thật
    ses("d2", "2026-10-06", "09:00", "12:00", "Completed"), // chưa có giờ thật: 3h theo lịch
    ses("u1", "2026-10-28", "09:00", "12:00", "Upcoming"),
    ses("other", "2026-11-02", "09:00", "12:00", "Upcoming")
  ];
  const h = nowHours(sessions, [slot("s1", "2026-10-29"), slot("past", "2026-10-02")], B, "TikTok", "2026-10", "2026-10-24", 20, 0.1);
  expect(h.delivered).toBe(5.5);
  expect(h.deliveredPlanned).toBe(6);
  expect(h.estimated).toBe(1);
  expect(h.scheduled).toBe(3);
  expect(h.open).toBe(3);
  expect(h.remaining).toBe(14.5);
  expect(h.needScheduled).toBeCloseTo(14.5 / 0.9, 6);
  expect(h.extra).toBeCloseTo(14.5 / 0.9 - 6, 6);
  expect(h.shortByReason).toEqual({ none: 0.5 });
});

test("giờ tắt sớm theo lý do khai lúc giao ca (0180)", () => {
  const report = (r: "low_sales" | "technical") => ({ earlyLeaveReason: r, earlyLeaveMinutes: 60 }) as LiveSession["report"];
  const sessions = [
    ses("a", "2026-10-05", "09:00", "12:00", "Completed", { liveDurationMinutes: 120, report: report("low_sales") }),
    ses("b", "2026-10-06", "09:00", "12:00", "Completed", { liveDurationMinutes: 150, report: report("technical") }),
    ses("c", "2026-10-07", "09:00", "12:00", "Completed", { liveDurationMinutes: 90, report: report("low_sales") }),
    ses("d", "2026-10-08", "09:00", "12:00", "Completed", { liveDurationMinutes: 200 }) // OT: không vào giờ mất
  ];
  expect(nowHours(sessions, [], B, "TikTok", "2026-10", "2026-10-24", 0, 0.05).shortByReason).toEqual({ low_sales: 2.5, technical: 0.5 });
});

test("hạn đăng ký của một ngày = hạn sớm hơn giữa hạn tháng và hạn tuần cũ", () => {
  const wk = (d: string) => isoWeekStart(d);
  const months = [{ month: "2026-11", signupDeadline: "2026-10-28T10:00:00Z" }];
  expect(signupDeadlineOf("2026-11-03", months, [], wk)).toBe("2026-10-28T10:00:00Z");
  expect(signupDeadlineOf("2026-11-03", months, [{ weekStart: "2026-11-02", signupDeadline: "2026-10-27T10:00:00Z" }], wk)).toBe("2026-10-27T10:00:00Z");
  // Tuần 26/10–01/11: ngày 01/11 lấy hạn THÁNG 11 dù thứ Hai thuộc tháng 10.
  expect(signupDeadlineOf("2026-11-01", months, [], wk)).toBe("2026-10-28T10:00:00Z");
  expect(signupDeadlineOf("2026-10-30", months, [], wk)).toBeUndefined();
});

const row = (rescue: Partial<AccountRow["rescue"]>): AccountRow =>
  ({ rescue: { kind: "on_track", needRate: null, nowRate: null, hoursLeft: null, extraHours: null, needPct: null, projectedAfter: null, ...rescue } }) as AccountRow;
const H = (extra: number, buffer = 2) => ({ committed: 100, delivered: 50, deliveredPlanned: 52, estimated: 0, scheduled: 40, open: 0, remaining: 50, needScheduled: 40 + extra, extra, buffer, shortByReason: {} });
const fmt = (v: number) => `${v / 1e6}M`;

test("việc nên làm: thêm giờ vì GMV chỉ khi bù được; không bù được thì báo brand, lịch dư thì cân nhắc bỏ ca", () => {
  expect(nowActions(row({ kind: "save", extraHours: 6 }), null, fmt)[0].text).toContain("Xếp thêm ~6 giờ live là dự báo đạt target");
  const c = nowActions(row({ kind: "cannot", needRate: 7e6, nowRate: 1.6e6 }), H(12), fmt).map((a) => a.text);
  expect(c[0]).toContain("Xếp thêm ~12 giờ live để đủ cam kết (gồm ~2 giờ phòng hờ)");
  expect(c[1]).toBe("Không thêm giờ vì GMV: cần 7M/giờ, đang 1.6M/giờ. Báo brand sớm.");
  expect(nowActions(row({ kind: "cannot", needRate: 9e6, nowRate: 3e6 }), H(-19), fmt).map((a) => a.text)[1]).toContain("Lịch dư ~19 giờ");
  expect(nowActions(row({ kind: "on_track" }), H(0), fmt)).toEqual([{ tone: "good", text: "Đúng tiến độ target. Giữ lịch." }]);
});

const base: NextInput = { brandId: B, platform: "TikTok", month: "2026-11", committedHours: 90, committedGmv: 250e6, planStatus: "locked", shrink: 0.1, sessions: [], slots: [], registrations: [], drafts: [], weeks: [] };

test("tháng sau: đi đúng thứ tự 6 bước", () => {
  expect(nextRow({ ...base, committedHours: null, committedGmv: null }).step).toBe("commit");
  expect(nextRow({ ...base, planStatus: "none" }).next).toBe("Lập Kế Hoạch Tháng");
  expect(nextRow({ ...base, planStatus: "draft" }).next).toBe("Chốt Kế Hoạch Tháng");
  const slots = Array.from({ length: 34 }, (_, i) => slot(`s${i}`, `2026-11-${String((i % 28) + 1).padStart(2, "0")}`)); // 102h ≥ 100h cần mở
  expect(nextRow({ ...base, slots: slots.slice(0, 10) }).next).toBe("Mở thêm ~70 giờ");
  const signup = nextRow({ ...base, slots, registrations: [{ id: "r", slotId: "s0", talentId: "t", registeredAt: "" }] });
  expect(signup.step).toBe("signup");
  expect(signup.next).toBe("Chờ đăng ký: 1/34 ca có người");
  const regs = slots.map((s) => ({ id: s.id, slotId: s.id, talentId: "t", registeredAt: "" }));
  expect(nextRow({ ...base, slots, registrations: regs }).next).toBe("Xếp người: 34 ca chưa có host");
  const drafts = slots.map((s) => ({ slotId: s.id, hostId: "h" }));
  expect(nextRow({ ...base, slots, registrations: regs, drafts }).step).toBe("publish");
  expect(nextRow({ ...base, sessions: [ses("n", "2026-11-03", "09:00", "21:00", "Upcoming"), ...Array.from({ length: 8 }, (_, i) => ses(`m${i}`, "2026-11-04", "09:00", "21:00", "Upcoming"))] }).step).toBe("done");
});

test("tháng sau: GMV cam kết dưới 1M bị đánh dấu (FUJIWA 450); cam kết chỉ có GMV vẫn qua bước cam kết", () => {
  expect(nextRow({ ...base, committedGmv: 450 }).gmvSuspicious).toBe(true);
  const gmvOnly = nextRow({ ...base, committedHours: 0, planStatus: "none" });
  expect(gmvOnly.step).toBe("plan");
  expect(gmvOnly.toOpen).toBeNull();
});
