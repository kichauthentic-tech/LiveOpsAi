// Canh thuật ngữ chuyên ngành (audit 27/10): chữ hiển thị dùng từ của ecommerce / livestream / digital marketing, không
// dùng khẩu ngữ nội bộ — để màn hình đem trình bày với brand, sếp được. Tên chỉ số canh riêng ở metricGlossary.test.ts.
// Quét chữ trong src/ (bỏ dòng chú thích), cùng cách quét với metricGlossary.test.ts.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

// [khẩu ngữ, từ chuẩn thay thế]
const BANNED: [RegExp, string][] = [
  [/\b[Uu]p (file|số|lại|nhầm|trễ|snapshot)\b/, "tải lên / tải lại"],
  [/\b(bỏ|Bỏ|đã|đang|chưa|Chưa|được|chỉ) tick\b|\btick (hết|để|nếu|ít nhất)\b/, "chọn / bỏ chọn"],
  [/mặt bằng/, "trung bình nhóm / trung bình các host"],
  [/[Dd]ự phóng/, "dự báo"],
  [/chạm target|khả năng chạm/, "đạt target / xác suất đạt"],
  [/thừa số/, "yếu tố"],
  [/\b(ngày|đợt|khung|lịch|hệ số|khuôn|Khuôn) camp\b/, "Campaign (DAY_TYPE.campaign)"],
  [/scheme KM|trùng KM/, "chương trình khuyến mãi"],
  [/tiêu tiền mà/, "có chi phí Ads nhưng không phát sinh đơn"],
  [/đúng nhịp|theo nhịp cùng kỳ/, "đúng tiến độ / theo tốc độ cùng kỳ"],
  [/[Tt]arget cộng dồn|Cộng dồn target/, "Target luỹ kế"],
  [/Rớt mạng|app crash/, "Mất kết nối / ứng dụng lỗi"],
  [/giỏi hơn|bán tốt nhất|kém tin/, "hiệu suất cao hơn / hiệu quả nhất / độ tin cậy thấp"],
  [/đẩy traffic|kéo giỏ|kéo follow/, "tăng traffic / tăng ATC / tăng New followers"],
  [/Đi xuống:|Phần giảm dồn vào|cách chạy/, "Giảm hạng / Mức giảm tập trung ở / cách vận hành"],
  [/[Gg]iờ live đã chạy|[Ll]ãi lỗ|[Ll]ãi\/lỗ/, "Giờ live đã thực hiện / P&L"],
  [/mọi khi/, "mức thông thường"],
  [/\bTB (brand|agency)\b|ngày TB\b|"Trễ TB"/, "trung bình"],
  // Đọc hết chữ toàn app lần 2 (27/10): các cách nói lượt quét từ khoá đầu không bắt được.
  [/\b[Nn]gày camp\b|\bcamp (học|tối thiểu)|>Ngày thường</, "Campaign / Daily"],
  [/PAY-DAY|Pay-Day/, "Pay Day"],
  [/về đích|còn cửa/, "xác suất đạt target"],
  [/[Oo]ff sớm|Off −/, "kết thúc sớm"],
  [/bảo chứng|Đặt lại MK|Nhịp bán|Lượt vào shop|tài khoản shop \(Shop Analytics\)/, "chưa được xác thực / Đặt lại mật khẩu / GMV theo ngày / Lượt truy cập shop / Seller LIVE"],
  [/\b[Đđ]ã [Cc]hạy (ca\b|\(giờ\)|…)|"Đã chạy"|>Đã chạy</, "đã live"],
  [/\bupload\b|quên up\b|chưa up\b/, "tải lên"],
  [/Scheme khuyến mãi|`KM: |\bset rate\b|% commission/, "chương trình khuyến mãi / đơn giá / % hoa hồng"],
  [/[Nn]gưỡng mệt|cảnh báo mệt|tay nghề cao/, "quá tải / hiệu suất cao"],
  [/không chạm|dự báo chạm|vượt sức lịch sử/, "không đạt / dự báo đạt / vượt năng lực theo lịch sử"],
  [/ vs (tháng|file) /, "so với"]
];

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

test("chữ hiển thị không dùng khẩu ngữ thay cho thuật ngữ chuyên ngành", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(join(__dirname, "..", "src"))) {
    // Prompt gửi model AI và lỗi dev của shims (không hiện trên màn) được phép giữ cách nói nội bộ.
    if (/server\/askData\.ts$|performance\/askContext\.ts$|\/shims\//.test(file)) continue;
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
        const code = line.replace(/\/\/.*$/, "");
        for (const [re, fix] of BANNED) if (re.test(code)) hits.push(`${file.split("/src/")[1]}:${i + 1} → dùng "${fix}": ${t.slice(0, 120)}`);
      });
  }
  expect(hits).toEqual([]);
});

// Chữ trong hàm SQL (raise exception, thông báo) cũng hiện lên màn — 0187/0188 đã sửa. Chỉ xét bản định nghĩa
// MỚI NHẤT của mỗi hàm (migration cũ là lịch sử, không sửa) và chuỗi trong nháy đơn của thân hàm.
test("chữ trong hàm SQL bản mới nhất không dùng khẩu ngữ", () => {
  const dir = join(__dirname, "..", "supabase", "migrations");
  const latest = new Map<string, [string, string]>();
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(dir, name), "utf8");
    const head = /create\s+or\s+replace\s+function\s+([\w.]+)\s*\(/gi;
    for (let m; (m = head.exec(sql)); ) {
      const tag = /\bas\s+(\$\w*\$)/gi;
      tag.lastIndex = head.lastIndex;
      const t = tag.exec(sql);
      if (!t) continue;
      const end = sql.indexOf(t[1], tag.lastIndex);
      if (end < 0) continue;
      latest.set(m[1].toLowerCase().replace(/^public\./, ""), [name, sql.slice(tag.lastIndex, end)]);
    }
    for (const d of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([\w.]+)/gi)) latest.delete(d[1].toLowerCase().replace(/^public\./, ""));
  }
  const hits: string[] = [];
  for (const [fn, [file, body]] of latest)
    for (const lit of body.matchAll(/'((?:[^']|'')*)'/g))
      for (const [re, fix] of BANNED) if (re.test(lit[1])) hits.push(`${file} ${fn} → dùng "${fix}": ${lit[1].slice(0, 100)}`);
  expect(latest.size).toBeGreaterThan(100);
  expect(hits).toEqual([]);
});
