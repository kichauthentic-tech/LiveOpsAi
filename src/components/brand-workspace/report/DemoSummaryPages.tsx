import React, { useState } from "react";
import { fmtFixed, fmtNum } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import { fmtKeyMetric, KEY_METRICS, type KeyMetricKey } from "../../../lib/report/keyMetrics";
import { KEY_METRICS_TABS, keyMetricsTable, type KeyMetricsMonth, type KeyMetricsTab, type ScoreRow } from "../../../lib/report/brandReport";
import type { BridgePoint, PlanHourRow } from "../../../lib/report/reportVisuals";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { parseRatePct, type RefundTrackRow } from "../../../lib/report/nextMonthPlan";
import { DAY_TYPE_SHORT } from "./theme";
import { columns, fmtP, hbars, pill, tbl, waterfall } from "./demoCharts";
import { DemoHead, DemoKpis, DemoLegend, DemoPage, DemoPanel, DemoStack, DemoTable, Html, pcTone, type DemoKpi } from "./DemoBlocks";

// Ba trang dựng đúng theo bản demo Report Tháng (scratchpad/build/template.html): Tổng quan & KPI (#p1), Key Metrics (#p10),
// Hủy, hoàn & NMV (#p2). Component chỉ nhận số đã tính ở MonthlyReportTabs.tsx và trình bày; không tự tính nghiệp vụ.

const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const pct1 = (v: number) => fmtP(v, 1, false);
// Số tiền theo cách demo viết: B hai số lẻ bỏ số 0 thừa (8,4B · 6,47B), M một số lẻ (822,6M · 741M); chênh lệch trong bảng làm tròn triệu (+53M).
const amt = (v: number) => {
  const a = Math.abs(v);
  const sg = v < 0 ? "−" : "";
  if (a >= 1e9) return sg + fmtNum(a / 1e9, 2) + "B";
  if (a >= 1e6) return sg + fmtNum(a / 1e6, 1) + "M";
  return sg + Math.round(a / 1e3) + "K";
};
const sgnM = (v: number) => (v > 0 ? "+" : "") + (Math.abs(v) >= 1e9 ? amt(v) : (v < 0 ? "−" : "") + Math.round(Math.abs(v) / 1e6) + "M");

// ======================= Trang 1 · Tổng quan & KPI =======================

export interface SummaryDemoProps {
  no: string;
  title: string;
  headline: string;
  /** "YYYY-MM" */
  month: string;
  partial: boolean;
  curEndDay: number;
  prevMonthShort: string;
  prevEndDay: number;
  liveActual: number;
  liveTargetMonth: number | null;
  liveTargetToDate: number | null;
  liveProjected: number | null;
  shop: { actual: number; throughDay: number | null; target: number; projected: number | null; projectedPct: number | null } | null;
  gmvPerHour: number | null;
  gmvPerHourChange: number | null;
  /** Ngưỡng dao động (%) của GMV/giờ cả tháng — đổi trong ngưỡng thì không tô đỏ (khớp Key Metrics). */
  gmvPerHourBand?: number | null;
  hoursChange: number | null;
  bridge: BridgePoint[] | null;
  score: ScoreRow[];
  spans: Partial<Record<CampDayBucket, string>>;
  planHours: PlanHourRow[];
  actualHours: Partial<Record<CampDayBucket, number>>;
  /** Target của ca kế hoạch đã huỷ — nằm trong Target tháng nhưng không nằm trong bảng kế hoạch theo loại ngày. */
  cancelledTarget?: number;
  /** Tên chỉ số doanh số — mặc định LIVE GMV (TikTok); report Shopee truyền "GMV" (Sales(Placed Order)). */
  gmvLabel?: string;
  insight: React.ReactNode;
}

