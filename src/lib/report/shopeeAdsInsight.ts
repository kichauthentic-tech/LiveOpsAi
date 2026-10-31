import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { shopeeAdsRunning, shopeeAdsTotals, type ShopeeAdsKind, type ShopeeAdsSuite, type ShopeeAdsTotals, type ShopeeProductAd } from "../dataraw/shopeeAds";
import type { InsightBlocks } from "./pageInsights";

// Phân tích Ads Shopee của tháng (31/10, Franklin whole shop): 3 loại Ads → so loại nào lời/lỗ, Shop+ tự động vs thủ công,
// Product Ads đang chạy vs tạm dừng, sản phẩm chi nhiều ra ít / đáng tăng ngân sách. Hàm thuần: Insight và trang Quảng cáo
// dùng chung để câu chữ và bảng không lệch nhau. Doanh số 3 loại có thể trùng đơn ⇒ luôn kèm ROAS đơn trực tiếp.

const money = (v: number) => fmtVndShort(v);
// ROAS dưới 1 giữ 2 số lẻ (0,25x chứ không phải 0,2x) — làm tròn 1 số lẻ làm ROAS nhỏ trông nhỏ hơn thực tế.
const x1 = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("vi-VN", { maximumFractionDigits: v < 1 ? 2 : 1 })}x`);
const pct0 = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 0 })}%`;
const roasOf = (gmv: number, expense: number) => (expense > 0 ? gmv / expense : null);

export interface AdsTypeRow {
  kind: ShopeeAdsKind;
  label: string;
  expense: number;
  gmv: number;
  roas: number | null;
  /** % trong tổng chi phí Ads. */
  expenseShare: number;
  gmvShare: number;
}

export interface AdsProductRow extends ShopeeProductAd {
  roas: number | null;
  roasDirect: number | null;
  running: boolean;
}

export interface ShopeeAdsAnalysis {
  totals: ShopeeAdsTotals;
  types: AdsTypeRow[];
  /** Livestream Ads: chiến dịch chi nhiều nhất mà ROAS < 1. */
  liveDrag: { name: string; expense: number; gmv: number; roas: number | null; shareOfLive: number } | null;
  liveLoss: number | null;
  searchManual: { expense: number; gmv: number; gmvDirect: number; roas: number | null } | null;
  searchAuto: { expense: number; gmv: number; gmvDirect: number; roas: number | null } | null;
  products: AdsProductRow[];
  productRunning: { count: number; expense: number; gmv: number; roas: number | null } | null;
  productPaused: { count: number; expense: number; gmv: number; roas: number | null } | null;
  /** Chi tiền mà không ra doanh số. */
  noSales: { count: number; expense: number };
  /** Chi nhiều, ROAS thấp (< 7x, chi ≥ 400k), chi nhiều nhất trước. */
  weak: AdsProductRow[];
  /** Đang chạy, ROAS ≥ 10x, ROAS cao nhất trước. */
  strong: AdsProductRow[];
}

const WEAK_ROAS = 7;
const WEAK_MIN_EXPENSE = 400_000;
const STRONG_ROAS = 10;

