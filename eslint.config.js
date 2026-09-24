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
      // Từng 93 chỗ lúc dựng file này (App.tsx 36 + createApp.ts 18 + 15 file khác) — đã vá sạch
      // 2026-09-24 (ưu tiên #5), giờ lên "error" theo đúng QUY TẮC CHỌN MỨC ở trên.
      "@typescript-eslint/no-explicit-any": "error",

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
      "react-hooks/exhaustive-deps": "error",

      // Bộ rule React Compiler (eslint-plugin-react-hooks v7, `configs["recommended-latest"]`) —
      // bắt lớp lỗi sâu hơn exhaustive-deps: mutate props/state ngay trong render, setState trong
      // effect gây double-render, component định nghĩa lại mỗi render (không memo hoá được), v.v.
      // Bật hết ở "warn" trước để đo (audit 2026-09-24): ra đúng 3 rule có vi phạm trên cây code
      // hiện tại — `static-components` (8, cả 8 cùng 1 file: BrandWeeklyReport định nghĩa lại
      // component `Kpi` mỗi render — đã hoisted ra module scope), `immutability` (1, MonthlyDeepDive
      // cộng dồn biến `acc` ngay trong .map — đã đổi qua slice+reduce), và `set-state-in-effect` (41,
      // rải 24 file). 2 rule đầu đã sửa sạch, lên "error". `set-state-in-effect` GIỮ "warn": đây gần
      // như toàn bộ là pattern setLoading(true) đầu effect rồi fetch async — hợp lệ, phổ biến, không
      // phải bug thật; "sửa đúng" theo khuyến nghị của rule (bỏ effect, dùng data-fetching lib như
      // React Query/SWR, hoặc tách state machine) là một đợt kiến trúc lại lớn, không phải việc của
      // 1 dòng cấu hình — để nguyên "warn" làm khoản nợ đã đo được (41 chỗ, 24 file), không che đi.
      "react-hooks/purity": "error",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "error",
      "react-hooks/static-components": "error",
      "react-hooks/immutability": "error",
      "react-hooks/preserve-manual-memoization": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/void-use-memo": "error",
      "react-hooks/refs": "error",
      "react-hooks/globals": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/config": "error",
      "react-hooks/gating": "error",
      "react-hooks/incompatible-library": "error",
      "react-hooks/unsupported-syntax": "error"
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
