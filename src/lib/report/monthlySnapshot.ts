import { BrandPlatformRate, DataRawReportType, LiveSession } from "../../types";
import { CreatorLivePerfMonthSlice, fetchCreatorLivePerfMonthSlice } from "../dataraw/creatorLivePerfSlice";
import { fetchLivePerformanceCoreMonthSlice, LivePerformanceMonthSlice } from "../dataraw/monthlyDailySlice";
import {
  CardGmvMonthSlice,
  fetchCardGmvMonthSlice,
  fetchShopDaysMonthSlice,
  ShopDaysMonthSlice,
  fetchProductListAgg,
  fetchTopPromotionsMonthSlice,
  PromotionMonthSlice,
  topSkuFromAgg,
  TopSkuMonthSlice
} from "../dataraw/monthlyProductSlice";
import { DataRawImportStamp, fetchDataRawImportStamps } from "../db/brandDataRaw";
import { fetchSnapshotPieces } from "../db/monthlyReportSnapshots";
import { hasLiveNumbers, sessionsInRange } from "./sessionsLivePerf";

// Bản chụp số liệu Report Tháng (2026-09-25, migration 0119).
//
// Report Tháng từng tính lại TẤT CẢ mỗi lần mở (~17 MB/lần với CROCS T9, xem 0119). Giờ ops bấm nút →
// dựng bản chụp ở đây → lưu DB; mọi lần mở chỉ đọc bản chụp. Bản chụp giữ NGUYÊN LIỆU mà
// MonthlyReportTabs vốn ăn (ca của 4 tháng, target kế hoạch, rate card, các slice Dữ Liệu Gốc), KHÔNG
// giữ con số đã tính: 6 tab giữ nguyên công thức, chỉ đổi chỗ lấy đầu vào — không có bản công thức thứ
// hai để lệch nhau.
//
// Mỗi slice Dữ Liệu Gốc là một "piece" kèm `stamp` = danh sách batch (id@imported_at) nó được tính
// từ + phiên bản công thức. Bấm cập nhật mà stamp không đổi thì dùng lại piece cũ, không tải gì — và
// piece của tháng trước lấy thẳng từ bản chụp tháng trước (cùng khoá) thay vì tải lại file tháng trước.
//
// Đổi công thức của bất kỳ fetch*Slice nào dùng ở đây ⇒ TĂNG PIECE_VERSION, nếu không piece cũ tính
// theo công thức cũ vẫn được coi là "còn mới".
// v2 (2026-09-25): thêm piece shopDays + cardGmv cho 4 tháng (Report Tháng 8 phần — "Toàn shop & kênh",
// so cùng số ngày). Bản chụp v1 vẫn đọc được; phần thiếu hiện "bấm Cập nhật số liệu".
export const SNAPSHOT_VERSION = 2;
const PIECE_VERSION = 1;

export interface SnapshotPiece<T = unknown> {
  stamp: string;
  data: T;
}
export type SnapshotPieces = Record<string, SnapshotPiece>;

/** Chỉ các trường của ca mà Report Tháng đọc (sessionsLivePerf / hostPerformance / MonthlyReportTabs).
 *  Đo thật: giữ nguyên LiveSession thì 229 ca CROCS nặng ~260 KB (kèm cả sidecar `report`, id phụ,
 *  tên phòng…) — bản chụp tải MỖI lần mở nên cắt về đúng phần dùng. Thêm trường mới vào report mà
 *  quên thêm ở đây thì ca hydrate ra giá trị mặc định (0/"") — nhớ thêm cả vào SESSION_SIG_FIELDS
 *  nếu trường đó ảnh hưởng số. `brandId` không lưu (bằng snapshot.brandId). */
const SNAPSHOT_SESSION_FIELDS = [
  "id", "brandName", "date", "startTime", "endTime", "status", "platform", "hostId", "hostName", "title",
  "targetGmv", "actualGmv", "totalOrders", "totalViews", "avgWatchTimeSeconds", "dataSource", "monthPublished",
  "liveDurationMinutes", "actualStartAt", "actualEndAt", "attributedItemsSold", "attributedSkuOrders",
  "impressions", "productImpressions", "productClicks", "newFollowers", "commentsCount", "sharesCount", "likesCount",
  "liveRoomIds"
] as const satisfies readonly (keyof LiveSession)[];
export type SnapshotSession = Partial<Pick<LiveSession, (typeof SNAPSHOT_SESSION_FIELDS)[number]>> & Pick<LiveSession, "id" | "date" | "status">;

