import React from "react";
import { MONTH_STEPS, type HalfStatus, type MonthStatus } from "../../lib/roster/monthStatus";
import { halfRange } from "../../lib/roster/milestones";

// Dải trạng thái theo tháng của Điều Phối Lịch Live (bản gọn 25/10): mỗi tháng một thẻ — 5 bước Mở ca → Đăng ký → Xếp người →
// Công bố → Live, MỘT trạng thái và MỘT nút. Trả lời "tháng nào đã xong đăng ký" mà không phải mở màn khác.

export type MonthAction = "now" | "next" | "nudge" | "staff" | "publish";

export interface MonthCard {
  status: MonthStatus;
  /** Tháng sau tháng sau: chưa tới lượt mở lịch, không tô đỏ. */
  later?: boolean;
  /** Dòng mô tả cho tháng đang chạy (giờ / kênh thiếu). */
  liveText?: string;
  /** Dòng mô tả cho tháng chưa mở ca (kênh chưa có cam kết…). */
  noneText?: string;
}

const PILL: Record<"bad" | "warn" | "good" | "off", string> = {
  bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  off: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};

const monthName = (m: string) => `Tháng ${Number(m.slice(5))}`;
export const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`;
};

function describe(c: MonthCard): { tone: keyof typeof PILL; label: string; text: string; action?: { kind: MonthAction; label: string } } {
  const s = c.status;
  const m = Number(s.month.slice(5));
  switch (s.phase) {
    case "live":
      return { tone: "good", label: "Đang live", text: c.liveText ?? "", action: { kind: "now", label: "Xem giờ từng kênh" } };
    case "past":
      return { tone: "off", label: "Đã qua", text: "" };
    case "none":
      return c.later
        ? { tone: "off", label: "Chưa tới", text: `Mở lịch sau khi tháng ${m - 1 || 12} xong đăng ký.` }
        : { tone: "bad", label: "Chưa mở ca", text: c.noneText ?? "Chưa có ca cho talent đăng ký.", action: { kind: "next", label: `Mở lịch tháng ${m}` } };
    case "no_deadline":
      return { tone: "warn", label: "Chưa đặt hạn đăng ký", text: `${s.openSlots} ca mở chờ talent đăng ký.`, action: { kind: "next", label: "Đặt hạn đăng ký" } };
    case "signup":
      return {
        tone: "warn",
        label: "Đang nhận đăng ký",
        text: `Tới ${fmtWhen(s.deadline!)} · ${s.slotsWithSignup}/${s.openSlots} ca có người báo rảnh · ${s.signedPeople} người đã đăng ký`,
        action: { kind: "nudge", label: "Chép tin nhắc người chưa đăng ký" }
      };
    case "staff":
      return {
        tone: "warn",
        label: s.deadline ? "Đã đóng · đang xếp người" : "Đang xếp người",
        text: `Còn ${s.noHost} ca chưa có host (${s.noHostWithSignup} ca có người báo rảnh)`,
        action: { kind: "staff", label: "Tới tuần còn trống" }
      };
    case "publish":
      return { tone: "warn", label: "Chờ công bố", text: `${s.drafted} ca nháp ở ${s.weeksToPublish.length} tuần chưa công bố.`, action: { kind: "publish", label: "Tới tuần chưa công bố" } };
    case "done":
      return { tone: "good", label: "Xong", text: `${s.sessions} ca đã chốt người.` };
  }
}

const ddmm = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;

/** Một dòng mỗi đợt (0200): hạn đăng ký · ngày chốt lịch · việc còn lại của ca trong đợt. */
const HalfLine: React.FC<{ month: string; h: HalfStatus; today: string }> = ({ month, h, today }) => {
  const left = h.noHost > 0 ? `${h.noHost} ca chưa có host` : h.toPublish > 0 ? `${h.toPublish} ca chưa công bố` : "xong";
  const late = !!h.publishBy && h.publishBy < today && left !== "xong";
  return (
    <li className="flex flex-wrap gap-x-1.5 tabular-nums">
      <b className="text-[var(--text)]">Đợt {h.half}</b>
      <span className="text-[var(--text-faint)]">ca {halfRange(month, h.half)}:</span>
      <span>hạn đăng ký {h.deadline ? fmtWhen(h.deadline) : "chưa đặt"}</span>
      <span>· chốt {h.publishBy ? ddmm(h.publishBy) : "chưa đặt"}</span>
      <span className={late ? "text-rose-400 font-bold" : left === "xong" ? "text-emerald-400" : "text-amber-300"}>· {late ? `quá hạn chốt — ${left}` : left}</span>
    </li>
  );
};

export const MonthStrip: React.FC<{ cards: MonthCard[]; viewMonth: string; today: string; onAction: (kind: MonthAction, month: string) => void }> = ({ cards, viewMonth, today, onAction }) => (
  <section className="grid gap-2 md:grid-cols-3" aria-label="Lịch theo tháng">
    {cards.map((c) => {
      const d = describe(c);
      return (
        <div key={c.status.month} className={`rounded-xl border bg-[var(--surface)] px-3 py-2.5 space-y-1.5 min-w-0 ${c.status.month === viewMonth ? "border-[var(--accent)]/50" : "border-[var(--border)]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black text-[var(--text)]">{monthName(c.status.month)}</h3>
            <span className={`inline-flex text-2xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${PILL[d.tone]}`}>{d.label}</span>
          </div>
          <div className="flex gap-1" aria-label={`Bước: ${MONTH_STEPS.filter((_, i) => c.status.steps[i] === "done").join(", ") || "chưa bước nào"}`}>
            {(c.later && c.status.phase === "none" ? c.status.steps.map(() => "todo" as const) : c.status.steps).map((st, i) => (
              <i key={i} title={MONTH_STEPS[i]} className={`block h-1.5 flex-1 rounded-full ${st === "done" ? "bg-[var(--success)]" : st === "cur" ? "bg-[var(--warning)]" : "bg-[var(--surface-elevated)]"}`} />
            ))}
          </div>
          <p className="text-2xs text-[var(--text-faint)]">{MONTH_STEPS.join(" · ")}</p>
          {d.text && <p className="text-xs text-[var(--text-muted)] tabular-nums">{d.text}</p>}
          {c.status.month > today.slice(0, 7) && c.status.phase !== "none" && (
            <ul className="text-2xs text-[var(--text-muted)] space-y-0.5" aria-label={`Mốc tháng ${Number(c.status.month.slice(5))}`}>
              {c.status.halves.map((h) => <HalfLine key={h.half} month={c.status.month} h={h} today={today} />)}
            </ul>
          )}
          {d.action && (
            <button type="button" onClick={() => onAction(d.action!.kind, c.status.month)} className="text-xs font-bold px-2.5 py-1 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--text)] hover:bg-[var(--accent)]/20">
              {d.action.label}
            </button>
          )}
        </div>
      );
    })}
  </section>
);
