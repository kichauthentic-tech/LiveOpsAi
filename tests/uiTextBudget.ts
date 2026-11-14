// Đo chữ hiện thẳng trên màn — dùng chung cho `tests/uiTextBudget.test.ts` và cho việc đo lại khi cắt chữ.
//
// Vì sao có: audit chữ 13/11 (user: "tìm những chỗ đang có text thừa, xoá bớt cho gọn"). Đếm được thì mới chặn được
// chữ bò lại. Luật đo chốt theo đúng cái mắt người dùng thấy khi mở màn:
//   • TÍNH: chuỗi trong nháy + text node JSX từ 12 từ trở lên (ngưỡng "một câu phải đọc", cùng ngưỡng audit cửa sổ ca 08/11).
//   • KHÔNG TÍNH: comment; `src/server`, `lib/dataraw`, `lib/db` (tên cột file sàn, lỗi lớp dữ liệu — không phải chữ trên màn).
//   • KHÔNG TÍNH là "hiện thẳng": chữ nằm trong Explain / MethodNote / details / MoreMenu / InfoDot, hoặc là prop
//     description / info / help / hint / title / placeholder / aria-label — đều phải bấm mới thấy.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const VI = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/;

/** Thành phần "bấm mới thấy": chữ bên trong không tính là hiện thẳng. */
const COLLAPSING = "Info\\b|Explain|MethodNote|details|GlossaryDialog|MoreMenu|Tooltip|InfoDot";
/** Prop chỉ hiện sau một cú bấm / rê chuột. */
const HIDDEN_PROP = /\b(description|info|hint|help|tooltip|title|placeholder|aria-label|note|desc|summary)\s*[:=]\s*\{?\s*$/;
/** Dòng mở một prop gập mà giá trị nằm ở dòng sau. */
const HIDDEN_PROP_OPEN = /\b(description|info|hint|help|tooltip|title|note|desc|summary)\s*=\s*\{\s*$/;

const SKIP_DIR = /^(server|shims)$/;
// `askContext.ts` là prompt gửi model AI, không phải chữ trên màn (§5.2: prompt không bị canh thuật ngữ).
const SKIP_PATH = /^(server\/|lib\/dataraw\/|lib\/db\/|shims\/|lib\/performance\/askContext\.ts$)/;
/** Từ điển cố ý: Glossary + tên/công thức chỉ số. Không phải chữ thừa. */
const DICTIONARY = /(GlossaryDialog|metricGlossary)/;
/** Câu Insight gửi brand trong Report Tháng — là hàng gửi khách, không cắt. */
const BRAND_INSIGHT = /(pageInsights|sectionInsights|monthlyReportInsights|shopeeSnapshot|shopeePages|reportEngines|brand-workspace\/report\/|MonthlyReportTabs)/;

export interface TextHit {
  file: string;
  line: number;
  words: number;
  text: string;
  hidden: boolean;
}

function* files(dir: string, base = ""): Generator<[string, string]> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(p).isDirectory()) {
      if (!SKIP_DIR.test(name)) yield* files(p, rel);
    } else if (/\.tsx?$/.test(name)) {
      yield [rel, p];
    }
  }
}

/** Bỏ comment để không đếm chữ chỉ lập trình viên đọc. */
function stripComments(src: string): string[] {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => {
      const t = l.trimStart();
      if (t.startsWith("//") || t.startsWith("*")) return "";
      const i = l.indexOf("//");
      if (i > 0 && !/["'`]/.test(l.slice(i))) return l.slice(0, i);
      return l;
    });
}

const wordCount = (t: string) => t.replace(/\$\{[^}]*\}/g, "X").trim().split(/\s+/).filter(Boolean).length;

