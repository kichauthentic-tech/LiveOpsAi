// Lưới "Luật đặt giờ từng người": dựng dòng/cột, hiển thị ô, đọc chữ gõ/dán. Chạy: npx vitest run tests/rulesGrid.test.ts
import { describe, expect, it } from "vitest";
import { applyCellText, buildGridCols, buildGridRows, canDoPlatform, cellText, cellView, clearCellRule, parseDays, parseNight, visibleCols, type GridBrand, type GridCtx } from "../src/lib/roster/rulesGrid";
import { emptyMonthRule, type MonthRule } from "../src/lib/roster/monthRules";

const M = "2026-12";
const brands: GridBrand[] = [
  { id: "c", name: "CROCS", platforms: ["TikTok", "Shopee", "Website"] },
  { id: "v", name: "VERA", platforms: ["TikTok"] }
];
const cols = buildGridCols(brands);
const col = (id: string) => cols.find((c) => c.id === id)!;
const talents = [
  { id: "t1", role: "Host" as const },
  { id: "t2", role: "Assistant" as const },
  { id: "t3", role: "Host" as const },
  { id: "tx", role: "Admin" as never }
];
const nameOf = (id: string) => ({ t1: "Thịnh", t2: "An", t3: "Mia", tx: "Khác" })[id] ?? id;
const rule = (id: string, role: "host" | "assistant", o: Partial<MonthRule> = {}): MonthRule => ({ ...emptyMonthRule(M, id, role), ...o });
const ctxFor = (rules: MonthRule[], locked = false): GridCtx => ({ brandName: (i) => brands.find((b) => b.id === i)?.name ?? i, brandIds: brands.map((b) => b.id), siblings: (id) => rules.filter((r) => r.talentId === id), locked });

describe("dựng dòng", () => {
  it("mọi host/trợ một dòng, sắp theo tên; người không phải host/trợ không có dòng", () => {
    const rows = buildGridRows(talents, [], M, nameOf, {});
    expect(rows.map((r) => r.name)).toEqual(["An", "Mia", "Thịnh"]);
    expect(rows.every((r) => !r.stored && !r.dual)).toBe(true);
  });
  it("người có luật vai còn lại thêm dòng thứ hai ngay dưới, chung một người", () => {
    const rules = [rule("t1", "assistant", { roleHours: 15 }), rule("t1", "host", { roleHours: 35 })];
    const rows = buildGridRows(talents, rules, M, nameOf, { t1: { monthMax: 50, avg: 48 } });
    const t = rows.filter((r) => r.talentId === "t1");
    expect(t.map((r) => r.role)).toEqual(["host", "assistant"]);
    expect(t.every((r) => r.dual)).toBe(true);
    expect(t[0].primary).toBe(true);
    expect(t[1].primary).toBe(false);
    expect(t[0].autoMax).toBe(50);
  });
  it("luật của người không còn trong danh sách vẫn hiện, không mất dữ liệu", () => {
    const rows = buildGridRows(talents, [rule("gone", "host", { maxHours: 20 })], M, nameOf, {});
    expect(rows.some((r) => r.talentId === "gone" && r.stored)).toBe(true);
  });
});

describe("cột", () => {
  it("mỗi brand một nhóm: Cả brand + từng sàn của brand", () => {
    expect(cols.filter((c) => c.brandId === "c").map((c) => c.label)).toEqual(["Cả brand", "TikTok", "Shopee", "Website"]);
    expect(cols.filter((c) => c.brandId === "v").map((c) => c.label)).toEqual(["Cả brand", "TikTok"]);
    expect(cols.some((c) => /cast/i.test(c.label))).toBe(false);
  });
  it("lọc brand / sàn / nhóm ẩn", () => {
    const f = { brand: "v", platform: "all", role: "all" as const, hidden: new Set<string>() };
    expect(visibleCols(cols, f).some((c) => c.brandId === "c")).toBe(false);
    expect(visibleCols(cols, { ...f, brand: "all", platform: "Shopee" }).filter((c) => c.kind === "lane").map((c) => c.platform)).toEqual(["Shopee"]);
    expect(visibleCols(cols, { ...f, brand: "all", hidden: new Set(["CROCS"]) }).some((c) => c.brandId === "c")).toBe(false);
  });
});

describe("hiển thị ô", () => {
  it("chưa đặt = chữ nghiêng 'tự suy'; đã đặt = manual; brand x làm các ô của brand gạch chéo", () => {
    const r = rule("t1", "host", { maxHours: 60, brands: { c: { hours: "x", days: null, night: null } } });
    const row = buildGridRows(talents, [r], M, nameOf, { t1: { monthMax: 50, avg: 48 } }).find((x) => x.talentId === "t1")!;
    const ctx = ctxFor([r]);
    expect(cellView(row, col("max"), ctx)).toMatchObject({ text: "60h", tone: "manual" });
    expect(cellView(row, col("half"), ctx)).toMatchObject({ text: "33h", tone: "auto" }); // 60 × 0,5 × 1,1
    expect(cellView(row, col("brand:c"), ctx)).toMatchObject({ text: "✕ không nhận", tone: "x" });
    expect(cellView(row, col("lane:c|TikTok"), ctx).tone).toBe("na");
    expect(cellView(row, col("brand:v"), ctx)).toMatchObject({ text: "✓ nhận", tone: "ok" });
    expect(cellView(row, col("lane:v|TikTok"), ctx)).toMatchObject({ text: "tự do", tone: "auto" });
  });
  it("tháng khoá: không ô nào sửa được", () => {
    const row = buildGridRows(talents, [], M, nameOf, {}).find((x) => x.talentId === "t1")!;
    const ctx = ctxFor([], true);
    expect(cols.filter((c) => cellView(row, c, ctx).editable)).toEqual([]);
  });
  it("người 2 vai chưa chia giờ: ô trần giờ vai báo 'chưa chia'; ô brand hiện tóm tắt", () => {
    const rules = [rule("t1", "host", { brands: { v: { hours: 45, days: ["camp"], night: null } } }), rule("t1", "assistant")];
    const rows = buildGridRows(talents, rules, M, nameOf, {});
    const host = rows.find((r) => r.key === "t1|host")!;
    const ctx = ctxFor(rules);
    expect(cellView(host, col("roleHours"), ctx)).toMatchObject({ text: "chưa chia", tone: "bad" });
    expect(cellView(host, col("brand:v"), ctx).text).toBe("45h · Camp");
    expect(cellView(rows.find((r) => r.key === "t1|assistant")!, col("name"), ctx).text).toBe("↳ Thịnh");
  });
});

