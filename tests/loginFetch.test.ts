// Canh đợt fetch lúc đăng nhập (2026-10-01). Đo trên bản build thật, role admin, màn Sổ Ca:
// app bắn 46 request khi mở, trong đó 18 là thừa. Ba nhóm lỗi, mỗi nhóm một test ở đây:
//
//   1. Cụm 6 fetch dùng chung bị gọi HAI LẦN vì effect khai `isOpsRole` trong dep mà
//      `currentRole` mặc định "talent" cho tới khi hồ sơ về ⇒ false → true → chạy lại.
//   2. `useAuth` nạp hồ sơ ngay trong listener auth. GoTrue phát lại `SIGNED_IN` với CÙNG một
//      phiên mỗi lần tab được hiện lại ⇒ 1 request `profiles` mỗi ~6 s, chạy mãi không dừng.
//   3. 5 fetch phục vụ đúng một màn (Phân Quyền, Tự Động Hoá TikTok, AI Training) vẫn nạp lúc
//      đăng nhập cho mọi phiên, kể cả phiên không bao giờ mở tới màn đó.
//
// Sau khi sửa: 28 request, 0 request lặp, dữ liệu lõi xong ở 346–491 ms.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const SRC = join(__dirname, "..", "src");
const APP = readFileSync(join(SRC, "App.tsx"), "utf8");
const USE_AUTH = readFileSync(join(SRC, "hooks/useAuth.tsx"), "utf8");

/** Khối useEffect bao quanh `needle`, từ `useEffect(` tới hết mảng dep. */
function effectAround(src: string, needle: string): string {
  const i = src.indexOf(needle);
  expect(i, `không tìm thấy "${needle}" trong nguồn`).toBeGreaterThan(-1);
  const start = src.lastIndexOf("useEffect(", i);
  const depStart = src.indexOf("}, [", i);
  const depEnd = src.indexOf("]);", depStart);
  expect(start >= 0 && depStart > i && depEnd > depStart, `không tách được khối effect quanh "${needle}"`).toBe(true);
  return src.slice(start, depEnd + 3);
}

/** Mảng dep của khối effect đó, dạng chuỗi ví dụ "authUserId, activeTab". */
function depsOf(src: string, needle: string): string {
  const block = effectAround(src, needle);
  return block.slice(block.lastIndexOf("}, [") + 4, block.lastIndexOf("]);")).trim();
}

test("cụm dữ liệu dùng chung KHÔNG được khai isOpsRole trong dep", () => {
  // 6 fetch này không phụ thuộc role. Thêm `isOpsRole` vào dep là cả cụm chạy lại lần hai ngay khi
  // hồ sơ về. Tham số engine (chỉ ops dùng) phải nằm ở effect RIÊNG.
  expect(depsOf(APP, "fetchBrandPlatformRates()")).toBe("authUserId");
  expect(depsOf(APP, "fetchEngineParams()")).toBe("authUserId, isOpsRole");
});

test("dữ liệu chỉ một màn đọc phải gate theo activeTab", () => {
  // Neo theo tên hằng số (mỗi bộ dữ liệu một hằng số riêng, xuất hiện đúng 1 lần trong thân effect)
  // chứ không neo theo tên hàm fetch — `fetchUsers()` còn nằm ở dòng import và ở các handler ghi.
  const gated: [string, string][] = [
    ["TABS_NEED_USERS", "fetchUsers()"],
    ["TABS_NEED_AUDIT_LOGS", "fetchAuditLogs()"],
    ["TABS_NEED_WORKFLOW_RULES", "fetchWorkflowRules()"],
    ["TABS_NEED_AI_PROMPTS", "fetchAiAgentPrompts()"],
    ["TABS_NEED_TIKTOK", "refreshTikTokStatus();"]
  ];
  for (const [set, call] of gated) {
    const guard = `${set}.has(activeTab)`;
    const block = effectAround(APP, guard);
    expect(block, `effect gate bằng ${guard} phải là effect gọi ${call}`).toContain(call);
    expect(depsOf(APP, guard), `${call} phải khai activeTab trong dep`).toContain("activeTab");
  }
});

test("mỗi bộ dữ liệu hoãn phải nạp đúng MỘT lần cho mỗi người dùng", () => {
  // Không có khoá thì effect chạy lại mỗi lần đổi tab qua lại giữa các màn trong cùng một nhóm.
  for (const ref of ["usersLoadedRef", "auditLogsLoadedRef", "workflowRulesLoadedRef", "tiktokLoadedRef", "aiPromptsLoadedRef"]) {
    expect(APP, `thiếu khoá ${ref}`).toContain(`${ref}.current === authUserId`);
  }
  // Fetch hỏng thì phải mở khoá lại, nếu không mở tab lần sau sẽ không thử lại nữa. Trừ TikTok:
  // `refreshTikTokStatus` tự nuốt lỗi vào `tiktokStatusError`, và màn Tự Động Hoá có nút bấm lại
  // nối thẳng vào `onRefreshTikTokStatus` — người dùng thoát được mà không cần khoá tự mở.
  for (const ref of ["usersLoadedRef", "auditLogsLoadedRef", "workflowRulesLoadedRef", "aiPromptsLoadedRef"]) {
    expect(APP, `${ref} phải mở khoá lại khi fetch hỏng`).toContain(`${ref}.current = null`);
  }
  expect(APP, "màn TikTok phải có đường bấm lại tay vì khoá không tự mở").toContain("onRefreshTikTokStatus={refreshTikTokStatus}");
});

test("Report Tháng: chỉ nạp lại khi RỜI màn có thể sửa report/kế hoạch", () => {
  const block = effectAround(APP, "fetchAllMonthlyReports().then(setMonthlyReports)");
  expect(block).toContain("TABS_MAY_CHANGE_REPORTS.has(leaving)");
});

test("useAuth: không nạp hồ sơ trong listener onAuthStateChange", () => {
  // GoTrue phát lại SIGNED_IN với cùng một phiên mỗi lần tab được hiện lại và mỗi lần làm mới token.
  const i = USE_AUTH.indexOf("supabase.auth.onAuthStateChange(");
  expect(i).toBeGreaterThan(-1);
  const listener = USE_AUTH.slice(i, USE_AUTH.indexOf("return () => listener.subscription.unsubscribe();", i));
  expect(listener, "listener auth không được gọi loadProfile — nạp theo authUserId ở effect riêng").not.toContain("loadProfile(");
});

test("useAuth: nạp hồ sơ khoá theo authUserId, không theo object session", () => {
  expect(USE_AUTH).toContain("const authUserId = session?.user?.id ?? null;");
  expect(depsOf(USE_AUTH, "void loadProfile(authUserId);")).toBe("authUserId, profileNonce, loadProfile");
});
