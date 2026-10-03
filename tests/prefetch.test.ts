// Kho nạp trước cho lượt đọc riêng của màn (2026-10-03). Chạy: npx vitest run tests/prefetch.test.ts
//
// Thứ phải canh: đây KHÔNG được thành cache. Đường đọc-sau-khi-ghi (lưu Kế Hoạch Tháng rồi đọc lại) mà
// nhận bản nạp trước là hiện lại dữ liệu CŨ. Nên: lấy một lần là hết, quá hạn là bỏ, đổi tab là xoá.
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dropPrefetched, prefetchable } from "../src/lib/db/prefetch";

let runs = 0;
const read = prefetchable("t", async (a: string, b: string) => `${a}/${b}#${++runs}`);

beforeEach(() => {
  runs = 0;
  dropPrefetched();
});
afterEach(() => vi.useRealTimers());

test("take lấy đúng bản đã nạp trước — không gọi lại", async () => {
  read.prefetch("x", "y");
  expect(await read.take("x", "y")).toBe("x/y#1");
  expect(runs).toBe(1);
});

test("chỉ giao MỘT lần: lần take thứ hai đi mạng thật", async () => {
  read.prefetch("x", "y");
  await read.take("x", "y");
  expect(await read.take("x", "y")).toBe("x/y#2");
  expect(runs).toBe(2);
});

test("tham số khác thì không lấy nhầm bản nạp trước", async () => {
  read.prefetch("x", "y");
  expect(await read.take("x", "z")).toBe("x/z#2");
});

test("nạp trước trùng key không bắn request thứ hai", () => {
  read.prefetch("x", "y");
  read.prefetch("x", "y");
  expect(runs).toBe(1);
});

test("dropPrefetched (đổi tab) bỏ bản chưa ai lấy", async () => {
  read.prefetch("x", "y");
  dropPrefetched();
  expect(await read.take("x", "y")).toBe("x/y#2");
});

test("quá hạn thì bỏ, đi mạng thật", async () => {
  vi.useFakeTimers();
  read.prefetch("x", "y");
  vi.advanceTimersByTime(31_000);
  expect(await read.take("x", "y")).toBe("x/y#2");
});

test("lỗi của lượt nạp trước được trả cho màn (không nuốt), và không gây unhandled rejection", async () => {
  const failing = prefetchable("f", async () => {
    throw new Error("boom");
  });
  failing.prefetch();
  await expect(failing.take()).rejects.toThrow("boom");
});

// Hai component cùng `take` một key thì cái sau đi mạng — OpsSupport phải nhận plan qua prop từ
// BrandDashboard, không tự đọc lại (trước 2026-10-03 nó tự gọi fetchMonthPlan cùng brand/tháng).
test("OpsSupport không tự đọc plan tháng", () => {
  const src = readFileSync(join(__dirname, "..", "src/components/OpsSupport.tsx"), "utf8");
  expect(src).not.toMatch(/fetchMonthPlan/);
});
