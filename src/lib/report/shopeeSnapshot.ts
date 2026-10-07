import type { LiveSession } from "../../types";
import { getCampaignDayInfo } from "../campaignDays";
import { byHost, filterSessions, splitUnassignedHost, dataQuality, type DataQuality } from "../performance/hostPerformance";
import { SHOPEE_FILE_TYPES, type ShopeeDay, type ShopeeOverview, type ShopeeProduct, type ShopeeStream } from "../dataraw/shopeeFiles";
import type { DataRawImportStamp } from "../db/brandDataRaw";
import type { SectionInsight } from "./sectionInsights";
import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import type { ShopeeAdsStats } from "../dataraw/shopeeAds";
import { PLATFORM_PROFILES } from "../platforms/profiles";
import { platformOf } from "../reportPlatform";

// Bản chụp Report Tháng SHOPEE (migration 0139, 2026-10-06). Hàm thuần — không import supabaseClient nên test được không
// cần .env. Cùng nguyên tắc với report TikTok: dựng MỘT lần khi ops bấm "Tạo/Cập nhật", mở report chỉ đọc bản chụp.
//
// Quy ước (user chốt 06/10):
//   - GMV Shopee = doanh số ĐẶT (Placed Order), như GMV TikTok là trước huỷ/hoàn. Doanh số XÁC NHẬN là số thực nhận;
//     chênh giữa hai số = đơn huỷ theo giá trị.
//   - Nguồn số theo thứ tự: file overview (cả tháng) → file theo ngày → Live List. Giờ live luôn từ Live List.
//   - Phần Host lấy từ CA trong app (đã gán host); số của ca là số đối soát nếu đã đối soát bằng Live List, còn lại là số tạm.
//   - Shopee không có: GMV trực tiếp/gián tiếp, lý do huỷ/hoàn, bảng chấm KPI theo nhóm.
//   - Ads (bản 2, 06/10): file "Shopee Live Ads Report" (shopee_ads, 0142) — tổng cả tháng theo chiến dịch, không theo ngày.
//     Khuyến mãi: Xu (Coins Claimed) và voucher đã nhận lấy từ file overview — Shopee chỉ cho SỐ LƯỢNG, coi 1 xu = 1đ.
//   - Loại ngày camp theo lịch cố định (D-Day, Mid-Month 13–15, Pay Day 23–25) — chưa đọc khung camp ghi đè của Kế Hoạch Tháng TikTok.

const SHOPEE = PLATFORM_PROFILES.Shopee.id;

// Bản 3 (07/10): đổi tên chỉ số theo đúng cột file Shopee (Viewers, ABS, Sales (Confirmed Order)…) + thêm GPM/PCU/Avg. Viewing Duration/Engagement.
export const SHOPEE_SNAPSHOT_VERSION = 3;

export interface ShopeeHeadline {
  gmv: number; // doanh số đặt
  confirmed: number; // doanh số xác nhận
  orders: number;
  ordersConfirmed: number;
  items: number;
  abs: number | null; // ABS(Placed Order) = GMV ÷ đơn đặt
  liveHours: number;
  liveSessions: number;
  gmvPerHour: number | null;
  viewers: number;
  views: number;
  /** Số ngày có doanh số trong file (để so cùng kỳ). */
  days: number;
  lastDay: string | null;
}

export interface ShopeeSlotRow {
  key: string;
  label: string;
  sessions: number;
  hours: number;
  gmv: number;
  gmvPerHour: number | null;
  avgViewers: number | null;
}

export interface ShopeeCampRow {
  key: "daily" | "dday" | "midmonth" | "payday";
  label: string;
  days: number;
  sessions: number;
  hours: number;
  gmv: number;
  share: number | null;
  gmvPerHour: number | null;
}

export interface ShopeeHostRow {
  key: string;
  name: string;
  sessions: number;
  hours: number;
  gmv: number;
  gmvPerHour: number | null;
}

