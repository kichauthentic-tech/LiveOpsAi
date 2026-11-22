import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { deltaSince, maxStamp, mergeDelta, type DeltaStore } from "../src/lib/db/deltaTable";

// shiftRegistrations.ts import supabaseClient (ném lỗi khi CI không có .env) — chỉ cần hàm thuần nên mock client.
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
const { registrationWindowStart } = await import("../src/lib/db/shiftRegistrations");

// Nạp lại shift_slots / session_availability theo phần đã đổi (egress 22/11).
type Row = { id: string; v: string };
type Stamped = Row & { at: string };
const strip = ({ at: _a, ...r }: Stamped): Row => r;
const store = (rows: Row[], mark: string | null): DeltaStore<Row> => ({ byId: new Map(rows.map((r) => [r.id, r])), mark });

describe("mergeDelta", () => {
  test("dòng sửa + dòng mới gộp vào kho, mốc tiến tới dấu lớn nhất", () => {
    const base = store([{ id: "a", v: "1" }, { id: "b", v: "1" }], "2026-11-20T10:00:00+00:00");
    const next = mergeDelta(base, [{ id: "b", v: "2", at: "2026-11-21T09:00:00+00:00" }, { id: "c", v: "1", at: "2026-11-21T08:00:00+00:00" }], 3, (r) => r.at, strip);
    expect(next).not.toBeNull();
    expect([...next!.byId.values()]).toEqual([{ id: "a", v: "1" }, { id: "b", v: "2" }, { id: "c", v: "1" }]);
    expect(next!.mark).toBe("2026-11-21T09:00:00+00:00");
    // Kho cũ không bị sửa tại chỗ (lượt nạp lỗi giữa chừng không làm hỏng kho đang dùng).
    expect(base.byId.get("b")).toEqual({ id: "b", v: "1" });
  });

  test("có dòng bị xoá ⇒ số dòng lệch server ⇒ null (nơi gọi tải trọn)", () => {
    const base = store([{ id: "a", v: "1" }, { id: "b", v: "1" }], "2026-11-20T10:00:00+00:00");
    expect(mergeDelta(base, [], 1, (r: Stamped) => r.at, strip)).toBeNull();
  });

  test("xoá một + thêm một cùng lúc vẫn bắt được (kho còn dòng đã xoá)", () => {
    const base = store([{ id: "a", v: "1" }, { id: "b", v: "1" }], "2026-11-20T10:00:00+00:00");
    expect(mergeDelta(base, [{ id: "c", v: "1", at: "2026-11-21T08:00:00+00:00" }], 2, (r) => r.at, strip)).toBeNull();
  });

  test("không đếm được (count null) ⇒ null", () => {
    expect(mergeDelta(store([], null), [], null, (r: Stamped) => r.at, strip)).toBeNull();
  });

  test("không gì đổi ⇒ giữ nguyên kho và mốc", () => {
    const base = store([{ id: "a", v: "1" }], "2026-11-20T10:00:00+00:00");
    const next = mergeDelta(base, [], 1, (r: Stamped) => r.at, strip);
    expect(next!.mark).toBe(base.mark);
    expect([...next!.byId.values()]).toEqual([{ id: "a", v: "1" }]);
  });

  test("dòng lặp lại trong biên 2 phút (đã có trong kho) không làm lệch số dòng", () => {
    const base = store([{ id: "a", v: "1" }], "2026-11-20T10:00:00+00:00");
    const next = mergeDelta(base, [{ id: "a", v: "1", at: "2026-11-20T10:00:00+00:00" }], 1, (r) => r.at, strip);
    expect(next).not.toBeNull();
  });
});

