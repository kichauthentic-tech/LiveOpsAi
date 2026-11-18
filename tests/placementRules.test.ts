import { describe, expect, it } from "vitest";
import { describeRule, dayKindsOf, parseRuleText, ruleFit, type PersonRule } from "../src/lib/roster/placementRules";

const brands = [
  { id: "v", name: "VERA" },
  { id: "j", name: "JOCKEY" },
  { id: "c", name: "CROCS" },
  { id: "f", name: "FRANKLIN" }
];

describe("parseRuleText — các kiểu ghi trong sheet TỶ LỆ LỊCH", () => {
  it("(6-7-CN, camp) = cuối tuần + Campaign, mọi brand", () => {
    const r = parseRuleText("30h /tháng (6-7-CN, camp)", brands);
    expect(r.clauses).toEqual([{ days: ["weekend", "camp"] }]);
    expect(r.night).toBe(false);
    expect(r.unknown).toEqual([]);
  });
  it("(JK camp, daily crocs) = Jockey chỉ Campaign, Crocs chỉ ngày thường", () => {
    const r = parseRuleText("80h/tháng (JK camp, daily crocs)", brands);
    expect(r.clauses).toEqual([
      { brandId: "j", days: ["camp"] },
      { brandId: "c", days: ["regular"] }
    ]);
  });
  it("daily FL + JK: brand đứng sau thừa hưởng loại ngày trước", () => {
    const r = parseRuleText("20h /tháng daily FL + JK", brands);
    expect(r.clauses).toEqual([
      { brandId: "f", days: ["regular"] },
      { brandId: "j", days: ["regular"] }
    ]);
  });
  it("(daily) JK, (daily) crocs, camp một mình, ca đêm, chỉ có giờ", () => {
    expect(parseRuleText("20h /tháng (daily) JK", brands).clauses).toEqual([{ brandId: "j", days: ["regular"] }]);
    expect(parseRuleText("40h /tháng (daily) crocs", brands).clauses).toEqual([{ brandId: "c", days: ["regular"] }]);
    expect(parseRuleText("20h/tháng camp", brands).clauses).toEqual([{ days: ["camp"] }]);
    const n = parseRuleText("40h/tháng (ca đêm)", brands);
    expect(n.night).toBe(true);
    expect(n.clauses).toEqual([]);
    const none = parseRuleText("35-40h/tháng", brands);
    expect(none.clauses).toEqual([]);
    expect(none.night).toBe(false);
    expect(parseRuleText("35/tháng", brands).clauses).toEqual([]);
  });
  it("chữ lạ được báo lại, không đoán", () => {
    expect(parseRuleText("30h/tháng (xyz)", brands).unknown).toEqual(["xyz"]);
  });
});

describe("ruleFit", () => {
  // 2026-11-13 = thứ 6 + Mid-Month (Campaign); 2026-11-03 = thứ 3 thường; 2026-11-21 = thứ 7 thường
  it("loại ngày", () => {
    expect([...dayKindsOf("2026-11-13")].sort()).toEqual(["camp", "weekend"]);
    expect([...dayKindsOf("2026-11-03")]).toEqual(["regular"]);
    expect([...dayKindsOf("2026-11-21")].sort()).toEqual(["regular", "weekend"]);
  });
  const weekendCamp: PersonRule = { talentId: "t", clauses: [{ days: ["weekend", "camp"] }], night: false };
  it("6-7-CN + camp: nhận thứ 7 và ngày camp, không nhận thứ 3 thường", () => {
    expect(ruleFit(weekendCamp, { date: "2026-11-21", brandId: "v", night: false }).ok).toBe(true);
    expect(ruleFit(weekendCamp, { date: "2026-11-13", brandId: "v", night: false }).ok).toBe(true);
    expect(ruleFit(weekendCamp, { date: "2026-11-03", brandId: "v", night: false }).ok).toBe(false);
  });
  it("theo brand: JK camp, daily crocs", () => {
    const r: PersonRule = { talentId: "t", clauses: [{ brandId: "j", days: ["camp"] }, { brandId: "c", days: ["regular"] }], night: false };
    expect(ruleFit(r, { date: "2026-11-13", brandId: "j", night: false }).ok).toBe(true);
    expect(ruleFit(r, { date: "2026-11-03", brandId: "j", night: false }).ok).toBe(false);
    expect(ruleFit(r, { date: "2026-11-03", brandId: "c", night: false }).ok).toBe(true);
    expect(ruleFit(r, { date: "2026-11-03", brandId: "v", night: false }).ok).toBe(false);
  });
  it("ca đêm + không luật", () => {
    const r: PersonRule = { talentId: "t", clauses: [], night: true };
    expect(ruleFit(r, { date: "2026-11-03", brandId: "v", night: false }).ok).toBe(false);
    expect(ruleFit(r, { date: "2026-11-03", brandId: "v", night: true }).ok).toBe(true);
    expect(ruleFit(undefined, { date: "2026-11-03", brandId: "v", night: false }).ok).toBe(true);
    expect(ruleFit({ talentId: "t", clauses: [], night: false }, { date: "2026-11-03", brandId: "v", night: false }).ok).toBe(true);
  });
  it("describeRule đọc được", () => {
    const r: PersonRule = { talentId: "t", clauses: [{ days: ["weekend", "camp"] }, { brandId: "j", days: ["regular"] }], night: true };
    expect(describeRule(r, (id) => brands.find((b) => b.id === id)!.name)).toBe("Thứ 6-7-CN + Campaign · JOCKEY: Ngày thường · chỉ ca đêm");
  });
});
