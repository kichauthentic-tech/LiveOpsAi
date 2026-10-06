import type { DataRawReportType, LiveSession } from "../../types";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { fmtKeyMetric, KEY_METRIC_GROUPS, KEY_METRICS, keyMetricsOfSessions, keyMetricValue, type KeyMetricKey, type KeyMetrics } from "../report/keyMetrics";
import { byHost, splitUnassignedHost } from "../performance/hostPerformance";
import { driverBreakdown, DRIVER_LABEL, type LiveStats } from "../report/monthlyReportInsights";
import { METRIC } from "../metricGlossary";
import { byHostShopee, splitUnassignedShopee } from "../performance/shopeeHostPerformance";
import { fmtShopeeMetric, SHOPEE_DRIVER_LABEL, SHOPEE_METRIC_GROUPS, SHOPEE_METRICS, shopeeDriverBreakdown, shopeeKeyMetricsOfSessions, shopeeMetricValue, type ShopeeKeyMetrics, type ShopeeMetricKey } from "../report/shopeeKeyMetrics";

// HỒ SƠ SÀN (Bước 2 lộ trình đa sàn, 07/10): MỘT chỗ duy nhất trả lời "sàn này khác gì". Trước đó ~210 câu
// `platform === "Shopee"` / `isShopee` rải trong ~35 file — màn nào quên một nhánh là sai. Màn hỏi hồ sơ (`profileOf(ca)`)
// thay vì so chuỗi tên sàn. Thêm sàn thứ ba (Lazada, Facebook…) = thêm một hồ sơ ở đây + một giá trị enum ở DB.
//
// Dữ liệu gốc hai sàn khác hoàn toàn (user xác nhận 07/10): file, cột, đơn vị dòng (TikTok: một PHÒNG, Shopee: một PHIÊN),
// định nghĩa GMV. Không bao giờ cộng số hiệu suất giữa hai sàn (lib/platforms/perf.ts).

/** Một chỉ số hiển thị được của bộ chỉ số sàn (dạng chung cho bảng/ô KPI). */
export interface MetricDefView {
  key: string;
  label: string;
  kind: string;
  /** true = tăng là tốt; false = tăng là xấu; null = trung tính. */
  goodWhenUp: boolean | null;
  group: string;
  extra?: boolean;
}

export type MetricTotals = KeyMetrics | ShopeeKeyMetrics;

/** Một host trong bảng xếp hạng của MỘT sàn (cộng bằng bộ chỉ số của sàn đó). */
export type HostRankRow = MetricTotals & { key: string; label: string; sessionCount: number };

/** Bộ chỉ số hiệu suất (tầng 2) của một sàn. Tổng chỉ tính trên ca CÙNG sàn (assertOnePlatform bên trong). */
export interface PlatformMetricSet {
  defs: MetricDefView[];
  groups: { group: string; label: string; hint: string }[];
  ofSessions: (sessions: LiveSession[], hoursOf: (s: LiveSession) => number) => MetricTotals;
  value: (t: MetricTotals, key: string) => number | null;
  fmt: (def: MetricDefView | string, v: number | null | undefined) => string;
  /** Tách ΔGMV giữa hai kỳ theo phễu của sàn (phần trăm đổi từng thừa số + tổng đổi); thiếu số ⇒ null. */
  drivers: (prev: MetricTotals, cur: MetricTotals) => { parts: { label: string; change: number }[]; total: number } | null;
  /** Công thức phễu in dưới tiêu đề "Vì sao GMV đổi". */
  driverFormula: string;
  /** Câu khi chưa tách được. */
  driverEmptyHint: string;
  /** Ghi chú độ phủ dữ liệu của kỳ (vd Shopee: mới một phần ca có ATC). */
  coverageNotes: (t: MetricTotals) => { tone: "warn" | "faint"; text: string }[];
  /** Xếp hạng host trên ca của sàn này (đổi host giữa ca chia phần như mọi màn); ca chưa gán host tách riêng. */
  hostRanking: (sessions: LiveSession[]) => { ranked: HostRankRow[]; unassigned: HostRankRow | null };
}

