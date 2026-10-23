import React from "react";
import type { ChannelCard } from "../../lib/performance/channelCard";
import { LANDING_LABEL, type LandingKey } from "../../lib/performance/forecastCone";
import { pct } from "./shared";

// Viên nhãn khả năng đạt + màu của thẻ kênh (`ChannelCard`, lib/performance/channelCard.ts) — dùng ở thẻ run-rate (tab Toàn sàn) và đầu
// tab Brand của Dashboard. Thẻ kênh cỡ lớn của màn Chi tiết kênh (21/10) đã gỡ khi gộp vào tab Brand (23/10).

type ToneKey = Exclude<LandingKey, "no_target" | "no_forecast">;
const TONE: Record<ToneKey, { pill: string; fill: string }> = {
  safe: { pill: "bg-emerald-500/15 text-emerald-400", fill: "var(--success)" },
  likely: { pill: "bg-sky-500/15 text-sky-300", fill: "#38bdf8" },
  unlikely: { pill: "bg-amber-500/15 text-amber-300", fill: "var(--warning)" },
  short: { pill: "bg-rose-500/15 text-rose-400", fill: "var(--danger)" }
};
/** Màu theo nhãn — dùng chung với thẻ run-rate của Dashboard agency (runrate/AccountCard). */
export const TONE_FILL = Object.fromEntries(Object.entries(TONE).map(([k, v]) => [k, v.fill])) as Record<ToneKey, string>;

export const CardPill: React.FC<{ card: ChannelCard }> = ({ card: c }) => {
  const base = "inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap";
  if (c.state === "off") return <span className={`${base} bg-[var(--surface-elevated)] text-[var(--text-faint)]`}>Không chạy</span>;
  if (c.state === "no_plan") return <span className={`${base} bg-[var(--surface-elevated)] text-[var(--text-faint)]`}>Chưa có target</span>;
  if (!c.landing) return <span className={`${base} bg-[var(--surface-elevated)] text-[var(--text-faint)]`}>{c.newChannel ? "Chưa dự báo" : "Chờ số"}</span>;
  return (
    <span className={`${base} ${TONE[c.landing.key].pill}`}>
      <i className="w-1.5 h-1.5 rounded-full" style={{ background: "currentColor" }} aria-hidden="true" />
      {/* "99% run-rate mà Khó đạt" đọc không hiểu (user 22/10) ⇒ nói rõ con số là gì. */}
      {c.landing.key === "short" && c.forecast && c.target ? `${LANDING_LABEL.short} · dự kiến thiếu ~${pct(1 - c.forecast.p50 / c.target)} target` : `${LANDING_LABEL[c.landing.key]} · khả năng chạm target ${pct(c.landing.pHit)}`}
    </span>
  );
};
