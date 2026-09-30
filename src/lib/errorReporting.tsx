import React from "react";

// Sentry nặng 91 KB (core 64 + browser 17 + browser-utils 6 + react 3) và nằm trong chunk entry, tức
// MỌI người dùng phải tải xong nó rồi mới thấy màn đăng nhập — trong khi nó không vẽ một pixel nào.
// File này đảo lại: app chỉ giữ một ErrorBoundary React thuần + một hàng đợi lỗi, còn Sentry thật được
// import() sau khi trang đã paint (idle). Không mất lỗi nào: từ giây đầu đã có listener `error`/
// `unhandledrejection` gom vào hàng đợi, Sentry nạp xong thì xả hàng đợi rồi tự gỡ listener để không
// báo trùng với listener của chính nó.
//
// Đổi 2026-10-01 (tách bundle). Trước đây `main.tsx` gọi thẳng `Sentry.init` và `App.tsx`/`main.tsx`
// dùng `Sentry.ErrorBoundary`.

type Capture = (error: unknown, context?: Record<string, unknown>) => void;

const MAX_QUEUE = 50; // lỗi lặp vô hạn trước khi Sentry nạp xong không được phình bộ nhớ
const queue: { error: unknown; context?: Record<string, unknown> }[] = [];
let forward: Capture | null = null;

/** Ghi nhận lỗi. Trước khi Sentry nạp xong thì xếp hàng, sau đó chuyển thẳng. */
export const captureException: Capture = (error, context) => {
  if (forward) {
    forward(error, context);
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push({ error, context });
};

function onWindowError(e: ErrorEvent) {
  captureException(e.error ?? e.message);
}
function onRejection(e: PromiseRejectionEvent) {
  captureException(e.reason);
}

/**
 * Gọi một lần ở `main.tsx`. Không có `VITE_SENTRY_DSN` thì không tải gì cả — giống hệt hành vi cũ
 * (`Sentry.init` vốn đã nằm sau `if (import.meta.env.VITE_SENTRY_DSN)`).
 */
export function initErrorReporting(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  window.addEventListener("error", onWindowError);
  window.addEventListener("unhandledrejection", onRejection);

  const load = () => {
    // Destructure, KHÔNG `.then((Sentry) => ...)`: nhận cả namespace thì Rollup không biết ta dùng
    // export nào nên giữ nguyên mọi integration (tracing/replay/feedback) — đo 2026-10-01 là 494 KB
    // thay vì 137 KB. Lấy đúng 2 hàm cần dùng thì tree-shaking chạy lại được.
    import("@sentry/react")
      .then(({ init, captureException: send }) => {
        init({ dsn, tracesSampleRate: 0.1 });
        // Sentry có listener toàn cục của riêng nó — gỡ listener của ta trước khi xả hàng đợi,
        // nếu không mỗi lỗi mới sẽ được báo 2 lần.
        window.removeEventListener("error", onWindowError);
        window.removeEventListener("unhandledrejection", onRejection);
        forward = (error, context) => {
          send(error, context ? { extra: context } : undefined);
        };
        for (const item of queue.splice(0)) forward(item.error, item.context);
      })
      .catch(() => {
        // Chặn quảng cáo/mạng hỏng làm import() fail: app vẫn chạy, chỉ là không có telemetry.
        // Giữ nguyên listener để hàng đợi không nuốt lỗi im lặng ở console.
      });
  };

  // Sau khi trang đã paint. `requestIdleCallback` chưa có ở Safari cũ → lùi về setTimeout.
  const schedule = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 2000));
  if (document.readyState === "complete") schedule(load);
  else window.addEventListener("load", () => schedule(load), { once: true });
}

interface FallbackArgs {
  error: unknown;
  resetError: () => void;
}

interface Props {
  children: React.ReactNode;
  fallback: React.ReactNode | ((args: FallbackArgs) => React.ReactNode);
}

/**
 * Thay `Sentry.ErrorBoundary`. Giữ đúng 2 dạng `fallback` mà repo đang dùng: một element (main.tsx)
 * và một hàm nhận `{ resetError }` (App.tsx, có `key={activeTab}` để đổi tab là mount lại).
 */
export class ErrorBoundary extends React.Component<Props, { error: unknown | null }> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    captureException(error, { componentStack: info.componentStack });
  }

  resetError = () => this.setState({ error: null });

  render() {
    if (this.state.error === null) return this.props.children;
    const { fallback } = this.props;
    return typeof fallback === "function" ? fallback({ error: this.state.error, resetError: this.resetError }) : fallback;
  }
}
