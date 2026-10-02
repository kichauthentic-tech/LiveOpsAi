import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        // supabase-js import tĩnh RealtimeClient + StorageClient, nên 78 KB thư viện app không dùng
        // nằm trong chunk entry mà mọi người dùng phải tải trước khi thấy màn đăng nhập.
        // Chỉ ảnh hưởng bundle client; bản server (esbuild server.ts) không đi qua alias này.
        // Luật sửa + guard test: src/shims/README.md, tests/supabaseShims.test.ts.
        '@supabase/realtime-js': path.resolve(__dirname, 'src/shims/supabase-realtime.ts'),
        '@supabase/storage-js': path.resolve(__dirname, 'src/shims/supabase-storage.ts'),
      },
    },
    server: {
      // DISABLE_HMR=true tắt HMR + theo dõi file (di sản AI Studio: tránh nháy trang khi agent đang sửa code).
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
