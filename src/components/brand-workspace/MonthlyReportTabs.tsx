import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ResponsiveContainer, ComposedChart, LineChart, ReferenceLine, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ScatterChart, Scatter } from "recharts";
import { BarChart3, Flame, ListOrdered, ShoppingBag, Megaphone, AlertTriangle, CalendarClock, PieChart as PieChartIcon, Activity, Download, Scale } from "lucide-react";
import { LiveSession, BrandMonthlyReport as BrandMonthlyReportType, BrandPlatformRate, ShiftSlot } from "../../types";
import { METRIC, metricHint } from "../../lib/metricGlossary";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { monthRunRate, monthRunRateFromPlan, pickLivePerfSource } from "../../lib/report/sessionsLivePerf";
import { planRunRate, projectMonthEnd } from "../../lib/performance/planRunRate";
import { monthOutlook } from "../../lib/performance/ceoBrief";
import { todayVn } from "../../lib/performance/brandCommitment";
import { hydrateSnapshotSessions, MonthlyReportSnapshot, reportWindow, snapshotView } from "../../lib/report/monthlySnapshot";
import { autoNextSteps, autoSummary, campCompare, channelMix, compareWindow, DRIVER_LABEL, driverBreakdown, liveStatsFromRows, LiveStats, NarrativeInput, pctChange, planCampAllocation, RATE_FACTORS, shopKpiProgress, shopTotals, skuMoves, trendSignal } from "../../lib/report/monthlyReportInsights";
import { controlGroup, liveGmvByDate, controlLabel, controlLine, controlVerdict, dailyGap, dailyGapLine, dayGroupStats, GIFT_MAX_PRICE, giftLine, giftStats, GiftStats, hostReliability, mixRateSplit, VERDICT_TEXT } from "../../lib/report/deepAnalysis";
import { CreatorLivePerfRow, vnDateOf } from "../../lib/dataraw/creatorLivePerfSlice";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import type { BrandMonthPlan, BrandMonthPlanSlot } from "../../types";
import { fetchMonthlyReport, saveMonthlyReportNarrative, saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import { contextInsight, HostInsightRow, hostVsPeer, InsightSection, insightToText, parseInsightText, peopleInsight, productsInsight, sectionNextSteps, SectionInsight, shopInsight, shortSku, whyInsight } from "../../lib/report/sectionInsights";
import { CAMP_DAY_BUCKET_LABEL, CAMP_DAY_BUCKET_ORDER, effectiveCamp, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../../lib/campaignDays";
import { dailyRhythm, liveFunnel, sessionSpread } from "../../lib/report/rhythm";
import { adsMonthStats, adsPrevSameCut } from "../../lib/dataraw/adsCampaignOverview";
import { errorMessage } from "../../lib/errorMessage";
import { fmtKeyMetric, KEY_METRICS, keyMetricSheetColumns, keyMetricSheetLabel, keyMetricSheetValue, keyMetricValue, type KeyMetrics } from "../../lib/report/keyMetrics";
import { byHost, byHostDayType, dayTypeTeamTotals, dayTypeMetrics, HOST_DAY_TYPE_ORDER, dataQuality, filterSessions, hostKey, splitUnassignedHost, DataQuality } from "../../lib/performance/hostPerformance";

import { fmtDateVn, fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { CHANNELS, DAY_TYPE_SHORT, LINK_BTN, PAL, SECTIONS, chartTooltipStyle } from "./report/theme";
import { chartNum, fmtHours, fmtInt, fmtPct, fmtSessionStart, monthRangeLocal, nextMonthStrLocal, prevMonthStrLocal, promoStatusLabel } from "./report/format";
import { ChartLegend, InsightBox, KpiTile, NarrativeEditor, Panel, ProgressBar, ReportTable, SectionDetail, SectionHead, WaterfallPanel, toWaterfall } from "./report/ui";
import { HostPerformancePanel } from "./report/HostPerformancePanel";
interface MonthlyReportTabsProps {
  brandId: string;
  brandName: string;
  month: string;
  // Bản chụp số liệu (migration 0119, lib/report/monthlySnapshot.ts) — MỌI con số của tab 01–04 lấy
  // từ đây: ca, target kế hoạch (Đ5, xem scheduledTargetGmv), rate card, slice Dữ Liệu Gốc. Không tự
  // tải Dữ Liệu Gốc nữa.
  snapshot: MonthlyReportSnapshot;
  // Ca SỐNG của app — chỉ dùng cho (a) Tab 05 Phân Tích Sâu (ops-only, vẫn tính trực tiếp) và (b) biết
  // tháng nào brand đã được phát hành (monthPublished) để che số tháng chưa phát hành khỏi cột so sánh.
  liveSessions: LiveSession[];
  // Ca chờ đăng ký (shift_slots) SỐNG — chỉ để run-rate nối ca kế hoạch → ca thật đúng đường Dashboard brand
  // (audit 2026-09-28 mục 5: truyền [] thì ca chờ đã huỷ thành "chưa diễn ra", ca dời giờ thành "ngoài kế hoạch").
  shiftSlots?: ShiftSlot[];
  canManage: boolean;
}

export const MonthlyReportTabs: React.FC<MonthlyReportTabsProps> = ({ brandId, brandName, month, snapshot, liveSessions, shiftSlots = [], canManage }) => {

  // Brand KHÔNG được thấy số của tháng chưa phát hành (quyết định 2026-09-22, 0107) — kể cả qua cột
  // "tháng trước"/biểu đồ xu hướng của report tháng này. Bản chụp do ops dựng nên có đủ số 4 tháng;
  // với brand, bỏ hẳn ca + slice của các tháng trong cửa sổ chưa phát hành (đọc cờ monthPublished của
  // ca sống — nguồn sự thật hiện tại, không phải lúc chốt). Tháng report thì đã phát hành (brand đọc
  // được bản chụp là nhờ vậy).
  const hiddenMonths = useMemo(() => {
    if (canManage) return new Set<string>();
    const published = new Set(liveSessions.filter((s) => s.brandId === brandId && s.monthPublished).map((s) => s.date.slice(0, 7)));
    return new Set(reportWindow(month).filter((m) => m !== month && !published.has(m)));
  }, [canManage, liveSessions, brandId, month]);
  const sessions = useMemo(
    // Bản chụp chụp trước 06/10 còn lẫn ca Shopee — Report này là TikTok.
    () => hydrateSnapshotSessions(snapshot).filter((s) => s.platform === "TikTok" && !hiddenMonths.has(s.date.slice(0, 7))),
    [snapshot, hiddenMonths]
  );
  const brandPlatformRates: BrandPlatformRate[] = snapshot.rates;
  const planMonthTotals = useMemo(() => new Map(Object.entries(snapshot.planMonthTotals)), [snapshot]);
  const view = useMemo(() => snapshotView(snapshot), [snapshot]);

  // Dòng brand_monthly_reports của tháng: tóm tắt/việc tháng sau/Insight đã sửa. Khung camp + target lấy từ Kế Hoạch
  // Tháng (gộp cấu hình 06/10 — trước đó tháng không có kế hoạch đọc khung/target khung nhập ở Nhập Ads).
  const [monthlyReportRow, setMonthlyReportRow] = useState<BrandMonthlyReportType | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMonthlyReport(brandId, `${month}-01`)
      .then((row) => !cancelled && setMonthlyReportRow(row))
      .catch(() => !cancelled && setMonthlyReportRow(null));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const { start, end } = useMemo(() => monthRangeLocal(month), [month]);
  const prevMonth = useMemo(() => prevMonthStrLocal(month), [month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthRangeLocal(prevMonth), [prevMonth]);
  const last4Months = useMemo(() => {
    const out: string[] = [];
    let m = month;
    for (let i = 0; i < 4; i++) {
      out.unshift(m);
      m = prevMonthStrLocal(m);
    }
    return out;
  }, [month]);

  // Đổi nguồn số (2026-09-21): file Dataraw chỉ còn là DỰ PHÒNG — tháng nào có ca có số thì đọc từ ca
  // (lib/report/sessionsLivePerf.ts). *Raw = slice từ Dataraw (bản chụp chỉ giữ slice này cho tháng CHƯA có ca
  // nào có số); liveCurrent/livePrev = nguồn đã chọn.
  const hidden = (m: string) => hiddenMonths.has(m);
  const liveCurrentRaw = view.liveRaw[month] ?? null;
  const livePrevRaw = hidden(prevMonth) ? null : (view.liveRaw[prevMonth] ?? null);
  const liveOlderMonths = useMemo(
    () => Object.fromEntries(Object.entries(view.liveRaw).map(([m, v]) => [m, hiddenMonths.has(m) ? null : v])),
    [view, hiddenMonths]
  );
  const topSku = view.topSku;
  const topPromo = view.topPromo;

  const liveSource = useMemo(() => pickLivePerfSource(sessions, brandId, start, end, liveCurrentRaw), [sessions, brandId, start, end, liveCurrentRaw]);
  const livePrevSource = useMemo(() => pickLivePerfSource(sessions, brandId, prevStart, prevEnd, livePrevRaw), [sessions, brandId, prevStart, prevEnd, livePrevRaw]);
  const liveCurrent = liveSource.slice;
  const livePrev = livePrevSource.slice;

  // Kế Hoạch Tháng của tháng trước / tháng này / tháng sau — nguồn khoảng ngày camp + target từng khung (tháng này)
  // và phân bổ tháng sau (phần 7). Bảng nhỏ, đọc thẳng, không đưa vào bản chụp.
  const [plans, setPlans] = useState<Record<string, { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>>({});
  const nextMonth = useMemo(() => nextMonthStrLocal(month), [month]);
  // Run-rate: tháng có Kế Hoạch Tháng đã chốt ⇒ theo plan ban đầu (planRunRate — cùng số với Dashboard brand).
  const runRate = useMemo(() => {
    const p = plans[month];
    if (p?.plan.status === "locked") {
      const bs = sessions.filter((s) => s.brandId === brandId);
      // Cùng khung camp hiệu lực với phần còn lại của report (effectiveCamp — audit workflow #8); trước đây
      // run-rate đọc khung Kế Hoạch Tháng còn bảng khung camp đọc khung đã ghi đè ⇒ hai khung trong một trang.
      const camp = effectiveCamp(p.plan.campRanges);
      const rr = planRunRate(month, p.slots, shiftSlots, bs, todayVn(), camp);
      const open = shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
      return monthRunRateFromPlan(rr, projectMonthEnd(rr, monthOutlook(month, todayVn(), bs, open, null, camp)));
    }
    return monthRunRate(sessions, brandId, start, end);
  }, [plans, month, sessions, brandId, start, end, shiftSlots]);
  useEffect(() => {
    let cancelled = false;
    const ms = [prevMonth, month, nextMonth];
    Promise.all(ms.map((m) => fetchMonthPlan(brandId, m).catch(() => null))).then((rs) => {
      if (!cancelled) setPlans(Object.fromEntries(ms.map((m, i) => [m, rs[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, prevMonth, month, nextMonth]);
  const planCur = plans[month] ?? null;
  const nextPlanFull = plans[nextMonth] ?? null;

  // Khung camp D-Day/Mid-Month/Pay Day, từng khung: khoảng nhập ở Nhập Ads (0071) → khoảng của Kế Hoạch
  // Tháng (0094) → lịch camp cố định (lib/campaignDays.ts).
  const campOverrides: CampOverrides = useMemo(() => effectiveCamp(planCur?.plan.campRanges), [planCur]);
  // Tháng trước phân loại theo khoảng camp của CHÍNH tháng trước — đem khoảng của tháng này áp vào thì ngày camp
  // tháng trước (vd D-Day 8/8) bị tính thành ngày thường vì khung đó đã bị ghi đè.
  const prevCampOverrides: CampOverrides = useMemo(() => effectiveCamp(plans[prevMonth]?.plan.campRanges), [plans, prevMonth]);
  const bucketCur = useMemo(() => (d: string) => resolveCampBucketType(d, campOverrides), [campOverrides]);
  const bucketPrev = useMemo(() => (d: string) => resolveCampBucketType(d, prevCampOverrides), [prevCampOverrides]);
  // Ads toàn cửa hàng (file TikTok Ads, migration 0137) — tháng report + tháng trước cắt cùng số ngày, chia theo cùng
  // khung camp hiệu lực như mọi bảng khác của report. null = tháng không có file (hoặc bản chụp trước 05/10).
  const adsCurSlice = view.ads[month] ?? null;
  const adsPrevSlice = hidden(prevMonth) ? null : (view.ads[prevMonth] ?? null);
  const adsCur = useMemo(() => (adsCurSlice?.days.length ? adsMonthStats(adsCurSlice.days, bucketCur) : null), [adsCurSlice, bucketCur]);
  const adsPrev = useMemo(
    () => (adsCurSlice?.days.length && adsPrevSlice?.days.length ? adsMonthStats(adsPrevSameCut(adsCurSlice.days, adsPrevSlice.days, end), bucketPrev) : null),
    [adsCurSlice, adsPrevSlice, end, bucketPrev]
  );
  // Tháng cũ hơn chưa đọc Kế Hoạch Tháng ⇒ lịch camp mặc định.
  const bucketAny = useMemo(
    () => (d: string) => (d.startsWith(month) ? bucketCur(d) : d.startsWith(prevMonth) ? bucketPrev(d) : resolveCampBucketType(d)),
    [month, prevMonth, bucketCur, bucketPrev]
  );

  const topSessions = useMemo(() => [...(liveCurrent?.rows ?? [])].sort((a, b) => b.gmv - a.gmv).slice(0, 10), [liveCurrent]);

  const completedInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status === "Completed"),
    [sessions, brandId, start, end]
  );

  // Host Performance — tổng hợp từ ca (Creator-Live-Performance không có tên host), dùng đúng
  // lib/performance/hostPerformance.ts như tab Hiệu Suất Host của agency: hai màn không được nói hai số về một người.
  interface HostPerfRow {
    key: string;
    hostName: string;
    sessionCount: number;
    quality: DataQuality;
    gmv: number;
    orders: number;
    hours: number;
    gmvPerHour: number | null;
    ctr: number | null;
    m: KeyMetrics;
  }
  const hostPerformance = useMemo<HostPerfRow[]>(() => {
    const tiktokSessions = filterSessions(
      completedInPeriod.filter((s) => s.platform === "TikTok"),
      {}
    );
    const byKey = new Map<string, LiveSession[]>();
    for (const s of tiktokSessions) {
      const list = byKey.get(hostKey(s)) ?? [];
      list.push(s);
      byKey.set(hostKey(s), list);
    }
    // Ca chưa gán host tách khỏi bảng host (audit 2026-09-21): gom mọi ca vô danh thành một dòng rồi xếp hạng
    // chung với người thật là so sai đối tượng.
    return splitUnassignedHost(byHost(tiktokSessions))
      .ranked.sort((a, b) => b.gmv - a.gmv)
      .map((r) => ({
        key: r.key,
        hostName: r.label,
        sessionCount: r.sessionCount,
        quality: dataQuality(byKey.get(r.key) ?? []),
        gmv: r.gmv,
        orders: r.orders,
        hours: r.hours,
        gmvPerHour: r.hours > 0 ? r.gmvPerHour : null,
        ctr: r.productImpressions > 0 ? r.ctr : null,
        m: r
      }));
  }, [completedInPeriod]);
  const hostQuality = useMemo(() => dataQuality(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {})), [completedInPeriod]);
  const unassignedHost = useMemo(
    () => splitUnassignedHost(byHost(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}))).unassigned,
    [completedInPeriod]
  );

  // Target GMV = target CAM KẾT của tháng (Đ5, 2026-09-24): tháng có Kế Hoạch Tháng ĐÃ CHỐT thì lấy tổng target của
  // kế hoạch đó; không có thì cộng target các ca chưa huỷ (cách cũ). Chỉ áp cho khoảng đúng bằng TRỌN 1 tháng.
  const wholeMonthKey = (s: string, e: string): string | null => {
    if (s.slice(0, 7) !== e.slice(0, 7) || !s.endsWith("-01")) return null;
    const { end: lastDay } = monthRangeLocal(s.slice(0, 7));
    return e === lastDay ? `${brandId}|${s.slice(0, 7)}` : null;
  };
  const plannedMonthTarget = (s: string, e: string): number | null => {
    const key = wholeMonthKey(s, e);
    const total = key ? planMonthTotals?.get(key) : undefined;
    return total !== undefined && total > 0 ? total : null;
  };
  const sumSessionTargets = (s: string, e: string) =>
    sessions
      .filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status !== "Cancelled")
      .reduce((sum, x) => sum + (x.targetGmv || 0), 0);
  const scheduledTargetGmv = (s: string, e: string) => plannedMonthTarget(s, e) ?? sumSessionTargets(s, e);

  const hasReturnRateConfig = brandPlatformRates.some((r) => r.brandId === brandId);
  const kpiTargetGmvCurRaw = scheduledTargetGmv(start, end);
  const kpiTargetGmvCur = kpiTargetGmvCurRaw > 0 ? kpiTargetGmvCurRaw : null;

  // So cùng số ngày: tháng report chưa có số tới ngày cuối thì so 1..N với 1..N tháng trước — so với trọn tháng
  // trước từng ra −40% cho T9 CROCS trong khi cùng kỳ chỉ −18%.
  const cmp = useMemo(() => compareWindow(month, snapshot.coverage.sessionsThrough), [month, snapshot]);
  // Bảng khung camp — MỖI khung so với CHÍNH khung đó tháng trước. Target: Kế Hoạch Tháng ĐÃ CHỐT (cộng target ca
  // theo khung); không có kế hoạch chốt ⇒ không có target (không còn ô nhập tay ở Nhập Ads — gộp cấu hình 06/10).
  const planCampTargets = useMemo(() => {
    if (!planCur || planCur.plan.status !== "locked" || planCur.slots.length === 0) return null;
    return Object.fromEntries(planCampAllocation(planCur.slots, campOverrides).map((a) => [a.key, a.target > 0 ? a.target : null])) as Record<CampDayBucket, number | null>;
  }, [planCur, campOverrides]);
  const campTargetSource = "Kế Hoạch Tháng đã chốt";
  const prevColLabel = cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `Tháng ${prevMonth.slice(5)}`;
  const campDetailRows = useMemo(() => {
    const targets: Record<CampDayBucket, number | null> = planCampTargets ?? { dday: null, midmonth: null, payday: null, daily: null };
    return campCompare(liveCurrent?.rows ?? [], { start: cmp.curStart, end: cmp.curEnd, overrides: campOverrides }, livePrev?.rows ?? [], { start: cmp.prevStart, end: cmp.prevEnd, overrides: prevCampOverrides }, targets).map((r) => ({
      ...r,
      label: CAMP_DAY_BUCKET_LABEL[r.key],
      actual: r.cur.gmv,
      hours: r.cur.hours,
      gmvPerHour: r.cur.gmvPerHour,
      ctr: r.cur.ctr,
      ctor: r.cur.ctor
    }));
  }, [liveCurrent, livePrev, cmp, campOverrides, prevCampOverrides, planCampTargets]);

  // ============================ Số của 7 phần ============================
  // Phép tính nằm ở lib/report/monthlyReportInsights.ts + deepAnalysis.ts (thuần, có test). Ở đây chỉ nối dây.

  const liveCurStats = useMemo(() => liveStatsFromRows(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd), [liveCurrent, cmp]);
  const livePrevStats = useMemo(() => liveStatsFromRows(livePrev?.rows ?? [], cmp.prevStart, cmp.prevEnd), [livePrev, cmp]);
  const drivers = useMemo(() => driverBreakdown(livePrevStats, liveCurStats), [livePrevStats, liveCurStats]);
  const waterfallData = useMemo(() => toWaterfall(drivers, cmp, month, prevMonth), [drivers, cmp, month, prevMonth]);

  const rowsOf = (m: string) => {
    const { start: s, end: e } = monthRangeLocal(m);
    return m === month ? liveCurrent?.rows ?? [] : m === prevMonth ? livePrev?.rows ?? [] : pickLivePerfSource(sessions, brandId, s, e, liveOlderMonths[m] ?? null).slice.rows;
  };
  // Xu hướng 4 tháng CÙNG SỐ NGÀY (tháng chưa hết thì mọi tháng cắt 1..N): đặt 3 tháng trọn cạnh tháng mới 22 ngày
  // từng sinh câu "giảm 4 tháng liên tiếp" so lệch kỳ. Cơ cấu kênh phần 2 dùng chung cách cắt này (2026-09-29).
  const trendDay = cmp.partial ? Number(cmp.curEnd.slice(8)) : null;
  const cutEndOf = (m: string) => {
    const e = monthRangeLocal(m).end;
    return trendDay ? `${m}-${String(Math.min(trendDay, Number(e.slice(8)))).padStart(2, "0")}` : e;
  };
  const trendStats = useMemo(
    () => last4Months.map((m) => ({ month: m, stats: liveStatsFromRows(rowsOf(m), monthRangeLocal(m).start, cutEndOf(m)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last4Months, month, prevMonth, liveCurrent, livePrev, sessions, brandId, liveOlderMonths, trendDay]
  );
  const trendColLabel = (m: string) => (trendDay ? `1–${Math.min(trendDay, Number(monthRangeLocal(m).end.slice(8)))}/${m.slice(5)}` : `${m.slice(5)}/${m.slice(2, 4)}`);

  // Quà tặng theo tháng (piece gifts của bản chụp, file Sản Phẩm + đơn Shop Analytics cùng kỳ).
  const giftByMonth = useMemo(() => last4Months.map((m) => (hiddenMonths.has(m) ? null : giftStats(view.gifts?.[m] ?? null, view.shopDays[m] ?? null))), [last4Months, hiddenMonths, view]);
  const giftCur = giftByMonth[3];
  const giftPrev = giftByMonth[2];
  const giftLineText = giftLine(giftPrev, giftCur, `T${Number(prevMonth.slice(5))}`);
  const giftSliceCur = view.gifts?.[month] ?? null;
  const giftsMissing = canManage && !view.gifts?.[month];
  // Chỉ nêu khi tháng CÓ quà (SKU nào, bao nhiêu món). "Quà giảm/hết" đã ở Kết luận + bảng Xu hướng 4 tháng.
  const giftNote =
    giftSliceCur?.hasAnyBatch && giftSliceCur.giftItems > 0
      ? `Quà tặng (dưới ${fmtVndShort(GIFT_MAX_PRICE)}/món): ${fmtInt(giftSliceCur.giftItems)} món ở ${giftSliceCur.giftSkus} SKU${giftSliceCur.top[0] ? `, nhiều nhất ${shortSku(giftSliceCur.top[0][0])}` : ""} — không tính vào UPT hàng bán thật.`
      : null;

  // Ngày thường vs ngày camp, cơ cấu lịch vs hiệu suất.
  const dayGroups = useMemo(() => dayGroupStats(livePrev?.rows ?? [], liveCurrent?.rows ?? [], cmp, bucketPrev, bucketCur), [livePrev, liveCurrent, cmp, bucketPrev, bucketCur]);
  const mixRate = useMemo(() => mixRateSplit(livePrev?.rows ?? [], liveCurrent?.rows ?? [], cmp, bucketPrev, bucketCur), [livePrev, liveCurrent, cmp, bucketPrev, bucketCur]);
  const dailyGroup = dayGroups.find((g) => g.key === "daily");
  const dailyGapValue = dailyGap(dailyGroup);
  const dailyGapText = dailyGapLine(dailyGroup);

  // Toàn shop (Shop Analytics theo ngày). Tháng bị che với brand thì slice null ⇒ không có số so sánh.
  const shopDaysOf = (m: string) => (hiddenMonths.has(m) ? null : view.shopDays[m] ?? null);
  const shopCur = useMemo(() => shopTotals(view.shopDays[month], cmp.curStart, cmp.curEnd), [view, month, cmp]);
  const shopPrevSame = useMemo(() => shopTotals(hiddenMonths.has(prevMonth) ? null : view.shopDays[prevMonth], cmp.prevStart, cmp.prevEnd), [view, prevMonth, cmp, hiddenMonths]);
  // Ba khối chuyển từ "Phân tích sâu (nội bộ ops)" khi gộp vào report (2026-09-27) — cùng đầu vào bản chụp, cùng kỳ `cmp`.
  const rhythm = useMemo(() => dailyRhythm(view.shopDays[month]?.days, liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd), [view, month, liveCurrent, cmp]);
  const funnel = useMemo(() => liveFunnel(livePrev?.rows ?? [], liveCurrent?.rows ?? [], cmp), [livePrev, liveCurrent, cmp]);
  const spread = useMemo(() => sessionSpread(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd), [liveCurrent, cmp]);
  // Cơ cấu kênh cắt cùng kỳ với Xu hướng 4 tháng: đặt T8 trọn tháng cạnh T9 22 ngày từng ghi Affiliate LIVE −4,2 điểm
  // (cùng kỳ: −6,0) và Total GMV 9,1B cạnh 5,21B. Product card chỉ có tổng cả tháng (file Sản Phẩm) ⇒ khi cắt thì
  // lấy phần còn lại của Total GMV sau 3 kênh Shop Analytics (đo CROCS 1–22/09: 939M, file 936,8M).
  const channelMixes = useMemo(
    () =>
      last4Months.map((m) => {
        const shop = shopTotals(shopDaysOf(m), monthRangeLocal(m).start, cutEndOf(m));
        if (trendDay) return channelMix(m, shop, shop ? Math.max(0, shop.gmv - shop.liveLinked - shop.affiliate - shop.video) : null);
        const card = hiddenMonths.has(m) ? null : view.cardGmv[m];
        return channelMix(m, shop, card?.hasAnyBatch ? card.cardGmv : null);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [last4Months, view, hiddenMonths, trendDay]
  );
  const channelChartData = useMemo(
    () =>
      channelMixes
        .map((c, idx) => (c ? { label: trendColLabel(last4Months[idx]), liveLinked: c.liveLinked, affiliate: c.affiliate, video: c.video, card: c.card ?? 0 } : null))
        .filter((x): x is NonNullable<typeof x> => x !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channelMixes, last4Months, trendDay]
  );
  const shopPiecesMissing = !Object.values(view.shopDays).some(Boolean) && !Object.values(view.cardGmv).some(Boolean);

  // Nhóm đối chứng: live tài khoản shop vs phần còn lại của shop, theo ngày thường / ngày camp.
  // Cột live = ca agency (cùng số ô KPI phần 1 và bảng Campaign phần 6); phần còn lại vẫn từ Shop Analytics.
  const agencyLiveByDate = useMemo(() => ({ prev: liveGmvByDate(livePrev?.rows ?? []), cur: liveGmvByDate(liveCurrent?.rows ?? []) }), [livePrev, liveCurrent]);
  const control = useMemo(
    () => controlGroup(shopDaysOf(prevMonth)?.days, view.shopDays[month]?.days, cmp, bucketPrev, bucketCur, agencyLiveByDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, prevMonth, month, cmp, bucketPrev, bucketCur, hiddenMonths, agencyLiveByDate]
  );
  const controlAll = control.find((r) => r.key === "all");
  const liveOutsideAgency = controlAll ? controlAll.shopLiveCur - controlAll.liveCur : null;
  const controlOps = control.find((r) => r.key !== "all" && controlVerdict(r) === "ops");

  // KPI GMV cả shop brand giao (Kế Hoạch Tháng, 0122) — mọi kênh, khác target live. Tháng chưa hết thì dự kiến theo
  // nhịp cùng kỳ tháng trước (chỉ khi tháng trước có đủ số cả tháng).
  const shopKpi = useMemo(() => {
    const target = planCur?.plan.shopTargetGmv ?? 0;
    if (!target || !shopCur) return null;
    const lastDay = Number(monthRangeLocal(month).end.slice(8));
    const throughDay = shopCur.through ? Number(shopCur.through.slice(8, 10)) : lastDay;
    const { start: ps, end: pe } = monthRangeLocal(prevMonth);
    const prevSlice = hiddenMonths.has(prevMonth) ? null : view.shopDays[prevMonth];
    const toDay = shopTotals(prevSlice, ps, `${prevMonth}-${String(Math.min(throughDay, Number(pe.slice(8)))).padStart(2, "0")}`);
    const total = shopTotals(prevSlice, ps, pe);
    const prevShape = toDay && total && total.through === pe ? { toDay: toDay.gmv, total: total.gmv } : null;
    return shopKpiProgress(target, shopCur, lastDay, prevShape);
  }, [planCur, shopCur, month, prevMonth, hiddenMonths, view]);

  // NMV: tỷ lệ hoàn ở Rate Card nếu đã nhập, không thì Refund rate thực của cả shop trong kỳ — ước tính, ghi rõ.
  const refundRateShop = shopCur && shopCur.gmv > 0 ? (shopCur.refunds / shopCur.gmv) * 100 : null;
  const tiktokReturnRate = brandPlatformRates.find((r) => r.brandId === brandId && r.platform === "TikTok")?.returnRate;
  const nmvRate = hasReturnRateConfig ? tiktokReturnRate ?? null : refundRateShop;
  const nmvSource = hasReturnRateConfig ? "tỷ lệ hoàn hủy ở CRM (Hợp đồng & giá)" : refundRateShop != null ? "Refund rate thực của cả shop trong kỳ" : null;

  // Luỹ kế GMV live theo ngày — tháng report vs tháng trước (cùng trục ngày 1..31).
  const cumulativeData = useMemo(() => {
    const byDay = (rows: CreatorLivePerfRow[], m: string) => {
      const arr = new Array(31).fill(0);
      for (const r of rows) {
        const d = vnDateOf(r.startTime);
        if (d.startsWith(m)) arr[Number(d.slice(8, 10)) - 1] += r.gmv;
      }
      return arr;
    };
    const cur = byDay(liveCurrent?.rows ?? [], month);
    const prev = byDay(livePrev?.rows ?? [], prevMonth);
    const curLast = Number(cmp.curEnd.slice(8, 10));
    const prevLast = Number(prevEnd.slice(8, 10));
    const out: { day: number; cur: number | null; prev: number | null }[] = [];
    let a = 0;
    let b = 0;
    for (let i = 0; i < 31; i++) {
      a += cur[i];
      b += prev[i];
      out.push({ day: i + 1, cur: i + 1 <= curLast ? a : null, prev: i + 1 <= prevLast ? b : null });
    }
    return out;
  }, [liveCurrent, livePrev, month, prevMonth, cmp, prevEnd]);

  // Khung giờ bắt đầu ca — GMV/giờ, cùng kỳ 2 tháng.
  const slotRows = useMemo(() => {
    const buckets = [
      { key: "morning", label: "Sáng (trước 12h)", test: (h: number) => h < 12 },
      { key: "afternoon", label: "Chiều (12h–17h)", test: (h: number) => h >= 12 && h < 17 },
      { key: "evening", label: "Tối (từ 17h)", test: (h: number) => h >= 17 }
    ];
    const hourOf = (iso: string) => (new Date(iso).getUTCHours() + 7) % 24;
    const agg = (rows: CreatorLivePerfRow[], s: string, e: string, test: (h: number) => boolean) => {
      let n = 0, gmv = 0, hours = 0;
      for (const r of rows) {
        const d = vnDateOf(r.startTime);
        if (d < s || d > e || !test(hourOf(r.startTime))) continue;
        n++;
        gmv += r.gmv;
        hours += r.hours;
      }
      return { n, gmv, gmvPerHour: hours > 0 ? gmv / hours : null };
    };
    return buckets.map((b) => ({
      ...b,
      cur: agg(liveCurrent?.rows ?? [], cmp.curStart, cmp.curEnd, b.test),
      prev: agg(livePrev?.rows ?? [], cmp.prevStart, cmp.prevEnd, b.test)
    }));
  }, [liveCurrent, livePrev, cmp]);

  // Phần 7 — kế hoạch tháng sau lấy từ Kế Hoạch Tháng (nguồn duy nhất của target/lịch tháng sau).
  const nextPlan = nextPlanFull ? { targetGmv: nextPlanFull.plan.targetGmv, status: nextPlanFull.plan.status, slotCount: nextPlanFull.slots.length } : null;
  const nextAllocation = useMemo(
    () => (nextPlanFull && nextPlanFull.slots.length > 0 ? planCampAllocation(nextPlanFull.slots, nextPlanFull.plan.campRanges) : null),
    [nextPlanFull]
  );

  // Top SKU: hạng tháng trước → tháng này + phễu. Tháng trước bị che với brand thì không có hạng/so sánh.
  const skuRankCur = view.skuRank?.[month] ?? null;
  const skuMoveData = useMemo(
    () => skuMoves(view.skuRank?.[month] ?? null, hiddenMonths.has(prevMonth) ? null : (view.skuRank?.[prevMonth] ?? null)),
    [view, month, prevMonth, hiddenMonths]
  );

  // Phần 5 — so mặt bằng tháng này (cột phụ) theo loại ngày.
  const hostInsight = useMemo(() => {
    const tiktok = filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {});
    const rows = new Map<string, HostInsightRow>();
    for (const b of CAMP_DAY_BUCKET_ORDER) {
      const part = tiktok.filter((s) => resolveCampBucketType(s.date, campOverrides) === b);
      for (const r of splitUnassignedHost(byHost(part)).ranked) {
        const cur = rows.get(r.key) ?? { name: r.label, gmv: 0, hours: 0, byBucket: {} };
        cur.gmv += r.gmv;
        cur.hours += r.hours;
        cur.byBucket[b] = { gmv: r.gmv, hours: r.hours };
        rows.set(r.key, cur);
      }
    }
    const keys = [...rows.keys()];
    const list = [...rows.values()];
    const peer = hostVsPeer(list);
    return { rows: list, vsPeer: new Map(keys.map((k, idx) => [k, peer[idx].vsPeer])) };
  }, [completedInPeriod, campOverrides]);

  // Phần 5 — so mặt bằng GỘP các tháng có số trong bản chụp, kèm khoảng tin cậy (cột chính để so host).
  const reliabilitySessions = useMemo(
    () => filterSessions(sessions.filter((s) => s.brandId === brandId && s.platform === "TikTok" && s.status === "Completed"), {}),
    [sessions, brandId]
  );
  const reliability = useMemo(() => hostReliability(reliabilitySessions, bucketAny), [reliabilitySessions, bucketAny]);
  const reliabilityByKey = useMemo(() => new Map(reliability.map((r) => [r.key, r])), [reliability]);
  const relMonths = useMemo(() => new Set(reliabilitySessions.map((s) => s.date.slice(0, 7))).size, [reliabilitySessions]);

  // Phần 5 — host theo từng loại ngày: Daily + D-Day / Mid-Month / Pay Day TÁCH RIÊNG. GMV trọn cho host, trợ live chỉ ghi giờ.
  const hostDayType = useMemo(
    () =>
      byHostDayType(
        filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}),
        (date) => resolveCampBucketType(date, campOverrides)
      ),
    [completedInPeriod, campOverrides]
  );
  const hostDayTypeTeam = useMemo(() => dayTypeTeamTotals(hostDayType), [hostDayType]);
  const campDaysLabel = useMemo(() => {
    const { start, end } = monthRangeLocal(month);
    const days: Record<CampDayBucket, number[]> = { daily: [], dday: [], midmonth: [], payday: [] };
    for (let d = Number(start.slice(-2)); d <= Number(end.slice(-2)); d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      days[resolveCampBucketType(date, campOverrides)].push(d);
    }
    const mm = Number(month.slice(5));
    const out: Partial<Record<CampDayBucket, string>> = {};
    for (const b of ["dday", "midmonth", "payday"] as const) {
      const ds = days[b];
      if (ds.length) out[b] = ds.length === 1 ? `${ds[0]}/${mm}` : `${ds[0]}–${ds[ds.length - 1]}/${mm}`;
    }
    return out;
  }, [month, campOverrides]);

  // Khung Insight phần 2–6 — tự sinh từ đúng các số phần đó đang hiện (lib/report/sectionInsights.ts).
  const sectionInsightRaw: Record<InsightSection, SectionInsight | null> = {
    shop: shopInsight({
      months: last4Months,
      mixes: channelMixes,
      agencyGmv: trendStats.map((x) => x.stats.gmv),
      labels: trendDay ? last4Months.map(trendColLabel) : undefined,
      shopCur,
      shopPrev: shopPrevSame,
      windowLabel: cmp.label,
      control
    }),
    why: whyInsight(livePrevStats, liveCurStats, { groups: dayGroups, mixRate }),
    people: peopleInsight(hostInsight.rows, reliability),
    products: productsInsight(skuMoveData, topPromo?.items?.[0] ?? null, giftNote),
    context: contextInsight(
      campDetailRows,
      slotRows,
      adsCur && { cost: adsCur.cost, roi: adsCur.roi, prevCost: adsPrev?.cost ?? null, prevRoi: adsPrev?.roi ?? null, zeroOrderDays: adsCur.zeroOrderDays.length }
    )
  };
  // Việc cần làm của từng phần gom về "Việc agency làm tháng sau" — khung Insight tự sinh không nói lại.
  const controlOpsGroup = controlOps ? (controlOps.key as "daily" | "camp") : null;
  const sectionSteps = sectionNextSteps(sectionInsightRaw, controlOpsGroup);
  const sectionInsight = Object.fromEntries(
    Object.entries(sectionInsightRaw).map(([k, v]) => [k, v ? { ...v, action: null } : null])
  ) as Record<InsightSection, SectionInsight | null>;
  const shownInsight = (key: InsightSection) => {
    const note = monthlyReportRow?.sectionNotes?.[key];
    return note ? parseInsightText(note.text) : sectionInsight[key];
  };
  const insightBox = (key: InsightSection) => (
    <InsightBox
      auto={sectionInsight[key]}
      note={monthlyReportRow?.sectionNotes?.[key]}
      computedAt={snapshot.computedAt}
      canManage={canManage}
      onSave={async (text) => setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, key, text))}
    />
  );

  const narrativeInput: NarrativeInput = {
    month,
    window: cmp,
    shopCur,
    shopPrev: shopPrevSame,
    liveCur: liveCurStats,
    livePrev: livePrevStats,
    drivers,
    targetGmv: kpiTargetGmvCur,
    nextMonth,
    nextPlan,
    shopKpi,
    controlLine: controlLine(control),
    controlOpsGroup,
    dailyGap: dailyGapValue != null && dailyGapText ? { line: dailyGapText, value: dailyGapValue } : null,
    giftLine: giftLineText,
    sectionSteps
  };
  const autoSummaryLines = autoSummary(narrativeInput);
  const autoNextLines = autoNextSteps(narrativeInput);
  const splitLines = (t?: string) => (t ?? "").split("\n").map((l) => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  const summaryLines = monthlyReportRow?.summaryText != null ? splitLines(monthlyReportRow.summaryText) : autoSummaryLines;
  const nextLines = monthlyReportRow?.nextStepsText != null ? splitLines(monthlyReportRow.nextStepsText) : autoNextLines;
  const narrativeEdited = monthlyReportRow?.summaryText != null || monthlyReportRow?.nextStepsText != null;
  // Đoạn đã sửa viết theo bộ số CŨ hơn lần cập nhật số liệu gần nhất ⇒ nhắc ops đọc lại trước khi phát hành.
  const narrativeStale = narrativeEdited && !!monthlyReportRow?.summarySavedAt && monthlyReportRow.summarySavedAt < snapshot.computedAt;

  const [editingNarrative, setEditingNarrative] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [nextDraft, setNextDraft] = useState("");
  const [narrativeSaving, setNarrativeSaving] = useState(false);
  const [narrativeError, setNarrativeError] = useState<string | null>(null);
  const startEditNarrative = () => {
    setSummaryDraft(summaryLines.join("\n"));
    setNextDraft(nextLines.join("\n"));
    setNarrativeError(null);
    setEditingNarrative(true);
  };
  const saveNarrative = async (reset: boolean) => {
    setNarrativeSaving(true);
    setNarrativeError(null);
    try {
      const row = await saveMonthlyReportNarrative(
        brandId,
        `${month}-01`,
        reset ? { summaryText: null, nextStepsText: null } : { summaryText: summaryDraft.trim() || null, nextStepsText: nextDraft.trim() || null }
      );
      setMonthlyReportRow(row);
      setEditingNarrative(false);
    } catch (e) {
      setNarrativeError(errorMessage(e, "Lưu kết luận thất bại"));
    } finally {
      setNarrativeSaving(false);
    }
  };


  // Bảng xu hướng 4 tháng cùng số ngày (thay 8 ô xu hướng + bảng MoM + phễu + 2 biểu đồ 4 tháng — cùng số lặp 4 lần).
  // goodWhenUp null = trung tính (không tô). UPT live đổi theo quà tặng ⇒ trung tính; UPT bỏ quà mới là cách bán.
  type TrendRow = { label: string; get: (s: LiveStats, g: GiftStats | null) => number | null; fmt: (v: number) => string; goodWhenUp: boolean | null; indent?: boolean };
  // Key Metrics đủ 18 chỉ số + AOV (lib/report/keyMetrics.ts), rồi 2 dòng quà tặng của riêng Report Tháng.
  const trendRows: TrendRow[] = [
    ...KEY_METRICS.map((d): TrendRow => ({
      label: d.label,
      get: (st) => keyMetricValue(st, d.key),
      fmt: (v) => fmtKeyMetric(d, v),
      goodWhenUp: d.goodWhenUp
    })),
    { label: "Quà tặng mỗi đơn (cả shop)", get: (_s, g) => g?.giftPerOrder ?? null, fmt: (v) => fmtFixed(v, 2), goodWhenUp: null },
    { label: `${METRIC.upt} bỏ quà (cả shop)`, get: (_s, g) => g?.uptExGift ?? null, fmt: (v) => fmtFixed(v, 2), goodWhenUp: true }
  ];
  const trendValues = (r: TrendRow) => trendStats.map((x, i) => r.get(x.stats, giftByMonth[i]));

  // Điện thoại (audit UX 2026-09-26, P2c): dưới 768px phần 2–7 chỉ hiện tiêu đề + Insight (kết luận), biểu đồ/bảng mở
  // khi bấm; Kết luận luôn mở. Desktop không đổi.
  const isNarrow = !useMediaQuery("(min-width: 768px)");
  const [openDetails, setOpenDetails] = useState<Set<string>>(() => new Set());
  const detailOpen = (id: string) => !isNarrow || openDetails.has(id);
  const openDetail = (id: string) => setOpenDetails((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  // Bấm mục lục tới phần đang gập: mở ra rồi mới cuộn — phải chờ React vẽ xong phần vừa mở (effect dưới), cuộn ngay
  // thì vị trí đích còn là của bản gập.
  const pendingScrollRef = useRef<string | null>(null);
  const scrollNow = (id: string) => document.getElementById(`mr-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const scrollTo = (id: string) => {
    if (id === "summary" || detailOpen(id)) return scrollNow(id);
    pendingScrollRef.current = id;
    openDetail(id);
  };
  useEffect(() => {
    const id = pendingScrollRef.current;
    if (!id || !openDetails.has(id)) return;
    pendingScrollRef.current = null;
    scrollNow(id);
  }, [openDetails]);

  // Phần đang đọc — tô trên mục lục (audit UX 2026-09-29, M1): phần CUỐI CÙNG có mép trên đã qua vạch 30% chiều cao màn;
  // chưa phần nào qua thì là phần 1. Tính lại ở mỗi sự kiện cuộn (trình duyệt đã gộp theo frame; 7 lần đo vị trí là nhẹ).
  // Nghe `scroll` ở pha capture của document vì vùng cuộn là <main> của App (sự kiện scroll không nổi bọt). Không dùng
  // IntersectionObserver: nhảy thẳng từ phần 3 về đầu trang thì không phần nào cắt qua dải quan sát ⇒ dấu cũ kẹt lại.
  const [activeSec, setActiveSec] = useState(SECTIONS[0].id);
  useEffect(() => {
    const pick = () => {
      const line = window.innerHeight * 0.3;
      let cur = SECTIONS[0].id;
      for (const sec of SECTIONS) {
        const el = document.getElementById(`mr-${sec.id}`);
        if (el && el.getBoundingClientRect().top <= line) cur = sec.id;
      }
      setActiveSec(cur);
    };
    document.addEventListener("scroll", pick, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", pick, { capture: true });
  }, []);
  // Mục lục cuộn ngang (điện thoại chỉ thấy ~2 mục) — kéo mục đang đọc vào tầm nhìn, chỉ đổi scrollLeft của chính thanh
  // mục lục (scrollIntoView sẽ kéo luôn cả trang theo chiều dọc).
  const tocRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = tocRef.current;
    const btn = bar?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!bar || !btn) return;
    if (btn.offsetLeft < bar.scrollLeft || btn.offsetLeft + btn.offsetWidth > bar.scrollLeft + bar.clientWidth) {
      bar.scrollTo({ left: Math.max(0, btn.offsetLeft - 12), behavior: "smooth" });
    }
  }, [activeSec]);

  // Xuất Excel toàn bộ Report Tháng — 1 file, mỗi bảng đang hiện là 1 sheet (trừ Phân Tích Sâu, ops-only). Chỉ đọc
  // lại đúng các mảng đã tính cho phần hiển thị — không tính số mới.
  const { showToast } = useToast();
  const handleExportAll = () => {
    const n = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);
    downloadSheetsAsXlsx(
      [
        {
          name: "1 Ket Luan",
          rows: [
            ...summaryLines.map((l) => ({ "Phần": "Kết luận", "Nội dung": l })),
            ...nextLines.map((l) => ({ "Phần": "Việc tháng sau", "Nội dung": l })),
            ...(
              [
                ["shop", "Insight · Thị trường hay vận hành"],
                ["why", "Insight · Vì sao"],
                ["products", "Insight · Sản phẩm"],
                ["people", "Insight · Host"],
                ["context", "Insight · Campaign & khung giờ"]
              ] as [InsightSection, string][]
            ).flatMap(([key, label]) => {
              const ins = shownInsight(key);
              return ins ? insightToText(ins).split("\n").map((l) => ({ "Phần": label, "Nội dung": l })) : [];
            })
          ]
        },
        {
          name: "1 KPI",
          rows: [
            { "Chỉ Số": "Total GMV", "Kỳ trước": n(shopPrevSame?.gmv), "Kỳ này": n(shopCur?.gmv) },
            // Key Metrics đủ 18 chỉ số + AOV, cùng thứ tự màn hình (lib/report/keyMetrics.ts).
            ...KEY_METRICS.map((d) => ({
              "Chỉ Số": d.key === "gmv" ? "LIVE GMV (agency)" : keyMetricSheetLabel(d),
              "Kỳ trước": keyMetricSheetValue(livePrevStats, d.key),
              "Kỳ này": keyMetricSheetValue(liveCurStats, d.key)
            })),
            { "Chỉ Số": "Target GMV", "Kỳ trước": "", "Kỳ này": n(kpiTargetGmvCur) },
            { "Chỉ Số": "KPI GMV", "Kỳ trước": "", "Kỳ này": n(shopKpi?.target) },
            { "Chỉ Số": "Total GMV dự kiến cuối tháng", "Kỳ trước": "", "Kỳ này": n(shopKpi?.projected) },
            { "Chỉ Số": `So sánh: ${cmp.label}`, "Kỳ trước": "", "Kỳ này": "" }
          ]
        },
        {
          name: "2 Thi truong - Van hanh",
          rows: control.map((r) => ({
            "Nhóm ngày": controlLabel(r.key),
            "Số ngày": r.days,
            "LIVE GMV agency (ca) kỳ trước": n(r.livePrev),
            "LIVE GMV agency (ca) kỳ này": n(r.liveCur),
            "± Live agency (%)": n(r.liveChg),
            "Live tài khoản shop (Shop Analytics) kỳ trước": n(r.shopLivePrev),
            "Live tài khoản shop (Shop Analytics) kỳ này": n(r.shopLiveCur),
            "Phần còn lại kỳ trước": n(r.restPrev),
            "Phần còn lại kỳ này": n(r.restCur),
            "± Phần còn lại (%)": n(r.restChg),
            "± Lượt vào shop (%)": n(r.visitorsChg),
            "CVR shop kỳ trước (%)": n(r.cvrPrev),
            "CVR shop kỳ này (%)": n(r.cvrCur),
            "Đọc là": controlVerdict(r) ? VERDICT_TEXT[controlVerdict(r)!] : ""
          }))
        },
        {
          name: "2 Sales Channel",
          rows: channelMixes.map((c, idx) => ({
            "Kỳ": trendColLabel(last4Months[idx]),
            "Total GMV": n(c?.shopGmv),
            "LIVE GMV (agency)": n(trendStats[idx].stats.gmv),
            "Seller LIVE (cả tài khoản shop)": n(c?.liveLinked),
            "Affiliate LIVE": n(c?.affiliate),
            "Video": n(c?.video),
            [trendDay ? "Product card (phần còn lại)" : "Product card"]: n(c?.card),
            "Refund rate (%)": n(c?.refundRate)
          }))
        },
        {
          name: "3 Vi sao - Thua so",
          rows: (drivers?.parts ?? []).map((p) => ({ "Thừa số": DRIVER_LABEL[p.key], "± (%)": n(p.change), "Góp vào ± LIVE GMV": n(p.value) }))
        },
        {
          name: "3 Vi sao - Loai ngay",
          rows: dayGroups.map((g) => ({
            "Nhóm ngày": controlLabel(g.key),
            "Giờ live kỳ trước": n(g.prev.hours),
            "Giờ live kỳ này": n(g.cur.hours),
            "GMV/giờ kỳ trước": n(g.prev.gmvPerHour),
            "GMV/giờ kỳ này": n(g.cur.gmvPerHour),
            ...Object.fromEntries(RATE_FACTORS.map((k) => [`± ${DRIVER_LABEL[k]} (%)`, n(pctChange(g.prev[k], g.cur[k]))]))
          }))
        },
        {
          name: "3 Xu huong 4 thang",
          rows: trendRows.map((r) => ({ "Chỉ số": r.label, ...Object.fromEntries(trendStats.map((x, i) => [trendColLabel(x.month), n(trendValues(r)[i])])) }))
        },
        {
          name: "4 Top SKU",
          rows: skuMoveData
            ? skuMoveData.rows.map((r) => ({
                "Hạng": r.rank,
                [`Hạng ${prevMonth}`]: r.prevRank ?? "",
                "Sản Phẩm": r.name,
                "GMV": n(r.gmv),
                [skuMoveData.perDay ? "± GMV/ngày (%)" : "± GMV (%)"]: n(r.gmvChange),
                "Seller LIVE GMV": n(r.gmvLive),
                "Orders": n(r.orders),
                "Items sold": n(r.itemsSold),
                "Product CTR (%)": n(r.ctr),
                "CTOR (%)": n(r.ctor)
              }))
            : (topSku?.items ?? []).map((s, idx) => ({ "#": idx + 1, "Sản Phẩm": s.name, "GMV": n(s.gmv), "Seller LIVE GMV": n(s.gmvLive), "Orders": n(s.orders) }))
        },
        {
          name: "4 Qua tang",
          rows: last4Months.map((m, i) => ({
            "Tháng": m,
            "Món quà tặng": n(giftByMonth[i]?.giftItems),
            "SKU quà tặng": n(giftByMonth[i]?.giftSkus),
            "Orders cả shop": n(giftByMonth[i]?.shopOrders),
            "Quà mỗi đơn": n(giftByMonth[i]?.giftPerOrder),
            "UPT cả shop": n(giftByMonth[i]?.uptShop),
            "UPT bỏ quà": n(giftByMonth[i]?.uptExGift)
          }))
        },
        {
          name: "4 Top Promotion",
          rows: (topPromo?.items ?? []).map((p, idx) => ({
            "#": idx + 1,
            "Chương Trình": p.name,
            "Trạng Thái": promoStatusLabel(p.status).label,
            "GMV": n(p.gmv),
            "Orders": n(p.orders),
            "AOV": n(p.aov)
          }))
        },
        {
          name: "5 Host Performance",
          rows: hostPerformance.map((h) => {
            const r = reliabilityByKey.get(h.key);
            return {
              "Host": h.hostName,
              "Sessions": h.sessionCount,
              [`So mặt bằng ${relMonths} tháng (%)`]: n(r ? (r.ratio - 1) * 100 : null),
              "Khoảng tin cậy thấp (%)": n(r?.lo != null ? (r.lo - 1) * 100 : null),
              "Khoảng tin cậy cao (%)": n(r?.hi != null ? (r.hi - 1) * 100 : null),
              [`Sessions ${relMonths} tháng`]: r?.sessions ?? "",
              "So mặt bằng tháng này (%)": n(hostInsight.vsPeer.get(h.key)),
              ...keyMetricSheetColumns(h.m),
              "Sessions trợ live": hostDayType.find((x) => x.key === h.key)?.assist.sessions ?? 0,
              "Giờ trợ live": n(hostDayType.find((x) => x.key === h.key)?.assist.hours ?? 0)
            };
          })
        },
        {
          name: "5 Host chi so theo ngay",
          rows: HOST_DAY_TYPE_ORDER.flatMap((b) =>
            [...hostDayType.filter((h) => h.byBucket[b].sessions > 0).map((h) => ({ name: h.name, part: h.byBucket[b] })), ...(hostDayTypeTeam[b].sessions > 0 ? [{ name: "Cả team", part: hostDayTypeTeam[b] }] : [])].map(({ name, part }) => {
              const m = dayTypeMetrics(part);
              return {
                "Loại ngày": campDaysLabel[b] ? `${DAY_TYPE_SHORT[b]} ${campDaysLabel[b]}` : DAY_TYPE_SHORT[b],
                "Host": name,
                [METRIC.sessions]: m.sessions,
                ...keyMetricSheetColumns(m)
              };
            })
          )
        },
        {
          name: "6 Campaign",
          rows: campDetailRows.map((r) => ({
            "Khung": r.label,
            "Target GMV": n(r.target),
            "GMV": n(r.actual),
            "% Target": n(r.target ? (r.actual / r.target) * 100 : null),
            [`GMV cùng khung ${prevMonth}`]: n(r.prev.gmv),
            "Giờ live": n(r.hours),
            "GMV/giờ": n(r.gmvPerHour),
            "Product CTR": n(r.ctr),
            "CTOR": n(r.ctor)
          }))
        },
        ...(adsCur
          ? [
              {
                name: "6 Ads theo ngay",
                rows: adsCur.days.map((d) => ({
                  "Ngày": fmtDateVn(d.date),
                  "Loại ngày": CAMP_DAY_BUCKET_LABEL[bucketCur(d.date)],
                  "Chi phí": d.cost,
                  "Đơn SKU": d.orders,
                  "Doanh thu gộp": d.revenue,
                  "ROI": n(d.cost > 0 ? d.revenue / d.cost : null)
                }))
              },
              {
                name: "6 Ads theo loai ngay",
                rows: [
                  ...CAMP_DAY_BUCKET_ORDER.filter((b) => (adsCur.byBucket?.[b].days ?? 0) > 0).map((b) => {
                    const r = adsCur.byBucket![b];
                    return { "Loại ngày": CAMP_DAY_BUCKET_LABEL[b], "Số ngày": r.days, "Chi phí": r.cost, "Doanh thu gộp": r.revenue, "ROI": n(r.roi), "ROI tháng trước (cùng số ngày)": n(adsPrev?.byBucket?.[b].roi), "Đơn SKU": r.orders };
                  }),
                  { "Loại ngày": "Cả tháng", "Số ngày": adsCur.days.length, "Chi phí": adsCur.cost, "Doanh thu gộp": adsCur.revenue, "ROI": n(adsCur.roi), "ROI tháng trước (cùng số ngày)": n(adsPrev?.roi), "Đơn SKU": adsCur.orders }
                ]
              }
            ]
          : []),
        {
          name: "6 Top Sessions",
          rows: topSessions.map((s, idx) => ({
            "#": idx + 1,
            "Bắt Đầu": fmtSessionStart(s.startTime),
            "Giờ live": n(s.hours),
            "GMV": n(s.gmv),
            "GMV/giờ": n(s.gmvPerHour),
            "Orders": n(s.orders),
            "Items sold": n(s.itemsSold),
            "Views": n(s.views),
            "Product CTR": n(s.ctr),
            "CTOR": n(s.ctor)
          }))
        }
      ],
      `ReportThang_${brandName}_${month}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  const chgCell = (v: number | null, goodWhenUp: boolean | null = true, digits = 0) =>
    v == null ? (
      <span style={{ color: PAL.muted }}>—</span>
    ) : (
      <span style={{ color: goodWhenUp == null ? PAL.cream : (v >= 0) === goodWhenUp ? PAL.green : PAL.red }}>
        {v >= 0 ? "+" : "−"}
        {fmtFixed(Math.abs(v), digits)}%
      </span>
    );
  // Dấu trừ chuẩn "−" và làm tròn nghìn đồng cho số tiền nhỏ trong câu (fmtVndShort in "-").
  const rowStyle = (idx: number) => ({ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" });
  const warnBox = (children: React.ReactNode) => (
    <div className="flex items-start gap-2 text-[11px] rounded-xl p-2.5" style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}>
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );

  return (
    // KHÔNG overflow-hidden ở khung ngoài: nó biến khung thành vùng cuộn riêng nên mục lục `sticky` trôi mất theo trang
    // (đo 2026-09-29: cuộn 4.000px thì mục lục ở y=−3.691). Bo góc trên giao cho chính mục lục. `-top-3 sm:-top-6` = trừ
    // đúng padding của <main> (p-3 sm:p-6) để mục lục dính sát mép, không chừa khe cho nội dung lọt qua phía trên.
    <div className="rounded-2xl" style={{ background: PAL.bg, border: `1px solid ${PAL.line}` }}>
      {/* Mục lục 7 phần — trang cuộn (user chốt 2026-09-25): tab giấu nội dung, brand có thể không bao giờ mở tới. */}
      <div ref={tocRef} className="flex items-center gap-1 px-3 py-2 overflow-x-auto sticky -top-3 sm:-top-6 z-10 rounded-t-2xl" style={{ background: PAL.bg, borderBottom: `1px solid ${PAL.line}` }}>
        {SECTIONS.map((sec) => (
          <button
            key={sec.id}
            onClick={() => scrollTo(sec.id)}
            aria-current={activeSec === sec.id ? "true" : undefined}
            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap rounded-lg hover:opacity-100 focus-visible:outline focus-visible:outline-2"
            style={activeSec === sec.id ? { color: PAL.gold, background: PAL.panel2 } : { color: PAL.muted }}
          >
            {sec.label}
          </button>
        ))}
        <button
          onClick={handleExportAll}
          title="Xuất toàn bộ Report Tháng ra 1 file Excel nhiều sheet"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0"
          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
        >
          <Download className="w-3.5 h-3.5" /> Xuất Excel
        </button>
      </div>

      <div className="p-5 space-y-8">
        {shopPiecesMissing && canManage && warnBox(<>Số liệu này chốt trước khi report có phần Shop Analytics — bấm "Cập nhật số liệu" ở trên để có đủ 7 phần.</>)}
        {giftsMissing && !shopPiecesMissing && warnBox(<>Số liệu này chốt trước khi report tách quà tặng khỏi UPT — bấm "Cập nhật số liệu" ở trên để có dòng quà tặng.</>)}

        {/* ===== 1. Kết luận ===== */}
        <section id="mr-summary" className="space-y-4 scroll-mt-16">
          <SectionHead no="1" title="Kết luận" sub={cmp.partial ? `Số tính tới ${cmp.curEnd.slice(8)}/${month.slice(5)} · % là cùng kỳ ${cmp.label}` : `Tháng ${month.slice(5)}/${month.slice(0, 4)} · % là ${cmp.label}`} />
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiTile
              label="Total GMV"
              value={shopCur ? fmtVndShort(shopCur.gmv) : "—"}
              change={shopCur && shopPrevSame ? pctChange(shopPrevSame.gmv, shopCur.gmv) : null}
              note={
                shopKpi
                  ? `${fmtPct(shopKpi.pct)} KPI ${fmtVndShort(shopKpi.target)}${shopKpi.partial ? ` · dự kiến ${fmtPct(shopKpi.projectedPct)}` : ""}`
                  : shopCur
                    ? "Shop Analytics — mọi kênh"
                    : "chưa có file Shop Analytics"
              }
            />
            <KpiTile
              label="LIVE GMV (agency)"
              value={fmtVndShort(liveCurStats.gmv)}
              change={pctChange(livePrevStats.gmv, liveCurStats.gmv)}
              note={shopCur && shopCur.gmv > 0 ? `${fmtPct((liveCurStats.gmv / shopCur.gmv) * 100)} tổng shop · ${liveCurStats.sessions} ca` : `${liveCurStats.sessions} ca`}
            />
            <KpiTile
              label="NMV (ước tính)"
              value={nmvRate != null ? fmtVndShort(liveCurStats.gmv * (1 - nmvRate / 100)) : "—"}
              note={nmvRate != null ? `trừ ${fmtPct(nmvRate)} — ${nmvSource}` : "chưa có tỷ lệ hoàn hủy (CRM) / Refund rate (Shop Analytics)"}
            />
            <KpiTile label="Giờ live" value={fmtHours(liveCurStats.hours)} change={pctChange(livePrevStats.hours, liveCurStats.hours)} note={`${liveCurStats.sessions} ca có số`} />
            <KpiTile label="GMV/giờ" value={liveCurStats.gmvPerHour != null ? fmtVndShort(liveCurStats.gmvPerHour) : "—"} change={pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour)} />
          </div>

          <div className="rounded-xl p-4 space-y-3" style={{ background: PAL.panel, border: `1px solid ${PAL.gold}44` }}>
            {editingNarrative ? (
              <NarrativeEditor
                summaryDraft={summaryDraft}
                nextDraft={nextDraft}
                onSummary={setSummaryDraft}
                onNext={setNextDraft}
                saving={narrativeSaving}
                error={narrativeError}
                onSave={() => saveNarrative(false)}
                onCancel={() => setEditingNarrative(false)}
              />
            ) : (
              <>
                <ol className="space-y-2.5 text-[14px] leading-relaxed list-decimal pl-5" style={{ color: PAL.cream }}>
                  {summaryLines.map((l, i) => (
                    <li key={i} className={i === 0 ? "font-bold" : undefined}>
                      {l}
                    </li>
                  ))}
                </ol>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px]" style={{ borderTop: `1px solid ${PAL.line}`, color: PAL.muted }}>
                    <span>{narrativeEdited ? "Ops đã sửa đoạn này (kết luận + việc tháng sau)." : "Bản tự sinh từ số liệu — sửa trước khi phát hành nếu cần."}</span>
                    {narrativeStale && <span style={{ color: PAL.gold }}>Số liệu đã cập nhật sau lần sửa — đọc lại cho khớp số mới.</span>}
                    <button onClick={startEditNarrative} className={LINK_BTN} style={{ color: PAL.gold }}>
                      Sửa kết luận & việc tháng sau
                    </button>
                    {narrativeEdited && (
                      <button onClick={() => saveNarrative(true)} disabled={narrativeSaving} className={LINK_BTN} style={{ color: PAL.muted }}>
                        Dùng lại bản tự sinh
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {(kpiTargetGmvCur || shopKpi) && (
            <div className="rounded-xl p-4 flex flex-wrap items-end gap-6" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
              {kpiTargetGmvCur && (
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>Target GMV (live)</div>
                  <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>{fmtVndShort(kpiTargetGmvCur)}</div>
                  <ProgressBar pct={(liveCurStats.gmv / kpiTargetGmvCur) * 100} />
                </div>
              )}
              {shopKpi && (
                <div className="flex-1 min-w-[220px]">
                  <div className="text-[11px] uppercase tracking-wider" style={{ color: PAL.muted }}>KPI GMV (brand giao · mọi kênh)</div>
                  <div className="font-mono text-xl font-bold mt-1" style={{ color: PAL.cream }}>
                    {fmtVndShort(shopKpi.actual)} / {fmtVndShort(shopKpi.target)}
                  </div>
                  <ProgressBar pct={shopKpi.pct} label="KPI GMV" />
                  {shopKpi.partial && (
                    <div className="text-[11px] mt-1 font-mono" style={{ color: shopKpi.projectedPct >= 100 ? PAL.green : shopKpi.projectedPct >= 90 ? PAL.gold : PAL.red }}>
                      Dự kiến cuối tháng {fmtVndShort(shopKpi.projected)} · {fmtPct(shopKpi.projectedPct)} ({shopKpi.method === "prev" ? "theo nhịp cùng kỳ tháng trước" : "chia đều theo ngày"})
                    </div>
                  )}
                </div>
              )}
              {kpiTargetGmvCur && runRate && runRate.doneCount > 0 && runRate.targetTotal > 0 && (
                <div className="flex-1 min-w-[220px] text-[12px] space-y-0.5" style={{ color: PAL.muted }}>
                  <div>
                    Run-rate:{" "}
                    <b style={{ color: runRate.runRate == null ? PAL.muted : runRate.runRate >= 1 ? PAL.green : runRate.runRate >= 0.9 ? PAL.gold : PAL.red }}>
                      {runRate.runRate == null ? "—" : `${fmtFixed(runRate.runRate * 100, 0)}%`}
                    </b>{" "}
                    ({runRate.doneCount} ca xong · {runRate.pendingCount} còn lại)
                  </div>
                  <div>
                    Dự kiến cuối tháng <b style={{ color: PAL.cream }}>{fmtVndShort(runRate.projected)}</b> — {runRate.gap > 0 ? "thiếu" : "vượt"}{" "}
                    <b style={{ color: runRate.gap > 0 ? PAL.red : PAL.green }}>{fmtVndShort(Math.abs(runRate.gap))}</b>
                  </div>
                </div>
              )}
            </div>
          )}
          {!kpiTargetGmvCur && !shopKpi && canManage && (
            <p className="text-[11px]" style={{ color: PAL.muted }}>
              Tháng {month.slice(5)} chưa có target chốt / KPI GMV ở Kế Hoạch Tháng — khi có, phần này hiện % Target và dự kiến cuối tháng.
            </p>
          )}
          <Panel title="LIVE GMV luỹ kế theo ngày" icon={<Activity className="w-4 h-4" />} sub={`Tháng ${month.slice(5)} so với tháng ${prevMonth.slice(5)} — cùng trục ngày`}>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cumulativeData} margin={{ right: 12 }}>
                  <CartesianGrid stroke={PAL.line} vertical={false} />
                  <XAxis dataKey="day" stroke={PAL.muted} fontSize={11} interval={3} />
                  <YAxis stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtVndShort(v)} width={70} />
                  <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(d) => `Ngày ${d}`} formatter={(v) => fmtVndShort(chartNum(v))} />
                  {cmp.partial && <ReferenceLine x={Number(cmp.curEnd.slice(8))} stroke={PAL.muted} strokeDasharray="3 3" />}
                  <Line type="monotone" dataKey="prev" name={`Tháng ${prevMonth.slice(5)}`} stroke={PAL.blue} strokeWidth={2} dot={false} connectNulls={false} />
                  <Line type="monotone" dataKey="cur" name={`Tháng ${month.slice(5)}`} stroke={PAL.gold} strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ChartLegend items={[[`Tháng ${prevMonth.slice(5)}`, PAL.blue], [`Tháng ${month.slice(5)}`, PAL.gold]]} />
          </Panel>
        </section>

        {/* ===== 2. Thị trường hay vận hành ===== */}
        <section id="mr-shop" className="space-y-4 scroll-mt-16">
          <SectionHead no="2" title="Thị trường hay vận hành" sub="So live agency với phần còn lại của shop — cùng thị trường, cùng kỳ" />
          {insightBox("shop")}
          <SectionDetail open={detailOpen("shop")} onOpen={() => openDetail("shop")}>
            {control.length > 0 && (
              <Panel
                title="Live agency so với phần còn lại của shop"
                icon={<Scale className="w-4 h-4" />}
                sub={`${cmp.label} · phần còn lại = affiliate, video, thẻ sản phẩm (cùng thị trường, không do agency vận hành) · lệch ≥ 10 điểm mới coi là khác thị trường`}
              >
                <ReportTable head={["Nhóm ngày", "Live agency", "Phần còn lại", "Lượt vào shop", "CVR shop", "Đọc là"]}>
                  {control.map((r, idx) => {
                    const v = controlVerdict(r);
                    return (
                      <tr key={r.key} style={rowStyle(idx)}>
                        <td className={`py-2 px-3 ${r.key === "all" ? "font-black" : "font-semibold"}`} style={{ color: PAL.gold }}>
                          {controlLabel(r.key)} <span className="font-normal text-[11px]" style={{ color: PAL.muted }}>· {r.days} ngày</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono" title={`${fmtVndShort(r.livePrev)} → ${fmtVndShort(r.liveCur)}`}>
                          {chgCell(r.liveChg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" title={`${fmtVndShort(r.restPrev)} → ${fmtVndShort(r.restCur)}`}>
                          {chgCell(r.restChg)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono">{chgCell(r.visitorsChg)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {r.cvrPrev != null && r.cvrCur != null ? `${fmtPct(r.cvrPrev)} → ${fmtPct(r.cvrCur)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-semibold whitespace-nowrap" style={{ color: v === "ops" ? PAL.red : v === "agency_better" ? PAL.green : PAL.cream }}>
                          {v ? VERDICT_TEXT[v] : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  Live agency = GMV các ca có số trong app (cùng số với phần 1 và phần 6). Phần còn lại = {METRIC.totalGmv} − mọi live trên tài khoản shop
                  ("Linked account LIVE-attributed GMV" của Shop Analytics).
                  {liveOutsideAgency != null && Math.abs(liveOutsideAgency) >= 1_000_000 &&
                    (liveOutsideAgency > 0
                      ? ` Live trên tài khoản shop ngoài ca agency kỳ này: ${fmtVndShort(liveOutsideAgency)} — không tính vào vế nào.`
                      : ` Shop Analytics ghi live tài khoản shop thấp hơn ca agency ${fmtVndShort(-liveOutsideAgency)} kỳ này.`)}{" "}
                  Rê chuột lên % để xem số tiền. CVR shop = Orders ÷ lượt vào shop.
                </p>
              </Panel>
            )}
            {rhythm && (
              <Panel
                title="Nhịp bán theo ngày"
                icon={<Activity className="w-4 h-4" />}
                sub={`${METRIC.totalGmv} cả shop mỗi ngày (Shop Analytics) · đường vàng = trung bình 7 ngày · đường xanh = ${METRIC.liveGmv} agency · ${rhythm.points.length} ngày có số`}
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                  <KpiTile label="5 ngày cao nhất chiếm" value={rhythm.top5Pct != null ? fmtPct(rhythm.top5Pct) : "—"} note={`${METRIC.totalGmv} của kỳ`} />
                  <KpiTile label="Số ngày tạo 80% GMV" value={rhythm.daysFor80 != null ? `${rhythm.daysFor80}/${rhythm.points.length}` : "—"} note="càng ít ngày càng dồn vào camp" />
                  <KpiTile label="Ngày cao nhất" value={rhythm.best ? fmtVndShort(rhythm.best.gmv) : "—"} note={rhythm.best?.label} />
                  <KpiTile label="Ngày thấp nhất" value={rhythm.worst ? fmtVndShort(rhythm.worst.gmv) : "—"} note={rhythm.worst?.label} />
                </div>
                <div style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={rhythm.points}>
                      <CartesianGrid stroke={PAL.line} vertical={false} />
                      <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} interval={2} />
                      <YAxis stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtVndShort(v)} width={56} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtVndShort(chartNum(v))} />
                      <Bar dataKey="gmv" name={METRIC.totalGmv} fill={`${PAL.goldDim}88`} radius={[3, 3, 0, 0]} />
                      <Line type="monotone" dataKey="ma7" name="Trung bình 7 ngày" stroke={PAL.gold} strokeWidth={2} dot={false} connectNulls={false} />
                      <Line type="monotone" dataKey="live" name={METRIC.liveGmv} stroke={PAL.blue} strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend items={[[METRIC.totalGmv, PAL.goldDim], ["Trung bình 7 ngày", PAL.gold], [METRIC.liveGmv, PAL.blue]]} />
                <div className="mt-3">
                  <ReportTable head={["Thứ", ...rhythm.weekday.map((w) => w.label)]}>
                    <tr style={rowStyle(0)}>
                      <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.gold }}>Chỉ số (100 = ngày TB)</td>
                      {rhythm.weekday.map((w) => (
                        <td key={w.label} className="py-2 px-3 text-right font-mono" style={{ color: w.index == null ? PAL.muted : w.index >= 110 ? PAL.green : w.index <= 90 ? PAL.red : PAL.cream }} title={`${w.days} ngày · TB ${fmtVndShort(w.avgGmv)}/ngày`}>
                          {w.index != null ? fmtInt(w.index) : "—"}
                        </td>
                      ))}
                    </tr>
                  </ReportTable>
                  <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                    Chỉ số theo thứ lẫn cả camp rơi vào thứ đó — tháng ngắn thì mỗi thứ chỉ có 3–4 ngày, đọc như gợi ý chứ không phải quy luật.
                  </p>
                </div>
              </Panel>
            )}
            {channelMixes.every((c) => !c) ? (
              <p className="text-sm py-4" style={{ color: PAL.muted }}>Chưa có file Shop Analytics cho các tháng này ở Dữ Liệu Gốc.</p>
            ) : (
              <Panel
                title="Cơ cấu Total GMV theo kênh"
                icon={<PieChartIcon className="w-4 h-4" />}
                sub={`4 tháng gần nhất — tỷ trọng trên tổng shop${trendDay ? ` · mọi tháng cắt 1–${trendDay} để so cùng số ngày` : ""}`}
              >
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={channelChartData} layout="vertical" stackOffset="expand" margin={{ left: 4, right: 12 }}>
                      <CartesianGrid stroke={PAL.line} horizontal={false} />
                      <XAxis type="number" stroke={PAL.muted} fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                      <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={11} width={trendDay ? 64 : 52} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtVndShort(chartNum(v))} />
                      {CHANNELS.map((c) => (
                        <Bar key={c.key} dataKey={c.key} name={c.label} stackId="ch" fill={c.color} stroke={PAL.panel} strokeWidth={2} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <ChartLegend items={CHANNELS.map((c) => [c.label, c.color])} />
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-bold" style={{ color: PAL.gold }}>
                    Chi tiết theo tháng{trendDay ? ` (mọi tháng cắt 1–${trendDay})` : ""}
                  </summary>
                  <div className="mt-2">
                    <ReportTable head={[trendDay ? "Kỳ" : "Tháng", "Total GMV", "Tỷ trọng agency", "Affiliate LIVE", "Video", "Product card", "Refund rate"]}>
                      {channelMixes.map((c, idx) => {
                        const m = last4Months[idx];
                        const agencyLive = trendStats[idx].stats.gmv;
                        return (
                          <tr key={m} style={rowStyle(idx)}>
                            <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.cream }}>{trendColLabel(m)}</td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{c ? fmtVndShort(c.shopGmv) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.gold }} title={agencyLive > 0 ? `${METRIC.liveGmv} agency ${fmtVndShort(agencyLive)}` : undefined}>
                              {c && agencyLive > 0 ? fmtPct((agencyLive / c.shopGmv) * 100) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? fmtVndShort(c.affiliate) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c ? fmtVndShort(c.video) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.card != null ? fmtVndShort(c.card) : "—"}</td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{c?.refundRate != null ? fmtPct(c.refundRate) : "—"}</td>
                          </tr>
                        );
                      })}
                    </ReportTable>
                    <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                      Tỷ trọng agency = LIVE GMV các ca có số trong app ÷ Total GMV (số tiền ở bảng Xu hướng 4 tháng, phần 3); Affiliate LIVE = GMV từ LIVE của
                      creator affiliate (Shop Analytics). Refund rate = Refunds ÷ GMV của cả shop trong kỳ.
                      {trendDay && " Product card chỉ có tổng cả tháng trong file Sản Phẩm nên khi cắt kỳ là phần còn lại của Total GMV sau 3 kênh Shop Analytics."}
                      {canManage && channelMixes.some((c) => c?.coverage != null && Math.abs(c.coverage - 100) > 2) && " Có tháng 4 kênh lệch tổng shop quá 2% — kiểm lại file Sản Phẩm / Shop Analytics của tháng đó."}
                    </p>
                  </div>
                </details>
              </Panel>
            )}
          </SectionDetail>
        </section>

        {/* ===== 3. Vì sao ===== */}
        <section id="mr-why" className="space-y-4 scroll-mt-16">
          <SectionHead no="3" title="Vì sao tăng / giảm" sub={`LIVE GMV = Giờ live × Views/giờ × LIVE CTR × CTOR × AOV · ${cmp.label}`} />
          {insightBox("why")}
          <SectionDetail open={detailOpen("why")} onOpen={() => openDetail("why")}>
            {drivers ? (
              <WaterfallPanel title="Mỗi thừa số góp bao nhiêu vào mức thay đổi" sub="5 phần cộng đúng mức thay đổi LIVE GMV (chia theo tỷ trọng log)" data={waterfallData} breakdown={drivers} />
            ) : (
              <p className="text-sm" style={{ color: PAL.muted }}>Chưa đủ số của cả 2 kỳ (Giờ live, Views, Product clicks, Orders) để tách nguyên nhân.</p>
            )}
            {dayGroups.some((g) => g.cur.sessions > 0 || g.prev.sessions > 0) && (
              <Panel title="Ngày thường vs ngày camp" icon={<Flame className="w-4 h-4" />} sub={`GMV/giờ và 4 thừa số · ${cmp.label} · mỗi tháng dùng khoảng camp của chính tháng đó`}>
                <ReportTable head={["Nhóm ngày", "Giờ live", METRIC.gmvPerHour, "±", ...RATE_FACTORS.map((k) => DRIVER_LABEL[k])]}>
                  {dayGroups.map((g, idx) => (
                    <tr key={g.key} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{controlLabel(g.key)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(g.prev.hours)} → {fmtHours(g.cur.hours)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>
                        {g.prev.gmvPerHour != null ? fmtVndShort(g.prev.gmvPerHour) : "—"} → <b>{g.cur.gmvPerHour != null ? fmtVndShort(g.cur.gmvPerHour) : "—"}</b>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold">{chgCell(pctChange(g.prev.gmvPerHour, g.cur.gmvPerHour))}</td>
                      {RATE_FACTORS.map((k) => (
                        <td key={k} className="py-2 px-3 text-right font-mono">{chgCell(pctChange(g.prev[k], g.cur[k]))}</td>
                      ))}
                    </tr>
                  ))}
                </ReportTable>
              </Panel>
            )}
            {funnel && (
              <Panel title="Phễu LIVE" icon={<Activity className="w-4 h-4" />} sub={`Số đếm cộng từ các ca · ${cmp.label} · tỷ lệ là chuyển từ bậc trên xuống`}>
                <ReportTable head={["Bậc", "Kỳ trước", "Kỳ này", "±", "Tỷ lệ", "Kỳ trước", "Kỳ này"]}>
                  {funnel.map((s, idx) => (
                    <tr key={s.label} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-semibold whitespace-nowrap" style={{ color: PAL.cream }} title={metricHint(s.label)}>{s.label}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.prev)}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtInt(s.cur)}</td>
                      <td className="py-2 px-3 text-right font-mono">{chgCell(pctChange(s.prev, s.cur))}</td>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }} title={s.rateLabel ? metricHint(s.rateLabel) : undefined}>{s.rateLabel ?? ""}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{s.rateLabel ? fmtPct(s.ratePrev) : ""}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: s.ratePrev != null && s.rateCur != null ? (s.rateCur >= s.ratePrev ? PAL.green : PAL.red) : PAL.cream }}>
                        {s.rateLabel ? fmtPct(s.rateCur) : ""}
                      </td>
                    </tr>
                  ))}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  {METRIC.productImpressions} là số LẦN sản phẩm hiện ra (một người xem thấy nhiều sản phẩm), nên không có tỷ lệ chuyển từ {METRIC.views}. {METRIC.ctor} = {METRIC.orders} ÷ {METRIC.productClicks}, cùng định nghĩa với bảng trên.
                </p>
              </Panel>
            )}
            <Panel
              title="Xu hướng 4 tháng"
              icon={<BarChart3 className="w-4 h-4" />}
              sub={trendDay ? `Mọi tháng cắt 1–${trendDay} để so cùng số ngày` : "Trọn từng tháng"}
            >
              <ReportTable head={["Chỉ số", ...trendStats.map((x) => trendColLabel(x.month)), "±"]}>
                {trendRows.map((r, idx) => {
                  const vals = trendValues(r);
                  const sig = r.goodWhenUp != null ? trendSignal(r.label, vals) : null;
                  return (
                    <tr key={r.label} style={rowStyle(idx)}>
                      <td className="py-2 px-3 whitespace-nowrap font-semibold" style={{ color: r.indent ? PAL.muted : PAL.cream, paddingLeft: r.indent ? 24 : undefined }} title={metricHint(r.label)}>
                        {r.label}
                        {sig && (
                          <span className="ml-2 text-[11px] font-bold" style={{ color: (sig.direction === "up") === r.goodWhenUp ? PAL.green : PAL.red }}>
                            {sig.direction === "up" ? "↑" : "↓"} {sig.streak} tháng
                          </span>
                        )}
                      </td>
                      {vals.map((v, i) => (
                        <td key={i} className={`py-2 px-3 text-right font-mono ${i === vals.length - 1 ? "font-bold" : ""}`} style={{ color: i === vals.length - 1 ? PAL.cream : PAL.muted }}>
                          {v != null ? r.fmt(v) : "—"}
                        </td>
                      ))}
                      <td className="py-2 px-3 text-right font-mono">{chgCell(pctChange(vals[2], vals[3]), r.goodWhenUp)}</td>
                    </tr>
                  );
                })}
              </ReportTable>
              <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                GMV/giờ = Views/giờ × LIVE CTR × CTOR × AOV. CTOR = Orders ÷ Product clicks. ERR, LIVE impressions/giờ, Avg. view chỉ tính các ca có số của trường đó. UPT live đổi theo quà tặng kèm (hàng dưới {fmtVndShort(GIFT_MAX_PRICE)}/món, đếm từ file
                Sản Phẩm) nên để trung tính; UPT bỏ quà mới phản ánh cách bán. "↓ N tháng" = N tháng liên tiếp cùng chiều, tổng lệch ≥ 10%.
              </p>
            </Panel>
          </SectionDetail>
        </section>

        {/* ===== 4. Sản phẩm ===== */}
        <section id="mr-products" className="space-y-4 scroll-mt-16">
          <SectionHead no="4" title="Sản phẩm" sub="Top SKU theo GMV, phần bán qua Seller LIVE, quà tặng, khuyến mãi" />
          {insightBox("products")}
          <SectionDetail open={detailOpen("products")} onOpen={() => openDetail("products")}>
            <Panel
              title="Top SKU theo GMV"
              icon={<ShoppingBag className="w-4 h-4" />}
              sub={
                skuMoveData
                  ? `Nguồn: file Sản Phẩm${skuMoveData.curDays ? ` (${skuMoveData.curDays} ngày)` : ""} · hạng so với tháng ${prevMonth.slice(5)}${skuMoveData.perDay ? ` (${skuMoveData.prevDays} ngày) — % GMV tính trên GMV mỗi ngày vì 2 file phủ số ngày khác nhau` : ""} · Product CTR/CTOR là phễu tổng của sản phẩm (mọi kênh)`
                  : "Nguồn: file Sản Phẩm — Seller LIVE GMV = GMV bán qua LIVE của tài khoản shop"
              }
            >
              {!topSku?.hasAnyBatch ? (
                <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                  Chưa có file "Product List" nào được import trong Dữ Liệu Gốc cho tháng này.
                </p>
              ) : skuMoveData ? (
                <ReportTable head={["Hạng", "Sản phẩm", "GMV", skuMoveData.perDay ? "± GMV/ngày" : "± GMV", "Tỷ trọng Seller LIVE", "Orders", "Items sold", "Product CTR", "CTOR"]}>
                  {skuMoveData.rows.map((r, idx) => {
                    const moved = r.prevRank == null ? null : r.prevRank - r.rank;
                    return (
                      <tr key={r.name} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.gold }}>
                          {r.rank}
                          <span className="ml-1.5 text-[11px]" style={{ color: moved == null ? PAL.muted : moved > 0 ? PAL.green : moved < 0 ? PAL.red : PAL.muted }}>
                            {r.prevRank == null ? (skuMoveData.prevLimit != null ? `(ngoài top ${skuMoveData.prevLimit})` : "") : moved === 0 ? "(=)" : `(${r.prevRank} ${moved! > 0 ? "▲" : "▼"})`}
                          </span>
                        </td>
                        <td className="py-2 px-3" style={{ color: PAL.cream }}>{r.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(r.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono">{chgCell(r.gmvChange, true, 1)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.gmv > 0 ? fmtPct((r.gmvLive / r.gmv) * 100) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(r.orders)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.itemsSold != null ? fmtInt(r.itemsSold) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.ctr)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.ctor)}</td>
                      </tr>
                    );
                  })}
                </ReportTable>
              ) : (
                <div className="space-y-2">
                  {canManage && (
                    <p className="text-[11px]" style={{ color: PAL.gold }}>
                      Bấm "Cập nhật số liệu" để có hạng so với tháng trước và phễu từng SKU.
                    </p>
                  )}
                  <ReportTable head={["#", "Sản phẩm", "GMV", "Seller LIVE GMV", "Tỷ trọng Seller LIVE", "Orders"]}>
                    {(topSku.items ?? []).map((s, idx) => (
                      <tr key={s.name} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                        <td className="py-2 px-3" style={{ color: PAL.cream }}>{s.name}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(s.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(s.gmvLive)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{s.gmv > 0 ? fmtPct((s.gmvLive / s.gmv) * 100) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.orders)}</td>
                      </tr>
                    ))}
                  </ReportTable>
                </div>
              )}
              {skuRankCur?.skusFor80Pct != null && (
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  Độ tập trung: {fmtInt(skuRankCur.sellingSkus)} SKU có doanh thu, {fmtInt(skuRankCur.skusFor80Pct)} SKU đầu bảng đã tạo 80% GMV
                  {skuRankCur.sellingSkus > 0 ? ` (${fmtFixed((skuRankCur.skusFor80Pct / skuRankCur.sellingSkus) * 100, 0)}% số SKU)` : ""}.
                </p>
              )}
              {giftSliceCur?.hasAnyBatch && giftSliceCur.giftItems > 0 && (
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  Quà tặng (hàng dưới {fmtVndShort(GIFT_MAX_PRICE)}/món) tháng này: {fmtInt(giftSliceCur.giftItems)} món ở {giftSliceCur.giftSkus} SKU —{" "}
                  {giftSliceCur.top.map(([name, items, price]) => `${shortSku(name)} ${fmtInt(items)} món ~${fmtVndShort(price)}`).join("; ")}.
                </p>
              )}
            </Panel>
            <Panel
              title="Top Chương Trình Khuyến Mãi"
              icon={<Megaphone className="w-4 h-4" />}
              sub={`Nguồn: Shop Promotion List — chỉ xếp hạng chương trình chạy TRỌN trong tháng${topPromo?.excludedMultiMonth ? ` (đã loại ${topPromo.excludedMultiMonth} chương trình vắt qua tháng khác)` : ""}`}
            >
              {!topPromo?.hasAnyBatch ? (
                <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                  Chưa có file "Shop Promotion List" nào được import trong Dữ Liệu Gốc cho tháng này.
                </p>
              ) : topPromo.items.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                  Không có chương trình nào chạy trọn trong tháng này. Chương trình vắt qua nhiều tháng bị loại vì cột GMV trong file TikTok là luỹ kế cả chương trình.
                </p>
              ) : (
                <>
                <ReportTable head={["#", "Chương trình", "Trạng thái", "GMV", "Orders", "AOV", "Giảm giá", "ROI"]}>
                  {(topPromo.items ?? []).map((p, idx) => (
                    <tr key={p.name + idx} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                      <td className="py-2 px-3" style={{ color: PAL.cream }}>{p.name}</td>
                      <td className="py-2 px-3 text-right">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${promoStatusLabel(p.status).color}22`, color: promoStatusLabel(p.status).color }}>
                          {promoStatusLabel(p.status).label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(p.gmv)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(p.orders)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(p.aov)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{p.discount != null ? fmtVndShort(p.discount) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{p.roi != null && p.roi > 0 ? fmtFixed(p.roi, 2) : "—"}</td>
                    </tr>
                  ))}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  {topPromo.totalDiscount != null && topPromo.totalDiscount > 0 && <>Tổng tiền giảm giá của các chương trình chạy trọn trong tháng: {fmtVndShort(topPromo.totalDiscount)}. </>}
                  ROI = GMV ÷ tiền giảm giá (cột ROI của TikTok).
                  {topPromo.items[0]?.discount === undefined && canManage && " Cột Giảm giá/ROI trống vì số liệu chốt trước khi report có 2 cột này — bấm \"Cập nhật số liệu\"."}
                </p>
                </>
              )}
              {(topPromo?.longTerm?.length ?? 0) > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-bold" style={{ color: PAL.gold }}>
                    Chương trình dài hạn (vắt qua nhiều tháng) — GMV luỹ kế, không xếp hạng cùng bảng trên
                  </summary>
                  <div className="mt-2">
                    <ReportTable head={["Chương trình", "Kỳ chạy", "GMV luỹ kế", "Giảm giá luỹ kế"]}>
                      {topPromo!.longTerm!.map((p, idx) => (
                        <tr key={p.name + idx} style={rowStyle(idx)}>
                          <td className="py-2 px-3" style={{ color: PAL.cream }}>{p.name}</td>
                          <td className="py-2 px-3 font-mono whitespace-nowrap" style={{ color: PAL.muted }}>{p.period.replace(/ \d{2}:\d{2}/g, "")}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(p.gmv)}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{p.discount != null ? fmtVndShort(p.discount) : "—"}</td>
                        </tr>
                      ))}
                    </ReportTable>
                  </div>
                </details>
              )}
            </Panel>
          </SectionDetail>
        </section>

        {/* ===== 5. Host ===== */}
        <section id="mr-people" className="space-y-4 scroll-mt-16">
          <SectionHead no="5" title="Host" sub={`Cùng cách tính với Hiệu Suất Host của agency · so mặt bằng gộp ${relMonths} tháng, có khoảng tin cậy`} />
          {insightBox("people")}
          <SectionDetail open={detailOpen("people")} onOpen={() => openDetail("people")}>
            <HostPerformancePanel rows={hostDayType} team={hostDayTypeTeam} campDaysLabel={campDaysLabel} vsPeer={hostInsight.vsPeer} reliability={reliabilityByKey} relMonths={relMonths}>
              {canManage && hostQuality.reconciled < hostQuality.total && (
                <div className="mb-3">
                  {warnBox(
                    <>
                      {hostQuality.total} phiên: {hostQuality.reconciled} đã đối soát
                      {hostQuality.snapshot > 0 ? `, ${hostQuality.snapshot} số lúc giao ca (chờ đối soát cuối kỳ)` : ""}
                      {hostQuality.manual > 0 ? `, ${hostQuality.manual} talent tự khai (chưa có gì bảo chứng)` : ""}. Đối soát ở "Vận Hành Live → Đối Soát Số Liệu" trước khi phát hành report.
                    </>
                  )}
                </div>
              )}
              {unassignedHost && !canManage && (
                <p className="text-[11px] mb-3" style={{ color: PAL.muted }}>
                  {unassignedHost.sessionCount} ca ({fmtVndShort(unassignedHost.gmv)}) chưa ghi nhận host nên không nằm trong bảng.
                </p>
              )}
              {unassignedHost && canManage && (
                <div className="mb-3">
                  {warnBox(
                    <>
                      {unassignedHost.sessionCount} ca chưa gán host ({fmtVndShort(unassignedHost.gmv)} · {fmtFixed(unassignedHost.hours, 1)}h) không nằm trong bảng này — gán host cho ca để số về đúng người.
                    </>
                  )}
                </div>
              )}
              {snapshot.version < 3 && canManage && (
                <div className="mb-3">{warnBox(<>Số liệu này chốt trước khi report lưu trợ live — dòng "Giờ trợ live" đang trống. Bấm "Cập nhật số liệu" ở trên để có.</>)}</div>
              )}
            </HostPerformancePanel>
          </SectionDetail>
        </section>

        {/* ===== 6. Campaign & khung giờ ===== */}
        <section id="mr-context" className="space-y-4 scroll-mt-16">
          <SectionHead no="6" title="Campaign & khung giờ" sub="Mỗi khung so với chính khung đó tháng trước, Ads toàn cửa hàng, khung giờ bắt đầu ca" />
          {insightBox("context")}
          <SectionDetail open={detailOpen("context")} onOpen={() => openDetail("context")}>
            <Panel title="Campaign — so với cùng khung tháng trước" icon={<Flame className="w-4 h-4" />} sub={`GMV tính từ ca · Target GMV: ${campTargetSource} · ${cmp.label} · mỗi tháng dùng khoảng ngày Campaign của chính tháng đó`}>
              <ReportTable head={["Khung", "Target GMV", "GMV", "% Target", prevColLabel, "± GMV", "GMV/giờ", "± GMV/giờ", "CTOR"]}>
                {campDetailRows.map((r, idx) => {
                  const none = r.cur.sessions === 0;
                  return (
                    <tr key={r.key} style={rowStyle(idx)}>
                      <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{r.label}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.target != null ? fmtVndShort(r.target) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                        {none ? <span style={{ color: PAL.muted, fontWeight: 400 }}>chưa có ca</span> : fmtVndShort(r.cur.gmv)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{!none && r.target ? fmtPct((r.cur.gmv / r.target) * 100) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.sessions > 0 ? fmtVndShort(r.prev.gmv) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{chgCell(none ? null : pctChange(r.prev.gmv, r.cur.gmv), true, 1)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.cur.gmvPerHour != null ? fmtVndShort(r.cur.gmvPerHour) : "—"}</td>
                      <td className="py-2 px-3 text-right font-mono">{chgCell(none ? null : pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour), true, 1)}</td>
                      <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(r.cur.ctor)}</td>
                    </tr>
                  );
                })}
              </ReportTable>
            </Panel>
            {adsCur ? (() => {
              const prevLabel = adsCur.lastDate && adsCur.lastDate < end ? `1–${Number(adsCur.lastDate.slice(8))}/${prevMonth.slice(5)}` : `Tháng ${prevMonth.slice(5)}`;
              const vsPrev = (cur: number | null, prev: number | null | undefined, fmt: (v: number) => string) => {
                if (prev == null || cur == null) return undefined;
                const c = pctChange(prev, cur);
                return `${prevLabel}: ${fmt(prev)}${c != null ? ` (${c >= 0 ? "+" : "−"}${fmtFixed(Math.abs(c), 0)}%)` : ""}`;
              };
              const buckets = CAMP_DAY_BUCKET_ORDER.filter((b) => (adsCur.byBucket?.[b].days ?? 0) > 0);
              const ranked = buckets.filter((b) => adsCur.byBucket![b].roi != null).sort((a, b) => adsCur.byBucket![b].roi! - adsCur.byBucket![a].roi!);
              const roiX = (v: number | null | undefined) => (v != null ? `${fmtFixed(v, 1)}x` : "—");
              const notes: string[] = [];
              if (ranked.length >= 2) {
                const hi = ranked[0];
                const lo = ranked[ranked.length - 1];
                notes.push(`ROI cao nhất ở ${DAY_TYPE_SHORT[hi]} (${roiX(adsCur.byBucket![hi].roi)}), thấp nhất ở ${DAY_TYPE_SHORT[lo]} (${roiX(adsCur.byBucket![lo].roi)}).`);
              }
              if (adsCur.zeroOrderDays.length) {
                notes.push(`${adsCur.zeroOrderDays.length} ngày tiêu tiền mà 0 đơn (${adsCur.zeroOrderDays.map((d) => fmtDateVn(d.date, false)).join(", ")}) — ${fmtVndFull(adsCur.zeroOrderDays.reduce((a, d) => a + d.cost, 0))}.`);
              }
              if (adsCur.lowRoiDays.length) {
                notes.push(`Ngày ROI thấp nhất trong các ngày chi đáng kể: ${adsCur.lowRoiDays.map((d) => `${fmtDateVn(d.date, false)} (${roiX(d.roi)}, chi ${fmtVndShort(d.cost)})`).join("; ")}.`);
              }
              notes.push("Doanh thu gộp TikTok tính theo đơn gốc trước huỷ/hoàn nên có thể lớn hơn GMV của shop — không dùng làm % GMV; ROI sau huỷ/hoàn sẽ thấp hơn.");
              const chartData = adsCur.days.map((d) => ({ day: Number(d.date.slice(8)), cost: d.cost, roi: d.cost > 0 ? d.revenue / d.cost : null }));
              return (
                <Panel
                  title="Ads toàn cửa hàng (TikTok Ads)"
                  icon={<Megaphone className="w-4 h-4" />}
                  sub={`File Campaign overview data · ${fmtDateVn(adsCur.firstDate!, false)}–${fmtDateVn(adsCur.lastDate!, false)} · gồm LIVE GMV Max và Product GMV Max · ROI = doanh thu gộp ÷ chi phí · so ${prevLabel}`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    <KpiTile label="Chi phí Ads" value={fmtVndShort(adsCur.cost)} note={vsPrev(adsCur.cost, adsPrev?.cost, fmtVndShort)} />
                    <KpiTile label="ROI" value={roiX(adsCur.roi)} change={pctChange(adsPrev?.roi, adsCur.roi)} note={adsPrev ? `${prevLabel}: ${roiX(adsPrev.roi)}` : undefined} />
                    <KpiTile label="Chi phí / đơn SKU" value={adsCur.costPerOrder != null ? fmtVndFull(adsCur.costPerOrder) : "—"} note={`${fmtVndFull(adsCur.orders)} đơn${adsPrev?.costPerOrder != null ? ` · ${prevLabel}: ${fmtVndFull(adsPrev.costPerOrder)}` : ""}`} />
                    <KpiTile label="Doanh thu gộp từ Ads" value={fmtVndShort(adsCur.revenue)} change={pctChange(adsPrev?.revenue, adsCur.revenue)} />
                  </div>
                  <ReportTable head={["Loại ngày", "Số ngày", "Chi phí", "Doanh thu gộp", "ROI", `ROI ${prevLabel}`, "Đơn SKU"]}>
                    {buckets.map((b, idx) => {
                      const r = adsCur.byBucket![b];
                      const p = adsPrev?.byBucket?.[b];
                      return (
                        <tr key={b} style={rowStyle(idx)}>
                          <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{CAMP_DAY_BUCKET_LABEL[b]}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.days}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtVndShort(r.cost)}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(r.revenue)}</td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{roiX(r.roi)}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{p && p.days > 0 ? roiX(p.roi) : "—"}</td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndFull(r.orders)}</td>
                        </tr>
                      );
                    })}
                  </ReportTable>
                  <div style={{ height: 220 }} className="mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={chartData} margin={{ left: 4, right: 4 }}>
                        <CartesianGrid stroke={PAL.line} vertical={false} />
                        <XAxis dataKey="day" stroke={PAL.muted} fontSize={11} />
                        <YAxis yAxisId="cost" stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtVndShort(v)} width={52} />
                        <YAxis yAxisId="roi" orientation="right" stroke={PAL.muted} fontSize={11} tickFormatter={(v) => `${v}x`} width={40} />
                        <Tooltip
                          contentStyle={chartTooltipStyle}
                          labelFormatter={(d) => `Ngày ${d}/${month.slice(5)}`}
                          formatter={(v, name) => (name === "ROI" ? `${fmtFixed(chartNum(v), 1)}x` : fmtVndFull(chartNum(v)))}
                        />
                        <Bar yAxisId="cost" dataKey="cost" name="Chi phí" fill={PAL.blue} radius={[3, 3, 0, 0]} />
                        <Line yAxisId="roi" dataKey="roi" name="ROI" stroke={PAL.gold} dot={false} strokeWidth={2} connectNulls={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <ChartLegend items={[["Chi phí Ads theo ngày", PAL.blue], ["ROI theo ngày (trục phải)", PAL.gold]]} />
                  <ul className="mt-3 space-y-1 text-[11px] list-disc pl-4" style={{ color: PAL.muted }}>
                    {notes.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </Panel>
              );
            })() : (
              canManage && warnBox(<>Chưa có file Ads tháng {month.slice(5)}/{month.slice(0, 4)} trong bản chụp này. Brand có chạy Ads: tải file &quot;Campaign overview data&quot; ở Nhập Ads rồi bấm Cập nhật số liệu. Không chạy Ads thì bỏ qua — brand không thấy dòng này.</>)
            )}
            <Panel title="Khung giờ bắt đầu ca" icon={<CalendarClock className="w-4 h-4" />} sub={`GMV/giờ · ${cmp.label}`}>
              <ReportTable head={["Khung giờ", "Sessions (trước → nay)", "GMV/giờ kỳ trước", "GMV/giờ kỳ này", "Thay đổi"]}>
                {slotRows.map((r, idx) => (
                  <tr key={r.key} style={rowStyle(idx)}>
                    <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{r.label}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.n} → {r.cur.n}</td>
                    <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{r.prev.gmvPerHour != null ? fmtVndShort(r.prev.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{r.cur.gmvPerHour != null ? fmtVndShort(r.cur.gmvPerHour) : "—"}</td>
                    <td className="py-2 px-3 text-right font-mono">{chgCell(pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour), true, 1)}</td>
                  </tr>
                ))}
              </ReportTable>
            </Panel>
            <details className="rounded-xl" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
              <summary className="cursor-pointer px-4 py-3 text-xs font-bold" style={{ color: PAL.gold }}>
                Phân bố GMV/giờ từng phiên & Top 10 phiên live
              </summary>
              <div className="p-4 pt-0 space-y-4">
                {spread && (
                  <Panel title="Phân bố GMV/giờ từng phiên" icon={<Activity className="w-4 h-4" />} sub={`${spread.count} phiên · ${cmp.label.split(" so với")[0]} · mỗi chấm là một phiên (bỏ phiên dưới 6 phút)`}>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
                      {([["Thấp nhất", spread.worst], ["Phân vị 25", spread.p25], ["Trung vị", spread.median], ["Phân vị 75", spread.p75], ["Cao nhất", spread.best]] as const).map(([label, v]) => (
                        <KpiTile key={label} label={label} value={fmtVndShort(v)} />
                      ))}
                    </div>
                    <div style={{ height: 240 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ left: 4, right: 12 }}>
                          <CartesianGrid stroke={PAL.line} />
                          <XAxis type="number" dataKey="hours" name={METRIC.liveHours} stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtHours(v)} />
                          <YAxis type="number" dataKey="gmvPerHour" name={METRIC.gmvPerHour} stroke={PAL.muted} fontSize={11} tickFormatter={(v) => fmtVndShort(v)} width={56} />
                          <ReferenceLine y={spread.median} stroke={PAL.gold} strokeDasharray="4 3" />
                          <Tooltip
                            contentStyle={chartTooltipStyle}
                            formatter={(v, name) => (name === METRIC.liveHours ? fmtHours(chartNum(v)) : fmtVndShort(chartNum(v)))}
                            labelFormatter={() => ""}
                          />
                          <Scatter data={spread.points} fill={PAL.blue} fillOpacity={0.75} />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                      Đường vàng = trung vị. Nửa giữa các phiên nằm trong {fmtVndShort(spread.p25)}–{fmtVndShort(spread.p75)}/giờ; phiên dưới phân vị 25 là chỗ nên xem lại host, khung giờ hoặc hàng lên sóng.
                    </p>
                  </Panel>
                )}
                <Panel title="Top 10 phiên live theo GMV" icon={<ListOrdered className="w-4 h-4" />} sub={liveSource.source === "sessions" ? "Nguồn: ca có số trong app" : "Nguồn: file Creator Live Performance"}>
                  <ReportTable head={["#", "Bắt đầu", "Giờ live", "GMV", "GMV/giờ", "Orders", "Items sold", "Views", "Product CTR", "CTOR"]}>
                    {topSessions.map((s, idx) => (
                      <tr key={s.roomId ?? idx} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>{idx + 1}</td>
                        <td className="py-2 px-3 font-mono" style={{ color: PAL.cream }}>{fmtSessionStart(s.startTime)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(s.hours)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{fmtVndShort(s.gmv)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtVndShort(s.gmvPerHour)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.orders)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.itemsSold)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtInt(s.views)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(s.ctr)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtPct(s.ctor)}</td>
                      </tr>
                    ))}
                    {topSessions.length === 0 && (
                      <tr>
                        <td colSpan={10} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                          Chưa có phiên live nào trong tháng.
                        </td>
                      </tr>
                    )}
                  </ReportTable>
                </Panel>
              </div>
            </details>
          </SectionDetail>
        </section>

        {/* ===== 7. Tháng sau ===== */}
        <section id="mr-next" className="space-y-4 scroll-mt-16">
          <SectionHead no="7" title="Tháng sau" sub={`Việc agency làm + kế hoạch tháng ${nextMonth.slice(5)} từ Kế Hoạch Tháng`} />
          <div className="rounded-xl p-4" style={{ background: PAL.panel, border: `1px solid ${PAL.gold}44` }}>
            <div className="text-[11px] uppercase tracking-wider mb-2 font-bold" style={{ color: PAL.gold }}>Việc agency làm tháng sau</div>
            <ol className="space-y-2 text-sm leading-relaxed list-decimal pl-5" style={{ color: PAL.cream }}>
              {nextLines.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ol>
          </div>
          <SectionDetail open={detailOpen("next")} onOpen={() => openDetail("next")}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <KpiTile label={`Target GMV tháng ${nextMonth.slice(5)}`} value={nextPlan && nextPlan.targetGmv > 0 ? fmtVndShort(nextPlan.targetGmv) : "—"} note={nextPlan ? (nextPlan.status === "locked" ? "đã chốt" : "đang lên lịch") : "chưa lập kế hoạch"} />
              <KpiTile label="Sessions kế hoạch" value={nextPlan ? String(nextPlan.slotCount) : "—"} note={nextPlan ? "trong Kế Hoạch Tháng" : ""} />
              {nextPlanFull && nextPlanFull.plan.shopTargetGmv > 0 && (
                <KpiTile
                  label={`KPI GMV tháng ${nextMonth.slice(5)}`}
                  value={fmtVndShort(nextPlanFull.plan.shopTargetGmv)}
                  note={nextPlan && nextPlan.targetGmv > 0 ? `Target GMV live = ${fmtPct((nextPlan.targetGmv / nextPlanFull.plan.shopTargetGmv) * 100)} KPI GMV` : "brand giao · mọi kênh"}
                />
              )}
            </div>
            {nextAllocation && (
              <Panel
                title={`Phân bổ target tháng ${nextMonth.slice(5)} theo khung`}
                icon={<Flame className="w-4 h-4" />}
                sub={`Cộng từ ca trong Kế Hoạch Tháng ${nextMonth.slice(5)} · so GMV/giờ cần đạt với GMV/giờ thực đạt cùng khung tháng ${month.slice(5)}`}
              >
                <ReportTable head={["Khung", "Phân bổ (%)", "Target GMV", "Sessions", "Giờ live", "GMV/giờ cần", `GMV/giờ T${Number(month.slice(5))}`, "Cần tăng"]}>
                  {nextAllocation.map((a, idx) => {
                    const actual = campDetailRows.find((r) => r.key === a.key)?.cur.gmvPerHour ?? null;
                    const gap = a.requiredGmvPerHour != null && actual != null && actual > 0 ? ((a.requiredGmvPerHour - actual) / actual) * 100 : null;
                    return (
                      <tr key={a.key} style={rowStyle(idx)}>
                        <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{CAMP_DAY_BUCKET_LABEL[a.key]}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{fmtPct(a.share)}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>{a.target > 0 ? fmtVndShort(a.target) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{a.slots}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{fmtHours(a.hours)}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.cream }}>{a.requiredGmvPerHour != null ? fmtVndShort(a.requiredGmvPerHour) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>{actual != null ? fmtVndShort(actual) : "—"}</td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: gap == null ? PAL.muted : gap > 10 ? PAL.red : gap > 0 ? PAL.gold : PAL.green }}>
                          {gap == null ? "—" : `${gap >= 0 ? "+" : "−"}${fmtFixed(Math.abs(gap), 0)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </ReportTable>
                <p className="text-[11px] mt-2" style={{ color: PAL.muted }}>
                  "Cần tăng" = GMV/giờ phải đạt so với GMV/giờ thực đạt cùng khung tháng này{cmp.partial ? ` (tính tới ${Number(cmp.curEnd.slice(8))}/${month.slice(5)})` : ""}. Đỏ: cần tăng hơn 10%.
                </p>
              </Panel>
            )}
          </SectionDetail>
        </section>

        {/* Chỉ là chỉ đường cho ops — report gửi brand là 7 phần ở trên (Phân tích sâu đã gộp vào, 2026-09-27). */}
        {canManage && (
          <p className="text-[11px] pt-3" style={{ color: PAL.muted, borderTop: `1px solid ${PAL.line}` }}>
            Chỉ ops thấy: target, khung camp và lịch tháng nhập ở <b>Kế Hoạch Tháng</b>; bảng creator affiliate theo tháng ở trang <b>Affiliate</b>.
          </p>
        )}
      </div>
    </div>
  );
};
