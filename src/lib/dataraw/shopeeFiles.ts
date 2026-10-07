import type { DataRawColumn } from "../../types";
import type { ParsedDataRawImport } from "./parseDataRawExcel";
import type { SnapshotRoomRow } from "../liveSnapshot/extractRooms";

// 4 file Shopee Seller Centre (Shopee Live) — migration 0139, 2026-10-06. Hàm thuần, không import supabaseClient nên
// test chạy được không cần .env. Đối chiếu bằng 4 file thật của VERA Shopee T9 (shop 13347498):
//   shopee_live_list    supply-sellercenter-export-sc_live_stream_list_export_vn_… .xlsx  — 1 dòng / phiên live
//   shopee_product_list supply-sellercenter-export-sc_live_product_list_export_vn_… .xlsx — 1 dòng / sản phẩm trong live
//   shopee_daily        export-sc__1m_… .csv — 1 dòng / ngày (hai dòng tiêu đề: nhóm + chỉ số)
//   shopee_overview     overview-v2_1m_… .csv — tổng quan cả tháng, nhiều khối (Transaction / Traffic / Conversion / …)
// Cả 4 cùng một tháng, cùng số: Σ ngày = Σ phiên = ô "Sales" của overview (669M đặt / 633M xác nhận).
//
// Định dạng số kiểu Việt: "6.478.400₫", "299.660,07₫", "16,41%", "4.510"; số trong xlsx đã là số; thời lượng
// "00:00:31" hoặc "175h16m7s"; ngày "dd-mm-yyyy", giờ bắt đầu phiên "dd-mm-yyyy HH:mm" (giờ Việt Nam).
//
// QUY ƯỚC GMV (user chốt 06/10): GMV Shopee = doanh số ĐẶT (Placed Order), như GMV TikTok là trước huỷ/hoàn.
// Doanh số XÁC NHẬN (Confirmed) là số thực nhận, hiện riêng.

export type ShopeeFileType = "shopee_live_list" | "shopee_product_list" | "shopee_daily" | "shopee_overview";
export const SHOPEE_FILE_TYPES: ShopeeFileType[] = ["shopee_live_list", "shopee_product_list", "shopee_daily", "shopee_overview"];

const blank = (v: unknown) => v === null || v === undefined || v === "";

/** Số kiểu Việt hoặc số thật; "-" / rỗng → 0. */
export function shopeeNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (blank(v)) return 0;
  let s = String(v).replace(/[₫%\s]/g, "");
  if (s === "-" || s === "") return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return Number.isNaN(n) ? 0 : n;
}

/** "00:00:31" → 31; "175h16m7s" → 631.. ; "48s" → 48; số → giây. */
export function shopeeDurationSec(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  const hms = s.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  const unit = s.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/i);
  if (unit && (unit[1] || unit[2] || unit[3])) return Number(unit[1] ?? 0) * 3600 + Number(unit[2] ?? 0) * 60 + Number(unit[3] ?? 0);
  return 0;
}

/** "01-09-2026" → "2026-09-01" (cũng nhận "2026-09-01"). */
export function shopeeDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  // Neo cuối chuỗi: "01-09-2026 - 30-09-2026" (khoảng ngày của file tổng quan) KHÔNG được đọc thành ngày 01/09.
  const vn = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** "30-09-2026 20:01" → { date, time } giờ Việt Nam. */
function shopeeDateTime(v: unknown): { date: string; time: string } | null {
  const m = String(v ?? "").trim().match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})/);
  return m ? { date: `${m[3]}-${m[2]}-${m[1]}`, time: `${m[4]}:${m[5]}` } : null;
}

