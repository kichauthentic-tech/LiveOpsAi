import React, { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Megaphone, AlertTriangle, Download } from "lucide-react";
import { LiveSession, BrandMonthlyReport as BrandMonthlyReportType, BrandPlatformRate, ShiftSlot } from "../../types";
import { planTargetOf } from "../../lib/performance/targetAllocation";
import { METRIC } from "../../lib/metricGlossary";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { pickLivePerfSource } from "../../lib/report/sessionsLivePerf";
import { planRunRate } from "../../lib/performance/planRunRate";
import { todayVn } from "../../lib/performance/brandCommitment";
import { chooseNmvRate, compareRefundRates, refundMonthStatus, type RefundMonthStatus } from "../../lib/refundStatus";
import { hydrateSnapshotSessions, MonthlyReportSnapshot, reportWindow, snapshotView } from "../../lib/report/monthlySnapshot";
import { autoNextSteps, autoSummary, campCompare, channelMix, compareWindow, shopCompareWindow, DRIVER_LABEL, driverBreakdown, liveStatsFromRows, LiveStats, NarrativeInput, pctChange, planCampAllocation, RATE_FACTORS, shopKpiProgress, shopTotals, skuMoves } from "../../lib/report/monthlyReportInsights";
import { controlGroup, liveGmvByDate, controlLabel, controlLine, controlVerdict, dailyGap, dailyGapLine, dayGroupStats, GIFT_MAX_PRICE, giftLine, giftStats, GiftStats, hostReliability, isBorderline, mixRateSplit, reliabilityText, VERDICT_TEXT } from "../../lib/report/deepAnalysis";
import { CreatorLivePerfRow, vnDateOf } from "../../lib/dataraw/creatorLivePerfSlice";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import type { BrandMonthPlan, BrandMonthPlanSlot } from "../../types";
import { fetchMonthlyReport, saveMonthlyReportActionPlan, saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import { gradeAction, newActionItem, type ActionGradeContext, type ActionItem } from "../../lib/report/actionPlan";
import { adsTypeRows } from "../../lib/report/adsSlide";
import { ActionPlanPanel, ActionResultsPanel } from "./report/ActionPlan";
import { BookingPlanPanel, NextLivePlanPanel } from "./report/NextMonthPanels";
import { REFUND_FINAL_KEY, applyFinalRate, bookingTotals, decodeRefundFinal, decodeTodoMeta, encodeRefundFinal, encodeTodoMeta, refundTrackRows, todoMetaKey } from "../../lib/report/nextMonthPlan";
import { BLOCK_KEYS, BLOCK_LABEL, decodeEdits, shownBlocks, type InsightBlocks, adsBlocks, affiliateBlocks, keyMetricsBlocks, nextBlocks, nmvBlocks, pageNoteKey, peopleBlocks, productsBlocks, shopBlocks, summaryBlocks, whyBlocks, type InsightPage } from "../../lib/report/pageInsights";
import { contextInsight, HostInsightRow, hostVsPeer, InsightSection, peopleInsight, peopleOpsNote, productsInsight, sectionNextSteps, SectionInsight, shopInsight, shortSku, whyInsight } from "../../lib/report/sectionInsights";
import { CAMP_DAY_BUCKET_LABEL, CAMP_DAY_BUCKET_ORDER, effectiveCamp, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../../lib/campaignDays";
import { liveFunnel, sessionSpread } from "../../lib/report/rhythm";
import { adsMonthStats, adsPrevSameCut } from "../../lib/dataraw/adsCampaignOverview";
import { errorMessage } from "../../lib/errorMessage";
import { fmtKeyMetric, KEY_METRICS, keyMetricSheetColumns, keyMetricSheetLabel, keyMetricSheetValue, keyMetricValue, type KeyMetrics } from "../../lib/report/keyMetrics";
import { byHost, byHostDayType, dayTypeTeamTotals, dayTypeMetrics, HOST_DAY_TYPE_ORDER, dataQuality, filterSessions, hostKey, splitUnassignedHost, DataQuality } from "../../lib/performance/hostPerformance";

import { fmtDateVn, fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { CHANNELS, DAY_TYPE_SHORT, PAL, SECTIONS, chartTooltipStyle, type ReportSectionId } from "./report/theme";
import { chartNum, fmtHours, fmtInt, fmtPct, fmtSessionStart, monthRangeLocal, nextMonthStrLocal, prevMonthStrLocal, promoStatusLabel } from "./report/format";
import { ChartLegend, PageInsight, KpiTile, Panel, ReportTable, toWaterfall, PageHead, PagePager, PageRail, type PageMetric } from "./report/ui";
import { keyMetricsHeadline, observeHeadline, summaryHeadline } from "../../lib/report/pageHeadlines";
import { bridgePoints, planHourRows, skuImageKey, targetBridge, trafficBridge, type ScatterPoint } from "../../lib/report/reportVisuals";
import "./report/demo.css";
import { PLATFORM_PROFILES } from "../../lib/platforms/profiles";
import { platformOf } from "../../lib/reportPlatform";
import type { AffiliateActualEntry, AffiliatePlanMonth } from "../../types";
import { fetchAffiliateActuals } from "../../lib/db/affiliateActuals";
import { fetchAffiliatePlanMonth } from "../../lib/db/affiliatePlanMonths";
import { creatorRates, keyMetricsTable, bucketStats, campSpanLabels, changeTone, creatorPlanRows, creatorSessionRows, creatorTotals, dayTypeFactorRows, noiseBand, scoreRows, type KeyMetricsMonth, type KeyMetricsTab } from "../../lib/report/brandReport";
import { AdsPlanPanel } from "./report/AdsPlanPanel";
import { ProductsPageBody, productsKpis, type ProductsPageData } from "./report/ProductsPage";
import { HostPageBody, hostKpis, type HostPageData } from "./report/HostPage";
import { DemoInsight, DemoShopPage, DemoWhyPage } from "./report/DemoShopWhy";
import { adsTrackingMonth, type AdsDayRow } from "../../lib/ads/adsTracking";
import { fetchAdsDaily } from "../../lib/db/adsDaily";
import { AffiliateTrackPanel } from "./report/AffiliateTrackPanel";
import { KeyMetricsDemoPage, NmvDemoPage, SummaryDemoPage, type NmvMonth } from "./report/DemoSummaryPages";
import { REFUND_FINAL_DATE_KEY, decodeRefundFinalDate, encodeRefundFinalDate } from "../../lib/report/refundFinalDate";
import { affiliateTrackColumns, affiliateTrackTotals } from "../../lib/report/affiliateTrack";

const INSIGHT_PAGES: [InsightPage, string][] = [["summary", "Tổng quan"], ["keymetrics", "Key Metrics"], ["nmv", "NMV"], ["shop", "Toàn shop"], ["why", "Nguyên nhân"], ["products", "Sản phẩm"], ["people", "Host"], ["ads", "Quảng cáo"], ["affiliate", "Affiliate"], ["next", "Kế hoạch tháng sau"]];

// Report Tháng này là report của sàn TikTok (Shopee: ShopeeMonthlyReportTabs) — chỉ đọc ca TikTok.
const REPORT_PLATFORM = PLATFORM_PROFILES.TikTok.id;
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
  /** Dựng bản gửi brand từ phiên của ops (xuất file HTML): RLS không lọc hộ như khi brand tự đăng nhập, nên tự lọc kế hoạch/lịch chưa chốt. */
  forBrand?: boolean;
  /** Hiện đủ 10 trang cùng lúc + mục lục cuộn (file HTML gửi brand nhân bản DOM nên không được chỉ ra trang đang chọn). */
  showAll?: boolean;
}

export const MonthlyReportTabs: React.FC<MonthlyReportTabsProps> = ({ brandId, brandName, month, snapshot, liveSessions, shiftSlots = [], canManage, forBrand = false, showAll = false }) => {

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
    () => hydrateSnapshotSessions(snapshot).filter((s) => platformOf(s) === REPORT_PLATFORM && !hiddenMonths.has(s.date.slice(0, 7))),
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
  // Dòng report tháng trước — chỉ để đọc action plan viết ở đó và chấm bằng số tháng này (0182). Brand chỉ đọc được
  // khi tháng trước đã phát hành (RLS 0051).
  const [prevReportRow, setPrevReportRow] = useState<BrandMonthlyReportType | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMonthlyReport(brandId, `${prevMonth}-01`)
      .then((row) => !cancelled && setPrevReportRow(row))
      .catch(() => !cancelled && setPrevReportRow(null));
    return () => {
      cancelled = true;
    };
  }, [brandId, prevMonth]);
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
  const planRR = useMemo(() => {
    const p = plans[month];
    if (p?.plan.status !== "locked") return null;
    const bs = sessions.filter((s) => s.brandId === brandId);
    // Cùng khung camp hiệu lực với phần còn lại của report (effectiveCamp — audit workflow #8); trước đây
    // run-rate đọc khung Kế Hoạch Tháng còn bảng khung camp đọc khung đã ghi đè ⇒ hai khung trong một trang.
    const camp = effectiveCamp(p.plan.campRanges);
    return { rr: planRunRate(month, p.slots, shiftSlots, bs, todayVn(), camp), bs, camp };
  }, [plans, month, sessions, brandId, shiftSlots]);
  // Tháng T−2 chỉ để lấy khung camp + target cho trang Key Metrics 3 tháng.
  const prev2Month = useMemo(() => prevMonthStrLocal(prevMonth), [prevMonth]);
  useEffect(() => {
    let cancelled = false;
    const ms = [prev2Month, prevMonth, month, nextMonth];
    Promise.all(ms.map((m) => fetchMonthPlan(brandId, m).catch(() => null))).then((rs) => {
      if (!cancelled) setPlans(Object.fromEntries(ms.map((m, i) => [m, forBrand && rs[i]?.plan.status !== "locked" ? null : rs[i]])));
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, prev2Month, prevMonth, month, nextMonth, forBrand]);

  // Affiliate (tab Affiliate, 0102/0155): phiên creator tháng report (trang 8) + lịch creator tháng sau (trang 9). Bảng nhỏ, đọc
  // thẳng như Kế Hoạch Tháng, không vào bản chụp. Role brand chỉ thấy tháng ops đã Chốt (RLS 0155) ⇒ không có dòng thì khối ẩn.
  const [affiliate, setAffiliate] = useState<{ cur: AffiliateActualEntry[]; next: AffiliateActualEntry[]; nextMeta: AffiliatePlanMonth | null }>({ cur: [], next: [], nextMeta: null });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAffiliateActuals(brandId, `${month}-01`).catch(() => []),
      fetchAffiliateActuals(brandId, `${nextMonth}-01`).catch(() => []),
      fetchAffiliatePlanMonth(brandId, `${nextMonth}-01`).catch(() => null)
    ]).then(([cur, next, nextMeta]) => {
      if (!cancelled) setAffiliate({ cur, next: forBrand && !nextMeta?.publishedAt ? [] : next, nextMeta });
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, month, nextMonth, forBrand]);
  // Ads theo ngày dán từ file tracking của brand (0184): target + thực tế tách Live / Product / Creator. Bảng nhỏ, đọc thẳng như
  // Affiliate, không vào bản chụp; brand đọc được khi tháng đã phát hành (RLS). DB chưa chạy 0184 ⇒ coi như chưa có.
  const [adsPlanRows, setAdsPlanRows] = useState<{ key: string; rows: AdsDayRow[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchAdsDaily(brandId, month, REPORT_PLATFORM)
      .catch(() => [])
      .then((rows) => !cancelled && setAdsPlanRows({ key: `${brandId}|${month}`, rows }));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);
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
      completedInPeriod.filter((s) => platformOf(s) === REPORT_PLATFORM),
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
  const hostQuality = useMemo(() => dataQuality(filterSessions(completedInPeriod.filter((s) => platformOf(s) === REPORT_PLATFORM), {})), [completedInPeriod]);
  const unassignedHost = useMemo(
    () => splitUnassignedHost(byHost(filterSessions(completedInPeriod.filter((s) => platformOf(s) === REPORT_PLATFORM), {}))).unassigned,
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
      .reduce((sum, x) => sum + planTargetOf(x), 0);
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
  // Bộ số để chấm action plan tháng trước + gợi ý ngưỡng cho plan tháng sau: cả tháng + từng loại ngày, target theo
  // Kế Hoạch Tháng đã chốt. Chỉ kết luận khi số phiên đủ tới cuối tháng (cmp.partial = còn dở).
  const actionCtx = useMemo<ActionGradeContext>(() => {
    const by = (k: CampDayBucket) => campDetailRows.find((r) => r.key === k);
    const bucket = <T,>(f: (k: CampDayBucket) => T) => Object.fromEntries(CAMP_DAY_BUCKET_ORDER.map((k) => [k, f(k)])) as Record<CampDayBucket, T>;
    return {
      stats: { all: liveCurStats, ...bucket((k) => by(k)?.cur ?? null) },
      targets: { all: kpiTargetGmvCur, ...bucket((k) => by(k)?.target ?? null) },
      final: !cmp.partial
    };
  }, [liveCurStats, campDetailRows, kpiTargetGmvCur, cmp]);
  const prevPlanItems = prevReportRow?.actionPlan?.items ?? null;
  const prevGrades = useMemo(() => (prevPlanItems ? prevPlanItems.map((i) => gradeAction(i, actionCtx)) : null), [prevPlanItems, actionCtx]);
  const drivers = useMemo(() => driverBreakdown(livePrevStats, liveCurStats), [livePrevStats, liveCurStats]);
  const waterfallData = useMemo(() => toWaterfall(drivers, cmp, month, prevMonth), [drivers, cmp, month, prevMonth]);

  const rowsOf = (m: string) => {
    const { start: s, end: e } = monthRangeLocal(m);
    return m === month ? liveCurrent?.rows ?? [] : m === prevMonth ? livePrev?.rows ?? [] : pickLivePerfSource(sessions, brandId, s, e, liveOlderMonths[m] ?? null).slice.rows;
  };
  // Xu hướng 4 tháng CÙNG SỐ NGÀY (tháng chưa hết thì mọi tháng cắt 1..N): đặt 3 tháng trọn cạnh tháng mới 22 ngày
  // từng sinh câu "giảm 4 tháng liên tiếp" so lệch kỳ. Cơ cấu kênh phần 2 dùng chung cách cắt này (2026-09-29).
  // File shop ngắn hơn số ca (CROCS T9: shop tới 22/09, ca tới 30/09) ⇒ cắt theo file shop: bảng này đặt live agency cạnh tổng
  // shop, live 30 ngày ÷ shop 22 ngày từng ra "agency live chiếm 100,2%".
  const shopLastDay = (view.shopDays[month]?.days ?? []).map((d) => d.date).filter((d) => d >= cmp.curStart && d <= cmp.curEnd).sort().pop() ?? null;
  const trendEnd = shopLastDay && shopLastDay < cmp.curEnd ? shopLastDay : cmp.curEnd;
  const trendDay = cmp.partial || trendEnd < cmp.curEnd ? Number(trendEnd.slice(8)) : null;
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
  // File Shop Analytics thường về chậm hơn số ca (CROCS T9: shop tới 22/09, ca tới 30/09). So tháng trước và tỷ trọng live/shop
  // phải cắt tới đúng ngày cuối của file shop — trước đây ra "Total GMV −42,8%" (22 ngày so 31 ngày) và "live = 100,2% tổng shop".
  const shopWin = useMemo(() => shopCompareWindow(month, cmp, shopCur?.through), [shopCur, cmp, month]);
  const shopPrevSame = useMemo(() => shopTotals(hiddenMonths.has(prevMonth) ? null : view.shopDays[prevMonth], shopWin.prevStart, shopWin.prevEnd), [view, prevMonth, shopWin, hiddenMonths]);
  const liveForShare = useMemo(
    () => (shopWin === cmp ? liveCurStats.gmv : liveStatsFromRows(liveCurrent?.rows ?? [], shopWin.curStart, shopWin.curEnd).gmv),
    [shopWin, cmp, liveCurStats, liveCurrent]
  );
  // Ba khối chuyển từ "Phân tích sâu (nội bộ ops)" khi gộp vào report (2026-09-27) — cùng đầu vào bản chụp, cùng kỳ `cmp`.
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
  const shopPiecesMissing = !Object.values(view.shopDays).some(Boolean) && !Object.values(view.cardGmv).some(Boolean);

  // Nhóm đối chứng: live tài khoản shop vs phần còn lại của shop, theo ngày thường / ngày camp.
  // Cột live = ca agency (cùng số ô KPI phần 1 và bảng Campaign phần 6); phần còn lại vẫn từ Shop Analytics.
  // Cửa sổ = shopWin (cắt theo ngày cuối file shop cho CẢ hai tháng) — không phải cmp.
  const agencyLiveByDate = useMemo(() => ({ prev: liveGmvByDate(livePrev?.rows ?? []), cur: liveGmvByDate(liveCurrent?.rows ?? []) }), [livePrev, liveCurrent]);
  const adsPlan = useMemo(() => {
    const rows = adsPlanRows?.key === `${brandId}|${month}` ? adsPlanRows.rows : [];
    return rows.length ? adsTrackingMonth(rows, month, bucketCur, agencyLiveByDate.cur) : null;
  }, [adsPlanRows, brandId, month, bucketCur, agencyLiveByDate]);
  const control = useMemo(
    () => controlGroup(shopDaysOf(prevMonth)?.days, view.shopDays[month]?.days, shopWin, bucketPrev, bucketCur, agencyLiveByDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view, prevMonth, month, shopWin, bucketPrev, bucketCur, hiddenMonths, agencyLiveByDate]
  );
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
  const tiktokReturnRate = brandPlatformRates.find((r) => r.brandId === brandId && r.platform === REPORT_PLATFORM)?.returnRate;
  // Trạng thái hoàn/huỷ từng tháng dùng CHUNG luật với Kế Toán (lib/refundStatus.ts): chốt = qua cuối tháng + 15 ngày, file phủ
  // hết tháng, mẫu file mới. Tháng chưa chốt thì NMV là ước tính theo tháng chốt gần nhất / % hoàn dự kiến trong hợp đồng.
  const refundStatusOf = (m: string): RefundMonthStatus | null => {
    if (hiddenMonths.has(m)) return null;
    const sl = view.shopDays[m];
    const r = monthRangeLocal(m);
    const t = shopTotals(sl, r.start, r.end);
    if (!t) return null;
    return refundMonthStatus({ month: m, today: todayVn(), gmv: t.gmv, refunds: t.refunds, lastDate: t.through ?? "", template: sl?.template ?? "unknown", exportedAt: sl?.exportedAt });
  };
  const refundFinals = useMemo(() => decodeRefundFinal(monthlyReportRow?.sectionNotes?.[REFUND_FINAL_KEY]?.text), [monthlyReportRow]);
  const refundStatusAdj = (m: string): RefundMonthStatus | null => {
    const s0 = refundStatusOf(m);
    return s0 ? applyFinalRate(s0, refundFinals) : null;
  };
  const refundStatusCur = refundStatusAdj(month);
  const refundStatusPrev = refundStatusOf(prevMonth);
  const refundCompare = refundStatusCur && refundStatusPrev ? compareRefundRates({ rate: refundRateShop, template: refundStatusCur.template }, { rate: refundStatusPrev.rate, template: refundStatusPrev.template }) : null;
  const nmvChoice = chooseNmvRate(
    refundStatusCur,
    last4Months.map(refundStatusAdj).filter((x): x is RefundMonthStatus => x != null),
    hasReturnRateConfig ? tiktokReturnRate ?? null : null
  );
  const nmvRate = nmvChoice.rate;
  const nmvSource = nmvChoice.rate != null ? nmvChoice.label : null;

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

  // ============ Phần mới của bố cục 10 trang (lib/report/brandReport.ts) ============
  // Trang 1 — bảng điểm: target từng loại ngày (Kế Hoạch Tháng đã chốt) + KPI toàn shop.
  const scoreboard = useMemo(
    () =>
      scoreRows(
        kpiTargetGmvCur,
        liveCurStats.gmv,
        campDetailRows.map((r) => ({ key: r.key, target: r.target, actual: r.cur.gmv })),
        shopKpi ? { target: shopKpi.target, actual: shopKpi.actual } : null,
        // Tháng còn dở ⇒ % theo target TỚI NAY (cùng số run-rate Dashboard); tháng đủ thì hai target trùng nhau.
        cmp.partial && planRR ? { all: planRR.rr.total.targetToDate, ...Object.fromEntries(planRR.rr.buckets.map((b) => [b.bucket, b.targetToDate])) } : null
      ),
    [kpiTargetGmvCur, liveCurStats, campDetailRows, shopKpi, cmp.partial, planRR]
  );
  // Trang 3 — bảng nhiệt loại ngày × yếu tố (cùng các khối của bảng Campaign: mỗi tháng dùng khung camp của chính tháng đó).
  const dayTypeRows = useMemo(() => dayTypeFactorRows(campDetailRows), [campDetailRows]);
  // Trang 10 — Key Metrics 3 tháng, chỉ đọc số PHIÊN ⇒ chỉ cắt cùng số ngày khi số phiên của tháng report còn dở (cmp.partial),
  // không cắt theo file shop như Xu hướng/cơ cấu kênh (CROCS T9: phiên đủ 30/09, file shop tới 22/09).
  const keyCutEnd = (m: string) => {
    const e = monthRangeLocal(m).end;
    return cmp.partial ? `${m}-${String(Math.min(Number(cmp.curEnd.slice(8)), Number(e.slice(8)))).padStart(2, "0")}` : e;
  };
  const keyMonths = useMemo<KeyMetricsMonth[]>(() => {
    const months = [prev2Month, prevMonth, month];
    return months.map((m) => {
      const overrides = m === month ? campOverrides : m === prevMonth ? prevCampOverrides : effectiveCamp(plans[m]?.plan.campRanges);
      const stats = bucketStats(rowsOf(m), monthRangeLocal(m).start, keyCutEnd(m), overrides);
      const p = plans[m];
      let targets: Record<KeyMetricsTab, number | null> | null = null;
      if (!cmp.partial && p?.plan.status === "locked" && p.slots.length > 0) {
        const alloc = planCampAllocation(p.slots, overrides);
        const t = Object.fromEntries(alloc.map((a) => [a.key, a.target > 0 ? a.target : null])) as Record<CampDayBucket, number | null>;
        const all = alloc.reduce((s, a) => s + a.target, 0);
        targets = { all: all > 0 ? all : null, ...t };
      }
      const gmvForTarget = Object.fromEntries((["all", "daily", "dday", "midmonth", "payday"] as KeyMetricsTab[]).map((k) => [k, stats[k].gmv])) as Record<KeyMetricsTab, number>;
      return { month: m, stats, targets, gmvForTarget };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prev2Month, prevMonth, month, campOverrides, prevCampOverrides, plans, liveCurrent, livePrev, sessions, brandId, liveOlderMonths, cmp]);
  const keySpans = useMemo(
    () => keyMonths.map((k) => campSpanLabels(k.month, k.month === month ? campOverrides : k.month === prevMonth ? prevCampOverrides : effectiveCamp(plans[k.month]?.plan.campRanges))),
    [keyMonths, month, prevMonth, campOverrides, prevCampOverrides, plans]
  );
  // Trang 8 + 9 — affiliate.
  const creatorRows = useMemo(() => creatorSessionRows(affiliate.cur), [affiliate.cur]);
  const creatorSum = useMemo(() => creatorTotals(creatorRows), [creatorRows]);
  const trackCols = useMemo(() => affiliateTrackColumns(affiliate.cur), [affiliate.cur]);
  const trackSum = useMemo(() => affiliateTrackTotals(trackCols), [trackCols]);
  const creatorPlan = useMemo(() => creatorPlanRows(affiliate.next, creatorRows), [affiliate.next, creatorRows]);
  const creatorBest = useMemo(() => {
    const best: Record<string, number> = {};
    for (const r of creatorRows) if (r.gmvPerHour != null) best[r.creator.trim().toLowerCase()] = Math.max(best[r.creator.trim().toLowerCase()] ?? 0, r.gmvPerHour);
    return best;
  }, [creatorRows]);
  // Trang 6 — Refund rate tháng trước cùng cửa sổ với tháng này.
  // Không so Refund rate giữa hai mẫu file Shop Analytics khác nhau (cột Hoàn tiền có thể định nghĩa khác).
  const refundRateShopPrev = shopPrevSame && shopPrevSame.gmv > 0 && refundCompare?.comparable !== false ? (shopPrevSame.refunds / shopPrevSame.gmv) * 100 : null;
  const monthShort = (m: string) => `T${Number(m.slice(5))}`;

  // Top SKU: hạng tháng trước → tháng này + phễu. Tháng trước bị che với brand thì không có hạng/so sánh.
  const skuRankCur = view.skuRank?.[month] ?? null;
  const skuMoveData = useMemo(
    () => skuMoves(view.skuRank?.[month] ?? null, hiddenMonths.has(prevMonth) ? null : (view.skuRank?.[prevMonth] ?? null)),
    [view, month, prevMonth, hiddenMonths]
  );

  // GĐ2 — số cho biểu đồ mới (lib/report/reportVisuals.ts).
  const bridgeTarget = useMemo(() => {
    const b = targetBridge(scoreboard, (k) => DAY_TYPE_SHORT[k]);
    return b ? bridgePoints(cmp.partial ? "Target tới nay" : "Target tháng", b.start, b.steps, `${METRIC.liveGmv} thực tế`, b.end) : null;
  }, [scoreboard, cmp.partial]);
  const planHours = useMemo(
    () => (planRR ? planHourRows(planRR.rr.slots, planRR.rr.through, Object.fromEntries(campDetailRows.map((r) => [r.key, r.gmvPerHour != null && r.gmvPerHour > 0 ? r.gmvPerHour : null]))) : []),
    [planRR, campDetailRows]
  );
  const trafficBr = useMemo(() => {
    const row = control.find((r) => r.key === "all");
    const b = row ? trafficBridge(row) : null;
    if (!b) return null;
    const lab = { visitors: "Lượt truy cập", cvr: "CVR shop", value: METRIC.aov } as const;
    return { b, points: bridgePoints(cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `T${Number(prevMonth.slice(5))}`, b.from, b.parts.map((p) => ({ label: lab[p.key === "aov" ? "value" : p.key], delta: p.value })), cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}/${month.slice(5)}` : `T${Number(month.slice(5))}`, b.to) };
  }, [control, cmp, month, prevMonth]);
  const skuPoints = useMemo<ScatterPoint[]>(
    () =>
      (skuMoveData?.rows ?? [])
        .filter((r) => r.ctr != null && r.ctor != null)
        .map((r) => ({ key: r.name, label: shortSku(r.name), x: r.ctr!, y: r.ctor!, size: r.gmv, tone: r.prevRank == null ? "flat" : r.rank < r.prevRank ? "up" : r.rank > r.prevRank ? "down" : "flat" })),
    [skuMoveData]
  );
  // Phần 5 — so mặt bằng tháng này (cột phụ) theo loại ngày.
  const hostInsight = useMemo(() => {
    const tiktok = filterSessions(completedInPeriod.filter((s) => platformOf(s) === REPORT_PLATFORM), {});
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
    () => filterSessions(sessions.filter((s) => s.brandId === brandId && platformOf(s) === REPORT_PLATFORM && s.status === "Completed"), {}),
    [sessions, brandId]
  );
  const reliability = useMemo(() => hostReliability(reliabilitySessions, bucketAny), [reliabilitySessions, bucketAny]);
  const reliabilityByKey = useMemo(() => new Map(reliability.map((r) => [r.key, r])), [reliability]);
  const relMonths = useMemo(() => new Set(reliabilitySessions.map((s) => s.date.slice(0, 7))).size, [reliabilitySessions]);

  // Phần 5 — host theo từng loại ngày: Daily + D-Day / Mid-Month / Pay Day TÁCH RIÊNG. GMV trọn cho host, trợ live chỉ ghi giờ.
  const hostDayType = useMemo(
    () =>
      byHostDayType(
        filterSessions(completedInPeriod.filter((s) => platformOf(s) === REPORT_PLATFORM), {}),
        (date) => resolveCampBucketType(date, campOverrides)
      ),
    [completedInPeriod, campOverrides]
  );
  const hostDayTypeTeam = useMemo(() => dayTypeTeamTotals(hostDayType), [hostDayType]);
  const hostShortName = (name: string) => {
    const w = (n: string, k: number) => n.trim().split(/\s+/).slice(-k).join(" ");
    return hostDayType.filter((r) => w(r.name, 1) === w(name, 1)).length > 1 ? w(name, 2) : w(name, 1);
  };
  const saveSkuImage = async (name: string, dataUrl: string | null) => setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, skuImageKey(name), dataUrl));
  const productsData: ProductsPageData = {
    sku: skuMoveData,
    skuRank: skuRankCur,
    gift: giftCur,
    giftSlice: giftSliceCur,
    giftByMonth,
    giftMonthLabels: last4Months.map(trendColLabel),
    giftPeriodLabel: trendDay ? `4 kỳ 1–${trendDay}` : "4 tháng",
    giftMaxPriceLabel: fmtVndShort(GIFT_MAX_PRICE),
    promo: topPromo,
    prevMonthNo: Number(prevMonth.slice(5)),
    points: skuPoints
  };
  const hostData: HostPageData = {
    rows: hostDayType,
    team: hostDayTypeTeam,
    vsPeer: hostInsight.vsPeer,
    reliability: reliabilityByKey,
    relMonths,
    shortName: hostShortName,
    slots: slotRows.map((r) => {
      const c = pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour);
      const band = noiseBand(r.prev.n, r.cur.n);
      return { label: r.label, prevN: r.prev.n, curN: r.cur.n, prev: r.prev.gmvPerHour, cur: r.cur.gmvPerHour, change: c, band, tone: changeTone(c, band, true) as "up" | "down" | "flat" };
    }),
    spread,
    top: topSessions,
    prevPeriod: cmp.partial ? `1–${Number(cmp.prevEnd.slice(8))}/${prevMonth.slice(5)}` : `T${Number(prevMonth.slice(5))}`,
    curPeriod: cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}/${month.slice(5)}` : `T${Number(month.slice(5))}`,
    prevMonthLabel: `T${Number(prevMonth.slice(5))}`,
    curMonthLabel: `T${Number(month.slice(5))}`
  };
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
      windowLabel: shopWin.label,
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
  const hostOpsNote = peopleOpsNote(hostInsight.rows, reliability);
  // Việc cần làm của từng phần gom về "Việc agency làm tháng sau" — khung Insight tự sinh không nói lại.
  const controlOpsGroup = controlOps ? (controlOps.key as "daily" | "camp") : null;
  const sectionSteps = sectionNextSteps(sectionInsightRaw, controlOpsGroup);
  // ===== Insight tổng hợp cuối mỗi trang (lib/report/pageInsights.ts) — câu mẫu có chỗ trống, đọc đúng số trang đang hiện =====
  const pageAuto = (() => {
    const lastKey = keyMonths.length - 1;
    const keyTable = keyMetricsTable(keyMonths, "all");
    const dayLabel = (k: CampDayBucket) => DAY_TYPE_SHORT[k];
    const scoreAll = scoreboard.find((r) => r.key === "all");
    const sigDays = dayTypeRows.filter((r) => r.significant && (r.change.gmvPerHour ?? 0) !== 0);
    const worstSig = [...sigDays].filter((r) => (r.change.gmvPerHour ?? 0) < 0).sort((a, b) => a.change.gmvPerHour! - b.change.gmvPerHour!)[0];
    const factorCands = worstSig ? (["viewsPerHour", "liveCtr", "ctor", "aov"] as const).filter((f) => worstSig.change[f] != null && worstSig.change[f]! < 0).sort((a, b) => worstSig.change[a]! - worstSig.change[b]!) : [];
    const mixPrev = channelMixes[channelMixes.length - 2], mixCur = channelMixes[channelMixes.length - 1];
    const chDelta = (label: string, k: "liveLinked" | "affiliate" | "video" | "card") =>
      mixPrev && mixCur && mixPrev[k] != null && mixCur[k] != null ? { label, delta: (mixCur[k] as number) - (mixPrev[k] as number) } : null;
    const chRows = [chDelta(CHANNELS[0]?.label ?? "Seller LIVE", "liveLinked"), chDelta("Affiliate LIVE", "affiliate"), chDelta("Video", "video"), chDelta("Product card", "card")].filter((x): x is NonNullable<typeof x> => x !== null);
    const relByName = new Map(reliability.map((r) => [r.name, r]));
    const liveHosts = hostInsight.rows.filter((h) => h.hours > 0 && h.gmv > 0);
    const skuRows = skuMoveData?.rows ?? [];
    const gain = (r: (typeof skuRows)[number]) => (r.prevRank == null ? 99 : r.prevRank) - r.rank;
    const top10 = skuRows.reduce((a, r) => a + r.gmv, 0);
    const lowestCreator = creatorRows.filter((r) => r.pctTarget != null).sort((a, b) => a.pctTarget! - b.pctTarget!)[0];
    const cRates = creatorRates(creatorSum);
    const grades = prevGrades ?? [];
    const out: Record<InsightPage, InsightBlocks> = {
      summary: summaryBlocks({
        liveActual: liveCurStats.gmv,
        liveTarget: scoreAll ? scoreAll.targetToDate ?? scoreAll.target : null,
        days: scoreboard.filter((r) => r.key !== "all" && r.key !== "shop").map((r) => ({ label: dayLabel(r.key as CampDayBucket), target: r.targetToDate ?? r.target, actual: r.actual })),
        worstFactor: worstSig && factorCands[0] ? { dayLabel: dayLabel(worstSig.key), factorLabel: DRIVER_LABEL[factorCands[0]], change: worstSig.change[factorCands[0]]! } : null,
        shopKpi: shopKpi ? { target: shopKpi.target, projected: shopKpi.projected ?? null } : null
      }),
      keymetrics: keyMetricsBlocks({
        rows: keyTable.rows.map((r) => ({ label: r.def.label, change: r.changes[lastKey], tone: r.tones[lastKey], result: r.def.group === "result" })),
        band: keyTable.bands[lastKey] ?? null,
        prevLabel: monthShort(prevMonth)
      }),
      nmv: nmvBlocks({ refundCur: refundRateShop, refundPrev: refundRateShopPrev, prevLabel: monthShort(prevMonth), nmvSource, usesCrmRate: hasReturnRateConfig }),
      shop: shopBlocks({
        totalChange: shopCur && shopPrevSame ? pctChange(shopPrevSame.gmv, shopCur.gmv) : null,
        windowLabel: shopWin.label,
        channels: chRows,
        control: control.filter((r) => r.key !== "all").flatMap((r) => {
          const v = controlVerdict(r);
          return v && r.liveChg != null && r.restChg != null ? [{ label: controlLabel(r.key), liveChg: r.liveChg, restChg: r.restChg, verdict: v }] : [];
        })
      }),
      why: whyBlocks({
        gmvPerHourChange: pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour),
        parts: drivers ? drivers.parts.map((p) => ({ label: DRIVER_LABEL[p.key], value: p.value, change: p.change })) : [],
        significantDays: sigDays.map((r) => ({ label: dayLabel(r.key), change: r.change.gmvPerHour! })),
        band: sigDays[0]?.band ?? null,
        mix: mixRate ? { mix: mixRate.mix, rate: mixRate.rate } : null
      }),
      products: productsBlocks({
        topN: skuRows.length,
        risers: skuRows.filter((r) => gain(r) >= 2).sort((a, b) => gain(b) - gain(a)).slice(0, 3).map((r) => ({ name: shortSku(r.name), from: r.prevRank, to: r.rank, ctor: r.ctor })),
        fallers: skuRows.filter((r) => r.prevRank != null && r.rank - r.prevRank >= 2).sort((a, b) => b.rank - b.prevRank! - (a.rank - a.prevRank!)).slice(0, 3).map((r) => ({ name: shortSku(r.name), from: r.prevRank, to: r.rank, ctor: r.ctor, ctr: r.ctr })),
        lead: skuRows[0] && top10 > 0 ? { name: shortSku(skuRows[0].name), share: (skuRows[0].gmv / top10) * 100 } : null,
        promo: topPromo?.items?.[0] ? { name: topPromo.items[0].name, roi: null } : null
      }),
      people: peopleBlocks({
        hosts: liveHosts.flatMap((h) => {
          const r = relByName.get(h.name);
          return r ? [{ name: h.name, verdict: r.verdict, ci: reliabilityText(r), sessions: r.sessions, borderline: isBorderline(r) }] : [];
        }),
        months: relMonths,
        slots: slotRows.filter((s) => s.cur.gmvPerHour != null).map((s) => ({ label: s.label.toLowerCase(), gmvPerHour: s.cur.gmvPerHour!, n: s.cur.n }))
      }),
      ads: adsBlocks({
        cost: adsPlan?.mtdActual ?? adsCur?.cost ?? 0,
        target: adsPlan ? adsPlan.mtdTarget : null,
        liveRoas: adsPlan?.liveRoas ?? null,
        buckets: adsPlan
          ? CAMP_DAY_BUCKET_ORDER.flatMap((b) => {
              const x = adsPlan.buckets[b];
              return x ? [{ label: DAY_TYPE_SHORT[b], cost: x.actual, target: x.target, roas: x.liveAds > 0 ? x.liveGmv / x.liveAds : null }] : [];
            })
          : [],
        zeroOrderDays: adsCur?.zeroOrderDays.length ?? 0
      }),
      affiliate: affiliateBlocks({
        sessions: creatorSum.sessions,
        creators: creatorSum.creators,
        gmv: creatorSum.gmv,
        pctTarget: cRates.pctTarget,
        top: creatorSum.top,
        gmvPerHour: cRates.gmvPerHour,
        lowest: lowestCreator ? { creator: lowestCreator.creator, date: lowestCreator.date ? `${Number(lowestCreator.date.slice(8, 10))}/${Number(lowestCreator.date.slice(5, 7))}` : "", pct: lowestCreator.pctTarget! } : null
      }),
      next: nextBlocks({
        nextLabel: `Tháng ${Number(nextMonth.slice(5))}`,
        hasLivePlan: !!nextPlan && nextPlan.targetGmv > 0 && nextPlan.slotCount > 0,
        hasCreatorPlan: (affiliate.next?.length ?? 0) > 0,
        actions: prevGrades ? { met: grades.filter((g) => g.status === "met").length, missed: grades.filter((g) => g.status === "missed").length, other: grades.filter((g) => g.status !== "met" && g.status !== "missed").length } : null
      })
    };
    return out;
  })();
  const pageInsight = (page: InsightPage) => (
    <PageInsight
      auto={pageAuto[page]}
      note={monthlyReportRow?.sectionNotes?.[pageNoteKey(page)]}
      computedAt={snapshot.computedAt}
      canManage={canManage}
      onSave={async (text) => setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, pageNoteKey(page), text))}
    />
  );
  // Số từng tháng cho trang Hủy, hoàn & NMV (cùng cửa sổ ngày với cơ cấu kênh).
  const nmvDemoMonths: NmvMonth[] = last4Months.map((m, i) => {
    const raw = refundStatusOf(m);
    const mix = channelMixes[i];
    return {
      month: m,
      short: monthShort(m),
      win: `1–${Number(cutEndOf(m).slice(8))}/${m.slice(5)}`,
      liveGmv: trendStats[i].stats.gmv,
      nmvGmv: keyMonths.find((k) => k.month === m)?.stats.all.gmv ?? trendStats[i].stats.gmv,
      windowRate: mix?.refundRate ?? null,
      fileRate: raw?.rate ?? null,
      template: raw?.template ?? "unknown",
      exportedAt: raw?.exportedAt ?? null,
      status: refundStatusAdj(m)?.status ?? "provisional",
      shopGmv: mix?.shopGmv ?? 0,
      affiliate: mix?.affiliate ?? 0,
      video: mix?.video ?? 0,
      card: mix?.card ?? null
    };
  });
  const demoInsight = (page: InsightPage) => (
    <DemoInsight
      auto={pageAuto[page]}
      note={monthlyReportRow?.sectionNotes?.[pageNoteKey(page)]}
      computedAt={snapshot.computedAt}
      canManage={canManage}
      onSave={async (text) => setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, pageNoteKey(page), text))}
    />
  );
  // Tiêu đề kết luận + hàng chỉ số đầu mỗi trang (tối đa 4 ô). Chỉ số lấy từ số đã tính cho phần thân trang; trang chưa đủ số thì bớt ô.
  const head = (id: InsightPage): { headline: string; metrics: PageMetric[] } => {
    const fb = `${SECTIONS.find((x) => x.id === id)!.label}: chưa đủ số liệu để nêu kết luận.`;
    const scoreAll = scoreboard.find((r) => r.key === "all");
    const keyTable = keyMetricsTable(keyMonths, "all");
    const lastKey = keyMonths.length - 1;
    const kmCell = (key: string) => keyTable.rows.find((r) => r.def.key === key);
    const kmMetric = (key: string, label?: string): PageMetric => {
      const r = kmCell(key)!;
      return { label: label ?? r.def.label, value: r.values[lastKey] != null ? fmtKeyMetric(r.def, r.values[lastKey]) : "—", change: r.changes[lastKey] };
    };
    const liveShare = shopCur && shopCur.gmv > 0 ? (liveForShare / shopCur.gmv) * 100 : null;
    const nmvValue = nmvRate != null ? fmtVndShort(liveCurStats.gmv * (1 - nmvRate / 100)) : "—";
    const totalGmv: PageMetric = {
      label: shopCur && shopWin !== cmp ? `Total GMV · 1–${shopWin.curEnd.slice(8)}/${month.slice(5)}` : "Total GMV",
      value: shopCur ? fmtVndShort(shopCur.gmv) : "—",
      badge: shopKpi ? shopKpi.pct : null,
      badgeLabel: shopKpi ? `${fmtFixed(shopKpi.pct, 0)}% KPI tháng` : undefined,
      change: shopCur && shopPrevSame ? pctChange(shopPrevSame.gmv, shopCur.gmv) : null,
      note: shopKpi ? `KPI tháng ${fmtVndShort(shopKpi.target)}${shopKpi.partial ? ` · dự báo ${fmtPct(shopKpi.projectedPct)}` : ""}` : shopCur ? "Shop Analytics — mọi kênh" : canManage ? "chưa có file Shop Analytics" : "chưa có số liệu toàn shop"
    };
    const liveTargetNow = scoreAll ? scoreAll.targetToDate ?? scoreAll.target : null;
    const liveGmv: PageMetric = {
      label: cmp.partial ? `LIVE GMV (YFB) · 1–${cmp.curEnd.slice(8)}/${month.slice(5)}` : "LIVE GMV (YFB)",
      value: fmtVndShort(liveCurStats.gmv),
      // Cùng mẫu số với ô Total GMV: % target CẢ THÁNG (ô kia là KPI cả tháng); tiến độ so với target tới nay nằm ở ghi chú.
      badge: scoreAll?.target ? (liveCurStats.gmv / scoreAll.target) * 100 : null,
      badgeLabel: scoreAll?.target ? `${fmtFixed((liveCurStats.gmv / scoreAll.target) * 100, 0)}% Target tháng` : undefined,
      change: pctChange(livePrevStats.gmv, liveCurStats.gmv),
      note: [scoreAll?.target ? `Target tháng ${fmtVndShort(scoreAll.target)}` : null, liveTargetNow && scoreAll?.targetToDate != null ? `tới nay ${fmtVndShort(liveTargetNow)} (${fmtFixed((liveCurStats.gmv / liveTargetNow) * 100, 0)}%)` : null, liveShare != null ? `${fmtPct(liveShare)} tổng shop` : null, `${liveCurStats.sessions} phiên`].filter(Boolean).join(" · ")
    };
    const nmv: PageMetric = { label: nmvChoice.isEstimate ? "NMV (ước tính)" : "NMV (đã chốt)", value: nmvValue, note: nmvRate != null ? `trừ ${fmtPct(nmvRate)} — ${nmvSource}` : canManage ? "chưa có tỷ lệ hoàn hủy (CRM) / Refund rate (Shop Analytics)" : "chưa có Refund rate" };
    const gmvPerHour: PageMetric = { label: "GMV/giờ", value: liveCurStats.gmvPerHour != null ? fmtVndShort(liveCurStats.gmvPerHour) : "—", change: pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour), note: `${fmtHours(liveCurStats.hours)} giờ live · ${liveCurStats.sessions} phiên` };
    const km = keyMonths[lastKey];
    const kmTarget = km?.targets?.all ?? null;
    const skuRows = skuMoveData?.rows ?? [];
    const top10 = skuRows.reduce((a, r) => a + r.gmv, 0);
    const hostsLive = hostInsight.rows.filter((h) => h.hours > 0 && h.gmv > 0);
    const adsCost = adsPlan?.mtdActual ?? adsCur?.cost ?? null;
    const gmvForecast: PageMetric[] = shopKpi?.partial
      ? [{
          label: "Dự báo Total GMV cuối tháng",
          value: fmtVndShort(shopKpi.projected),
          badge: shopKpi.projectedPct,
          badgeLabel: `${fmtFixed(shopKpi.projectedPct, 0)}% KPI`,
          note: `KPI ${fmtVndShort(shopKpi.target)} · ${shopKpi.projected >= shopKpi.target ? "vượt" : "thiếu"} ${fmtVndShort(Math.abs(shopKpi.projected - shopKpi.target))}`
        }]
      : [];
    const adsCreatorRow = adsPlan && adsPlanRows ? adsTypeRows(adsPlanRows.rows, month).find((r) => r.key === "creator") : undefined;
    const bookingSum = bookingTotals(creatorPlan);
    const todoItems = monthlyReportRow?.actionPlan?.items?.length ? monthlyReportRow.actionPlan.items : nextLines.map((l) => newActionItem(l));
    const metrics: Record<InsightPage, PageMetric[]> = {
      summary: [totalGmv, liveGmv, nmv, gmvPerHour],
      keymetrics: [
        { ...kmMetric("gmv"), badge: kmTarget ? (km.gmvForTarget.all / kmTarget) * 100 : null, note: kmTarget ? `Target ${fmtVndShort(kmTarget)}` : undefined },
        kmMetric("orders"),
        kmMetric("gmvPerHour"),
        { ...kmMetric("hours"), change: null, note: `${liveCurStats.sessions} phiên` }
      ],
      nmv: [{ ...totalGmv, badge: null, badgeLabel: undefined }, { label: "Refund rate", value: refundRateShop != null ? fmtPct(refundRateShop) : "—", note: refundRateShopPrev != null ? `${monthShort(prevMonth)}: ${fmtPct(refundRateShopPrev)}` : undefined }, nmv],
      shop: [{ ...totalGmv, note: shopKpi ? `KPI tháng ${fmtVndShort(shopKpi.target)}` : totalGmv.note }, ...gmvForecast, { ...liveGmv, badge: null }, { label: "Tỷ trọng LIVE trong Total GMV", value: liveShare != null ? fmtPct(liveShare) : "—", note: shopWin.label }],
      why: [gmvPerHour, kmMetric("viewsPerHour"), kmMetric("ctor"), kmMetric("aov")],
      products: skuRows.length ? [{ label: `GMV top ${skuRows.length} SKU`, value: fmtVndShort(top10) }, { label: "SKU đứng đầu", value: top10 > 0 ? fmtPct((skuRows[0].gmv / top10) * 100) : "—", note: `${shortSku(skuRows[0].name)} · tỷ trọng trong top ${skuRows.length}` }] : [],
      people: [{ label: "Host đã live", value: String(hostsLive.length), note: `${liveCurStats.sessions} phiên` }, { ...gmvPerHour, label: "GMV/giờ" }],
      ads: adsPlan
        ? [
            { label: `Ads cost${adsPlan.lastActual ? ` · 1–${Number(adsPlan.lastActual.slice(8))}/${month.slice(5)}` : ""}`, value: fmtVndShort(adsPlan.mtdActual), note: [adsPlan.mtdTarget > 0 ? `${fmtFixed((adsPlan.mtdActual / adsPlan.mtdTarget) * 100, 1)}% Target cùng kỳ` : null, adsPlan.spentOfMonth != null ? `${fmtFixed(adsPlan.spentOfMonth, 1)}% Target tháng ${fmtVndShort(adsPlan.monthTarget)}` : null].filter(Boolean).join(" · ") || undefined },
            ...(adsPlan.liveRoas != null ? [{ label: "ROAS Live", value: `${fmtFixed(adsPlan.liveRoas, 1)}x` }] : []),
            ...(adsCreatorRow && adsCreatorRow.monthTarget > 0 ? [{ label: "Ads Creator · % Target", value: `${fmtFixed((adsCreatorRow.mtdActual / adsCreatorRow.monthTarget) * 100, 1)}%`, note: `${fmtVndShort(adsCreatorRow.mtdActual)} / ${fmtVndShort(adsCreatorRow.monthTarget)}` }] : []),
            { label: "Ngày chi lệch Target từ 30%", value: String(adsPlan.offDays.length), note: adsPlan.offDays.map((d) => fmtDateVn(d.date, false)).join(", ") || undefined }
          ]
        : adsCost != null ? [{ label: "Ads cost", value: fmtVndShort(adsCost) }] : [],
      affiliate: trackSum.sessions > 0 ? [{ label: `${METRIC.directGmv} · ${trackSum.sessions} phiên`, value: fmtVndShort(trackSum.directGmv) }, { label: `Target GMV · ${trackSum.sessions} phiên`, value: trackSum.targetGmv > 0 ? fmtVndShort(trackSum.targetGmv) : "—", badge: trackSum.pctTarget, badgeLabel: trackSum.pctTarget != null ? `${fmtFixed(trackSum.pctTarget, 1)}% ${METRIC.directGmv}` : undefined }, { label: `${METRIC.gmvPerHour} · ${trackSum.sessions} phiên`, value: trackSum.gmvPerHour != null ? fmtVndShort(trackSum.gmvPerHour) : "—", note: trackSum.hours > 0 ? `${fmtVndShort(trackSum.directGmv)} ÷ ${fmtFixed(trackSum.hours, 1)} giờ` : undefined }, { label: METRIC.roas, value: trackSum.roas != null ? `${fmtFixed(trackSum.roas, 1)}x` : "—", note: trackSum.adsCost > 0 ? `${METRIC.adsCost} ${fmtVndShort(trackSum.adsCost)}` : undefined }] : [],
      next: [
        { label: `Target Live tháng ${Number(nextMonth.slice(5))}`, value: nextPlan && nextPlan.targetGmv > 0 ? fmtVndShort(nextPlan.targetGmv) : "—", note: nextPlan && nextPlan.targetGmv > 0 ? `${nextPlan.slotCount} phiên trong Kế Hoạch Tháng` : "chưa nhập · bảng Kế hoạch Live" },
        { label: `Target Creator tháng ${Number(nextMonth.slice(5))}`, value: bookingSum.target > 0 ? fmtVndShort(bookingSum.target) : "—", note: bookingSum.target > 0 ? "tổng Target lịch Booking" : "tổng Target lịch Booking, chưa nhập" },
        { label: `Booking Creator tháng ${Number(nextMonth.slice(5))}`, value: `${bookingSum.sessions} phiên`, note: bookingSum.sessions > 0 ? `${fmtFixed(bookingSum.hours, 1)} giờ live` : `chưa có phiên nào trong tab Affiliate (T${Number(nextMonth.slice(5))})` },
        { label: `Việc đề xuất cho tháng ${Number(nextMonth.slice(5))}`, value: String(todoItems.length), note: `${todoItems.filter((i) => i.target).length} app tự đánh giá · ${todoItems.filter((i) => !i.target).length} ops đánh giá` }
      ]
    };
    const headline =
      id === "summary"
        ? summaryHeadline({
            liveActual: liveCurStats.gmv,
            liveTarget: liveTargetNow,
            days: scoreboard.filter((r) => r.key !== "all" && r.key !== "shop").map((r) => ({ label: DAY_TYPE_SHORT[r.key as CampDayBucket], target: r.targetToDate ?? r.target, actual: r.actual }))
          })
        : id === "keymetrics"
          ? keyMetricsHeadline({ rows: keyTable.rows.map((r) => ({ label: r.def.label, change: r.changes[lastKey], tone: r.tones[lastKey] })), prevLabel: monthShort(prevMonth) })
          : observeHeadline(pageAuto[id], fb);
    return { headline, metrics: metrics[id] };
  };
  const narrativeInput: NarrativeInput = {
    month,
    window: cmp,
    shopCur,
    shopPrev: shopPrevSame,
    liveForShare,
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
  // Trang không có dữ liệu thì ẩn với brand; ops luôn thấy đủ 10 trang (kèm lời nhắc tải file). Số trang đánh theo trang đang hiện.
  // Toàn shop / Sản phẩm trước 27/10 luôn hiện với brand — tháng chưa tải file thì brand thấy hai trang trống kèm chữ "Dữ Liệu Gốc".
  const sectionShown: Record<ReportSectionId, boolean> = {
    summary: true,
    shop: canManage || !!shopCur,
    why: true,
    products: canManage || !!topSku?.hasAnyBatch || !!topPromo?.hasAnyBatch,
    ads: canManage || !!adsCur || !!adsPlan,
    nmv: canManage || refundRateShop != null || nmvRate != null,
    people: true,
    affiliate: canManage || creatorRows.length > 0,
    next: true,
    keymetrics: true
  };
  const visibleSections = SECTIONS.filter((s) => sectionShown[s.id]);
  const secNo = (id: ReportSectionId) => String(visibleSections.findIndex((s) => s.id === id) + 1);
  const secTitle = (id: ReportSectionId) => SECTIONS.find((s) => s.id === id)!.title;
  /** Vị trí của trang trong SECTIONS — gán cho CSS `order` của <section> để đổi thứ tự hiển thị mà không phải dời khối JSX. */
  const secOrder = (id: ReportSectionId) => SECTIONS.findIndex((x) => x.id === id) + 1;

  // Mỗi trang một màn (28/10): chỉ trang đang chọn hiện, nhớ qua hash `#mr-<id>` (replaceState — giữ nguyên state của router).
  // showAll (xuất file gửi brand): hiện đủ trang, mục lục là nút cuộn (script của exportStandaloneHtml.ts).
  const sectionIds = visibleSections.map((x) => x.id);
  const hashPage = () => {
    const m = /^#mr-(\w+)/.exec(window.location.hash);
    return m && (sectionIds as string[]).includes(m[1]) ? (m[1] as ReportSectionId) : null;
  };
  const [pageState, setPageState] = useState<ReportSectionId>(() => (showAll ? SECTIONS[0].id : hashPage() ?? SECTIONS[0].id));
  const curPage: ReportSectionId = sectionIds.includes(pageState) ? pageState : sectionIds[0];
  const curIdx = sectionIds.indexOf(curPage);
  const pageShown = (id: ReportSectionId) => showAll || id === curPage;
  const secStyle = (id: ReportSectionId): React.CSSProperties => ({ order: secOrder(id), display: pageShown(id) ? undefined : "none" });
  const reportTopRef = useRef<HTMLDivElement>(null);
  const goPage = (id: ReportSectionId) => {
    setPageState(id);
    if (!showAll) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#mr-${id}`);
    requestAnimationFrame(() => reportTopRef.current?.scrollIntoView({ block: "start" }));
  };
  // Mở link có hash khi report đã hiện (đổi hash trên cùng trang, không tải lại) cũng vào đúng trang.
  useEffect(() => {
    if (showAll) return;
    const onHash = () => {
      const id = hashPage();
      if (id) setPageState(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  const railItems = visibleSections.map((x) => ({ id: x.id, label: x.label }));
  const railRef = useRef<HTMLElement>(null);
  // Hàng tab ngang (điện thoại) chỉ thấy ~2 mục — kéo trang đang chọn vào tầm nhìn bằng scrollLeft của chính thanh (scrollIntoView kéo luôn cả trang).
  useEffect(() => {
    const bar = railRef.current;
    const btn = bar?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!bar || !btn || bar.scrollWidth <= bar.clientWidth) return;
    if (btn.offsetLeft < bar.scrollLeft || btn.offsetLeft + btn.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollTo({ left: Math.max(0, btn.offsetLeft - 12), behavior: "smooth" });
  }, [curPage]);

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
            ...INSIGHT_PAGES.flatMap(([page, label]) => {
              const sb = shownBlocks(pageAuto[page], decodeEdits(monthlyReportRow?.sectionNotes?.[pageNoteKey(page)]?.text));
              return ([...BLOCK_KEYS, "own"] as const).filter((k) => sb[k]).map((k) => ({ "Phần": `Insight · ${label} · ${BLOCK_LABEL[k]}`, "Nội dung": sb[k] }));
            })
          ]
        },
        {
          name: "1 KPI",
          rows: [
            { "Chỉ Số": "Total GMV", "Kỳ trước": n(shopPrevSame?.gmv), "Kỳ này": n(shopCur?.gmv) },
            // Key Metrics đủ 18 chỉ số + AOV, cùng thứ tự màn hình (lib/report/keyMetrics.ts).
            ...KEY_METRICS.map((d) => ({
              "Chỉ Số": d.key === "gmv" ? "LIVE GMV (YFB)" : keyMetricSheetLabel(d),
              "Kỳ trước": keyMetricSheetValue(livePrevStats, d.key),
              "Kỳ này": keyMetricSheetValue(liveCurStats, d.key)
            })),
            { "Chỉ Số": "Target GMV", "Kỳ trước": "", "Kỳ này": n(kpiTargetGmvCur) },
            { "Chỉ Số": "KPI GMV", "Kỳ trước": "", "Kỳ này": n(shopKpi?.target) },
            { "Chỉ Số": "Total GMV dự báo cuối tháng", "Kỳ trước": "", "Kỳ này": n(shopKpi?.projected) },
            { "Chỉ Số": `So sánh: ${cmp.label}`, "Kỳ trước": "", "Kỳ này": "" }
          ]
        },
        {
          name: "2 Thi truong - Van hanh",
          rows: control.map((r) => ({
            "Loại ngày": controlLabel(r.key),
            "Số ngày": r.days,
            "Livestream YFB kỳ trước": n(r.livePrev),
            "Livestream YFB kỳ này": n(r.liveCur),
            "± Livestream YFB (%)": n(r.liveChg),
            "Seller LIVE (Shop Analytics) kỳ trước": n(r.shopLivePrev),
            "Seller LIVE (Shop Analytics) kỳ này": n(r.shopLiveCur),
            "Các kênh còn lại kỳ trước": n(r.restPrev),
            "Các kênh còn lại kỳ này": n(r.restCur),
            "± Các kênh còn lại (%)": n(r.restChg),
            "± Lượt truy cập shop (%)": n(r.visitorsChg),
            "CVR shop kỳ trước (%)": n(r.cvrPrev),
            "CVR shop kỳ này (%)": n(r.cvrCur),
            "Đánh giá": controlVerdict(r) ? VERDICT_TEXT[controlVerdict(r)!] : ""
          }))
        },
        {
          name: "2 Sales Channel",
          rows: channelMixes.map((c, idx) => ({
            "Kỳ": trendColLabel(last4Months[idx]),
            "Total GMV": n(c?.shopGmv),
            "LIVE GMV (YFB)": n(trendStats[idx].stats.gmv),
            "Seller LIVE (cả tài khoản shop)": n(c?.liveLinked),
            "Affiliate LIVE": n(c?.affiliate),
            "Video": n(c?.video),
            [trendDay ? "Product card (Total GMV trừ 3 kênh)" : "Product card"]: n(c?.card),
            "Refund rate (%)": n(c?.refundRate)
          }))
        },
        {
          name: "3 Nguyen nhan - Yeu to",
          rows: (drivers?.parts ?? []).map((p) => ({ "Yếu tố": DRIVER_LABEL[p.key], "± (%)": n(p.change), "Góp vào ± LIVE GMV": n(p.value) }))
        },
        {
          name: "3 Nguyen nhan - Loai ngay",
          rows: dayGroups.map((g) => ({
            "Loại ngày": controlLabel(g.key),
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
              [`So trung bình ${relMonths} tháng (%)`]: n(r ? (r.ratio - 1) * 100 : null),
              "Khoảng tin cậy thấp (%)": n(r?.lo != null ? (r.lo - 1) * 100 : null),
              "Khoảng tin cậy cao (%)": n(r?.hi != null ? (r.hi - 1) * 100 : null),
              [`Sessions ${relMonths} tháng`]: r?.sessions ?? "",
              "So trung bình tháng này (%)": n(hostInsight.vsPeer.get(h.key)),
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
    // Không viền khung ngoài (18/10 đợt 2): nền đen của report đã là "trang giấy"; viền thêm làm mọi Panel/ô bên trong thành
    // hộp lồng hộp (đo trước: 44/47 hộp nằm trong hộp, sâu 4 tầng).
    <div className="rt rounded-2xl" style={{ background: PAL.bg }} ref={reportTopRef}>
      <div>
        {showAll ? (
        <div id="mr-toc" className="flex items-center gap-1 px-3 py-2 overflow-x-auto sticky -top-3 sm:-top-6 z-20 rounded-t-2xl" style={{ background: PAL.bg, borderBottom: `1px solid ${PAL.line}` }}>
          {visibleSections.map((sec) => (
            <button
              key={sec.id}
              data-sec={sec.id}
              onClick={() => document.getElementById(`mr-${sec.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              aria-current={sec.id === SECTIONS[0].id ? "true" : undefined}
              className="px-3 py-1.5 text-xs font-bold whitespace-nowrap rounded-lg hover:opacity-100 focus-visible:outline focus-visible:outline-2"
              style={sec.id === SECTIONS[0].id ? { color: PAL.gold, background: PAL.panel2 } : { color: PAL.muted }}
            >
              {secNo(sec.id)} · {sec.label}
            </button>
          ))}
          <button
            onClick={handleExportAll}
            data-export-hide
            title="Xuất toàn bộ Report Tháng ra 1 file Excel nhiều sheet"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0"
            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
          >
            <Download className="w-3.5 h-3.5" /> Xuất Excel
          </button>
        </div>
        ) : (
          <PageRail ref={railRef} items={railItems} current={curPage} onSelect={goPage} onExcel={handleExportAll} />
        )}
        <div className="min-w-0">
      <div className="p-5 flex flex-col gap-8">
        {shopPiecesMissing && canManage && warnBox(<>Số liệu này chốt trước khi report có phần Shop Analytics — bấm "Cập nhật số liệu" ở trên để có đủ 7 phần.</>)}
        {giftsMissing && !shopPiecesMissing && warnBox(<>Số liệu này chốt trước khi report tách quà tặng khỏi UPT — bấm "Cập nhật số liệu" ở trên để có dòng quà tặng.</>)}

        {/* ===== 1. Kết luận ===== */}
        <section id="mr-summary" className="space-y-4 scroll-mt-16" style={secStyle("summary")}>
          <SummaryDemoPage
            no={secNo("summary")}
            title={secTitle("summary")}
            headline={head("summary").headline}
            month={month}
            partial={cmp.partial}
            curEndDay={Number(cmp.curEnd.slice(8))}
            prevMonthShort={monthShort(prevMonth)}
            prevEndDay={Number(cmp.prevEnd.slice(8))}
            liveActual={liveCurStats.gmv}
            liveTargetMonth={scoreboard.find((r) => r.key === "all")?.target ?? null}
            liveTargetToDate={scoreboard.find((r) => r.key === "all")?.targetToDate ?? null}
            liveProjected={planRR?.rr.total.keepPace ?? null}
            shop={shopKpi ? { actual: shopKpi.actual, throughDay: shopCur?.through ? Number(shopCur.through.slice(8, 10)) : null, target: shopKpi.target, projected: shopKpi.partial ? shopKpi.projected : null, projectedPct: shopKpi.partial ? shopKpi.projectedPct : null } : null}
            gmvPerHour={liveCurStats.gmvPerHour}
            gmvPerHourChange={pctChange(livePrevStats.gmvPerHour, liveCurStats.gmvPerHour)}
            hoursChange={pctChange(livePrevStats.hours, liveCurStats.hours)}
            bridge={bridgeTarget}
            score={scoreboard}
            spans={keySpans[keySpans.length - 1] ?? {}}
            planHours={planHours}
            actualHours={Object.fromEntries(campDetailRows.map((r) => [r.key, r.hours]))}
            insight={demoInsight("summary")}
          />
        </section>

        {/* ===== 2. Thị trường hay vận hành ===== */}
        {sectionShown.shop && (
        <section id="mr-shop" className="pg on scroll-mt-16" style={secStyle("shop")}>
          <DemoShopPage
            no={secNo("shop")}
            title={secTitle("shop")}
            control={control}
            mixes={channelMixes.map((c) => (c ? { liveLinked: c.liveLinked, affiliate: c.affiliate, video: c.video, card: c.card, shopGmv: c.shopGmv } : null))}
            mixLabels={last4Months.map(trendColLabel)}
            yfbGmv={trendStats.map((x) => x.stats.gmv)}
            shopCur={shopCur}
            shopPrev={shopPrevSame}
            window={shopWin}
            traffic={trafficBr?.b ?? null}
            fallbackHeadline={head("shop").headline}
            insight={demoInsight("shop")}
          />
        </section>
        )}

        {/* ===== 3. Vì sao ===== */}
        <section id="mr-why" className="pg on scroll-mt-16" style={secStyle("why")}>
          <DemoWhyPage
            no={secNo("why")}
            title={secTitle("why")}
            fallbackHeadline={head("why").headline}
            windowLabel={cmp.label}
            prevShort={`Tháng ${Number(prevMonth.slice(5))}`}
            stats={{
              prev: { gmvPerHour: livePrevStats.gmvPerHour, viewsPerHour: keyMetricValue(livePrevStats, "viewsPerHour"), err: keyMetricValue(livePrevStats, "err"), ctor: keyMetricValue(livePrevStats, "ctor") },
              cur: { gmvPerHour: liveCurStats.gmvPerHour, viewsPerHour: keyMetricValue(liveCurStats, "viewsPerHour"), err: keyMetricValue(liveCurStats, "err"), ctor: keyMetricValue(liveCurStats, "ctor") }
            }}
            band={noiseBand(livePrevStats.sessions, liveCurStats.sessions)}
            drivers={drivers}
            driverLabels={{ from: waterfallData[0]?.label ?? "", to: waterfallData[waterfallData.length - 1]?.label ?? "" }}
            funnel={funnel && funnel.length === 5 ? { impressions: funnel[0], views: funnel[1], productImpressions: funnel[2], productClicks: funnel[3], orders: funnel[4] } : null}
            dayRows={dayTypeRows}
            keyMonths={keyMonths}
            monthShort={monthShort}
            insight={demoInsight("why")}
          />
        </section>

        {/* ===== 4. Sản phẩm ===== */}
        {sectionShown.products && (
        <section id="mr-products" className="space-y-4 scroll-mt-16" style={secStyle("products")}>
          <PageHead {...head("products")} metrics={productsKpis(productsData)} no={secNo("products")} title={secTitle("products")} />
          <ProductsPageBody
            data={productsData}
            images={(name) => monthlyReportRow?.sectionNotes?.[skuImageKey(name)]?.text}
            canManage={canManage}
            onSaveImage={saveSkuImage}
            curDaysLabel={skuMoveData?.curDays ? ` (${skuMoveData.curDays} ngày)` : ""}
            prevMonthLabel={prevMonth.slice(5)}
            empty={
              <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                {canManage ? "Chưa có file \"Product List\" nào được import trong Dữ Liệu Gốc cho tháng này." : "Chưa có số liệu sản phẩm tháng này."}
              </p>
            }
          />
          {pageInsight("products")}
        </section>
        )}

        {/* ===== Quảng cáo ===== */}
        {sectionShown.ads && (
        <section id="mr-ads" className="space-y-4 scroll-mt-16" style={secStyle("ads")}>
          <PageHead {...head("ads")} no={secNo("ads")} title={secTitle("ads")} sub="Ads cost toàn cửa hàng (LIVE GMV Max + Product GMV Max) · ROI theo loại ngày · ngày có chi phí nhưng 0 đơn" />
            {adsPlan && adsPlanRows && <AdsPlanPanel rows={adsPlanRows.rows} s={adsPlan} month={month} bucketOf={bucketCur} hasCampaignFile={!!adsCur} />}
            {adsPlan ? null : adsCur ? (() => {
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
                notes.push(`${adsCur.zeroOrderDays.length} ngày có chi phí Ads nhưng không phát sinh đơn (${adsCur.zeroOrderDays.map((d) => fmtDateVn(d.date, false)).join(", ")}) — ${fmtVndFull(adsCur.zeroOrderDays.reduce((a, d) => a + d.cost, 0))}.`);
              }
              if (adsCur.lowRoiDays.length) {
                notes.push(`Ngày ROI thấp nhất trong các ngày chi đáng kể: ${adsCur.lowRoiDays.map((d) => `${fmtDateVn(d.date, false)} (${roiX(d.roi)}, chi ${fmtVndShort(d.cost)})`).join("; ")}.`);
              }
              notes.push("Doanh thu gộp TikTok tính theo đơn gốc trước hủy/hoàn nên có thể lớn hơn GMV của shop — không dùng làm % GMV; ROI sau hủy/hoàn sẽ thấp hơn.");
              const chartData = adsCur.days.map((d) => ({ day: Number(d.date.slice(8)), cost: d.cost, roi: d.cost > 0 ? d.revenue / d.cost : null }));
              return (
                <Panel
                  title="Ads toàn cửa hàng (TikTok Ads)"
                  icon={<Megaphone className="w-4 h-4" />}
                  sub={`File Campaign overview data · ${fmtDateVn(adsCur.firstDate!, false)}–${fmtDateVn(adsCur.lastDate!, false)} · gồm LIVE GMV Max và Product GMV Max · ROI = doanh thu gộp ÷ chi phí · so ${prevLabel}`}
                >
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 mb-4">
                    <KpiTile frame="plain" label="Chi phí Ads" value={fmtVndShort(adsCur.cost)} note={planCur && planCur.plan.adsBudget > 0 ? `${fmtPct((adsCur.cost / planCur.plan.adsBudget) * 100)} ngân sách ${fmtVndShort(planCur.plan.adsBudget)}${adsPrev ? ` · ${vsPrev(adsCur.cost, adsPrev.cost, fmtVndShort)}` : ""}` : vsPrev(adsCur.cost, adsPrev?.cost, fmtVndShort)} />
                    <KpiTile frame="plain" label="ROI" value={roiX(adsCur.roi)} change={pctChange(adsPrev?.roi, adsCur.roi)} note={adsPrev ? `${prevLabel}: ${roiX(adsPrev.roi)}` : undefined} />
                    <KpiTile frame="plain" label="Chi phí / đơn SKU" value={adsCur.costPerOrder != null ? fmtVndFull(adsCur.costPerOrder) : "—"} note={`${fmtVndFull(adsCur.orders)} đơn${adsPrev?.costPerOrder != null ? ` · ${prevLabel}: ${fmtVndFull(adsPrev.costPerOrder)}` : ""}`} />
                    <KpiTile frame="plain" label="Doanh thu gộp từ Ads" value={fmtVndShort(adsCur.revenue)} change={pctChange(adsPrev?.revenue, adsCur.revenue)} />
                  </div>
                  <ReportTable head={["Loại ngày", "Số ngày", "Chi phí", "Doanh thu gộp", "ROI", `ROI ${prevLabel}`, "Đơn SKU"]}>
                    {buckets.map((b, idx) => {
                      const r = adsCur.byBucket![b];
                      const p = adsPrev?.byBucket?.[b];
                      return (
                        <tr key={b} style={rowStyle(idx)}>
                          <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>{DAY_TYPE_SHORT[b]}</td>
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
          {pageInsight("ads")}
        </section>
        )}

        {/* ===== Hủy, hoàn & NMV ===== */}
        {sectionShown.nmv && (
        <section id="mr-nmv" className="space-y-4 scroll-mt-16" style={secStyle("nmv")}>
          <NmvDemoPage
            no={secNo("nmv")}
            title={secTitle("nmv")}
            headline={head("nmv").headline}
            months={nmvDemoMonths}
            nmvRate={nmvRate}
            curEndDay={Number(cutEndOf(month).slice(8))}
            nmvEndDay={Number(cmp.curEnd.slice(8))}
            track={refundTrackRows(last4Months.map(refundStatusOf).filter((x): x is RefundMonthStatus => x != null), refundFinals)}
            finalDates={decodeRefundFinalDate(monthlyReportRow?.sectionNotes?.[REFUND_FINAL_DATE_KEY]?.text)}
            canManage={canManage}
            onSaveFinal={async (m, rate) => {
              const next = { ...refundFinals };
              if (rate == null) delete next[m];
              else next[m] = rate;
              setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, REFUND_FINAL_KEY, encodeRefundFinal(next)));
            }}
            onSaveDate={async (m, date) => {
              const next = { ...decodeRefundFinalDate(monthlyReportRow?.sectionNotes?.[REFUND_FINAL_DATE_KEY]?.text) };
              if (date == null) delete next[m];
              else next[m] = date;
              setMonthlyReportRow(await saveMonthlyReportSectionNote(brandId, `${month}-01`, REFUND_FINAL_DATE_KEY, encodeRefundFinalDate(next)));
            }}
            insight={demoInsight("nmv")}
          />
        </section>
        )}

        {/* ===== 5. Host ===== */}
        <section id="mr-people" className="space-y-4 scroll-mt-16" style={secStyle("people")}>
          <PageHead {...head("people")} metrics={hostKpis(hostData)} no={secNo("people")} title={secTitle("people")} />
          <HostPageBody data={hostData}>
            {canManage && hostOpsNote && warnBox(<>Chỉ ops thấy (không vào bản gửi brand): {hostOpsNote}</>)}
            {canManage && hostQuality.reconciled < hostQuality.total && (
              <div className="mb-3">
                {warnBox(
                  <>
                    {hostQuality.total} phiên: {hostQuality.reconciled} đã đối soát
                    {hostQuality.snapshot > 0 ? `, ${hostQuality.snapshot} số lúc giao ca (chờ đối soát cuối kỳ)` : ""}
                    {hostQuality.manual > 0 ? `, ${hostQuality.manual} talent tự khai (chưa được xác thực)` : ""}. Đối soát ở "Vận Hành Live → Đối Soát Số Liệu" trước khi phát hành report.
                  </>
                )}
              </div>
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
          </HostPageBody>
          {pageInsight("people")}
        </section>

        {/* ===== Affiliate ===== */}
        {sectionShown.affiliate && (
        <section id="mr-affiliate" className="space-y-4 scroll-mt-16" style={secStyle("affiliate")}>
          <PageHead {...head("affiliate")} no={secNo("affiliate")} title={secTitle("affiliate")} sub="Phiên livestream của creator trong tháng · số liệu thực tế từ tab Affiliate" />
          {creatorRows.length > 0 ? (
            <AffiliateTrackPanel cols={trackCols} monthLabel={month.slice(5)} />
          ) : (
            canManage && warnBox(<>Tháng {month.slice(5)} chưa có phiên creator nào có số liệu ở tab Affiliate (kế hoạch + Nạp Từ Dữ Liệu Gốc). Brand không dùng affiliate thì bỏ qua — brand không thấy trang này.</>)
          )}
          {pageInsight("affiliate")}
        </section>
        )}

        {/* ===== 7. Tháng sau ===== */}
        <section id="mr-next" className="space-y-4 scroll-mt-16" style={secStyle("next")}>
          <PageHead {...head("next")} no={secNo("next")} title={secTitle("next")} sub={`Hành động tháng ${Number(nextMonth.slice(5))} + kế hoạch từ Kế Hoạch Tháng và tab Affiliate`} />
          <NextLivePlanPanel
            nextMonth={nextMonth}
            curLabel={String(Number(month.slice(5)))}
            nextLabel={String(Number(nextMonth.slice(5)))}
            rows={(["daily", "dday", "midmonth", "payday"] as const).map((key) => {
              const a = nextAllocation?.find((x) => x.key === key);
              const camp = campDetailRows.find((r) => r.key === key);
              return { key, name: DAY_TYPE_SHORT[key], achieved: camp?.cur.gmvPerHour ?? null, sessionsCur: camp?.cur.sessions ?? 0, plan: a ? { hours: a.hours, target: a.target, slots: a.slots } : undefined };
            })}
            total={{ key: "all", name: "Cả tháng", achieved: liveCurStats.gmvPerHour, sessionsCur: liveCurStats.sessions }}
          />
          <BookingPlanPanel
            nextMonth={nextMonth}
            curLabel={String(Number(month.slice(5)))}
            nextLabel={String(Number(nextMonth.slice(5)))}
            planRows={creatorPlan.map((r) => ({ date: r.date, creator: r.creator, camp: r.campName, timeline: r.timeline, hours: r.hours, target: r.target, budgetAds: r.budgetAds, ref: r.bestGmvPerHour }))}
            cur={{ sessions: creatorSum.sessions, hours: creatorSum.hours, gmv: creatorSum.gmv, gmvPerHour: creatorRates(creatorSum).gmvPerHour, roas: creatorRates(creatorSum).roas }}
            refByCreator={creatorBest}
            draftNote={canManage && creatorPlan.length > 0 && !affiliate.nextMeta?.publishedAt ? "Kế hoạch Affiliate tháng sau còn là nháp — brand chỉ thấy bảng này sau khi Chốt ở tab Affiliate." : undefined}
          />
          {prevPlanItems && prevGrades && (
            <ActionResultsPanel
              planMonthLabel={`tháng ${Number(prevMonth.slice(5))}`}
              monthLabel={`tháng ${Number(month.slice(5))}`}
              items={prevPlanItems}
              grades={prevGrades}
              final={actionCtx.final}
              throughNote={cmp.partial ? `số tới ${Number(cmp.curEnd.slice(8))}/${Number(month.slice(5))}` : null}
              canManage={canManage}
              onManual={async (id, status) => {
                const at = new Date().toISOString();
                const items: ActionItem[] = prevPlanItems.map((i) => (i.id === id ? { ...i, manual: status ? { status, at } : null } : i));
                setPrevReportRow(await saveMonthlyReportActionPlan(brandId, `${prevMonth}-01`, items));
              }}
            />
          )}
          <ActionPlanPanel
            items={monthlyReportRow?.actionPlan?.items ?? null}
            fallbackLines={nextLines}
            nextMonthLabel={`tháng ${Number(nextMonth.slice(5))}`}
            canManage={canManage}
            meta={decodeTodoMeta(monthlyReportRow?.sectionNotes?.[todoMetaKey(month)]?.text)}
            onSave={async (items, meta) => {
              let row = await saveMonthlyReportActionPlan(brandId, `${month}-01`, items);
              const keep = Object.fromEntries(Object.entries(meta).filter(([id]) => items.some((i) => i.id === id)));
              row = await saveMonthlyReportSectionNote(brandId, `${month}-01`, todoMetaKey(month), encodeTodoMeta(keep));
              setMonthlyReportRow(row);
            }}
          />
          {pageInsight("next")}
        </section>

        {/* ===== Key Metrics ===== */}
        <section id="mr-keymetrics" className="space-y-4 scroll-mt-16" style={secStyle("keymetrics")}>
          <KeyMetricsDemoPage
            no={secNo("keymetrics")}
            title={secTitle("keymetrics")}
            headline={head("keymetrics").headline}
            months={keyMonths}
            monthLabel={monthShort}
            windowNote={cmp.partial ? `1–${Number(cmp.curEnd.slice(8))}` : undefined}
            insight={demoInsight("keymetrics")}
          />
        </section>

        {/* Chỉ là chỉ đường cho ops — report gửi brand là 7 phần ở trên (Phân tích sâu đã gộp vào, 2026-09-27). */}
        {canManage && (
          <p className="text-[11px] pt-3" style={{ color: PAL.muted, borderTop: `1px solid ${PAL.line}`, order: 100 }}>
            Chỉ ops thấy: target, khung campaign và lịch tháng nhập ở <b>Kế Hoạch Tháng</b>; bảng creator affiliate theo tháng ở trang <b>Affiliate</b>.
          </p>
        )}
        {!showAll && (
          <div style={{ order: 99 }}>
            <PagePager prev={curIdx > 0 ? railItems[curIdx - 1] : null} next={curIdx < railItems.length - 1 ? railItems[curIdx + 1] : null} onSelect={goPage} />
          </div>
        )}
      </div>
        </div>
      </div>
    </div>
  );
};
