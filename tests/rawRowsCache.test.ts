// Cache dòng thô theo import_id (fetchRowsPaged) — chặn egress Supabase: cùng đợt nhập không đọc lại trong 10 phút.
import { beforeEach, describe, expect, test, vi } from "vitest";

const calls: string[][] = [];
let dbRows: Record<string, { import_id: string; raw: Record<string, unknown> }[]> = {};

let stamps: Record<string, { imported_at: string; row_count: number }> = {};
let stampCalls = 0;

vi.mock("../src/lib/supabaseClient", () => ({
  supabase: {
    from: (table: string) => {
      let ids: string[] = [];
      if (table === "brand_dataraw_imports") {
        const q = {
          select: () => q,
          in: (_c: string, v: string[]) => {
            stampCalls++;
            return Promise.resolve({ data: v.filter((id) => stamps[id]).map((id) => ({ id, ...stamps[id] })), error: null });
          }
        };
        return q;
      }
      const q = {
        select: () => q,
        in: (_c: string, v: string[]) => ((ids = v), q),
        order: () => q,
        range: (from: number, to: number) => {
          if (from === 0) calls.push([...ids]);
          const all = ids.flatMap((id) => dbRows[id] ?? []);
          return Promise.resolve({ data: all.slice(from, to + 1), error: null });
        }
      };
      return q;
    }
  }
}));

const { fetchRowsPaged, invalidateRawRowsCache } = await import("../src/lib/dataraw/fetchRowsPaged");

beforeEach(() => {
  calls.length = 0;
  stampCalls = 0;
  vi.useRealTimers();
  invalidateRawRowsCache();
  stamps = { a: { imported_at: "t1", row_count: 2 }, b: { imported_at: "t1", row_count: 1 } };
  dbRows = {
    a: [{ import_id: "a", raw: { n: 1 } }, { import_id: "a", raw: { n: 2 } }],
    b: [{ import_id: "b", raw: { n: 3 } }]
  };
});

describe("fetchRowsPaged cache", () => {
  test("lần hai cùng đợt không gọi DB", async () => {
    const r1 = await fetchRowsPaged(["a"]);
    const r2 = await fetchRowsPaged(["a"]);
    expect(calls.length).toBe(1);
    expect(r2.get("a")).toEqual(r1.get("a"));
  });

  test("chỉ đọc đợt còn thiếu", async () => {
    await fetchRowsPaged(["a"]);
    const r = await fetchRowsPaged(["a", "b"]);
    expect(calls).toEqual([["a"], ["b"]]);
    expect(r.get("b")?.length).toBe(1);
  });

  test("hai lời gọi chồng nhau dùng chung một request", async () => {
    const [x, y] = await Promise.all([fetchRowsPaged(["a"]), fetchRowsPaged(["a"])]);
    expect(calls.length).toBe(1);
    expect(x.get("a")?.length).toBe(2);
    expect(y.get("a")?.length).toBe(2);
  });

  test("invalidate → đọc lại dữ liệu mới", async () => {
    await fetchRowsPaged(["a"]);
    dbRows.a = [{ import_id: "a", raw: { n: 9 } }];
    invalidateRawRowsCache("a");
    const r = await fetchRowsPaged(["a"]);
    expect(calls.length).toBe(2);
    expect(r.get("a")).toEqual([{ n: 9 }]);
  });

  test("caller sửa mảng trả về không làm hỏng cache", async () => {
    const r1 = await fetchRowsPaged(["a"]);
    r1.get("a")!.length = 0;
    const r2 = await fetchRowsPaged(["a"]);
    expect(r2.get("a")?.length).toBe(2);
  });

  test("đợt rỗng không có khoá trong kết quả, và cũng được cache", async () => {
    const r = await fetchRowsPaged(["zzz"]);
    expect(r.has("zzz")).toBe(false);
    await fetchRowsPaged(["zzz"]);
    expect(calls.length).toBe(1);
  });

  test("hết hạn mà đợt chưa đổi ⇒ chỉ hỏi dấu, không tải lại dòng", async () => {
    vi.useFakeTimers();
    await fetchRowsPaged(["a"]);
    vi.advanceTimersByTime(11 * 60_000);
    const r = await fetchRowsPaged(["a"]);
    expect(calls.length).toBe(1);
    expect(stampCalls).toBe(2);
    expect(r.get("a")?.length).toBe(2);
  });

  test("hết hạn và máy khác đã ghi đè (imported_at đổi) ⇒ tải lại", async () => {
    vi.useFakeTimers();
    await fetchRowsPaged(["a"]);
    dbRows.a = [{ import_id: "a", raw: { n: 7 } }];
    stamps.a = { imported_at: "t2", row_count: 1 };
    vi.advanceTimersByTime(11 * 60_000);
    const r = await fetchRowsPaged(["a"]);
    expect(calls.length).toBe(2);
    expect(r.get("a")).toEqual([{ n: 7 }]);
  });

  test("số dòng lệch row_count (đọc trúng lúc ghi đè dở) ⇒ hết hạn là tải lại", async () => {
    vi.useFakeTimers();
    stamps.a = { imported_at: "t1", row_count: 5 };
    await fetchRowsPaged(["a"]);
    vi.advanceTimersByTime(11 * 60_000);
    await fetchRowsPaged(["a"]);
    expect(calls.length).toBe(2);
  });
});