/** ISO có múi giờ Việt Nam (+07:00) của ngày + giờ + số giây cộng thêm. */
export function vnIso(date: string, time: string, plusSec = 0): string {
  const ms = Date.parse(`${date}T${time}:00+07:00`) + plusSec * 1000;
  const d = new Date(ms + 7 * 3600_000); // dịch sang giờ VN rồi đọc bằng getUTC*
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+07:00`;
}

// ---------- CSV ----------

/** CSV có ngoặc kép, BOM, dấu phẩy trong ô. Mọi ô là chữ — tự đọc để SheetJS khỏi đổi "01-09-2026" thành ngày. */
export function parseCsvRows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      out.push(row); row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); out.push(row); }
  return out;
}

// ---------- tiện ích bảng ----------

function dedupe(headers: unknown[]): DataRawColumn[] {
  const seen: Record<string, number> = {};
  return headers.map((h, idx) => {
    const label = (blank(h) ? "" : String(h)).trim() || `Cột ${idx + 1}`;
    seen[label] = (seen[label] ?? 0) + 1;
    return { key: seen[label] === 1 ? label : `${label}__${seen[label]}`, label };
  });
}

function trimTail(row: unknown[]): unknown[] {
  const out = [...row];
  while (out.length && blank(out[out.length - 1])) out.pop();
  return out;
}

function tableAfter(rows: unknown[][], headerIdx: number): { columns: DataRawColumn[]; data: Record<string, unknown>[] } {
  const columns = dedupe(trimTail(rows[headerIdx]));
  const data: Record<string, unknown>[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every(blank)) continue;
    const raw: Record<string, unknown> = {};
    columns.forEach((c, idx) => { raw[c.key] = r[idx] ?? null; });
    data.push(raw);
  }
  return { columns, data };
}

const find = (rows: unknown[][], pred: (r: unknown[]) => boolean) => rows.findIndex((r) => !!r && pred(r));
const has = (r: unknown[], label: string) => r.some((c) => String(c ?? "").trim() === label);
const val = (r: Record<string, unknown>, key: string) => r[key];

function monthOf(dates: string[], what: string): string {
  const months = new Set(dates.map((d) => d.slice(0, 7)));
  if (months.size > 1) throw new Error(`${what} trải ${months.size} tháng (${[...months].sort().join(", ")}). Mỗi file một tháng — chọn lại khoảng ngày trong Shopee rồi tải lại.`);
  return [...months][0];
}

function shopIdOf(data: Record<string, unknown>[]): string | undefined {
  const v = data.find((r) => !blank(r["User Id"]))?.["User Id"];
  return blank(v) ? undefined : String(Math.round(Number(v)) || v);
}

// ---------- phiên live ----------

export interface ShopeeStream {
  no: number;
  name: string;
  date: string; // ngày bắt đầu, giờ VN
  time: string; // HH:mm
  startAt: string; // ISO +07:00
  endAt: string;
  durationSec: number;
  viewers: number;
  engaged: number;
  comments: number;
  atc: number;
  avgViewSec: number;
  ordersPlaced: number;
  ordersConfirmed: number;
  itemsPlaced: number;
  itemsConfirmed: number;
  salesPlaced: number;
  salesConfirmed: number;
}

const LIVE_REQUIRED = ["Livestream Name", "Start Time", "Duration:", "Viewers", "Sales(Placed Order)", "Sales(Confirmed Order)", "Orders(Placed Order)"];

export function readShopeeStreams(data: Record<string, unknown>[]): ShopeeStream[] {
  const out: ShopeeStream[] = [];
  for (const r of data) {
    const dt = shopeeDateTime(val(r, "Start Time"));
    if (!dt) continue;
    const durationSec = shopeeDurationSec(val(r, "Duration:"));
    out.push({
      no: shopeeNum(val(r, "No.")),
      name: String(val(r, "Livestream Name") ?? "").trim(),
      date: dt.date,
      time: dt.time,
      startAt: vnIso(dt.date, dt.time),
      endAt: vnIso(dt.date, dt.time, durationSec),
      durationSec,
      viewers: shopeeNum(val(r, "Viewers")),
      engaged: shopeeNum(val(r, "Engaged Viewers")),
      comments: shopeeNum(val(r, "Comments")),
      atc: shopeeNum(val(r, "ATC")),
      avgViewSec: shopeeDurationSec(val(r, "Avg. Viewing Duration")),
      ordersPlaced: shopeeNum(val(r, "Orders(Placed Order)")),
      ordersConfirmed: shopeeNum(val(r, "Orders(Confirmed Order)")),
      itemsPlaced: shopeeNum(val(r, "Items Sold(Placed Order)")),
      itemsConfirmed: shopeeNum(val(r, "Items Sold(Confirmed Order)")),
      salesPlaced: shopeeNum(val(r, "Sales(Placed Order)")),
      salesConfirmed: shopeeNum(val(r, "Sales(Confirmed Order)"))
    });
  }
  return out;
}

export function parseShopeeLiveList(rows: unknown[][]): ParsedDataRawImport {
  const headerIdx = find(rows, (r) => has(r, "Livestream Name") && has(r, "Start Time"));
  if (headerIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề ("Livestream Name", "Start Time") — đây có đúng file "Live List" của Shopee Seller Centre không?');
  const { columns, data } = tableAfter(rows, headerIdx);
  const missing = LIVE_REQUIRED.filter((k) => !columns.some((c) => c.key === k));
  if (missing.length) throw new Error(`Thiếu cột: ${missing.join(", ")} — file Live List của Shopee có bị đổi định dạng không?`);
  const streams = readShopeeStreams(data);
  if (streams.length !== data.length) throw new Error("Có phiên không đọc được giờ bắt đầu (cột Start Time) — file có bị sửa tay không?");
  if (streams.length === 0) throw new Error("File không có phiên live nào.");
  monthOf(streams.map((s) => s.date), "File Live List");
  const dates = streams.map((s) => s.date).sort();
  return {
    periodLabel: `${dates[0]} ~ ${dates[dates.length - 1]}`,
    periodStart: dates[0],
    periodEnd: dates[dates.length - 1],
    columns,
    summary: { shopId: shopIdOf(data), source: "shopee" },
    rows: data
  };
}

// ---------- sản phẩm ----------

export interface ShopeeProduct {
  rank: number;
  name: string;
  clicks: number;
  atc: number;
  ordersPlaced: number;
  ordersConfirmed: number;
  itemsPlaced: number;
  itemsConfirmed: number;
  salesPlaced: number;
  salesConfirmed: number;
}

export function readShopeeProducts(data: Record<string, unknown>[]): ShopeeProduct[] {
  return data
    .filter((r) => !blank(val(r, "Product(s)")))
    .map((r) => ({
      rank: shopeeNum(val(r, "Ranking")),
      name: String(val(r, "Product(s)")).trim(),
      clicks: shopeeNum(val(r, "Product Clicks")),
      atc: shopeeNum(val(r, "ATC")),
      ordersPlaced: shopeeNum(val(r, "Orders(Placed Order)")),
      ordersConfirmed: shopeeNum(val(r, "Orders(Confirmed Order)")),
      itemsPlaced: shopeeNum(val(r, "Items Sold(Placed Order)")),
      itemsConfirmed: shopeeNum(val(r, "Items Sold(Confirmed Order)")),
      salesPlaced: shopeeNum(val(r, "Sales(Placed Order)")),
      salesConfirmed: shopeeNum(val(r, "Sales(Confirmed Order)"))
    }));
}

export function parseShopeeProductList(rows: unknown[][]): ParsedDataRawImport {
  const headerIdx = find(rows, (r) => has(r, "Product(s)") && has(r, "Sales(Placed Order)"));
  if (headerIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề ("Product(s)", "Sales(Placed Order)") — đây có đúng file "Product List" của Shopee Live không?');
  const { columns, data } = tableAfter(rows, headerIdx);
  if (data.length === 0) throw new Error("File không có sản phẩm nào.");
  const period = String(data[0]["Data Period"] ?? "").trim();
  const days = period.match(/(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/);
  const periodStart = days ? shopeeDate(days[1]) ?? undefined : undefined;
  const periodEnd = days ? shopeeDate(days[2]) ?? undefined : undefined;
  if (periodStart && periodEnd) monthOf([periodStart, periodEnd], "File Product List");
  return { periodLabel: periodStart && periodEnd ? `${periodStart} ~ ${periodEnd}` : period || undefined, periodStart, periodEnd, columns, summary: { shopId: shopIdOf(data), source: "shopee" }, rows: data };
}

// ---------- theo ngày ----------

export interface ShopeeDay {
  date: string;
  salesPlaced: number;
  salesConfirmed: number;
  ordersPlaced: number;
  ordersConfirmed: number;
  itemsPlaced: number;
  itemsConfirmed: number;
  viewers: number;
  engaged: number;
  avgViewSec: number;
  buyersPlaced: number;
  atc: number;
  ctrPct: number;
  views: number;
  pcu: number;
  likes: number;
  shares: number;
  comments: number;
  newFollowers: number;
}

export function readShopeeDays(data: Record<string, unknown>[]): ShopeeDay[] {
  const out: ShopeeDay[] = [];
  for (const r of data) {
    const date = shopeeDate(val(r, "Data Period"));
    if (!date) continue;
    out.push({
      date,
      salesPlaced: shopeeNum(val(r, "Sales(Placed Order)")),
      salesConfirmed: shopeeNum(val(r, "Sales(Confirmed Order)")),
      ordersPlaced: shopeeNum(val(r, "Orders(Placed Order)")),
      ordersConfirmed: shopeeNum(val(r, "Orders(Confirmed Order)")),
      itemsPlaced: shopeeNum(val(r, "Total Items Sold(Placed Order)")),
      itemsConfirmed: shopeeNum(val(r, "Total Items Sold(Confirmed Order)")),
      viewers: shopeeNum(val(r, "Total Viewers")),
      engaged: shopeeNum(val(r, "Engaged Viewers")),
      avgViewSec: shopeeDurationSec(val(r, "Avg. Viewing Duration")),
      buyersPlaced: shopeeNum(val(r, "Buyers(Placed Order)")),
      atc: shopeeNum(val(r, "Total ATC")),
      ctrPct: shopeeNum(val(r, "CTR")),
      views: shopeeNum(val(r, "Total Views")),
      pcu: shopeeNum(val(r, "PCU")),
      likes: shopeeNum(val(r, "Total Likes")),
      shares: shopeeNum(val(r, "Total Shares")),
      comments: shopeeNum(val(r, "Total Comments")),
      newFollowers: shopeeNum(val(r, "Live New Followers"))
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function parseShopeeDaily(rows: unknown[][]): ParsedDataRawImport {
  const headerIdx = find(rows, (r) => String(r[0] ?? "").trim() === "Data Period" && has(r, "Sales(Placed Order)"));
  if (headerIdx === -1) throw new Error('Không tìm thấy dòng tiêu đề ("Data Period", "Sales(Placed Order)") — đây có đúng file theo ngày (export-sc…csv) của Shopee không?');
  const { columns, data } = tableAfter(rows, headerIdx);
  const days = readShopeeDays(data);
  if (days.length !== data.length) throw new Error('Có dòng không đọc được ngày (cột "Data Period") — đây có phải file THEO NGÀY không? File tổng quan cả tháng là loại "overview".');
  if (days.length === 0) throw new Error("File không có ngày nào.");
  if (new Set(days.map((d) => d.date)).size !== days.length) throw new Error("File có ngày bị lặp — tải lại từ Shopee.");
  monthOf(days.map((d) => d.date), "File theo ngày");
  return {
    periodLabel: `${days[0].date} ~ ${days[days.length - 1].date}`,
    periodStart: days[0].date,
    periodEnd: days[days.length - 1].date,
    columns,
    summary: { shopId: shopIdOf(data), source: "shopee" },
    rows: data
  };
}

// ---------- tổng quan tháng ----------
// Nhiều khối xếp dọc, mỗi khối 3 dòng: dòng tên nhóm (rải rác, "Transaction – Overview", "Traffic - Performance", …),
// dòng tiêu đề chỉ số, dòng giá trị. Ta lưu phẳng: Nhóm | Chỉ số | Giá trị (nguyên văn) — đọc lại bằng readShopeeOverview.

const OVERVIEW_COLUMNS: DataRawColumn[] = [
  { key: "Nhóm", label: "Nhóm" },
  { key: "Chỉ số", label: "Chỉ số" },
  { key: "Giá trị", label: "Giá trị" }
];
const GROUP_HEAD = /^(Transaction|Traffic|Conversion|Engagement|Promotion)\b/i;

export function flattenShopeeOverview(rows: unknown[][]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i + 2 < rows.length; i++) {
    const titles = rows[i] ?? [];
    if (!titles.some((c) => GROUP_HEAD.test(String(c ?? "").trim()))) continue;
    const heads = rows[i + 1] ?? [];
    const values = rows[i + 2] ?? [];
    if (!heads.some((c) => !blank(c))) continue;
    let group = "";
    const seen: Record<string, number> = {};
    for (let c = 0; c < Math.max(heads.length, titles.length); c++) {
      if (!blank(titles[c]) && GROUP_HEAD.test(String(titles[c]).trim())) group = String(titles[c]).trim();
      const head = String(heads[c] ?? "").trim();
      if (!head || head === "Data Period" || head === "User Id") continue;
      const k = `${group}|${head}`;
      seen[k] = (seen[k] ?? 0) + 1;
      out.push({ "Nhóm": group, "Chỉ số": seen[k] === 1 ? head : `${head} (${seen[k]})`, "Giá trị": values[c] ?? null });
    }
    i += 2;
  }
  return out;
}

export function parseShopeeOverview(rows: unknown[][]): ParsedDataRawImport {
  const data = flattenShopeeOverview(rows);
  if (data.length === 0) throw new Error('Không đọc được khối nào ("Transaction – Overview", "Traffic - Performance"…) — đây có đúng file overview-v2…csv của Shopee không?');
  const periodCell = rows.flat().map((c) => String(c ?? "")).find((c) => /^\d{2}-\d{2}-\d{4}\s*-\s*\d{2}-\d{2}-\d{4}$/.test(c.trim()));
  const m = periodCell?.match(/(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/);
  const periodStart = m ? shopeeDate(m[1]) ?? undefined : undefined;
  const periodEnd = m ? shopeeDate(m[2]) ?? undefined : undefined;
  if (!periodStart || !periodEnd) throw new Error('Không thấy khoảng ngày "dd-mm-yyyy - dd-mm-yyyy" — file overview phải là tổng quan cả tháng.');
  monthOf([periodStart, periodEnd], "File overview");
  const shopRow = rows.find((r) => /^\d{2}-\d{2}-\d{4}\s*-\s*\d{2}-\d{2}-\d{4}$/.test(String(r?.[0] ?? "").trim()) && /^\d{4,}$/.test(String(r?.[1] ?? "").trim()));
  return {
    periodLabel: `${periodStart} ~ ${periodEnd}`,
    periodStart,
    periodEnd,
    columns: OVERVIEW_COLUMNS,
    summary: { shopId: shopRow ? String(shopRow[1]) : undefined, source: "shopee" },
    rows: data
  };
}

export interface ShopeeTrafficSource {
  key: string; // "Shop", "Search", "Recommendation"…
  salesRatioPct: number;
  salesPlaced: number;
  salesConfirmed: number;
  views: number;
  viewers: number;
  engaged: number;
}

export interface ShopeeOverview {
  salesPlaced: number;
  salesConfirmed: number;
  salesNewPlaced: number;
  salesOldPlaced: number;
  ordersPlaced: number;
  ordersConfirmed: number;
  itemsPlaced: number;
  itemsConfirmed: number;
  absPlaced: number;
  salesPerBuyerPlaced: number;
  sessions: number;
  durationSec: number;
  viewers: number;
  engaged: number;
  views: number;
  pcu: number;
  avgViewSec: number;
  atc: number;
  productImpressions: number;
  productClicks: number;
  ctrPct: number; // CTR của nhóm Conversion - Conversion Funnel
  orderRatePlacedPct: number;
  orderRateConfirmedPct: number;
  buyersPlaced: number;
  buyersConfirmed: number;
  gpmPlaced: number;
  likes: number;
  shares: number;
  comments: number;
  newFollowers: number;
  voucherClaimed: number;
  specialVoucherClaimed: number;
  coinsClaimed: number;
  sources: ShopeeTrafficSource[];
}

/** "Traffic - Traffic Source - Shop" → "Shop"; nhóm "All Livestream Sources" không phải nguồn riêng. */
const SOURCE_GROUP = /^Traffic - Traffic Source - (.+)$/i;

export function readShopeeOverview(data: Record<string, unknown>[]): ShopeeOverview {
  const get = (groupRe: RegExp, metric: string): unknown =>
    data.find((r) => groupRe.test(String(r["Nhóm"] ?? "")) && String(r["Chỉ số"] ?? "") === metric)?.["Giá trị"];
  const n = (groupRe: RegExp, metric: string) => shopeeNum(get(groupRe, metric));
  const TX = /^Transaction . Overview$/i;
  const TP = /^Traffic - Performance$/i;
  const CP = /^Conversion - Performance$/i;
  const CF = /^Conversion - Conversion Funnel$/i;
  const EN = /^Engagement$/i;
  const PR = /^Promotion$/i;

  const sources: ShopeeTrafficSource[] = [];
  const groups = [...new Set(data.map((r) => String(r["Nhóm"] ?? "")))];
  for (const g of groups) {
    const m = g.match(SOURCE_GROUP);
    if (!m || /^All Livestream Sources$/i.test(m[1].trim())) continue;
    const re = new RegExp(`^${g.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
    sources.push({
      key: m[1].trim(),
      salesRatioPct: n(re, "Sales Ratio(Placed Order)"),
      salesPlaced: n(re, "Sales(Placed Order)"),
      salesConfirmed: n(re, "Sales(Confirmed Order)"),
      views: n(re, "Live Views"),
      viewers: n(re, "Live Viewers"),
      engaged: n(re, "Engaged Viewers")
    });
  }

  return {
    salesPlaced: n(TX, "Sales(Placed Order)"),
    salesConfirmed: n(TX, "Sales(Confirmed Order)"),
    salesNewPlaced: n(TX, "Sales from New Customers(Placed Order)"),
    salesOldPlaced: n(TX, "Sales from Old Customers(Placed Order)"),
    ordersPlaced: n(TX, "Orders(Placed Order)"),
    ordersConfirmed: n(TX, "Orders(Confirmed Order)"),
    itemsPlaced: n(TX, "Total Items Sold(Placed Order)"),
    itemsConfirmed: n(TX, "Total Items Sold(Confirmed Order)"),
    absPlaced: n(TX, "ABS(Placed Order)"),
    salesPerBuyerPlaced: n(TX, "Sales Per Buyer(Placed Order)"),
    sessions: n(TP, "Total Livestream Sessions"),
    durationSec: shopeeDurationSec(get(TP, "Total Livestream Duration")),
    viewers: n(TP, "Total Viewers"),
    engaged: n(TP, "Engaged Viewers"),
    views: n(TP, "Total Views"),
    pcu: n(TP, "PCU"),
    avgViewSec: shopeeDurationSec(get(TP, "Avg. Viewing Duration")),
    atc: n(CP, "Total ATC"),
    productImpressions: n(CF, "Product Impressions"),
    productClicks: n(CF, "Product Clicks"),
    ctrPct: n(CF, "CTR"),
    orderRatePlacedPct: n(CF, "Order Rate(Placed Order)"),
    orderRateConfirmedPct: n(CF, "Order Rate(Confirmed Order)"),
    buyersPlaced: n(CP, "Buyers(Placed Order)"),
    buyersConfirmed: n(CP, "Buyers(Confirmed Order)"),
    gpmPlaced: n(CP, "GPM(Placed Order)"),
    likes: n(EN, "Total Likes"),
    shares: n(EN, "Total Shares"),
    comments: n(EN, "Total Comments"),
    newFollowers: n(EN, "Live New Followers"),
    voucherClaimed: n(PR, "Shop Voucher Claimed"),
    specialVoucherClaimed: n(PR, "Special Live Voucher Claimed"),
    coinsClaimed: n(PR, "Coins Claimed"),
    sources
  };
}

