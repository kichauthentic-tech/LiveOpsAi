import type { CampDayBucket } from "../campaignDays";

// Ads theo ngày dán từ file tracking của brand (CROCS "Performance Tracking", sheet "Daily Ads Report"; migration 0184).
// Khối dán là bảng tab: Month · Date · Target by TTS · TARGET Total/Live/Product/Creator · ACTUAL Total/Live/Product/Creator ·
// Daily Runrate · (trống) · MTD target ×4 · MTD actual ×4 · MTD Runrate · NOTE … App chỉ lấy 11 cột đầu + ghi chú chữ; cột
// MTD/runrate tự tính lại ở `adsTrackingMonth` — sheet cộng cả target những ngày CHƯA tới vào MTD target, nên sau ngày cuối có
// số runrate tụt giả (CROCS T10: sheet −9,5% ngày 31/10, đúng là −4,8% tới 25/10).

export type AdsPart = "live" | "product" | "creator";
export const ADS_PARTS: AdsPart[] = ["live", "product", "creator"];
export const ADS_PART_LABEL: Record<AdsPart, string> = { live: "Live", product: "Product (GMV Max)", creator: "Creator" };

export interface AdsSide {
  total: number | null;
  live: number | null;
  product: number | null;
  creator: number | null;
}

export interface AdsDayRow {
  date: string; // YYYY-MM-DD
  ttsTarget: number | null;
  target: AdsSide;
  /** null = ngày chưa có số thực (sheet ghi 0/để trống cho ngày chưa tới). */
  actual: AdsSide | null;
  note: string | null;
}

export interface AdsPasteResult {
  rows: AdsDayRow[];
  /** Dòng có ngày mà đọc không được / tổng lệch tổng các phần — nói rõ để ops kiểm lại trước khi lưu. */
  warnings: string[];
  /** Dòng bỏ qua (tiêu đề, dòng tổng, dòng trống). */
  skipped: number;
}

/**
 * Số dạng Việt Nam ("7.464.852", "1,5") hoặc dạng Excel thô ("7464852.387", "7,464,852"). Rỗng / chữ ⇒ null.
 * Một dấu chấm mà phần trước ≤ 3 chữ số và sau đúng 3 chữ số ("741.845") là dấu nghìn; phần trước dài hơn ("7464852.387") là thập phân.
 */
