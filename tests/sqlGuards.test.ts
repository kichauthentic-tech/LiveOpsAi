// Cổng canh SQL (dựng 2026-10-01). Dự án này đã ba lần dính CÙNG hai lớp lỗi, mỗi lần vá tay từng
// hàm/policy một rồi lần sau lại sót:
//   • 0063 — `security definer` thiếu `set search_path` (pin đúng 4 hàm, không phải quét hết).
//   • 0111/0112 — guard so role kiểu `x not in (...)` không `coalesce`: role NULL cho ra NULL, `if`
//     không chạy, nhánh raise bị bỏ qua ⇒ đi lọt. 0112 vá 11 policy, 0114 vá `publish_...` và GHI RÕ
//     lỗi trong comment — nhưng hàm anh em `unpublish_...` cùng file 0051 thì không ai đụng suốt 74
//     migration, tới 0125 mới vá.
// Hai test dưới đây quét TOÀN BỘ migration nên lần sau thêm hàm mới là đỏ ngay, không chờ ai nhớ.
//
// Lưu ý khi đọc kết quả: test đọc CHUỖI MIGRATION trong repo, không đọc DB thật. Hai thứ có thể lệch
// (dự án đã có 2 sự cố sửa tay thẳng trên production — xem "Sự cố vận hành đáng nhớ" trong
// WORKSPACE_DESIGN.md), nên xanh ở đây nghĩa là "chuỗi migration sạch", không phải "production sạch".
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const DIR = join(__dirname, "..", "supabase", "migrations");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

interface Fn {
  name: string;
  file: string;
  body: string;
}

// Định nghĩa HIỆN HÀNH của một hàm = lần `create [or replace] function` CUỐI CÙNG theo thứ tự
// migration. Phải bắt TRỌN câu lệnh (tới dấu `;` sau khi đóng `$$`) vì thuộc tính `security definer`
// / `set search_path` có thể đứng TRƯỚC hoặc SAU thân hàm — 0051 đặt ở cuối.
function currentFunctions(): Map<string, Fn> {
  const out = new Map<string, Fn>();
  const re = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(.*?(\$\$|\$function\$).*?\2[^;]*;/gis;
  for (const file of FILES) {
    const sql = readFileSync(join(DIR, file), "utf8");
    for (const m of sql.matchAll(re)) out.set(m[1], { name: m[1], file, body: m[0] });
  }
  return out;
}

// `drop function f(...)` ở migration sau ⇒ hàm đã chết, không cần canh nữa.
function droppedFunctions(): Set<string> {
  const out = new Set<string>();
  for (const file of FILES) {
    const sql = readFileSync(join(DIR, file), "utf8");
    for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)) out.add(m[1]);
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi)) out.delete(m[1]);
  }
  return out;
}

function pinnedByAlter(): Set<string> {
  const out = new Set<string>();
  for (const file of FILES) {
    const sql = readFileSync(join(DIR, file), "utf8");
    for (const m of sql.matchAll(/alter\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)[^;]*set\s+search_path/gis)) out.add(m[1]);
  }
  return out;
}

const FNS = currentFunctions();
const DROPPED = droppedFunctions();
const PINNED = pinnedByAlter();
const LIVE = [...FNS.values()].filter((f) => !DROPPED.has(f.name));
const DEFINERS = LIVE.filter((f) => /security\s+definer/i.test(f.body));

test("có đọc được migration và nhận ra hàm security definer (canh chính test này)", () => {
  expect(FILES.length).toBeGreaterThan(100);
  expect(DEFINERS.length).toBeGreaterThan(20);
});

