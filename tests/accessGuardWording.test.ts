// Màn chặn khi không mở được một trang (App.tsx). Kiểm 14/11 trên app thật: mở /brand/jockey/dashboard bằng tài
// khoản admin ra màn "Quyền Truy Cập Bị Hạn Chế (Access Restricted) … Permission Required … Status: DENIED" —
// hai lỗi trong một màn: (1) nói sai lý do (brand không tồn tại, không phải thiếu quyền), (2) chữ Anh kỹ thuật
// đọc cho người vận hành, trái WORKSPACE §5.2(7).
//
// Quét trên bản ĐÃ BỎ chú thích: phần phân tích ở các comment vẫn được phép nhắc lại chữ cũ.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const APP = join(__dirname, "..", "src", "App.tsx");

/** Bỏ chú thích khối và chú thích dòng, giữ nguyên chuỗi còn lại (đủ dùng cho phép quét chữ hiển thị). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("màn chặn quyền không còn chữ Anh kỹ thuật", () => {
  const code = stripComments(readFileSync(APP, "utf8"));
  for (const phrase of ["Access Restricted", "Status: DENIED", "Permission Required", "Current Role:"]) {
    expect(code, `còn "${phrase}" hiện ra cho người dùng`).not.toContain(phrase);
  }
  // Tên vai trò lấy từ một chỗ dùng chung, không in mã role viết hoa ("ADMIN").
  expect(code).toContain("roleLabel(currentRole)");
});

test("link brand không mở được nói đúng lý do, không đổ cho phân quyền", () => {
  const code = stripComments(readFileSync(APP, "utf8"));
  // Hai lý do thật, hai câu riêng: brand đã "Đã xong" ở CRM (JOCKEY, kiểm 14/11) và slug không khớp brand nào.
  expect(code).toContain("đã kết thúc hợp tác");
  expect(code).toContain("Không tìm thấy brand trong đường link");
  // Brand bị ẩn vì hợp đồng đã xong cũng phải vào nhánh này, không rơi xuống màn thiếu quyền.
  expect(code).toContain("hiddenBrandIds.has(b.id)");
  // Nhánh này phải đứng TRƯỚC mọi nhánh phân quyền, nếu không màn "không mở được trang" lại che mất lý do thật.
  expect(code.indexOf("brandLinkIssue ? (")).toBeGreaterThan(0);
  expect(code.indexOf("brandLinkIssue ? (")).toBeLessThan(code.indexOf("!isTabAllowed && (phase6Loading"));
});

test("màn chặn gọi tên trang bằng nhãn menu, không in id kỹ thuật", () => {
  const code = stripComments(readFileSync(APP, "utf8"));
  // Kiểm 14/11: màn chặn in thẳng "brand_dashboard" / "my_shifts" vì tab không có trong menu của vai trò đang
  // đăng nhập. `tabLabel` tra nhãn trong menu của mọi vai trò trước khi đành in id.
  expect(code).toContain("{tabLabel}");
  expect(code).not.toContain("currentTabNavItem?.label ?? activeTab");
});

test("màn của talent mở bằng link thì nói thẳng, không im lặng nhảy sang Bảng Vận Hành", () => {
  const code = stripComments(readFileSync(APP, "utf8"));
  // `shift_scheduling` là tab agency đã bỏ (08/10) nên chuyển thẳng; `shift_registered` là màn talent, chỉ chuyển
  // khi nó đến từ localStorage cũ chứ không phải từ link người dùng vừa mở.
  expect(code).toContain('initialRoute?.tab !== "shift_registered"');
});
