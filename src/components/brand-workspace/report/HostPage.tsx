import React, { useState } from "react";
import { fmtVndShort } from "../../../lib/format";
import { METRIC } from "../../../lib/metricGlossary";
import { HOST_DAY_TYPE_ORDER, MIN_SESSIONS_TO_COMPARE, DAY_TYPE_DIFF_THRESHOLD, dayTypeMetrics, sumDayTypeParts, vsTeam, type DayTypeMetrics, type DayTypePart, type HostDayTypeRow } from "../../../lib/performance/hostPerformance";
import { reliabilityText, type HostReliability } from "../../../lib/report/deepAnalysis";
import type { CampDayBucket } from "../../../lib/campaignDays";
import type { SessionSpread } from "../../../lib/report/rhythm";
import { DAY_TYPE_SHORT } from "./theme";
import { fmtHours, fmtInt, fmtPct, fmtSessionStart } from "./format";
import { ch, columns, scatter, tbl } from "./demoCharts";
import type { PageMetric } from "./ui";

// Trang 6 "Host & khung giờ" dựng theo demo (scratchpad/build/template.html, #p6): KPI → hồ sơ host (4 cặp chỉ số) + GMV/giờ theo khung giờ
// → Host PFM cả tháng → Host PFM theo loại ngày (tab) → phân bố GMV/giờ + bảng khung giờ → Top phiên. Markup/class lấy nguyên từ demo.

