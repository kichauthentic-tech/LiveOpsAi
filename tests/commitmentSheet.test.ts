// Dán giờ cam kết từ sheet "TỶ LỆ LỊCH". Chạy: npx vitest run tests/commitmentSheet.test.ts
import { describe, expect, test } from "vitest";
import { normName, parseCommitmentSheet } from "../src/lib/roster/commitmentSheet";
import type { Talent } from "../src/types";

const t = (id: string, name: string, nickname = ""): Talent => ({ id, name, nickname }) as Talent;
const talents = [t("thy", "Trần Ngọc Bảo Thy", "B.Thy"), t("an", "Lê Quang An"), t("v1", "Nguyễn Thị Kim Vân"), t("v2", "Trần Thị Hồng Vân"), t("v3", "Lê Kim Vân")];

describe("parseCommitmentSheet", () => {
  test("rút giờ từ nhiều kiểu ghi và ghép tên có dấu / viết hoa", () => {
    const text = ["STT\tHOST\t\tMỨC CAST", "2\tTRẦN NGỌC BẢO THY\t60h /tháng (6-7-CN, camp)\t280000", "4\tLÊ QUANG AN\t35-40h/tháng (JK camp)\t180000", "9\tLÊ QUANG AN\t35/tháng"].join("\n");
    const r = parseCommitmentSheet(text, talents);
    expect(r.skipped).toBe(1);
    expect(r.rows.map((x) => [x.talentId, x.hours, x.note, x.duplicate])).toEqual([
      ["thy", 60, "6-7-CN, camp", false],
      ["an", 40, "JK camp", false],
      ["an", 35, "", true]
    ]);
  });

  test("tên chỉ khớp theo hai từ cuối mà trùng nhiều người thì ambiguous, không đoán", () => {
    const r = parseCommitmentSheet("1\tKIM VÂN\t30h/tháng", talents);
    expect(r.rows[0].status).toBe("ambiguous");
    expect(r.rows[0].talentId).toBeUndefined();
    expect(r.rows[0].candidates.sort()).toEqual(["v1", "v3"]);
  });

  test("không khớp ai thì unmatched; dòng không có giờ bị bỏ", () => {
    const r = parseCommitmentSheet("1\tNGƯỜI LẠ\t20h /tháng (daily)\nghi chú linh tinh", talents);
    expect(r.rows[0].status).toBe("unmatched");
    expect(r.skipped).toBe(1);
  });

  test("normName bỏ dấu và đ", () => {
    expect(normName("Đặng  Nguyễn Bảo-Hân")).toBe("dang nguyen bao han");
  });
});
