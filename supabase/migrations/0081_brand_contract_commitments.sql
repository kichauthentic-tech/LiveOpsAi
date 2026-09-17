-- Lớp cam kết hợp đồng (mục 4 lộ trình tầng dữ liệu gốc mới) — brand cam kết bao nhiêu giờ/tháng
-- với agency. Đây là MẪU SỐ để đối chiếu run-rate: tầng hiệu suất (giai đoạn 3) trả lời "làm được
-- bao nhiêu", tầng này trả lời "đáng ra phải làm bao nhiêu".
--
-- Vì sao 2 bảng chứ không phải 1:
--   * brand_contracts   = điều khoản trên GIẤY (ký từ tháng nào tới tháng nào, mặc định bao nhiêu
--                         giờ/tháng). Ít thay đổi, là nguồn gốc pháp lý.
--   * brand_monthly_commitments = con số CHỐT của từng tháng, thứ mọi màn hình run-rate đọc.
--     Tách ra vì tháng camp/Tết thường cam kết khác mặc định hợp đồng, và vì hợp đồng bị xoá/sửa
--     thì lịch sử cam kết các tháng ĐÃ QUA vẫn phải giữ nguyên (không được viết lại quá khứ).
--
-- Quy ước quan trọng: bảng tháng có unique (brand_id, period_month) — MỘT brand MỘT tháng chỉ có
-- đúng MỘT con số cam kết. Cho phép nhiều dòng thì mọi phép so run-rate đều mơ hồ (chia cho cái
-- nào?), nên ràng buộc này là cố ý và không được nới.

-- ---------------------------------------------------------------------------
-- 1) Hợp đồng
-- ---------------------------------------------------------------------------

create table if not exists brand_contracts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  -- Mã HĐ trên giấy, để ops đối chiếu khi có tranh chấp. Không bắt buộc vì nhiều deal chốt trước,
  -- số hợp đồng về sau.
  contract_code text,
  -- Luôn là ngày 01 của tháng: hợp đồng live thường tính tròn tháng, và cam kết giờ cũng theo
  -- tháng. Ràng buộc bằng check để không có dòng nào lọt giữa tháng rồi lệch khi generate.
  start_month date not null,
  -- null = chưa chốt ngày kết thúc / tự động gia hạn. Sinh cam kết tới đâu thì lúc đó ops chọn.
  end_month date,
  -- Giờ cam kết MẶC ĐỊNH mỗi tháng. Dùng làm giá trị khởi tạo khi sinh các dòng tháng, không phải
  -- con số cuối — con số cuối luôn nằm ở brand_monthly_commitments.
  monthly_hours numeric not null default 0,
  -- null = hợp đồng không cam kết GMV (khá phổ biến: chỉ cam kết giờ lên sóng, GMV là nỗ lực).
  monthly_gmv numeric,
  status text not null default 'draft' check (status in ('draft', 'active', 'ended')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_contracts_start_is_month_start check (start_month = date_trunc('month', start_month)::date),
  constraint brand_contracts_end_is_month_start check (end_month is null or end_month = date_trunc('month', end_month)::date),
  constraint brand_contracts_end_after_start check (end_month is null or end_month >= start_month),
  constraint brand_contracts_hours_non_negative check (monthly_hours >= 0),
  constraint brand_contracts_gmv_non_negative check (monthly_gmv is null or monthly_gmv >= 0)
);

create index if not exists idx_brand_contracts_brand on brand_contracts(brand_id, start_month);

drop trigger if exists trg_brand_contracts_updated_at on brand_contracts;
create trigger trg_brand_contracts_updated_at before update on brand_contracts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Cam kết từng tháng
-- ---------------------------------------------------------------------------

create table if not exists brand_monthly_commitments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  -- on delete SET NULL chứ không cascade: xoá hợp đồng không được xoá lịch sử cam kết. Tháng đã
  -- qua thì con số đó là sự thật đã xảy ra, dòng mồ côi vẫn hợp lệ và vẫn hiện trên run-rate.
  contract_id uuid references brand_contracts(id) on delete set null,
  period_month date not null,
  committed_hours numeric not null default 0,
  committed_gmv numeric,
  -- true = ops đã sửa tay tháng này; hàm sinh cam kết từ hợp đồng sẽ KHÔNG ghi đè. Không có cờ
  -- này thì mỗi lần bấm "sinh lại" là mất hết ngoại lệ đã nhập tay (tháng Tết, tháng camp...).
  is_override boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_monthly_commitments_is_month_start check (period_month = date_trunc('month', period_month)::date),
  constraint brand_monthly_commitments_hours_non_negative check (committed_hours >= 0),
  constraint brand_monthly_commitments_gmv_non_negative check (committed_gmv is null or committed_gmv >= 0)
);

