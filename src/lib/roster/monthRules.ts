import { DAY_KINDS, dayKindsOf, type DayKind } from "./placementRules";

// LUẬT ĐẶT GIỜ THEO THÁNG × NGƯỜI × VAI (migration 0229, lưới "Luật đặt giờ từng người"). Hàm thuần, không đụng DB.
//
// Một MonthRule = một (tháng, người, vai). Người làm cả host lẫn trợ có hai MonthRule; trần tháng + nửa đầu dùng chung cả hai.
// Mọi con số là trần TỐI ĐA. Bộ xếp tự fill đọc luật này (monthPlanner.ts):
//   - CỨNG: brand "x", làn "x", trần giờ brand / làn / vai (không ai khác thì ca để trống chứ không vượt trần).
//   - MỀM (trừ điểm rosterRuleMissPenalty): loại ngày, ca đêm — như luật 18/11 của chị Trainer.

export type RuleRole = "host" | "assistant";
export type NightRule = "any" | "only" | "no";
/** Ô giới hạn: số = trần giờ, "x" = không nhận / không xếp, null = tự do (chỉ chịu trần tháng). */
export type LimitCell = number | "x" | null;

export interface BrandRule {
  hours: LimitCell;
  /** null = theo loại ngày chung; mảng rỗng = mọi ngày. */
  days: DayKind[] | null;
  /** null = theo luật ca đêm chung. */
  night: NightRule | null;
}

export interface MonthRule {
  month: string;
  talentId: string;
  role: RuleRole;
  /** Trần giờ tháng / nửa đầu — dùng chung cả hai vai của người đó. */
  maxHours: number | null;
  firstHalfMax: number | null;
  /** Trần giờ riêng của vai (chia quỹ giờ giữa hai vai). */
  roleHours: number | null;
  dayKinds: DayKind[];
  night: NightRule;
  brands: Record<string, BrandRule>;
  /** Khoá "<brandId>|<TikTok|Shopee|Website>" (= channelKeyOf). */
  lanes: Record<string, number | "x">;
  note: string;
}

export const emptyBrandRule = (): BrandRule => ({ hours: null, days: null, night: null });
export const emptyMonthRule = (month: string, talentId: string, role: RuleRole): MonthRule => ({
  month,
  talentId,
  role,
  maxHours: null,
  firstHalfMax: null,
  roleHours: null,
  dayKinds: [],
  night: "any",
  brands: {},
  lanes: {},
  note: ""
});

export const ruleKey = (talentId: string, role: RuleRole) => `${talentId}|${role}`;

