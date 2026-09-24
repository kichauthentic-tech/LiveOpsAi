import React, { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";

// Thay window.confirm() (đợt dọn nợ kỹ thuật, tiếp theo useToast.tsx). window.confirm() là dialog
// CHẶN — không test/automation được (Browser pane tự nuốt, trả về false ngay), không style được
// (không khớp theme app), và chỉ hiện được PLAIN TEXT (nhiều chỗ đang nhét cả đoạn cảnh báo dài
// nhiều dòng vào 1 chuỗi `\n\n`). confirm() ở đây trả Promise<boolean> — mọi call site phải là (hoặc
// đổi thành) async để `await` được, khác hẳn alert()/showToast() vốn không gate gì nên thay cơ học.

interface ConfirmOptions {
  /** Nút xác nhận màu đỏ — dùng cho hành động phá huỷ/không hoàn tác (xoá, huỷ ca...). Mặc định xanh. */
  danger?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

const ConfirmDialog: React.FC<{ state: ConfirmState; onConfirm: () => void; onCancel: () => void }> = ({
  state,
  onConfirm,
  onCancel
}) => (
  <div
    className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    onClick={onCancel}
  >
    <div
      role="alertdialog"
      aria-modal="true"
      className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            state.danger ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
          }`}
        >
          <AlertTriangle className="w-4.5 h-4.5" />
        </div>
        {/* Nhiều lời gọi cũ ghép cảnh báo nhiều đoạn bằng "\n\n" — whitespace-pre-line giữ đúng
            xuống dòng thay vì dồn thành 1 dòng dài như div thường sẽ làm. */}
        <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-line flex-1 pt-1.5">
          {state.message}
        </p>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] transition-colors"
        >
          {state.cancelLabel ?? "Huỷ"}
        </button>
        <button
          onClick={onConfirm}
          autoFocus
          className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-colors ${
            state.danger ? "bg-rose-600 hover:bg-rose-500" : "bg-[var(--accent)] hover:bg-[var(--accent-hover)]"
          }`}
        >
          {state.confirmLabel ?? "Xác nhận"}
        </button>
      </div>
    </div>
  </div>
);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options = {}) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve, ...options });
    });
  }, []);

  const settle = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && <ConfirmDialog state={state} onConfirm={() => settle(true)} onCancel={() => settle(false)} />}
    </ConfirmContext.Provider>
  );
};

/** Trả về hàm confirm(message, options?) => Promise<boolean> — thay window.confirm(), phải await. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}
