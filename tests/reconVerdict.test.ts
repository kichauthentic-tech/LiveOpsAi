// Kết luận + việc cần quyết của màn đối soát (bố cục bản 2, 15/11) và phép chia rổ "ngoài lịch" thành 3 nhóm.
import { describe, expect, test } from "vitest";
import { buildVerdict } from "../src/lib/reconciliation/verdict";
import { classifyOutsideRow, groupOutsideRows } from "../src/lib/reconciliation/outsideRows";
import type { ReconCheck } from "../src/lib/reconciliation/groupCheck";
import type { ReconciliationRow } from "../src/lib/db/liveReconciliation";
import type { LiveSession } from "../src/types";

let n = 0;
const sess = (id: string, date: string, start: string, end: string, over: Partial<LiveSession> = {}) =>
  ({ id, date, startTime: start, endTime: end, status: "Completed", platform: "TikTok", ...over }) as LiveSession;
const row = (date: string, start: string, end: string, over: Partial<ReconciliationRow> = {}): ReconciliationRow => ({
  id: `r${++n}`, roomId: `room${n}`, startedAt: `${date}T${start}:00+07:00`, endedAt: `${date}T${end}:00+07:00`,
  gmv: 1_000_000, orders: 0, views: 0, durationMinutes: 0, bucket: "unassigned", matchedSessionIds: [], excluded: false, ...over
});
const emptyCheck = (): ReconCheck => ({
  groups: [], orphanIssues: [], issues: [],
  counts: { chuan: 0, uocTinh: 0, canCheck: 0 }, gmv: { chuan: 0, uocTinh: 0, canCheck: 0 }
});
const base = {
  rowCount: 10, sessionCount: 8, check: emptyCheck(), mergeGroups: [], outsideGroups: [],
  missingHandover: 0, isOldBatch: false, applied: false
};

describe("phiên ngoài lịch chia 3 nhóm", () => {
  test("ngày brand không có ca nào ⇒ nhóm 'ngày không có ca'", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00")];
    expect(classifyOutsideRow(row("2026-10-09", "20:00", "21:00"), s)).toBe("no_shift_day");
  });

  test("cách ca gần nhất dưới 30 phút ⇒ nhóm 'sát ca', phải xem tay", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00")];
    expect(classifyOutsideRow(row("2026-10-07", "12:10", "13:00"), s)).toBe("near_shift");
    expect(classifyOutsideRow(row("2026-10-07", "09:40", "09:55"), s)).toBe("near_shift");
  });

  test("ngày có ca nhưng cách xa ⇒ nhóm 'ngoài giờ làm'", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00")];
    expect(classifyOutsideRow(row("2026-10-07", "20:00", "22:00"), s)).toBe("off_hours");
  });

  test("ca đã huỷ không tính là có ca hôm đó", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00", { status: "Cancelled" })];
    expect(classifyOutsideRow(row("2026-10-07", "10:30", "11:00"), s)).toBe("no_shift_day");
  });

  test("gom nhóm: nhóm phải xem tay xếp cuối, cộng đúng tiền", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00")];
    const far = row("2026-10-07", "20:00", "22:00", { gmv: 3_000_000 });
    const near = row("2026-10-07", "12:05", "12:30", { gmv: 2_000_000 });
    const none = row("2026-10-08", "10:00", "11:00", { gmv: 5_000_000 });
    const g = groupOutsideRows([near, far, none], s);
    expect(g.map((x) => x.kind)).toEqual(["no_shift_day", "off_hours", "near_shift"]);
    expect(g.map((x) => x.gmv)).toEqual([5_000_000, 3_000_000, 2_000_000]);
  });
});

describe("kết luận của lô đối soát", () => {
  test("không việc gì ⇒ xanh, không thẻ việc nào", () => {
    const v = buildVerdict(base);
    expect(v.tone).toBe("ok");
    expect(v.tasks).toHaveLength(0);
    expect(v.line).toContain("Ghi vào ca được");
  });

  test("lô không khớp ca nào ⇒ đỏ, chỉ còn một việc là xử lý lô", () => {
    const v = buildVerdict({ ...base, deadReason: "Kỳ file không có ca TikTok nào." });
    expect(v.tone).toBe("bad");
    expect(v.tasks.map((t) => t.kind)).toEqual(["dead"]);
  });

  test("tổng lệch file ⇒ đỏ và có việc chặn", () => {
    const check = emptyCheck();
    check.issues = [{ kind: "sum_mismatch", text: "lệch" }];
    const v = buildVerdict({ ...base, check });
    expect(v.tone).toBe("bad");
    expect(v.tasks[0].kind).toBe("block");
  });

  test("nhóm ngoài lịch gán-một-nút vẫn là một việc; câu kết luận đếm đúng số thẻ", () => {
    const s = [sess("a", "2026-10-07", "10:00", "12:00")];
    const outside = groupOutsideRows([row("2026-10-09", "20:00", "21:00")], s);
    const v = buildVerdict({ ...base, outsideGroups: outside });
    expect(v.tasks).toHaveLength(1);
    expect(v.tasks[0].tone).toBe("ok");
    expect(v.line).toContain("1 việc");
    expect(v.tone).toBe("warn");
  });

  test("ca thiếu file giao ca thành một việc riêng", () => {
    const v = buildVerdict({ ...base, missingHandover: 8 });
    expect(v.tasks.map((t) => t.kind)).toEqual(["handover"]);
    expect(v.tasks[0].title).toContain("8 ca");
    expect(v.tone).toBe("warn");
  });
});