export interface MonthlyReportSnapshot {
  version: number;
  brandId: string;
  month: string; // YYYY-MM
  computedAt: string;
  /** Ca của brand trong cửa sổ 4 tháng (tháng report + 3 tháng trước — biểu đồ xu hướng dùng 4
   *  tháng), trừ ca huỷ. targetGmv là giá trị ĐÃ phân bổ (applyAllocatedTargets) lúc chốt. */
  sessions: SnapshotSession[];
  /** "brandId|YYYY-MM" → tổng target Kế Hoạch Tháng đã chốt, chỉ các tháng trong cửa sổ. */
  planMonthTotals: Record<string, number>;
  rates: BrandPlatformRate[];
  pieces: SnapshotPieces;
  coverage: SnapshotCoverage;
}

export interface SnapshotCoverage {
  /** Ngày muộn nhất trong tháng report có ca đã có số. */
  sessionsThrough: string | null;
  /** Theo loại file: kỳ muộn nhất phủ tới trong tháng report (null = tháng đó chưa có file loại này). */
  datarawThrough: Partial<Record<DataRawReportType, string | null>>;
}

// ---------- tháng ----------

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
/** 4 tháng cũ → mới, kết thúc ở `month` — đúng cửa sổ `last4Months` của MonthlyReportTabs. */
export function reportWindow(month: string): string[] {
  return [shiftMonth(month, -3), shiftMonth(month, -2), shiftMonth(month, -1), month];
}

// ---------- piece ----------

type PieceKind = "creatorLive" | "dailyPerf" | "topSku" | "topPromo" | "shopDays" | "cardGmv";

const PIECE_SOURCES: Record<PieceKind, DataRawReportType[]> = {
  creatorLive: ["creator_live_performance"],
  dailyPerf: ["live_performance_core_stats"],
  topSku: ["product_list"],
  topPromo: ["shop_promotion"],
  shopDays: ["shop_analytics"],
  cardGmv: ["product_list"]
};

// Nhãn cho thông báo "file nào mới up" — cùng tên ops thấy ở Dữ Liệu Gốc.
export const REPORT_TYPE_LABEL: Partial<Record<DataRawReportType, string>> = {
  creator_live_performance: "Creator Live Performance",
  live_performance_core_stats: "Live Performance",
  shop_analytics: "Shop Analytics",
  product_list: "Sản Phẩm",
  shop_promotion: "Khuyến Mãi"
};

function pieceKey(kind: PieceKind, month: string): string {
  return `${kind}|${month}`;
}

function overlapping(imports: DataRawImportStamp[], types: DataRawReportType[], start: string, end: string): DataRawImportStamp[] {
  return imports.filter((i) => types.includes(i.reportType) && !!i.periodStart && !!i.periodEnd && i.periodStart <= end && i.periodEnd >= start);
}

// "v1|product_list=<id>@<imported_at>,…;shop_analytics=…" — tách theo loại file để báo được ĐÚNG
// loại nào đổi (channelGmv dựa trên 2 loại).
function typeStamp(t: DataRawReportType, month: string, imports: DataRawImportStamp[]): string {
  const { start, end } = monthBounds(month);
  return overlapping(imports, [t], start, end)
    .map((i) => `${i.id}@${i.importedAt}`)
    .sort()
    .join(",");
}
function stampOf(kind: PieceKind, month: string, imports: DataRawImportStamp[]): string {
  return `v${PIECE_VERSION}|` + PIECE_SOURCES[kind].map((t) => `${t}=${typeStamp(t, month, imports)}`).join(";");
}
function stampTypes(stamp: string): Map<string, string> {
  const [, body = ""] = stamp.split("|");
  return new Map(body.split(";").filter(Boolean).map((part) => {
    const eq = part.indexOf("=");
    return [part.slice(0, eq), part.slice(eq + 1)] as [string, string];
  }));
}

/** Các piece một bản chụp của `month` cần. creatorLive chỉ cần cho tháng CHƯA có ca nào có số — tháng
 *  đã có ca thì Report đọc ca (pickLivePerfSource), file chỉ là dự phòng, tải về là phí. */
function requiredPieces(month: string, sessions: LiveSession[] | SnapshotSession[], brandId: string): { kind: PieceKind; month: string }[] {
  // v2: GMV video/thẻ SP đọc từ shopDays + cardGmv (4 tháng) — piece channelGmv cũ bỏ hẳn.
  const out: { kind: PieceKind; month: string }[] = [
    { kind: "dailyPerf", month },
    { kind: "topSku", month },
    { kind: "topPromo", month }
  ];
  for (const m of reportWindow(month)) {
    out.push({ kind: "shopDays", month: m }, { kind: "cardGmv", month: m });
    const { start, end } = monthBounds(m);
    if (sessionsInRange(sessions as LiveSession[], brandId, start, end).length === 0) out.push({ kind: "creatorLive", month: m });
  }
  return out;
}

