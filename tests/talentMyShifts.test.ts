// App talent T1 (11/10): logic thuần của tab Hôm nay / Đăng ký / Tôi. Tình huống lấy từ lịch thật 05–18/10:
// Nguyễn Trà Giang (trợ, 4 ca/ngày, trùng 15/10 Franklin Shopee 19:30–21:30 với VERA 21:00–00:00), Huỳnh Thái Toàn
// (vừa host vừa trợ), ca nối 12:00–15:00 → 15:00–18:00.
// Chạy: npx vitest run tests/talentMyShifts.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const M = await import("../src/lib/talent/myShifts");
const { myChannelStanding } = await import("../src/lib/talent/standing");
import type { LiveSession, ShiftSlot } from "../src/types";

const GIANG = "giang";
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "franklin",
    brandName: "Franklin",
    platform: "TikTok",
    date: "2026-10-11",
    startTime: "11:00",
    endTime: "14:00",
    status: "Upcoming",
    hostId: "thy",
    hostName: "Trần Ngọc Bảo Thy",
    coHostId: GIANG,
    coHostName: "Nguyễn Trà Giang",
    isBackfill: false,
    ...over
  }) as LiveSession;
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).getTime();

describe("isMine / myRole", () => {
  test("host, trợ, và người chỉ đứng một đoạn khi đổi người giữa ca", () => {
    expect(M.isMine(ca("a"), GIANG)).toBe(true);
    expect(M.myRole(ca("a"), GIANG)).toBe("co_host");
    expect(M.myRole(ca("a"), "thy")).toBe("host");
    const seg = ca("b", { coHostId: "duy", staffSegments: [{ talentId: GIANG, talentName: "G", role: "co_host", fromMin: 0, toMin: 60 }, { talentId: "duy", talentName: "D", role: "co_host", fromMin: 60, toMin: 180 }] } as Partial<LiveSession>);
    expect(M.isMine(seg, GIANG)).toBe(true);
    expect(M.myRole(seg, GIANG)).toBe("co_host");
    expect(M.isMine(ca("c"), "ai-khac")).toBe(false);
    expect(M.isMine(ca("c"), undefined)).toBe(false);
  });

  test("mySessions bỏ ca nạp bù và ca của người khác, xếp theo giờ", () => {
    const xs = M.mySessions([ca("b", { startTime: "19:00", endTime: "22:00" }), ca("a"), ca("bf", { isBackfill: true }), ca("x", { coHostId: "duy" })], GIANG);
    expect(xs.map((s) => s.id)).toEqual(["a", "b"]);
  });
});

describe("dayTimeline", () => {
  test("ca nối 12–15 → 15–18 nghỉ 0 phút; chồng giờ ra số âm; ca huỷ không tính", () => {
    const mine = [
      ca("a", { startTime: "12:00", endTime: "15:00" }),
      ca("b", { startTime: "15:00", endTime: "18:00" }),
      ca("x", { startTime: "16:00", endTime: "17:00", status: "Cancelled" }),
      ca("c", { startTime: "19:30", endTime: "21:30" }),
      ca("d", { startTime: "21:00", endTime: "00:00" })
    ];
    expect(M.dayTimeline(mine, "2026-10-11").map((t) => t.gapMin)).toEqual([null, 0, 90, -30]);
  });
});

describe("heroShift", () => {
  const mine = [ca("a"), ca("b", { startTime: "19:00", endTime: "22:00" })];
  test("đang trong giờ ca ⇒ ca đó, phút tới hết ca", () => {
    expect(M.heroShift(mine, at("2026-10-11", "13:05"))).toMatchObject({ live: true, minutesLeft: 55, session: { id: "a" } });
  });
  test("giữa hai ca ⇒ ca kế tiếp, phút tới giờ vào", () => {
    expect(M.heroShift(mine, at("2026-10-11", "14:05"))).toMatchObject({ live: false, minutesLeft: 295, session: { id: "b" } });
  });
  test("ca qua nửa đêm vẫn là đang live sau 0h", () => {
    expect(M.heroShift([ca("n", { startTime: "21:00", endTime: "00:30" })], at("2026-10-12", "00:10"))).toMatchObject({ live: true, minutesLeft: 20 });
  });
  test("không có ca trong 7 ngày ⇒ null", () => {
    expect(M.heroShift([ca("far", { date: "2026-10-30" })], at("2026-10-11", "09:00"))).toBeNull();
  });
});

