// Từ điển chỉ số — MỘT tên chuẩn cho mỗi chỉ số trên mọi report/chart/bảng của app.
//
// Chuẩn lấy từ report tháng gửi brand (deck Crocs/Jockey/Franklin/VERA T8-2026) và tên cột
// gốc trong file export TikTok Shop (Creator-Live-Performance, LIVE Data Analysis, Product list).
// Công thức đã đối chiếu bằng số thật, vd ca CROCS 01/08: Product clicks 3.561 ÷ Views 7.396 =
// 48,15% = đúng cột "LIVE CTR" của TikTok; Views 7.396 ÷ LIVE impressions 417.199 = 1,77% = cột
// "Tap through rate" (team gọi là ERR).
//
// Quy ước (user chốt 2026-09-26):
// - Tên chỉ số giữ tiếng Anh như deck/TikTok; tiêu đề phần, insight, chú thích viết tiếng Việt.
// - "giờ" giữ tiếng Việt trong tên chỉ số theo giờ: "GMV/giờ", "Views/giờ", "Giờ live".
// - Views ÷ LIVE impressions gọi là ERR (không gọi "CTR live").
// - Thực đạt ÷ target luôn là "% Target". "Run-rate" chỉ dùng cho nhịp tiến độ dùng để dự phóng.
// Test `tests/metricGlossary.test.ts` quét src để chặn các tên cũ quay lại.
// Tiếng Anh (05/11, Report Tháng bật EN): các bảng dưới đây là `byLang` — đọc bản theo displayLang; ngoài report luôn là bản Việt.

import { byLang, isEn } from "./displayLang";

const METRIC_VI = {
  gmv: "GMV",
  totalGmv: "Total GMV", // GMV cả shop (mọi kênh)
  liveGmv: "LIVE GMV", // GMV các phiên live agency vận hành
  directGmv: "Direct GMV", // TikTok "LIVE GMV": đơn chốt ngay trong phiên
  indirectGmv: "Indirect GMV", // TikTok "LIVE indirect GMV": đơn về sau từ người đã xem phiên
  attributedGmv: "Attributed GMV", // = Direct + Indirect
  kpiGmv: "KPI GMV", // KPI cả shop brand giao
  targetGmv: "Target GMV", // target GMV live
  pctTarget: "% Target",
  runRate: "Run-rate", // tiến độ: thực đạt ÷ target plan tới ngày có số liệu (planRunRate)
  nmv: "NMV",
  orders: "Orders",
  skuOrders: "SKU orders",
  itemsSold: "Items sold",
  customers: "Customers",
  sessions: "Sessions",
  liveHours: "Giờ live",
  gmvPerHour: "GMV/giờ",
  views: "Views",
  avgView: "Avg. view", // thời gian xem trung bình (giây) — đúng tên dòng "AVG. view" ở bảng host deck Crocs
  newFollowers: "New followers",
  viewsPerHour: "Views/giờ",
  liveImpressions: "LIVE impressions",
  impressionsPerHour: "LIVE impressions/giờ",
  productImpressions: "Product impressions",
  productClicks: "Product clicks",
  aov: "AOV",
  upt: "UPT",
  avgPrice: "Avg. price",
  err: "ERR",
  liveCtr: "LIVE CTR",
  productCtr: "Product CTR",
  ctor: "CTOR",
  cvr: "CVR",
  gmvPerView: "GMV/View",
  showGpm: "Show GPM",
  watchGpm: "Watch GPM",
  // ---- SHOPEE: tên theo ĐÚNG cột trong file Shopee Seller Centre (Live List, theo ngày, overview, Product List, Live Ads).
  // Shopee không có LIVE impressions / ERR / LIVE CTR / CTOR / CVR / UPT / AOV / CO / Direct–Indirect GMV: đừng dùng tên TikTok cho số Shopee.
  viewers: "Viewers", // Total Viewers: người xem riêng biệt (khác Views — Total Views — của chính Shopee)
  viewersPerHour: "Viewers/giờ",
  engagedViewers: "Engaged Viewers",
  avgViewingDuration: "Avg. Viewing Duration",
  pcu: "PCU",
  atc: "ATC", // Total ATC: số lần thêm vào giỏ
  atcRate: "ATC/Viewer", // tự tính: ATC ÷ Viewers (%)
  gmvPerAtc: "GMV/ATC", // tự tính: GMV ÷ ATC
  abs: "ABS", // ABS(Placed Order) = Average Basket Size = Sales ÷ Orders — tên Shopee của AOV
  itemsSoldShopee: "Items Sold", // Shopee Items Sold(Placed Order) — viết hoa chữ S như tên cột Shopee
  salesConfirmed: "Sales (Confirmed Order)",
  ordersConfirmed: "Orders (Confirmed Order)",
  buyers: "Buyers",
  salesPerBuyer: "Sales Per Buyer",
  salesNewCustomers: "Sales from New Customers",
  ctr: "CTR", // Shopee: Product Clicks ÷ Product Impressions (khác Product CTR của TikTok chỉ ở tên)
  orderRate: "Order Rate", // Shopee: Orders ÷ Product Clicks
  clickToOrderRate: "Click to Order Rate",
  gpm: "GPM", // Shopee GPM(Placed Order) = Sales trên 1.000 Views (Total Views), KHÔNG phải trên Viewers
  totalLikes: "Total Likes",
  totalShares: "Total Shares",
  totalComments: "Total Comments",
  liveNewFollowers: "Live New Followers",
  shopVoucherClaimed: "Shop Voucher Claimed",
  specialLiveVoucherClaimed: "Special Live Voucher Claimed",
  coinsClaimed: "Coins Claimed",
  salesRatio: "Sales Ratio",
  liveViews: "Live Views",
  liveViewers: "Live Viewers",
  budget: "Budget", // Shopee Live Ads
  conversionRate: "Conversion Rate", // Shopee Live Ads
  expense: "Expense", // Shopee Live Ads: chi phí
  refunds: "Refunds",
  refundRate: "Refund rate",
  returnCancelRate: "Tỷ lệ hoàn hủy",
  roas: "ROAS",
  acos: "ACOS", // Shopee Ads: chi phí ÷ doanh số từ Ads
  adsCost: "Ads cost",
  share: "Tỷ trọng"
} as const;

