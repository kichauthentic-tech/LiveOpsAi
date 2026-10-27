import { describe, expect, it } from "vitest";
import { breakReasonLabel, nextLinkStatus, roomGapMinutes, roomsMissingFromPrev, suggestedRestartCount } from "../src/lib/liveSnapshot/roomCases";

const t = (hhmm: string) => `2026-10-07T${hhmm}:00+07:00`;

describe("roomGapMinutes", () => {
  it("cộng khoảng nghỉ giữa các room liên tiếp", () => {
    expect(roomGapMinutes([
      { roomId: "a", startedAt: t("09:00"), endedAt: t("10:30") },
      { roomId: "b", startedAt: t("10:40"), endedAt: t("12:00") }
    ])).toBe(10);
  });
  it("room chồng giờ không tạo khoảng nghỉ âm; room nằm gọn trong room khác không đổi mốc", () => {
    expect(roomGapMinutes([
      { roomId: "a", startedAt: t("09:00"), endedAt: t("11:00") },
      { roomId: "b", startedAt: t("10:00"), endedAt: t("10:30") },
      { roomId: "c", startedAt: t("11:05"), endedAt: t("12:00") }
    ])).toBe(5);
  });
  it("sắp theo giờ dù đầu vào lộn xộn; bỏ qua room thiếu giờ; 1 room = 0", () => {
    expect(roomGapMinutes([
      { roomId: "b", startedAt: t("10:40"), endedAt: t("12:00") },
      { roomId: "x" },
      { roomId: "a", startedAt: t("09:00"), endedAt: t("10:30") }
    ])).toBe(10);
    expect(roomGapMinutes([{ roomId: "a", startedAt: t("09:00"), endedAt: t("10:00") }])).toBe(0);
    expect(roomGapMinutes([])).toBe(0);
  });
});

describe("suggestedRestartCount", () => {
  it("lấy số lớn hơn giữa số lần ngắt đã ghi và số room − 1", () => {
    expect(suggestedRestartCount(0, 1)).toBe(0);
    expect(suggestedRestartCount(0, 3)).toBe(2);
    expect(suggestedRestartCount(3, 2)).toBe(3);
    expect(suggestedRestartCount(0, 0)).toBe(0);
  });
});

describe("roomsMissingFromPrev", () => {
  const prev = { boundaryMs: Date.parse(t("12:00")), roomIds: ["R1"] };
  it("phòng bắt đầu trước giờ hết ca trước mà ca trước không có ⇒ nghi ngờ", () => {
    expect(roomsMissingFromPrev([{ roomId: "R9", startedAt: t("10:00") }], prev)).toEqual(["R9"]);
  });
  it("phòng có ở ca trước, hoặc bắt đầu sau giờ giao ca (restart ở ca này) ⇒ không nghi ngờ", () => {
    expect(roomsMissingFromPrev([{ roomId: "R1", startedAt: t("10:00") }, { roomId: "R2", startedAt: t("12:10") }], prev)).toEqual([]);
  });
});

describe("nextLinkStatus / breakReasonLabel", () => {
  it("none / waiting / ready", () => {
    expect(nextLinkStatus(false, false)).toBe("none");
    expect(nextLinkStatus(true, false)).toBe("waiting");
    expect(nextLinkStatus(true, true)).toBe("ready");
  });
  it("nhãn lý do; lý do lạ trả nguyên khoá", () => {
    expect(breakReasonLabel("network")).toBe("Mất kết nối / ứng dụng lỗi");
    expect(breakReasonLabel("???")).toBe("???");
  });
});

import { adjacentShiftChain, buildTurns, chainBoundaries, classifyRoomRole, roomsFromPrev, runOverRoom, sortTurns } from "../src/lib/liveSnapshot/roomCases";

