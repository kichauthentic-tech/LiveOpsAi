import React from "react";
import { WAVE_NAME } from "../../lib/performance/channelHealth";
import type { PersonLoad } from "../../lib/performance/channelHealth";
import { ddmm, money, pct } from "../dashboard/shared";
import type { RoomChannel } from "./types";

// Các khối phân tích của Phòng Điều Hành. Chỉ trình bày — số từ lib/performance/controlRoom.ts.

const signedPct = (logv: number) => {
  const v = Math.exp(logv) - 1;
  return `${v >= 0 ? "+" : "−"}${Math.abs(Math.round(v * 100))}%`;
};

export const ChannelChips: React.FC<{ channels: RoomChannel[]; value: string; onChange: (k: string) => void; filter?: (c: RoomChannel) => boolean }> = ({ channels, value, onChange, filter }) => (
  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn kênh">
    {channels.filter(filter ?? (() => true)).map((c) => (
      <button key={c.key} type="button" aria-pressed={c.key === value} onClick={() => onChange(c.key)} className={`px-2.5 py-1 rounded-full text-xs font-bold border min-h-[28px] ${c.key === value ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent)]/15" : "border-[var(--border)] text-[var(--text-muted)]"}`}>{c.name}</button>
    ))}
  </div>
);

// ---------- Cầu GMV ----------
export const HostSkillTable: React.FC<{ channel: RoomChannel }> = ({ channel }) => {
  const rows = channel.hosts;
  if (rows.length === 0) return <p className="text-sm text-[var(--text-faint)]">Chưa host nào đủ 8 ca trong kênh ở 3 tháng gần nhất.</p>;
  const W = 120, mid = W / 2, sc = (v: number) => Math.max(4, Math.min(W - 4, mid + v * W / 1.2));
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-[var(--text-faint)] text-left">
              <th className="py-1.5 pr-2">Host</th><th className="py-1.5 pr-2 text-right">Ca</th><th className="py-1.5 pr-2 text-right" title="GMV/giờ so mặt bằng kênh — cách xếp thô">Thô</th>
              <th className="py-1.5 pr-2 text-right" title="Phần chênh do lịch cho sẵn: khung giờ, ngày camp, độ dài ca">Do khung giờ</th><th className="py-1.5 pr-2 text-right">Tay nghề</th><th className="py-1.5 pr-2">Khoảng 90%</th><th className="py-1.5">Kết luận</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lo = r.skill - r.ci90, hi = r.skill + r.ci90;
              const s = (v: number) => sc(Math.exp(v) - 1);
              return (
                <tr key={r.talentId} className="border-t border-[var(--border)]">
                  <td className="py-1.5 pr-2 text-[var(--text)] whitespace-nowrap">{r.name}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.sessions}</td>
                  <td className={`py-1.5 pr-2 text-right tabular-nums ${r.raw >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{signedPct(r.raw)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-[var(--text-muted)]">{signedPct(r.slotLuck)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums font-bold text-[var(--text)]">{signedPct(r.skill)}</td>
                  <td className="py-1.5 pr-2">
                    <svg viewBox={`0 0 ${W} 14`} width={W} height={14} aria-hidden="true">
                      <line x1={mid} x2={mid} y1={0} y2={14} style={{ stroke: "var(--border)" }} />
                      <line x1={s(lo)} x2={s(hi)} y1={7} y2={7} style={{ stroke: "var(--text-faint)", strokeWidth: 2 }} />
                      <circle cx={s(r.skill)} cy={7} r={4} style={{ fill: r.sure ? (r.skill > 0 ? "#2fb57f" : "#e5484d") : "var(--text-faint)" }} />
                    </svg>
                  </td>
                  <td className="py-1.5 text-xs whitespace-nowrap">{r.sure ? (r.skill > 0 ? <span className="text-emerald-400 font-bold">Hơn mặt bằng</span> : <span className="text-rose-400 font-bold">Kém mặt bằng</span>) : <span className="text-[var(--text-faint)]">Chưa đủ chắc</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">3 tháng gần nhất, chỉ trong kênh này. Đo trên 942 ca thật: một ca dao động ±56% nên cần khoảng 46 ca mới tin được một host; trợ live không có khác biệt đo được nên không chấm trợ bằng GMV.</p>
    </div>
  );
};

// ---------- Ca xoay chuyển ----------
export const SwingList: React.FC<{ channel: RoomChannel }> = ({ channel }) => {
  const r = channel.room;
  if (!r) return <p className="text-sm text-[var(--text-faint)]">Kênh chưa đủ lịch sử để chiếu.</p>;
  if (r.swings.length === 0) return <p className="text-sm text-[var(--text-faint)]">Tháng này chưa có ca nào có số.</p>;
  const byPoints = r.target != null && !r.decided;
  const rows = [...r.swings]
    .map((s) => ({ s, v: byPoints ? s.deltaP ?? 0 : s.actual - s.expectedNow }))
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    .slice(0, 8);
  const mx = Math.max(...rows.map((x) => Math.abs(x.v)), 1e-9);
  return (
    <div className="space-y-2">
      <p className="text-xs text-[var(--text-muted)]">
        {byPoints
          ? "Mỗi ca được chấm bằng số điểm xác suất về đích nó làm thay đổi so với việc ca đó chỉ đạt đúng kỳ vọng."
          : r.target == null
            ? "Kênh chưa có target: xếp theo GMV vượt/hụt kỳ vọng của chính ca đó."
            : `Khả năng đạt đã rõ (${pct(r.now.pHit)}) — một ca không còn đổi được kết quả tháng, nên đo bằng GMV vượt/hụt kỳ vọng.`}
      </p>
      {rows.map(({ s, v }) => (
        <div key={s.id} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(80px,180px) 76px" }}>
          <div className="min-w-0 truncate">
            <b className="text-[var(--text)]">{ddmm(s.date)} {s.startTime}</b> · {s.hostName || "Chưa gán host"} <span className="text-[var(--text-faint)]">· {WAVE_NAME[s.bucket]} · {money(s.actual)} / kỳ vọng {money(s.expectedNow)}</span>
          </div>
          <div className="relative h-2.5 rounded bg-[var(--surface-muted)]">
            <i className="absolute top-0 bottom-0 rounded" style={v >= 0 ? { left: "50%", width: `${(v / mx) * 50}%`, background: "#2fb57f" } : { right: "50%", width: `${(-v / mx) * 50}%`, background: "#e5484d" }} />
          </div>
          <span className={`text-right tabular-nums font-bold ${v >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{byPoints ? `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm` : `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`}</span>
        </div>
      ))}
      {byPoints && <p className="text-[11px] text-[var(--text-faint)]">Điểm = điểm phần trăm của khả năng về đích.</p>}
    </div>
  );
};

