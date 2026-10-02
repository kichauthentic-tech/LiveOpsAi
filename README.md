# LiveOps AI

Hệ thống vận hành livestream cho agency: lập kế hoạch tháng, xếp và chốt ca host, đối soát số liệu
TikTok, Report Tháng cho brand, P&L. React 19 + Vite (client), Express (API), Supabase (DB + Auth + RLS).

Trạng thái dự án, quy ước kỹ thuật và việc còn lại: **[WORKSPACE_DESIGN.md](WORKSPACE_DESIGN.md)** — đọc
trước khi sửa code. Lịch sử chi tiết từng đợt: [docs/WORKSPACE_HISTORY.md](docs/WORKSPACE_HISTORY.md).

## Chạy ở máy

```bash
npm install
cp .env.example .env   # điền VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (+ các khoá server nếu cần)
npm run dev            # Express + Vite dev middleware, http://localhost:3000
```

## Kiểm tra (CI chạy đúng 4 bước này)

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run audit:dead   # tìm code chết (không nằm trong CI, ~20s)
```

## Cấu trúc

| Thư mục | Nội dung |
|---|---|
| `src/components` | Màn hình (mỗi tab một chunk, lazy-load từ `App.tsx`) |
| `src/lib` | Logic thuần + lớp đọc/ghi Supabase (`lib/db`) |
| `src/server/createApp.ts` | API Express — dùng chung cho `server.ts` (dev / Node) và `api/index.ts` (Vercel) |
| `supabase/migrations` | Migration SQL, chạy tay theo thứ tự trong Supabase SQL Editor |
| `supabase/tests` | Bộ kiểm SQL chạy trên Postgres tạm trước khi đưa migration lên production |
| `tests` | Vitest |

Deploy: Vercel (`vercel.json`) — frontend tĩnh từ `dist/`, `/api/*` vào `api/index.ts`.
