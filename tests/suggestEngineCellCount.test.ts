// Audit 05/10: ca chạm một ô (thứ × khối 2h) chỉ vài phút không được tính là "1 ca" của ô đó.
// Trước khi sửa, AI Training hiện "T4 0–2h (6 ca) 26,9M/h" là khung giờ mạnh của CROCS — cả 6 ca đều là ca
// tối tắt lúc 00:01, chạm khối 0–2h hôm sau đúng 1 phút.
import { expect, test } from "vitest";
import { LiveSession } from "../src/types";
import { buildHistory } from "../src/lib/scheduling/suggestEngine";

const mk = (id: string, date: string, start: string, end: string, gmv: number): LiveSession =>
  ({
    id, title: "", brandId: "crocs", brandName: "CROCS", hostId: "h", hostName: "H", platform: "TikTok",
    date, startTime: start, endTime: end, status: "Completed", monthPublished: true,
    dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0,
    peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0
  }) as LiveSession;

// 6 thứ Ba liên tiếp, ca 18:01–00:01 (tắt sau nửa đêm 1 phút ⇒ chạm khối 0–2h của thứ Tư).
const sessions = ["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01", "2026-09-08"].map((d, i) =>
  mk(`s${i}`, d, "18:01", "00:01", 150_000_000)
);

test("ca chạm khối 0–2h hôm sau 1 phút không được đếm là ca của khối đó", () => {
  const h = buildHistory(sessions, "crocs", "2026-09-30", {});
  const wedMidnight = h.cells.find((c) => c.weekday === 3 && c.block === 0);
  expect(wedMidnight?.n ?? 0).toBe(0);
  // Khối mà ca phủ trọn vẫn đếm đủ 6.
  const tueEvening = h.cells.find((c) => c.weekday === 2 && c.block === 10);
  expect(tueEvening?.n).toBe(6);
});