// ---------- Tải người ----------
export const PeopleLoadTable: React.FC<{ people: PersonLoad[]; weekLimit: number }> = ({ people, weekLimit }) => {
  const top = people.slice(0, 14);
  if (top.length === 0) return <p className="text-sm text-[var(--text-faint)]">Tháng này chưa có ai trên lịch.</p>;
  const mx = Math.max(...top.map((p) => p.hostHours + p.assistantHours), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-[11px] text-[var(--text-faint)] text-left"><th className="py-1.5 pr-2">Người</th><th className="py-1.5 pr-2" style={{ minWidth: 140 }}>Giờ tháng này (host · trợ)</th><th className="py-1.5 pr-2 text-right">Tuần nặng nhất</th><th className="py-1.5 text-right">Kênh</th></tr></thead>
        <tbody>
          {top.map((p) => {
            const tot = p.hostHours + p.assistantHours;
            const heavy = (p.peakWeek?.hours ?? 0) > weekLimit;
            return (
              <tr key={p.talentId} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-2 text-[var(--text)] whitespace-nowrap">{p.name}</td>
                <td className="py-1.5 pr-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded bg-[var(--surface-muted)] overflow-hidden flex">
                      <i style={{ width: `${(p.hostHours / mx) * 100}%`, background: "var(--accent)" }} />
                      <i style={{ width: `${(p.assistantHours / mx) * 100}%`, background: "var(--text-faint)" }} />
                    </div>
                    <span className="tabular-nums text-xs">{Math.round(tot)}h</span>
                  </div>
                </td>
                <td className={`py-1.5 pr-2 text-right tabular-nums ${heavy ? "text-amber-400 font-bold" : ""}`}>{p.peakWeek ? `${Math.round(p.peakWeek.hours)}h` : "—"}</td>
                <td className="py-1.5 text-right tabular-nums">{p.channels.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-[var(--text-faint)] mt-1.5">Gồm cả ca sắp tới. Đã kiểm trên 942 ca: giờ 7 ngày trước, ca thứ hai trong ngày, số ngày liền chưa làm GMV giảm đo được ở mức tải hiện tại — tô vàng (tuần trên {weekLimit} giờ) là cảnh báo sức khoẻ và rủi ro nghỉ đột xuất.</p>
    </div>
  );
};
