// Canh Đợt 0 của audit UX/UI lần 2 (2026-09-29, WORKSPACE_DESIGN.md `## Audit UX/UI lần 2`) không bị viết ngược lại.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { monthPickerLabel, shiftMonthStr } from "../src/components/common/MonthPicker";
import { KEY_METRICS, KEY_METRIC_GROUPS } from "../src/lib/report/keyMetrics";
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

// M3 (29/09): bản đầu chỉ bắt dạng prop `fontSize={10}` của recharts, nên 6 chỗ `style={{ fontSize: 10 }}` trong
// SVG tự vẽ của CeoBrief lọt qua suốt từ M1. Nay bắt cả hai dạng.
test("chữ biểu đồ không nhỏ hơn 11px (sàn cỡ chữ của audit 26/09) — cả prop recharts lẫn style SVG tự vẽ", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const m of line.matchAll(/fontSize=\{(\d+(?:\.\d+)?)\}/g)) if (Number(m[1]) < 11) hits.push(`${rel(file)}:${i + 1} ${m[0]}`);
        for (const m of line.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)/g)) if (Number(m[1]) < 11) hits.push(`${rel(file)}:${i + 1} ${m[0]}`);
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

// ---- M2 Dashboard brand (2026-09-29) ----

test("Key Metrics: đủ 19 chỉ số (18 + AOV), chỉ số nào cũng có nhóm, nhóm nào cũng có chỉ số", () => {
  expect(KEY_METRICS).toHaveLength(19);
  expect(KEY_METRICS.filter((d) => d.extra)).toHaveLength(1); // AOV
  const groups = new Set(KEY_METRIC_GROUPS.map((g) => g.group));
  // Chỉ số mới thêm mà quên gắn nhóm ⇒ biến mất khỏi Dashboard brand (chỉ render theo nhóm).
  expect(KEY_METRICS.filter((d) => !groups.has(d.group)).map((d) => d.key)).toEqual([]);
  expect(KEY_METRIC_GROUPS.filter((g) => !KEY_METRICS.some((d) => d.group === g.group)).map((g) => g.group)).toEqual([]);
  // "Kết quả" là tầng ô to đọc trước — giữ 5 ô, quá tay thì hết tác dụng phân tầng.
  expect(KEY_METRICS.filter((d) => d.group === "result")).toHaveLength(5);
});