// ---------------------------------------------------------------------------------------------------------------------------
// Khoá tháng đã qua (cùng luật với trigger 0229: ngày cuối tháng < hôm nay).
// ---------------------------------------------------------------------------------------------------------------------------
export function monthLastDay(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export const isMonthLocked = (month: string, today: string) => monthLastDay(month) < today;

// ---------------------------------------------------------------------------------------------------------------------------
// Đọc luật cho một ca.
// ---------------------------------------------------------------------------------------------------------------------------
export interface RuleShift {
  date: string;
  brandId: string;
  platform: string;
  /** Ca đêm (kết thúc sau giờ khuya của luật Điều Phối). */
  night: boolean;
}

export const laneKey = (brandId: string, platform: string) => `${brandId}|${platform}`;

/** Ca có bị loại CỨNG không (brand / làn "x"). */
export function hardBlock(rule: MonthRule | undefined, s: RuleShift): string | null {
  if (!rule) return null;
  if (rule.brands[s.brandId]?.hours === "x") return "không nhận brand này";
  if (rule.lanes[laneKey(s.brandId, s.platform)] === "x") return "không xếp sàn này của brand";
  return null;
}

/** Ca có nằm trong luật MỀM (loại ngày + ca đêm, brand ghi đè luật chung) không. */
export function softFit(rule: MonthRule | undefined, s: RuleShift): { ok: boolean; reason?: string } {
  if (!rule) return { ok: true };
  const b = rule.brands[s.brandId];
  const days = b?.days ?? rule.dayKinds;
  const night = b?.night ?? rule.night;
  if (night === "only" && !s.night) return { ok: false, reason: "chỉ nhận ca đêm" };
  if (night === "no" && s.night) return { ok: false, reason: "không nhận ca đêm" };
  if (days.length > 0) {
    const kinds = dayKindsOf(s.date);
    if (!days.some((d) => kinds.has(d))) return { ok: false, reason: "ngoài loại ngày đã đặt" };
  }
  return { ok: true };
}

/** Các trần giờ áp cho một ca: vai / brand / làn (null = không có trần). */
export function hourCapsFor(rule: MonthRule | undefined, s: Pick<RuleShift, "brandId" | "platform">): { role: number | null; brand: number | null; lane: number | null } {
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  return {
    role: rule?.roleHours ?? null,
    brand: num(rule?.brands[s.brandId]?.hours),
    lane: num(rule?.lanes[laneKey(s.brandId, s.platform)])
  };
}

export const hasContent = (r: MonthRule): boolean =>
  r.maxHours !== null ||
  r.firstHalfMax !== null ||
  r.roleHours !== null ||
  r.dayKinds.length > 0 ||
  r.night !== "any" ||
  Object.values(r.brands).some((b) => b.hours !== null || b.days !== null || b.night !== null) ||
  Object.keys(r.lanes).length > 0;

// ---------------------------------------------------------------------------------------------------------------------------
// Kiểm tra luật (cột "Kiểm" của lưới). autoMax = trần tự suy khi chưa đặt trần tháng.
// ---------------------------------------------------------------------------------------------------------------------------
export interface RuleCheck {
  level: "ok" | "warn" | "bad";
  messages: string[];
}

export function checkRule(rule: MonthRule, siblings: readonly MonthRule[], brandIds: readonly string[], brandName: (id: string) => string, autoMax: number, avgHours?: number): RuleCheck {
  const bad: string[] = [];
  const warn: string[] = [];
  const cap = rule.maxHours ?? autoMax;
  // cap 0 = chưa biết trần (không đặt tay, chưa đủ lịch sử để tự suy) ⇒ bỏ mọi phép so với trần tháng.
  const known = cap > 0;
  if (known && rule.firstHalfMax !== null && rule.firstHalfMax > cap) bad.push("Nửa đầu lớn hơn trần tháng");
  if (brandIds.length > 0 && brandIds.every((id) => rule.brands[id]?.hours === "x")) bad.push("Không nhận brand nào");
  for (const [id, b] of Object.entries(rule.brands)) {
    if (known && typeof b.hours === "number" && b.hours > cap) bad.push(`${brandName(id)}: trần brand lớn hơn trần tháng`);
  }
  for (const [k, v] of Object.entries(rule.lanes)) {
    if (typeof v !== "number") continue;
    const [brandId, platform] = k.split("|");
    const bh = rule.brands[brandId]?.hours;
    if (typeof bh === "number" && v > bh) bad.push(`${brandName(brandId)} ${platform}: trần làn lớn hơn trần brand`);
  }
  const all = siblings.some((r) => r.role === rule.role) ? siblings.map((r) => (r.role === rule.role ? rule : r)) : [rule, ...siblings];
  const other = all.find((r) => r.role !== rule.role);
  const word = (r: RuleRole) => (r === "host" ? "Host" : "Trợ");
  // Trần vai là trần riêng của vai: brand / làn của chính vai đó không vượt được (bộ xếp dừng ở trần vai trước).
  if (rule.roleHours !== null) {
    for (const [id, b] of Object.entries(rule.brands)) if (typeof b.hours === "number" && b.hours > rule.roleHours) bad.push(`${brandName(id)}: trần brand lớn hơn trần vai ${rule.roleHours}h`);
    for (const [k, v] of Object.entries(rule.lanes)) {
      if (typeof v !== "number" || v <= rule.roleHours) continue;
      const [brandId, platform] = k.split("|");
      bad.push(`${brandName(brandId)} ${platform}: trần làn lớn hơn trần vai ${rule.roleHours}h`);
    }
  }
  if (other) {
    // Không bắt buộc chia giờ giữa 2 vai (mỗi vai đã có trần brand / làn riêng); chỉ báo khi số đặt vượt trần tháng.
    if (known && rule.roleHours !== null && other.roleHours !== null && rule.roleHours + other.roleHours > cap) bad.push(`Giờ 2 vai (${rule.roleHours + other.roleHours}h) vượt trần tháng ${cap}h`);
    for (const [k, v] of Object.entries(rule.lanes)) {
      const o = other.lanes[k];
      if (!known || typeof v !== "number" || typeof o !== "number" || v + o <= cap) continue;
      const [brandId, platform] = k.split("|");
      bad.push(`${brandName(brandId)} ${platform}: ${word(rule.role)} + ${word(other.role)} (${v + o}h) vượt trần tháng ${cap}h`);
    }
  }
  // Cộng trần brand (gộp mọi vai của người) thấp hơn trần tháng ⇒ người đó không bao giờ đạt trần tháng. Chỉ khi MỌI vai đều đã đặt trần mọi brand còn nhận.
  const openSum = (r: MonthRule): number | null => {
    const open = brandIds.filter((id) => r.brands[id]?.hours !== "x");
    if (open.length === 0) return 0;
    if (!open.every((id) => typeof r.brands[id]?.hours === "number")) return null;
    return open.reduce((t, id) => t + (r.brands[id].hours as number), 0);
  };
  const sums = all.map(openSum);
  if (known && bad.length === 0 && sums.every((x) => x !== null) && sums.some((x) => (x as number) > 0)) {
    const sum = sums.reduce((t: number, x) => t + (x as number), 0);
    if (sum < cap) warn.push(`Cộng trần brand${all.length > 1 ? " cả 2 vai" : ""} ${sum}h thấp hơn trần tháng ${cap}h, hụt ${cap - sum}h`);
  }
  if (bad.length === 0 && rule.maxHours !== null && avgHours && avgHours > 0 && rule.maxHours < avgHours * 0.7) warn.push(`Thấp hơn TB ${Math.round((1 - rule.maxHours / avgHours) * 100)}%`);
  return { level: bad.length ? "bad" : warn.length ? "warn" : "ok", messages: [...bad, ...warn] };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Câu đọc được của một luật.
// ---------------------------------------------------------------------------------------------------------------------------
const DAY_SHORT: Record<DayKind, string> = { weekend: "6-7-CN", camp: "Camp", regular: "Thường" };
const NIGHT_TEXT: Record<NightRule, string> = { any: "", only: "chỉ ca đêm", no: "không ca đêm" };

export function describeMonthRule(rule: MonthRule, brandName: (id: string) => string, autoMax: number): string {
  const parts: string[] = [rule.maxHours !== null ? `≤${rule.maxHours}h/tháng` : autoMax > 0 ? `trần tự suy ${autoMax}h` : "chưa đủ lịch sử để tự suy trần"];
  if (rule.roleHours !== null) parts.push(`vai này ≤${rule.roleHours}h`);
  const g: string[] = [];
  if (rule.dayKinds.length) g.push(rule.dayKinds.map((d) => DAY_SHORT[d]).join("+"));
  if (rule.night !== "any") g.push(NIGHT_TEXT[rule.night]);
  if (g.length) parts.push(g.join(", "));
  const bs: string[] = [];
  for (const [id, b] of Object.entries(rule.brands)) {
    if (b.hours === "x") {
      bs.push(`${brandName(id)} ✕`);
      continue;
    }
    const f: string[] = [];
    if (typeof b.hours === "number") f.push(`≤${b.hours}h`);
    if (b.days) f.push(b.days.length ? b.days.map((d) => DAY_SHORT[d]).join("+") : "mọi ngày");
    if (b.night) f.push(b.night === "any" ? "đêm thường" : NIGHT_TEXT[b.night]);
    for (const [k, v] of Object.entries(rule.lanes)) {
      const [bid, platform] = k.split("|");
      if (bid === id) f.push(v === "x" ? `không ${platform}` : `${platform} ≤${v}h`);
    }
    if (f.length) bs.push(`${brandName(id)}: ${f.join(", ")}`);
  }
  for (const [k, v] of Object.entries(rule.lanes)) {
    const [bid, platform] = k.split("|");
    if (rule.brands[bid] && (rule.brands[bid].hours !== null || rule.brands[bid].days || rule.brands[bid].night)) continue;
    bs.push(`${brandName(bid)}: ${v === "x" ? `không ${platform}` : `${platform} ≤${v}h`}`);
  }
  if (bs.length) parts.push(bs.join(" · "));
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------------------------
// Chép luật sang tháng khác / tạo bản trống.
// ---------------------------------------------------------------------------------------------------------------------------
export function copyRulesToMonth(rules: readonly MonthRule[], month: string, mode: "copy" | "reset"): MonthRule[] {
  return rules.map((r) => (mode === "copy" ? { ...structuredClone(r), month } : { ...emptyMonthRule(month, r.talentId, r.role), roleHours: null }));
}

/** Luật người dùng nhập vào Excel/Sheet có thể sai: chỉ giữ loại ngày hợp lệ. */
export const cleanDayKinds = (raw: unknown): DayKind[] => (Array.isArray(raw) ? [...new Set(raw.filter((d): d is DayKind => (DAY_KINDS as readonly unknown[]).includes(d)))] : []);

/** Đầu vào của bộ xếp (monthPlanner.PlanTuning) từ luật của một tháng: trần giờ tháng/nửa đầu theo người + luật theo (người, vai). */
export function plannerInputsFromRules(rules: readonly MonthRule[]): {
  personCaps: Record<string, { monthMax: number; firstHalfMax?: number }>;
  monthRules: Record<string, Partial<Record<"host" | "co_host", MonthRule>>>;
} {
  const personCaps: Record<string, { monthMax: number; firstHalfMax?: number }> = {};
  const monthRules: Record<string, Partial<Record<"host" | "co_host", MonthRule>>> = {};
  for (const r of rules) {
    if (r.maxHours !== null && r.maxHours > 0 && !personCaps[r.talentId]) personCaps[r.talentId] = { monthMax: r.maxHours, ...(r.firstHalfMax !== null && r.firstHalfMax > 0 ? { firstHalfMax: r.firstHalfMax } : {}) };
    if (!hasContent(r)) continue;
    (monthRules[r.talentId] ??= {})[r.role === "host" ? "host" : "co_host"] = r;
  }
  return { personCaps, monthRules };
}
