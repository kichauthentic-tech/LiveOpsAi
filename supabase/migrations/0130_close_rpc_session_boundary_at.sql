-- 0130 — ĐÓNG `/rpc/session_boundary_at` + quét lại quyền của `anon` (2026-10-02).
--
-- VÌ SAO CÓ FILE NÀY: kiểm lại lỗ hổng "đọc không cần đăng nhập" của 0109, nhưng lần này KHÔNG bắn
-- request vào production (không được phép) — thay vào đó dựng lại bức tranh quyền từ chính chuỗi
-- migration. Kết quả: 2 lớp vá của 0109 vẫn nguyên (xem phần kiểm ở cuối), nhưng lộ ra một đường
-- CHƯA ai đóng.
--
-- ===========================================================================
-- LỖ: `session_boundary_at(uuid)` — hàm thứ SÁU cùng lớp với 5 hàm mà 0128 đã chuyển sang `private`
-- ===========================================================================
-- Nó khớp đúng mô tả mà 0128 dùng để chọn 5 hàm kia: `security definer`, KHÔNG guard role (vì nó
-- sinh ra để gọi từ bên trong hàm khác), và **nhận ID dòng của người khác**. Nên bất kỳ ai gọi được
-- nó cũng đọc được `live_sessions` VƯỢT RLS — đúng thứ mà bất biến brand-isolation của 0059 cấm.
-- 0128 soi `pg_depend` để tìm hàm được policy/view gọi, nên hàm này không nằm trong tầm quét: nó
-- không xuất hiện trong policy nào cả.
--
-- Ai gọi được, trước migration này:
--   • `authenticated` — được cấp tường minh ở 0078 (`grant execute ... to authenticated`). Nghĩa là
--     một tài khoản role `brand` gọi `/rpc/session_boundary_at` với id ca của BRAND KHÁC vẫn ra giờ
--     kết thúc của ca đó.
--   • `anon` — qua quyền mặc định của PUBLIC. `create function` tự cấp EXECUTE cho PUBLIC, và 0109
--     chỉ `revoke ... from anon` (thu hồi quyền CẤP RIÊNG cho anon), không thu hồi quyền của PUBLIC
--     mà anon thừa hưởng. Đây là chỗ ghi chú ở P2a-11 ("0109 đã revoke execute khỏi anon") nói
--     THIẾU: 0109 đóng đường đọc BẢNG cho anon, nhưng không đóng được đường gọi HÀM theo cách đó.
--     Thực tế repo vẫn đúng ở chỗ khác: 15 hàm nhạy cảm đều có `revoke ... from public` riêng
--     (0083/0096/0097/0100/0105/0106/0107/0110/0113/0114/0115/0116/0124) — chỉ hàm này bị sót.
--
-- Mức độ: không phải lỗ "đọc sạch bảng" như 0109. Nó trả MỘT timestamptz cho MỘT id, nên muốn khai
-- thác phải biết trước UUID của ca. Nhưng 0128 đã chốt là không dựa vào việc UUID khó đoán, và chi
-- phí vá bằng 1 dòng, nên vá.
--
-- CÁCH VÁ: `revoke`, KHÔNG chuyển schema. Khác 5 hàm của 0128 ở đúng một điểm quyết định mọi thứ:
-- chúng được POLICY gọi, mà policy thì chạy dưới quyền người truy vấn ⇒ revoke là tự bắn vào chân
-- (0128 ghi rõ lý do này). Hàm này chỉ được gọi từ TRONG thân **3** hàm `security definer` khác —
-- `apply_session_live_snapshot`, `import_live_reconciliation`, `apply_live_reconciliation` (đếm bằng
-- `pg_get_functiondef` trên DB sau replay, không bằng grep; bản đầu của comment này ghi 4 và kể thêm
-- `recompute_session_from_snapshot`, nhưng hàm đó KHÔNG gọi tới `session_boundary_at`). Cả 3 chạy
-- dưới quyền OWNER, mà owner giữ EXECUTE kể cả sau khi revoke khỏi public/authenticated. Đã ĐO trên
-- replay sau khi revoke: gọi THẲNG bằng role `authenticated` ⇒ `permission denied for function
-- session_boundary_at`; gọi từ trong một hàm `security definer` ⇒ trả về đúng mốc thời gian. Đúng
-- khuôn 0082/0124 đã dùng cho `recompute_session_from_snapshot`, và không đụng tới thân hàm nào.
-- Client KHÔNG gọi hàm này: `grep -rn session_boundary_at src/` chỉ ra 0 kết quả.

revoke all on function session_boundary_at(uuid) from public, anon, authenticated;

comment on function session_boundary_at(uuid) is
  'Mốc kết thúc ca quy về instant thật. CHỈ gọi từ bên trong hàm security definer khác — '
  'quyền EXECUTE đã thu hồi khỏi public/anon/authenticated ở 0130 vì nó đọc live_sessions vượt RLS '
  'theo id truyền vào. Đừng grant lại; cần dùng từ client thì bọc trong một RPC có guard role.';

