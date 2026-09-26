// Canh việc tách bundle (audit UX 2026-09-26, P2): trước đây 1 file JS 2,58 MB, mở app nào cũng tải cả thư viện
// Excel lẫn biểu đồ Report Tháng. Sau khi tách: file chính 665 KB. Hai thứ dễ làm hỏng lại nhất:
//   1) import tĩnh `xlsx` ở bất kỳ đâu → 500 KB quay lại chunk của màn đó;
//   2) App.tsx import tĩnh một component tab → component (và mọi thứ nó kéo theo) quay lại file chính.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const SRC = join(__dirname, "..", "src");

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

test("xlsx chỉ được tải động (await import(\"xlsx\"))", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (/^import\s[^;]*from\s+["']xlsx["']/m.test(readFileSync(file, "utf8"))) hits.push(file.split("/src/")[1]);
  }
  expect(hits).toEqual([]);
});

// Component App.tsx được phép import tĩnh: khung app (header, màn đăng nhập) — hiện ra trước mọi tab.
const APP_STATIC_COMPONENTS = ["./components/Header", "./components/Login", "./components/ResetPasswordScreen", "./components/common/TabErrorFallback"];

test("App.tsx không import tĩnh component tab — dùng lazyNamed/lazy", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const staticImports = [...app.matchAll(/^import\s+(?!type\b)[^;]*from\s+"(\.\/components\/[^"]+)";/gm)].map((m) => m[1]);
  expect(staticImports.filter((p) => !APP_STATIC_COMPONENTS.includes(p))).toEqual([]);
});
