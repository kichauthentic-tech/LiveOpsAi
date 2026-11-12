-- 0216 — Tách ca đổi host giữa ca thành các ca nối tiếp THẬT (mỗi host một ca: giờ, target, file, GMV riêng).
-- User chốt 12/11: ca "Henry → T.Toàn" hiện một chip, không biết ai bán bao nhiêu; muốn tách ra 2 ca nối cùng room như ca nối thường.
-- Chỉ áp cho ca CHƯA có số liệu (chưa file, chưa report, chưa số lúc đổi host, GMV 0) — ca đã có số giữ nguyên, dùng nút gõ GMV (0215).
-- Cách làm: mỗi đoạn host = một ca (đoạn đầu giữ chính ca gốc). Giờ theo offset đoạn; target chia theo số phút (đoạn cuối nhận phần dư);
-- trợ live: đoạn giờ của trợ được cắt theo từng ca và dời offset; trợ cả ca thì đi theo cả hai ca. Ca gốc hết đoạn host.
-- Ca ở tháng đã phát hành Report, ca huỷ, ca nạp bù: từ chối.

create or replace function split_session_at_host_change(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  n live_sessions;
  v_dur integer;
  v_pieces integer;
  v_start_min integer;
  p record;
  v_ids uuid[] := '{}';
  v_target_left numeric;
  v_target numeric;
  v_cs_total integer;
  v_cs_in integer;
  v_cs_people integer;
  v_cs_cover integer;
  v_main uuid;
  v_main_name text;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được tách ca.' using errcode = '42501';
  end if;
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không tách.' using errcode = 'P0001';
  end if;
  if s.brand_id is not null and private.brand_month_published(s.brand_id, s.date) then
    raise exception 'Tháng %/% của % đã phát hành Report cho brand — ca đã đóng sổ.',
      to_char(s.date, 'MM'), to_char(s.date, 'YYYY'), coalesce(nullif(s.brand_name, ''), 'brand') using errcode = 'P0001';
  end if;
  if coalesce(s.actual_gmv, 0) > 0
     or exists (select 1 from session_live_snapshots x where x.session_id = s.id)
     or exists (select 1 from live_session_reports x where x.session_id = s.id)
     or exists (select 1 from session_segment_checkpoints x where x.session_id = s.id) then
    raise exception 'Ca đã có số liệu — không tách tự động được. Dùng "Gõ GMV đúng" ở khối Report lúc đổi host.' using errcode = 'P0001';
  end if;

  v_dur := (extract(epoch from (s.end_time - s.start_time)) / 60)::integer;
  if v_dur <= 0 then v_dur := v_dur + 1440; end if;
  v_start_min := (extract(hour from s.start_time) * 60 + extract(minute from s.start_time))::integer;

  drop table if exists _pc;
  create temp table _pc on commit drop as
    select row_number() over (order by g.from_min) as idx, g.talent_id, coalesce(g.talent_name, '') as talent_name,
           case when row_number() over (order by g.from_min) = 1 then 0 else lag(g.to_min) over (order by g.from_min) end as ps,
           case when lead(g.from_min) over (order by g.from_min) is null then v_dur else g.to_min end as pe
      from session_staff_segments g
     where g.session_id = s.id and g.role = 'host';
  select count(*) into v_pieces from _pc;
  if v_pieces < 2 then
    raise exception 'Ca này không đổi host giữa ca — không có gì để tách.' using errcode = 'P0001';
  end if;

  drop table if exists _cs;
  create temp table _cs on commit drop as
    select g.talent_id, coalesce(g.talent_name, '') as talent_name, g.from_min, g.to_min
      from session_staff_segments g where g.session_id = s.id and g.role = 'co_host';
  select count(*) into v_cs_total from _cs;

  delete from session_staff_segments where session_id = s.id;

  v_target_left := coalesce(s.target_gmv, 0);
  for p in select * from _pc order by idx loop
    if p.idx = v_pieces then
      v_target := v_target_left;
    else
      v_target := round(coalesce(s.target_gmv, 0) * (p.pe - p.ps) / v_dur);
      v_target_left := v_target_left - v_target;
    end if;

    if p.idx = 1 then
      n := s;
      update live_sessions set
        end_time = (s.start_time + make_interval(mins => p.pe))::time,
        host_id = p.talent_id, host_name = p.talent_name, target_gmv = v_target
       where id = s.id;
      v_ids := v_ids || s.id;
    else
      n := s;
      n.id := gen_random_uuid();
      n.start_time := (s.start_time + make_interval(mins => p.ps))::time;
      n.end_time := (s.start_time + make_interval(mins => p.pe))::time;
      n.date := s.date + ((v_start_min + p.ps) / 1440);
      n.host_id := p.talent_id;
      n.host_name := p.talent_name;
      n.target_gmv := v_target;
      insert into live_sessions select n.*;
      v_ids := v_ids || n.id;
    end if;

    -- Trợ live của ca này.
    if v_cs_total = 0 then
      -- trợ cả ca (host_id/co_host_id): giữ nguyên theo bản gốc
      if p.idx > 1 then
        update live_sessions set co_host_id = s.co_host_id, co_host_name = s.co_host_name where id = n.id;
      end if;
    else
      select count(*), count(distinct talent_id), coalesce(sum(least(to_min, p.pe) - greatest(from_min, p.ps)), 0)
        into v_cs_in, v_cs_people, v_cs_cover
        from _cs where from_min < p.pe and to_min > p.ps;
      if v_cs_in = 0 then
        update live_sessions set co_host_id = null, co_host_name = '' where id = case when p.idx = 1 then s.id else n.id end;
      else
        select c.talent_id, c.talent_name into v_main, v_main_name
          from _cs c where c.from_min < p.pe and c.to_min > p.ps
         group by c.talent_id, c.talent_name
         order by sum(least(c.to_min, p.pe) - greatest(c.from_min, p.ps)) desc, min(c.from_min) asc limit 1;
        update live_sessions set co_host_id = v_main, co_host_name = v_main_name where id = case when p.idx = 1 then s.id else n.id end;
        if not (v_cs_people = 1 and v_cs_cover >= p.pe - p.ps) then
          insert into session_staff_segments (session_id, talent_id, talent_name, role, from_min, to_min)
            select case when p.idx = 1 then s.id else n.id end, c.talent_id, c.talent_name, 'co_host',
                   greatest(c.from_min, p.ps) - p.ps, least(c.to_min, p.pe) - p.ps
              from _cs c where c.from_min < p.pe and c.to_min > p.ps;
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object('session_ids', to_jsonb(v_ids), 'pieces', v_pieces);
end;
$$;
revoke all on function split_session_at_host_change(uuid) from public;
grant execute on function split_session_at_host_change(uuid) to authenticated;
