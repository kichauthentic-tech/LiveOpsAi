-- FIX M3 (audit 2026-08-20): "Đã duyệt" trong Finance & P&L không khoá gì — số vẫn sửa được
-- sau khi CEO duyệt mà con dấu (approved_by/approved_at) và badge "Đã duyệt" vẫn còn nguyên.
--
-- upsertSessionFinance() (src/lib/db/finance.ts:40) chỉ patch agency_commission_rate/studio_cost/
-- ads_cost/... — không đụng approval_status, nên trigger 0008 (chỉ gán lại approver khi
-- approval_status thực sự đổi) không có lý do để chạy. Cơ chế khoá sổ theo tháng từng chặn việc
-- sửa số sau khi chốt đã bị gỡ ở 0023_drop_monthly_close.sql, nên hiện không còn gì ngăn sửa số
-- sau khi đã duyệt.
--
-- Cách sửa: mở rộng trigger enforce_session_finance_approver — nếu một hàng đang approved/rejected
-- mà các cột tiền (agency_commission_rate, studio_cost, ads_cost, host_fix_rate_override,
-- host_commission_rate_override) đổi giá trị trong cùng 1 update KHÔNG kèm đổi approval_status
-- (tức đến từ upsertSessionFinance, không phải setSessionFinanceApproval), tự đưa approval_status
-- về lại 'pending' và xoá approved_by/approved_at — giống nguyên tắc đã áp dụng ở M2: sửa số tay
-- thì con dấu duyệt cũ không còn hiệu lực, phải duyệt lại từ đầu. Không chặn việc sửa số (ops có
-- thể cần sửa sau khi duyệt nhầm), chỉ đảm bảo badge phản ánh đúng trạng thái.

create or replace function enforce_session_finance_approver() returns trigger as $$
declare
  status_changed boolean;
  money_fields_changed boolean;
begin
  if TG_OP = 'INSERT' then
    status_changed := true;
    money_fields_changed := false;
  else
    status_changed := (new.approval_status is distinct from old.approval_status);
    money_fields_changed := (
      new.agency_commission_rate is distinct from old.agency_commission_rate
      or new.studio_cost is distinct from old.studio_cost
      or new.ads_cost is distinct from old.ads_cost
      or new.host_fix_rate_override is distinct from old.host_fix_rate_override
      or new.host_commission_rate_override is distinct from old.host_commission_rate_override
    );
  end if;

  if status_changed then
    if new.approval_status = 'pending' then
      new.approved_by := null;
      new.approved_at := null;
    else
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  elsif money_fields_changed and old.approval_status <> 'pending' then
    new.approval_status := 'pending';
    new.approved_by := null;
    new.approved_at := null;
  end if;

  return new;
end;
$$ language plpgsql;
