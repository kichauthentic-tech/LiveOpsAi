import { expect, test } from "vitest";
import { pickDefaultBrandId } from "../src/lib/defaultBrand";

const brands = [{ id: "franklin" }, { id: "jockey" }, { id: "crocs" }];
const s = (brandId: string, date: string, status: "Completed" | "Cancelled" | "Upcoming" = "Completed") => ({ brandId, date, status });

test("không có lựa chọn cũ → brand có ca gần nhất tới hôm nay, không phải brand đầu bảng chữ cái", () => {
  expect(pickDefaultBrandId(brands, [s("crocs", "2026-09-22"), s("jockey", "2026-08-01")], null, "2026-09-26")).toBe("crocs");
});

test("lựa chọn cũ còn tồn tại thì thắng", () => {
  expect(pickDefaultBrandId(brands, [s("crocs", "2026-09-22")], "jockey", "2026-09-26")).toBe("jockey");
});

test("lựa chọn cũ của brand đã xoá thì bỏ qua", () => {
  expect(pickDefaultBrandId(brands, [s("crocs", "2026-09-22")], "vera-da-xoa", "2026-09-26")).toBe("crocs");
});

test("ca tương lai và ca huỷ không kéo mặc định", () => {
  const sessions = [s("crocs", "2026-09-22"), s("jockey", "2026-10-05", "Upcoming"), s("franklin", "2026-09-25", "Cancelled")];
  expect(pickDefaultBrandId(brands, sessions, null, "2026-09-26")).toBe("crocs");
});

test("chưa có ca nào → brand đầu; chưa có brand → chuỗi rỗng", () => {
  expect(pickDefaultBrandId(brands, [], null, "2026-09-26")).toBe("franklin");
  expect(pickDefaultBrandId([], [s("crocs", "2026-09-22")], "crocs", "2026-09-26")).toBe("");
});
