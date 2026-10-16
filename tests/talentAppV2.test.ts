// App talent bản 2 (16/10): danh sách "Ca của tôi" theo tuần, chấm đỏ chỉ đếm việc làm được trên điện thoại, hiệu suất chỉ dòng có
// kết luận, tin Zalo lúc công bố tuần, và file lịch .ics (0177). Tình huống lấy từ lịch thật của Huỳnh Tấn Khanh 16–31/10:
// T6 16/10 11:00 Franklin Shopee (host) + 20:00 JOCKEY; CN 18/10 bị xếp trùng 11:00 JOCKEY (host) và 11:00 Franklin TikTok (trợ);
// ca Shopee 21:00–00:00 qua nửa đêm.
// Chạy: npx vitest run tests/talentAppV2.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const A = await import("../src/lib/talent/agenda");
const F = await import("../src/server/calendarFeed");
const { mySessions } = await import("../src/lib/talent/myShifts");
import type { LiveSession } from "../src/types";
import type { ChannelStanding } from "../src/lib/talent/standing";
import type { FeedSegmentRow, FeedSessionRow } from "../src/server/calendarFeed";

const KHANH = "khanh";
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "franklin",
    brandName: "Franklin",
    platform: "Shopee",
    studioName: "FRANKLIN SPE",
    date: "2026-10-16",
    startTime: "11:00",
    endTime: "14:00",
    status: "Upcoming",
    hostId: KHANH,
    hostName: "Huỳnh Tấn Khanh",
    coHostId: "toan",
    coHostName: "Huỳnh Thái Toàn",
    isBackfill: false,
    ...over
  }) as LiveSession;

const SCHEDULE = [
  ca("a"),
  ca("b", { brandId: "jockey", brandName: "JOCKEY", platform: "TikTok", startTime: "20:00", endTime: "22:00", coHostId: "duy", coHostName: "Đặng Duy" }),
  ca("c", { date: "2026-10-18", brandId: "jockey", brandName: "JOCKEY", platform: "TikTok", endTime: "13:00" }),
  ca("d", { date: "2026-10-18", platform: "TikTok", hostId: "an", hostName: "Quốc An", coHostId: KHANH, coHostName: "Huỳnh Tấn Khanh" }),
  ca("e", { date: "2026-10-24", startTime: "21:00", endTime: "00:00" }),
  ca("x", { date: "2026-10-20", status: "Cancelled" }),
  ca("f", { date: "2026-10-28" })
];

describe("Ca của tôi theo tuần", () => {
  test("tuần này tính từ hôm nay tới CN; tuần sau T2–CN; sau nữa từ T2 tuần kế tiếp", () => {
    const r = A.agendaRanges("2026-10-16");
    expect(r.map((x) => [x.key, x.from, x.to])).toEqual([
      ["this", "2026-10-16", "2026-10-18"],
      ["next", "2026-10-19", "2026-10-25"],
      ["later", "2026-10-26", "9999-12-31"]
    ]);
  });

  test("mỗi ca một lần, theo ngày, có khoảng nghỉ giữa hai ca cùng ngày; ca huỷ không hiện", () => {
    const mine = mySessions(SCHEDULE, KHANH);
    const days = A.agendaDays(mine, KHANH, "2026-10-16", "2026-10-18");
    expect(days.map((d) => [d.date, d.items.map((i) => i.session.id)])).toEqual([
      ["2026-10-16", ["a", "b"]],
      ["2026-10-18", ["c", "d"]]
    ]);
    expect(days[0].items[1].gapMin).toBe(6 * 60);
    expect(days[0].hours).toBe(5);
    expect(A.agendaDays(mine, KHANH, "2026-10-19", "2026-10-25").map((d) => d.date)).toEqual(["2026-10-24"]);
  });

  test("lưới tuần màn rộng: T2 → CN của tuần chứa ngày đó (cả khi ngày đó là CN)", () => {
    expect(A.weekDates("2026-10-16")).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    expect(A.weekDates("2026-10-18")[0]).toBe("2026-10-12");
    expect(A.TALENT_WIDE_QUERY).toBe("(min-width: 1024px)");
    expect(A.TALENT_WEEK_GRID_QUERY).toBe("(min-width: 1280px)");
  });

  test("chấm đỏ: 23 ca chờ nhận + 2 chỗ trùng = 3 (một cho lịch mới, một cho mỗi chỗ trùng)", () => {
    expect(A.myBadgeCount(23, 2)).toBe(3);
    expect(A.myBadgeCount(0, 0)).toBe(0);
    expect(A.myBadgeCount(1, 0)).toBe(1);
  });
});

