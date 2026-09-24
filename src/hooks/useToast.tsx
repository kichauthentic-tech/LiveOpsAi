import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

// Thay window.alert() (đợt dọn nợ kỹ thuật 2026-09-25, user chọn "thay alert()/confirm() bằng modal
// riêng"). window.alert() là dialog CHẶN — đứng hình cả tab (kể cả animation/network) tới khi người
// dùng bấm OK, và không test/automation được (Browser pane tự nuốt nó, trả về undefined ngay). Toast
// không chặn gì, tự biến mất, và có thể query được qua DOM như UI thật.

export type ToastVariant = "error" | "success" | "info";

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  /** variant mặc định "error" vì đa số lời gọi cũ là window.alert() sau catch (e) — giữ hành vi quen. */
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// 8s — đủ đọc hết một câu lỗi dài kèm errorMessage(e), không cần bấm tắt tay như alert() cũ nhưng
// cũng không biến mất trước khi đọc xong. Vẫn có nút × để tắt sớm nếu cần.
const AUTO_DISMISS_MS = 8000;

const VARIANT_STYLE: Record<ToastVariant, string> = {
  error: "border-red-500/40 bg-red-950/95 text-red-100",
  success: "border-emerald-500/40 bg-emerald-950/95 text-emerald-100",
  info: "border-sky-500/40 bg-sky-950/95 text-sky-100"
};

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  error: AlertTriangle,
  success: CheckCircle2,
  info: Info
};

const ToastHost: React.FC<{ toasts: ToastItem[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const Icon = VARIANT_ICON[t.variant];
        return (
          <div
            key={t.id}
            role="alert"
            className={`pointer-events-auto rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl flex items-start gap-2.5 backdrop-blur-md ${VARIANT_STYLE[t.variant]}`}
          >
            <Icon className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1 leading-relaxed whitespace-pre-line">{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Đóng thông báo"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback<ToastContextValue["showToast"]>((message, variant = "error") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, variant }]);
    window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
