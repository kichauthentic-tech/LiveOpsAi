// Danh sách ca theo phạm vi talent (egress 22/11): mọi ca từ hôm nay − 7 ngày + mọi ca của mình; làm mới theo phần đổi
// không dựa vào số dòng cả bảng (dấu 0214) mà đếm số ca trong cửa sổ.
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { sessions: Row[]; reports: Row[]; segments: Row[]; checkpoints: Row[] } = { sessions: [], reports: [], segments: [], checkpoints: [] };
const log: string[] = [];
const TABLES: Record<string, () => Row[]> = {
  live_sessions_secure: () => db.sessions,
  live_session_reports: () => db.reports,
  session_staff_segments: () => db.segments,
  session_segment_checkpoints: () => db.checkpoints
};
const maxOf = (rows: Row[]) => rows.reduce((m, r) => ((r.updated_at as string) > m ? (r.updated_at as string) : m), "");
const stamp = () =>
  [`${db.sessions.length}@${maxOf(db.sessions)}`, `${db.reports.length}@${maxOf(db.reports)}`, JSON.stringify(db.segments), JSON.stringify(db.checkpoints), "", "0"].join("|");

// Bộ lọc tối thiểu của PostgREST mà sessions.ts dùng: gte/lt/gt/in/or(col.eq|gte.val,…), head count.
type Pred = (r: Row) => boolean;
const orPred = (expr: string): Pred => {
  const parts = expr.split(",").map((p) => {
    const [col, op, ...v] = p.split(".");
    const val = v.join(".");
    return (r: Row) => (op === "eq" ? r[col] === val : op === "gte" ? String(r[col]) >= val : false);
  });
  return (r) => parts.some((f) => f(r));
};
vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: stamp(), error: null }),
    from: (table: string) => {
      const preds: Pred[] = [];
      let head = false;
      let range: [number, number] | null = null;
      let delta = false;
      const run = () => {
        let rows = TABLES[table]().filter((r) => preds.every((p) => p(r)));
        if (head) {
          log.push(`${table}:count`);
          return { data: null, count: rows.length, error: null };
        }
        if (range) rows = rows.slice(range[0], range[1] + 1);
        if (!range || range[0] === 0) log.push(`${table}:${delta ? "delta" : "load"}`);
        return { data: rows, error: null };
      };
      const q = {
        select: (_c?: string, o?: { head?: boolean }) => ((head = !!o?.head), q),
        order: () => q,
        gte: (c: string, v: string) => (preds.push((r) => String(r[c]) >= v), q),
        lt: (c: string, v: string) => (preds.push((r) => String(r[c]) < v), q),
        gt: (c: string, v: string) => ((delta = true), preds.push((r) => String(r[c]) > v), q),
        in: (c: string, vs: string[]) => (preds.push((r) => vs.includes(r[c] as string)), q),
        or: (e: string) => (preds.push(orPred(e)), q),
        limit: () => q,
        range: (a: number, b: number) => ((range = [a, b]), q),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
      };
      return q;
    }
  }
}));

const S = await import("../src/lib/db/sessions");

const ME = "me";
const FROM = "2026-11-15";
const T = (min: number) => new Date(Date.UTC(2026, 10, 22, 8, min)).toISOString();
const ses = (id: string, date: string, extra: Row = {}): Row => ({
  id, date, start_time: "09:00", end_time: "12:00", status: "Scheduled", updated_at: T(0), actual_gmv: 0, host_id: "x", co_host_id: null, ...extra
});
const ids = (list: { id: string }[]) => list.map((s) => s.id).sort();
const loads = () => log.filter((l) => l === "live_sessions_secure:load").length;

beforeEach(() => {
  S.__resetSessionStore();
  log.length = 0;
  db.sessions = [
    ses("recent-other", "2026-11-20"),
    ses("future-other", "2026-12-02"),
    ses("old-other", "2026-10-01"),
    ses("old-mine-host", "2026-09-10", { host_id: ME }),
    ses("old-mine-co", "2026-10-05", { co_host_id: ME }),
    ses("old-mine-seg", "2026-10-07")
  ];
  db.segments = [{ session_id: "old-mine-seg", talent_id: ME, talent_name: "Tôi", role: "host", from_min: 0, to_min: 60 }];
  db.reports = [
    { session_id: "recent-other", updated_at: T(0), restart_count: 0 },
    { session_id: "old-other", updated_at: T(0), restart_count: 0 },
    { session_id: "old-mine-host", updated_at: T(0), restart_count: 1 }
  ];
  db.checkpoints = [];
  S.setSessionScope({ talentId: ME, from: FROM });
});