describe("Hiệu suất chỉ dòng có kết luận", () => {
  const row = (verdict: ChannelStanding["verdict"], ratio: number) => ({ verdict, ratio }) as ChannelStanding;
  test("tách và nói bằng chữ", () => {
    const s = A.splitStanding([row("unclear", 1.16), row("below", 0.65), row("unclear", 0.95), row("above", 1.2)]);
    expect(s.clear.map((r) => r.verdict)).toEqual(["below", "above"]);
    expect(s.unclear).toHaveLength(2);
    expect(A.standingSentence(row("below", 0.65))).toBe("thấp hơn mặt bằng khoảng 35%");
    expect(A.standingSentence(row("above", 1.2))).toBe("cao hơn mặt bằng khoảng 20%");
  });
});

describe("Tin Zalo lịch tuần", () => {
  test("theo người (tên ngắn), ca theo giờ, có link, không có số tiền; bỏ ca huỷ và ngoài tuần", () => {
    const msg = A.weekScheduleMessage(SCHEDULE, "2026-10-16", "2026-10-18", [{ id: KHANH, name: "Huỳnh Tấn Khanh", nickname: "Khanh" }], "https://app.test/ca-cua-toi");
    expect(msg.split("\n").slice(0, 3)).toEqual(["LỊCH LIVE 16/10 – 18/10", 'Mở link xem ca của bạn và bấm "Đã xem":', "https://app.test/ca-cua-toi"]);
    expect(msg).toContain("Khanh – 4 ca\n  T6 16/10 11:00–14:00 · Franklin Shopee · Host\n  T6 16/10 20:00–22:00 · JOCKEY TikTok · Host");
    expect(msg).toContain("  CN 18/10 11:00–14:00 · Franklin TikTok · Trợ live");
    // Người không có trong danh sách talent vẫn có tên (lấy từ ca).
    expect(msg).toContain("Toàn – 2 ca");
    expect(msg).not.toMatch(/24\/10|20\/10|GMV|target|đ\b/i);
  });

  test("người chỉ đứng một đoạn khi đổi người giữa ca vẫn có tên", () => {
    const seg = ca("s", { coHostId: "toan", staffSegments: [{ talentId: "toan", talentName: "Huỳnh Thái Toàn", role: "co_host", fromMin: 0, toMin: 90 }, { talentId: "vuong", talentName: "Nguyễn Triệu Vương", role: "co_host", fromMin: 90, toMin: 180 }] } as Partial<LiveSession>);
    const msg = A.weekScheduleMessage([seg], "2026-10-16", "2026-10-16", [{ id: "vuong", name: "Nguyễn Triệu Vương", nickname: "T.Vương" }], "x");
    expect(msg).toContain("T.Vương – 1 ca");
  });
});