const METRIC_EN: Partial<Record<keyof typeof METRIC_VI, string>> = {
  liveHours: "Live hours",
  gmvPerHour: "GMV/hour",
  viewsPerHour: "Views/hour",
  impressionsPerHour: "LIVE impressions/hour",
  viewersPerHour: "Viewers/hour",
  returnCancelRate: "Return & cancel rate",
  share: "Share"
};

export const METRIC = byLang(() => (isEn() ? { ...METRIC_VI, ...METRIC_EN } : METRIC_VI) as typeof METRIC_VI);

/** Kênh bán trong Shop Analytics / file Sản Phẩm — đúng tên deck "Sales Channel Report". */
export const CHANNEL = {
  sellerLive: "Seller LIVE",
  affiliateLive: "Affiliate LIVE",
  video: "Video",
  sellerVideo: "Seller video",
  affiliateVideo: "Affiliate video",
  productCard: "Product card"
} as const;

// ---- TÊN DOANH SỐ THEO SÀN (user chốt 02/11): mỗi sàn gọi bằng ĐÚNG tên trong report của sàn đó.
// TikTok Shop: "GMV" (LIVE GMV, Direct/Indirect GMV, GMV/giờ…). Shopee Seller Centre: "Sales" / "Doanh số" — cột Live List, theo ngày, overview,
// Product List đều ghi Sales(Placed Order) / Sales(Confirmed Order); phần cả shop ghi "Doanh số" (SHOPEE_SHOP). Số vẫn là doanh số ĐẶT (Placed Order,
// quyết định 06/10), chỉ đổi TÊN. Mọi chỗ biết sàn của số phải lấy tên qua `metricFor(platform)` / `platformText(text, platform)`, không gõ "GMV" cứng.
export type TermPlatform = "TikTok" | "Shopee";
/** Nơi một nhãn dùng chung cho cả hai sàn (bảng trộn TikTok + Shopee): hiện cả hai tên, vd "GMV/giờ · Sales/giờ". */
export type TermScope = TermPlatform | "all";

