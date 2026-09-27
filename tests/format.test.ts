import { expect, test } from "vitest";
import { fmtFixed, fmtNum, fmtPctValue, fmtVndFull, fmtVndShort } from "../src/lib/format";

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
  expect(fmtVndFull(53733488.4)).toBe("53.733.488");
  expect(fmtVndFull(null)).toBe("—");
});

test("tiền rút gọn K / M / B, không đơn vị đ", () => {
  expect(fmtVndShort(50_000_000)).toBe("50M");
  expect(fmtVndShort(53_733_488)).toBe("53,7M");
  expect(fmtVndShort(9_100_358_401)).toBe("9,1B");
  expect(fmtVndShort(1_234_000_000)).toBe("1,23B");
  expect(fmtVndShort(500_000)).toBe("500K");
  expect(fmtVndShort(850)).toBe("850");
  expect(fmtVndShort(-2_500_000)).toBe("-2,5M");
  expect(fmtVndShort(999_960_000)).toBe("1B");
  expect(fmtVndShort(999_700)).toBe("1M");
  expect(fmtVndShort(0)).toBe("0");
  expect(fmtVndShort(undefined)).toBe("—");
});
