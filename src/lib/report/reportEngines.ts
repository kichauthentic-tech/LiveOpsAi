import type { BrandPlatformRate, LiveSession } from "../../types";
import type { DataRawImportStamp } from "../db/brandDataRaw";
import { fmtVndShort } from "../format";
import type { ReportPlatform } from "../reportPlatform";
import { buildMonthlyReportSnapshot, COVERAGE_TYPES, snapshotFreshness, snapshotHeadline, type MonthlyReportSnapshot } from "./monthlySnapshot";
import { shopeeSnapshotFreshness, shopeeStampsFor, type ShopeeReportSnapshot } from "./shopeeSnapshot";
import { buildShopeeReportSnapshot } from "./shopeeSnapshotBuild";

// Report Tháng theo sàn (0139; Bước 2 lộ trình đa sàn 07/10): TikTok và Shopee là HAI report độc lập — nguồn file, cách dựng
// bản chụp, cách kiểm độ mới đều khác. Màn Report Tháng và Điều Phối Phát Hành gọi engine của sàn thay vì `if Shopee`.
// Record đủ mọi sàn ⇒ thêm sàn mà quên engine là lỗi compile.

/** Bản chụp lưu trong brand_monthly_report_snapshots (jsonb) — mỗi sàn một hình dạng riêng. */
export type AnySnapshot = MonthlyReportSnapshot | ShopeeReportSnapshot;

export interface ReportBuildInput {
  brandId: string;
  month: string;
  sessions: LiveSession[];
  planMonthTotals?: Map<string, number>;
  brandPlatformRates: BrandPlatformRate[];
  previous?: AnySnapshot | null;
}

export interface ReportFreshnessView {
  upToDate: boolean;
  /** Đổi gì kể từ lần chốt (để hiện / để hỏi trước khi phát hành). */
  changes: string[];
}