export const SummaryDemoPage: React.FC<SummaryDemoProps> = (p) => {
  const mm = p.month.slice(5);
  const gl = p.gmvLabel ?? METRIC.liveGmv;
  const all = p.score.find((r) => r.key === "all");
  const base = all ? all.targetToDate ?? all.target : null;
  const liveTarget = p.partial ? "Target tới nay" : "Target tháng";
  const shopPct = p.shop && p.shop.target > 0 ? (p.shop.actual / p.shop.target) * 100 : null;
  const kpis: DemoKpi[] = [
    {
      lab: p.partial ? `${gl} · tới ${p.curEndDay}/${mm}` : `${gl} · tháng ${Number(mm)}`,
      val: amt(p.liveActual),
      note: base ? <><span className={`pc ${pcTone((p.liveActual / base) * 100)}`}>{pct1((p.liveActual / base) * 100)}</span> {liveTarget} {amt(base)}</> : (p.gmvLabel ? "chưa có Target" : "chưa có Target LIVE")
    }
  ];
  if (p.partial && p.liveProjected != null) {
    const tm = p.liveTargetMonth;
    kpis.push({
      lab: `Dự báo cuối tháng · ${gl}`,
      val: amt(p.liveProjected),
      note: tm ? <><span className={`pc ${pcTone((p.liveProjected / tm) * 100)}`}>{pct1((p.liveProjected / tm) * 100)}</span> Target tháng {amt(tm)} · {p.liveProjected - tm >= 0 ? "+" : ""}{amt(p.liveProjected - tm)}</> : undefined
    });
  }
  if (p.shop) {
    kpis.push({
      lab: `${METRIC.totalGmv}${p.shop.throughDay ? ` · tới ${p.shop.throughDay}/${mm}` : ""}`,
      val: amt(p.shop.actual),
      note: (
        <>
          {shopPct != null && <span className={`pc ${pcTone(shopPct)}`}>{pct1(shopPct)}</span>} KPI tháng {amt(p.shop.target)}
          {p.shop.projected != null && p.shop.projectedPct != null ? ` · dự báo ${amt(p.shop.projected)} (${fmtP(p.shop.projectedPct, 0, false)})` : ""}
        </>
      )
    });
  }
  if (p.gmvPerHour != null) {
    kpis.push({
      lab: `${METRIC.gmvPerHour} · so với ${p.partial ? `1–${p.prevEndDay}/${p.prevMonthShort.slice(1).padStart(2, "0")}` : p.prevMonthShort}`,
      val: p.gmvPerHourChange != null ? fmtP(p.gmvPerHourChange, 1) : amt(p.gmvPerHour),
      tone: p.gmvPerHourChange != null && p.gmvPerHourChange < 0 && (p.gmvPerHourBand == null || Math.abs(p.gmvPerHourChange) >= p.gmvPerHourBand) ? "red" : undefined,
      note: `${amt(p.gmvPerHour)}${p.hoursChange != null ? ` · ${METRIC.liveHours} ${fmtP(p.hoursChange, 1)}` : ""}${p.gmvPerHourChange != null && p.gmvPerHourBand != null && Math.abs(p.gmvPerHourChange) < p.gmvPerHourBand ? ` · trong ngưỡng ±${Math.round(p.gmvPerHourBand)}%` : ""}`
    });
  }

  // cầu Target → thực tế
  let bridgeHtml = "";
  if (p.bridge && p.bridge.length >= 2) {
    const steps = p.bridge.map((pt, i) =>
      pt.kind === "total"
        ? { l: i === 0 ? liveTarget.replace(" ", "\n") : "Thực tế", v: pt.display, t: "total", txt: amt(pt.display) }
        : { l: pt.label, v: pt.display, t: "delta", txt: (pt.display >= 0 ? "+" : "−") + (Math.abs(pt.display) >= 1e9 ? amt(Math.abs(pt.display)) : Math.round(Math.abs(pt.display) / 1e6) + "M") }
    );
    const totals = steps.filter((s) => s.t === "total").map((s) => s.v);
    let run = 0;
    let peak = 0;
    for (const s of steps) {
      run = s.t === "total" ? s.v : run + s.v;
      peak = Math.max(peak, run);
    }
    bridgeHtml = waterfall(steps, { min: Math.floor((Math.min(...totals) * 0.93) / 1e8) * 1e8, max: Math.ceil((peak * 1.005) / 1e7) * 1e7 });
  }

  // bảng Kết quả so với Target
  const label = (k: ScoreRow["key"]) => (k === "all" ? `${gl} YFB` : k === "shop" ? `KPI ${METRIC.totalGmv}` : `${DAY_TYPE_SHORT[k as CampDayBucket]}${p.spans[k as CampDayBucket] ? ` · ${p.spans[k as CampDayBucket]}` : ""}`);
  const scoreRows = p.score.map((r) => {
    const t = r.targetToDate ?? r.target;
    const d = t != null ? r.actual - t : null;
    return {
      hl: r.key === "all",
      c: [
        label(r.key),
        `<b>${amt(r.actual)}</b>`,
        t != null ? amt(t) : "—",
        d != null ? { t: sgnM(d), c: d >= 0 ? "up" : "dn" } : "—",
        { t: t ? pct1((r.actual / t) * 100) : "—", c: "nt" }
      ]
    };
  });

  // GMV/giờ so với kế hoạch
  const ph = p.planHours.filter((r) => r.planGmvPerHour != null && r.actualGmvPerHour != null);
  // Một ngưỡng duy nhất cho thanh đỏ, câu phụ đề và cột % kế hoạch: dưới 95% kế hoạch mới là "thấp hơn".
  const PLAN_OK = 0.95;
  const below = ph.filter((r) => r.actualGmvPerHour! / r.planGmvPerHour! < PLAN_OK).length;
  const hbMax = Math.ceil((Math.max(...ph.map((r) => Math.max(r.planGmvPerHour!, r.actualGmvPerHour!)), 0) * 1.1) / 1e6) * 1e6;
  const planBars = hbars(
    ph.map((r) => ({
      name: DAY_TYPE_SHORT[r.key],
      sub: `${Math.round(r.planHours)} giờ kế hoạch${p.actualHours[r.key] != null ? ` · ${fmtFixed(p.actualHours[r.key] as number, 1)} giờ thực hiện` : ""}`,
      value: r.actualGmvPerHour! / 1e6,
      mark: r.planGmvPerHour! / 1e6,
      text: `${amt(r.actualGmvPerHour!)} / ${amt(r.planGmvPerHour!)}`,
      cls: r.actualGmvPerHour! / r.planGmvPerHour! < PLAN_OK ? "red" : ""
    })),
    hbMax / 1e6
  );
  const tHours = ph.reduce((a, r) => a + r.planHours, 0);
  const tTarget = ph.reduce((a, r) => a + r.planTarget, 0);
  // GMV/giờ thực tế cả tháng = Σ GMV ÷ Σ giờ THỰC (trọng số giờ thực hiện, khớp bảng Key Metrics); loại ngày thiếu giờ thực thì dùng giờ kế hoạch.
  const actHours = (r: (typeof ph)[number]) => p.actualHours[r.key] ?? r.planHours;
  const tActualHours = ph.reduce((a, r) => a + actHours(r), 0);
  const tActual = ph.reduce((a, r) => a + r.actualGmvPerHour! * actHours(r), 0);
  const planPct = (a: number, b: number) => ({ t: fmtP((a / b) * 100, 0, false), c: (a / b) >= PLAN_OK ? "nt" : "dn" });
  const planRows: any[] = ph.map((r) => [DAY_TYPE_SHORT[r.key], fmtP(r.share * 100, 0, false), amt(r.planTarget), String(Math.round(r.planHours)), amt(r.planGmvPerHour!), amt(r.actualGmvPerHour!), planPct(r.actualGmvPerHour!, r.planGmvPerHour!)]);
  if (tHours > 0) planRows.push({ hl: true, c: ["Cả tháng", "100%", amt(tTarget), String(Math.round(tHours)), amt(tTarget / tHours), amt(tActual / tActualHours), planPct(tActual / tActualHours, tTarget / tHours)] });
  const end = p.partial ? `tới ${p.curEndDay}/${mm}` : `tháng ${Number(mm)}`;

  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={kpis} />
      <DemoStack>
        {bridgeHtml && base != null && (
          <DemoPanel title={`Chênh lệch ${gl} so với ${liveTarget}, theo loại ngày`} sub={`Từ ${liveTarget} (${amt(base)}) đến thực tế (${amt(p.liveActual)}).`}>
            <Html html={bridgeHtml} />
          </DemoPanel>
        )}
        <DemoPanel title="Kết quả so với Target" sub={`Target theo Kế Hoạch Tháng đã chốt; % tính trên Target ${p.partial ? "luỹ kế tới nay" : "tháng"}.${p.shop?.throughDay && p.shop.throughDay !== p.curEndDay ? ` ${gl} tính tới ${p.curEndDay}/${mm}, KPI ${METRIC.totalGmv} tính tới ${p.shop.throughDay}/${mm} (ngày cuối file Shop Analytics).` : ""}`}>
          <DemoTable html={tbl(["", "Thực tế", p.partial ? "Target tới nay" : "Target", "Chênh lệch", "% Target"], scoreRows)} />
        </DemoPanel>
      </DemoStack>
      {ph.length > 0 && (
        <>
          <DemoPanel
            title={`${METRIC.gmvPerHour} so với kế hoạch tháng ${Number(mm)}, theo loại ngày`}
            sub={`Thanh = thực tế ${end} · vạch trắng = kế hoạch.${below === ph.length ? ` Cả ${ph.length === 4 ? "bốn" : ph.length} loại ngày đều dưới 95% ${METRIC.gmvPerHour} kế hoạch.` : below > 0 ? ` ${below}/${ph.length} loại ngày dưới 95% ${METRIC.gmvPerHour} kế hoạch.` : ` Cả ${ph.length} loại ngày đạt từ 95% ${METRIC.gmvPerHour} kế hoạch.`}`}
          >
            <Html className="hb" html={planBars} />
          </DemoPanel>
          <DemoPanel title={`Kế hoạch tháng ${Number(mm)} theo loại ngày`}>
            <DemoTable html={tbl(["Loại ngày", "Phân bổ", "Target GMV", "Giờ kế hoạch", `${METRIC.gmvPerHour} kế hoạch`, "Thực tế", "% kế hoạch"], planRows)} />
            {p.cancelledTarget != null && p.cancelledTarget > 0 && (
              <DemoLegend>
                <span>Target tháng {p.liveTargetMonth != null ? amt(p.liveTargetMonth) : ""} gồm {amt(p.cancelledTarget)} của ca kế hoạch đã huỷ (giữ target, không có giờ kế hoạch) nên lớn hơn tổng bảng này {amt(tTarget)}.</span>
              </DemoLegend>
            )}
          </DemoPanel>
        </>
      )}
      {p.insight}
    </DemoPage>
  );
};

