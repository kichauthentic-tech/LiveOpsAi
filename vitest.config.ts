// Cấu hình riêng cho vitest, KHÔNG dùng vite.config.ts: test hiện đều là logic thuần (engine gợi ý,
// sổ ca, chia target) nên không cần plugin react/tailwind, và không cần biến môi trường Supabase.
// Thêm test cần DOM thì tách một project riêng ở đây chứ đừng kéo cả vite config vào.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node"
  }
});
