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

// ---------------------------------------------------------------------------
// Helper không tham số trong policy phải bọc `(select ...)`
// ---------------------------------------------------------------------------
// 0129: `using (current_user_role() in (...))` gọi hàm MỖI DÒNG; bọc `(select ...)` thì planner hạ
// xuống InitPlan, gọi đúng 1 lần. Đo trên Postgres 18.4 cô lập, 20.000 ca / 60.000 SKU:
//   • policy chỉ dùng helper không tham số (live_sessions): 62,3ms → 2,4ms · 20.609 → 756 buffer;
//   • policy còn gọi hàm NHẬN CỘT (session_skus): 606ms → 407ms — phần còn lại là 2 hàm
//     `private.session_brand_id(session_id)` / `session_month_published(session_id)`, vốn KHÔNG
//     hoist được vì phụ thuộc dòng.
// An toàn vì cả 3 hàm là STABLE + không tham số ⇒ `(select f())` ≡ `f()` trong cùng một câu lệnh.
const WRAP_IN_POLICY = ["current_user_role", "current_user_brand_id", "current_user_talent_id"];

test("migration sau 0129 không được viết policy gọi helper mà chưa bọc (select ...)", () => {
  const bad: string[] = [];
  for (const file of FILES) {
    if (file.localeCompare("0129_") <= 0) continue; // trước 0129 là lịch sử, chính 0129 đi vá
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    for (const m of sql.matchAll(/create\s+policy/gi)) {
      const chunk = sql.slice(m.index!, m.index! + 1200);
      for (const h of WRAP_IN_POLICY) {
        const calls = [...chunk.matchAll(new RegExp(`${h}\\s*\\(\\s*\\)`, "gi"))];
        for (const c of calls) {
          const before = chunk.slice(Math.max(0, c.index! - 20), c.index!);
          if (/\(\s*select\s+$/i.test(before)) continue;
          bad.push(`${file}: ${h}() chưa bọc trong create policy`);
        }
      }
    }
  }
  expect(bad).toEqual([]);
});

test("0129 idempotent và có chốt tự kiểm", () => {
  const sql = readFileSync(join(DIR, FILES.find((f) => f.startsWith("0129_"))!), "utf8");
  // MỞ bọc trước rồi bọc lại — thiếu bước mở thì chạy lần hai ra `(select (select ...))`.
  expect(sql, "phải MỞ bọc đang có trước khi bọc lại").toMatch(/regexp_replace\([^)]*'\\\(\\s\*select/i);
  // Không được coi "không làm gì" là thành công khi thật ra không khớp gì cả.
  expect(sql, "phải phân biệt no-op với không-khớp-gì").toContain("touched = 0 and skipped = 0");
  // Chốt cuối: sau khi viết lại thì không còn lượt gọi trần nào.
  expect(sql, "phải tự kiểm 0 policy còn gọi trần").toMatch(/raise\s+exception\s+'0129 DỪNG: còn %/i);
  // Policy đã bọc đúng sẵn thì không drop/tạo lại — drop/tạo policy phân quyền không cần thiết là rủi ro cho không.
  expect(sql, "phải bỏ qua policy đã bọc sẵn").toContain("skipped := skipped + 1");
});

// ---------------------------------------------------------------------------
// Hàm gọi được qua /rpc/ phải có hàng rào cho người KHÔNG đăng nhập
// ---------------------------------------------------------------------------
// 0130. PostgREST biến MỌI hàm trong `public` thành `/rpc/<tên>`, và `create function` của Postgres
// tự cấp EXECUTE cho **PUBLIC** — mà `anon` thừa hưởng quyền của PUBLIC. 0109 chỉ
// `revoke ... from anon` (thu hồi quyền cấp RIÊNG cho anon) nên nó đóng được đường đọc BẢNG, KHÔNG
// đóng đường gọi HÀM. Repo vẫn đúng ở 15 hàm nhờ `revoke ... from public` viết tay từng hàm — và
// đúng kiểu lỗi đó, `session_boundary_at(uuid)` bị sót suốt từ 0078 tới 0130.
//
// Test này quét thay vì chờ ai nhớ. Một hàm `security definer` gọi được qua /rpc/ chỉ hợp lệ khi:
//   (a) đã `revoke ... from public` — không ai ngoài owner gọi được; HOẶC
//   (b) tự `raise exception` dựa trên danh tính người gọi (role / talent id / helper can_edit_*),
//       nên phiên không có hồ sơ (role NULL) bị chặn ngay ở dòng đầu; HOẶC
//   (c) nằm trong danh sách dưới — an toàn do CẤU TRÚC, kèm lý do.
// Hàm `returns trigger` không tính: Postgres từ chối gọi trực tiếp ("can only be called as trigger").
function publicFunctions(): Map<string, { file: string; body: string; definer: boolean; trigger: boolean }> {
  // Tự đọc lại thay vì dùng currentFunctions(): ở đây phải xử lý ĐÚNG THỨ TỰ câu lệnh trong một
  // file (rất nhiều migration `drop` rồi `create` lại cùng hàm ngay bên dưới), và phải loại hàm
  // schema `private`.
  const out = new Map<string, { file: string; body: string; definer: boolean; trigger: boolean }>();
  for (const file of FILES) {
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    const ev: { at: number; kind: "c" | "d"; schema: string; name: string; body?: string }[] = [];
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(private\.|public\.)?([a-z0-9_]+)\s*\(/gi)) {
      const dq = sql.slice(m.index!).match(/(\$\$|\$function\$|\$body\$)/);
      let end: number;
      if (dq) {
        const open = m.index! + dq.index! + dq[1].length;
        const close = sql.indexOf(dq[1], open);
        end = sql.indexOf(";", close < 0 ? open : close + dq[1].length);
      } else end = sql.indexOf(";", m.index!);
      ev.push({ at: m.index!, kind: "c", schema: (m[1] ?? "public.").slice(0, -1), name: m[2], body: sql.slice(m.index!, (end < 0 ? m.index! + 4000 : end) + 1) });
    }
    for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?(private\.|public\.)?([a-z0-9_]+)/gi))
      ev.push({ at: m.index!, kind: "d", schema: (m[1] ?? "public.").slice(0, -1), name: m[2] });
    ev.sort((a, b) => a.at - b.at);
    for (const e of ev) {
      if (e.schema !== "public") continue;
      if (e.kind === "d") out.delete(e.name);
      else out.set(e.name, { file, body: e.body!, definer: /security\s+definer/i.test(e.body!), trigger: /returns\s+trigger/i.test(e.body!) });
    }
  }
  return out;
}

