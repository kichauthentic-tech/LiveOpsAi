// Trạng thái hoàn/huỷ chung cho Report Tháng + Kế Toán (28/10). Chạy: npx vitest run tests/refundStatus.test.ts
import { describe, expect, test } from "vitest";
import { chooseNmvRate, compareRefundRates, detectShopFileTemplate, refundMonthStatus, settleFromIso, vnDateOfTimestamp, type RefundMonthInput } from "../src/lib/refundStatus";

const base: RefundMonthInput = { month: "2026-09", today: "2026-10-28", gmv: 1000, refunds: 373, lastDate: "2026-09-30", template: "new", exportedAt: "2026-10-27", definitionVerified: true };

describe("nhận diện mẫu file", () => {
  test("có cột Tổng doanh thu / Gross revenue ⇒ mẫu mới", () => {
    expect(detectShopFileTemplate(["Ngày", "GMV", "Tổng doanh thu"])).toBe("new");
    expect(detectShopFileTemplate(["Date", "GMV", "Gross revenue "])).toBe("new");
    expect(detectShopFileTemplate(["Ngày", "GMV", "Hoàn tiền"])).toBe("old");
    expect(detectShopFileTemplate([])).toBe("unknown");
    expect(detectShopFileTemplate(null)).toBe("unknown");
  });
  test("ngày xuất theo giờ VN", () => {
    expect(vnDateOfTimestamp("2026-10-27T18:30:00Z")).toBe("2026-10-28");
    expect(vnDateOfTimestamp("bậy")).toBeNull();
  });
});

describe("refundMonthStatus", () => {
  test("chốt khi qua cuối tháng + 15, phủ hết tháng, mẫu mới", () => {
    expect(settleFromIso("2026-09")).toBe("2026-10-15");
    const s = refundMonthStatus(base);
    expect(s.status).toBe("final");
    expect(s.rate).toBeCloseTo(37.3);
    expect(s.reasons).toEqual([]);
    expect(s.definitionUnverified).toBe(false);
  });
  test("chưa xác nhận định nghĩa mẫu mới ⇒ vẫn tạm tính", () => {
    const s = refundMonthStatus({ ...base, definitionVerified: false });
    expect(s.status).toBe("provisional");
    expect(s.reasons).toEqual(["definition_unverified"]);
    expect(s.definitionUnverified).toBe(true);
  });
  test("tạm tính khi từng điều kiện thiếu", () => {
    expect(refundMonthStatus({ ...base, today: "2026-10-14" }).reasons).toEqual(["not_settled_yet"]);
    expect(refundMonthStatus({ ...base, lastDate: "2026-09-29" }).reasons).toEqual(["file_not_covering_month"]);
    expect(refundMonthStatus({ ...base, template: "old" }).reasons).toEqual(["old_template"]);
    expect(refundMonthStatus({ ...base, template: "unknown" }).reasons).toEqual(["unknown_template"]);
    const none = refundMonthStatus({ ...base, gmv: 0, refunds: 0 });
    expect(none.rate).toBeNull();
    expect(none.status).toBe("provisional");
  });
  test("tháng mẫu cũ không bao giờ chốt dù đã cũ", () => {
    const s = refundMonthStatus({ ...base, month: "2026-08", template: "old", refunds: 157 });
    expect(s.status).toBe("provisional");
    expect(s.definitionUnverified).toBe(false);
    expect(s.rate).toBeCloseTo(15.7);
  });
});

describe("compareRefundRates", () => {
  test("khác mẫu ⇒ không so sánh", () => {
    const r = compareRefundRates({ rate: 37.3, template: "new" }, { rate: 16.5, template: "old" });
    expect(r.comparable).toBe(false);
    expect(r.delta).toBeNull();
    expect(r.note).toContain("chưa so sánh được");
  });
  test("cùng mẫu ⇒ so sánh, mẫu lạ ⇒ không", () => {
    expect(compareRefundRates({ rate: 37.7, template: "new" }, { rate: 37.3, template: "new" }).delta).toBeCloseTo(0.4);
    expect(compareRefundRates({ rate: 1, template: "unknown" }, { rate: 1, template: "unknown" }).comparable).toBe(false);
    expect(compareRefundRates({ rate: null, template: "new" }, { rate: 1, template: "new" }).comparable).toBe(false);
  });
});

describe("chooseNmvRate", () => {
  const final9 = refundMonthStatus(base);
  const prov10 = refundMonthStatus({ ...base, month: "2026-10", today: "2026-10-28", lastDate: "2026-10-27", refunds: 377 });
  test("tháng đã chốt ⇒ số thật", () => {
    const c = chooseNmvRate(final9, [], 5);
    expect(c).toMatchObject({ isEstimate: false, source: "settled_month", sourceMonth: "2026-09" });
  });
  test("chưa chốt ⇒ ước tính theo tháng chốt gần nhất, nêu nguồn", () => {
    const c = chooseNmvRate(prov10, [final9, prov10], 5);
    expect(c).toMatchObject({ isEstimate: true, source: "latest_settled_month", sourceMonth: "2026-09" });
    expect(c.rate).toBeCloseTo(37.3);
    expect(c.label).toContain("2026-09");
  });
  test("không có tháng chốt ⇒ % hoàn dự kiến trong hợp đồng ⇒ Refund rate tạm tính của tháng ⇒ mặc định 40%", () => {
    expect(chooseNmvRate(prov10, [prov10], 12)).toMatchObject({ rate: 12, isEstimate: true, source: "contract_expected" });
    // Audit 30/10: CRM chưa nhập % hoàn thì dùng số đo được của tháng, không phải 40% (VERA T10 thực 16,9%).
    expect(chooseNmvRate(prov10, [prov10], 0)).toMatchObject({ rate: prov10.rate, source: "provisional_month", isEstimate: true });
    expect(chooseNmvRate(null, [], null)).toMatchObject({ rate: 40, source: "default_estimate" });
  });
});