create unique index if not exists idx_brand_monthly_commitments_brand_month
  on brand_monthly_commitments(brand_id, period_month);

create index if not exists idx_brand_monthly_commitments_contract on brand_monthly_commitments(contract_id);

drop trigger if exists trg_brand_monthly_commitments_updated_at on brand_monthly_commitments;
create trigger trg_brand_monthly_commitments_updated_at before update on brand_monthly_commitments
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) Sinh cam kết theo tháng từ hợp đồng
-- ---------------------------------------------------------------------------

-- Trả về jsonb tóm tắt thay vì im lặng: ops cần biết đã bỏ qua tháng nào và vì sao, nếu không thì
-- "bấm nút xong không thấy gì đổi" là bug hay là đúng ý đồ cũng không phân biệt được.
--
-- p_through_month: hợp đồng không có ngày kết thúc thì phải có mốc dừng, nếu không vòng lặp chạy
-- vô hạn. Bắt buộc truyền khi end_month is null.
create or replace function generate_contract_commitments(
  p_contract_id uuid,
  p_through_month date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract brand_contracts;
  v_last date;
  v_month date;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped_override int := 0;
  v_skipped_other int := 0;
  v_owner uuid;
  v_override boolean;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền sinh cam kết hợp đồng';
  end if;

  select * into v_contract from brand_contracts where id = p_contract_id;
  if not found then
    raise exception 'Không tìm thấy hợp đồng %', p_contract_id;
  end if;

  v_last := coalesce(v_contract.end_month, date_trunc('month', p_through_month)::date);
  if v_last is null then
    raise exception 'Hợp đồng chưa có tháng kết thúc — phải chọn mốc sinh tới tháng nào';
  end if;
  if v_last < v_contract.start_month then
    raise exception 'Mốc sinh (%) nằm trước tháng bắt đầu hợp đồng (%)', v_last, v_contract.start_month;
  end if;

  v_month := v_contract.start_month;
  while v_month <= v_last loop
    select contract_id, is_override into v_owner, v_override
    from brand_monthly_commitments
    where brand_id = v_contract.brand_id and period_month = v_month;

    if not found then
      insert into brand_monthly_commitments (brand_id, contract_id, period_month, committed_hours, committed_gmv)
      values (v_contract.brand_id, v_contract.id, v_month, v_contract.monthly_hours, v_contract.monthly_gmv);
      v_inserted := v_inserted + 1;
    elsif v_override then
      -- Ops đã chốt tay tháng này, hợp đồng không được đè lên.
      v_skipped_override := v_skipped_override + 1;
    elsif v_owner is not null and v_owner <> v_contract.id then
      -- Tháng này đang thuộc hợp đồng khác (2 hợp đồng chồng khung). Không tự giành — để ops tự
      -- xử, vì im lặng chuyển chủ sở hữu là cách êm nhất để mất dấu một cam kết.
      v_skipped_other := v_skipped_other + 1;
    else
      update brand_monthly_commitments
      set contract_id = v_contract.id,
          committed_hours = v_contract.monthly_hours,
          committed_gmv = v_contract.monthly_gmv
      where brand_id = v_contract.brand_id and period_month = v_month;
      v_updated := v_updated + 1;
    end if;

    v_month := (v_month + interval '1 month')::date;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped_override', v_skipped_override,
    'skipped_other_contract', v_skipped_other
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) RLS — chỉ agency thương mại
-- ---------------------------------------------------------------------------

-- Điều khoản hợp đồng là thông tin thương mại: talent không cần biết brand cam kết bao nhiêu giờ,
-- và role brand cũng CHƯA được mở (biết cam kết của chính mình thì hợp lý, nhưng cột note là ghi
-- chú nội bộ của agency). Muốn cho brand xem sau này thì thêm policy select riêng và tách note ra
-- khỏi payload brand đọc được — đừng nới policy hiện tại.
alter table brand_contracts enable row level security;
alter table brand_monthly_commitments enable row level security;

drop policy if exists "brand_contracts_ceo_admin_ops" on brand_contracts;
create policy "brand_contracts_ceo_admin_ops" on brand_contracts for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

drop policy if exists "brand_monthly_commitments_ceo_admin_ops" on brand_monthly_commitments;
create policy "brand_monthly_commitments_ceo_admin_ops" on brand_monthly_commitments for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));