describe("classifyRoomRole", () => {
  const win = { startMs: Date.parse(t("18:00")), endMs: Date.parse(t("21:00")) };
  it("trọn ca / chạy qua giờ giao / đến từ ca trước / cả hai / ngoài ca", () => {
    expect(classifyRoomRole({ startedAt: t("18:02"), endedAt: t("19:40") }, win)).toBe("full");
    expect(classifyRoomRole({ startedAt: t("19:45"), endedAt: t("21:30") }, win)).toBe("runs_over");
    expect(classifyRoomRole({ startedAt: t("19:45") }, win)).toBe("runs_over"); // đang live
    expect(classifyRoomRole({ startedAt: t("16:00"), endedAt: t("19:00") }, win)).toBe("from_prev");
    expect(classifyRoomRole({ startedAt: t("16:00") }, win)).toBe("both");
    expect(classifyRoomRole({ startedAt: t("15:00"), endedAt: t("17:50") }, win)).toBe("outside");
    expect(classifyRoomRole({ startedAt: t("21:00"), endedAt: t("22:00") }, win)).toBe("outside");
  });
  it("chạm rìa trong dung sai 5' không tính xuyên ranh giới", () => {
    expect(classifyRoomRole({ startedAt: t("17:57"), endedAt: t("20:58") }, win)).toBe("full");
    expect(classifyRoomRole({ startedAt: t("18:00"), endedAt: t("21:04") }, win)).toBe("full");
    expect(classifyRoomRole({ startedAt: t("18:00"), endedAt: t("21:06") }, win)).toBe("runs_over");
  });
  it("runOverRoom lấy đúng một room; roomsFromPrev lấy room đến từ ca trước", () => {
    const rooms = [
      { roomId: "a", startedAt: t("18:00"), endedAt: t("19:40") },
      { roomId: "b", startedAt: t("19:45") },
      { roomId: "c", startedAt: t("16:00"), endedAt: t("18:30") }
    ];
    expect(runOverRoom(rooms, win)?.roomId).toBe("b");
    expect(roomsFromPrev(rooms, win).map((r) => r.roomId)).toEqual(["c"]);
    expect(runOverRoom([rooms[0]], win)).toBeUndefined();
  });
});

describe("buildTurns / sortTurns", () => {
  it("lượt 1 = room không thuộc mảnh; mỗi mảnh là một lượt, mảnh chỉ-ghi-nhận vẫn là lượt rỗng", () => {
    const rooms = [
      { roomId: "b", startedAt: t("19:45"), partId: "p2" },
      { roomId: "a", startedAt: t("18:00") }
    ];
    const turns = buildTurns(rooms, [
      { id: "p2", partNo: 2, reason: "network" },
      { id: "p3", partNo: 3, reason: "manual_restart" }
    ]);
    expect(turns.map((x) => [x.no, x.rooms.map((r) => r.roomId)])).toEqual([[1, ["a"]], [2, ["b"]], [3, []]]);
    expect(sortTurns([{ startedAt: t("10:00") }, { startedAt: t("09:00") }, {}]).map((r) => r.startedAt)).toEqual([t("09:00"), t("10:00"), undefined]);
  });
});

describe("adjacentShiftChain / chainBoundaries", () => {
  const sh = (id: string, date: string, st: string, et: string, over: Record<string, unknown> = {}) => ({ id, brandId: "b1", platform: "TikTok", date, startTime: st, endTime: et, status: "Completed", ...over });
  const day = [
    sh("a", "2026-10-07", "10:00", "13:00"),
    sh("b", "2026-10-07", "13:00", "16:00"),
    sh("c", "2026-10-07", "17:00", "20:00"), // cách b 60' ⇒ đứt chuỗi
    sh("d", "2026-10-07", "20:00", "00:30"),
    sh("e", "2026-10-08", "00:30", "03:00"), // ca qua nửa đêm vẫn nối
    sh("x", "2026-10-07", "13:00", "16:00", { brandId: "b2" }),
    sh("y", "2026-10-07", "16:00", "17:00", { status: "Cancelled" })
  ];
  it("gom ca liền kề cùng brand + sàn, bỏ ca huỷ, đứt khi cách > 30'", () => {
    expect(adjacentShiftChain(day[1], day).map((x) => x.id)).toEqual(["a", "b"]);
    expect(adjacentShiftChain(day[3], day).map((x) => x.id)).toEqual(["c", "d", "e"]);
    expect(adjacentShiftChain(day[2], day).map((x) => x.id)).toEqual(["c", "d", "e"]);
  });
  it("ranh giới nối + khoá khi ca trước chưa có file", () => {
    const chain = adjacentShiftChain(day[2], day);
    const bs = chainBoundaries(chain, [{ prevId: "c", nextId: "d" }], (id) => id === "d");
    expect(bs).toEqual([
      { prevId: "c", nextId: "d", kind: "linked", locked: true },
      { prevId: "d", nextId: "e", kind: "unlinked", locked: false }
    ]);
  });
});
