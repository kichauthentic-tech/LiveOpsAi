import React from "react";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

// Fallback cho ErrorBoundary bọc RIÊNG khu vực nội dung tab (App.tsx) — trước đây chỉ có 1
// ErrorBoundary ở gốc (main.tsx, Sentry.ErrorBoundary), nên lỗi render ở BẤT KỲ tab nào cũng làm
// trắng toàn bộ app (mất luôn sidebar/header, chỉ còn cách reload trang). Bọc riêng khu vực tab thì
// lỗi ở 1 module chỉ làm trống đúng khu vực đó — sidebar/header vẫn dùng được, chuyển tab khác là
// thoát ra ngay (App.tsx gắn `key={activeTab}` lên ErrorBoundary nên đổi tab = mount lại từ đầu,
// không cần nút "thử lại" tự viết logic reset).
interface TabErrorFallbackProps {
  tabLabel: string;
  onRetry: () => void;
  onGoHome: () => void;
}

export const TabErrorFallback: React.FC<TabErrorFallbackProps> = ({ tabLabel, onRetry, onGoHome }) => (
  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-12 space-y-5 text-[var(--text)] shadow-2xl">
    <div className="w-16 h-16 bg-red-500/20 text-red-400 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto">
      <AlertTriangle className="w-8 h-8" />
    </div>
    <div className="space-y-2">
      <h2 className="text-xl font-black text-[var(--text)]">Mục &quot;{tabLabel}&quot; gặp lỗi khi hiển thị</h2>
      <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
        Lỗi đã được ghi nhận. Các phần khác của app vẫn dùng bình thường — thử lại hoặc chuyển sang mục khác.
      </p>
    </div>
    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] rounded-xl text-xs font-bold transition-all flex items-center gap-2"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Thử Lại
      </button>
      <button
        onClick={onGoHome}
        className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-black shadow-lg shadow-[var(--accent)]/30 transition-all flex items-center gap-2"
      >
        <Home className="w-4 h-4" />
        Về Trang Mặc Định
      </button>
    </div>
  </div>
);