const SHOPEE_SALES_VI = {
  gmv: "Sales",
  totalGmv: "Tổng doanh số",
  liveGmv: "Sales live",
  directGmv: "Sales trực tiếp",
  indirectGmv: "Sales gián tiếp",
  attributedGmv: "Sales quy cho live",
  kpiGmv: "KPI Sales",
  targetGmv: "Target Sales",
  gmvPerHour: "Sales/giờ",
  gmvPerView: "Sales/Viewer",
  gmvPerAtc: "Sales/ATC",
  nmv: "Sales (Confirmed Order)"
} as const;

const SHOPEE_SALES_EN: Record<keyof typeof SHOPEE_SALES_VI, string> = {
  gmv: "Sales",
  totalGmv: "Total Sales",
  liveGmv: "Live Sales",
  directGmv: "Direct Sales",
  indirectGmv: "Indirect Sales",
  attributedGmv: "Live-attributed Sales",
  kpiGmv: "KPI Sales",
  targetGmv: "Target Sales",
  gmvPerHour: "Sales/hour",
  gmvPerView: "Sales/Viewer",
  gmvPerAtc: "Sales/ATC",
  nmv: "Sales (Confirmed Order)"
};
const shopeeSalesNames = () => (isEn() ? SHOPEE_SALES_EN : SHOPEE_SALES_VI);

/** Bộ tên chỉ số của một sàn: TikTok = METRIC nguyên bản; Shopee = METRIC với nhóm tên doanh số đổi sang "Sales". */
export function metricFor(platform: TermPlatform | null | undefined): typeof METRIC {
  return platform === "Shopee" ? ({ ...METRIC, ...shopeeSalesNames() } as unknown as typeof METRIC) : METRIC;
}

/** Đổi tên doanh số trong MỌI chuỗi của một cấu trúc (mảng/đối tượng lồng nhau) — dùng cho khối Insight/tiêu đề do hàm dùng chung dựng ra. */
export function deepPlatformText<T>(value: T, platform: TermPlatform | null | undefined): T {
  if (platform !== "Shopee") return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return platformText(v, platform);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value) as T;
}

/** Bộ tên chỉ số của Shopee (METRIC với nhóm doanh số là "Sales") — dùng trong mọi file/khối chỉ phục vụ Shopee. */
export const METRIC_SHOPEE = byLang(() => metricFor("Shopee"));

/** Tên doanh số của sàn dùng giữa câu: TikTok "GMV", Shopee "Sales". */
export const salesTerm = (platform: TermPlatform | null | undefined): string => (platform === "Shopee" ? "Sales" : "GMV");

const SHOPEE_TEXT_RULES: [RegExp, string | ((m: string, k: string) => string)][] = [
  [/Total GMV/g, "totalGmv"],
  [/Direct GMV/g, "directGmv"],
  [/Indirect GMV/g, "indirectGmv"],
  [/Attributed GMV/g, "attributedGmv"],
  [/LIVE GMV/g, "liveGmv"],
  [/Target GMV/g, "targetGmv"],
  [/KPI GMV/g, "kpiGmv"],
  [/GMV\/(giờ|hour|View|ATC|Viewers?)/g, (_m: string, k: string) => `Sales/${k === "View" ? "Viewer" : k}`],
  [/\bGMV\b/g, "gmv"]
];

/** Đổi tên doanh số trong một câu/nhãn sang tên của sàn. TikTok giữ nguyên; Shopee "GMV" → "Sales" (Total GMV → Tổng doanh số…);
 *  "all" (nhãn dùng chung cho cả hai sàn) giữ tên TikTok và thêm tên Shopee: "GMV/giờ · Sales/giờ". */
export function platformText(text: string, platform: TermScope | null | undefined): string {
  if ((platform !== "Shopee" && platform !== "all") || !text.includes("GMV")) return text;
  if (platform === "all") {
    const TOKEN = /(?<![\w])((?:KPI Total |Total |LIVE |Target |Direct |Indirect |Attributed |KPI )?GMV(?:\/giờ|\/hour|\/View|\/ATC)?)(?![\w])/g;
    return text.replace(TOKEN, (m) => {
      const sh = platformText(m, "Shopee");
      return sh === m ? m : `${m} · ${sh}`;
    });
  }
  let out = text;
  // Quy tắc chuỗi = khoá tên doanh số Shopee (đọc theo ngôn ngữ đang hiện); hàm = đổi giữ đuôi "/giờ", "/hour"…
  const names = shopeeSalesNames();
  for (const [re, to] of SHOPEE_TEXT_RULES) out = typeof to === "string" ? out.replace(re, names[to as keyof typeof names]) : out.replace(re, to);
  return out;
}

