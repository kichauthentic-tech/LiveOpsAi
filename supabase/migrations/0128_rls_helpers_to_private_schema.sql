-- 0128 — CHUYỂN 5 HÀM HELPER RLS SANG SCHEMA KHÔNG EXPOSE (`private`).
-- (Phát hiện 2026-10-01 khi đọc OpenAPI của PostgREST sau khi chạy 0127 — xem P2a-14.)
--
-- ✅ ĐÃ CHẠY trên production 2026-10-01.
--    Đây là migration duy nhất trong 5 cái của ngày hôm nay mà verify được ĐÚNG TÍNH CHẤT BẢO MẬT
--    từ xa, không phải kiểm bằng proxy: OpenAPI của PostgREST cho RPC 40 → 35, mất đúng 5 endpoint
--    của 5 hàm này; `can_edit_session_snapshot` và 3 hàm `current_user_*` (cố ý giữ) vẫn còn; 48
--    bảng/view và `live_sessions_secure` nguyên vẹn.
--
-- ============================================================================
-- VẤN ĐỀ
-- ============================================================================
-- PostgREST lộ MỌI hàm trong schema được expose (`public`) thành endpoint `/rpc/<tên>`. Năm hàm
-- dưới đây sinh ra CHỈ để gọi bên trong biểu thức policy, nên chúng:
--   • là `security definer` ⇒ CỐ Ý vượt RLS (0059 tạo chúng đúng để tránh RLS-trong-RLS);
--   • KHÔNG có guard role nào trong thân — guard là việc của policy gọi chúng;
--   • nhận ID của DÒNG NGƯỜI KHÁC làm tham số.
-- Ba tính chất đó cộng lại, khi hàm lộ ra `/rpc/`, thành một đường đọc vượt RLS:
--
--     POST /rest/v1/rpc/session_brand_id   {"p_session_id": "<uuid ca bất kỳ>"}
--     → brand_id của ca đó, bất kể người gọi là talent hay là người của brand khác.
--
-- Đúng thứ toàn bộ 0059 (brand read isolation) dựng lên để ngăn.
--
-- VÌ SAO KHÔNG VÁ ĐƯỢC BẰNG `REVOKE` — đã thử trên giấy trước khi chọn cách này:
-- policy RLS gọi hàm thì CHÍNH NGƯỜI TRUY VẤN phải có EXECUTE trên hàm đó. Đó là lý do 0100 phải
-- `grant execute ... to authenticated` NGAY SAU khi `revoke ... from public`. Nên 4/5 hàm dưới đây
-- "đã revoke khỏi public" mà vẫn gọi được qua `/rpc/`: chúng buộc phải grant lại cho
-- `authenticated`, và mọi tài khoản đã đăng nhập đều là `authenticated`. Revoke khỏi
-- `authenticated` là làm chết 4 policy (và 1 view) đang dùng chúng.
--
-- Cách đóng đúng là ĐỔI CHỖ chứ không đổi quyền: PostgREST chỉ lộ hàm trong schema được expose
-- (`db-schemas` của Supabase, mặc định `public, graphql_public`). Hàm nằm ở `private` thì policy
-- vẫn gọi được như thường, còn `/rpc/` thì không có.
--
-- ⚠️ ĐIỀU KIỆN DUY TRÌ: nếu sau này ai thêm `private` vào danh sách schema được expose (Settings →
-- API → Exposed schemas), lỗ này MỞ LẠI NGUYÊN VẸN. Đừng thêm.
--
-- NÓI CHÍNH XÁC THỨ ĐẠT ĐƯỢC, không nói quá: cách này KHÔNG lấy lại quyền — `authenticated` vẫn
-- `execute` được 5 hàm (buộc phải vậy, nếu không policy chết). Nó bỏ ENDPOINT HTTP. Đủ, vì client
-- của app chỉ tới được DB qua PostgREST: anon/service key là JWT cho PostgREST, nối thẳng Postgres
-- thì cần mật khẩu DB mà client không có. Nên đây là thu hẹp BỀ MẶT API, không phải thu hẹp quyền —
-- ai đọc tiếp cần biết đúng điều đó để không tưởng là đã khoá ở tầng quyền.
--
-- ============================================================================
-- PHẠM VI: 5 HÀM, KHÔNG PHẢI 1 — VÀ VÌ SAO DỪNG Ở ĐÚNG 5 CÁI ĐÓ
-- ============================================================================
-- Quét toàn chuỗi migration: 31 hàm `security definer` CÓ tham số. Lằn ranh để chọn là ba câu hỏi,
-- phải CẢ BA mới chuyển:
--   (1) có được gọi trong biểu thức policy?   (2) thân hàm KHÔNG có guard role?   (3) `src/` KHÔNG gọi?
--
-- Số dưới đây là ĐO TRÊN DB sau khi replay cả chuỗi, không phải đếm grep: đếm grep ra nhiều hơn vì
-- nó tính cả những bản policy ĐÃ BỊ migration sau thay thế (vd 3 policy 0059 dùng
-- `session_brand_id` đều đã bị 0105/0107/0109 viết lại thành bản không dùng nó nữa).
--
--   hàm                                nơi dùng THẬT (sau replay)                         guard  src/
--   session_brand_id(uuid)             session_skus_read_published                        không  không
--   session_month_published(uuid)      session_skus_read_published                        không  không
--   snapshot_session_id(uuid)          session_live_snapshot_rows_read                    không  không
--   month_plan_brand_id(uuid)          brand_month_plan_slots_read_scoped                 không  không
--   brand_month_published(uuid, date)  brand_monthly_report_snapshots_brand_read_published không  không
--                                      + VIEW live_sessions_secure
--
--   ⇒ tổng: 4 policy + 1 view. Cả 5 hàm đều CHUYỂN.
--
-- GIỮ NGUYÊN Ở `public`, có lý do:
--   • `can_edit_session_snapshot(uuid)` — CÓ guard role trong thân VÀ `src/components/SessionWindow.tsx`
--     gọi nó như RPC thật. Đây là RPC của app, lộ ra `/rpc/` là đúng mục đích. Chuyển là làm hỏng UI.
--   • `session_boundary_at(uuid)` — 0 policy nào gọi; nó là hàm nội bộ của đường snapshot (0078),
--     không thuộc họ helper này.
--   • 26 hàm còn lại — đều là RPC của app, có guard role riêng trong thân.
--   • `current_user_role` / `current_user_brand_id` / `current_user_talent_id` — KHÔNG nhận tham số,
--     chỉ trả dữ liệu CỦA CHÍNH NGƯỜI GỌI, nên lộ ra `/rpc/` không rò gì. Chuyển chúng phải sửa 354
--     lượt gọi trong policy để đổi lấy số 0 về an toàn — không làm.
--
-- ============================================================================
-- CÁCH VIẾT LẠI POLICY: ĐỌC `pg_policies`, KHÔNG CHÉP TAY
-- ============================================================================
-- Vòng lặp dưới đây đọc biểu thức policy ĐANG CHẠY từ `pg_policies` rồi chỉ thay tên hàm, giữ
-- nguyên mọi thứ khác (permissive/restrictive, cmd, roles, phần còn lại của biểu thức). Chọn cách
-- này thay vì chép lại 9 policy bằng tay vì hai lý do:
--   • dự án này ĐÃ hai lần bị sửa tay thẳng trên production (xem "Sự cố vận hành đáng nhớ"), nên
--     bản trong repo có thể không đúng bản đang chạy — chép tay là ghi đè drift mà không biết;
--   • policy phân quyền chép tay sai một dấu ngoặc là một lỗ, không phải một lỗi cú pháp.
--
-- Vòng lặp idempotent: chuẩn hoá bỏ cả tiền tố `public.` lẫn `private.` trước khi gắn `private.`,
-- và policy nào không đổi gì thì không drop/tạo lại.
--
-- CHỐT AN TOÀN cuối file là chính lệnh `drop function public.<tên>` KHÔNG `cascade`: Postgres từ
-- chối drop khi còn policy phụ thuộc. Nên nếu vòng lặp bỏ sót dù một policy, migration VỠ TO ở đó
-- chứ không âm thầm kéo policy nào xuống. Đây là phép kiểm ở tầng catalog, chắc hơn mọi phép so
-- chuỗi — nên cố ý KHÔNG thêm tripwire bằng regex.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
-- CỐ Ý không grant gì cho `anon`: 0109 đã đóng hẳn đường vô danh, và helper không có việc gì ở đó.

