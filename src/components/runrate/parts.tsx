import React from "react";
import { RUN_RATE_BAD, RUN_RATE_WARN } from "../../lib/performance/ceoBrief";
import type { RunRateTone } from "../../lib/performance/channelHealth";
import type { AccountRunRate, DayState, RRDay, WaveStatus } from "../../lib/performance/runRateUpdate";
import { BUCKET_COLOR, WEEKDAY, ddmm, money, niceMax, pct, weekdayIdx } from "../dashboard/shared";
import type { CampDayBucket } from "../../lib/campaignDays";

// Phần trình bày của module Run-rate: không có luật số (xem lib/performance/runRateUpdate.ts).

export const TONE_VAR: Record<RunRateTone, string> = { good: "var(--success)", warn: "var(--warning)", bad: "var(--danger)", none: "var(--text-faint)" };
export const TONE_PILL: Record<RunRateTone, string> = {
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  none: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};

export const TonePill: React.FC<{ tone: RunRateTone; children: React.ReactNode; className?: string }> = ({ tone, children, className = "" }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${TONE_PILL[tone]} ${className}`}>{children}</span>
);

export const WAVE_STATUS_LABEL: Record<WaveStatus, string> = { done: "Đã xong", live: "Đang chạy", next: "Sắp tới" };
export const WAVE_STATUS_PILL: Record<WaveStatus, string> = {
  done: "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]",
  live: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  next: "bg-[var(--surface-base)] text-[var(--text-faint)] border-[var(--border)] border-dashed"
};
export const WaveStatusPill: React.FC<{ status: WaveStatus }> = ({ status }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${WAVE_STATUS_PILL[status]}`}>
    {status === "live" && <span className="relative flex w-1.5 h-1.5"><span className="absolute inline-flex w-full h-full rounded-full bg-sky-400 opacity-60 animate-ping" /><span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-sky-400" /></span>}
    {WAVE_STATUS_LABEL[status]}
  </span>
);

export const BucketChip: React.FC<{ bucket: CampDayBucket; label: string }> = ({ bucket, label }) => (
  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--text-muted)] whitespace-nowrap">
    <i className="w-2 h-2 rounded-full inline-block" style={{ background: BUCKET_COLOR[bucket] }} />
    {label}
  </span>
);

export const toneOfPct = (v: number | null): RunRateTone => (v == null ? "none" : v >= RUN_RATE_WARN ? "good" : v >= RUN_RATE_BAD ? "warn" : "bad");

