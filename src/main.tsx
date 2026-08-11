import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import './index.css';

// Error tracking (Phase 11) — no-op until VITE_SENTRY_DSN is set, same gated
// pattern as VITE_SUPABASE_URL: app behaves identically either way.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    tracesSampleRate: 0.1,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
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
