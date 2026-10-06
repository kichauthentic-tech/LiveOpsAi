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
const APP_STATIC_COMPONENTS = [
  "./components/Header",
  "./components/AppSidebar", // khung app, luôn hiện — lazy nó chỉ làm sidebar nhấp nháy lúc mở
  "./components/Login",
  "./components/ResetPasswordScreen",
  "./components/common/TabErrorFallback",
  "./components/common/ChannelBar", // thanh chọn sàn đầu nội dung (Bước 3 đa sàn, 07/10) — vài dòng nút, hiện trên mọi màn theo sàn
  "./components/common/PlatformChip" // nhãn sàn ở đầu khối từng sàn của màn "mọi kênh"
];

test("App.tsx không import tĩnh component tab — dùng lazyNamed/lazy", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const staticImports = [...app.matchAll(/^import\s+(?!type\b)[^;]*from\s+"(\.\/components\/[^"]+)";/gm)].map((m) => m[1]);
  expect(staticImports.filter((p) => !APP_STATIC_COMPONENTS.includes(p))).toEqual([]);
});

// ── Tách bundle đợt 2 (2026-10-01) ────────────────────────────────────────────────────────────────
// Sau đợt 1 file chính còn 671 KB, trong đó 3 khối app KHÔNG cần để vẽ màn đăng nhập:
// Sentry 91 KB, @supabase/realtime-js + phoenix 57 KB, @supabase/storage-js 22 KB. Còn chunk tab
// Report Tháng 534 KB thì 364 KB là recharts/d3, chỉ dùng khi tháng đã có report chốt.
// Kết quả: entry 671 → 495 KB (gzip 195 → 141), chunk Report Tháng 534 → 39 KB.

test("Sentry chỉ được tải động — không import tĩnh ở bất kỳ file client nào", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.includes("/src/server/")) continue; // bản server do esbuild dựng, không có chunk entry
    if (/^import\s[^;]*from\s+["']@sentry\/react["']/m.test(readFileSync(file, "utf8"))) hits.push(file.split("/src/")[1]);
  }
  expect(hits).toEqual([]);
});

