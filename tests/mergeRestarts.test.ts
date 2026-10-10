import { describe, expect, test } from "vitest";
import { suggestMergeGroups } from "../src/lib/reconciliation/mergeRestarts";
import type { ReconciliationRow } from "../src/lib/db/liveReconciliation";

let n = 0;
const row = (start: string, end: string, over: Partial<ReconciliationRow> = {}): ReconciliationRow => ({
  id: `r${++n}`, roomId: `room${n}`, startedAt: `2026-10-07T${start}:00+07:00`, endedAt: `2026-10-07T${end}:00+07:00`,
  gmv: 0, orders: 0, views: 0, durationMinutes: 0, bucket: "agency", matchedSessionIds: ["s1"], excluded: false, ...over
});

describe("gợi ý gộp ca restart / ngắt giữa chừng", () => {
  test("mảnh 2 phút dính vào room liền sau (khoảng nghỉ 1 phút)", () => {
    const a = row("10:59", "11:01"), b = row("11:02", "13:02", { gmv: 2_871_000 });
    const g = suggestMergeGroups([b, a]);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ ids: [a.id, b.id], gmv: 2_871_000, blips: 1 });
  });

  test("mảnh nằm giữa hai room dài dính vào room GẦN hơn, không nối hai room dài với nhau", () => {
    const a = row("08:00", "11:38", { gmv: 5_786_000 }), blip = row("11:44", "11:45"), b = row("11:47", "14:05", { gmv: 2_316_000 });
    const g = suggestMergeGroups([a, blip, b]);
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual([blip.id, b.id]);
  });

  test("mảnh cách xa > 10 phút thì để yên", () => {
    expect(suggestMergeGroups([row("10:00", "10:02"), row("11:00", "13:00")])).toEqual([]);
  });

  test("hai room dài ngắt 3 phút và cùng một ca thì gộp; khác ca hoặc nghỉ > 5 phút thì không", () => {
    const a = row("10:00", "11:30", { gmv: 1 }), b = row("11:33", "13:00", { gmv: 2 });
    expect(suggestMergeGroups([a, b])[0].ids).toEqual([a.id, b.id]);
    expect(suggestMergeGroups([row("10:00", "11:30"), row("11:33", "13:00", { matchedSessionIds: ["s2"] })])).toEqual([]);
    expect(suggestMergeGroups([row("10:00", "11:30"), row("11:40", "13:00")])).toEqual([]);
  });

  test("chuỗi nhiều mảnh restart cùng một ca gộp thành một nhóm; rổ inhouse/unassigned bị bỏ qua", () => {
    const a = row("20:00", "20:02"), b = row("20:04", "20:05"), c = row("20:06", "23:00", { gmv: 9 });
    const x = row("20:03", "20:04", { bucket: "inhouse" });
    const g = suggestMergeGroups([a, b, c, x]);
    expect(g).toHaveLength(1);
    expect(g[0].ids).toEqual([a.id, b.id, c.id]);
    expect(g[0].blips).toBe(2);
  });
});