// ---------- dựng bản chụp ----------

export interface BuildSnapshotInput {
  brandId: string;
  month: string;
  sessions: LiveSession[];
  planMonthTotals?: Map<string, number>;
  brandPlatformRates: BrandPlatformRate[];
  /** Bản chụp cũ của chính tháng này (nếu có) — nguồn tái dùng piece. */
  previous?: MonthlyReportSnapshot | null;
}

export interface BuildSnapshotResult {
  snapshot: MonthlyReportSnapshot;
  fetched: string[];
  reused: string[];
}

function trimSession(s: LiveSession): SnapshotSession {
  const out: Record<string, unknown> = {};
  for (const f of SNAPSHOT_SESSION_FIELDS) {
    const v = s[f];
    // Bỏ trống/0-mặc-định để JSON gọn — hydrate trả lại đúng mặc định đó.
    if (v === undefined || v === null || v === "") continue;
    out[f] = v;
  }
  return out as SnapshotSession;
}

const HYDRATE_DEFAULTS: Omit<LiveSession, "id" | "date" | "status" | "brandId"> = {
  title: "", brandName: "", shopTikTokHandle: "", studioId: "", studioName: "", hostId: "", hostName: "",
  assistantName: "", coHostName: "", platform: "TikTok", startTime: "00:00", endTime: "00:00",
  targetGmv: 0, monthPublished: true, actualGmv: 0, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0,
  totalViews: 0, ctrAvg: 0, cvrAvg: 0, skus: [], checklist: [], minuteMetrics: []
};

export function hydrateSnapshotSessions(snapshot: MonthlyReportSnapshot): LiveSession[] {
  return snapshot.sessions.map((s) => ({ ...HYDRATE_DEFAULTS, ...s, brandId: snapshot.brandId }));
}

function windowSessions(sessions: LiveSession[], brandId: string, month: string): LiveSession[] {
  const win = reportWindow(month);
  const start = monthBounds(win[0]).start;
  const end = monthBounds(month).end;
  return sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status !== "Cancelled");
}

function windowPlanTotals(planMonthTotals: Map<string, number> | undefined, brandId: string, month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of reportWindow(month)) {
    const v = planMonthTotals?.get(`${brandId}|${m}`);
    if (v !== undefined) out[`${brandId}|${m}`] = v;
  }
  return out;
}

function coverageOf(sessions: LiveSession[], imports: DataRawImportStamp[], brandId: string, month: string): SnapshotCoverage {
  const { start, end } = monthBounds(month);
  const withNumbers = sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && hasLiveNumbers(s));
  const sessionsThrough = withNumbers.reduce<string | null>((max, s) => (max === null || s.date > max ? s.date : max), null);
  const datarawThrough: SnapshotCoverage["datarawThrough"] = {};
  for (const t of ["product_list", "shop_analytics", "shop_promotion", "live_performance_core_stats"] as DataRawReportType[]) {
    const ends = overlapping(imports, [t], start, end).map((i) => (i.periodEnd! > end ? end : i.periodEnd!));
    datarawThrough[t] = ends.length ? ends.sort().at(-1)! : null;
  }
  return { sessionsThrough, datarawThrough };
}

async function fetchPiece(kind: PieceKind, brandId: string, month: string): Promise<unknown> {
  const { start, end } = monthBounds(month);
  switch (kind) {
    case "creatorLive":
      return fetchCreatorLivePerfMonthSlice(brandId, start, end);
    case "dailyPerf":
      return fetchLivePerformanceCoreMonthSlice(brandId, start, end);
    case "topSku":
      return topSkuFromAgg(await fetchProductListAgg(brandId, start, end));
    case "topPromo":
      return fetchTopPromotionsMonthSlice(brandId, start, end);
    case "shopDays":
      return fetchShopDaysMonthSlice(brandId, start, end);
    case "cardGmv":
      return fetchCardGmvMonthSlice(brandId, start, end);
  }
}

