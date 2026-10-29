import React, { useEffect, useMemo, useRef, useState } from "react";
import type { BrandMonthlyReport, BrandMonthPlan, BrandMonthPlanSlot, LiveSession } from "../../types";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../lib/format";
import { METRIC } from "../../lib/metricGlossary";
import { PAL, SECTIONS, type ReportSectionId } from "./report/theme";
import { fmtInt } from "./report/format";
import { PageHead, PagePager, PageRail, type PageMetric } from "./report/ui";
import { DemoHead as WhyHead, DemoInsight, type DemoKpi as WhyKpi } from "./report/DemoShopWhy";
import { DemoHead, DemoLegend, DemoPage, DemoPanel, DemoStack, DemoTable, Html } from "./report/DemoBlocks";
import { SummaryDemoPage } from "./report/DemoSummaryPages";
import { ProductsPageBody, productsKpis, type ProductsPageData } from "./report/ProductsPage";
import { HostPageBody, hostKpis, type HostPageData } from "./report/HostPage";
import { NextLivePlanPanel, LIVE_TARGET_MANUAL_KEY, decodeLiveTarget, encodeLiveTarget } from "./report/NextMonthPanels";
import { fmtM, fmtP, hbars, heat, pill, tbl, W, waterfall } from "./report/demoCharts";
import { saveMonthlyReportSectionNote } from "../../lib/db/monthlyReports";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../lib/errorMessage";
import { effectiveCamp, resolveCampBucketType, type CampDayBucket } from "../../lib/campaignDays";
import { planCampAllocation } from "../../lib/report/monthlyReportInsights";
import { changeTone, noiseBand } from "../../lib/report/brandReport";
import { skuImageKey, type ScatterPoint } from "../../lib/report/reportVisuals";
import { hostReliability, isBorderline, reliabilityText } from "../../lib/report/deepAnalysis";
import { hostVsPeer, type HostInsightRow } from "../../lib/report/sectionInsights";
import { byHost, byHostDayType, dayTypeTeamTotals, dataQuality, filterSessions, splitUnassignedHost } from "../../lib/performance/hostPerformance";
import { platformOf } from "../../lib/reportPlatform";
import { PLATFORM_PROFILES } from "../../lib/platforms/profiles";
import type { ReportScope } from "../../lib/report/reportScope";
import { pageNoteKey, type InsightBlocks } from "../../lib/report/pageInsights";
import { shopeeNotes, type ShopeeReportSnapshot } from "../../lib/report/shopeeSnapshot";
import {
  OUTSIDE_YFB_LABEL_SHARE,
  SHOPEE_BUCKETS,
  SHOPEE_FACTOR_LABEL,
  SHOPEE_KM_GROUPS,
  SHOPEE_TABS,
  SHOPEE_TAB_LABEL,
  bucketOfDate,
  fmtShopeeKm,
  monthShortLabel,
  pctChange,
  shortName,
  shopeeCancelMonths,
  shopeeCounts,
  shopeeHeadlines,
  shopeeInsights,
  shopeeOutsideYfb,
  shopeePageModel,
  shopeePlanHours,
  shopeeScoreRows,
  shopeeSkuMoves,
  shopeeSkuSlices,
  shopeeSlots,
  shopeeSpans,
  shopeeSpread,
  shopeeTargetBridge,
  shopeeTopSessions,
  streamsOf,
  type ShopeeFactor,
  type ShopeeInsightPage,
  type ShopeeKmKey,
  type ShopeeTab
} from "../../lib/report/shopeePages";
import "./report/demo.css";

// Report Tháng SHOPEE (migration 0139) — từ tối 29/10/2026 DÙNG CHUNG trang của report TikTok: Tổng quan & KPI (SummaryDemoPage),
// Sản phẩm & khuyến mãi (ProductsPageBody), Host & khung giờ (HostPageBody, đọc ca Shopee trong app như TikTok đọc ca TikTok);
// Key Metrics / Đơn huỷ / Nguyên nhân dựng cùng khung và cùng thứ tự khối với KeyMetricsDemoPage / NmvDemoPage / DemoWhyPage.
// Insight + tiêu đề kết luận dùng chung hàm của TikTok (pageInsights.ts / pageHeadlines.ts) qua lib/report/shopeePages.ts.
// Trang Quảng cáo theo phạm vi dịch vụ (0190) như TikTok. TÊN CHỈ SỐ: cột file Shopee (Viewers, ATC, Sales (Confirmed Order)…) qua
// METRIC, GMV Shopee = Sales(Placed Order) (user chốt 06/10). Chữ gửi brand: "phiên", "YFB".

type ShopeePageId = ShopeeInsightPage;
const SHOPEE_PAGE_IDS: ShopeePageId[] = ["summary", "keymetrics", "nmv", "why", "products", "people", "ads", "next"];
// Nhãn/tiêu đề lấy từ SECTIONS của TikTok; riêng trang "nmv": Shopee không có Refund rate/NMV mà có Sales (Confirmed Order).
const PAGES: { id: ShopeePageId; label: string; title: string }[] = SHOPEE_PAGE_IDS.map((id) =>
  id === "nmv" ? { id, label: "Đơn huỷ", title: `Đơn huỷ & ${METRIC.salesConfirmed}` } : { id, label: SECTIONS.find((x) => x.id === id)!.label, title: SECTIONS.find((x) => x.id === id)!.title }
);
const PAGE_LABEL = Object.fromEntries(PAGES.map((p) => [p.id, p.label])) as Record<ShopeePageId, string>;
const SHOPEE = PLATFORM_PROFILES.Shopee.id;

const BLUE = "#7fb0e0";
const TAB_CLS: Record<string, string> = { daily: "g-daily", dday: "g-dday", midmonth: "g-mm", payday: "g-pd" };
const pct = (v: number | null | undefined, d = 1) => (v == null ? "—" : `${fmtFixed(v, d)}%`);
const sgnP = (v: number | null | undefined) => (v == null ? "—" : fmtP(v, 1));
const signedM = (v: number) => (v >= 0 ? "+" : "") + fmtM(v);
const nf = (v: number) => Math.round(v).toLocaleString("vi-VN");
const durLabel = (sec: number) => (sec >= 60 ? `${Math.floor(sec / 60)}m${String(Math.round(sec % 60)).padStart(2, "0")}s` : `${Math.round(sec)}s`);
const nextMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const prevMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const lastDayOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(y, mo, 0).getDate();
};

/** Trục cầu GMV: đáy thấp hơn bước thấp nhất ~0,7 biên độ, làm tròn theo bậc của số (Shopee có brand vài chục triệu/tháng). */
function bridgeAxis(from: number, steps: number[]) {
  const runs = [from];
  for (const s of steps) runs.push(runs[runs.length - 1] + s);
  const lo = Math.min(...runs), hi = Math.max(...runs), span = Math.max(hi - lo, from * 0.05, 1);
  const unit = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(hi, 1))) - 1));
  return { min: Math.max(0, Math.floor((lo - 0.7 * span) / unit) * unit), max: Math.ceil((hi + 0.33 * span) / unit) * unit };
}

