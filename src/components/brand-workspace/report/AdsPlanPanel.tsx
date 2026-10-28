import React from "react";
import { METRIC } from "../../../lib/metricGlossary";
import type { AdsDayRow, AdsMonthSummary } from "../../../lib/ads/adsTracking";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { adsDayPoints, adsPhaseRows, adsRoasRows, adsTypeRows, dayRuns } from "../../../lib/report/adsSlide";
import { fmtDateVn, fmtFixed, fmtVndShort } from "../../../lib/format";
import { columns, fmtP, svg, tbl, TX } from "./demoCharts";
import { DAY_TYPE_SHORT } from "./theme";

// Trang Quảng cáo theo bản demo Report Tháng (scratchpad/build/template.html, #p7): bảng theo loại chi, bảng theo giai đoạn,
// cột chồng chi theo ngày kèm vạch Target, ROAS Live theo loại ngày, Phương pháp. Markup/class lấy nguyên từ demo (demo.css, tiền tố .rt);
// số tính ở lib/report/adsSlide.ts từ brand_ads_daily. Insight tổng hợp và KPI đầu trang do trang cha dựng.

const M1 = (v: number) => `${fmtFixed(v / 1e6, 1)}M`;
const dtd = (v: number | null) => (v == null ? "—" : { t: fmtP(v, 1), c: v < 0 ? "dn" : "up" });
const dm = (date: string) => fmtDateVn(date, false);
const roasX = (v: number | null) => (v != null ? `${fmtFixed(v, 1)}x` : "—");
const Y_STEPS = [5, 10, 20, 25, 50, 100, 200, 500, 1000];

/** Cột chồng chi theo ngày (đơn vị triệu đồng): y tối đa làm tròn lên theo bậc 6 vạch như demo. */
function dayChart(points: ReturnType<typeof adsDayPoints>, month: string): string {
  const n = points.length;
  const Wd = 940, H = 310, m = { l: 46, r: 10, t: 30, b: 34 };
  const pw = Wd - m.l - m.r, ph = H - m.t - m.b, slot = pw / n, bw = slot * 0.62;
  const peak = Math.max(1, ...points.map((p) => Math.max(p.target ?? 0, p.total ?? 0))) / 1e6;
  const step = Y_STEPS.find((s) => s * 6 >= peak) ?? Math.ceil(peak / 6);
  const ymax = step * 6;
  const Y = (v: number) => m.t + (1 - v / ymax) * ph, X = (d: number) => m.l + slot * (d - 1);
  const mil = (v: number | null) => (v ?? 0) / 1e6;
  let o = "";
  dayRuns(points, (p) => (p.bucket === "daily" ? null : p.bucket)).forEach((r) => {
    o += `<rect x="${X(r.from)}" y="${m.t}" width="${slot * (r.to - r.from + 1)}" height="${ph}" style="fill:var(--gold);fill-opacity:.09"/>` + TX(X(r.from) + (slot * (r.to - r.from + 1)) / 2, m.t - 8, DAY_TYPE_SHORT[r.label as CampDayBucket], { s: 11, c: "var(--gold)", w: 700 });
  });
  dayRuns(points, (p) => (p.hasActual ? null : "chưa có số")).forEach((r) => {
    o += `<rect x="${X(r.from)}" y="${m.t}" width="${slot * (r.to - r.from + 1)}" height="${ph}" style="fill:#8a8a94;fill-opacity:.12"/>`;
    if (r.to - r.from >= 1) o += TX(X(r.from) + (slot * (r.to - r.from + 1)) / 2, m.t - 8, "chưa có số", { s: 11 });
  });
  for (let v = 0; v <= ymax; v += step) o += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--line)"/>` + TX(m.l - 6, Y(v) + 4, `${v}M`, { a: "end", s: 10 });
  points.forEach((p) => {
    const x = X(p.day) + (slot - bw) / 2;
    const target = mil(p.target);
    let base = 0;
    if (p.hasActual) {
      ([[p.live, "var(--gold)"], [p.product, "#7fb0e0"], [p.creator, "#e08a4b"]] as const).forEach(([val, col]) => {
        const v = mil(val);
        if (v <= 0) return;
        o += `<rect x="${x}" y="${Y(base + v)}" width="${bw}" height="${Math.max(Y(base) - Y(base + v), 0.5)}" style="fill:${col}"/>`;
        base += v;
      });
      if (mil(p.total) >= step) o += TX(x + bw / 2, Y(Math.max(base, target)) - 6, fmtFixed(mil(p.total), 1), { s: 10, c: "var(--cream)", w: 700 });
    }
    if (p.target != null) o += `<line x1="${x - 2}" x2="${x + bw + 2}" y1="${Y(target)}" y2="${Y(target)}" style="stroke:var(--cream);stroke-width:2.2"/>`;
    o += TX(x + bw / 2, H - 14, String(p.day), { s: 10 });
    const tip = `Ngày ${p.day}/${month.slice(5)} · Target ${p.target != null ? `${fmtFixed(target, 1)}M` : "—"}${p.hasActual ? ` · thực tế ${fmtFixed(mil(p.total), 1)}M (Live ${fmtFixed(mil(p.live), 1)} · Product ${fmtFixed(mil(p.product), 1)} · Creator ${fmtFixed(mil(p.creator), 1)})` : " · chưa có số thực tế"}`;
    o += `<rect x="${X(p.day)}" y="${m.t}" width="${slot}" height="${ph}" style="fill:transparent"><title>${tip}</title></rect>`;
  });
  o += TX(m.l + pw / 2, H - 1, `Ngày trong tháng ${month.slice(5)} (triệu đồng)`, { s: 11 });
  return svg(Wd, H, o);
}