const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c as "&" | "<" | ">" | '"']));
const dec = (v: number, d: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
const M1 = (v: number) => dec(v / 1e6, 1) + "M";
const pctSigned = (v: number, d = 0) => `${v >= 0 ? "+" : "−"}${dec(Math.abs(v), d)}%`;
const GREY = "#8a8a94";
const MIN_RANK_SESSIONS = 5; // demo: "Chưa xếp hạng host dưới 5 phiên"

export interface HostSlotRow {
  label: string;
  prevN: number;
  curN: number;
  prev: number | null;
  cur: number | null;
  change: number | null;
  band: number | null;
  tone: "up" | "down" | "flat";
}

export interface HostTopSession {
  roomId?: string | null;
  startTime: string;
  hours: number;
  gmv: number;
  gmvPerHour: number;
  orders: number;
  views: number;
  ctr: number | null;
  ctor: number | null;
}

export interface HostPageData {
  rows: HostDayTypeRow[];
  team: Record<CampDayBucket, DayTypePart>;
  vsPeer: Map<string, number | null>;
  reliability: Map<string, HostReliability>;
  relMonths: number;
  shortName: (full: string) => string;
  slots: HostSlotRow[];
  spread: SessionSpread | null;
  top: HostTopSession[];
  prevPeriod: string; // "1–26/09" hoặc "T9"
  curPeriod: string;
  prevMonthLabel: string; // "T9"
  curMonthLabel: string; // "T10"
}

type HostAll = { key: string; name: string; m: DayTypeMetrics };

const hostsAll = (rows: HostDayTypeRow[]): HostAll[] =>
  rows
    .map((r) => ({ key: r.key, name: r.name, m: dayTypeMetrics(sumDayTypeParts(r.byBucket)) }))
    .filter((h) => h.m.sessions > 0 && h.m.hours > 0)
    .sort((a, b) => b.m.gmv - a.m.gmv);

const teamAll = (team: Record<CampDayBucket, DayTypePart>) => dayTypeMetrics(sumDayTypeParts(team));

/** Bốn ô KPI đầu trang (thứ tự demo): host đứng đầu GMV/giờ · trung bình team · khung giờ lệch rõ nhất · trung vị GMV/giờ mỗi phiên. */
export function hostKpis(d: HostPageData): PageMetric[] {
  const out: PageMetric[] = [];
  const hs = hostsAll(d.rows).filter((h) => h.m.gmvPerHour != null);
  const ranked = hs.filter((h) => h.m.sessions >= MIN_RANK_SESSIONS);
  const best = [...(ranked.length ? ranked : hs)].sort((a, b) => b.m.gmvPerHour! - a.m.gmvPerHour!)[0];
  if (best) {
    const r = d.reliability.get(best.key);
    out.push({
      label: `${d.shortName(best.name)} · ${METRIC.gmvPerHour}`,
      value: fmtVndShort(best.m.gmvPerHour),
      note: `${r ? `${reliabilityText({ ratio: r.ratio, lo: null, hi: null })} so với trung bình ${d.relMonths} tháng · ` : ""}${best.m.sessions} phiên`
    });
  }
  const t = teamAll(d.team);
  if (t.sessions > 0 && t.gmvPerHour != null) out.push({ label: `Trung bình team · ${METRIC.gmvPerHour}`, value: fmtVndShort(t.gmvPerHour), note: `${t.sessions} phiên · ${dec(t.hours, 1)} giờ` });
  const slot = [...d.slots].filter((s) => s.cur != null).sort((a, b) => Math.abs(b.change ?? 0) / (b.band || 100) - Math.abs(a.change ?? 0) / (a.band || 100))[0];
  if (slot && slot.cur != null) {
    out.push({ label: slot.label, value: fmtVndShort(slot.cur), note: slot.change != null ? `${pctSigned(slot.change)}${slot.band != null ? ` · ngưỡng ±${dec(slot.band, 0)}%` : ""}` : undefined });
  }
  if (d.spread) out.push({ label: `Trung vị ${METRIC.gmvPerHour} mỗi phiên`, value: fmtVndShort(d.spread.median), note: `nửa giữa: ${fmtVndShort(d.spread.p25)}–${fmtVndShort(d.spread.p75)}` });
  return out;
}

// ---- Hồ sơ host: 4 cặp chỉ số ----
type PairKey = "a" | "b" | "c" | "d";

function pairHtml(k: PairKey, hs: HostAll[], t: DayTypeMetrics, shortName: (n: string) => string) {
  const f2 = (v: number) => dec(v, 2) + "%";
  const num0 = (v: number) => Math.round(v).toLocaleString("vi-VN");
  const gph = (h: HostAll) => (h.m.gmvPerHour ?? 0) / 1e6;
  const spec = {
    a: { name: `${METRIC.viewsPerHour} × ${METRIC.ctor}`, title: `Traffic và chuyển đổi: ${METRIC.viewsPerHour} × ${METRIC.ctor}`, sub: `Host nào kéo nhiều người xem, host nào chuyển đơn tốt. Đường nét đứt = trung bình team.`, x: (h: HostAll) => h.m.viewsPerHour, y: (h: HostAll) => h.m.ctor, xf: num0, yf: f2, xl: METRIC.viewsPerHour, yl: METRIC.ctor, vx: t.viewsPerHour, vy: t.ctor, quad: [`${METRIC.viewsPerHour} thấp · ${METRIC.ctor} cao`, `${METRIC.viewsPerHour} cao · ${METRIC.ctor} thấp`] as [string, string] },
    b: { name: `${METRIC.viewsPerHour} × ${METRIC.gmvPerHour}`, title: `Traffic và doanh thu: ${METRIC.viewsPerHour} × ${METRIC.gmvPerHour}`, sub: `${METRIC.gmvPerHour} đi theo ${METRIC.viewsPerHour} ra sao. Đường nét đứt = trung bình team.`, x: (h: HostAll) => h.m.viewsPerHour, y: (h: HostAll) => gph(h), xf: num0, yf: (v: number) => dec(v, 0) + "M", xl: METRIC.viewsPerHour, yl: `${METRIC.gmvPerHour} (triệu)`, vx: t.viewsPerHour, vy: (t.gmvPerHour ?? 0) / 1e6, quad: [`${METRIC.viewsPerHour} thấp · ${METRIC.gmvPerHour} cao`, `${METRIC.viewsPerHour} cao · ${METRIC.gmvPerHour} thấp`] as [string, string] },
    c: { name: `${METRIC.liveCtr} × ${METRIC.ctor}`, title: `Hai bước chuyển đổi: ${METRIC.liveCtr} × ${METRIC.ctor}`, sub: `${METRIC.liveCtr} = Product clicks ÷ Views; ${METRIC.ctor} = Orders ÷ Product clicks. Đường nét đứt = trung bình team.`, x: (h: HostAll) => h.m.liveCtr, y: (h: HostAll) => h.m.ctor, xf: (v: number) => dec(v, 0) + "%", yf: f2, xl: METRIC.liveCtr, yl: METRIC.ctor, vx: t.liveCtr, vy: t.ctor, quad: [`${METRIC.liveCtr} thấp · ${METRIC.ctor} cao`, `${METRIC.liveCtr} cao · ${METRIC.ctor} thấp`] as [string, string] },
    d: { name: `${METRIC.liveHours} × ${METRIC.gmvPerHour}`, title: `Quy mô và hiệu suất: ${METRIC.liveHours} × ${METRIC.gmvPerHour}`, sub: `Host làm nhiều giờ có giữ được hiệu suất không. Host dưới ${MIN_RANK_SESSIONS} phiên để màu xám. Đường nét đứt = ${METRIC.gmvPerHour} trung bình team.`, x: (h: HostAll) => h.m.hours, y: (h: HostAll) => gph(h), xf: (v: number) => dec(v, 0) + "h", yf: (v: number) => dec(v, 0) + "M", xl: METRIC.liveHours, yl: `${METRIC.gmvPerHour} (triệu)`, vx: null as number | null, vy: (t.gmvPerHour ?? 0) / 1e6, quad: ["Ít giờ · " + METRIC.gmvPerHour + " cao", "Nhiều giờ · " + METRIC.gmvPerHour + " thấp"] as [string, string] }
  }[k];
  const raw = hs.map((h) => ({ h, x: spec.x(h), y: spec.y(h) })).filter((p): p is { h: HostAll; x: number; y: number } => p.x != null && p.y != null);
  const extent = (a: number[], extra: (number | null)[], step: number, forceZero = false) => {
    const all = [...a, ...extra.filter((v): v is number => v != null)];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const g = Math.max((hi - lo) * 0.12, step / 2);
    return [forceZero ? 0 : Math.floor((lo - g) / step) * step, Math.ceil((hi + g) / step) * step] as const;
  };
  const stepX = k === "d" ? 10 : k === "c" ? 1 : k === "a" || k === "b" ? 200 : 1;
  const stepY = k === "b" || k === "d" ? 2 : 0.04;
  const [x0, x1] = extent(raw.map((p) => p.x), [spec.vx], stepX, k === "d");
  const [y0, y1] = extent(raw.map((p) => p.y), [spec.vy], stepY);
  const pts = raw.map((p, i) => {
    const r = Math.sqrt(Math.max(p.h.m.hours, 0)) * 2.4;
    const above = i % 2 === 0;
    return { x: p.x, y: p.y, r, l: esc(shortNameOf(shortName, p.h)), color: p.h.m.sessions < MIN_RANK_SESSIONS ? GREY : "var(--gold)", dx: 0, dy: above ? -r - 5 : r + 13, a: "middle" as string };
  });
  const svg = scatter(pts, { x0, x1, kx: 7, y0, y1, ky: 4, xf: spec.xf, yf: spec.yf, xl: spec.xl, yl: spec.yl, vx: spec.vx ?? undefined, vy: spec.vy, h: 330, quad: [{ x: 56, y: 28, t: spec.quad[0] }, { x: 628, y: 292, t: spec.quad[1], a: "end" }] });
  // Câu nhận xét dưới biểu đồ: nêu host nổi nhất của đúng cặp đang xem, số lấy từ dữ liệu.
  const top = (f: (h: HostAll) => number | null, dir: 1 | -1 = 1) => [...hs].filter((h) => f(h) != null).sort((a, b) => dir * (f(b)! - f(a)!))[0];
  const nm = (h?: HostAll) => (h ? shortNameOf(shortName, h) : "—");
  let cap = "";
  if (hs.length) {
    if (k === "a") {
      const v = top((h) => h.m.viewsPerHour);
      const c = top((h) => h.m.ctor);
      cap = `${nm(v)} kéo nhiều người xem nhất (${num0(v.m.viewsPerHour!)} ${METRIC.viewsPerHour}) với ${METRIC.ctor} ${f2(v.m.ctor ?? 0)}, trung bình team ${f2(t.ctor ?? 0)}; ${nm(c)} có ${METRIC.ctor} cao nhất (${f2(c.m.ctor!)}).`;
    } else if (k === "b") {
      const g = top((h) => h.m.gmvPerHour);
      const v = top((h) => h.m.viewsPerHour, -1);
      cap = `${nm(g)} có ${METRIC.gmvPerHour} cao nhất (${M1(g.m.gmvPerHour!)}); ${nm(v)} có ${METRIC.viewsPerHour} thấp nhất (${num0(v.m.viewsPerHour!)}), ${METRIC.gmvPerHour} ${M1(v.m.gmvPerHour ?? 0)}.`;
    } else if (k === "c") {
      const l = top((h) => h.m.liveCtr);
      const c = top((h) => h.m.ctor);
      cap = `${nm(l)} có ${METRIC.liveCtr} cao nhất (${dec(l.m.liveCtr!, 1)}%); ${nm(c)} có ${METRIC.ctor} cao nhất (${f2(c.m.ctor!)}).`;
    } else {
      const h = top((x) => x.m.hours);
      cap = `${nm(h)} có nhiều ${METRIC.liveHours} nhất (${dec(h.m.hours, 1)}) với ${METRIC.gmvPerHour} ${M1(h.m.gmvPerHour ?? 0)}. Host dưới ${MIN_RANK_SESSIONS} phiên chưa đủ mẫu để kết luận.`;
    }
  }
  return { name: spec.name, title: spec.title, sub: spec.sub, svg, cap };
}
const shortNameOf = (shortName: (n: string) => string, h: HostAll) => shortName(h.name);

// ---- Bảng Host PFM ----
function hostTableHtml(d: HostPageData, hs: HostAll[]): string {
  const best = [...hs].filter((h) => h.m.sessions >= MIN_RANK_SESSIONS && h.m.gmvPerHour != null).sort((a, b) => b.m.gmvPerHour! - a.m.gmvPerHour!)[0];
  const sorted = [...hs].sort((a, b) => (b.m.gmvPerHour ?? 0) - (a.m.gmvPerHour ?? 0));
  return tbl(
    ["Host", `${METRIC.liveHours} · phiên`, METRIC.gmv, METRIC.gmvPerHour, METRIC.viewsPerHour, METRIC.liveCtr, METRIC.ctor, METRIC.upt, `So trung bình ${d.relMonths} tháng`, "So trung bình tháng này"],
    sorted.map((h) => {
      const r = d.reliability.get(h.key);
      const vp = d.vsPeer.get(h.key);
      const rel = r ? { t: `${reliabilityText({ ratio: r.ratio, lo: null, hi: null })} · ${r.sessions} phiên`, c: r.verdict === "above" ? "up" : r.verdict === "below" ? "dn" : "" } : "—";
      return {
        c: [esc(d.shortName(h.name)), `${fmtHours(h.m.hours)} · ${h.m.sessions}`, fmtVndShort(h.m.gmv), M1(h.m.gmvPerHour ?? 0), fmtInt(h.m.viewsPerHour ?? 0), dec(h.m.liveCtr ?? 0, 1) + "%", fmtPct(h.m.ctor), dec(h.m.upt ?? 0, 2), rel, vp == null ? "—" : ch(pctSigned(vp), 15)],
        hl: !!best && best.key === h.key
      };
    })
  );
}

function hostDayTableHtml(d: HostPageData, b: CampDayBucket): string {
  const part = (r: HostDayTypeRow) => dayTypeMetrics(r.byBucket[b]);
  const t = dayTypeMetrics(d.team[b]);
  const hs = d.rows.map((r) => ({ name: r.name, m: part(r) })).filter((h) => h.m.sessions > 0).sort((a, b2) => b2.m.gmv - a.m.gmv);
  const cell = (txt: string, h: { m: DayTypeMetrics }, key?: "gmvPerHour" | "viewsPerHour" | "liveCtr" | "ctor") => {
    const dv = key ? vsTeam(h.m, t, key) : null;
    if (dv == null || Math.abs(dv) < DAY_TYPE_DIFF_THRESHOLD) return txt;
    return { t: `${txt} ${dv > 0 ? "▲" : "▼"}`, c: dv > 0 ? "up" : "dn" };
  };
  const rowOf = (label: string, f: (m: DayTypeMetrics) => string, key?: "gmvPerHour" | "viewsPerHour" | "liveCtr" | "ctor") => [label, f(t), ...hs.map((h) => cell(f(h.m), h, key))];
  return tbl(
    ["Chỉ số", "Cả team", ...hs.map((h) => esc(`${d.shortName(h.name)}${h.m.sessions < MIN_SESSIONS_TO_COMPARE ? ` · ${h.m.sessions}` : ""}`))],
    [
      rowOf(METRIC.gmv, (m) => fmtVndShort(m.gmv)),
      rowOf(`${METRIC.liveHours} · phiên`, (m) => `${fmtHours(m.hours)} · ${m.sessions}`),
      rowOf(METRIC.gmvPerHour, (m) => M1(m.gmvPerHour ?? 0), "gmvPerHour"),
      rowOf(METRIC.viewsPerHour, (m) => fmtInt(m.viewsPerHour ?? 0), "viewsPerHour"),
      rowOf(METRIC.liveCtr, (m) => dec(m.liveCtr ?? 0, 1) + "%", "liveCtr"),
      rowOf(METRIC.ctor, (m) => fmtPct(m.ctor), "ctor")
    ]
  );
}

function spreadHtml(s: SessionSpread): string {
  const max = Math.max(10, Math.ceil((s.best * 1.1) / 1e6 / 5) * 5);
  const sc = (v: number) => (v / 1e6 / max) * 100;
  const pts: [number, string][] = [[s.worst, `Thấp nhất ${M1(s.worst)}`], [s.p25, `P25 ${M1(s.p25)}`], [s.p75, `P75 ${M1(s.p75)}`], [s.best, `Cao nhất ${M1(s.best)}`]];
  return (
    `<div class="ln" style="left:${sc(s.worst)}%;width:${sc(s.best) - sc(s.worst)}%"></div><div class="box" style="left:${sc(s.p25)}%;width:${sc(s.p75) - sc(s.p25)}%"></div><div class="med" style="left:${sc(s.median)}%"></div>` +
    pts.map((p, i) => `<span class="lb${i % 2 ? " b" : ""}" style="left:${sc(p[0])}%">${p[1]}</span>`).join("") +
    `<span class="lb b" style="left:${sc(s.median)}%;color:var(--cream)">Trung vị ${M1(s.median)}</span>`
  );
}

export const HostPageBody: React.FC<{ data: HostPageData; children?: React.ReactNode }> = ({ data: d, children }) => {
  const [pair, setPair] = useState<PairKey>("a");
  const [dayTab, setDayTab] = useState<CampDayBucket | null>(null);
  const hs = hostsAll(d.rows);
  const team = teamAll(d.team);
  const dayTabs = HOST_DAY_TYPE_ORDER.filter((b) => d.team[b].sessions > 0);
  const activeDay = dayTab && dayTabs.includes(dayTab) ? dayTab : dayTabs[0] ?? null;
  const P = hs.length >= 3 ? pairHtml(pair, hs, team, d.shortName) : null;
  const PAIR_KEYS: PairKey[] = ["a", "b", "c", "d"];
  const pairNames = PAIR_KEYS.map((k) => ({ k, name: hs.length >= 3 ? pairHtml(k, hs, team, d.shortName).name : "" }));
  const slotMax = Math.max(5, Math.ceil((Math.max(...d.slots.flatMap((s) => [s.prev ?? 0, s.cur ?? 0])) / 1e6) * 1.25 / 5) * 5);
  const slotChart = columns(
    d.slots.map((s) => ({ l: `${s.label}\n${s.curN} phiên`, v: [s.prev != null ? s.prev / 1e6 : null, s.cur != null ? s.cur / 1e6 : null] })),
    [{ color: "var(--blue)" }, { color: "var(--gold)" }],
    { min: 0, max: slotMax, h: 260, fmt: (v: number) => dec(v, 1) + "M" }
  );
  return (
    <>
      {children}
      <div className="stk">
        {P && (
          <div className="pn">
            <div className="pnh">{P.title}</div>
            <div className="pns">{P.sub}</div>
            <div className="tabs">
              {pairNames.map((p) => (
                <button key={p.k} type="button" className={p.k === pair ? "seg-on" : ""} onClick={() => setPair(p.k)}>{p.name}</button>
              ))}
            </div>
            <div dangerouslySetInnerHTML={{ __html: P.svg }} />
            <div className="legend"><span style={{ color: "var(--cream)" }}>{P.cap}</span></div>
          </div>
        )}
        {d.slots.some((s) => s.cur != null || s.prev != null) && (
          <div className="pn">
            <div className="pnh">{METRIC.gmvPerHour} theo khung giờ bắt đầu phiên</div>
            <div className="pns">{`${d.prevPeriod} so với ${d.curPeriod}. Chỉ có ý nghĩa khi vượt ngưỡng dao động.`}</div>
            <div dangerouslySetInnerHTML={{ __html: slotChart }} />
            <div className="legend">
              <span><i style={{ background: "var(--blue)" }} />{d.prevPeriod}</span>
              <span><i style={{ background: "var(--gold)" }} />{d.curPeriod}</span>
            </div>
          </div>
        )}
      </div>
      {hs.length > 0 && (
        <div className="pn">
          <div className="pnh">Host PFM · cả tháng</div>
          <div className="pns">{`So với trung bình các host cùng loại ngày, cùng buổi; gộp ${d.relMonths} tháng, khoảng tin cậy 95%.`}</div>
          <div className="tw"><table dangerouslySetInnerHTML={{ __html: hostTableHtml(d, hs) }} /></div>
        </div>
      )}
      {activeDay && (
        <div className="pn">
          <div className="pnh">Host PFM · theo loại ngày</div>
          <div className="tabs">
            {dayTabs.map((b) => (
              <button key={b} type="button" className={b === activeDay ? "seg-on" : ""} onClick={() => setDayTab(b)}>{`${DAY_TYPE_SHORT[b]} · ${d.team[b].sessions} phiên`}</button>
            ))}
          </div>
          <div className="tw"><table dangerouslySetInnerHTML={{ __html: hostDayTableHtml(d, activeDay) }} /></div>
          <div className="legend"><span>▲ ▼ = cao hơn / thấp hơn trung bình team có ý nghĩa trong loại ngày đó</span></div>
        </div>
      )}
      <div className="stk">
        {d.spread && (
          <div className="pn">
            <div className="pnh">{`Phân bố ${METRIC.gmvPerHour} của ${d.spread.count} phiên`}</div>
            <div className="pns">Bỏ phiên dưới 6 phút. Vạch trắng = trung vị.</div>
            <div className="bx" dangerouslySetInnerHTML={{ __html: spreadHtml(d.spread) }} />
          </div>
        )}
        {d.slots.some((s) => s.cur != null || s.prev != null) && (
          <div className="pn">
            <div className="pnh">{METRIC.gmvPerHour} theo khung giờ</div>
            <div className="tw">
              <table
                dangerouslySetInnerHTML={{
                  __html: tbl(
                    ["Khung giờ", "Phiên", d.prevMonthLabel, d.curMonthLabel, "±", "Ngưỡng"],
                    d.slots.map((s) => [
                      esc(s.label),
                      `${s.prevN} → ${s.curN}`,
                      s.prev != null ? fmtVndShort(s.prev) : "—",
                      s.cur != null ? fmtVndShort(s.cur) : "—",
                      s.change == null ? "—" : { t: pctSigned(s.change), c: s.tone === "down" ? "dn" : s.tone === "up" ? "up" : "nt" },
                      s.band == null ? "—" : `±${dec(s.band, 0)}%`
                    ])
                  )
                }}
              />
            </div>
          </div>
        )}
      </div>
      <div className="pn">
        <div className="pnh">{`Top ${d.top.length} phiên theo GMV`}</div>
        <div className="tw">
          <table
            dangerouslySetInnerHTML={{
              __html: tbl(
                ["#", "Bắt đầu", "Giờ", METRIC.gmv, METRIC.gmvPerHour, "Orders", "Views", METRIC.productCtr, METRIC.ctor],
                d.top.map((s, i) => [String(i + 1), fmtSessionStart(s.startTime), dec(s.hours, 1), fmtVndShort(s.gmv), fmtVndShort(s.gmvPerHour), fmtInt(s.orders), fmtInt(s.views), s.ctr != null ? fmtPct(s.ctr) : "—", s.ctor != null ? { t: fmtPct(s.ctor), c: s.ctor >= 1.6 ? "up" : "" } : "—"])
              )
            }}
          />
        </div>
      </div>
    </>
  );
};
