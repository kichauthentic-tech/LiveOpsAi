import type { ParsedDataRawImport } from "./parseDataRawExcel";
import { fmtVndFull } from "../format";
import { SHOPEE_SHOP } from "../metricGlossary";
import { shopeeDate, shopeeNum } from "./shopeeFiles";

// Dữ liệu cả shop Shopee — 5 file Seller Centre cho brand dùng dịch vụ whole shop (migration 0193, 31/10/2026). Mẫu = file thật của
// Franklin T10 (tests/fixtures/shopee-shop). Mỗi file là MỘT loại nhập riêng trong brand_dataraw_imports (1 file / brand / tháng), nhưng
// nhiều sheet và nhiều khối nên lưu dạng DÒNG PHẲNG: cột `t` cho biết dòng thuộc khối nào, các cột còn lại là số đã đọc sạch.
//
//   shopee_shop_stats     "<shop>.shopee-shop-stats.<từ>-<đến>.xlsx" (Phân tích → Tổng quan): 12 sheet. Dùng: doanh số đặt / xác nhận /
//                         đã thanh toán theo ngày, đơn hủy-hoàn, người mua mới-cũ, doanh số theo kênh (thẻ sản phẩm, Live, Video,
//                         liên kết, Ads) và theo nguồn con, theo ngày. Bỏ các sheet "theo sản phẩm" (chỉ 5 dòng / kênh).
//   shopee_voucher        "voucher_<từ>-<đến>.xlsx": tổng, theo ngày, từng mã giảm giá (doanh số, chi phí).
//   shopee_discount       "discount_<từ>-<đến>.xlsx": theo loại (Khuyến Mãi / Combo / Mua Kèm Deal Sốc), theo ngày, từng chương trình.
//   shopee_composition    "sales_composition_<từ>-<đến>.xlsx": ngành hàng, khung giá, người mua mới / cũ (đặt và xác nhận).
//   shopee_shop_products  "producttraffic_Product_Card.<từ>_<đến>.xlsx": TẤT CẢ sản phẩm (hiển thị, nhấp, đơn, doanh số) — sheet
//                         "theo sản phẩm" của Shop Stats chỉ có top 5 nên cần file này để xếp hạng cả shop.
//
// QUY ƯỚC: GMV Shopee = doanh số ĐẶT (Placed Order), như shopee_daily. Bốn kênh chính (thẻ sản phẩm, Live, Video, liên kết) LOẠI TRỪ
// nhau và cộng đúng bằng Total; Ads là lát cắt CHỒNG lên các kênh — không cộng. Kỳ phải trong MỘT tháng (có thể thiếu những ngày cuối,
// vd file tải ngày 31/10 chỉ tới 30/10). Mã đối chiếu sai lệch KHÔNG chặn lưu mà ghi vào summary.warnings để ops tự kiểm.

export type ShopeeShopKind = "shopee_shop_stats" | "shopee_voucher" | "shopee_discount" | "shopee_composition" | "shopee_shop_products";
export const SHOPEE_SHOP_KINDS: ShopeeShopKind[] = ["shopee_shop_stats", "shopee_voucher", "shopee_discount", "shopee_composition", "shopee_shop_products"];
export const SHOPEE_SHOP_KIND_LABEL: Record<ShopeeShopKind, string> = {
  shopee_shop_stats: "Shop Stats",
  shopee_voucher: "Voucher",
  shopee_discount: "Discount",
  shopee_composition: "Sales Composition",
  shopee_shop_products: "Sản phẩm cả shop"
};
export const SHOPEE_SHOP_KIND_HINT: Record<ShopeeShopKind, string> = {
  shopee_shop_stats: 'File "…shopee-shop-stats…xlsx" — Phân tích kinh doanh → Tổng quan: doanh số theo ngày, theo kênh, đơn hủy, người mua mới.',
  shopee_voucher: 'File "voucher_…xlsx" — Marketing → Voucher → Hiệu suất.',
  shopee_discount: 'File "discount_…xlsx" — Marketing → Khuyến mãi → Hiệu suất (Combo, Deal Sốc, Chương trình khuyến mãi).',
  shopee_composition: 'File "sales_composition_…xlsx" — Phân tích → Doanh số → Thành phần doanh số.',
  shopee_shop_products: 'File "producttraffic_Product_Card…xlsx" — Phân tích sản phẩm → Lưu lượng thẻ sản phẩm.'
};

