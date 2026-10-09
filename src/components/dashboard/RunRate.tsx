import React from "react";
import { RUN_RATE_BAD, RUN_RATE_WARN, type MonthOutlook } from "../../lib/performance/ceoBrief";
import { coneOf, LANDING_LABEL, type LandingKey } from "../../lib/performance/forecastCone";
import { runRateTone, type LadderRow } from "../../lib/performance/runRateLadder";
import { fmtVndShort } from "../../lib/format";
import { Card, WEEKDAY, ddmm, money, niceMax, pct, weekdayIdx } from "./shared";

// Thanh bullet (Stephen Few): nền ba vùng đỏ / vàng / xanh theo đúng ngưỡng 85% / 95% đang dùng trong app, vạch đen = 100%.

const TONE_TEXT: Record<ReturnType<typeof runRateTone>, string> = { good: "text-emerald-400", warn: "text-amber-300", bad: "text-rose-400", none: "text-[var(--text-faint)]" };
const TONE_FILL: Record<ReturnType<typeof runRateTone>, string> = { good: "var(--success)", warn: "var(--warning)", bad: "var(--danger)", none: "var(--text-faint)" };
const SCALE_MAX = 1.5;

export const RunRateBar: React.FC<{ value: number | null; muted?: boolean; label?: string }> = ({ value, muted, label }) => {
  const w = (v: number) => `${(Math.min(v, SCALE_MAX) / SCALE_MAX) * 100}%`;
  const tone = muted ? "none" : runRateTone(value);
  return (
    <div className="relative h-4 rounded-sm overflow-hidden bg-[var(--surface-base)] min-w-[120px]" role="img" aria-label={label ?? (value == null ? "chưa có run-rate" : `${Math.round(value * 100)}%`)}>
      <div className="absolute inset-y-0 left-0" style={{ width: w(RUN_RATE_BAD), background: "var(--danger)", opacity: 0.16 }} />
      <div className="absolute inset-y-0" style={{ left: w(RUN_RATE_BAD), width: `calc(${w(RUN_RATE_WARN)} - ${w(RUN_RATE_BAD)})`, background: "var(--warning)", opacity: 0.16 }} />
      <div className="absolute inset-y-0 right-0" style={{ left: w(RUN_RATE_WARN), background: "var(--success)", opacity: 0.16 }} />
      {value != null && <div className="absolute left-0 top-[4px] h-2 rounded-r-sm" style={{ width: w(value), background: TONE_FILL[tone] }} />}
      <div className="absolute inset-y-0 w-0.5 bg-[var(--text)]" style={{ left: w(1) }} title="100% = đúng target" />
    </div>
  );
};

