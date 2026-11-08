import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { addDays, isoWeekStart } from "../../lib/dateUtils";
import { getBrandTheme } from "../../lib/brandTheme";
import { loadBetween, myRole } from "../../lib/talent/myShifts";
import { fmtFixed } from "../../lib/format";

// Chế độ "Cả tháng" của tab "Ca của tôi" (app talent, 08/11): lịch tháng T2–CN, mỗi ô ngày hiện chip ca của CHÍNH người này
// (màu brand + giờ vào ca). Bấm chip mở Cửa sổ Ca như các chế độ tuần. Chỉ ca của mình — không số GMV/target.

const compactHour = (t: string) => (t.slice(3, 5) === "00" ? `${Number(t.slice(0, 2))}h` : `${Number(t.slice(0, 2))}h${t.slice(3, 5)}`);
const HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

/** Lưới các tuần phủ kín tháng `ym` (YYYY-MM), mỗi tuần 7 ngày T2 → CN. */
export function monthWeeks(ym: string): string[][] {
  const first = `${ym}-01`;
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const weeks: string[][] = [];
  for (let d = isoWeekStart(first); d <= last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

const shiftMonth = (ym: string, delta: number): string => {
  const d = new Date(`${ym}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 7);
};

export const TalentMonthCalendar: React.FC<{
  mine: LiveSession[];
  talentId: string;
  today: string;
  clashIds: Set<string>;
  onOpen: (id: string) => void;
}> = ({ mine, talentId, today, clashIds, onOpen }) => {
  const [ym, setYm] = useState(today.slice(0, 7));
  const weeks = useMemo(() => monthWeeks(ym), [ym]);
  const byDate = useMemo(() => {
    const m = new Map<string, LiveSession[]>();
    for (const s of mine) {
      if (s.status === "Cancelled") continue;
      m.set(s.date, [...(m.get(s.date) ?? []), s]);
    }
    for (const xs of m.values()) xs.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [mine]);
  const inMonth = (d: string) => d.slice(0, 7) === ym;
  const total = useMemo(() => {
    const from = `${ym}-01`;
    const to = `${ym}-31`;
    const n = mine.filter((s) => s.status !== "Cancelled" && s.date >= from && s.date <= to).length;
    return { n, hours: loadBetween(mine, talentId, from, to).hours };
  }, [mine, talentId, ym]);
  const [y, mo] = ym.split("-");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Tháng trước" onClick={() => setYm(shiftMonth(ym, -1))} className="min-h-8 min-w-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-black text-[var(--text)] min-w-24 text-center">Tháng {Number(mo)}/{y}</h3>
          <button type="button" aria-label="Tháng sau" onClick={() => setYm(shiftMonth(ym, 1))} className="min-h-8 min-w-8 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]">
            <ChevronRight className="w-4 h-4" />
          </button>
          {ym !== today.slice(0, 7) && (
            <button type="button" onClick={() => setYm(today.slice(0, 7))} className="ml-1 min-h-8 px-2 rounded-lg text-xs font-bold text-[var(--accent-text)]">Tháng này</button>
          )}
        </div>
        <span className="text-xs text-[var(--text-muted)]">{total.n} ca · {fmtFixed(total.hours, total.hours % 1 ? 1 : 0)} giờ</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {HEAD.map((h) => (
          <div key={h} className="text-center text-2xs font-black text-[var(--text-faint)] py-1">{h}</div>
        ))}
        {weeks.flat().map((date) => {
          const items = byDate.get(date) ?? [];
          const isToday = date === today;
          return (
            <section
              key={date}
              aria-label={date}
              className={`min-w-0 min-h-20 rounded-lg border p-1 space-y-1 ${isToday ? "border-[var(--accent)]/70 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--surface)]"} ${inMonth(date) ? "" : "opacity-35"} ${date < today ? "opacity-70" : ""}`}
            >
              <div className={`text-2xs font-black px-0.5 ${isToday ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}`}>{Number(date.slice(8))}</div>
              {items.map((s) => {
                const th = getBrandTheme(s.brandName);
                const host = myRole(s, talentId) === "host";
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onOpen(s.id)}
                    title={`${s.brandName} · ${s.platform} · ${s.startTime}–${s.endTime} · ${host ? "Host" : "Trợ live"}`}
                    className={`w-full text-left rounded px-1 py-0.5 text-2xs font-bold leading-tight truncate ${clashIds.has(s.id) ? "ring-2 ring-rose-500" : ""}`}
                    style={{ background: th.primary, color: th.onPrimary }}
                  >
                    {/* Điện thoại: ô ngày chỉ rộng ~45px ⇒ ghi giờ gọn "20h" / "10h30"; từ 640px ghi đủ giờ + brand. */}
                    <span className="tabular-nums sm:hidden">{compactHour(s.startTime)}</span>
                    <span className="tabular-nums hidden sm:inline">{s.startTime.slice(0, 5)} {s.brandName}</span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
};
