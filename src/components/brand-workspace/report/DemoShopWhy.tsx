import React, { useState } from "react";
import { BLOCK_KEYS, BLOCK_LABEL, decodeEdits, encodeEdits, shownBlocks, type BlockKey, type InsightBlocks, type InsightEdits } from "../../../lib/report/pageInsights";
import { errorMessage } from "../../../lib/errorMessage";
import { METRIC } from "../../../lib/metricGlossary";
import type { ControlRow, ControlVerdict } from "../../../lib/report/deepAnalysis";
import { controlLabel, controlVerdict } from "../../../lib/report/deepAnalysis";
import type { DriverBreakdown } from "../../../lib/report/monthlyReportInsights";
import { DRIVER_LABEL } from "../../../lib/report/monthlyReportInsights";
import type { DayTypeFactorRow } from "../../../lib/report/brandReport";
import { DAY_TYPE_FACTORS } from "../../../lib/report/brandReport";
import type { KeyMetricsMonth } from "../../../lib/report/brandReport";
import { dayAbsRows, DAY_ABS_METRICS } from "../../../lib/report/reportVisuals";
import { KEY_METRICS, fmtKeyMetric } from "../../../lib/report/keyMetrics";
import { fmtFixed } from "../../../lib/format";
import { DAY_TYPE_SHORT } from "./theme";

const BLUE = "#7fb0e0";
import { W, ch, columns, fmtM, fmtP, heat, hbars, pill, stack100, tbl, waterfall } from "./demoCharts";

// Hai trang "Toàn shop & đóng góp của livestream YFB" và "Phân tích nguyên nhân" dựng theo demo Report Tháng đã chốt
// (scratchpad/build/template.html, trang 3 và 4): cùng thứ tự khối, cùng class (demo.css, tiền tố .rt), số lấy từ dữ liệu app.

const Html: React.FC<{ html: string; className?: string; id?: string }> = ({ html, className, id }) => <div id={id} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
const Tbl: React.FC<{ html: string }> = ({ html }) => (
  <div className="tw">
    <table dangerouslySetInnerHTML={{ __html: html }} />
  </div>
);

export interface DemoKpi {
  label: string;
  value: string;
  note: string;
  color?: "red" | "green";
}
export const DemoHead: React.FC<{ no: string; title: string; headline: string; kpis: DemoKpi[] }> = ({ no, title, headline, kpis }) => (
  <>
    <div className="ph">
      <div className="pt">
        {no} · {title}
      </div>
      <h2>{headline}</h2>
    </div>
    <div className="kpis">
      {kpis.slice(0, 4).map((k, i) => (
        <div key={i} className="kpi">
          <div className="lab">{k.label}</div>
          <div className="val" style={k.color ? { color: `var(--${k.color})` } : undefined}>{k.value}</div>
          <div className="note">{k.note}</div>
        </div>
      ))}
    </div>
  </>
);