test("import() Sentry phải destructure, không nhận cả namespace", () => {
  // `.then((Sentry) => Sentry.init(...))` làm Rollup giữ mọi integration (tracing/replay/feedback):
  // đo 2026-10-01 là 494 KB thay vì 90 KB. Lấy đúng hàm cần dùng thì tree-shaking chạy lại được.
  const src = readFileSync(join(SRC, "lib/errorReporting.tsx"), "utf8");
  const call = src.slice(src.indexOf('import("@sentry/react")'));
  expect(call.slice(0, 200)).toMatch(/\.then\(\s*\(?\s*\{/);
});

test("Report Tháng: MonthlyReportTabs (recharts) chỉ được tải động", () => {
  const src = readFileSync(join(SRC, "components/brand-workspace/BrandMonthlyReport.tsx"), "utf8");
  expect(src).not.toMatch(/^import\s[^;]*from\s+["']\.\/MonthlyReportTabs["']/m);
  expect(src).toContain('lazyNamed(() => import("./MonthlyReportTabs"), "MonthlyReportTabs")');
});

// Cả 2 file đều nằm trong chunk lazy của Report Tháng (ui.tsx chỉ được MonthlyReportTabs import),
// nên recharts vẫn chỉ tải khi mở đúng tab đó. Thêm file thứ 3 ở ngoài nhánh này là 364 KB biểu đồ
// rơi sang chunk khác — đó mới là thứ test này canh.
const RECHARTS_FILES = [
  "components/brand-workspace/MonthlyReportTabs.tsx",
  // Report Shopee (0139) cũng lazy (lazyNamed ở BrandMonthlyReport) — chunk riêng, chỉ tải khi chọn sàn Shopee.
  "components/brand-workspace/ShopeeMonthlyReportTabs.tsx",
  "components/brand-workspace/report/ui.tsx"
];

test("recharts không rò ra ngoài nhánh Report Tháng", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (/^import\s[^;]*from\s+["']recharts["']/m.test(readFileSync(file, "utf8"))) hits.push(file.split("/src/")[1]);
  }
  expect(hits.sort()).toEqual([...RECHARTS_FILES].sort());
});

// ── Shim @supabase/realtime-js + storage-js (src/shims/README.md) ─────────────────────────────────
// App không dùng realtime/storage nhưng supabase-js import tĩnh cả hai. Alias trong vite.config.ts
// thay bằng shim rỗng. 3 test dưới đây là thứ bắt lỗi khi NÂNG VERSION supabase-js: shim thiếu
// method thì đỏ ở đây, thay vì TypeError lúc chạy thật.
const SUPABASE_DIST = join(__dirname, "..", "node_modules/@supabase/supabase-js/dist/index.mjs");

function shimNames(file: string): Set<string> {
  const src = readFileSync(join(SRC, "shims", file), "utf8");
  return new Set([
    ...[...src.matchAll(/^export class (\w+)/gm)].map((m) => m[1]),
    ...[...src.matchAll(/^ {2}(?:\w+ )?(\w+)\s*[(<]/gm)].map((m) => m[1])
  ]);
}

test("shim export đủ mọi tên supabase-js import từ 2 gói bị thay", () => {
  const dist = readFileSync(SUPABASE_DIST, "utf8");
  for (const [pkg, file] of [["realtime-js", "supabase-realtime.ts"], ["storage-js", "supabase-storage.ts"]] as const) {
    const m = dist.match(new RegExp(`import \\{([^}]*)\\} from "@supabase/${pkg}"`));
    expect(m, `supabase-js không còn import từ @supabase/${pkg} — kiểm tra lại alias có còn cần không`).toBeTruthy();
    const imported = m![1].split(",").map((s) => s.trim()).filter(Boolean);
    const have = shimNames(file);
    expect(imported.filter((n) => !have.has(n)), `shim ${file} thiếu export`).toEqual([]);
  }
});

test("shim realtime có đủ method supabase-js gọi ngầm", () => {
  const dist = readFileSync(SUPABASE_DIST, "utf8");
  const called = [...new Set([...dist.matchAll(/\bthis\.realtime\.(\w+)\s*\(/g)].map((m) => m[1]))];
  expect(called.length, "không thấy lời gọi realtime nào — regex hỏng hoặc supabase-js đã đổi cấu trúc").toBeGreaterThan(0);
  const have = shimNames("supabase-realtime.ts");
  expect(called.filter((n) => !have.has(n)), "shim realtime thiếu method").toEqual([]);
});

test("shim vẫn hợp lệ: app không dùng realtime/storage ở đâu cả", () => {
  // Ngày nào thêm tính năng realtime/upload thì gỡ alias trong vite.config.ts trước — nếu không,
  // shim sẽ ném lỗi đúng lúc người dùng bấm. Test này bắt trước ở CI.
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (file.includes("/src/shims/") || file.includes("/src/server/")) continue;
    const src = readFileSync(file, "utf8");
    if (/supabase\s*\.\s*(channel|storage)\b|\.removeAllChannels\(|postgres_changes/.test(src)) hits.push(file.split("/src/")[1]);
  }
  expect(hits).toEqual([]);
});

// Tải chunk tab song song với dữ liệu (2026-10-03): khối render tab nằm sau cổng `coreDataReady`, nên
// tab nào thiếu trong TAB_CHUNKS thì chunk của nó lại xếp hàng SAU cả đợt nạp — chậm thêm một vòng mạng.
test("mọi tab render trong App.tsx đều có trong TAB_CHUNKS", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const rendered = new Set([...app.matchAll(/\{activeTab === "([a-z_]+)" &&/g)].map((m) => m[1]));
  const table = app.slice(app.indexOf("const TAB_CHUNKS"), app.indexOf("};", app.indexOf("const TAB_CHUNKS")));
  const listed = new Set([...table.matchAll(/^\s+([a-z_]+):/gm)].map((m) => m[1]));
  listed.add("calendar"); // chọn chunk theo opsView ở effect preload, không nằm trong bảng
  expect(rendered.size).toBeGreaterThan(20);
  expect([...rendered].filter((t) => !listed.has(t))).toEqual([]);
});