const TIKTOK_METRICS: PlatformMetricSet = {
  defs: KEY_METRICS,
  groups: KEY_METRIC_GROUPS,
  ofSessions: keyMetricsOfSessions,
  value: (t, key) => keyMetricValue(t as KeyMetrics, key as KeyMetricKey),
  fmt: (def, v) => fmtKeyMetric((typeof def === "string" ? def : def.kind) as Parameters<typeof fmtKeyMetric>[0], v),
  drivers: (prev, cur) => {
    const a = prev as KeyMetrics, b = cur as KeyMetrics;
    // driverBreakdown chỉ đọc gmv/giờ/views/giờ/LIVE CTR/CTOR/AOV — đều có trong KeyMetrics.
    const d = driverBreakdown(a as LiveStats, b as LiveStats);
    return d ? { parts: d.parts.map((p) => ({ label: DRIVER_LABEL[p.key], change: p.change / 100 })), total: b.gmv / (a.gmv || 1) - 1 } : null;
  },
  driverFormula: `GMV = ${METRIC.liveHours} × ${METRIC.viewsPerHour} × ${METRIC.liveCtr} × ${METRIC.ctor} × ${METRIC.aov}`,
  driverEmptyHint: "Chưa tách được: cần cả kỳ này và kỳ trước đều có ca có số.",
  coverageNotes: () => [],
  hostRanking: (sessions) => splitUnassignedHost(byHost(sessions))
};

const SHOPEE_METRICS_SET: PlatformMetricSet = {
  defs: SHOPEE_METRICS,
  groups: SHOPEE_METRIC_GROUPS,
  ofSessions: shopeeKeyMetricsOfSessions,
  value: (t, key) => shopeeMetricValue(t as ShopeeKeyMetrics, key as ShopeeMetricKey),
  fmt: (def, v) => fmtShopeeMetric((typeof def === "string" ? def : def.kind) as Parameters<typeof fmtShopeeMetric>[0], v),
  drivers: (prev, cur) => {
    const a = prev as ShopeeKeyMetrics, b = cur as ShopeeKeyMetrics;
    const d = shopeeDriverBreakdown(a, b);
    return d ? { parts: d.parts.map((p) => ({ label: SHOPEE_DRIVER_LABEL[p.key], change: p.change / 100 })), total: b.atcGmv / (a.atcGmv || 1) - 1 } : null;
  },
  driverFormula: `GMV = ${METRIC.liveHours} × ${METRIC.viewersPerHour} × ${METRIC.atcRate} × GMV/ATC — chỉ tính trên các ca có khai ATC`,
  driverEmptyHint: "Chưa tách được: cần cả kỳ này và kỳ trước đều có ca Shopee có số ATC (lúc giao ca hoặc đối soát Live List). Nguồn traffic và nhóm đối chứng của Shopee xem ở Report Tháng Shopee.",
  coverageNotes: (t) => {
    const m = t as ShopeeKeyMetrics;
    const out: { tone: "warn" | "faint"; text: string }[] = [];
    if (m.sessions > 0 && m.atcViewers < m.viewers * 0.5)
      out.push({ tone: "warn", text: `Mới ${m.atc > 0 || m.atcViewers > 0 ? "một phần" : "chưa ca nào"} có số ATC (${Math.round((m.atcViewers / (m.viewers || 1)) * 100)}% lượng Viewers) — các tỷ lệ phễu bên trên chỉ phản ánh những ca đó. Đủ số khi đối soát bằng Live List.` });
    if (m.orders === 0) out.push({ tone: "faint", text: "Số đơn và AOV của ca Shopee chỉ có sau khi đối soát Live List ở màn Đối Soát; lúc giao ca người trực chỉ khai GMV, Viewers." });
    return out;
  },
  hostRanking: (sessions) => splitUnassignedShopee(byHostShopee(sessions))
};

