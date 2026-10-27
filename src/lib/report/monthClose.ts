import type { BrandMonthlyReport, BrandMonthPlan, DataRawReportType, LiveSession } from "../../types";
import type { DataRawImportStamp } from "../db/brandDataRaw";
import type { AffiliateTodoRow } from "../db/affiliateActuals";
import { parseDayLabel } from "../affiliate/plan";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { dataSourceTier } from "../dataSource";
import { isUnconfirmedPast } from "../sessionStatus";

// "Chốt tháng" (audit Report Tháng 27/10, phương án B): mỗi kênh brand × sàn một dòng, mỗi đầu vào của report một ô — ca có số,
// đối soát, các file Dữ Liệu Gốc phủ đủ ngày chưa, phiên affiliate, kế hoạch tháng sau, trạng thái report. Đo 27/10: 1/22 report
// phát hành; CROCS T9 file shop dừng 22/09 trong khi deck làm tay đã có đủ tháng từ 01/10 — thiếu một chỗ nói "kênh nào thiếu
// file nào, hạn khi nào". Hàm thuần; màn ở BrandsOverview (Toàn Cảnh Brand), chặn phát hành ở useReportPublish + BrandMonthlyReport.

export type CloseState = "ok" | "partial" | "missing" | "optional" | "na";

export type CloseKey =
  | "sessions"
  | "reconcile"
  | "shop"
  | "products"
  | "promo"
  | "ads"
  | "affiliate"
  | "shopeeLive"
  | "shopeeDaily"
  | "shopeeOverview"
  | "shopeeProducts"
  | "nextPlan"
  | "report";

export interface CloseColumn {
  key: CloseKey;
  label: string;
  /** Tab mở khi bấm ô chưa đủ. */
  tab: string;
  /** Loại file Dữ Liệu Gốc của cột (cột file). */
  fileType?: DataRawReportType;
  /** Cột không bắt buộc (brand có thể không chạy Ads): thiếu ⇒ "optional", không đỏ. */
  optional?: boolean;
}

/** Cột theo sàn — cùng thứ tự với trang report đọc chúng. */
export const CLOSE_COLUMNS: Record<ReportPlatform, CloseColumn[]> = {
  TikTok: [
    { key: "sessions", label: "Ca có số liệu", tab: "brand_sessions" },
    { key: "reconcile", label: "Đối soát", tab: "brand_dataraw" },
    { key: "shop", label: "Shop Analytics", tab: "brand_dataraw", fileType: "shop_analytics" },
    { key: "products", label: "Sản phẩm", tab: "brand_dataraw", fileType: "product_list" },
    { key: "promo", label: "Khuyến mãi", tab: "brand_dataraw", fileType: "shop_promotion" },
    { key: "ads", label: "Ads", tab: "brand_ads_report", fileType: "ads_campaign_overview", optional: true },
    { key: "affiliate", label: "Affiliate", tab: "brand_affiliate", fileType: "affiliate_live_analysis" },
    { key: "nextPlan", label: "Kế hoạch tháng sau", tab: "month_plan" },
    { key: "report", label: "Report", tab: "brand_monthly_report" }
  ],
  Shopee: [
    { key: "sessions", label: "Ca có số liệu", tab: "brand_sessions" },
    { key: "reconcile", label: "Đối soát", tab: "brand_dataraw" },
    { key: "shopeeLive", label: "Live List", tab: "brand_dataraw", fileType: "shopee_live_list" },
    { key: "shopeeDaily", label: "Theo ngày", tab: "brand_dataraw", fileType: "shopee_daily" },
    { key: "shopeeOverview", label: "Overview", tab: "brand_dataraw", fileType: "shopee_overview" },
    { key: "shopeeProducts", label: "Product List", tab: "brand_dataraw", fileType: "shopee_product_list" },
    { key: "ads", label: "Ads", tab: "brand_ads_report", fileType: "shopee_ads", optional: true },
    { key: "nextPlan", label: "Kế hoạch tháng sau", tab: "month_plan" },
    { key: "report", label: "Report", tab: "brand_monthly_report" }
  ]
};

/** File quyết định số toàn shop (trang 1–3): phủ thiếu ngày ⇒ chặn phát hành. Shopee: file theo ngày. */
export const SHOP_FILE: Record<ReportPlatform, { type: DataRawReportType; label: string }> = {
  TikTok: { type: "shop_analytics", label: "Shop Analytics" },
  Shopee: { type: "shopee_daily", label: "Shopee theo ngày" }
};

export interface CloseCell {
  key: CloseKey;
  state: CloseState;
  /** Chữ ngắn trong ô. */
  text: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};