/** Mọi câu ≥ `minWords` từ trong `src/`, kèm cờ đã gập hay chưa. */
export function scanUiText(srcDir: string, minWords = 12): TextHit[] {
  const open = new RegExp(`<(${COLLAPSING})\\b`, "g");
  const close = new RegExp(`</(${COLLAPSING})>`, "g");
  const selfClose = new RegExp(`<(${COLLAPSING})\\b[^>]*/>`, "g");
  const out: TextHit[] = [];
  for (const [rel, abs] of files(srcDir)) {
    if (SKIP_PATH.test(rel)) continue;
    const lines = stripComments(readFileSync(abs, "utf8"));
    let depth = 0;
    // Prop gập mà giá trị xuống dòng (`description={` rồi câu ở dòng sau, thường là một ternary): giữ cờ tới khi
    // ngoặc đóng lại. Thiếu cái này thì mô tả trang của PageHeader bị đếm là chữ hiện thẳng.
    let propDepth = 0;
    lines.forEach((ln, i) => {
      const inPropBlock = propDepth > 0;
      if (propDepth > 0) {
        propDepth += (ln.match(/\{/g) ?? []).length - (ln.match(/\}/g) ?? []).length;
        if (propDepth < 0) propDepth = 0;
      } else if (HIDDEN_PROP_OPEN.test(ln)) {
        const d = (ln.match(/\{/g) ?? []).length - (ln.match(/\}/g) ?? []).length;
        if (d > 0) propDepth = d;
      }
      const o = (ln.match(open) ?? []).length;
      const c = (ln.match(close) ?? []).length;
      const sc = (ln.match(selfClose) ?? []).length;
      const before = depth;
      depth = Math.max(0, depth + o - sc - c);
      // Chữ nằm SAU thẻ gập đầu tiên trên cùng dòng cũng là đã gập — kể cả thẻ tự đóng (`<Info text={…} />`).
      // Chữ đứng TRƯỚC thẻ (`<p>câu dài <InfoDot>…</InfoDot></p>`) vẫn tính là hiện thẳng.
      open.lastIndex = 0;
      const tagAt = open.exec(ln)?.index ?? Infinity;
      const cands: [string, number][] = [];
      let m: RegExpExecArray | null;
      // Không đặt độ dài tối thiểu trong regex: `{12,}` làm engine bỏ qua chuỗi ngắn rồi ghép nháy đóng của nó với nháy
      // mở của chuỗi sau (ra những "câu" kiểu `", help: "`). Lọc độ dài SAU khi đã bắt cặp đúng.
      const lit = /(["'`])((?:[^\\\n]|\\.)*?)\1/g;
      while ((m = lit.exec(ln))) cands.push([m[2], m.index]);
      const node = />([^<>{}\n]+)</g;
      while ((m = node.exec(ln))) cands.push([m[1].trim(), m.index]);
      for (const [text, idx] of cands) {
        if (!VI.test(text)) continue;
        const words = wordCount(text);
        if (words < minWords) continue;
        const pre = ln.slice(0, idx).replace(/["'`]$/, "").trimEnd();
        const hidden = inPropBlock || before > 0 || idx > tagAt || HIDDEN_PROP.test(pre);
        out.push({ file: `src/${rel}`, line: i + 1, words, text, hidden });
      }
    });
  }
  return out;
}

export type Bucket = "dictionary" | "brandInsight" | "opsScreen";

export const bucketOf = (file: string): Bucket =>
  DICTIONARY.test(file) ? "dictionary" : BRAND_INSIGHT.test(file) ? "brandInsight" : "opsScreen";

/** Câu hiện thẳng trên màn vận hành — con số bị canh ngân sách. */
export function opsScreenText(srcDir: string): TextHit[] {
  return scanUiText(srcDir).filter((h) => !h.hidden && bucketOf(h.file) === "opsScreen");
}

/** Số từ hiện thẳng theo file, nhiều nhất trước. */
export function wordsByFile(hits: TextHit[]): [string, number][] {
  const by = new Map<string, number>();
  for (const h of hits) by.set(h.file, (by.get(h.file) ?? 0) + h.words);
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}