export function parseVnNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/\s|₫|đ|VND/gi, "");
  if (!s || s === "-" || /[a-zA-ZÀ-ỹ%#]/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/^[(-]|\)$/g, "");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots > 1 || (dots === 1 && commas === 1 && s.indexOf(".") < s.indexOf(","))) s = s.replace(/\./g, "").replace(",", ".");
  else if (commas > 1 || (dots === 1 && commas === 1)) s = s.replace(/,/g, "");
  else if (dots === 1) {
    const [a, b] = s.split(".");
    if (b.length === 3 && a.length <= 3) s = a + b;
  } else if (commas === 1) {
    const [a, b] = s.split(",");
    s = b.length === 3 && a.length <= 3 ? a + b : `${a}.${b}`;
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? (neg ? -v : v) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "01/03", "1/3/2026", "2026-03-01", "2026-03-01 00:00:00" ⇒ YYYY-MM-DD. Năm thiếu ⇒ `year`. */
export function parseDayCell(raw: string, year: number): string | null {
  const s = raw.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2];
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(y, mo, 0).getDate()) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

const side = (cells: string[], from: number): AdsSide => ({
  total: parseVnNumber(cells[from]),
  live: parseVnNumber(cells[from + 1]),
  product: parseVnNumber(cells[from + 2]),
  creator: parseVnNumber(cells[from + 3])
});
const partsSum = (s: AdsSide) => (s.live ?? 0) + (s.product ?? 0) + (s.creator ?? 0);
const hasParts = (s: AdsSide) => s.live != null || s.product != null || s.creator != null;
/** Tổng của một vế: cột Total nếu có, không thì cộng các phần. */
export const sideTotal = (s: AdsSide): number => s.total ?? partsSum(s);

/**
 * Đọc khối dán. `year`: năm cho ngày dạng "dd/mm" (sheet không ghi năm). Cột 0 = tháng, cột 1 = ngày — dòng nào cột 1 không phải
 * ngày (tiêu đề, dòng tổng cuối) thì bỏ. Ngày trùng trong một lần dán ⇒ lấy dòng sau.
 */
export function parseAdsTrackingPaste(text: string, year: number): AdsPasteResult {
  const byDate = new Map<string, AdsDayRow>();
  const warnings: string[] = [];
  let skipped = 0;
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const cells = line.split("\t");
    const date = cells.length > 1 ? parseDayCell(cells[1] ?? "", year) : null;
    if (!date) {
      if (line.trim()) skipped++;
      continue;
    }
    const monthCell = parseVnNumber(cells[0]);
    if (monthCell != null && monthCell !== Number(date.slice(5, 7))) warnings.push(`${date}: cột Month ghi ${monthCell} nhưng ngày thuộc tháng ${Number(date.slice(5, 7))} — đã lấy theo ngày.`);
    const target = side(cells, 3);
    const actualRaw = side(cells, 7);
    // Sheet ghi 0 ở Total cho ngày chưa tới và để trống các phần ⇒ coi là chưa có số.
    const actual = hasParts(actualRaw) || (actualRaw.total ?? 0) > 0 ? actualRaw : null;
    for (const [name, s] of [["target", target], ["actual", actual]] as const) {
      if (s && s.total != null && hasParts(s) && Math.abs(s.total - partsSum(s)) > 1) {
        warnings.push(`${date}: ${name === "target" ? "target" : "thực tế"} Total ${s.total.toLocaleString("vi-VN")} khác tổng Live + Product + Creator ${partsSum(s).toLocaleString("vi-VN")}.`);
      }
    }
    // Ghi chú = ô chữ đầu tiên từ cột NOTE (22) trở đi; ô số ở đó (chênh lệch sheet tự tính) bỏ qua.
    const note = cells.slice(22).map((c) => c.trim()).find((c) => c && parseVnNumber(c) == null && !/^-?[\d.,]+%$/.test(c)) ?? null;
    byDate.set(date, { date, ttsTarget: parseVnNumber(cells[2]), target, actual, note });
  }
  return { rows: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)), warnings, skipped };
}

/** Năm mặc định cho khối dán không ghi năm: năm nay; tháng trong khối lớn hơn tháng hiện tại 2 tháng trở lên ⇒ năm trước. */
export function defaultPasteYear(text: string, today: string): number {
  const y = Number(today.slice(0, 4));
  const cur = Number(today.slice(5, 7));
  const months = text.split("\n").map((l) => parseVnNumber(l.split("\t")[0])).filter((m): m is number => m != null && m >= 1 && m <= 12);
  return months.length && Math.max(...months) > cur + 1 ? y - 1 : y;
}

// ---------- tháng ----------

export interface AdsAmount {
  target: number;
  actual: number;
}
const emptyParts = (): Record<AdsPart, AdsAmount> => ({ live: { target: 0, actual: 0 }, product: { target: 0, actual: 0 }, creator: { target: 0, actual: 0 } });