describe("myClashes", () => {
  test("15/10 Franklin Shopee 19:30–21:30 trùng VERA 21:00–00:00 của chính mình", () => {
    const xs = [
      ca("f", { date: "2026-10-15", platform: "Shopee", startTime: "19:30", endTime: "21:30" }),
      ca("v", { date: "2026-10-15", brandId: "vera", brandName: "VERA", startTime: "21:00", endTime: "00:00", hostId: "tuong" }),
      ca("khac", { date: "2026-10-15", coHostId: "duy", hostId: "an", startTime: "20:00", endTime: "22:00" })
    ];
    const got = M.myClashes(xs, GIANG, "2026-10-11");
    expect(got).toHaveLength(1);
    expect([got[0].session.id, got[0].other?.id]).toEqual(["f", "v"]);
    expect(M.myClashes(xs, "an", "2026-10-11")).toHaveLength(0);
  });
});

describe("monthSummary / loadBetween", () => {
  test("tách ca host và ca trợ, giờ theo lịch; ca sắp tới đếm riêng; ca huỷ bỏ", () => {
    const xs = [
      ca("t1", { date: "2026-10-05", status: "Completed" }),
      ca("h1", { date: "2026-10-06", status: "Completed", hostId: GIANG, coHostId: "duy", startTime: "20:00", endTime: "22:00" }),
      ca("u1", { date: "2026-10-20" }),
      ca("x", { date: "2026-10-21", status: "Cancelled" }),
      ca("other", { date: "2026-11-01" })
    ];
    const m = M.monthSummary(xs, GIANG, "2026-10");
    expect(m.done).toEqual({ count: 2, hostCount: 1, coCount: 1, hostHours: 2, coHours: 3 });
    expect(m.upcoming).toEqual({ count: 1, hours: 3 });
    expect(M.loadBetween(xs, GIANG, "2026-10-12", "2026-10-31")).toEqual({ count: 1, hours: 3 });
  });

  test("đổi người giữa ca: chỉ tính giờ mình đứng", () => {
    const seg = ca("s", { date: "2026-10-05", status: "Completed", staffSegments: [{ talentId: GIANG, talentName: "G", role: "co_host", fromMin: 0, toMin: 60 }, { talentId: "duy", talentName: "D", role: "co_host", fromMin: 60, toMin: 180 }] } as Partial<LiveSession>);
    expect(M.monthSummary([seg], GIANG, "2026-10").done.coHours).toBe(1);
  });
});

describe("đăng ký ca", () => {
  const slot = (id: string, over: Partial<ShiftSlot> = {}): ShiftSlot =>
    ({ id, date: "2026-10-20", startTime: "19:00", endTime: "22:00", brandName: "VERA", platform: "TikTok", studioName: "VERA TTS", notes: "", status: "open", ...over }) as ShiftSlot;

  test("buổi theo giờ bắt đầu", () => {
    expect([M.dayPartOf("09:00"), M.dayPartOf("12:00"), M.dayPartOf("17:59"), M.dayPartOf("18:00")]).toEqual(["morning", "afternoon", "afternoon", "evening"]);
  });
  test("chỉ ca còn mở từ hôm nay, theo ngày rồi giờ", () => {
    const got = M.openSlotsFrom([slot("b", { startTime: "21:00" }), slot("a"), slot("qua", { date: "2026-10-01" }), slot("chot", { status: "finalized" })], "2026-10-11");
    expect(got.map((s) => s.id)).toEqual(["a", "b"]);
  });
  test("giờ của ca mở, kể cả ca qua nửa đêm", () => {
    expect(M.slotHours(slot("a", { startTime: "22:00", endTime: "00:30" }))).toBe(2.5);
  });
});

