import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface SearchSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: SearchSelectOption[];
  /** Nhãn của lựa chọn rỗng (value ""), vd "-- Chưa gán --". Bỏ trống = không có lựa chọn rỗng. */
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  searchPlaceholder?: string;
}

/** Bỏ dấu + hạ chữ thường để gõ "tuong" vẫn ra "Cát Tường". */
export function foldVi(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/**
 * Ô chọn có tìm kiếm (thay <select> khi danh sách dài, vd danh sách talent).
 * Gõ không dấu cũng tìm được; ↑/↓ chọn, Enter xác nhận, Esc đóng.
 */
export default function SearchSelect({
  value,
  onChange,
  options,
  emptyLabel,
  className = "",
  disabled,
  ariaLabel,
  searchPlaceholder = "Gõ tên để tìm…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean; fontSize: string; fontFamily: string } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all = useMemo<SearchSelectOption[]>(
    () => (emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options),
    [options, emptyLabel],
  );
  const shown = useMemo(() => {
    const f = foldVi(q.trim());
    if (!f) return all;
    return all.filter((o) => o.value !== "" && foldVi(o.label).includes(f));
  }, [all, q]);

  const current = all.find((o) => o.value === value);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom;
    const cs = getComputedStyle(btnRef.current!);
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up, fontSize: cs.fontSize, fontFamily: cs.fontFamily });
  };

  useEffect(() => {
    if (!open) return;
    place();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, pos !== null]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ("");
    btnRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[active]) pick(shown[active].value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: "calc(0.5rem + 4px)", paddingRight: "calc(0.5rem + 2px)" }}
        className={`w-full ${className} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown aria-hidden className="w-4 h-4 shrink-0 opacity-70" />
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              left: pos.left,
              width: Math.max(pos.width, 220),
              ...(pos.up ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.top + 4 }),
              zIndex: 9999,
              fontSize: pos.fontSize,
              fontFamily: pos.fontFamily,
            }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] shadow-xl overflow-hidden"
            onKeyDown={onKey}
          >
            <input
              ref={inputRef}
              style={{ fontSize: "inherit", fontFamily: "inherit" }}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full px-3 py-2 bg-[var(--surface)] text-[var(--text)] border-b border-[var(--border)] outline-none"
            />
            <div ref={listRef} role="listbox" className="max-h-60 overflow-y-auto py-1">
              {shown.length === 0 && <div className="px-3 py-2 text-[var(--text-muted)]">Không thấy tên nào khớp</div>}
              {shown.map((o, i) => (
                <div
                  key={o.value || "__empty"}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o.value)}
                  className={`px-3 py-1.5 cursor-pointer text-[var(--text)] ${i === active ? "bg-[var(--accent)]/20" : ""} ${o.value === value ? "font-bold" : ""} ${o.value === "" ? "text-[var(--text-muted)]" : ""}`}
                >
                  {o.label}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
