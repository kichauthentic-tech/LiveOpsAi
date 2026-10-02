# Kiểm SQL chạy tay

Dự án không có Supabase CLI / DB local, nên migration được chạy tay trên project thật. Trước khi
chạy, kiểm SQL trên một cluster Postgres tạm ở máy — rẻ và bắt được cả lỗi cú pháp lẫn lỗi logic:

```bash
export LC_ALL=C                      # macOS/Homebrew: thiếu dòng này postmaster chết lúc khởi động
initdb -D /tmp/lopg-data -U postgres --no-locale -E UTF8
mkdir -p /tmp/lopg
pg_ctl -D /tmp/lopg-data -o "-p 55432 -k /tmp/lopg -c listen_addresses=''" -l /tmp/lopg.log start

psql -h /tmp/lopg -p 55432 -U postgres -c 'create database lo'
PS="psql -h /tmp/lopg -p 55432 -U postgres -d lo -v ON_ERROR_STOP=1 -q"
$PS -f supabase/tests/_fixture_snapshot_recon.sql          # bảng + hàm phụ, bản TRƯỚC migration
$PS -f supabase/migrations/0124_avg_view_duration_from_file.sql
$PS -f supabase/tests/0124_avg_view_duration.sql           # in "OK ..." từng mục, ERROR là hỏng

pg_ctl -D /tmp/lopg-data stop && rm -rf /tmp/lopg-data /tmp/lopg
```

Bỏ bước nạp migration ở giữa thì bộ kiểm phải ĐỎ — đó là cách xác nhận nó thật sự đang kiểm cái gì
(lần đầu chạy 0124: `A avg_watch : got 0, want 30`).

`_fixture_snapshot_recon.sql` chỉ dựng đủ thứ mà migration đụng tới (live_sessions + 2 bảng
snapshot + 2 bảng đối soát + `session_boundary_at` / `current_user_role` / `auth.uid`), không phải
bản sao đầy đủ của schema thật — đừng dùng nó làm nguồn tra cứu schema.

## Replay cả chuỗi (dùng để kiểm migration BẢO MẬT trước khi đưa lên production)

Chạy từng migration một lên một DB trắng. Đây là cách duy nhất chứng minh được những thứ PostgREST
không lộ ra (`proconfig`, định nghĩa view sau khi bị nhiều migration viết lại, quyền của từng role) —
và là cách đã bắt được việc `0114` xoá mất vế `is not null` mà `0109` thêm vào `live_sessions_secure`.

```bash
export LC_ALL=C
SOCK=/tmp/lopg.rp && mkdir -p $SOCK          # PHẢI ngắn: socket Unix giới hạn 103 byte
initdb -D /tmp/lopg-data -U postgres --no-locale -E UTF8
pg_ctl -D /tmp/lopg-data -o "-p 55433 -k $SOCK -c listen_addresses=''" -l /tmp/lopg.log start
psql -h $SOCK -p 55433 -U postgres -c 'create database lo'

PS="psql -h $SOCK -p 55433 -U postgres -d lo -v ON_ERROR_STOP=1 -q"
$PS -f supabase/tests/_shim_supabase.sql                       # roles + schema auth
for f in supabase/migrations/0*.sql; do $PS -f "$f" || { echo "FAIL $f"; break; }; done
```

Xong thì `pg_ctl -D /tmp/lopg-data stop -m fast && rm -rf /tmp/lopg-data $SOCK`.

Hai phép đo đáng làm sau khi replay (cả hai đều từng lòi ra lỗi thật):

```sql
-- 1) Phiên ĐÃ ĐĂNG NHẬP nhưng không có dòng profiles ⇒ current_user_role() = NULL.
--    Chèn 1 brand + 1 ca rồi: set role authenticated; select count(*) from live_sessions_secure;
--    Kết quả phải là 0. Khác 0 là hở đúng lớp lỗ 0109/0114.
-- 2) Hàm nào phiên vô danh gọi được: xem chốt tự kiểm số 5 trong 0130 (nó tự raise).
```