export function analyzeShopeeAds(a: ShopeeAdsSuite): ShopeeAdsAnalysis {
  const totals = shopeeAdsTotals(a);
  const rows: { kind: ShopeeAdsKind; label: string; expense: number; gmv: number }[] = [];
  if (a.live) rows.push({ kind: "shopee_ads", label: "Livestream Ads", expense: a.live.expense, gmv: a.live.gmv });
  if (a.shop) rows.push({ kind: "shopee_shop_ads", label: "Shop+ Ads", expense: a.shop.expense, gmv: a.shop.gmv });
  if (a.product) rows.push({ kind: "shopee_product_ads", label: "Product Ads", expense: a.product.expense, gmv: a.product.gmv });
  const types = rows.map((r) => ({ ...r, roas: roasOf(r.gmv, r.expense), expenseShare: totals.expense > 0 ? (r.expense / totals.expense) * 100 : 0, gmvShare: totals.gmv > 0 ? (r.gmv / totals.gmv) * 100 : 0 }));

  const liveSorted = a.live ? [...a.live.campaigns].sort((x, y) => y.expense - x.expense) : [];
  const dragC = liveSorted.find((c) => c.expense > 0 && (c.roas ?? 0) < 1);
  const liveDrag = a.live && dragC ? { name: dragC.name, expense: dragC.expense, gmv: dragC.gmv, roas: dragC.roas, shareOfLive: a.live.expense > 0 ? (dragC.expense / a.live.expense) * 100 : 0 } : null;
  const liveLoss = a.live && a.live.expense > a.live.gmv ? a.live.expense - a.live.gmv : null;

  const bid = (re: RegExp) => {
    const rs = (a.shop?.rows ?? []).filter((r) => re.test(r.bidding));
    if (!rs.length) return null;
    const expense = rs.reduce((s, r) => s + r.expense, 0);
    const gmv = rs.reduce((s, r) => s + r.gmv, 0);
    return { expense, gmv, gmvDirect: rs.reduce((s, r) => s + r.gmvDirect, 0), roas: roasOf(gmv, expense) };
  };
  const searchManual = bid(/thủ công|manual/i);
  const searchAuto = bid(/tự động|auto/i);

  const products: AdsProductRow[] = (a.product?.rows ?? []).map((p) => ({ ...p, roas: roasOf(p.gmv, p.expense), roasDirect: roasOf(p.gmvDirect, p.expense), running: shopeeAdsRunning(p.status) }));
  const sum = (xs: AdsProductRow[]) => {
    const expense = xs.reduce((s, p) => s + p.expense, 0);
    const gmv = xs.reduce((s, p) => s + p.gmv, 0);
    return xs.length ? { count: xs.length, expense, gmv, roas: roasOf(gmv, expense) } : null;
  };
  const noSalesRows = products.filter((p) => p.expense > 0 && p.gmv === 0);
  return {
    totals,
    types,
    liveDrag,
    liveLoss,
    searchManual,
    searchAuto,
    products,
    productRunning: sum(products.filter((p) => p.running)),
    productPaused: sum(products.filter((p) => !p.running)),
    noSales: { count: noSalesRows.length, expense: noSalesRows.reduce((s, p) => s + p.expense, 0) },
    weak: products.filter((p) => p.expense >= WEAK_MIN_EXPENSE && (p.roas ?? 0) < WEAK_ROAS).sort((p, q) => q.expense - p.expense).slice(0, 4),
    strong: products.filter((p) => p.running && (p.roas ?? 0) >= STRONG_ROAS).sort((p, q) => (q.roas ?? 0) - (p.roas ?? 0)).slice(0, 4)
  };
}

/** Tiêu đề trang: kết luận lớn nhất, ưu tiên loại Ads đang lỗ. */
export function shopeeAdsHeadline(a: ShopeeAdsSuite): string | null {
  const z = analyzeShopeeAds(a);
  if (z.totals.expense <= 0) return null;
  const live = z.types.find((t) => t.kind === "shopee_ads");
  if (live && live.expense > 0 && (live.roas ?? 0) < 1 && z.types.length > 1) {
    return `Livestream Ads chiếm ${pct0(live.expenseShare)} chi phí nhưng chỉ ${live.gmvShare.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}% doanh số (${METRIC.roas} ${x1(live.roas)}).`;
  }
  const best = [...z.types].sort((p, q) => (q.roas ?? 0) - (p.roas ?? 0))[0];
  return `${METRIC.expense} Ads ${money(z.totals.expense)}, ${METRIC.roas} ${x1(z.totals.roas)}; ${best.label} hiệu quả nhất (${x1(best.roas)}).`;
}

