import { describe, expect, it } from "vitest";
import { keyMetricsHeadline, observeHeadline, summaryHeadline } from "../src/lib/report/pageHeadlines";

describe("pageHeadlines", () => {
  it("tổng quan: nêu % Target và loại ngày thấp nhất", () => {
    const h = summaryHeadline({ liveActual: 90e6, liveTarget: 100e6, days: [{ label: "Daily", target: 50e6, actual: 30e6 }, { label: "Pay Day", target: 50e6, actual: 60e6 }] });
    expect(h).toContain("90% Target");
    expect(h).toContain("Daily thấp nhất ở 60% Target");
  });
  it("tổng quan: chưa có Target thì nói rõ", () => {
    expect(summaryHeadline({ liveActual: 1e6, liveTarget: null, days: [] })).toContain("chưa có Target LIVE");
  });
  it("key metrics: tháng không có gì nổi bật thì nói rõ", () => {
    expect(keyMetricsHeadline({ rows: [{ label: "GMV", change: 3, tone: "noise" }], prevLabel: "T9" })).toContain("chưa có thay đổi nổi bật");
  });
  it("trang khác lấy câu đầu của Quan sát, thiếu số thì dùng câu dự phòng", () => {
    expect(observeHeadline({ observe: "Refund rate 5%. Cao hơn tháng trước.", cause: "", impact: "", advise: "" }, "x")).toBe("Refund rate 5%.");
    expect(observeHeadline({ observe: "Chưa đủ số liệu của trang này để nêu nhận định.", cause: "", impact: "", advise: "" }, "dự phòng")).toBe("dự phòng");
  });
});
