// Canh chuẩn tên chỉ số (src/lib/metricGlossary.ts, user chốt 2026-09-26): một chỉ số một tên trên
// mọi report/chart. Test quét chữ hiển thị trong src/ (bỏ dòng chú thích) để tên cũ không quay lại.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { METRIC, metricHint } from "../src/lib/metricGlossary";

// [tên cũ, tên chuẩn thay thế]
const BANNED: [RegExp, string][] = [
  [/Doanh số ?(\/|mỗi) ?giờ|GMV ?\/ ?Giờ|GMV \/ giờ|GMV mỗi giờ|GMV per hour|AVG\/hour/, "GMV/giờ"],
  [/Doanh số live|GMV agency live|GMV do agency live|GMV Thực Đạt|Actual GMV|GMV thực tế|GMV [Tt]hật/, "LIVE GMV / GMV"],
  [/GMV cả shop|GMV toàn shop/, "Total GMV"],
  [/Lượt xem ?(\/|mỗi) ?giờ|Xem\/giờ|View \/ giờ/, "Views/giờ"],
  [/GMV ?(\/|mỗi) ?lượt xem/, "GMV/View"],
  [/GMV mỗi sản phẩm|GMV\/SP|Giá TB|AVG\.price/, "Avg. price"],
  [/Giá trị đơn|TB mỗi đơn/, "AOV"],
  [/Sản phẩm mỗi đơn|SP\/[Đđ]ơn/, "UPT"],
  [/CTR live|CTR LIVE/, "LIVE CTR (Product clicks ÷ Views) hoặc ERR (Views ÷ LIVE impressions)"],
  [/CTR sản phẩm|Tỷ lệ bấm/, "Product CTR"],
  [/Tỷ lệ mua|CVR \(đơn\/view\)/, "CVR"],
  [/LIVE tài khoản shop|LIVE shop"|Thẻ SP|Thẻ sản phẩm|GMV thẻ sản phẩm/, "Seller LIVE / Product card"],
  [/Runrate|Target Completion/, "% Target"],
  [/Hoàn ?\/ ?GMV/, "Refund rate"],
  [/Pay-Day/, "Pay Day"]
];

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name) && !name.endsWith("metricGlossary.ts")) yield p;
  }
}

test("không còn tên chỉ số cũ trong chữ hiển thị của src/", () => {
  const hits: string[] = [];
  for (const file of sourceFiles(join(__dirname, "..", "src"))) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
        // Regex khớp tên cột gốc của file TikTok (findCol/colAt, `key: /^...$/`) phải giữ nguyên chữ TikTok.
        if (/findCol\(|colAt\(|:\s*\/\^/.test(line)) return;
        const code = line.replace(/\/\/.*$/, ""); // bỏ chú thích cuối dòng
        for (const [re, fix] of BANNED) if (re.test(code)) hits.push(`${file.split("/src/")[1]}:${i + 1} → dùng "${fix}": ${t.slice(0, 120)}`);
      });
  }
  expect(hits).toEqual([]);
});

test("metricHint khớp tên chuẩn và nhãn bắt đầu bằng tên chuẩn", () => {
  expect(metricHint(METRIC.liveCtr)).toBe("Product clicks ÷ Views");
  expect(metricHint("CTOR (%)")).toMatch(/Orders ÷ Product clicks/);
  expect(metricHint("GMV/giờ T9")).toBe("GMV ÷ Giờ live");
  expect(metricHint("Target GMV tháng 10")).toMatch(/GMV mục tiêu/);
  expect(metricHint("Tháng")).toBeUndefined();
});