-- ===========================================================================
-- Quét lại quyền của `anon` — chạy lại 0109 mục 1 cho mọi object sinh ra SAU 0109
-- ===========================================================================
-- 20 migration đã chạy sau 0109 (0110…0129), trong đó có 4 bảng mới (0119 monthly_report_snapshots,
-- 0121 monthly_report_section_notes, 0123 ui_tab_views, …). Với BẢNG/SEQUENCE thì `alter default
-- privileges` của 0109 lo được các object do `postgres` tạo qua migration — nhưng dự án này đã có 2 sự
-- cố sửa tay thẳng trên production (xem "Sự cố vận hành đáng nhớ" trong WORKSPACE_DESIGN.md), mà object
-- tạo từ Dashboard bằng role khác thì không hưởng default privileges đó. Chạy lại là idempotent.
--
-- ĐÍNH CHÍNH 2026-10-02 (cùng lớp sai mà chính migration này vá): với HÀM thì 3 dòng dưới và cả
-- `alter default privileges … from anon` của 0109 đều **không** lo được gì. `create function` cấp
-- EXECUTE cho **PUBLIC**, `anon` là thành viên PUBLIC, và `revoke … from anon` không chạm tới quyền
-- thừa hưởng — đó chính là lý do `session_boundary_at` sống sót qua 0109. Nên mọi hàm sinh sau 0109
-- vẫn gọi được bởi phiên vô danh, trừ khi chính nó `revoke … from public` (khuôn 15 hàm trong repo
-- đang làm) hoặc tự guard role trong thân hàm. Hàng rào thực sự cho việc này là chốt 5 dưới đây +
-- cổng canh `tests/sqlGuards.test.ts`, KHÔNG phải 3 dòng revoke này.
--
-- Vì sao KHÔNG thêm `alter default privileges … on functions from public` cho dứt điểm: 63 file có
-- `create function` nhưng chỉ 27 lượt `grant execute` tay — khoảng một nửa số hàm đang sống nhờ đúng
-- cái grant PUBLIC mặc định đó. Đặt default privileges ấy sẽ làm hàm tạo ở migration SAU chết lúc gọi
-- (permission denied — ồn ào, không âm thầm) và bắt mọi migration về sau phải grant tay. Đó là một
-- quyết định về quy ước viết migration, không phải một phần của việc vá lỗ này — để user chốt.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all routines in schema public from anon;

-- ===========================================================================
-- VÁ TIẾP: vế `is not null` mà 0109 thêm vào view `live_sessions_secure` ĐÃ BỊ 0114 XOÁ
-- ===========================================================================
-- PHÁT HIỆN 2026-10-02 bằng phép replay `0001 → 0130` trên Postgres cô lập: chốt số 3 bên dưới báo đỏ,
-- và nó báo đỏ ĐÚNG. 0109 mục 3 thêm `(select current_user_role()) is not null` vào WHERE của view.
-- `0114_exclude_session_from_reports.sql` (ĐÃ CHẠY trên production) `drop view` rồi `create view` lại
-- để thêm vế `excluded_from_reports` — và chép lại WHERE theo bản TRƯỚC 0109, nên vế chốt NULL biến
-- mất. Không ai thấy vì 0114 là migration về tính năng, không ai đọc nó như một thay đổi bảo mật.
--
-- ĐO A/B trên chuỗi replay (có dữ liệu test, `set role authenticated`, không set JWT ⇒
-- current_user_role() = NULL):
--   khuôn 0114 (không vế is-not-null): phiên NULL-role đọc được 1/1 ca — của MỌI brand
--   có vế is-not-null:                 0 ca
-- `anon` thì KHÔNG với tới (has_table_privilege('anon', …, 'select') = false — 0109 mục 1 còn nguyên,
-- và 0114 chỉ `grant select … to authenticated`). Nên đây là lỗ cho **tài khoản đã đăng nhập mà thiếu
-- dòng `profiles`**, đúng "lỗ 2" của 0111/0112 — 0111 đã bịt đường SINH ra tài khoản kiểu đó (bỏ
-- `exception when others` trong `handle_new_user`), nhưng tài khoản sinh TRƯỚC 0111 thì vẫn còn.
-- Mức độ: đọc toàn bộ `live_sessions` của mọi brand kèm cột nội bộ agency (`metrics_hidden` chỉ bật
-- khi role = 'brand', NULL thì không bật) ⇒ nặng hơn lỗ `session_boundary_at` mà migration này mở đầu.
--
-- CÁCH VÁ: bọc định nghĩa ĐANG CHẠY vào một lớp ngoài, KHÔNG chép lại thân view. Thân view đã bị
-- 0107/0108/0114 sửa và 0128/0129 viết lại (tiền tố `private.` + bọc `(select …)`); chép tay là chắc
-- chắn lùi mất một trong các thay đổi đó. `select * from (<def hiện tại>)` giữ nguyên 52 cột đúng tên
-- đúng thứ tự nên `create or replace view` chấp nhận, và `offset 0` (hàng rào tối ưu của 0107) vẫn
-- nằm nguyên bên trong. Chạy lại là no-op nhờ phép kiểm ở đầu khối.
do $$
declare
  v_def text;