export interface ReportEngine {
  build: (input: ReportBuildInput) => Promise<{ snapshot: AnySnapshot; fetched: string[]; reused: string[] }>;
  freshness: (snapshot: AnySnapshot, live: { sessions: LiveSession[]; planMonthTotals?: Map<string, number>; brandPlatformRates: BrandPlatformRate[]; stamps: DataRawImportStamp[]; month: string }) => ReportFreshnessView;
  /** Dòng "số liệu tới đâu" của bản chụp. */
  coverage: (snapshot: AnySnapshot) => string;
  /** So bản chụp cũ / mới trước khi cập nhật report đã phát hành. */
  headlineChange: (before: AnySnapshot, after: AnySnapshot) => string;
  /** Nguồn số của report (mô tả đầu trang). `{ads}` = chỗ chèn link tab Nhập Ads. */
  description: string;
  /** Câu dưới nút "Tạo report". */
  createHint: string;
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const line = (label: string, a: string, b: string) => `${label}: ${a === b ? a + " (không đổi)" : `${a} → ${b}`}`;

const TIKTOK_ENGINE: ReportEngine = {
  build: (x) => buildMonthlyReportSnapshot({ ...x, previous: (x.previous as MonthlyReportSnapshot | null) ?? null }),
  freshness: (snap, live) => {
    const f = snapshotFreshness(snap as MonthlyReportSnapshot, { sessions: live.sessions, planMonthTotals: live.planMonthTotals, brandPlatformRates: live.brandPlatformRates, imports: live.stamps });
    return {
      upToDate: f.upToDate,
      changes: [
        f.changedSessions > 0 && `${f.changedSessions} ca${f.changedSessionsThisMonth !== f.changedSessions ? ` (${f.changedSessionsThisMonth} trong tháng này)` : ""}`,
        f.changedFiles.length > 0 && `file ${f.changedFiles.join(", ")}`,
        f.configChanged && "target/rate/công thức"
      ].filter((x): x is string => !!x)
    };
  },
  coverage: (snap) => {
    const s = snap as MonthlyReportSnapshot;
    // Chỉ loại file report còn đọc — bản chụp cũ còn ghi Live Performance (21/09) làm mốc sai.
    const ends = COVERAGE_TYPES.map((t) => s.coverage.datarawThrough[t]).filter((d): d is string => !!d).sort();
    return `${s.coverage.sessionsThrough ? `ca có số tới ${dm(s.coverage.sessionsThrough)}` : "chưa có ca nào có số"} · ${ends.length ? `Dữ Liệu Gốc tới ${dm(ends[0])}` : "chưa có file Dữ Liệu Gốc"}`;
  },
  headlineChange: (b0, a0) => {
    const before = snapshotHeadline(b0 as MonthlyReportSnapshot), after = snapshotHeadline(a0 as MonthlyReportSnapshot);
    const hours = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
    return [
      line("Total GMV", fmtVndShort(before.shopGmv), fmtVndShort(after.shopGmv)),
      line("LIVE GMV (agency)", fmtVndShort(before.totalGmv), fmtVndShort(after.totalGmv)),
      line("Ca có số", String(before.sessionsWithNumbers), String(after.sessionsWithNumbers)),
      line("Giờ live", hours(before.liveHours), hours(after.liveHours)),
      line("Video GMV", fmtVndShort(before.videoGmv), fmtVndShort(after.videoGmv)),
      line("Product card GMV", fmtVndShort(before.cardGmv), fmtVndShort(after.cardGmv)),
      line("Top SKU #1", before.topSku ?? "—", after.topSku ?? "—")
    ].join("\n");
  },
  description:
    'Số liệu vận hành tính từ các ca có số trong tháng (Dữ Liệu Gốc chỉ dự phòng) và được CHỐT tại một thời điểm — mở report không tính lại; ops bấm "Cập nhật số liệu" khi muốn lấy số mới. File Ads (TikTok Ads) tải ở tab {ads}; nhận xét cho brand viết bằng nút "Sửa Insight" ở từng phần.',
  createHint: "Bấm để tổng hợp số liệu từ ca có số và Dữ Liệu Gốc rồi chốt lại."
};

const SHOPEE_ENGINE: ReportEngine = {
  build: async (x) => ({ snapshot: await buildShopeeReportSnapshot({ brandId: x.brandId, month: x.month, sessions: x.sessions }), fetched: [], reused: [] }),
  freshness: (snap, live) => {
    const f = shopeeSnapshotFreshness(snap as ShopeeReportSnapshot, { sessions: live.sessions, stamps: shopeeStampsFor(live.stamps, live.month) });
    return {
      upToDate: f.upToDate,
      changes: [f.sessionsChanged && "ca Shopee đổi số/lịch/người", f.filesChanged && "file Shopee mới", f.formulaChanged && "cách tính và tên chỉ số mới (đúng tên cột Shopee)"].filter((x): x is string => !!x)
    };
  },
  coverage: (snap) => {
    const sh = snap as ShopeeReportSnapshot;
    const files = [sh.files.overview && "overview", sh.files.daily && "theo ngày", sh.files.live && "Live List", sh.files.products && "Product List", sh.ads && "Ads"].filter(Boolean).join(", ");
    return `doanh số tới ${sh.headline.lastDay ? dm(sh.headline.lastDay) : "—"} · file: ${files || "chưa có"}`;
  },
  headlineChange: (b, a) => `GMV Shopee: ${fmtVndShort((b as ShopeeReportSnapshot).headline.gmv)} → ${fmtVndShort((a as ShopeeReportSnapshot).headline.gmv)}`,
  description:
    "Report Shopee tính từ 4 file Shopee Live (Live List, theo ngày, overview, Product List) và ca Shopee trong app, CHỐT tại một thời điểm — mở report không tính lại. GMV = Sales(Placed Order), tên chỉ số theo đúng cột file Shopee. Report TikTok và Shopee phát hành, thu hồi, đóng sổ riêng.",
  createHint: "Bấm để tổng hợp số liệu từ 4 file Shopee và ca Shopee trong app rồi chốt lại."
};

export const REPORT_ENGINES: Record<ReportPlatform, ReportEngine> = { TikTok: TIKTOK_ENGINE, Shopee: SHOPEE_ENGINE };
