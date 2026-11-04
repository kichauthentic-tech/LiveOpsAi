import { expect, test } from "vitest";
import { planReorder } from "../src/lib/sku/basketOrder";

const basket = ["a", "b", "c", "d", "e"].map((id, i) => ({ id, pinOrder: i + 1 }));
const apply = (patches: { id: string; pinOrder: number }[]) => {
  const m = new Map(basket.map((b) => [b.id, b.pinOrder]));
  for (const p of patches) m.set(p.id, p.pinOrder);
  return [...m].sort((x, y) => x[1] - y[1]).map(([id]) => id).join("");
};

test("đưa hạng 5 lên hạng 1: các hạng khác lùi một bậc", () => {
  expect(apply(planReorder(basket, "e", 1))).toBe("eabcd");
});
test("đưa xuống cuối, số vượt giới hạn bị kẹp", () => {
  expect(apply(planReorder(basket, "a", 99))).toBe("bcdea");
  expect(apply(planReorder(basket, "c", 0))).toBe("cabde");
});
test("không đổi hạng ⇒ không ghi gì; giỏ có khe hở được đánh số lại liền mạch", () => {
  expect(planReorder(basket, "c", 3)).toEqual([]);
  const gap = [{ id: "x", pinOrder: 2 }, { id: "y", pinOrder: 7 }];
  expect(planReorder(gap, "y", 2)).toEqual([{ id: "x", pinOrder: 1 }, { id: "y", pinOrder: 2 }]);
});
