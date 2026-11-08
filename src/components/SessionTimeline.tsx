import React from "react";
import { TimelineLayout, vnClock } from "../lib/liveSnapshot/timeline";
import { breakReasonShort } from "../lib/liveSnapshot/roomCases";
import { shortRoomId } from "../lib/liveSnapshot/roomSelection";

// Vẽ dòng thời gian của ca (vị trí tính ở lib/liveSnapshot/timeline.ts). Thanh xanh = room/phiên trong ca này, xanh nhạt = phần
// thuộc ca kề bên, sọc = nghỉ giữa hai room, vạch đậm = giờ giao ca. Dưới trục: mỗi lượt một viên ngắn (số lượt · lý do · giờ).

const pos = (s: { leftPct: number; widthPct: number }): React.CSSProperties => ({ left: `${s.leftPct}%`, width: `${s.widthPct}%` });
const HATCH = "repeating-linear-gradient(45deg, color-mix(in srgb, var(--warning) 55%, transparent) 0 3px, transparent 3px 6px)";

export function SessionTimeline({ layout: l, unit }: { layout: TimelineLayout; unit: string }) {
  const multi = l.turns.length > 1;
  return (
    <div className="space-y-1.5" role="img" aria-label={`Dòng thời gian: ${l.turns.length} ${unit}${l.gaps.length ? `, nghỉ ${l.gaps.map((g) => `${g.minutes} phút`).join(", ")}` : ""}`}>
      <div className="relative h-4 text-2xs text-[var(--text-faint)] tabular-nums">
        {l.ticks.map((t, i) => (
          <span
            key={i}
            className="absolute whitespace-nowrap"
            style={{ left: `${t.pct}%`, transform: t.pct < 4 ? "none" : t.pct > 96 ? "translateX(-100%)" : "translateX(-50%)" }}
          >
            {t.label}
          </span>
        ))}
      </div>
      <div className="relative h-6">
        {l.prev && (
          <div className="absolute inset-y-0 rounded-md border border-dashed border-[var(--border)] px-1.5 flex items-center overflow-hidden" style={pos(l.prev)}>
            <span className="text-2xs font-bold text-[var(--text-faint)] truncate">ca trước</span>
          </div>
        )}
        <div className="absolute inset-y-0 rounded-md border-[1.5px] border-[var(--accent)] bg-[var(--accent)]/10" style={pos(l.me)} />
        {l.next && (
          <div className="absolute inset-y-0 rounded-md border border-dashed border-[var(--border)] px-1.5 flex items-center justify-end overflow-hidden" style={pos(l.next)}>
            <span className="text-2xs font-bold text-[var(--text-faint)] truncate">ca sau</span>
          </div>
        )}
        {l.gaps.map((g, i) => (
          <div key={`g${i}`} className="absolute top-[3px] bottom-[3px] rounded-sm" style={{ ...pos(g), background: HATCH }} />
        ))}
        {l.turns.map((t) => (
          <React.Fragment key={t.roomId}>
            {t.outside.map((o, i) => (
              <div key={i} className="absolute top-[3px] bottom-[3px] rounded bg-[var(--success)] opacity-35" style={pos(o)} />
            ))}
            {t.inside && (
              <div className="absolute top-[3px] bottom-[3px] rounded bg-[var(--success)] flex items-center justify-center overflow-hidden" style={pos(t.inside)}>
                {multi && t.inside.widthPct > 6 && <span className="text-2xs font-black text-white">{t.no}</span>}
              </div>
            )}
          </React.Fragment>
        ))}
        {[l.cutStartPct, l.cutEndPct].map((c, i) =>
          c === undefined ? null : <div key={`c${i}`} className="absolute -top-1 -bottom-1 w-0.5 bg-[var(--text)]" style={{ left: `${c}%` }} />
        )}
      </div>
      {(multi || l.next || l.prev) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-2xs text-[var(--text-muted)] tabular-nums">
          {l.turns.map((t) => (
            <span key={t.roomId} title={`${unit} ${t.roomId}`}>
              {multi && <b className="text-[var(--text)]">{t.no}</b>}
              {multi && " · "}
              {t.reason ? `${breakReasonShort(t.reason)} · ` : ""}
              {vnClock(t.startMs)}–{t.open ? "đang live" : vnClock(t.endMs)}
              {!multi && <span className="text-[var(--text-faint)]"> · {shortRoomId(t.roomId)}</span>}
            </span>
          ))}
          {l.gaps.length > 0 && <span className="text-[var(--warning)]">nghỉ {l.gaps.map((g) => `${g.minutes}'`).join(" + ")}</span>}
          {l.prev?.linked && <span className="text-[var(--text)]">← nối từ ca trước · {l.prev.label}</span>}
          {l.next?.linked && <span className="text-[var(--text)]">→ nối sang ca sau · {l.next.label}</span>}
        </div>
      )}
    </div>
  );
}
