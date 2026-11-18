import type { Talent } from "../../types";
import { parseRuleText, type ParsedRule } from "./placementRules";

// Dán từ sheet "TỶ LỆ LỊCH" của chị Trainer: mỗi dòng có tên host và một ô giờ cam kết kiểu "50h /tháng (6-7-CN, camp)", "35-40h/tháng",
// "35/tháng". Hàm thuần: tách dòng, rút giờ (khoảng "35-40" lấy số lớn = trần), ghép tên với talent (chỉ khi KHỚP DUY NHẤT).

export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export interface ParsedCommitment {
  line: number;
  nameRaw: string;
  hours: number;
  /** Phần trong ngoặc (6-7-CN, camp, ca đêm…), giữ nguyên chữ để Trainer đối chiếu. */
  note: string;
  /** Luật đặt giờ đọc từ cả ô (chỉ có khi truyền danh sách brand). */
  rule?: ParsedRule;
  status: MatchStatus;
  talentId?: string;
  /** Ứng viên khi tên trùng nhiều người. */
  candidates: string[];
  /** Cùng người đã có dòng trước đó trong lần dán (bảng host rồi bảng trợ): bỏ qua dòng sau. */
  duplicate: boolean;
}
export interface ParseResult {
  rows: ParsedCommitment[];
  /** Dòng không có giờ cam kết (tiêu đề, dòng trống…). */
  skipped: number;
}

export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HOURS = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(?:h\b|giờ|\/\s*tháng)/i;
const num = (s: string) => Number(s.replace(",", "."));

export function parseCommitmentSheet(text: string, talents: readonly Talent[], brands?: readonly { id: string; name: string }[]): ParseResult {
  const byFull = new Map<string, Talent[]>();
  const add = (k: string, t: Talent) => {
    if (!k) return;
    const l = byFull.get(k) ?? [];
    if (!l.includes(t)) l.push(t);
    byFull.set(k, l);
  };
  for (const t of talents) {
    add(normName(t.name), t);
    if (t.nickname) add(normName(t.nickname), t);
  }
  const lastTwo = (n: string) => n.split(" ").slice(-2).join(" ");
  const byTail = new Map<string, Talent[]>();
  for (const t of talents) {
    const k = lastTwo(normName(t.name));
    if (!k.includes(" ")) continue;
    const l = byTail.get(k) ?? [];
    l.push(t);
    byTail.set(k, l);
  }

  const rows: ParsedCommitment[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const cells = raw.split("\t").map((c) => c.trim()).filter(Boolean);
    const hoursCell = cells.find((c) => HOURS.test(c));
    if (!hoursCell) {
      skipped += 1;
      return;
    }
    const m = hoursCell.match(HOURS)!;
    const hours = Math.max(num(m[1]), m[2] ? num(m[2]) : 0);
    if (!(hours > 0)) {
      skipped += 1;
      return;
    }
    const rest = hoursCell.replace(HOURS, " ").replace(/^\s*\/?\s*tháng/i, " ").trim();
    const note = hoursCell.match(/\(([^)]*)\)/)?.[1]?.trim() ?? rest;
    const rule = brands ? parseRuleText(hoursCell, brands) : undefined;
    // Tên = ô chữ đầu tiên không phải số thứ tự / tiền / ô giờ.
    const nameRaw = cells.find((c) => c !== hoursCell && /\p{L}/u.test(c) && !/^[\d.,\s]+$/.test(c)) ?? "";
    const key = normName(nameRaw);
    let hit = byFull.get(key) ?? [];
    if (hit.length === 0) hit = byTail.get(lastTwo(key)) ?? [];
    const status: MatchStatus = hit.length === 1 ? "matched" : hit.length > 1 ? "ambiguous" : "unmatched";
    const talentId = hit.length === 1 ? hit[0].id : undefined;
    const duplicate = !!talentId && seen.has(talentId);
    if (talentId) seen.add(talentId);
    rows.push({ line: i + 1, nameRaw, hours, note, rule, status, talentId, candidates: hit.map((t) => t.id), duplicate });
  });
  return { rows, skipped };
}
