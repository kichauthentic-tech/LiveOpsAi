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

export const METRIC = {
  gmv: "GMV",
  totalGmv: "Total GMV", // GMV cả shop (mọi kênh)
  liveGmv: "LIVE GMV", // GMV các phiên live agency vận hành
  directGmv: "Direct GMV", // TikTok "LIVE GMV": đơn chốt ngay trong phiên
  indirectGmv: "Indirect GMV", // TikTok "LIVE indirect GMV": đơn về sau từ người đã xem phiên
  attributedGmv: "Attributed GMV", // = Direct + Indirect
  kpiGmv: "KPI GMV", // KPI cả shop brand giao
  targetGmv: "Target GMV", // target GMV live
  pctTarget: "% Target",
  runRate: "Run-rate", // tiến độ: thực đạt ÷ target plan tới ngày có số (planRunRate)
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
  adsCost: "Ads cost",
  share: "Tỷ trọng"
} as const;

/** Kênh bán trong Shop Analytics / file Sản Phẩm — đúng tên deck "Sales Channel Report". */
export const CHANNEL = {
  sellerLive: "Seller LIVE",
  affiliateLive: "Affiliate LIVE",
  video: "Video",
  sellerVideo: "Seller video",
  affiliateVideo: "Affiliate video",
  productCard: "Product card"
} as const;

/** Loại ngày — đúng tên deck: Daily / Campaign (D-Day, Mid-Month, Pay Day). */
export const DAY_TYPE = {
  daily: "Daily",
  campaign: "Campaign"
} as const;

/** Công thức + nghĩa tiếng Việt, hiện ở tooltip (thuộc tính `title`) khi di chuột vào tên chỉ số. */
export const METRIC_HINT: Record<string, string> = {
  [METRIC.gmv]: "Gross Merchandise Value — tổng giá trị đơn đã đặt, trước hoàn hủy",
  [METRIC.totalGmv]: "GMV cả shop, mọi kênh: Seller LIVE + Affiliate LIVE + Video + Product card",
  [METRIC.liveGmv]: "GMV các phiên live do agency vận hành",
  [METRIC.directGmv]: "GMV đơn chốt ngay trong phiên live (TikTok: LIVE GMV)",
  [METRIC.indirectGmv]: "GMV đơn về sau từ người đã xem phiên (TikTok: LIVE indirect GMV)",
  [METRIC.attributedGmv]: "Direct GMV + Indirect GMV (TikTok: LIVE-attributed GMV)",
  [METRIC.kpiGmv]: "KPI GMV cả shop brand giao trong tháng",
  [METRIC.targetGmv]: "GMV mục tiêu của live trong kỳ/phiên (Kế Hoạch Tháng; affiliate: target theo creator)",
  [METRIC.pctTarget]: "Thực đạt ÷ Target",
  [METRIC.runRate]: "Thực đạt ÷ target các ca kế hoạch có ngày ≤ ngày cuối có số (ca huỷ vẫn giữ target, ca ngoài plan target = 0)",
  [METRIC.nmv]: "Net Merchandise Value ước tính = GMV × (1 − tỷ lệ hoàn hủy)",
  [METRIC.orders]: "Số đơn hàng",
  [METRIC.skuOrders]: "Số đơn tính theo SKU (1 đơn nhiều SKU đếm nhiều lần)",
  [METRIC.itemsSold]: "Số sản phẩm bán ra",
  [METRIC.sessions]: "Số phiên live",
  [METRIC.liveHours]: "Tổng thời lượng live (giờ)",
  [METRIC.gmvPerHour]: "GMV ÷ Giờ live",
  [METRIC.views]: "Lượt xem phiên live",
  [METRIC.avgView]: "Thời gian xem trung bình mỗi lượt xem (giây), bình quân theo Views — chỉ các ca có số Avg. view",
  [METRIC.newFollowers]: "Người theo dõi mới có được trong phiên live (cột New followers của TikTok)",
  [METRIC.viewsPerHour]: "Views ÷ Giờ live",
  [METRIC.liveImpressions]: "Lượt hiển thị phiên live trên feed/đề xuất",
  [METRIC.impressionsPerHour]: "LIVE impressions ÷ Giờ live (chỉ các ca có số LIVE impressions)",
  [METRIC.productImpressions]: "Lượt hiển thị sản phẩm trong phiên",
  [METRIC.productClicks]: "Lượt click vào sản phẩm",
  [METRIC.aov]: "Average Order Value = GMV ÷ Orders (TikTok; Shopee gọi là ABS)",
  [METRIC.upt]: "Units Per Transaction = Items sold ÷ Orders",
  [METRIC.avgPrice]: "Giá bán trung bình mỗi sản phẩm = GMV ÷ Items sold",
  [METRIC.err]: "Enter Room Rate = Views ÷ LIVE impressions (TikTok: Tap-through rate) — chỉ các ca có số LIVE impressions",
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
  [METRIC.atcRate]: "Tự tính: ATC ÷ Viewers — bao nhiêu người xem bấm thêm giỏ; chỉ các ca có số ATC",
  [METRIC.gmvPerAtc]: "Tự tính: GMV ÷ ATC — mỗi lần thêm giỏ đáng bao nhiêu tiền; chỉ các ca có số ATC",
  [METRIC.itemsSoldShopee]: "Shopee Items Sold(Placed Order): số sản phẩm bán ra theo đơn đặt — có theo ca sau khi đối soát bằng Live List",
  [METRIC.abs]: "Shopee ABS(Placed Order) — Average Basket Size = Sales(Placed Order) ÷ Orders(Placed Order)",
  [METRIC.salesConfirmed]: "Shopee Sales(Confirmed Order): doanh số đơn đã xác nhận = số thực nhận sau đơn huỷ",
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
  [METRIC.roas]: "GMV ÷ Ads cost (Shopee Live Ads: GMV ÷ Expense)",
  [METRIC.share]: "Phần trăm trên tổng"
};

/** Tooltip cho một nhãn: khớp đúng tên chuẩn, hoặc tên chuẩn đứng đầu nhãn ("CTOR (%)", "GMV/giờ T9"). */
export function metricHint(label: string): string | undefined {
  if (METRIC_HINT[label]) return METRIC_HINT[label];
  let best: string | undefined;
  for (const k of Object.keys(METRIC_HINT)) {
    if (label.startsWith(k + " ") && (!best || k.length > best.length)) best = k;
  }
  return best ? METRIC_HINT[best] : undefined;
}
