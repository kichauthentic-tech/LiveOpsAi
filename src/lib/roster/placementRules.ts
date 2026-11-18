import { getCampaignDayInfo } from "../campaignDays";

// Quy luật đặt giờ TỪNG NGƯỜI (chị Trainer, 18/11): ô "MỨC CAST" trong sheet TỶ LỆ LỊCH LÀM có phần trong ngoặc như
// "6-7-CN, camp", "daily", "ca đêm", "JK camp, daily crocs", "daily FL + JK". Đây là luật đặt giờ: AI chỉ xếp người đó vào
// loại ngày / brand / khung giờ được ghi. Hàm thuần, không đụng DB.
//
// Mô hình: một người có nhiều ĐIỀU KIỆN (clause) — {brand?, days[]}. Ca khớp luật khi khớp ÍT NHẤT MỘT điều kiện
// (brand trùng hoặc điều kiện không ghi brand; loại ngày giao nhau hoặc điều kiện không ghi loại ngày). Thêm cờ `night`:
// chỉ nhận ca đêm. Người không có luật = không giới hạn.

export type DayKind = "weekend" | "camp" | "regular";
export const DAY_KINDS: readonly DayKind[] = ["weekend", "camp", "regular"];
export const DAY_KIND_LABEL: Record<DayKind, string> = { weekend: "Thứ 6-7-CN", camp: "Campaign", regular: "Ngày thường" };

export interface RuleClause {
  /** Chỉ áp cho brand này; thiếu = mọi brand. */
  brandId?: string;
  /** Loại ngày được nhận; rỗng = mọi loại ngày. */
  days: DayKind[];
}
export interface PersonRule {
  talentId: string;
  clauses: RuleClause[];
  /** Chỉ nhận ca đêm. */
  night: boolean;
  note?: string;
}

/** Một ngày thuộc những loại nào. Campaign (D-Day / Mid-Month / Pay Day) và "ngày thường" loại trừ nhau; Thứ 6-7-CN giao với cả hai. */
export function dayKindsOf(date: string): Set<DayKind> {
  const out = new Set<DayKind>();
  if (getCampaignDayInfo(date)) out.add("camp");
  else out.add("regular");
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = CN
  if (dow === 5 || dow === 6 || dow === 0) out.add("weekend");
  return out;
}

export interface ShiftFacts {
  date: string;
  brandId: string;
  /** Ca kết thúc muộn (đúng định nghĩa "ca đêm" của luật Điều Phối). */
  night: boolean;
}

export const hasRule = (r: PersonRule | undefined): r is PersonRule => !!r && (r.night || r.clauses.length > 0);

/** Ca này có nằm trong luật của người đó không. Không có luật ⇒ luôn khớp. */
export function ruleFit(rule: PersonRule | undefined, shift: ShiftFacts): { ok: boolean; reason?: string } {
  if (!hasRule(rule)) return { ok: true };
  if (rule.night && !shift.night) return { ok: false, reason: "không phải ca đêm" };
  if (rule.clauses.length === 0) return { ok: true };
  const kinds = dayKindsOf(shift.date);
  const hit = rule.clauses.some((c) => (!c.brandId || c.brandId === shift.brandId) && (c.days.length === 0 || c.days.some((d) => kinds.has(d))));
  return hit ? { ok: true } : { ok: false, reason: "ngoài loại ngày / brand đã đặt" };
}

