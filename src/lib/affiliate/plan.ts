import { AffiliateActualEntry, AffiliateEntryStatus } from "../../types";
import { CampOverrides, resolveCampBucketType } from "../campaignDays";

// Phần THUẦN của kế hoạch Affiliate (migration 0155). Không import supabaseClient để unit test chạy được
// (tests/affiliatePlan.test.ts) — đường đọc/ghi DB nằm ở lib/db/affiliateActuals.ts.
//
// Sheet kế hoạch của ops (T10/2026): Lịch live · Creator · Camp Name · Timeline · Duration · Target GMV · GMV/hour ·
// Đơn vị $ · Budget Ads · Note. Đo trên bản mẫu của ops: Duration = Timeline (10h-18h = 8; 20h-00h = 4; 19h-24h = 5),
// GMV/hour = Target ÷ Duration (700tr ÷ 8 = 87,5tr), $ = Target ÷ ~26.300, Budget Ads = 3% target (D-Day 3,5%). Nên ops chỉ
// phải nhập Ngày, Creator, Camp, Timeline, Target — mấy cột còn lại app tự tính (gõ đè được).

// "Pay Day" (có dấu cách) là tên chuẩn của cả app (metricGlossary, 26/09; tests/metricGlossary.test.ts cấm "Pay-Day" trong chữ
// hiển thị) — nhưng ô dán từ sheet "Pay - Day"/"Pay-Day" vẫn nhận được, xem normalizeCampName.
export const CAMP_NAMES = ["D-Day", "Mid-Month", "Pay Day", "Daily"] as const;
export type CampName = (typeof CAMP_NAMES)[number];

/** Tỷ giá mặc định cho cột "Đơn vị $" (đúng bản sheet của ops: 700.000.000 → $26.616). */
export const DEFAULT_FX_RATE = 26300;

/** Tỷ lệ Budget Ads mặc định trên target: D-Day 3,5%, còn lại 3% (đo trên sheet T10). Chỉ là gợi ý — ops gõ đè được. */
export function defaultBudgetRate(campName?: string): number {
  return normalizeCampName(campName) === "D-Day" ? 0.035 : 0.03;
}

export type AffiliateRow = AffiliateActualEntry & { _key: string };

export const entryStatus = (e: Pick<AffiliateActualEntry, "status">): AffiliateEntryStatus => e.status ?? "done";

/** "D - Day" / "d-day" / "Pay - Day" / "Pay-Day" / "mid month" → tên chuẩn ("Pay Day"); không nhận ra thì undefined. */
export function normalizeCampName(raw?: string | null): CampName | undefined {
  const k = (raw ?? "").toLowerCase().replace(/[\s\-_]/g, "");
  if (k === "dday") return "D-Day";
  if (k === "midmonth") return "Mid-Month";
  if (k === "payday") return "Pay Day";
  if (k === "daily") return "Daily";
  return undefined;
}

/** Tên camp gợi ý theo ngày — cùng luật với Kế Hoạch Tháng (khoảng ngày camp của tháng, thiếu thì lịch cố định). */
export function suggestCampName(isoDate: string, overrides?: CampOverrides): CampName {
  const b = resolveCampBucketType(isoDate, overrides);
  return b === "dday" ? "D-Day" : b === "midmonth" ? "Mid-Month" : b === "payday" ? "Pay Day" : "Daily";
}

