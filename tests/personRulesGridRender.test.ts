// Màn "Luật đặt giờ từng người" (lưới): dựng thử với dữ liệu giả, không cần DB. Chạy: npx vitest run tests/personRulesGridRender.test.ts
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
const { PersonRulesGrid } = await import("../src/components/roster/PersonRulesGrid");
const { emptyMonthRule } = await import("../src/lib/roster/monthRules");
import type { MonthRules } from "../src/hooks/useMonthRules";
import type { MonthRule } from "../src/lib/roster/monthRules";
import type { Talent } from "../src/types";

const talents = [
  { id: "t1", name: "Trần Ngọc Bảo Thy", nickname: "B.Thy", role: "Host" },
  { id: "t2", name: "Lê Quang An", nickname: "Q.An", role: "Host" },
  { id: "t3", name: "Yến Nhi", nickname: "Nhi", role: "Assistant" }
] as Talent[];
const brands = [
  { id: "c", name: "CROCS", platforms: ["TikTok", "Shopee", "Website"] },
  { id: "v", name: "VERA", platforms: ["TikTok"] }
];
const noop = async () => {};
const mk = (rules: MonthRule[], over: Partial<MonthRules> = {}): MonthRules => ({
  month: "2026-12",
  rules,
  byKey: Object.fromEntries(rules.map((r) => [`${r.talentId}|${r.role}`, r])),
  forTalent: (id) => rules.filter((r) => r.talentId === id),
  backend: "db",
  locked: false,
  error: null,
  save: noop,
  remove: noop,
  replaceAll: noop,
  ...over
});
const base = { month: "2026-12", onMonth: () => {}, today: "2026-11-20", talents, brands, nameOf: (id: string) => talents.find((t) => t.id === id)?.nickname ?? id, autoCaps: {} };
const render = (rules: MonthRule[], over: Record<string, unknown> = {}, hook: Partial<MonthRules> = {}) => renderToStaticMarkup(createElement(PersonRulesGrid, { ...base, rules: mk(rules, hook), ...over }));

describe("PersonRulesGrid", () => {
  it("mọi host/trợ một dòng, mỗi brand một nhóm cột, không có cột cast", () => {
    const html = render([]);
    for (const n of ["B.Thy", "Q.An", "Nhi", "CROCS", "VERA", "Cả brand", "Website", "Trần tháng", "Nửa đầu", "Trần giờ vai", "Ca đêm", "Loại ngày"]) expect(html).toContain(n);
    expect(html).not.toMatch(/Cast/);
    expect(html).toContain("chưa có luật riêng"); // tháng mở mà chưa có luật nào ⇒ gợi ý chép từ tháng trước
  });
  it("luật đã đặt hiện đúng: trần, loại ngày, brand không nhận, ô sàn của brand đó gạch chéo", () => {
    const r: MonthRule = { ...emptyMonthRule("2026-12", "t1", "host"), maxHours: 60, dayKinds: ["weekend", "camp"], brands: { v: { hours: "x", days: null, night: null } } };
    const html = render([r]);
    expect(html).toContain("60h");
    expect(html).toContain("6-7-CN · Camp");
    expect(html).toContain("✕ không nhận");
    expect(html).toContain("≤60h/tháng"); // câu luật đọc được
  });
  it("người 2 vai vẫn một dòng: có dấu ▸, dòng trợ chưa mở", () => {
    const rules = [{ ...emptyMonthRule("2026-12", "t1", "host"), roleHours: 35 }, { ...emptyMonthRule("2026-12", "t1", "assistant"), roleHours: 15 }];
    const html = render(rules);
    expect(html).toContain("▸ B.Thy");
    expect(html).not.toContain("↳ B.Thy");
  });
  it("tháng đã qua tự khoá: banner khoá, không có nút dán/hoàn tác sửa", () => {
    const html = render([], { month: "2026-10" }, { month: "2026-10", locked: true });
    expect(html).toContain("tự khoá");
    expect(html).not.toContain("Dán từ sheet");
    expect(html).not.toContain("chưa có luật riêng");
  });
  it("chỉ xem (không quyền ghi): không có nút dán / gợi ý chép", () => {
    const html = render([], { readOnly: true });
    expect(html).not.toContain("Dán từ sheet");
    expect(html).not.toContain("chưa có luật riêng");
  });
  it("chưa chạy migration: banner chưa lưu chung; lỗi hiện ra", () => {
    expect(render([], {}, { backend: "local" })).toContain("Chưa lưu chung");
    expect(render([], {}, { error: "Tháng 2026-10 đã khoá" })).toContain("đã khoá");
  });
});
