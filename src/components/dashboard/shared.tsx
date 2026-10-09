import React, { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Lock, Minus } from "lucide-react";
import { change } from "../../lib/performance/ceoBrief";
import type { IssueAction } from "../../lib/performance/ceoBrief";
import { metricHint } from "../../lib/metricGlossary";
import { getBrandTheme } from "../../lib/brandTheme";
import { fmtVndShort } from "../../lib/format";
import type { CampDayBucket } from "../../lib/campaignDays";

// Phần dùng chung của các khối Dashboard (tách từ CeoBrief.tsx 09/10/2026). Chỉ trình bày, không có luật số.

export const ACTION_TAB: Record<IssueAction, { tab: string; label: string }> = {
  sessions: { tab: "sessions", label: "Mở Sổ Ca" },
  month_plan: { tab: "month_plan", label: "Mở Kế Hoạch Tháng" },
  reconcile: { tab: "brands_overview", label: "Mở Toàn Cảnh Brand → Dữ Liệu Gốc" },
  talents: { tab: "talents", label: "Mở Talent Pool" },
  rate_card: { tab: "crm", label: "Mở Hợp đồng & giá (CRM)" },
  host_performance: { tab: "host_performance", label: "Mở Hiệu Suất Host" }
};
export const BUCKET_LABEL: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Daily" };
export const BUCKET_COLOR: Record<CampDayBucket, string> = { dday: "var(--accent)", midmonth: "var(--success)", payday: "var(--warning)", daily: "var(--text-faint)" };
export const WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export const money = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : fmtVndShort(v));
export const pct = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
export const num = (v: number) => Math.round(v).toLocaleString("vi-VN");
export const hrs = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ`;
export const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const weekdayIdx = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Màu brand cho biểu đồ: JOCKEY/Franklin có màu gần đen — không nhìn thấy trên nền tối — nên dùng màu phụ. */
export function chartColor(name: string): string {
  const t = getBrandTheme(name);
  const h = t.primary.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.2 ? "#94a3b8" : t.primary;
}

export const Delta: React.FC<{ cur: number | null; prev: number | null; goodWhenUp?: boolean }> = ({ cur, prev, goodWhenUp = true }) => {
  const c = change(cur, prev);
  if (c == null) return <span className="text-[11px] text-[var(--text-faint)]">kỳ trước chưa có số</span>;
  if (Math.abs(c) < 0.005) return <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--text-faint)]"><Minus className="w-3 h-3" />0%</span>;
  const good = c > 0 === goodWhenUp;
  const Icon = c > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${good ? "text-emerald-400" : "text-rose-400"}`}>
      <Icon className="w-3 h-3" />
      {(Math.abs(c) * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(c) < 0.1 ? 1 : 0 })}%
    </span>
  );
};

export const Card: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ className = "", style, children }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 ${className}`} style={style}>{children}</div>
);

export const SectionTitle: React.FC<{ title: string; note?: React.ReactNode }> = ({ title, note }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
    <h3 className="text-base sm:text-lg font-black text-[var(--text)]">{title}</h3>
    {note && <p className="text-xs text-[var(--text-faint)]">{note}</p>}
  </div>
);

export const Sparkline: React.FC<{ values: number[]; prev?: (number | null)[] }> = ({ values, prev }) => {
  if (values.length < 2) return null;
  const w = 200, h = 32;
  const all = [...values, ...(prev ?? []).filter((v): v is number => v != null)];
  const max = Math.max(...all, 0), min = Math.min(...all, 0);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  // Kỳ trước cùng thứ tự ngày (nét đứt mờ): ngày nào kỳ trước không có thì bỏ điểm đó.
  const prevPts = (prev ?? []).map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-8 mt-1" aria-hidden="true">
      <polygon points={`2,${h - 3} ${pts} ${w - 2},${h - 3}`} style={{ fill: "var(--accent)", opacity: 0.12 }} />
      {prevPts && <polyline points={prevPts} style={{ fill: "none", stroke: "var(--text-faint)", strokeWidth: 1.5, strokeDasharray: "3 3", opacity: 0.8 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      <polyline points={pts} style={{ fill: "none", stroke: "var(--accent)", strokeWidth: 2 }} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} style={{ fill: "var(--accent)" }} />
    </svg>
  );
};

export const Kpi: React.FC<{ label: string; value: string; cur: number | null; prev: number | null; goodWhenUp?: boolean; extra?: string; series?: number[]; prevSeries?: (number | null)[]; locked?: boolean; empty?: boolean }> = ({ label, value, cur, prev, goodWhenUp, extra, series, prevSeries, locked, empty }) => (
  <Card className="!p-3.5 flex flex-col gap-0.5 min-w-0">
    <span className="text-[11px] font-bold text-[var(--text-faint)] flex items-center gap-1" title={metricHint(label)}>
      {label}
      {locked && <Lock className="w-3 h-3" aria-label="Chỉ CEO/admin" />}
    </span>
    <span className="text-xl font-black text-[var(--text)] truncate">{value}</span>
    <span className="text-[11px] text-[var(--text-faint)] flex flex-wrap gap-x-1.5">
      {/* Kỳ chưa có ca nào: không so (trước đây ra "↓100%" đỏ cho tháng chưa bắt đầu). */}
      {empty ? <span className="text-[11px] text-[var(--text-faint)]">kỳ này chưa có ca</span> : <Delta cur={cur} prev={prev} goodWhenUp={goodWhenUp} />}
      {extra && <span>· {extra}</span>}
    </span>
    {series && <Sparkline values={series} prev={prevSeries} />}
  </Card>
);

// Tooltip nổi cho mọi phần tử có data-tip (biểu đồ SVG + ô lịch). Một listener cho cả màn.
export function useTooltip() {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest("[data-tip]");
    if (!el) return setTip(null);
    setTip({ x: e.clientX, y: e.clientY, text: el.getAttribute("data-tip") ?? "" });
  };
  const node = tip ? (
    <div
      className="fixed z-50 pointer-events-none bg-[var(--surface-elevated)] text-[var(--text)] border border-[var(--border)] rounded-xl px-3 py-2 text-xs shadow-2xl whitespace-pre-line max-w-[260px]"
      style={{ left: Math.min(tip.x + 14, window.innerWidth - 270), top: tip.y + 14 }}
    >
      {tip.text}
    </div>
  ) : null;
  return { onMove, onLeave: () => setTip(null), node };
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