export interface AdsMonthSummary {
  month: string;
  days: number;
  /** Ngày cuối có số thực (null = chưa ngày nào). */
  lastActual: string | null;
  /** Target cả tháng (cộng target mọi ngày đã dán). */
  monthTarget: number;
  /** Cắt tới `lastActual`: target luỹ kế, thực tế luỹ kế, runrate = thực tế ÷ target − 1. */
  mtdTarget: number;
  mtdActual: number;
  runrate: number | null;
  /** Thực tế tới nay ÷ target cả tháng — % ngân sách tháng đã chi. */
  spentOfMonth: number | null;
  /** Từng phần, cắt tới `lastActual` (target luỹ kế vs thực tế). */
  parts: Record<AdsPart, AdsAmount>;
  /** Theo loại ngày, chỉ các ngày đã có số thực. `liveAds` = Ads Live thực tế; `liveGmv` = LIVE GMV YFB cùng ngày (khi truyền vào). */
  buckets: Partial<Record<CampDayBucket, AdsAmount & { days: number; liveAds: number; liveGmv: number }>>;
  /** LIVE GMV YFB ÷ Ads Live thực tế (các ngày đã có số) — null khi không truyền LIVE GMV hoặc Ads Live = 0. */
  liveRoas: number | null;
  /** Ngày chi lệch target từ 30% trở lên (đã có số), kèm ghi chú của sheet. */
  offDays: { date: string; target: number; actual: number; pct: number; note: string | null }[];
  ttsTargetDaily: number | null;
}

/** Tổng hợp một tháng. `bucketOf` = loại ngày theo khung camp hiệu lực (cùng hàm với report). */
export function adsTrackingMonth(rows: AdsDayRow[], month: string, bucketOf: (date: string) => CampDayBucket, liveGmvByDate?: Map<string, number>): AdsMonthSummary {
  const inMonth = rows.filter((r) => r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
  const withActual = inMonth.filter((r) => r.actual);
  const lastActual = withActual.length ? withActual[withActual.length - 1].date : null;
  const parts = emptyParts();
  const buckets: AdsMonthSummary["buckets"] = {};
  let monthTarget = 0, mtdTarget = 0, mtdActual = 0;
  const offDays: AdsMonthSummary["offDays"] = [];
  for (const r of inMonth) {
    const t = sideTotal(r.target);
    monthTarget += t;
    if (!lastActual || r.date > lastActual) continue;
    const a = r.actual ? sideTotal(r.actual) : 0;
    mtdTarget += t;
    mtdActual += a;
    for (const p of ADS_PARTS) {
      parts[p].target += r.target[p] ?? 0;
      parts[p].actual += r.actual?.[p] ?? 0;
    }
    if (r.actual) {
      const b = bucketOf(r.date);
      const cur = buckets[b] ?? { target: 0, actual: 0, days: 0, liveAds: 0, liveGmv: 0 };
      buckets[b] = { target: cur.target + t, actual: cur.actual + a, days: cur.days + 1, liveAds: cur.liveAds + (r.actual.live ?? 0), liveGmv: cur.liveGmv + (liveGmvByDate?.get(r.date) ?? 0) };
      if (t > 0 && Math.abs(a / t - 1) >= 0.3) offDays.push({ date: r.date, target: t, actual: a, pct: (a / t - 1) * 100, note: r.note });
    }
  }
  const tts = inMonth.find((r) => r.ttsTarget != null)?.ttsTarget ?? null;
  const bs = Object.values(buckets);
  const liveAds = bs.reduce((x, b) => x + b.liveAds, 0);
  const liveGmv = bs.reduce((x, b) => x + b.liveGmv, 0);
  return {
    month,
    days: inMonth.length,
    lastActual,
    monthTarget,
    mtdTarget,
    mtdActual,
    runrate: mtdTarget > 0 ? (mtdActual / mtdTarget - 1) * 100 : null,
    spentOfMonth: monthTarget > 0 && lastActual ? (mtdActual / monthTarget) * 100 : null,
    parts,
    buckets,
    offDays,
    ttsTargetDaily: tts,
    liveRoas: liveGmvByDate && liveAds > 0 ? liveGmv / liveAds : null
  };
}

/** Tháng có trong khối dán (để xem trước): số ngày, target tháng, thực tế tới ngày cuối có số. */
export function pasteMonths(rows: AdsDayRow[]): { month: string; days: number; target: number; actual: number; lastActual: string | null }[] {
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  return months.map((m) => {
    const s = adsTrackingMonth(rows, m, () => "daily");
    return { month: m, days: s.days, target: s.monthTarget, actual: s.mtdActual, lastActual: s.lastActual };
  });
}
