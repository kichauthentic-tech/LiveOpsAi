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

// Ba hàm helper `language sql` được MIỄN có chủ ý — pin search_path chặn Postgres inline chúng, mà
// cả ba bị gọi trong hàng chục policy RLS. Lý do đầy đủ ghi ở cuối 0125. Muốn bỏ miễn thì phải kèm
// số đo trước/sau, đừng xoá tên khỏi đây cho xanh test.
const SEARCH_PATH_EXEMPT = new Set(["current_user_role", "current_user_brand_id", "session_brand_id"]);

test("mọi hàm SECURITY DEFINER còn sống đều pin search_path (lớp lỗ 0063)", () => {
  const bad = DEFINERS.filter(
    (f) => !/set\s+search_path/i.test(f.body) && !PINNED.has(f.name) && !SEARCH_PATH_EXEMPT.has(f.name)
  ).map((f) => `${f.name} (${f.file})`);
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
