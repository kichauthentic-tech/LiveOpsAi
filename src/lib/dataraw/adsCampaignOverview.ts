import type { DataRawColumn } from "../../types";
import type { ParsedDataRawImport } from "./parseDataRawExcel";
import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";

// "Campaign overview data" — TikTok Ads Manager, quảng cáo toàn cửa hàng (LIVE GMV Max + Product GMV Max), 1 dòng /
// ngày (migration 0137, 2026-10-05). Hàm thuần — không import supabaseClient, test chạy được không cần .env.
//
// Định dạng đối chiếu bằng 2 file thật (Franklin T9, cùng số, khác ngôn ngữ giao diện TikTok lúc tải):
//   By Day | Cost | SKU orders (Current shop) | Cost per order (Current shop) | Gross revenue (Current shop) | ROI (Current shop) | Currency
//   Theo ngày | Chi phí | Số lượng đơn hàng SKU (Cửa hàng hiện tại) | Chi phí mỗi đơn hàng (…) | Doanh thu gộp (…) | ROI (…) | Tiền tệ
// - Ngày là CHỮ "2026-09-01 00:00:00"; Chi phí/đơn và ROI cũng là chữ ("62770", "10.11") — không đọc 2 cột đó,
//   tự tính lại từ Chi phí/Đơn/Doanh thu.
// - Dòng cuối là dòng tổng, ô đầu "-". Doanh thu ở dòng tổng lệch Σ từng ngày 2đ (TikTok làm tròn) ⇒ so có dung sai.
// - File KHÔNG ghi tên shop ⇒ brand là brand của màn đang tải lên.
// - Doanh thu gộp tính theo đơn gốc TRƯỚC huỷ/hoàn (Franklin T9: 798tr > GMV cả shop 771tr) ⇒ không bao giờ trình
//   bày như "% của GMV".

export interface AdsDay {
  date: string; // YYYY-MM-DD
  cost: number;
  orders: number;
  revenue: number;
}

