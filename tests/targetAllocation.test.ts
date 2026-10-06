// Đ5 (2026-09-24) — target tháng khi có Kế Hoạch Tháng đã chốt.
// Chạy: npm test    (chỉ file này: npx vitest run tests/targetAllocation.test.ts)
import { expect, test } from "vitest";
import { applyAllocatedTargets } from "../src/lib/performance/targetAllocation";
import { LiveSession } from "../src/types";

const B = "brand-vera";
const M = "2026-09";

function ca(id: string, date: string, start: string, end: string, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    id, title: id, brandId: B, brandName: "VERA", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: start, endTime: end, status: "Upcoming",
    targetGmv: 0, actualGmv: 0, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 0, ctrAvg: 0, cvrAvg: 0, ...extra
  } as LiveSession;
}

// So bằng JSON.stringify chứ không toEqual: giữ nguyên phép so của bản gốc (thứ tự khoá có nghĩa).
function eq(label: string, got: unknown, want: unknown) {
  test(label, () => { expect(JSON.stringify(got)).toBe(JSON.stringify(want)); });
}
const targets = (list: LiveSession[]) => Object.fromEntries(list.map((s) => [s.id, s.targetGmv]));

// Kế hoạch 100tr = 2 ca × 50tr. Ca A đã chốt người (có session), ca B chưa.
const planMonthTotals = new Map([[`${B}|${M}`, 100_000_000]]);

// 1) Ca kế hoạch đã chốt người giữ đúng target ops đã chốt.
{
  const A = ca("A", "2026-09-25", "09:00", "12:00");
  const out = applyAllocatedTargets([A], new Map([["A", 50_000_000]]), planMonthTotals);
  eq("ca kế hoạch giữ đúng target/ca", targets(out), { A: 50_000_000 });
}

// 2) CA CHÍNH của Đ5: ca mở lẻ KHÔNG được ăn phần target của ca kế hoạch chưa xếp người.
//    Σ plan = 100tr, mới xếp 50tr ⇒ dư 50tr là của ca B chưa xếp, không phải của C.
{
  const A = ca("A", "2026-09-25", "09:00", "12:00");
  const C = ca("C", "2026-09-23", "09:00", "12:00"); // ops mở tay, ngoài kế hoạch
  const out = applyAllocatedTargets([A, C], new Map([["A", 50_000_000]]), planMonthTotals);
  eq("off-plan không ăn phần của ca chưa xếp", targets(out), { A: 50_000_000, C: 0 });
}

// 3) Không có Kế Hoạch Tháng chốt ⇒ giữ nguyên target đang có trong DB (gộp cấu hình 06/10: không còn target khung
//    camp nhập ở Nhập Ads — nguồn target duy nhất là Kế Hoạch Tháng).
{
  const X = ca("X", "2026-09-10", "09:00", "12:00", { targetGmv: 7 });
  const input = [X];
  const out = applyAllocatedTargets(input, new Map(), new Map());
  eq("không có kế hoạch → giữ target DB, trả đúng mảng", out === input && out[0].targetGmv === 7, true);
}

// 4) Ca huỷ không mang target và không làm mất target của ca còn lại.
{
  const A = ca("A", "2026-09-25", "09:00", "12:00");
  const D = ca("D", "2026-09-26", "09:00", "12:00", { status: "Cancelled" });
  const out = applyAllocatedTargets([A, D], new Map([["A", 50_000_000]]), planMonthTotals);
  eq("ca huỷ giữ target 0", targets(out).D, 0);
}

// 5) Giữ IDENTITY của mảng khi không có gì đổi (quy ước chống re-render mỗi 60s).
{
  const A = ca("A", "2026-09-25", "09:00", "12:00", { targetGmv: 50_000_000 });
  const input = [A];
  const out = applyAllocatedTargets(input, new Map([["A", 50_000_000]]), planMonthTotals);
  eq("không đổi → trả đúng mảng đầu vào", out === input, true);
}