/** Các sheet của một file xlsx: tên sheet → các dòng (mảng ô). */
export type ShopeeSheets = Record<string, unknown[][]>;
type Row = Record<string, unknown>;

const cell = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());
const n = shopeeNum;
const norm = (s: string) => s.normalize("NFC").toLowerCase();
const sheetBy = (sheets: ShopeeSheets, test: (name: string) => boolean): unknown[][] | null => {
  const k = Object.keys(sheets).find((name) => test(norm(name)));
  return k ? sheets[k] : null;
};
const sheetNamed = (sheets: ShopeeSheets, name: string) => sheetBy(sheets, (s) => s === norm(name));
const sheetStarts = (sheets: ShopeeSheets, prefix: string) => sheetBy(sheets, (s) => s.startsWith(norm(prefix)));

/** "01-10-2026-30-10-2026" / "01-10-2026 - 30-10-2026" / "20261001_20261030" → [ISO đầu, ISO cuối]. */
export function shopeePeriod(v: unknown): { start: string; end: string } | null {
  const s = cell(v);
  const vn = s.match(/(\d{2}-\d{2}-\d{4})\s*-\s*(\d{2}-\d{2}-\d{4})/);
  if (vn) {
    const a = shopeeDate(vn[1]), b = shopeeDate(vn[2]);
    return a && b ? { start: a, end: b } : null;
  }
  const c = s.match(/(\d{4})(\d{2})(\d{2})[-_](\d{4})(\d{2})(\d{2})/);
  return c ? { start: `${c[1]}-${c[2]}-${c[3]}`, end: `${c[4]}-${c[5]}-${c[6]}` } : null;
}

function headerIndex(header: unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  header.forEach((h, i) => {
    // Đơn vị trong tên cột ("Doanh số (VND)") bỏ đi để mã gọi tên cột thuần chữ.
    const k = cell(h).replace(/\s*\([A-Z]{3}\)\s*$/, "");
    if (k && !(k in out)) out[k] = i;
  });
  return out;
}
const pick = (r: unknown[], h: Record<string, number>, name: string): number => (h[name] === undefined ? 0 : n(r[h[name]]));
const isDateCell = (v: unknown) => /^\d{2}-\d{2}-\d{4}$/.test(cell(v));
const onlyFirst = (r: unknown[]) => cell(r[0]) !== "" && r.slice(1).every((c) => cell(c) === "");
const blank = (r: unknown[]) => r.every((c) => cell(c) === "");

// ───────── Shop Stats ─────────

/** Một khối "Ngày … + từng ngày": trả về chỉ số cột và các dòng ngày của sheet. */
function dailyBlock(rows: unknown[][]): { h: Record<string, number>; total: unknown[] | null; days: unknown[][] } {
  const first = rows.findIndex((r) => cell(r?.[0]) === "Ngày");
  if (first < 0) return { h: {}, total: null, days: [] };
  const second = rows.findIndex((r, i) => i > first && cell(r?.[0]) === "Ngày");
  const h = headerIndex(rows[second >= 0 ? second : first]);
  const total = rows[first + 1] && cell(rows[first + 1][0]) ? rows[first + 1] : null;
  const days = second >= 0 ? rows.slice(second + 1).filter((r) => isDateCell(r?.[0])) : [];
  return { h, total, days };
}

