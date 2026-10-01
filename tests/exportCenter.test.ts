// "Trung tâm report + xuất file" (Đợt C/4, hoàn tất 2026-10-02). Chạy: npx vitest run tests/exportCenter.test.ts
//
// Quyết định: KHÔNG dựng một tab "trung tâm xuất file" riêng. Lý do đo được: 7 màn dưới đây đều có bộ
// lọc riêng (tháng, brand, khoảng ngày, host) và `exportXlsx.ts` ghi ra ĐÚNG hàng đang hiện sau bộ lọc
// — gom vào một tab thì phải dựng lại toàn bộ bộ lọc của 7 màn ở đó, và đó chính là cách sinh ra hai
// nguồn sự thật. "Trung tâm" ở đây là MỘT module dùng chung (`src/lib/exportXlsx.ts`), không phải một
// màn hình. Test này canh đúng điều đó: mỗi màn báo cáo phải đi qua module chung, và không màn nào
// được tự viết lại CSV/Blob riêng.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const SRC = join(__dirname, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

/** Màn báo cáo → vì sao nó phải xuất được. Thêm màn báo cáo mới thì thêm vào đây. */
const REPORT_SCREENS: [string, string][] = [
  ["components/SessionLedger.tsx", "Sổ Ca — bảng ca gốc, agency + brand"],
  ["components/HostPerformance.tsx", "Hiệu Suất Host — 3 bảng ops dùng để xếp lịch"],
  ["components/BrandsOverview.tsx", "Toàn Cảnh Brand — trạng thái từng brand trong tháng"],
  ["components/brand-workspace/MonthlyReportTabs.tsx", "Report Tháng — nhiều phần, 1 file nhiều sheet"],
  ["components/brand-workspace/BrandWeeklyReport.tsx", "Report Tuần"],
  ["components/brand-workspace/BrandCommitmentView.tsx", "Cam Kết Hợp Đồng (brand đọc)"],
  ["components/brand-workspace/BrandAffiliateTable.tsx", "Affiliate"]
];

test("mọi màn báo cáo đều xuất file qua module dùng chung lib/exportXlsx", () => {
  const missing: string[] = [];
  for (const [file, why] of REPORT_SCREENS) {
    const src = read(file);
    if (!/from "(?:\.\.\/)+lib\/exportXlsx"/.test(src)) missing.push(`${file} — ${why}`);
  }
  expect(missing).toEqual([]);
});

