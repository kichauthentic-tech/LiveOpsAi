// Luật từ 2026-10-01: KHÔNG bịa nội dung AI.
//
// Trước đó cả 3 route /api/gemini/* đều trả `isMock: true` KÈM nội dung tự nghĩ ra, và vì
// `GEMINI_API_KEY` RỖNG trên môi trường thật thì đó chính là thứ người dùng nhận được mỗi lần bấm:
//   · lời khuyên CEO nhắc "Studio B đang trống 25% công suất", "Host Yến Nhi", "Brand La Roche-Posay"
//     — không thực thể nào trong số đó tồn tại trong tài khoản này;
//   · "Match Score 96%" mà thật ra là VỊ TRÍ TRONG MẢNG (96 − index×5);
//   · AiMultiAgent còn một tầng bịa THỨ HAI ở client, nhắc "Brand lớn như Cocoon hay Coolmate".
// Mỗi chỗ đều có nhãn "câu trả lời mẫu" — nhãn không cứu được việc nội dung là bịa, người đọc vẫn
// ra quyết định trên con số đó.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const SRC = join(__dirname, "..", "src");
const SERVER = readFileSync(join(SRC, "server/createApp.ts"), "utf8");

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sourceFiles(p);
    else if (/\.tsx?$/.test(name)) yield p;
  }
}

test("mọi route /api/gemini/* phải TỪ CHỐI khi chưa có API key, không trả nội dung thay thế", () => {
  const routes = [...SERVER.matchAll(/app\.post\("(\/api\/gemini\/[^"]+)"/g)].map((m) => m[1]);
  expect(routes.length, "không tìm thấy route /api/gemini nào — regex hỏng?").toBeGreaterThan(0);
  for (const route of routes) {
    const start = SERVER.indexOf(`app.post("${route}"`);
    const end = SERVER.indexOf("\n  app.post(", start + 1);
    const body = SERVER.slice(start, end === -1 ? SERVER.length : end);
    const guard = body.indexOf("if (!ai)");
    expect(guard, `${route}: thiếu nhánh xử lý khi chưa có client Gemini`).toBeGreaterThan(-1);
    const branch = body.slice(guard, guard + 300);
    expect(branch, `${route}: phải trả 503`).toContain("503");
    expect(branch, `${route}: phải trả code ai_not_configured để UI nói đúng lý do`).toContain("ai_not_configured");
    expect(branch, `${route}: KHÔNG được trả success:true kèm nội dung thay thế`).not.toMatch(/success:\s*true/);
  }
});

test("không còn cờ isMock nào trong app", () => {
  // Còn `isMock` nghĩa là đâu đó vẫn có đường trả nội dung không phải của model.
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    if (/\bisMock\b/.test(readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, ""))) hits.push(file.split("/src/")[1]);
  }
  expect(hits).toEqual([]);
});

test("không hardcode tên người/brand trong mã nguồn", () => {
  // Mọi tên trong các gợi ý bịa cũ. Tên thật phải đến từ DB, không nằm trong source.
  const BANNED = /Yến Nhi|Hoàng Nam|Bích Ngọc|Cocoon|Coolmate|La Roche/;
  const hits: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8").replace(/\/\/[^\n]*/g, ""); // chú thích được phép nhắc lại để cảnh báo
    if (BANNED.test(src)) hits.push(file.split("/src/")[1]);
  }
  expect(hits).toEqual([]);
});

test("client không tự viết câu trả lời thay AI khi gọi hỏng", () => {
  const chat = readFileSync(join(SRC, "components/AiMultiAgent.tsx"), "utf8");
  const matcher = readFileSync(join(SRC, "components/TalentMatcher.tsx"), "utf8");
  // Nhánh catch chỉ được hiện LỖI, không được dựng câu trả lời.
  expect(chat).toContain("isError: true");
  expect(chat, "AiMultiAgent không được tự gán `reply` trong nhánh lỗi").not.toMatch(/reply = `\[/);
  // Không có AI thì không có xếp hạng độ phù hợp — không được dựng bảng kết quả thay thế.
  // Cấm TÍNH điểm (khai báo kiểu và việc đọc `r.matchScore` của model thì được).
  expect(matcher, "TalentMatcher không được tự tính matchScore").not.toMatch(/const matchScore\s*=|matchScore:\s*(Math\.|\d)/);
  expect(matcher, "TalentMatcher không được tự dựng predictedGmv").not.toMatch(/predictedGmv:\s*[`"]/);
  expect(matcher).toContain("setMatchingError");
});