const CHANNEL_COLS: [string, string][] = [
  ["card", "Doanh thu từ thẻ sản phẩm"],
  ["live", "Doanh thu từ Livestream của người bán"],
  ["video", "Doanh thu từ Video của người bán"],
  ["affiliate", "Doanh thu từ đối tác liên kết"],
  ["ads", "Doanh thu từ quảng cáo Shopee"]
];
const BLOCK_KEY: Record<string, string> = { "thẻ sản phẩm": "card", live: "live", video: "video", "tiếp thị liên kết": "affiliate", "dịch vụ hiển thị shopee": "ads" };
const VIEW_COLS = ["Lượt hiển thị sản phẩm", "Lượt xem Livestream", "Lượt xem Video", "Lượt xem nội dung", "Ads Impression"];

/** Đi qua sheet "nguồn truy cập": mỗi khối (Thẻ sản phẩm, Live…) có dòng tiêu đề cột, rồi các dòng nguồn (và với sheet theo ngày: dòng ngày dưới từng nguồn). */
function walkSources(rows: unknown[][], onRow: (block: string, source: string, h: Record<string, number>, r: unknown[], isDay: boolean) => void) {
  let block = "", source = "", h: Record<string, number> = {};
  for (const r of rows) {
    if (!r || blank(r)) continue;
    const first = cell(r[0]);
    if (onlyFirst(r) && BLOCK_KEY[norm(first)]) {
      block = BLOCK_KEY[norm(first)];
      source = "";
      continue;
    }
    if (first === "Nguồn lưu lượng") {
      h = headerIndex(r);
      continue;
    }
    if (!block || !Object.keys(h).length) continue;
    if (isDateCell(first)) onRow(block, source, h, r, true);
    else {
      source = first;
      onRow(block, source, h, r, false);
    }
  }
}

function viewsOf(r: unknown[], h: Record<string, number>): number {
  for (const c of VIEW_COLS) if (h[c] !== undefined) return n(r[h[c]]);
  return 0;
}

