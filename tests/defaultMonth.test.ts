import { describe, expect, test } from "vitest";
import { defaultPlanMonth, defaultReportMonth, defaultViewMonth } from "../src/lib/defaultMonth";

// Luật tháng mở sẵn (audit người mới 2026-10-04). Tình huống thật 04/10: số liệu tới 22/09, tháng 10 chưa có ca,
// kế hoạch T10 của CROCS còn nháp.
const s = (date: string, status: "Completed" | "Cancelled" | "Upcoming" = "Completed") => ({ date, status });

describe("defaultViewMonth", () => {
  test("tháng này chưa có ca → tháng gần nhất có ca", () => {
    expect(defaultViewMonth("2026-10-04", [s("2026-09-22"), s("2026-08-03")])).toBe("2026-09");
  });
  test("tháng này đã có ca (kể cả ca chưa diễn ra) → tháng này", () => {
    expect(defaultViewMonth("2026-10-04", [s("2026-09-22"), s("2026-10-20", "Upcoming")])).toBe("2026-10");
  });
  test("ca huỷ không tính, ca tương lai xa không kéo tháng đi", () => {
    expect(defaultViewMonth("2026-10-04", [s("2026-10-02", "Cancelled"), s("2026-09-01"), s("2026-12-01", "Upcoming")])).toBe("2026-09");
  });
  test("chưa có ca nào → tháng này", () => {
    expect(defaultViewMonth("2026-10-04", [])).toBe("2026-10");
  });
});

describe("defaultReportMonth", () => {
  test("mở tháng đã hết gần nhất có ca, không bao giờ tháng đang chạy", () => {
    expect(defaultReportMonth("2026-10-04", [s("2026-10-02"), s("2026-09-22")])).toBe("2026-09");
    expect(defaultReportMonth("2026-10-04", [s("2026-07-10")])).toBe("2026-07");
  });
  test("không có ca → tháng trước; qua năm", () => {
    expect(defaultReportMonth("2026-01-05", [])).toBe("2025-12");
  });
});

describe("defaultPlanMonth", () => {
  test("kế hoạch tháng này còn nháp → tháng này; không thì tháng sau", () => {
    expect(defaultPlanMonth("2026-10-04", new Set(["2026-10"]))).toBe("2026-10");
    expect(defaultPlanMonth("2026-10-04", new Set())).toBe("2026-11");
    expect(defaultPlanMonth("2026-12-20", new Set())).toBe("2027-01");
  });
});
