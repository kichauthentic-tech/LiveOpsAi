import { describe, expect, test } from "vitest";
import { boostFillItems, summarizeBoost } from "../src/lib/scheduling/boost";

describe("ca tăng cường (0165)", () => {
  test("target đề xuất = dự báo engine làm tròn, mỗi ca một số riêng", () => {
    const items = boostFillItems([{ id: "a" }, { id: "b" }], [12_345_678.6, 800_000.2]);
    expect(items).toEqual([
      { id: "a", target: 12_345_679, expected: 12_345_679 },
      { id: "b", target: 800_000, expected: 800_000 }
    ]);
  });

  test("dự báo ≤ 0 hoặc không phải số: bỏ qua, ca vẫn 'đang chờ' thay vì ghi target 0", () => {
    expect(boostFillItems([{ id: "a" }, { id: "b" }, { id: "c" }], [0, Number.NaN, 5_000_000])).toEqual([{ id: "c", target: 5_000_000, expected: 5_000_000 }]);
  });

  test("hai danh sách lệch số ca thì ném lỗi (không ghi nhầm target sang ca khác)", () => {
    expect(() => boostFillItems([{ id: "a" }], [1, 2])).toThrow();
  });

  test("tóm tắt: ca chờ không tính vào Σ đề xuất; đếm ca đã qua", () => {
    const s = summarizeBoost(
      [
        { date: "2026-10-03", targetGmv: 0, targetPending: true },
        { date: "2026-10-05", targetGmv: 2_000_000, targetPending: false },
        { date: "2026-10-20", targetGmv: 3_000_000, targetPending: false }
      ],
      "2026-10-10"
    );
    expect(s).toEqual({ count: 3, pending: 1, targetSum: 5_000_000, past: 2 });
  });
});
