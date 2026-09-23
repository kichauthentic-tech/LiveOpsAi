import { LiveSession } from "../../../types";
import { MonthSource, ShopDayRow, ProductRow, PromotionRow, eachDateOf } from "../../dataraw/deepDiveSource";
import { vnDateOf } from "../../dataraw/creatorLivePerfSlice";
import { pickLiveUnits, LiveUnit, LiveSourceKind, LIVE_SOURCE_LABEL } from "./liveUnits";

// ---------------------------------------------------------------------------
// Tầng TÍNH của Report Tháng Chuyên Sâu — thuần hàm, không đụng network/React, để chạy được cả
// trong harness Node lẫn trong app. Mọi khối phân tích đều tự khai "có đủ dữ liệu hay không"
// (hasData) thay vì trả 0: báo cáo hiện "chưa có file X" trung thực hơn là vẽ biểu đồ toàn số 0.
// ---------------------------------------------------------------------------

const sum = <T>(arr: T[], f: (x: T) => number): number => arr.reduce((a, x) => a + (f(x) || 0), 0);
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const pctChange = (cur: number, prev: number): number | null => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Pearson r — dùng cho "thời lượng phiên có thực sự kéo GMV lên không". */
function corr(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : null;
}

// --- Kiểu kết quả ----------------------------------------------------------

export interface Kpi {
  key: string;
  label: string;
  value: number;
  prev: number | null;
  deltaPct: number | null;
  format: "money" | "int" | "pct" | "decimal";
  /** true = tăng là tốt. Dùng để tô màu; refund/hoàn tiền thì ngược. */
  higherIsBetter: boolean;
  hint?: string;
}

export interface ChannelSlice {
  key: string;
  label: string;
  gmv: number;
  share: number;
  prevGmv: number;
  prevShare: number;
  deltaPct: number | null;
  /** Đóng góp vào mức tăng/giảm GMV toàn shop so tháng trước (điểm %). */
  contributionToGrowthPct: number | null;
}

export interface DailyPoint {
  date: string;
  day: number;
  weekday: number;
  gmv: number;
  orders: number;
  aov: number | null;
  visitors: number;
  cvr: number;
  liveGmv: number;
  liveHours: number;
  sessions: number;
  ma7: number | null;
  /** Ngày có phiên live mang nhãn campaign (suy từ tiêu đề phòng). */
  campaign?: string;
}

export interface WeekdayStat {
  weekday: number;
  label: string;
  days: number;
  avgGmv: number;
  avgLiveGmv: number;
  avgSessions: number;
  indexVsMean: number;
}

export interface FunnelStage {
  key: string;
  label: string;
  value: number;
  prev: number | null;
  /** Tỉ lệ chuyển từ bậc trước (điểm %). */
  convFromPrev: number | null;
  prevConvFromPrev: number | null;
}

export interface SessionPoint {
  roomId: string;
  title: string;
  date: string;
  startHour: number;
  hours: number;
  gmv: number;
  gmvPerHour: number;
  views: number;
  productImpressions: number;
  productClicks: number;
  ctr: number;
  ctor: number;
  skuOrders: number;
  aov: number;
  newFollowers: number;
  campaign: string;
  hostName?: string;
}

export interface HourBucket {
  hour: number;
  label: string;
  sessions: number;
  gmv: number;
  hours: number;
  gmvPerHour: number | null;
  avgCtor: number | null;
}

export interface HostStat {
  hostName: string;
  sessions: number;
  hours: number;
  gmv: number;
  gmvPerHour: number | null;
  aov: number | null;
  skuOrders: number;
  views: number;
  productImpressions: number;
  productClicks: number;
  ctr: number | null;
  ctor: number | null;
  newFollowers: number;
  sharePct: number;
  prevGmv: number | null;
  deltaPct: number | null;
}

export interface ProductStat extends ProductRow {
  sharePct: number;
  cumulativeSharePct: number;
  prevGmv: number | null;
  deltaPct: number | null;
  liveSharePct: number;
}

export interface PromotionStat extends PromotionRow {
  /** GMV luỹ kế / GMV shop trong tháng — chỉ có nghĩa với chương trình chạy trọn trong tháng. */
  gmvShareOfMonth: number | null;
}

export interface QualityFlag {
  level: "error" | "warn" | "info";
  message: string;
}

