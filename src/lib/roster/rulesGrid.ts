import type { Talent } from "../../types";
import type { DayKind } from "./placementRules";
import { checkRule, describeMonthRule, emptyBrandRule, emptyMonthRule, laneKey, ruleKey, type BrandRule, type MonthRule, type NightRule, type RuleCheck, type RuleRole } from "./monthRules";

// Phần THUẦN của lưới "Luật đặt giờ từng người" (PersonRulesGrid.tsx): dựng dòng/cột, hiển thị một ô, đọc chữ gõ/dán vào một ô.
// Tách riêng để test được mà không cần dựng màn hình.

export interface GridBrand {
  id: string;
  name: string;
  /** Sàn brand có kênh (TikTok / Shopee / Website). */
  platforms: string[];
}

export type ColKind = "name" | "role" | "avg" | "auto" | "max" | "half" | "roleHours" | "days" | "night" | "brand" | "lane" | "note" | "sum" | "chk";

export interface GridCol {
  id: string;
  group: string;
  label: string;
  kind: ColKind;
  brandId?: string;
  platform?: string;
  /** Rộng tối thiểu (px). */
  w: number;
}

export interface GridRow {
  key: string;
  talentId: string;
  name: string;
  role: RuleRole;
  /** Vai chính theo hồ sơ talent. */
  primary: boolean;
  /** Người này có luật cả hai vai. */
  dual: boolean;
  rule: MonthRule;
  /** Đã có dòng lưu trong DB / bộ nhớ (hay chỉ là mặc định). */
  stored: boolean;
  avg: number | null;
  autoMax: number | null;
}

export const ROLE_OF_TALENT = (t: Pick<Talent, "role">): RuleRole | null => (t.role === "Host" ? "host" : t.role === "Assistant" ? "assistant" : null);
export const otherRole = (r: RuleRole): RuleRole => (r === "host" ? "assistant" : "host");

export interface AutoInfo {
  monthMax: number;
  avg: number;
}

/** Mọi host / trợ một dòng (kể cả người chưa có luật = mặc định tự suy); người có luật vai còn lại thêm dòng thứ hai ngay dưới. */
export function buildGridRows(
  talents: readonly Pick<Talent, "id" | "role">[],
  rules: readonly MonthRule[],
  month: string,
  nameOf: (id: string) => string,
  auto: Readonly<Record<string, AutoInfo>>
): GridRow[] {
  const byKey = new Map(rules.map((r) => [ruleKey(r.talentId, r.role), r]));
  const rows: GridRow[] = [];
  const ids = new Set<string>();
  const people = [...talents].filter((t) => ROLE_OF_TALENT(t) !== null || rules.some((r) => r.talentId === t.id));
  for (const t of people) ids.add(t.id);
  for (const r of rules) if (!ids.has(r.talentId)) ids.add(r.talentId); // luật của người không còn trong danh sách vẫn hiện (không mất dữ liệu)
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const sorted = [...ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b), "vi"));
  for (const id of sorted) {
    const t = talentById.get(id);
    const main: RuleRole = (t && ROLE_OF_TALENT(t)) ?? (byKey.has(ruleKey(id, "host")) ? "host" : "assistant");
    const roles: RuleRole[] = [main];
    const other = otherRole(main);
    if (byKey.has(ruleKey(id, other))) roles.push(other);
    const a = auto[id];
    for (const role of roles) {
      const stored = byKey.get(ruleKey(id, role));
      rows.push({
        key: ruleKey(id, role),
        talentId: id,
        name: nameOf(id),
        role,
        primary: role === main,
        dual: roles.length > 1,
        rule: stored ?? emptyMonthRule(month, id, role),
        stored: !!stored,
        avg: a ? a.avg : null,
        autoMax: a ? a.monthMax : null
      });
    }
  }
  return rows;
}

