import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { brandSlug, findBrandBySlug, parsePath, routeToPath, slugify } from "../src/lib/routes";
import { AGENCY_TAB_LABELS, BRAND_TAB_LABELS, TALENT_TAB_LABELS } from "../src/lib/tabLabels";

const brands = [
  { id: "b-crocs", name: "CROCS" },
  { id: "b-fr", name: "Franklin" }
];

test("agency: tab ↔ link hai chiều", () => {
  expect(routeToPath({ type: "agency" }, "sessions", brands)).toBe("/so-ca");
  expect(parsePath("/so-ca")).toEqual({ type: "agency", tab: "sessions" });
  expect(parsePath("/ke-hoach-thang/")).toEqual({ type: "agency", tab: "month_plan" });
});

test("brand: link theo tên brand, tab của brand workspace", () => {
  expect(routeToPath({ type: "brand", brandId: "b-crocs" }, "brand_monthly_report", brands)).toBe("/brand/crocs/report-thang");
  expect(parsePath("/brand/crocs/report-thang")).toEqual({ type: "brand", brandSlug: "crocs", tab: "brand_monthly_report" });
  expect(findBrandBySlug(brands, "crocs")?.id).toBe("b-crocs");
  // "so-ca" có ở cả hai workspace — phải ra đúng tab của từng bên.
  expect(parsePath("/brand/crocs/so-ca")?.tab).toBe("brand_sessions");
});

test("link lạ hoặc brand chưa nạp → null, không đoán", () => {
  expect(parsePath("/")).toBeNull();
  expect(parsePath("/khong-co")).toBeNull();
  expect(parsePath("/brand/crocs/khong-co")).toEqual({ type: "brand", brandSlug: "crocs", tab: null });
  expect(routeToPath({ type: "brand", brandId: "b-crocs" }, "brand_monthly_report", [])).toBeNull();
  expect(routeToPath({ type: "agency" }, "unknown_tab", brands)).toBeNull();
});

test("slug bỏ dấu tiếng Việt", () => {
  expect(slugify("Đồng Hồ Việt")).toBe("dong-ho-viet");
  expect(brandSlug({ id: "x", name: "  " })).toBe("x");
});

test("mọi tab trong menu App.tsx đều có link", () => {
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  const ids = [...app.matchAll(/\{ id: "([a-z_]+)", label:/g)].map((m) => m[1]);
  expect(ids.length).toBeGreaterThan(20);
  const missing = ids.filter(
    (id) => routeToPath({ type: "agency" }, id, brands) === null && routeToPath({ type: "brand", brandId: "b-crocs" }, id, brands) === null
  );
  expect(missing).toEqual([]);
});

test("tên tab trong src/lib/tabLabels.ts khớp nhãn menu App.tsx", () => {
  const app = readFileSync(join(__dirname, "..", "src", "App.tsx"), "utf8");
  const items = [...app.matchAll(/\{ id: "([a-z_]+)", label: "([^"]+)"/g)].map((m) => ({ id: m[1], label: m[2] }));
  const all = { ...AGENCY_TAB_LABELS, ...BRAND_TAB_LABELS };
  const wrong = items.filter(
    ({ id, label }) => all[id] !== label && TALENT_TAB_LABELS[id] !== label && BRAND_TAB_LABELS[id] !== label
  );
  expect(wrong).toEqual([]);
});
