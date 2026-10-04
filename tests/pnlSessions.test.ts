// Audit 2026-09-28 mục 1: Finance & P&L và Bản Tin CEO lọc ca tính tiền bằng hai luật khác nhau.
// Chạy: npx vitest run tests/pnlSessions.test.ts
import { describe, expect, test } from "vitest";
import { isPnlSession } from "../src/lib/pnl";
import { financeOf } from "../src/lib/performance/ceoBrief";
import { LiveSession } from "../src/types";

const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({ id, brandId: "b", date: "2026-10-05", startTime: "19:00", endTime: "22:00", status: "Completed", actualGmv: 0, totalViews: 0, isBackfill: false, ...over }) as LiveSession;

const sessions = [
  ca("co-so", { actualGmv: 50_000_000, totalViews: 9000 }),
  ca("gmv-0", { dataSource: "live_snapshot" }), // lên sóng (có file lúc giao ca) nhưng không bán được — host vẫn nhận lương
  // Audit workflow 2026-10-04 #5: quá giờ, KHÔNG số/report/giờ live — có thể không ai đi. Chưa vào tiền.
  ca("khong-bang-chung", {}),
  ca("nap-bu", { actualGmv: 80_000_000, totalViews: 12000, isBackfill: true }),
  ca("dang-live", { status: "Live Now", actualGmv: 10_000_000, totalViews: 500 }),
  ca("huy", { status: "Cancelled" })
];
// Mỗi ca đủ dữ liệu, lãi = 1M, để đếm được ca nào lọt vào tổng.
const pnl = () => ({ revenue: 3_000_000, cost: 2_000_000, profit: 1_000_000, missing: [] });

describe("isPnlSession — một luật cho mọi màn tiền", () => {
  test("Finance/lương: ca Completed, bỏ ca nạp bù", () => {
    expect(sessions.filter((s) => isPnlSession(s, { includeBackfill: false })).map((s) => s.id)).toEqual(["co-so", "gmv-0"]);
  });

  test("Bản Tin CEO: cùng luật, chỉ khác là tính cả ca nạp bù", () => {
    const f = financeOf(sessions, pnl);
    expect(f.sessions).toBe(3);
    expect(f.backfill).toBe(1);
    // Ca GMV = 0 vẫn mang chi phí; trước bản vá CEO bỏ nó (lọc "ca có số") nên chi phí thấp hơn Finance.
    expect(f.cost).toBe(6_000_000);
  });
});
