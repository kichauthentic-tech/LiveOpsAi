import { Brand, BrandPlatformRate, LiveSession, Talent } from "../../types";
import { addDays, isoWeekNumber, isoWeekStart } from "../dateUtils";
import { hasHappened } from "../sessionLedger";
import { DataQuality, PerfRow, dataQuality, isCountable, sessionHours } from "./hostPerformance";

// Toàn Cảnh Agency (2026-09-24) — nhịp của CẢ agency theo thời gian, cho CEO xem hằng tuần/tháng.
// Khác hai màn đã có, không chồng lấn:
//   - Toàn Cảnh Brand: trạng thái thủ tục của TỪNG brand trong MỘT tháng (kế hoạch/report/rate).
//   - Hiệu Suất Host: xếp hạng người, để SẮP LỊCH.
// Màn này trả lời "kỳ này agency chạy nhanh hay chậm hơn kỳ trước, và vì sao".
//
// LUẬT BẮT BUỘC của file này — lý do module Dashboard cũ bị xoá hẳn 2026-09-13 là "số tính live/
// dự phóng không đáng tin":
//   1. Mọi hàm ở đây chỉ cộng những việc ĐÃ xảy ra. Không có một dòng nào dự phóng cuối kỳ.
//   2. Kỳ đang chạy so với kỳ trước phải cắt kỳ trước về ĐÚNG số ngày đã trôi (comparableRange) —
//      so tháng mới chạy 10 ngày với tháng đủ 31 ngày là tự bịa ra một cú sụt không có thật.
//   3. Ba trạng thái phải phân biệt được: chưa cấu hình / chưa có dữ liệu kỳ này / có số 0 thật.
//      Nên `pct` của Delta trả null khi kỳ trước = 0, chứ không trả 0 hay Infinity.
// File thuần: chỉ import type + hàm thuần, không đụng Supabase, để verify được bằng `tsx`.

export type OverviewGrain = "week" | "month";

export interface PeriodRange {
  key: string; // "2026-W39" | "2026-09" — ổn định, dùng làm React key
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD (ngày cuối kỳ theo LỊCH, kể cả kỳ chưa trôi hết)
  label: string; // nhãn ngắn cho trục biểu đồ: "T39" | "T9"
  longLabel: string; // nhãn đầy đủ cho tiêu đề
}

const pad = (n: number) => `${n}`.padStart(2, "0");

/** Số thứ tự ngày kể từ epoch — để cộng/trừ ngày không dính múi giờ máy chạy trình duyệt. */
function dayIndex(date: string): number {
  return Math.round(
    Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000
  );
}

export function daysBetween(from: string, to: string): number {
  return dayIndex(to) - dayIndex(from);
}

export function monthStartOf(month: string): string {
  return `${month}-01`;
}

export function monthEndOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

function shortDate(d: string): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** Kỳ (tuần ISO hoặc tháng) chứa `date`. */
export function periodOf(grain: OverviewGrain, date: string): PeriodRange {
  if (grain === "week") {
    const start = isoWeekStart(date);
    const end = addDays(start, 6);
    const { week, year } = isoWeekNumber(start);
    return {
      key: `${year}-W${pad(week)}`,
      start,
      end,
      label: `T${week}`,
      longLabel: `Tuần ${week}/${year} (${shortDate(start)}–${shortDate(end)})`
    };
  }
  const month = date.slice(0, 7);
  return {
    key: month,
    start: monthStartOf(month),
    end: monthEndOf(month),
    label: `T${Number(month.slice(5, 7))}`,
    longLabel: `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`
  };
}

/** Lùi/tiến `delta` kỳ. Đi qua ngày đầu kỳ rồi lấy lại periodOf để tháng 31/30/28 ngày đều đúng. */
export function shiftPeriod(grain: OverviewGrain, p: PeriodRange, delta: number): PeriodRange {
  if (grain === "week") return periodOf("week", addDays(p.start, delta * 7));
  const [y, m] = p.start.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return periodOf("month", `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`);
}