describe("myChannelStanding", () => {
  test("mỗi kênh brand × sàn một dòng, chỉ dòng của mình, không cộng hai sàn", () => {
    const mk = (id: string, host: string, gmv: number, platform: "TikTok" | "Shopee" = "TikTok") =>
      ca(id, { date: "2026-10-0" + ((Number(id.replace(/\D/g, "")) % 9) + 1), status: "Completed", hostId: host, hostName: host, coHostId: undefined, platform, actualGmv: gmv, dataSource: "tiktok_reconciled" } as Partial<LiveSession>);
    const xs = [mk("s1", "hung", 30e6), mk("s2", "hung", 30e6), mk("s3", "hung", 30e6), mk("s4", "an", 10e6), mk("s5", "an", 10e6), mk("s6", "hung", 5e6, "Shopee")];
    const got = myChannelStanding(xs, "hung", "2026-10-11");
    expect(got.map((r) => `${r.platform}:${r.role}`)).toEqual(["TikTok:host", "Shopee:host"]);
    expect(got[0].ratio).toBeGreaterThan(1);
    expect(got.every((r) => r.key === "hung")).toBe(true);
  });
});

// Lỗi user báo 09/11: trợ đứng 12:00–12:30 ở ca VERA 12:00–14:00 (rồi người khác vào), 13:00 trợ ca Fujiwa — app talent hiện
// cả hai "đang live" và ca VERA ghi tới 14:00 vì đọc cả room thay vì đoạn của riêng người đó.
describe("giờ của riêng tôi khi đổi người giữa ca", () => {
  const NGAN = "ngan";
  const vera = ca("vera", {
    brandName: "VERA",
    startTime: "12:00",
    endTime: "14:00",
    status: "Live Now",
    hostId: "h1",
    coHostId: "khac",
    staffSegments: [
      { talentId: NGAN, talentName: "Thanh Ngân", role: "co_host", fromMin: 0, toMin: 30 },
      { talentId: "khac", talentName: "Khác", role: "co_host", fromMin: 30, toMin: 120 }
    ]
  } as Partial<LiveSession>);
  const fuji = ca("fuji", { brandName: "Fujiwa", startTime: "13:00", endTime: "15:00", status: "Live Now", hostId: "h2", coHostId: NGAN });
  const mine = [vera, fuji];

  test("myWindow = đoạn của tôi; người đứng suốt ca = cả ca", () => {
    expect(M.myWindow(vera, NGAN)).toMatchObject({ startTime: "12:00", endTime: "12:30", partial: true });
    expect(M.myWindow(fuji, NGAN)).toMatchObject({ startTime: "13:00", endTime: "15:00", partial: false });
    expect(M.myWindow(vera, undefined)).toMatchObject({ startTime: "12:00", endTime: "14:00", partial: false });
  });

  test("13:10: chỉ ca Fujiwa đang live, ca VERA đã xong với tôi", () => {
    const now = at("2026-10-11", "13:10");
    expect(M.heroShift(mine, now, 7, NGAN)).toMatchObject({ live: true, session: { id: "fuji" }, minutesLeft: 110 });
    expect(M.myStatus(vera, NGAN, now)).toBe("Completed");
    expect(M.myStatus(fuji, NGAN, now)).toBe("Live Now");
  });

  test("12:10: ca VERA live, hero hiện giờ 12:00–12:30; 12:40 chuyển sang ca Fujiwa sắp tới", () => {
    expect(M.heroShift(mine, at("2026-10-11", "12:10"), 7, NGAN)).toMatchObject({ live: true, minutesLeft: 20, window: { endTime: "12:30" } });
    expect(M.heroShift(mine, at("2026-10-11", "12:40"), 7, NGAN)).toMatchObject({ live: false, session: { id: "fuji" }, minutesLeft: 20 });
  });

  test("khoảng nghỉ giữa hai ca tính từ 12:30, không phải 14:00", () => {
    expect(M.dayTimeline(mine, "2026-10-11", NGAN).map((t) => t.gapMin)).toEqual([null, 30]);
  });
});
