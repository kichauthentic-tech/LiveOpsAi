// PostgREST chặn cứng 1.000 dòng mỗi request và KHÔNG báo lỗi khi cắt — nó trả 1.000 dòng đầu rồi
// im lặng. Đo 2026-10-01 trên DB thật: `brand_dataraw_rows` 5.333 dòng, 4/24 đợt nhập đã vượt trần
// (1.181 · 1.176 · 1.164 · 1.080) nên màn Dữ Liệu Gốc ĐANG hiện thiếu dòng. `brand_month_plan_slots`
// là bảng tới lượt tiếp theo (75 dòng/tháng ⇒ khoảng một năm nữa).
//
// Luật từ 2026-10-01: đọc CẢ BẢNG ở một bảng lớn dần theo ca/tháng/dòng dữ liệu thì phải cuộn trang
// qua `fetchAllPages`. Bảng bị chặn có chủ ý (nhật ký) thì phải khai `.limit(` rõ ràng.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PAGE_SIZE, fetchAllPages } from "../src/lib/db/fetchAllPages";

const DB = join(__dirname, "..", "src/lib/db");

/** Thân hàm `name` trong file, từ chữ ký tới dấu `}` ở cột 0. */
function bodyOf(file: string, name: string): string {
  const src = readFileSync(join(DB, file), "utf8");
  const i = src.indexOf(`function ${name}(`);
  expect(i, `không tìm thấy hàm ${name} trong ${file}`).toBeGreaterThan(-1);
  const end = src.indexOf("\n}", i);
  return src.slice(i, end);
}

describe("fetchAllPages", () => {
  test("cuộn tới khi gặp trang ngắn rồi dừng", async () => {
    const calls: [number, number][] = [];
    const total = PAGE_SIZE * 2 + 7;
    const rows = await fetchAllPages<number>((from, to) => {
      calls.push([from, to]);
      return Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, k) => from + k), error: null });
    });
    expect(rows.length).toBe(total);
    expect(rows[0]).toBe(0);
    expect(rows[total - 1]).toBe(total - 1);
    expect(calls).toEqual([
      [0, PAGE_SIZE - 1],
      [PAGE_SIZE, PAGE_SIZE * 2 - 1],
      [PAGE_SIZE * 2, PAGE_SIZE * 3 - 1]
    ]);
  });

  test("trang đầy ĐÚNG bằng tổng số dòng vẫn phải hỏi thêm một trang", async () => {
    // Cái bẫy kinh điển: dừng ngay khi trang đầy thì mất toàn bộ dòng từ 1.001 trở đi.
    let n = 0;
    const rows = await fetchAllPages<number>((from) => {
      n++;
      return Promise.resolve({ data: from === 0 ? Array.from({ length: PAGE_SIZE }, (_, k) => k) : [], error: null });
    });
    expect(rows.length).toBe(PAGE_SIZE);
    expect(n, "phải hỏi trang thứ hai để biết đã hết").toBe(2);
  });

  test("bảng rỗng: một lượt gọi, mảng rỗng", async () => {
    let n = 0;
    const rows = await fetchAllPages<number>(() => { n++; return Promise.resolve({ data: [], error: null }); });
    expect(rows).toEqual([]);
    expect(n).toBe(1);
  });

  test("lỗi ở giữa chừng phải ném ra, không trả về dữ liệu nửa vời", async () => {
    const boom = { message: "mạng hỏng" };
    await expect(
      fetchAllPages<number>((from) =>
        Promise.resolve(from === 0 ? { data: Array.from({ length: PAGE_SIZE }, (_, k) => k), error: null } : { data: null, error: boom })
      )
    ).rejects.toBe(boom);
  });

  test("data null coi như trang rỗng, không nổ", async () => {
    await expect(fetchAllPages<number>(() => Promise.resolve({ data: null, error: null }))).resolves.toEqual([]);
  });
});

test("đọc cả bảng ở bảng lớn dần phải cuộn trang", () => {
  const paged: [string, string][] = [
    ["shiftSlots.ts", "fetchShiftSlots"],
    ["shiftRegistrations.ts", "fetchShiftRegistrations"],
    ["finance.ts", "fetchSessionFinances"],
    ["monthPlans.ts", "fetchLockedPlanTargets"],
    ["talentRateHistory.ts", "fetchTalentRateHistory"],
    ["brandPlatformRateHistory.ts", "fetchBrandPlatformRateHistory"],
    ["monthlyReports.ts", "fetchAllMonthlyReports"],
    ["brandDataRaw.ts", "fetchDataRawRows"]
  ];
  for (const [file, fn] of paged) {
    const body = bodyOf(file, fn);
    expect(body, `${fn} phải đi qua fetchAllPages`).toContain("fetchAllPages");
    expect(body, `${fn} phải truyền .range(from, to) vào trang`).toContain(".range(from, to)");
    // Thiếu thứ tự xác định thì Postgres được phép trả cùng một dòng ở hai trang và bỏ sót dòng khác.
    expect(body, `${fn} phải .order(...) ổn định trước khi cuộn trang`).toContain(".order(");
  }
});

test("hàm tự cuộn trang sẵn có của Sổ Ca không bị gỡ mất", () => {
  const body = bodyOf("sessions.ts", "fetchAllSessionRows");
  expect(body).toContain(".range(from, from + PAGE - 1)");
  expect(body, "phải dừng theo trang ngắn, không dừng theo một con số đoán").toContain("rows.length < PAGE");
});

test("nhật ký chặn có chủ ý bằng .limit() và nói rõ trên màn", () => {
  const body = bodyOf("auditLogs.ts", "fetchAuditLogs");
  expect(body).toContain(".limit(AUDIT_LOG_LIMIT)");
  const ui = readFileSync(join(__dirname, "..", "src/components/UserRoleSettings.tsx"), "utf8");
  expect(ui, "chạm trần thì nhãn tab phải nói là chỉ hiện N gần nhất").toContain("AUDIT_LOG_LIMIT} gần nhất");
});

test("chuông: không poll khi tab đang ẩn, và quay lại thì nạp ngay", () => {
  const src = readFileSync(join(__dirname, "..", "src/hooks/useNotifications.tsx"), "utf8");
  const effect = src.slice(src.indexOf("const timer = window.setInterval"), src.indexOf("}, [enabled, reload]);"));
  expect(effect, "nhịp poll phải bỏ qua khi tab ẩn").toContain('document.visibilityState === "hidden"');
  expect(effect, "phải nghe visibilitychange — đổi tab trong cùng cửa sổ không phát focus").toContain('document.addEventListener("visibilitychange"');
  expect(effect, "phải chặn nạp trùng khi visibilitychange dội liên tục").toContain("Date.now() - last < POLL_MS");
  expect(src, "listener phải được gỡ khi unmount").toContain('document.removeEventListener("visibilitychange"');
});