function parseStats(sheets: ShopeeSheets): { rows: Row[]; period: { start: string; end: string } | null; warnings: string[] } {
  const placed = sheetNamed(sheets, "Đơn hàng đã đặt");
  const confirmed = sheetNamed(sheets, "Đơn đã xác nhận");
  const paid = sheetNamed(sheets, "Đơn Đã Thanh Toán");
  if (!placed || !confirmed) throw new Error('File Shop Stats thiếu sheet "Đơn hàng đã đặt" hoặc "Đơn đã xác nhận".');
  const P = dailyBlock(placed);
  if (!P.days.length) throw new Error('Sheet "Đơn hàng đã đặt" không có dòng theo ngày.');
  const period = shopeePeriod(P.total?.[0]);
  const C = dailyBlock(confirmed), D = paid ? dailyBlock(paid) : null;
  const confirmedBy = new Map(C.days.map((r) => [shopeeDate(r[0]), r]));
  const paidBy = new Map((D?.days ?? []).map((r) => [shopeeDate(r[0]), r]));
  const rows: Row[] = [];
  // Tổng cả kỳ do Shopee tính (người mua, lượt truy cập là số DUY NHẤT trong kỳ — cộng các ngày sẽ đếm trùng nên không dùng tổng ngày).
  if (P.total) {
    rows.push({
      t: "total",
      placed: pick(P.total, P.h, "Tổng doanh số"), orders: pick(P.total, P.h, "Tổng số đơn hàng"), visits: pick(P.total, P.h, "Số lượt truy cập"), clicks: pick(P.total, P.h, "Lượt nhấp vào sản phẩm"),
      cancelOrders: pick(P.total, P.h, "Đơn đã hủy"), refundOrders: pick(P.total, P.h, "Đơn đã hoàn trả / hoàn tiền"),
      buyers: pick(P.total, P.h, "số người mua"), newBuyers: pick(P.total, P.h, "số người mua mới"), oldBuyers: pick(P.total, P.h, "số người mua hiện tại")
    });
  }
  for (const r of P.days) {
    const date = shopeeDate(r[0]);
    if (!date) continue;
    const c = confirmedBy.get(date), p = paidBy.get(date);
    rows.push({
      t: "day", date,
      placed: pick(r, P.h, "Tổng doanh số"),
      orders: pick(r, P.h, "Tổng số đơn hàng"),
      visits: pick(r, P.h, "Số lượt truy cập"),
      clicks: pick(r, P.h, "Lượt nhấp vào sản phẩm"),
      cancelOrders: pick(r, P.h, "Đơn đã hủy"),
      cancelSales: pick(r, P.h, "Doanh số đơn hủy"),
      refundOrders: pick(r, P.h, "Đơn đã hoàn trả / hoàn tiền"),
      refundSales: pick(r, P.h, "Doanh số các đơn Trả hàng/Hoàn tiền"),
      buyers: pick(r, P.h, "số người mua"),
      newBuyers: pick(r, P.h, "số người mua mới"),
      oldBuyers: pick(r, P.h, "số người mua hiện tại"),
      confirmed: c ? pick(c, C.h, "Tổng doanh số") : 0,
      confirmedOrders: c ? pick(c, C.h, "Tổng số đơn hàng") : 0,
      paid: p && D ? pick(p, D.h, "Tổng doanh số") : 0
    });
  }
  // Doanh số theo kênh, tổng kỳ: sheet "Nguồn truy cập cho Đơn hàng…" (đặt) và "Nguồn lưu lượng truy cập…" (xác nhận).
  const bases: [string, unknown[][] | null][] = [
    ["placed", sheetStarts(sheets, "Nguồn truy cập cho Đơn hàng")],
    ["confirmed", sheetStarts(sheets, "Nguồn lưu lượng truy cập")]
  ];
  for (const [basis, sh] of bases) {
    if (!sh) continue;
    const top = sh.findIndex((r) => cell(r?.[0]) === "Ngày");
    if (top >= 0 && sh[top + 1]) {
      const h = headerIndex(sh[top]);
      const r = sh[top + 1];
      const row: Row = { t: "channelTotal", basis, total: pick(r, h, "Doanh số") };
      for (const [k, col] of CHANNEL_COLS) row[k] = pick(r, h, col);
      rows.push(row);
    }
    walkSources(sh, (block, source, h, r, isDay) => {
      if (isDay) return;
      rows.push({
        t: "source", basis, block, source,
        share: pick(r, h, "Tỷ lệ doanh số"), sales: pick(r, h, "Doanh số"), views: viewsOf(r, h), clicks: pick(r, h, "Lượt nhấp vào sản phẩm"),
        orders: pick(r, h, "Tổng số đơn hàng"), cost: pick(r, h, "Chi phí quảng cáo"), roas: pick(r, h, "ROAS quảng cáo")
      });
    });
  }
  // Theo ngày × nguồn (chỉ đơn đã đặt).
  const perDay = sheetStarts(sheets, "(đơn đã đặt)Theo nguồn");
  if (perDay) {
    walkSources(perDay, (block, source, h, r, isDay) => {
      if (!isDay) return;
      const date = shopeeDate(r[0]);
      if (!date) return;
      rows.push({ t: "channelDay", block, source, date, sales: pick(r, h, "Doanh số"), clicks: pick(r, h, "Lượt nhấp vào sản phẩm"), orders: pick(r, h, "Tổng số đơn hàng") });
    });
  }
  // Kiểm tra: bốn kênh chính cộng đúng Total; tổng ngày đúng Total.
  const warnings: string[] = [];
  const tot = rows.find((r) => r.t === "channelTotal" && r.basis === "placed");
  if (tot) {
    const four = n(tot.card) + n(tot.live) + n(tot.video) + n(tot.affiliate);
    if (Math.abs(four - n(tot.total)) > Math.max(1000, n(tot.total) * 0.001)) {
      warnings.push(`Bốn nguồn doanh số (${SHOPEE_SHOP.productCard}, ${SHOPEE_SHOP.sellerLive}, ${SHOPEE_SHOP.sellerVideo}, ${SHOPEE_SHOP.affiliate}) cộng ${fmtVndFull(four)}, lệch Tổng doanh số ${fmtVndFull(n(tot.total))}.`);
    }
    const daySum = rows.filter((r) => r.t === "day").reduce((s, r) => s + n(r.placed), 0);
    if (Math.abs(daySum - n(tot.total)) > Math.max(1000, n(tot.total) * 0.001)) {
      warnings.push(`Tổng các ngày ${fmtVndFull(daySum)} lệch Tổng doanh số ${fmtVndFull(n(tot.total))}.`);
    }
  } else warnings.push("Không đọc được doanh số theo kênh (sheet Nguồn truy cập cho Đơn hàng).");
  return { rows, period, warnings };
}

