// Công tắc bật/tắt một chạm (cửa sổ gọn 09/11): thay ô chọn thả xuống chỉ có hai giá trị (vd SKU "Đang lên sóng / Tạm ẩn" lặp 50 ô/trang).
export function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? "bg-[var(--success)]" : "bg-[var(--surface-hover)] border border-[var(--border)]"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-1"}`} />
    </button>
  );
}