/** Thanh tiến độ gọn: nền ba vùng đỏ/vàng/xanh nhạt, vạch 100%. Cùng thang với RunRateBar của Dashboard. */
export const PctBar: React.FC<{ value: number | null; tone: RunRateTone; max?: number; height?: number; label?: string }> = ({ value, tone, max = 1.4, height = 8, label }) => {
  const w = (v: number) => `${(Math.min(v, max) / max) * 100}%`;
  return (
    <div className="relative rounded-full overflow-hidden bg-[var(--surface-base)] w-full" style={{ height }} role="img" aria-label={label ?? (value == null ? "chưa có số" : `${Math.round(value * 100)}%`)}>
      {value != null && <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500" style={{ width: w(value), background: TONE_VAR[tone] }} />}
      <div className="absolute inset-y-0 w-px bg-[var(--text)] opacity-60" style={{ left: w(1) }} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Đồng hồ run-rate (cung 270°, thang 0–120%)
// ---------------------------------------------------------------------------

const GAUGE_MAX = 1.2;
/** Toạ độ SVG: số máy đọc, không phải chữ hiển thị. */
const n2 = (v: number) => String(Math.round(v * 100) / 100);
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
const angleOf = (v: number) => 135 + 270 * (Math.min(Math.max(v, 0), GAUGE_MAX) / GAUGE_MAX);
function arc(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${n2(x0)},${n2(y0)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${n2(x1)},${n2(y1)}`;
}

export const RunRateGauge: React.FC<{ value: number | null; tone: RunRateTone; size?: number; caption?: string }> = ({ value, tone, size = 168, caption = "run-rate" }) => {
  const c = 70, r = 56;
  const [tx0, ty0] = polar(c, c, r - 9, angleOf(1));
  const [tx1, ty1] = polar(c, c, r + 9, angleOf(1));
  return (
    <svg viewBox="0 0 140 140" width={size} height={size} role="img" aria-label={value == null ? "Chưa có run-rate" : `Run-rate ${Math.round(value * 100)}%`} className="shrink-0">
      <path d={arc(c, c, r, angleOf(0), angleOf(RUN_RATE_BAD))} style={{ stroke: "var(--danger)", opacity: 0.22 }} fill="none" strokeWidth={10} />
      <path d={arc(c, c, r, angleOf(RUN_RATE_BAD), angleOf(RUN_RATE_WARN))} style={{ stroke: "var(--warning)", opacity: 0.28 }} fill="none" strokeWidth={10} />
      <path d={arc(c, c, r, angleOf(RUN_RATE_WARN), angleOf(GAUGE_MAX))} style={{ stroke: "var(--success)", opacity: 0.22 }} fill="none" strokeWidth={10} />
      {value != null && value > 0 && <path d={arc(c, c, r, angleOf(0), angleOf(value))} style={{ stroke: TONE_VAR[tone] }} fill="none" strokeWidth={10} strokeLinecap="round" className="transition-all duration-700" />}
      <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} style={{ stroke: "var(--text)" }} strokeWidth={2} strokeLinecap="round" />
      <text x={c} y={c + 6} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 30, fontWeight: 900 }}>
        {value == null ? "—" : Math.round(value * 100)}
        {value != null && <tspan style={{ fontSize: 14, fontWeight: 800, fill: "var(--text-muted)" }}>%</tspan>}
      </text>
      <text x={c} y={c + 24} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11, fontWeight: 700, letterSpacing: 0.6 }}>{caption.toUpperCase()}</text>
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Biểu đồ
// ---------------------------------------------------------------------------

interface ChartFrame {
  W: number; H: number; L: number; R: number; T: number; B: number;
}
const FRAME: ChartFrame = { W: 720, H: 270, L: 52, R: 14, T: 20, B: 28 };

/** Dải nền ngày camp + nhãn đầu đợt. */
const CampBands: React.FC<{ days: { date: string; bucket: CampDayBucket }[]; x: (i: number) => number; colW: number; top: number; height: number }> = ({ days, x, colW, top, height }) => (
  <>
    {days.map((d, i) =>
      d.bucket === "daily" ? null : (
        <g key={d.date}>
          <rect x={x(i) - colW / 2} y={top} width={colW} height={height} style={{ fill: BUCKET_COLOR[d.bucket], opacity: 0.1 }} />
          {days[i - 1]?.bucket !== d.bucket && (
            <text x={x(i) - colW / 2 + 3} y={top + 11} style={{ fill: BUCKET_COLOR[d.bucket], fontSize: 11, fontWeight: 800 }}>
              {d.bucket === "dday" ? "D-Day" : d.bucket === "midmonth" ? "Mid" : "Pay Day"}
            </text>
          )}
        </g>
      )
    )}
  </>
);

const dayTip = (d: RRDay) =>
  `${ddmm(d.date)} (${WEEKDAY[weekdayIdx(d.date)]})\nTarget: ${money(d.target)}\n` +
  (d.state === "future" || d.state === "empty"
    ? d.shifts > 0 ? `${d.shifts} ca chưa tới` : "Không có ca"
    : `Đạt: ${money(d.actual)}${d.pctTarget != null ? ` (${pct(d.pctTarget)} target)` : ""}\n${d.withData}/${d.shifts} ca có số${d.state === "partial" ? "\nTạm tính — chưa vào run-rate" : d.state === "missing" ? "\nCòn ca chưa có số" : ""}`);

export const CumulativeChart: React.FC<{ r: AccountRunRate; color: string }> = ({ r, color }) => {
  const { W, H, L, T, B } = FRAME;
  const R = 100; // chừa lề phải cho nhãn cuối đường
  const pts = r.cumulative;
  const n = pts.length;
  const last = pts[n - 1];
  const maxV = niceMax(Math.max(last?.target ?? 0, ...pts.map((p) => p.projected ?? 0), ...pts.map((p) => p.actual ?? 0), 1));
  const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / maxV);
  const colW = (W - L - R) / Math.max(1, n - 1);
  const asOfIdx = r.asOf ? pts.findIndex((p) => p.date === r.asOf) : -1;
  const line = (sel: (p: (typeof pts)[number]) => number | null) =>
    pts.map((p, i) => ({ i, v: sel(p) })).filter((q): q is { i: number; v: number } => q.v != null).map((q, k) => `${k ? "L" : "M"}${n2(x(q.i))},${n2(y(q.v))}`).join(" ");
  const actualPath = line((p) => p.actual);
  const areaPath = asOfIdx >= 0 ? `${actualPath} L${n2(x(asOfIdx))},${n2(y(0))} L${n2(x(0))},${n2(y(0))} Z` : "";
  const gid = `rr-grad-${r.month}`;
  const dayList = r.days.map((d) => ({ date: d.date, bucket: d.bucket }));
  // Nhãn cuối đường: target và "giữ nhịp" thường nằm sát nhau ⇒ tách ra tối thiểu 15px.
  const endLabels: { text: string; y: number; fill: string }[] = [];
  if (last && last.target > 0) endLabels.push({ text: `Target ${money(last.target)}`, y: y(last.target), fill: "var(--text-muted)" });
  if (r.total.keepPace != null && last?.projected != null) endLabels.push({ text: `Nhịp ${money(last.projected)}`, y: y(last.projected), fill: color });
  if (endLabels.length === 2 && Math.abs(endLabels[0].y - endLabels[1].y) < 15) {
    const up = endLabels[0].y <= endLabels[1].y ? 0 : 1;
    endLabels[up].y -= 8;
    endLabels[1 - up].y += 8;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV cộng dồn so với target cộng dồn">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <CampBands days={dayList} x={x} colW={colW} top={T} height={H - T - B} />
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(maxV * f)} y2={y(maxV * f)} style={{ stroke: "var(--border)", opacity: 0.6 }} strokeWidth={1} />
          <text x={L - 8} y={y(maxV * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{f ? money(maxV * f) : "0"}</text>
        </g>
      ))}
      {[1, 8, 15, 22, 29].filter((d) => d <= n).map((d) => (
        <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{String(d).padStart(2, "0")}/{r.month.slice(5)}</text>
      ))}
      {areaPath && <path d={areaPath} fill={`url(#${gid})`} />}
      <path d={line((p) => p.target)} fill="none" style={{ stroke: "var(--text-faint)" }} strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" />
      <path d={line((p) => p.projected)} fill="none" stroke={color} strokeWidth={2} strokeDasharray="6 5" opacity={0.85} />
      {actualPath && <path d={actualPath} fill="none" stroke={color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
      {asOfIdx >= 0 && pts[asOfIdx].actual != null && (
        <>
          <line x1={x(asOfIdx)} x2={x(asOfIdx)} y1={T} y2={H - B} style={{ stroke: color }} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
          <circle cx={x(asOfIdx)} cy={y(pts[asOfIdx].actual!)} r={5} fill={color} style={{ stroke: "var(--surface)" }} strokeWidth={2.5} />
        </>
      )}
      {endLabels.map((l) => <text key={l.text} x={W - R + 8} y={l.y} dominantBaseline="middle" style={{ fill: l.fill, fontSize: 11, fontWeight: 800 }}>{l.text}</text>)}
      {r.days.map((d, i) => (
        <rect key={d.date} x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} fill="transparent"
          data-tip={`${dayTip(d)}\n\nCộng dồn target: ${money(pts[i].target)}${pts[i].actual != null ? `\nCộng dồn đạt: ${money(pts[i].actual)}` : pts[i].projected != null ? `\nDự phóng giữ nhịp: ${money(pts[i].projected)}` : ""}`} />
      ))}
    </svg>
  );
};

export const CumulativeLegend: React.FC<{ color: string }> = ({ color }) => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
    <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: color }} />Đã đạt (cộng dồn)</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: `repeating-linear-gradient(90deg,${color} 0 5px,transparent 5px 8px)` }} />Nếu giữ nhịp hiện tại</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-4 h-[3px] rounded inline-block" style={{ background: "repeating-linear-gradient(90deg,var(--text-faint) 0 3px,transparent 3px 6px)" }} />Target cộng dồn</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--accent)", opacity: 0.35 }} />Ngày camp</span>
  </div>
);

