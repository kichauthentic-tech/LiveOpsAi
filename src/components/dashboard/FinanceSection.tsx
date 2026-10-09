import React from "react";
import { AlertTriangle, Lock } from "lucide-react";
import type { Brand, LiveSession } from "../../types";
import { FinanceTotals, PnlFn, financeOf } from "../../lib/performance/ceoBrief";
import { PNL_MISSING_LABEL, type PnlMissingInput } from "../../lib/pnl";
import { addDays, eachDay } from "../../lib/dateUtils";
import { fmtVndShort } from "../../lib/format";
import { Card, Kpi, SectionTitle, WEEKDAY, chartColor, ddmm, money, niceMax, pct, weekdayIdx } from "./shared";

export const FinanceSection: React.FC<{ fin: FinanceTotals; finPrev: FinanceTotals | null; sessions: LiveSession[]; brands: Brand[]; pnl: PnlFn; period: { start: string; end: string }; onNavigate: (tab: string) => void }> = ({ fin, finPrev, sessions, brands, pnl, period, onNavigate }) => {
  const missing = [...fin.missing.entries()].sort((a, b) => b[1] - a[1]);
  const byBrand = brands.map((b) => ({ b, f: financeOf(sessions.filter((s) => s.brandId === b.id), pnl) })).filter((r) => r.f.sessions > 0);
  const posTotal = byBrand.reduce((a, r) => a + Math.max(0, r.f.profit), 0);
  const days = period.end >= period.start ? eachDay(period.end > addDays(period.start, 44) ? addDays(period.end, -44) : period.start, period.end) : [];
  const W = 560, H = 190, L = 46, R = 8, T = 10, B = 22;
  const vals = days.map((d) => fin.byDay.get(d));
  const vmax = niceMax(Math.max(1, ...vals.map((v) => Math.abs(v ?? 0))));
  const hasNeg = vals.some((v) => (v ?? 0) < 0);
  const zero = hasNeg ? T + (H - T - B) / 2 : H - B;
  const scale = (hasNeg ? (H - T - B) / 2 : H - T - B) / vmax;
  const step = (W - L - R) / Math.max(1, days.length), bw = Math.max(2, Math.min(14, step - 2));
  const missingTab: Record<string, string> = { host_rate: "talents", cohost_rate: "talents", brand_rate: "crm", commission_default: "crm" };
  return (
    <section className="space-y-3">
      <SectionTitle title="Tài chính" note={<span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> Chỉ CEO/admin · chỉ cộng ca đủ dữ liệu{fin.backfill > 0 ? ` · gồm ${fin.backfill} ca nạp bù (Finance & P&L không tính loại ca này)` : ""}</span>} />
      {missing.length > 0 && (
        <Card className="!p-4 border-amber-500/40">
          <p className="text-sm font-bold text-amber-300 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Tính được tiền cho {fin.priced}/{fin.sessions} ca trong kỳ. Các ca còn lại đang thiếu:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {missing.map(([k, n]) => (
              <li key={k}>
                <button onClick={() => onNavigate(missingTab[k] ?? "finance")} className="text-xs px-2.5 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--accent)]">
                  {PNL_MISSING_LABEL[k as PnlMissingInput] ?? k} · {n} ca →
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {/* M3: `priced === 0` ⇒ 6 ô KPI, biểu đồ lãi/lỗ và bảng theo brand đều rỗng (đo 29/09: 460px desktop,
          964px điện thoại chỉ để nói "chưa có rate"). Giữ đúng phần làm được việc — cảnh báo + chip đi đặt rate. */}
      {fin.priced === 0 ? (
        <p className="text-xs text-[var(--text-faint)] leading-snug">
          Chưa ca nào đủ dữ liệu để tính tiền, nên chưa hiện doanh thu / lãi gộp / biểu đồ lãi lỗ từng ngày / bảng theo brand.
          Đặt xong rate ở các nút trên là các khối này hiện lại.
        </p>
      ) : (
        <>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="Doanh thu agency" value={fin.priced ? money(fin.revenue) : "—"} cur={fin.priced ? fin.revenue : null} prev={finPrev?.priced ? finPrev.revenue : null} />
        <Kpi label="Chi phí trực tiếp" value={fin.priced ? money(fin.cost) : "—"} cur={fin.priced ? fin.cost : null} prev={finPrev?.priced ? finPrev.cost : null} goodWhenUp={false} />
        <Kpi label="Lãi gộp" value={fin.priced ? money(fin.profit) : "—"} cur={fin.priced ? fin.profit : null} prev={finPrev?.priced ? finPrev.profit : null} />
        <Kpi label="Biên lãi gộp" value={pct(fin.margin)} cur={fin.margin} prev={finPrev?.margin ?? null} />
        <Kpi label="Phiên có lãi" value={fin.priced ? pct(fin.profitableSessions / fin.priced) : "—"} cur={fin.priced ? fin.profitableSessions / fin.priced : null} prev={finPrev?.priced ? finPrev.profitableSessions / finPrev.priced : null} extra={`${fin.profitableSessions}/${fin.priced} phiên`} />
        <Kpi label="Ngày có lãi" value={fin.days ? pct(fin.profitableDays / fin.days) : "—"} cur={fin.days ? fin.profitableDays / fin.days : null} prev={finPrev?.days ? finPrev.profitableDays / finPrev.days : null} extra={`${fin.profitableDays}/${fin.days} ngày`} />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <h4 className="font-black text-[var(--text)] text-sm mb-2">Lãi / lỗ từng ngày</h4>
          {fin.days === 0 ? (
            <p className="text-sm text-[var(--text-faint)] py-6 text-center">Chưa có ngày nào đủ dữ liệu để tính.</p>
          ) : (
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Lãi lỗ từng ngày">
              {(hasNeg ? [-1, -0.5, 0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]).map((f) => (
                <g key={f}>
                  <line x1={L} x2={W - R} y1={zero - f * vmax * scale} y2={zero - f * vmax * scale} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
                  <text x={L - 6} y={zero - f * vmax * scale + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{f ? fmtVndShort(f * vmax) : "0"}</text>
                </g>
              ))}
              {days.map((d, i) => {
                const v = vals[i];
                const cx = L + step * i + step / 2;
                const h = Math.abs(v ?? 0) * scale;
                return (
                  <g key={d}>
                    {v != null && <rect x={cx - bw / 2} y={v >= 0 ? zero - h : zero} width={bw} height={Math.max(1, h)} rx={Math.min(3, bw / 2)} style={{ fill: v >= 0 ? "var(--success)" : "var(--danger)" }} />}
                    <rect x={cx - step / 2} y={T} width={step} height={H - T - B} style={{ fill: "transparent" }} data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})\n${v == null ? "Không có ca đủ dữ liệu" : `Lãi gộp: ${money(v)}`}`} />
                  </g>
                );
              })}
              {[0, Math.floor(days.length / 2), days.length - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => <text key={i} x={L + step * i + step / 2} y={H - 6} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{ddmm(days[i])}</text>)}
              <line x1={L} x2={W - R} y1={zero} y2={zero} style={{ stroke: "var(--text-faint)", strokeWidth: 1 }} />
            </svg>
          )}
        </Card>
        <Card className="space-y-3">
          <h4 className="font-black text-[var(--text)] text-sm">Theo brand</h4>
          {posTotal > 0 && (
            <div className="flex h-5 rounded-md overflow-hidden gap-0.5" aria-label="Tỷ trọng lãi theo brand">
              {byBrand.filter((r) => r.f.profit > 0).map((r) => <div key={r.b.id} style={{ flex: r.f.profit, background: chartColor(r.b.name) }} data-tip={`${r.b.name}\nLãi ${money(r.f.profit)} · ${pct(r.f.profit / posTotal)} tổng lãi`} />)}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)]">
                <tr>{["Brand", "Doanh thu", "Chi phí", "Lãi gộp", "Tỷ trọng lãi", "Phiên lãi", "Ngày lãi"].map((h, i) => <th key={h} className={`px-2 py-1.5 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {byBrand.length === 0 && <tr><td colSpan={7} className="px-2 py-3 text-[var(--text-faint)]">Không có ca nào trong kỳ.</td></tr>}
                {byBrand.map(({ b, f }) => (
                  <tr key={b.id}>
                    <td className="px-2 py-2 text-[var(--text)] font-bold whitespace-nowrap"><i className="w-2.5 h-2.5 rounded-sm inline-block mr-1.5" style={{ background: chartColor(b.name) }} />{b.name}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{f.priced ? money(f.revenue) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{f.priced ? money(f.cost) : "—"}</td>
                    <td className={`px-2 py-2 text-right font-bold whitespace-nowrap ${f.profit < 0 ? "text-rose-400" : "text-[var(--text)]"}`}>{f.priced ? money(f.profit) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.priced && posTotal > 0 && f.profit > 0 ? pct(f.profit / posTotal) : f.priced && f.profit <= 0 ? <span className="text-rose-400">lỗ</span> : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.priced ? pct(f.profitableSessions / f.priced) : "—"}</td>
                    <td className="px-2 py-2 text-right text-[var(--text-muted)]">{f.days ? pct(f.profitableDays / f.days) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-faint)] leading-snug">
            Doanh thu = GMV × (1 − tỷ lệ hoàn hủy) × % hoa hồng (brand tính theo %), hoặc giờ × giá/giờ (brand tính theo giờ). Chi phí = lương host + trợ live + phòng + quảng cáo của ca. Chưa trừ chi phí cố định (mặt bằng, lương văn phòng).
          </p>
        </Card>
      </div>
        </>
      )}
    </section>
  );
};
