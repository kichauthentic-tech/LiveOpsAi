-- 0163 — Sổ độ chính xác dự báo GMV tháng (engine target v3, phần P7 của đề xuất 10/10).
--
-- Bối cảnh: dự báo tháng v3 (src/lib/performance/monthForecast.ts) có backtest walk-forward ngay trong AI Training Center, nhưng
-- backtest dùng lịch ĐÃ chạy làm lịch kế hoạch (lạc quan hơn đời thật) và chỉ có 3 tháng. Muốn biết engine đúng tới đâu thì phải
-- GHI LẠI con số đã nói lúc đó rồi so với kết quả cuối tháng. Bảng này giữ:
--   • kind 'plan'  — dự báo lúc CHỐT Kế Hoạch Tháng (P50 + dải ~80% + target), ghi từ màn Kế Hoạch Tháng;
--   • kind 'daily' — dự phóng trong tháng (đã có + phần còn lại), ghi khi ceo/ops/admin mở Dashboard; mỗi kênh mỗi ngày một dòng
--     (mở nhiều lần thì dòng của ngày đó được ghi đè bằng số mới nhất).
-- Không ghi GMV thật cuối tháng ở đây: GMV thật lấy từ ca lúc đọc (cùng nguồn với mọi màn), nên đối soát lại tháng cũ vẫn đúng.
--
-- Ghi chỉ qua RPC record_forecast_snapshots (security definer, ceo/operations/admin). Đọc: ceo/operations/admin.
-- Thứ tự deploy: chạy migration trước hay sau client đều được — client cũ không gọi; client mới gặp DB chưa có bảng thì bỏ qua
-- việc ghi (không báo lỗi người dùng) và thẻ Training hiện "chưa chạy migration 0163". Chạy lại nhiều lần không sao.

create table if not exists forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null default 'TikTok',
  month date not null,
  as_of date not null,
  kind text not null,
  p50 numeric not null,
  lo numeric,
  hi numeric,
  actual numeric,
  target numeric,
  seen_share numeric,
  ratio numeric,
  model text not null default 'v3',
  recorded_by uuid,
  recorded_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_platform_check') then
    alter table forecast_snapshots add constraint forecast_snapshots_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_kind_check') then
    alter table forecast_snapshots add constraint forecast_snapshots_kind_check check (kind in ('plan', 'daily'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_month_check') then
    alter table forecast_snapshots add constraint forecast_snapshots_month_check check (extract(day from month) = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_numbers_check') then
    alter table forecast_snapshots add constraint forecast_snapshots_numbers_check
      check (p50 >= 0 and coalesce(lo, 0) >= 0 and coalesce(hi, 0) >= 0 and coalesce(actual, 0) >= 0 and coalesce(target, 0) >= 0
             and (seen_share is null or (seen_share >= 0 and seen_share <= 1)));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'forecast_snapshots_one_per_day') then
    alter table forecast_snapshots add constraint forecast_snapshots_one_per_day unique (brand_id, platform, month, as_of, kind);
  end if;
end $$;

create index if not exists idx_forecast_snapshots_channel on forecast_snapshots(brand_id, platform, month, as_of);

-- Kênh phải tồn tại (0149) — cùng luật với 12 bảng có cột sàn.
drop trigger if exists trg_guard_channel_exists on forecast_snapshots;
create trigger trg_guard_channel_exists before insert or update of brand_id, platform on forecast_snapshots
  for each row execute function private.guard_channel_exists();


create or replace function record_forecast_snapshots(p_rows jsonb) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_n int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'Chỉ ceo/operations/admin ghi sổ dự báo' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows phải là mảng';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Tối đa 200 dòng mỗi lần ghi';
  end if;
  for v_item in select * from jsonb_array_elements(p_rows) loop
    insert into forecast_snapshots (brand_id, platform, month, as_of, kind, p50, lo, hi, actual, target, seen_share, ratio, model, recorded_by, recorded_at)
    values (
      (v_item->>'brand_id')::uuid,
      coalesce(v_item->>'platform', 'TikTok'),
      (v_item->>'month')::date,
      coalesce((v_item->>'as_of')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
      v_item->>'kind',
      round((v_item->>'p50')::numeric),
      round((v_item->>'lo')::numeric),
      round((v_item->>'hi')::numeric),
      round((v_item->>'actual')::numeric),
      round((v_item->>'target')::numeric),
      (v_item->>'seen_share')::numeric,
      (v_item->>'ratio')::numeric,
      coalesce(v_item->>'model', 'v3'),
      auth.uid(),
      now()
    )
    on conflict (brand_id, platform, month, as_of, kind) do update set
      p50 = excluded.p50, lo = excluded.lo, hi = excluded.hi, actual = excluded.actual, target = excluded.target,
      seen_share = excluded.seen_share, ratio = excluded.ratio, model = excluded.model,
      recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function record_forecast_snapshots(jsonb) from public;
grant execute on function record_forecast_snapshots(jsonb) to authenticated;

-- RLS ở cuối file: tests/sqlGuards quét 1200 ký tự sau mỗi `create policy`, đặt trước hàm thì dính lời gọi current_user_role() trong thân hàm.
alter table forecast_snapshots enable row level security;
-- Chỉ quyền đọc (RLS lọc theo role); ghi đi qua RPC.
revoke all on forecast_snapshots from anon;
grant select on forecast_snapshots to authenticated;
drop policy if exists "forecast_snapshots_read_staff" on forecast_snapshots;
create policy "forecast_snapshots_read_staff" on forecast_snapshots for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'));
-- Không có policy insert/update/delete: chỉ record_forecast_snapshots (security definer) ghi được.