export interface ShopeeReportSnapshot {
  version: number;
  platform: "Shopee";
  brandId: string;
  month: string; // YYYY-MM
  computedAt: string;
  /** Dấu file + ca lúc dựng — so với hiện tại để biết bản chụp còn mới không. */
  stamps: string[];
  sessionsSig: string;
  files: { live: boolean; daily: boolean; products: boolean; overview: boolean };
  headline: ShopeeHeadline;
  /** Headline tháng trước (từ bản chụp Shopee tháng trước) — null nếu chưa có. */
  prev: ShopeeHeadline | null;
  days: ShopeeDay[];
  noLiveDays: string[];
  streams: { date: string; time: string; hours: number; gmv: number; confirmed: number; orders: number; viewers: number }[];
  overview: ShopeeOverview | null;
  products: { top: ShopeeProduct[]; count: number; withSales: number; totalSales: number; top3Share: number | null };
  slots: ShopeeSlotRow[];
  camps: ShopeeCampRow[];
  hosts: ShopeeHostRow[];
  unassigned: { sessions: number; gmv: number } | null;
  plan: { sessions: number; hours: number; completed: number };
  /** Ads Shopee Live của tháng (bản 2) — null = chưa có file Ads. Thiếu hẳn (bản chụp bản 1) = chưa đọc Ads. */
  ads?: { expense: number; gmv: number; orders: number; roas: number | null; costPerOrder: number | null; campaigns: number; shopName: string | null } | null;
  /** Khuyến mãi từ file overview (bản 2): xu khách nhận (1 xu = 1đ), voucher shop / voucher live đã nhận. */
  promo?: { coins: number; vouchers: number; liveVouchers: number } | null;
  quality: DataQuality;
  /** Số tính từ ca trong app (cộng GMV các ca Completed của sàn) để đối chiếu với số của file. */
  appGmv: number;
  insights: Record<ShopeeSection, SectionInsight | null>;
  notes: string[];
}

export type ShopeeSection = "summary" | "daily" | "funnel" | "schedule" | "people" | "products";

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const hoursOf = (s: ShopeeStream) => s.durationSec / 3600;

/** Chữ ký rẻ của tập ca Shopee trong tháng — đổi khi ca thêm/bớt/đổi số/đổi người. */
export function shopeeSessionsSig(sessions: LiveSession[], brandId: string, month: string): string {
  const rows = sessions
    .filter((s) => s.brandId === brandId && platformOf(s) === SHOPEE && s.date.startsWith(month) && s.status !== "Cancelled")
    .map((s) => [s.id, s.status, s.hostId, s.coHostId ?? "", s.actualGmv ?? 0, s.dataSource ?? "", s.startTime, s.endTime, s.excludedFromReports ? 1 : 0].join("|"))
    .sort();
  let h = 5381;
  for (const ch of rows.join("\n")) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
  return `${rows.length}:${(h >>> 0).toString(36)}`;
}