export interface TrendPoint {
  month: string;
  gmv: number;
  liveGmv: number;
  orders: number;
  aov: number | null;
  cvr: number | null;
  liveHours: number;
  gmvPerLiveHour: number | null;
  sessions: number;
}

export interface DeepDive {
  month: string;
  prevMonth: string | null;
  /** Nguồn của MỌI chỉ số theo ca trong báo cáo này — xem liveUnits.ts. */
  liveSource: LiveSourceKind;
  liveSourceLabel: string;
  daysInMonth: number;
  daysWithData: number;
  isPartial: boolean;
  present: MonthSource["present"];

  kpis: Kpi[];
  channels: ChannelSlice[];
  daily: DailyPoint[];
  weekday: WeekdayStat[];
  concentration: {
    top5DaysGmvPct: number | null;
    daysFor80Pct: number | null;
    bestDay?: DailyPoint;
    worstDay?: DailyPoint;
  };
  liveFunnel: FunnelStage[];
  sessions: SessionPoint[];
  sessionStats: {
    count: number;
    hours: number;
    gmvPerHour: { p25: number; median: number; p75: number; best: number; worst: number } | null;
    durationGmvCorr: number | null;
    hourBuckets: HourBucket[];
  };
  campaigns: {
    name: string;
    sessions: number;
    days: number;
    gmv: number;
    hours: number;
    gmvPerHour: number | null;
    avgCtor: number | null;
    gmvPerDay: number | null;
  }[];
  hosts: HostStat[];
  products: {
    loaded: boolean;
    top: ProductStat[];
    skusFor80Pct: number | null;
    totalSkusWithSales: number;
    risers: ProductStat[];
    fallers: ProductStat[];
    channelSplit: { key: string; label: string; gmv: number; share: number }[];
  };
  promotions: {
    insideMonth: PromotionStat[];
    longRunning: PromotionStat[];
    totalDiscount: number;
  };
  trend: TrendPoint[];
  quality: QualityFlag[];
}

// --- Phân loại campaign từ tiêu đề phòng live ------------------------------

/**
 * Tiêu đề phòng là thứ DUY NHẤT trong dataraw cho biết phiên chạy theo chiến dịch nào — TikTok
 * không có trường campaign. Nhận diện theo từ khoá, mặc định "Thường" để không bịa nhóm.
 */