function revokedFromPublic(): Set<string> {
  const out = new Set<string>();
  for (const file of FILES) {
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    for (const m of sql.matchAll(/revoke\s+(?:all|execute)[^;]*?\bon\s+function\s+(?:public\.)?([a-z0-9_]+)[^;]*?\bfrom\s+([^;]*);/gi))
      if (/\bpublic\b/i.test(m[2])) out.add(m[1]);
  }
  return out;
}

/** An toàn do cấu trúc, KHÔNG phải do quên. Thêm tên vào đây thì phải ghi lý do đo được. */
const RPC_SAFE_BY_SHAPE: Record<string, string> = {
  // Đọc hồ sơ của CHÍNH auth.uid(); phiên vô danh ⇒ auth.uid() null ⇒ trả NULL. Không revoke được:
  // policy RLS gọi chúng, mà policy chạy dưới quyền người truy vấn (lý do dài ở đầu 0128).
  current_user_role: "chỉ đọc profiles của auth.uid(); anon ⇒ NULL. Policy cần EXECUTE nên không revoke.",
  current_user_brand_id: "như current_user_role.",
  // Trả boolean về quan hệ của CHÍNH người gọi với ca; anon ⇒ false. Không rò dữ liệu ca nào.
  can_edit_session_snapshot: "trả boolean quyền của chính người gọi; anon ⇒ false."
};

test("mọi hàm /rpc/ security definer đều có hàng rào cho phiên KHÔNG đăng nhập (lớp lỗ 0130)", () => {
  const FNS_PUB = publicFunctions();
  const REVOKED = revokedFromPublic();
  const callable = [...FNS_PUB.entries()].filter(([, f]) => f.definer && !f.trigger);
  // Canh chính test: phải thực sự nhận ra được tập hàm, không phải xanh vì quét ra rỗng.
  expect(callable.length).toBeGreaterThan(20);

  const bad: string[] = [];
  for (const [name, f] of callable) {
    if (REVOKED.has(name)) continue;
    if (name in RPC_SAFE_BY_SHAPE) continue;
    // Guard tự thân HOẶC uỷ quyền: phải có `raise exception` và một phép kiểm danh tính người gọi.
    const guards = /raise\s+exception/i.test(f.body) && /current_user_role|current_user_talent_id|can_edit_session_snapshot/i.test(f.body);
    if (guards) continue;
    bad.push(`${name} (${f.file})`);
  }
  expect(bad).toEqual([]);
});