describe("đọc chữ gõ / dán", () => {
  const base = rule("t1", "host");
  it("số giờ: trần tháng, nửa đầu, trần vai; sai thì từ chối", () => {
    expect(applyCellText(base, col("max"), "60h")!.maxHours).toBe(60);
    expect(applyCellText(base, col("max"), "abc")).toBeNull();
    expect(applyCellText(base, col("max"), "0")).toBeNull();
    expect(applyCellText({ ...base, maxHours: 60 }, col("max"), "")!.maxHours).toBeNull();
    expect(applyCellText(base, col("half"), "30")!.firstHalfMax).toBe(30);
    expect(applyCellText(base, col("roleHours"), "35")!.roleHours).toBe(35);
  });
  it("loại ngày và ca đêm", () => {
    expect(parseDays("6-7-CN, camp")).toEqual(["weekend", "camp"]);
    expect(parseDays("daily")).toEqual(["regular"]);
    expect(parseNight("Chỉ đêm")).toBe("only");
    expect(parseNight("không đêm")).toBe("no");
    expect(parseNight("không đặt")).toBe("any");
    expect(applyCellText(base, col("days"), "camp + 6-7-CN")!.dayKinds).toEqual(["weekend", "camp"]);
    expect(applyCellText(base, col("night"), "chỉ đêm")!.night).toBe("only");
  });
  it("ô Cả brand: x / giờ / ngày riêng / xoá; ô sàn: số / x / tự do", () => {
    expect(applyCellText(base, col("brand:c"), "x")!.brands.c.hours).toBe("x");
    const b = applyCellText(base, col("brand:c"), "45 camp")!.brands.c;
    expect(b.hours).toBe(45);
    expect(b.days).toEqual(["camp"]);
    expect(applyCellText(applyCellText(base, col("brand:c"), "x")!, col("brand:c"), "✓")!.brands.c).toBeUndefined();
    expect(applyCellText(base, col("lane:c|Shopee"), "20")!.lanes["c|Shopee"]).toBe(20);
    expect(applyCellText(base, col("lane:c|Shopee"), "x")!.lanes["c|Shopee"]).toBe("x");
    expect(applyCellText({ ...base, lanes: { "c|Shopee": 20 } }, col("lane:c|Shopee"), "tự do")!.lanes["c|Shopee"]).toBeUndefined();
  });
  it("không sửa bản gốc, cột chỉ-đọc trả null, Del xoá về mặc định", () => {
    const orig = rule("t1", "host", { maxHours: 40 });
    const out = applyCellText(orig, col("max"), "50")!;
    expect(orig.maxHours).toBe(40);
    expect(out.maxHours).toBe(50);
    expect(applyCellText(orig, col("avg"), "10")).toBeNull();
    expect(clearCellRule(orig, col("max"))!.maxHours).toBeNull();
    expect(clearCellRule(rule("t1", "host", { night: "only" }), col("night"))!.night).toBe("any");
  });
  it("chép ô ra chữ rồi dán lại không đổi luật (vòng tròn)", () => {
    const r = rule("t1", "host", { maxHours: 60, dayKinds: ["weekend"], night: "no", brands: { c: { hours: 45, days: ["camp"], night: null } }, lanes: { "c|TikTok": 30 } });
    const row = buildGridRows(talents, [r], M, nameOf, {}).find((x) => x.talentId === "t1")!;
    const ctx = ctxFor([r]);
    let out = rule("t1", "host");
    for (const id of ["max", "days", "night", "brand:c", "lane:c|TikTok"]) out = applyCellText(out, col(id), cellText(row, col(id), ctx))!;
    expect(out).toMatchObject({ maxHours: 60, dayKinds: ["weekend"], night: "no" });
    expect(out.brands.c).toMatchObject({ hours: 45, days: ["camp"] });
    expect(out.lanes["c|TikTok"]).toBe(30);
  });
});

describe("lọc sàn", () => {
  it("người bị x ở mọi làn của sàn thì không còn làm được sàn đó", () => {
    const r = rule("t1", "host", { lanes: { "c|Shopee": "x" } });
    expect(canDoPlatform(r, brands, "Shopee")).toBe(false);
    expect(canDoPlatform(r, brands, "TikTok")).toBe(true);
    expect(canDoPlatform(rule("t1", "host", { brands: { c: { hours: "x", days: null, night: null } } }), brands, "Website")).toBe(false);
  });
});
