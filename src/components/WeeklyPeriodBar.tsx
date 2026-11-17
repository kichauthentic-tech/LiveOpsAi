import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays, isoWeekNumber, isoWeekStart } from "../lib/dateUtils";
import { fmtDateVn } from "../lib/format";
import { weeklyBounds, type WeeklyMode } from "../lib/performance/weeklyReport";
import type { WeeklyPeriod } from "../lib/weeklyPeriodStore";

// Thanh chọn kỳ của Báo Cáo Tuần — tách khỏi WeeklyReport.tsx để App import thẳng mà không kéo recharts vào bundle chính
// (WeeklyReport nạp lazy). Trạng thái kỳ nằm ở App: hai khối sàn cùng xem MỘT kỳ.

const MODE_LABEL: Record<WeeklyMode, string> = { mtd: "Từ đầu tháng", week: "Theo tuần" };

export function periodOf(p: WeeklyPeriod) {
  return weeklyBounds(p.mode, p.anchor, isoWeekStart);
}

function periodLabel(p: WeeklyPeriod): string {
  const b = periodOf(p);
  const m = `${Number(b.month.slice(5, 7))}/${b.month.slice(0, 4)}`;
  if (p.mode === "mtd") return `Tháng ${m}`;
  const { week } = isoWeekNumber(p.anchor);
  return `Tuần ${week} · ${fmtDateVn(b.from, false)} – ${fmtDateVn(b.to, false)}`;
}

/** Bước sang kỳ trước/sau: tuần ±7 ngày, tháng ±1 tháng (neo vào ngày 1 — tránh trôi ngày). */
function shift(p: WeeklyPeriod, dir: -1 | 1): WeeklyPeriod {
  if (p.mode === "week") return { ...p, anchor: addDays(isoWeekStart(p.anchor), 7 * dir) };
  const d = new Date(Date.UTC(Number(p.anchor.slice(0, 4)), Number(p.anchor.slice(5, 7)) - 1 + dir, 1));
  return { ...p, anchor: `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}-01` };
}

/** Thanh chọn kỳ — App đặt MỘT lần phía trên các khối sàn để hai sàn cùng xem một kỳ. */
export const WeeklyPeriodBar: React.FC<{ value: WeeklyPeriod; today: string; onChange: (p: WeeklyPeriod) => void }> = ({ value, today, onChange }) => {
  const b = periodOf(value);
  const canNext = b.to < today;
  const btn = "p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30 disabled:hover:text-[var(--text-muted)]";
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Kỳ báo cáo">
      <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5" role="tablist">
        {(Object.keys(MODE_LABEL) as WeeklyMode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={value.mode === m}
            onClick={() => onChange({ mode: m, anchor: value.anchor > today ? today : value.anchor })}
            className={`px-3 py-1 rounded-md text-xs font-bold ${value.mode === m ? "bg-[var(--surface-hover)] text-[var(--text)] shadow-[inset_0_-2px_0_var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <button className={btn} aria-label="Kỳ trước" onClick={() => onChange(shift(value, -1))}><ChevronLeft className="w-4 h-4" /></button>
      <span className="text-sm font-bold text-[var(--text)] min-w-40 text-center">{periodLabel(value)}</span>
      <button className={btn} aria-label="Kỳ sau" disabled={!canNext} onClick={() => onChange(shift(value, 1))}><ChevronRight className="w-4 h-4" /></button>
    </div>
  );
};

