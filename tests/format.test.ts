import { expect, test } from "vitest";
import { fmtFixed, fmtNum, fmtPctValue, fmtVndFull } from "../src/lib/format";

test("dấu thập phân phẩy, nghìn chấm", () => {
  expect(fmtFixed(2.184, 2)).toBe("2,18");
  expect(fmtFixed(1234.5, 1)).toBe("1.234,5");
  expect(fmtFixed(3, 2)).toBe("3,00");
  expect(fmtNum(1.5, 2)).toBe("1,5");
  expect(fmtNum(null)).toBe("—");
});

test("phần trăm và tiền", () => {
  expect(fmtPctValue(37.75)).toBe("37,75%");
  expect(fmtPctValue(undefined)).toBe("—");
  expect(fmtVndFull(53733488.4)).toBe("53.733.488đ");
});
