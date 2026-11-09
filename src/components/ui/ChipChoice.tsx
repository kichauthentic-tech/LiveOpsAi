// Chọn một trong vài giá trị bằng ô chạm (cửa sổ gọn 09/11): thay ô chọn thả xuống ngắn (≤ 4–6 lựa chọn). Bấm lại ô đang chọn = bỏ chọn
import { useEffect, useRef, useState } from "react";
// khi `clearable`.
export function ChipChoice<T extends string>({
  options,
  value,
  onChange,
  label,
  clearable = false,
  onClass,
  className = ""
}: {
  options: readonly T[];
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  label: string;
  clearable?: boolean;
  /** Lớp màu riêng cho ô đang chọn (mặc định seg-on). */
  onClass?: (opt: T) => string | undefined;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-1 ${className}`}>
      {options.map((o) => {
        const on = value === o;
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on && clearable ? undefined : o)}
            className={`min-h-7 px-2 rounded-lg border text-2xs font-bold whitespace-nowrap ${
              on ? (onClass?.(o) ?? "seg-on") : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Ô chạm gọn cho bảng dày (mỗi dòng một giá trị, vd kế hoạch Affiliate): hiện giá trị đang chọn như một viên màu; chạm ⇒ bảng nhỏ các ô
 * chạm hiện ngay dưới, chạm một ô là xong. Không mở danh sách thả xuống của hệ điều hành, bảng không phình ra 4 ô mỗi cột.
 */
export function ChipPicker<T extends string>({
  options,
  value,
  onChange,
  label,
  clearable = false,
  display,
  styleFor,
  emptyLabel = "—"
}: {
  options: readonly T[];
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  label: string;
  clearable?: boolean;
  display?: (opt: T) => string;
  styleFor?: (opt: T | undefined) => string | undefined;
  emptyLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const show = (o: T | undefined) => (o === undefined ? emptyLabel : display ? display(o) : o);
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`${label}: ${show(value)}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`min-h-7 px-2 rounded text-xs font-semibold whitespace-nowrap ${styleFor?.(value) ?? "bg-[var(--surface-elevated)] text-[var(--text)]"}`}
      >
        {show(value)}
      </button>
      {open && (
        <span role="group" aria-label={label} className="absolute left-0 top-full mt-1 z-30 flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-xl min-w-[130px]">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={value === o}
              onClick={() => { onChange(value === o && clearable ? undefined : o); setOpen(false); }}
              className={`min-h-8 px-2.5 rounded-lg text-left text-xs font-bold whitespace-nowrap ${value === o ? "seg-on" : "hover:bg-[var(--surface-hover)] text-[var(--text)]"}`}
            >
              {show(o)}
            </button>
          ))}
          {clearable && value !== undefined && (
            <button type="button" onClick={() => { onChange(undefined); setOpen(false); }} className="min-h-8 px-2.5 rounded-lg text-left text-xs text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
              Bỏ chọn
            </button>
          )}
        </span>
      )}
    </span>
  );
}