export function shopeeAdsSuiteBlocks(a: ShopeeAdsSuite): InsightBlocks {
  const z = analyzeShopeeAds(a);
  const t = z.totals;
  const names = z.types.map((x) => x.label).join(", ");
  const observe = `${METRIC.expense} ${money(t.expense)}, doanh số ghi nhận ${money(t.gmv)} (${METRIC.roas} ${x1(t.roas)}, đơn trực tiếp ${x1(t.roasDirect)}) từ ${z.types.length} loại Ads: ${names}.`;

  const cause: string[] = [];
  if (z.liveDrag && a.live) {
    cause.push(`Livestream Ads ${x1(a.live.roas)}: chiến dịch "${z.liveDrag.name}" chi ${money(z.liveDrag.expense)} (${pct0(z.liveDrag.shareOfLive)} chi phí Livestream Ads), doanh số ${money(z.liveDrag.gmv)}.`);
  }
  if (z.searchManual && z.searchAuto && z.searchManual.roas != null && z.searchAuto.roas != null && z.searchManual.roas > z.searchAuto.roas * 1.3) {
    cause.push(`Shop+ Ads thủ công ${x1(z.searchManual.roas)}, cao hơn tự động ${x1(z.searchAuto.roas)}.`);
  }
  if (z.productRunning && z.productPaused && z.productPaused.count > 0) {
    cause.push(`Product Ads: ${z.productRunning.count} sản phẩm đang chạy ${x1(z.productRunning.roas)}, ${z.productPaused.count} sản phẩm tạm dừng ${x1(z.productPaused.roas)}.`);
  }

  const impact: string[] = [];
  if (a.live && z.liveLoss != null) impact.push(`Livestream Ads chi ${money(a.live.expense)}, thu ${money(a.live.gmv)}: chi vượt doanh số ${money(z.liveLoss)}.`);
  if (z.noSales.count > 0) impact.push(`${z.noSales.count} sản phẩm Product Ads chi ${money(z.noSales.expense)} mà không ra doanh số.`);

  const advise: string[] = [];
  if (z.liveDrag) advise.push(`Dừng hoặc đổi mục tiêu chiến dịch "${z.liveDrag.name}" sang tối ưu GMV.`);
  if (z.strong.length) advise.push(`Tăng ngân sách cho ${z.strong.slice(0, 3).map((p) => shortAdName(p.name)).join("; ")} (${METRIC.roas} từ ${x1(z.strong[z.strong.length > 3 ? 2 : z.strong.length - 1].roas)}).`);
  if (z.searchManual && z.searchAuto && (z.searchManual.roas ?? 0) > (z.searchAuto.roas ?? 0) * 1.3) advise.push("Dồn ngân sách Shop+ sang chiến dịch thủ công.");
  if (z.noSales.count > 0) advise.push("Không bật lại sản phẩm không có đơn.");
  if (z.totals.gmvDirect < z.totals.gmv * 0.7) advise.push(`Doanh số ghi nhận có thể trùng đơn giữa các loại Ads; so sánh thận trọng theo ROAS đơn trực tiếp (${x1(t.roasDirect)}).`);

  return {
    observe,
    cause: cause.join(" ") || "—",
    impact: impact.join(" ") || "—",
    advise: advise.join(" ") || "—"
  };
}

/** Tên sản phẩm Shopee dài cả câu ⇒ lấy phần trước " Chính Hãng"/" –"/" |", tối đa 44 ký tự; tên có biến thể sau "|" (màu áo) giữ phần biến thể cuối để các dòng không trùng nhau. */
export function shortAdName(name: string, n = 44): string {
  const parts = name.split("|").map((x) => x.trim());
  const variant = parts.length > 1 ? parts[parts.length - 1] : "";
  const cut = parts[0].split(/\s+(?:Chính Hãng|–)/)[0] || parts[0];
  const room = variant ? Math.max(16, n - variant.length - 3) : n;
  let head = cut;
  if (cut.length > room) {
    const at = cut.lastIndexOf(" ", room);
    head = `${cut.slice(0, at > room * 0.6 ? at : room)}…`;
  }
  return variant ? `${head} · ${variant}` : head;
}