// ======================= Trang 10 · Key Metrics =======================

// Thứ tự dòng và tiêu đề nhóm đúng bản demo (KMD / GROUPS).
const KM_ORDER: { grp?: string; key: KeyMetricKey }[] = [
  { grp: "Kết quả", key: "gmv" }, { key: "itemsSold" }, { key: "orders" }, { key: "hours" }, { key: "gmvPerHour" },
  { grp: "Lưu lượng", key: "err" }, { key: "avgViewSec" }, { key: "views" }, { key: "impressions" }, { key: "viewsPerHour" }, { key: "impressionsPerHour" },
  { grp: "Chuyển đổi", key: "productImpressions" }, { key: "productClicks" }, { key: "ctr" }, { key: "liveCtr" }, { key: "ctor" },
  { grp: "Giỏ hàng", key: "upt" }, { key: "avgPrice" }, { key: "aov" }
];
const TAB_NAME: Record<KeyMetricsTab, string> = { all: "Cả tháng", ...DAY_TYPE_SHORT };

export const KeyMetricsDemoPage: React.FC<{
  no: string;
  title: string;
  headline: string;
  months: KeyMetricsMonth[];
  /** Direct ÷ (Direct + Indirect) của Seller LIVE, điểm %, từng tab × từng tháng (cùng thứ tự `months`). */
  directShare?: Record<KeyMetricsTab, (number | null)[]>;
  /** CV GMV/giờ một phiên dùng cho ngưỡng dao động; `cvMeasured` = đo trên phiên của brand (không phải mặc định CROCS). */
  cv?: number;
  cvMeasured?: boolean;
  monthLabel: (m: string) => string;
  /** "1–26" khi tháng còn dở. */
  windowNote?: string;
  insight: React.ReactNode;
}> = ({ no, title, headline, months, directShare, cv, cvMeasured, monthLabel, windowNote, insight }) => {
  const [tab, setTab] = useState<KeyMetricsTab>("all");
  const last = months.length - 1;
  const table = keyMetricsTable(months, tab, cv);
  const byKey = new Map(table.rows.map((r) => [r.def.key, r]));
  const rows: any[] = [];
  for (const o of KM_ORDER) {
    const r = byKey.get(o.key);
    if (!r) continue;
    if (o.grp) rows.push({ grp: o.grp });
    rows.push([
      r.def.label,
      ...r.values.map((v) => fmtKeyMetric(r.def, v)),
      ...r.changes.slice(1).map((c, i) => {
        if (c == null) return "—";
        const neutral = o.key === "hours" || r.tones[i + 1] === "noise";
        return { t: fmtP(c, 0), c: neutral ? "nt" : c > 0 ? "up" : "dn" };
      })
    ]);
  }
  const share = directShare?.[tab];
  if (share) {
    rows.push({ grp: "Direct vs Indirect" });
    rows.push([
      `${METRIC.directGmv} % (Seller LIVE)`,
      ...share.map((v) => (v == null ? "—" : fmtP(v, 1, false))),
      // Chênh tính bằng điểm %, không tô xanh/đỏ: Direct giảm mà Attributed GMV tăng chưa phải xấu.
      ...share.slice(1).map((v, i) => {
        const a = share[i];
        return v == null || a == null ? "—" : { t: `${v - a < 0 ? "−" : "+"}${fmtFixed(Math.abs(v - a), 1)} điểm`, c: "nt" };
      })
    ]);
  }
  const head = [
    "Chỉ số",
    ...months.map((m) => monthLabel(m.month)),
    ...months.slice(1).map((m, i) => `${monthLabel(m.month)} so ${monthLabel(months[i].month)} (${table.bands[i + 1] == null ? "—" : "±" + Math.round(table.bands[i + 1]!) + "%"})`)
  ];
  const sessionsLine = months.map((m) => m.stats[tab].sessions).join(" → ");
  return (
    <DemoPage>
      <DemoHead no={no} title={title} headline={headline} />
      <DemoPanel
        title={`${KEY_METRICS.length} chỉ số, ${months.length === 3 ? "ba" : months.length} tháng ${windowNote ? `cùng kỳ ${windowNote}` : "cả tháng"}`}
        sub={`Màu xanh / đỏ khi thay đổi vượt ngưỡng dao động của tab đó${cv != null ? ` (độ lệch GMV/giờ mỗi phiên ±${Math.round(cv * 100)}%, ${cvMeasured ? "đo trên phiên của brand" : "mức mặc định, chưa đủ phiên để đo riêng"})` : ""}. ${METRIC.liveHours} không đánh giá tốt hay xấu.`}
      >
        <div className="tabs" role="tablist">
          {KEY_METRICS_TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? "seg-on" : undefined} onClick={() => setTab(t)}>
              {TAB_NAME[t]} · {months[last].stats[t].sessions} phiên
            </button>
          ))}
        </div>
        <DemoTable html={tbl(head, rows)} id="km" />
        <DemoLegend>
          {directShare && <span>Dòng Direct vs Indirect lấy từ file Shop Analytics, tính trên mọi phiên của tài khoản shop.</span>}
          <span>{windowNote ? `Cùng kỳ ${windowNote} mỗi tháng` : "Cả tháng"} · số phiên {months.map((m) => monthLabel(m.month)).join(" → ")}: {sessionsLine} phiên</span>
        </DemoLegend>
      </DemoPanel>
      {insight}
    </DemoPage>
  );
};

