import { describe, expect, it } from "vitest";
import { attributionByType, attributionMonth } from "../src/lib/report/liveAttribution";
import type { ShopDaysMonthSlice } from "../src/lib/dataraw/monthlyProductSlice";

const day = (date: string, extra: Record<string, number | undefined>) => ({ date, gmv: 0, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0, ...extra });
const slice = (days: ReturnType<typeof day>[]): ShopDaysMonthSlice => ({ days, hasAnyBatch: true });

describe("attributionMonth", () => {
  it("cộng Direct/Indirect trong cửa sổ ngày và tính tỷ trọng Indirect", () => {
    const s = slice([
      day("2026-09-01", { liveDirect: 700, liveIndirect: 300 }),
      day("2026-09-02", { liveDirect: 700, liveIndirect: 300 }),
      day("2026-09-30", { liveDirect: 9999, liveIndirect: 9999 })
    ]);
    const m = attributionMonth(s, "2026-09-01", "2026-09-02")!;
    expect(m.direct).toBe(1400);
    expect(m.indirect).toBe(600);
    expect(m.attributed).toBe(2000);
    expect(m.indirectPct).toBeCloseTo(30);
    expect(m.days).toBe(2);
  });

  it("bản chụp cũ không có cột tách ⇒ null thay vì hiện 0%", () => {
    expect(attributionMonth(slice([day("2026-09-01", {})]), "2026-09-01", "2026-09-30")).toBeNull();
  });

  it("thiếu file hoặc cửa sổ rỗng ⇒ null", () => {
    expect(attributionMonth(null, "2026-09-01", "2026-09-30")).toBeNull();
    expect(attributionMonth({ days: [], hasAnyBatch: false }, "2026-09-01", "2026-09-30")).toBeNull();
    expect(attributionMonth(slice([day("2026-08-01", { liveDirect: 1, liveIndirect: 1 })]), "2026-09-01", "2026-09-30")).toBeNull();
  });
});

describe("attributionByType", () => {
  it("cắt theo loại ngày của khung camp; loại không có ngày ⇒ null; all = toàn cửa sổ", () => {
    const s = slice([
      day("2026-09-01", { liveDirect: 800, liveIndirect: 200 }),
      day("2026-09-02", { liveDirect: 600, liveIndirect: 400 }),
      day("2026-09-15", { liveDirect: 500, liveIndirect: 500 })
    ]);
    const t = attributionByType(s, "2026-09-01", "2026-09-30", (d) => (d === "2026-09-15" ? "midmonth" : "daily"));
    expect(t.daily!.indirectPct).toBeCloseTo(30);
    expect(t.daily!.days).toBe(2);
    expect(t.midmonth!.indirectPct).toBeCloseTo(50);
    expect(t.dday).toBeNull();
    expect(t.payday).toBeNull();
    expect(t.all!.attributed).toBe(3000);
  });
});
