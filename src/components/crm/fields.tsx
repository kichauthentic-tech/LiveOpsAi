import React, { useState } from "react";

// Ô nhập dùng chung của khối Hợp đồng & giá (CRM). Một kiểu cho mọi ô để màn điều khoản không mỗi chỗ một cỡ.

export const inputCls =
  "w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-60";
export const btnCls = "px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white text-xs font-bold";
export const btnGhostCls = "px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] text-xs font-bold disabled:opacity-50";
export const cardCls = "bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-4 space-y-3";

/** Một ô số + nút Lưu (giá trị đang lưu hiện bên cạnh). */
export function NumberField({
  label,
  hint,
  current,
  placeholder,
  max,
  step,
  canEdit,
  onSave
}: {
  label: string;
  hint?: string;
  current: string;
  placeholder: string;
  max?: number;
  step?: number;
  canEdit: boolean;
  onSave: (v: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const v = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(v) || v < 0 || (max !== undefined && v > max)) return;
    setBusy(true);
    const ok = await onSave(v);
    setBusy(false);
    if (ok) setDraft("");
  };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold text-[var(--text-muted)]">{label}</span>
        <span className="text-xs font-black text-[var(--text)]">{current}</span>
      </div>
      {canEdit && (
        <div className="flex items-center gap-2">
          <input type="number" min={0} max={max} step={step} value={draft} placeholder={placeholder} aria-label={label} onChange={(e) => setDraft(e.target.value)} className={inputCls} />
          <button onClick={save} disabled={busy || draft.trim() === ""} className={btnCls}>{busy ? "…" : "Lưu"}</button>
        </div>
      )}
      {hint && <p className="text-[11px] text-[var(--text-faint)] leading-snug">{hint}</p>}
    </div>
  );
}

/**
 * Ô số có kiểm soát: gõ dở ("1.", rỗng) không bị ép về 0 giữa chừng; rỗng = 0.
 */
export function NumInput({
  value,
  onChange,
  min = 0,
  max,
  step,
  disabled,
  placeholder,
  label,
  suffix
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  label: string;
  suffix?: string;
}) {
  // Đang gõ thì giữ đúng chuỗi người dùng gõ ("1.", rỗng); rời ô thì hiện lại theo giá trị thật (đổi từ ngoài, vd chọn gói mẫu, cũng theo).
  const [typing, setTyping] = useState<string | null>(null);
  const shown = typing ?? (value === 0 ? "" : String(value));
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        placeholder={placeholder ?? "0"}
        aria-label={label}
        onChange={(e) => {
          setTyping(e.target.value);
          const n = Number(e.target.value || 0);
          if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min, n)));
        }}
        onBlur={() => setTyping(null)}
        className={inputCls}
      />
      {suffix && <span className="text-[11px] text-[var(--text-faint)] whitespace-nowrap">{suffix}</span>}
    </div>
  );
}

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[11px] font-bold text-[var(--text-muted)]">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-[var(--text-faint)] leading-snug">{hint}</span>}
    </label>
  );
}

/** Nút chọn dạng viên thuốc (bật/tắt hoặc chọn một trong nhóm) — dùng thay cho thẻ radio/checkbox dài kèm chú thích. */
export function Pill({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold border transition disabled:opacity-60 ${on ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
    >
      {children}
    </button>
  );
}
