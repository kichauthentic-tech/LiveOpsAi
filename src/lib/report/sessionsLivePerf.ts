import { LiveSession } from "../../types";
import type { MonthEndProjection, PlanRunRate } from "../performance/planRunRate";
import { isCountable, sessionHours } from "../performance/hostPerformance";
import { CreatorLivePerfMonthSlice, CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";

// Report Tháng — đổi nguồn số (user chốt 2026-09-21): phần Livestream/Tổng quan đọc từ `live_sessions`
// đã có số (đối soát / snapshot / nạp bù) thay vì phụ thuộc file Creator-Live-Performance up ở Dữ
// Liệu Gốc. Cùng một file TikTok đó giờ đi vào ca (snapshot 0078, nạp bù 0086, đối soát 0080) nên
// ca là nguồn sự thật gần hơn: có host, có target kế hoạch, có trạng thái tin cậy. Để KHÔNG viết lại
// 2.000 dòng Report Tháng, ca được chiếu về đúng hình dạng `CreatorLivePerfRow` mà Tab 01/02 đang ăn.
// Tháng nào không có ca nào có số (tháng cũ chưa nạp bù) thì Report tự rơi về file Dataraw như trước.

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const vnIso = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - VN_OFFSET_MS).toISOString();

// Bí danh của isCountable (hostPerformance.ts) — một định nghĩa "ca có số" cho Report và mọi màn khác (audit 2026-09-28 mục 6).
export const hasLiveNumbers = isCountable;

export function sessionsInRange(sessions: LiveSession[], brandId: string, start: string, end: string): LiveSession[] {
  return sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && hasLiveNumbers(s));
}

export function sessionToLivePerfRow(s: LiveSession): CreatorLivePerfRow {
  // Cùng hàm giờ với Hiệu Suất Host / Sổ Ca / Bản Tin CEO (audit 2026-09-28 mục 7: bản riêng ở đây coi giờ bắt đầu =
  // giờ kết thúc là 24 giờ, pnl.sessionDurationHours coi là 0).
  const hours = sessionHours(s);
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
    // Cùng nghĩa cột "LIVE CTR" của file TikTok (Product clicks ÷ Views), không phải Views ÷ impressions (= ERR).
    liveCtr: views > 0 ? (productClicks / views) * 100 : 0,
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

/**
 * Tháng có Kế Hoạch Tháng ĐÃ CHỐT ⇒ run-rate theo plan ban đầu (planRunRate, luật user chốt 2026-09-28:
 * ca huỷ giữ target, ca ngoài plan target = 0) — cùng một số với Dashboard brand. Chỉ tháng chưa có
 * kế hoạch chốt mới rơi về `monthRunRate` (target đã đổ xuống ca từ Report Tháng tab 05).
 */
export function monthRunRateFromPlan(r: PlanRunRate, projection?: MonthEndProjection): MonthRunRate | null {
  if (r.total.target <= 0) return null;
  const done = r.slots.filter((t) => t.state === "done").length + r.offPlan.length;
  // Dự kiến cuối tháng: projectMonthEnd (cùng số Dashboard brand + Bản Tin CEO — audit 2026-09-28 mục 3).
  const projected = projection?.value ?? r.total.keepPace ?? r.total.actual;
  return {
    targetTotal: r.total.target,
    doneCount: done,
    pendingCount: r.slots.filter((t) => t.state === "pending").length,
    actualDone: r.total.actual,
    targetDone: r.total.targetToDate,
    targetPending: r.total.target - r.total.targetToDate,
    runRate: r.total.runRate,
    projected,
    gap: r.total.target - projected
  };
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