begin
  v_def := regexp_replace(pg_get_viewdef('public.live_sessions_secure'::regclass, true), ';\s*$', '');
  -- `~*` chứ không phải `position()`: pg_get_viewdef in từ khoá HOA (`IS NOT NULL`), nên phép so
  -- phân biệt hoa/thường sẽ không bao giờ khớp — chốt 3 của bản đầu migration này mắc đúng lỗi đó.
  if v_def ~* 'current_user_role\(\)[^;]*is\s+not\s+null' then
    raise notice '0130: live_sessions_secure đã có vế is-not-null, không đụng.';
  else
    execute format(
      'create or replace view public.live_sessions_secure as select * from (%s) lss '
      'where (select current_user_role()) is not null', v_def);
    raise notice '0130: đã bọc lại vế is-not-null cho live_sessions_secure (0114 đã xoá mất).';
  end if;
end $$;

-- ===========================================================================
-- CHỐT TỰ KIỂM — migration tự báo đỏ thay vì để người đọc tin lời comment
-- ===========================================================================
do $$
declare
  v_bad text;
  v_cnt int;
begin
  -- 1) anon không còn quyền nào trên bảng/view của schema public.
  select string_agg(distinct table_name, ', ') into v_bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';
  if v_bad is not null then
    raise exception '0130 DỪNG: anon vẫn còn quyền trên: %', v_bad;
  end if;

  -- 2) session_boundary_at không còn ai ngoài owner gọi được.
  select count(*) into v_cnt
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'session_boundary_at'
    and (has_function_privilege('anon', p.oid, 'execute')
      or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_cnt > 0 then
    raise exception '0130 DỪNG: session_boundary_at vẫn gọi được bởi anon/authenticated';
  end if;

  -- 3) Hàng rào 0109 còn nguyên: view live_sessions_secure vẫn có vế chốt NULL-role.
  --    `~*` chứ không phải `position()` — pg_get_viewdef in từ khoá HOA, bản đầu của chốt này so
  --    chuỗi chữ thường nên sẽ báo đỏ cả khi view lành. Giờ nó chỉ còn báo đỏ khi hở thật.
  if pg_get_viewdef('live_sessions_secure'::regclass, true) !~* 'current_user_role\(\)[^;]*is\s+not\s+null' then
    raise exception '0130 DỪNG: live_sessions_secure mất vế is-not-null của 0109 (xem khối vá phía trên)';
  end if;

  -- 4) Mọi bảng trong public đều bật RLS (bảng tạo tay từ Dashboard hay quên bước này).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception '0130 DỪNG: bảng chưa bật RLS: %', v_bad;
  end if;

  -- 5) Lớp lỗ của chính migration này, đo trên DB THẬT chứ không trên chuỗi migration.
  --    `tests/sqlGuards.test.ts` chỉ chứng minh được "chuỗi migration sạch"; chốt này chứng minh
  --    "DB sạch" — bắt cả hàm tạo tay từ Dashboard mà chuỗi migration chưa từng thấy. Tiêu chuẩn
  --    giống hệt cổng canh bên vitest: hàm `security definer` trong `public` mà phiên vô danh gọi
  --    được thì phải có hàng rào danh tính trong thân hàm. Trừ 3 hàm an toàn do CẤU TRÚC (chỉ đọc
  --    hồ sơ/quyền của chính người gọi; anon ⇒ NULL/false) và policy CẦN chúng nên không revoke được.
  select string_agg(p.proname, ', ') into v_bad
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and p.prorettype <> 'trigger'::regtype          -- Postgres từ chối gọi trực tiếp hàm trigger
    and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('current_user_role', 'current_user_brand_id', 'can_edit_session_snapshot')
    and pg_get_functiondef(p.oid) !~* 'raise\s+exception'
    and pg_get_functiondef(p.oid) !~* 'current_user_role|current_user_talent_id|can_edit_session_snapshot';
  if v_bad is not null then
    raise exception '0130 DỪNG: hàm security definer gọi được bởi phiên KHÔNG đăng nhập mà thân hàm không có hàng rào: %. '
      'Đây đúng lớp lỗ 0130 vá. Kiểm từng hàm rồi revoke khỏi public, hoặc thêm guard role, trước khi chạy lại.', v_bad;
  end if;

  raise notice '0130 OK: anon sạch quyền, session_boundary_at đã đóng, hàng rào 0109 còn nguyên, RLS đủ, không hàm definer nào hở với phiên vô danh.';
end $$;
