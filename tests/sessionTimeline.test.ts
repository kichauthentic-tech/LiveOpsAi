// Dòng thời gian Cửa sổ ca (08/11): vị trí room / khoảng nghỉ / vạch giao ca trên trục — số thật ca FUJIWA 08/11 10:00–13:00.
import { describe, expect, test } from "vitest";
import { timelineLayout, vnClock } from "../src/lib/liveSnapshot/timeline";

const at = (hm: string) => Date.parse(`2026-11-08T${hm}:00+07:00`);
const iso = (hm: string) => new Date(at(hm)).toISOString();
const win = { startMs: at("10:00"), endMs: at("13:00") };

describe("timelineLayout", () => {
  test("FUJIWA: 2 room, nghỉ 11', room 2 chạy qua 13:00 sang ca sau đã nối", () => {
    const l = timelineLayout({
      win,
      rooms: [
        { roomId: "7705630574144899848", startedAt: iso("10:02"), endedAt: iso("11:29") },
        { roomId: "7705655773732735752", startedAt: iso("11:40"), endedAt: iso("13:13"), partId: "p2" }
      ],
      parts: [{ id: "p2", partNo: 2, reason: "manual_restart", roomIds: ["7705655773732735752"] }],
      next: { startMs: at("13:00"), endMs: at("15:00"), label: "Huỳnh Tấn Khanh", linked: true },
      nowMs: at("22:00")
    });
    expect(l.ticks.map((t) => t.label)).toEqual(["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]);
    expect(l.me).toEqual({ leftPct: 0, widthPct: 60 });
    expect(l.next).toMatchObject({ leftPct: 60, widthPct: 40, linked: true });
    expect(l.turns).toHaveLength(2);
    expect(l.turns[0].reason).toBeUndefined();
    expect(l.turns[1].reason).toBe("manual_restart");
    expect(l.turns[1].outside).toHaveLength(1); // 13:00–13:13 thuộc ca sau
    expect(l.turns[1].inside!.leftPct + l.turns[1].inside!.widthPct).toBeCloseTo(60, 5);
    expect(l.gaps).toEqual([expect.objectContaining({ minutes: 11 })]);
    expect(l.cutEndPct).toBe(60);
    expect(l.cutStartPct).toBeUndefined();
  });

  test("ca thường: 1 room trong ca, không ca kề, không vạch cắt", () => {
    const l = timelineLayout({ win, rooms: [{ roomId: "r", startedAt: iso("10:00"), endedAt: iso("13:00") }], parts: [], nowMs: at("22:00") });
    expect(l.turns).toHaveLength(1);
    expect(l.turns[0].inside).toEqual({ leftPct: 0, widthPct: 100 });
    expect(l.gaps).toEqual([]);
    expect(l.cutEndPct).toBeUndefined();
  });

  test("lượt chỉ ghi nhận lý do (mảnh rỗng) gán lý do theo số lượt", () => {
    const l = timelineLayout({
      win,
      rooms: [{ roomId: "a", startedAt: iso("10:00"), endedAt: iso("11:00") }, { roomId: "b", startedAt: iso("11:05"), endedAt: iso("13:00") }],
      parts: [{ id: "p", partNo: 2, reason: "network", roomIds: [] }],
      nowMs: at("22:00")
    });
    expect(l.turns[1].reason).toBe("network");
  });

  test("room đang live (chưa có giờ kết thúc) vẽ tới bây giờ, room bắt đầu trước ca có vạch cắt đầu", () => {
    const l = timelineLayout({
      win,
      rooms: [{ roomId: "a", startedAt: iso("09:30") }],
      parts: [],
      prev: { startMs: at("08:00"), endMs: at("10:00"), label: "A", linked: true },
      nowMs: at("12:00")
    });
    expect(l.turns[0].open).toBe(true);
    expect(l.turns[0].endMs).toBe(at("12:00"));
    expect(l.cutStartPct).toBeDefined();
    expect(l.prev).toMatchObject({ leftPct: 0, linked: true });
    expect(l.ticks.every((t) => t.pct >= 0 && t.pct <= 100)).toBe(true);
  });

  test("lố giờ ≤ 5 phút không vẽ vạch cắt", () => {
    const l = timelineLayout({ win, rooms: [{ roomId: "r", startedAt: iso("10:01"), endedAt: iso("13:01") }], parts: [], nowMs: at("22:00") });
    expect(l.cutEndPct).toBeUndefined();
  });

  test("room thiếu giờ bị bỏ qua, trục vẫn hợp lệ", () => {
    const l = timelineLayout({ win, rooms: [{ roomId: "x" }], parts: [], nowMs: at("22:00") });
    expect(l.turns).toEqual([]);
    expect(l.me.widthPct).toBe(100);
    expect(vnClock(at("13:13"))).toBe("13:13");
  });
});
