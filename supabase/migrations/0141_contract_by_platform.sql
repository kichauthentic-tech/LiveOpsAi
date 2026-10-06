-- 0141 — Hợp đồng + cam kết giờ TÁCH THEO SÀN (TikTok / Shopee).
--
-- User chốt 06/10: hợp đồng riêng từng sàn (VERA TikTok và VERA Shopee là hai thoả thuận, hai mức giờ cam kết). Trước
-- 0141 cam kết khoá theo (brand, tháng) nên không ghi được hai con số cho một brand một tháng.
--
--   1) brand_contracts.platform, brand_monthly_commitments.platform ('TikTok' mặc định — dữ liệu cũ là TikTok; đo 05/10:
--      0 hợp đồng trên production); khoá cam kết (brand, tháng, sàn).
--   2) generate_contract_commitments sinh dòng cam kết đúng sàn của hợp đồng (thân hàm = 0133).
--   3) View brand_commitment_progress thêm cột platform (bọc định nghĩa đang chạy, khuôn 0130/0139 — không chép tay).
--
-- Thứ tự với deploy: chạy cùng lúc deploy client mới (sau 0139, 0140). Client mới đọc `select *` và coi thiếu cột là
-- TikTok — đọc chạy cả hai phía. Ghi tay một tháng: client cũ + DB mới lỗi ON CONFLICT, client mới + DB cũ lỗi thiếu
-- cột — không mất dữ liệu. Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Cột sàn + khoá
-- ============================================================================
alter table brand_contracts add column if not exists platform text not null default 'TikTok';
alter table brand_monthly_commitments add column if not exists platform text not null default 'TikTok';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_contracts_platform_check') then
    alter table brand_contracts add constraint brand_contracts_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_monthly_commitments_platform_check') then
    alter table brand_monthly_commitments add constraint brand_monthly_commitments_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
end $$;

drop index if exists idx_brand_monthly_commitments_brand_month;
create unique index if not exists idx_brand_monthly_commitments_brand_month_platform
  on brand_monthly_commitments(brand_id, period_month, platform);

-- ============================================================================
-- 2) Sinh cam kết theo sàn của hợp đồng
-- ============================================================================
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
  v_removed int := 0;
  v_owner uuid;
  v_override boolean;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền sinh cam kết hợp đồng';
  end if;

  select * into v_contract from brand_contracts where id = p_contract_id;
  if not found then
    raise exception 'Không tìm thấy hợp đồng %', p_contract_id;
  end if;
  if v_contract.status = 'draft' then
    raise exception 'Hợp đồng đang là nháp — chuyển sang "Đang hiệu lực" rồi mới sinh cam kết (cam kết là mẫu số của run-rate, không lấy từ bản nháp).';
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
    where brand_id = v_contract.brand_id and period_month = v_month and platform = v_contract.platform;

    if not found then
      insert into brand_monthly_commitments (brand_id, contract_id, period_month, platform, committed_hours, committed_gmv)
      values (v_contract.brand_id, v_contract.id, v_month, v_contract.platform, v_contract.monthly_hours, v_contract.monthly_gmv);
      v_inserted := v_inserted + 1;
    elsif v_override then
      v_skipped_override := v_skipped_override + 1;
    elsif v_owner is not null and v_owner <> v_contract.id then
      v_skipped_other := v_skipped_other + 1;
    else
      update brand_monthly_commitments
      set contract_id = v_contract.id,
          committed_hours = v_contract.monthly_hours,
          committed_gmv = v_contract.monthly_gmv
      where brand_id = v_contract.brand_id and period_month = v_month and platform = v_contract.platform;
      v_updated := v_updated + 1;
    end if;

    v_month := (v_month + interval '1 month')::date;
  end loop;

  delete from brand_monthly_commitments
   where contract_id = v_contract.id
     and not is_override
     and (period_month < v_contract.start_month
          or (v_contract.end_month is not null and period_month > v_contract.end_month)
          -- Hợp đồng bị đổi sàn: dòng đã sinh ở sàn cũ không còn là của nó.
          or platform <> v_contract.platform);
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped_override', v_skipped_override,
    'skipped_other_contract', v_skipped_other,
    'removed', v_removed
  );
end;
$$;
revoke all on function generate_contract_commitments(uuid, date) from public;
grant execute on function generate_contract_commitments(uuid, date) to authenticated;

-- ============================================================================
-- 3) View đọc cam kết của brand: thêm cột platform (cuối danh sách cột — create or replace view cho phép)
-- ============================================================================
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := regexp_replace(pg_get_viewdef('public.brand_commitment_progress'::regclass, true), ';\s*$', '');
  if v_def ~* '\mc\.platform\M' then
    raise notice '0141: brand_commitment_progress đã có cột platform, không đụng.';
    return;
  end if;
  v_new := regexp_replace(v_def, '(end_month\s+AS\s+contract_end_month)', '\1,' || chr(10) || '    c.platform', 'i');
  if v_new = v_def then
    raise exception '0141 DỪNG: không tìm thấy cột contract_end_month trong brand_commitment_progress để thêm platform';
  end if;
  execute format('create or replace view public.brand_commitment_progress as %s', v_new);
end $$;

-- ============================================================================
-- 4) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if exists (select 1 from pg_indexes where indexname = 'idx_brand_monthly_commitments_brand_month') then
    raise exception '0141 chốt 1: unique (brand, tháng) cũ vẫn còn';
  end if;
  if pg_get_functiondef('public.generate_contract_commitments(uuid, date)'::regprocedure) !~ 'platform = v_contract\.platform' then
    raise exception '0141 chốt 2: generate_contract_commitments chưa theo sàn';
  end if;
  if pg_get_viewdef('public.brand_commitment_progress'::regclass, true) !~* 'c\.platform' then
    raise exception '0141 chốt 3: view thiếu cột platform';
  end if;
  -- View phải còn vế lọc theo brand của 0108/0129.
  if pg_get_viewdef('public.brand_commitment_progress'::regclass, true) !~* 'current_user_brand_id' then
    raise exception '0141 chốt 4: view mất vế lọc theo brand';
  end if;
end $$;