// ---------- đối soát ----------

/** Phiên Shopee → dòng "room" của đường snapshot / đối soát chung (apply_session_live_snapshot, import_live_reconciliation).
 *  roomId là mã tổng hợp theo giờ bắt đầu (Shopee không có Room ID); GMV = doanh số ĐẶT; viewers đưa vào cột views (Shopee chỉ cho
 *  người xem riêng biệt theo phiên). Số trong file là CỘNG DỒN từ lúc bật phiên (file "RealTime" kể cả phiên đang live) nên ca nối
 *  cùng phiên trừ lần up trước y hệt TikTok. ATC (không có cột đếm riêng trong bảng snapshot) và các số khác nằm trong raw — DB đọc
 *  raw.atc để trừ giữa hai lần up (0154). Cột chỉ TikTok có (impressions, follower, share, like…) = 0. */
export function shopeeStreamsToSnapshotRows(streams: ShopeeStream[]): SnapshotRoomRow[] {
  return streams.map((s) => ({
    roomId: `SHP-${s.date}-${s.time.replace(":", "")}`,
    roomTitle: s.name,
    startedAt: s.startAt,
    endedAt: s.endAt,
    durationMinutes: Math.round((s.durationSec / 60) * 100) / 100,
    gmv: s.salesPlaced,
    itemsSold: s.itemsPlaced,
    orders: s.ordersPlaced,
    skuOrders: s.ordersPlaced,
    views: s.viewers,
    impressions: 0,
    productImpressions: 0,
    productClicks: 0,
    newFollowers: 0,
    comments: s.comments,
    shares: 0,
    likes: 0,
    watchSeconds: s.avgViewSec * s.viewers,
    raw: {
      source: "shopee_live_list",
      no: s.no,
      salesConfirmed: s.salesConfirmed,
      ordersConfirmed: s.ordersConfirmed,
      itemsConfirmed: s.itemsConfirmed,
      engagedViewers: s.engaged,
      atc: s.atc
    }
  }));
}

// ---------- đọc file từ máy ----------

export function parseShopeeRows(rows: unknown[][], reportType: ShopeeFileType): ParsedDataRawImport {
  switch (reportType) {
    case "shopee_live_list": return parseShopeeLiveList(rows);
    case "shopee_product_list": return parseShopeeProductList(rows);
    case "shopee_daily": return parseShopeeDaily(rows);
    case "shopee_overview": return parseShopeeOverview(rows);
  }
}
