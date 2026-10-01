-- 0129 — BỌC 3 HÀM HELPER RLS TRONG `(select ...)` Ở MỌI POLICY.
-- (Đo được 2026-10-01 trong lúc dựng 0127 — xem P2a-14/P2a-16.)
--
-- ✅ ĐÃ CHẠY trên production 2026-10-01.
--    Verify đạt được: schema không đổi (48 bảng/view · 35 RPC, 17 bảng có policy bị viết lại còn đủ
--    cả 17, 3 view không đụng tới còn nguyên). PostgREST KHÔNG lộ thân policy, nên "46 policy đã bọc
--    đúng" KHÔNG kiểm được từ xa — bằng chứng là phép replay trên Postgres cô lập làm TRƯỚC khi chạy:
--    ảnh 82 policy trước/sau, chuẩn hoá bỏ bọc hai bên ⇒ giống nhau tuyệt đối, đúng 46/82 dòng đổi.
--    Mức lợi hiệu năng trên production cũng KHÔNG đo lại được: cần đăng nhập bằng tài khoản brand thật,
--    và vế "trước" thì đã mất khi migration chạy.
--
-- ============================================================================
-- VẤN ĐỀ: HÀM TRONG POLICY ĐƯỢC GỌI LẠI MỖI DÒNG
-- ============================================================================
-- Policy viết `using (current_user_role() in (...))` thì Postgres gọi hàm MỘT LẦN CHO MỖI DÒNG đi
-- qua filter. Bọc thành `using ((select current_user_role()) in (...))` thì nó thành subquery vô
-- hướng KHÔNG tham chiếu dòng nào, nên planner hạ xuống InitPlan — gọi ĐÚNG MỘT LẦN cho cả truy vấn.
--
-- Không phải mẹo nhỏ: ba hàm này mỗi lượt gọi là một lượt ĐỌC BẢNG `profiles`
-- (`select role from profiles where id = auth.uid()`).
--
-- ĐO TRÊN POSTGRES 18.4 CÔ LẬP (bản sao 50.000 dòng, truy vấn đọc 4.676 dòng, 5 lượt mỗi bên,
-- cache đã nóng) — số này là lý do có migration:
--
--     không bọc : 6,93 – 7,06 ms  · Bitmap Heap Scan · buffers 9.561 · 209 heap block
--     có bọc    : 0,66 – 0,72 ms  · Index Only Scan  · buffers    77 · 0 heap fetch
--                 ⇒ nhanh ~10× , ít hơn ~124× số buffer
--
-- Đáng chú ý là kế hoạch ĐỔI HẲN LOẠI, không chỉ nhanh hơn: gọi hàm theo dòng buộc executor phải
-- chạm heap để lấy cột cho filter, nên index-only scan không dùng được. Bọc xong thì dùng được.
--
-- ============================================================================
-- VÌ SAO AN TOÀN VỀ MẶT NGỮ NGHĨA
-- ============================================================================
-- `(select f())` tương đương `f()` khi f KHÔNG nhận tham số và là STABLE: STABLE nghĩa là trong cùng
-- một câu lệnh, f luôn trả cùng một giá trị. Đã kiểm trên replay cả chuỗi, `pg_proc`:
--
--     current_user_role       STABLE · security definer
--     current_user_brand_id   STABLE · security definer
--     current_user_talent_id  STABLE · security definer
--
-- ============================================================================
-- PHẠM VI: ĐÚNG 3 HÀM ĐÓ — KHÔNG BỌC `auth.uid()` / `auth.role()`
-- ============================================================================
-- Hai hàm `auth.*` cũng gọi theo dòng (7 + 2 lượt chưa bọc), và bọc chúng sẽ nâng số policy phải
-- sửa từ 46 lên 54. CỐ Ý KHÔNG làm, hai lý do:
--   • Chúng là hàm của SUPABASE, định nghĩa KHÔNG nằm trong repo này. Volatility của chúng trên
--     production tôi không đọc được (shim trong harness là bản tôi tự viết, không phải bản thật) —
--     mà lập luận an toàn ở trên dựa HẲN vào STABLE. Không sửa thứ mình không kiểm được.
--   • Chúng đọc một GUC của phiên (`current_setting`), rẻ hơn hẳn một lượt đọc bảng `profiles`.
--     Toàn bộ phần lợi đo được ở trên đến từ việc bỏ lượt đọc bảng.
-- Muốn làm thì làm riêng, sau khi đọc được `pg_proc` của schema `auth` trên production.
--
-- KHÔNG đụng VIEW: đã kiểm, cả 3 view có gọi helper (`live_sessions_secure` 16 lượt,
-- `talents_secure` 8, `brand_commitment_progress` 4) đều ĐÃ bọc sẵn — 0 lượt chưa bọc.
--
-- ============================================================================
-- CÁCH VIẾT LẠI: ĐỌC `pg_policies`, KHÔNG CHÉP TAY (cùng khuôn 0128)
-- ============================================================================
-- 73/82 policy có gọi 3 hàm này. Chép tay hàng chục policy phân quyền là đúng loại việc không nên
-- làm bằng tay: sai một dấu ngoặc là một lỗ, không phải một lỗi cú pháp. Nên vòng lặp đọc biểu thức
-- ĐANG CHẠY rồi chỉ thay đúng lời gọi hàm, giữ nguyên permissive/cmd/roles/phần còn lại.
--
-- Idempotent theo đúng cách 0128 đã dùng: MỞ mọi bọc đang có trước, rồi bọc lại một lần. Nhờ vậy
-- chạy hai lần không ra `(select (select ...))`. `pg_get_expr` render bọc sẵn thành
-- `( SELECT current_user_role() AS current_user_role)` nên bước mở phải nhận cả dạng CÓ alias lẫn
-- KHÔNG alias.
--
-- Và policy đã bọc đúng sẵn thì KHÔNG đụng tới — xác định bằng cách bỏ hết bọc ra khỏi một bản sao
-- rồi xem còn lời gọi trần nào không. Bản nháp đầu thiếu bước này nên drop/tạo lại cả 73 policy, kể
-- cả những cái vốn đã đúng: ngữ nghĩa không đổi, nhưng đó là rủi ro cho không.
--
-- Không có `drop function` nào ở đây nên không có chốt an toàn kiểu 0128. Thay vào đó phép kiểm là
-- so ảnh policy trước/sau: chuẩn hoá bỏ bọc ở cả hai bên thì phải GIỐNG NHAU TUYỆT ĐỐI — xem
-- P2a-16 trong WORKSPACE_DESIGN.md để biết kết quả.
-- ============================================================================

