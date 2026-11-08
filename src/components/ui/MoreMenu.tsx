import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

// Nút "⋯" gom các thao tác ít dùng (cửa sổ ca gọn 08/11): màn chính chỉ giữ việc chính, phần còn lại một chạm là thấy.
export interface MoreMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export function MoreMenu({ items, label = "Thao tác khác", className = "" }: { items: MoreMenuItem[]; label?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  if (items.length === 0) return null;
  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-9 min-w-9 px-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] flex items-center justify-center"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-20 min-w-[220px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-xl">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`block w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-[var(--surface-hover)] disabled:opacity-40 ${it.danger ? "text-[var(--danger)]" : "text-[var(--text)]"}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
