// Canh các sửa P0 của audit UX/UI 2026-09-26 (WORKSPACE_DESIGN.md `## Audit UX/UI`) không bị viết ngược lại:
// token màu của 4 theme đủ tương phản WCAG 1.4.3, không còn cỡ chữ < 11px, không còn hộp thoại gốc của
// trình duyệt (alert/confirm/prompt — chặn cả tab, không test được, không theo theme).
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

function codeLines(file: string): { line: string; n: number }[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => {
      const t = line.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*"));
    });
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function themeTokens(): Record<string, Record<string, string>> {
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  const out: Record<string, Record<string, string>> = {};
  for (const m of css.matchAll(/\.theme-([a-z]+)\s*\{([^}]*)\}/g)) {
    out[m[1]] = Object.fromEntries([...m[2].matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((t) => [t[1], t[2]]));
  }
  return out;
}

test("4 theme đều có token và chữ đạt 4.5:1 trên nền thẻ", () => {
  const themes = themeTokens();
  expect(Object.keys(themes).sort()).toEqual(["midnight", "ocean", "sand", "yfb"]);
  const fails: string[] = [];
  for (const [name, t] of Object.entries(themes)) {
    for (const fg of ["text", "text-muted", "text-faint", "accent-text"]) {
      for (const bg of ["surface", "surface-elevated"]) {
        const cr = contrast(t[fg], t[bg]);
        if (cr < 4.5) fails.push(`${name}: --${fg} trên --${bg} = ${cr.toFixed(2)}`);
      }
    }
    // Chữ trên nút nền accent đặc (và nền accent-hover lúc rê chuột).
    for (const bg of ["accent", "accent-hover"]) {
      const cr = contrast(t["accent-contrast"], t[bg]);
      if (cr < 4.5) fails.push(`${name}: --accent-contrast trên --${bg} = ${cr.toFixed(2)}`);
    }
  }
  expect(fails).toEqual([]);
});

test("theme nào có accent-contrast khác trắng thì phải có luật đổi text-white trên nút accent", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  for (const [name, t] of Object.entries(themeTokens())) {
    if (t["accent-contrast"].toLowerCase() === "#ffffff") continue;
    expect(css).toContain(`.theme-${name} .text-white[class~="bg-[var(--accent)]"]`);
  }
});

test("không còn cỡ chữ nhỏ hơn 11px (Material 3 / Apple HIG lấy 11 làm cỡ nhỏ nhất)", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const { line, n } of codeLines(file)) {
      const m = /text-\[(\d+(?:\.\d+)?)px\]/g;
      for (const x of line.matchAll(m)) if (Number(x[1]) < 11) hits.push(`${file.split("/src/")[1]}:${n} ${x[0]}`);
    }
  }
  expect(hits).toEqual([]);
});

test("không dùng alert/confirm/prompt gốc của trình duyệt — dùng useToast/useConfirm/usePrompt", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const { line, n } of codeLines(file)) {
      const code = line.replace(/\/\/.*$/, "");
      if (/window\.(alert|confirm|prompt)\s*\(|(^|[^.\w])alert\s*\(/.test(code)) {
        hits.push(`${file.split("/src/")[1]}:${n} ${line.trim().slice(0, 100)}`);
      }
    }
  }
  expect(hits).toEqual([]);
});

test("mọi var(--token) dùng trong src/ đều được khai báo (index.css hoặc class [--token:…])", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const used = new Map<string, string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\[(--[a-z0-9-]+):/g)) declared.add(m[1]);
    for (const m of text.matchAll(/var\((--[a-z0-9-]+)\s*([,)])/g)) {
      // var(--x, fallback) có fallback nên không vỡ — vẫn nên khai báo, nhưng không chặn.
      if (m[2] === ")" && !used.has(m[1])) used.set(m[1], file.split("/src/")[1]);
    }
  }
  const missing = [...used].filter(([v]) => !declared.has(v)).map(([v, f]) => `${v} (${f})`);
  expect(missing).toEqual([]);
});

// toFixed cho "2.18" kiểu Mỹ — chữ hiển thị phải qua src/lib/format.ts (vi-VN: "2,18"). Chỉ các chỗ máy đọc
// được giữ toFixed: toạ độ SVG, cột số file Excel, giá trị điền sẵn vào ô input (parseFloat đọc dấu chấm).
const TOFIXED_ALLOWED: [string, RegExp][] = [
  ["lib/format.ts", /./],
  ["components/CeoBrief.tsx", /\bx\(|\by\(/],
  ["components/SessionLedger.tsx", /row\["Giờ live"\]/],
  ["components/brand-workspace/MonthlyReportTabs.tsx", /setPct(Daily|Dday|Midmonth|Payday)\(/]
];

test("không dùng toFixed cho chữ hiển thị (dấu thập phân phải là phẩy)", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = file.split("/src/")[1];
    for (const { line, n } of codeLines(file)) {
      if (!/\.toFixed\(/.test(line.replace(/\/\/.*$/, ""))) continue;
      if (TOFIXED_ALLOWED.some(([f, re]) => f === rel && re.test(line))) continue;
      hits.push(`${rel}:${n} ${line.trim().slice(0, 100)}`);
    }
  }
  expect(hits).toEqual([]);
});

test("tiền không dùng ký hiệu ₫ hay đơn vị M — dùng đ / triệu / tỷ", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const { line, n } of codeLines(file)) {
      // Bỏ qua bộ đọc file TikTok: nó phải gỡ ký hiệu ₫ khỏi số trong file gốc.
      if (/\.replace\(/.test(line)) continue;
      if (/₫|\dM đ|\}M đ|\)M đ/.test(line)) hits.push(`${file.split("/src/")[1]}:${n} ${line.trim().slice(0, 100)}`);
    }
  }
  expect(hits).toEqual([]);
});