export function buildGridCols(brands: readonly GridBrand[]): GridCol[] {
  const cols: GridCol[] = [
    { id: "name", group: "Người", label: "Tên", kind: "name", w: 120 },
    { id: "role", group: "Người", label: "Vai", kind: "role", w: 84 },
    { id: "avg", group: "Giờ / tháng", label: "TB 3 tháng", kind: "avg", w: 92 },
    { id: "auto", group: "Giờ / tháng", label: "Trần tự suy", kind: "auto", w: 96 },
    { id: "max", group: "Giờ / tháng", label: "Trần tháng", kind: "max", w: 96 },
    { id: "half", group: "Giờ / tháng", label: "Nửa đầu", kind: "half", w: 84 },
    { id: "roleHours", group: "Giờ / tháng", label: "Trần giờ vai", kind: "roleHours", w: 104 },
    { id: "days", group: "Luật chung (mọi brand)", label: "Loại ngày", kind: "days", w: 150 },
    { id: "night", group: "Luật chung (mọi brand)", label: "Ca đêm", kind: "night", w: 104 }
  ];
  for (const b of brands) {
    cols.push({ id: `brand:${b.id}`, group: b.name, label: "Cả brand", kind: "brand", brandId: b.id, w: 150 });
    for (const p of b.platforms) cols.push({ id: `lane:${b.id}|${p}`, group: b.name, label: p, kind: "lane", brandId: b.id, platform: p, w: 84 });
  }
  cols.push(
    { id: "note", group: "Ghi chú", label: "Ghi chú", kind: "note", w: 200 },
    { id: "sum", group: "Kiểm tra", label: "Luật đọc được", kind: "sum", w: 340 },
    { id: "chk", group: "Kiểm tra", label: "Kiểm", kind: "chk", w: 190 }
  );
  return cols;
}

const DAY_SHORT: Record<DayKind, string> = { weekend: "6-7-CN", camp: "Camp", regular: "Thường" };
export const dayText = (d: readonly DayKind[]) => d.map((x) => DAY_SHORT[x]).join(" · ");
const NIGHT_LABEL: Record<NightRule, string> = { any: "không đặt", only: "Chỉ đêm", no: "Không đêm" };

export type Tone = "auto" | "manual" | "x" | "na" | "ro" | "ok" | "bad";
export interface CellView {
  text: string;
  tone: Tone;
  editable: boolean;
  /** Cột mở popover chọn thay vì gõ trực tiếp. */
  popover: boolean;
}

export interface GridCtx {
  brandName: (id: string) => string;
  brandIds: readonly string[];
  siblings: (talentId: string) => readonly MonthRule[];
  locked: boolean;
}

/** Ô không áp dụng: ô của brand đã bị loại "x" (trừ chính ô Cả brand). */
export const isNa = (row: GridRow, col: GridCol): boolean => !!col.brandId && col.kind !== "brand" && row.rule.brands[col.brandId]?.hours === "x";

export function checkOf(row: GridRow, ctx: GridCtx): RuleCheck {
  return checkRule(row.rule, ctx.siblings(row.talentId), ctx.brandIds, ctx.brandName, row.rule.maxHours ?? row.autoMax ?? 0, row.avg ?? undefined);
}

export const autoHalf = (max: number) => Math.round(max * 0.5 * 1.1);