test("không màn nào tự viết lại đường xuất file riêng", () => {
  // Hai lớp lỗi muốn chặn: (a) tự dựng Blob/CSV ⇒ mất phần chống trùng tên sheet + mất cơ chế tải
  // động `xlsx` (thư viện ~1 MB, chỉ nạp khi bấm nút — xem đầu exportXlsx.ts); (b) `import "xlsx"`
  // tĩnh ở component ⇒ kéo 1 MB vào chunk của màn cho mọi người xem, kể cả người không bấm nút.
  const bad: string[] = [];
  for (const [file] of REPORT_SCREENS) {
    const src = read(file);
    if (/^\s*import\s+[^\n]*from\s+"xlsx"/m.test(src)) bad.push(`${file}: import tĩnh "xlsx"`);
    if (/new\s+Blob\s*\(/.test(src) && /download/i.test(src)) bad.push(`${file}: tự dựng Blob để tải`);
  }
  expect(bad).toEqual([]);
});

test("exportXlsx chỉ nạp thư viện khi được gọi, và chống trùng tên sheet", () => {
  const src = read("lib/exportXlsx.ts");
  // Nạp động: `await import("xlsx")` trong thân hàm, không phải import ở đầu file.
  expect(src).toMatch(/await\s+import\("xlsx"\)/);
  expect(/^\s*import\s+[^\n]*from\s+"xlsx"/m.test(src), "exportXlsx không được import tĩnh xlsx").toBe(false);
  // Trần 31 ký tự của Excel + chống ghi đè sheet trùng tên (hai sheet cùng bị cắt về một chữ).
  expect(src).toMatch(/slice\(0,\s*31\)/);
  expect(src).toMatch(/usedNames/);
});

test("Toàn Cảnh Brand và Hiệu Suất Host xuất từ CÙNG dữ liệu bảng đang hiện", () => {
  // Lớp lỗi muốn chặn: tính lại số cho file xuất ⇒ sửa cột trên bảng mà quên sửa chỗ build file, hai
  // bên lệch nhau âm thầm. Bảng phải render TỪ cùng một mảng mà hàm xuất đọc.
  const bo = read("components/BrandsOverview.tsx");
  expect(bo, "BrandsOverview phải dựng `rows` một lần rồi cả bảng lẫn nút xuất đọc nó").toMatch(/const rows = useMemo\(/);
  expect(bo).toMatch(/\{rows\.map\(/);
  expect(bo).toMatch(/const out = rows\.map\(/);
  // Hiệu Suất Host: cả 3 bảng và 3 sheet đều đọc `hosts` / `weekdays` / `cellOf` đã memo sẵn.
  const hp = read("components/HostPerformance.tsx");
  expect(hp).toMatch(/const rank = hosts\.map\(/);
  expect(hp).toMatch(/const gridRows = hosts\.map\(/);
  expect(hp).toMatch(/weekdays\.map\(\(w\)/);
  expect(hp).toMatch(/downloadSheetsAsXlsx\(/);
});

// ---------------------------------------------------------------------------
// Chạy thật module xuất file — không chỉ đọc source
// ---------------------------------------------------------------------------
// 7 màn cùng phụ thuộc đúng một hàm này mà nó chưa từng có test chạy thật. `XLSX.writeFile` trong
// Node ghi ra đĩa, nên test ghi vào thư mục tạm rồi ĐỌC LẠI file để đối chiếu — chứng minh phần
// chống trùng/cắt 31 ký tự có tác dụng, chứ không phải chỉ có mặt trong source.
test("downloadSheetsAsXlsx ghi ra file đọc lại được, không sheet nào bị ghi đè", async () => {
  const fs = await import("node:fs");
  const { mkdtempSync } = fs;
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "liveops-xlsx-"));
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    // Bản ESM của `xlsx` không tự có `fs`: ngoài trình duyệt, `writeFile` rơi vào nhánh "tải về" và
    // cần DOM. Nạp trước rồi `set_fs` — `import("xlsx")` bên trong hàm trả về CÙNG module instance,
    // nên đây là cách chạy thật hàm production mà không phải sửa nó cho test.
    const XLSX0 = await import("xlsx");
    XLSX0.set_fs(fs);
    const { downloadSheetsAsXlsx } = await import("../src/lib/exportXlsx");
    const long = "Ten sheet rat dai vuot qua ba muoi mot ky tu";
    await downloadSheetsAsXlsx(
      [
        { name: "Xep hang host", rows: [{ Host: "Nguyễn A", "GMV/giờ": 19_600_000, "Số ca": 7 }] },
        // Hai tên khác nhau nhưng cắt về 31 ký tự thì GIỐNG nhau — nếu không lệch đi thì sheet đầu
        // bị book_append_sheet ghi đè và người xem mất hẳn một bảng mà không có lỗi nào.
        { name: `${long} (1)`, rows: [{ a: 1 }] },
        { name: `${long} (2)`, rows: [{ a: 2 }] },
        // Bảng rỗng vẫn phải ra sheet trống, để người xem biết "tab đó chưa có dữ liệu".
        { name: "Rong", rows: [] }
      ],
      "out.xlsx"
    );
    const XLSX = await import("xlsx");
    const wb = XLSX.readFile(join(dir, "out.xlsx"));
    expect(wb.SheetNames).toHaveLength(4);
    expect(new Set(wb.SheetNames).size, "tên sheet phải khác nhau đôi một").toBe(4);
    for (const n of wb.SheetNames) expect(n.length).toBeLessThanOrEqual(31);
    const first = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
    expect(first).toEqual([{ Host: "Nguyễn A", "GMV/giờ": 19_600_000, "Số ca": 7 }]);
    // Hai sheet tên-cắt-giống-nhau giữ đúng dữ liệu riêng, không cái nào đè cái nào.
    const vals = wb.SheetNames.slice(1, 3).map((n) => XLSX.utils.sheet_to_json<{ a: number }>(wb.Sheets[n])[0]?.a);
    expect(vals.sort()).toEqual([1, 2]);
    expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[3]])).toEqual([]);
  } finally {
    process.chdir(cwd);
  }
});
