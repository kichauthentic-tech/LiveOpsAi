import { describe, expect, it } from "vitest";
import { timeIssues, timeSuggestion, type SessionTimeCheck } from "../src/lib/shiftTime";
import type { LiveSession } from "../src/types";

// Luật giờ ca 0213 (user 10/11) — phần app đọc: gợi ý ở "Ca có gì khác?" và cảnh báo ở Cần xử lý. Số lấy từ ca thật T11.

const check = (o: Partial<SessionTimeCheck>): SessionTimeCheck => ({
  sessionId: "s1",
  headSessionId: "s1",
  isLast: true,
  startAt: "2026-11-05T11:07:00Z",
  endAt: "2026-11-05T14:07:00Z",
  liveMinutes: 180,
  targetMinutes: 180,
  endPending: false,
  ...o
});

const ca = (o: Partial<LiveSession> = {}): LiveSession =>
  ({ id: "s1", date: "2026-11-05", startTime: "18:00", endTime: "21:00", status: "Completed", brandId: "b", platform: "TikTok", ...o }) as LiveSession;

describe("timeSuggestion", () => {
  it("ca cuối room tắt muộn hơn giờ phải live ⇒ gợi ý OT (FUJIWA 08/11 +12')", () => {
    expect(timeSuggestion(check({ endGapMinutes: 12 }))).toEqual({ otMinutes: 12 });
  });
  it("ca cuối thiếu giờ ⇒ gợi ý kết thúc sớm", () => {
    expect(timeSuggestion(check({ endGapMinutes: -20 }))).toEqual({ earlyMinutes: 20 });
  });
  it("lệch ≤ 5' coi như khớp", () => {
    expect(timeSuggestion(check({ endGapMinutes: 4 }))).toEqual({});
    expect(timeSuggestion(check({ endGapMinutes: -5 }))).toEqual({});
  });
  it("ca giữa chuỗi không gợi ý OT/sớm (luôn đủ giờ theo khai báo)", () => {
    expect(timeSuggestion(check({ isLast: false, endGapMinutes: undefined }))).toEqual({});
  });
  it("room còn live lúc xuất file ⇒ không gợi ý gì", () => {
    expect(timeSuggestion(check({ endPending: true, endGapMinutes: undefined }))).toEqual({});
  });
  it("room bật trễ > 5' ⇒ chỉ đưa số phút trễ (CROCS 05/11 trễ 7')", () => {
    expect(timeSuggestion(check({ fileLateMinutes: 7, endGapMinutes: 1 }))).toEqual({ lateMinutes: 7 });
    expect(timeSuggestion(check({ fileLateMinutes: 3 }))).toEqual({});
  });
});

describe("timeIssues", () => {
  const handed = { report: { handoverAt: "2026-11-05T15:00:00Z", statusNote: "" } } as Partial<LiveSession>;
  it("room bật trễ ≥ 30' ⇒ cần kiểm lý do (VERA TikTok 02/11 trễ 60')", () => {
    const out = timeIssues([check({ fileLateMinutes: 60, endGapMinutes: 0 })], [ca(handed)]);
    expect(out.map((x) => [x.kind, x.minutes])).toEqual([["late", 60]]);
  });
  it("ca cuối đã giao ca mà lệch > 5' ⇒ cần kiểm (FUJIWA 02/11 +8')", () => {
    expect(timeIssues([check({ endGapMinutes: 8 })], [ca(handed)]).map((x) => x.kind)).toEqual(["gap"]);
  });
  it("chưa giao ca ⇒ chưa báo lệch (Giao ca còn gợi ý sẵn)", () => {
    expect(timeIssues([check({ endGapMinutes: 8 })], [ca()])).toEqual([]);
  });
  it("đã ghi lý do vào ghi chú giao ca ⇒ tắt", () => {
    const noted = { report: { handoverAt: "x", statusNote: "sự cố mạng" } } as Partial<LiveSession>;
    expect(timeIssues([check({ fileLateMinutes: 60, endGapMinutes: 8 })], [ca(noted)])).toEqual([]);
  });
  it("ca huỷ / loại khỏi báo cáo / room còn live ⇒ không báo", () => {
    expect(timeIssues([check({ fileLateMinutes: 45 })], [ca({ status: "Cancelled" })])).toEqual([]);
    expect(timeIssues([check({ fileLateMinutes: 45 })], [ca({ excludedFromReports: true })])).toEqual([]);
    expect(timeIssues([check({ endPending: true, endGapMinutes: 30 })], [ca(handed)])).toEqual([]);
  });
});

describe("Ca có gì khác? — chip Trễ (0213)", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { HandoverIncidents, incidentsFromReport, incidentValues } = await import("../src/components/HandoverIncidents");
  it("chip ghi 'Trễ', không gán cho host; chọn thì có ô phút và gửi đúng số phút", () => {
    const v = { ...incidentsFromReport(undefined), on: ["late" as const], lateMinutes: 7 };
    const html = renderToStaticMarkup(React.createElement(HandoverIncidents, { value: v, onChange: () => {} }));
    expect(html).not.toContain("Host trễ");
    expect(html).toContain(">Trễ<");
    expect(html).toContain('aria-label="Trễ (phút)"');
    expect(incidentValues(v)).toMatchObject({ lateMinutes: 7, hostLate: true });
    expect(incidentValues({ ...v, on: [] })).toMatchObject({ lateMinutes: 0, hostLate: false });
  });
  it("report cũ chỉ có cờ trễ (không số phút) vẫn bật chip, số phút mặc định 15", () => {
    const st = incidentsFromReport({ hostLate: true, lateMinutes: 0 } as never);
    expect(st.on).toContain("late");
    expect(st.lateMinutes).toBe(15);
  });
});
