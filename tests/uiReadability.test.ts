// Canh các sửa P0 của audit UX/UI 2026-09-26 (docs/WORKSPACE_HISTORY.md `## Audit UX/UI`) không bị viết ngược lại:
// token màu của 3 theme đủ tương phản WCAG 1.4.3, không còn cỡ chữ < 11px, không còn hộp thoại gốc của
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

test("mọi theme đều có token và chữ đạt 4.5:1 trên nền thẻ", () => {
  const themes = themeTokens();
  expect(Object.keys(themes).sort()).toEqual(["bento", "daylight", "midnight", "paper", "sage", "sand", "yfb"]);
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

test("theme khai trong index.css khớp danh sách chọn ở useTheme.tsx", () => {
  const hook = readFileSync(join(SRC, "hooks/useTheme.tsx"), "utf8");
  const ids = [...hook.matchAll(/\{ id: "([a-z]+)", label:/g)].map((m) => m[1]).filter((id) => !["compact", "normal", "comfy"].includes(id));
  expect(ids.sort()).toEqual(Object.keys(themeTokens()).sort());
});

test("chữ nhỏ nhất dùng text-2xs (biến --text-2xs theo theme), không viết cứng text-[11px]; theme nào cũng ≥ 11px", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const { line, n } of codeLines(file)) if (/text-\[11px\]/.test(line)) hits.push(`${file.split("/src/")[1]}:${n}`);
  }
  expect(hits).toEqual([]);
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  const sizes = [...css.matchAll(/--text-2xs:\s*(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  expect(sizes.length).toBeGreaterThan(0);
  for (const px of sizes) expect(px).toBeGreaterThanOrEqual(11);
});

test("khối token của theme đứng SAU `:root, .theme-yfb` (cùng độ ưu tiên thì khối sau thắng — Midnight từng ra màu YFB tới 06/11)", () => {
  const css = readFileSync(join(SRC, "index.css"), "utf8");
  const root = css.indexOf(":root,\n.theme-yfb {");
  expect(root).toBeGreaterThan(-1);
  for (const name of Object.keys(themeTokens())) {
    if (name === "yfb") continue;
    expect(css.indexOf(`.theme-${name} {`), name).toBeGreaterThan(root);
  }
});

test("Report Tháng theo theme: PAL là biến CSS, không nối hex độ trong suốt, không đưa PAL vào thuộc tính SVG", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    for (const { line, n } of codeLines(file)) {
      if (/\$\{PAL\.\w+\}[0-9a-fA-F]{2}(?![0-9a-fA-F])/.test(line)) hits.push(`${file.split("/src/")[1]}:${n} nối hex`);
      if (/\b(fill|stroke|stopColor)=\{[^}]*\bPAL\./.test(line)) hits.push(`${file.split("/src/")[1]}:${n} PAL trong thuộc tính SVG (dùng usePal)`);
    }
  }
  expect(hits).toEqual([]);
  const theme = readFileSync(join(SRC, "components/brand-workspace/report/theme.ts"), "utf8");
  expect(theme).toMatch(/gold: "var\(--rt-gold\)"/);
  // File gửi brand vẫn đen-vàng: khung bản xuất mang .rt-skin-yfb.
  expect(readFileSync(join(SRC, "components/brand-workspace/BrandMonthlyReport.tsx"), "utf8")).toMatch(/host\.className = "rt-skin-yfb"/);
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
  // demo.css (Report Tháng, tiền tố .rt) khai báo bảng màu của bản demo; markup của các trang demo dùng var(--…) của nó.
  const css = readFileSync(join(SRC, "index.css"), "utf8") + readFileSync(join(SRC, "components/brand-workspace/report/demo.css"), "utf8");
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
  ["components/brand-workspace/report/demoCharts.ts", /./], // hàm vẽ của demo: toFixed rồi đổi "." → ","
  ["components/dashboard/shared.tsx", /\bx\(|\by\(/],
  ["components/dashboard/RunRate.tsx", /\bx\(|\by\(/],
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

// Quy ước tiền (user chốt 2026-09-27): không "đ"/"₫"/"VNĐ"; rút gọn là 50M / 1,2B / 500K qua fmtVndShort,
// đầy đủ là 53.733.488 qua fmtVndFull — component không tự ghép "tr"/"triệu"/"tỷ"/"k".
function codeWithoutComments(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .split("\n")
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"));
}

test("tiền không có đơn vị đ / ₫ / VNĐ, không tự ghép tr / triệu / tỷ / k", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    codeWithoutComments(file).forEach((line, i) => {
      // Bỏ qua bộ đọc file TikTok (gỡ ₫ khỏi số trong file gốc) và hàm bỏ dấu (đ → d).
      if (/\.replace\(/.test(line)) return;
      const unit = /(?<![\p{L}])đ(?![\p{L}%])|₫|VNĐ|\bVND\b/u.test(line);
      const shortUnit = /[\d})]\s?(triệu|tr|tỷ|k)(?![\p{L}\d])/u.test(line) && !/Voucher/i.test(line);
      if (unit || shortUnit) hits.push(`${file.split("/src/")[1]}:${i + 1} ${line.trim().slice(0, 100)}`);
    });
  }
  expect(hits).toEqual([]);
});

// Audit 05/10: Bảng Vận Hành in "Thứ 2, 2026-10-05", Lịch brand và Nhân sự ca in ngày đang chọn dạng máy. Biến
// ngày/tháng đang chọn không được rơi thẳng vào chữ JSX — qua fmtDateVn / fmtMonth (thuộc tính value=/key= thì được).
test("ngày/tháng đang chọn không in thẳng ra màn hình dạng 2026-10-05", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (!file.endsWith(".tsx")) continue;
    const rel = file.split("/src/")[1];
    codeWithoutComments(file).forEach((line, i) => {
      if (/[^=\w$]\{(selectedDate|selectedMonth)\}/.test(line) || /`[^`]*\$\{(selectedDate|selectedMonth)\}[^`]*`/.test(line) && !/\$\{(selectedDate|selectedMonth)\}[-T|]/.test(line))
        hits.push(`${rel}:${i + 1} ${line.trim().slice(0, 100)}`);
    });
  }
  expect(hits).toEqual([]);
});
