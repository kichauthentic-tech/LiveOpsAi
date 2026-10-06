// Tài khoản cấp trước bằng tên đăng nhập, bổ sung email sau (06/10). Tên lấy từ hồ sơ thật T10.
// Chạy: npx vitest run tests/loginName.test.ts
import { describe, expect, test } from "vitest";
import {
  aliasEmail,
  isAliasEmail,
  isLoginName,
  loginIdentifierToEmail,
  loginLabel,
  resolveLoginInput,
  suggestLoginName
} from "../src/lib/loginName";

describe("suggestLoginName", () => {
  test("hai chữ cuối, bỏ dấu, đ ⇒ d", () => {
    expect(suggestLoginName("Huỳnh Thái Toàn", [])).toBe("thaitoan");
    expect(suggestLoginName("Lê Đức Duy", [])).toBe("ducduy");
    expect(suggestLoginName("Văng Hồng Thanh Ngân", [])).toBe("thanhngan");
  });
  test("trùng thì thêm số (email thật cùng tên không tính là trùng)", () => {
    expect(suggestLoginName("Trần Thị Hồng Vân", [aliasEmail("hongvan"), "hongvan@gmail.com"])).toBe("hongvan2");
    expect(suggestLoginName("Trần Thị Hồng Vân", [aliasEmail("hongvan"), aliasEmail("hongvan2")])).toBe("hongvan3");
  });
  test("tên một chữ ngắn vẫn đủ 3 ký tự hợp lệ", () => {
    expect(isLoginName(suggestLoginName("Mi", []))).toBe(true);
  });
});

test("email nội bộ và cách hiện", () => {
  expect(aliasEmail(" ThaiToan ")).toBe("thaitoan@liveops.invalid");
  expect(isAliasEmail("thaitoan@liveops.invalid")).toBe(true);
  expect(isAliasEmail("thaitoan@gmail.com")).toBe(false);
  expect(loginLabel("thaitoan@liveops.invalid")).toBe("thaitoan");
  expect(loginLabel("an@gmail.com")).toBe("an@gmail.com");
});

test("ô đăng nhập: tên trần ⇒ email nội bộ, email giữ nguyên", () => {
  expect(loginIdentifierToEmail(" ThaiToan ")).toBe("thaitoan@liveops.invalid");
  expect(loginIdentifierToEmail("an@gmail.com")).toBe("an@gmail.com");
});

describe("resolveLoginInput", () => {
  test("trống ⇒ tên gợi ý", () => {
    expect(resolveLoginInput("  ", "thaitoan")).toEqual({ email: "thaitoan@liveops.invalid" });
  });
  test("email thật", () => {
    expect(resolveLoginInput("An@Gmail.com", "x")).toEqual({ email: "an@gmail.com" });
    expect(resolveLoginInput("an@gmail", "x")).toHaveProperty("error");
    expect(resolveLoginInput("an@liveops.invalid", "x")).toHaveProperty("error");
  });
  test("tên tự gõ", () => {
    expect(resolveLoginInput("toan.huynh", "x")).toEqual({ email: "toan.huynh@liveops.invalid" });
    expect(resolveLoginInput("toàn", "x")).toHaveProperty("error");
    expect(resolveLoginInput("ab", "x")).toHaveProperty("error");
  });
});
