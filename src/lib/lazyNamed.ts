import { lazy, type ComponentType } from "react";

// Tách bundle theo tab (audit UX 2026-09-26, P2). Trước đây cả app là 1 file JS 2,58 MB (721 KB gzip) —
// talent mở "Ca Của Tôi" cũng phải tải thư viện Excel (xlsx) và biểu đồ (recharts) của Report Tháng.
// React.lazy chỉ nhận default export, còn component trong repo là named export → helper này bọc lại.
// `any` ở đây khớp đúng ràng buộc của chính React.lazy (`T extends ComponentType<any>`); kiểu props thật
// của component vẫn giữ nguyên qua M[K].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyNamed<K extends string, M extends Record<K, ComponentType<any>>>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then((m) => ({ default: m[name] })));
}

// Sau mỗi lần deploy, file chunk cũ (hash cũ) không còn trên Vercel. Tab đang mở từ trước deploy bấm sang
// tab chưa tải → import() lỗi. Vite phát sự kiện `vite:preloadError` cho đúng trường hợp này; tải lại trang
// để lấy index.html mới. Chặn lặp: chỉ tự tải lại 1 lần mỗi 30 giây (nếu chunk hỏng thật thì để lỗi hiện ra
// ở TabErrorFallback thay vì reload vô hạn).
const RELOAD_KEY = "liveops_chunk_reload_at";

export function installStaleChunkReload(): void {
  window.addEventListener("vite:preloadError", (event) => {
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    } catch {
      /* sessionStorage bị chặn — vẫn reload 1 lần */
    }
    if (Date.now() - last < 30_000) return;
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* bỏ qua */
    }
    event.preventDefault();
    window.location.reload();
  });
}
