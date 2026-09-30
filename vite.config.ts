import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // supabase-js import tĩnh RealtimeClient + StorageClient, nên 78 KB thư viện app không dùng
        // nằm trong chunk entry mà mọi người dùng phải tải trước khi thấy màn đăng nhập.
        // Chỉ ảnh hưởng bundle client; bản server (esbuild server.ts) không đi qua alias này.
        // Luật sửa + guard test: src/shims/README.md, tests/supabaseShims.test.ts.
        '@supabase/realtime-js': path.resolve(__dirname, 'src/shims/supabase-realtime.ts'),
        '@supabase/storage-js': path.resolve(__dirname, 'src/shims/supabase-storage.ts'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
