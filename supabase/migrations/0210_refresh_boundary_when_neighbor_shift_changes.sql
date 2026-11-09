-- 0210 — MỐC GIAO CA TỰ LÀM MỚI KHI CA KỀ BÊN ĐƯỢC TẠO / HUỶ / ĐỔI GIỜ (10/11).
--
-- 0209 kéo mốc giao ca của ca KHÔNG có ca nối sau theo giờ room tắt. "Có ca sau hay không" lại đổi được SAU khi file đã tải:
-- ca sau được tạo thêm (T12 xếp lịch muộn), bị huỷ, đổi giờ, loại khỏi báo cáo, hoặc bị xoá. Lúc đó mốc đã lưu
-- (session_live_snapshots.boundary_at) cũ so với luật ⇒ ca trước lại bị cắt sai hoặc chồng giờ với ca sau — đúng lỗi Franklin 09/11
-- theo chiều ngược lại. Nối / gỡ ca nối tường minh đã được vá ở 0209 (snapshot_auto_split); 0210 vá phần còn lại.
--
-- Trigger AFTER INSERT / UPDATE OF (date, start_time, end_time, status, excluded_from_reports, brand_id, platform) / DELETE trên
-- live_sessions: với ca đó và các ca cùng brand + sàn trong ±1 ngày đang lấy số từ snapshot (không ước lượng, không mốc nhập tay) ⇒
-- làm mới mốc; mốc đổi thì chia tạm lại + tính lại ca (như 0204/0205). Lỗi ở ca kề chỉ ghi WARNING, không chặn việc tạo/sửa ca.
-- Không đệ quy: các hàm tính lại không sửa các cột trên; nếu có, lượt thứ hai mốc không đổi nên dừng.
-- Phụ thuộc 0209. Chạy lại được.

do $$
begin
  if to_regprocedure('private.snapshot_refresh_boundary(uuid)') is null
     or to_regprocedure('private.session_has_next_shift(uuid)') is null then
    raise exception '0210: chạy 0203 + 0205 + 0209 trước.';
  end if;
end $$;

create or replace function private.refresh_boundaries_around_session() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand uuid := coalesce(new.brand_id, old.brand_id);
  v_platform text := coalesce(new.platform, old.platform)::text;
  v_date date := coalesce(new.date, old.date);
  v_id uuid;
begin
  -- Đổi ngày/brand/sàn: ca ở chỗ CŨ cũng cần tính lại.
  for v_id in
    select distinct s.session_id
      from session_live_snapshots s
      join live_sessions ls on ls.id = s.session_id
     where ((ls.brand_id = v_brand and ls.platform::text = v_platform and ls.date between v_date - 1 and v_date + 1)
            or (tg_op = 'UPDATE' and ls.brand_id = old.brand_id and ls.platform::text = old.platform::text and ls.date between old.date - 1 and old.date + 1))
       and ls.data_source::text = 'live_snapshot'
       and not s.is_estimated
       and not s.boundary_manual
     order by s.session_id
  loop
    begin
      if private.snapshot_refresh_boundary(v_id) then
        perform private.snapshot_auto_split(v_id);
        perform private.snapshot_recompute_after(v_id);
      end if;
    exception when others then
      raise warning '0210: không làm mới mốc giao ca của ca %: %', v_id, sqlerrm;
    end;
  end loop;
  return null;
end;
$$;
revoke all on function private.refresh_boundaries_around_session() from public, anon, authenticated;

drop trigger if exists trg_refresh_boundaries_around_session on live_sessions;
create trigger trg_refresh_boundaries_around_session
  after insert or delete or update of date, start_time, end_time, status, excluded_from_reports, brand_id, platform
  on live_sessions
  for each row execute function private.refresh_boundaries_around_session();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_refresh_boundaries_around_session') then
    raise exception '0210 DỪNG: thiếu trigger';
  end if;
  raise notice '0210 OK';
end $$;
