import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

/**
 * Bộ chọn tháng dùng chung — giá trị "YYYY-MM".
 *
 * Audit UX 2026-09-29 (Đợt 0 #4): app có 3 kiểu chọn tháng. 12 chỗ dùng `<input type="month">`, mà
 * MDN ghi rõ chỉ Chrome/Edge desktop có bộ chọn dùng được — Safari/Firefox desktop biến thành ô gõ
 * chữ "2026-09"; Chrome thì hiện theo ngôn ngữ trình duyệt ("September 2026") lẫn giữa giao diện
 * tiếng Việt. Component này tự vẽ: ‹ Tháng 9/2026 › + bảng 12 tháng, giống nhau trên mọi trình duyệt.
 *
 * - `arrows` (mặc định true): nút tháng trước/sau — bộ chọn cấp trang. Ô trong form thì tắt.
 * - `allowEmpty` + `emptyLabel`: cho phép bỏ trống (VD "Đến tháng" của hợp đồng chưa chốt).
 * - `min`/`max` "YYYY-MM": tháng ngoài khoảng bị khoá, nút ‹ › cũng dừng ở biên.
 */
interface MonthPickerProps {
  value: string;
  onChange: (month: string) => void;
  min?: string;
  max?: string;
  arrows?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
  disabled?: boolean;
  /** Bảng tháng mở về phía nào — "right" (mặc định) cho bộ chọn ở góc phải thẻ tiêu đề, "left" cho ô trong form. */
  align?: "left" | "right";
  className?: string;
}

export function shiftMonthStr(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthPickerLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `Tháng ${m}/${y}`;
}

const inRange = (m: string, min?: string, max?: string) => (!min || m >= min) && (!max || m <= max);

export const MonthPicker: React.FC<MonthPickerProps> = ({
  value,
  onChange,
  min,
  max,
  arrows = true,
  allowEmpty = false,
  emptyLabel = "Chưa chọn",
  size = "md",
  ariaLabel = "Chọn tháng",
  disabled = false,
  align = "right",
  className = ""
}) => {
  const [open, setOpen] = useState(false);
  const fallbackYear = Number((value || max || new Date().toISOString()).slice(0, 4));
  const [viewYear, setViewYear] = useState(fallbackYear);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pad = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const iconBtn = size === "sm" ? "p-1" : "p-2";
  const box = "bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-[var(--text)]";
  const prev = value ? shiftMonthStr(value, -1) : "";
  const next = value ? shiftMonthStr(value, 1) : "";

  const toggle = () => {
    if (disabled) return;
    if (!open) setViewYear(fallbackYear);
    setOpen((v) => !v);
  };
  const pick = (m: string) => {
    onChange(m);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative inline-flex items-center gap-1 ${className}`}>
      {arrows && (
        <button
          type="button"
          onClick={() => onChange(prev)}
          disabled={disabled || !value || !inRange(prev, min, max)}
          className={`${box} ${iconBtn} text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30`}
          aria-label="Tháng trước"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${box} ${pad} font-bold whitespace-nowrap inline-flex items-center gap-1.5 hover:border-[var(--accent)] disabled:opacity-60`}
      >
        <CalendarDays className="w-3.5 h-3.5 text-[var(--text-faint)]" />
        {value ? monthPickerLabel(value) : <span className="text-[var(--text-faint)] font-medium">{emptyLabel}</span>}
      </button>
      {arrows && (
        <button
          type="button"
          onClick={() => onChange(next)}
          disabled={disabled || !value || !inRange(next, min, max)}
          className={`${box} ${iconBtn} text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30`}
          aria-label="Tháng sau"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label={ariaLabel}
          className={`absolute z-50 top-full mt-1.5 ${align === "right" ? "right-0" : "left-0"} w-60 p-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-2xl space-y-2`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewYear((y) => y - 1)}
              disabled={!!min && `${viewYear - 1}-12` < min}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-30"
              aria-label="Năm trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-black text-[var(--text)]">{viewYear}</span>
            <button
              type="button"
              onClick={() => setViewYear((y) => y + 1)}
              disabled={!!max && `${viewYear + 1}-01` > max}
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-30"
              aria-label="Năm sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }, (_, i) => {
              const m = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
              const selected = m === value;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => pick(m)}
                  disabled={!inRange(m, min, max)}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${
                    selected
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  }`}
                >
                  T{i + 1}
                </button>
              );
            })}
          </div>
          {allowEmpty && value && (
            <button
              type="button"
              onClick={() => pick("")}
              className="w-full py-1.5 rounded-lg text-[11px] font-bold text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              Bỏ chọn ({emptyLabel.toLowerCase()})
            </button>
          )}
        </div>
      )}
    </div>
  );
};
