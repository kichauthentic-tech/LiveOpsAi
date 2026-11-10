import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Lưới tháng cho bước "chọn ngày" khi đổi ca: chấm = ngày có ca ĐỔI ĐƯỢC (đã lọc không chồng giờ), viền = ngày bạn đang có ca đổi đi,
// đánh dấu nhỏ = bạn có ca khác ngày đó (để nhìn ra "ngày này mình bận"). Đổi ca giữa hai tháng khác nhau (1/11 ↔ 30/11) = bấm ‹ ›.
// Chỉ chuyển giữa các tháng CÓ ngày chọn được — không bắt người dùng lật qua tháng trống.

const WEEK = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const ym = (date: string) => date.slice(0, 7);
const monthTitle = (key: string) => `Tháng ${Number(key.slice(5, 7))}/${key.slice(0, 4)}`;

export interface StripDay {
  date: string;
  count: number;
}

export const SwapMonthStrip: React.FC<{
  /** Ngày có ca đổi được + số ca. */
  days: StripDay[];
  /** Ngày của ca bạn đang đổi đi. */
  anchorDate: string;
  /** Ngày bạn có ca khác (bận). */
  busyDates: ReadonlySet<string>;
  selected: string | null;
  onSelect: (date: string) => void;
}> = ({ days, anchorDate, busyDates, selected, onSelect }) => {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d.count])), [days]);
  const months = useMemo(() => [...new Set(days.map((d) => ym(d.date)))].sort(), [days]);
  const [month, setMonth] = useState(() => (selected ? ym(selected) : (months[0] ?? ym(anchorDate))));
  const idx = months.indexOf(month);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = CN
  const lead = (first + 6) % 7; // đầu tuần = T2
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <button type="button" disabled={idx <= 0} onClick={() => setMonth(months[idx - 1])} aria-label="Tháng trước có ca đổi được" className="p-1 rounded-md text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-bold text-[var(--text)]">{monthTitle(month)}</span>
        <button type="button" disabled={idx < 0 || idx >= months.length - 1} onClick={() => setMonth(months[idx + 1])} aria-label="Tháng sau có ca đổi được" className="p-1 rounded-md text-[var(--text-muted)] disabled:opacity-30 hover:text-[var(--text)]">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEK.map((w) => (
          <span key={w} className="text-2xs text-[var(--text-faint)]">{w}</span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={`b${i}`} />;
          const n = byDate.get(d) ?? 0;
          const isAnchor = d === anchorDate;
          const on = d === selected;
          const base = "relative h-9 rounded-lg text-xs flex flex-col items-center justify-center border";
          const tone = on ? "seg-on" : n > 0 ? "border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]" : "border-transparent text-[var(--text-faint)]";
          return (
            <button key={d} type="button" disabled={n === 0} onClick={() => onSelect(d)} title={n > 0 ? `${n} ca đổi được` : isAnchor ? "Ngày ca bạn đổi đi" : undefined} className={`${base} ${tone} ${isAnchor ? "ring-1 ring-[var(--text-muted)]" : ""}`}>
              <span className="leading-none">{Number(d.slice(8))}</span>
              {n > 0 ? <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[var(--accent)]" /> : busyDates.has(d) ? <span className="mt-0.5 w-1 h-1 rounded-full bg-[var(--text-faint)] opacity-60" /> : <span className="mt-0.5 w-1 h-1" />}
            </button>
          );
        })}
      </div>
      <p className="text-2xs text-[var(--text-faint)] flex flex-wrap gap-x-3 gap-y-0.5">
        <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent)] mr-1" />có ca đổi được</span>
        <span><span className="inline-block w-1 h-1 rounded-full bg-[var(--text-faint)] opacity-60 mr-1" />bạn đã có ca</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm ring-1 ring-[var(--text-muted)] mr-1 align-middle" />ca bạn đổi đi</span>
      </p>
    </div>
  );
};