export interface PlatformProfile {
  id: ReportPlatform;
  /** Tên sàn trên màn ("TikTok"). */
  label: string;
  /** Tên cửa hàng / hệ thống người bán ("TikTok Shop", "Shopee"). */
  shopLabel: string;
  /** Màu nhãn sàn (chip có viền) và màu chữ sàn trong danh sách — cố định để nhận ra không cần đọc chữ. */
  chipClass: string;
  textClass: string;
  /** Ô thông tin kênh ở CRM. */
  shopNamePlaceholder: string;
  shopRefLabel: string;
  /** Định nghĩa GMV của sàn — in cạnh con số khi cần (hai sàn KHÔNG cùng định nghĩa). */
  gmvDefinition: string;
  /** Mã live gọi là gì: TikTok "phòng" (Room ID, số cộng dồn), Shopee "phiên". */
  liveRefNoun: string;
  /** Nhãn lượt xem của sàn. */
  viewsLabel: string;
  /** Bộ chỉ số tầng 2. */
  metrics: PlatformMetricSet;
  /** Có file Shop Analytics (GMV cả shop theo ngày) ở Dữ Liệu Gốc — nhóm đối chứng "phần còn lại của shop", cột Total GMV. */
  hasShopAnalytics: boolean;
  /** Ghi chú cách tính dưới khối Key Metrics. */
  metricsNote: string;
  /** Chú thích bảng Key Metrics so kỳ trước: chỉ số trung tính + chỉ số chỉ tính trên ca có số. */
  metricsLegend: string;
  /** Hai ô KPI phễu ở Bản Tin CEO (sau GMV, giờ, GMV/giờ, đơn): TikTok Views + Product CTR; Shopee Viewers + GPM. */
  briefKpis: { key: string; label: string }[];
  /** Phễu tách GMV: TikTok = Views/giờ × LIVE CTR × CTOR × AOV; Shopee = Viewers/giờ × ATC/Viewer × GMV/ATC. */
  funnel: {
    traffic: string;
    conversion: string;
    value: string;
    /** Công thức tách GMV trên ca (Hỗ Trợ Vận Hành). */
    formula: string;
    /** Đòn bẩy nâng chuyển đổi. */
    conversionLever: string;
    /** Gợi ý khi khung giờ có traffic khá mà chốt thấp. */
    lowConversionTip: string;
    /** Cách ops đọc dashboard của sàn trong ca. */
    inSessionTip: string;
    /** Benchmark ca có đủ ô đơn / CVR / LIVE CTR / AOV / Ads giờ (TikTok có từ file theo ca; Shopee không). */
    hasOrderFunnel: boolean;
  };
  // ---- giao ca ----
  /** Cách giao ca: "file" = up file Creator-Live-Performance (TikTok); "link" = dán link dashboard + gõ số (Shopee). */
  handover: "file" | "link";
  /** Số đếm thứ ba khi gõ số lúc giao ca / đổi host: TikTok = đơn (bắt buộc), Shopee = ATC (không bắt buộc). */
  handoverThird: { key: "orders" | "atc"; label: string; required: boolean };
  /** Có ô "Xu đã tung" lúc giao ca. */
  handoverCoins: boolean;
  dashboardLinkExample: string;
  dashboardLinkHint: string;
  /** Số lúc đổi host giữa ca: "file" (TikTok, 0148) hay "link" (Shopee, 0147). */
  segmentCheckpoint: "file" | "link";
  /** Cửa sổ ca hiện các bộ đếm riêng của TikTok (SKU orders, followers, shares, likes, PCU, tỷ lệ snapshot). */
  showsTikTokCounters: boolean;
  // ---- dữ liệu gốc / đối soát / Ads ----
  /** File đối soát cuối kỳ. */
  reconciliationFile: string;
  /** Loại Dữ Liệu Gốc tải ở màn Dữ Liệu Gốc (không gồm file Ads). */
  dataRawTypes: DataRawReportType[];
  /** Đuôi file nhận ở Dữ Liệu Gốc + nhãn. */
  dataRawAccept: string;
  dataRawAcceptLabel: string;
  /** Nơi tải file gốc trên sàn. */
  sellerCenterLabel: string;
  /** Ghi chú cách up lại file trong cùng tháng. */
  dataRawReplaceNote: string;
  /** Loại file Ads (tải ở Nhập Ads). */
  adsFileType: DataRawReportType;
  adsFileLabel: string;
  /** Tab Brand workspace không áp dụng cho sàn này (không có nguồn dữ liệu). */
  hiddenBrandTabs: string[];
  /** Dòng gợi ý khi số liệu một kênh cũ: tải file nào. */
  staleDataHint: string;
}

