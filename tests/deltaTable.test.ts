import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { deltaSince, maxStamp, mergeDelta, type DeltaStore } from "../src/lib/db/deltaTable";

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