export function monthDays(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

const MIN_SAMPLE = 3;

const SLOTS: { key: string; label: string; from: number; to: number }[] = [
  { key: "morning", label: "Sáng/Trưa (10h–16h)", from: 10, to: 16 },
  { key: "evening", label: "Tối (16h–24h)", from: 16, to: 24 },
  { key: "early", label: "Khuya/Sáng sớm (0h–10h)", from: 0, to: 10 }
];

const CAMP_LABEL: Record<ShopeeCampRow["key"], string> = { daily: "Ngày thường", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

export interface ShopeeSnapshotInput {
  brandId: string;
  month: string;
  sessions: LiveSession[]; // mọi ca trong app (hàm tự lọc brand/sàn/tháng)
  streams: ShopeeStream[];
  days: ShopeeDay[];
  products: ShopeeProduct[];
  overview: ShopeeOverview | null;
  files: ShopeeSnapshot_Files;
  prev: ShopeeHeadline | null;
  stamps: string[];
  /** File Ads Shopee của tháng (0142) — null = chưa tải. */
  ads?: ShopeeAdsStats | null;
  computedAt?: string;
}
type ShopeeSnapshot_Files = ShopeeReportSnapshot["files"];

export function shopeeHeadline(streams: ShopeeStream[], days: ShopeeDay[], overview: ShopeeOverview | null): ShopeeHeadline {
  const fromDays = days.length > 0;
  const gmv = overview?.salesPlaced || (fromDays ? sum(days, (d) => d.salesPlaced) : sum(streams, (s) => s.salesPlaced));
  const confirmed = overview?.salesConfirmed || (fromDays ? sum(days, (d) => d.salesConfirmed) : sum(streams, (s) => s.salesConfirmed));
  const orders = overview?.ordersPlaced || (fromDays ? sum(days, (d) => d.ordersPlaced) : sum(streams, (s) => s.ordersPlaced));
  const ordersConfirmed = overview?.ordersConfirmed || (fromDays ? sum(days, (d) => d.ordersConfirmed) : sum(streams, (s) => s.ordersConfirmed));
  const items = overview?.itemsPlaced || (fromDays ? sum(days, (d) => d.itemsPlaced) : sum(streams, (s) => s.itemsPlaced));
  const liveHours = streams.length > 0 ? sum(streams, hoursOf) : (overview?.durationSec ?? 0) / 3600;
  const liveSessions = streams.length > 0 ? streams.length : overview?.sessions ?? 0;
  const dayRows = days.filter((d) => d.salesPlaced > 0 || d.ordersPlaced > 0);
  return {
    gmv,
    confirmed,
    orders,
    ordersConfirmed,
    items,
    abs: ratio(gmv, orders),
    liveHours,
    liveSessions,
    gmvPerHour: ratio(gmv, liveHours),
    viewers: overview?.viewers || sum(days, (d) => d.viewers) || sum(streams, (s) => s.viewers),
    views: overview?.views || sum(days, (d) => d.views),
    days: dayRows.length,
    lastDay: days.length ? days[days.length - 1].date : streams.length ? [...streams].sort((a, b) => a.date.localeCompare(b.date)).at(-1)!.date : null
  };
}

const fmtM = (v: number) => fmtVndShort(v);
const pct = (v: number, d = 1) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: d })}%`;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function buildShopeeSnapshot(input: ShopeeSnapshotInput): ShopeeReportSnapshot {
  const { brandId, month, streams, days, products, overview } = input;
  const headline = shopeeHeadline(streams, days, overview);
  const prev = input.prev;

  // ---- ca trong app
  const appSessions = input.sessions.filter((s) => s.brandId === brandId && platformOf(s) === SHOPEE && s.date.startsWith(month) && s.status !== "Cancelled");
  const completed = appSessions.filter((s) => s.status === "Completed" && !s.excludedFromReports);
  const countable = filterSessions(completed, {});
  const hostRowsAll = byHost(countable);
  const { ranked, unassigned } = splitUnassignedHost(hostRowsAll);
  const hosts: ShopeeHostRow[] = ranked
    .map((r) => ({ key: r.key, name: r.label, sessions: r.sessionCount, hours: r.hours, gmv: r.gmv, gmvPerHour: r.gmvPerHour }))
    .sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0));
  const plan = {
    sessions: appSessions.length,
    hours: sum(appSessions, (s) => {
      const [sh, sm] = s.startTime.split(":").map(Number);
      const [eh, em] = s.endTime.split(":").map(Number);
      let m = eh * 60 + em - (sh * 60 + sm);
      if (m < 0) m += 1440;
      return m / 60;
    }),
    completed: completed.length
  };
  const appGmv = sum(countable, (s) => s.actualGmv ?? 0);

  // ---- khung giờ (theo giờ bắt đầu phiên, Live List)
  const slots: ShopeeSlotRow[] = SLOTS.map((sl) => {
    const rows = streams.filter((s) => {
      const h = Number(s.time.slice(0, 2));
      return h >= sl.from && h < sl.to;
    });
    const hours = sum(rows, hoursOf);
    const gmv = sum(rows, (s) => s.salesPlaced);
    return { key: sl.key, label: sl.label, sessions: rows.length, hours, gmv, gmvPerHour: ratio(gmv, hours), avgViewers: rows.length ? sum(rows, (s) => s.viewers) / rows.length : null };
  }).filter((r) => r.sessions > 0);

  // ---- loại ngày camp (lịch cố định)
  const bucketOf = (date: string): ShopeeCampRow["key"] => (getCampaignDayInfo(date)?.type ?? "daily");
  const campKeys: ShopeeCampRow["key"][] = ["daily", "dday", "midmonth", "payday"];
  const totalGmvForShare = streams.length > 0 ? sum(streams, (s) => s.salesPlaced) : headline.gmv;
  const camps: ShopeeCampRow[] = campKeys
    .map((k) => {
      const rows = streams.filter((s) => bucketOf(s.date) === k);
      const hours = sum(rows, hoursOf);
      const gmv = sum(rows, (s) => s.salesPlaced);
      return {
        key: k,
        label: CAMP_LABEL[k],
        days: new Set(rows.map((s) => s.date)).size,
        sessions: rows.length,
        hours,
        gmv,
        share: ratio(gmv, totalGmvForShare),
        gmvPerHour: ratio(gmv, hours)
      };
    })
    .filter((r) => r.sessions > 0);

  // ---- ngày không live
  const liveDates = new Set(streams.map((s) => s.date));
  const noLiveDays = streams.length > 0 ? monthDays(month).filter((d) => !liveDates.has(d) && d <= (headline.lastDay ?? d)) : [];

  // ---- sản phẩm
  const sorted = [...products].sort((a, b) => b.salesPlaced - a.salesPlaced);
  const totalSales = sum(products, (p) => p.salesPlaced);
  const productInfo = {
    top: sorted.slice(0, 20),
    count: products.length,
    withSales: products.filter((p) => p.salesPlaced > 0).length,
    totalSales,
    top3Share: ratio(sum(sorted.slice(0, 3), (p) => p.salesPlaced), totalSales)
  };

  const snapshot: ShopeeReportSnapshot = {
    version: SHOPEE_SNAPSHOT_VERSION,
    platform: "Shopee",
    brandId,
    month,
    computedAt: input.computedAt ?? new Date().toISOString(),
    stamps: input.stamps,
    sessionsSig: shopeeSessionsSig(input.sessions, brandId, month),
    files: input.files,
    headline,
    prev,
    days,
    noLiveDays,
    streams: streams.map((s) => ({ date: s.date, time: s.time, hours: hoursOf(s), gmv: s.salesPlaced, confirmed: s.salesConfirmed, orders: s.ordersPlaced, viewers: s.viewers })),
    overview,
    products: productInfo,
    slots,
    camps,
    hosts,
    unassigned: unassigned ? { sessions: unassigned.sessionCount, gmv: unassigned.gmv } : null,
    plan,
    ads: input.ads
      ? { expense: input.ads.expense, gmv: input.ads.gmv, orders: input.ads.orders, roas: input.ads.roas, costPerOrder: input.ads.costPerOrder, campaigns: input.ads.campaigns.length, shopName: input.ads.shopName }
      : null,
    promo: overview ? { coins: overview.coinsClaimed, vouchers: overview.voucherClaimed, liveVouchers: overview.specialVoucherClaimed } : null,
    quality: dataQuality(completed),
    appGmv,
    insights: { summary: null, daily: null, funnel: null, schedule: null, people: null, products: null },
    notes: []
  };
  snapshot.insights = shopeeInsights(snapshot);
  snapshot.notes = shopeeNotes(snapshot);
  return snapshot;
}

// ---------- nhận xét tự sinh ----------

export function shopeeInsights(s: ShopeeReportSnapshot): Record<ShopeeSection, SectionInsight | null> {
  const h = s.headline;
  const out: Record<ShopeeSection, SectionInsight | null> = { summary: null, daily: null, funnel: null, schedule: null, people: null, products: null };
  if (h.gmv > 0) {
    const points: string[] = [];
    if (h.confirmed > 0) points.push(`${METRIC.salesConfirmed} (thực nhận, đã trừ đơn huỷ) ${fmtM(h.confirmed)} — đơn huỷ chiếm ${pct((1 - h.confirmed / h.gmv) * 100)} giá trị.`);
    if (h.liveHours > 0) points.push(`${h.liveSessions} phiên live, ${h.liveHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ → ${METRIC.gmvPerHour} ${fmtM(h.gmvPerHour ?? 0)}.`);
    let headline = `GMV Shopee ${fmtM(h.gmv)} từ ${h.orders.toLocaleString("vi-VN")} ${METRIC.orders}.`;
    if (s.prev && s.prev.gmv > 0) {
      const d = (h.gmv / s.prev.gmv - 1) * 100;
      headline = `GMV Shopee ${fmtM(h.gmv)}, ${d >= 0 ? "tăng" : "giảm"} ${pct(Math.abs(d))} so với tháng trước (${fmtM(s.prev.gmv)}).`;
      if (s.prev.gmvPerHour && h.gmvPerHour) points.push(`GMV/giờ live ${h.gmvPerHour >= s.prev.gmvPerHour ? "tăng" : "giảm"} ${pct(Math.abs((h.gmvPerHour / s.prev.gmvPerHour - 1) * 100))} so với tháng trước.`);
    }
    if (s.ads && s.ads.expense > 0) {
      points.push(`Ads Shopee Live: ${METRIC.expense} ${fmtM(s.ads.expense)}, GMV từ Ads ${fmtM(s.ads.gmv)} (${METRIC.roas} ${s.ads.roas != null ? s.ads.roas.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"}x)${s.ads.costPerOrder != null ? `, ${fmtM(s.ads.costPerOrder)}/${METRIC.orders}` : ""} — GMV từ Ads chiếm ${pct((s.ads.gmv / h.gmv) * 100)} GMV live.`);
    }
    if (s.promo && s.promo.coins > 0) points.push(`${METRIC.coinsClaimed} ${s.promo.coins.toLocaleString("vi-VN")} (≈ ${fmtM(s.promo.coins)}, ${pct((s.promo.coins / h.gmv) * 100, 2)} GMV).`);
    out.summary = { headline, points, action: null };
  }
  if (s.days.length > 0) {
    const top = [...s.days].sort((a, b) => b.salesPlaced - a.salesPlaced).slice(0, 3);
    const topSum = top.reduce((a, d) => a + d.salesPlaced, 0);
    const points = [`Ba ngày cao nhất: ${top.map((d) => `${dm(d.date)} (${fmtM(d.salesPlaced)})`).join(", ")} — chiếm ${pct(h.gmv > 0 ? (topSum / h.gmv) * 100 : 0)} GMV tháng.`];
    if (s.noLiveDays.length) points.push(`${s.noLiveDays.length} ngày không có phiên live: ${s.noLiveDays.slice(0, 6).map(dm).join(", ")}${s.noLiveDays.length > 6 ? "…" : ""}.`);
    out.daily = { headline: `Doanh số dồn vào vài ngày camp: ${dm(top[0].date)} là ngày cao nhất với ${fmtM(top[0].salesPlaced)}.`, points, action: null };
  }
  const o = s.overview;
  if (o && o.views > 0) {
    const best = [...o.sources].filter((x) => x.salesPlaced > 0).sort((a, b) => b.salesPlaced - a.salesPlaced)[0];
    const points: string[] = [];
    if (o.productImpressions > 0) points.push(`Product Impressions ${o.productImpressions.toLocaleString("vi-VN")} → Product Clicks ${o.productClicks.toLocaleString("vi-VN")} (${METRIC.ctr} ${pct(o.ctrPct, 2)}) → ${METRIC.orders} ${o.ordersPlaced.toLocaleString("vi-VN")} (${METRIC.orderRate} ${pct(o.orderRatePlacedPct, 2)}).`);
    if (best) points.push(`Traffic Source mang nhiều Sales nhất: ${best.key} (${METRIC.salesRatio} ${pct(best.salesRatioPct, 0)}).`);
    out.funnel = { headline: `${o.viewers.toLocaleString("vi-VN")} ${METRIC.viewers}, ${o.views.toLocaleString("vi-VN")} ${METRIC.views}; ${METRIC.engagedViewers} ${o.engaged.toLocaleString("vi-VN")} (${pct(o.viewers > 0 ? (o.engaged / o.viewers) * 100 : 0)} ${METRIC.viewers}).`, points, action: null };
  }
  if (s.slots.length > 0 || s.camps.length > 0) {
    // Khung giờ chỉ được nêu khi đủ mẫu (một phiên marathon 16 giờ không đại diện cho cả khung).
    const bestSlot = [...s.slots].filter((x) => x.gmvPerHour != null && x.sessions >= MIN_SAMPLE).sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0))[0];
    const bestCamp = [...s.camps].filter((x) => x.gmvPerHour != null && x.hours >= 3).sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0))[0];
    const points: string[] = [];
    if (bestSlot) points.push(`Khung ${bestSlot.label} hiệu quả nhất: ${fmtM(bestSlot.gmvPerHour ?? 0)}/giờ (${bestSlot.sessions} phiên).`);
    if (bestCamp) points.push(`${bestCamp.label}: ${fmtM(bestCamp.gmvPerHour ?? 0)}/giờ, chiếm ${pct((bestCamp.share ?? 0) * 100)} GMV.`);
    if (s.plan.hours > 0 && h.liveHours > 0) points.push(`Giờ live thực tế ${h.liveHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h so với ${s.plan.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h theo lịch ca trong app.`);
    out.schedule = { headline: bestSlot ? `Khung giờ ${bestSlot.label} cho GMV/giờ cao nhất.` : "Lịch live theo khung giờ và loại ngày (khung nào cũng dưới 3 phiên nên chưa so được).", points, action: null };
  }
  const rankable = s.hosts.filter((x) => x.sessions >= 2);
  if (s.hosts.length > 0 && rankable.length === 0) {
    out.people = { headline: "Chưa đủ ca để xếp hạng host (cần từ 2 ca mỗi host).", points: [], action: null };
  } else if (rankable.length > 0) {
    const [first] = rankable;
    out.people = {
      headline: `${first.name} dẫn đầu GMV/giờ: ${fmtM(first.gmvPerHour ?? 0)} (${first.sessions} ca, ${first.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h).`,
      points: s.quality.manual > 0 ? [`${s.quality.manual}/${s.quality.total} ca còn là số tạm chưa đối soát — xếp hạng chỉ để tham khảo tới khi đối soát bằng Live List.`] : [],
      action: null
    };
  }
  if (s.products.count > 0 && s.products.top.length > 0) {
    const t = s.products.top[0];
    out.products = {
      headline: `Sản phẩm số 1: ${t.name.slice(0, 70)} — ${fmtM(t.salesPlaced)} (${pct(s.products.totalSales > 0 ? (t.salesPlaced / s.products.totalSales) * 100 : 0)} Sales(Placed Order) của live).`,
      points: [
        s.products.top3Share != null ? `Ba sản phẩm đầu chiếm ${pct(s.products.top3Share * 100)} Sales(Placed Order) của live.` : "",
        `${s.products.withSales}/${s.products.count} sản phẩm có Sales trong live.`
      ].filter(Boolean),
      action: null
    };
  }
  return out;
}