// KHÔNG CÒN DANH SÁCH MIỄN. 0125 miễn 3 hàm `current_user_role`/`current_user_brand_id`/
// `session_brand_id` với lý do "pin search_path chặn Postgres inline chúng, mà cả ba bị gọi trong
// hàng chục policy RLS" — lý do đó SAI và 0127 đã bác bằng số đo: cả ba là `security definer`, mà
// `security definer` TỰ NÓ đã chặn inline rồi, nên pin không làm mất gì. Đo trên Postgres 18.4 cô
// lập: hàm `language sql stable` chỉ-secdef KHÔNG được inline y như hàm chỉ-có-SET; và kế hoạch của
// cùng một truy vấn dưới RLS giống nhau từng dòng trước/sau khi pin. Chi tiết ở đầu file 0127.
//
// Thêm hàm `security definer` mới mà không pin thì test này đỏ — không có cửa xin miễn nữa.
test("mọi hàm SECURITY DEFINER còn sống đều pin search_path (lớp lỗ 0063)", () => {
  const bad = DEFINERS.filter((f) => !/set\s+search_path/i.test(f.body) && !PINNED.has(f.name)).map(
    (f) => `${f.name} (${f.file})`
  );
  expect(bad).toEqual([]);
});

test("guard so role trong hàm SECURITY DEFINER phải coalesce — role NULL không được đi lọt (lớp lỗ 0111/0112)", () => {
  // `current_user_role()` trả NULL khi auth user KHÔNG có dòng `profiles` (cột `role` là not null,
  // nên NULL = không có hồ sơ). `NULL not in (...)` = NULL ⇒ `if` không chạy ⇒ raise bị bỏ qua ⇒
  // phần thân definer chạy tiếp, vượt cả RLS.
  //
  // CHỈ so sánh PHỦ ĐỊNH mới nguy hiểm, và đây là chỗ bản nháp đầu của test này báo nhầm:
  //   • `if v_role not in (...) then raise`  → NULL ⇒ KHÔNG raise ⇒ đi lọt.  ← phải bắt
  //   • `if v_role = 'talent' then raise`    → NULL ⇒ không vào nhánh ⇒ rơi xuống nhánh sau, không
  //     bỏ qua việc kiểm quyền nào cả.                                        ← KHÔNG được báo
  // `submit_live_session_report` (0084) đúng là dạng thứ hai: nhánh đầu `= 'talent'`, nhánh `elsif`
  // mới là chỗ chặn và nó đã `coalesce` sẵn (file còn ghi hẳn lý do trong comment).
  const NEGATED = /\bnot\s+in\b|<>|!=|\bnot\s*\(/i;
  const bad: string[] = [];
  for (const f of DEFINERS) {
    for (const m of f.body.matchAll(/\b(?:if|elsif)\b(.*?)\bthen\b/gis)) {
      const cond = m[1].replace(/\s+/g, " ").trim();
      if (cond.length > 160) continue;
      if (!/current_user_role\s*\(|[a-z0-9_]*_role\b/i.test(cond)) continue;
      if (!NEGATED.test(cond)) continue;
      const tail = f.body.slice(m.index! + m[0].length, m.index! + m[0].length + 200);
      if (!/raise\s+exception/i.test(tail)) continue;
      if (/coalesce|is\s+null|is\s+not\s+null/i.test(cond)) continue;
      bad.push(`${f.name} (${f.file}): if ${cond.slice(0, 90)} then → raise`);
    }
  }
  expect(bad).toEqual([]);
});

test("publish và unpublish report dùng CÙNG một khuôn guard", () => {
  // Hai hàm anh em sinh ra cùng lúc ở 0051. Lệch khuôn một lần nữa là lặp lại đúng lỗi 2026-10-01.
  const pub = FNS.get("publish_brand_monthly_report");
  const unpub = FNS.get("unpublish_brand_monthly_report");
  expect(pub, "không tìm thấy publish_brand_monthly_report").toBeTruthy();
  expect(unpub, "không tìm thấy unpublish_brand_monthly_report").toBeTruthy();
  const guard = /coalesce\(\s*current_user_role\(\)::text\s*,\s*''\s*\)\s*not\s+in\s*\(\s*'ceo'\s*,\s*'admin'\s*,\s*'operations'\s*\)/i;
  expect(guard.test(pub!.body)).toBe(true);
  expect(guard.test(unpub!.body)).toBe(true);
});

// ---------------------------------------------------------------------------
// Helper của policy phải ở schema KHÔNG expose
// ---------------------------------------------------------------------------
// 0128: PostgREST lộ MỌI hàm trong `public` thành `/rpc/<tên>`. Năm hàm dưới đây là `security
// definer`, KHÔNG có guard role (guard là việc của policy gọi chúng), và nhận ID dòng của NGƯỜI
// KHÁC — nên khi còn ở `public` thì bất kỳ tài khoản đã đăng nhập cũng gọi được để đọc vượt RLS.
// Không vá được bằng `revoke`: policy gọi hàm thì chính người truy vấn phải có EXECUTE. Nên chúng
// đã chuyển sang `private`, và test này chặn việc dựng lại ở `public`.
const PRIVATE_ONLY_HELPERS = [
  "session_brand_id",
  "session_month_published",
  "snapshot_session_id",
  "month_plan_brand_id",
  "brand_month_published"
];

test("helper của policy không được dựng lại ở schema public (lỗ /rpc/ của 0128)", () => {
  const bad: string[] = [];
  for (const file of FILES) {
    if (file.startsWith("0128_")) continue; // chính nó drop bản public
    const sql = readFileSync(join(DIR, file), "utf8");
    for (const h of PRIVATE_ONLY_HELPERS) {
      // Chỉ bắt `create function <tên>` KHÔNG có tiền tố schema, hoặc có `public.` tường minh.
      const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${h}\\s*\\(`, "gi");
      for (const m of sql.matchAll(re)) {
        // Bản `private.` là bản đúng — regex trên đã loại nó vì `private.` không khớp `(?:public\.)?`
        // ngay trước tên, nhưng vẫn kiểm lại cho chắc.
        if (/private\.\s*$/i.test(sql.slice(Math.max(0, m.index! - 9), m.index! + m[0].indexOf(h)))) continue;
        bad.push(`${h} (${file})`);
      }
    }
  }
  // 0128 là migration CUỐI tạo chúng; mọi lần tạo trước đó đều ở `public` và đã bị 0128 drop — nên
  // test này không soi quá khứ, nó soi migration MỚI. Chốt bằng cách chỉ xét file > 0128.
  const afterMove = bad.filter((b) => {
    const f = b.slice(b.indexOf("(") + 1, -1);
    return f.localeCompare("0128_") > 0;
  });
  expect(afterMove).toEqual([]);
});

/** Bỏ comment SQL — khẳng định về LỆNH phải đọc lệnh, không đọc phần văn xuôi giải thích quanh nó
 *  (bản nháp đầu của test dưới đây báo đỏ vì khớp đúng vào một đoạn comment nói về grant/anon). */
function sqlOnly(src: string): string {
  return src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

test("0128 có drop bản public của cả 5 helper, và không dùng CASCADE", () => {
  const sql = sqlOnly(readFileSync(join(DIR, FILES.find((f) => f.startsWith("0128_"))!), "utf8"));
  for (const h of PRIVATE_ONLY_HELPERS) {
    expect(sql, `0128 phải tạo private.${h}`).toMatch(new RegExp(`create\\s+or\\s+replace\\s+function\\s+private\\.${h}\\s*\\(`, "i"));
    expect(sql, `0128 phải drop public.${h}`).toMatch(new RegExp(`drop\\s+function\\s+public\\.${h}\\s*\\(`, "i"));
  }
  // `cascade` ở đây sẽ âm thầm kéo theo policy/view phụ thuộc — chính thứ đã cứu lúc dựng migration
  // (view live_sessions_secure). Drop trần là chốt an toàn, đừng "sửa" cho nó chạy được.
  expect(/drop\s+function[^;]*cascade/i.test(sql), "drop function không được dùng CASCADE").toBe(false);
  expect(sql, "phải cấp usage schema private cho authenticated").toMatch(/grant\s+usage\s+on\s+schema\s+private\s+to[^;]*authenticated/i);
  expect(/grant[^;]*\bprivate\b[^;]*\banon\b/i.test(sql), "không được cấp gì cho anon").toBe(false);
});
