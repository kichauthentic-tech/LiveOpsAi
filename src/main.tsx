import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { ConfirmProvider } from './hooks/useConfirm';
import './index.css';
import { installStaleChunkReload } from './lib/lazyNamed';
import { ErrorBoundary, initErrorReporting } from './lib/errorReporting';

installStaleChunkReload();

// Error tracking (Phase 11) — no-op until VITE_SENTRY_DSN is set, same gated
// pattern as VITE_SUPABASE_URL: app behaves identically either way. Từ 2026-10-01 Sentry được
// import() sau khi trang paint, không nằm trong chunk entry nữa — xem src/lib/errorReporting.tsx.
initErrorReporting();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary fallback={<ErrorFallback />}>
      <ThemeProvider>
        <ToastProvider>
          <ConfirmProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ConfirmProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);

function ErrorFallback() {
  return (
    <div style={{ padding: 32, textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>Đã có lỗi xảy ra</h1>
      <p>Vui lòng tải lại trang. Lỗi đã được ghi nhận.</p>
    </div>
  );
}