const BAR_COLOR: Record<RunRateTone, string> = TONE_VAR;

export const DayBars: React.FC<{ r: AccountRunRate; color: string; pickDay: string | null; onPick: (date: string) => void; dim?: (d: RRDay) => boolean }> = ({ r, color, pickDay, onPick, dim }) => {
  const { W, H, L, R, T, B } = FRAME;
  const days = r.days;
  const n = days.length;
  const maxV = niceMax(Math.max(...days.map((d) => Math.max(d.actual, d.target)), 1));
  const x = (i: number) => L + ((i + 0.5) / n) * (W - L - R);
  const y = (v: number) => T + (H - T - B) * (1 - v / maxV);
  const colW = (W - L - R) / n;
  const bw = Math.max(3, colW * 0.62);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="GMV từng ngày so với target của ngày">
      <CampBands days={days.map((d) => ({ date: d.date, bucket: d.bucket }))} x={x} colW={colW} top={T} height={H - T - B} />
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(maxV * f)} y2={y(maxV * f)} style={{ stroke: "var(--border)", opacity: 0.6 }} strokeWidth={1} />
          <text x={L - 8} y={y(maxV * f) + 4} textAnchor="end" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{f ? money(maxV * f) : "0"}</text>
        </g>
      ))}
      {days.map((d, i) => {
        const tone = toneOfPct(d.pctTarget);
        const fill = d.target > 0 ? BAR_COLOR[tone] : color;
        const faded = dim?.(d) ?? false;
        const op = faded ? 0.2 : d.state === "partial" ? 0.45 : 1;
        return (
          <g key={d.date} opacity={op} style={{ cursor: "pointer" }} onClick={() => onPick(d.date)}>
            {d.actual > 0 && <rect x={x(i) - bw / 2} y={y(d.actual)} width={bw} height={Math.max(1, y(0) - y(d.actual))} rx={2} fill={fill} />}
            {d.target > 0 && d.actual <= 0 && <rect x={x(i) - bw / 2} y={y(d.target)} width={bw} height={Math.max(1, y(0) - y(d.target))} rx={2} fill="none" style={{ stroke: "var(--text-faint)" }} strokeDasharray="3 3" strokeWidth={1.2} />}
            {d.target > 0 && d.actual > 0 && <line x1={x(i) - bw / 2 - 2} x2={x(i) + bw / 2 + 2} y1={y(d.target)} y2={y(d.target)} style={{ stroke: "var(--text)" }} strokeWidth={2} strokeLinecap="round" />}
            {pickDay === d.date && <rect x={x(i) - colW / 2 + 1} y={T} width={colW - 2} height={H - T - B} rx={3} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={1.5} />}
            <rect x={x(i) - colW / 2} y={T} width={colW} height={H - T - B} fill="transparent" data-tip={dayTip(d)} />
          </g>
        );
      })}
      {[1, 8, 15, 22, 29].filter((d) => d <= n).map((d) => (
        <text key={d} x={x(d - 1)} y={H - 8} textAnchor="middle" style={{ fill: "var(--text-faint)", fontSize: 11 }}>{String(d).padStart(2, "0")}/{r.month.slice(5)}</text>
      ))}
    </svg>
  );
};

export const DayBarsLegend: React.FC = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[var(--text-muted)]">
    <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--success)" }} />Đạt ≥ 95% target ngày</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--warning)" }} />85–95%</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--danger)" }} />Dưới 85%</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-3.5 h-[2px] inline-block" style={{ background: "var(--text)" }} />Target của ngày</span>
    <span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block border border-dashed" style={{ borderColor: "var(--text-faint)" }} />Chưa có số</span>
  </div>
);

export const DAY_STATE_LABEL: Record<DayState, string> = { counted: "Đã có số", partial: "Tạm tính", missing: "Thiếu số", future: "Chưa tới", empty: "Không có ca" };