/** Loại ngày — đúng tên deck: Daily / Campaign (D-Day, Mid-Month, Pay Day). */
export const DAY_TYPE = {
  daily: "Daily",
  campaign: "Campaign"
} as const;

/** Công thức + nghĩa (Việt; Anh khi Report bật EN), hiện ở tooltip (thuộc tính `title`) khi di chuột vào tên chỉ số. */
export const METRIC_HINT: Record<string, string> = byLang(() =>
  isEn()
    ? {
  [METRIC.gmv]: "Gross Merchandise Value — total value of placed orders, before refunds and cancellations",
  [METRIC.totalGmv]: "Whole-shop GMV across all channels: Seller LIVE + Affiliate LIVE + Video + Product card",
  [METRIC.liveGmv]: "GMV of the live sessions run by YFB",
  [METRIC.directGmv]: "GMV of orders placed during the live session (TikTok: LIVE GMV)",
  [METRIC.indirectGmv]: "GMV of later orders from people who watched the session (TikTok: LIVE indirect GMV)",
  [METRIC.attributedGmv]: "Direct GMV + Indirect GMV (TikTok: LIVE-attributed GMV)",
  [METRIC.kpiGmv]: "Whole-shop GMV KPI set by the brand for the month",
  [METRIC.targetGmv]: "Live GMV target for the period/session (month plan; affiliate: target per creator)",
  [METRIC.pctTarget]: "Actual ÷ Target",
  [METRIC.runRate]: "Actual ÷ target of planned sessions dated up to the last day with data (cancelled sessions keep their target, unplanned sessions have target 0)",
  [METRIC.nmv]: "Estimated Net Merchandise Value = GMV × (1 − return & cancel rate)",
  [METRIC.orders]: "Number of orders",
  [METRIC.skuOrders]: "Orders counted per SKU (an order with several SKUs counts several times)",
  [METRIC.itemsSold]: "Number of items sold",
  [METRIC.sessions]: "Number of live sessions",
  [METRIC.liveHours]: "Total live duration (hours)",
  [METRIC.gmvPerHour]: "GMV ÷ Live hours",
  [METRIC.views]: "Live session views",
  [METRIC.avgView]: "Average watch time per view (seconds), weighted by Views — only sessions with Avg. view data",
  [METRIC.newFollowers]: "New followers gained during the live session (TikTok New followers column)",
  [METRIC.viewsPerHour]: "Views ÷ Live hours",
  [METRIC.liveImpressions]: "Times the live session was shown in feed/recommendations",
  [METRIC.impressionsPerHour]: "LIVE impressions ÷ Live hours (only sessions with LIVE impressions data)",
  [METRIC.productImpressions]: "Product impressions during the session",
  [METRIC.productClicks]: "Clicks on products",
  [METRIC.aov]: "Average Order Value = GMV ÷ Orders (TikTok; Shopee calls it ABS)",
  [METRIC.upt]: "Units Per Transaction = Items sold ÷ Orders",
  [METRIC.avgPrice]: "Average selling price per item = GMV ÷ Items sold",
  [METRIC.err]: "Enter Room Rate = Views ÷ LIVE impressions (TikTok: Tap-through rate) — only sessions with LIVE impressions data",
  [METRIC.liveCtr]: "Product clicks ÷ Views",
  [METRIC.productCtr]: "Product clicks ÷ Product impressions (TikTok: CTR)",
  [METRIC.ctor]: "Click-to-Order Rate = Orders ÷ Product clicks",
  [METRIC.cvr]: "Conversion rate = Orders ÷ Views",
  [METRIC.gmvPerView]: "GMV ÷ Views",
  [METRIC.showGpm]: "GMV per 1,000 LIVE impressions",
  [METRIC.watchGpm]: "GMV per 1,000 Views",
  [METRIC.viewers]: "Shopee Total Viewers: unique viewers of the session (counted differently from TikTok Views — do not compare with TikTok)",
  [METRIC.viewersPerHour]: "Calculated: Viewers ÷ Live hours",
  [METRIC.engagedViewers]: "Shopee Engaged Viewers: viewers who interacted (comment, like, product click…)",
  [METRIC.avgViewingDuration]: "Shopee Avg. Viewing Duration: average watch time per viewer",
  [METRIC.pcu]: "Peak Concurrent Users: highest number of simultaneous viewers",
  [METRIC.atc]: "Shopee Total ATC (Add-to-cart): times viewers added a product to cart — per session after reconciliation with the Live List",
  [METRIC.atcRate]: "Calculated: ATC ÷ Viewers — how many viewers added a product to cart; only sessions with ATC data",
  [METRIC.gmvPerAtc]: "Calculated: GMV ÷ ATC — GMV per add-to-cart; only sessions with ATC data",
  [METRIC.itemsSoldShopee]: "Shopee Items Sold(Placed Order): items sold from placed orders — per session after reconciliation with the Live List",
  [METRIC.abs]: "Shopee ABS(Placed Order) — Average Basket Size = Sales(Placed Order) ÷ Orders(Placed Order)",
  [METRIC.salesConfirmed]: "Shopee Sales(Confirmed Order): sales of confirmed orders = actual sales after cancellations",
  [METRIC.ordersConfirmed]: "Shopee Orders(Confirmed Order): number of confirmed orders",
  [METRIC.buyers]: "Shopee Buyers(Placed Order): number of buyers",
  [METRIC.salesPerBuyer]: "Shopee Sales Per Buyer(Placed Order): average sales per buyer",
  [METRIC.salesNewCustomers]: "Shopee Sales from New Customers(Placed Order): sales from first-time buyers",
  [METRIC.ctr]: "Shopee CTR (both the daily file and the overview file): product clicks ÷ impressions",
  [METRIC.orderRate]: "Shopee Order Rate(Placed Order): Orders ÷ Product Clicks",
  [METRIC.clickToOrderRate]: "Shopee Click to Order Rate(Placed Order): Orders ÷ clicks",
  [METRIC.gpm]: "Shopee GPM(Placed Order): Sales per 1,000 Views (Total Views) — not available per session because the Live List has no Views",
  [METRIC.totalLikes]: "Shopee Total Likes",
  [METRIC.totalShares]: "Shopee Total Shares",
  [METRIC.totalComments]: "Shopee Total Comments",
  [METRIC.liveNewFollowers]: "Shopee Live New Followers: new followers gained from live",
  [METRIC.shopVoucherClaimed]: "Shopee Shop Voucher Claimed: shop vouchers claimed during live",
  [METRIC.specialLiveVoucherClaimed]: "Shopee Special Live Voucher Claimed: live-only vouchers claimed",
  [METRIC.coinsClaimed]: "Shopee Coins Claimed: coins claimed during live (each coin counted at face value); not known whether funded by the shop or Shopee",
  [METRIC.salesRatio]: "Shopee Sales Ratio(Placed Order): share of live sales from this source",
  [METRIC.liveViews]: "Shopee Live Views: live views from this source",
  [METRIC.liveViewers]: "Shopee Live Viewers: live viewers from this source",
  [METRIC.budget]: "Shopee Live Ads — Budget: daily campaign budget",
  [METRIC.conversionRate]: "Shopee Live Ads — Conversion Rate: campaign Orders ÷ Views",
  [METRIC.expense]: "Shopee Live Ads — Expense: campaign cost in the period",
  [METRIC.refundRate]: "Refunds ÷ GMV — actual shop refunds in the period",
  [METRIC.returnCancelRate]: "Assumed return & cancel rate entered in CRM (Contract & rates), used to estimate NMV",
  [METRIC.acos]: "Shopee Ads — ACOS: Expense ÷ sales from Ads (inverse of ROAS)",
  [METRIC.roas]: "GMV ÷ Ads cost (Shopee Live Ads: GMV ÷ Expense)",
  [METRIC.share]: "Percentage of the total"
      }
    : {
  [METRIC.gmv]: "Gross Merchandise Value — tổng giá trị đơn đã đặt, trước hoàn hủy",
  [METRIC.totalGmv]: "GMV cả shop, mọi kênh: Seller LIVE + Affiliate LIVE + Video + Product card",
  [METRIC.liveGmv]: "GMV các phiên live do YFB vận hành",
  [METRIC.directGmv]: "GMV đơn chốt ngay trong phiên live (TikTok: LIVE GMV)",
  [METRIC.indirectGmv]: "GMV đơn về sau từ người đã xem phiên (TikTok: LIVE indirect GMV)",
  [METRIC.attributedGmv]: "Direct GMV + Indirect GMV (TikTok: LIVE-attributed GMV)",
  [METRIC.kpiGmv]: "KPI GMV cả shop brand giao trong tháng",
  [METRIC.targetGmv]: "GMV mục tiêu của live trong kỳ/phiên (Kế Hoạch Tháng; affiliate: target theo creator)",
  [METRIC.pctTarget]: "Thực đạt ÷ Target",
  [METRIC.runRate]: "Thực đạt ÷ target các ca kế hoạch có ngày ≤ ngày cuối có số liệu (ca huỷ vẫn giữ target, ca ngoài plan target = 0)",
  [METRIC.nmv]: "Net Merchandise Value ước tính = GMV × (1 − tỷ lệ hoàn hủy)",
  [METRIC.orders]: "Số đơn hàng",
  [METRIC.skuOrders]: "Số đơn tính theo SKU (1 đơn nhiều SKU đếm nhiều lần)",
  [METRIC.itemsSold]: "Số sản phẩm bán ra",
  [METRIC.sessions]: "Số phiên live",
  [METRIC.liveHours]: "Tổng thời lượng live (giờ)",
  [METRIC.gmvPerHour]: "GMV ÷ Giờ live",
  [METRIC.views]: "Lượt xem phiên live",
  [METRIC.avgView]: "Thời gian xem trung bình mỗi lượt xem (giây), bình quân theo Views — chỉ các ca có số liệu Avg. view",
  [METRIC.newFollowers]: "Người theo dõi mới có được trong phiên live (cột New followers của TikTok)",
  [METRIC.viewsPerHour]: "Views ÷ Giờ live",
  [METRIC.liveImpressions]: "Lượt hiển thị phiên live trên feed/đề xuất",
  [METRIC.impressionsPerHour]: "LIVE impressions ÷ Giờ live (chỉ các ca có số liệu LIVE impressions)",
  [METRIC.productImpressions]: "Lượt hiển thị sản phẩm trong phiên",
  [METRIC.productClicks]: "Lượt click vào sản phẩm",
  [METRIC.aov]: "Average Order Value = GMV ÷ Orders (TikTok; Shopee gọi là ABS)",
  [METRIC.upt]: "Units Per Transaction = Items sold ÷ Orders",
  [METRIC.avgPrice]: "Giá bán trung bình mỗi sản phẩm = GMV ÷ Items sold",
  [METRIC.err]: "Enter Room Rate = Views ÷ LIVE impressions (TikTok: Tap-through rate) — chỉ các ca có số liệu LIVE impressions",
  [METRIC.liveCtr]: "Product clicks ÷ Views",
  [METRIC.productCtr]: "Product clicks ÷ Product impressions (TikTok: CTR)",
  [METRIC.ctor]: "Click-to-Order Rate = Orders ÷ Product clicks",
  [METRIC.cvr]: "Conversion rate = Orders ÷ Views",
  [METRIC.gmvPerView]: "GMV ÷ Views",
  [METRIC.showGpm]: "GMV trên 1.000 LIVE impressions",
  [METRIC.watchGpm]: "GMV trên 1.000 Views",
  [METRIC.viewers]: "Shopee Total Viewers: số người xem riêng biệt trong phiên (không cùng cách đếm với Views của TikTok, đừng đem so với TikTok)",
  [METRIC.viewersPerHour]: "Tự tính: Viewers ÷ Giờ live",
  [METRIC.engagedViewers]: "Shopee Engaged Viewers: người xem có tương tác (bình luận, thả tim, bấm sản phẩm…)",
  [METRIC.avgViewingDuration]: "Shopee Avg. Viewing Duration: thời gian xem trung bình mỗi người xem",
  [METRIC.pcu]: "Peak Concurrent Users: số người xem cùng lúc cao nhất",
  [METRIC.atc]: "Shopee Total ATC (Add-to-cart): số lần người xem thêm sản phẩm vào giỏ — có theo ca sau khi đối soát bằng Live List",
  [METRIC.atcRate]: "Tự tính: ATC ÷ Viewers — bao nhiêu người xem thêm sản phẩm vào giỏ; chỉ các ca có số liệu ATC",
  [METRIC.gmvPerAtc]: "Tự tính: GMV ÷ ATC — GMV mang về trên mỗi lần thêm vào giỏ; chỉ các ca có số liệu ATC",
  [METRIC.itemsSoldShopee]: "Shopee Items Sold(Placed Order): số sản phẩm bán ra theo đơn đặt — có theo ca sau khi đối soát bằng Live List",
  [METRIC.abs]: "Shopee ABS(Placed Order) — Average Basket Size = Sales(Placed Order) ÷ Orders(Placed Order)",
  [METRIC.salesConfirmed]: "Shopee Sales(Confirmed Order): doanh số đơn đã xác nhận = số liệu thực tế nhận sau đơn huỷ",
  [METRIC.ordersConfirmed]: "Shopee Orders(Confirmed Order): số đơn đã xác nhận",
  [METRIC.buyers]: "Shopee Buyers(Placed Order): số người mua",
  [METRIC.salesPerBuyer]: "Shopee Sales Per Buyer(Placed Order): doanh số trung bình mỗi người mua",
  [METRIC.salesNewCustomers]: "Shopee Sales from New Customers(Placed Order): doanh số từ khách mua lần đầu",
  [METRIC.ctr]: "Shopee CTR (cả file theo ngày lẫn file overview): lượt click sản phẩm ÷ lượt hiển thị",
  [METRIC.orderRate]: "Shopee Order Rate(Placed Order): Orders ÷ Product Clicks",
  [METRIC.clickToOrderRate]: "Shopee Click to Order Rate(Placed Order): Orders ÷ lượt click",
  [METRIC.gpm]: "Shopee GPM(Placed Order): Sales trên 1.000 Views (Total Views) — không có theo ca vì Live List không có Views",
  [METRIC.totalLikes]: "Shopee Total Likes: lượt thả tim",
  [METRIC.totalShares]: "Shopee Total Shares: lượt chia sẻ",
  [METRIC.totalComments]: "Shopee Total Comments: lượt bình luận",
  [METRIC.liveNewFollowers]: "Shopee Live New Followers: người theo dõi mới có được từ live",
  [METRIC.shopVoucherClaimed]: "Shopee Shop Voucher Claimed: số voucher shop khách đã nhận trong live",
  [METRIC.specialLiveVoucherClaimed]: "Shopee Special Live Voucher Claimed: số voucher riêng của live khách đã nhận",
  [METRIC.coinsClaimed]: "Shopee Coins Claimed: số xu khách đã nhận trong live (quy 1 xu thành 1 đồng); chưa biết xu do shop hay Shopee tài trợ",
  [METRIC.salesRatio]: "Shopee Sales Ratio(Placed Order): phần doanh số của live đến từ nguồn này",
  [METRIC.liveViews]: "Shopee Live Views: lượt xem live đến từ nguồn này",
  [METRIC.liveViewers]: "Shopee Live Viewers: người xem live đến từ nguồn này",
  [METRIC.budget]: "Shopee Live Ads — Budget: ngân sách ngày của chiến dịch",
  [METRIC.conversionRate]: "Shopee Live Ads — Conversion Rate: Orders ÷ Views của chiến dịch",
  [METRIC.expense]: "Shopee Live Ads — Expense: chi phí chiến dịch trong kỳ",
  [METRIC.refundRate]: "Refunds ÷ GMV — hoàn tiền thực tế của shop trong kỳ",
  [METRIC.returnCancelRate]: "Tỷ lệ hoàn hủy giả định nhập ở CRM (Hợp đồng & giá), dùng để ước tính NMV",
  [METRIC.acos]: "Shopee Ads — ACOS: Expense ÷ doanh số từ Ads (nghịch đảo của ROAS)",
  [METRIC.roas]: "GMV ÷ Ads cost (Shopee Live Ads: GMV ÷ Expense)",
  [METRIC.share]: "Phần trăm trên tổng"
      }
);