// ───────── Voucher / Discount (cùng khuôn) ─────────

const PROMO_COLS: [string, string][] = [
  ["sales", "Bán hàng (đặt hàng)"], ["confirmedSales", "Bán hàng (Đơn đặt hàng được xác nhận)"],
  ["orders", "Đơn đặt hàng (đặt hàng)"], ["confirmedOrders", "Đơn đặt hàng (Đơn đặt hàng được xác nhận)"],
  ["buyers", "Người mua (đặt hàng)"], ["confirmedBuyers", "Người mua (Đơn đặt hàng được xác nhận)"],
  ["claims", "Nhận"], ["cost", "Chi phí (đặt hàng)"], ["confirmedCost", "Chi phí (Đơn đặt hàng được xác nhận)"],
  ["units", "Đơn vị được bán (đặt hàng)"]
];
const promoFields = (r: unknown[], h: Record<string, number>): Row => {
  const out: Row = {};
  for (const [k, col] of PROMO_COLS) if (h[col] !== undefined) out[k] = n(r[h[col]]);
  return out;
};
const tableOf = (rows: unknown[][], firstHeader: string) => {
  const i = rows.findIndex((r) => cell(r?.[0]) === firstHeader);
  return i < 0 ? null : { h: headerIndex(rows[i]), data: rows.slice(i + 1).filter((r) => r && !blank(r)) };
};

function parseVoucher(sheets: ShopeeSheets): { rows: Row[]; period: { start: string; end: string } | null } {
  const overview = sheetNamed(sheets, "Tổng quan"), trend = sheetNamed(sheets, "Xu hướng số liệu"), list = sheetNamed(sheets, "Danh sách hiệu suất");
  if (!overview || !trend || !list) throw new Error('File Voucher thiếu sheet "Tổng quan", "Xu hướng số liệu" hoặc "Danh sách hiệu suất".');
  const T = tableOf(overview, "Khung thời gian"), D = tableOf(trend, "Thời Gian"), L = tableOf(list, "Tên mã giảm giá");
  if (!T || !D || !L) throw new Error("File Voucher không có đúng dòng tiêu đề cột.");
  const rows: Row[] = [];
  const period = shopeePeriod(T.data[0]?.[0]);
  if (T.data[0]) rows.push({ t: "total", ...promoFields(T.data[0], T.h) });
  for (const r of D.data) {
    const date = shopeeDate(r[0]);
    if (date) rows.push({ t: "day", date, ...promoFields(r, D.h) });
  }
  for (const r of L.data) {
    rows.push({ t: "voucher", name: cell(r[L.h["Tên mã giảm giá"]]), code: cell(r[L.h["Mã giảm giá"]]), period: cell(r[L.h["Khung Thời Gian"]]), status: cell(r[L.h["Trạng thái"]]), creator: cell(r[L.h["Người tạo"]]), type: cell(r[L.h["Loại Voucher"]]), ...promoFields(r, L.h) });
  }
  return { rows, period };
}