/** Câu đọc được của một luật, vd "Thứ 6-7-CN, Campaign · Jockey: Campaign · chỉ ca đêm". */
export function describeRule(rule: PersonRule | undefined, brandName: (id: string) => string): string {
  if (!hasRule(rule)) return "Không giới hạn";
  const parts = rule.clauses.map((c) => {
    const days = c.days.length ? c.days.map((d) => DAY_KIND_LABEL[d]).join(" + ") : "mọi ngày";
    return c.brandId ? `${brandName(c.brandId)}: ${days}` : days;
  });
  if (rule.night) parts.push("chỉ ca đêm");
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------------------
// Đọc chữ trong sheet
// ---------------------------------------------------------------------------------------------------------------------------

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

/** Viết tắt của Trainer → mảnh tên brand. */
const BRAND_ALIAS: Record<string, string> = { jk: "jockey", fl: "franklin" };

export interface ParsedRule {
  clauses: RuleClause[];
  night: boolean;
  /** Mảnh chữ không hiểu (để hiện cho Trainer sửa tay). */
  unknown: string[];
}

function brandOf(token: string, brands: readonly { id: string; name: string }[]): string | null {
  const t = BRAND_ALIAS[token] ?? token;
  if (t.length < 2) return null;
  const hits = brands.filter((b) => fold(b.name).includes(t));
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Đọc phần chữ SAU giờ cam kết trong một ô: "(6-7-CN, camp)", "daily", "(JK camp, daily crocs)", "daily FL + JK", "(ca đêm)".
 * Ngăn cách điều kiện bằng dấu phẩy hoặc "+". Điều kiện chỉ có brand (không có loại ngày) lấy loại ngày của điều kiện trước
 * ("daily FL + JK" = ngày thường cho cả FL và JK). Điều kiện không brand liền nhau gộp thành một.
 */
export function parseRuleText(text: string, brands: readonly { id: string; name: string }[]): ParsedRule {
  const rest = fold(text)
    .replace(/\d+(?:[.,]\d+)?\s*(?:-\s*\d+(?:[.,]\d+)?)?\s*(?:h\b|gio|\/\s*thang)\s*(?:\/\s*thang|thang)?/g, " ")
    .replace(/[()]/g, ",");
  const clauses: RuleClause[] = [];
  let night = false;
  const unknown: string[] = [];
  let lastDays: DayKind[] = [];
  let prevWasDaysOnly = false;
  for (const seg of rest.split(/[,+]/).map((s) => s.trim()).filter(Boolean)) {
    let s = seg;
    const days: DayKind[] = [];
    if (/\bca dem\b/.test(s)) {
      night = true;
      s = s.replace(/\bca dem\b/g, " ");
    }
    if (/\b6\s*-\s*7\s*-\s*cn\b|\bt6\s*-\s*t7\s*-\s*cn\b|\bcuoi tuan\b|\bweekend\b/.test(s)) {
      days.push("weekend");
      s = s.replace(/\b6\s*-\s*7\s*-\s*cn\b|\bt6\s*-\s*t7\s*-\s*cn\b|\bcuoi tuan\b|\bweekend\b/g, " ");
    }
    if (/\bcamp\b|\bcampaign\b/.test(s)) {
      days.push("camp");
      s = s.replace(/\bcamp(?:aign)?\b/g, " ");
    }
    if (/\bdaily\b|\bngay thuong\b/.test(s)) {
      days.push("regular");
      s = s.replace(/\bdaily\b|\bngay thuong\b/g, " ");
    }
    const brandIds: string[] = [];
    for (const w of s.split(/\s+/).filter(Boolean)) {
      const id = brandOf(w, brands);
      if (id) brandIds.push(id);
      else if (!/^(tai|va|ca|nhan|host|tro)$/.test(w)) unknown.push(w);
    }
    if (brandIds.length === 0) {
      if (days.length === 0) continue;
      lastDays = days;
      prevWasDaysOnly = true;
      const prev = clauses[clauses.length - 1];
      if (prev && !prev.brandId) prev.days = [...new Set([...prev.days, ...days])];
      else clauses.push({ days: [...days] });
      continue;
    }
    // "(daily) JK": loại ngày đứng riêng ngay trước brand thì thuộc về brand đó.
    const prev = clauses[clauses.length - 1];
    if (days.length === 0 && prev && !prev.brandId && prevWasDaysOnly) clauses.pop();
    const useDays = days.length > 0 ? days : lastDays;
    if (days.length > 0) lastDays = days;
    prevWasDaysOnly = false;
    for (const id of brandIds) clauses.push({ brandId: id, days: [...useDays] });
  }
  return { clauses, night, unknown: [...new Set(unknown)] };
}
