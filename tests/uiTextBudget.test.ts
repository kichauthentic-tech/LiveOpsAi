// Ngân sách chữ hiện thẳng trên màn — canh đợt cắt chữ 13/11 (user: "tìm những chỗ đang có text thừa, xoá bớt cho gọn").
//
// Các đợt trước (bố cục 18/10, cửa sổ ca 08/11, audit cửa sổ 09/11) đều cắt chữ rồi chữ lại bò về, vì không có số để
// canh. Test này giữ con số: tổng chữ hiện thẳng trên màn vận hành và trần của từng file nặng nhất.
//
// Luật đo nằm ở `tests/uiTextBudget.ts` (dùng chung, có giải thích tính/không tính cái gì).
//
// ĐỔI TRẦN KHI NÀO: thêm tính năng thật cần thêm chữ thì nâng đúng dòng của file đó và ghi lý do; KHÔNG nâng TOTAL_MAX
// để cho qua. Cắt được thêm thì hạ số xuống cho khớp (test cũng chặn việc để trần quá rộng so với thực tế).
import { expect, test } from "vitest";
import { join } from "node:path";
import { bucketOf, opsScreenText, scanUiText, wordsByFile } from "./uiTextBudget";

const SRC = join(__dirname, "..", "src");

/** Đo 14/11 sau đợt cắt thứ hai: 587 câu / 10.416 từ (trước khi cắt: 649 câu / 12.694 từ). */
const TOTAL_MAX = 10_700;
const SENTENCES_MAX = 600;

/** Trần từng file nặng nhất — mỗi dòng là một màn đã được xem bằng mắt trong đợt 13/11. */
const PER_FILE_MAX: [string, number][] = [
  ["src/components/MonthPlan.tsx", 950],
  ["src/components/RosterBoard.tsx", 640],
  ["src/lib/platforms/profiles.ts", 470],
  ["src/lib/performance/shiftBenchmark.ts", 450],
  ["src/lib/todoList.ts", 430],
  ["src/lib/scheduling/suggestEngine.ts", 400],
  ["src/lib/performance/handlingPlan.ts", 360],
  ["src/components/brand-workspace/ReconciliationPanel.tsx", 240],
  ["src/components/dashboard/period/BrandTab.tsx", 230],
];

test("tổng chữ hiện thẳng trên màn vận hành không vượt ngân sách", () => {
  const ops = opsScreenText(SRC);
  const words = ops.reduce((s, h) => s + h.words, 0);
  expect(words, `chữ hiện thẳng tăng lên ${words} từ (trần ${TOTAL_MAX}) — gập phần phương pháp vào Explain / ⓘ (WORKSPACE §5.2)`).toBeLessThanOrEqual(TOTAL_MAX);
  expect(ops.length, `số câu dài tăng lên ${ops.length} (trần ${SENTENCES_MAX})`).toBeLessThanOrEqual(SENTENCES_MAX);
});

test("không màn nào vượt trần chữ của nó", () => {
  const by = new Map(wordsByFile(opsScreenText(SRC)));
  for (const [file, max] of PER_FILE_MAX) {
    const w = by.get(file) ?? 0;
    expect(w, `${file}: ${w} từ hiện thẳng, trần ${max}`).toBeLessThanOrEqual(max);
  }
});

test("trần của từng màn không bị để rộng quá thực tế (cắt thêm thì hạ số)", () => {
  const by = new Map(wordsByFile(opsScreenText(SRC)));
  for (const [file, max] of PER_FILE_MAX) {
    const w = by.get(file) ?? 0;
    expect(w, `${file}: chỉ còn ${w} từ mà trần vẫn ${max} — hạ trần trong test này`).toBeGreaterThan(max * 0.6);
  }
});

test("chữ gập sau ⓘ / Explain không bị tính là hiện thẳng (canh chính phép đo)", () => {
  const all = scanUiText(SRC);
  const hidden = all.filter((h) => h.hidden);
  // Đợt 13/11 chuyển hàng loạt mô tả khối vào `InfoDot`; nếu phép đo hỏng thì số này rơi về gần 0 và
  // ngân sách phía trên thành vô nghĩa.
  expect(hidden.length).toBeGreaterThan(150);
  expect(hidden.some((h) => /InfoDot/.test(h.text) === false)).toBe(true);
});

test("ba nhóm chữ tách đúng: từ điển và câu gửi brand không nằm trong ngân sách màn vận hành", () => {
  expect(bucketOf("src/components/GlossaryDialog.tsx")).toBe("dictionary");
  expect(bucketOf("src/lib/metricGlossary.ts")).toBe("dictionary");
  expect(bucketOf("src/lib/report/pageInsights.ts")).toBe("brandInsight");
  expect(bucketOf("src/components/brand-workspace/MonthlyReportTabs.tsx")).toBe("brandInsight");
  expect(bucketOf("src/components/MonthPlan.tsx")).toBe("opsScreen");
});

test("không màn nào nói với người dùng về migration, tên bảng hay SQL (lib/featureOff.ts)", () => {
  const leaks = scanUiText(SRC, 2).filter(
    (h) =>
      /migration \d|SQL Editor|supabase\/migrations|PGRST\d/.test(h.text) &&
      !/^src\/lib\/db\//.test(h.file) &&
      // `[LiveOps] …` là console.warn cho người làm app, không hiện trên màn.
      !h.text.startsWith("[LiveOps]")
  );
  // Lớp db được phép ghi chi tiết kỹ thuật vào tham số `detail` của `featureOffError` (chỉ ra console).
  expect(leaks.map((h) => `${h.file}:${h.line} ${h.text}`)).toEqual([]);
});
