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
-- (0128 ghi rõ lý do này). Hàm này chỉ được gọi từ TRONG thân 4 hàm `security definer` khác
-- (`apply_session_live_snapshot`, `recompute_session_from_snapshot`, `import_live_reconciliation`,
-- `apply_live_reconciliation`) — chúng chạy dưới quyền OWNER, mà owner giữ EXECUTE kể cả sau khi
-- revoke khỏi public/authenticated. Đây đúng khuôn 0082/0124 đã dùng cho
-- `recompute_session_from_snapshot`, và nó không đụng tới thân hàm nào (0 rủi ro hồi quy logic).
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
-- 0121 monthly_report_section_notes, 0123 ui_tab_views, …). `alter default privileges` của 0109 lo
-- được các object do `postgres` tạo qua migration, NHƯNG dự án này đã có 2 sự cố sửa tay thẳng trên
-- production (xem "Sự cố vận hành đáng nhớ" trong WORKSPACE_DESIGN.md) — object tạo từ Dashboard
-- bằng role khác thì không hưởng default privileges đó. Chạy lại là idempotent và gần như miễn phí.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all routines in schema public from anon;

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
  if position('is not null' in pg_get_viewdef('live_sessions_secure'::regclass, true)) = 0 then
    raise exception '0130 DỪNG: live_sessions_secure mất vế is-not-null của 0109';
  end if;

  -- 4) Mọi bảng trong public đều bật RLS (bảng tạo tay từ Dashboard hay quên bước này).
  select string_agg(c.relname, ', ') into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_bad is not null then
    raise exception '0130 DỪNG: bảng chưa bật RLS: %', v_bad;
  end if;

  raise notice '0130 OK: anon sạch quyền, session_boundary_at đã đóng, hàng rào 0109 còn nguyên, RLS đủ.';
end $$;