// ======================= Trang 2 · Hủy, hoàn & NMV =======================

export interface NmvMonth {
  month: string;
  /** "T8" */
  short: string;
  /** "1–25/08" — cửa sổ so sánh cùng kỳ của cả shop. */
  win: string;
  /** LIVE GMV YFB trong cửa sổ ngày của cơ cấu kênh (cùng cửa sổ với shop) — dùng cho Tỷ trọng YFB. */
  liveGmv: number;
  /** LIVE GMV YFB cùng số ngày với trang 1 (demo tính NMV trên số này). */
  nmvGmv: number;
  /** Refund rate toàn shop trong cửa sổ (%). */
  windowRate: number | null;
  /** Refund rate cả tháng / tới nay (%) — số "Trong report" của bảng theo dõi. */
  fileRate: number | null;
  template: "old" | "new" | "unknown";
  exportedAt: string | null;
  status: "final" | "provisional";
  shopGmv: number;
  affiliate: number;
  video: number;
  card: number | null;
}

export const NmvDemoPage: React.FC<{
  no: string;
  title: string;
  headline: string;
  /** Cũ → mới, tháng cuối là tháng của report. */
  months: NmvMonth[];
  /** Tỷ lệ hoàn dùng để trừ NMV của tháng report (đã chọn ở chooseNmvRate). */
  nmvRate: number | null;
  curEndDay: number;
  /** @deprecated NMV tính cùng cửa sổ với Refund rate (curEndDay); giữ để không vỡ chỗ gọi cũ. */
  nmvEndDay?: number;
  track: RefundTrackRow[];
  finalDates: Record<string, string>;
  canManage: boolean;
  onSaveFinal: (month: string, rate: number | null) => Promise<void>;
  onSaveDate: (month: string, date: string | null) => Promise<void>;
  /** Nguồn tỷ lệ hoàn đang trừ vào NMV tháng report (chooseNmvRate); null = dùng Refund rate toàn shop cùng kỳ. */
  nmvSource?: string | null;
  insight: React.ReactNode;
}> = ({ no, title, headline, months, nmvRate, nmvSource, curEndDay, track, finalDates, canManage, onSaveFinal, onSaveDate, insight }) => {
  const [msg, setMsg] = useState("");
  const cur = months[months.length - 1];
  if (!cur) return null;
  const old = (m: NmvMonth) => m.template === "old";
  const fileTag = (m: NmvMonth) => (m.exportedAt ? `file xuất ${dm(m.exportedAt)}` : "");
  const prev = months[months.length - 2];
  const prev2 = months[months.length - 3];
  const rateOf = (m: NmvMonth) => (m === cur && nmvRate != null ? nmvRate : m.windowRate);
  const curProv = cur.status !== "final";
  const nmv0 = rateOf(cur) != null ? cur.nmvGmv * (1 - rateOf(cur)! / 100) : null;
  const mm = cur.month.slice(5);
  const kpis: DemoKpi[] = [
    {
      lab: `NMV ${curProv ? "ước tính tạm" : "ước tính"} · 1–${curEndDay}/${mm}`,
      val: nmv0 != null ? amt(nmv0) : "—",
      note: rateOf(cur) != null ? `${METRIC.liveGmv} ${amt(cur.nmvGmv)} × (1 − ${fmtP(rateOf(cur)!, 2, false)})` : "chưa có Refund rate"
    },
    {
      lab: `${METRIC.refundRate} ${curProv ? "tạm tính" : "chốt"} · 1–${curEndDay}/${mm}`,
      val: cur.windowRate != null ? pct1(cur.windowRate) : "—",
      tone: curProv ? "gold" : undefined,
      note: curProv ? "chưa chốt: đơn còn trong thời gian hoàn trả" : "đã chốt"
    }
  ];
  for (const m of [prev, prev2]) {
    if (!m) continue;
    kpis.push({
      lab: `${METRIC.refundRate} tháng ${Number(m.month.slice(5))}${m.exportedAt ? ` · ${fileTag(m)}` : ""}`,
      val: m.fileRate != null ? pct1(m.fileRate) : "—",
      tone: old(m) ? "muted" : undefined,
      note: `${m.win}${m.windowRate != null ? `: ${pct1(m.windowRate)}` : ""}${old(m) ? " · cần tải lại file để so sánh" : ""}`
    });
  }

  // NMV tách phần hoàn (chưa có đơn hủy)
  const shown = months.slice(-3).filter((m) => rateOf(m) != null && m.nmvGmv > 0);
  const mx = Math.max(...shown.map((m) => m.nmvGmv), 1) * 1.05;
  const nmvHtml = shown
    .map((m) => {
      const r = rateOf(m)! / 100;
      const nmv = m.nmvGmv * (1 - r);
      const ref = m.nmvGmv * r;
      const isCur = m === cur;
      const tail = old(m) || (!isCur && m.exportedAt) ? ` · ${fileTag(m)}` : isCur && curProv ? " · tạm tính, chưa chốt" : "";
      const rateNote = isCur && nmvSource && nmvRate != null ? ` · tỷ lệ ${nmvSource}` : "";
      return `<div class="nm">Tháng ${Number(m.month.slice(5))}<small>${METRIC.liveGmv} ${amt(m.nmvGmv)} · hoàn ${pct1(r * 100)}${tail}${rateNote}</small></div>
    <div class="trk" style="height:26px${old(m) ? ";opacity:.45" : ""}"><div class="fill stk" style="width:${(nmv / mx) * 100}%"></div><div class="fill stk red" style="left:${(nmv / mx) * 100}%;width:${(ref / mx) * 100}%;opacity:.7"></div></div>
    <div class="v">NMV ${amt(nmv)}${isCur && curProv ? " (tạm)" : ""}</div>`;
    })
    .join("");

  // Refund rate toàn shop theo tháng
  const rr = months.filter((m) => m.windowRate != null);
  const rrMax = Math.max(...rr.map((m) => m.windowRate!), 1);
  const refundHtml = columns(
    rr.map((m) => ({ l: `${m.win}\n${m === cur && curProv ? "tạm tính" : fileTag(m)}`.trim(), v: [m.windowRate!], colors: old(m) ? ["#55555d"] : undefined })),
    [{ color: "var(--gold)" }],
    { min: 0, max: Math.ceil((rrMax * 1.2) / 5) * 5, h: 240, fmt: (v: number) => fmtP(v, 1, false) }
  );
  const byFile = new Map<string, string[]>();
  for (const m of rr) {
    const k = m.exportedAt ? dm(m.exportedAt) : "";
    byFile.set(k, [...(byFile.get(k) ?? []), m.short]);
  }
  const fileNote = [...byFile.entries()].filter(([k]) => k).map(([k, ms]) => `${ms.join(", ")} từ file xuất ${k}`).join("; ");
  const anyOld = months.some(old);

  // Total GMV và cơ cấu kênh
  const mixRows = months
    .filter((m) => m.shopGmv > 0)
    .map((m) => {
      const isCur = m === cur;
      const r = m.windowRate;
      return {
        hl: isCur,
        c: [
          `${m.win}${m.exportedAt ? ` · ${fileTag(m)}` : ""}`,
          amt(m.shopGmv),
          fmtP((m.liveGmv / m.shopGmv) * 100, 2, false),
          amt(m.affiliate),
          amt(m.video),
          m.card != null ? amt(m.card) : "—",
          r == null ? "—" : old(m) ? { t: fmtP(r, 2, false), c: "nt" } : `${fmtP(r, 2, false)}${isCur && curProv ? " (tạm tính)" : ""}`
        ]
      };
    });

  const save = async (fn: () => Promise<void>) => {
    setMsg("");
    try {
      await fn();
      setMsg("Đã lưu");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Lưu thất bại");
    }
  };
  const trackRows = track.slice(-3);

  return (
    <DemoPage>
      <DemoHead no={no} title={title} headline={headline} />
      <DemoKpis items={kpis} />
      <DemoStack>
        {shown.length > 0 && (
          <DemoPanel
            title={`${METRIC.liveGmv} tách thành NMV ước tính và phần hoàn ước tính`}
            sub={`1–${curEndDay} mỗi tháng (cùng cửa sổ với Refund rate, tới ngày cuối file Shop Analytics) · phần hoàn = ${METRIC.liveGmv} × ${METRIC.refundRate} toàn shop (áp cho livestream, chưa gồm đơn hủy). Các tháng trước dùng tỷ lệ tại ngày xuất file${nmvSource ? `; tháng này dùng tỷ lệ ${nmvSource}` : ""}.${anyOld ? " Thanh mờ = Refund rate từ file xuất sớm hơn, chưa so sánh được." : ""}`}
          >
            <Html className="hb" html={nmvHtml} />
            <DemoLegend>
              <span><i style={{ background: "var(--gold)" }} />NMV ước tính</span>
              <span><i style={{ background: "var(--red)", opacity: 0.7 }} />Hoàn ước tính</span>
            </DemoLegend>
          </DemoPanel>
        )}
        {rr.length > 0 && (
          <DemoPanel title={`${METRIC.refundRate} toàn shop`} sub={`Refunds ÷ ${METRIC.totalGmv}, 1–${curEndDay} mỗi tháng.${fileNote ? ` Cột ${fileNote}.` : ""}`}>
            <Html html={refundHtml} />
          </DemoPanel>
        )}
      </DemoStack>
      <DemoPanel
        title={`Theo dõi ${METRIC.refundRate} chính xác theo tháng`}
        sub={`Nhập ${METRIC.refundRate} chốt sau khi tải lại file Shop Analytics khi hết thời gian hoàn trả. Trạng thái và chênh lệch so với số trong report tự cập nhật.${canManage ? " Giá trị nhập lưu cho cả team." : ""}`}
      >
        <div className="tw">
          <table id="rrTbl">
            <thead>
              <tr>
                <th>Tháng</th>
                <th className="w" style={{ minWidth: 120 }}>Phạm vi và file</th>
                <th>Trong report</th>
                <th>Trạng thái</th>
                <th>Chốt (%)</th>
                <th>Ngày chốt</th>
                <th>Chênh lệch</th>
              </tr>
            </thead>
            <tbody>
              {trackRows.map((r) => {
                const isCur = r.month === cur.month;
                const fin = r.finalRate;
                const diff = fin != null && r.fileRate != null ? fin - r.fileRate : null;
                const date = finalDates[r.month] ?? "";
                return (
                  <tr key={`${r.month}-${fin ?? ""}-${date}`}>
                    <td>Tháng {Number(r.month.slice(5))}</td>
                    <td className="w" style={{ minWidth: 120 }}>{isCur ? `1–${curEndDay}/${r.month.slice(5)}` : "Cả tháng"}{r.exportedAt ? ` · file xuất ${dm(r.exportedAt)}` : ""}</td>
                    <td>{r.fileRate != null ? fmtP(r.fileRate, 2, false) : "—"}</td>
                    <td dangerouslySetInnerHTML={{ __html: fin != null || r.status === "final" ? pill("đã chốt", "g") : pill("tạm tính", "y") }} />
                    <td>
                      {canManage ? (
                        <input
                          className="rr"
                          inputMode="decimal"
                          placeholder="vd 22,50"
                          defaultValue={fin != null ? fmtFixed(fin, 2) : ""}
                          aria-label={`${METRIC.refundRate} chốt tháng ${Number(r.month.slice(5))}`}
                          onBlur={(e) => {
                            const raw = e.currentTarget.value.trim();
                            if (!raw) return void (fin != null && save(() => onSaveFinal(r.month, null)));
                            const v = parseRatePct(raw);
                            if (v == null) return setMsg(`Chưa đọc được tỷ lệ "${raw}" — gõ số 0–100, ví dụ 37,5.`);
                            if (v !== fin) void save(() => onSaveFinal(r.month, v));
                          }}
                        />
                      ) : fin != null ? fmtP(fin, 2, false) : "—"}
                    </td>
                    <td>
                      {canManage ? (
                        <input className="rr" style={{ width: 128 }} type="date" defaultValue={date} aria-label={`Ngày chốt tháng ${Number(r.month.slice(5))}`} onChange={(e) => void save(() => onSaveDate(r.month, e.currentTarget.value || null))} />
                      ) : date ? dm(date) : "—"}
                    </td>
                    <td className={diff == null ? "nt" : Math.abs(diff) > 1 ? "dn" : "up"}>{diff == null ? "—" : `${diff >= 0 ? "+" : "−"}${fmtFixed(Math.abs(diff), 2)} điểm`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DemoLegend>
          <span>{METRIC.refundRate} chỉ gồm giá trị hoàn tiền, chưa gồm đơn hủy; tỷ lệ hủy cần file Order. Chênh lệch tính bằng điểm phần trăm.</span>
          <span className="st" aria-live="polite">{msg}</span>
        </DemoLegend>
      </DemoPanel>
      <DemoPanel title={`${METRIC.totalGmv} và cơ cấu kênh, 1–${curEndDay} mỗi tháng`}>
        <DemoTable html={tbl(["Kỳ", METRIC.totalGmv, "Tỷ trọng YFB", "Affiliate LIVE", "Video", "Product card", METRIC.refundRate], mixRows)} />
        <details>
          <summary>Phương pháp</summary>
          <p>
            NMV ước tính = {METRIC.liveGmv} YFB × (1 − {METRIC.refundRate} toàn shop), nguồn Shop Analytics. Tỷ lệ này tính trên mọi kênh của shop, chưa tách riêng livestream, nên chỉ là xấp xỉ. Với tháng đang chạy, {METRIC.refundRate} chưa chốt nên NMV chỉ là ước tính tạm. {METRIC.refundRate} chỉ gồm giá trị hoàn tiền, chưa gồm đơn hủy (cần file Order), nên NMV thực tế còn thấp hơn.
          </p>
        </details>
      </DemoPanel>
      {insight}
    </DemoPage>
  );
};
