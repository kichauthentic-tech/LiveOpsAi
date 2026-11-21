import React from "react";

/** Hàng nút lý do chọn nhanh (lib/scheduling/changeReasons.ts). `value` trống ⇒ nút đầu (mặc định) sáng. */
export const ReasonChips: React.FC<{ choices: string[]; value: string; onChange: (v: string) => void }> = ({ choices, value, onChange }) => {
  const picked = value.trim() || choices[0];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lý do chọn nhanh">
      {choices.map((c) => (
        <button
          key={c}
          type="button"
          aria-pressed={picked === c}
          onClick={() => onChange(c)}
          className={`min-h-8 px-2.5 rounded-full border text-2xs font-bold ${picked === c ? "seg-on" : "border-[var(--border)] text-[var(--text-muted)]"}`}
        >
          {c}
        </button>
      ))}
    </div>
  );
};
