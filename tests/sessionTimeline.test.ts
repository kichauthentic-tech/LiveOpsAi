// Dòng thời gian Cửa sổ ca (08/11): vị trí room / khoảng nghỉ / vạch giao ca trên trục — số thật ca FUJIWA 08/11 10:00–13:00.
import { describe, expect, test } from "vitest";
import { flexWindow, timelineLayout, vnClock } from "../src/lib/liveSnapshot/timeline";

const at = (hm: string) => Date.parse(`2026-11-08T${hm}:00+07:00`);
const iso = (hm: string) => new Date(at(hm)).toISOString();
const win = { startMs: at("10:00"), endMs: at("13:00") };

describe("timelineLayout", () => {
  test("FUJIWA: 2 room, nghỉ 11' ⇒ ca trượt tới 13:11 (0205), room 2 chạy qua 13:11 sang ca sau đã nối", () => {
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
    // Trục 10:00 → 15:11 (311'): ca = 10:00–13:11 (191'), ca sau 13:11–15:11.
    expect(l.me.leftPct).toBe(0);
    expect(l.me.widthPct).toBeCloseTo((191 / 311) * 100, 5);
    expect(l.next).toMatchObject({ linked: true });
    expect(l.next!.leftPct).toBeCloseTo((191 / 311) * 100, 5);
    expect(l.turns).toHaveLength(2);
    expect(l.turns[0].reason).toBeUndefined();
    expect(l.turns[1].reason).toBe("manual_restart");
    expect(l.turns[1].outside).toHaveLength(1); // 13:11–13:13 thuộc ca sau
    expect(l.turns[1].inside!.leftPct + l.turns[1].inside!.widthPct).toBeCloseTo((191 / 311) * 100, 5);
    expect(l.gaps).toEqual([expect.objectContaining({ minutes: 11 })]);
    expect(l.cutEndPct).toBeUndefined(); // room chỉ lố 2' so với giờ giao 13:11 (≤ dung sai 5')
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

describe("flexWindow — cả chuỗi ca nối trượt theo giờ vào trễ (09/11)", () => {
  const w = { startMs: at("18:00"), endMs: at("21:00") };
  const w2 = { startMs: at("21:00"), endMs: at("00:00") + 24 * 3600000 };
  const w3 = { startMs: at("00:00") + 24 * 3600000, endMs: at("03:00") + 24 * 3600000 };
  const starts = [w.startMs, w2.startMs, w3.startMs];
  test("host 1 vào 18:10 ⇒ ca 1 trượt 18:10–21:10", () => {
    expect(flexWindow(w, [{ startedAt: iso("18:10") }], starts)).toEqual({ startMs: at("18:10"), endMs: at("21:10") });
  });
  test("ca 2 có room chạy tiếp từ 18:10 ⇒ trượt 21:10–00:10", () => {
    const f = flexWindow(w2, [{ startedAt: iso("18:10") }], starts);
    expect(f.startMs).toBe(at("21:10"));
    expect(f.endMs).toBe(at("00:10") + 24 * 3600000);
  });
  test("ca 3 vẫn cùng room 18:10 ⇒ trượt 10' (thừa hưởng từ đầu chuỗi)", () => {
    expect(flexWindow(w3, [{ startedAt: iso("18:10") }], starts).startMs).toBe(w3.startMs + 10 * 60000);
  });
  test("ca 3 chạy tiếp room của ca 2 bật 21:12 ⇒ trượt 12'", () => {
    expect(flexWindow(w3, [{ startedAt: iso("21:12") }], starts).startMs).toBe(w3.startMs + 12 * 60000);
  });
  test("vào trễ ≤ 5' coi như đúng giờ", () => {
    expect(flexWindow(w, [{ startedAt: iso("18:05") }], starts)).toEqual(w);
    expect(flexWindow(w, [{ startedAt: iso("18:06") }], starts).startMs).toBe(at("18:06"));
  });
  test("vào đúng giờ ⇒ giữ nguyên", () => {
    expect(flexWindow(w, [{ startedAt: iso("18:00") }], starts)).toEqual(w);
  });
  test("host bật sớm (không có ca trước) ⇒ không trượt", () => {
    expect(flexWindow(w, [{ startedAt: iso("17:40") }], [w.startMs])).toEqual(w);
  });
  test("trễ 2h ⇒ kẹp 90'", () => {
    expect(flexWindow(w, [{ startedAt: iso("20:00") }], starts).endMs).toBe(at("21:00") + 90 * 60000);
  });
  test("chưa có room ⇒ giữ nguyên", () => {
    expect(flexWindow(w, [], starts)).toEqual(w);
  });
  test("timelineLayout: ca 1 vào trễ 10' bù đủ 3h không vẽ vạch cắt / phần lấn ca sau", () => {
    const l = timelineLayout({ win: w, rooms: [{ roomId: "r", startedAt: iso("18:10"), endedAt: iso("21:10") }], parts: [], nowMs: at("23:00"), chainStartsMs: starts });
    expect(l.cutEndPct).toBeUndefined();
    expect(l.turns[0].outside).toEqual([]);
    expect(l.me.leftPct + l.me.widthPct).toBeCloseTo(100, 5);
    expect(l.turns[0].inside).toEqual(l.me); // phòng phủ kín khung ca đã trượt
  });
  test("timelineLayout: ca 2 nối từ ca 1 — ca trước trượt theo, không hở khoảng trống", () => {
    const l = timelineLayout({
      win: w2,
      rooms: [{ roomId: "r", startedAt: iso("18:10"), endedAt: new Date(at("00:10") + 24 * 3600000).toISOString() }],
      parts: [],
      prev: { startMs: w.startMs, endMs: w.endMs, label: "A", linked: true },
      nowMs: at("23:00") + 24 * 3600000,
      chainStartsMs: starts
    });
    expect(l.prev!.leftPct + l.prev!.widthPct).toBeCloseTo(l.me.leftPct, 5);
    expect(l.cutStartPct).toBeCloseTo(l.me.leftPct, 5); // room chạy tiếp từ ca trước ⇒ vạch giao ca ở đúng giờ vào ca đã trượt
  });
});


describe("0205: phút nghỉ giữa room + giờ giao ca thực", () => {
  const rooms = [
    { startedAt: iso("10:09"), endedAt: iso("12:10") },
    { startedAt: iso("12:16"), endedAt: iso("13:40") }
  ];
  test("ca FUJIWA 09/11: vào trễ 9' + nghỉ 6' ⇒ ca 10:09–13:15, đủ 180' live", () => {
    const w = flexWindow(win, rooms);
    expect(vnClock(w.startMs)).toBe("10:09");
    expect(vnClock(w.endMs)).toBe("13:15");
    const live = (at("12:10") - at("10:09") + (at("13:15") - at("12:16"))) / 60000;
    expect(live).toBe(180);
  });
  test("nghỉ ngoài 1'–30' không tính (45' không phải tắt bật lại)", () => {
    const w = flexWindow(win, [
      { startedAt: iso("10:00"), endedAt: iso("11:00") },
      { startedAt: iso("11:45"), endedAt: iso("13:00") }
    ]);
    expect(w).toEqual(win);
  });
  test("ops nhập giờ giao ca thực ⇒ thay số tự tính, ca sau bắt đầu từ đó", () => {
    const w = flexWindow(win, rooms, [], at("13:20"));
    expect(vnClock(w.endMs)).toBe("13:20");
    const l = timelineLayout({
      win,
      rooms: rooms.map((r, i) => ({ roomId: `r${i}`, ...r })),
      parts: [],
      next: { startMs: at("13:00"), endMs: at("15:00"), label: "Khanh", linked: true },
      nowMs: at("22:00"),
      manualEndMs: at("13:20")
    });
    expect(l.cutEndPct).toBeDefined();
    expect(vnClock(l.axisEndMs)).toBe("15:20");
  });
});

describe("0209: ca không có ca nối sau — giờ giao ca kéo theo giờ room tắt", () => {
  // Franklin Shopee 09/11 20:00–22:00: room 20:03 → 22:33:52, ops khai OT 30'.
  const w = { startMs: at("20:00"), endMs: at("22:00") };
  const room = [{ startedAt: iso("20:03"), endedAt: new Date(at("22:33") + 52000).toISOString() }];
  test("không ca sau ⇒ ca kéo tới giờ tắt room (live 2h30), không còn phần 'lấn ca sau'", () => {
    const f = flexWindow(w, room, [], undefined, true);
    expect(f.startMs).toBe(w.startMs);
    expect(f.endMs).toBe(at("22:33") + 52000);
    const l = timelineLayout({ win: w, rooms: room.map((r) => ({ roomId: "r", ...r })), parts: [], nowMs: at("23:59"), noNextShift: true });
    expect(l.cutEndPct).toBeUndefined();
    expect(l.turns[0].outside).toHaveLength(0);
    // Đoạn OT = 22:00 → 22:33:52, vạch ở 22:00.
    expect(l.overtime?.minutes).toBe(34);
    expect(l.overtime!.fromPct).toBeGreaterThan(70);
    expect(l.overtime!.leftPct + l.overtime!.widthPct).toBeCloseTo(100, 5);
  });
  test("trượt vì vào trễ / ca có ca sau / nhập tay ⇒ không vẽ OT", () => {
    const late = [{ roomId: "r", startedAt: iso("20:10"), endedAt: iso("22:10") }];
    expect(timelineLayout({ win: w, rooms: late, parts: [], nowMs: at("23:00"), noNextShift: true }).overtime).toBeUndefined();
    expect(timelineLayout({ win: w, rooms: room.map((r) => ({ roomId: "r", ...r })), parts: [], nowMs: at("23:59"), noNextShift: false }).overtime).toBeUndefined();
    expect(timelineLayout({ win: w, rooms: room.map((r) => ({ roomId: "r", ...r })), parts: [], nowMs: at("23:59"), noNextShift: true, manualEndMs: at("22:20") }).overtime).toBeUndefined();
  });
  test("có ca sau (noNextShift = false) ⇒ giữ mốc 22:00 như cũ", () => {
    expect(flexWindow(w, room, [], undefined, false)).toEqual(w);
  });
  test("room lố ≤ 5' ⇒ không kéo; còn room chưa tắt ⇒ không kéo", () => {
    expect(flexWindow(w, [{ startedAt: iso("20:00"), endedAt: iso("22:05") }], [], undefined, true)).toEqual(w);
    expect(flexWindow(w, [{ startedAt: iso("20:00") }], [], undefined, true)).toEqual(w);
  });
  test("kẹp tối đa +90' so với giờ hết ca kế hoạch", () => {
    expect(flexWindow(w, [{ startedAt: iso("20:00"), endedAt: new Date(at("22:00") + 3 * 3600000).toISOString() }], [], undefined, true).endMs).toBe(at("22:00") + 90 * 60000);
  });
  test("ops nhập giờ giao ca thực vẫn được ưu tiên hơn số tự kéo", () => {
    expect(vnClock(flexWindow(w, room, [], at("22:20"), true).endMs)).toBe("22:20");
  });
});