function parseDiscount(sheets: ShopeeSheets): { rows: Row[]; period: { start: string; end: string } | null } {
  const overview = sheetNamed(sheets, "Tổng quan"), chart = sheetNamed(sheets, "Biểu đồ"), list = sheetNamed(sheets, "Danh sách hiệu suất");
  if (!overview || !chart || !list) throw new Error('File Discount thiếu sheet "Tổng quan", "Biểu đồ" hoặc "Danh sách hiệu suất".');
  const T = tableOf(overview, "Ngày"), D = tableOf(chart, "Ngày"), L = tableOf(list, "Tên chương trình");
  if (!T || !D || !L) throw new Error("File Discount không có đúng dòng tiêu đề cột.");
  const rows: Row[] = [];
  const period = shopeePeriod(T.data[0]?.[0]);
  for (const r of T.data) rows.push({ t: "type", type: cell(r[T.h["Loại khuyến mãi"]]), ...promoFields(r, T.h) });
  for (const r of D.data) {
    const date = shopeeDate(r[0]);
    if (date) rows.push({ t: "day", date, type: cell(r[D.h["Loại khuyến mãi"]]), ...promoFields(r, D.h) });
  }
  for (const r of L.data) rows.push({ t: "program", name: cell(r[0]), type: cell(r[L.h["Loại khuyến mãi"]]), period: cell(r[L.h["Thời gian diễn ra chương trình"]]), status: cell(r[L.h["Trạng thái"]]), ...promoFields(r, L.h) });
  return { rows, period };
}

// ───────── Sales Composition ─────────

function parseComposition(sheets: ShopeeSheets): { rows: Row[]; period: { start: string; end: string } | null } {
  const bases: [string, unknown[][] | null][] = [["placed", sheetNamed(sheets, "Đặt hàng")], ["confirmed", sheetNamed(sheets, "Đơn đặt hàng xác nhận")]];
  if (!bases[0][1]) throw new Error('File Sales Composition thiếu sheet "Đặt hàng".');
  const rows: Row[] = [];
  let period: { start: string; end: string } | null = null;
  for (const [basis, sh] of bases) {
    if (!sh) continue;
    let mode = "";
    for (const r of sh) {
      if (!r || blank(r)) { mode = ""; continue; }
      const a = cell(r[0]), b = cell(r[1]);
      if (a === "Data Period") { period ??= shopeePeriod(b); continue; }
      if (a === "Ngành Hàng") { mode = b === "Ngành Hàng Con" ? "sub" : "cat"; continue; }
      if (a.startsWith("Theo Phân Khúc Giá")) { mode = "price"; continue; }
      if (a === "Nhóm") { mode = "buyer"; continue; }
      if (mode === "cat") rows.push({ t: "category", basis, name: a, sales: n(r[1]), share: n(r[2]) });
      else if (mode === "sub") rows.push({ t: "subcategory", basis, category: a, name: b, buyers: n(r[2]), sales: n(r[3]), share: n(r[4]), conversion: n(r[5]) });
      else if (mode === "price") rows.push({ t: "price", basis, band: a, buyers: n(r[1]), buyerShare: n(r[2]), sales: n(r[3]), conversion: n(r[4]) });
      else if (mode === "buyer") rows.push({ t: "buyerGroup", basis, name: /mới/i.test(a) ? "new" : "existing", buyers: n(r[1]), buyerShare: n(r[2]), sales: n(r[3]), share: n(r[4]), conversion: n(r[5]) });
    }
  }
  if (!rows.some((r) => r.t === "buyerGroup")) throw new Error("File Sales Composition không có bảng người mua mới / hiện tại.");
  return { rows, period };
}

// ───────── Sản phẩm cả shop ─────────

function parseProducts(sheets: ShopeeSheets): { rows: Row[] } {
  const bases: [string, unknown[][] | null][] = [["placed", sheetStarts(sheets, "(đơn đã đặt)")], ["confirmed", sheetStarts(sheets, "(đơn đã xác nhận)")]];
  if (!bases[0][1]) throw new Error('File sản phẩm thiếu sheet "(đơn đã đặt)Lưu lượng truy cập…".');
  const rows: Row[] = [];
  for (const [basis, sh] of bases) {
    if (!sh) continue;
    const T = tableOf(sh, "Mã sản phẩm");
    if (!T) throw new Error('Không thấy cột "Mã sản phẩm".');
    for (const r of T.data) {
      const id = cell(r[0]);
      if (!id) continue;
      rows.push({
        t: "product", basis, id, name: cell(r[T.h["Sản phẩm"]]), status: cell(r[T.h["Tình trạng sản phẩm hiện tại"]]),
        share: n(r[T.h["Tỷ lệ doanh số"]]), sales: n(r[T.h["Doanh số"]]), impressions: n(r[T.h["Lượt hiển thị sản phẩm"]]), clicks: n(r[T.h["Lượt nhấp vào sản phẩm"]]),
        orders: n(r[T.h["Tổng số đơn hàng"]]), ctr: n(r[T.h.CTR]), conversion: n(r[T.h["Tỷ lệ chuyển đổi đơn hàng"]]), buyers: n(r[T.h["Người mua"]])
      });
    }
  }
  return { rows };
}

