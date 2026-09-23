-- 0106 — Siết policy BẢNG của tầng snapshot (audit role × workspace, 2026-09-22).
--
-- 0082 đã vá 7 RPC security definer đang mở cho mọi user. Nhưng nó vá ĐÚNG đường RPC; policy trên
-- chính 2 bảng vẫn là bản 0078:
--     create policy "session_live_snapshots_rw" on session_live_snapshots for all
--       using (current_user_role() is distinct from 'brand') ...
-- "for all" + chỉ loại role brand nghĩa là BẤT KỲ tài khoản talent nào cũng SELECT/INSERT/UPDATE/
-- DELETE thẳng qua PostgREST vào snapshot của MỌI ca, không cần đụng tới RPC nào. Cụ thể hại:
--   - xoá snapshot của ca người khác = xoá vĩnh viễn RANH GIỚI giữa 2 ca nối dùng chung Room ID.
--     Theo đúng ghi chú của chính 0078, đó là thứ KHÔNG dựng lại được từ file đối soát cuối ngày.
--   - đọc snapshot của mọi brand = đọc số GMV thô của toàn bộ khách hàng agency.
--
-- Hiện bảng đang 0 dòng trên DB thật (đo 2026-09-22) nên chưa có thiệt hại — vá trước khi tầng này
-- bắt đầu được dùng thật.
--
-- Nguyên tắc: quyền trên bảng khớp ĐÚNG với `can_edit_session_snapshot()` mà 0082 đã dùng cho RPC,
-- để hai đường (bảng và RPC) không lệch nhau lần nữa.
--   ĐỌC   — ops, hoặc Host/Trợ live của đúng ca đó.
--   GHI   — chỉ ops. Talent/trợ live vẫn up file bình thường: họ đi qua RPC
--           apply_session_live_snapshot / delete_session_live_snapshot, vốn chạy dưới quyền owner
--           (bỏ qua RLS) và đã tự guard bằng can_edit_session_snapshot() từ 0082. Không có đường
--           ghi thẳng vào bảng nào trong src/ — `lib/db/sessionLiveSnapshots.ts` chỉ .select().

-- Helper cho bảng con: bảng rows chỉ có snapshot_id, cần lần ngược ra session_id.
create or replace function snapshot_session_id(p_snapshot_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select session_id from session_live_snapshots where id = p_snapshot_id
$$;

revoke all on function snapshot_session_id(uuid) from public;
grant execute on function snapshot_session_id(uuid) to authenticated;

drop policy if exists "session_live_snapshots_rw" on session_live_snapshots;
drop policy if exists "session_live_snapshot_rows_rw" on session_live_snapshot_rows;
drop policy if exists "session_live_snapshots_read" on session_live_snapshots;
drop policy if exists "session_live_snapshots_write_ops" on session_live_snapshots;
drop policy if exists "session_live_snapshot_rows_read" on session_live_snapshot_rows;
drop policy if exists "session_live_snapshot_rows_write_ops" on session_live_snapshot_rows;

-- Vế `(select current_user_role()) in (...)` đứng TRƯỚC là cố ý: nó không phụ thuộc dòng nên
-- Postgres nâng được thành InitPlan (tính 1 lần / query, quy ước từ 0101). Ops — người quét nhiều
-- dòng nhất — thoát ngay ở vế này và không bao giờ trả giá cho lời gọi per-row ở vế sau.
-- Vế sau BẮT BUỘC per-row vì điều kiện phụ thuộc chính cột session_id của dòng đang xét; chấp nhận
-- được ở đây vì mọi truy vấn của client đều lọc sẵn theo 1 session_id / 1 snapshot_id.
create policy "session_live_snapshots_read" on session_live_snapshots for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or can_edit_session_snapshot(session_id)
);
create policy "session_live_snapshots_write_ops" on session_live_snapshots for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));

create policy "session_live_snapshot_rows_read" on session_live_snapshot_rows for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or can_edit_session_snapshot(snapshot_session_id(snapshot_id))
);
create policy "session_live_snapshot_rows_write_ops" on session_live_snapshot_rows for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin'));