const COL = {
  date: /^(by day|theo ngày)$/i,
  cost: /^(cost|chi phí)$/i,
  orders: /^(sku orders|số lượng đơn hàng sku)/i,
  revenue: /^(gross revenue|doanh thu gộp)/i,
  currency: /^(currency|tiền tệ)$/i
};
// Cột đầu của file khi chọn mức gộp khác "theo ngày" (By Week/Theo tuần, By Hour…) — báo đúng lỗi thay vì "sai định dạng".
const GRANULARITY_HEAD = /^(by |theo )/i;
// Mã tiền tệ cột Currency/Tiền tệ của file (viết thường để quy ước "không in đơn vị tiền" của uiReadability không bắt nhầm).
const VIET_DONG = /^vnd$/i;

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** Số của file Ads: số giữ nguyên; chữ thì bỏ dấu phẩy nghìn/khoảng trắng, dấu chấm là thập phân (TikTok Ads luôn vậy). */
export function adsNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (blank(v) || v === "-") return 0;
  const n = parseFloat(String(v).replace(/[,\s₫]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** "2026-09-01 00:00:00" | "01/09/2026" | số ngày Excel → "2026-09-01"; không đọc được → null. */
export function adsDate(v: unknown): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vn = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]}`;
  return null;
}

function colKey(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

/** Dòng đã lưu (raw, khoá = tên cột gốc của file) → ngày Ads. Đọc theo tên cột nên nhận cả bản Anh lẫn Việt. */
export function readAdsDays(columns: DataRawColumn[], rows: Record<string, unknown>[]): AdsDay[] {
  const k = { date: colKey(columns, COL.date), cost: colKey(columns, COL.cost), orders: colKey(columns, COL.orders), revenue: colKey(columns, COL.revenue) };
  if (!k.date || !k.cost) return [];
  const out: AdsDay[] = [];
  for (const r of rows) {
    const date = adsDate(r[k.date]);
    if (!date) continue;
    out.push({ date, cost: adsNum(r[k.cost]), orders: k.orders ? adsNum(r[k.orders]) : 0, revenue: k.revenue ? adsNum(r[k.revenue]) : 0 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Tách bảng của file (đã đọc thành mảng dòng) — ném lỗi tiếng Việt nói rõ cần tải lại thế nào. */
export function parseAdsCampaignOverview(rows: unknown[][]): ParsedDataRawImport {
  const headerIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => COL.cost.test(String(c ?? "").trim())) && GRANULARITY_HEAD.test(String(r[0] ?? "").trim()));
  if (headerIdx === -1) {
    throw new Error('Không thấy dòng tiêu đề ("By Day / Cost" hoặc "Theo ngày / Chi phí") — file có đúng là "Campaign overview data" tải từ TikTok Ads (GMV Max) không?');
  }
  const header = rows[headerIdx];
  const first = String(header[0] ?? "").trim();
  if (!COL.date.test(first)) {
    throw new Error(`File đang gộp "${first}". Tải lại từ TikTok Ads với chế độ xem "Theo ngày" (By Day) — report cần số từng ngày.`);
  }
  let width = header.length;
  while (width > 0 && blank(header[width - 1])) width--;
  const columns: DataRawColumn[] = header.slice(0, width).map((h, i) => {
    const label = blank(h) ? `Cột ${i + 1}` : String(h).trim();
    return { key: label, label };
  });
  for (const need of [COL.cost, COL.orders, COL.revenue]) {
    if (!colKey(columns, need)) throw new Error("File thiếu cột Chi phí / Số đơn SKU / Doanh thu gộp — tải lại bản đủ cột từ TikTok Ads.");
  }

  const dataRows: Record<string, unknown>[] = [];
  let totals: Record<string, unknown> | undefined;
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(blank)) continue;
    const raw: Record<string, unknown> = {};
    columns.forEach((c, idx) => { raw[c.key] = r[idx] ?? null; });
    if (String(r[0] ?? "").trim() === "-") totals = raw;
    else dataRows.push(raw);
  }

  const days = readAdsDays(columns, dataRows);
  if (days.length !== dataRows.length) throw new Error("Có dòng không đọc được ngày — file có bị sửa tay không?");
  if (days.length === 0) throw new Error("File không có ngày nào.");
  const dates = new Set(days.map((d) => d.date));
  if (dates.size !== days.length) throw new Error("File có ngày bị lặp — tải lại từ TikTok Ads.");
  const months = new Set(days.map((d) => d.date.slice(0, 7)));
  if (months.size > 1) {
    throw new Error(`File trải ${months.size} tháng (${[...months].sort().join(", ")}). Mỗi file một tháng — chọn lại khoảng ngày trong TikTok Ads rồi tải lại.`);
  }
  const curKey = colKey(columns, COL.currency);
  const currencies = new Set(curKey ? dataRows.map((r) => String(r[curKey] ?? "").trim()).filter(Boolean) : []);
  if ([...currencies].some((c) => !VIET_DONG.test(c))) throw new Error(`File tính bằng ${[...currencies].join(", ")} — app chỉ nhận tiền Việt (đồng).`);

  if (totals) {
    for (const [pattern, field] of [[COL.cost, "cost"], [COL.orders, "orders"], [COL.revenue, "revenue"]] as const) {
      const key = colKey(columns, pattern)!;
      const fileTotal = adsNum(totals[key]);
      const sum = days.reduce((a, d) => a + d[field], 0);
      // Dung sai: TikTok làm tròn từng ngày (Franklin T9 lệch 2đ / 798tr). Lệch hơn ⇒ thiếu/sửa dòng.
      if (Math.abs(fileTotal - sum) > Math.max(days.length, Math.abs(fileTotal) * 0.0005)) {
        throw new Error(`Dòng tổng của file (${key}: ${fileTotal}) không khớp cộng từng ngày (${sum}) — file bị thiếu hoặc sửa dòng?`);
      }
    }
  }

  const periodStart = days[0].date;
  const periodEnd = days[days.length - 1].date;
  return {
    periodLabel: `${periodStart} ~ ${periodEnd}`,
    periodStart,
    periodEnd,
    columns,
    // `totals` cùng hình Shop Analytics ⇒ Dữ Liệu Gốc tự hiện bảng "Tổng quan" nếu sau này liệt kê loại này.
    summary: totals ? { totals } : undefined,
    rows: dataRows
  };
}

// ---------- số của một tháng ----------

export interface AdsBucketStats {
  cost: number;
  revenue: number;
  orders: number;
  days: number;
  roi: number | null;
}

export interface AdsMonthStats {
  days: AdsDay[];
  cost: number;
  orders: number;
  revenue: number;
  /** Doanh thu gộp ÷ chi phí — cùng cách TikTok tính cột ROI. */
  roi: number | null;
  /** Chi phí ÷ đơn SKU. */
  costPerOrder: number | null;
  /** Ngày có chi tiêu. */
  spendDays: number;
  /** Ngày tiêu tiền mà 0 đơn. */
  zeroOrderDays: AdsDay[];
  /** Ngày có đơn, chi tiêu đáng kể (≥ nửa mức chi trung bình/ngày), ROI thấp nhất trước — tối đa 3. */
  lowRoiDays: (AdsDay & { roi: number })[];
  byBucket: Record<CampDayBucket, AdsBucketStats> | null;
  firstDate: string | null;
  lastDate: string | null;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function adsMonthStats(days: AdsDay[], bucketOf?: (date: string) => CampDayBucket): AdsMonthStats {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const cost = sorted.reduce((a, d) => a + d.cost, 0);
  const orders = sorted.reduce((a, d) => a + d.orders, 0);
  const revenue = sorted.reduce((a, d) => a + d.revenue, 0);
  const spending = sorted.filter((d) => d.cost > 0);
  const avgCost = spending.length ? cost / spending.length : 0;
  const lowRoiDays = spending
    .filter((d) => d.orders > 0 && d.cost >= avgCost / 2)
    .map((d) => ({ ...d, roi: d.revenue / d.cost }))
    .sort((a, b) => a.roi - b.roi)
    .slice(0, 3);
  let byBucket: AdsMonthStats["byBucket"] = null;
  if (bucketOf) {
    byBucket = Object.fromEntries(CAMP_DAY_BUCKET_ORDER.map((b) => [b, { cost: 0, revenue: 0, orders: 0, days: 0, roi: null }])) as unknown as Record<CampDayBucket, AdsBucketStats>;
    for (const d of sorted) {
      const s = byBucket[bucketOf(d.date)];
      s.cost += d.cost;
      s.revenue += d.revenue;
      s.orders += d.orders;
      s.days += 1;
    }
    for (const s of Object.values(byBucket)) s.roi = ratio(s.revenue, s.cost);
  }
  return {
    days: sorted,
    cost,
    orders,
    revenue,
    roi: ratio(revenue, cost),
    costPerOrder: ratio(cost, orders),
    spendDays: spending.length,
    zeroOrderDays: spending.filter((d) => d.orders === 0),
    lowRoiDays,
    byBucket,
    firstDate: sorted[0]?.date ?? null,
    lastDate: sorted.at(-1)?.date ?? null
  };
}

/** Tháng trước cắt cùng số ngày với tháng này khi tháng này chưa đủ ngày (so cùng kỳ — luật §5.6: cắt theo ngày
 *  cuối CÓ SỐ). Tháng này đủ tới ngày cuối tháng ⇒ giữ nguyên cả tháng trước. */
export function adsPrevSameCut(cur: AdsDay[], prev: AdsDay[], monthEnd: string): AdsDay[] {
  const last = cur.reduce<string | null>((m, d) => (m === null || d.date > m ? d.date : m), null);
  if (!last || last >= monthEnd) return prev;
  const cutDay = last.slice(8);
  return prev.filter((d) => d.date.slice(8) <= cutDay);
}
