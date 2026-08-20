-- FIX C3 (audit 2026-08-20): talent lưu "Hồ Sơ Của Tôi" — app báo "Đã cập nhật hồ sơ."
-- nhưng KHÔNG có gì được lưu.
--
-- Ba lỗi chồng lên nhau, che lẫn nhau nên không ai thấy:
--   1. RLS: policy ghi duy nhất trên talents là talents_write_ceo_ops (0001, mở rộng ở 0012)
--      = ('ceo','operations','admin') — KHÔNG có 'talent'. Talent update chính hồ sơ mình thì
--      RLS lọc còn 0 dòng.
--   2. updateTalent() gọi .update() KHÔNG kèm .select(), mà PostgREST update lọc 0 dòng thì
--      trả 204 chứ không trả error → client tưởng thành công.
--   3. handleUpdateTalent() tự nuốt lỗi bằng window.alert và trả void, nên khối try/catch
--      trong MyTalentProfile là code chết — luôn chạy tới dòng setProfileMessage("ok").
-- Lỗi 2+3 sửa ở phía client. Migration này sửa lỗi 1.
--
-- KHÔNG mở policy RLS cho talent ghi thẳng vào bảng talents. RLS của Postgres chặn theo DÒNG,
-- không chặn theo CỘT: một policy "talent sửa được dòng của chính mình" đồng nghĩa talent gọi
-- REST tay là tự sửa được rate_per_hour/rate_per_session/commission_rate của chính mình — tự
-- tăng lương. Thay vào đó dùng RPC security definer với whitelist cột cứng, đúng pattern đã
-- dùng cho submit_live_session_report (0046) và apply_tiktok_reconciliation (0050).
--
-- Whitelist đúng 3 field mà UI "Hồ Sơ Của Tôi" cho sửa: phone, avatar, date_of_birth. Mọi cột
-- khác (rate, commission, availability_status, số liệu hiệu suất...) không đụng tới được qua
-- đường này, kể cả khi client gửi thêm gì.
create or replace function update_my_talent_profile(
  p_phone text,
  p_avatar text,
  p_date_of_birth date
) returns talents as $$
declare
  v_talent_id uuid := current_user_talent_id();
  v_row talents;
begin
  if v_talent_id is null then
    raise exception 'Tài khoản chưa được gán hồ sơ Talent — liên hệ CEO/Admin để gán trước.';
  end if;

  update talents set
    -- coalesce cho 2 field text: gửi '' vẫn xoá được (chuỗi rỗng khác null), nhưng client lỡ
    -- gửi null thì giữ nguyên giá trị cũ thay vì xoá trắng.
    phone = coalesce(p_phone, phone),
    avatar = coalesce(p_avatar, avatar),
    -- date thì gán thẳng: null ở đây là ý định "xoá ngày sinh" của user, không phải lỗi gửi thiếu.
    date_of_birth = p_date_of_birth
  where id = v_talent_id
  returning * into v_row;

  if not found then
    raise exception 'talents row % not found', v_talent_id;
  end if;

  return v_row;
end;
$$ language plpgsql security definer;

comment on function update_my_talent_profile(text, text, date) is
  'Talent tự sửa thông tin liên hệ của chính mình. Whitelist cứng phone/avatar/date_of_birth — '
  'cố ý KHÔNG mở policy RLS cho talent ghi thẳng vào bảng talents vì RLS chặn theo dòng chứ '
  'không theo cột, mở ra là talent tự sửa được rate/commission của mình.';
