import { LiveSession } from "../../types";
import { CreatorLivePerfMonthSlice, CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import { DailyLivePerformance, LivePerformanceMonthSlice } from "../dataraw/monthlyDailySlice";

// Report Tháng — đổi nguồn số (user chốt 2026-09-21): phần Livestream/Tổng quan đọc từ `live_sessions`
// đã có số (đối soát / snapshot / nạp bù) thay vì phụ thuộc file Creator-Live-Performance up ở Dữ
// Liệu Gốc. Cùng một file TikTok đó giờ đi vào ca (snapshot 0078, nạp bù 0086, đối soát 0080) nên
// ca là nguồn sự thật gần hơn: có host, có target kế hoạch, có trạng thái tin cậy. Để KHÔNG viết lại
// 2.000 dòng Report Tháng, ca được chiếu về đúng hình dạng `CreatorLivePerfRow` mà Tab 01/02 đang ăn.
// Tháng nào không có ca nào có số (tháng cũ chưa nạp bù) thì Report tự rơi về file Dataraw như trước.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const vnIso = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - VN_OFFSET_MS).toISOString();

export const hasLiveNumbers = (s: LiveSession) =>
  s.status === "Completed" && (s.dataSource === "tiktok_reconciled" || s.dataSource === "live_snapshot" || s.actualGmv > 0);

export function sessionsInRange(sessions: LiveSession[], brandId: string, start: string, end: string): LiveSession[] {
  return sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && hasLiveNumbers(s));
}

export function sessionToLivePerfRow(s: LiveSession): CreatorLivePerfRow {
  const hours = s.liveDurationMinutes && s.liveDurationMinutes > 0 ? s.liveDurationMinutes / 60 : hoursOf(s.startTime, s.endTime);
  const views = s.totalViews ?? 0;
  const impressions = s.impressions ?? 0;
  const productImpressions = s.productImpressions ?? 0;
  const productClicks = s.productClicks ?? 0;
  const orders = s.totalOrders ?? 0;
  const gmv = s.actualGmv ?? 0;
  return {
    roomId: s.liveRoomIds?.[0],
    roomTitle: [s.hostName, s.title].filter(Boolean).join(" · "),
    startTime: s.actualStartAt ?? vnIso(s.date, s.startTime),
    endTime: s.actualEndAt ?? undefined,
    hours,
    gmv,
    itemsSold: s.attributedItemsSold ?? 0,
    orders,
    skuOrders: s.attributedSkuOrders ?? 0,
    customers: 0,
    aov: orders > 0 ? gmv / orders : 0,
    views,
    impressions,
    gmvPerHour: hours > 0 ? gmv / hours : 0,
    avgViewDurationSec: s.avgWatchTimeSeconds ?? 0,
    liveCtr: impressions > 0 ? (views / impressions) * 100 : 0,
    productImpressions,
    productClicks,
    ctr: productImpressions > 0 ? (productClicks / productImpressions) * 100 : 0,
    ctor: productClicks > 0 ? (orders / productClicks) * 100 : 0,
    newFollowers: s.newFollowers ?? 0,
    comments: s.commentsCount ?? 0,
    shares: s.sharesCount ?? 0,
    likes: s.likesCount ?? 0,
    sourceRow: { sessionId: s.id, dataSource: s.dataSource, hostName: s.hostName }
  };
}

function hoursOf(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m <= 0) m += 24 * 60;
  return m / 60;
}

export interface LivePerfSource {
  slice: CreatorLivePerfMonthSlice;
  source: "sessions" | "dataraw" | "none";
  sessionCount: number;
  reconciled: number;
  snapshot: number;
  manual: number;
}

// Ưu tiên ca; không có ca nào có số trong tháng → file Dataraw (đã fetch sẵn) → không có gì.
export function pickLivePerfSource(sessions: LiveSession[], brandId: string, start: string, end: string, dataraw: CreatorLivePerfMonthSlice | null): LivePerfSource {
  const ss = sessionsInRange(sessions, brandId, start, end);
  if (ss.length > 0) {
    const rows = ss.map(sessionToLivePerfRow).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return {
      slice: { rows, missingDays: [], hasAnyBatch: true },
      source: "sessions",
      sessionCount: ss.length,
      reconciled: ss.filter((s) => s.dataSource === "tiktok_reconciled").length,
      snapshot: ss.filter((s) => s.dataSource === "live_snapshot").length,
      manual: ss.filter((s) => s.dataSource === "manual").length
    };
  }
  if (dataraw?.hasAnyBatch) return { slice: dataraw, source: "dataraw", sessionCount: 0, reconciled: 0, snapshot: 0, manual: 0 };
  return { slice: dataraw ?? { rows: [], missingDays: [], hasAnyBatch: false }, source: "none", sessionCount: 0, reconciled: 0, snapshot: 0, manual: 0 };
}