export const AdsPlanPanel: React.FC<{ rows: AdsDayRow[]; s: AdsMonthSummary; month: string; bucketOf: (date: string) => CampDayBucket; hasCampaignFile?: boolean }> = ({ rows, s, month, bucketOf, hasCampaignFile = true }) => {
  const mm = month.slice(5);
  const span = s.lastActual ? `1–${dm(s.lastActual)}` : `tháng ${mm}`;
  const types = adsTypeRows(rows, month);
  const phases = adsPhaseRows(rows, month, bucketOf);
  const points = adsDayPoints(rows, month, bucketOf);
  const roas = adsRoasRows(s);
  const phaseLabel = (b: CampDayBucket) => {
    if (b === "daily") return "Daily (ngoài Campaign)";
    const runs = dayRuns(points, (p) => (p.bucket === b ? b : null));
    return `${DAY_TYPE_SHORT[b]}${runs.length ? ` (${runs.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(", ")}/${mm})` : ""}`;
  };
  const mtd = tbl(
    ["Loại chi", "Target luỹ kế", "Thực tế luỹ kế", "Chênh lệch", "Target cả tháng", "% Target tháng"],
    types.map((r) => {
      const row = [{ t: `<b>${r.label}</b>`, c: "" }, M1(r.mtdTarget), M1(r.mtdActual), dtd(r.delta), M1(r.monthTarget), { t: r.pctMonth == null ? "—" : fmtP(r.pctMonth, 1, false), c: "nt" }];
      return r.key === "total" ? { c: row, hl: true } : row;
    })
  );
  const phaseTbl = tbl(
    ["Giai đoạn", "Số ngày", "Target", "Thực tế", "Chênh lệch", "% chi tháng"],
    phases.map((r) => [{ t: `<b>${phaseLabel(r.bucket)}</b>`, c: "" }, String(r.days), M1(r.target), M1(r.actual), dtd(r.delta), { t: r.share == null ? "—" : fmtP(r.share, 1, false), c: "nt" }])
  );
  const roasChart = columns(
    roas.map((r) => ({ l: DAY_TYPE_SHORT[r.bucket], v: [r.roas ?? 0], colors: s.liveRoas != null && r.roas != null ? [r.roas < s.liveRoas * 0.75 ? "var(--red)" : r.roas >= s.liveRoas * 1.25 ? "var(--green)" : "var(--gold)"] : undefined })),
    [{ color: "var(--gold)" }],
    { min: 0, max: Math.max(1, Math.ceil(Math.max(...roas.map((r) => r.roas ?? 0), s.liveRoas ?? 0) * 1.2)), h: 250, ref: s.liveRoas ?? undefined, refLabel: s.liveRoas != null ? `Cả kỳ ${roasX(s.liveRoas)}` : "", fmt: (v: number) => roasX(v) }
  );
  const roasTbl = tbl(
    ["Loại ngày", "Số ngày", "Ads Live", "LIVE GMV", "ROAS Live"],
    roas.map((r) => {
      const tone = s.liveRoas != null && r.roas != null ? (r.roas < s.liveRoas * 0.75 ? "dn" : r.roas >= s.liveRoas * 1.25 ? "up" : "") : "";
      const row = [DAY_TYPE_SHORT[r.bucket], String(r.days), fmtVndShort(r.liveAds), fmtVndShort(r.liveGmv), tone ? { t: roasX(r.roas), c: tone } : roasX(r.roas)];
      return tone === "dn" ? { c: row, hl: true } : row;
    })
  );
  return (
    <>
      <div className="pn"><div className="pnh">{METRIC.adsCost} theo loại chi, {span}</div><div className="pns">Target và thực tế luỹ kế tới ngày có số ({s.lastActual ? dm(s.lastActual) : "chưa có"}). Target cả tháng gồm cả các ngày chưa tới. % Target tháng = thực tế luỹ kế ÷ Target cả tháng.</div><div className="tw"><table id="adsMtd" dangerouslySetInnerHTML={{ __html: mtd }} /></div></div>
      {phases.length > 0 && <div className="pn"><div className="pnh">{METRIC.adsCost} theo giai đoạn</div><div className="pns">Daily = các ngày ngoài Campaign. % chi tháng = tỷ trọng trong tổng Ads cost thực tế luỹ kế.</div><div className="tw"><table id="adsPhase" dangerouslySetInnerHTML={{ __html: phaseTbl }} /></div></div>}
      <div className="pn">
        <div className="pnh">{METRIC.adsCost} theo ngày, tháng {mm}</div>
        <div className="pns">Cột chồng = thực tế Live, Product (GMV Max), Creator; vạch ngang = Target ngày (Total); nền vàng = ngày Campaign; nền xám = ngày chưa có số. Đơn vị: triệu đồng.</div>
        <div id="c_adsday" role="img" aria-label={`Ads cost theo ngày tháng ${mm}: ${points.filter((p) => p.hasActual).length} ngày có số`} dangerouslySetInnerHTML={{ __html: dayChart(points, month) }} />
        <div className="legend">
          <span><i style={{ background: "var(--gold)" }} />Live</span>
          <span><i style={{ background: "#7fb0e0" }} />Product (GMV Max)</span>
          <span><i style={{ background: "#e08a4b" }} />Creator</span>
          <span><i style={{ background: "var(--cream)", height: 3, verticalAlign: 3 }} />Target ngày (Total)</span>
          {s.offDays.length > 0 && <span>Ngày chi lệch Target từ 30%: {s.offDays.map((d) => `${dm(d.date)} ${fmtP(d.pct, 1)}`).join(" · ")}</span>}
        </div>
      </div>
      {roas.length > 0 && (
        <div className="pn">
          <div className="pnh">ROAS Live theo loại ngày</div>
          <div className="pns">{METRIC.liveGmv} YFB ÷ Ads Live cùng ngày{s.liveRoas != null ? ` · đường nét đứt = ROAS Live cả kỳ (${roasX(s.liveRoas)})` : ""}. Ads Live của shop có thể chạy cho cả phiên ngoài YFB nên đây là ước tính.</div>
          <div id="c_roas" role="img" aria-label={`ROAS Live theo loại ngày: ${roas.map((r) => `${DAY_TYPE_SHORT[r.bucket]} ${roasX(r.roas)}`).join(", ")}`} dangerouslySetInnerHTML={{ __html: roasChart }} />
          <div className="tw" style={{ marginTop: 10 }}><table id="roasTbl" dangerouslySetInnerHTML={{ __html: roasTbl }} /></div>
        </div>
      )}
      <div className="pn">
        <details style={{ margin: 0, border: 0, padding: 0 }}>
          <summary>Phương pháp</summary>
          <p>Số Ads theo ngày lấy từ bảng Ads theo ngày của brand (Target và thực tế Live, Product, Creator do ops dán từ sheet){hasCampaignFile ? "" : `, chưa có file Campaign overview tháng ${mm}`}. ROAS Live = LIVE GMV YFB ÷ Ads Live cùng ngày. Chênh lệch = thực tế ÷ Target − 1.</p>
        </details>
      </div>
    </>
  );
};
