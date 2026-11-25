// Lưới "Luật đặt giờ từng người": dựng dòng/cột, hiển thị ô, đọc chữ gõ/dán. Chạy: npx vitest run tests/rulesGrid.test.ts
import { describe, expect, it } from "vitest";
import { applyCellText, buildGridCols, buildGridRows, canDoPlatform, cellText, cellView, checkOf, clearCellRule, dualTalents, parseDays, parseNight, prevMonthRoleHours, roleBlock, visibleCols, type GridBrand, type GridCtx, type RoleKindFn } from "../src/lib/roster/rulesGrid";
import type { LiveSession } from "../src/types";
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
  it("người 2 vai chưa chia giờ: ô trần giờ vai ghi 'không chia' (không báo lỗi); ô brand hiện tóm tắt", () => {
    const rules = [rule("t1", "host", { brands: { v: { hours: 45, days: ["camp"], night: null } } }), rule("t1", "assistant")];
    const rows = buildGridRows(talents, rules, M, nameOf, {});
    const host = rows.find((r) => r.key === "t1|host")!;
    const ctx = ctxFor(rules);
    expect(cellView(host, col("roleHours"), ctx)).toMatchObject({ text: "không chia", tone: "auto" });
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

describe("người làm 2 vai (trần theo brand × sàn × vai)", () => {
  // t1 (Host) cả hai ở VERA TikTok; t2 (Trợ) chỉ trợ ở CROCS TikTok; t3 host ở CROCS TikTok nhưng chỉ trợ ở CROCS Shopee.
  const kinds: Record<string, "host" | "assistant" | "both"> = { "v|TikTok|t1": "both", "c|TikTok|t2": "assistant", "c|TikTok|t3": "host", "c|Shopee|t3": "assistant" };
  const roleKind: RoleKindFn = (b, p, t) => kinds[`${b}|${p}|${t}`];
  const ses = (date: string, hostId: string, coHostId: string, o: Partial<LiveSession> = {}) => ({ date, status: "Completed", hostId, coHostId, brandId: "c", platform: "TikTok", startTime: "19:00", endTime: "22:00", ...o }) as LiveSession;

  it("tự nhận ra người 2 vai: từ hồ sơ vai ('Cả hai' hoặc host kênh này / trợ kênh kia) hoặc ≥3 ca mỗi vai trong 2 tháng trước", () => {
    const fromProfile = dualTalents(["t1", "t2", "t3"], brands, roleKind, [], M);
    expect([...fromProfile].sort()).toEqual(["t1", "t3"]);
    const hist = [1, 2, 3].flatMap((d) => [ses(`2026-11-0${d}`, "t2", "x"), ses(`2026-10-1${d}`, "x", "t2")]);
    expect(dualTalents(["t2"], brands, undefined, hist, M).has("t2")).toBe(true);
    expect(dualTalents(["t2"], brands, undefined, hist.slice(0, 5), M).has("t2")).toBe(false); // chỉ 2 ca trợ
    expect(dualTalents(["t2"], brands, undefined, hist.map((h) => ({ ...h, date: "2026-08-01" })), M).has("t2")).toBe(false); // quá 2 tháng
  });

  it("người 2 vai luôn có 2 dòng; dòng chưa lưu mượn trần tháng + nửa đầu của dòng đã lưu", () => {
    const rules = [rule("t2", "assistant", { maxHours: 60, firstHalfMax: 30 })];
    const rows = buildGridRows(talents, rules, M, nameOf, {}, new Set(["t2"]));
    const t = rows.filter((r) => r.talentId === "t2");
    expect(t.map((r) => [r.role, r.stored])).toEqual([["assistant", true], ["host", false]]);
    expect(t[1].rule.maxHours).toBe(60);
    expect(t[1].rule.firstHalfMax).toBe(30);
    expect(t.every((r) => r.dual)).toBe(true);
  });

  it("ô làn bị hồ sơ chặn vai này ⇒ gạch 'chỉ Host / chỉ Trợ', không sửa được; kênh 'Cả hai' / chưa cài vẫn nhập được", () => {
    const rows = buildGridRows(talents, [], M, nameOf, {}, new Set(["t3"]));
    const host = rows.find((r) => r.key === "t3|host")!;
    const asst = rows.find((r) => r.key === "t3|assistant")!;
    const ctx = { ...ctxFor([]), roleKind, brandPlatforms: (id: string) => brands.find((b) => b.id === id)!.platforms };
    expect(cellView(host, col("lane:c|Shopee"), ctx)).toMatchObject({ text: "chỉ Trợ", tone: "na", editable: false });
    expect(cellView(asst, col("lane:c|TikTok"), ctx)).toMatchObject({ text: "chỉ Host", editable: false });
    expect(cellView(host, col("lane:c|TikTok"), ctx).editable).toBe(true);
    expect(cellView(host, col("lane:c|Website"), ctx).editable).toBe(true); // chưa cài
    expect(roleBlock(host, col("brand:c"), ctx)).toBeNull(); // còn TikTok
    const t2 = buildGridRows(talents, [], M, nameOf, {}).find((r) => r.key === "t2|assistant")!;
    expect(roleBlock({ ...t2, role: "host" }, col("lane:c|TikTok"), ctx)).toBe("chỉ Trợ");
    const onlyAsst: RoleKindFn = (b, _p, t) => (b === "v" && t === "t1" ? "assistant" : undefined);
    const t1 = buildGridRows(talents, [], M, nameOf, {}).find((r) => r.key === "t1|host")!;
    expect(cellView(t1, col("brand:v"), { ...ctx, roleKind: onlyAsst }).text).toBe("chỉ Trợ"); // mọi sàn của VERA chặn Host
  });

  it("Kiểm báo ô đã có số mà hồ sơ nay chặn vai đó", () => {
    const r = rule("t3", "host", { lanes: { "c|Shopee": 10 } });
    const row = buildGridRows(talents, [r], M, nameOf, {}).find((x) => x.key === "t3|host")!;
    const c = checkOf(row, { ...ctxFor([r]), roleKind });
    expect(c.level).toBe("warn");
    expect(c.messages.join()).toMatch(/CROCS Shopee: hồ sơ chỉ cho Trợ/);
  });

  it("'So tháng trước': ô trống hiện giờ thực tháng trước của đúng vai; chép ô vẫn ra rỗng", () => {
    const hist = [ses("2026-11-03", "t1", "t2"), ses("2026-11-04", "t2", "t1", { platform: "Shopee" }), ses("2026-10-04", "t1", "t2")];
    const prev = prevMonthRoleHours(hist, M);
    expect(prev.month).toBe("2026-11");
    const rows = buildGridRows(talents, [], M, nameOf, {}, new Set(["t1"]));
    const ctx = { ...ctxFor([]), prev };
    const h = rows.find((r) => r.key === "t1|host")!;
    const a = rows.find((r) => r.key === "t1|assistant")!;
    expect(cellView(h, col("lane:c|TikTok"), ctx).text).toBe("tự do · T11 3h");
    expect(cellView(h, col("lane:c|Shopee"), ctx).text).toBe("tự do");
    expect(cellView(a, col("lane:c|Shopee"), ctx).text).toBe("tự do · T11 3h");
    expect(cellView(h, col("brand:c"), ctx).text).toBe("✓ nhận · T11 3h");
    expect(cellText(h, col("lane:c|TikTok"), ctx)).toBe("");
    expect(cellText(h, col("brand:c"), ctx)).toBe("");
  });
});
