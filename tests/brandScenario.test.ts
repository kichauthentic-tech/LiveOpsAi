// Kịch bản brand (07/11, 0201): hệ số nhân, kiểm nhập, chấm từng dòng. Chạy: npx vitest run tests/brandScenario.test.ts
import { describe, expect, test } from "vitest";
import { cleanScenario, scenarioFactor, scenarioLineError, scoreScenario } from "../src/lib/scheduling/brandScenario";

const line = (id: string, pct: number, label = id, reason = "họp 30/10") => ({ id, label, pct, reason, at: "" });

describe("scenarioFactor", () => {
  test("nhân các dòng; rỗng = 1; kẹp ±50%", () => {
    expect(scenarioFactor([])).toBe(1);
    expect(scenarioFactor([line("a", 0.06), line("b", -0.04)])).toBeCloseTo(1.06 * 0.96, 10);
    expect(scenarioFactor([line("x", 3)])).toBeCloseTo(1.5, 10);
  });
});

describe("cleanScenario", () => {
  test("bỏ dòng hỏng, đọc số dạng chuỗi", () => {
    expect(cleanScenario(null)).toEqual([]);
    const r = cleanScenario([{ id: "1", label: "Ads", pct: "0.1", reason: "r" }, { label: "", pct: 0.1 }, { label: "x", pct: "abc" }, 5]);
    expect(r).toHaveLength(1);
    expect(r[0].pct).toBeCloseTo(0.1);
  });
});

describe("scenarioLineError", () => {
  test("lý do bắt buộc; dòng tăng nhắc riêng; % trong ±50%", () => {
    expect(scenarioLineError({ label: "Ads", pct: 0.1, reason: "" })).toMatch(/Dòng tăng/);
    expect(scenarioLineError({ label: "Hết size", pct: -0.1, reason: "" })).toMatch(/lý do/);
    expect(scenarioLineError({ label: "Ads", pct: 0.6, reason: "x" })).toMatch(/±50%/);
    expect(scenarioLineError({ label: "Ads", pct: 0, reason: "x" })).toMatch(/khác 0/);
    expect(scenarioLineError({ label: "Ads", pct: 0.1, reason: "email" })).toBeNull();
  });
});

describe("scoreScenario", () => {
  test("ví dụ trang đề xuất: engine +11%; dòng +6% làm sai thêm, dòng −4% giúp", () => {
    // engine 5,83B, thực tế 5,83/1,11 ≈ 5,25B.
    const s = scoreScenario(5830, [line("hang", 0.06, "11.11 hạng cao"), line("size", -0.04, "hết size")], 5830 / 1.11)!;
    expect(s.engineError).toBeCloseTo(0.11, 5);
    expect(s.adjustedError).toBeCloseTo(1.11 * 1.06 * 0.96 / 1.11 * 1.11 - 1, 5);
    const by = Object.fromEntries(s.perLine.map((l) => [l.id, l.gainPts]));
    expect(by.hang).toBeLessThan(0); // bỏ dòng +6% thì đúng hơn ⇒ dòng đó hại
    expect(by.size).toBeGreaterThan(0);
  });
  test("thiếu số ⇒ null", () => {
    expect(scoreScenario(0, [], 100)).toBeNull();
    expect(scoreScenario(100, [], 0)).toBeNull();
  });
});
