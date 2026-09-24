// ESLint flat config — dựng 2026-09-24 (ưu tiên #5 của đợt audit code base).
//
// LÝ DO TỒN TẠI: repo đã có 11 comment `// eslint-disable-next-line react-hooks/exhaustive-deps`
// rải trong src/ NHƯNG KHÔNG CÓ ESLINT — tức 11 chỗ đó chỉ là chữ, không tắt gì cả, và rule
// `exhaustive-deps` (thứ bắt được lớp lỗi re-render mỗi 60s đã vá ở đợt audit Phần 1) chưa từng chạy
// một lần nào. Lần chạy đầu tiên ra 19 lỗi exhaustive-deps mà 11 comment kia không phủ tới, trong đó
// có 1 lỗi mới gây ra cùng ngày ở MonthPlan (Đ12). Xem mục "#5 ESLint + test" ở WORKSPACE_DESIGN.md.
//
// QUY TẮC CHỌN MỨC: rule nào cây code hiện tại đã xanh thì để "error" để CI chặn thật. Rule nào còn
// vi phạm cũ chưa sửa được thì để "warn" KÈM lý do — không để "error" rồi vô hiệu hoá cả script
// `npm run lint`, cũng không xoá rule đi cho đẹp mắt.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "supabase/**", "server.cjs", "*.config.js"]
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // 93 chỗ, riêng App.tsx 36 + createApp.ts 18. Phần lớn là handler Express và payload Excel —
      // gắn kiểu thật cho từng chỗ là một đợt refactor riêng, không phải việc của phiên dựng lint.
      // Để "warn" nên vẫn đếm được và không trôi thêm, nhưng không chặn CI.
      "@typescript-eslint/no-explicit-any": "warn",

      // Tiền tố _ = "biến/prop này CỐ Ý không dùng" (xem LiveCalendar: 3 handler App.tsx truyền vào
      // mà component không hề dùng — giữ dấu vết thay vì xoá dây nối).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }
      ]
    }
  },

  // ---- Code chạy trong browser ----
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Hai rule chính, cả hai ERROR — đây là mục đích của cả file này.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error"
    }
  },

  // ---- Code chạy trong Node ----
  {
    files: ["server.ts", "api/**/*.ts", "src/server/**/*.ts", "vite.config.ts"],
    languageOptions: { globals: { ...globals.node } }
  },

  // ---- Test thuần (không DOM, không browser) ----
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node } }
  }
);
