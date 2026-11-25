import type { LiveSession, Talent } from "../../types";
import { sessionDurationHours } from "../pnl";
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

/** Vai được làm ở một kênh theo hồ sơ "Vai được xếp theo brand" (cài tay hoặc tự suy) — undefined = chưa cài, không hạn chế. */
export type RoleKindFn = (brandId: string, platform: string, talentId: string) => "host" | "assistant" | "both" | undefined;

/** Số ca vai phụ tối thiểu trong 2 tháng trước để coi là người làm 2 vai. */
export const DUAL_MIN_SESSIONS = 3;

/**
 * Người làm CẢ HAI vai trong tháng (lưới tự mở 2 dòng): hồ sơ vai có kênh "Cả hai" hoặc host ở kênh này / trợ ở kênh khác,
 * HOẶC 2 tháng dương lịch trước đã làm ≥ DUAL_MIN_SESSIONS ca mỗi vai.
 */
export function dualTalents(
  talentIds: readonly string[],
  brands: readonly GridBrand[],
  roleKind: RoleKindFn | undefined,
  sessions: readonly Pick<LiveSession, "date" | "status" | "hostId" | "assistantId" | "coHostId">[],
  month: string
): Set<string> {
  const out = new Set<string>();
  if (roleKind)
    for (const id of talentIds) {
      const kinds = new Set<string>();
      for (const b of brands) for (const p of b.platforms) {
        const k = roleKind(b.id, p, id);
        if (k) kinds.add(k);
      }
      if (kinds.has("both") || (kinds.has("host") && kinds.has("assistant"))) out.add(id);
    }
  const from = shiftMonth(month, -2);
  const cnt = new Map<string, { h: number; a: number }>();
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    const m = s.date.slice(0, 7);
    if (m < from || m >= month) continue;
    const bump = (id: string | undefined, k: "h" | "a") => {
      if (!id) return;
      const c = cnt.get(id) ?? { h: 0, a: 0 };
      c[k]++;
      cnt.set(id, c);
    };
    bump(s.hostId, "h");
    bump(s.coHostId || s.assistantId, "a");
  }
  for (const [id, c] of cnt) if (Math.min(c.h, c.a) >= DUAL_MIN_SESSIONS) out.add(id);
  return out;
}

const shiftMonth = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);

/** Khoá giờ thực tháng trước: `${talentId}|${role}|${brandId}` (cả brand) và `${talentId}|${role}|${brandId}|${platform}` (làn). */
export const prevKey = (talentId: string, role: RuleRole, brandId: string, platform?: string) => `${talentId}|${role}|${brandId}${platform ? `|${platform}` : ""}`;

/** Giờ đã làm (ca không huỷ) của tháng trước `month`, theo người × vai × brand (× sàn) — cho nút "So tháng trước". */
export function prevMonthRoleHours(
  sessions: readonly Pick<LiveSession, "date" | "status" | "hostId" | "assistantId" | "coHostId" | "brandId" | "platform" | "startTime" | "endTime">[],
  month: string
): { month: string; hours: Map<string, number> } {
  const prev = shiftMonth(month, -1);
  const hours = new Map<string, number>();
  const add = (k: string, h: number) => hours.set(k, (hours.get(k) ?? 0) + h);
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date.slice(0, 7) !== prev || !s.brandId) continue;
    const h = sessionDurationHours(s.startTime, s.endTime);
    for (const [id, role] of [[s.hostId, "host"], [s.coHostId || s.assistantId, "assistant"]] as const) {
      if (!id) continue;
      add(prevKey(id, role, s.brandId), h);
      add(prevKey(id, role, s.brandId, s.platform), h);
    }
  }
  return { month: prev, hours };
}

/**
 * Mọi host / trợ một dòng (kể cả người chưa có luật = mặc định tự suy). Người có luật vai còn lại, hoặc nằm trong `dual`
 * (làm 2 vai), có thêm dòng vai kia ngay dưới. Dòng chưa lưu của người 2 vai mượn trần tháng + nửa đầu của dòng đã lưu
 * (hai vai dùng chung) để khi gõ vào dòng mới không xoá mất trần tháng của dòng kia.
 */
