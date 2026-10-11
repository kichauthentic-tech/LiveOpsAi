import React from "react";
import { WAVE_NAME } from "../../lib/performance/channelHealth";
import { eachDay } from "../../lib/dateUtils";
import { sessionDurationHours } from "../../lib/pnl";
import type { Candidate } from "../../lib/performance/controlRoom";
import { money, pct } from "../dashboard/shared";
import { RATIO_COLOR, type RoomChannel } from "./types";

// Bản đồ tháng: mỗi hàng một kênh (= một phòng live), mỗi cột một ngày, mỗi vạch một ca theo giờ (9h trên, 24h dưới). Ca đã có số tô
// theo GMV ÷ kỳ vọng của chính ca đó; ca sắp tới là khung rỗng; ca thử trong sa bàn màu hổ phách. Chỉ trình bày.

const H0 = 9, H1 = 24;
const tod = (t: string) => Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60;

export const MonthMap: React.FC<{ month: string; today: string; channels: RoomChannel[]; adds: Candidate[] }> = ({ month, today, channels, adds }) => {
  const [y, m] = month.split("-").map(Number);
  const days = eachDay(`${month}-01`, new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
  const L = 118, cw = 28, gap = 3, top = 26, ch = 54;
  const W = L + days.length * (cw + gap), H = top + channels.length * (ch + gap);
  const yOf = (h: number) => ((Math.min(Math.max(h, H0), H1) - H0) / (H1 - H0)) * (ch - 6) + 3;
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Bản đồ ca của tháng theo phòng live" className="block">
        {days.map((d, i) => {
          const x = L + i * (cw + gap);
          const isToday = d === today;
          const camp = channels[0]?.bucketOf(d) !== "daily";
          return (
            <g key={d}>
              <text x={x + cw / 2} y={12} textAnchor="middle" fontSize={11} style={{ fill: isToday ? "var(--accent-text)" : "var(--text-faint)", fontWeight: isToday ? 800 : 500 }}>{Number(d.slice(8))}</text>
              {camp && <rect x={x} y={16} width={cw} height={3} rx={1.5} style={{ fill: "var(--warning)", opacity: 0.7 }} />}
            </g>
          );
        })}
        {channels.map((c, ri) => {
          const y0 = top + ri * (ch + gap);
          const room = c.room;
          const swing = new Map((room?.swings ?? []).map((s) => [s.id, s]));
          return (
            <g key={c.key}>
              <text x={0} y={y0 + ch / 2 - 3} fontSize={11.5} style={{ fill: "var(--text)", fontWeight: 700 }}>{c.brand.name}</text>
              <text x={0} y={y0 + ch / 2 + 11} fontSize={11} style={{ fill: "var(--text-faint)" }}>{c.platform} · {room?.now.pHit != null ? pct(room.now.pHit) : "—"}</text>
              {days.map((d, i) => (
                <rect key={d} x={L + i * (cw + gap)} y={y0} width={cw} height={ch} rx={4} style={{ fill: "var(--surface-muted)", opacity: d <= today ? 1 : 0.5 }} />
              ))}
              {(room?.sessions ?? []).map((s) => {
                const i = days.indexOf(s.date);
                if (i < 0) return null;
                const x = L + i * (cw + gap) + 4;
                const a = tod(s.startTime);
                const yy = y0 + yOf(a), hh = Math.max(3, yOf(a + s.hours) - yOf(a) - 1);
                const w = swing.get(s.id);
                const exp = s.actual != null ? w?.expectedNow ?? s.expected : s.expected * (room?.levelFactor ?? 1);
                const tip = `${s.date.slice(8)}/${s.date.slice(5, 7)} ${s.startTime}–${s.endTime} · ${WAVE_NAME[s.bucket]}\n${
                  s.actual != null ? `GMV ${money(s.actual)} · kỳ vọng ${money(exp)} (${pct(exp > 0 ? s.actual / exp : null)})` : `Kỳ vọng ${money(exp)}`
                }${w?.deltaP != null ? `\nXác suất về đích ${w.deltaP >= 0 ? "+" : ""}${(w.deltaP * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm` : ""}\n${s.hostName || "Chưa gán host"}${s.coHostName ? ` · ${s.coHostName}` : ""}`;
                return s.actual != null ? (
                  <rect key={s.id} data-tip={tip} x={x} y={yy} width={cw - 8} height={hh} rx={2} style={{ fill: RATIO_COLOR(exp > 0 ? s.actual / exp : 1) }} />
                ) : (
                  <rect key={s.id} data-tip={tip} x={x + 0.5} y={yy + 0.5} width={cw - 9} height={Math.max(2, hh - 1)} rx={2} style={{ fill: "none", stroke: "var(--text-faint)", strokeWidth: 1 }} />
                );
              })}
              {adds.filter((a) => a.channelKey === c.key).map((a) => {
                const i = days.indexOf(a.date);
                if (i < 0) return null;
                const s0 = tod(a.startTime);
                const hrs = sessionDurationHours(a.startTime, a.endTime);
                return (
                  <rect key={a.key} data-tip={`Ca thử trong sa bàn ${a.date.slice(8)}/${a.date.slice(5, 7)} ${a.startTime}–${a.endTime}\nKỳ vọng ${money(a.expected)} (đã tính giờ thêm)`} x={L + i * (cw + gap) + 4} y={y0 + yOf(s0)} width={cw - 8} height={Math.max(3, yOf(s0 + hrs) - yOf(s0) - 1)} rx={2} style={{ fill: "var(--warning)" }} />
                );
              })}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[var(--text-faint)]">
        {[["#e5484d", "Dưới 70% kỳ vọng"], ["#f19b9d", "70–90%"], ["#7d8796", "Đúng kỳ vọng ±10%"], ["#7fd0b0", "110–140%"], ["#2fb57f", "Trên 140%"]].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm border border-[var(--text-faint)]" />Ca sắp tới</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--warning)" }} />Ca thử trong sa bàn</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-2.5 h-[3px] rounded-sm" style={{ background: "var(--warning)" }} />Ngày camp</span>
      </div>
    </div>
  );
};