const addMonths = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Hạn chốt: ngày 3 tháng sau (TikTok/Shopee cho tải file đủ tháng từ ngày 1; deck tay CROCS T9 xong 01/10, Franklin 04/10). */
export function closeDeadline(month: string): string {
  return `${addMonths(month, 1)}-03`;
}

/** Tháng nên chốt khi đứng ở `month` đang xem: tháng đã hết ⇒ chính nó; tháng đang chạy ⇒ tới hết ngày 10 vẫn là tháng trước
 *  (đang trong kỳ chốt), sau đó là tháng này (chuẩn bị). */
export function closeMonthFor(viewMonth: string, today: string): string {
  const cur = today.slice(0, 7);
  if (viewMonth < cur) return viewMonth;
  return Number(today.slice(8, 10)) <= 10 ? addMonths(cur, -1) : cur;
}

/** Số ngày cần có số: cả tháng nếu đã hết, tới hôm qua nếu đang chạy. */
export function daysDue(month: string, today: string): number {
  const cur = today.slice(0, 7);
  if (month < cur) return lastDayOf(month);
  if (month > cur) return 0;
  return Math.max(0, Number(today.slice(8, 10)) - 1);
}

/** Ngày đầu cần có số: ngày có ca đầu tiên của kênh trong tháng (kênh mở giữa tháng — Franklin Shopee bắt đầu 08/10 — không bị
 *  tính thiếu những ngày trước khi chạy); không có ca thì ngày 1. */
export function firstDueDay(month: string, sessionDates: string[]): number {
  const inMonth = sessionDates.filter((d) => d.startsWith(month)).sort();
  return inMonth.length ? Number(inMonth[0].slice(8, 10)) : 1;
}

/** Độ phủ của một loại file trong tháng: hợp các khoảng [periodStart, periodEnd] của mọi lần tải, cắt trong tháng (từ ngày `fromDay`). */
export function fileCoverage(stamps: DataRawImportStamp[], type: DataRawReportType, month: string, fromDay = 1): { days: number; lastDay: string | null; any: boolean } {
  const last = lastDayOf(month);
  const covered = new Set<number>();
  let any = false;
  for (const s of stamps) {
    if (s.reportType !== type || !s.periodStart || !s.periodEnd) continue;
    const from = s.periodStart.slice(0, 10);
    const to = s.periodEnd.slice(0, 10);
    if (to < `${month}-01` || from > `${month}-${pad(last)}`) continue;
    any = true;
    for (let d = fromDay; d <= last; d++) {
      const iso = `${month}-${pad(d)}`;
      if (iso >= from && iso <= to) covered.add(d);
    }
  }
  const lastCovered = covered.size ? Math.max(...covered) : 0;
  return { days: covered.size, lastDay: lastCovered ? `${month}-${pad(lastCovered)}` : null, any };
}

function fileCell(key: CloseKey, cov: { days: number; lastDay: string | null }, due: number, optional: boolean, monthEnded: boolean, monthEnd: string): CloseCell {
  if (due === 0) return { key, state: "na", text: "—" };
  // Tháng đang chạy: file đủ tháng chỉ tải được sau ngày cuối tháng — chưa có file thì nhắc mốc, không tô đỏ.
  if (cov.days === 0 && !monthEnded) return { key, state: "optional", text: `tải sau ${dm(monthEnd)}` };
  if (cov.days === 0) return { key, state: optional ? "optional" : "missing", text: optional ? "chưa có · nếu có chạy" : "chưa có" };
  if (cov.days >= due) return { key, state: "ok", text: `đủ ${due} ngày` };
  return { key, state: "partial", text: `${cov.days}/${due} ngày · tới ${cov.lastDay ? dm(cov.lastDay) : "—"}` };
}

export interface CloseRowInput {
  brandId: string;
  platform: ReportPlatform;
  month: string;
  today: string;
  /** Mọi ca của app — hàm tự lọc brand/sàn/tháng. */
  sessions: LiveSession[];
  stamps: DataRawImportStamp[];
  /** Dòng affiliate của tháng (mọi brand) — null = chưa tải được. */
  affiliate: AffiliateTodoRow[] | null;
  nextPlan: BrandMonthPlan | null | undefined;
  report: BrandMonthlyReport | null | undefined;
}