// ---------- cách tính và điểm cần xác nhận ----------

export function shopeeNotes(s: ShopeeReportSnapshot): string[] {
  const n: string[] = [];
  const h = s.headline;
  n.push("GMV = Sales(Placed Order) của live; Sales(Confirmed Order) là số thực nhận sau đơn huỷ. Shopee không cho lý do huỷ/hoàn.");
  const miss = [!s.files.overview && "overview (tổng quan tháng)", !s.files.daily && "theo ngày", !s.files.live && "Live List", !s.files.products && "Product List"].filter(Boolean);
  if (miss.length) n.push(`Chưa có file: ${miss.join(", ")} — các phần dùng file đó đang trống hoặc lấy từ file khác.`);
  if (s.files.live && s.files.daily) {
    const sl = s.streams.reduce((a, x) => a + x.gmv, 0);
    const sd = s.days.reduce((a, d) => a + d.salesPlaced, 0);
    if (Math.abs(sl - sd) > Math.max(1000, sd * 0.001)) n.push(`Cộng doanh số từng phiên (${fmtM(sl)}) lệch cộng theo ngày (${fmtM(sd)}) — hai file có thể không cùng kỳ tải.`);
  }
  if (s.plan.sessions > 0) {
    n.push(`Phần Host tính từ ${s.plan.completed} ca Shopee đã diễn ra trong app (${s.quality.reconciled} đã đối soát bằng Live List, ${s.quality.manual} là số tạm). Số của ca là số chia cho từng ca, có thể lệch số phiên của Shopee khi một phiên dài chia cho nhiều ca.`);
    if (s.appGmv > 0 && h.gmv > 0 && Math.abs(s.appGmv / h.gmv - 1) > 0.02) n.push(`Cộng GMV các ca trong app là ${fmtM(s.appGmv)} so với ${fmtM(h.gmv)} theo file — ${s.appGmv < h.gmv ? "đối soát Live List để số ca khớp file" : "kiểm lại ca nạp bù"}.`);
  } else {
    n.push("Chưa có ca Shopee nào trong app cho tháng này nên không có xếp hạng host.");
  }
  if (s.unassigned && s.unassigned.sessions > 0) n.push(`${s.unassigned.sessions} ca chưa gán host (${fmtM(s.unassigned.gmv)} GMV) không nằm trong xếp hạng.`);
  n.push("Loại ngày camp theo lịch cố định (D-Day = ngày trùng tháng và 2 ngày trước, Mid-Month 13–15, Pay Day 23–25); chưa đọc khung camp ghi đè của Kế Hoạch Tháng.");
  if (s.ads === null) n.push("Chưa có file Ads Shopee của tháng (tải ở Nhập Ads, chọn sàn Shopee) — report chưa có chi phí Ads.");
  if (s.ads) n.push(`Ads lấy từ file "Shopee Live Ads Report"${s.ads.shopName ? ` của shop ${s.ads.shopName}` : ""}: ${s.ads.campaigns} chiến dịch, tổng cả tháng — Shopee không cho số theo ngày nên không tách ROAS theo loại ngày. GMV trong file Ads là một phần của GMV live, không cộng thêm.`);
  if (s.promo) n.push("Coins Claimed và voucher (Shop Voucher Claimed, Special Live Voucher Claimed) lấy từ file overview: Shopee chỉ cho số lượng đã nhận; mỗi xu quy ra 1 đồng, chưa biết xu do shop hay Shopee tài trợ.");
  n.push("Tên chỉ số trong report này lấy đúng tên cột file Shopee (Viewers, Views, ATC, ABS, GPM…). Shopee không có GMV trực tiếp/gián tiếp, LIVE impressions, CTOR hay bảng chấm KPI theo nhóm (video, KOL). Viewers là người xem riêng biệt, không cùng cách đếm với Views của TikTok; GPM của Shopee tính trên Views, không phải Viewers.");
  return n;
}

