// Gom việc trên ca (21/11, user: "một chức năng làm ở nhiều nơi"): MỘT việc — MỘT chỗ làm; màn khác chỉ xem + nút dẫn sang.
// Test này canh để không ai thêm lại cửa thứ hai. Chạy: npx vitest run tests/oneDoorPerTask.test.ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

const SRC = join(__dirname, "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
const ALL = files(SRC).map((p) => ({ path: relative(SRC, p), src: readFileSync(p, "utf8") }));
const users = (re: RegExp) => ALL.filter((f) => re.test(f.src)).map((f) => f.path).sort();

test("mở ca lẻ: form OpenSlotModal chỉ ở Điều Phối Lịch Live", () => {
  expect(users(/<OpenSlotModal\b/)).toEqual(["components/RosterBoard.tsx"]);
});

test("chốt người vào ca mở (finalize_shift_slot): chỉ Điều Phối Lịch Live gọi", () => {
  // App.tsx nối handler vào RosterBoard; RosterBoard là màn duy nhất nhận và gọi.
  expect(users(/onFinalizeSlot/).filter((p) => !p.startsWith("lib/"))).toEqual(["App.tsx", "components/RosterBoard.tsx"]);
});

test("duyệt đổi ca: hàng đợi duyệt chỉ ở Điều Phối Lịch Live", () => {
  expect(users(/<SwapApprovalQueue\b/)).toEqual(["components/RosterBoard.tsx"]);
});

test("không màn nào tạo ca + chốt người thẳng bằng ca nháp sa bàn", () => {
  expect(users(/createSessionDrafts\(/).filter((p) => !p.startsWith("lib/db/"))).toEqual([]);
});

test("đổi người / dời giờ ca chưa diễn ra đi qua luật chung planScheduledChange", () => {
  expect(users(/planScheduledChange\(/).filter((p) => !p.startsWith("lib/"))).toEqual(["App.tsx", "components/LiveCalendar.tsx", "components/MonthPlan.tsx", "components/SessionWindow.tsx"]);
});


test("host/trợ mới: chỉ Talent Pool tạo hồ sơ + tài khoản; Phân Quyền chỉ cấp tài khoản cho hồ sơ có sẵn", () => {
  expect(users(/newTalentProfile:/).filter((p) => !p.startsWith("server/") && !p.startsWith("lib/"))).toEqual(["App.tsx"]);
  const app = ALL.find((f) => f.path === "App.tsx")!.src;
  // Đường duy nhất gửi newTalentProfile là handleCreateTalentAccount (nút "Thêm talent" của Talent Pool).
  expect(app.indexOf("newTalentProfile:")).toBeGreaterThan(app.indexOf("const handleCreateTalentAccount"));
  expect(app.indexOf("newTalentProfile:")).toBeLessThan(app.indexOf("const handleGrantTalentAccounts"));
});