export function classifyCampaign(title: string): string {
  const t = (title || "").toLowerCase();
  if (/(\d)\.\1|double\s*day|ngày đôi/.test(t)) return "Ngày đôi";
  if (/mega|siêu sale|super\s*sale/.test(t)) return "Mega Sale";
  if (/payday|lương về/.test(t)) return "Payday";
  if (/giữa tháng|mid\s*month/.test(t)) return "Giữa tháng";
  if (/cuối tháng|end\s*month/.test(t)) return "Cuối tháng";
  if (/đầu tháng/.test(t)) return "Đầu tháng";
  if (/clearance|xả kho|thanh lý/.test(t)) return "Xả kho";
  if (/brand\s*day/.test(t)) return "Brand Day";
  return "Thường";
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// --- Tính ------------------------------------------------------------------

function totalsOf(src: MonthSource | undefined, units: LiveUnit[]) {
  const d = src?.shopDays ?? [];
  return {
    gmv: sum(d, (x) => x.gmv),
    orders: sum(d, (x) => x.orders),
    skuOrders: sum(d, (x) => x.skuOrders),
    customers: sum(d, (x) => x.customers),
    itemsSold: sum(d, (x) => x.itemsSold),
    refunds: sum(d, (x) => x.refunds),
    visitors: sum(d, (x) => x.visitors),
    pageViews: sum(d, (x) => x.pageViews),
    impressions: sum(d, (x) => x.productImpressions),
    clicks: sum(d, (x) => x.productClicks),
    liveAttr: sum(src?.liveDays ?? [], (x) => x.liveAttrGmv),
    liveViews: sum(src?.liveDays ?? [], (x) => x.views),
    // 3 dòng dưới là chỉ số theo CA -> luôn từ nguồn đã chọn ở pickLiveUnits, không đọc Dataraw.
    sessionGmv: sum(units, (x) => x.gmv),
    sessionHours: sum(units, (x) => x.hours),
    sessionCount: units.length
  };
}

export function buildDeepDive(
  month: string,
  sources: Map<string, MonthSource>,
  sessionsByMonth: Map<string, LiveSession[]>,
  trendMonths: string[]
): DeepDive {
  const src = sources.get(month);
  const prevMonth = prevMonthOf(month);
  const prev = sources.get(prevMonth);

  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const shopDays = src?.shopDays ?? [];
  const daysWithData = shopDays.length;
  const isPartial = daysWithData > 0 && daysWithData < daysInMonth;

  // Nguồn số ca — xem liveUnits.ts. Tháng trước phải chọn theo CÙNG quy tắc, nếu không MoM sẽ so
  // ca đã đối soát của tháng này với file thô của tháng trước.
  const curLive = pickLiveUnits(sessionsByMonth.get(month) ?? [], src?.sessions ?? []);
  const prevLive = pickLiveUnits(sessionsByMonth.get(prevMonth) ?? [], prev?.sessions ?? []);
  const units = curLive.units;

  const cur = totalsOf(src, units);
  const pre = totalsOf(prev, prevLive.units);

  // --- KPI -----------------------------------------------------------------
  const kpis: Kpi[] = [
    { key: "gmv", label: "GMV", value: cur.gmv, prev: prev ? pre.gmv : null, deltaPct: pctChange(cur.gmv, pre.gmv), format: "money", higherIsBetter: true },
    { key: "orders", label: "Đơn hàng", value: cur.orders, prev: prev ? pre.orders : null, deltaPct: pctChange(cur.orders, pre.orders), format: "int", higherIsBetter: true },
    { key: "aov", label: "AOV", value: div(cur.gmv, cur.orders) ?? 0, prev: prev ? div(pre.gmv, pre.orders) : null, deltaPct: pctChange(div(cur.gmv, cur.orders) ?? 0, div(pre.gmv, pre.orders) ?? 0), format: "money", higherIsBetter: true },
    { key: "customers", label: "Khách hàng", value: cur.customers, prev: prev ? pre.customers : null, deltaPct: pctChange(cur.customers, pre.customers), format: "int", higherIsBetter: true },
    { key: "itemsSold", label: "Sản phẩm bán ra", value: cur.itemsSold, prev: prev ? pre.itemsSold : null, deltaPct: pctChange(cur.itemsSold, pre.itemsSold), format: "int", higherIsBetter: true },
    { key: "visitors", label: "Khách truy cập", value: cur.visitors, prev: prev ? pre.visitors : null, deltaPct: pctChange(cur.visitors, pre.visitors), format: "int", higherIsBetter: true },
    {
      key: "cvr", label: "Tỷ lệ chuyển đổi", value: (div(cur.skuOrders, cur.visitors) ?? 0) * 100,
      prev: prev ? (div(pre.skuOrders, pre.visitors) ?? 0) * 100 : null,
      deltaPct: pctChange((div(cur.skuOrders, cur.visitors) ?? 0) * 100, (div(pre.skuOrders, pre.visitors) ?? 0) * 100),
      format: "pct", higherIsBetter: true, hint: "Đơn SKU ÷ khách truy cập"
    },
    {
      key: "refundRate", label: "Tỷ lệ hoàn", value: (div(cur.refunds, cur.gmv) ?? 0) * 100,
      prev: prev ? (div(pre.refunds, pre.gmv) ?? 0) * 100 : null,
      deltaPct: pctChange((div(cur.refunds, cur.gmv) ?? 0) * 100, (div(pre.refunds, pre.gmv) ?? 0) * 100),
      format: "pct", higherIsBetter: false, hint: "Hoàn tiền ÷ GMV"
    },
    { key: "liveGmv", label: "GMV từ LIVE", value: cur.liveAttr, prev: prev ? pre.liveAttr : null, deltaPct: pctChange(cur.liveAttr, pre.liveAttr), format: "money", higherIsBetter: true },
    { key: "liveHours", label: "Giờ LIVE", value: cur.sessionHours, prev: prev ? pre.sessionHours : null, deltaPct: pctChange(cur.sessionHours, pre.sessionHours), format: "decimal", higherIsBetter: true },
    {
      key: "gmvPerHour", label: "GMV/giờ LIVE", value: div(cur.sessionGmv, cur.sessionHours) ?? 0,
      prev: prev ? div(pre.sessionGmv, pre.sessionHours) : null,
      deltaPct: pctChange(div(cur.sessionGmv, cur.sessionHours) ?? 0, div(pre.sessionGmv, pre.sessionHours) ?? 0),
      format: "money", higherIsBetter: true, hint: "Hiệu suất thật của mảng vận hành live"
    },
    { key: "sessions", label: "Số phiên LIVE", value: cur.sessionCount, prev: prev ? pre.sessionCount : null, deltaPct: pctChange(cur.sessionCount, pre.sessionCount), format: "int", higherIsBetter: true }
  ];

  // --- Kênh ----------------------------------------------------------------
  const chOf = (s: typeof shopDays) => ({
    shopLive: sum(s, (x) => x.linkedLiveAttr),
    creatorLive: sum(s, (x) => x.creatorLiveAttr),
    video: sum(s, (x) => x.creatorVideoAttr + x.linkedVideoAttr),
    total: sum(s, (x) => x.gmv)
  });
  const c0 = chOf(shopDays);
  const p0 = chOf(prev?.shopDays ?? []);
  const cardCur = sum(src?.products ?? [], (x) => x.cardGmv);
  const cardPrev = sum(prev?.products ?? [], (x) => x.cardGmv);
  const otherCur = Math.max(0, c0.total - c0.shopLive - c0.creatorLive - c0.video - cardCur);
  const otherPrev = Math.max(0, p0.total - p0.shopLive - p0.creatorLive - p0.video - cardPrev);
  const growthDenom = p0.total;
  const mkChannel = (key: string, label: string, gmv: number, prevGmv: number): ChannelSlice => ({
    key, label, gmv, prevGmv,
    share: c0.total > 0 ? (gmv / c0.total) * 100 : 0,
    prevShare: p0.total > 0 ? (prevGmv / p0.total) * 100 : 0,
    deltaPct: pctChange(gmv, prevGmv),
    contributionToGrowthPct: growthDenom > 0 ? ((gmv - prevGmv) / growthDenom) * 100 : null
  });
  const channels: ChannelSlice[] = [
    mkChannel("shopLive", "LIVE của shop", c0.shopLive, p0.shopLive),
    mkChannel("creatorLive", "LIVE của creator (affiliate)", c0.creatorLive, p0.creatorLive),
    mkChannel("card", "Thẻ sản phẩm", cardCur, cardPrev),
    mkChannel("video", "Video", c0.video, p0.video),
    mkChannel("other", "Khác (tìm kiếm, đề xuất…)", otherCur, otherPrev)
  ].sort((a, b) => b.gmv - a.gmv);

  // --- Theo ngày -----------------------------------------------------------
  const liveByDate = new Map<string, { gmv: number; hours: number; n: number; campaign?: string }>();
  for (const s of units) {
    const e = liveByDate.get(s.date) ?? { gmv: 0, hours: 0, n: 0 };
    e.gmv += s.gmv; e.hours += s.hours; e.n += 1;
    const camp = classifyCampaign(s.title);
    if (camp !== "Thường") e.campaign = camp;
    liveByDate.set(s.date, e);
  }
  const daily: DailyPoint[] = shopDays.map((d) => {
    const lv = liveByDate.get(d.date);
    const dt = new Date(`${d.date}T00:00:00Z`);
    return {
      date: d.date,
      day: dt.getUTCDate(),
      weekday: dt.getUTCDay(),
      gmv: d.gmv,
      orders: d.orders,
      aov: div(d.gmv, d.orders),
      visitors: d.visitors,
      cvr: d.conversionRate,
      liveGmv: lv?.gmv ?? 0,
      liveHours: lv?.hours ?? 0,
      sessions: lv?.n ?? 0,
      ma7: null,
      campaign: lv?.campaign
    };
  });
  for (let i = 0; i < daily.length; i++) {
    if (i < 6) continue;
    daily[i].ma7 = daily.slice(i - 6, i + 1).reduce((a, x) => a + x.gmv, 0) / 7;
  }

  // --- Theo thứ ------------------------------------------------------------
  const meanDayGmv = daily.length > 0 ? sum(daily, (d) => d.gmv) / daily.length : 0;
  const weekday: WeekdayStat[] = [1, 2, 3, 4, 5, 6, 0].map((w) => {
    const ds = daily.filter((d) => d.weekday === w);
    const avg = ds.length > 0 ? sum(ds, (d) => d.gmv) / ds.length : 0;
    return {
      weekday: w,
      label: WEEKDAY_LABELS[w],
      days: ds.length,
      avgGmv: avg,
      avgLiveGmv: ds.length > 0 ? sum(ds, (d) => d.liveGmv) / ds.length : 0,
      avgSessions: ds.length > 0 ? sum(ds, (d) => d.sessions) / ds.length : 0,
      indexVsMean: meanDayGmv > 0 ? (avg / meanDayGmv) * 100 : 0
    };
  });

  // --- Độ tập trung --------------------------------------------------------
  const sortedDays = [...daily].sort((a, b) => b.gmv - a.gmv);
  const totalDaily = sum(daily, (d) => d.gmv);
  let acc = 0, daysFor80: number | null = null;
  for (let i = 0; i < sortedDays.length; i++) {
    acc += sortedDays[i].gmv;
    if (daysFor80 === null && totalDaily > 0 && acc / totalDaily >= 0.8) daysFor80 = i + 1;
  }
  const concentration = {
    top5DaysGmvPct: totalDaily > 0 ? (sum(sortedDays.slice(0, 5), (d) => d.gmv) / totalDaily) * 100 : null,
    daysFor80Pct: daysFor80,
    bestDay: sortedDays[0],
    worstDay: sortedDays[sortedDays.length - 1]
  };

  // --- Phễu LIVE -----------------------------------------------------------
  const funnelOf = (ss: LiveUnit[]) => ({
    views: sum(ss, (x) => x.views),
    impressions: sum(ss, (x) => x.productImpressions),
    clicks: sum(ss, (x) => x.productClicks),
    skuOrders: sum(ss, (x) => x.skuOrders),
    gmv: sum(ss, (x) => x.gmv)
  });
  const fc = funnelOf(units);
  const fp = funnelOf(prevLive.units);
  const liveFunnel: FunnelStage[] = [
    { key: "views", label: "Lượt xem", value: fc.views, prev: prev ? fp.views : null, convFromPrev: null, prevConvFromPrev: null },
    { key: "impressions", label: "Hiển thị sản phẩm", value: fc.impressions, prev: prev ? fp.impressions : null, convFromPrev: div(fc.impressions, fc.views) !== null ? (fc.impressions / fc.views) * 100 : null, prevConvFromPrev: fp.views > 0 ? (fp.impressions / fp.views) * 100 : null },
    { key: "clicks", label: "Nhấp sản phẩm", value: fc.clicks, prev: prev ? fp.clicks : null, convFromPrev: fc.impressions > 0 ? (fc.clicks / fc.impressions) * 100 : null, prevConvFromPrev: fp.impressions > 0 ? (fp.clicks / fp.impressions) * 100 : null },
    { key: "skuOrders", label: "Đơn SKU", value: fc.skuOrders, prev: prev ? fp.skuOrders : null, convFromPrev: fc.clicks > 0 ? (fc.skuOrders / fc.clicks) * 100 : null, prevConvFromPrev: fp.clicks > 0 ? (fp.skuOrders / fp.clicks) * 100 : null },
    { key: "gmv", label: "GMV", value: fc.gmv, prev: prev ? fp.gmv : null, convFromPrev: null, prevConvFromPrev: null }
  ];

  // --- Phiên ---------------------------------------------------------------
  // Mọi TỶ LỆ tính lại từ số đếm để 2 nguồn dùng chung một định nghĩa — xem đầu liveUnits.ts.
  const sessionPoints: SessionPoint[] = units.map((s) => ({
    roomId: s.key,
    title: s.title,
    date: s.date,
    startHour: s.startHour,
    hours: s.hours,
    gmv: s.gmv,
    gmvPerHour: s.hours > 0 ? s.gmv / s.hours : 0,
    views: s.views,
    productImpressions: s.productImpressions,
    productClicks: s.productClicks,
    ctr: s.productImpressions > 0 ? (s.productClicks / s.productImpressions) * 100 : 0,
    ctor: s.productClicks > 0 ? (s.skuOrders / s.productClicks) * 100 : 0,
    skuOrders: s.skuOrders,
    aov: s.skuOrders > 0 ? s.gmv / s.skuOrders : 0,
    newFollowers: s.newFollowers,
    campaign: classifyCampaign(s.title),
    hostName: s.hostName
  }));
  const gph = sessionPoints.filter((s) => s.hours > 0.1).map((s) => s.gmvPerHour).sort((a, b) => a - b);
  const hourBuckets: HourBucket[] = [];
  for (let h = 0; h < 24; h++) {
    const ss = sessionPoints.filter((s) => s.startHour === h);
    if (ss.length === 0) continue;
    const hrs = sum(ss, (s) => s.hours);
    hourBuckets.push({
      hour: h,
      label: `${String(h).padStart(2, "0")}h`,
      sessions: ss.length,
      gmv: sum(ss, (s) => s.gmv),
      hours: hrs,
      gmvPerHour: div(sum(ss, (s) => s.gmv), hrs),
      avgCtor: ss.length > 0 ? sum(ss, (s) => s.ctor) / ss.length : null
    });
  }
  const sessionStats = {
    count: sessionPoints.length,
    hours: sum(sessionPoints, (s) => s.hours),
    gmvPerHour: gph.length > 0
      ? { p25: quantile(gph, 0.25), median: quantile(gph, 0.5), p75: quantile(gph, 0.75), best: gph[gph.length - 1], worst: gph[0] }
      : null,
    durationGmvCorr: corr(sessionPoints.map((s) => s.hours), sessionPoints.map((s) => s.gmv)),
    hourBuckets
  };

  // --- Campaign ------------------------------------------------------------
  const campMap = new Map<string, SessionPoint[]>();
  for (const s of sessionPoints) {
    const list = campMap.get(s.campaign) ?? [];
    list.push(s);
    campMap.set(s.campaign, list);
  }
  const campaigns = [...campMap.entries()].map(([name, ss]) => {
    const days = new Set(ss.map((s) => s.date)).size;
    const hrs = sum(ss, (s) => s.hours);
    const gmv = sum(ss, (s) => s.gmv);
    return {
      name, sessions: ss.length, days, gmv, hours: hrs,
      gmvPerHour: div(gmv, hrs),
      avgCtor: ss.length > 0 ? sum(ss, (s) => s.ctor) / ss.length : null,
      gmvPerDay: div(gmv, days)
    };
  }).sort((a, b) => b.gmv - a.gmv);

  // --- Host ----------------------------------------------------------------
  // Dùng CHÍNH units đã chọn, không đọc lại live_sessions — nếu không, bảng Host và ma trận phiên
  // sẽ lệch nhau ở các ca bị loại (ca huỷ) hoặc khi tháng phải rơi về nguồn Dataraw.
  const hosts = buildHostStats(units, prevLive.units);

  // --- Sản phẩm ------------------------------------------------------------
  const prods = src?.products ?? [];
  const prevProdByKey = new Map((prev?.products ?? []).map((p) => [p.productId || p.name, p]));
  const totalProdGmv = sum(prods, (p) => p.gmv);
  const withSales = prods.filter((p) => p.gmv > 0).sort((a, b) => b.gmv - a.gmv);
  let cum = 0, skusFor80: number | null = null;
  const statList: ProductStat[] = withSales.map((p, i) => {
    cum += p.gmv;
    if (skusFor80 === null && totalProdGmv > 0 && cum / totalProdGmv >= 0.8) skusFor80 = i + 1;
    const pv = prevProdByKey.get(p.productId || p.name);
    const liveGmv = p.sellerLiveGmv + p.creatorLiveGmv;
    return {
      ...p,
      sharePct: totalProdGmv > 0 ? (p.gmv / totalProdGmv) * 100 : 0,
      cumulativeSharePct: totalProdGmv > 0 ? (cum / totalProdGmv) * 100 : 0,
      prevGmv: pv ? pv.gmv : null,
      deltaPct: pv ? pctChange(p.gmv, pv.gmv) : null,
      liveSharePct: p.gmv > 0 ? (liveGmv / p.gmv) * 100 : 0
    };
  });
  const movers = statList.filter((p) => p.prevGmv !== null && p.prevGmv > 0 && p.gmv > 0);
  const products = {
    loaded: src?.productsLoaded ?? false,
    top: statList.slice(0, 20),
    skusFor80Pct: skusFor80,
    totalSkusWithSales: withSales.length,
    risers: [...movers].sort((a, b) => (b.gmv - (b.prevGmv ?? 0)) - (a.gmv - (a.prevGmv ?? 0))).slice(0, 8),
    fallers: [...movers].sort((a, b) => (a.gmv - (a.prevGmv ?? 0)) - (b.gmv - (b.prevGmv ?? 0))).slice(0, 8),
    channelSplit: (() => {
      const parts = [
        { key: "sellerLive", label: "LIVE shop", gmv: sum(prods, (p) => p.sellerLiveGmv) },
        { key: "creatorLive", label: "LIVE creator", gmv: sum(prods, (p) => p.creatorLiveGmv) },
        { key: "card", label: "Thẻ sản phẩm", gmv: sum(prods, (p) => p.cardGmv) },
        { key: "sellerVideo", label: "Video shop", gmv: sum(prods, (p) => p.sellerVideoGmv) },
        { key: "creatorVideo", label: "Video creator", gmv: sum(prods, (p) => p.creatorVideoGmv) }
      ];
      const t = sum(parts, (p) => p.gmv);
      return parts.map((p) => ({ ...p, share: t > 0 ? (p.gmv / t) * 100 : 0 })).sort((a, b) => b.gmv - a.gmv);
    })()
  };

  // --- Khuyến mãi ----------------------------------------------------------
  const promoStat = (p: PromotionRow): PromotionStat => ({
    ...p,
    gmvShareOfMonth: p.fullyInsideMonth && cur.gmv > 0 ? (p.gmvLifetime / cur.gmv) * 100 : null
  });
  const allPromos = (src?.promotions ?? []).map(promoStat);
  const promotions = {
    insideMonth: allPromos.filter((p) => p.fullyInsideMonth && p.gmvLifetime > 0).sort((a, b) => b.gmvLifetime - a.gmvLifetime),
    longRunning: allPromos.filter((p) => !p.fullyInsideMonth && p.gmvLifetime > 0).sort((a, b) => b.gmvLifetime - a.gmvLifetime).slice(0, 10),
    totalDiscount: sum(allPromos.filter((p) => p.fullyInsideMonth), (p) => p.discountAmount)
  };

  // --- Xu hướng ------------------------------------------------------------
  const trend: TrendPoint[] = trendMonths.map((mm) => {
    const s = sources.get(mm);
    // Cùng quy tắc chọn nguồn cho mọi tháng trên đường xu hướng, nếu không đường GMV/giờ LIVE sẽ
    // gãy khúc ở đúng chỗ tháng cũ chưa có ca — trông như hiệu suất sụt chứ không phải đổi nguồn.
    const t = totalsOf(s, pickLiveUnits(sessionsByMonth.get(mm) ?? [], s?.sessions ?? []).units);
    return {
      month: mm,
      gmv: t.gmv,
      liveGmv: t.liveAttr,
      orders: t.orders,
      aov: div(t.gmv, t.orders),
      cvr: t.visitors > 0 ? (t.skuOrders / t.visitors) * 100 : null,
      liveHours: t.sessionHours,
      gmvPerLiveHour: div(t.sessionGmv, t.sessionHours),
      sessions: t.sessionCount
    };
  });

  // --- Chất lượng dữ liệu --------------------------------------------------
  const quality: QualityFlag[] = [];
  const present = src?.present ?? {
    shop_promotion: false, product_list: false, live_analysis: false,
    shop_analytics: false, live_performance_core_stats: false, creator_live_performance: false
  };
  const NAMES: Record<string, string> = {
    shop_analytics: "Shop Analytics",
    live_performance_core_stats: "Live Performance",
    creator_live_performance: "Creator Live Performance",
    product_list: "Sản Phẩm",
    shop_promotion: "Khuyến Mãi"
  };
  for (const k of ["shop_analytics", "live_performance_core_stats", "creator_live_performance", "product_list", "shop_promotion"]) {
    if (!(present as Record<string, boolean>)[k]) quality.push({ level: "error", message: `Thiếu file "${NAMES[k]}" cho tháng này — các khối dùng nguồn đó sẽ trống.` });
  }
  if (isPartial) quality.push({ level: "warn", message: `Tháng chưa trọn: có ${daysWithData}/${daysInMonth} ngày. Mọi so sánh MoM đang so kỳ ngắn với tháng đủ — đọc theo trung bình/ngày thay vì tổng.` });
  if ((src?.missingShopDays.length ?? 0) > 0) quality.push({ level: "warn", message: `Thiếu ${src!.missingShopDays.length} ngày trong Shop Analytics: ${src!.missingShopDays.slice(0, 5).join(", ")}${src!.missingShopDays.length > 5 ? "…" : ""}` });
  if (present.product_list && !(src?.productsLoaded ?? false)) quality.push({ level: "info", message: "Khối Sản Phẩm đang tải nền (file Sản Phẩm nặng ~5 MB/tháng nên nạp sau khi báo cáo hiện ra)." });
  if (promotions.longRunning.length > 0) quality.push({ level: "info", message: `${promotions.longRunning.length} chương trình khuyến mãi kéo dài qua nhiều tháng — GMV của chúng là LUỸ KẾ cả chương trình, không phải GMV tháng này, nên không xếp chung bảng với chương trình chạy trọn trong tháng.` });
  if (curLive.source === "dataraw") quality.push({ level: "warn", message: "Tháng này chưa có ca nào trong Lịch Vận Hành nên số theo phiên đang đọc thẳng từ Dữ Liệu Gốc — chưa đối soát và không có tên host. Nạp bù ca từ file rồi chạy Đối Soát Số Liệu để có bản chuẩn." });
  if (prev && curLive.source !== prevLive.source && prevLive.source !== "none") quality.push({ level: "warn", message: `So sánh MoM đang bắc qua 2 nguồn khác nhau (tháng này: ${LIVE_SOURCE_LABEL[curLive.source]}; tháng trước: ${LIVE_SOURCE_LABEL[prevLive.source]}) — chênh lệch có thể do đổi nguồn chứ không phải do vận hành.` });
  const unmatchedSessions = sessionPoints.filter((s) => !s.hostName).length;
  if (unmatchedSessions > 0) quality.push({ level: "warn", message: `${unmatchedSessions}/${sessionPoints.length} phiên chưa gắn được host — bảng Hiệu Suất Host thiếu phần này.` });

  return {
    month, prevMonth: prev ? prevMonth : null,
    liveSource: curLive.source, liveSourceLabel: LIVE_SOURCE_LABEL[curLive.source],
    daysInMonth, daysWithData, isPartial, present,
    kpis, channels, daily, weekday, concentration, liveFunnel,
    sessions: sessionPoints, sessionStats, campaigns, hosts, products, promotions, trend, quality
  };
}

function buildHostStats(cur: LiveUnit[], prev: LiveUnit[]): HostStat[] {
  const agg = (list: LiveUnit[]) => {
    const m = new Map<string, HostStat>();
    for (const s of list) {
      const name = s.hostName || "(chưa gán host)";
      const e = m.get(name) ?? {
        hostName: name, sessions: 0, hours: 0, gmv: 0, gmvPerHour: null, aov: null, skuOrders: 0,
        views: 0, productImpressions: 0, productClicks: 0, ctr: null, ctor: null, newFollowers: 0,
        sharePct: 0, prevGmv: null, deltaPct: null
      };
      e.sessions += 1;
      e.hours += s.hours;
      e.gmv += s.gmv;
      e.skuOrders += s.skuOrders;
      e.views += s.views;
      e.productImpressions += s.productImpressions;
      e.productClicks += s.productClicks;
      e.newFollowers += s.newFollowers;
      m.set(name, e);
    }
    return m;
  };
  const c = agg(cur);
  const p = agg(prev);
  const total = [...c.values()].reduce((a, x) => a + x.gmv, 0);
  return [...c.values()].map((h) => {
    const pv = p.get(h.hostName);
    return {
      ...h,
      gmvPerHour: h.hours > 0 ? h.gmv / h.hours : null,
      aov: h.skuOrders > 0 ? h.gmv / h.skuOrders : null,
      ctr: h.productImpressions > 0 ? (h.productClicks / h.productImpressions) * 100 : null,
      ctor: h.productClicks > 0 ? (h.skuOrders / h.productClicks) * 100 : null,
      sharePct: total > 0 ? (h.gmv / total) * 100 : 0,
      prevGmv: pv ? pv.gmv : null,
      deltaPct: pv && pv.gmv > 0 ? ((h.gmv - pv.gmv) / pv.gmv) * 100 : null
    };
  }).sort((a, b) => b.gmv - a.gmv);
}

export function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function lastNMonths(month: string, n: number): string[] {
  const out: string[] = [];
  let cur = month;
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    cur = prevMonthOf(cur);
  }
  return out;
}

export { eachDateOf };