describe("deltaSince / maxStamp", () => {
  test("mốc lùi 2 phút; không có mốc ⇒ đầu kỷ nguyên", () => {
    expect(deltaSince("2026-11-20T10:00:00.123456+00:00")).toBe("2026-11-20T09:58:00.123Z");
    expect(deltaSince(null)).toBe("1970-01-01T00:00:00Z");
    expect(deltaSince("không phải ngày")).toBe("1970-01-01T00:00:00Z");
  });

  test("maxStamp so theo thời điểm, không theo chuỗi", () => {
    expect(maxStamp([{ at: "2026-11-20T10:00:00+07:00" }, { at: "2026-11-20T05:00:00+00:00" }], (r) => r.at)).toBe("2026-11-20T05:00:00+00:00");
    expect(maxStamp([], (r: { at: string }) => r.at)).toBeNull();
  });
});

test("Điều Phối / chốt kế hoạch nạp lại slot + đăng ký theo phần đổi, không tải trọn", () => {
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  expect(app, "App chỉ được nạp lại qua refreshShiftSlots — nạp trọn chỉ ở đợt mở app (useWorkspaceData)").not.toMatch(/fetchShiftSlots\(/);
  expect(app).not.toMatch(/fetchShiftRegistrations\(/);
  expect(app).toMatch(/refreshShiftSlots\(\), refreshShiftRegistrations\(\)/);
});

test("talent chỉ tải đăng ký ca của chính mình, chờ hồ sơ rồi mới tải (egress 22/11)", () => {
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  const hook = readFileSync(join(__dirname, "..", "src", "hooks", "useWorkspaceData.ts"), "utf8");
  // Phạm vi: chưa có hồ sơ ⇒ null (chờ — currentRole mặc định "talent" trước khi hồ sơ về, tải theo nó là tải sai phạm vi).
  expect(app).toMatch(/const registrationScope: string \| null = !profile \? null : profile\.role === "talent" \? \(profile\.assigned_talent_id \?\? ""\) : "all";/);
  expect(app).toMatch(/useWorkspaceData\(\{[^}]*registrationScope[^}]*\}\)/);
  expect(hook).toMatch(/if \(!authUserId \|\| registrationScope === null\) return;/);
  // Không còn tải đủ đăng ký trong đợt nạp chung lúc mở app.
  expect(hook).not.toMatch(/Promise\.all\(\[[^\]]*fetchShiftRegistrations\(\)/);
});

test("cửa sổ đăng ký ca = đầu tháng trước, kể cả qua năm", () => {
  expect(registrationWindowStart("2026-11-22")).toBe("2026-10-01");
  expect(registrationWindowStart("2026-12-01")).toBe("2026-11-01");
  expect(registrationWindowStart("2027-01-15")).toBe("2026-12-01");
  expect(registrationWindowStart("2027-03-31")).toBe("2027-02-01");
});

test("talent chỉ tải ca mở từ hôm nay + cặp slot → ca; target gắn qua cặp đó (egress 22/11)", () => {
  const hook = readFileSync(join(__dirname, "..", "src", "hooks", "useWorkspaceData.ts"), "utf8");
  const db = readFileSync(join(__dirname, "..", "src", "lib", "db", "shiftSlots.ts"), "utf8");
  expect(hook).toMatch(/const slotMode = registrationScope === null \? null : registrationScope === "all" \? "all" : "talent";/);
  expect(hook).toMatch(/: fetchTalentShiftSlots\(getTodayDate\(\)\)/);
  // Target kế hoạch / tăng cường gắn qua sessionBySlot (talent không có slot đã chốt trong shiftSlots).
  expect(hook).toMatch(/for \(const \[slotId, sessionId\] of sessionBySlot\)/);
  expect(hook).not.toMatch(/for \(const sl of shiftSlots\) \{\s*if \(sl\.sessionId && (plan|boost)TargetsBySlotId/);
  const fn = db.slice(db.indexOf("export async function fetchTalentShiftSlots("), db.indexOf("export async function refreshShiftSlots("));
  expect(fn).toContain('.eq("status", "open")');
  expect(fn).toContain('.gte("date", today)');
  expect(fn).toContain('.not("session_id", "is", null)');
});