// "Diễn biến GMV theo ngày" khi không có file Live Performance Core Stats: gộp ca theo ngày. GMV gián
// tiếp (đơn sau live) không có trong ca → 0; GPM = GMV / 1000 lượt hiển thị.
export function dailyFromSessions(sessions: LiveSession[], brandId: string, start: string, end: string): LivePerformanceMonthSlice {
  const ss = sessionsInRange(sessions, brandId, start, end);
  if (ss.length === 0) return { daily: [], missingDays: [], hasAnyBatch: false };
  const by = new Map<string, DailyLivePerformance>();
  for (const s of ss) {
    const d = by.get(s.date) ?? { date: s.date, gmvLiveSession: 0, gmvLive: 0, gmvIndirect: 0, gpm: 0, sessions: 0, itemsSoldLive: 0, ordersSkuLive: 0, views: 0, ctrLive: 0, ctorLive: 0 };
    d.gmvLiveSession += s.actualGmv ?? 0;
    d.gmvLive += s.actualGmv ?? 0;
    d.sessions += 1;
    d.itemsSoldLive += s.attributedItemsSold ?? 0;
    d.ordersSkuLive += s.attributedSkuOrders ?? 0;
    d.views += s.totalViews ?? 0;
    by.set(s.date, d);
  }
  const daily = [...by.values()].sort((a, b) => a.date.localeCompare(b.date));
  // GPM/CTR/CTOR theo ngày tính lại từ số đếm của các ca trong ngày.
  for (const d of daily) {
    const day = ss.filter((s) => s.date === d.date);
    const imp = day.reduce((a, s) => a + (s.impressions ?? 0), 0);
    const pImp = day.reduce((a, s) => a + (s.productImpressions ?? 0), 0);
    const clicks = day.reduce((a, s) => a + (s.productClicks ?? 0), 0);
    const orders = day.reduce((a, s) => a + (s.totalOrders ?? 0), 0);
    d.gpm = imp > 0 ? d.gmvLiveSession / (imp / 1000) : 0;
    d.ctrLive = pImp > 0 ? (clicks / pImp) * 100 : 0;
    d.ctorLive = clicks > 0 ? (orders / clicks) * 100 : 0;
  }
  return { daily, missingDays: [], hasAnyBatch: true };
}

// Run-rate tháng theo target kế hoạch đã đổ xuống ca (applyAllocatedTargets): ca xong có số vs
// target của chính nó; phần còn lại = target ca chưa diễn ra × run-rate.
export interface MonthRunRate {
  targetTotal: number;
  doneCount: number;
  pendingCount: number;
  actualDone: number;
  targetDone: number;
  targetPending: number;
  runRate: number | null;
  projected: number;
  gap: number;
}

export function monthRunRate(sessions: LiveSession[], brandId: string, start: string, end: string): MonthRunRate | null {
  const ss = sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status !== "Cancelled" && (s.targetGmv ?? 0) > 0);
  if (ss.length === 0) return null;
  const done = ss.filter(hasLiveNumbers);
  const pending = ss.filter((s) => s.status === "Upcoming" || s.status === "Live Now");
  const sum = (xs: LiveSession[], f: (s: LiveSession) => number) => xs.reduce((a, s) => a + f(s), 0);
  const targetTotal = sum(ss, (s) => s.targetGmv);
  const actualDone = sum(done, (s) => s.actualGmv ?? 0);
  const targetDone = sum(done, (s) => s.targetGmv);
  const targetPending = sum(pending, (s) => s.targetGmv);
  const runRate = targetDone > 0 ? actualDone / targetDone : null;
  const projected = actualDone + targetPending * (runRate ?? 1);
  return { targetTotal, doneCount: done.length, pendingCount: pending.length, actualDone, targetDone, targetPending, runRate, projected, gap: targetTotal - projected };
}