const IC_CLASS: Record<BlockKey, string> = { observe: "o", cause: "r", impact: "i", advise: "a" };
/** Khối Insight đúng markup demo (.ins4 + .insbar). Lưu qua section_notes như PageInsight; ops sửa được, thêm "Nhận định riêng". */
export const DemoInsight: React.FC<{
  auto: InsightBlocks;
  note?: { text: string; savedAt: string };
  computedAt: string;
  canManage: boolean;
  onSave: (text: string | null) => Promise<void>;
}> = ({ auto, note, computedAt, canManage, onSave }) => {
  const saved = decodeEdits(note?.text);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<BlockKey | "own", string>>({ observe: "", cause: "", impact: "", advise: "", own: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const shown = shownBlocks(auto, saved);
  const edited = Object.keys(saved).length > 0;
  const save = async (text: string | null) => {
    setSaving(true);
    setMsg(null);
    try {
      await onSave(text);
      setEditing(false);
      setMsg(text == null ? "Đã khôi phục bản gốc" : "Đã lưu");
    } catch (e) {
      const m = errorMessage(e, "Lưu Insight thất bại");
      setMsg(/section_notes/.test(m) ? "Chưa có cột section_notes — cần chạy migration 0121 trong SQL Editor." : m);
    } finally {
      setSaving(false);
    }
  };
  const toggle = () => {
    if (!editing) {
      setDraft({ observe: shown.observe, cause: shown.cause, impact: shown.impact, advise: shown.advise, own: shown.own });
      setMsg(null);
      setEditing(true);
      return;
    }
    const e: InsightEdits = {};
    for (const k of BLOCK_KEYS) if (draft[k].trim() && draft[k].trim() !== auto[k]) e[k] = draft[k];
    if (draft.own.trim()) e.own = draft.own;
    void save(encodeEdits(e));
  };
  const showOwn = editing || !!shown.own;
  return (
    <>
      <div className="insbar">
        <span>Insight tổng hợp</span>
        <span className="st" aria-live="polite">{msg ?? (note && note.savedAt < computedAt && edited ? "Số liệu đã cập nhật sau lần sửa — đọc lại cho khớp" : "")}</span>
        <span className="sp" />
        {canManage && (
          <>
            <button type="button" onClick={toggle} disabled={saving}>{editing ? (saving ? "Đang lưu…" : "Xong") : "Sửa insight"}</button>
            {edited && !editing && <button type="button" onClick={() => void save(null)} disabled={saving}>Khôi phục bản gốc</button>}
          </>
        )}
      </div>
      <div className={`ins4${editing ? " editing" : ""}`}>
        {BLOCK_KEYS.map((k) => (
          <div key={k} className={`ic ${IC_CLASS[k]}`}>
            <h4>{BLOCK_LABEL[k]}</h4>
            {editing ? (
              <textarea className="rr" style={{ width: "100%", minHeight: 120 }} value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
            ) : (
              <p>{shown[k]}</p>
            )}
          </div>
        ))}
        {showOwn && (
          <div className="ic own">
            <h4>{BLOCK_LABEL.own}</h4>
            {editing ? (
              <textarea className="rr" style={{ width: "100%", minHeight: 70 }} placeholder="Nhập nhận định của bạn cho trang này" value={draft.own} onChange={(e) => setDraft((d) => ({ ...d, own: e.target.value }))} />
            ) : (
              <p>{shown.own}</p>
            )}
          </div>
        )}
      </div>
    </>
  );
};

// ---------- tính số dùng chung ----------
const pctOf = (a: number | null | undefined, b: number | null | undefined) => (a != null && b != null && a > 0 ? (b / a - 1) * 100 : null);
const dd = (iso: string) => String(Number(iso.slice(8)));
const range = (start: string, end: string) => `${dd(start)}–${dd(end)}/${end.slice(5, 7)}`;
const rng = (start: string, end: string) => `${dd(end)}/${end.slice(5, 7)}`;
void rng;
const sgn = (v: number | null | undefined, d = 0) => (v == null ? "—" : fmtP(v, d));
/** Trục cầu không bắt đầu từ 0: đáy thấp hơn bước thấp nhất khoảng 0,7 biên độ, làm tròn 100M. */
function axis(from: number, steps: number[]) {
  const runs = [from];
  for (const s of steps) runs.push(runs[runs.length - 1] + s);
  const lo = Math.min(...runs), hi = Math.max(...runs), span = Math.max(hi - lo, 1e7);
  return { min: Math.floor((lo - 0.7 * span) / 1e8) * 1e8, max: Math.ceil((hi + 0.33 * span) / 1e7) * 1e7 };
}
const m1 = (v: number) => fmtFixed(v / 1e6, 1) + "M";
const M = (v: number, forceSign = true) => (forceSign && v >= 0 ? "+" : "") + fmtM(v);

// ============ TRANG: Toàn shop & đóng góp của livestream YFB ============
export interface ShopMonthMix { liveLinked: number; affiliate: number; video: number; card: number | null; shopGmv: number }
export interface DemoShopProps {
  no: string;
  title: string;
  control: ControlRow[];
  /** 4 tháng gần nhất (cũ → mới), cắt cùng số ngày; null = chưa có file Shop Analytics. */
  mixes: (ShopMonthMix | null)[];
  mixLabels: string[];
  /** LIVE GMV YFB của 4 tháng ở cùng kỳ cắt với mixes. */
  yfbGmv: number[];
  shopCur: { gmv: number } | null;
  shopPrev: { gmv: number } | null;
  window: { prevStart: string; prevEnd: string; curStart: string; curEnd: string };
  traffic: { from: number; to: number; parts: { key: string; change: number; value: number }[] } | null;
  fallbackHeadline: string;
  insight: React.ReactNode;
}
const VERDICT: Record<ControlVerdict, [string, string]> = {
  agency_better: ["suy giảm thấp hơn các kênh còn lại", "g"],
  ops: ["kém hơn các kênh còn lại", "r"],
  market: ["tương đương các kênh còn lại", "m"]
};
export const DemoShopPage: React.FC<DemoShopProps> = ({ no, title, control, mixes, mixLabels, yfbGmv, shopCur, shopPrev, window: w, traffic, fallbackHeadline, insight }) => {
  const rows = (["daily", "camp", "all"] as const).map((k) => control.find((r) => r.key === k)).filter((r): r is ControlRow => !!r);
  const all = control.find((r) => r.key === "all");
  const camp = control.find((r) => r.key === "camp");
  const curLbl = range(w.curStart, w.curEnd), prevLbl = range(w.prevStart, w.prevEnd);
  const shopChg = pctOf(shopPrev?.gmv, shopCur?.gmv);
  const shareCur = all && shopCur && shopCur.gmv > 0 ? (all.liveCur / shopCur.gmv) * 100 : null;
  const sharePrev = all && shopPrev && shopPrev.gmv > 0 ? (all.livePrev / shopPrev.gmv) * 100 : null;
  const aff = [mixes[2]?.affiliate ?? null, mixes[3]?.affiliate ?? null] as const;
  const affChg = pctOf(aff[0], aff[1]);
  const visRow = camp ?? all;
  const kpis: DemoKpi[] = [
    { label: `Total GMV · ${curLbl}`, value: shopCur ? fmtM(shopCur.gmv) : "—", note: shopChg != null ? `${fmtP(shopChg, 1)} so với ${prevLbl}` : "chưa có số kỳ trước" },
    { label: "Tỷ trọng livestream YFB", value: shareCur != null ? fmtP(shareCur, 1, false) : "—", note: sharePrev != null && shareCur != null ? `${prevLbl}: ${fmtP(sharePrev, 1, false)} (${shareCur - sharePrev < 0 ? "−" : "+"}${fmtFixed(Math.abs(shareCur - sharePrev), 1)} điểm)` : "" },
    { label: `Lượt truy cập shop · ${visRow ? controlLabel(visRow.key) : ""}`, value: visRow?.visitorsChg != null ? fmtP(visRow.visitorsChg) : "—", note: visRow?.cvrPrev != null && visRow.cvrCur != null ? `CVR shop ${fmtP(visRow.cvrPrev, 2, false)} → ${fmtP(visRow.cvrCur, 2, false)}` : "", color: visRow?.visitorsChg != null ? (visRow.visitorsChg >= 0 ? "green" : "red") : undefined },
    { label: "Affiliate LIVE", value: affChg != null ? fmtP(affChg) : "—", note: aff[0] != null && aff[1] != null ? `${m1(aff[0])} → ${m1(aff[1])}` : "", color: affChg != null ? (affChg >= 0 ? "green" : "red") : undefined }
  ];
  const headline = rows.length
    ? rows
        .filter((r) => r.key !== "all" && r.liveChg != null && r.restChg != null)
        .map((r) => `${controlLabel(r.key)}: livestream YFB ${fmtP(r.liveChg!)}, các kênh còn lại ${fmtP(r.restChg!)}`)
        .join(". ") || fallbackHeadline
    : fallbackHeadline;

  // biểu đồ tăng trưởng
  const grp = rows.map((r) => ({ l: `${controlLabel(r.key)} · ${r.days} ngày`, v: [r.liveChg, r.restChg, r.visitorsChg] }));
  const vals = grp.flatMap((g) => g.v).filter((v): v is number => v != null);
  const cmpHtml = grp.length ? columns(grp, [{ color: "var(--gold)" }, { color: BLUE }, { color: "#8a8a94" }], { min: Math.floor(Math.min(0, ...vals) - 6), max: Math.ceil(Math.max(0, ...vals) + 8), h: 260, fmt: (v: number) => fmtP(v) }) : "";

  // cơ cấu
  const mixCols = mixes.map((c, i) => (c ? { l: mixLabels[i], v: [c.liveLinked, c.affiliate, c.video, c.card ?? 0] } : null)).filter((x): x is NonNullable<typeof x> => !!x);
  const segs = [{ name: "Seller LIVE", color: "#e0b43c" }, { name: "Affiliate LIVE", color: "#d95926" }, { name: "Video", color: "#199e70" }, { name: "Product card", color: "#3987e5" }];
  const mixHtml = mixCols.length ? stack100(mixCols, segs, { h: 260 }) : "";

  // bảng so sánh
  const mktHead = ["Loại ngày", "Livestream YFB", "Các kênh còn lại", "Lượt truy cập shop", "CVR shop", "Đánh giá"];
  const mktRows = rows.map((r) => {
    const v = controlVerdict(r);
    const [t, k] = v ? VERDICT[v] : ["chưa đủ số", "m"];
    return [
      `${controlLabel(r.key)} · ${r.days} ngày`,
      r.liveChg != null ? ch(fmtP(r.liveChg), 10) : "—",
      r.restChg != null ? ch(fmtP(r.restChg), 10) : "—",
      r.visitorsChg != null ? ch(fmtP(r.visitorsChg), 10) : "—",
      r.cvrPrev != null && r.cvrCur != null ? `${fmtP(r.cvrPrev, 2, false)} → ${fmtP(r.cvrCur, 2, false)}` : "—",
      W(pill(t, k))
    ];
  });

  // cầu đóng góp từng kênh: YFB / Seller LIVE khác / Affiliate / Video / Product card (card = phần còn lại cho cộng đúng)
  let br3 = "", br3Axis: number | null = null;
  const a = mixes[2], b = mixes[3];
  if (a && b && yfbGmv[2] != null && yfbGmv[3] != null) {
    const dYfb = yfbGmv[3] - yfbGmv[2];
    const dLive = b.liveLinked - a.liveLinked;
    const dAff = b.affiliate - a.affiliate, dVid = b.video - a.video;
    const dTot = b.shopGmv - a.shopGmv;
    const dCard = dTot - dYfb - (dLive - dYfb) - dAff - dVid;
    const steps = [dYfb, dLive - dYfb, dAff, dVid, dCard];
    const ax = axis(a.shopGmv, steps);
    br3Axis = ax.min;
    const lab = ["Livestream\nYFB", "Seller LIVE\nkhác", "Affiliate\nLIVE", "Video", "Product\ncard"];
    br3 = waterfall(
      [
        { l: `Total GMV\n${prevLbl}`, v: a.shopGmv, t: "total", txt: fmtM(a.shopGmv) },
        ...steps.map((s, i) => ({ l: lab[i], v: s, t: "delta", txt: M(s) })),
        { l: `Total GMV\n${curLbl}`, v: b.shopGmv, t: "total", txt: fmtM(b.shopGmv) }
      ],
      { min: ax.min, max: ax.max, h: 290 }
    );
  }

  // cầu lượt truy cập × CVR × giá trị đơn
  let br4 = "", br4Axis: number | null = null, br4Legend = "";
  if (traffic) {
    const steps = traffic.parts.map((p) => p.value);
    const ax = axis(traffic.from, steps);
    br4Axis = ax.min;
    const names: Record<string, string> = { visitors: "Lượt truy cập\nshop", cvr: "CVR shop", aov: `${METRIC.aov}\n(suy ra)` };
    br4 = waterfall(
      [
        { l: `Total GMV\n${prevLbl}`, v: traffic.from, t: "total", txt: fmtM(traffic.from) },
        ...traffic.parts.map((p) => ({ l: names[p.key] ?? p.key, v: p.value, t: "delta", txt: M(p.value) })),
        { l: `Total GMV\n${curLbl}`, v: traffic.to, t: "total", txt: fmtM(traffic.to) }
      ],
      { min: ax.min, max: ax.max, h: 270 }
    );
    const [pv, pc, pa] = traffic.parts;
    br4Legend = `Lượt truy cập ${fmtP(pv.change, 0)} · CVR shop ${all?.cvrPrev != null && all.cvrCur != null ? `${fmtP(all.cvrPrev, 2, false)} → ${fmtP(all.cvrCur, 2, false)} ` : ""}(${fmtP(pc.change, 1)}) · ${METRIC.aov} suy ra ${fmtP(pa.change, 1)}`;
  }

  return (
    <>
      <DemoHead no={no} title={title} headline={headline} kpis={kpis} />
      <div className="stk">
        <div className="pn">
          <div className="pnh">Tăng trưởng GMV: livestream YFB, các kênh còn lại và lượt truy cập shop</div>
          <div className="pns">{curLbl} so với {prevLbl}. Các kênh còn lại (Affiliate LIVE, Video, Product card) là nhóm đối chứng, YFB không vận hành.</div>
          <Html html={cmpHtml} />
          <div className="legend">
            <span><i style={{ background: "var(--gold)" }} />Livestream YFB</span>
            <span><i style={{ background: BLUE }} />Các kênh còn lại</span>
            <span><i style={{ background: "#8a8a94" }} />Lượt truy cập shop</span>
          </div>
        </div>
        <div className="pn">
          <div className="pnh">Cơ cấu Total GMV theo kênh</div>
          <div className="pns">Tỷ trọng, {/^1–\d+\//.test(mixLabels[3] ?? "") ? `${mixLabels[3].replace(/\/\d+$/, "")} mỗi tháng` : "cả tháng"}. Seller LIVE gồm mọi phiên trên tài khoản shop.</div>
          <Html html={mixHtml} />
          <div className="legend">{segs.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
        </div>
      </div>
      <div className="pn">
        <div className="pnh">So sánh livestream YFB với các kênh còn lại</div>
        <div className="pns">Chênh lệch từ 10 điểm phần trăm trở lên mới xem là khác xu hướng chung của shop.</div>
        <Tbl html={tbl(mktHead, mktRows, [5])} />
      </div>
      {br3 && (
        <div className="pn">
          <div className="pnh">Đóng góp của từng kênh vào thay đổi Total GMV</div>
          <div className="pns">{prevLbl} → {curLbl}. Seller LIVE khác = phần Seller LIVE của tài khoản shop ngoài các phiên YFB, Product card là số ước tính từ số làm tròn; hai cột này sai lệch vài chục triệu. Trục bắt đầu từ {fmtM(br3Axis!)}.</div>
          <Html html={br3} />
        </div>
      )}
      {br4 && (
        <div className="pn">
          <div className="pnh">Phân rã Total GMV: lượt truy cập shop × CVR shop × {METRIC.aov}</div>
          <div className="pns">Cả kỳ {curLbl} so với {prevLbl}. {METRIC.aov} được suy ra từ ba số còn lại nên là ước tính; lượt truy cập làm tròn đến 1% nên mỗi phần có thể lệch vài chục triệu. Trục bắt đầu từ {fmtM(br4Axis!)}.</div>
          <Html html={br4} />
          <div className="legend"><span>{br4Legend}</span></div>
        </div>
      )}
      {insight}
    </>
  );
};

// ============ TRANG: Phân tích nguyên nhân ============
export interface WhyStats { gmvPerHour: number | null; viewsPerHour: number | null; err: number | null; ctor: number | null }
export interface FunnelStageLite { label: string; prev: number; cur: number }
export interface DemoWhyProps {
  no: string;
  title: string;
  fallbackHeadline: string;
  windowLabel: string;
  prevShort: string;
  stats: { prev: WhyStats; cur: WhyStats };
  band: number | null;
  drivers: DriverBreakdown | null;
  driverLabels: { from: string; to: string };
  funnel: { impressions: FunnelStageLite; views: FunnelStageLite; productImpressions: FunnelStageLite; productClicks: FunnelStageLite; orders: FunnelStageLite } | null;
  dayRows: DayTypeFactorRow[];
  keyMonths: KeyMetricsMonth[];
  monthShort: (m: string) => string;
  insight: React.ReactNode;
}
const nf = (v: number) => Math.round(v).toLocaleString("vi-VN");
const pct1 = (v: number) => fmtP(v, 2, false);
const FACTOR_ORDER = DAY_TYPE_FACTORS;
const TAB_CLS: Record<string, string> = { daily: "g-daily", dday: "g-dday", midmonth: "g-mm", payday: "g-pd" };
const ABS_ORDER = ["gmv", "hours", "gmvPerHour", "err", "viewsPerHour", "liveCtr", "ctor", "aov", "upt"];

const FunnelPanel: React.FC<{ funnel: NonNullable<DemoWhyProps["funnel"]>; band: number | null; prevShort: string }> = ({ funnel, band, prevShort }) => {
  const [mode, setMode] = useState<"p" | "i">("p");
  const { impressions: im, views: vw, productImpressions: pi, productClicks: pc, orders: od } = funnel;
  const chg = (p: number, c: number) => (p > 0 ? (c / p - 1) * 100 : null);
  const rate = (n: number, d: number) => (d > 0 ? (n / d) * 100 : null);
  const sig = (v: number | null) => v != null && band != null && Math.abs(v) > band;
  const ratio = [
    { n: METRIC.err, d: "Views ÷ LIVE impressions", p: rate(vw.prev, im.prev), c: rate(vw.cur, im.cur) },
    { n: METRIC.liveCtr, d: "Product clicks ÷ Views", p: rate(pc.prev, vw.prev), c: rate(pc.cur, vw.cur) },
    { n: METRIC.ctor, d: "Orders ÷ Product clicks", p: rate(od.prev, pc.prev), c: rate(od.cur, pc.cur) }
  ].map((r) => ({ ...r, chg: r.p != null && r.c != null && r.p > 0 ? (r.c / r.p - 1) * 100 : null }));
  const stages = [im, vw, pc, od];
  const ratioFor = [ratio[0], ratio[1], ratio[2]];
  const idx = (s: FunnelStageLite) => (s.prev > 0 ? (s.cur / s.prev) * 100 : 0);
  const chgCls = (v: number | null, neutral: boolean) => (v == null || neutral ? "nt" : sig(v) ? (v > 0 ? "up" : "dn") : "nt");
  const hbHtml = hbars(
    [
      { name: im.label, sub: `${fmtM(im.prev)} → ${fmtM(im.cur)}`, value: idx(im), text: String(Math.round(idx(im))), cls: idx(im) > 100 ? "blue" : "" },
      { name: vw.label, sub: `${nf(vw.prev)} → ${nf(vw.cur)}`, value: idx(vw), text: String(Math.round(idx(vw))), cls: idx(vw) < 97 ? "red" : "" },
      { name: pi.label, sub: `${fmtM(pi.prev)} → ${fmtM(pi.cur)}`, value: idx(pi), text: String(Math.round(idx(pi))), dim: true },
      { name: pc.label, sub: `${nf(pc.prev)} → ${nf(pc.cur)}`, value: idx(pc), text: String(Math.round(idx(pc))), cls: idx(pc) < 97 ? "red" : "" },
      { name: od.label, sub: `${nf(od.prev)} → ${nf(od.cur)}`, value: idx(od), text: String(Math.round(idx(od))), dim: true }
    ].map((r) => ({ ...r, mark: 100 })),
    Math.max(120, Math.ceil(Math.max(...[im, vw, pi, pc, od].map(idx)) / 10) * 10 + 7)
  );
  const tableHtml = tbl(
    ["Tỷ lệ", prevShort, "Tháng này", "±"],
    [
      [`${METRIC.err} (Views ÷ LIVE impressions)`, pct1(ratio[0].p ?? 0), { t: pct1(ratio[0].c ?? 0), c: chgCls(ratio[0].chg, false) }, { t: sgn(ratio[0].chg), c: chgCls(ratio[0].chg, false) }],
      ["Product CTR", pct1(rate(pc.prev, pi.prev) ?? 0), pct1(rate(pc.cur, pi.cur) ?? 0), { t: sgn(rate(pc.prev, pi.prev) && rate(pc.cur, pi.cur) ? ((rate(pc.cur, pi.cur) as number) / (rate(pc.prev, pi.prev) as number) - 1) * 100 : null), c: "nt" }],
      [`${METRIC.ctor} (Orders ÷ Product clicks)`, pct1(ratio[2].p ?? 0), { t: pct1(ratio[2].c ?? 0), c: chgCls(ratio[2].chg, false) }, { t: sgn(ratio[2].chg), c: chgCls(ratio[2].chg, false) }]
    ]
  );
  return (
    <div className="pn">
      <div className="pnh">Phễu LIVE</div>
      <div className="pns">Hai cách xem: chuỗi chuyển đổi (số tuyệt đối và tỷ lệ giữa các bậc) hoặc chỉ số hoá (tháng trước = 100, vạch trắng = tháng trước).</div>
      <div className="tabs" id="funnelMode">
        <button type="button" className={mode === "p" ? "seg-on" : ""} onClick={() => setMode("p")}>Chuỗi chuyển đổi</button>
        <button type="button" className={mode === "i" ? "seg-on" : ""} onClick={() => setMode("i")}>Chỉ số hoá ({prevShort} = 100)</button>
      </div>
      {mode === "p" ? (
        <div className="pipe" style={{ display: "flex" }}>
          {stages.map((s, i) => {
            const c = chg(s.prev, s.cur);
            const r = ratioFor[i];
            const rs = r ? sig(r.chg) : false;
            return (
              <React.Fragment key={s.label}>
                <div className="stg">
                  <div className="n">{s.label}</div>
                  <div className="v">{nf(s.cur)}</div>
                  <div className="p">{prevShort}: {nf(s.prev)}</div>
                  <div className={i === 0 && c != null && c > 0 ? "up" : "nt"} style={{ marginTop: 6, fontSize: 12 }}>{sgn(c)}</div>
                </div>
                {r && (
                  <div className={`arw${rs ? " sig" : ""}`}>
                    <div className="n" style={{ fontWeight: 700 }}>{r.n}</div>
                    <div className="rt">{fmtP(r.c ?? 0, i === 1 ? 1 : 2, false)}</div>
                    <div className="ar">→</div>
                    <div>{prevShort}: {fmtP(r.p ?? 0, i === 1 ? 1 : 2, false)}</div>
                    <div className={rs ? "dn" : (r.chg ?? 0) > 0 ? "up" : "nt"} style={{ fontWeight: 700 }}>{sgn(r.chg)}{rs ? " · vượt ngưỡng" : ""}</div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <Html className="hb" html={hbHtml} />
      )}
      <div className="tw" style={{ marginTop: 12 }}>
        <table dangerouslySetInnerHTML={{ __html: tableHtml }} />
      </div>
    </div>
  );
};

export const DemoWhyPage: React.FC<DemoWhyProps> = ({ no, title, fallbackHeadline, windowLabel, prevShort, stats, band, drivers, driverLabels, funnel, dayRows, keyMonths, monthShort, insight }) => {
  const c = (p: number | null, q: number | null) => pctOf(p, q);
  const gph = c(stats.prev.gmvPerHour, stats.cur.gmvPerHour), vph = c(stats.prev.viewsPerHour, stats.cur.viewsPerHour), err = c(stats.prev.err, stats.cur.err), ctor = c(stats.prev.ctor, stats.cur.ctor);
  const sig = (v: number | null) => v != null && band != null && Math.abs(v) > band;
  const col = (v: number | null): "red" | "green" | undefined => (v == null ? undefined : v < 0 ? "red" : "green");
  const kpis: DemoKpi[] = [
    { label: METRIC.gmvPerHour, value: stats.cur.gmvPerHour != null ? fmtM(stats.cur.gmvPerHour) : "—", note: `${sgn(gph)} so với ${prevShort}`, color: col(gph) },
    { label: METRIC.viewsPerHour, value: stats.cur.viewsPerHour != null ? nf(stats.cur.viewsPerHour) : "—", note: `${sgn(vph)}${band != null ? ` · ngưỡng ±${Math.round(band)}%` : ""}`, color: col(vph) },
    { label: METRIC.err, value: stats.cur.err != null ? pct1(stats.cur.err) : "—", note: `${sgn(err)}${sig(err) ? (err! < 0 ? " · giảm có ý nghĩa" : " · tăng có ý nghĩa") : ""}`, color: col(err) },
    { label: METRIC.ctor, value: stats.cur.ctor != null ? pct1(stats.cur.ctor) : "—", note: `${sgn(ctor)} so với ${stats.prev.ctor != null ? pct1(stats.prev.ctor) : "—"}`, color: col(ctor) }
  ];
  // tiêu đề kết luận: bước nghẽn = yếu tố đóng góp âm lớn nhất
  const worst = drivers ? [...drivers.parts].sort((x, y) => x.value - y.value)[0] : null;
  const headline = drivers && worst && worst.value < 0
    ? `${METRIC.gmvPerHour} ${sgn(gph)}: yếu tố kéo giảm nhiều nhất là ${DRIVER_LABEL[worst.key]} (${fmtP(worst.change)}, ${M(worst.value)})`
    : fallbackHeadline;

  let bridge = "";
  if (drivers) {
    const steps = drivers.parts.map((p) => p.value);
    const ax = axis(drivers.from, steps);
    bridge = waterfall(
      [
        { l: driverLabels.from, v: drivers.from, t: "total", txt: fmtM(drivers.from) },
        ...drivers.parts.map((p) => ({ l: DRIVER_LABEL[p.key], v: p.value, t: "delta", txt: M(p.value) })),
        { l: driverLabels.to, v: drivers.to, t: "total", txt: fmtM(drivers.to) }
      ],
      { min: ax.min, max: ax.max, h: 290 }
    );
  }

  // Thay đổi các yếu tố theo loại ngày
  const dayHtml = dayRows.length
    ? tbl(
        ["Loại ngày", METRIC.liveHours, METRIC.viewsPerHour, METRIC.liveCtr, METRIC.ctor, METRIC.aov, METRIC.gmvPerHour, "Ngưỡng", "Đánh giá"],
        dayRows.map((r) => {
          const gp = r.change.gmvPerHour;
          const [t, k] = r.band == null ? ["chưa đủ phiên", "m"] : r.significant ? [(gp ?? 0) < 0 ? "giảm có ý nghĩa" : "tăng có ý nghĩa", (gp ?? 0) < 0 ? "r" : "g"] : ["trong ngưỡng dao động", "m"];
          return [
            `${DAY_TYPE_SHORT[r.key]}<br><span class="nt" style="font-size:11px">${r.sessionsPrev} → ${r.sessionsCur} phiên</span>`,
            ...FACTOR_ORDER.map((f, i) => {
              const v = r.change[f];
              if (v == null) return "—";
              return { t: fmtP(v), c: "hm", s: (i === 0 ? heat(v, 40, BLUE, BLUE) : heat(v, 30)) + (i > 0 && r.band != null && Math.abs(v) > r.band ? ";box-shadow:inset 0 0 0 1.5px var(--cream);font-weight:800" : "") };
            }),
            r.band != null ? `±${Math.round(r.band)}%` : "—",
            W(pill(t, k))
          ];
        }),
        [8]
      )
    : "";

  // Số đo từng loại ngày
  const tabs = (["daily", "dday", "midmonth", "payday"] as const).filter((t) => keyMonths.some((m) => m.stats[t].sessions > 0));
  let absHtml = "";
  if (keyMonths.length >= 2 && tabs.length) {
    const rows = dayAbsRows(keyMonths, [...tabs]);
    const def = (k: string) => KEY_METRICS.find((d) => d.key === k)!;
    const ordered = ABS_ORDER.filter((k) => DAY_ABS_METRICS.includes(k as never)).map((k) => rows.find((r) => r.key === k)!).filter(Boolean);
    const nM = keyMonths.length;
    absHtml =
      `<thead><tr><th rowspan="2">Chỉ số</th>${tabs.map((t) => `<th class="grpH gs ${TAB_CLS[t]}" colspan="${nM}">${DAY_TYPE_SHORT[t]}</th>`).join("")}</tr><tr>${tabs.map((t) => keyMonths.map((m, i) => `<th class="sub${i === 0 ? " gs" : ""} ${TAB_CLS[t]}">${monthShort(m.month)}</th>`).join("")).join("")}</tr></thead><tbody>` +
      ordered
        .map(
          (r) =>
            `<tr><td><b>${def(r.key).label}</b></td>${tabs
              .map((t) =>
                (r.cells[t] ?? [])
                  .map((cell, i) => {
                    const txt = cell.value != null ? fmtKeyMetric(def(r.key), cell.value) : "—";
                    if (i === 0) return `<td class="cellc base gs ${TAB_CLS[t]}">${txt}</td>`;
                    const v = cell.change;
                    const neutral = r.key === "hours";
                    const st = v == null ? "" : (neutral ? heat(v, 40, BLUE, BLUE) : heat(v, 30)) + (cell.significant ? ";box-shadow:inset 0 0 0 1.5px var(--cream);font-weight:800" : "");
                    return `<td class="cellc" style="${st}">${txt}${v != null ? `<small>${fmtP(v)}</small>` : ""}</td>`;
                  })
                  .join("")
              )
              .join("")}</tr>`
        )
        .join("") +
      "</tbody>";
  }
  const first = keyMonths[0] ? monthShort(keyMonths[0].month) : "";

  return (
    <>
      <DemoHead no={no} title={title} headline={headline} kpis={kpis} />
      <div className="stk">
        <div className="pn">
          <div className="pnh">Đóng góp của từng yếu tố vào thay đổi LIVE GMV</div>
          <div className="pns">GMV = {METRIC.liveHours} × {METRIC.viewsPerHour} × {METRIC.liveCtr} × {METRIC.ctor} × {METRIC.aov} · {windowLabel} · 5 phần cộng đúng mức thay đổi.</div>
          {bridge ? <Html html={bridge} /> : <p className="pns">Chưa đủ số của cả 2 kỳ (Giờ live, Views, Product clicks, Orders) để tách nguyên nhân.</p>}
        </div>
        {funnel && <FunnelPanel funnel={funnel} band={band} prevShort={prevShort} />}
      </div>
      {dayHtml && (
        <div className="pn">
          <div className="pnh">Thay đổi các yếu tố theo loại ngày</div>
          <div className="pns">% thay đổi tháng này so với tháng trước; mỗi loại ngày so với chính nó theo lịch Campaign. Viền sáng = vượt ngưỡng dao động.</div>
          <Tbl html={dayHtml} />
          <div className="legend"><span>Màu xanh: tăng · màu đỏ: giảm · màu xanh dương: {METRIC.liveHours} (do lịch quyết định, không đánh giá tốt hay xấu)</span></div>
        </div>
      )}
      {absHtml && (
        <div className="pn">
          <div className="pnh">Số đo từng loại ngày</div>
          <div className="pns">Mỗi ô tô màu theo mức thay đổi so với tháng trước (xanh tăng, đỏ giảm, đậm hơn khi thay đổi lớn); viền sáng = vượt ngưỡng dao động. Mỗi loại ngày là một nhóm cột {keyMonths.map((m) => monthShort(m.month)).join(", ")} cùng màu nhận diện.</div>
          <div className="tw"><table id="dayAbs" className="vt" dangerouslySetInnerHTML={{ __html: absHtml }} /></div>
          <div className="legend"><span>{keyMonths[1] ? monthShort(keyMonths[1].month) : ""} tô màu theo thay đổi so với {first}, {keyMonths[2] ? `${monthShort(keyMonths[2].month)} theo thay đổi so với ${monthShort(keyMonths[1].month)}` : ""} · {first} là mốc, không tô · viền sáng = vượt ngưỡng dao động · xanh dương = {METRIC.liveHours}</span></div>
          <details>
            <summary>Ghi chú</summary>
            <p>UPT và Avg. price có thể gồm quà tặng kèm của các chương trình trong kỳ. Report chưa tách quà tặng theo loại ngày.</p>
            <p>Tách cơ cấu và hiệu suất: hiệu ứng cơ cấu = thay đổi tỷ trọng Giờ live giữa Daily và các đợt Campaign; hiệu ứng hiệu suất = thay đổi GMV/giờ trong từng loại ngày.</p>
          </details>
        </div>
      )}
      {insight}
    </>
  );
};
