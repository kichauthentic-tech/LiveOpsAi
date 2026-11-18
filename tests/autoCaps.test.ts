// Trần giờ tự suy từ giờ thật các tháng đã qua. Chạy: npx vitest run tests/autoCaps.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const A = await import("../src/lib/roster/autoCaps");
import type { LiveSession, Talent } from "../src/types";

const tal = (id: string, role: Talent["role"] = "Host"): Talent => ({ id, name: id, role }) as Talent;
const ses = (id: string, date: string, host: string, o: Partial<LiveSession> = {}): LiveSession =>
  ({ id, brandId: "b", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: host, ...o }) as LiveSession;
const bounds = { host: { min: 24, max: 80 }, co_host: { min: 30, max: 110 } };
/** n ca 3h trong tháng m. */
const many = (host: string, m: string, n: number, o: Partial<LiveSession> = {}) => Array.from({ length: n }, (_, i) => ses(`${host}${m}${i}`, `${m}-${String(1 + i).padStart(2, "0")}`, host, o));

describe("completedMonths", () => {
  test("chỉ tháng đã hết, mới nhất trước", () => {
    expect(A.completedMonths("2026-11-18")).toEqual(["2026-10", "2026-09", "2026-08"]);
    expect(A.completedMonths("2026-01-05", 2)).toEqual(["2025-12", "2025-11"]);
  });
});

describe("inferAutoCaps", () => {
  test("trần = giờ trung bình × (1 + dư), làm tròn; tháng đang chạy không tính", () => {
    const sessions = [...many("a", "2026-10", 10), ...many("a", "2026-09", 14), ...many("a", "2026-11", 30)]; // 30h, 42h → TB 36h; T11 bị bỏ
    const r = A.inferAutoCaps(sessions, [tal("a")], "2026-11-18", bounds, 0.15);
    expect(r.a.avg).toBe(36);
    expect(r.a.monthMax).toBe(41); // 36 × 1,15 = 41,4
    expect(r.a.months).toBe(2);
  });

  test("kẹp trong [giờ tối thiểu, giờ tối đa] của vai", () => {
    const sessions = [...many("low", "2026-10", 2), ...many("low", "2026-09", 2), ...many("high", "2026-10", 30), ...many("high", "2026-09", 30)];
    const r = A.inferAutoCaps(sessions, [tal("low"), tal("high")], "2026-11-18", bounds, 0.15);
    expect(r.low.monthMax).toBe(24); // TB 6h → nâng lên tối thiểu
    expect(r.high.monthMax).toBe(80); // TB 90h → hạ về tối đa
  });

  test("dưới 2 tháng làm thì không suy; dư ≤ 0 là tắt; ca huỷ và ca chia đoạn không tính; trợ tính cả giờ co-host", () => {
    const one = A.inferAutoCaps(many("a", "2026-10", 10), [tal("a")], "2026-11-18", bounds, 0.15);
    expect(one.a).toBeUndefined();
    expect(A.inferAutoCaps([...many("a", "2026-10", 10), ...many("a", "2026-09", 10)], [tal("a")], "2026-11-18", bounds, 0)).toEqual({});
    const noisy = [...many("a", "2026-10", 5, { status: "Cancelled" }), ...many("a", "2026-09", 5, { staffSegments: [{ role: "host" }] as never })];
    expect(A.inferAutoCaps(noisy, [tal("a")], "2026-11-18", bounds, 0.15).a).toBeUndefined();
    const co = [...many("h", "2026-10", 12, { coHostId: "c" }), ...many("h", "2026-09", 12, { coHostId: "c" })];
    expect(A.inferAutoCaps(co, [tal("c", "Assistant")], "2026-11-18", bounds, 0.15).c.monthMax).toBe(41); // 36h → 41, trong [30, 110]
  });
});