export const LandingChip: React.FC<{ keyName: LandingKey }> = ({ keyName }) => {
  const cls: Record<LandingKey, string> = {
    safe: "bg-emerald-500/15 text-emerald-400",
    likely: "bg-sky-500/15 text-sky-300",
    unlikely: "bg-amber-500/15 text-amber-300",
    short: "bg-rose-500/15 text-rose-400",
    no_target: "bg-[var(--surface-elevated)] text-[var(--text-faint)]",
    no_forecast: "bg-[var(--surface-elevated)] text-[var(--text-faint)]"
  };
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls[keyName]}`}>{LANDING_LABEL[keyName]}</span>;
};

const STATE_LABEL = { done: "đã qua", live: "đang chạy", next: "sắp tới" } as const;

export const RunRateLadder: React.FC<{ rows: LadderRow[]; note: React.ReactNode }> = ({ rows, note }) => (
  <Card className="space-y-3">
    <div>
      <h4 className="font-black text-[var(--text)]">Run-rate bốn tầng</h4>
      <p className="text-xs text-[var(--text-faint)] leading-snug mt-0.5">
        Run-rate = GMV thực đạt ÷ target các ca kế hoạch đã chốt tới ngày có số. Vạch đen = 100%; nền đỏ dưới {Math.round(RUN_RATE_BAD * 100)}%, vàng {Math.round(RUN_RATE_BAD * 100)}–{Math.round(RUN_RATE_WARN * 100)}%, xanh từ {Math.round(RUN_RATE_WARN * 100)}%.
      </p>
    </div>
    <div className="grid grid-cols-[minmax(110px,1.1fr)_minmax(120px,2fr)_auto] sm:grid-cols-[minmax(150px,1.1fr)_minmax(160px,2.2fr)_minmax(150px,1fr)] gap-x-3 gap-y-2.5 items-center">
      {rows.map((r) => {
        const next = r.state === "next";
        const tone = r.partial ? "none" : runRateTone(r.runRate);
        return (
          <React.Fragment key={`${r.tier}-${r.key}`}>
            <div className={`min-w-0 ${r.tier === "month" ? "" : "pl-3 border-l border-[var(--border)]"}`}>
              <p className={`font-bold truncate ${r.tier === "month" ? "text-[var(--text)]" : "text-sm text-[var(--text)]"}`}>{r.label}</p>
              <p className="text-[11px] text-[var(--text-faint)] leading-snug">{r.sub} · {STATE_LABEL[r.state]}</p>
            </div>
            {next ? (
              <p className="text-xs text-[var(--text-faint)] leading-snug">Target {money(r.target)}{r.forecast != null && r.forecast > 0 ? ` · dự phóng theo lịch ${money(r.forecast)}` : " · chưa có ca trong lịch"}</p>
            ) : (
              <RunRateBar value={r.runRate} muted={r.partial} />
            )}
            <div className="text-right text-sm whitespace-nowrap">
              {next ? <span className="text-[var(--text-faint)]">—</span> : r.runRate == null ? <span className="text-xs text-[var(--text-faint)]">chờ số</span> : (
                <>
                  <b className={TONE_TEXT[tone]}>{pct(r.runRate)}</b>
                  <span className="block text-[11px] text-[var(--text-faint)]">{money(r.actual)} / {money(r.targetToDate)}</span>
                </>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
    <p className="text-[11px] text-[var(--text-faint)] leading-snug">{note}</p>
  </Card>
);

// ---------------------------------------------------------------------------
// Biểu đồ lũy kế + dải dự phóng rộng dần
// ---------------------------------------------------------------------------

export const ConeChart: React.FC<{ outlook: MonthOutlook; month: string; scale?: number }> = ({ outlook: o, month, scale = 1 }) => {
  const n = o.days.length;
  const W = 640, H = 260, L = 50, R = 14, T = 16, B = 26;
  const throughIdx = o.through ? o.days.indexOf(o.through) : -1;
  const cone = coneOf(o, scale);
  let ca = 0, ct = 0;
  const actualPts: [number, number][] = [], targetPts: [number, number][] = [];
  o.days.forEach((d, i) => {
    ct += o.target?.byDate.get(d) ?? 0;
    targetPts.push([i, ct]);
    if (i <= throughIdx) { ca += o.actualByDate.get(d) ?? 0; actualPts.push([i, ca]); }
  });
  const hasCone = cone.points.length > 1;
  const max = niceMax(Math.max(o.target?.total ?? 0, hasCone ? cone.hi : o.projected, ca, 1));
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const path = (pts: [number, number][]) => pts.map((p, k) => `${k ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  const colW = (W - L - R) / Math.max(1, n - 1);
  const campIdx = o.days.map((d, i) => (o.buckets.find((b) => b.bucket !== "daily" && b.days.includes(d)) ? i : -1)).filter((i) => i >= 0);
  const mid = cone.points.map((p) => [p.i, p.mid] as [number, number]);
  const upper = cone.points.map((p) => [p.i, p.hi] as [number, number]);
  const lower = cone.points.map((p) => [p.i, p.lo] as [number, number]);
  const coneD = hasCone ? `${path(upper)} ${[...lower].reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} Z` : "";
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV cộng dồn so với target, kèm dải dự phóng">
        {campIdx.map((i) => <rect key={i} x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} style={{ fill: "var(--accent)", opacity: 0.07 }} />)}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} style={{ stroke: "var(--border)", strokeWidth: 1, opacity: 0.6 }} />
            <text x={L - 6} y={y(max * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{f ? fmtVndShort(max * f) : "0"}</text>
          </g>
        ))}
        {[1, 8, 15, 22, 29].filter((d) => d <= n).map((d) => <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{String(d).padStart(2, "0")}/{month.slice(5)}</text>)}
        {hasCone && <path d={coneD} style={{ fill: "var(--accent)", opacity: 0.14 }} />}
        {o.target && <path d={path(targetPts)} style={{ fill: "none", stroke: "var(--text-faint)", strokeWidth: 2, strokeDasharray: "2 4", strokeLinecap: "round" }} />}
        {hasCone && <path d={path(mid)} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2, strokeDasharray: "6 4" }} />}
        {actualPts.length > 0 && <path d={path(actualPts)} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2.5, strokeLinejoin: "round" }} />}
        {actualPts.length > 0 && <circle cx={x(throughIdx)} cy={y(ca)} r={4.5} style={{ fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }} />}
        {hasCone && <text x={x(n - 1) - 4} y={y(cone.hi) - 6} textAnchor="end" style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}>{fmtVndShort(o.projected)}</text>}
        {o.days.map((d, i) => (
          <rect key={d} x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} style={{ fill: "transparent" }}
            data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})\n${i <= throughIdx ? `Thực tế cộng dồn: ${money(actualPts[i]?.[1] ?? 0)}` : `Dự phóng cộng dồn: ${money(cone.points.find((p) => p.i === i)?.mid ?? o.projected)}${cone.points.find((p) => p.i === i) ? `\nDải ~80%: ${money(cone.points.find((p) => p.i === i)!.lo)} – ${money(cone.points.find((p) => p.i === i)!.hi)}` : ""}`}${o.target ? `\nTarget tới ngày này: ${money(targetPts[i][1])}` : ""}`} />
        ))}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "var(--accent)" }} />Thực tế</span>
        {hasCone && <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "repeating-linear-gradient(90deg,var(--accent) 0 5px,transparent 5px 8px)" }} />Dự phóng và dải ~80%</span>}
        {o.target && <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "repeating-linear-gradient(90deg,var(--text-faint) 0 3px,transparent 3px 6px)" }} />Target cộng dồn</span>}
        <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--accent)", opacity: 0.25 }} />Ngày camp</span>
      </div>
      {hasCone && <p className="text-[11px] text-[var(--text-faint)] mt-1 leading-snug">Dải rộng dần theo phần tháng còn lại (35% phần dự phóng chưa về). Thử lại trên 13 kênh-tháng T7–T9: dải bao đúng 11/13, 12/13 và 10/13 lần ở ngày 8, 15 và 22.</p>}
    </>
  );
};