// ---------- độ mới ----------

export interface ShopeeFreshness {
  upToDate: boolean;
  sessionsChanged: boolean;
  filesChanged: boolean;
  /** Bản chụp dựng bằng công thức cũ (vd bản 1 chưa có Ads/xu) — cập nhật để lấy phần mới. */
  formulaChanged: boolean;
}

export function shopeeSnapshotFreshness(snapshot: ShopeeReportSnapshot, live: { sessions: LiveSession[]; stamps: string[] }): ShopeeFreshness {
  const sessionsChanged = snapshot.sessionsSig !== shopeeSessionsSig(live.sessions, snapshot.brandId, snapshot.month);
  const filesChanged = [...snapshot.stamps].sort().join(",") !== [...live.stamps].sort().join(",");
  const formulaChanged = snapshot.version !== SHOPEE_SNAPSHOT_VERSION;
  return { upToDate: !sessionsChanged && !filesChanged && !formulaChanged, sessionsChanged, filesChanged, formulaChanged };
}

/** Dấu các file Shopee phủ tháng này — "id@giờ up". Đổi khi up thêm / ghi đè / xoá file. */
export function shopeeStampsFor(imports: DataRawImportStamp[], month: string): string[] {
  const start = `${month}-01`;
  const end = `${month}-31`;
  return imports
    .filter((i) => ([...SHOPEE_FILE_TYPES, "shopee_ads"] as string[]).includes(i.reportType) && !!i.periodStart && !!i.periodEnd && i.periodStart <= end && i.periodEnd >= start)
    .map((i) => `${i.id}@${i.importedAt}`)
    .sort();
}
