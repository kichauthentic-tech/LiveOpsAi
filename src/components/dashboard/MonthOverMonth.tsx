import React from "react";
import { Lock } from "lucide-react";
import type { Brand, LiveSession } from "../../types";
import { PnlFn, financeOf, inRange, monthColumns, monthEndOf, prevMonthOf, totalsOf } from "../../lib/performance/ceoBrief";
import { todayVn } from "../../lib/performance/brandCommitment";
import { isCountable, sessionHours } from "../../lib/performance/hostPerformance";
import type { MetricTotals, PlatformMetricSet } from "../../lib/platforms/profiles";
import { fmtVndShort } from "../../lib/format";
import { Card, Delta, SectionTitle, chartColor, ddmm, money, niceMax } from "./shared";

export const MonthOverMonth: React.FC<{ sessions: LiveSession[]; brands: Brand[]; lastMonth: string; dataEnd: string | null; pnl: PnlFn | null; metrics: PlatformMetricSet }> = ({ sessions, brands, lastMonth, dataEnd, pnl, metrics }) => {
  const allCols = monthColumns(sessions, lastMonth, 6, dataEnd);
  const firstWithData = allCols.findIndex((c) => c.totals.sessions > 0);
  const cols = firstWithData > 0 ? allCols.slice(firstWithData) : allCols;
  const perBrand = cols.map((c) => ({ c, by: brands.map((b) => ({ b, gmv: totalsOf(inRange(sessions.filter((s) => s.brandId === b.id), `${c.month}-01`, c.through)).gmv })) }));
  const last = cols[cols.length - 1];
  const prevM = prevMonthOf(last.month);
  const days = Number(last.through.slice(8, 10));
  const fairEnd = `${prevM}-${String(Math.min(days, Number(monthEndOf(`${prevM}-01`).slice(8)))).padStart(2, "0")}`;

  const finCols = pnl ? cols.map((c) => financeOf(inRange(sessions, `${c.month}-01`, c.through), pnl)) : null;
  const finFair = pnl ? financeOf(inRange(sessions, `${prevM}-01`, fairEnd), pnl) : null;

  const W = 560, H = 220, L = 44, R = 8, T = 22, B = 26;
  const max = Math.max(1, ...perBrand.map((p) => p.by.reduce((a, x) => a + x.gmv, 0)));
  const nice = niceMax(max);
  const step = (W - L - R) / cols.length, bw = Math.min(56, step * 0.55);
  const y = (v: number) => T + (H - T - B) * (1 - v / nice);

  // Bộ chỉ số của sàn (hồ sơ sàn: TikTok 18 chỉ số + AOV, Shopee Viewers/ATC/ABS/Items Sold), cùng thứ tự mọi report.
  const totalsIn = (from: string, to: string) => metrics.ofSessions(inRange(sessions, from, to).filter(isCountable), sessionHours);
  const rows = metrics.defs.map((d) => ({ label: d.label, get: (t: MetricTotals) => metrics.value(t, d.key), fmt: (v: number | null) => metrics.fmt(d, v) }));
  const colTotals = cols.map((c) => totalsIn(`${c.month}-01`, c.through));
  const lastTotals = colTotals[colTotals.length - 1];
  const fairTotals = totalsIn(`${prevM}-01`, fairEnd);
  return (
    <section className="space-y-3">
      <SectionTitle title="Tháng qua tháng" note={`Tháng cuối so với cùng ${days} ngày đầu tháng trước`} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.1fr] gap-4">
        <Card>
          <h4 className="font-black text-[var(--text)] mb-2 text-sm">GMV theo tháng</h4>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV theo tháng, chia theo brand">
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <g key={f}>
                <line x1={L} x2={W - R} y1={y(nice * f)} y2={y(nice * f)} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
                <text x={L - 6} y={y(nice * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{f ? fmtVndShort(nice * f) : "0"}</text>
              </g>
            ))}
            {perBrand.map(({ c, by }, i) => {
              const cx = L + step * i + step / 2;
              let acc = 0;
              const segs = by.filter((x) => x.gmv > 0);
              const total = segs.reduce((a, x) => a + x.gmv, 0);
              return (
                <g key={c.month}>
                  {segs.map((x, k) => {
                    const y0 = y(acc), y1 = y(acc + x.gmv);
                    acc += x.gmv;
                    const top = k === segs.length - 1;
                    const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
                    return (
                      <rect key={x.b.id} x={cx - bw / 2} y={y1} width={bw} height={h} rx={top ? 4 : 0} style={{ fill: chartColor(x.b.name), opacity: c.partial ? 0.6 : 1 }}
                        data-tip={`${x.b.name} · T${Number(c.month.slice(5))}\n${money(x.gmv)}${c.partial ? ` (đến ${ddmm(c.through)})` : ""}`} />
                    );
                  })}
                  {total > 0 && <text x={cx} y={y(total) - 6} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}>{fmtVndShort(total)}</text>}
                  <text x={cx} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>T{Number(c.month.slice(5))}{c.partial ? "*" : ""}</text>
                </g>
              );
            })}
            <line x1={L} x2={W - R} y1={H - B} y2={H - B} style={{ stroke: "var(--text-faint)", strokeWidth: 1 }} />
          </svg>
          {brands.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
              {brands.filter((b) => perBrand.some((p) => p.by.some((x) => x.b.id === b.id && x.gmv > 0))).map((b) => <span key={b.id} className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: chartColor(b.name) }} />{b.name}</span>)}
            </div>
          )}
        </Card>
        <Card className="!p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Chỉ số</th>
                {cols.map((c) => <th key={c.month} className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">T{Number(c.month.slice(5))}{c.partial ? "*" : ""}</th>)}
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap">vs cùng kỳ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">{r.label}</td>
                  {cols.map((c, i) => <td key={c.month} className="px-3 py-2 text-right text-[var(--text)] whitespace-nowrap">{colTotals[i].sessions ? r.fmt(r.get(colTotals[i])) : "—"}</td>)}
                  <td className="px-3 py-2 text-right"><Delta cur={r.get(lastTotals)} prev={fairTotals.sessions ? r.get(fairTotals) : null} /></td>
                </tr>
              ))}
              {finCols && finFair && (
                <tr>
                  <td className="px-3 py-2 text-[var(--text-muted)] whitespace-nowrap">Lãi gộp <Lock className="w-3 h-3 inline" /></td>
                  {finCols.map((f, i) => <td key={cols[i].month} className="px-3 py-2 text-right text-[var(--text)] whitespace-nowrap">{f.priced ? money(f.profit) : "—"}</td>)}
                  <td className="px-3 py-2 text-right"><Delta cur={finCols[finCols.length - 1].priced ? finCols[finCols.length - 1].profit : null} prev={finFair.priced ? finFair.profit : null} /></td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-[var(--text-faint)] border-t border-[var(--border)]">* {last.through < monthEndOf(`${last.month}-01`) ? (last.month < todayVn().slice(0, 7) ? `Tháng đã hết nhưng số mới về tới ${ddmm(last.through)} — cần up thêm file.` : `Tháng đang chạy, cộng tới ngày có số (${ddmm(last.through)}).`) : "Đủ tháng."}{finCols ? " Lãi gộp chỉ cộng ca đủ dữ liệu tính tiền." : ""}</p>
        </Card>
      </div>
    </section>
  );
};