/** Tooltip cho một nhãn: khớp đúng tên chuẩn, hoặc tên chuẩn đứng đầu nhãn ("CTOR (%)", "GMV/giờ T9"). */
export function metricHint(label: string): string | undefined {
  if (METRIC_HINT[label]) return METRIC_HINT[label];
  let best: string | undefined;
  for (const k of Object.keys(METRIC_HINT)) {
    if (label.startsWith(k + " ") && (!best || k.length > best.length)) best = k;
  }
  return best ? METRIC_HINT[best] : undefined;
}

/**
 * Thuật ngữ của phần CẢ SHOP Shopee — đúng chữ Seller Centre (giao diện tiếng Việt) trên 5 file cả shop: Shop Stats, Voucher, Discount,
 * Sales Composition, Sản phẩm cả shop. Không dùng tên TikTok (Total GMV, Seller LIVE, Affiliate LIVE, Product card) cho phần này.
 * Shopee gọi doanh số là "Doanh số", đơn hủy viết "hủy" (ủ), kênh theo "nguồn doanh số": Thẻ sản phẩm / Livestream của người bán /
 * Video của người bán / Tiếp thị liên kết (Affiliate Video, Affiliate Live); Dịch vụ Hiển thị Shopee là quảng cáo, chồng lên các kênh.
 */
