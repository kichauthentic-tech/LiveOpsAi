// Hàm API trên Vercel (api/index.ts) được dịch từng file sang JS và chạy bằng Node ESM ("type": "module"),
// KHÔNG qua bundler — nên import tương đối phải có đuôi ".js". Thiếu đuôi thì chạy ở máy vẫn được
// (tsx/vite tự đoán), nhưng trên Vercel mọi /api/* trả FUNCTION_INVOCATION_FAILED. Đã xảy ra: 9dcf719
// (2026-09-24) thêm `from "../lib/errorMessage"` → API production chết 2 ngày tới khi phát hiện 2026-09-26.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";

test("mọi import tương đối trong đồ thị của api/index.ts đều có đuôi .js", () => {
  const root = join(__dirname, "..");
  const seen = new Set<string>();
  const bad: string[] = [];
  const queue = [join(root, "api", "index.ts")];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      const spec = m[1];
      if (!spec.endsWith(".js")) {
        bad.push(`${file.slice(root.length + 1)}: ${spec}`);
        continue;
      }
      const ts = resolve(dirname(file), spec.replace(/\.js$/, ".ts"));
      if (existsSync(ts)) queue.push(ts);
    }
  }
  expect(seen.size).toBeGreaterThan(1);
  expect(bad).toEqual([]);
});
