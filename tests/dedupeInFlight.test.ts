// Gộp request ĐỌC đang cùng bay (2026-10-01). Chạy: npx vitest run tests/dedupeInFlight.test.ts
//
// Lỗi được vá: màn Brand Dashboard, trên BẢN BUILD PRODUCTION (không phải StrictMode ở dev), 5/5 lượt
// tải đều bắn 3 cặp request trùng nhau từng ký tự — vì `BrandDashboard` và `<OpsSupport>` lồng trong
// nó cùng gọi `fetchMonthPlan(brandId, month)` (từ 2026-10-03 OpsSupport nhận plan qua prop), và `fetchShopDaysMonthSlice` được gọi 2 lần (tháng
// này + tháng trước) cho một truy vấn danh sách batch không có bộ lọc kỳ.
import { beforeEach, expect, test, vi } from "vitest";
import { DataRawColumn } from "../src/types";

// ---- Supabase giả: ghi lại CHỮ KÝ của từng truy vấn thật sự được gửi ------------------------------
const sent: string[] = [];
let planRow: Record<string, unknown> | null = null;
let slotRows: Record<string, unknown>[] = [];
let imports: Record<string, unknown>[] = [];
// Mọi truy vấn giả đều mất 5ms — đủ dài để hai lời gọi "song song" thật sự chồng nhau về thời gian,
// chứ không phải chồng nhau nhờ may mắn về thứ tự microtask.
const LATENCY_MS = 5;

function chain(table: string) {
  let sel = "";
  const filters: string[] = [];
  const settle = async () => {
    sent.push(`${table}|${sel}|${filters.join(",")}`);
    await new Promise((r) => setTimeout(r, LATENCY_MS));
    if (table === "brand_month_plans") {
      // Từ 2026-10-03 fetchMonthPlan nhúng slots vào cùng request (`brand_month_plan_slots(*)`).
      const embed = sel.includes("brand_month_plan_slots(");
      return { data: planRow && embed ? { ...planRow, brand_month_plan_slots: slotRows } : planRow, error: null };
    }
    if (table === "brand_month_plan_slots") return { data: slotRows, error: null };
    if (table === "brand_dataraw_imports") {
      return { data: sel.startsWith("columns") ? { columns: [] as DataRawColumn[] } : imports, error: null };
    }
    return { data: null, error: null };
  };
  const api: Record<string, unknown> = {
    select: (s: string) => ((sel = s), api),
    eq: (k: string, v: unknown) => (filters.push(`${k}=${String(v)}`), api),
    order: () => api,
    maybeSingle: () => settle(),
    single: () => settle(),
    // Thenable: `await supabase.from(...).select(...).eq(...)` (không .single()) cũng chạy được.
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej)
  };
  return api;
}

vi.mock("../src/lib/supabaseClient", () => ({ supabase: { from: (t: string) => chain(t) } }));
vi.mock("../src/lib/dataraw/fetchRowsPaged", () => ({ fetchRowsPaged: async () => new Map<string, Record<string, unknown>[]>() }));

const { dedupeInFlight, __resetInFlight } = await import("../src/lib/db/dedupeInFlight");
const { fetchMonthPlan } = await import("../src/lib/db/monthPlans");
const { fetchShopDaysMonthSlice } = await import("../src/lib/dataraw/monthlyProductSlice");

const B = "brand-crocs";
const PLAN_ID = "plan-1";

beforeEach(() => {
  __resetInFlight();
  sent.length = 0;
  planRow = {
    id: PLAN_ID, brand_id: B, month: "2026-10-01", status: "locked", default_slot_hours: 3,
    live_window_start: "09:00:00", live_window_end: "23:00:00", max_slots_per_day: 3, notes: "",
    blackout_dates: null, target_gmv: 100, camp_ranges: null, shop_target_gmv: 0,
    locked_at: null, brand_confirmed_at: null
  };
  slotRows = [{ id: "s1", plan_id: PLAN_ID, date: "2026-10-01", start_time: "09:00:00", end_time: "12:00:00", target_gmv: 10, expected_gmv: null, slot_id: null, note: "" }];
  imports = [{ id: "imp-1", report_type: "shop_analytics", period_start: "2026-09-01", period_end: "2026-10-31" }];
});

// ---- Bản thân helper ------------------------------------------------------------------------------

test("hai lời gọi chồng nhau cùng key chỉ chạy run() MỘT lần, cả hai nhận cùng kết quả", async () => {
  let runs = 0;
  const run = async () => (runs++, await new Promise((r) => setTimeout(r, 5)), { v: runs });
  const [a, b] = await Promise.all([dedupeInFlight("k", run), dedupeInFlight("k", run)]);
  expect(runs).toBe(1);
  expect(a).toBe(b); // cùng một đối tượng, không chỉ bằng nhau
});