// ───────── Nhận loại file + parse ─────────

/** Nhận loại file theo tên sheet và tên cột (không dựa vào tên file). null = không phải 1 trong 5 file cả shop. */
export function detectShopeeShopKind(sheets: ShopeeSheets): ShopeeShopKind | null {
  if (sheetNamed(sheets, "Đơn hàng đã đặt") && sheetNamed(sheets, "Đơn đã xác nhận")) return "shopee_shop_stats";
  if (sheetNamed(sheets, "Xu hướng số liệu") && cell(sheetNamed(sheets, "Danh sách hiệu suất")?.[0]?.[0]) === "Tên mã giảm giá") return "shopee_voucher";
  if (sheetNamed(sheets, "Biểu đồ") && sheetNamed(sheets, "Tổng quan")?.[0]?.map(cell).includes("Loại khuyến mãi")) return "shopee_discount";
  if (sheetNamed(sheets, "Đặt hàng")?.some((r) => cell(r?.[0]) === "Data Period")) return "shopee_composition";
  if (sheetStarts(sheets, "(đơn đã đặt)Lưu lượng") && cell(sheetStarts(sheets, "(đơn đã đặt)Lưu lượng")?.[0]?.[0]) === "Mã sản phẩm") return "shopee_shop_products";
  return null;
}

const fieldColumns = (rows: Row[]) => {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  return keys.map((key) => ({ key, label: key }));
};

/** Kỳ phải nằm trong MỘT tháng; trả lỗi tiếng Việt nếu vắt qua tháng. */
function monthOnly(period: { start: string; end: string } | null, what: string) {
  if (!period) throw new Error(`Không đọc được kỳ của file ${what} (cần cả tên file lẫn ô "Khung thời gian").`);
  if (period.start.slice(0, 7) !== period.end.slice(0, 7)) {
    throw new Error(`File ${what} phủ nhiều tháng (${period.start} đến ${period.end}) — Report theo tháng, hãy tải lại với đúng một tháng.`);
  }
  return period;
}

/** `fileName` chỉ dùng cho file không ghi kỳ trong nội dung (sản phẩm cả shop: kỳ nằm ở tên file). */
export function parseShopeeShopSheets(sheets: ShopeeSheets, kind: ShopeeShopKind, fileName = ""): ParsedDataRawImport {
  let rows: Row[];
  let period: { start: string; end: string } | null = null;
  let warnings: string[] = [];
  switch (kind) {
    case "shopee_shop_stats": ({ rows, period, warnings } = parseStats(sheets)); break;
    case "shopee_voucher": ({ rows, period } = parseVoucher(sheets)); break;
    case "shopee_discount": ({ rows, period } = parseDiscount(sheets)); break;
    case "shopee_composition": ({ rows, period } = parseComposition(sheets)); break;
    case "shopee_shop_products": ({ rows } = parseProducts(sheets)); period = shopeePeriod(fileName); break;
  }
  const label = SHOPEE_SHOP_KIND_LABEL[kind];
  const p = monthOnly(period ?? shopeePeriod(fileName), label);
  if (rows.length === 0) throw new Error(`File ${label} không có dòng dữ liệu nào.`);
  return {
    periodLabel: `${p.start} ~ ${p.end}`,
    periodStart: p.start,
    periodEnd: p.end,
    summary: { kind, warnings },
    columns: fieldColumns(rows),
    rows
  };
}

