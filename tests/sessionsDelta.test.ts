// Làm mới danh sách ca theo phần đã đổi (0214): dấu giống ⇒ không tải; khác ⇒ chỉ tải dòng updated_at mới hơn; lệch số dòng ⇒ tải trọn.
import { beforeEach, describe, expect, test, vi } from "vitest";

type Row = Record<string, unknown>;
const db: { sessions: Row[]; reports: Row[]; segments: Row[]; checkpoints: Row[]; pub: string; snap: number; rpcMissing: boolean } = {
  sessions: [], reports: [], segments: [], checkpoints: [], pub: "", snap: 0, rpcMissing: false
};
const log: string[] = [];
const TABLES: Record<string, () => Row[]> = {
  live_sessions_secure: () => db.sessions,
  live_session_reports: () => db.reports,
  session_staff_segments: () => db.segments,
  session_segment_checkpoints: () => db.checkpoints
};
const maxOf = (rows: Row[]) => rows.reduce((m, r) => ((r.updated_at as string) > m ? (r.updated_at as string) : m), "");
const stamp = () =>
  [`${db.sessions.length}@${maxOf(db.sessions)}`, `${db.reports.length}@${maxOf(db.reports)}`, JSON.stringify(db.segments), JSON.stringify(db.checkpoints), db.pub, String(db.snap)].join("|");

vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    rpc: (name: string) => {
      log.push(`rpc:${name}`);
      if (db.rpcMissing) return Promise.resolve({ data: null, error: { code: "PGRST202" } });
      return Promise.resolve({ data: stamp(), error: null });
    },
    from: (table: string) => {
      let gt: string | null = null;
      let range: [number, number] | null = null;
      const run = () => {
        let rows = TABLES[table]();
        if (gt !== null) rows = rows.filter((r) => (r.updated_at as string) > gt!);
        if (range) rows = rows.slice(range[0], range[1] + 1);
        if (!range || range[0] === 0) log.push(`${table}:${gt !== null ? "delta" : "full"}:${rows.length}`);
        return { data: rows, error: null };
      };
      const q = {
        select: () => q,
        order: () => q,
        gt: (_c: string, v: string) => ((gt = v), q),
        limit: () => q,
        range: (a: number, b: number) => ((range = [a, b]), q),
        then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad)
      };
      return q;
    }
  }
}));

const { loadSessionsFull, refreshSessions, fetchSessions, markSessionsUnapplied, parseStamp, __resetSessionStore } = await import("../src/lib/db/sessions");

const ses = (id: string, at: string, extra: Row = {}): Row => ({ id, date: "2026-11-10", start_time: "09:00", end_time: "12:00", status: "Scheduled", updated_at: at, actual_gmv: 0, ...extra });
const T = (min: number) => new Date(Date.UTC(2026, 10, 11, 8, min)).toISOString();
const fullLoads = () => log.filter((l) => l.startsWith("live_sessions_secure:full")).length;

beforeEach(() => {
  __resetSessionStore();
  log.length = 0;
  Object.assign(db, { sessions: [ses("a", T(0)), ses("b", T(1))], reports: [], segments: [], checkpoints: [], pub: "", snap: 0, rpcMissing: false });
});

describe("parseStamp", () => {
  test("đủ 6 phần mới nhận", () => {
    expect(parseStamp("2@x|0@|m|n|p|3")?.sCount).toBe(2);
    expect(parseStamp("2@x|0@|m")).toBeNull();
    expect(parseStamp(null)).toBeNull();
  });
});

describe("refreshSessions", () => {
  test("dấu không đổi ⇒ null, không tải bảng nào", async () => {
    await loadSessionsFull();
    log.length = 0;
    expect(await refreshSessions()).toBeNull();
    expect(log).toEqual(["rpc:sessions_change_stamp"]);
  });

  test("một ca đổi ⇒ chỉ tải ca đó và ghép vào danh sách", async () => {
    await loadSessionsFull();
    db.sessions[1] = ses("b", T(30), { actual_gmv: 500 });
    log.length = 0;
    const out = await refreshSessions();
    expect(fullLoads()).toBe(0);
    expect(log.some((l) => l.startsWith("live_sessions_secure:delta"))).toBe(true);
    expect(out?.length).toBe(2);
    expect(out?.find((s) => s.id === "b")?.actualGmv).toBe(500);
  });

  test("ca mới thêm ⇒ delta, số dòng khớp", async () => {
    await loadSessionsFull();
    db.sessions.push(ses("c", T(40)));
    const out = await refreshSessions();
    expect(fullLoads()).toBe(1); // chỉ lượt nạp đầu
    expect(out?.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  test("ca bị xoá ⇒ tải lại cả bảng", async () => {
    await loadSessionsFull();
    db.sessions = [db.sessions[0]];
    const out = await refreshSessions();
    expect(fullLoads()).toBe(2);
    expect(out?.length).toBe(1);
  });

  test("xoá một + thêm một (số dòng lệch sau khi ghép) ⇒ tải lại cả bảng", async () => {
    await loadSessionsFull();
    db.sessions = [db.sessions[0], ses("c", T(40))];
    const out = await refreshSessions();
    expect(fullLoads()).toBe(2);
    expect(out?.map((s) => s.id).sort()).toEqual(["a", "c"]);
  });

  test("role không thấy hết dòng (số dòng nạp ≠ số trong dấu) ⇒ luôn tải trọn khi có đổi", async () => {
    await loadSessionsFull(`3@${T(1)}|0@|[]|[]||0`); // dấu nói 3 ca, view chỉ trả 2
    db.sessions[1] = ses("b", T(30));
    await refreshSessions();
    expect(fullLoads()).toBe(2);
  });

  test("report mới ⇒ chỉ tải report đổi", async () => {
    await loadSessionsFull();
    db.reports.push({ session_id: "a", updated_at: T(20), status_note: "ok" });
    log.length = 0;
    const out = await refreshSessions();
    expect(fullLoads()).toBe(0);
    expect(out?.find((s) => s.id === "a")?.report).toBeTruthy();
  });

  test("phát hành report tháng đổi (pub) ⇒ tải trọn", async () => {
    await loadSessionsFull();
    db.pub = "x";
    await refreshSessions();
    expect(fullLoads()).toBe(2);
  });

  test("DB chưa có hàm (0214 chưa chạy) ⇒ luôn tải trọn, chỉ hỏi dấu một lần", async () => {
    db.rpcMissing = true;
    await loadSessionsFull();
    await refreshSessions();
    await refreshSessions();
    expect(fullLoads()).toBe(3);
    expect(log.filter((l) => l.startsWith("rpc:")).length).toBe(1);
  });

  test("hook bỏ kết quả (markSessionsUnapplied) ⇒ lượt sau trả danh sách dù dấu không đổi", async () => {
    await loadSessionsFull();
    markSessionsUnapplied();
    const out = await refreshSessions();
    expect(out?.length).toBe(2);
    expect(await refreshSessions()).toBeNull();
  });

  test("fetchSessions luôn trả danh sách, không tải lại khi không đổi", async () => {
    await loadSessionsFull();
    const out = await fetchSessions();
    expect(out.length).toBe(2);
    expect(fullLoads()).toBe(1);
  });

  test("giữ thứ tự ngày giảm dần sau khi ghép", async () => {
    await loadSessionsFull();
    db.sessions.push(ses("n", T(50), { date: "2026-11-12" }));
    const out = await refreshSessions();
    expect(out?.[0].id).toBe("n");
  });
});