export function cellView(row: GridRow, col: GridCol, ctx: GridCtx): CellView {
  const r = row.rule;
  const v = (text: string, tone: Tone, editable = true, popover = false): CellView => ({ text, tone, editable: editable && !ctx.locked, popover });
  if (isNa(row, col)) return { text: "", tone: "na", editable: false, popover: false };
  switch (col.kind) {
    case "name":
      return v(row.dual ? (row.primary ? row.name : `↳ ${row.name}`) : row.name, "ro", false);
    case "role":
      return v(row.role === "host" ? "Host" : "Trợ", "ro", false, true);
    case "avg":
      return v(row.avg !== null ? `${Math.round(row.avg)}h` : "—", "ro", false);
    case "auto":
      return v(row.autoMax !== null ? `${Math.round(row.autoMax)}h` : "—", "ro", false);
    case "max":
      return r.maxHours !== null ? v(`${r.maxHours}h`, "manual") : v(row.autoMax !== null ? `${Math.round(row.autoMax)}h` : "—", "auto");
    case "half": {
      if (r.firstHalfMax !== null) return v(`${r.firstHalfMax}h`, "manual");
      const m = r.maxHours ?? row.autoMax;
      return v(m ? `${autoHalf(m)}h` : "—", "auto");
    }
    case "roleHours":
      return r.roleHours !== null ? v(`${r.roleHours}h`, "manual") : v(row.dual ? "chưa chia" : "= trần tháng", row.dual ? "bad" : "auto");
    case "days":
      return r.dayKinds.length ? v(dayText(r.dayKinds), "manual", true, true) : v("mọi ngày", "auto", true, true);
    case "night":
      return v(NIGHT_LABEL[r.night], r.night === "any" ? "auto" : "manual", true, true);
    case "brand": {
      const b = r.brands[col.brandId!];
      if (!b || (b.hours === null && b.days === null && b.night === null)) return v("✓ nhận", "ok", true, true);
      if (b.hours === "x") return v("✕ không nhận", "x", true, true);
      const parts = [typeof b.hours === "number" ? `${b.hours}h` : "", b.days ? (b.days.length ? dayText(b.days) : "mọi ngày") : "", b.night ? (b.night === "any" ? "đêm thường" : b.night === "only" ? "chỉ đêm" : "không đêm") : ""].filter(Boolean);
      return v(parts.join(" · ") || "✓ nhận", "manual", true, true);
    }
    case "lane": {
      const x = r.lanes[laneKey(col.brandId!, col.platform!)];
      if (x === undefined) return v("tự do", "auto");
      return x === "x" ? v("✕", "x") : v(`${x}h`, "manual");
    }
    case "note":
      return v(r.note, r.note ? "manual" : "auto");
    case "sum":
      return v(describeMonthRule(r, ctx.brandName, r.maxHours ?? row.autoMax ?? 0), "ro", false);
    case "chk": {
      const c = checkOf(row, ctx);
      return v(c.level === "ok" ? "✓ Ổn" : `${c.level === "bad" ? "✕" : "▲"} ${c.messages.slice(0, 2).join("; ")}`, c.level === "ok" ? "ok" : c.level === "bad" ? "bad" : "x", false);
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------
// Đọc chữ gõ / dán vào một ô → luật mới (hàm thuần, không đụng bản gốc). Trả null nếu cột không sửa được.
// ---------------------------------------------------------------------------------------------------------------------------
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

export function parseDays(s: string): DayKind[] {
  const f = fold(s);
  const out: DayKind[] = [];
  if (/6-?7|cuoi tuan|\bcn\b|weekend/.test(f)) out.push("weekend");
  if (/camp/.test(f)) out.push("camp");
  if (/daily|thuong|regular/.test(f)) out.push("regular");
  return out;
}
export function parseNight(s: string): NightRule {
  const f = fold(s);
  if (/chi|only/.test(f)) return "only";
  if ((/khong|^no$/.test(f)) && !/khong dat/.test(f)) return "no";
  return "any";
}
const isX = (s: string) => {
  const f = fold(s.trim());
  return f === "x" || s.trim() === "✕" || /^khong (nhan|xep)/.test(f);
};
const toNum = (s: string): number | null => {
  const m = s.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  return m ? Math.round(Number(m[0])) : null;
};

export function applyCellText(rule: MonthRule, col: GridCol, raw: string): MonthRule | null {
  const s = raw.trim();
  const f = fold(s);
  const next: MonthRule = { ...rule, brands: { ...rule.brands }, lanes: { ...rule.lanes } };
  switch (col.kind) {
    case "max": {
      const n = s === "" ? null : toNum(s);
      if (s !== "" && (n === null || n <= 0)) return null;
      next.maxHours = n;
      return next;
    }
    case "half": {
      const n = s === "" ? null : toNum(s);
      if (s !== "" && (n === null || n < 0)) return null;
      next.firstHalfMax = n;
      return next;
    }
    case "roleHours": {
      const n = s === "" || /^=|chua chia/.test(f) ? null : toNum(s);
      if (s !== "" && !/^=|chua chia/.test(f) && (n === null || n < 0)) return null;
      next.roleHours = n;
      return next;
    }
    case "days":
      next.dayKinds = parseDays(s);
      return next;
    case "night":
      next.night = parseNight(s);
      return next;
    case "brand": {
      const id = col.brandId!;
      const cur: BrandRule = next.brands[id] ?? emptyBrandRule();
      let b: BrandRule;
      if (s === "" || s === "✓" || /chung|^✓|^nhan$|^co$/.test(f)) b = emptyBrandRule();
      else if (isX(s)) b = { ...cur, hours: "x" };
      else {
        const days = parseDays(s);
        const n = toNum(s.replace(/6\s*-\s*7(\s*-\s*cn)?/gi, ""));
        b = { hours: n !== null ? n : cur.hours === "x" ? null : cur.hours, days: days.length ? days : /moi ngay/.test(f) ? [] : cur.days, night: /\bdem\b|\bdem$/.test(f) ? parseNight(s) : cur.night };
      }
      if (b.hours === null && b.days === null && b.night === null) delete next.brands[id];
      else next.brands[id] = b;
      return next;
    }
    case "lane": {
      const k = laneKey(col.brandId!, col.platform!);
      if (s === "" || /tu do/.test(f)) delete next.lanes[k];
      else if (isX(s)) next.lanes[k] = "x";
      else {
        const n = toNum(s);
        if (n === null || n < 0) return null;
        next.lanes[k] = n;
      }
      return next;
    }
    case "note":
      next.note = s;
      return next;
    default:
      return null;
  }
}

/** Xoá một ô về mặc định (phím Del). */
export const clearCellRule = (rule: MonthRule, col: GridCol): MonthRule | null => (col.kind === "days" || col.kind === "night" || col.kind === "brand" || col.kind === "lane" || col.kind === "max" || col.kind === "half" || col.kind === "roleHours" || col.kind === "note" ? applyCellText(rule, col, col.kind === "days" ? "" : col.kind === "night" ? "khong dat" : "") : null);

/** Chữ của ô khi chép (Ctrl+C) / bắt đầu sửa. */
export function cellText(row: GridRow, col: GridCol, ctx: GridCtx): string {
  const c = cellView(row, col, ctx);
  if (c.tone === "na") return "";
  if (c.tone === "auto" && (col.kind === "max" || col.kind === "half" || col.kind === "roleHours" || col.kind === "lane" || col.kind === "note")) return "";
  if (col.kind === "brand") return c.text.replace("✓ nhận", "").replace("✕ không nhận", "x");
  if (col.kind === "lane" && c.text === "✕") return "x";
  if (col.kind === "days" && c.tone === "auto") return "";
  if (col.kind === "night" && c.tone === "auto") return "";
  return c.text.replace(/h$/, "");
}

/** Cột nào hiện khi lọc brand / sàn / vai. */
export function visibleCols(cols: readonly GridCol[], f: { brand: string; platform: string; role: "all" | RuleRole; hidden: ReadonlySet<string> }): GridCol[] {
  return cols.filter((c) => {
    if (f.hidden.has(c.group)) return false;
    if (f.brand !== "all" && c.brandId && c.brandId !== f.brand) return false;
    if (f.platform !== "all" && c.kind === "lane" && c.platform !== f.platform) return false;
    if (c.kind === "roleHours" && f.role !== "all") return true;
    return true;
  });
}

/** Người này còn xếp được sàn `platform` ở ít nhất một brand (để làm mờ dòng khi lọc sàn). */
export const canDoPlatform = (rule: MonthRule, brands: readonly GridBrand[], platform: string, brandFilter = "all"): boolean =>
  brands.some((b) => (brandFilter === "all" || b.id === brandFilter) && b.platforms.includes(platform) && rule.brands[b.id]?.hours !== "x" && rule.lanes[laneKey(b.id, platform)] !== "x");