describe("tải theo phạm vi talent", () => {
  test("cửa sổ + ca cũ của mình (host, trợ, đoạn giờ); bỏ ca cũ của người khác", async () => {
    const list = await S.loadSessionsFull();
    expect(ids(list)).toEqual(["future-other", "old-mine-co", "old-mine-host", "old-mine-seg", "recent-other"]);
  });

  test("report chỉ của ca đã nạp", async () => {
    const list = await S.loadSessionsFull();
    expect(list.filter((s) => s.report).map((s) => s.id).sort()).toEqual(["old-mine-host", "recent-other"]);
  });

  test("tài khoản talent chưa gắn hồ sơ: chỉ cửa sổ", async () => {
    S.setSessionScope({ talentId: "", from: FROM });
    expect(ids(await S.loadSessionsFull())).toEqual(["future-other", "recent-other"]);
  });

  test("mốc cửa sổ = hôm nay − 7 ngày", () => {
    expect(S.talentSessionWindowStart("2026-11-22")).toBe("2026-11-15");
    expect(S.talentSessionWindowStart("2026-03-03")).toBe("2026-02-24");
  });
});

describe("làm mới theo phần đổi trong phạm vi", () => {
  test("dấu không đổi ⇒ null, không tải gì", async () => {
    await S.loadSessionsFull();
    log.length = 0;
    expect(await S.refreshSessions()).toBeNull();
    expect(loads()).toBe(0);
  });

  test("ca người khác trong cửa sổ đổi ⇒ chỉ tải phần đổi, không tải trọn", async () => {
    await S.loadSessionsFull();
    db.sessions[0] = ses("recent-other", "2026-11-20", { updated_at: T(30), actual_gmv: 900 });
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBe(0);
    expect(list.find((s) => s.id === "recent-other")!.actualGmv).toBe(900);
    expect(ids(list)).toHaveLength(5);
  });

  test("ca mới trong cửa sổ ⇒ thêm vào, số ca cửa sổ khớp, không tải trọn", async () => {
    await S.loadSessionsFull();
    db.sessions.push(ses("new-other", "2026-11-25", { updated_at: T(30) }));
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBe(0);
    expect(ids(list)).toContain("new-other");
  });

  test("ca trong cửa sổ bị xoá ⇒ đếm lệch ⇒ tải trọn theo phạm vi", async () => {
    await S.loadSessionsFull();
    db.sessions = db.sessions.filter((s) => s.id !== "future-other");
    db.sessions[0] = { ...db.sessions[0], updated_at: T(30) }; // có ca khác đổi để dấu đổi
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBeGreaterThan(0);
    expect(ids(list)).not.toContain("future-other");
  });

  test("ca người khác dời ra ngoài cửa sổ ⇒ bỏ khỏi danh sách", async () => {
    await S.loadSessionsFull();
    db.sessions[0] = ses("recent-other", "2026-11-01", { updated_at: T(30) });
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(ids(list)).not.toContain("recent-other");
  });

  test("ca cũ của mình đổi ⇒ cập nhật", async () => {
    await S.loadSessionsFull();
    const i = db.sessions.findIndex((s) => s.id === "old-mine-host");
    db.sessions[i] = ses("old-mine-host", "2026-09-10", { host_id: ME, updated_at: T(30), actual_gmv: 77 });
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBe(0);
    expect(list.find((s) => s.id === "old-mine-host")!.actualGmv).toBe(77);
  });

  test("ca cũ của người khác dời VÀO cửa sổ ⇒ có cả report cũ của nó", async () => {
    await S.loadSessionsFull();
    const i = db.sessions.findIndex((s) => s.id === "old-other");
    db.sessions[i] = ses("old-other", "2026-11-21", { updated_at: T(30) });
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBe(0);
    expect(list.find((s) => s.id === "old-other")?.report).toBeDefined();
  });

  test("report của ca ngoài phạm vi đổi ⇒ không lọt vào danh sách", async () => {
    await S.loadSessionsFull();
    db.reports[1] = { ...db.reports[1], updated_at: T(40), restart_count: 3 };
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(list.find((s) => s.id === "old-other")).toBeUndefined();
  });

  test("đổi phạm vi (người khác đăng nhập / sang role đủ) ⇒ tải trọn lại", async () => {
    await S.loadSessionsFull();
    S.setSessionScope(null);
    log.length = 0;
    const list = (await S.refreshSessions())!;
    expect(loads()).toBeGreaterThan(0);
    expect(ids(list)).toHaveLength(6);
  });
});
