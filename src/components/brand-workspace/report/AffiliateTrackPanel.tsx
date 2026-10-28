import React from "react";
import { affiliateTrackGroups, type AffiliateTrackColumn } from "../../../lib/report/affiliateTrack";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../../../lib/format";
import { esc, hbars } from "./demoCharts";

// Trang Affiliate theo bản demo Report Tháng (#p8): thanh Direct GMV so với Target từng phiên, rồi MỘT bảng dọc "Theo dõi"
// (mỗi phiên là một cột, hàng xếp theo phễu live). Markup/class nguyên từ demo.css; số tính ở lib/report/affiliateTrack.ts.

const FMT = { money: fmtVndShort, int: (v: number) => fmtVndFull(Math.round(v)), fixed: fmtFixed };
const dm = (d: string | null) => (d ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : "—");
const CAMP_PILL: Record<string, string> = {
  "D-Day": "color:var(--gold);border-color:#f2c94c60;background:#f2c94c1f",
  "Mid-Month": "color:#7fb0e0;border-color:#7fb0e060;background:#7fb0e01f",
  "Pay Day": "color:#e08a4b;border-color:#e08a4b60;background:#e08a4b1f"
};
const campPill = (c: string) => `<span class="pill m" style="${CAMP_PILL[c] ?? ""}">${esc(c)}</span>`;
const mil = (v: number) => v / 1e6;

export const AffiliateTrackPanel: React.FC<{ cols: AffiliateTrackColumn[]; monthLabel: string }> = ({ cols, monthLabel }) => {
  const groups = affiliateTrackGroups(FMT);
  const bars = cols
    .filter((c) => c.targetGmv != null && c.directGmv != null)
    .sort((a, b) => ((b.hours ?? 0) >= 1 ? 1 : 0) - ((a.hours ?? 0) >= 1 ? 1 : 0) || (b.date ?? "").localeCompare(a.date ?? ""))
    .map((c) => ({
      name: `${c.creator} · ${dm(c.date)}${c.camp ? ` ${c.camp}` : ""}`,
      sub: [c.hours != null ? `${fmtFixed(c.hours, 1)} giờ` : null, c.gmvPerHour != null ? `${fmtVndShort(c.gmvPerHour)}/giờ` : null, c.roas != null ? `ROAS ${fmtFixed(c.roas, 1)}x` : null].filter(Boolean).join(" · "),
      value: mil(c.directGmv!),
      mark: mil(c.targetGmv!),
      text: `${fmtVndShort(c.directGmv)} / ${fmtVndShort(c.targetGmv)}`,
      dim: (c.hours ?? 0) < 1
    }));
  const cell = (label: string, c: AffiliateTrackColumn, text: string, tone?: string) => {
    if (label === "Camp") return c.camp ? { html: campPill(c.camp) } : { text };
    if (label === "% Target") return { text, cls: tone === "good" ? "up" : tone === "bad" ? "dn" : "" };
    return { text, warn: tone === "warn" };
  };
  return (
    <>
      {bars.length > 0 && (
        <div className="pn">
          <div className="pnh">GMV phiên so với Target từng phiên creator</div>
          <div className="pns">Thanh = GMV phiên creator · vạch trắng = Target của phiên.</div>
          <div className="hb" id="c_aff" dangerouslySetInnerHTML={{ __html: hbars(bars) }} />
        </div>
      )}
      <div className="pn">
        <div className="pnh">Theo dõi phiên Affiliate</div>
        <div className="pns">Mỗi phiên là một cột, cùng định dạng tab Theo dõi của app. Tháng {monthLabel}, {cols.length} phiên, lấy từ tab Affiliate trong app.</div>
        <div className="tw">
          <table id="affTrack">
            <thead>
              <tr><th rowSpan={2} className="lh">Tháng</th><th colSpan={cols.length} className="mh m10">Tháng {monthLabel} · app</th></tr>
              <tr>{cols.map((c) => <th key={c.key} className="sh">{c.creator}<br /><span className="nt" style={{ fontWeight: 500 }}>{dm(c.date)}</span></th>)}</tr>
            </thead>
            <tbody>
              {groups.flatMap((g) => [
                <tr key={`g-${g.group}`} className="gh"><td colSpan={cols.length + 1}>{g.group}</td></tr>,
                ...g.rows.map((r) => (
                  <tr key={r.label} className={r.key ? "key" : undefined}>
                    <td className="lh">{r.label}</td>
                    {cols.map((c) => {
                      const raw = r.cell(c);
                      const x = cell(r.label, c, raw.text, raw.tone);
                      return "html" in x && x.html ? <td key={c.key} dangerouslySetInnerHTML={{ __html: x.html }} /> : <td key={c.key}>{"cls" in x && x.cls ? <span className={x.cls}>{x.text}</span> : "warn" in x && x.warn ? <span style={{ color: "var(--gold)" }}>{x.text}</span> : x.text}</td>;
                    })}
                  </tr>
                ))
              ])}
            </tbody>
          </table>
        </div>
        <div className="legend"><span>% Target: xanh từ 100%, đỏ dưới 50%.</span></div>
      </div>
    </>
  );
};
