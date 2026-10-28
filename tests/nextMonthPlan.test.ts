import { describe, expect, it } from "vitest";
import {
  applyFinalRate,
  bookingTotals,
  bookingVsCurrent,
  decodeRefundFinal,
  decodeTodoMeta,
  encodeRefundFinal,
  encodeTodoMeta,
  liveRequirement,
  parseRatePct,
  refundTrackRows
} from "../src/lib/report/nextMonthPlan";
import { chooseNmvRate, refundMonthStatus } from "../src/lib/refundStatus";

describe("liveRequirement", () => {
  it("cần thấp hơn mức đã đạt → reach", () => {
    expect(liveRequirement(9, 10, 20, 20).tone).toBe("reach");
  });
  it("cao hơn nhưng trong dải nhiễu → stretch; vượt dải → beyond", () => {
    // band = 196*0.26*sqrt(1/20+1/20) ≈ 16%
    expect(liveRequirement(11, 10, 20, 20).tone).toBe("stretch");
    expect(liveRequirement(13, 10, 20, 20).tone).toBe("beyond");
  });
  it("thiếu số → nodata", () => {
    expect(liveRequirement(null, 10, 20, 20).tone).toBe("nodata");
    expect(liveRequirement(10, null, 20, 20).tone).toBe("nodata");
  });
  it("ít phiên ⇒ dải rộng hơn nên cùng chênh lệch dễ rơi vào stretch", () => {
    expect(liveRequirement(13, 10, 4, 4).tone).toBe("stretch");
  });
});

describe("bookingVsCurrent", () => {
  const actual = { sessions: 6, hours: 30, gmv: 300, gmvPerHour: 10, roas: 12 };
  it("kế hoạch trống → empty", () => {
    const r = bookingVsCurrent(bookingTotals([]), actual);
    expect(r.empty).toBe(true);
    expect(r.rows.find((x) => x.key === "gmv")!.planned).toBeNull();
  });
  it("Target Creator = tổng Target; GMV/giờ, ROAS cần tự tính; so với tháng này", () => {
    const t = bookingTotals([
      { hours: 5, target: 100, budgetAds: 10 },
      { hours: 5, target: 200, budgetAds: 20 }
    ]);
    expect(t).toEqual({ sessions: 2, hours: 10, target: 300, ads: 30 });
    const r = bookingVsCurrent(t, actual);
    const get = (k: string) => r.rows.find((x) => x.key === k)!;
    expect(get("gmv").planned).toBe(300);
    expect(get("gmv").changePct).toBeCloseTo(0);
    expect(get("gmvPerHour").planned).toBe(30);
    expect(get("gmvPerHour").changePct).toBeCloseTo(200);
    expect(get("roas").planned).toBe(10);
    expect(get("sessions").changePct).toBeCloseTo(-66.67, 1);
  });
});

describe("todo meta", () => {
  it("round-trip, bỏ dòng rỗng và deadline sai định dạng", () => {
    const enc = encodeTodoMeta({ a: { deadline: "2026-11-05", pic: " An " }, b: { deadline: "", pic: "" }, c: { deadline: "5/11", pic: "" } });
    expect(decodeTodoMeta(enc)).toEqual({ a: { deadline: "2026-11-05", pic: "An" } });
    expect(encodeTodoMeta({})).toBeNull();
    expect(decodeTodoMeta("không phải json")).toEqual({});
  });
});

describe("refund final", () => {
  it("parseRatePct", () => {
    expect(parseRatePct("37,5%")).toBe(37.5);
    expect(parseRatePct("abc")).toBeNull();
    expect(parseRatePct("120")).toBeNull();
  });
  it("round-trip và lọc giá trị sai", () => {
    expect(decodeRefundFinal(encodeRefundFinal({ "2026-09": 37.1, "2026-08": 150, x: 3 }))).toEqual({ "2026-09": 37.1 });
  });
  const st = (month: string, template: "old" | "new") => refundMonthStatus({ month, today: "2026-10-28", gmv: 100, refunds: 37, lastDate: `${month}-30`, template });
  it("tỷ lệ chốt nhập tay làm tháng thành 'final' và NMV dùng tỷ lệ đó nhưng vẫn là ước tính cho tháng sau", () => {
    const sep = applyFinalRate(st("2026-09", "new"), { "2026-09": 36 });
    expect(sep.status).toBe("final");
    expect(sep.rate).toBe(36);
    const oct = st("2026-10", "new");
    const c = chooseNmvRate(oct, [sep], null);
    expect(c.isEstimate).toBe(true);
    expect(c.rate).toBe(36);
    expect(chooseNmvRate(applyFinalRate(oct, { "2026-10": 35 }), [], null).isEstimate).toBe(false);
  });
  it("tháng mẫu cũ đánh dấu cần up lại file", () => {
    const rows = refundTrackRows([st("2026-08", "old"), st("2026-09", "new")], { "2026-09": 36 });
    expect(rows[0].needsReupload).toBe(true);
    expect(rows[0].status).toBe("provisional");
    expect(rows[1].finalRate).toBe(36);
    expect(rows[1].status).toBe("final");
  });
});