/** `count` kỳ liên tiếp kết thúc ở `anchor` (cũ → mới, anchor nằm cuối) — cho biểu đồ xu hướng. */
export function recentPeriods(grain: OverviewGrain, anchor: PeriodRange, count: number): PeriodRange[] {
  const out: PeriodRange[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(shiftPeriod(grain, anchor, -i));
  return out;
}

// ---------------------------------------------------------------------------
// Tổng hợp
// ---------------------------------------------------------------------------

export interface AgencyTotals {
  /** Ca ĐẾM ĐƯỢC (isCountable: đã chạy và đã có số) — mẫu số của mọi chỉ số hiệu suất. */
  countable: number;
  /** Ca đã diễn ra tính tới `today` (hasHappened) — không gồm ca sắp tới, không gồm ca huỷ. */
  happened: number;
  /** Ca đã xếp trong kỳ, trừ ca huỷ — gồm cả ca tương lai của kỳ đang chạy. */
  scheduled: number;
  cancelled: number;
  /** Đã diễn ra nhưng chưa có số. Chính là khoảng cách giữa `happened` và `countable`. */
  noNumbers: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  productImpressions: number;
  productClicks: number;
  gmvPerHour: number;
  aov: number;
  /** % click sản phẩm / hiển thị sản phẩm — cùng công thức `CTR` của tầng snapshot. */
  ctr: number;
  /** % đơn / click sản phẩm — cùng công thức `CTOR` của tầng snapshot. */
  ctor: number;
  quality: DataQuality;
}

export function emptyTotals(): AgencyTotals {
  return {
    countable: 0,
    happened: 0,
    scheduled: 0,
    cancelled: 0,
    noNumbers: 0,
    hours: 0,
    gmv: 0,
    orders: 0,
    views: 0,
    productImpressions: 0,
    productClicks: 0,
    gmvPerHour: 0,
    aov: 0,
    ctr: 0,
    ctor: 0,
    quality: { total: 0, reconciled: 0, snapshot: 0, manual: 0 }
  };
}

export type SessionsByDate = Map<string, LiveSession[]>;

/** Index 1 lần cho cả màn — mọi khối đều cắt lát theo ngày, quét lại `sessions` cho từng ô là
 *  O(ca × ô). Quy ước rút ra từ audit hiệu năng 2026-09-23 (ShiftScheduling quét 229 ca mỗi dòng). */
export function indexByDate(sessions: LiveSession[]): SessionsByDate {
  const m: SessionsByDate = new Map();
  for (const s of sessions) {
    const list = m.get(s.date);
    if (list) list.push(s);
    else m.set(s.date, [s]);
  }
  return m;
}

export function sessionsIn(idx: SessionsByDate, start: string, end: string): LiveSession[] {
  const out: LiveSession[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const list = idx.get(d);
    if (list) out.push(...list);
  }
  return out;
}

/** Tỷ lệ TÍNH LẠI từ số đếm được, không bao giờ trung bình cộng các tỷ lệ của từng ca — trung bình
 *  của tỷ lệ là số vô nghĩa (quy ước tầng snapshot, WORKSPACE_DESIGN.md). */
export function totalsOf(rows: LiveSession[], today: string): AgencyTotals {
  const t = emptyTotals();
  const countable: LiveSession[] = [];
  for (const s of rows) {
    if (s.status === "Cancelled") {
      t.cancelled++;
      continue;
    }
    t.scheduled++;
    if (hasHappened(s, today)) t.happened++;
    if (!isCountable(s)) continue;
    countable.push(s);
    t.countable++;
    t.hours += sessionHours(s);
    t.gmv += s.actualGmv ?? 0;
    t.orders += s.totalOrders ?? 0;
    t.views += s.totalViews ?? 0;
    t.productImpressions += s.productImpressions ?? 0;
    t.productClicks += s.productClicks ?? 0;
  }
  t.noNumbers = Math.max(0, t.happened - t.countable);
  t.gmvPerHour = t.hours > 0 ? t.gmv / t.hours : 0;
  t.aov = t.orders > 0 ? t.gmv / t.orders : 0;
  t.ctr = t.productImpressions > 0 ? (t.productClicks / t.productImpressions) * 100 : 0;
  t.ctor = t.productClicks > 0 ? (t.orders / t.productClicks) * 100 : 0;
  t.quality = dataQuality(countable);
  return t;
}

export interface PeriodStat {
  period: PeriodRange;
  totals: AgencyTotals;
}

export function statsFor(idx: SessionsByDate, periods: PeriodRange[], today: string): PeriodStat[] {
  return periods.map((period) => ({ period, totals: totalsOf(sessionsIn(idx, period.start, period.end), today) }));
}

// ---------------------------------------------------------------------------
// So sánh kỳ
// ---------------------------------------------------------------------------

export interface Delta {
  abs: number;
  /** null = kỳ trước bằng 0 nên KHÔNG có phần trăm để nói (không phải 0%, không phải ∞). */
  pct: number | null;
}

export function delta(cur: number, prev: number): Delta {
  return { abs: cur - prev, pct: prev === 0 ? null : ((cur - prev) / prev) * 100 };
}

/** Kỳ trước, CẮT về đúng số ngày đã trôi của kỳ đang xem.
 *
 *  Kỳ đã kết thúc thì trả nguyên kỳ trước. Kỳ đang chạy (today nằm trong kỳ) thì cắt: tháng 9 mới
 *  tới ngày 24 phải so với 24 ngày đầu của tháng 8, không phải cả tháng 8. Thiếu bước này thì mọi
 *  kỳ đang chạy đều hiện ra như đang sụt thảm hại, và đó là loại số sai đã giết Dashboard cũ. */
export function comparableRange(grain: OverviewGrain, cur: PeriodRange, today: string): PeriodRange {
  const prev = shiftPeriod(grain, cur, -1);
  if (today > cur.end || today < cur.start) return prev;
  const elapsed = daysBetween(cur.start, today) + 1; // hôm nay tính là 1 ngày đã trôi
  const cut = addDays(prev.start, elapsed - 1);
  if (cut >= prev.end) return prev;
  return { ...prev, end: cut, longLabel: `${prev.longLabel} · ${elapsed} ngày đầu` };
}

// ---------------------------------------------------------------------------
// Đóng góp & tập trung rủi ro
// ---------------------------------------------------------------------------

export interface ShareRow {
  key: string;
  label: string;
  gmv: number;
  hours: number;
  countable: number;
  gmvPerHour: number;
  /** % GMV của dòng này trên tổng GMV kỳ. */
  share: number;
}

export function sharesOf(rows: PerfRow[]): ShareRow[] {
  const total = rows.reduce((a, r) => a + r.gmv, 0);
  return rows
    .map((r) => ({
      key: r.key,
      label: r.label,
      gmv: r.gmv,
      hours: r.hours,
      countable: r.sessionCount,
      gmvPerHour: r.gmvPerHour,
      share: total > 0 ? (r.gmv / total) * 100 : 0
    }))
    .sort((a, b) => b.gmv - a.gmv);
}

/** Dòng lớn nhất — "mất người/brand này là mất bao nhiêu phần doanh số". */
export function topShare(rows: ShareRow[]): ShareRow | null {
  return rows.length > 0 ? rows[0] : null;
}

// ---------------------------------------------------------------------------
// Khối tiền: nói ra đang thiếu gì, thay vì hiện 0đ
// ---------------------------------------------------------------------------

export interface MoneyReadiness {
  brandsTotal: number;
  brandsWithRate: number;
  talentsTotal: number;
  talentsWithRate: number;
  /** Talent bị view `talents_secure` MASK rate với tài khoản đang đăng nhập — "không biết", KHÔNG
   *  phải "chưa đặt". Gộp hai cái này lại chính là lỗi audit 2026-09-21 (talent nhìn thấy 0đ/live
   *  rồi tưởng lương mình bằng 0). Khối tiền chỉ ceo/admin thấy nên bình thường phải là 0. */
  talentsRateHidden: number;
  /** Ca trong kỳ mà Finance & P&L thực sự nhận (Completed và KHÔNG phải ca nạp bù). */
  eligibleSessions: number;
  backfillSessions: number;
  ready: boolean;
  /** Câu mô tả đúng từng thứ còn thiếu, theo thứ tự phải làm. Rỗng = đã đủ để tính P&L. */
  blockers: string[];
}

/** Vì sao phải có hàm này: `computeSessionPnl` vẫn chạy được khi rate = 0 và trả về lợi nhuận 0đ.
 *  Hiện thẳng con số đó lên dashboard CEO là nói dối — "agency lãi 0đ" khác hẳn "chưa ai nhập rate".
 *  Ba điều kiện dưới đây đều là điều kiện CẦN, thiếu bất kỳ cái nào thì P&L của kỳ ra 0 một cách
 *  vô nghĩa, nên khối tiền không được render số nào. */
export function moneyReadiness(
  brands: Brand[],
  rates: BrandPlatformRate[],
  talents: Talent[],
  rowsInPeriod: LiveSession[]
): MoneyReadiness {
  const brandIdsWithRate = new Set(rates.filter((r) => r.ratePerHour > 0).map((r) => r.brandId));
  const brandsWithRate = brands.filter((b) => brandIdsWithRate.has(b.id)).length;
  const talentsRateHidden = talents.filter((t) => t.rateHidden).length;
  const talentsWithRate = talents.filter(
    (t) => !t.rateHidden && ((t.ratePerHour ?? 0) > 0 || (t.ratePerSession ?? 0) > 0 || (t.commissionRate ?? 0) > 0)
  ).length;
  // Cùng điều kiện lọc với lib/pnl.ts (computeMonthPnl) và FinanceHr.tsx — hai nơi không được
  // đếm khác nhau. Ca nạp bù bị loại CÓ CHỦ Ý: rate card tháng đó không chuẩn.
  const eligibleSessions = rowsInPeriod.filter((s) => s.status === "Completed" && !s.isBackfill).length;
  const backfillSessions = rowsInPeriod.filter((s) => s.isBackfill).length;

  const blockers: string[] = [];
  if (brandsWithRate === 0) {
    blockers.push(`Chưa brand nào có rate card (${brandsWithRate}/${brands.length}) — không có doanh thu agency để tính`);
  } else if (brandsWithRate < brands.length) {
    blockers.push(`Mới ${brandsWithRate}/${brands.length} brand có rate card — phần còn lại không vào được P&L`);
  }
  if (talentsRateHidden > 0) {
    blockers.push(`${talentsRateHidden}/${talents.length} talent đang bị ẩn rate với tài khoản này — chỉ ceo/admin xem được`);
  } else if (talentsWithRate === 0) {
    blockers.push(`Chưa talent nào có rate (0/${talents.length}) — không có chi phí host để trừ`);
  } else if (talentsWithRate < talents.length) {
    blockers.push(`Mới ${talentsWithRate}/${talents.length} talent có rate — ca của người chưa có rate tính ra 0đ chi phí`);
  }
  if (eligibleSessions === 0) {
    blockers.push(
      backfillSessions > 0
        ? `Cả ${backfillSessions} ca trong kỳ đều là ca nạp bù — Finance & P&L cố ý loại ca nạp bù (rate card tháng đó không chuẩn)`
        : "Chưa có ca nào đã hoàn thành trong kỳ"
    );
  }
  return {
    brandsTotal: brands.length,
    brandsWithRate,
    talentsTotal: talents.length,
    talentsWithRate,
    talentsRateHidden,
    eligibleSessions,
    backfillSessions,
    ready: blockers.length === 0,
    blockers
  };
}