do $$
declare
  r record;
  f text;
  esc text;
  q text;
  w text;
  probe text;
  stmt text;
  touched int := 0;
  skipped int := 0;
  fns text[] := array['current_user_role', 'current_user_brand_id', 'current_user_talent_id'];
begin
  for r in
    select tablename, policyname, permissive, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
           ~* '(current_user_role|current_user_brand_id|current_user_talent_id)\s*\(\s*\)'
     order by tablename, policyname
  loop
    q := r.qual;
    w := r.with_check;

    -- Chỉ đụng policy CÒN lượt gọi TRẦN. Cách xác định: bỏ hết các bọc đang có ra khỏi bản sao, rồi
    -- xem còn lời gọi nào không. Thiếu bước này thì policy đã bọc đúng sẵn cũng bị drop/tạo lại —
    -- văn bản sau khi mình chuẩn hoá khác văn bản `pg_get_expr` render ra (`(select f())` so với
    -- `( SELECT f() AS f)`), nên so chuỗi thấy "khác" dù ngữ nghĩa y nguyên. Đo trên replay: 73
    -- policy có gọi helper, nhưng không phải cả 73 cái đều cần sửa — drop/tạo lại policy phân quyền
    -- không cần thiết là rủi ro cho không.
    probe := coalesce(q, '') || ' ' || coalesce(w, '');
    foreach f in array fns loop
      probe := regexp_replace(probe, '\(\s*select\s+' || f || '\s*\(\s*\)(\s+as\s+[a-z0-9_]+)?\s*\)', '', 'gi');
    end loop;
    if probe !~* '(current_user_role|current_user_brand_id|current_user_talent_id)\s*\(\s*\)' then
      skipped := skipped + 1;
      continue;
    end if;

    foreach f in array fns loop
      esc := f;  -- 3 tên này không có ký tự đặc biệt của regex; để biến riêng cho dễ đọc
      -- (1) MỞ bọc đang có — cả dạng có alias (`( SELECT f() AS f)`) lẫn không alias.
      q := regexp_replace(q, '\(\s*select\s+' || esc || '\s*\(\s*\)(\s+as\s+[a-z0-9_]+)?\s*\)', f || '()', 'gi');
      -- (2) BỌC lại đúng một lần.
      q := regexp_replace(q, esc || '\s*\(\s*\)', '(select ' || f || '())', 'gi');
      if w is not null then
        w := regexp_replace(w, '\(\s*select\s+' || esc || '\s*\(\s*\)(\s+as\s+[a-z0-9_]+)?\s*\)', f || '()', 'gi');
        w := regexp_replace(w, esc || '\s*\(\s*\)', '(select ' || f || '())', 'gi');
      end if;
    end loop;

    if q is not distinct from r.qual and w is not distinct from r.with_check then
      skipped := skipped + 1;
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
  end loop;

  raise notice '0129: bọc lại % policy, bỏ qua % policy (đã bọc sẵn)', touched, skipped;

  -- KHÔNG assert một con số cố định: dự án đã 2 lần bị sửa tay trên production nên số thật có thể
  -- lệch so với replay một cách hợp lệ. Chỉ chặn trường hợp 0 — nghĩa là không khớp gì cả, mà im
  -- lặng "thành công" khi không làm gì là kiểu thất bại tệ nhất (đã dính một lần phiên này: vòng
  -- lặp replay in "✔ KHÔNG lỗi" trong khi psql không hề chạy).
  -- Phân biệt "không có gì phải làm" với "không khớp gì cả": chạy lại lần hai thì touched = 0 nhưng
  -- skipped > 0 — đó là no-op đúng, không phải lỗi. Chỉ cả hai = 0 mới là không khớp gì.
  if touched = 0 and skipped = 0 then
    raise exception '0129 DỪNG: không tìm thấy policy nào gọi 3 helper. Không khớp gì — đọc lại trước khi coi là xong.'
      using errcode = 'data_exception';
  end if;
  if touched = 0 then
    raise notice '0129: không có gì phải bọc — mọi policy đã bọc sẵn (chạy lại lần hai thì đây là kết quả đúng).';
  end if;
end $$;

-- Chốt lại: sau migration này KHÔNG policy nào còn gọi 3 hàm đó mà chưa bọc.
do $$
declare n int;
begin
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
         ~* '(?<!select )(current_user_role|current_user_brand_id|current_user_talent_id)\s*\(\s*\)';
  if n > 0 then
    raise exception '0129 DỪNG: còn % policy gọi helper chưa bọc sau khi đã viết lại — vòng lặp bỏ sót.', n
      using errcode = 'data_exception';
  end if;
  raise notice '0129: xác nhận 0 policy nào còn gọi helper chưa bọc.';
end $$;
