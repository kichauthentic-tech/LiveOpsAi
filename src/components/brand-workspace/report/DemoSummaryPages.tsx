import React, { useState } from "react";
import { fmtFixed, fmtNum } from "../../../lib/format";
import { CHANNEL, METRIC, metricFor } from "../../../lib/metricGlossary";
import { fmtKeyMetric, KEY_METRIC_GROUPS, KEY_METRICS, type KeyMetricKey } from "../../../lib/report/keyMetrics";
import { KEY_METRICS_TABS, keyMetricsTable, type KeyMetricsMonth, type KeyMetricsTab, type ScoreRow } from "../../../lib/report/brandReport";
import type { BridgePoint, PlanHourRow } from "../../../lib/report/reportVisuals";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { parseRatePct, type RefundTrackRow } from "../../../lib/report/nextMonthPlan";
import { DAY_TYPE_SHORT } from "./theme";
import { columns, fmtP, hbars, pill, tbl, waterfall } from "./demoCharts";
import { DemoHead, DemoKpis, DemoLegend, DemoPage, DemoPanel, DemoStack, DemoTable, Html, pcTone, type DemoKpi } from "./DemoBlocks";
import { byLang, t, monthLong } from "../../../lib/displayLang";

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
  /** Sàn của số — quyết định tên doanh số (TikTok GMV / Shopee Sales). Vắng = TikTok. */
  platform?: "Shopee";
  /** Có thì trang dựng theo kiểu "Tổng quan cả shop" (4 ô + GMV theo kênh + target theo loại ngày); vắng (Shopee) thì giữ bố cục cũ. */
  channels?: { throughDay: number; cur: ChannelSplit; prev: ChannelSplit | null };
  /** Tên kênh theo sàn (Shopee dùng đúng chữ Seller Centre); vắng = tên TikTok. */
  channelNames?: ChannelNames;
  insight: React.ReactNode;
}

export interface ChannelNames { total: string; live: string; sellerLive: string; affiliateLive: string; video: string; card: string }
const TIKTOK_CHANNEL_NAMES: ChannelNames = { total: METRIC.totalGmv, live: "LIVE", sellerLive: CHANNEL.sellerLive, affiliateLive: CHANNEL.affiliateLive, video: CHANNEL.video, card: CHANNEL.productCard };

/** GMV cả shop và 4 kênh của một kỳ (cùng ngày trong tháng) — lib/report/monthlyReportInsights.ts ChannelMix. */
export interface ChannelSplit {
  shopGmv: number;
  liveLinked: number;
  affiliate: number;
  video: number;
  card: number | null;
}

const CH_COLOR = { sellerLive: "#e0b43c", affiliate: "#d95926", video: "#199e70", card: "#3987e5" };

const ChannelDonut: React.FC<{ parts: { color: string; v: number }[]; total: number; center: string; label: string }> = ({ parts, total, center, label }) => {
  const R = 62;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label={`${label} ${t("theo kênh", "by channel")}`} style={{ flex: "none" }}>
      <circle cx="80" cy="80" r={R} fill="none" stroke="var(--line)" strokeWidth="22" />
      {parts.map((s, i) => {
        const len = total > 0 ? (s.v / total) * C : 0;
        const el = <circle key={i} cx="80" cy="80" r={R} fill="none" stroke={s.color} strokeWidth="22" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />;
        acc += len;
        return el;
      })}
      <text x="80" y="76" textAnchor="middle" fontSize="11" fill="var(--muted)">{label}</text>
      <text x="80" y="96" textAnchor="middle" fontSize="18" fontWeight="900" fill="var(--cream)">{center}</text>
    </svg>
  );
};