test("KHÔNG cache: lời gọi sau khi request trước đã xong thì đi mạng lại", async () => {
  let runs = 0;
  const run = async () => (runs++, { v: runs });
  expect(await dedupeInFlight("k", run)).toEqual({ v: 1 });
  expect(await dedupeInFlight("k", run)).toEqual({ v: 2 });
  expect(runs).toBe(2);
});

test("key khác nhau không gộp vào nhau", async () => {
  let runs = 0;
  const run = async () => (runs++, await new Promise((r) => setTimeout(r, 5)), runs);
  await Promise.all([dedupeInFlight("a", run), dedupeInFlight("b", run)]);
  expect(runs).toBe(2);
});

test("lỗi được chia cho cả hai caller, rồi key được nhả ra để lần thử lại đi mạng thật", async () => {
  let runs = 0;
  const failing = async () => {
    runs++;
    await new Promise((r) => setTimeout(r, 5));
    throw new Error("boom");
  };
  const results = await Promise.allSettled([dedupeInFlight("k", failing), dedupeInFlight("k", failing)]);
  expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  expect(runs).toBe(1);
  // Nhả key: thử lại sau đó phải chạy thật, và được phép thành công.
  expect(await dedupeInFlight("k", async () => "ok")).toBe("ok");
  expect(runs).toBe(1);
});

// ---- Đúng ba cặp request đã đo được trên Brand Dashboard ------------------------------------------

test("fetchMonthPlan là MỘT request (slots nhúng), gọi 2 lần song song vẫn chỉ 1 request", async () => {
  const [a, b] = await Promise.all([fetchMonthPlan(B, "2026-10"), fetchMonthPlan(B, "2026-10")]);
  expect(sent.filter((s) => s.startsWith("brand_month_plans|"))).toHaveLength(1);
  expect(sent.filter((s) => s.startsWith("brand_month_plan_slots|"))).toHaveLength(0);
  // Mỗi caller vẫn tự dựng đối tượng riêng (gộp ở mức TRUY VẤN, không ở mức hàm).
  expect(a).not.toBe(b);
  expect(a!.plan.id).toBe(PLAN_ID);
  expect(a!.slots).toHaveLength(1);
  expect(b!.slots).toHaveLength(1);
  expect(a!.slots[0]).not.toBe(b!.slots[0]);
});

test("fetchMonthPlan gọi NỐI TIẾP vẫn đi mạng 2 lần — không được biến thành cache", async () => {
  await fetchMonthPlan(B, "2026-10");
  await fetchMonthPlan(B, "2026-10");
  expect(sent.filter((s) => s.startsWith("brand_month_plans|"))).toHaveLength(2);
});

test("fetchMonthPlan hai THÁNG khác nhau không gộp", async () => {
  await Promise.all([fetchMonthPlan(B, "2026-10"), fetchMonthPlan(B, "2026-11")]);
  expect(sent.filter((s) => s.startsWith("brand_month_plans|"))).toHaveLength(2);
});

test("fetchShopDaysMonthSlice 2 tháng khác nhau chỉ còn 1 truy vấn danh sách batch", async () => {
  // Truy vấn danh sách batch KHÔNG có bộ lọc kỳ, nên 2 tháng khác nhau vẫn là cùng một URL.
  await Promise.all([
    fetchShopDaysMonthSlice(B, "2026-10-01", "2026-10-31"),
    fetchShopDaysMonthSlice(B, "2026-09-01", "2026-09-30")
  ]);
  const lite = sent.filter((s) => s.startsWith("brand_dataraw_imports|id, report_type"));
  expect(lite).toHaveLength(1);
});

test("fetchShopDaysMonthSlice với brand khác nhau KHÔNG gộp", async () => {
  await Promise.all([
    fetchShopDaysMonthSlice(B, "2026-10-01", "2026-10-31"),
    fetchShopDaysMonthSlice("brand-jockey", "2026-10-01", "2026-10-31")
  ]);
  expect(sent.filter((s) => s.startsWith("brand_dataraw_imports|id, report_type"))).toHaveLength(2);
});

// ---- Chốt nguồn: đừng lặng lẽ bỏ lớp gộp khi refactor --------------------------------------------

test("hai đường đọc đã đo được là trùng vẫn phải đi qua dedupeInFlight", async () => {
  const fs = await import("node:fs");
  const mp = fs.readFileSync("src/lib/db/monthPlans.ts", "utf8");
  expect(mp).toMatch(/dedupeInFlight\(`brand_month_plans\+slots\|/);
  const ps = fs.readFileSync("src/lib/dataraw/monthlyProductSlice.ts", "utf8");
  expect(ps).toMatch(/dedupeInFlight\(`brand_dataraw_imports\.lite\|/);
  // Danh sách batch chỉ được đọc qua fetchImportsLite — thêm một truy vấn thô nữa là mở lại lỗ cũ.
  const rawImportsList = ps.match(/\.select\("id, report_type, period_start, period_end"\)/g) ?? [];
  expect(rawImportsList).toHaveLength(1);
});
