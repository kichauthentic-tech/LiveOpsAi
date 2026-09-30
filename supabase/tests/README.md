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