export const SummaryDemoPage: React.FC<SummaryDemoProps> = (p) => {
  const METRIC = metricFor(p.platform);
  const mm = p.month.slice(5);
  const gl = p.gmvLabel ?? METRIC.liveGmv;
  const all = p.score.find((r) => r.key === "all");
  const base = all ? all.targetToDate ?? all.target : null;
  const liveTarget = p.partial ? t("Target tới nay", "Target to date") : t("Target tháng", "Monthly target");
  const upTo = (d: number) => t(`tới ${d}/${mm}`, `to ${d}/${mm}`);
  const monthN = t(`tháng ${Number(mm)}`, monthLong(Number(mm)));
  const kpis: DemoKpi[] = [
    {
      lab: p.partial ? `${gl} · ${upTo(p.curEndDay)}` : `${gl} · ${monthN}`,
      val: amt(p.liveActual),
      note: base ? <><span className={`pc ${pcTone((p.liveActual / base) * 100)}`}>{pct1((p.liveActual / base) * 100)}</span> {liveTarget} {amt(base)}</> : (p.gmvLabel ? t("chưa có Target", "no Target yet") : t("chưa có Target LIVE", "no LIVE Target yet"))
    }
  ];
  // Giờ live thực hiện so với giờ cam kết trong Kế Hoạch Tháng (cả tháng; ca đã huỷ không có giờ kế hoạch).
  const planHoursMonth = p.planHours.reduce((a, r) => a + r.planHours, 0);
  const doneHours = Object.values(p.actualHours).reduce((a: number, v) => a + (v ?? 0), 0);
  const daysInMonth = new Date(Number(p.month.slice(0, 4)), Number(mm), 0).getDate();
  const timePct = p.partial ? (p.curEndDay / daysInMonth) * 100 : 100;
  if (planHoursMonth > 0) {
    const hp = (doneHours / planHoursMonth) * 100;
    kpis.push({
      lab: `${METRIC.liveHours} · ${p.partial ? upTo(p.curEndDay) : monthN}`,
      val: `${fmtFixed(doneHours, 1)}h`,
      note: <><span className={`pc ${pcTone(p.partial ? (hp / timePct) * 100 : hp)}`}>{pct1(hp)}</span> {t("kế hoạch tháng", "of monthly plan")} {Math.round(planHoursMonth)}h{p.partial ? t(` · đã qua ${pct1(timePct)} thời gian`, ` · ${pct1(timePct)} of the month elapsed`) : ""}</>
    });
  } else {
    kpis.push({ lab: `${METRIC.liveHours} · ${p.partial ? upTo(p.curEndDay) : monthN}`, val: `${fmtFixed(doneHours, 1)}h`, note: t("chưa có giờ kế hoạch", "no planned hours yet") });
  }
  // Chip 3 = đích cuối tháng (một mẫu số duy nhất: Target tháng); chip 4 = nhịp mỗi ngày cần so với đang đạt — hai ý khác nhau, không lặp.
  const tm = p.liveTargetMonth;
  const daysLeft = daysInMonth - (p.partial ? p.curEndDay : daysInMonth);
  if (tm) {
    const left = tm - p.liveActual;
    if (p.partial && p.liveProjected != null) {
      const pp = (p.liveProjected / tm) * 100;
      kpis.push({ lab: `${t("Dự báo cuối tháng", "Month-end projection")} · ${gl}`, val: amt(p.liveProjected), note: <><span className={`pc ${pcTone(pp)}`}>{pct1(pp)}</span> {t("Target tháng", "of monthly Target")} {amt(tm)}</> });
    } else if (p.partial) {
      kpis.push({ lab: t("Còn thiếu so Target tháng", "Remaining to monthly Target"), val: left > 0 ? amt(left) : t("Đã đạt", "Achieved"), tone: left > 0 ? undefined : "green", note: `${t("Target tháng", "Monthly Target")} ${amt(tm)}` });
    } else {
      kpis.push({ lab: `${t(`Target tháng ${Number(mm)}`, `${monthLong(Number(mm))} Target`)} · ${gl}`, val: pct1((p.liveActual / tm) * 100), note: `Target ${amt(tm)} · ${left <= 0 ? t("vượt", "above by") : t("thiếu", "short by")} ${amt(Math.abs(left))}` });
    }
    if (p.partial && daysLeft > 0 && left > 0) {
      kpis.push({ lab: t("Cần mỗi ngày còn lại", "Needed per remaining day"), val: `${amt(left / daysLeft)}/${t("ngày", "day")}`, note: t(`${daysLeft} ngày còn lại · đang đạt ${amt(p.liveActual / p.curEndDay)}/ngày`, `${daysLeft} days left · currently ${amt(p.liveActual / p.curEndDay)}/day`) });
    }
  }

  // cầu Target → thực tế
  let bridgeHtml = "";
  if (p.bridge && p.bridge.length >= 2) {
    const steps = p.bridge.map((pt, i) =>
      pt.kind === "total"
        ? { l: i === 0 ? liveTarget.replace(" ", "\n") : t("Thực tế", "Actual"), v: pt.display, t: "total", txt: amt(pt.display) }
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

  // bảng Kết quả so với Target. Chênh lệch theo loại ngày đã ở biểu đồ cầu ngay trên ⇒ cột Chênh lệch chỉ giữ khi không có cầu
  // (riêng dòng KPI Total GMV không nằm trong cầu nên ghi chênh ngay cạnh Target của dòng đó).
  const showGapCol = !(bridgeHtml && base != null);
  const label = (k: ScoreRow["key"]) => (k === "all" ? `${gl} YFB` : k === "shop" ? `KPI ${METRIC.totalGmv}` : `${DAY_TYPE_SHORT[k as CampDayBucket]}${p.spans[k as CampDayBucket] ? ` · ${p.spans[k as CampDayBucket]}` : ""}`);
  const scoreRows = p.score.map((r) => {
    const t = r.targetToDate ?? r.target;
    const d = t != null ? r.actual - t : null;
    return {
      hl: r.key === "all",
      c: [
        label(r.key),
        `<b>${amt(r.actual)}</b>`,
        t != null ? amt(t) + (!showGapCol && r.key === "shop" && d != null ? ` (${sgnM(d)})` : "") : "—",
        ...(showGapCol ? [d != null ? { t: sgnM(d), c: d >= 0 ? "up" : "dn" } : "—"] : []),
        { t: t ? pct1((r.actual / t) * 100) : "—", c: "nt" }
      ]
    };
  });

  // GMV/giờ so với kế hoạch
  const ph = p.planHours.filter((r) => r.planGmvPerHour != null && r.actualGmvPerHour != null);
  // Một ngưỡng duy nhất cho thanh đỏ, câu phụ đề và cột % kế hoạch: dưới 95% kế hoạch mới là "thấp hơn".
  const PLAN_OK = 0.95;
  const below = ph.filter((r) => r.actualGmvPerHour! / r.planGmvPerHour! < PLAN_OK).length;
  const tHours = ph.reduce((a, r) => a + r.planHours, 0);
  const tTarget = ph.reduce((a, r) => a + r.planTarget, 0);
  // GMV/giờ thực tế cả tháng = Σ GMV ÷ Σ giờ THỰC (trọng số giờ thực hiện, khớp bảng Key Metrics); loại ngày thiếu giờ thực thì dùng giờ kế hoạch.
  const actHours = (r: (typeof ph)[number]) => p.actualHours[r.key] ?? r.planHours;
  const tActualHours = ph.reduce((a, r) => a + actHours(r), 0);
  const tActual = ph.reduce((a, r) => a + r.actualGmvPerHour! * actHours(r), 0);
  // Thực tế và % kế hoạch chỉ ở biểu đồ (gồm thanh Cả tháng); bảng bên dưới chỉ còn phần kế hoạch — audit trùng lặp 30/10.
  const bars = ph.map((r) => ({ name: DAY_TYPE_SHORT[r.key], planH: r.planHours, actH: p.actualHours[r.key], act: r.actualGmvPerHour!, plan: r.planGmvPerHour! }));
  if (tHours > 0 && ph.length > 1) bars.push({ name: t("Cả tháng", "Whole month"), planH: tHours, actH: tActualHours, act: tActual / tActualHours, plan: tTarget / tHours });
  const hbMax = Math.ceil((Math.max(...bars.map((r) => Math.max(r.plan, r.act)), 0) * 1.1) / 1e6) * 1e6;
  const planBars = hbars(
    bars.map((r) => ({
      name: r.name,
      sub: t(`${Math.round(r.planH)} giờ kế hoạch${r.actH != null ? ` · ${fmtFixed(r.actH, 1)} giờ thực hiện` : ""}`, `${Math.round(r.planH)} planned hours${r.actH != null ? ` · ${fmtFixed(r.actH, 1)} hours delivered` : ""}`),
      value: r.act / 1e6,
      mark: r.plan / 1e6,
      text: `${amt(r.act)} / ${amt(r.plan)} · ${fmtP((r.act / r.plan) * 100, 0, false)}`,
      cls: r.act / r.plan < PLAN_OK ? "red" : ""
    })),
    hbMax / 1e6
  );
  const planRows: any[] = ph.map((r) => [DAY_TYPE_SHORT[r.key], fmtP(r.share * 100, 0, false), amt(r.planTarget), String(Math.round(r.planHours)), amt(r.planGmvPerHour!)]);
  if (tHours > 0) planRows.push({ hl: true, c: [t("Cả tháng", "Whole month"), "100%", amt(tTarget), String(Math.round(tHours)), amt(tTarget / tHours)] });
  const end = p.partial ? upTo(p.curEndDay) : monthN;

  if (p.channels) {
    const { cur, prev, throughDay } = p.channels;
    const N = p.channelNames ?? TIKTOK_CHANNEL_NAMES;
    const chg = (v: number | null | undefined) =>
      v == null ? null : <span style={{ color: v >= 0 ? "var(--green)" : "var(--red)" }}>{v >= 0 ? "+" : "−"}{fmtNum(Math.abs(v), 1)}%</span>;
    const growth = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a > 0 ? (b / a - 1) * 100 : null);
    const vs = `${t("so với", "vs")} ${p.prevMonthShort}`;
    const planGph = tHours > 0 ? tTarget / tHours : null;
    const shopActual = p.shop?.actual ?? cur.shopGmv;
    const tiles: DemoKpi[] = [
      {
        lab: `${N.total} · ${upTo(throughDay)}`,
        val: amt(shopActual),
        note: (
          <>
            {p.shop && <><span className={`pc ${pcTone((p.shop.actual / p.shop.target) * 100)}`}>{pct1((p.shop.actual / p.shop.target) * 100)} KPI {amt(p.shop.target)}</span>{p.shop.projected != null ? `${t("dự báo", "projected")} ${amt(p.shop.projected)} · ` : ""}</>}
            {chg(growth(prev?.shopGmv, cur.shopGmv))} {vs}
          </>
        )
      },
      {
        lab: `${gl} · ${upTo(p.curEndDay)}`,
        val: amt(p.liveActual),
        note: (
          <>
            {base ? <span className={`pc ${pcTone((p.liveActual / base) * 100)}`}>{pct1((p.liveActual / base) * 100)} {t("target tới nay", "of target to date")}</span> : null}
            {p.liveTargetMonth ? `${t("target tháng", "monthly target")} ${amt(p.liveTargetMonth)}${p.liveProjected != null ? ` · ${t("dự báo", "projected")} ${amt(p.liveProjected)}` : ""}` : t("chưa có Target LIVE", "no LIVE Target yet")}
          </>
        )
      },
      {
        lab: `${METRIC.liveHours} · ${upTo(p.curEndDay)}`,
        val: `${fmtFixed(doneHours, 1)}h`,
        note: planHoursMonth > 0 ? (
          <>
            <span className={`pc ${pcTone(((doneHours / planHoursMonth) * 100) / (p.partial ? timePct / 100 : 1))}`}>{pct1((doneHours / planHoursMonth) * 100)} {t("kế hoạch tháng", "of monthly plan")} {Math.round(planHoursMonth)}h</span>
            {chg(p.hoursChange)} {vs}
          </>
        ) : <>{t("chưa có giờ kế hoạch", "no planned hours yet")}</>
      },
      {
        lab: METRIC.gmvPerHour,
        val: p.gmvPerHour != null ? amt(p.gmvPerHour) : "—",
        note: (
          <>
            {planGph && p.gmvPerHour != null ? <span className={`pc ${pcTone((p.gmvPerHour / planGph / PLAN_OK) * 100)}`}>{pct1((p.gmvPerHour / planGph) * 100)} {t("kế hoạch", "of plan")} {amt(planGph)}</span> : null}
            {chg(p.gmvPerHourChange)} {vs}
          </>
        )
      }
    ];

    const liveSplit = cur.liveLinked + cur.affiliate;
    const rows: { name: string; v: number | null; prevV: number | null; color: string; sub?: boolean }[] = [
      { name: N.live, v: liveSplit, prevV: prev ? prev.liveLinked + prev.affiliate : null, color: CH_COLOR.sellerLive },
      { name: N.sellerLive, v: cur.liveLinked, prevV: prev?.liveLinked ?? null, color: CH_COLOR.sellerLive, sub: true },
      { name: N.affiliateLive, v: cur.affiliate, prevV: prev?.affiliate ?? null, color: CH_COLOR.affiliate, sub: true },
      { name: N.video, v: cur.video, prevV: prev?.video ?? null, color: CH_COLOR.video },
      { name: N.card, v: cur.card, prevV: prev?.card ?? null, color: CH_COLOR.card }
    ];
    const donut = [
      { color: CH_COLOR.sellerLive, v: cur.liveLinked },
      { color: CH_COLOR.affiliate, v: cur.affiliate },
      { color: CH_COLOR.video, v: cur.video },
      { color: CH_COLOR.card, v: cur.card ?? 0 }
    ];
    const dayRows = p.score.filter((r) => r.key !== "all" && r.key !== "shop");
    const dayBars = dayRows
      .map((r) => {
        const t = r.targetToDate ?? r.target;
        return t != null ? { name: DAY_TYPE_SHORT[r.key as CampDayBucket], sub: p.spans[r.key as CampDayBucket] ?? "", value: r.actual / 1e6, mark: t / 1e6, text: `${amt(r.actual)} / ${amt(t)} · ${fmtP((r.actual / t) * 100, 0, false)}`, cls: r.actual / t < 0.9 ? "red" : "" } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    const dayMax = Math.ceil((Math.max(...dayBars.map((r) => Math.max(r.value, r.mark)), 0) * 1.1) / 100) * 100;

    return (
      <DemoPage>
        <DemoHead no={p.no} title={p.title} headline={p.headline} />
        <DemoKpis items={tiles} />
        <DemoPanel title={`${N.total} ${t("theo kênh", "by channel")}`} sub={t(`Tới ${throughDay}/${mm}. % tăng giảm ${vs} cùng ngày.`, `To ${throughDay}/${mm}. % change ${vs}, same days.`)}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
            <ChannelDonut parts={donut} total={cur.shopGmv} center={amt(cur.shopGmv)} label={N.total} />
            <div style={{ flex: "1 1 320px", minWidth: 0, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                <thead>
                  <tr style={{ color: "var(--muted)", fontSize: 12, borderBottom: "1px solid var(--line)" }}>
                    <th style={{ textAlign: "left", fontWeight: 500, padding: "6px 8px" }}>{t("Kênh", "Channel")}</th>
                    <th style={{ textAlign: "right", fontWeight: 500, padding: "6px 8px" }}>{METRIC.gmv}</th>
                    <th style={{ textAlign: "right", fontWeight: 500, padding: "6px 8px" }}>{t("Tỷ trọng", "Share")}</th>
                    <th style={{ textAlign: "right", fontWeight: 500, padding: "6px 8px" }}>{t("So", "vs")} {p.prevMonthShort}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name} style={{ borderBottom: "1px solid var(--line)", color: r.sub ? "var(--muted)" : undefined, fontWeight: r.sub ? 400 : 700 }}>
                      <td style={{ padding: "9px 8px", paddingLeft: r.sub ? 26 : 8 }}>
                        {!r.sub && <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 8, background: r.color }} />}
                        {r.name}
                      </td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{r.v != null ? amt(r.v) : "—"}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{r.v != null ? fmtP((r.v / cur.shopGmv) * 100, 1, false) : "—"}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>{chg(growth(r.prevV, r.v)) ?? "—"}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}>
                    <td style={{ padding: "9px 8px" }}>{N.total}</td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>{amt(cur.shopGmv)}</td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>100%</td>
                    <td style={{ padding: "9px 8px", textAlign: "right" }}>{chg(growth(prev?.shopGmv, cur.shopGmv)) ?? "—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </DemoPanel>
        {dayBars.length > 0 && (
          <DemoPanel title={t(`${gl} so với target theo loại ngày`, `${gl} vs target by day type`)} sub={t(`Vạch trắng là ${liveTarget.toLowerCase()} của từng loại ngày.`, `The white mark is the ${liveTarget.toLowerCase()} for each day type.`)}>
            <Html className="hb" html={hbars(dayBars, dayMax)} />
          </DemoPanel>
        )}
      </DemoPage>
    );
  }

  return (
    <DemoPage>
      <DemoHead no={p.no} title={p.title} headline={p.headline} />
      <DemoKpis items={kpis} />
      <DemoStack>
        {bridgeHtml && base != null && (
          <DemoPanel title={t(`Chênh lệch ${gl} so với ${liveTarget}, theo loại ngày`, `${gl} gap vs ${liveTarget}, by day type`)} sub={t(`Từ ${liveTarget} (${amt(base)}) đến thực tế (${amt(p.liveActual)}).`, `From ${liveTarget} (${amt(base)}) to actual (${amt(p.liveActual)}).`)}>
            <Html html={bridgeHtml} />
          </DemoPanel>
        )}
        <DemoPanel
          title={t("Kết quả so với Target", "Results vs Target")}
          sub={t(
            `Target theo Kế Hoạch Tháng đã chốt; % tính trên Target ${p.partial ? "luỹ kế tới nay" : "tháng"}.${p.shop?.throughDay && p.shop.throughDay !== p.curEndDay ? ` ${gl} tính tới ${p.curEndDay}/${mm}, KPI ${METRIC.totalGmv} tính tới ${p.shop.throughDay}/${mm} (ngày cuối file Shop Analytics).` : ""}`,
            `Target from the locked month plan; % is on the ${p.partial ? "cumulative Target to date" : "monthly Target"}.${p.shop?.throughDay && p.shop.throughDay !== p.curEndDay ? ` ${gl} through ${p.curEndDay}/${mm}; ${METRIC.totalGmv} KPI through ${p.shop.throughDay}/${mm} (last day of the Shop Analytics file).` : ""}`
          )}
        >
          <DemoTable html={tbl(["", t("Thực tế", "Actual"), p.partial ? t("Target tới nay", "Target to date") : "Target", ...(showGapCol ? [t("Chênh lệch", "Gap")] : []), "% Target"], scoreRows)} />
        </DemoPanel>
      </DemoStack>
      {ph.length > 0 && (
        <>
          <DemoPanel
            title={t(`${METRIC.gmvPerHour} so với kế hoạch tháng ${Number(mm)}, theo loại ngày`, `${METRIC.gmvPerHour} vs the ${monthLong(Number(mm))} plan, by day type`)}
            sub={t(
              `Thanh = thực tế ${end} · vạch trắng = kế hoạch.${below === ph.length ? ` Cả ${ph.length === 4 ? "bốn" : ph.length} loại ngày đều dưới 95% ${METRIC.gmvPerHour} kế hoạch.` : below > 0 ? ` ${below}/${ph.length} loại ngày dưới 95% ${METRIC.gmvPerHour} kế hoạch.` : ` Cả ${ph.length} loại ngày đạt từ 95% ${METRIC.gmvPerHour} kế hoạch.`}`,
              `Bar = actual ${end} · white mark = plan.${below === ph.length ? ` All ${ph.length} day types are below 95% of planned ${METRIC.gmvPerHour}.` : below > 0 ? ` ${below}/${ph.length} day types are below 95% of planned ${METRIC.gmvPerHour}.` : ` All ${ph.length} day types reached at least 95% of planned ${METRIC.gmvPerHour}.`}`
            )}
          >
            <Html className="hb" html={planBars} />
          </DemoPanel>
          <DemoPanel title={t(`Kế hoạch tháng ${Number(mm)} theo loại ngày`, `${monthLong(Number(mm))} plan by day type`)}>
            <DemoTable html={tbl([t("Loại ngày", "Day type"), t("Phân bổ", "Allocation"), METRIC.targetGmv, t("Giờ kế hoạch", "Planned hours"), `${METRIC.gmvPerHour} ${t("kế hoạch", "planned")}`], planRows)} />
            {p.cancelledTarget != null && p.cancelledTarget > 0 && (
              <DemoLegend>
                <span>
                  {t(
                    `Target tháng ${p.liveTargetMonth != null ? amt(p.liveTargetMonth) : ""} gồm ${amt(p.cancelledTarget)} của ca kế hoạch đã huỷ (giữ target, không có giờ kế hoạch) nên lớn hơn tổng bảng này ${amt(tTarget)}.`,
                    `The monthly Target ${p.liveTargetMonth != null ? amt(p.liveTargetMonth) : ""} includes ${amt(p.cancelledTarget)} from cancelled planned sessions (target kept, no planned hours), so it is larger than this table's total ${amt(tTarget)}.`
                  )}
                </span>
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
  { grp: "result", key: "gmv" }, { key: "itemsSold" }, { key: "orders" }, { key: "hours" }, { key: "gmvPerHour" },
  { grp: "traffic", key: "err" }, { key: "avgViewSec" }, { key: "views" }, { key: "impressions" }, { key: "viewsPerHour" }, { key: "impressionsPerHour" },
  { grp: "conversion", key: "productImpressions" }, { key: "productClicks" }, { key: "ctr" }, { key: "liveCtr" }, { key: "ctor" },
  { grp: "basket", key: "upt" }, { key: "avgPrice" }, { key: "aov" }
];
const TAB_NAME: Record<KeyMetricsTab, string> = byLang(() => ({ all: t("Cả tháng", "Whole month"), ...DAY_TYPE_SHORT }));

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
    if (o.grp) rows.push({ grp: KEY_METRIC_GROUPS.find((g) => g.group === o.grp)?.label ?? o.grp });
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
        return v == null || a == null ? "—" : { t: `${v - a < 0 ? "−" : "+"}${fmtFixed(Math.abs(v - a), 1)} ${t("điểm", "pts")}`, c: "nt" };
      })
    ]);
  }
  const head = [
    t("Chỉ số", "Metric"),
    ...months.map((m) => monthLabel(m.month)),
    ...months.slice(1).map((m, i) => `${monthLabel(m.month)} ${t("so", "vs")} ${monthLabel(months[i].month)} (${table.bands[i + 1] == null ? "—" : "±" + Math.round(table.bands[i + 1]!) + "%"})`)
  ];
  const sessionsLine = months.map((m) => m.stats[tab].sessions).join(" → ");
  return (
    <DemoPage>
      <DemoHead no={no} title={title} headline={headline} />
      <DemoPanel
        title={t(`${KEY_METRICS.length} chỉ số, ${months.length === 3 ? "ba" : months.length} tháng ${windowNote ? `cùng kỳ ${windowNote}` : "cả tháng"}`, `${KEY_METRICS.length} metrics, ${months.length} months, ${windowNote ? `same period ${windowNote}` : "full month"}`)}
        sub={t(
          `Màu xanh / đỏ khi thay đổi vượt ngưỡng dao động của tab đó${cv != null ? ` (độ lệch GMV/giờ mỗi phiên ±${Math.round(cv * 100)}%, ${cvMeasured ? "đo trên phiên của brand" : "mức mặc định, chưa đủ phiên để đo riêng"})` : ""}. ${METRIC.liveHours} không đánh giá tốt hay xấu.`,
          `Green / red when a change exceeds that tab's normal range${cv != null ? ` (GMV/hour deviation per session ±${Math.round(cv * 100)}%, ${cvMeasured ? "measured on the brand's sessions" : "default level, not enough sessions to measure"})` : ""}. ${METRIC.liveHours} are not rated good or bad.`
        )}
      >
        <div className="tabs" role="tablist">
          {KEY_METRICS_TABS.map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "seg-on" : undefined} onClick={() => setTab(k)}>
              {TAB_NAME[k]} · {months[last].stats[k].sessions} {t("phiên", "sessions")}
            </button>
          ))}
        </div>
        <DemoTable html={tbl(head, rows)} id="km" />
        <DemoLegend>
          {directShare && <span>{t("Dòng Direct vs Indirect lấy từ file Shop Analytics, tính trên mọi phiên của tài khoản shop.", "The Direct vs Indirect row comes from the Shop Analytics file, across all sessions of the shop account.")}</span>}
          <span>
            {windowNote ? t(`Cùng kỳ ${windowNote} mỗi tháng`, `Same period ${windowNote} each month`) : t("Cả tháng", "Full month")} · {t("số phiên", "sessions")} {months.map((m) => monthLabel(m.month)).join(" → ")}: {sessionsLine} {t("phiên", "sessions")}
          </span>
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
  const fileTag = (m: NmvMonth) => (m.exportedAt ? `${t("file xuất", "file exported")} ${dm(m.exportedAt)}` : "");
  const rateOf = (m: NmvMonth) => (m === cur && nmvRate != null ? nmvRate : m.windowRate);
  const curProv = cur.status !== "final";
  const nmv0 = rateOf(cur) != null ? cur.nmvGmv * (1 - rateOf(cur)! / 100) : null;
  const mm = cur.month.slice(5);
  const kpis: DemoKpi[] = [
    {
      lab: `NMV ${curProv ? t("ước tính tạm", "provisional estimate") : t("ước tính", "estimate")} · 1–${curEndDay}/${mm}`,
      val: nmv0 != null ? amt(nmv0) : "—",
      note: rateOf(cur) != null ? `${METRIC.liveGmv} ${amt(cur.nmvGmv)} × (1 − ${fmtP(rateOf(cur)!, 2, false)})` : t("chưa có Refund rate", "no refund rate yet")
    },
    {
      lab: `${METRIC.refundRate} ${curProv ? t("tạm tính", "provisional") : t("chốt", "final")} · 1–${curEndDay}/${mm}`,
      val: cur.windowRate != null ? pct1(cur.windowRate) : "—",
      tone: curProv ? "gold" : undefined,
      note: curProv ? t("chưa chốt: đơn còn trong thời gian hoàn trả", "not final: orders are still within the return window") : t("đã chốt", "final")
    }
  ];
  // Refund rate các tháng trước chỉ ở biểu đồ "Refund rate toàn shop" và bảng theo dõi — không lặp thành ô (audit trùng lặp 30/10).

  // NMV tách phần hoàn (chưa có đơn hủy)
  const shown = months.slice(-3).filter((m) => rateOf(m) != null && m.nmvGmv > 0);
  const mx = Math.max(...shown.map((m) => m.nmvGmv), 1) * 1.05;
  const nmvHtml = shown
    .map((m) => {
      const r = rateOf(m)! / 100;
      const nmv = m.nmvGmv * (1 - r);
      const ref = m.nmvGmv * r;
      const isCur = m === cur;
      const tail = old(m) || (!isCur && m.exportedAt) ? ` · ${fileTag(m)}` : isCur && curProv ? t(" · tạm tính, chưa chốt", " · provisional, not final") : "";
      const rateNote = isCur && nmvSource && nmvRate != null ? ` · ${t("tỷ lệ", "rate")} ${nmvSource}` : "";
      return `<div class="nm">${monthLong(m.month)}<small>${METRIC.liveGmv} ${amt(m.nmvGmv)} · ${t("hoàn", "refunds")} ${pct1(r * 100)}${tail}${rateNote}</small></div>
    <div class="trk" style="height:26px${old(m) ? ";opacity:.45" : ""}"><div class="fill stk" style="width:${(nmv / mx) * 100}%"></div><div class="fill stk red" style="left:${(nmv / mx) * 100}%;width:${(ref / mx) * 100}%;opacity:.7"></div></div>
    <div class="v">NMV ${amt(nmv)}${isCur && curProv ? t(" (tạm)", " (provisional)") : ""}</div>`;
    })
    .join("");

  // Refund rate toàn shop theo tháng
  const rr = months.filter((m) => m.windowRate != null);
  const rrMax = Math.max(...rr.map((m) => m.windowRate!), 1);
  const refundHtml = columns(
    rr.map((m) => ({ l: `${m.win}\n${m === cur && curProv ? t("tạm tính", "provisional") : fileTag(m)}`.trim(), v: [m.windowRate!], colors: old(m) ? ["#55555d"] : undefined })),
    [{ color: "var(--gold)" }],
    { min: 0, max: Math.ceil((rrMax * 1.2) / 5) * 5, h: 240, fmt: (v: number) => fmtP(v, 1, false) }
  );
  const byFile = new Map<string, string[]>();
  for (const m of rr) {
    const k = m.exportedAt ? dm(m.exportedAt) : "";
    byFile.set(k, [...(byFile.get(k) ?? []), m.short]);
  }
  const fileNote = [...byFile.entries()].filter(([k]) => k).map(([k, ms]) => `${ms.join(", ")} ${t("từ file xuất", "from the file exported")} ${k}`).join("; ");
  const anyOld = months.some(old);

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
            title={t(`${METRIC.liveGmv} tách thành NMV ước tính và phần hoàn ước tính`, `${METRIC.liveGmv} split into estimated NMV and estimated refunds`)}
            sub={t(
              `1–${curEndDay} mỗi tháng (cùng cửa sổ với Refund rate, tới ngày cuối file Shop Analytics) · phần hoàn = ${METRIC.liveGmv} × ${METRIC.refundRate} toàn shop (áp cho livestream, chưa gồm đơn hủy). Các tháng trước dùng tỷ lệ tại ngày xuất file${nmvSource ? `; tháng này dùng tỷ lệ ${nmvSource}` : ""}.${anyOld ? " Thanh mờ = Refund rate từ file xuất sớm hơn, chưa so sánh được." : ""}`,
              `1–${curEndDay} of each month (same window as the refund rate, through the last day of the Shop Analytics file) · refunds = ${METRIC.liveGmv} × whole-shop ${METRIC.refundRate} (applied to livestream, excluding cancellations). Earlier months use the rate as of the file export date${nmvSource ? `; this month uses ${nmvSource}` : ""}.${anyOld ? " Faded bars = refund rate from an earlier export, not yet comparable." : ""}`
            )}
          >
            <Html className="hb" html={nmvHtml} />
            <DemoLegend>
              <span><i style={{ background: "var(--gold)" }} />{t("NMV ước tính", "Estimated NMV")}</span>
              <span><i style={{ background: "var(--red)", opacity: 0.7 }} />{t("Hoàn ước tính", "Estimated refunds")}</span>
            </DemoLegend>
          </DemoPanel>
        )}
        {rr.length > 0 && (
          <DemoPanel title={t(`${METRIC.refundRate} toàn shop`, `Whole-shop ${METRIC.refundRate}`)} sub={t(`Refunds ÷ ${METRIC.totalGmv}, 1–${curEndDay} mỗi tháng.${fileNote ? ` Cột ${fileNote}.` : ""}`, `Refunds ÷ ${METRIC.totalGmv}, 1–${curEndDay} of each month.${fileNote ? ` Bars: ${fileNote}.` : ""}`)}>
            <Html html={refundHtml} />
          </DemoPanel>
        )}
      </DemoStack>
      {/* Bảng nhập Refund rate chốt là công cụ của ops — không vào file gửi brand (audit 30/10). */}
      <div data-export-hide>
      <DemoPanel
        title={t(`Theo dõi ${METRIC.refundRate} chính xác theo tháng`, `Final ${METRIC.refundRate} by month`)}
        sub={t(
          `Nhập ${METRIC.refundRate} chốt sau khi tải lại file Shop Analytics khi hết thời gian hoàn trả. Trạng thái và chênh lệch so với số trong report tự cập nhật.${canManage ? " Giá trị nhập lưu cho cả team." : ""}`,
          `The final ${METRIC.refundRate} is recorded after re-downloading the Shop Analytics file once the return window closes. Status and the gap to the report figure update automatically.`
        )}
      >
        <div className="tw">
          <table id="rrTbl">
            <thead>
              <tr>
                <th>{t("Tháng", "Month")}</th>
                <th className="w" style={{ minWidth: 120 }}>{t("Phạm vi và file", "Window and file")}</th>
                <th>Trong report</th>
                <th>{t("Trạng thái", "Status")}</th>
                <th>{t("Chốt (%)", "Final (%)")}</th>
                <th>{t("Ngày chốt", "Final date")}</th>
                <th>{t("Chênh lệch", "Gap")}</th>
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
                    <td>{monthLong(r.month)}</td>
                    <td className="w" style={{ minWidth: 120 }}>{isCur ? `1–${curEndDay}/${r.month.slice(5)}` : t("Cả tháng", "Full month")}{r.exportedAt ? ` · ${t("file xuất", "file exported")} ${dm(r.exportedAt)}` : ""}</td>
                    <td>{r.fileRate != null ? fmtP(r.fileRate, 2, false) : "—"}</td>
                    <td dangerouslySetInnerHTML={{ __html: fin != null || r.status === "final" ? pill(t("đã chốt", "final"), "g") : pill(t("tạm tính", "provisional"), "y") }} />
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
                    <td className={diff == null ? "nt" : Math.abs(diff) > 1 ? "dn" : "up"}>{diff == null ? "—" : `${diff >= 0 ? "+" : "−"}${fmtFixed(Math.abs(diff), 2)} ${t("điểm", "pts")}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <DemoLegend>
          <span>{t(`${METRIC.refundRate} chỉ gồm giá trị hoàn tiền, chưa gồm đơn hủy; tỷ lệ hủy cần file Order. Chênh lệch tính bằng điểm phần trăm.`, `${METRIC.refundRate} covers refund value only, not cancellations; the cancellation rate needs the Order file. Gaps are in percentage points.`)}</span>
          <span className="st" aria-live="polite">{msg}</span>
        </DemoLegend>
      </DemoPanel>
      </div>
      <div className="pn">
        <details>
          <summary>{t("Phương pháp", "Methodology")}</summary>
          <p>
            {t(
              `NMV ước tính = ${METRIC.liveGmv} YFB × (1 − ${METRIC.refundRate} toàn shop), nguồn Shop Analytics. Tỷ lệ này tính trên mọi kênh của shop, chưa tách riêng livestream, nên chỉ là xấp xỉ. Với tháng đang chạy, ${METRIC.refundRate} chưa chốt nên NMV chỉ là ước tính tạm. ${METRIC.refundRate} chỉ gồm giá trị hoàn tiền, chưa gồm đơn hủy (cần file Order), nên NMV thực tế còn thấp hơn. ${METRIC.totalGmv} và cơ cấu kênh ở trang Toàn shop.`,
              `Estimated NMV = YFB ${METRIC.liveGmv} × (1 − whole-shop ${METRIC.refundRate}), from Shop Analytics. The rate covers all shop channels, not livestream alone, so it is an approximation. For the current month the ${METRIC.refundRate} is not final, so NMV is provisional. ${METRIC.refundRate} covers refund value only, not cancellations (needs the Order file), so actual NMV is lower still. ${METRIC.totalGmv} and the channel mix are on the Whole shop page.`
            )}
          </p>
        </details>
      </div>
      {insight}
    </DemoPage>
  );
};
