import { expect, test } from "vitest";
import { isBigChange } from "../src/lib/report/changeThreshold";

test("đổi từ 10% (trên số làm tròn) mới tính, cả hai chiều; không có số ⇒ không", () => {
  expect([10, -10, 9.5, -9.5].map(isBigChange)).toEqual([true, true, true, true]);
  expect([9.4, -9.4, 0, null, undefined].map(isBigChange)).toEqual([false, false, false, false, false]);
});
