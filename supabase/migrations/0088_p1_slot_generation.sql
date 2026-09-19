-- P1 module tạo ca (user chốt 2026-09-19, làm 2026-09-19): vá lỗi trùng ca + chỉ Ops tạo ca.
--
-- Bối cảnh (WORKSPACE_DESIGN "Bàn thêm 2026-09-19"): sinh ca tháng từ quy tắc lặp dedupe bằng
-- (template_id, date). Xoá quy tắc rồi tạo lại → template_id mới, ca cũ vẫn còn (on delete set null)
-- → tháng sau bấm sinh là ra ca trùng giờ. Tạo tay 1 ca đúng khung giờ rồi bấm sinh cũng trùng.
-- Bảng shift_slots không có khoá tự nhiên nào ngoài id.
--
-- 1) Khoá tự nhiên của 1 ca: brand + ngày + giờ bắt đầu + giờ kết thúc + nền tảng. Chỉ áp cho ca
--    chưa huỷ — huỷ rồi mở lại đúng khung giờ là hợp lệ. Ca không gắn brand (brand_id null) hiếm,
--    không ràng buộc. 2 room cùng brand cùng giờ cùng nền tảng không phải nhu cầu thật (khác nền
--    tảng thì đã khác khoá).
-- 2) RPC sinh ca theo lô: client tính danh sách ca từ quy tắc lặp (thuần, có xem trước), server
--    chèn và BỎ QUA ca đã có theo đúng khoá trên — dedupe ở server nên bấm 2 lần / 2 ops cùng bấm
--    cũng không trùng, index là chốt chặn cuối.
-- 3) Bỏ quyền brand tự mở ca / tự tạo & sửa live session (0035). User chốt: chỉ Ops tạo ca. Brand
--    xem lịch, không sửa. Policy ceo/operations/admin giữ nguyên.

-- (3) trước — không phụ thuộc dữ liệu.
drop policy if exists "shift_slots_insert_brand_own" on shift_slots;
drop policy if exists "live_sessions_insert_brand_own" on live_sessions;
drop policy if exists "live_sessions_update_brand_own" on live_sessions;

-- (1a) Dọn ca trùng ĐÃ có trong DB thật — chính là hậu quả của lỗi mô tả trên (kiểm 2026-09-19:
-- 5 cặp Franklin thứ 2 11:00-14:00 tháng 8/2026, mỗi cặp 1 dòng còn template_id + 1 dòng đã mất
-- template_id, đều open, chưa chốt, không ai đăng ký). Chỉ dọn dòng CÒN MỞ và CHƯA GẮN SESSION;
-- trong mỗi nhóm giữ dòng còn template_id (rồi tới dòng tạo sớm nhất). Đăng ký rảnh của dòng bị
-- xoá (nếu có) cascade theo 0014 — cùng khung giờ nên không mất thông tin thật.
-- Ca đã chốt/đã huỷ không đụng; nếu vẫn còn nhóm trùng có ca chốt thì create index báo lỗi kèm
-- khoá → xử lý tay.
delete from shift_slots
where id in (
  select id from (
    select id,
           row_number() over (
             partition by brand_id, date, start_time, end_time, platform
             order by (template_id is null), created_at, id
           ) as rn
    from shift_slots
    where status = 'open' and session_id is null and brand_id is not null
  ) d
  where d.rn > 1
);

-- (1b) Nếu vẫn còn trùng (ca đã chốt), create index báo lỗi kèm khoá trùng — xử lý tay rồi chạy lại.
create unique index if not exists idx_shift_slots_natural_key
  on shift_slots(brand_id, date, start_time, end_time, platform)
  where status <> 'cancelled' and brand_id is not null;

-- (2) p_slots: mảng [{date, start_time, end_time, brand_id, brand_name, platform, studio_id,
-- studio_name, notes, template_id}]. Trả {inserted: n, skipped_existing: n, rows: [shift_slots...]}.
-- Guard trong thân hàm theo mẫu 0082 (security definer bỏ qua RLS; coalesce vì role null).
create or replace function generate_shift_slots(p_slots jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb;
  v_inserted int := 0;
  v_skipped int := 0;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_brand uuid;
  v_date date;
  v_start time;
  v_end time;
  v_platform session_platform;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được sinh ca' using errcode = '42501';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then
    raise exception 'p_slots phải là mảng';
  end if;

  for v_row in select * from jsonb_array_elements(p_slots) loop
    v_brand := nullif(v_row->>'brand_id', '')::uuid;
    v_date := (v_row->>'date')::date;
    v_start := (v_row->>'start_time')::time;
    v_end := (v_row->>'end_time')::time;
    v_platform := coalesce(nullif(v_row->>'platform', ''), 'TikTok')::session_platform;

    if v_brand is not null and exists (
      select 1 from shift_slots s
      where s.brand_id = v_brand and s.date = v_date and s.start_time = v_start
        and s.end_time = v_end and s.platform = v_platform and s.status <> 'cancelled'
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform,
                             studio_id, studio_name, notes, status, created_by, template_id)
    values (v_date, v_start, v_end, v_brand, coalesce(v_row->>'brand_name', ''), v_platform,
            nullif(v_row->>'studio_id', '')::uuid, coalesce(v_row->>'studio_name', ''),
            coalesce(v_row->>'notes', ''), 'open', auth.uid(),
            nullif(v_row->>'template_id', '')::uuid)
    -- Cùng 1 lô có 2 dòng trùng nhau (2 quy tắc lặp giống hệt) → dòng sau đụng index, bỏ qua.
    on conflict do nothing
    returning id into v_id;

    if v_id is null then
      v_skipped := v_skipped + 1;
    else
      v_inserted := v_inserted + 1;
      v_ids := v_ids || v_id;
    end if;
    v_id := null;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped_existing', v_skipped,
    'rows', coalesce((select jsonb_agg(to_jsonb(s) order by s.date, s.start_time)
                      from shift_slots s where s.id = any(v_ids)), '[]'::jsonb)
  );
end $$;

grant execute on function generate_shift_slots(jsonb) to authenticated;
