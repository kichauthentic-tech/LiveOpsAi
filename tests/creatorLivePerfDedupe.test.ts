import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

import { CreatorLivePerfRow, dedupeRoomsAcrossBatches } from "../src/lib/dataraw/creatorLivePerfSlice";

const row = (roomId: string | undefined, gmv: number, startTime = "2026-09-10T03:00:00.000Z"): CreatorLivePerfRow =>
  ({ roomId, gmv, startTime, hours: 1, sourceRow: {} }) as CreatorLivePerfRow;

describe("dedupeRoomsAcrossBatches — lô full + lô tháng chồng nhau (CROCS T9, 05/10)", () => {
  it("room có ở cả 2 lô chỉ đếm 1 lần, lấy dòng của lô up sau", () => {
    const oldFull = { importedAt: "2026-09-22T08:00:00Z", rows: [row("A", 100), row("B", 200)] };
    const newMonth = { importedAt: "2026-10-05T06:00:00Z", rows: [row("A", 110), row("B", 210), row("C", 50)] };
    const out = dedupeRoomsAcrossBatches([oldFull, newMonth]);
    expect(out.map((r) => r.roomId).sort()).toEqual(["A", "B", "C"]);
    expect(out.reduce((s, r) => s + r.gmv, 0)).toBe(110 + 210 + 50);
  });

  it("thứ tự truyền vào không đổi kết quả", () => {
    const a = { importedAt: "2026-09-22T08:00:00Z", rows: [row("A", 100)] };
    const b = { importedAt: "2026-10-05T06:00:00Z", rows: [row("A", 110)] };
    expect(dedupeRoomsAcrossBatches([b, a])[0].gmv).toBe(110);
    expect(dedupeRoomsAcrossBatches([a, b])[0].gmv).toBe(110);
  });

  it("một lô duy nhất: giữ nguyên mọi dòng; dòng thiếu Room ID không bị gộp", () => {
    const only = { importedAt: "2026-09-22T08:00:00Z", rows: [row("A", 1), row(undefined, 2), row(undefined, 3)] };
    expect(dedupeRoomsAcrossBatches([only])).toHaveLength(3);
  });
});