export async function buildMonthlyReportSnapshot(input: BuildSnapshotInput): Promise<BuildSnapshotResult> {
  const { brandId, month } = input;
  const sessions = windowSessions(input.sessions, brandId, month);
  const needed = requiredPieces(month, sessions, brandId);

  const [imports, prevMonthPieces] = await Promise.all([
    fetchDataRawImportStamps(brandId),
    // Chỉ cần khi có piece của tháng trước (channelGmv prev, creatorLive các tháng cũ) — luôn có.
    fetchSnapshotPieces(brandId, shiftMonth(month, -1)).catch(() => null)
  ]);
  const cache: SnapshotPieces = { ...(prevMonthPieces ?? {}), ...(input.previous?.pieces ?? {}) };

  const pieces: SnapshotPieces = {};
  const fetched: string[] = [];
  const reused: string[] = [];
  await Promise.all(
    needed.map(async ({ kind, month: m }) => {
      const key = pieceKey(kind, m);
      const stamp = stampOf(kind, m, imports);
      const hit = cache[key];
      if (hit && hit.stamp === stamp) {
        pieces[key] = hit;
        reused.push(key);
        return;
      }
      pieces[key] = { stamp, data: await fetchPiece(kind, brandId, m) };
      fetched.push(key);
    })
  );

  return {
    snapshot: {
      version: SNAPSHOT_VERSION,
      brandId,
      month,
      computedAt: new Date().toISOString(),
      sessions: sessions.map(trimSession),
      planMonthTotals: windowPlanTotals(input.planMonthTotals, brandId, month),
      rates: input.brandPlatformRates.filter((r) => r.brandId === brandId),
      pieces,
      coverage: coverageOf(sessions, imports, brandId, month)
    },
    fetched,
    reused
  };
}

// ---------- đọc bản chụp ----------

export interface SnapshotView {
  liveRaw: Record<string, CreatorLivePerfMonthSlice | null>; // theo tháng trong cửa sổ
  dailyPerfRaw: LivePerformanceMonthSlice | null;
  topSku: TopSkuMonthSlice | null;
  topPromo: PromotionMonthSlice | null;
  /** Theo tháng trong cửa sổ — null = bản chụp cũ chưa có phần này (v1) hoặc tháng bị che với brand. */
  shopDays: Record<string, ShopDaysMonthSlice | null>;
  cardGmv: Record<string, CardGmvMonthSlice | null>;
}

export function snapshotView(s: MonthlyReportSnapshot): SnapshotView {
  const get = <T,>(kind: PieceKind, m: string): T | null => (s.pieces[pieceKey(kind, m)]?.data as T | undefined) ?? null;
  const liveRaw: SnapshotView["liveRaw"] = {};
  const shopDays: SnapshotView["shopDays"] = {};
  const cardGmv: SnapshotView["cardGmv"] = {};
  for (const m of reportWindow(s.month)) {
    liveRaw[m] = get<CreatorLivePerfMonthSlice>("creatorLive", m);
    shopDays[m] = get<ShopDaysMonthSlice>("shopDays", m);
    cardGmv[m] = get<CardGmvMonthSlice>("cardGmv", m);
  }
  return {
    shopDays,
    cardGmv,
    liveRaw,
    dailyPerfRaw: get<LivePerformanceMonthSlice>("dailyPerf", s.month),
    topSku: get<TopSkuMonthSlice>("topSku", s.month),
    topPromo: get<PromotionMonthSlice>("topPromo", s.month)
  };
}

// ---------- độ mới ----------

// Các trường của ca mà Report Tháng thực sự đọc — đổi trường khác (ghi chú, phòng…) không làm số
// report lệch nên không tính là "có thay đổi".
const SESSION_SIG_FIELDS: (keyof LiveSession)[] = [
  "date", "startTime", "endTime", "status", "platform", "hostId", "hostName", "title",
  "targetGmv", "actualGmv", "totalOrders", "totalViews", "avgWatchTimeSeconds", "dataSource",
  "liveDurationMinutes", "actualStartAt", "actualEndAt", "attributedItemsSold", "attributedSkuOrders",
  "impressions", "productImpressions", "productClicks", "newFollowers", "commentsCount", "sharesCount", "likesCount",
  "liveRoomIds"
];
function sessionSig(s: SnapshotSession | LiveSession): string {
  // "" / undefined / null coi như nhau — bản chụp đã bỏ trường trống (trimSession).
  return JSON.stringify(SESSION_SIG_FIELDS.map((f) => {
    const v = (s as unknown as Record<string, unknown>)[f];
    return v === undefined || v === "" ? null : v;
  }));
}

