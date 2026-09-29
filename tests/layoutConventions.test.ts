// Canh Đợt 0 của audit UX/UI lần 2 (2026-09-29, WORKSPACE_DESIGN.md `## Audit UX/UI lần 2`) không bị viết ngược lại.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { monthPickerLabel, shiftMonthStr } from "../src/components/common/MonthPicker";
import { accountStatusLabel, statusLabel } from "../src/lib/statusLabels";

const SRC = join(__dirname, "..", "src");

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

const rel = (file: string) => file.split("/src/")[1];

test('không dùng <input type="month"> — Safari/Firefox desktop biến thành ô gõ chữ; dùng MonthPicker', () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("{/*")) return;
        if (/type=["{]"?month/.test(line)) hits.push(`${rel(file)}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});

test("tiêu đề trang không dùng kiểu cũ text-2xl (dùng PageHeader) — trừ các chỗ chưa tới lượt", () => {
  // AiMultiAgent: tab ẩn khỏi menu từ 2026-09-18.
  const PENDING = new Set(["components/AiMultiAgent.tsx"]);
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (PENDING.has(rel(file))) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/<h[12] className="[^"]*\btext-(2xl|3xl)\b/.test(line)) hits.push(`${rel(file)}:${i + 1} ${line.trim().slice(0, 80)}`);
      });
  }
  expect(hits).toEqual([]);
});

test("tiêu đề trang (h2 đầu tiên của mỗi component màn) cùng cỡ text-lg — trước đây lẫn 16/18/20/24px", () => {
  // Bắt kiểu tiêu đề trang có icon ở đầu component: text-xl/text-base + font-black/bold + flex icon.
  // Ngoại lệ: hộp báo lỗi tab (không phải tiêu đề trang, cố ý to hơn).
  const NOT_PAGE_TITLE = new Set(["components/common/TabErrorFallback.tsx"]);
  const hits: string[] = [];
  for (const file of sourceFiles(join(SRC, "components"))) {
    if (NOT_PAGE_TITLE.has(rel(file))) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/<h2 className="text-(xl|base) font-(black|bold) text-\[var\(--text\)\]("| flex items-center gap-2")>/.test(line))
          hits.push(`${rel(file)}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
});

test("Report Tháng: mục lục dính được (khung ngoài không overflow-hidden) và có đánh dấu phần đang đọc", () => {
  const src = readFileSync(join(SRC, "components/brand-workspace/MonthlyReportTabs.tsx"), "utf8");
  // Khung ngoài của report (nền PAL.bg) — overflow-hidden làm `sticky` của mục lục vô tác dụng (đo 2026-09-29).
  const outer = src.split("\n").find((l) => /<div className="rounded-2xl[^"]*" style=\{\{ background: PAL\.bg, border:/.test(l)) ?? "";
  expect(outer).not.toBe("");
  expect(outer).not.toMatch(/overflow-hidden/);
  expect(src).toMatch(/sticky -top-3 sm:-top-6/);
  expect(src).toMatch(/aria-current=\{activeSec === sec\.id/);
});

test("chữ biểu đồ recharts không nhỏ hơn 11px (sàn cỡ chữ của audit 26/09)", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(/fontSize=\{(\d+(?:\.\d+)?)\}/g)) if (Number(m[1]) < 11) hits.push(`${rel(file)}:${i + 1} ${m[0]}`);
      });
  }
  expect(hits).toEqual([]);
});

test("sidebar thu gọn chỉ theo bề ngang màn, không theo tab (hết nhảy 256↔64px khi đổi tab)", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  const line = app.split("\n").find((l) => /const autoCollapse\s*=/.test(l)) ?? "";
  expect(line).not.toBe("");
  expect(line).not.toMatch(/CALENDAR_TABS|isCalendarModule|activeTab/);
});

test("tab chờ đợt nạp dữ liệu đầu thay vì vẽ 0 ca / 'Chưa có…' giả", () => {
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  expect(app).toMatch(/!coreDataReady && !TABS_WITHOUT_CORE_DATA\.has\(activeTab\)/);
  // Ca phải nạp song song với RPC đóng ca đã qua giờ, không nối đuôi sau nó.
  expect(app).not.toMatch(/completePastSessions\(\)\s*\.catch\([^)]*\)\s*\.then\(\(\) => fetchSessions\(\)\)/);
});

test("MonthPicker: dịch tháng qua năm, nhãn tiếng Việt", () => {
  expect(shiftMonthStr("2026-01", -1)).toBe("2025-12");
  expect(shiftMonthStr("2026-12", 1)).toBe("2027-01");
  expect(shiftMonthStr("2026-09", 0)).toBe("2026-09");
  expect(monthPickerLabel("2026-09")).toBe("Tháng 9/2026");
});

test("nhãn trạng thái: giá trị DB tiếng Anh hiện tiếng Việt, giá trị lạ giữ nguyên", () => {
  expect(statusLabel("Available")).toBe("Sẵn sàng");
  expect(statusLabel("In Stock")).toBe("Trong kho");
  expect(statusLabel("Active")).toBe("Đang chạy");
  expect(accountStatusLabel("Active")).toBe("Hoạt động");
  expect(accountStatusLabel("Inactive")).toBe("Tạm khoá");
  expect(statusLabel("Xyz")).toBe("Xyz");
  expect(statusLabel(undefined)).toBe("");
});
