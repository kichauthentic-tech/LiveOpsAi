// Lỗi E2E #2 (2026-09-28): Bản Tin CEO "Tất cả brand" khi chỉ một phần brand có target — VERA có kế hoạch chốt
// (14,7M tới ngày), CROCS không có kế hoạch mà bán 3,53B ⇒ màn cũ báo "Đã đạt 3,53B · 24.103% Target".
// Chạy: npx vitest run tests/combineOutlooks.test.ts
import { describe, expect, test } from "vitest";
import { combineOutlooks, monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { LiveSession } from "../src/types";

let seq = 0;
const ca = (brandId: string, date: string, gmv: number): LiveSession =>
  ({ id: `s${++seq}`, brandId, date, startTime: "20:00", endTime: "23:00", status: "Completed", actualGmv: gmv, totalViews: 1000, liveDurationMinutes: 180 }) as LiveSession;

function scene() {
  const crocs = [ca("crocs", "2026-09-10", 3_000_000_000), ca("crocs", "2026-09-14", 530_000_000)];
  const vera = [ca("vera", "2026-09-10", 18_200_000)];
  const target = monthTargetOf("2026-09", 100_000_000, [{ date: "2026-09-10", target: 14_700_000 }, { date: "2026-09-30", target: 85_300_000 }]);
  const oC = monthOutlook("2026-09", "2026-09-15", crocs, [], null, undefined);
  const oV = monthOutlook("2026-09", "2026-09-15", vera, [], target, undefined);
  return { oC, oV, all: combineOutlooks("2026-09", "2026-09-15", [oC, oV]) };
}

describe("combineOutlooks — chỉ một phần brand có target", () => {
  test("tổng agency vẫn cộng mọi brand, nhưng phần so target chỉ là brand có target", () => {
    const { all } = scene();
    expect(all.actual).toBe(3_548_200_000); // tổng agency, dùng ở các khối khác
    expect(all.target!.total).toBe(100_000_000);
    expect(all.targetScope).toMatchObject({ brands: 1, of: 2, actual: 18_200_000 });
    // % Target đúng = 18,2M ÷ 100M, không phải 3,55B ÷ 100M.
    expect(all.targetScope!.actual / all.target!.total).toBeCloseTo(0.182);
    expect(all.runRate).toBeCloseTo(18_200_000 / 14_700_000);
  });

  test("thẻ ngày campaign cũng so target với GMV của đúng brand có target", () => {
    const { all } = scene();
    const daily = all.buckets.find((b) => b.bucket === "daily")!;
    expect(daily.actual.gmv).toBe(3_018_200_000); // 14/09 là Mid-Month, không nằm ở khung ngày thường
    expect(daily.targetScope!.gmv).toBe(18_200_000);
  });

  test("mọi brand đều có target, hoặc không brand nào có ⇒ không cần targetScope", () => {
    const { oC, oV } = scene();
    expect(combineOutlooks("2026-09", "2026-09-15", [oV]).targetScope).toBeUndefined();
    expect(combineOutlooks("2026-09", "2026-09-15", [oC]).targetScope).toBeUndefined();
  });
});
