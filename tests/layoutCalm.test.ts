// Canh đợt sắp lại bố cục 18/10 (user: "các màn hình đang quá rối mắt") — docs/WORKSPACE_HISTORY.md
// `## Sắp lại bố cục cho bớt rối (2026-10-18)`. Mỗi ca test giữ một luật đã đo là gây rối.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { agencyNavGroups, brandNavGroups } from "../src/lib/appNav";

const SRC = join(__dirname, "..", "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

test("đầu trang (PageHeader) không còn là một thẻ có viền/nền/bóng như khối nội dung", () => {
  const src = read("components/common/PageHeader.tsx");
  const body = src.slice(src.indexOf("export const PageHeader"));
  expect(body).toMatch(/<header className=\{`space-y-4/);
  expect(body).not.toMatch(/rounded-2xl|shadow-xl|bg-\[var\(--surface\)\]/);
});

test("5 màn từng tự vẽ thẻ tiêu đề nay dùng PageHeader (để chế độ Tất cả kênh không lặp tiêu đề mỗi sàn)", () => {
  for (const f of ["AgencyDashboard", "SessionLedger", "HostPerformance", "BrandsOverview", "MonthPlan"]) {
    expect(read(`components/${f}.tsx`), f).toMatch(/<PageHeader\b/);
  }
});

test("Tất cả kênh: tiêu đề trang vẽ một lần, từng khối sàn đi qua PlatformBlockContext", () => {
  const app = read("App.tsx");
  const fn = app.slice(app.indexOf("const perPlatformBlocks"), app.indexOf("const agencyBrands"));
  expect(fn).toMatch(/<PlatformBlockContext\.Provider value=\{\{ platform: p, first: i === 0 \}\}>/);
  // Không còn nhãn "Các kênh X" riêng của App (PageHeader trong khối tự vẽ đầu khối kèm nút của khối).
  expect(fn).not.toMatch(/<h2/);
});

test("thanh chọn sàn nằm trên thanh đầu (lg+), không còn là dải riêng trên tiêu đề trang", () => {
  const app = read("App.tsx");
  expect(app).toMatch(/scopeControl=\{channelBar\(false\)\}/);
  expect(app).toMatch(/\{channelBar\(true\) && <div className="lg:hidden">\{channelBar\(true\)\}<\/div>\}/);
  expect(read("components/Header.tsx")).toMatch(/\{scopeControl && <div className="hidden lg:flex/);
});

test("tab/bộ chọn đang chọn không tô nền accent đặc (accent đặc chỉ cho nút hành động chính)", () => {
  // MonthPicker: ô tháng đang chọn trong lịch bật ra; GlossaryDialog: hộp thoại riêng.
  const ALLOW = new Set(["components/common/MonthPicker.tsx", "components/GlossaryDialog.tsx"]);
  const hits: string[] = [];
  for (const file of sourceFiles(join(SRC, "components"))) {
    const rel = file.split("/src/")[1];
    if (ALLOW.has(rel)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/\? "bg-\[var\(--accent\)\] text-(white|\[var\(--accent-contrast\)\])/.test(line)) hits.push(`${rel}:${i + 1}`);
      });
  }
  expect(hits).toEqual([]);
  expect(read("index.css")).toMatch(/\.seg-on \{/);
});

test("sidebar: không nhóm có tiêu đề nào chỉ một mục (9 nhóm/19 mục trước 18/10)", () => {
  for (const role of ["ceo", "admin"] as const) {
    const single = agencyNavGroups(role).filter((g) => g.label && g.items.length < 2).map((g) => g.label);
    expect(single, role).toEqual([]);
  }
  // Brand: tách 3 nhóm theo việc thay vì một nhóm "Brand Workspace" 10 mục; role brand không thấy nhóm nhập số liệu.
  expect(brandNavGroups("ceo").filter((g) => g.items.length > 0)).toHaveLength(3);
  expect(brandNavGroups("brand").filter((g) => g.items.length > 0)).toHaveLength(2);
  // Mục nào cũng còn (chỉ đổi nhóm, không mất màn).
  expect(brandNavGroups("ceo").flatMap((g) => g.items.map((i) => i.id))).toHaveLength(10);
});

test("lịch tháng của brand và lưới Kế Hoạch Tháng bắt đầu Thứ 2 như Lịch & Studio / Điều Phối Lịch Live", () => {
  expect(read("components/brand-workspace/BrandCalendar.tsx")).toMatch(/const WEEKDAY_LABELS = \["T2", "T3", "T4", "T5", "T6", "T7", "CN"\];/);
  expect(read("components/brand-workspace/BrandCalendar.tsx")).toMatch(/const leadingBlanks = \(firstDay\.getDay\(\) \+ 6\) % 7;/);
  // 27/10: lưới tách sang components/monthplan/PlanMonthGrid.tsx (thêm cột "Tuần" sau CN).
  expect(read("components/monthplan/PlanMonthGrid.tsx")).toMatch(/const WEEKDAY_LABELS = \["T2", "T3", "T4", "T5", "T6", "T7", "CN"\];/);
  expect(read("components/MonthPlan.tsx")).toMatch(/const leading = \(new Date\(`\$\{days\[0\]\}T00:00:00`\)\.getDay\(\) \+ 6\) % 7;/);
});

test("Sổ Ca: ca của những ngày sau hôm nay gập lại khi còn ca đã/đang chạy trong bộ lọc", () => {
  const src = read("components/SessionLedger.tsx");
  expect(src).toMatch(/const upcomingDays = pastDays\.length > 0 \? days\.filter\(\(d\) => d\.date > today\) : \[\];/);
  expect(src).toMatch(/\{shownDays\.map\(\(day\) => \(/);
  // Bước còn thiếu chỉ hiện một lần (ô tô vàng), không thêm dòng chữ lặp lại.
  expect(src).not.toMatch(/missing\.map\(\(m\) => MISSING_LABEL\[m\]\)\.join/);
});

// ---- Đợt 2 (18–19/10): ô KPI chung, mốc "Số đủ tới" một chỗ, Report Tháng bớt lồng hộp, AI Training gập giải thích ----

test("ô KPI: một component chung StatTile, nhãn chữ thường (trước: ~15 bản tự vẽ, nhãn VIẾT HOA giãn chữ)", () => {
  const tile = read("components/common/StatTile.tsx");
  expect(tile).toMatch(/export const STAT_LABEL_SHAPE = "text-xs font-medium leading-snug";/);
  expect(tile).not.toMatch(/uppercase|tracking-wide/);
  // Các bản tự vẽ cũ đã bỏ — màn dùng StatTile (hoặc bọc mỏng quanh nó).
  const OLD: [string, RegExp][] = [
    ["components/SessionLedger.tsx", /const Stat: React\.FC/],
    ["components/OpsBoard.tsx", /const Stat: React\.FC/],
    ["components/dashboard/period/brandBelow.tsx", /const Stat: React\.FC/]
  ];
  for (const [f, re] of OLD) {
    const src = read(f);
    expect(src, f).not.toMatch(re);
    expect(src, f).toMatch(/<StatTile\b/);
  }
  for (const f of ["components/dashboard/period/PlatformTab.tsx", "components/dashboard/period/brandBelow.tsx", "components/brand-workspace/BrandWeeklyReport.tsx", "components/BrandRateCard.tsx", "components/brand-workspace/BrandCommitmentView.tsx", "components/brand-workspace/ShopeeAdsPanel.tsx", "components/ForecastTrainingCard.tsx"]) {
    expect(read(f), f).toMatch(/<StatTile\b/);
  }
});

test("không còn chữ viết hoa bằng CSS ở các màn có ô KPI, Dashboard, Report Tháng và AI Training", () => {
  const FILES = [
    "components/SessionLedger.tsx", "components/OpsBoard.tsx", "components/OpsSupport.tsx",
    "components/AgencyDashboard.tsx", "components/BrandRateCard.tsx", "components/dashboard/period/BrandTab.tsx", "components/dashboard/period/brandExtras.tsx",
    "components/brand-workspace/BrandDashboard.tsx", "components/brand-workspace/BrandWeeklyReport.tsx",
    "components/brand-workspace/BrandCommitmentView.tsx", "components/brand-workspace/ShopeeAdsPanel.tsx",
    "components/brand-workspace/MonthlyReportTabs.tsx", "components/brand-workspace/report/ui.tsx",
    "components/brand-workspace/report/HostPerformancePanel.tsx",
    "components/AiTrainingCenter.tsx", "components/EngineTrainingPanel.tsx", "components/ForecastTrainingCard.tsx", "components/AllocationTrainingCard.tsx",
    ...["components/dashboard", "components/dashboard/period"].flatMap((d) => readdirSync(join(SRC, d), { withFileTypes: true }).filter((f) => f.isFile()).map((f) => `${d}/${f.name}`))
  ];
  const hits = FILES.filter((f) => /\buppercase\b|toUpperCase\(\)/.test(read(f)));
  expect(hits).toEqual([]);
});

test("chữ viết hoa bằng CSS toàn app: chỉ còn chỗ nhận diện cố ý (108 chỗ trước 19/10 → 14)", () => {
  // Đợt 19/10 dọn nốt 47 chỗ ở màn chưa dọn: tiêu đề mục Cửa sổ ca, tiêu đề bảng (Toàn Cảnh Brand, Phát hành Report, Finance,
  // Kế Hoạch Tháng…), Lịch & Studio, ô scheme KM, nhãn form, Phân quyền, Điều Phối Lịch Live, màn talent. Màn mới đừng thêm `uppercase`;
  // chỗ nào thật sự cần thì thêm vào đây kèm lý do.
  const KEEP: Record<string, [number, string]> = {
    "components/Login.tsx": [1, "khẩu hiệu \"Agency Operating System\" dưới logo"],
    "components/AppSidebar.tsx": [2, "khẩu hiệu dưới logo + chữ cái đầu ở avatar"],
    "components/UserRoleSettings.tsx": [6, "mã role (ADMIN, CEO…) đọc như huy hiệu + chữ cái đầu ở avatar"],
    "App.tsx": [1, "mã role trong thông báo thiếu quyền, cùng dáng huy hiệu role"],
    "components/ui/CampaignDayRibbon.tsx": [3, "dải camp D-Day / Mid-Month / Pay Day trên lịch"],
    "components/LiveCalendar.tsx": [1, "chú giải brand = nhãn brand trên thẻ ca (.sc-bname)"]
  };
  const found: Record<string, number> = {};
  for (const file of sourceFiles(SRC)) {
    const n = (readFileSync(file, "utf8").match(/\buppercase\b/g) ?? []).length;
    if (n > 0) found[file.split("/src/")[1]] = n;
  }
  expect(found).toEqual(Object.fromEntries(Object.entries(KEEP).map(([f, [n]]) => [f, n])));
  // Màn đã dọn 19/10 cũng không còn chữ giãn rộng đi kèm kiểu viết hoa cũ (viên chữ có sẵn như "HÔM NAY" giữ `tracking-wide`).
  const CLEANED = [
    "SessionWindow", "SessionRoomCase", "HostChangeReports", "SessionPlanVsActual", "BrandsOverview",
    "FinanceHr", "TabUsagePanel", "MonthPlan", "brand-workspace/BrandNextMonthPlan", "scheduling/TalentLoadTimeline",
    "scheduling/SlotDetailModal", "ui/PosterCalendarGrid", "StudioEquipment", "brand-workspace/SchemeWeekStrip",
    "brand-workspace/SchemeDayPanel", "roster/ShiftPanel", "AccountSettings", "MyTalentProfile", "Header", "ResetPasswordScreen",
    "talent/TalentAgency", "talent/TalentToday"
  ];
  expect(CLEANED.filter((f) => /tracking-wider|tracking-widest/.test(read(`components/${f}.tsx`)))).toEqual([]);
});

test("Dashboard: mốc \"Dữ liệu đầy đủ đến\" nói MỘT chỗ (bỏ viên ở đầu trang lặp đúng dải/dòng ngay dưới)", () => {
  // Agency (22/10): dòng trạng thái dưới thanh chọn kỳ — các tab không lặp lại. 24/10: tab Tổng quan account có dòng riêng (mọi sàn).
  expect(read("components/AgencyDashboard.tsx").match(/Dữ liệu đầy đủ đến/g)).toHaveLength(2);
  for (const f of ["PlatformTab", "BrandTab", "brandBelow", "opsBlocks", "OverviewTab"]) expect(read(`components/dashboard/period/${f}.tsx`), f).not.toMatch(/Dữ liệu đầy đủ đến|Số đủ tới/);
  // Workspace brand (ops) = chính tab Brand (23/10) — không có dòng riêng.
  expect(read("components/brand-workspace/BrandDashboard.tsx")).not.toMatch(/Dữ liệu đầy đủ đến|Số đủ tới/);
});

test("Report Tháng: khung ngoài không viền, ô số trong Panel không khung, khối gập không bọc hộp", () => {
  const src = read("components/brand-workspace/MonthlyReportTabs.tsx");
  expect(src).toMatch(/<div className="rounded-2xl" style=\{\{ background: PAL\.bg \}\}>/);
  expect(src).not.toMatch(/<details className="rounded-xl"/);
  // 4 ô Nhịp bán + 4 ô Ads + 5 ô Phân bố GMV/giờ nằm trong Panel ⇒ frame="plain".
  expect(src.match(/<KpiTile (key=\{label\} )?frame="plain"/g)).toHaveLength(9);
  const ui = read("components/brand-workspace/report/ui.tsx");
  expect(ui).toMatch(/export const MethodNote: React\.FC/);
  expect(ui).toMatch(/className=\{STAT_LABEL_SHAPE\}/);
});

test("AI Training: giải thích từng tham số ẩn mặc định, đoạn cách tính dài gập lại", async () => {
  const eng = read("components/EngineTrainingPanel.tsx");
  expect(eng).toMatch(/const \[showHelp, setShowHelp\] = useState\(false\);/);
  expect(eng).toMatch(/\{showHelp && m\.help && /);
  expect(eng).toMatch(/title=\{m\.help\}/);
  // Thẻ chia target vẽ ra HTML: đoạn công thức + cách đọc bảng nằm trong <details>, không bày sẵn.
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AllocationTrainingCard } = await import("../src/components/AllocationTrainingCard");
  const { DEFAULT_ENGINE_PARAMS } = await import("../src/lib/scheduling/engineParams");
  const html = renderToStaticMarkup(React.createElement(AllocationTrainingCard, { brandId: "x", sessions: [], params: DEFAULT_ENGINE_PARAMS, today: "2026-10-09" }));
  expect(html).toMatch(/<details[^>]*><summary[^>]*>Engine chia target thế nào<\/summary><div[^>]*><p>Target ca = Target tháng/);
});

test("StatTile vẽ nhãn chữ thường, tooltip công thức theo tên chỉ số, bỏ dòng số khi không có", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { StatTile } = await import("../src/components/common/StatTile");
  const { METRIC, metricHint } = await import("../src/lib/metricGlossary");
  const html = renderToStaticMarkup(React.createElement(StatTile, { label: METRIC.gmvPerHour, value: "19,9M", hint: "so cùng kỳ" }));
  expect(html).toContain(`title="${metricHint(METRIC.gmvPerHour)}"`);
  expect(html).toContain("19,9M");
  expect(html).not.toMatch(/uppercase/);
  const onlyChildren = renderToStaticMarkup(React.createElement(StatTile, { label: "Nguồn số liệu", title: "" }, "3 đã đối soát"));
  expect(onlyChildren).not.toMatch(/font-black/);
  expect(onlyChildren).toContain("3 đã đối soát");
});

// ── Đợt 3 (19/10): cửa sổ ca, cửa sổ chốt người, lịch tháng brand, lưới Điều Phối Lịch Live ───────────────────────────────────

test("Lịch Vận Hành brand: đầu trang PageHeader, danh sách ca dưới lưới tháng gập lại, ô ngày không viền", () => {
  const cal = read("components/brand-workspace/BrandCalendar.tsx");
  expect(cal).toMatch(/<PageHeader\s+icon=\{CalendarIcon\}\s+title="Lịch Vận Hành"/);
  // Trước: lưới tháng + bên dưới in lại đủ 90 ca theo ngày (trang 8.300px).
  expect(cal).toMatch(/<details className="group[^"]*">\s*<summary[^>]*>[\s\S]{0,200}Danh sách ca theo ngày/);
  expect(cal).not.toMatch(/sự kiện`/);
  const grid = read("components/ui/PosterCalendarGrid.tsx");
  expect(grid).not.toMatch(/PosterCalendarHeader/);
  expect(grid).toMatch(/bg-\[var\(--surface-base\)\]\/60 border-transparent/);
});

test("Cửa sổ ca: chỉ số trong MỘT khung (không hộp từng ô); Lượt live & ca nối không lặp tiêu đề trong Giao ca", () => {
  const sw = read("components/SessionWindow.tsx");
  const kv = sw.slice(sw.indexOf("const KV: React.FC"));
  expect(kv.slice(0, 300)).not.toMatch(/border|rounded/);
  expect((sw.match(/className=\{KV_GRID\}/g) ?? []).length).toBe(3);
  expect(read("components/FileHandover.tsx")).toMatch(/<SessionRoomCase [^>]*\bembedded\b/);
  expect(read("components/SessionRoomCase.tsx")).toMatch(/embedded \? \(\s*<div className="space-y-2">\{body\}<\/div>/);
});

test("Điều Phối Lịch Live: thẻ ca chỉ còn vạch màu bên trái, nút + ca không viền", () => {
  const p = read("components/roster/panels.tsx");
  const grid = p.slice(p.indexOf("export const WeekGrid"), p.indexOf("// ---------------- ", p.indexOf("export const WeekGrid") + 10));
  expect(grid).not.toMatch(/rounded-lg border border-\[var\(--border\)\] border-l-\[3px\]/);
  expect(grid).not.toMatch(/border-dashed border-\[var\(--border\)\] py-1/);
});

test("cửa sổ chốt người: ngày + giờ là tiêu đề (dd/mm, không ISO), ô chọn có nhãn, một nút đóng", async () => {
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { ToastProvider } = await import("../src/hooks/useToast");
  const { ConfirmProvider } = await import("../src/hooks/useConfirm");
  const { SlotDetailModal } = await import("../src/components/scheduling/SlotDetailModal");
  const slot = { id: "s1", date: "2026-10-20", startTime: "11:00:00", endTime: "14:00:00", brandId: "b1", brandName: "CROCS", platform: "TikTok", studioName: "CROCS Room 203", notes: "", status: "open" };
  const html = renderToStaticMarkup(
    React.createElement(ToastProvider, null,
      React.createElement(ConfirmProvider, null,
        React.createElement(SlotDetailModal, {
          slot, onClose: () => {}, talents: [{ id: "t1", name: "Huỳnh Tấn Khanh" }], registrations: [{ id: "r1", slotId: "s1", talentId: "t1" }],
          sessions: [], shiftSlots: [slot], canManage: true, onFinalizeSlot: async () => {}
        } as never)))
  );
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  expect(text).toContain("T3 20/10 · 11:00–14:00");
  expect(text).not.toContain("2026-10-20");
  expect(text).not.toContain("Ca Chờ Đăng Ký");
  expect(text).toMatch(/Host Chọn host…/);
  expect(text).toMatch(/Trợ live \(tuỳ chọn\) Không có trợ live/);
  expect(html.match(/aria-label="Đóng"/g)).toHaveLength(1);
});
