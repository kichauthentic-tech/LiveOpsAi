// Điều Phối: mở lại ca đã huỷ + xếp người theo đoạn (0233, user 25/11).
// Chạy: npx vitest run tests/rosterReopenCancelled.test.ts
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const { checkPlacement } = await import("../src/lib/roster/candidates");
import type { LiveSession, ShiftSlot } from "../src/types";

const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "vera",
    brandName: "VERA",
    platform: "TikTok",
    studioId: "r-vera",
    date: "2026-11-27",
    startTime: "15:00",
    endTime: "18:00",
    status: "Upcoming",
    hostId: "tuyen",
    hostName: "Tuyến",
    coHostId: "ngan",
    coHostName: "Ngân",
    isBackfill: false,
    ...over
  }) as LiveSession;
const slot = (id: string, over: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id, brandId: "vera", brandName: "VERA", platform: "TikTok", date: "2026-11-27", startTime: "15:00", endTime: "18:00", studioId: "r-vera", studioName: "A", status: "open", ...over }) as ShiftSlot;

describe("buildCancelledShifts", () => {
  test("ca huỷ mang theo host/trợ lúc huỷ để ngăn mở lại kiểm người cũ", () => {
    const [x] = R.buildCancelledShifts([ca("c", { status: "Cancelled", cancelReason: "14/11: CANCLE" })], "2026-11-23", "2026-11-29");
    expect(x.key).toBe("x:c");
    expect(x.hostId).toBe("tuyen");
    expect(x.coHostId).toBe("ngan");
    expect(x.cancelReason).toBe("14/11: CANCLE");
  });

  test("đã mở lại thành ca mở cùng khung ⇒ không vẽ gạch ngang nữa", () => {
    const sessions = [ca("c", { status: "Cancelled" })];
    expect(R.buildCancelledShifts(sessions, "2026-11-23", "2026-11-29", [slot("o1")])).toHaveLength(0);
    // không truyền slots: hành vi cũ (luôn vẽ)
    expect(R.buildCancelledShifts(sessions, "2026-11-23", "2026-11-29")).toHaveLength(1);
  });

  test("có ca sống cùng khung (OP tạo lại) ⇒ ẩn; khác sàn / khác giờ ⇒ vẫn gạch", () => {
    const cancelled = ca("c", { status: "Cancelled" });
    expect(R.buildCancelledShifts([cancelled, ca("s2")], "2026-11-23", "2026-11-29", [])).toHaveLength(0);
    expect(R.buildCancelledShifts([cancelled, ca("s2", { platform: "Shopee" })], "2026-11-23", "2026-11-29", [])).toHaveLength(1);
    expect(R.buildCancelledShifts([cancelled], "2026-11-23", "2026-11-29", [slot("o1", { startTime: "18:00", endTime: "20:00" })])).toHaveLength(1);
    // slot đã chốt (không phải ca mở) không tính là ca sống — ca sống đã có ở sessions
    expect(R.buildCancelledShifts([cancelled], "2026-11-23", "2026-11-29", [slot("o1", { status: "finalized", sessionId: "zz" })])).toHaveLength(1);
  });

  test("ca huỷ không bao giờ vào bộ xếp / kiểm lịch", () => {
    expect(R.buildRosterShifts([ca("c", { status: "Cancelled" })], [], [], [], "2026-11-23", "2026-11-29")).toHaveLength(0);
  });
});

describe("kiểm người cũ khi mở lại", () => {
  const ctx = (shifts: ReturnType<typeof R.buildRosterShifts>) =>
    ({ talents: [], fam: new Map(), history: [], rules: R.DEFAULT_ROSTER_RULES, weekStart: "2026-11-23", mode: "balance", shifts }) as unknown as Parameters<typeof checkPlacement>[3];

  test("host cũ đã có ca trùng giờ ⇒ chặn; trợ cũ rảnh ⇒ không chặn", () => {
    const live = R.buildRosterShifts([ca("other", { brandId: "crocs", brandName: "CROCS", startTime: "16:00", endTime: "19:00", coHostId: "loan" })], [], [], [], "2026-11-23", "2026-11-29");
    const an = R.analyzeRoster(live, R.DEFAULT_ROSTER_RULES, "2026-11-23", (id) => id);
    const [x] = R.buildCancelledShifts([ca("c", { status: "Cancelled" })], "2026-11-23", "2026-11-29");
    expect(checkPlacement(x, "tuyen", "host", ctx(live), an.entries).blocked).toMatch(/CROCS 16:00–19:00/);
    expect(checkPlacement(x, "ngan", "co_host", ctx(live), an.entries).blocked).toBeUndefined();
  });
});

describe("migration 0233", () => {
  const sql = readFileSync(new URL("../supabase/migrations/0233_roster_reopen_and_segments.sql", import.meta.url), "utf8");
  test("guard người xếp lịch + lý do bắt buộc ở cả hai RPC", () => {
    expect(sql.match(/perform private\.roster_staff_guard\(\);/g)).toHaveLength(2);
    expect(sql).toContain("Ghi lý do mở lại ca.");
    expect(sql).toContain("Ghi lý do xếp người theo đoạn.");
  });
  test("chỉ ca từ hôm nay; nhật ký nhận restore + segments", () => {
    expect(sql.match(/v_s\.date < \(now\(\) at time zone 'Asia\/Ho_Chi_Minh'\)::date/g)).toHaveLength(2);
    expect(sql).toContain("check (kind in ('reassign', 'move', 'restore', 'segments'))");
  });
});
