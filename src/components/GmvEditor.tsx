import { useState } from "react";
import { Check, X } from "lucide-react";

interface GmvEditorProps {
  /** Số gợi ý điền sẵn (số app tính / số đang chia). */
  initial?: number;
  busy?: boolean;
  onSave: (gmv: number) => void;
  onCancel: () => void;
}

// Ô gõ GMV đúng của ca (0174): chỉ nhận chữ số, hiện dấu chấm hàng nghìn khi gõ. Enter = lưu, Esc = huỷ.
export function GmvEditor({ initial, busy, onSave, onCancel }: GmvEditorProps) {
  const [digits, setDigits] = useState(initial != null && initial > 0 ? String(Math.round(initial)) : "");
  const value = digits ? Number(digits) : NaN;
  const save = () => { if (Number.isFinite(value) && !busy) onSave(value); };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        aria-label="GMV đúng của ca"
        inputMode="numeric"
        value={digits ? Number(digits).toLocaleString("vi-VN") : ""}
        placeholder="GMV đúng của ca"
        onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 13))}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") onCancel();
        }}
        className="w-32 px-2 py-1 rounded-md bg-[var(--surface-base)] border border-[var(--border)] text-xs font-bold text-[var(--text)] focus:outline-none focus:border-violet-500"
      />
      <button
        onClick={save}
        disabled={busy || !Number.isFinite(value)}
        title="Lưu GMV này"
        className="p-1 rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={onCancel} disabled={busy} title="Huỷ" className="p-1 rounded-md text-[var(--text-faint)] hover:text-[var(--text)] disabled:opacity-40">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}