export const PLATFORM_PROFILES: Record<ReportPlatform, PlatformProfile> = {
  TikTok: {
    id: "TikTok",
    label: "TikTok",
    shopLabel: "TikTok Shop",
    chipClass: "bg-cyan-950 text-cyan-300 border-cyan-800",
    textClass: "text-cyan-300",
    shopNamePlaceholder: "Tên shop trên TikTok Shop",
    shopRefLabel: "Handle / Shop ID",
    gmvDefinition: "GMV LIVE của TikTok — gồm cả đơn huỷ/hoàn, khoá theo lúc thanh toán",
    liveRefNoun: "phòng",
    viewsLabel: "Views",
    metrics: TIKTOK_METRICS,
    briefKpis: [{ key: "views", label: "Views" }, { key: "ctr", label: "Product CTR" }],
    hasShopAnalytics: true,
    metricsNote: "",
    metricsLegend: "xám = trung tính (UPT, Avg. price, Giờ live). ERR, LIVE impressions/giờ, Avg. view chỉ tính các ca có số của trường đó.",
    funnel: {
      traffic: "Views",
      conversion: "CVR",
      value: "AOV",
      formula: "GMV = Views × CVR × AOV (CVR = LIVE CTR × CTOR)",
      conversionLever: "deal/voucher, kịch bản chốt",
      lowConversionTip: "Khung này lịch sử view khá nhưng CVR thấp — ưu tiên deal chốt đơn. ",
      hasOrderFunnel: true,
      inSessionTip: "Trong ca, ops so bằng mắt với dashboard TikTok: view thấp → đẩy traffic; CTR/CVR thấp → tối ưu deal/kịch bản; ads vượt → hãm."
    },
    handover: "file",
    handoverThird: { key: "orders", label: "Đơn", required: true },
    handoverCoins: false,
    dashboardLinkExample: "https://shop.tiktok.com/workbench/live/overview?room_id=…",
    dashboardLinkHint: 'Ca TikTok: dán link TikTok Shop có "room_id=…".',
    segmentCheckpoint: "file",
    showsTikTokCounters: true,
    reconciliationFile: "Creator-Live-Performance",
    dataRawTypes: ["creator_live_performance", "shop_promotion", "product_list", "shop_analytics", "live_performance_core_stats", "live_analysis"],
    dataRawAccept: ".xlsx,.xls",
    dataRawAcceptLabel: "Excel",
    sellerCenterLabel: "TikTok Shop",
    dataRawReplaceNote: "(file TikTok luôn cộng dồn từ đầu tháng)",
    adsFileType: "ads_campaign_overview",
    adsFileLabel: "Campaign overview data (TikTok Ads, theo ngày)",
    hiddenBrandTabs: [],
    staleDataHint: "Tải file Creator Live Performance từ TikTok rồi up ở Dữ Liệu Gốc; cuối kỳ up thêm ở Đối Soát Số Liệu."
  },
  Shopee: {
    id: "Shopee",
    label: "Shopee",
    shopLabel: "Shopee",
    chipClass: "bg-orange-950 text-orange-300 border-orange-800",
    textClass: "text-orange-400",
    shopNamePlaceholder: "Tên shop trên Shopee",
    shopRefLabel: "Shop ID",
    gmvDefinition: "Doanh số đơn ĐẶT của Shopee (Placed) — đơn xác nhận là số riêng",
    liveRefNoun: "phiên",
    viewsLabel: "Viewers",
    metrics: SHOPEE_METRICS_SET,
    briefKpis: [{ key: "viewers", label: "Viewers" }, { key: "gpm", label: "GPM" }],
    hasShopAnalytics: false,
    metricsNote: "Chỉ số Shopee: GMV = doanh số đặt; ATC, CO, đơn và xu chỉ tính trên các ca có số đó.",
    metricsLegend: "xám = trung tính (Giờ live, Xu đã tung). ATC, CO, Orders, Xu chỉ tính các ca có số đó; số đơn có sau khi đối soát Live List.",
    funnel: {
      traffic: "Viewers",
      conversion: "ATC/Viewer",
      value: "GMV/ATC",
      formula: "GMV = Viewers × ATC/Viewer × GMV/ATC",
      conversionLever: "xu/voucher live, deal giờ vàng, kịch bản kéo thêm giỏ",
      lowConversionTip: "Khung này lịch sử viewers khá nhưng chốt thấp — ưu tiên xu/voucher live để kéo giỏ. ",
      hasOrderFunnel: false,
      inSessionTip: "Trong ca, ops so bằng mắt với dashboard Shopee Creator Center: Viewers thấp → đẩy traffic; ATC thấp → xu/voucher live, deal giờ vàng."
    },
    handover: "link",
    handoverThird: { key: "atc", label: "ATC", required: false },
    handoverCoins: true,
    dashboardLinkExample: "https://banhang.shopee.vn/creator-center/dashboard/live/…",
    dashboardLinkHint: 'Ca Shopee: dán link Creator Center có "/dashboard/live/<số>".',
    segmentCheckpoint: "link",
    showsTikTokCounters: false,
    reconciliationFile: "Live List",
    dataRawTypes: ["shopee_live_list", "shopee_product_list", "shopee_daily", "shopee_overview"],
    dataRawAccept: ".xlsx,.xls,.csv",
    dataRawAcceptLabel: "Excel / CSV",
    sellerCenterLabel: "Shopee Seller Centre",
    dataRawReplaceNote: "",
    adsFileType: "shopee_ads",
    adsFileLabel: "Shopee Live Ads Report (một dòng mỗi chiến dịch)",
    hiddenBrandTabs: ["brand_affiliate", "brand_skus"],
    staleDataHint: "Tải file Live List từ Shopee Seller Centre rồi up ở Dữ Liệu Gốc (chọn Shopee); cuối kỳ đối soát bằng Live List."
  }
};

/** Nhãn cột Excel của một chỉ số: tỷ lệ ghi rõ (%) / (s) vì ô Excel là số trần. */
export const metricSheetLabel = (d: MetricDefView) => (d.kind.startsWith("pct") ? `${d.label} (%)` : d.kind === "sec" ? `${d.label} (s)` : d.label);
/** Số cho ô Excel (làm tròn 2 chữ số, thiếu ⇒ ""). */
export const metricSheetValue = (v: number | null) => (v == null || Number.isNaN(v) ? "" : Math.round(v * 100) / 100);

/** Hồ sơ của một sàn, hoặc của sàn mà một dòng (ca, ca mở, kế hoạch…) thuộc về. */
export function profileOf(x: ReportPlatform | { platform?: string | null } | null | undefined): PlatformProfile {
  if (typeof x === "string") return PLATFORM_PROFILES[x];
  return PLATFORM_PROFILES[platformOf(x ?? {})];
}
