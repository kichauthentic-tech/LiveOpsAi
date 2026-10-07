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
    expect(breakReasonLabel("network")).toBe("Rớt mạng / app crash");
    expect(breakReasonLabel("???")).toBe("???");
  });
});