test("0130 đóng session_boundary_at và không grant lại cho ai", () => {
  const f = FILES.find((x) => x.startsWith("0130_"));
  expect(f, "thiếu migration 0130").toBeTruthy();
  const sql = sqlOnly(readFileSync(join(DIR, f!), "utf8"));
  expect(sql).toMatch(/revoke\s+all\s+on\s+function\s+session_boundary_at\(uuid\)\s+from\s+public,\s*anon,\s*authenticated/i);
  expect(/grant[^;]*session_boundary_at/i.test(sql), "0130 không được grant lại").toBe(false);
  // Hàng rào tự kiểm: migration phải tự báo đỏ chứ không để người đọc tin comment.
  expect(sql).toMatch(/raise\s+exception\s+'0130 DỪNG/);
  // Và không migration nào SAU 0130 được grant lại.
  for (const later of FILES.filter((x) => x.localeCompare("0130_") > 0)) {
    const s = sqlOnly(readFileSync(join(DIR, later), "utf8"));
    expect(/grant[^;]*\bon\s+function\s+(?:public\.)?session_boundary_at/i.test(s), `${later} grant lại session_boundary_at`).toBe(false);
  }
});

test("không migration nào cấp quyền cho anon sau khi 0109 đóng", () => {
  const bad: string[] = [];
  for (const file of FILES.filter((f) => f.localeCompare("0109_") > 0)) {
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    for (const m of sql.matchAll(/grant\s[^;]*;/gi)) if (/\banon\b/i.test(m[0])) bad.push(`${file}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
  }
  expect(bad).toEqual([]);
});

test("policy không được dùng so sánh PHỦ ĐỊNH trên role mà thiếu chốt NULL (lớp lỗ 0109)", () => {
  // Đây là KHUÔN đã tạo ra lỗ hổng 0109: `current_user_role() is distinct from 'brand'` trả TRUE khi
  // role NULL (phiên không đăng nhập, hoặc đã đăng nhập mà không có dòng profiles), nên ý định "loại
  // brand ra" hoá thành "cho qua tất". Quét toàn bộ policy còn sống trong chuỗi migration.
  const pol = new Map<string, { file: string; body: string }>();
  for (const file of FILES) {
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    const ev: { at: number; kind: "c" | "d"; key: string; body?: string }[] = [];
    for (const m of sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)/gi)) {
      const end = sql.indexOf(";", m.index!);
      ev.push({ at: m.index!, kind: "c", key: `${m[2]}|${m[1]}`, body: sql.slice(m.index!, (end < 0 ? m.index! + 2000 : end) + 1) });
    }
    for (const m of sql.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)/gi))
      ev.push({ at: m.index!, kind: "d", key: `${m[2]}|${m[1]}` });
    ev.sort((a, b) => a.at - b.at);
    for (const e of ev) {
      if (e.kind === "c") pol.set(e.key, { file, body: e.body! });
      else pol.delete(e.key);
    }
  }
  expect(pol.size).toBeGreaterThan(80); // canh chính test
  const bad: string[] = [];
  for (const [k, p] of pol) {
    const b = p.body.replace(/\s+/g, " ");
    if (!/current_user_role/i.test(b)) continue;
    const negated = /current_user_role\(\)\s*(?:is\s+distinct\s+from|<>|!=)/i.test(b) || /current_user_role\(\)[^)]*\bnot\s+in\b/i.test(b);
    if (!negated) continue;
    if (/is\s+not\s+null|coalesce/i.test(b)) continue;
    bad.push(`${k} [${p.file}]`);
  }
  expect(bad).toEqual([]);
});

// ---------------------------------------------------------------------------
// VIEW — mặt thứ BA của cùng lớp lỗ, chưa ai canh (thêm 2026-10-02)
// ---------------------------------------------------------------------------
// Hai test trên canh khuôn phủ-định-role trong THÂN HÀM và trong POLICY. Còn VIEW thì không ai canh —
// và đó đúng là chỗ lọt: 0109 mục 3 thêm vế `is not null` vào WHERE của `live_sessions_secure`, rồi
// `0114` (một migration về TÍNH NĂNG, không ai đọc nó như thay đổi bảo mật) `drop view` + `create view`
// lại để thêm `excluded_from_reports`, chép WHERE theo bản TRƯỚC 0109 ⇒ vế chốt NULL biến mất, im lặng
// suốt 16 migration. View không có `security_invoker` chạy bằng quyền OWNER nên RLS của bảng gốc KHÔNG
// đỡ hộ: WHERE của chính view là hàng rào duy nhất. Đo trên replay: phiên `authenticated` không có
// dòng `profiles` (role = NULL) đọc được ca của MỌI brand qua view đó.

/** View có khuôn phủ định nhưng KHÔNG hở — an toàn do cấu trúc. Thêm tên vào đây phải kèm phép ĐO. */
const VIEW_SAFE_BY_SHAPE: Record<string, string> = {
  brand_commitment_progress:
    "Khuôn phủ định chỉ nằm ở điều kiện LEFT JOIN (chọn hợp đồng nào được nối), còn WHERE lọc DÒNG " +
    "thì dùng so sánh KHẲNG ĐỊNH: role = any(ceo,operations,admin) hoặc role = 'brand' và đúng brand " +
    "của mình. Role NULL ⇒ cả hai vế NULL/false ⇒ 0 dòng. Đo trên replay 0001→0130 (1 dòng cam kết " +
    "thật, `set role authenticated` không set JWT): đọc được 0 dòng."
};

test("view dùng so sánh PHỦ ĐỊNH trên role phải có chốt NULL — hoặc được migration sau vá lại (lớp lỗ 0114)", () => {
  const views = new Map<string, { file: string; body: string }>();
  for (const file of FILES) {
    const sql = sqlOnly(readFileSync(join(DIR, file), "utf8"));
    const ev: { at: number; kind: "c" | "d"; name: string; body?: string }[] = [];
    // Bắt mọi câu lệnh có TÊN VIEW viết thẳng, KỂ CẢ trong chuỗi `execute format(...)`. 0128/0129 viết
    // lại view qua `%I` nên không có tên ⇒ không bị bắt (đúng: chúng đọc `pg_get_viewdef`, không chép
    // định nghĩa). Riêng khối vá của 0130 ghi thẳng tên view kèm vế `is not null`, nên NÓ là người ghi
    // CUỐI cho `live_sessions_secure` — và đó chính là lý do test này xanh dù 0114 vẫn sai: trạng thái
    // cuối của chuỗi đã đúng. 0114 không sửa được nữa (đã chạy trên production, quy ước là để nguyên
    // làm dấu vết). Điều test canh là: ai ghi định nghĩa view SAU CÙNG thì phải mang theo vế chốt NULL
    // — đã thử bằng một migration 0131 giả dựng lại view theo khuôn 0114: test đỏ đúng tên file đó.
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z0-9_]+)\s+as\b/gi)) {
      const end = sql.indexOf(";", m.index!);
      ev.push({ at: m.index!, kind: "c", name: m[1], body: sql.slice(m.index!, end < 0 ? sql.length : end) });
    }
    for (const m of sql.matchAll(/drop\s+view\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi))
      ev.push({ at: m.index!, kind: "d", name: m[1] });
    ev.sort((a, b) => a.at - b.at);
    for (const e of ev) {
      // `drop` rồi `create` lại trong CÙNG file là khuôn của 0114 — xoá trước, ghi lại sau.
      if (e.kind === "c") views.set(e.name, { file, body: e.body! });
      else views.delete(e.name);
    }
  }
  expect(views.size).toBeGreaterThan(3); // canh chính test: có đọc được view thật

  const bad: string[] = [];
  for (const [name, v] of views) {
    const b = v.body.replace(/\s+/g, " ");
    if (!/current_user_role/i.test(b)) continue;
    const negated = /current_user_role\(\)\s*\)?\s*(?:is\s+distinct\s+from|<>|!=)/i.test(b) || /current_user_role\(\)[^)]*\bnot\s+in\b/i.test(b);
    if (!negated) continue;
    if (/is\s+not\s+null|coalesce/i.test(b)) continue;
    if (name in VIEW_SAFE_BY_SHAPE) continue;
    bad.push(`${name} [${v.file}] — khuôn phủ định trên role mà thiếu vế is-not-null`);
  }
  expect(bad).toEqual([]);
});