test("Dashboard brand: Run-rate so target đứng TRƯỚC lưới Key Metrics", () => {
  const src = readFileSync(join(SRC, "components/brand-workspace/BrandDashboard.tsx"), "utf8");
  const runRate = src.indexOf('title="Run-rate so với target plan"');
  const keyMetrics = src.indexOf('KEY_METRICS.filter((d) => d.group === "result")');
  expect(runRate).toBeGreaterThan(-1);
  expect(keyMetrics).toBeGreaterThan(-1);
  expect(runRate).toBeLessThan(keyMetrics);
  // Không quay lại lưới phẳng 19 ô cùng cỡ.
  expect(src).not.toMatch(/\{KEY_METRICS\.map\(/);
});

test("Dashboard agency: khối không tính được thì không chiếm chỗ ngang bằng ô có số", () => {
  const src = readFileSync(join(SRC, "components/CeoBrief.tsx"), "utf8");
  // Bảng "Các tài khoản": cột nào không brand nào có số thì ẩn, và phải nói đã ẩn cột nào.
  expect(src).toMatch(/const hidden = hideable\.filter/);
  expect(src).toMatch(/Ẩn \{hidden\.length\} cột chưa brand nào có số/);
  // Target & dự phóng: 3 ô phụ thuộc target chỉ dựng khi có target.
  expect(src).toMatch(/\{o\.target && stat\("Run-rate"/);
  expect(src).toMatch(/\{o\.target && stat\("Cần mỗi ngày còn lại"/);
  // Tài chính: chưa tính được ca nào thì không dựng 6 ô KPI + 2 biểu đồ/bảng rỗng.
  expect(src).toMatch(/\{fin\.priced === 0 \? \(/);
});

// ---- M4 Vận hành (2026-09-29) ----

test("Sổ Ca: cột phụ ẩn ở điện thoại, cột Target GMV chỉ dựng khi có ca có target, colSpan theo số cột thật", () => {
  const src = readFileSync(join(SRC, "components/SessionLedger.tsx"), "utf8");
  expect(src).toMatch(/const SUB_COL = "hidden sm:table-cell/);
  expect(src).toMatch(/const showTargetCol = !isBrandView && rows\.some/);
  expect(src).toMatch(/\{showTargetCol && <th/);
  // colSpan cứng 13 trên bảng 12 cột là lỗi cũ — không quay lại.
  expect(src).not.toMatch(/colSpan=\{13\}/);
  expect(src).toMatch(/colSpan=\{colCount\}/);
  // Hết việc thì nói một câu, không dựng 3 nút lọc đều (0).
  expect(src).toMatch(/const noMissing = /);
});

test("Lịch brand mở thẳng màn Ngày ở điện thoại (lưới tháng cố ý rộng 1.080px)", () => {
  const src = readFileSync(join(SRC, "components/brand-workspace/BrandCalendar.tsx"), "utf8");
  const line = src.split("\n").find((l) => /useState<"month" \| "week" \| "day">/.test(l)) ?? "";
  expect(line).not.toBe("");
  expect(src).toMatch(/matchMedia\("\(max-width: 639px\)"\)\.matches \? "day" : "month"/);
});

test('Nhân sự ca: "Tải theo Host" không còn là bảng w-full bị kéo ngang', () => {
  const src = readFileSync(join(SRC, "components/ShiftScheduling.tsx"), "utf8");
  expect(src).not.toMatch(/<table className="w-full text-sm min-w-\[420px\]">/);
  expect(src).toMatch(/sm:columns-2 xl:columns-3/);
});

// ---- M5 Kế Hoạch Tháng (2026-09-29) ----

test("Kế Hoạch Tháng: ô/nút trong lưới ca đạt sàn 24px và hàng vừa bề ngang ô ngày", () => {
  const src = readFileSync(join(SRC, "components/MonthPlan.tsx"), "utf8");
  // input[type=time] của Chrome cần tối thiểu 63px (đo bằng width:auto) — hẹp hơn là cắt mất phút.
  expect(src).not.toMatch(/type="time"[^>]*w-\[(?:[0-5]?\d|6[0-2])px\]/);
  // Hai ô giờ 63px + gap là đã kín hàng: không được nhét thêm gì vào hàng đó nữa.
  expect(src).toMatch(/w-\[63px\] min-h-6 shrink-0/);
  // Nút xoá ca và ô target phải cao ≥ 24px (p-1.5 quanh icon 12px / min-h-6).
  expect(src).toMatch(/p-1\.5 text-rose-400[^"]*" title="Bỏ ca"/);
  expect(src).toMatch(/aria-label="Target GMV của ca"/);
  // Margin âm từng làm nút tràn sang ô ngày bên cạnh rồi bị ô đó phủ lên — không quay lại.
  expect(src).not.toMatch(/ml-auto p-1\.5 -mr-1/);
  // Lưới phải đủ rộng để ô ngày chứa nổi hàng 128px, nếu không lại tràn ở màn hẹp.
  const grid = src.match(/grid grid-cols-7 gap-1\.5 min-w-\[(\d+)px\]/);
  expect(grid).not.toBeNull();
  expect(Number(grid![1])).toBeGreaterThanOrEqual(1100);
});

// ---- M6 Talent Pool (2026-09-30) ----

test("Talent Pool: danh sách là bảng, không phải lưới 33 thẻ", () => {
  const src = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  // Lưới thẻ cũ: 33 thẻ × 224px, trong đó 4/6 ô dữ liệu giống hệt nhau ở cả 33 người.
  expect(src).not.toMatch(/grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4/);
  expect(src).toMatch(/<table className="w-full text-xs">/);
  // Cột phụ ẩn ở điện thoại như Sổ Ca (M4).
  expect(src).toMatch(/const SUB_COL = "hidden sm:table-cell/);
});

test("Talent Pool: ẩn cột chưa ai có dữ liệu và nói chỗ điền", () => {
  const src = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  expect(src).toMatch(/const hideableCols:/);
  expect(src).toMatch(/const show = Object\.fromEntries\(hideableCols\.map/);
  expect(src).toMatch(/hiddenCols\.length > 0 &&/);
  // Đếm cột thay vì gõ số (M4 đã dính một lần colSpan lệch).
  expect(src).toMatch(/const colCount = 2 \+ hideableCols\.filter/);
  expect(src).toMatch(/colSpan=\{colCount\}/);
  expect(src).not.toMatch(/colSpan=\{\d+\}/);
});

test("Talent Pool: không bịa mặt người, không hiện 0đ thay cho chưa đặt", () => {
  const src = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  // Ảnh stock Unsplash từng dùng chung cho cả 33 hồ sơ — mặt người không được bịa.
  expect(src).not.toMatch(/images\.unsplash\.com/);
  expect(src).toMatch(/const TalentAvatar: React\.FC/);
  // Rate/hoa hồng chưa nhập phải nói "chưa đặt", không in số 0 như một mức đã chốt.
  expect(src).toMatch(/chưa đặt/);
  expect(src).not.toMatch(/fmtVndFull\(detailTalent\.ratePerSession \|\| 0\)/);
  expect(src).not.toMatch(/\{detailTalent\.phone \|\| "N\/A"\}/);
});

test("Talent Pool: đếm cả ca chạy vai trợ (coHostId), không chỉ ca host", () => {
  const metric = readFileSync(join(SRC, "lib/metrics/avgGmv.ts"), "utf8");
  expect(metric).toMatch(/assistSessionCount: sessions\.filter\(\(s\) => s\.coHostId === talentId && isCountable\(s\)\)\.length/);
  const src = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  expect(src).toMatch(/real\.assistSessionCount/);
  // Hiệu suất đo theo GIỜ, không theo ca: ca 5 giờ và ca 2 giờ không cùng cỡ.
  expect(metric).toMatch(/gmvPerHour: hours > 0 \? totalGmv \/ hours : 0/);
  expect(src).not.toMatch(/GMV\/ca/);
  // ...nhưng KHÔNG có số GMV/giờ gộp mọi brand ở bảng lẫn hồ sơ talent: chỉ số này phụ thuộc ngành
  // hàng/giá bán của brand hơn là người chạy. Đo 2026-09-30: chênh lệch giữa host 1,40×, trong khi
  // cùng một host dao động giữa các tháng 1,55× — nhiễu bối cảnh đã lớn hơn tín hiệu năng lực.
  expect(src).toMatch(/computeTalentBrandPerf/);
  expect(src).not.toMatch(/show\[METRIC\.gmvPerHour\]/);
  expect(src).not.toMatch(/real\.gmvPerHour/);
  expect(metric).toMatch(/export function computeTalentBrandPerf/);
  // Ngưỡng "đủ mẫu" phải dùng chung với hostSuggestion, không gõ lại số 3.
  expect(metric).toMatch(/MIN_SESSIONS_FOR_CONFIDENCE/);
  expect(metric).not.toMatch(/rows\.length < 3/);
  const profile = readFileSync(join(SRC, "components/MyTalentProfile.tsx"), "utf8");
  expect(profile).not.toMatch(/myReal\.gmvPerHour/);
  expect(profile).not.toMatch(/GMV\/session/);
  // Không cộng ca trợ vào sessionCount: GMV của ca tính cho host, cộng sang trợ là đếm đôi.
  expect(metric).not.toMatch(/sessionCount: completed\.length \+ /);
});

test("Talent Pool: trình AI khớp nối gập lại và xếp sau danh sách", () => {
  const src = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  expect(src).toMatch(/<details className="group/);
  expect(src).toMatch(/group-open:rotate-180/);
  // Bảng phải đứng trước khối AI trong cây JSX.
  const table = src.indexOf('<table className="w-full text-xs">');
  const details = src.indexOf('<details className="group');
  expect(table).toBeGreaterThan(-1);
  expect(details).toBeGreaterThan(table);
});

// ---- M7 nhóm màn còn lại (2026-09-30) ----

test("Điều Phối Phát Hành: không mời phát hành tháng không có gì để gửi", () => {
  const src = readFileSync(join(SRC, "components/ReportPublishBoard.tsx"), "utf8");
  // Số ca trong tháng là thứ quyết định report có gì để gửi — phải hiện trên bảng.
  expect(src).toMatch(/const sessionCountFor = /);
  expect(src).toMatch(/Ca trong tháng/);
  // Tháng không có ca và chưa ai tạo dòng report ⇒ không có nút xanh.
  expect(src).toMatch(/const nothingToPublish = sessionCount === 0 && !report/);
  expect(src).toMatch(/Không có gì để phát hành/);
  // colSpan đếm được, không gõ số.
  expect(src).toMatch(/colSpan=\{COL_COUNT\}/);
  expect(src).not.toMatch(/colSpan=\{\d+\}/);
});

test("PageIntro: nút Chi tiết đạt sàn 24px (dùng chung 11 màn)", () => {
  const src = readFileSync(join(SRC, "components/common/PageIntro.tsx"), "utf8");
  expect(src).toMatch(/shrink-0 -m-1\.5 p-1\.5 text-\[11px\]/);
});

test("Vùng bấm ≥ 24px ở nhóm màn M7", () => {
  const affiliate = readFileSync(join(SRC, "components/brand-workspace/BrandAffiliateTable.tsx"), "utf8");
  // 56 ô nhập của bảng affiliate cao 20px trước M7.
  expect(affiliate).toMatch(/const inputCls = "w-full min-h-6 bg-transparent/);
  expect(affiliate).not.toMatch(/title="Xoá cột" className="text-red-500/);

  const engine = readFileSync(join(SRC, "components/EngineTrainingPanel.tsx"), "utf8");
  expect(engine).toMatch(/className="w-16 min-h-6 inline-flex/);
  expect(engine).toMatch(/type="checkbox"[\s\S]{0,160}className="w-6 h-6 accent-/);

  const aiCenter = readFileSync(join(SRC, "components/AiTrainingCenter.tsx"), "utf8");
  expect(aiCenter).toMatch(/className="min-h-6 -mx-1\.5 px-1\.5 rounded text-\[11px\] font-bold text-\[var\(--text-muted\)\]/);

  const tiktok = readFileSync(join(SRC, "components/TikTokApiAutomation.tsx"), "utf8");
  expect(tiktok).not.toMatch(/className="text-\[11px\] font-bold text-red-600 hover:text-red-700 flex/);
  expect(tiktok).not.toMatch(/className="text-\[11px\] font-bold text-\[var\(--accent-text\)\] hover:opacity-80 flex/);
});

test("Nút icon: padding phải đủ để vùng bấm đạt 24px", () => {
  // Quét cả repo thay vì liệt kê từng file: đo trên browser chỉ thấy nút ĐANG render — riêng M7 bỏ sót
  // 9 nút nằm trong modal/ngăn phải mở mới thấy (cửa sổ ca, ngăn ca trống, duyệt lương, xoá SKU...).
  // Sàn: bề rộng = cỡ icon + 2×padding ≥ 24. p-0.5 = 2px, p-1 = 4px, p-1.5 = 6px mỗi bên.
  const PAD: Record<string, number> = { "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10, "3": 12 };
  const ICON: Record<string, number> = { "3": 12, "3.5": 14, "4": 16, "5": 20, "6": 24 };
  // Cách định cỡ khác (py-, min-h-, h-…) hoặc class dựng từ biến `${...}` thì không suy ra được bề
  // cao từ mã nguồn — để lượt đo trên browser lo, ở đây bỏ qua để khỏi báo nhầm (vd MonthPicker
  // dùng hằng `box`/`iconBtn`).
  const OTHER_SIZE = /(?<![\w.-])(p|px|py|pt|pb|pl|pr|min-h|h|size)-(?!\[)[\w.]+/;
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/<button[\s\S]{0,900}?<\/button>/g)) {
      const el = m[0];
      const cls = el.match(/className="([^"]*)"/);
      if (!cls) continue;
      let body = el.slice(cls.index! + cls[0].length).trimStart();
      if (body.startsWith(">")) body = body.slice(1);
      const icon = body.match(/className="w-(3\.5|3|4|5|6) h-\1/);
      // Chỉ xét nút CHỈ có icon: nút có chữ thì bề cao do line-height + py quyết định, phải đo thật.
      const text = body.replace(/<[^>]*\/?>/g, "").replace("</button>", "").trim();
      if (!icon || text) continue;
      const pad = cls[1].match(/(?<![\w.-])p-(0\.5|1|1\.5|2|2\.5|3)(?![\w.])/);
      if (!pad && OTHER_SIZE.test(cls[1])) continue;
      const size = ICON[icon[1]] + 2 * (pad ? PAD[pad[1]] : 0);
      if (size < 24) hits.push(`${rel(file)} :: icon w-${icon[1]} + p-${pad ? pad[1] : "0"} = ${size}px`);
    }
  }
  expect(hits, hits.join("\n")).toEqual([]);
});

test("Bảng Vận Hành: không bày 4 ô 0 khi không có ca nào", () => {
  const src = readFileSync(join(SRC, "components/OpsBoard.tsx"), "utf8");
  // `summary` tính hoàn toàn từ `rows` (summary.total === rows.length) nên điều kiện này đúng bằng
  // "cả 4 ô đều 0" — không thể giấu nhầm hàng ô đang có số.
  expect(src).toMatch(/const summary = useMemo\(\(\) => \{\s*const ss = rows\.filter/);
  expect(src).toMatch(/total: rows\.length/);
  expect(src).toMatch(/\{rows\.length > 0 && \(\s*<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">/);
});

test("Report Tháng: cột tên chỉ số dính trái khi bảng cuộn ngang", () => {
  const src = readFileSync(join(SRC, "components/brand-workspace/MonthlyReportTabs.tsx"), "utf8");
  expect(src).toMatch(/\[&_td:first-child\]:sticky/);
  expect(src).toMatch(/\[&_th:first-child\]:sticky/);
  // Nền phải đặc, nếu không chữ cột sau lộ qua khi cuộn.
  expect(src).toMatch(/\[&_td:first-child\]:bg-\[#17171b\]/);
});
