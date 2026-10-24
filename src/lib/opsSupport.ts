import { BrandMonthPlan, LiveSession } from "../types";
import { CalendarEvent, DateRange, HistorySummary, cellsForWindow, estimateSlots } from "./scheduling/suggestEngine";
import { sessionHours } from "./performance/hostPerformance";
import { sessionDurationHours } from "./pnl";

// Module hỗ trợ vận hành (2026-09-21, user chốt): tầng "target vận hành" TÁCH khỏi target cam kết của
// Kế Hoạch Tháng đã chốt. Không ghi gì vào DB, không đọc số realtime — chỉ tính từ ca đã xong + kế
// hoạch đã chốt + ma trận lịch sử của engine, đưa ra: (1) run-rate & dự kiến cuối tháng + phương án
// bù (đề xuất, ops tự quyết thêm ca ở Kế Hoạch Tháng); (2) benchmark cho ca sắp live để ops tự đối
// chiếu bằng mắt với dashboard TikTok trong phiên.

export interface EstimateCtx {
  camp?: BrandMonthPlan["campRanges"];
  events?: CalendarEvent[];
  schemes?: DateRange[];
  calibration?: Map<string, number>;
}

// ============ Benchmark cho ca sắp live ============

export interface SessionBenchmark {
  hours: number;
  expectedGmv: number; // đã nhân hệ số ngày (camp/lễ/scheme) + hiệu chỉnh
  gmvPerHour: number;
  viewsPerHour: number;
  expectedViews: number;
  conversion: number; // đơn / người xem
  expectedOrders: number;
  aov: number;
  liveCtr: number | null; // click sản phẩm / lượt xem — từ ca có file của brand cùng thứ
  adsPerHour: number | null; // từ report (adsCost) của brand
  dayFactor: number; // dự báo / (GMV-giờ nền × giờ) — >1 là ngày camp/lễ/scheme
  thin: boolean; // ô lịch sử mỏng (< 3 ca) → chỉ tham khảo
  cellTags: string[];
}

export function benchmarkForWindow(
  history: HistorySummary,
  brandSessions: LiveSession[],
  win: { date: string; startTime: string; endTime: string },
  ctx: EstimateCtx
): SessionBenchmark | null {
  if (history.brandGmvPerHour <= 0) return null;
  const hours = sessionDurationHours(win.startTime, win.endTime);
  if (hours <= 0) return null;
  const segs = cellsForWindow(history, win.date, win.startTime, win.endTime);
  let vph = 0, cvrW = 0, gmv = 0, orders = 0, hoursKnown = 0, n = 0;
  const tags = new Set<string>();
  for (const sg of segs) {
    if (!sg.cell) continue;
    vph += sg.cell.viewsPerHour * sg.hours;
    cvrW += sg.cell.conversion * sg.hours;
    gmv += sg.cell.gmv;
    orders += sg.cell.orders;
    hoursKnown += sg.hours;
    n = Math.max(n, sg.cell.n);
    tags.add(sg.cell.tag);
  }
  const expectedGmv = estimateSlots(history, [win], ctx)[0] ?? 0;
  const viewsPerHour = hoursKnown > 0 ? vph / hoursKnown : 0;
  const conversion = hoursKnown > 0 ? cvrW / hoursKnown : 0;
  const aov = orders > 0 ? gmv / orders : 0;
  const baseGph = hoursKnown > 0 ? segs.reduce((a, sg) => a + (sg.cell ? sg.cell.gmvPerHour * sg.hours : 0), 0) / hoursKnown : history.brandGmvPerHour;
  const dayFactor = baseGph > 0 ? expectedGmv / (baseGph * hours) : 1;
  // CTR live & ads: engine không học 2 chỉ số này → lấy trung vị từ ca có file/report của brand cùng thứ.
  const wd = new Date(`${win.date}T00:00:00`).getDay();
  const sameWd = brandSessions.filter((s) => s.status === "Completed" && new Date(`${s.date}T00:00:00`).getDay() === wd);
  const ctrs = sameWd.filter((s) => (s.productClicks ?? 0) > 0 && s.totalViews > 0).map((s) => (s.productClicks! / s.totalViews) * 100);
  const ads = brandSessions.filter((s) => s.status === "Completed" && (s.report?.adsCost ?? 0) > 0).map((s) => s.report!.adsCost! / Math.max(0.5, sessionHours(s)));
  const median = (xs: number[]) => { if (xs.length === 0) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const scaledViews = viewsPerHour * hours * Math.max(dayFactor, 1);
  return {
    hours,
    expectedGmv,
    gmvPerHour: hours > 0 ? expectedGmv / hours : 0,
    viewsPerHour: viewsPerHour * Math.max(dayFactor, 1),
    expectedViews: scaledViews,
    conversion,
    expectedOrders: scaledViews * conversion,
    aov,
    liveCtr: median(ctrs),
    adsPerHour: median(ads),
    dayFactor,
    thin: n < 3 || hoursKnown < hours * 0.5,
    cellTags: [...tags]
  };
}