/** Phễu theo phiên (Live List): Viewers → ATC → Orders, cùng hai cách xem với Phễu LIVE của TikTok. */
const FunnelPanel: React.FC<{ stages: { label: string; prev: number; cur: number }[]; ratios: { n: string; d: string; p: number | null; c: number | null }[]; band: number | null; prevShort: string }> = ({ stages, ratios, band, prevShort }) => {
  const [mode, setMode] = useState<"p" | "i">("p");
  const chg = (p: number, c: number) => (p > 0 ? (c / p - 1) * 100 : null);
  const rch = ratios.map((r) => (r.p != null && r.c != null && r.p > 0 ? (r.c / r.p - 1) * 100 : null));
  const sig = (v: number | null) => v != null && band != null && Math.abs(v) > band;
  const idx = (s: { prev: number; cur: number }) => (s.prev > 0 ? (s.cur / s.prev) * 100 : 0);
  const hb = hbars(
    stages.map((s) => ({ name: s.label, sub: `${nf(s.prev)} → ${nf(s.cur)}`, value: idx(s), text: String(Math.round(idx(s))), cls: idx(s) < 97 ? "red" : "", mark: 100 })),
    Math.max(120, Math.ceil(Math.max(...stages.map(idx)) / 10) * 10 + 7)
  );
  const cls = (v: number | null) => (v == null ? "nt" : sig(v) ? (v > 0 ? "up" : "dn") : "nt");
  return (
    <div className="pn">
      <div className="pnh">Phễu của phiên live</div>
      <div className="pns">Live List theo phiên. Hai cách xem: chuỗi chuyển đổi (số tuyệt đối và tỷ lệ giữa các bậc) hoặc chỉ số hoá (tháng trước = 100, vạch trắng = tháng trước).</div>
      <div className="tabs">
        <button type="button" className={mode === "p" ? "seg-on" : ""} onClick={() => setMode("p")}>Chuỗi chuyển đổi</button>
        <button type="button" className={mode === "i" ? "seg-on" : ""} onClick={() => setMode("i")}>Chỉ số hoá ({prevShort} = 100)</button>
      </div>
      {mode === "p" ? (
        <div className="pipe" style={{ display: "flex" }}>
          {stages.map((s, i) => {
            const r = ratios[i];
            const rc = rch[i] ?? null;
            return (
              <React.Fragment key={s.label}>
                <div className="stg">
                  <div className="n">{s.label}</div>
                  <div className="v">{nf(s.cur)}</div>
                  <div className="p">{prevShort}: {nf(s.prev)}</div>
                  <div className="nt" style={{ marginTop: 6, fontSize: 12 }}>{sgnP(chg(s.prev, s.cur))}</div>
                </div>
                {r && (
                  <div className={`arw${sig(rc) ? " sig" : ""}`}>
                    <div className="n" style={{ fontWeight: 700 }}>{r.n}</div>
                    <div className="rt">{pct(r.c, 2)}</div>
                    <div className="ar">→</div>
                    <div>{prevShort}: {pct(r.p, 2)}</div>
                    <div className={sig(rc) ? "dn" : (rc ?? 0) > 0 ? "up" : "nt"} style={{ fontWeight: 700 }}>{sgnP(rc)}{sig(rc) ? " · vượt ngưỡng" : ""}</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <Html className="hb" html={hb} />
      )}
      <DemoTable
        html={tbl(
          ["Tỷ lệ", prevShort, "Tháng này", "±"],
          ratios.map((r, i) => [`${r.n} (${r.d})`, pct(r.p, 2), { t: pct(r.c, 2), c: cls(rch[i]) }, { t: sgnP(rch[i]), c: cls(rch[i]) }])
        )}
      />
    </div>
  );
};

interface Props {
  brandId: string;
  brandName: string;
  month: string;
  snapshot: ShopeeReportSnapshot;
  report: BrandMonthlyReport | null;
  canManage: boolean;
  onReportChange: (r: BrandMonthlyReport) => void;
  /** Ca trong app (mọi sàn) — trang Host đọc ca Shopee trực tiếp như report TikTok đọc ca TikTok. */
  liveSessions: LiveSession[];
  /** Phạm vi dịch vụ brand × Shopee (0190): Ads ngoài phạm vi ⇒ không có trang Quảng cáo; brand tự live ⇒ nhãn số tổng
   *  "gồm phiên brand tự live" khi Live List có ≥3% GMV ngoài ca YFB. Shopee chưa có trang Affiliate nên công tắc đó chỉ hiện ở dòng phạm vi. */
  scope: ReportScope;
  /** Bản xuất gửi brand: hiện đủ trang trong một DOM (file HTML/PDF tách trang bằng `section#mr-*`). */
  showAll?: boolean;
}

export const ShopeeMonthlyReportTabs: React.FC<Props> = ({ brandId, brandName, month, snapshot: s, report, canManage, onReportChange, liveSessions, scope, showAll = false }) => {
  const h = s.headline;
  const o = s.overview;
  const { showToast } = useToast();
  const [kmTab, setKmTab] = useState<ShopeeTab>("all");
  const pm = useMemo(() => shopeePageModel(s), [s]);
  // Ads ngoài phạm vi dịch vụ (0190) ⇒ bỏ lời nhắc thiếu file Ads.
  const opsNotes = useMemo(() => (canManage ? shopeeNotes(s, "ops").filter((t) => scope.ads || !/file Ads/.test(t)) : []), [canManage, s, scope.ads]);
  const months = pm.model.months;
  const lastIdx = months.length - 1;
  const cut = pm.model.cutDay;
  const prevMonth = prevMonthOf(month);
  const kmRow = (key: ShopeeKmKey, tab: ShopeeTab = "all") => pm.km[tab].rows.find((r) => r.def.key === key);
  const kmVal = (key: ShopeeKmKey) => kmRow(key)?.values[lastIdx] ?? null;
  const kmChg = (key: ShopeeKmKey) => kmRow(key)?.changes[lastIdx] ?? null;
  const band = pm.km.all.bands[lastIdx] ?? null;
  const scoreAll = pm.score.find((r) => r.key === "all");

  // ---- Kế hoạch tháng sau: đọc thẳng Kế Hoạch Tháng Shopee (nguồn duy nhất), như report TikTok — không vào bản chụp.
  const nextMonth = nextMonthOf(month);
  const [nextPlan, setNextPlan] = useState<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMonthPlan(brandId, nextMonth, "Shopee")
      .then((r) => !cancelled && setNextPlan(r))
      .catch(() => !cancelled && setNextPlan(null));
    return () => {
      cancelled = true;
    };
  }, [brandId, nextMonth]);
  const nextAlloc = useMemo(() => (nextPlan && nextPlan.slots.length > 0 ? planCampAllocation(nextPlan.slots, effectiveCamp(nextPlan.plan.campRanges)) : null), [nextPlan]);

  // ---- Host: ca Shopee của brand trong app (cùng các hàm của report TikTok), loại ngày theo khung camp của từng tháng trong bản chụp.
  const bucketAny = useMemo(() => {
    const byMonth = new Map(months.map((m) => [m.month, m]));
    return (d: string): CampDayBucket => {
      const m = byMonth.get(d.slice(0, 7));
      return m ? bucketOfDate(m, d) : resolveCampBucketType(d);
    };
  }, [months]);
  const shopeeSessions = useMemo(
    () => filterSessions(liveSessions.filter((x) => x.brandId === brandId && platformOf(x) === SHOPEE && x.status === "Completed"), {}),
    [liveSessions, brandId]
  );
  const completed = useMemo(() => {
    const end = cut != null ? `${month}-${String(cut).padStart(2, "0")}` : `${month}-31`;
    return shopeeSessions.filter((x) => x.date >= `${month}-01` && x.date <= end);
  }, [shopeeSessions, month, cut]);
  const hostDayType = useMemo(() => byHostDayType(completed, bucketAny), [completed, bucketAny]);

  // ---- Phiên Live List ngoài ca YFB (30/10): Live List là mọi phiên của tài khoản shop ⇒ đo phần không trùng ca YFB nào.
  // Mọi ca Shopee của brand trừ ca huỷ (ca chưa bấm Hoàn thành vẫn là giờ YFB đứng live).
  const outside = useMemo(
    () => shopeeOutsideYfb(s.streams, liveSessions.filter((x) => x.brandId === brandId && platformOf(x) === SHOPEE)),
    [s.streams, liveSessions, brandId]
  );
  const outsideBig = outside.share != null && outside.share >= OUTSIDE_YFB_LABEL_SHARE;
  const gmvLabel = scope.inhouseLive && outsideBig ? `${METRIC.gmv} (gồm phiên brand tự live)` : METRIC.gmv;
  const scopeLine = [
    [!scope.ads && "Ads", !scope.affiliate && "Affiliate"].some(Boolean) ? `ngoài phạm vi YFB: ${[!scope.ads && "Ads", !scope.affiliate && "Affiliate"].filter(Boolean).join(", ")}` : null,
    scope.inhouseLive ? "brand có tự live cùng tài khoản" : null
  ].filter(Boolean).join(" · ");
  const outsideLine =
    outside.total > 0
      ? `Live List tháng này: ${outside.streams}/${outside.total} phiên ngoài ca YFB${outside.gmv > 0 || outside.hours > 0 ? ` (${outside.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ, ${fmtM(outside.gmv)}${outside.share != null ? `, ${fmtP(outside.share, 1, false)} ${METRIC.gmv}` : ""})` : ""}${
          scope.inhouseLive
            ? outsideBig
              ? ` — số tổng ghi "gồm phiên brand tự live".`
              : ` — dưới ${OUTSIDE_YFB_LABEL_SHARE}% nên giữ nhãn ${METRIC.gmv}.`
            : outsideBig
              ? ` — nếu là brand tự live, bật "Brand có tự live cùng tài khoản" ở CRM → Hợp đồng & giá; nếu là ca YFB thiếu, thêm ca.`
              : "."
        }`
      : null;
  const hostTeam = useMemo(() => dayTypeTeamTotals(hostDayType), [hostDayType]);
  const hostPeer = useMemo(() => {
    const rows = new Map<string, HostInsightRow>();
    for (const b of SHOPEE_BUCKETS) {
      for (const r of splitUnassignedHost(byHost(completed.filter((x) => bucketAny(x.date) === b))).ranked) {
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
    return { rows: list, vsPeer: new Map(keys.map((k, i) => [k, peer[i].vsPeer])) };
  }, [completed, bucketAny]);
  const reliability = useMemo(() => hostReliability(shopeeSessions, bucketAny), [shopeeSessions, bucketAny]);
  const relMonths = useMemo(() => new Set(shopeeSessions.map((x) => x.date.slice(0, 7))).size, [shopeeSessions]);
  const unassigned = useMemo(() => splitUnassignedHost(byHost(completed)).unassigned, [completed]);
  const hostQuality = useMemo(() => dataQuality(completed), [completed]);
  const slots = useMemo(() => shopeeSlots(pm), [pm]);
  const hostShortName = (name: string) => {
    const w = (n: string, k: number) => n.trim().split(/\s+/).slice(-k).join(" ");
    return hostDayType.filter((r) => w(r.name, 1) === w(name, 1)).length > 1 ? w(name, 2) : w(name, 1);
  };
  const periodOf = (m: string) => (cut != null ? `1–${Math.min(cut, lastDayOf(m))}/${m.slice(5)}` : monthShortLabel(m));
  const hostData: HostPageData = {
    rows: hostDayType,
    team: hostTeam,
    vsPeer: hostPeer.vsPeer,
    reliability: new Map(reliability.map((r) => [r.key, r])),
    relMonths,
    shortName: hostShortName,
    slots: slots.map((r) => {
      const c = pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour);
      const b = noiseBand(r.prev.n, r.cur.n, pm.cv.cv);
      return { label: r.label, prevN: r.prev.n, curN: r.cur.n, prev: r.prev.gmvPerHour, cur: r.cur.gmvPerHour, change: c, band: b, tone: changeTone(c, b, true) as "up" | "down" | "flat" };
    }),
    spread: shopeeSpread(s),
    top: shopeeTopSessions(s),
    prevPeriod: periodOf(prevMonth),
    curPeriod: periodOf(month),
    prevMonthLabel: monthShortLabel(prevMonth),
    curMonthLabel: monthShortLabel(month),
    variant: "shopee"
  };

  // ---- Sản phẩm: Product List → bảng Top SKU của TikTok (hạng so với tháng trước, ảnh sản phẩm lưu cùng report Shopee).
  const sku = useMemo(() => shopeeSkuMoves(s, cut), [s, cut]);
  const skuPoints = useMemo<ScatterPoint[]>(() => {
    const rows = sku?.rows ?? [];
    const byName = new Map(s.products.top.map((x) => [x.name, x]));
    const clicks = rows.reduce((a, r) => a + (byName.get(r.name)?.clicks ?? 0), 0);
    return rows
      .filter((r) => r.ctor != null && (byName.get(r.name)?.clicks ?? 0) > 0 && clicks > 0)
      .map((r) => ({ key: r.name, label: r.name, x: ((byName.get(r.name)!.clicks) / clicks) * 100, y: r.ctor!, size: r.gmv, tone: r.prevRank == null ? "flat" : r.rank < r.prevRank ? "up" : r.rank > r.prevRank ? "down" : "flat" }));
  }, [sku, s.products.top]);
  const skuCur = useMemo(() => shopeeSkuSlices(s, cut).cur, [s, cut]);
  const productsData: ProductsPageData = {
    sku,
    skuRank: skuCur,
    gift: null,
    giftSlice: null,
    giftByMonth: [],
    giftMonthLabels: [],
    giftPeriodLabel: "",
    giftMaxPriceLabel: "",
    promo: null,
    prevMonthNo: Number(prevMonth.slice(5)),
    points: skuPoints,
    variant: "shopee"
  };

  // ---- Insight 4 khối + tiêu đề kết luận (khoá pg_<trang>, sàn Shopee) — chung hàm với TikTok.
  const relByName = useMemo(() => new Map(reliability.map((r) => [r.name, r])), [reliability]);
  const auto: Record<ShopeePageId, InsightBlocks> = useMemo(
    () =>
      shopeeInsights(s, pm, {
        hosts: hostPeer.rows
          .filter((x) => x.hours > 0 && x.gmv > 0)
          .flatMap((x) => {
            const r = relByName.get(x.name);
            return r ? [{ name: x.name, verdict: r.verdict, ci: reliabilityText(r), sessions: r.sessions, borderline: isBorderline(r) }] : [];
          }),
        relMonths,
        nextLabel: `Tháng ${Number(nextMonth.slice(5))}`,
        hasNextPlan: !!nextPlan && nextPlan.plan.targetGmv > 0 && nextPlan.slots.length > 0
      }),
    [s, pm, hostPeer, relByName, relMonths, nextMonth, nextPlan]
  );
  const heads = useMemo(() => shopeeHeadlines(s, pm, auto, PAGE_LABEL), [s, pm, auto]);
  const insight = (page: ShopeePageId) => (
    <DemoInsight
      auto={auto[page]}
      note={report?.sectionNotes?.[pageNoteKey(page)]}
      computedAt={s.computedAt}
      canManage={canManage}
      onSave={async (text) => onReportChange(await saveMonthlyReportSectionNote(brandId, `${month}-01`, pageNoteKey(page), text, "Shopee"))}
    />
  );

  // ---- Trang hiện (cùng luật report TikTok): trang không có số thì ẩn với brand, ops vẫn thấy kèm lời nhắc tải file.
  const cancel = useMemo(() => shopeeCancelMonths(pm), [pm]);
  const shown: Record<ShopeePageId, boolean> = {
    summary: true,
    keymetrics: true,
    nmv: canManage || cancel.some((c) => c.cancelRate != null),
    why: true,
    products: canManage || s.products.count > 0 || !!s.promo,
    people: true,
    ads: scope.ads && (canManage || !!s.ads),
    next: true
  };
  const visible = PAGES.filter((p) => shown[p.id]);
  const ids = visible.map((p) => p.id);
  const hashPage = () => {
    const m = typeof window === "undefined" ? null : /^#mr-(\w+)/.exec(window.location.hash);
    return m && (ids as string[]).includes(m[1]) ? (m[1] as ShopeePageId) : null;
  };
  const [pageState, setPageState] = useState<ShopeePageId>(() => (showAll ? "summary" : hashPage() ?? "summary"));
  const curPage: ShopeePageId = ids.includes(pageState) ? pageState : ids[0];
  const curIdx = ids.indexOf(curPage);
  const topRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const goPage = (id: ReportSectionId) => {
    setPageState(id as ShopeePageId);
    if (!showAll) window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}#mr-${id}`);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ block: "start" }));
  };
  useEffect(() => {
    if (showAll) return;
    const onHash = () => {
      const id = hashPage();
      if (id) setPageState(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  const secStyle = (id: ShopeePageId): React.CSSProperties => ({ display: showAll || id === curPage ? undefined : "none" });
  const secNo = (id: ShopeePageId) => String(ids.indexOf(id) + 1);
  const secTitle = (id: ShopeePageId) => PAGES.find((p) => p.id === id)!.title;
  const rail = visible.map((p) => ({ id: p.id as ReportSectionId, label: p.label }));
  const fileHint = (what: string) => (canManage ? `Chưa có file ${what} của tháng này — tải lên ở Dữ Liệu Gốc.` : "Chưa có số liệu cho phần này trong tháng.");
  const warnBox = (children: React.ReactNode) => (
    <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: `${PAL.gold}14`, color: PAL.gold, border: `1px solid ${PAL.gold}44` }} data-export-hide>
      {children}
    </div>
  );
  const winNote = cut != null ? `1–${cut}` : null;

  // ======================= 2 · Key Metrics (cùng khung KeyMetricsDemoPage) =======================
  const kmTable = pm.km[kmTab];
  const kmRows: unknown[] = [];
  for (const g of SHOPEE_KM_GROUPS) {
    const rs = kmTable.rows.filter((r) => r.def.group === g.group);
    if (!rs.length) continue;
    kmRows.push({ grp: g.label });
    for (const r of rs) {
      kmRows.push([
        r.def.label,
        ...r.values.map((v) => fmtShopeeKm(r.def.kind, v)),
        ...r.changes.slice(1).map((c, i) => (c == null ? "—" : { t: fmtP(c, 0), c: r.tones[i + 1] === "up" ? "up" : r.tones[i + 1] === "down" ? "dn" : "nt" }))
      ]);
    }
  }
  const kmHead = ["Chỉ số", ...months.map((m) => monthShortLabel(m.month)), ...months.slice(1).map((m, i) => `${monthShortLabel(m.month)} so ${monthShortLabel(months[i].month)} (${kmTable.bands[i + 1] == null ? "—" : "±" + Math.round(kmTable.bands[i + 1]!) + "%"})`)];
  const kmTabs = SHOPEE_TABS.filter((t) => t === "all" || pm.km[t].sessions[pm.km[t].sessions.length - 1] > 0);

  // ======================= 3 · Đơn huỷ =======================
  const cancelCur = cancel[cancel.length - 1];
  const cancelPrev = cancel.length >= 2 ? cancel[cancel.length - 2] : null;
  const cancelMax = Math.max(...cancel.map((c) => c.gmv), 1);
  const cancelBars = hbars(
    cancel.map((c) => ({
      name: `Tháng ${Number(c.month.slice(5))}`,
      sub: `${METRIC.gmv} ${fmtM(c.gmv)} · huỷ ${c.cancelRate != null ? pct(c.cancelRate, 1) : "—"}`,
      value: c.confirmed / 1e6,
      mark: c.gmv / 1e6,
      text: `${fmtM(c.confirmed)} / ${fmtM(c.gmv)}`
    })),
    Math.ceil((cancelMax * 1.1) / 1e6)
  );
  const cancelDayHtml = tbl(
    ["Loại ngày", ...cancel.map((c) => monthShortLabel(c.month)), "±"],
    SHOPEE_BUCKETS.filter((b) => cancel.some((c) => c.byBucket[b].gmv > 0)).map((b) => {
      const rate = (c: (typeof cancel)[number]) => (c.byBucket[b].gmv > 0 && c.byBucket[b].confirmed > 0 ? (1 - c.byBucket[b].confirmed / c.byBucket[b].gmv) * 100 : null);
      const a = cancelPrev ? rate(cancelPrev) : null;
      const z = rate(cancelCur);
      return [
        `${SHOPEE_TAB_LABEL[b]}<br><span class="nt" style="font-size:11px">${cancelCur.byBucket[b].sessions} phiên</span>`,
        ...cancel.map((c) => pct(rate(c), 1)),
        a != null && z != null ? { t: `${z - a >= 0 ? "+" : "−"}${fmtFixed(Math.abs(z - a), 1)} điểm`, c: "nt" } : "—"
      ];
    })
  );

  // ======================= 4 · Nguyên nhân (cùng khung DemoWhyPage) =======================
  const d = pm.drivers;
  let bridgeHtml = "";
  if (d) {
    const ax = bridgeAxis(d.from, d.parts.map((p) => p.value));
    bridgeHtml = waterfall(
      [
        { l: pm.prevLabel ?? "", v: d.from, t: "total", txt: fmtM(d.from) },
        ...d.parts.map((p) => ({ l: SHOPEE_FACTOR_LABEL[p.key], v: p.value, t: "delta", txt: signedM(p.value) })),
        { l: pm.curLabel, v: d.to, t: "total", txt: fmtM(d.to) }
      ],
      { min: ax.min, max: ax.max, h: 290 }
    );
  }
  const whyKpis: WhyKpi[] = [
    { key: "gmvPerHour" as const, label: METRIC.gmvPerHour },
    { key: "viewersPerHour" as const, label: METRIC.viewersPerHour },
    { key: "atcRate" as const, label: METRIC.atcRate },
    { key: "gmvPerAtc" as const, label: METRIC.gmvPerAtc }
  ].map(({ key, label }) => {
    const r = kmRow(key);
    const c = kmChg(key);
    const sig = c != null && band != null && Math.abs(c) > band;
    return {
      label,
      value: r ? fmtShopeeKm(r.def.kind, kmVal(key)) : "—",
      note: `${sgnP(c)}${key === "gmvPerHour" ? ` so với ${pm.prevLabel ?? "tháng trước"}` : sig ? (c! < 0 ? " · giảm có ý nghĩa" : " · tăng có ý nghĩa") : band != null ? ` · ngưỡng ±${Math.round(band)}%` : ""}`,
      color: c == null ? undefined : c < 0 ? ("red" as const) : ("green" as const)
    };
  });
  const factorCols: ShopeeFactor[] = d && d.parts.some((p) => p.key === "atcRate") ? ["hours", "viewersPerHour", "atcRate", "gmvPerAtc"] : ["hours", "viewersPerHour"];
  const dayFactorHtml = pm.dayFactors.length
    ? tbl(
        ["Loại ngày", ...factorCols.map((f) => SHOPEE_FACTOR_LABEL[f]), METRIC.gmvPerHour, "Ngưỡng", "Đánh giá"],
        pm.dayFactors.map((r) => {
          const gp = r.change.gmvPerHour;
          const [t, k] = r.band == null ? ["chưa đủ phiên", "m"] : r.significant ? [(gp ?? 0) < 0 ? "giảm có ý nghĩa" : "tăng có ý nghĩa", (gp ?? 0) < 0 ? "r" : "g"] : ["trong ngưỡng dao động", "m"];
          return [
            `${SHOPEE_TAB_LABEL[r.key]}<br><span class="nt" style="font-size:11px">${r.sessionsPrev} → ${r.sessionsCur} phiên</span>`,
            ...[...factorCols, "gmvPerHour" as const].map((f, i) => {
              const v = r.change[f];
              if (v == null) return "—";
              return { t: fmtP(v), c: "hm", s: (i === 0 ? heat(v, 40, BLUE, BLUE) : heat(v, 30)) + (i > 0 && r.band != null && Math.abs(v) > r.band ? ";box-shadow:inset 0 0 0 1.5px var(--cream);font-weight:800" : "") };
            }),
            r.band != null ? `±${Math.round(r.band)}%` : "—",
            W(pill(t, k))
          ];
        }),
        [factorCols.length + 3]
      )
    : "";
  // Số đo từng loại ngày (bảng .vt của TikTok): mỗi loại ngày một nhóm cột các tháng, ô tô màu theo thay đổi so với tháng liền trước.
  const absKeys: ShopeeKmKey[] = ["gmv", "hours", "gmvPerHour", "viewersPerHour", "atcRate", "ordersPerAtc", "gmvPerAtc", "abs"];
  const absTabs = SHOPEE_BUCKETS.filter((t) => pm.km[t].sessions.some((n) => n > 0));
  const absHtml =
    months.length >= 2 && absTabs.length
      ? `<thead><tr><th rowspan="2">Chỉ số</th>${absTabs.map((t) => `<th class="grpH gs ${TAB_CLS[t]}" colspan="${months.length}">${SHOPEE_TAB_LABEL[t]}</th>`).join("")}</tr><tr>${absTabs
          .map((t) => months.map((m, i) => `<th class="sub${i === 0 ? " gs" : ""} ${TAB_CLS[t]}">${monthShortLabel(m.month)}</th>`).join(""))
          .join("")}</tr></thead><tbody>` +
        absKeys
          .map((k) => {
            const def = pm.km.all.rows.find((r) => r.def.key === k)?.def;
            if (!def) return "";
            return `<tr><td><b>${def.label}</b></td>${absTabs
              .map((t) => {
                const r = kmRow(k, t);
                return months
                  .map((_, i) => {
                    const v = r?.values[i] ?? null;
                    const txt = fmtShopeeKm(def.kind, v);
                    if (i === 0) return `<td class="cellc base gs ${TAB_CLS[t]}">${txt}</td>`;
                    const c = r?.changes[i] ?? null;
                    const tone = r?.tones[i];
                    const st = c == null ? "" : (k === "hours" ? heat(c, 40, BLUE, BLUE) : heat(c, 30)) + (tone === "up" || tone === "down" ? ";box-shadow:inset 0 0 0 1.5px var(--cream);font-weight:800" : "");
                    return `<td class="cellc" style="${st}">${txt}${c != null ? `<small>${fmtP(c)}</small>` : ""}</td>`;
                  })
                  .join("");
              })
              .join("")}</tr>`;
          })
          .join("") +
        "</tbody>"
      : "";
  const funnel = useMemo(() => {
    if (months.length < 2) return null;
    const a = shopeeCounts(streamsOf(months[lastIdx - 1], "all", cut));
    const b = shopeeCounts(streamsOf(months[lastIdx], "all", cut));
    if (!(a.rich.atc > 0 && b.rich.atc > 0)) return null;
    return {
      stages: [
        { label: METRIC.viewers, prev: a.rich.viewers, cur: b.rich.viewers },
        { label: METRIC.atc, prev: a.rich.atc, cur: b.rich.atc },
        { label: `${METRIC.orders} (Placed Order)`, prev: a.rich.orders, cur: b.rich.orders }
      ],
      ratios: [
        { n: METRIC.atcRate, d: `${METRIC.atc} ÷ ${METRIC.viewers}`, p: (a.rich.atc / a.rich.viewers) * 100, c: (b.rich.atc / b.rich.viewers) * 100 },
        { n: `${METRIC.orders}/${METRIC.atc}`, d: `${METRIC.orders} ÷ ${METRIC.atc}`, p: (a.rich.orders / a.rich.atc) * 100, c: (b.rich.orders / b.rich.atc) * 100 }
      ]
    };
  }, [months, lastIdx, cut]);
  const overviewHtml = o
    ? tbl(
        ["Bước", "Số lượng", "Tỷ lệ", "Cách tính"],
        // ATC trên Shopee bấm được từ nhiều chỗ (giỏ hàng nổi, ghim sản phẩm) nên có thể lớn hơn Product Clicks — tỷ lệ ATC tính trên Viewers.
        ([
          [METRIC.viewers, o.viewers, null, ""],
          [METRIC.engagedViewers, o.engaged, o.viewers > 0 ? (o.engaged / o.viewers) * 100 : null, `÷ ${METRIC.viewers}`],
          ["Product Impressions", o.productImpressions, null, ""],
          ["Product Clicks", o.productClicks, o.productImpressions > 0 ? (o.productClicks / o.productImpressions) * 100 : null, "÷ Product Impressions (CTR)"],
          [METRIC.atc, o.atc, o.viewers > 0 ? (o.atc / o.viewers) * 100 : null, `÷ ${METRIC.viewers} (${METRIC.atcRate})`],
          [`${METRIC.orders} (Placed Order)`, o.ordersPlaced, o.atc > 0 ? (o.ordersPlaced / o.atc) * 100 : null, `÷ ${METRIC.atc}`]
        ] as [string, number, number | null, string][]).map(([l, v, r, how]) => [`<b>${l}</b>`, fmtInt(v), r != null ? pct(r, 2) : "—", { t: how, c: "nt" }])
      )
    : "";
  const sourcesHtml = o && o.sources.length
    ? tbl(
        ["Traffic Source", METRIC.salesRatio, "Sales (Placed Order)", METRIC.liveViewers, METRIC.engagedViewers],
        [...o.sources].filter((x) => x.salesPlaced > 0 || x.viewers > 0).sort((a, b) => b.salesPlaced - a.salesPlaced).map((x) => [`<b>${x.key}</b>`, pct(x.salesRatioPct, 0), fmtM(x.salesPlaced), fmtInt(x.viewers), fmtInt(x.engaged)])
      )
    : "";

  // ======================= Đầu trang Sản phẩm / Host / Ads / Tháng sau (PageHead như TikTok) =======================
  // Tên Product List của Shopee dài cả câu ⇒ ô Top 1 cắt ở ranh giới từ.
  const productMetrics: PageMetric[] = [...productsKpis(productsData).slice(0, 3).map((m, i) => (i === 0 && sku?.rows[0] ? { ...m, label: `Top 1 · ${shortName(sku.rows[0].name, 44)}` } : m)), ...(s.promo && s.promo.coins > 0 ? [{ label: METRIC.coinsClaimed, value: fmtInt(s.promo.coins), note: `≈ ${fmtVndShort(s.promo.coins)}${h.gmv > 0 ? ` (${pct((s.promo.coins / h.gmv) * 100, 2)} GMV)` : ""}` }] : [])];

  // ======================= Xuất Excel =======================
  const handleExcel = () => {
    const n = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);
    void downloadSheetsAsXlsx(
      [
        { name: "1 Target theo loai ngay", rows: pm.score.map((r) => ({ "Loại ngày": SHOPEE_TAB_LABEL[r.key], Target: n(r.target), "Target tới nay": n(r.targetToDate), GMV: n(r.actual), "% Target": n(r.pct), "Giờ kế hoạch": n(r.planHours), "Giờ live": n(r.hours), Phiên: r.sessions, "GMV/giờ kế hoạch": n(r.requiredPerHour), "GMV/giờ": n(r.gmvPerHour) })) },
        ...SHOPEE_TABS.filter((t) => pm.km[t].rows.length).map((t) => ({
          name: `2 Key Metrics ${SHOPEE_TAB_LABEL[t]}`,
          rows: pm.km[t].rows.map((r) => ({ "Chỉ số": r.def.label, ...Object.fromEntries(months.map((m, i) => [monthShortLabel(m.month), n(r.values[i])])) }))
        })),
        { name: "3 Don huy", rows: cancel.map((c) => ({ Tháng: monthShortLabel(c.month), GMV: n(c.gmv), "Sales (Confirmed Order)": n(c.confirmed), "% huỷ": n(c.cancelRate) })) },
        { name: "4 Nguyen nhan", rows: (d?.parts ?? []).map((p) => ({ "Yếu tố": SHOPEE_FACTOR_LABEL[p.key], "% đổi": n(p.change), "Đóng góp GMV": n(p.value) })) },
        { name: "5 San pham", rows: s.products.top.map((x, i) => ({ "#": i + 1, "Product(s)": x.name, "Sales(Placed Order)": x.salesPlaced, Orders: x.ordersPlaced, "Product Clicks": x.clicks, ATC: x.atc })) },
        { name: "6 Host", rows: hostPeer.rows.map((x) => ({ Host: x.name, "Giờ live": n(x.hours), GMV: n(x.gmv), "GMV/giờ": n(x.hours > 0 ? x.gmv / x.hours : null) })) },
        { name: "6 Khung gio", rows: slots.map((x) => ({ "Khung giờ": x.label, [`Phiên ${monthShortLabel(prevMonth)}`]: x.prev.n, [`GMV/giờ ${monthShortLabel(prevMonth)}`]: n(x.prev.gmvPerHour), [`Phiên ${monthShortLabel(month)}`]: x.cur.n, [`GMV/giờ ${monthShortLabel(month)}`]: n(x.cur.gmvPerHour) })) }
      ],
      `ReportThang_Shopee_${brandName}_${month}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  return (
    <div className="rt rounded-2xl" style={{ background: PAL.bg }} ref={topRef} aria-label={`Report Shopee tháng ${Number(month.slice(5))}/${month.slice(0, 4)} ${brandName}`}>
      <PageRail ref={railRef} items={rail} current={curPage} onSelect={goPage} onExcel={handleExcel} />
      <div className="p-5 flex flex-col gap-8">
        {canManage && s.version < 6 && warnBox(<>Số liệu này chốt trước khi report Shopee dùng chung trang với TikTok (hạng sản phẩm so tháng trước) — bấm &quot;Cập nhật số liệu&quot; ở trên để có đủ các trang.</>)}
        {canManage && (scopeLine || outsideLine) && (
          <p data-export-hide className="text-[11px]" style={{ color: outsideBig && !scope.inhouseLive ? PAL.gold : PAL.muted }}>
            {scopeLine && <>Phạm vi dịch vụ (CRM → Hợp đồng & giá): {scopeLine}.</>}
            {scopeLine && outsideLine && " "}
            {outsideLine && <>Chỉ ops thấy · {outsideLine}</>}
          </p>
        )}

        {/* ===== 1 · Tổng quan & KPI ===== */}
        <section id="mr-summary" className="space-y-4 scroll-mt-16" style={secStyle("summary")}>
          <SummaryDemoPage
            no={secNo("summary")}
            title={secTitle("summary")}
            headline={heads.summary}
            month={month}
            partial={cut != null}
            curEndDay={cut ?? lastDayOf(month)}
            prevMonthShort={monthShortLabel(prevMonth)}
            prevEndDay={cut != null ? Math.min(cut, lastDayOf(prevMonth)) : lastDayOf(prevMonth)}
            liveActual={scoreAll?.actual ?? h.gmv}
            liveTargetMonth={scoreAll?.target ?? null}
            liveTargetToDate={scoreAll?.targetToDate ?? null}
            liveProjected={null}
            shop={null}
            gmvPerHour={scoreAll?.gmvPerHour ?? null}
            gmvPerHourChange={kmChg("gmvPerHour")}
            gmvPerHourBand={band}
            hoursChange={kmChg("hours")}
            bridge={shopeeTargetBridge(pm)}
            score={shopeeScoreRows(pm)}
            spans={shopeeSpans(s)}
            planHours={shopeePlanHours(s, pm)}
            actualHours={Object.fromEntries(pm.score.filter((r) => r.key !== "all").map((r) => [r.key, r.hours]))}
            gmvLabel={gmvLabel}
            insight={insight("summary")}
          />
          {opsNotes.length > 0 && warnBox(<ul style={{ paddingLeft: 16, listStyle: "disc", margin: 0 }}>{opsNotes.map((t, i) => <li key={i}>Chỉ ops thấy: {t}</li>)}</ul>)}
        </section>

        {/* ===== 2 · Key Metrics ===== */}
        <section id="mr-keymetrics" className="space-y-4 scroll-mt-16" style={secStyle("keymetrics")}>
          <DemoPage>
            <DemoHead no={secNo("keymetrics")} title={secTitle("keymetrics")} headline={heads.keymetrics} />
            {s.streams.length === 0 ? (
              <DemoPanel title="Key Metrics"><p className="pns">{fileHint("Live List (…live_stream_list…xlsx)")}</p></DemoPanel>
            ) : (
              <DemoPanel
                title={`${pm.km.all.rows.length} chỉ số, ${months.length === 3 ? "ba" : months.length} tháng ${winNote ? `cùng kỳ ${winNote}` : "cả tháng"}`}
                sub={`Màu xanh / đỏ khi thay đổi vượt ngưỡng dao động của tab đó (độ lệch GMV/giờ mỗi phiên ±${Math.round(pm.cv.cv * 100)}%, ${pm.cv.measured ? "đo trên phiên của brand" : "mức mặc định, chưa đủ phiên để đo riêng"}). ${METRIC.liveHours} và chỉ số quy mô đi theo giờ (${METRIC.gmv}, ${METRIC.orders}, ${METRIC.itemsSoldShopee}, ${METRIC.viewers}, ${METRIC.atc}) không đánh giá tốt hay xấu.`}
              >
                <div className="tabs" role="tablist">
                  {kmTabs.map((t) => (
                    <button key={t} type="button" role="tab" aria-selected={kmTab === t} className={kmTab === t ? "seg-on" : undefined} onClick={() => setKmTab(t)}>
                      {SHOPEE_TAB_LABEL[t]} · {pm.km[t].sessions[pm.km[t].sessions.length - 1]} phiên
                    </button>
                  ))}
                </div>
                <DemoTable html={tbl(kmHead, kmRows)} id="km" />
                <DemoLegend>
                  <span>Số theo phiên trong Live List của Shopee; {METRIC.gmv} = Sales(Placed Order). Tỷ lệ tự tính: {METRIC.atcRate} = ATC ÷ Viewers; {METRIC.orders}/{METRIC.atc} = Orders ÷ ATC; {METRIC.gmvPerAtc} = GMV ÷ ATC.</span>
                  <span>{winNote ? `Cùng kỳ ${winNote} mỗi tháng` : "Cả tháng"} · số phiên {months.map((m) => monthShortLabel(m.month)).join(" → ")}: {kmTable.sessions.join(" → ")} phiên</span>
                </DemoLegend>
              </DemoPanel>
            )}
            {insight("keymetrics")}
          </DemoPage>
        </section>

        {/* ===== 3 · Đơn huỷ (vị trí trang NMV của TikTok) ===== */}
        {shown.nmv && (
          <section id="mr-nmv" className="space-y-4 scroll-mt-16" style={secStyle("nmv")}>
            <DemoPage>
              <DemoHead no={secNo("nmv")} title={secTitle("nmv")} headline={heads.nmv} />
              {cancelCur?.cancelRate == null ? (
                <DemoPanel title={`${METRIC.gmv} và ${METRIC.salesConfirmed}`}><p className="pns">{fileHint("Live List có cột Sales(Confirmed Order)")}</p></DemoPanel>
              ) : (
                <DemoStack>
                  <DemoPanel title={`${METRIC.gmv} tách thành ${METRIC.salesConfirmed} và phần đơn huỷ`} sub={`${winNote ? `Cùng kỳ ${winNote} mỗi tháng` : "Cả tháng"} · thanh = ${METRIC.salesConfirmed}, vạch trắng = ${METRIC.gmv} (Sales(Placed Order)) · số xác nhận tính tới lúc tải Live List.`}>
                    <Html className="hb" html={cancelBars} />
                  </DemoPanel>
                  <DemoPanel title="Tỷ lệ đơn huỷ theo loại ngày" sub={`% giá trị đặt không thành đơn xác nhận = 1 − ${METRIC.salesConfirmed} ÷ ${METRIC.gmv}; mỗi tháng theo khung campaign của chính tháng đó.`}>
                    <DemoTable html={cancelDayHtml} />
                  </DemoPanel>
                </DemoStack>
              )}
              {insight("nmv")}
            </DemoPage>
          </section>
        )}

        {/* ===== 4 · Nguyên nhân ===== */}
        <section id="mr-why" className="pg on scroll-mt-16" style={secStyle("why")}>
          <WhyHead no={secNo("why")} title={secTitle("why")} headline={heads.why} kpis={whyKpis} />
          <div className="stk">
            <div className="pn">
              <div className="pnh">Đóng góp của từng yếu tố vào thay đổi {METRIC.gmv}</div>
              <div className="pns">GMV = {d ? d.parts.map((p) => SHOPEE_FACTOR_LABEL[p.key]).join(" × ") : `${METRIC.liveHours} × ${METRIC.viewersPerHour} × ${METRIC.atcRate} × ${METRIC.gmvPerAtc}`} · {pm.prevLabel ?? "tháng trước"} so với {pm.curLabel} · {d ? d.parts.length : 4} phần cộng đúng mức thay đổi.</div>
              {bridgeHtml ? <Html html={bridgeHtml} /> : <p className="pns">Chưa đủ số của cả 2 kỳ (Giờ live, Viewers, ATC trong Live List) để tách nguyên nhân.</p>}
            </div>
            {funnel && <FunnelPanel stages={funnel.stages} ratios={funnel.ratios} band={band} prevShort={`Tháng ${Number(prevMonth.slice(5))}`} />}
          </div>
          {dayFactorHtml && (
            <div className="pn">
              <div className="pnh">Thay đổi các yếu tố theo loại ngày</div>
              <div className="pns">% thay đổi tháng này so với tháng trước; mỗi loại ngày so với chính nó theo lịch Campaign. Viền sáng = vượt ngưỡng dao động.</div>
              <DemoTable html={dayFactorHtml} />
              <div className="legend"><span>Màu xanh: tăng · màu đỏ: giảm · màu xanh dương: {METRIC.liveHours} (do lịch quyết định, không đánh giá tốt hay xấu)</span></div>
            </div>
          )}
          {absHtml && (
            <div className="pn">
              <div className="pnh">Số đo từng loại ngày</div>
              <div className="pns">Mỗi ô tô màu theo mức thay đổi so với tháng trước (xanh tăng, đỏ giảm, đậm hơn khi thay đổi lớn); viền sáng = vượt ngưỡng dao động. Mỗi loại ngày là một nhóm cột {months.map((m) => monthShortLabel(m.month)).join(", ")} cùng màu nhận diện.</div>
              <div className="tw"><table id="dayAbs" className="vt" dangerouslySetInnerHTML={{ __html: absHtml }} /></div>
              <div className="legend"><span>{monthShortLabel(months[0].month)} là mốc, không tô · viền sáng = vượt ngưỡng dao động · xanh dương = {METRIC.liveHours}</span></div>
            </div>
          )}
          {o ? (
            <div className="stk">
              <div className="pn">
                <div className="pnh">Phễu chuyển đổi của live (file overview, cả tháng)</div>
                <div className="pns">Shopee chỉ cho Product Impressions / Product Clicks ở cấp cả tháng, không theo phiên.</div>
                <DemoTable html={overviewHtml} />
                <div className="legend"><span>{METRIC.gpm} {o.gpmPlaced > 0 ? fmtM(o.gpmPlaced) : "—"} · {METRIC.avgViewingDuration} {o.avgViewSec > 0 ? durLabel(o.avgViewSec) : "—"} · {METRIC.pcu} {fmtInt(o.pcu)} · {METRIC.liveNewFollowers} {fmtInt(o.newFollowers)}</span></div>
              </div>
              {sourcesHtml && (
                <div className="pn">
                  <div className="pnh">Nguồn traffic của live</div>
                  <div className="pns">Sales và người xem theo Traffic Source dẫn vào phiên live (file overview).</div>
                  <DemoTable html={sourcesHtml} />
                </div>
              )}
            </div>
          ) : (
            canManage && warnBox(<>Chỉ ops thấy · Chưa có file overview (overview-v2…csv) của tháng — phễu Product Impressions → Clicks → ATC → Orders và nguồn traffic sẽ hiện khi tải lên ở Dữ Liệu Gốc.</>)
          )}
          {insight("why")}
        </section>

        {/* ===== 5 · Sản phẩm & khuyến mãi ===== */}
        {shown.products && (
          <section id="mr-products" className="space-y-4 scroll-mt-16" style={secStyle("products")}>
            <PageHead no={secNo("products")} title={secTitle("products")} headline={heads.products} metrics={productMetrics} />
            <ProductsPageBody
              data={productsData}
              images={(name) => report?.sectionNotes?.[skuImageKey(name)]?.text}
              canManage={canManage}
              onSaveImage={async (name, dataUrl) => onReportChange(await saveMonthlyReportSectionNote(brandId, `${month}-01`, skuImageKey(name), dataUrl, "Shopee"))}
              curDaysLabel={cut != null ? ` (1–${cut}/${month.slice(5)})` : ""}
              prevMonthLabel={prevMonth.slice(5)}
              empty={<p className="text-sm text-center py-6" style={{ color: PAL.muted }}>{fileHint("Product List (…live_product_list…xlsx)")}</p>}
            />
            {s.promo && (
              <DemoPanel title="Khuyến mãi đã nhận" sub="File overview: Shopee chỉ cho số lượng đã nhận; 1 xu quy ra 1 đồng, chưa biết xu do shop hay Shopee tài trợ.">
                <DemoTable html={tbl([METRIC.coinsClaimed, METRIC.shopVoucherClaimed, METRIC.specialLiveVoucherClaimed], [[fmtInt(s.promo.coins), fmtInt(s.promo.vouchers), fmtInt(s.promo.liveVouchers)]])} />
              </DemoPanel>
            )}
            {insight("products")}
          </section>
        )}

        {/* ===== 6 · Host & khung giờ ===== */}
        <section id="mr-people" className="space-y-4 scroll-mt-16" style={secStyle("people")}>
          <PageHead no={secNo("people")} title={secTitle("people")} headline={heads.people} metrics={hostKpis(hostData)} />
          <HostPageBody data={hostData}>
            {canManage && hostQuality.reconciled < hostQuality.total && (
              <div className="mb-3">
                {warnBox(
                  <>
                    {hostQuality.total} phiên Shopee: {hostQuality.reconciled} đã đối soát bằng Live List
                    {hostQuality.manual > 0 ? `, ${hostQuality.manual} số tạm tính` : ""}. Đối soát ở &quot;Vận Hành Live → Đối Soát Số Liệu&quot; trước khi phát hành report.
                  </>
                )}
              </div>
            )}
            {canManage && unassigned && (
              <div className="mb-3">{warnBox(<>{unassigned.sessionCount} ca Shopee chưa gán host ({fmtVndShort(unassigned.gmv)} · {fmtFixed(unassigned.hours, 1)}h) không nằm trong bảng này — gán host cho ca để số về đúng người.</>)}</div>
            )}
          </HostPageBody>
          {insight("people")}
        </section>

        {/* ===== 7 · Quảng cáo (theo phạm vi dịch vụ) ===== */}
        {shown.ads && (
          <section id="mr-ads" className="space-y-4 scroll-mt-16" style={secStyle("ads")}>
            <PageHead
              no={secNo("ads")}
              title={secTitle("ads")}
              headline={heads.ads}
              metrics={
                s.ads
                  ? [
                      { label: METRIC.expense, value: fmtVndShort(s.ads.expense), note: `${s.ads.campaigns} chiến dịch Live Ads` },
                      { label: METRIC.roas, value: s.ads.roas != null ? `${fmtFixed(s.ads.roas, 1)}x` : "—", note: `GMV từ Ads ${fmtVndShort(s.ads.gmv)}` },
                      { label: `${METRIC.expense}/${METRIC.orders}`, value: s.ads.costPerOrder != null ? fmtVndShort(s.ads.costPerOrder) : "—", note: `${fmtInt(s.ads.orders)} ${METRIC.orders} trong file Ads` }
                    ]
                  : []
              }
            />
            {s.ads ? (
              <DemoPanel title="Shopee Live Ads (cả tháng)" sub="File Shopee Live Ads Report — tổng cả tháng theo chiến dịch. Shopee không cho số theo ngày nên chưa tách ROAS theo loại ngày.">
                <DemoTable
                  html={tbl(
                    [METRIC.expense, "GMV từ Ads", "% GMV live", METRIC.roas, METRIC.orders, `${METRIC.expense}/${METRIC.orders}`],
                    [[fmtVndFull(s.ads.expense), fmtVndFull(s.ads.gmv), h.gmv > 0 ? pct((s.ads.gmv / h.gmv) * 100) : "—", s.ads.roas != null ? `${fmtFixed(s.ads.roas, 1)}x` : "—", fmtInt(s.ads.orders), s.ads.costPerOrder != null ? fmtVndFull(s.ads.costPerOrder) : "—"]]
                  )}
                />
              </DemoPanel>
            ) : (
              canManage && warnBox(<>Chưa có file Ads Shopee tháng {month.slice(5)}/{month.slice(0, 4)} trong bản chụp này. Brand có chạy Ads: tải file ở Nhập Ads (sàn Shopee) rồi bấm Cập nhật số liệu. Không chạy Ads thì bỏ qua — brand không thấy dòng này.</>)
            )}
            {insight("ads")}
          </section>
        )}

        {/* ===== 8 · Kế hoạch tháng sau ===== */}
        <section id="mr-next" className="space-y-4 scroll-mt-16" style={secStyle("next")}>
          <PageHead no={secNo("next")} title={secTitle("next")} headline={heads.next} sub={`Hành động tháng ${Number(nextMonth.slice(5))} + kế hoạch từ Kế Hoạch Tháng (sàn Shopee)`} />
          <NextLivePlanPanel
            nextMonth={nextMonth}
            curLabel={String(Number(month.slice(5)))}
            nextLabel={String(Number(nextMonth.slice(5)))}
            rows={SHOPEE_BUCKETS.map((key) => {
              const a = nextAlloc?.find((x) => x.key === key);
              const c = pm.score.find((r) => r.key === key);
              return { key, name: SHOPEE_TAB_LABEL[key], achieved: c?.gmvPerHour ?? null, sessionsCur: c?.sessions ?? 0, plan: a && a.slots > 0 ? { hours: a.hours, target: a.target, slots: a.slots } : undefined };
            })}
            total={{ key: "all", name: "Cả tháng", achieved: scoreAll?.gmvPerHour ?? null, sessionsCur: scoreAll?.sessions ?? 0 }}
            saved={decodeLiveTarget(report?.sectionNotes?.[LIVE_TARGET_MANUAL_KEY]?.text)}
            canEdit={canManage}
            onSave={async (m) => onReportChange(await saveMonthlyReportSectionNote(brandId, `${month}-01`, LIVE_TARGET_MANUAL_KEY, encodeLiveTarget(m), "Shopee"))}
          />
          {insight("next")}
        </section>

        {!showAll && <PagePager prev={curIdx > 0 ? rail[curIdx - 1] : null} next={curIdx < rail.length - 1 ? rail[curIdx + 1] : null} onSelect={goPage} />}
      </div>
    </div>
  );
};
