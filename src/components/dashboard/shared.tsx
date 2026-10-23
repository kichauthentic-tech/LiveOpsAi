import React, { useState } from "react";
import { getBrandTheme } from "../../lib/brandTheme";
import { fmtVndShort } from "../../lib/format";
import type { CampDayBucket } from "../../lib/campaignDays";

// Phần dùng chung của các khối Dashboard (tách từ màn Dashboard cũ 09/10/2026). Chỉ trình bày, không có luật số.

export const BUCKET_COLOR: Record<CampDayBucket, string> = { dday: "var(--accent)", midmonth: "var(--success)", payday: "var(--warning)", daily: "var(--text-faint)" };
export const WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export const money = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : fmtVndShort(v));
export const pct = (v: number | null | undefined, d = 0) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
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

export const Card: React.FC<{ className?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ className = "", style, children }) => (
  <div className={`bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 ${className}`} style={style}>{children}</div>
);

export const SectionTitle: React.FC<{ title: string; note?: React.ReactNode }> = ({ title, note }) => (
  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
    <h3 className="text-base sm:text-lg font-black text-[var(--text)]">{title}</h3>
    {note && <p className="text-xs text-[var(--text-faint)]">{note}</p>}
  </div>
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