describe("File lịch .ics", () => {
  const row = (id: string, over: Partial<FeedSessionRow> = {}): FeedSessionRow => ({
    id,
    date: "2026-10-16",
    start_time: "11:00:00",
    end_time: "14:00:00",
    status: "Upcoming",
    platform: "Shopee",
    brand_name: "Franklin",
    studio_name: "FRANKLIN SPE",
    host_id: KHANH,
    host_name: "Huỳnh Tấn Khanh",
    co_host_id: "toan",
    co_host_name: "Huỳnh Thái Toàn",
    is_backfill: false,
    ...over
  });

  test("giờ Việt Nam → UTC, ca qua nửa đêm sang ngày sau, bỏ ca huỷ / nạp bù / không phải của mình", () => {
    const ev = F.feedEvents(
      [row("a"), row("e", { date: "2026-10-24", start_time: "21:00", end_time: "00:00" }), row("x", { status: "Cancelled" }), row("b", { is_backfill: true }), row("o", { host_id: "an", co_host_id: "vuong" })],
      [],
      KHANH,
      "https://app.test/ca-cua-toi"
    );
    expect(ev.map((e) => [e.uid.split("-")[0], new Date(e.start).toISOString(), new Date(e.end).toISOString()])).toEqual([
      ["a", "2026-10-16T04:00:00.000Z", "2026-10-16T07:00:00.000Z"],
      ["e", "2026-10-24T14:00:00.000Z", "2026-10-24T17:00:00.000Z"]
    ]);
    expect(ev[0].summary).toBe("Franklin Shopee · Host");
    expect(ev[0].location).toBe("FRANKLIN SPE");
    expect(ev[0].description).toBe("Trợ live: Huỳnh Thái Toàn\nMở app: https://app.test/ca-cua-toi");
  });

  test("đổi người giữa ca: vai có đoạn thì chỉ đoạn của mình; vai không có đoạn thì host_id làm cả ca", () => {
    const s = row("s", { host_id: "an", host_name: "Quốc An", co_host_id: "toan" });
    const segs: FeedSegmentRow[] = [
      { session_id: "s", talent_id: "toan", role: "co_host", from_min: 0, to_min: 90 },
      { session_id: "s", talent_id: KHANH, role: "co_host", from_min: 90, to_min: 180 }
    ];
    expect(F.personWindows(s, segs, KHANH)).toEqual([{ role: "co_host", from: 90, to: 180 }]);
    expect(F.personWindows(s, segs, "an")).toEqual([{ role: "host", from: 0, to: 180 }]);
    expect(F.personWindows(s, segs, "toan")).toEqual([{ role: "co_host", from: 0, to: 90 }]);
    const [e] = F.feedEvents([s], segs, KHANH, "u");
    expect(new Date(e.start).toISOString()).toBe("2026-10-16T05:30:00.000Z");
    expect(e.summary).toBe("Franklin Shopee · Trợ live");
    expect(e.description).toContain("Bạn đứng 12:30–14:00 của ca 11:00–14:00");
  });

  test("RFC 5545: CRLF, escape dấu phẩy/chấm phẩy/xuống dòng, nhắc trước 60 phút, gấp dòng >75 byte không cắt giữa chữ có dấu", () => {
    const ics = F.buildIcs("Lịch live · Khanh", [{ uid: "u1@liveops", start: Date.UTC(2026, 9, 16, 4), end: Date.UTC(2026, 9, 16, 7), summary: "A, B; C", location: "", description: "x\ny" }], Date.UTC(2026, 9, 16, 1));
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261016T040000Z\r\n");
    expect(ics).toContain("SUMMARY:A\\, B\\; C\r\n");
    expect(ics).toContain("DESCRIPTION:x\\ny\r\n");
    expect(ics).toContain("TRIGGER:-PT60M");
    expect(ics).not.toContain("LOCATION:");
    const long = F.foldLine(`DESCRIPTION:${"Trợ live: Huỳnh Thái Toàn · ".repeat(6)}`);
    const enc = new TextEncoder();
    const parts = long.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(enc.encode(p).length).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(`DESCRIPTION:${"Trợ live: Huỳnh Thái Toàn · ".repeat(6)}`);
  });

  test("mã link đủ dài và an toàn trong URL", () => {
    const t = F.newFeedToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(F.newFeedToken()).not.toBe(t);
  });
});