export function closeRow(i: CloseRowInput): CloseCell[] {
  const mine = i.sessions.filter((s) => s.brandId === i.brandId && platformOf(s) === i.platform && s.date.startsWith(i.month) && s.status !== "Cancelled");
  const from = firstDueDay(i.month, mine.map((s) => s.date));
  const due = Math.max(0, daysDue(i.month, i.today) - (from - 1));
  const done = mine.filter((s) => s.status === "Completed");
  return CLOSE_COLUMNS[i.platform].map((col): CloseCell => {
    switch (col.key) {
      case "sessions": {
        if (done.length === 0) return { key: col.key, state: "na", text: mine.length ? "chưa có ca đã live" : "không có ca" };
        const noData = done.filter(isUnconfirmedPast).length;
        const noHost = done.filter((s) => !s.hostId && !s.hostName).length;
        const parts = [noData ? `${noData} ca chưa có số liệu` : null, noHost ? `${noHost} ca chưa gán host` : null].filter(Boolean);
        return parts.length ? { key: col.key, state: "partial", text: parts.join(" · ") } : { key: col.key, state: "ok", text: `${done.length} ca đủ số` };
      }
      case "reconcile": {
        if (done.length === 0) return { key: col.key, state: "na", text: "—" };
        const left = done.filter((s) => dataSourceTier(s) !== "reconciled").length;
        return left ? { key: col.key, state: "partial", text: `${done.length - left}/${done.length} ca` } : { key: col.key, state: "ok", text: `${done.length}/${done.length} ca` };
      }
      case "affiliate": {
        const rows = (i.affiliate ?? []).filter((r) => r.brandId === i.brandId && r.periodMonth.startsWith(i.month) && r.status !== "cancelled");
        if (rows.length === 0) return { key: col.key, state: "na", text: "không chạy" };
        // Phiên kế hoạch đã qua ngày mà chưa có số + file Live Analysis (nguồn số affiliate) phủ tới đâu.
        const late = rows.filter((r) => r.status === "planned" && (parseDayLabel(r.liveDateLabel) ?? "9999") < i.today).length;
        const cov = fileCoverage(i.stamps, "affiliate_live_analysis", i.month, from);
        if (late > 0) return { key: col.key, state: "partial", text: `${late} phiên chưa có số liệu` };
        if (due > 0 && cov.days < due) return { key: col.key, state: "partial", text: `Live Analysis Affiliate ${cov.days}/${due} ngày` };
        return { key: col.key, state: "ok", text: `${rows.length} phiên` };
      }
      case "nextPlan": {
        const st = i.nextPlan?.status;
        return st === "locked" ? { key: col.key, state: "ok", text: "đã chốt" } : st === "draft" ? { key: col.key, state: "partial", text: "đang soạn" } : { key: col.key, state: "missing", text: "chưa lập" };
      }
      case "report": {
        const st = i.report?.status;
        if (st === "published") return { key: col.key, state: "ok", text: "đã phát hành" };
        if (i.month >= i.today.slice(0, 7)) return { key: col.key, state: "na", text: "tháng chưa hết" };
        return st === "draft" ? { key: col.key, state: "partial", text: "nháp" } : { key: col.key, state: "missing", text: "chưa tạo" };
      }
      default:
        return fileCell(col.key, fileCoverage(i.stamps, col.fileType!, i.month, from), due, !!col.optional, i.month < i.today.slice(0, 7), `${i.month}-${pad(lastDayOf(i.month))}`);
    }
  });
}

/** Ô còn thiếu (đỏ/vàng) — để đếm "N việc" và sắp kênh thiếu nhiều lên đầu. Ô tuỳ chọn và không áp dụng không tính. */
export const openCount = (cells: CloseCell[]) => cells.filter((c) => c.state === "missing" || c.state === "partial").length;

/**
 * Lý do chặn phát hành, null = được phát hành. File số toàn shop đã tải mà phủ THIẾU ngày ⇒ chặn: trang Tổng quan/Toàn shop/Nguyên
 * nhân sẽ đặt số shop một kỳ cạnh số livestream kỳ khác (CROCS T9: shop 1–22/09, phiên 1–30/09). Chưa tải file nào ⇒ được phát
 * hành bản chỉ livestream (trang toàn shop tự ẩn với brand).
 */
export function publishBlocker(platform: ReportPlatform, month: string, stamps: DataRawImportStamp[], today: string, sessionDates: string[] = []): string | null {
  const from = firstDueDay(month, sessionDates);
  const due = Math.max(0, daysDue(month, today) - (from - 1));
  const f = SHOP_FILE[platform];
  const cov = fileCoverage(stamps, f.type, month, from);
  if (!cov.any || due === 0 || cov.days >= due) return null;
  return (
    `File ${f.label} của tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)} mới phủ ${cov.days}/${due} ngày (tới ${cov.lastDay ? dm(cov.lastDay) : "—"}). ` +
    `Phát hành lúc này thì số toàn shop và số livestream trong report khác kỳ nhau. Tải file đủ tháng ở Dữ Liệu Gốc rồi phát hành; ` +
    `nếu brand không cần số toàn shop, xoá file đó ở Dữ Liệu Gốc để phát hành bản chỉ livestream.`
  );
}