/** "9/10/2026" | "09/10/2026" | "2026-10-09" → "2026-10-09"; sai ngày/tháng → null. */
export function parseDayLabel(label?: string | null): string | null {
  const s = (label ?? "").trim();
  let y: number, m: number, d: number;
  const vn = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (vn) [d, m, y] = [Number(vn[1]), Number(vn[2]), Number(vn[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "2026-10-09" → "9/10/2026" (đúng dạng dòng "Day" trong file ops). */
export function dayLabelOf(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}

export interface TimelineSpan {
  startMin: number;
  /** Đã cộng 24h khi qua nửa đêm (20h-00h → 1440). */
  endMin: number;
  hours: number;
}

/** "10h - 18h" · "19h - 24h" · "20h-00h" · "10:15 - 18:00" · "19h20 - 23h42" → khoảng giờ; không đọc được → null. */
export function parsePlanTimeline(label?: string | null): TimelineSpan | null {
  const m = (label ?? "").match(/(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*[-–—~]\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?/i);
  if (!m) return null;
  const sh = Number(m[1]);
  const eh = Number(m[3]);
  const sm = m[2] ? Number(m[2]) : 0;
  const em = m[4] ? Number(m[4]) : 0;
  if (sh > 24 || eh > 24 || sm > 59 || em > 59) return null;
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return { startMin, endMin, hours: Math.round(((endMin - startMin) / 60) * 10) / 10 };
}

type PlanFields = Pick<AffiliateActualEntry, "planDurationHours" | "planTimelineLabel" | "targetGmv" | "campName" | "planBudgetAds">;

/** Giờ kế hoạch: số ops gõ đè, không thì suy từ Timeline. */
export function planHours(e: PlanFields): number | undefined {
  return e.planDurationHours ?? parsePlanTimeline(e.planTimelineLabel)?.hours;
}

/** Budget Ads kế hoạch: số ops gõ đè, không thì target × tỷ lệ mặc định (3% / D-Day 3,5%). */
export function planBudget(e: PlanFields): number | undefined {
  if (e.planBudgetAds != null) return e.planBudgetAds;
  return e.targetGmv ? Math.round(e.targetGmv * defaultBudgetRate(e.campName)) : undefined;
}

/** Sắp theo ngày rồi giờ bắt đầu kế hoạch; dòng chưa có ngày hợp lệ xuống cuối. */
export function sortPlanRows<T extends Pick<AffiliateActualEntry, "liveDateLabel" | "planTimelineLabel">>(rows: T[]): T[] {
  return rows.slice().sort((a, b) => {
    const da = parseDayLabel(a.liveDateLabel) ?? "9999";
    const db = parseDayLabel(b.liveDateLabel) ?? "9999";
    if (da !== db) return da.localeCompare(db);
    return (parsePlanTimeline(a.planTimelineLabel)?.startMin ?? 0) - (parsePlanTimeline(b.planTimelineLabel)?.startMin ?? 0);
  });
}

export const planGmvPerHour = (e: PlanFields): number | undefined => {
  const h = planHours(e);
  return e.targetGmv && h ? e.targetGmv / h : undefined;
};

export const toUsd = (vnd: number | undefined, fxRate: number): number | undefined => (vnd && fxRate > 0 ? vnd / fxRate : undefined);

export interface PlanTotals {
  sessions: number;
  target: number;
  hours: number;
  budgetAds: number;
}

/** Tổng dòng kế hoạch — bỏ phiên đã huỷ/dời. */
export function planTotals(entries: (PlanFields & { status?: AffiliateEntryStatus })[]): PlanTotals {
  const t: PlanTotals = { sessions: 0, target: 0, hours: 0, budgetAds: 0 };
  for (const e of entries) {
    if ((e.status ?? "done") === "cancelled") continue;
    t.sessions += 1;
    t.target += e.targetGmv ?? 0;
    t.hours += planHours(e) ?? 0;
    t.budgetAds += planBudget(e) ?? 0;
  }
  return t;
}

/** Tháng mở sẵn của màn kế hoạch: từ ngày 20 là lúc ops lập kế hoạch tháng sau. `today` "YYYY-MM-DD". */
export function defaultAffiliatePlanMonth(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  if (d < 20) return today.slice(0, 7);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** "700.000.000" · "$26.616" · "3,5" · "24.500.000" → số; không đọc được → NaN. Dấu chấm là hàng nghìn, phẩy là thập phân. */
export function parseVnNumber(raw: string): number {
  const s = raw.replace(/[₫$đ\s]/gi, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+(,\d+)?$/.test(s)) return Number(s.replace(",", "."));
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return NaN;
}

export interface PastedPlanRow {
  date: string; // "YYYY-MM-DD"
  creatorName: string;
  campName?: CampName;
  planTimelineLabel?: string;
  planDurationHours?: number;
  targetGmv?: number;
  planBudgetAds?: number;
  note?: string;
}

/**
 * Đọc khối ô dán từ Google Sheet/Excel (các cột phân tách bằng Tab) theo bố cục sheet của ops:
 * Ngày · Creator · Camp · Timeline · Duration · Target · GMV/hour · $ · Budget Ads · Note.
 * Dòng không có ô ngày (tiêu đề "Lịch live/Creator…", dòng "Total") bị bỏ qua. Không dựa vào vị trí cột cố định:
 * ô ngày là mốc, creator là ô kế tiếp, Camp là ô nhận ra được tên camp, Timeline là ô nhận ra được khoảng giờ, các số sau
 * Timeline đọc theo thứ tự Duration (≤ 24) → Target → GMV/hour → $ → Budget Ads (GMV/hour và $ tự tính nên bỏ qua).
 */
export function parsePlanPaste(text: string): PastedPlanRow[] {
  const out: PastedPlanRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = (line.includes("\t") ? line.split("\t") : line.split(/\s{2,}/)).map((c) => c.trim());
    const di = cells.findIndex((c) => parseDayLabel(c) !== null);
    if (di < 0) continue;
    const date = parseDayLabel(cells[di])!;
    const creatorName = cells[di + 1] ?? "";
    if (!creatorName) continue;
    const rest = cells.slice(di + 2);

    const campCell = rest.find((c) => normalizeCampName(c));
    const ti = rest.findIndex((c) => parsePlanTimeline(c) !== null);
    const timeline = ti >= 0 ? rest[ti] : undefined;
    const after = ti >= 0 ? rest.slice(ti + 1) : rest;

    const nums: number[] = [];
    let note: string | undefined;
    for (const c of after) {
      if (c === "") continue;
      const n = parseVnNumber(c);
      if (Number.isNaN(n)) note = c;
      else nums.push(n);
    }
    let planDurationHours: number | undefined;
    if (nums.length > 0 && nums[0] <= 24) planDurationHours = nums.shift();
    const targetGmv = nums.shift();
    const planBudgetAds = nums.length >= 3 ? nums[2] : undefined; // [GMV/hour, $, Budget Ads]

    out.push({
      date,
      creatorName,
      campName: normalizeCampName(campCell),
      planTimelineLabel: timeline,
      planDurationHours,
      targetGmv,
      planBudgetAds,
      note
    });
  }
  return out;
}
