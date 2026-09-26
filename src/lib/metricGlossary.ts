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
  nmv: "NMV",
  orders: "Orders",
  skuOrders: "SKU orders",
  itemsSold: "Items sold",
  customers: "Customers",
  sessions: "Sessions",
  liveHours: "Giờ live",
  gmvPerHour: "GMV/giờ",
  views: "Views",
  viewsPerHour: "Views/giờ",
  liveImpressions: "LIVE impressions",
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
  [METRIC.nmv]: "Net Merchandise Value ước tính = GMV × (1 − tỷ lệ hoàn hủy)",
  [METRIC.orders]: "Số đơn hàng",
  [METRIC.skuOrders]: "Số đơn tính theo SKU (1 đơn nhiều SKU đếm nhiều lần)",
  [METRIC.itemsSold]: "Số sản phẩm bán ra",
  [METRIC.sessions]: "Số phiên live",
  [METRIC.liveHours]: "Tổng thời lượng live (giờ)",
  [METRIC.gmvPerHour]: "GMV ÷ Giờ live",
  [METRIC.views]: "Lượt xem phiên live",
  [METRIC.viewsPerHour]: "Views ÷ Giờ live",
  [METRIC.liveImpressions]: "Lượt hiển thị phiên live trên feed/đề xuất",
  [METRIC.productImpressions]: "Lượt hiển thị sản phẩm trong phiên",
  [METRIC.productClicks]: "Lượt click vào sản phẩm",
  [METRIC.aov]: "Average Order Value = GMV ÷ Orders",
  [METRIC.upt]: "Units Per Transaction = Items sold ÷ Orders",
  [METRIC.avgPrice]: "Giá bán trung bình mỗi sản phẩm = GMV ÷ Items sold",
  [METRIC.err]: "Enter Room Rate = Views ÷ LIVE impressions (TikTok: Tap-through rate)",
  [METRIC.liveCtr]: "Product clicks ÷ Views",
  [METRIC.productCtr]: "Product clicks ÷ Product impressions (TikTok: CTR)",
  [METRIC.ctor]: "Click-to-Order Rate = Orders ÷ Product clicks",
  [METRIC.cvr]: "Conversion rate = Orders ÷ Views",
  [METRIC.gmvPerView]: "GMV ÷ Views",
  [METRIC.showGpm]: "GMV trên 1.000 LIVE impressions",
  [METRIC.watchGpm]: "GMV trên 1.000 Views",
  [METRIC.refundRate]: "Refunds ÷ GMV — hoàn tiền thực tế của shop trong kỳ",
  [METRIC.returnCancelRate]: "Tỷ lệ hoàn hủy giả định ở Rate Card, dùng để ước tính NMV",
  [METRIC.roas]: "GMV ÷ Ads cost",
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
