// App talent T2 (11/10): "Đã nhận lịch" (0169) + "Chuẩn bị ca". Tình huống từ lịch thật: Trà Giang trợ Franklin 11–14,
// OP dời một ca VERA từ 10:00 sang 11:00; Thái Toàn đứng một đoạn khi đổi người giữa ca.
// Chạy: npx vitest run tests/talentAcks.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { ackState, indexAcks, myPendingAcks, unackedSoon } = await import("../src/lib/talent/acks");
const { shiftPrep } = await import("../src/lib/talent/prep");
const { buildTodos } = await import("../src/lib/todoList");
import type { ShiftAck } from "../src/lib/db/shiftAcks";
import type { LiveSession } from "../src/types";

const GIANG = "giang";
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "franklin",
    brandName: "Franklin",
    platform: "TikTok",
    studioId: "r1",
    studioName: "FRANKLIN",
    date: "2026-10-12",
    startTime: "11:00",
    endTime: "14:00",
    status: "Upcoming",
    hostId: "thy",
    hostName: "Bảo Thy",
    coHostId: GIANG,
    coHostName: "Trà Giang",
    isBackfill: false,
    actualGmv: 0,
    totalOrders: 0,
    targetGmv: 0,
    ...over
  }) as LiveSession;
const ack = (sessionId: string, talentId: string, date = "2026-10-12", startTime = "11:00", endTime = "14:00"): ShiftAck => ({
  sessionId,
  talentId,
  ackedAt: "2026-10-11T08:00:00Z",
  date,
  startTime,
  endTime
});
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+07:00`).getTime();
const NOW = at("2026-10-11", "20:00");

describe("ackState", () => {
  test("chưa có dòng = mới; đúng giờ = đã nhận; OP dời giờ = phải nhận lại, giữ giờ cũ", () => {
    const s = ca("a");
    expect(ackState(s, GIANG, indexAcks([])).kind).toBe("new");
    expect(ackState(s, GIANG, indexAcks([ack("a", GIANG)])).kind).toBe("acked");
    const moved = ackState(ca("a", { startTime: "12:00" }), GIANG, indexAcks([ack("a", GIANG)]));
    expect(moved.kind).toBe("changed");
    expect(moved.kind === "changed" && moved.before.startTime).toBe("11:00");
    // Dòng của người khác không tính cho mình.
    expect(ackState(s, GIANG, indexAcks([ack("a", "thy")])).kind).toBe("new");
  });
});

describe("myPendingAcks", () => {
  test("chỉ ca của mình, chưa bắt đầu, chưa huỷ, không nạp bù; theo giờ vào ca", () => {
    const sessions = [
      ca("late", { date: "2026-10-13" }),
      ca("soon"),
      ca("other", { coHostId: "duy", coHostName: "Duy" }),
      ca("cancel", { status: "Cancelled" }),
      ca("started", { date: "2026-10-11", startTime: "19:00", endTime: "22:00" }),
      ca("backfill", { isBackfill: true }),
      ca("acked", { date: "2026-10-14" })
    ];
    const out = myPendingAcks(sessions, GIANG, [ack("acked", GIANG, "2026-10-14")], NOW);
    expect(out.map((p) => p.session.id)).toEqual(["soon", "late"]);
    expect(myPendingAcks(sessions, undefined, [], NOW)).toEqual([]);
  });
});

describe("unackedSoon (cho OP)", () => {
  test("người đứng ca trong 48 giờ chưa nhận — gồm người chỉ có ở một đoạn; người sát giờ nhất trước, cùng giờ theo tên", () => {
    const seg = ca("seg", {
      startTime: "09:00",
      endTime: "12:00",
      hostId: "thy",
      coHostId: "toan",
      coHostName: "Thái Toàn",
      staffSegments: [
        { talentId: GIANG, talentName: "Trà Giang", role: "co_host", fromMin: 0, toMin: 60 },
        { talentId: "toan", talentName: "Thái Toàn", role: "co_host", fromMin: 60, toMin: 180 }
      ]
    } as Partial<LiveSession>);
    const far = ca("far", { date: "2026-10-14" }); // > 48 giờ
    const out = unackedSoon([ca("a"), seg, far], [ack("a", "thy")], NOW, 48);
    // Cả ba có ca "seg" 09:00 sớm nhất ⇒ cùng giờ thì theo tên.
    expect(out.map((p) => p.name)).toEqual(["Bảo Thy", "Thái Toàn", "Trà Giang"]);
    expect(out.find((p) => p.talentId === GIANG)!.sessions.map((s) => s.id)).toEqual(["seg", "a"]);
    expect(out.find((p) => p.talentId === "thy")!.sessions.map((s) => s.id)).toEqual(["seg"]);
  });

  test("việc cần làm của OP: chưa nhận lịch là việc mức thấp mở bộ lọc; vắng dữ liệu nhận (DB chưa chạy 0169) thì không có việc", () => {
    const base = {
      today: "2026-10-11",
      brands: [],
      channels: [],
      shiftSlots: [],
      plansThisMonth: new Map(),
      plansNextMonth: new Map(),
      commitments: [],
      rates: [],
      monthlyReports: new Map(),
      talents: [],
      canSeeMoney: false
    };
    const sessions = [ca("a", { startTime: "06:00", endTime: "09:00" })];
    const all = buildTodos({ ...base, sessions, acks: [], nowMs: NOW });
    const todo = all.find((t) => t.id === "unacked-shifts");
    // 25/10: mức thấp — chưa ai dùng app talent nên việc này gần như luôn có (audit 24/10: 27/27 người); bấm mở bộ lọc trên Bảng Vận Hành.
    expect(todo?.level).toBe("low");
    expect(todo?.view).toBe("unack");
    expect(todo?.title).toBe("2 người chưa nhận lịch 1 ca trong 48 giờ tới");
    expect(buildTodos({ ...base, sessions, nowMs: NOW }).some((t) => t.id === "unacked-shifts")).toBe(false);
    const later = [ca("b", { date: "2026-10-12", startTime: "20:00", endTime: "23:00" })];
    expect(buildTodos({ ...base, sessions: later, acks: [], nowMs: NOW }).find((t) => t.id === "unacked-shifts")?.level).toBe("low");
  });
});

describe("shiftPrep", () => {
  test("ca trước CÙNG brand × sàn có GMV (không lấy sàn khác), ca trước trong cùng phòng cùng ngày, ngày camp", () => {
    const s = ca("x", { date: "2026-10-13", startTime: "19:00", endTime: "22:00" });
    const sessions = [
      s,
      ca("tt-old", { date: "2026-10-09", actualGmv: 8_800_000, totalOrders: 30 }),
      ca("tt-new", { date: "2026-10-10", actualGmv: 16_800_000, totalOrders: 51 }),
      ca("shopee", { date: "2026-10-12", platform: "Shopee", actualGmv: 99_000_000 }),
      ca("tt-nogmv", { date: "2026-10-12" }),
      ca("room-a", { date: "2026-10-13", startTime: "13:00", endTime: "16:00", brandName: "VERA", brandId: "vera" }),
      ca("room-b", { date: "2026-10-13", startTime: "15:00", endTime: "18:00", brandName: "VERA", brandId: "vera" }),
      ca("room-cancel", { date: "2026-10-13", startTime: "16:00", endTime: "19:00", status: "Cancelled" }),
      ca("other-room", { date: "2026-10-13", startTime: "16:00", endTime: "19:00", studioId: "r2" })
    ];
    const p = shiftPrep(s, sessions);
    expect(p.prevSameChannel?.id).toBe("tt-new");
    expect(p.roomBefore?.id).toBe("room-b");
    expect(p.campDay).toBe("Mid-Month");
    expect(shiftPrep(ca("y", { date: "2026-10-20" }), []).campDay).toBeNull();
  });
});
