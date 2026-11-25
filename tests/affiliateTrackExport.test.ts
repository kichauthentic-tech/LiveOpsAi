import { describe, expect, it } from "vitest";
import { buildTrackGrid, mergeSameCreatorSameDay } from "../src/lib/affiliate/trackExport";
import type { AffiliateActualEntry } from "../src/types";

const e = (p: Partial<AffiliateActualEntry>): AffiliateActualEntry => ({ brandId: "b", periodMonth: "2026-11-01", creatorName: "X", ...p });

describe("gộp phiên cùng creator, cùng ngày (xuất Excel gửi brand)", () => {
  const manhka = e({ creatorName: "Mạnh Ka", liveDateLabel: "10/11/2026", timelineLabel: "18:11 - 20:52", durationHours: 2.7, directGmv: 1046843, orders: 2, itemsSold: 2, avgPrice: 523422, targetGmv: 150000000, campName: "D-Day", campaignType: "Medium", planTimelineLabel: "18h - 21h" });
  const giay = e({ creatorName: "Mạnh Ka - Giày", liveDateLabel: "10/11/2026", timelineLabel: "21:29 - 22:35", durationHours: 1.1, directGmv: 2449094, orders: 3, itemsSold: 3, avgPrice: 816365, campName: "D-Day" });
  const khoi = e({ creatorName: "Khói", liveDateLabel: "9/11/2026", timelineLabel: "18:11 - 23:59", durationHours: 5.8, directGmv: 139595672 });

  it("Mạnh Ka + Mạnh Ka - Giày (nghỉ 37 phút) thành một cột, số cộng lại", () => {
    const out = mergeSameCreatorSameDay([khoi, manhka, giay]);
    expect(out).toHaveLength(2);
    const m = out[1];
    expect(m.creatorName).toBe("Mạnh Ka");
    expect(m.timelineLabel).toBe("18:11 - 22:35");
    expect(m.directGmv).toBe(1046843 + 2449094);
    expect(m.durationHours).toBeCloseTo(3.8);
    expect(m.targetGmv).toBe(150000000);
    expect(m.itemsSold).toBe(5);
  });
  it("khác ngày hoặc cách xa >60 phút thì không gộp", () => {
    expect(mergeSameCreatorSameDay([manhka, { ...giay, liveDateLabel: "11/11/2026" }])).toHaveLength(2);
    expect(mergeSameCreatorSameDay([manhka, { ...giay, timelineLabel: "23:30 - 23:59" }])).toHaveLength(2);
  });
  it("lưới: dòng tháng có ô gộp, cột = số phiên sau gộp, phiên huỷ không ra", () => {
    const { grid, merges } = buildTrackGrid([{ label: "11/2026", items: [khoi, manhka, giay, e({ creatorName: "Z", status: "cancelled", liveDateLabel: "12/11/2026" })] }]);
    expect(grid[0]).toHaveLength(3);
    expect(merges).toEqual([{ s: { r: 0, c: 1 }, e: { r: 0, c: 2 } }]);
    expect(grid.find((r) => r[0].v === "Creator")!.map((c) => c.v)).toEqual(["Creator", "Khói", "Mạnh Ka"]);
  });
});
