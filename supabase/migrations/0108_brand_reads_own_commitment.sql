-- 0108 — Đợt C/1: brand xem được cam kết hợp đồng của CHÍNH MÌNH (read-only).
--
-- Vì sao đây là việc đầu tiên của Đợt C: "tháng này cam kết bao nhiêu giờ, đã chạy được bao nhiêu,
-- còn thiếu bao nhiêu" là câu hỏi số 1 của khách, và hiện brand không có chỗ nào trong app trả lời
-- được — dữ liệu có đủ từ 0081 nhưng khoá ở ceo/admin/operations.
--
-- 0081 đã lường trước và ghi sẵn điều kiện, làm đúng theo:
--     "Muốn cho brand xem sau này thì thêm policy select riêng và TÁCH NOTE ra khỏi payload brand
--      đọc được — đừng nới policy hiện tại."
-- `note` trên cả 2 bảng là ghi chú nội bộ của agency về khách hàng đó. Nới policy hiện tại là mở
-- luôn cột note vì RLS chặn theo dòng chứ không theo cột.
--
-- CÁCH LÀM — và một hướng đã thử rồi bỏ, ghi lại để không ai đi lại:
--   Thử trước: `revoke select on brand_contracts from authenticated` rồi `grant select (<danh sách
--   cột>)`. GRANT theo cột chặn ở tầng quyền, trước cả RLS, nên về mặt an ninh là chặt. Nhưng nó
--   chặn theo ROLE POSTGRES, mà ceo/ops/brand đều là cùng một role `authenticated` (phân biệt
--   nhau bằng `profiles.role`, không phải bằng role DB). Hệ quả: ops cũng mất cột note, và mọi
--   `select=*` của PostgREST đổi từ "bỏ cột" thành LỖI `permission denied for column note` —
--   tức phải sửa mọi call site của ops rồi dựng thêm RPC chỉ để đọc lại note. Ba thay đổi cho
--   một cột, và một sharp edge để lại cho người sau.
--
--   Cách chọn: VIEW riêng cho brand. Bảng gốc GIỮ NGUYÊN policy 0081 (ceo/admin/ops, `for all`)
--   — ops không đổi một dòng nào. Brand không có policy nào trên bảng gốc nên vẫn đọc được 0
--   dòng ở đó; đường đọc duy nhất của họ là view này, và view chạy dưới quyền owner nên nó TỰ
--   lọc dòng (cùng ràng buộc như live_sessions_secure ở 0107).

drop view if exists brand_commitment_progress;
create view brand_commitment_progress as
select
  c.brand_id,
  c.period_month,
  c.committed_hours,
  c.committed_gmv,
  c.is_override,
  k.contract_code,
  k.start_month  as contract_start_month,
  k.end_month    as contract_end_month
from brand_monthly_commitments c
left join brand_contracts k
  on k.id = c.contract_id
 -- Hợp đồng nháp/đã kết thúc là chuyện nội bộ: brand chỉ thấy phần hợp đồng đang hiệu lực. Dòng
 -- cam kết vẫn hiện (nó là sự thật đã xảy ra), chỉ phần thông tin hợp đồng là rỗng.
 and (k.status = 'active' or (select current_user_role()) is distinct from 'brand')
where
  -- ops xem được mọi brand: họ cần mở Brand Workspace hộ khách qua switcher và thấy ĐÚNG cái khách
  -- thấy. Đây cũng là cách duy nhất để ops kiểm chứng màn này mà không cần tài khoản brand thật.
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and c.brand_id = (select current_user_brand_id()));

grant select on brand_commitment_progress to authenticated;

comment on view brand_commitment_progress is
  'Đường đọc cam kết hợp đồng cho Brand Workspace. Cố ý KHÔNG có cột `note` của brand_contracts / brand_monthly_commitments — đó là ghi chú nội bộ agency (xem điều kiện ghi trong migration 0081). Bảng gốc vẫn khoá ở ceo/admin/ops như cũ; view chạy dưới quyền owner nên nó tự lọc dòng.';