export interface SnapshotFreshness {
  /** Ca thêm/bớt/đổi số trong cửa sổ 4 tháng kể từ lúc chốt. */
  changedSessions: number;
  /** Trong đó bao nhiêu ca thuộc chính tháng report. */
  changedSessionsThisMonth: number;
  /** Loại file có batch mới up/ghi đè/xoá kể từ lúc chốt (nhãn hiển thị). */
  changedFiles: string[];
  /** Target kế hoạch / rate card / phiên bản công thức đổi. */
  configChanged: boolean;
  upToDate: boolean;
}

export function snapshotFreshness(
  s: MonthlyReportSnapshot,
  live: { sessions: LiveSession[]; planMonthTotals?: Map<string, number>; brandPlatformRates: BrandPlatformRate[]; imports: DataRawImportStamp[] }
): SnapshotFreshness {
  const { start, end } = monthBounds(s.month);
  const before = new Map(s.sessions.map((x) => [x.id, x]));
  const now = windowSessions(live.sessions, s.brandId, s.month);
  const changed = new Set<string>();
  const changedThisMonth = new Set<string>();
  const mark = (id: string, date: string) => {
    changed.add(id);
    if (date >= start && date <= end) changedThisMonth.add(id);
  };
  for (const x of now) {
    const old = before.get(x.id);
    if (!old || sessionSig(old) !== sessionSig(x)) mark(x.id, x.date);
    before.delete(x.id);
  }
  for (const gone of before.values()) mark(gone.id, gone.date);

  const changedFiles = new Set<string>();
  let formulaChanged = false;
  for (const { kind, month } of requiredPieces(s.month, now, s.brandId)) {
    const piece = s.pieces[pieceKey(kind, month)];
    if (piece && piece.stamp === stampOf(kind, month, live.imports)) continue;
    if (piece && !piece.stamp.startsWith(`v${PIECE_VERSION}|`)) {
      formulaChanged = true;
      continue;
    }
    const was = piece ? stampTypes(piece.stamp) : new Map<string, string>();
    for (const t of PIECE_SOURCES[kind]) {
      const cur = typeStamp(t, month, live.imports);
      // Piece chưa từng có (vd tháng vừa mất hết ca có số ⇒ cần file dự phòng) mà cũng không có file
      // nào thì không có gì để báo.
      if (!piece && !cur) continue;
      if ((was.get(t) ?? "") !== cur) changedFiles.add(REPORT_TYPE_LABEL[t] ?? t);
    }
  }

  const plan = windowPlanTotals(live.planMonthTotals, s.brandId, s.month);
  const rates = live.brandPlatformRates.filter((r) => r.brandId === s.brandId);
  const rateSig = (rs: BrandPlatformRate[]) => JSON.stringify(rs.map((r) => [r.platform, r.returnRate]).sort());
  const configChanged = formulaChanged || s.version !== SNAPSHOT_VERSION || JSON.stringify(plan) !== JSON.stringify(s.planMonthTotals) || rateSig(rates) !== rateSig(s.rates);

  return {
    changedSessions: changed.size,
    changedSessionsThisMonth: changedThisMonth.size,
    changedFiles: [...changedFiles],
    configChanged,
    upToDate: changed.size === 0 && changedFiles.size === 0 && !configChanged
  };
}

// ---------- tóm tắt để so trước/sau khi cập nhật report đã phát hành ----------

export interface SnapshotHeadline {
  totalGmv: number;
  sessionsWithNumbers: number;
  liveHours: number;
  shopGmv: number;
  videoGmv: number;
  cardGmv: number;
  topSku: string | null;
}

export function snapshotHeadline(s: MonthlyReportSnapshot): SnapshotHeadline {
  const { start, end } = monthBounds(s.month);
  const inMonth = s.sessions.filter((x) => x.date >= start && x.date <= end);
  const completed = inMonth.filter((x) => x.status === "Completed");
  const numbered = inMonth.filter((x) => hasLiveNumbers(x as LiveSession));
  const v = snapshotView(s);
  return {
    totalGmv: completed.reduce((a, x) => a + (x.actualGmv || 0), 0),
    sessionsWithNumbers: numbered.length,
    liveHours: numbered.reduce((a, x) => a + (x.liveDurationMinutes ?? 0) / 60, 0),
    videoGmv: (v.shopDays[s.month]?.days ?? []).reduce((a, d) => a + d.video, 0),
    shopGmv: (v.shopDays[s.month]?.days ?? []).reduce((a, d) => a + d.gmv, 0),
    cardGmv: v.cardGmv[s.month]?.cardGmv ?? 0,
    topSku: v.topSku?.items[0]?.name ?? null
  };
}
