-- 0209 — CA KHÔNG CÓ CA NỐI SAU: MỐC GIAO CA KÉO THEO GIỜ KẾT THÚC THẬT CỦA ROOM (10/11).
--
-- Lỗi (Franklin Shopee T2 09/11 20:00–22:00): file Live List ghi room 20:03 → 22:33:52 (150,87'), ops khai OT 30', nhưng app
-- chỉ hiện "Giờ live 2h" (117'), dòng thời gian dừng ở 22:00. Lý do: mốc giao ca (session_live_snapshots.boundary_at, 0204/0205)
-- luôn = giờ hết ca kế hoạch + lượng trễ, và mọi phép cắt (0174 gõ GMV, 0203 chia tạm) coi phần room chạy sau mốc là của "ca sau".
-- Ca này KHÔNG có ca sau nên 33' đó không thuộc ca nào và bị bỏ.
--
-- Sửa: private.session_flex_boundary_at — ca KHÔNG có ca nối sau (private.session_has_next_shift, 0203: liên kết room hoặc ca cùng
-- brand + sàn bắt đầu đúng giờ hết ca ±5') mà room trong file tắt sau (mốc kế hoạch + trễ + 5') ⇒ mốc giao ca = giờ tắt room,
-- tối đa giờ hết ca kế hoạch + 90' (cùng giới hạn trượt 0204). Không đổi khi:
--   * ca có ca nối sau (room chạy tiếp là của ca sau — giữ cách cắt hiện tại, ops nhập "giờ giao ca thực" nếu cần, 0205);
--   * còn room chưa tắt (chưa biết giờ kết thúc);
--   * ca đã gõ GMV KHÁC số của file (người gõ chủ động cắt số — để nguyên, không đoán lại);
--   * mốc do ops nhập tay (boundary_manual) — snapshot_refresh_boundary (0205) đã bỏ qua.
-- Ca cũ: ca đang lấy số từ snapshot, mốc đổi theo công thức mới. Ca đã gõ GMV bằng đúng số file (gõ cho có) thì bỏ số gõ để
-- trở về số file (thời lượng 0174 từng cắt về mốc cũ). Ca đã đối soát KHÔNG đụng. Không đổi tiền công (tính theo giờ lịch ± OT/off
-- sớm ops khai). Phụ thuộc 0205. Chạy lại được.

do $$
begin
  if to_regprocedure('private.session_has_next_shift(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_name = 'session_live_snapshots' and column_name = 'boundary_manual') then
    raise exception '0209: chạy 0203 + 0205 trước.';
  end if;
end $$;

create or replace function private.session_flex_boundary_at(p_session_id uuid) returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan timestamptz;
  v_flex timestamptz;
  v_snap session_live_snapshots;
  v_file_gmv numeric;
  v_last timestamptz;
begin
  v_plan := session_boundary_at(p_session_id);
  v_flex := v_plan + private.session_lateness(p_session_id);
  if v_plan is null or private.session_has_next_shift(p_session_id) then
    return v_flex;
  end if;
  select * into v_snap from session_live_snapshots where session_id = p_session_id;
  if not found or v_snap.is_estimated then
    return v_flex;
  end if;
  -- Ca đã gõ GMV khác số file: người gõ chủ động cắt số theo mốc cũ — không đoán lại.
  if v_snap.typed_gmv is not null then
    select coalesce(sum(coalesce((r.raw->'orig'->>'gmv')::numeric, r.gmv)), 0) into v_file_gmv
      from session_live_snapshot_rows r where r.snapshot_id = v_snap.id;
    if abs(v_snap.typed_gmv - v_file_gmv) > 0.5 then
      return v_flex;
    end if;
  end if;
  -- Còn room chưa tắt: chưa biết giờ kết thúc.
  if exists (select 1 from session_live_snapshot_rows r where r.snapshot_id = v_snap.id and r.started_at is not null and r.ended_at is null) then
    return v_flex;
  end if;
  select max(r.ended_at) into v_last from session_live_snapshot_rows r where r.snapshot_id = v_snap.id and r.started_at is not null;
  if v_last is null or v_last <= v_flex + interval '5 minutes' then
    return v_flex;
  end if;
  return greatest(v_flex, least(v_last, v_plan + interval '90 minutes'));
end;
$$;
revoke all on function private.session_flex_boundary_at(uuid) from public, anon, authenticated;

-- Nối / gỡ ca nối sau (link_session_room, unlink_session_room) làm đổi "có ca sau hay không" ⇒ mốc lưu phải theo ngay, trước khi chia tạm.
-- snapshot_auto_split là chỗ chung của apply / link / unlink / bỏ số gõ nên vá ở đây (từ định nghĩa ĐANG CÓ, như 0189/0206). Chạy lại được.
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('private.snapshot_auto_split(uuid)'::regprocedure);
  if v_def ~ 'snapshot_refresh_boundary' then
    return; -- đã vá
  end if;
  v_new := replace(
    v_def,
    'if not found or v_snap.typed_gmv is not null or v_snap.is_estimated then',
    'if found and not v_snap.is_estimated then
    perform private.snapshot_refresh_boundary(p_session_id);
  end if;
  if not found or v_snap.typed_gmv is not null or v_snap.is_estimated then'
  );
  if v_new = v_def then
    raise exception '0209: không thấy điều kiện đầu hàm snapshot_auto_split để vá';
  end if;
  execute v_new;
end $$;

-- Ca cũ: tính lại theo thứ tự mốc (như 0205). Ca kéo dài mốc mà đang giữ số gõ = số file ⇒ bỏ số gõ trước (về số file, thời lượng đủ).
do $$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select s.id as snapshot_id, s.session_id, s.typed_gmv
      from session_live_snapshots s
      join live_sessions ls on ls.id = s.session_id
     where ls.data_source::text = 'live_snapshot'
       and not s.is_estimated
       and not s.boundary_manual
       and s.boundary_at is distinct from private.session_flex_boundary_at(s.session_id)
     order by s.boundary_at
  loop
    if r.typed_gmv is not null
       and private.session_flex_boundary_at(r.session_id) > session_boundary_at(r.session_id) + private.session_lateness(r.session_id) + interval '5 minutes' then
      perform private.snapshot_restore_file_numbers(r.snapshot_id);
    end if;
    perform private.snapshot_refresh_boundary(r.session_id);
    perform private.snapshot_auto_split(r.session_id);
    perform private.snapshot_recompute_after(r.session_id);
    v_n := v_n + 1;
  end loop;
  raise notice '0209: đã tính lại % ca', v_n;
end $$;

do $$
begin
  if to_regprocedure('private.session_flex_boundary_at(uuid)') is null then
    raise exception '0209 DỪNG: thiếu hàm';
  end if;
  raise notice '0209 OK';
end $$;