-- ---------------------------------------------------------------------------
-- 1) Dựng bản `private` — thân hàm y nguyên bản mới nhất, chỉ thêm đúng chỗ phải thêm
-- ---------------------------------------------------------------------------
-- `set search_path = public` để tên bảng không schema-qualify trong thân vẫn trỏ đúng `public`
-- (0127 đã đo: `security definer` vốn chặn inline nên mệnh đề SET không tốn gì).
-- `session_brand_id` bản 0059 chưa có mệnh đề này — thêm luôn, đúng luật `tests/sqlGuards.test.ts`.

create or replace function private.session_brand_id(p_session_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select brand_id from live_sessions where id = p_session_id
$$;

create or replace function private.month_plan_brand_id(p_plan_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select brand_id from brand_month_plans where id = p_plan_id
$$;

create or replace function private.snapshot_session_id(p_snapshot_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select session_id from session_live_snapshots where id = p_snapshot_id
$$;

create or replace function private.brand_month_published(p_brand_id uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from brand_monthly_reports r
     where r.brand_id = p_brand_id
       and r.period_month = date_trunc('month', p_date)::date
       and r.status = 'published'
  )
$$;

-- Hàm DUY NHẤT trong 5 cái gọi một helper khác ⇒ phải qualify `private.` tường minh: search_path
-- của nó là `public`, nên để trống sẽ đi tìm `brand_month_published` ở public — chỗ mà cuối file
-- này đã drop. Bỏ sót đúng chỗ này là brand mất sạch SKU của tháng đã phát hành.
create or replace function private.session_month_published(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.brand_month_published(ls.brand_id, ls.date)
    from live_sessions ls where ls.id = p_session_id
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'private.session_brand_id(uuid)',
    'private.month_plan_brand_id(uuid)',
    'private.snapshot_session_id(uuid)',
    'private.brand_month_published(uuid, date)',
    'private.session_month_published(uuid)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Viết lại mọi policy đang trỏ 5 hàm đó, đọc từ `pg_policies`
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  f text;
  q text;
  w text;
  stmt text;
  touched int := 0;
  fns text[] := array[
    'session_brand_id', 'session_month_published', 'snapshot_session_id',
    'month_plan_brand_id', 'brand_month_published'
  ];
begin
  for r in
    select tablename, policyname, permissive, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') ~ '(session_brand_id|session_month_published|snapshot_session_id|month_plan_brand_id|brand_month_published)\s*\('
         or coalesce(with_check, '') ~ '(session_brand_id|session_month_published|snapshot_session_id|month_plan_brand_id|brand_month_published)\s*\(')
     order by tablename, policyname
  loop
    q := r.qual;
    w := r.with_check;
    foreach f in array fns loop
      -- Chuẩn hoá trước (bỏ tiền tố nào đang có) rồi mới gắn `private.` — nhờ vậy chạy lại lần hai
      -- không ra `private.private.`. pg_get_expr lược bỏ tiền tố schema khi hàm nhìn thấy được trên
      -- search_path của phiên, nên phải lo cả hai dạng.
      q := replace(replace(replace(q, 'private.' || f || '(', f || '('), 'public.' || f || '(', f || '('), f || '(', 'private.' || f || '(');
      if w is not null then
        w := replace(replace(replace(w, 'private.' || f || '(', f || '('), 'public.' || f || '(', f || '('), f || '(', 'private.' || f || '(');
      end if;
    end loop;

    if q is not distinct from r.qual and w is not distinct from r.with_check then
      raise notice '0128: %.% — đã trỏ private rồi, bỏ qua', r.tablename, r.policyname;
      continue;
    end if;

    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    stmt := format('create policy %I on public.%I as %s for %s to %s',
                   r.policyname, r.tablename, r.permissive, r.cmd,
                   (select string_agg(quote_ident(x), ', ') from unnest(r.roles) x));
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
    execute stmt;
    touched := touched + 1;
    raise notice '0128: viết lại %.%', r.tablename, r.policyname;
  end loop;

  raise notice '0128: đã viết lại % policy', touched;
  -- Đo trên replay cả chuỗi: đúng 4 policy (session_skus_read_published gọi 2 hàm nên 5 hàm nằm
  -- trên 4 policy). KHÔNG assert đúng bằng 4 — dự án này đã 2 lần bị sửa tay trên production nên
  -- production có thể nhiều/ít hơn repo một cách hợp lệ. Chỉ chặn trường hợp 0: nghĩa là không khớp
  -- gì cả, lúc đó drop hàm là làm vỡ policy thật.
  if touched = 0 then
    raise exception '0128 DỪNG: không viết lại được policy nào (replay repo cho 4). Không khớp gì — đọc lại trước khi drop hàm.'
      using errcode = 'data_exception';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Viết lại view nào gọi 5 hàm đó — cũng đọc từ catalog, không chép tay
-- ---------------------------------------------------------------------------
-- Hôm nay chỉ có `live_sessions_secure` gọi `brand_month_published` (đúng 1 chỗ trong thân). Vẫn
-- viết thành vòng lặp đọc `pg_depend` thay vì sửa tay đúng một view: thân view đó dài ~150 dòng và
-- là đường đọc ca của brand — chép lại bằng tay là đúng loại rủi ro không đáng nhận, mà
-- `create or replace view` thì giữ nguyên mọi grant đã cấp.
do $$
declare
  r record;
  f text;
  def text;
  newdef text;
  touched int := 0;
  fns text[] := array[
    'session_brand_id', 'session_month_published', 'snapshot_session_id',
    'month_plan_brand_id', 'brand_month_published'
  ];
  refs oid[] := array[
    'public.session_brand_id(uuid)'::regprocedure,
    'public.session_month_published(uuid)'::regprocedure,
    'public.snapshot_session_id(uuid)'::regprocedure,
    'public.month_plan_brand_id(uuid)'::regprocedure,
    'public.brand_month_published(uuid, date)'::regprocedure
  ];
begin
  for r in
    select distinct c.oid, c.relname, c.relkind
      from pg_depend d
      join pg_rewrite rw on rw.oid = d.objid and d.classid = 'pg_rewrite'::regclass
      join pg_class c on c.oid = rw.ev_class
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where d.deptype = 'n' and d.refobjid = any(refs)
     order by c.relname
  loop
    -- `create or replace view` không dùng được cho materialized view. Hôm nay không có cái nào,
    -- nên dừng hẳn thay vì đoán — người làm tiếp sẽ thấy đúng lý do.
    if r.relkind <> 'v' then
      raise exception '0128 DỪNG: % là relkind % (không phải view thường), phải xử lý riêng.', r.relname, r.relkind
        using errcode = 'data_exception';
    end if;

    def := regexp_replace(pg_get_viewdef(r.oid, true), ';\s*$', '');
    newdef := def;
    foreach f in array fns loop
      newdef := replace(replace(replace(newdef, 'private.' || f || '(', f || '('), 'public.' || f || '(', f || '('), f || '(', 'private.' || f || '(');
    end loop;
    if newdef = def then
      raise notice '0128: view % — đã trỏ private rồi, bỏ qua', r.relname;
      continue;
    end if;
    -- `create or replace view` đòi y nguyên danh sách cột (tên, kiểu, thứ tự). Ở đây chỉ đổi một lời
    -- gọi hàm bên trong biểu thức nên danh sách cột không đổi — và nếu đổi thì lệnh này từ chối.
    execute format('create or replace view public.%I as %s', r.relname, newdef);
    touched := touched + 1;
    raise notice '0128: viết lại view %', r.relname;
  end loop;
  raise notice '0128: đã viết lại % view', touched;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Bỏ bản ở `public` — KHÔNG `cascade`, đây chính là chốt an toàn
-- ---------------------------------------------------------------------------
-- Còn sót một policy (hay một view, một hàm khác) phụ thuộc thì lệnh này VỠ và cả migration dừng,
-- không xoá gì.
--
-- Chốt này ĐÃ CỨU đúng một lần khi dựng migration: bản nháp đầu không có mục (3) bên trên và ghi
-- trong comment "0 view nào gọi 5 hàm này" — sai, do regex quét view của tôi dừng ở dấu `;` đầu
-- tiên nên cắt mất thân view. Replay vỡ ngay tại `drop function public.brand_month_published` với
-- "cannot drop ... because other objects depend on it", và `pg_depend` chỉ ra `live_sessions_secure`.
-- Nếu lúc đó tôi viết `cascade` cho nhanh thì view đó đã bị xoá âm thầm — view mà chính 0109 cấp
-- `grant select ... to authenticated`, tức màn Sổ Ca của brand sẽ trắng.
drop function public.session_brand_id(uuid);
drop function public.session_month_published(uuid);
drop function public.snapshot_session_id(uuid);
drop function public.month_plan_brand_id(uuid);
drop function public.brand_month_published(uuid, date);
