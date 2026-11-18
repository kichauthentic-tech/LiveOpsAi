// Danh bạ logic (AI Training Center) không được lệch với tham số thật. Chạy: npx vitest run tests/logicRegistry.test.ts
import { describe, expect, test } from "vitest";
import { LOGIC_MODULES, referencedKeys } from "../src/lib/logicRegistry";
import { ENGINE_PARAM_META } from "../src/lib/scheduling/engineParams";

describe("logicRegistry", () => {
  test("mọi khoá tham chiếu là tham số có thật", () => {
    const real = new Set(ENGINE_PARAM_META.map((m) => m.key));
    for (const k of referencedKeys()) expect(real.has(k), String(k)).toBe(true);
  });
  test("mọi tham số nhóm Tự fill lịch live đều có mặt trong danh bạ", () => {
    const ref = referencedKeys();
    for (const m of ENGINE_PARAM_META.filter((x) => x.group === "roster")) expect(ref.has(m.key), m.key).toBe(true);
  });
  test("id module không trùng, ngưỡng trong code có giá trị thật", () => {
    const ids = LOGIC_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mod of LOGIC_MODULES) for (const r of mod.rules) for (const c of r.consts ?? []) expect(c.value, `${mod.id}: ${c.label}`).not.toMatch(/NaN|undefined/);
  });
  test("mỗi luật có khoá tham số hoặc ghi rõ nằm ở đâu", () => {
    for (const mod of LOGIC_MODULES) for (const r of mod.rules) expect((r.keys?.length ?? 0) > 0 || !!r.where || (r.consts?.length ?? 0) > 0 || !!r.help, `${mod.id}: ${r.text}`).toBe(true);
  });
});
