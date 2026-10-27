import { describe, expect, test } from "vitest";
import { checkReconGroups } from "../src/lib/reconciliation/groupCheck";
import type { ReconciliationRow, ReconShare } from "../src/lib/db/liveReconciliation";
import type { LiveSession } from "../src/types";

let n = 0;
const sess = (id: string, start: string, end: string, over: Partial<LiveSession> = {}) =>
  ({ id, date: "2026-10-07", startTime: start, endTime: end, status: "Completed", platform: "TikTok", ...over }) as LiveSession;
const row = (start: string, end: string, gmv: number, ids: string[], over: Partial<ReconciliationRow> = {}): ReconciliationRow => ({
  id: `r${++n}`, roomId: `room${n}`, startedAt: `2026-10-07T${start}:00+07:00`, endedAt: `2026-10-07T${end}:00+07:00`,
  gmv, orders: 0, views: 0, durationMinutes: 0, bucket: "agency", matchedSessionIds: ids, excluded: false, ...over
});
const share = (r: ReconciliationRow, sid: string, gmv: number, method: ReconShare["method"] = "snapshot", current = gmv): ReconShare =>
  ({ rowId: r.id, sessionId: sid, method, gmv, orders: 0, currentGmv: current, currentSource: "tiktok_reconciled" });
const map = (...l: ReconShare[]) => { const m = new Map<string, ReconShare[]>(); for (const s of l) m.set(s.rowId, [...(m.get(s.rowId) ?? []), s]); return m; };

describe("kiểm tra đối soát theo nhóm liên thông", () => {
  test("phiên 1 ca khớp file ⇒ nhóm chuẩn, không lỗi", () => {
    const s = sess("a", "10:00", "12:00"), r = row("10:00", "12:00", 5_000_000, ["a"]);
    const c = checkReconGroups({ rows: [r], shares: map(share(r, "a", 5_000_000, "whole")), sessions: [s] });
    expect(c.counts).toEqual({ chuan: 1, uocTinh: 0, canCheck: 0 });
  });

  test("ca nối: tổng 2 ca bằng phiên ⇒ ổn; có ô chia theo giờ ⇒ ước tính", () => {
    const a = sess("a", "10:00", "12:00"), b = sess("b", "12:00", "14:00"), r = row("10:00", "14:00", 6_000_000, ["a", "b"]);
    const c = checkReconGroups({ rows: [r], shares: map(share(r, "a", 3_000_000, "time"), share(r, "b", 3_000_000, "time")), sessions: [a, b] });
    expect(c.counts).toEqual({ chuan: 0, uocTinh: 1, canCheck: 0 });
  });

  test("tổng các ca lệch file ⇒ cần check", () => {
    const a = sess("a", "10:00", "12:00"), b = sess("b", "12:00", "14:00"), r = row("10:00", "14:00", 6_000_000, ["a", "b"]);
    const c = checkReconGroups({ rows: [r], shares: map(share(r, "a", 3_000_000), share(r, "b", 2_000_000)), sessions: [a, b] });
    expect(c.issues.map((i) => i.kind)).toEqual(["sum_mismatch"]);
    expect(c.counts.canCheck).toBe(1);
  });

  test("restart: 2 phiên trong 1 ca gom cùng nhóm, tổng khớp ⇒ chuẩn", () => {
    const a = sess("a", "10:00", "14:00"), r1 = row("10:00", "11:50", 1_000_000, ["a"]), r2 = row("12:00", "14:00", 2_000_000, ["a"]);
    const c = checkReconGroups({ rows: [r1, r2], shares: map(share(r1, "a", 1_000_000, "whole"), share(r2, "a", 2_000_000, "whole")), sessions: [a] });
    expect(c.groups).toHaveLength(1);
    expect(c.counts.chuan).toBe(1);
  });

  test("phiên chạy ngoài khung ca > 15 phút và hai ca nối cách nhau ⇒ báo", () => {
    const a = sess("a", "10:00", "11:00"), b = sess("b", "12:00", "13:00"), r = row("09:30", "13:00", 4_000_000, ["a", "b"]);
    const c = checkReconGroups({ rows: [r], shares: map(share(r, "a", 2_000_000), share(r, "b", 2_000_000)), sessions: [a, b] });
    expect(c.issues.map((i) => i.kind).sort()).toEqual(["gap", "outside_shift"]);
  });

  test("ca đã diễn ra trong kỳ file mà không phiên nào khớp ⇒ no_room; ca sau giờ tạo lô thì bỏ qua", () => {
    const a = sess("a", "10:00", "12:00"), x = sess("x", "15:00", "17:00"), later = sess("l", "21:00", "23:00");
    const r = row("10:00", "12:00", 1_000_000, ["a"]);
    const c = checkReconGroups({
      rows: [r], shares: map(share(r, "a", 1_000_000, "whole")), sessions: [a, x, later],
      periodStart: "2026-10-01", periodEnd: "2026-10-07", batchCreatedAt: "2026-10-07T18:00:00+07:00"
    });
    expect(c.orphanIssues.map((i) => i.sessionId)).toEqual(["x"]);
  });

  test("lô đã áp dụng, số trên ca lệch >1% so với bản chia đúng ⇒ chip_stale", () => {
    const a = sess("a", "10:00", "12:00", { reconciledAt: "2026-10-08T01:00:00Z" }), r = row("10:00", "12:00", 5_000_000, ["a"]);
    const c = checkReconGroups({ rows: [r], shares: map(share(r, "a", 5_000_000, "whole", 4_000_000)), sessions: [a], appliedAt: "2026-10-08T01:00:30Z" });
    expect(c.issues.map((i) => i.kind)).toEqual(["chip_stale"]);
  });

  test("dòng bị bỏ chọn không vào nhóm; DB chưa có bản chia ⇒ bỏ phép kiểm tổng", () => {
    const a = sess("a", "10:00", "12:00"), r = row("10:00", "12:00", 5_000_000, ["a"]), off = row("10:00", "12:00", 9, ["a"], { excluded: true });
    const c = checkReconGroups({ rows: [r, off], shares: null, sessions: [a] });
    expect(c.groups).toHaveLength(1);
    expect(c.counts.canCheck).toBe(0);
  });
});
