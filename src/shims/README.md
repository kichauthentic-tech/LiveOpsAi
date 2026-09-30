# Shim thay thư viện không dùng tới (chỉ áp cho bundle trình duyệt)

`@supabase/supabase-js` import tĩnh `RealtimeClient` và `StorageClient`, nên dù app không dùng
realtime hay storage thì 2 thư viện đó vẫn nằm trong chunk entry — tức mọi người dùng phải tải
xong rồi mới thấy màn đăng nhập. Đo 2026-10-01 trên `index.js`:

| Gói | Bytes trong entry |
|---|---|
| `@supabase/realtime-js` | 31,3 KB |
| `@supabase/phoenix` (dep của realtime) | 25,3 KB |
| `@supabase/storage-js` | 21,9 KB |
| **Tổng** | **78,5 KB** (≈22 KB gzip) |

Alias được khai ở `vite.config.ts` → chỉ ảnh hưởng bundle client. Bản server (`esbuild server.ts`)
KHÔNG đi qua alias này nên vẫn dùng supabase thật.

TypeScript cũng không đi qua alias (không khai trong `tsconfig`), nên kiểu vẫn là kiểu thật.

## Luật khi sửa

Method nào supabase-js gọi NGẦM trong luồng bình thường (`setAuth`, dọn dẹp) phải là no-op im lặng.
Method nào là cửa vào tính năng thật (`channel`, `storage.from`) phải **ném lỗi rõ ràng** — để ai
đó thêm realtime/upload trong tương lai vỡ ngay lúc dev, thay vì im lặng không chạy trên production.

`tests/supabaseShims.test.ts` đọc thẳng `node_modules/@supabase/supabase-js/dist/index.mjs` và bắt
lỗi nếu bản mới gọi method mà shim chưa có — nâng version supabase là test đỏ, không phải lỗi runtime.