export function buildGridRows(
  talents: readonly Pick<Talent, "id" | "role">[],
  rules: readonly MonthRule[],
  month: string,
  nameOf: (id: string) => string,
  auto: Readonly<Record<string, AutoInfo>>,
  dual: ReadonlySet<string> = new Set()
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
    if (byKey.has(ruleKey(id, other)) || dual.has(id)) roles.push(other);
    const a = auto[id];
    const shared = roles.map((r) => byKey.get(ruleKey(id, r))).find(Boolean);
    for (const role of roles) {
      const stored = byKey.get(ruleKey(id, role));
      const blank = emptyMonthRule(month, id, role);
      rows.push({
        key: ruleKey(id, role),
        talentId: id,
        name: nameOf(id),
        role,
        primary: role === main,
        dual: roles.length > 1,
        rule: stored ?? (shared ? { ...blank, maxHours: shared.maxHours, firstHalfMax: shared.firstHalfMax } : blank),
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
  /** Hồ sơ vai theo brand × sàn — ô của kênh người đó không được làm vai này bị gạch "chỉ Host / chỉ Trợ". */
  roleKind?: RoleKindFn;
  /** Sàn của từng brand (để biết ô Cả brand có bị chặn hết các sàn không). */
  brandPlatforms?: (brandId: string) => readonly string[];
  /** Giờ thực tháng trước (prevMonthRoleHours) — có thì ô "tự do" / "✓ nhận" hiện thêm số giờ đó. */
  prev?: { month: string; hours: ReadonlyMap<string, number> };
}

/** Ô không áp dụng: ô của brand đã bị loại "x" (trừ chính ô Cả brand). */
export const isNa = (row: GridRow, col: GridCol): boolean => !!col.brandId && col.kind !== "brand" && row.rule.brands[col.brandId]?.hours === "x";

/** Hồ sơ vai chặn vai của dòng này ở kênh (ô làn) / ở mọi sàn của brand (ô Cả brand) ⇒ "chỉ Host" | "chỉ Trợ"; null = làm được. */
export function roleBlock(row: GridRow, col: GridCol, ctx: Pick<GridCtx, "roleKind" | "brandPlatforms">): string | null {
  if (!ctx.roleKind || !col.brandId || (col.kind !== "lane" && col.kind !== "brand")) return null;
  const only = (p: string) => {
    const k = ctx.roleKind!(col.brandId!, p, row.talentId);
    return k && k !== "both" && k !== row.role ? k : null;
  };
  if (col.kind === "lane") {
    const k = only(col.platform!);
    return k ? (k === "host" ? "chỉ Host" : "chỉ Trợ") : null;
  }
  const plats = ctx.brandPlatforms?.(col.brandId) ?? [];
  if (plats.length === 0) return null;
  const ks = plats.map(only);
  if (ks.some((k) => k === null)) return null;
  return ks[0] === "host" ? "chỉ Host" : "chỉ Trợ";
}

const ROLE_WORD: Record<RuleRole, string> = { host: "Host", assistant: "Trợ" };

export function checkOf(row: GridRow, ctx: GridCtx): RuleCheck {
  const base = checkRule(row.rule, ctx.siblings(row.talentId), ctx.brandIds, ctx.brandName, row.rule.maxHours ?? row.autoMax ?? 0, row.avg ?? undefined);
  if (!ctx.roleKind) return base;
  // Ô đã có số nhưng hồ sơ vai nay chặn vai này ở kênh đó: số đó không bao giờ dùng tới.
  const extra: string[] = [];
  for (const [k, v] of Object.entries(row.rule.lanes)) {
    if (typeof v !== "number") continue;
    const [brandId, platform] = k.split("|");
    const kind = ctx.roleKind(brandId, platform, row.talentId);
    if (kind && kind !== "both" && kind !== row.role) extra.push(`${ctx.brandName(brandId)} ${platform}: hồ sơ chỉ cho ${ROLE_WORD[kind]}, trần ${ROLE_WORD[row.role]} không dùng tới`);
  }
  if (extra.length === 0) return base;
  return { level: base.level === "bad" ? "bad" : "warn", messages: [...base.messages, ...extra] };
}

export const autoHalf = (max: number) => Math.round(max * 0.5 * 1.1);

export function cellView(row: GridRow, col: GridCol, ctx: GridCtx): CellView {
  const r = row.rule;
  const v = (text: string, tone: Tone, editable = true, popover = false): CellView => ({ text, tone, editable: editable && !ctx.locked, popover });
  if (isNa(row, col)) return { text: "", tone: "na", editable: false, popover: false };
  const rb = roleBlock(row, col, ctx);
  if (rb) return { text: rb, tone: "na", editable: false, popover: false };
  const prevH = (platform?: string) => {
    const h = ctx.prev?.hours.get(prevKey(row.talentId, row.role, col.brandId!, platform));
    return h ? ` · T${Number(ctx.prev!.month.slice(5))} ${Math.round(h)}h` : "";
  };
  switch (col.kind) {
    case "name":
      return v(row.dual && !row.primary ? `↳ ${row.name}` : row.name, "ro", false);
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
      return r.roleHours !== null ? v(`${r.roleHours}h`, "manual") : v(row.dual ? "không chia" : "= trần tháng", "auto");
    case "days":
      return r.dayKinds.length ? v(dayText(r.dayKinds), "manual", true, true) : v("mọi ngày", "auto", true, true);
    case "night":
      return v(NIGHT_LABEL[r.night], r.night === "any" ? "auto" : "manual", true, true);
    case "brand": {
      const b = r.brands[col.brandId!];
      if (!b || (b.hours === null && b.days === null && b.night === null)) return v(`✓ nhận${prevH()}`, "ok", true, true);
      if (b.hours === "x") return v("✕ không nhận", "x", true, true);
      const parts = [typeof b.hours === "number" ? `${b.hours}h` : "", b.days ? (b.days.length ? dayText(b.days) : "mọi ngày") : "", b.night ? (b.night === "any" ? "đêm thường" : b.night === "only" ? "chỉ đêm" : "không đêm") : ""].filter(Boolean);
      return v(parts.join(" · ") || "✓ nhận", "manual", true, true);
    }
    case "lane": {
      const x = r.lanes[laneKey(col.brandId!, col.platform!)];
      if (x === undefined) return v(`tự do${prevH(col.platform)}`, "auto");
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
  if (col.kind === "lane" && c.tone === "auto") return "";
  if (col.kind === "brand" && c.tone === "ok") return "";
  if (c.tone === "auto" && (col.kind === "max" || col.kind === "half" || col.kind === "roleHours" || col.kind === "lane" || col.kind === "note")) return "";
  if (col.kind === "brand") return c.text.replace(/^✓ nhận.*$/, "").replace("✕ không nhận", "x");
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