// ───────── Gom dòng đã lưu thành dữ liệu cho report ─────────

export interface ShopeeShopChannels { card: number; live: number; video: number; affiliate: number; ads: number; total: number }
export interface ShopeeShopData {
  /** Tổng cả kỳ do Shopee tính (người mua, truy cập duy nhất); null = file không có dòng tổng. */
  total: { placed: number; orders: number; visits: number; clicks: number; cancelOrders: number; refundOrders: number; buyers: number; newBuyers: number; oldBuyers: number } | null;
  /** Doanh số đặt / xác nhận theo ngày (không có ngày thì rỗng). */
  days: { date: string; placed: number; confirmed: number; paid: number; orders: number; confirmedOrders: number; visits: number; clicks: number; cancelOrders: number; refundOrders: number; buyers: number; newBuyers: number; oldBuyers: number }[];
  placed: number;
  confirmed: number;
  orders: number;
  channels: ShopeeShopChannels | null;
  confirmedChannels: ShopeeShopChannels | null;
  sources: { block: string; source: string; sales: number; share: number; orders: number; clicks: number; cost: number; roas: number }[];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

/** Từ dòng Shop Stats đã lưu → dữ liệu cả shop. Rỗng ⇒ null. */
export function shopeeShopData(rows: Row[]): ShopeeShopData | null {
  const days = rows.filter((r) => r.t === "day").map((r) => ({
    date: String(r.date), placed: num(r.placed), confirmed: num(r.confirmed), paid: num(r.paid), orders: num(r.orders), confirmedOrders: num(r.confirmedOrders),
    visits: num(r.visits), clicks: num(r.clicks), cancelOrders: num(r.cancelOrders), refundOrders: num(r.refundOrders), buyers: num(r.buyers), newBuyers: num(r.newBuyers), oldBuyers: num(r.oldBuyers)
  })).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!days.length) return null;
  const ch = (basis: string): ShopeeShopChannels | null => {
    const r = rows.find((x) => x.t === "channelTotal" && x.basis === basis);
    return r ? { card: num(r.card), live: num(r.live), video: num(r.video), affiliate: num(r.affiliate), ads: num(r.ads), total: num(r.total) } : null;
  };
  const tr = rows.find((r) => r.t === "total");
  return {
    total: tr ? { placed: num(tr.placed), orders: num(tr.orders), visits: num(tr.visits), clicks: num(tr.clicks), cancelOrders: num(tr.cancelOrders), refundOrders: num(tr.refundOrders), buyers: num(tr.buyers), newBuyers: num(tr.newBuyers), oldBuyers: num(tr.oldBuyers) } : null,
    days,
    placed: sumBy(days, (d) => d.placed),
    confirmed: sumBy(days, (d) => d.confirmed),
    orders: sumBy(days, (d) => d.orders),
    channels: ch("placed"),
    confirmedChannels: ch("confirmed"),
    sources: rows.filter((r) => r.t === "source" && r.basis === "placed").map((r) => ({ block: String(r.block), source: String(r.source), sales: num(r.sales), share: num(r.share), orders: num(r.orders), clicks: num(r.clicks), cost: num(r.cost), roas: num(r.roas) }))
  };
}

/** Đối chiếu Seller LIVE trong Shop Stats với tổng ngày của file Daily (shopee_daily). Lệch ⇒ câu cảnh báo, khớp ⇒ null. */
export function reconcileShopLive(shopLive: number, dailyLivePlaced: number): string | null {
  if (!(shopLive > 0) || !(dailyLivePlaced > 0)) return null;
  const diff = Math.abs(shopLive - dailyLivePlaced);
  if (diff <= Math.max(1000, dailyLivePlaced * 0.002)) return null;
  return `${SHOPEE_SHOP.sellerLive} trong Shop Stats ${fmtVndFull(shopLive)}, file Daily ${fmtVndFull(dailyLivePlaced)}, lệch ${fmtVndFull(diff)}. Kiểm tra hai file cùng một kỳ.`;
}