const SHOPEE_SHOP_VI = {
  totalSales: "Tổng doanh số",
  salesPlaced: "Doanh số (Đơn đã đặt)",
  salesConfirmed: "Doanh số (Đơn đã xác nhận)",
  salesPaid: "Doanh số (Đơn đã thanh toán)",
  orders: "Tổng số đơn hàng",
  visits: "Số lượt truy cập",
  productClicks: "Lượt nhấp vào sản phẩm",
  orderConversion: "Tỷ lệ chuyển đổi đơn hàng",
  cancelledOrders: "Đơn đã hủy",
  refundedOrders: "Đơn đã hoàn trả / hoàn tiền",
  buyers: "Số người mua",
  newBuyers: "Người mua mới",
  existingBuyers: "Người mua hiện tại",
  productCard: "Thẻ sản phẩm",
  sellerLive: "Livestream của người bán",
  sellerVideo: "Video của người bán",
  affiliate: "Tiếp thị liên kết",
  affiliateLive: "Affiliate Live",
  affiliateVideo: "Affiliate Video",
  shopeeAds: "Dịch vụ Hiển thị Shopee",
  traffic: "Nguồn lưu lượng",
  voucher: "Voucher",
  promotion: "Khuyến mãi",
  promoProgram: "Chương Trình Khuyến Mãi",
  combo: "Combo Khuyến Mãi",
  dealShock: "Mua Kèm Deal Sốc",
  claimed: "Nhận",
  usageRate: "Tỷ lệ sử dụng",
  cost: "Chi phí",
  salesComposition: "Thành phần doanh số",
  priceBand: "Phân Khúc Giá",
  category: "Ngành Hàng"
} as const;
const SHOPEE_SHOP_EN: Record<keyof typeof SHOPEE_SHOP_VI, string> = {
  totalSales: "Total sales",
  salesPlaced: "Sales (Placed orders)",
  salesConfirmed: "Sales (Confirmed orders)",
  salesPaid: "Sales (Paid orders)",
  orders: "Total orders",
  visits: "Visits",
  productClicks: "Product clicks",
  orderConversion: "Order conversion rate",
  cancelledOrders: "Cancelled orders",
  refundedOrders: "Returned / refunded orders",
  buyers: "Buyers",
  newBuyers: "New buyers",
  existingBuyers: "Existing buyers",
  productCard: "Product card",
  sellerLive: "Seller livestream",
  sellerVideo: "Seller video",
  affiliate: "Affiliate marketing",
  affiliateLive: "Affiliate Live",
  affiliateVideo: "Affiliate Video",
  shopeeAds: "Shopee Ads",
  traffic: "Traffic source",
  voucher: "Voucher",
  promotion: "Promotion",
  promoProgram: "Promotion Program",
  combo: "Bundle Deal",
  dealShock: "Add-on Deal",
  claimed: "Claimed",
  usageRate: "Usage rate",
  cost: "Cost",
  salesComposition: "Sales composition",
  priceBand: "Price Band",
  category: "Category"
};
export const SHOPEE_SHOP = byLang(() => (isEn() ? SHOPEE_SHOP_EN : SHOPEE_SHOP_VI) as typeof SHOPEE_SHOP_VI);
