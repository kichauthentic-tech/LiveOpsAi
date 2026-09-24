-- 0115 — Xoá Kế Hoạch Tháng (phát hiện thêm trong lúc verify Đ5, 2026-09-24).
--
-- `monthPlans.ts` chỉ có upsert / replaceSlots / lock / confirm — KHÔNG có đường xoá nào. Phiên
-- chạy thử phải dán SQL tay vào SQL Editor để dọn đúng một dòng kế hoạch test
-- (`supabase/seed/2026-09-24b_cleanup_D5_verify_plan.sql`). Với ops thật thì hệ quả nặng hơn: lập
-- nhầm brand hoặc nhầm tháng là dòng đó ở lại vĩnh viễn, và nó KHÔNG vô hại — Toàn Cảnh Brand đọc
-- `brand_month_plans` để hiện trạng thái tháng, `fetchLockedPlanTargets` (Đ5) đọc nó để ra target
-- tháng. Một kế hoạch rác = một cột target rác ở Report Tháng.
--
-- Vì sao phải là RPC chứ không phải `.delete()` từ client (policy 0090 `for all` vốn đã cho phép):
-- `shift_slots.plan_id` là `on delete set null` (0091), nên xoá dòng kế hoạch thì ca chờ đăng ký
-- nó đã sinh ra KHÔNG mất — chúng thành ca mồ côi, vẫn hiện ở Nhân sự ca, vẫn cho talent đăng ký,
-- và không còn đường nào tra ngược về kế hoạch để dọn. Ba bước (kiểm tra → huỷ ca open → xoá plan)
-- phải nằm trong một transaction, và quy tắc "không xoá nếu đã chốt người" phải ở DB chứ không
-- phải ở client.

create or replace function delete_month_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan brand_month_plans;
  v_finalized int;
  v_registered int;
  v_cancelled int;
  v_plan_slots int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được xoá kế hoạch tháng' using errcode = '42501';
  end if;

  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if not found then
    raise exception 'Không thấy kế hoạch %', p_plan_id;
  end if;

  -- Ca đã chốt host là dữ liệu vận hành thật, không phải hệ quả của bản kế hoạch: có ca như vậy
  -- thì việc cần làm là sửa/huỷ từng ca ở Nhân sự ca, không phải xoá cả kế hoạch. Chặn cứng.
  select count(*) into v_finalized
  from shift_slots where plan_id = p_plan_id and status = 'finalized';
  if v_finalized > 0 then
    raise exception 'Kế hoạch đã có % ca chốt người — huỷ từng ca ở Nhân sự ca trước', v_finalized
      using errcode = 'P0001';
  end if;

  -- Ca mở đã có người đăng ký rảnh: talent đã bỏ công vào đó. Không chặn (chưa ai được chốt), nhưng
  -- phải đếm và trả về để UI nói ra con số trước khi ops bấm.
  select count(distinct s.id) into v_registered
  from shift_slots s
  join session_availability a on a.slot_id = s.id
  where s.plan_id = p_plan_id and s.status = 'open';

  -- Huỷ chứ không xoá ca: cùng quy ước với `lock_month_plan` (0091) khi ca bị bỏ khỏi kế hoạch —
  -- ca huỷ còn hiện dấu vết cho talent đã đăng ký, ca bị xoá thì biến mất không lời giải thích.
  update shift_slots set status = 'cancelled'
   where plan_id = p_plan_id and status = 'open';
  get diagnostics v_cancelled = row_count;
  select count(*) into v_plan_slots from brand_month_plan_slots where plan_id = p_plan_id;

  -- brand_month_plan_slots có `on delete cascade` (0090) nên tự đi theo.
  delete from brand_month_plans where id = p_plan_id;

  return jsonb_build_object(
    'brand_id', v_plan.brand_id,
    'month', v_plan.month,
    'plan_slots_deleted', v_plan_slots,
    'slots_cancelled', v_cancelled,
    'slots_had_registrations', v_registered
  );
end;
$$;

revoke all on function delete_month_plan(uuid) from public;
grant execute on function delete_month_plan(uuid) to authenticated;
