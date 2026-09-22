import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie
} from "recharts";
import {
  BarChart3,
  Flame,
  ListOrdered,
  ShoppingBag,
  Megaphone,
  Loader2,
  AlertTriangle,
  Radio,
  Handshake,
  CalendarClock,
  Plus,
  Trash2,
  Save,
  Filter,
  Users,
  Database,
  PieChart as PieChartIcon
} from "lucide-react";
import { LiveSession, BrandMonthlyReport as BrandMonthlyReportType, AffiliatePlanEntry, AffiliateActualEntry, BrandPlatformRate } from "../../types";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { fetchCreatorLivePerfMonthSlice } from "../../lib/dataraw/creatorLivePerfSlice";
import { dailyFromSessions, monthRunRate, pickLivePerfSource } from "../../lib/report/sessionsLivePerf";
import { fetchLivePerformanceCoreMonthSlice, fetchProductCardTrafficMonthSlice, ProductCardMonthSlice } from "../../lib/dataraw/monthlyDailySlice";
import { fetchTopSkuMonthSlice, fetchTopPromotionsMonthSlice } from "../../lib/dataraw/monthlyProductSlice";
import { fetchAffiliateCreatorListMonthSlice } from "../../lib/dataraw/affiliateCreatorListSlice";
import { fetchMonthlyReport, upsertMonthlyReport, MonthlyReportManualInput } from "../../lib/db/monthlyReports";
import { fetchAffiliatePlans, replaceAffiliatePlans } from "../../lib/db/affiliatePlans";
import { fetchAffiliateActuals, replaceAffiliateActuals } from "../../lib/db/affiliateActuals";
import { byHost, dataQuality, filterSessions, hostKey, splitUnassignedHost, DataQuality } from "../../lib/performance/hostPerformance";
import {
  aggregateCreatorLivePerfRows,
  bucketByCampaignDay,
  sumDailyGmvByBucket,
  buildFunnel,
  topSessionsByGmv,
  CAMP_DAY_BUCKET_ORDER,
  CAMP_DAY_BUCKET_LABEL,
  CampDayBucket,
  CampOverrides,
  CreatorLivePerfAgg
} from "../../lib/dataraw/creatorLivePerfMetrics";

// Report Tháng — skin đen-vàng CỐ ĐỊNH riêng cho tab này (khác theme sáng/tối/sand nội bộ app):
// đây là tài liệu gửi thẳng cho brand để pitching, nhận diện thương hiệu phải nhất quán bất kể Ops
// đang chọn theme nội bộ nào. Không dùng var(--accent)/var(--surface) như phần còn lại của app.
const PAL = {
  bg: "#0b0b0d",
  panel: "#17171b",
  panel2: "#1d1d22",
  line: "#2a2a30",
  gold: "#f2c94c",
  goldDim: "#a9873a",
  cream: "#f4f1e8",
  muted: "#93939c",
  green: "#6fcf97",
  red: "#eb6b6b",
  blue: "#7fb0e0"
};

function monthRangeLocal(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { start, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}
function prevMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

// recharts khai formatter của <Tooltip> nhận ValueType | undefined (string | number | mảng của
// chúng), không phải number — viết thẳng `(v: number) => ...` là nói dối kiểu, strict bắt đúng.
// Bọc một lần ở đây thay vì ép kiểu ở 8 chỗ gọi: ép kiểu thì lần sau recharts đổi signature sẽ
// không còn ai báo.
function chartNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function fmtPct(n: number | null): string {
  return n == null ? "—" : `${n.toFixed(2)}%`;
}
function fmtHours(n: number): string {
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
}
function fmtRoas(n: number | null): string {
  return n == null ? "—" : n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
}
// Status khuyến mãi trong file thật là tiếng Anh nguyên văn (expired/deactivated) — "ongoing" đã
// bị lọc khỏi Top khuyến mãi ở nguồn (monthlyProductSlice.ts) nên không cần map ở đây.
function promoStatusLabel(status: string): { label: string; color: string } {
  const s = status.toLowerCase();
  if (s === "expired") return { label: "Đã Kết Thúc", color: PAL.gold };
  if (s === "deactivated") return { label: "Đã Tắt", color: PAL.red };
  return { label: status, color: PAL.muted };
}
function fmtDateRange(r: { first: string; last: string } | null): string {
  if (!r) return "Chưa khớp phiên nội bộ";
  const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return r.first === r.last ? short(r.first) : `${short(r.first)} - ${short(r.last)}`;
}
function fmtSessionStart(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(shifted.getUTCDate())}/${p(shifted.getUTCMonth() + 1)} ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`;
}

let planRowKeyCounter = 0;
function newPlanRowKey(): string {
  planRowKeyCounter += 1;
  return `plan-row-${planRowKeyCounter}`;
}
type EditableAffiliatePlanEntry = AffiliatePlanEntry & { _key: string };

let affiliateRowKeyCounter = 0;
function newAffiliateRowKey(): string {
  affiliateRowKeyCounter += 1;
  return `affiliate-row-${affiliateRowKeyCounter}`;
}
type EditableAffiliateActualEntry = AffiliateActualEntry & { _key: string };
function roasOf(gmv: number | undefined, adsCost: number | undefined): number | null {
  return adsCost && adsCost > 0 ? (gmv || 0) / adsCost : null;
}
function runrateOf(gmv: number | undefined, target: number | undefined): number | null {
  return target && target > 0 ? ((gmv || 0) / target) * 100 : null;
}
function momPctLocal(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

const MomBadge: React.FC<{ current: number; previous: number }> = ({ current, previous }) => {
  const pct = momPctLocal(current, previous);
  if (pct == null) return <span style={{ color: PAL.muted }}>chưa có kỳ trước</span>;
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-bold"
      style={{ background: up ? `${PAL.green}22` : `${PAL.red}22`, color: up ? PAL.green : PAL.red }}
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
};

const ProgressBar: React.FC<{ pct: number | null }> = ({ pct }) => {
  const clamped = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2">
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: PAL.line }}>
        <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: PAL.gold }} />
      </div>
      <div className="text-[10px] mt-1 font-mono" style={{ color: PAL.muted }}>
        {pct == null ? "chưa có target (Lịch Vận Hành)" : `${pct.toFixed(1)}% target Lịch Vận Hành`}
      </div>
    </div>
  );
};

interface MonthlyReportTabsProps {
  brandId: string;
  month: string;
  sessions: LiveSession[];
  canManage: boolean;
  brandPlatformRates: BrandPlatformRate[];
}

type TabId = "overview" | "livestream" | "products" | "affiliate" | "plan";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "01 · Tổng Quan", icon: <BarChart3 className="w-3.5 h-3.5" /> },
  { id: "livestream", label: "02 · Livestream", icon: <Radio className="w-3.5 h-3.5" /> },
  { id: "products", label: "03 · Sản Phẩm & Khuyến Mãi", icon: <ShoppingBag className="w-3.5 h-3.5" /> },
  { id: "affiliate", label: "04 · Affiliate", icon: <Handshake className="w-3.5 h-3.5" /> },
  { id: "plan", label: "05 · Kế Hoạch Tháng Sau", icon: <CalendarClock className="w-3.5 h-3.5" /> }
];

const Panel: React.FC<{ title: string; icon: React.ReactNode; sub?: string; children: React.ReactNode }> = ({ title, icon, sub, children }) => (
  <div className="rounded-2xl overflow-hidden" style={{ background: PAL.panel, border: `1px solid ${PAL.line}` }}>
    <div
      className="px-5 py-3.5 flex items-center gap-2.5"
      style={{ borderBottom: `1px solid ${PAL.line}`, background: `linear-gradient(90deg, ${PAL.gold}22, transparent)` }}
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: PAL.gold, color: "#1a1500" }}>
        {icon}
      </span>
      <div>
        <h3 className="font-black text-sm" style={{ color: PAL.cream }}>
          {title}
        </h3>
        {sub && (
          <p className="text-[10px]" style={{ color: PAL.muted }}>
            {sub}
          </p>
        )}
      </div>
    </div>
    <div className="p-5">{children}</div>
  </div>
);

const KpiCard: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
    <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
      {label}
    </div>
    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
      {value}
    </div>
    {sub && (
      <div className="text-[11px] mt-1" style={{ color: PAL.muted }}>
        {sub}
      </div>
    )}
  </div>
);

const ReportTable: React.FC<{ head: string[]; children: React.ReactNode }> = ({ head, children }) => (
  <div className="overflow-x-auto -mx-1">
    <table className="w-full text-xs min-w-[520px]">
      <thead>
        <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
          {head.map((h, i) => (
            <th
              key={h}
              className={`py-2 px-3 text-left text-[10.5px] uppercase tracking-wider ${i > 0 ? "text-right" : ""}`}
              style={{ color: PAL.muted }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const chartTooltipStyle = { background: PAL.panel2, border: `1px solid ${PAL.line}`, borderRadius: 8, fontSize: 11, color: PAL.cream };

export const MonthlyReportTabs: React.FC<MonthlyReportTabsProps> = ({ brandId, month, sessions, canManage, brandPlatformRates }) => {
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tab 05 Kế hoạch tháng sau — fetch/lưu riêng, không chung vòng loading với 4 tab số liệu thật
  // ở trên (đây là dữ liệu nhập tay, độc lập Dataraw).
  const [monthlyReportRow, setMonthlyReportRow] = useState<BrandMonthlyReportType | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planSaving, setPlanSaving] = useState(false);
  const [planErrorMsg, setPlanErrorMsg] = useState<string | null>(null);
  // Tab 02 Livestream — khung camp D-Day/Mid-Month/Pay-Day cấu hình theo brand+tháng (migration
  // 0071), cùng row/save pattern như KPI Target ở trên nhưng form riêng.
  const [campSaving, setCampSaving] = useState(false);
  const [campErrorMsg, setCampErrorMsg] = useState<string | null>(null);
  const [campDdayStartInput, setCampDdayStartInput] = useState("");
  const [campDdayEndInput, setCampDdayEndInput] = useState("");
  const [campDdayTargetInput, setCampDdayTargetInput] = useState("");
  const [campMidmonthStartInput, setCampMidmonthStartInput] = useState("");
  const [campMidmonthEndInput, setCampMidmonthEndInput] = useState("");
  const [campMidmonthTargetInput, setCampMidmonthTargetInput] = useState("");
  const [campPaydayStartInput, setCampPaydayStartInput] = useState("");
  const [campPaydayEndInput, setCampPaydayEndInput] = useState("");
  const [campPaydayTargetInput, setCampPaydayTargetInput] = useState("");
  const [planTargetGmv, setPlanTargetGmv] = useState("");
  const [planTargetNmv, setPlanTargetNmv] = useState("");
  const [planTargetHours, setPlanTargetHours] = useState("");
  const [pctDaily, setPctDaily] = useState("");
  const [pctDday, setPctDday] = useState("");
  const [pctMidmonth, setPctMidmonth] = useState("");
  const [pctPayday, setPctPayday] = useState("");
  const [planRows, setPlanRows] = useState<EditableAffiliatePlanEntry[]>([]);

  // Tab 04 Affiliate — nhập tay hoàn toàn (migration 0067), fetch/lưu độc lập giống Tab 05.
  const [affiliateLoading, setAffiliateLoading] = useState(true);
  const [affiliateSaving, setAffiliateSaving] = useState(false);
  const [affiliateErrorMsg, setAffiliateErrorMsg] = useState<string | null>(null);
  const [affiliateRows, setAffiliateRows] = useState<EditableAffiliateActualEntry[]>([]);
  // Nút "Nhập Từ Dữ Liệu Gốc" (migration 0074) — điền directGmv/itemsSold/avgPrice/ctr/ctor từ file
  // Transaction Analysis - Creator List, KHÔNG đụng targetGmv/durationHours/adsCost/liveDateLabel
  // (vẫn nhập tay, file không có các số này).
  const [creatorListImporting, setCreatorListImporting] = useState(false);
  const [creatorListErrorMsg, setCreatorListErrorMsg] = useState<string | null>(null);

  // Đổi nguồn số (2026-09-21): file Dataraw chỉ còn là DỰ PHÒNG — tháng nào có ca có số thì Tab 01/02
  // đọc từ ca (lib/report/sessionsLivePerf.ts). *Raw = slice từ Dataraw; liveCurrent/livePrev = nguồn đã chọn.
  const [liveCurrentRaw, setLiveCurrentRaw] = useState<Awaited<ReturnType<typeof fetchCreatorLivePerfMonthSlice>> | null>(null);
  const [livePrevRaw, setLivePrevRaw] = useState<Awaited<ReturnType<typeof fetchCreatorLivePerfMonthSlice>> | null>(null);
  // Chart "GMV/Giờ & Số Giờ Live" (Tab 02, brief Module 2) cần 4 tháng — liveCurrent/livePrev đã
  // phủ 2 tháng gần nhất, chỉ cần fetch thêm 2 tháng cũ hơn (last4Months[0..1]), keyed theo "YYYY-MM".
  const [liveOlderMonths, setLiveOlderMonths] = useState<Record<string, Awaited<ReturnType<typeof fetchCreatorLivePerfMonthSlice>>>>({});
  const [dailyPerfRaw, setDailyPerfRaw] = useState<Awaited<ReturnType<typeof fetchLivePerformanceCoreMonthSlice>> | null>(null);
  const [productCard, setProductCard] = useState<ProductCardMonthSlice | null>(null);
  const [productCardPrev, setProductCardPrev] = useState<ProductCardMonthSlice | null>(null);
  const [topSku, setTopSku] = useState<Awaited<ReturnType<typeof fetchTopSkuMonthSlice>> | null>(null);
  const [topPromo, setTopPromo] = useState<Awaited<ReturnType<typeof fetchTopPromotionsMonthSlice>> | null>(null);
  // Tab 01 Tổng Quan — Affiliate GMV tháng trước (chỉ cần tổng Direct GMV, không cần state editable
  // như affiliateRows của tháng đang xem).
  const [affiliateGmvPrevTotal, setAffiliateGmvPrevTotal] = useState(0);

  const { start, end } = useMemo(() => monthRangeLocal(month), [month]);
  const prevMonth = useMemo(() => prevMonthStrLocal(month), [month]);
  const { start: prevStart, end: prevEnd } = useMemo(() => monthRangeLocal(prevMonth), [prevMonth]);
  const last4Months = useMemo(() => {
    const out: string[] = [];
    let m = month;
    for (let i = 0; i < 4; i++) {
      out.unshift(m);
      m = prevMonthStrLocal(m);
    }
    return out;
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    const olderMonths = last4Months.slice(0, 2);
    Promise.all([
      fetchCreatorLivePerfMonthSlice(brandId, start, end),
      fetchCreatorLivePerfMonthSlice(brandId, prevStart, prevEnd),
      fetchLivePerformanceCoreMonthSlice(brandId, start, end),
      fetchProductCardTrafficMonthSlice(brandId, start, end),
      fetchProductCardTrafficMonthSlice(brandId, prevStart, prevEnd),
      fetchTopSkuMonthSlice(brandId, start, end),
      fetchTopPromotionsMonthSlice(brandId, start, end),
      fetchAffiliateActuals(brandId, `${prevMonth}-01`),
      Promise.all(
        olderMonths.map((m) => {
          const { start: s, end: e } = monthRangeLocal(m);
          return fetchCreatorLivePerfMonthSlice(brandId, s, e).then((r) => [m, r] as const);
        })
      )
    ])
      .then(([lc, lp, dp, pc, pcPrev, sku, promo, affPrev, olderEntries]) => {
        if (cancelled) return;
        setLiveCurrentRaw(lc);
        setLivePrevRaw(lp);
        setDailyPerfRaw(dp);
        setProductCard(pc);
        setProductCardPrev(pcPrev);
        setTopSku(sku);
        setTopPromo(promo);
        setAffiliateGmvPrevTotal(affPrev.reduce((sum, r) => sum + (r.directGmv || 0), 0));
        setLiveOlderMonths(Object.fromEntries(olderEntries));
      })
      .catch((e) => !cancelled && setErrorMsg(e.message || "Không tải được dữ liệu Report Tháng"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, start, end, prevStart, prevEnd, prevMonth, last4Months]);

  const liveSource = useMemo(() => pickLivePerfSource(sessions, brandId, start, end, liveCurrentRaw), [sessions, brandId, start, end, liveCurrentRaw]);
  const livePrevSource = useMemo(() => pickLivePerfSource(sessions, brandId, prevStart, prevEnd, livePrevRaw), [sessions, brandId, prevStart, prevEnd, livePrevRaw]);
  const liveCurrent = liveSource.slice;
  const livePrev = livePrevSource.slice;
  // Diễn biến theo ngày: file Live Performance Core Stats có GMV gián tiếp — ưu tiên khi có; không có
  // thì gộp ca theo ngày.
  const dailyPerf = useMemo(() => (dailyPerfRaw?.hasAnyBatch ? dailyPerfRaw : dailyFromSessions(sessions, brandId, start, end)), [dailyPerfRaw, sessions, brandId, start, end]);
  const runRate = useMemo(() => monthRunRate(sessions, brandId, start, end), [sessions, brandId, start, end]);
  const currentAgg = useMemo(() => aggregateCreatorLivePerfRows(liveCurrent?.rows ?? []), [liveCurrent]);
  const prevAgg = useMemo(() => aggregateCreatorLivePerfRows(livePrev?.rows ?? []), [livePrev]);

  // Khung camp D-Day/Mid-Month/Pay-Day: override theo brand+tháng nếu đã cấu hình (migration 0071),
  // fallback về khung cố định mặc định (lib/campaignDays.ts) khi chưa cấu hình.
  const campOverrides: CampOverrides = useMemo(() => {
    const out: CampOverrides = {};
    if (monthlyReportRow?.campDdayStart && monthlyReportRow?.campDdayEnd) out.dday = { start: monthlyReportRow.campDdayStart, end: monthlyReportRow.campDdayEnd };
    if (monthlyReportRow?.campMidmonthStart && monthlyReportRow?.campMidmonthEnd)
      out.midmonth = { start: monthlyReportRow.campMidmonthStart, end: monthlyReportRow.campMidmonthEnd };
    if (monthlyReportRow?.campPaydayStart && monthlyReportRow?.campPaydayEnd) out.payday = { start: monthlyReportRow.campPaydayStart, end: monthlyReportRow.campPaydayEnd };
    return out;
  }, [monthlyReportRow]);

  const campBuckets = useMemo(() => bucketByCampaignDay(liveCurrent?.rows ?? [], campOverrides), [liveCurrent, campOverrides]);
  const prevCampBuckets = useMemo(() => bucketByCampaignDay(livePrev?.rows ?? [], campOverrides), [livePrev, campOverrides]);
  // Actual GMV theo khung camp cho chart Target vs Actual — SUM(gmv_live_session) từ File 1 đúng
  // công thức brief (khác campBuckets ở trên vốn dùng File 3 cho bảng chi tiết giờ/CTR/CTOR).
  const dailyGmvByBucket = useMemo(() => sumDailyGmvByBucket(dailyPerf?.daily ?? [], campOverrides), [dailyPerf, campOverrides]);
  const funnelStages = useMemo(() => buildFunnel(liveCurrent?.rows ?? []), [liveCurrent]);
  const topSessions = useMemo(() => topSessionsByGmv(liveCurrent?.rows ?? [], 10), [liveCurrent]);

  // Chart "GMV/Giờ & Số Giờ Live" — combo bar+line dual-axis, 4 tháng (brief Module 2).
  const gmvHourTrend = useMemo(
    () =>
      last4Months.map((m) => {
        const older = m === month || m === prevMonth ? null : pickLivePerfSource(sessions, brandId, monthRangeLocal(m).start, monthRangeLocal(m).end, liveOlderMonths[m] ?? null).slice;
        const agg = m === month ? currentAgg : m === prevMonth ? prevAgg : aggregateCreatorLivePerfRows(older?.rows ?? []);
        return { label: m.slice(5, 7) + "/" + m.slice(2, 4), gmvPerHour: agg.gmvPerHour ?? 0, hours: agg.hours };
      }),
    [last4Months, month, prevMonth, currentAgg, prevAgg, liveOlderMonths, sessions, brandId]
  );

  // Gợi ý % phân bổ mặc định cho Tab 05 — trung bình tỷ trọng GMV thực đạt theo khung camp của
  // tháng đang xem + tháng trước (2 tháng đã fetch sẵn cho Tab 02, không fetch thêm). Nếu cả 2
  // tháng đều chưa có dữ liệu Live Analysis (brand mới/chưa import), fallback về chia đều 25% mỗi
  // khung — rõ ràng là fallback, KHÔNG giả vờ là số liệu lịch sử thật.
  const suggestedPct = useMemo(() => {
    const gmvByBucket = (buckets: ReturnType<typeof bucketByCampaignDay>) =>
      CAMP_DAY_BUCKET_ORDER.reduce(
        (acc, b) => {
          acc[b] = aggregateCreatorLivePerfRows(buckets[b]).gmv;
          return acc;
        },
        {} as Record<CampDayBucket, number>
      );
    const a = gmvByBucket(campBuckets);
    const b = gmvByBucket(prevCampBuckets);
    const total = CAMP_DAY_BUCKET_ORDER.reduce((sum, k) => sum + a[k] + b[k], 0);
    if (total <= 0) {
      return { dday: 25, midmonth: 25, payday: 25, daily: 25, isFallback: true };
    }
    return {
      dday: ((a.dday + b.dday) / total) * 100,
      midmonth: ((a.midmonth + b.midmonth) / total) * 100,
      payday: ((a.payday + b.payday) / total) * 100,
      daily: ((a.daily + b.daily) / total) * 100,
      isFallback: false
    };
  }, [campBuckets, prevCampBuckets]);

  const nextMonth = useMemo(() => nextMonthStrLocal(month), [month]);

  useEffect(() => {
    let cancelled = false;
    setPlanLoading(true);
    setPlanErrorMsg(null);
    Promise.all([fetchMonthlyReport(brandId, `${month}-01`), fetchAffiliatePlans(brandId, `${nextMonth}-01`)])
      .then(([row, entries]) => {
        if (cancelled) return;
        setMonthlyReportRow(row);
        setCampDdayStartInput(row?.campDdayStart ?? "");
        setCampDdayEndInput(row?.campDdayEnd ?? "");
        setCampDdayTargetInput(row?.campDdayTargetGmv != null ? String(row.campDdayTargetGmv) : "");
        setCampMidmonthStartInput(row?.campMidmonthStart ?? "");
        setCampMidmonthEndInput(row?.campMidmonthEnd ?? "");
        setCampMidmonthTargetInput(row?.campMidmonthTargetGmv != null ? String(row.campMidmonthTargetGmv) : "");
        setCampPaydayStartInput(row?.campPaydayStart ?? "");
        setCampPaydayEndInput(row?.campPaydayEnd ?? "");
        setCampPaydayTargetInput(row?.campPaydayTargetGmv != null ? String(row.campPaydayTargetGmv) : "");
        setPlanTargetGmv(row?.planTargetGmv != null ? String(row.planTargetGmv) : "");
        setPlanTargetNmv(row?.planTargetNmv != null ? String(row.planTargetNmv) : "");
        setPlanTargetHours(row?.planTargetHours != null ? String(row.planTargetHours) : "");
        // Đã chốt trước đó thì dùng số đã lưu, chưa có thì điền sẵn % gợi ý theo lịch sử (ops có
        // thể sửa trước khi lưu) — chỉ tính khi effect này chạy, tránh suggestedPct đổi liên tục
        // ghi đè input ops đang gõ dở.
        setPctDaily(row?.planPctDaily != null ? String(row.planPctDaily) : suggestedPct.daily.toFixed(1));
        setPctDday(row?.planPctDday != null ? String(row.planPctDday) : suggestedPct.dday.toFixed(1));
        setPctMidmonth(row?.planPctMidmonth != null ? String(row.planPctMidmonth) : suggestedPct.midmonth.toFixed(1));
        setPctPayday(row?.planPctPayday != null ? String(row.planPctPayday) : suggestedPct.payday.toFixed(1));
        setPlanRows(entries.map((e) => ({ ...e, _key: newPlanRowKey() })));
      })
      .catch((e) => !cancelled && setPlanErrorMsg(e.message || "Không tải được Kế hoạch tháng sau"))
      .finally(() => !cancelled && setPlanLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandId, month, nextMonth]);

  const planPctTotal = useMemo(
    () => (Number(pctDaily) || 0) + (Number(pctDday) || 0) + (Number(pctMidmonth) || 0) + (Number(pctPayday) || 0),
    [pctDaily, pctDday, pctMidmonth, pctPayday]
  );
  const planDonutData = useMemo(
    () => [
      { label: "Daily", value: Number(pctDaily) || 0, color: PAL.gold },
      { label: "D-Day", value: Number(pctDday) || 0, color: PAL.green },
      { label: "Pay Day", value: Number(pctPayday) || 0, color: PAL.blue },
      { label: "Mid-Month", value: Number(pctMidmonth) || 0, color: PAL.muted }
    ],
    [pctDaily, pctDday, pctMidmonth, pctPayday]
  );
  const planBucketRows = useMemo(() => {
    const totalGmv = Number(planTargetGmv) || 0;
    const totalHours = Number(planTargetHours) || 0;
    return [
      { key: "daily", label: "Daily", pct: Number(pctDaily) || 0 },
      { key: "dday", label: "D-Day", pct: Number(pctDday) || 0 },
      { key: "payday", label: "Pay Day", pct: Number(pctPayday) || 0 },
      { key: "midmonth", label: "Mid-Month", pct: Number(pctMidmonth) || 0 }
    ].map((b) => {
      const gmv = (totalGmv * b.pct) / 100;
      const hours = (totalHours * b.pct) / 100;
      return { ...b, gmv, hours, gmvPerHour: hours > 0 ? gmv / hours : null };
    });
  }, [planTargetGmv, planTargetHours, pctDaily, pctDday, pctMidmonth, pctPayday]);

  const handleSavePlan = async () => {
    setPlanSaving(true);
    setPlanErrorMsg(null);
    try {
      // Pass-through nguyên giá trị Ads/ROAS/Notes đã tải (form đó sống ở BrandMonthlyReport.tsx,
      // không đụng ở đây) — tránh upsert ghi đè các field đó về null.
      const input: MonthlyReportManualInput = {
        adsSpend: monthlyReportRow?.adsSpend,
        roas: monthlyReportRow?.roas,
        promotionNotes: monthlyReportRow?.promotionNotes,
        customerInsightNotes: monthlyReportRow?.customerInsightNotes,
        accountHealthNotes: monthlyReportRow?.accountHealthNotes,
        planTargetGmv: planTargetGmv ? Number(planTargetGmv) : undefined,
        planTargetNmv: planTargetNmv ? Number(planTargetNmv) : undefined,
        planTargetHours: planTargetHours ? Number(planTargetHours) : undefined,
        planPctDaily: pctDaily ? Number(pctDaily) : undefined,
        planPctDday: pctDday ? Number(pctDday) : undefined,
        planPctMidmonth: pctMidmonth ? Number(pctMidmonth) : undefined,
        planPctPayday: pctPayday ? Number(pctPayday) : undefined,
        campDdayStart: monthlyReportRow?.campDdayStart,
        campDdayEnd: monthlyReportRow?.campDdayEnd,
        campDdayTargetGmv: monthlyReportRow?.campDdayTargetGmv,
        campMidmonthStart: monthlyReportRow?.campMidmonthStart,
        campMidmonthEnd: monthlyReportRow?.campMidmonthEnd,
        campMidmonthTargetGmv: monthlyReportRow?.campMidmonthTargetGmv,
        campPaydayStart: monthlyReportRow?.campPaydayStart,
        campPaydayEnd: monthlyReportRow?.campPaydayEnd,
        campPaydayTargetGmv: monthlyReportRow?.campPaydayTargetGmv
      };
      const savedRow = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setMonthlyReportRow(savedRow);
      const savedEntries = await replaceAffiliatePlans(brandId, `${nextMonth}-01`, planRows);
      setPlanRows(savedEntries.map((e) => ({ ...e, _key: newPlanRowKey() })));
    } catch (e: any) {
      setPlanErrorMsg(e.message || "Lưu Kế hoạch tháng sau thất bại");
    } finally {
      setPlanSaving(false);
    }
  };

  const handleSaveCampConfig = async () => {
    setCampSaving(true);
    setCampErrorMsg(null);
    try {
      const input: MonthlyReportManualInput = {
        adsSpend: monthlyReportRow?.adsSpend,
        roas: monthlyReportRow?.roas,
        promotionNotes: monthlyReportRow?.promotionNotes,
        customerInsightNotes: monthlyReportRow?.customerInsightNotes,
        accountHealthNotes: monthlyReportRow?.accountHealthNotes,
        planTargetGmv: monthlyReportRow?.planTargetGmv,
        planTargetNmv: monthlyReportRow?.planTargetNmv,
        planTargetHours: monthlyReportRow?.planTargetHours,
        planPctDaily: monthlyReportRow?.planPctDaily,
        planPctDday: monthlyReportRow?.planPctDday,
        planPctMidmonth: monthlyReportRow?.planPctMidmonth,
        planPctPayday: monthlyReportRow?.planPctPayday,
        campDdayStart: campDdayStartInput || undefined,
        campDdayEnd: campDdayEndInput || undefined,
        campDdayTargetGmv: campDdayTargetInput ? Number(campDdayTargetInput) : undefined,
        campMidmonthStart: campMidmonthStartInput || undefined,
        campMidmonthEnd: campMidmonthEndInput || undefined,
        campMidmonthTargetGmv: campMidmonthTargetInput ? Number(campMidmonthTargetInput) : undefined,
        campPaydayStart: campPaydayStartInput || undefined,
        campPaydayEnd: campPaydayEndInput || undefined,
        campPaydayTargetGmv: campPaydayTargetInput ? Number(campPaydayTargetInput) : undefined
      };
      const savedRow = await upsertMonthlyReport(brandId, `${month}-01`, input);
      setMonthlyReportRow(savedRow);
    } catch (e: any) {
      setCampErrorMsg(e.message || "Lưu Khung Camp thất bại");
    } finally {
      setCampSaving(false);
    }
  };

  const addPlanRow = () =>
    setPlanRows((rows) => [
      ...rows,
      { _key: newPlanRowKey(), brandId, periodMonth: `${nextMonth}-01`, creatorName: "", campTag: "", scheduleLabel: "", timelineLabel: "" }
    ]);
  const removePlanRow = (key: string) => setPlanRows((rows) => rows.filter((r) => r._key !== key));
  const updatePlanRow = (key: string, patch: Partial<AffiliatePlanEntry>) =>
    setPlanRows((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const planAffiliateTotals = useMemo(
    () => ({
      targetGmv: planRows.reduce((sum, r) => sum + (r.targetGmv || 0), 0),
      budgetAds: planRows.reduce((sum, r) => sum + (r.budgetAds || 0), 0)
    }),
    [planRows]
  );

  // Tab 04 Affiliate — nhập tay hoàn toàn (migration 0067). Fetch theo THÁNG ĐANG XEM (khác Tab 05
  // fetch theo nextMonth).
  useEffect(() => {
    let cancelled = false;
    setAffiliateLoading(true);
    setAffiliateErrorMsg(null);
    fetchAffiliateActuals(brandId, `${month}-01`)
      .then((entries) => {
        if (cancelled) return;
        setAffiliateRows(entries.map((e) => ({ ...e, _key: newAffiliateRowKey() })));
      })
      .catch((e) => !cancelled && setAffiliateErrorMsg(e.message || "Không tải được Affiliate"))
      .finally(() => !cancelled && setAffiliateLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, month]);

  const addAffiliateRow = () =>
    setAffiliateRows((rows) => [...rows, { _key: newAffiliateRowKey(), brandId, periodMonth: `${month}-01`, creatorName: "" }]);
  const removeAffiliateRow = (key: string) => setAffiliateRows((rows) => rows.filter((r) => r._key !== key));
  const updateAffiliateRow = (key: string, patch: Partial<AffiliateActualEntry>) =>
    setAffiliateRows((rows) => rows.map((r) => (r._key === key ? { ...r, ...patch } : r)));

  const handleSaveAffiliate = async () => {
    setAffiliateSaving(true);
    setAffiliateErrorMsg(null);
    try {
      const saved = await replaceAffiliateActuals(brandId, `${month}-01`, affiliateRows);
      setAffiliateRows(saved.map((e) => ({ ...e, _key: newAffiliateRowKey() })));
    } catch (e: any) {
      setAffiliateErrorMsg(e.message || "Lưu Affiliate thất bại");
    } finally {
      setAffiliateSaving(false);
    }
  };

  // Ghép theo creatorName (không phân biệt hoa/thường + khoảng trắng thừa) — creator đã có trong
  // danh sách thì cập nhật đè 5 field lấy được từ file, creator mới trong file thì thêm dòng mới.
  // targetGmv/durationHours/adsCost/liveDateLabel không đụng tới, vẫn giữ giá trị ops đã nhập tay.
  const handleImportAffiliateFromDataraw = async () => {
    setCreatorListImporting(true);
    setCreatorListErrorMsg(null);
    try {
      const slice = await fetchAffiliateCreatorListMonthSlice(brandId, start, end);
      if (!slice.hasAnyBatch) {
        setCreatorListErrorMsg('Chưa có file "Affiliate — Creator List" nào phủ tháng này trong Dữ Liệu Gốc.');
        return;
      }
      setAffiliateRows((rows) => {
        const byKey = new Map<string, EditableAffiliateActualEntry>(rows.map((r) => [r.creatorName.trim().toLowerCase(), r]));
        for (const item of slice.items) {
          const key = item.creatorName.trim().toLowerCase();
          if (!key) continue;
          const patch: Partial<AffiliateActualEntry> = {
            directGmv: item.directGmv,
            itemsSold: item.itemsSold,
            avgPrice: item.avgPrice,
            ctr: item.ctr,
            ctor: item.ctor
          };
          const existing = byKey.get(key);
          const merged: EditableAffiliateActualEntry = existing
            ? { ...existing, ...patch }
            : { _key: newAffiliateRowKey(), brandId, periodMonth: `${month}-01`, creatorName: item.creatorName, ...patch };
          byKey.set(key, merged);
        }
        return Array.from(byKey.values());
      });
    } catch (e: any) {
      setCreatorListErrorMsg(e.message || "Nhập dữ liệu từ Dữ Liệu Gốc thất bại");
    } finally {
      setCreatorListImporting(false);
    }
  };

  const affiliateChartData = useMemo(
    () =>
      affiliateRows
        .filter((r) => r.creatorName.trim())
        .map((r) => ({
          label: r.creatorName,
          gmvHour: r.durationHours && r.durationHours > 0 ? (r.directGmv || 0) / r.durationHours : 0,
          runrate: runrateOf(r.directGmv, r.targetGmv) ?? 0
        })),
    [affiliateRows]
  );

  const completedInPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= start && s.date <= end && s.status === "Completed"),
    [sessions, brandId, start, end]
  );

  // Host Performance (Tab 02) — Creator-Live-Performance không có tên host nên KHÔNG tính từ
  // Dataraw; tổng hợp từ session nội bộ (đã biết hostName sẵn).
  //
  // Audit Module 3 (2026-09-18): trước đây tab này tự gom bằng một vòng lặp riêng — giờ KẾ HOẠCH,
  // đếm cả ca GMV = 0, gom theo tên, kèm cột CVR mà không luồng nào ghi — nên brand đọc ra một
  // GMV/giờ KHÁC với tab "Hiệu Suất Host" của agency về cùng một host. Giờ dùng đúng
  // lib/performance/hostPerformance.ts (giờ live thật khi có, loại ca không có số, gom theo id rồi
  // mới tới tên) — hai màn hình không bao giờ được nói hai con số về cùng một người.
  interface HostPerfRow {
    key: string;
    hostName: string;
    sessionCount: number;
    quality: DataQuality;
    gmv: number;
    orders: number;
    hours: number;
    gmvPerHour: number | null;
    ctr: number | null;
  }
  const hostPerformance = useMemo<HostPerfRow[]>(() => {
    const tiktokSessions = filterSessions(
      completedInPeriod.filter((s) => s.platform === "TikTok"),
      {}
    );
    const byKey = new Map<string, LiveSession[]>();
    for (const s of tiktokSessions) {
      const list = byKey.get(hostKey(s)) ?? [];
      list.push(s);
      byKey.set(hostKey(s), list);
    }
    // Ca chưa gán host bị tách khỏi bảng/biểu đồ host (audit 2026-09-21): gom mọi ca vô danh thành
    // một dòng rồi xếp hạng chung với người thật là so sai đối tượng.
    return splitUnassignedHost(byHost(tiktokSessions))
      .ranked.sort((a, b) => b.gmv - a.gmv)
      .map((r) => ({
        key: r.key,
        hostName: r.label,
        sessionCount: r.sessionCount,
        quality: dataQuality(byKey.get(r.key) ?? []),
        gmv: r.gmv,
        orders: r.orders,
        hours: r.hours,
        gmvPerHour: r.hours > 0 ? r.gmvPerHour : null,
        ctr: r.productImpressions > 0 ? r.ctr : null
      }));
  }, [completedInPeriod]);
  const hostQuality = useMemo(() => dataQuality(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {})), [completedInPeriod]);
  const unassignedHost = useMemo(
    () => splitUnassignedHost(byHost(filterSessions(completedInPeriod.filter((s) => s.platform === "TikTok"), {}))).unassigned,
    [completedInPeriod]
  );
  const hostChartData = useMemo(() => hostPerformance.map((h) => ({ label: h.hostName, gmvHour: h.gmvPerHour ?? 0 })), [hostPerformance]);
  const totalGmvCur = useMemo(() => completedInPeriod.reduce((sum, s) => sum + (s.actualGmv || 0), 0), [completedInPeriod]);

  // Target GMV/NMV (Tab 01 Tổng Quan) = tổng targetGmv của các ca CHƯA HUỶ trong kỳ. Từ 2026-09-18
  // `targetGmv` của ca là số App đã phân bổ từ kế hoạch tháng (Tab 05) xuống từng ca — xem
  // lib/performance/targetAllocation.ts — nên tổng này = đúng tổng kế hoạch tháng khi có kế hoạch.
  // Ca huỷ không mang target (user chốt): agency bù bằng ca khác, target tự dồn sang ca đó.
  const scheduledTargetGmv = (s: string, e: string) =>
    sessions
      .filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status !== "Cancelled")
      .reduce((sum, x) => sum + (x.targetGmv || 0), 0);
  const scheduledTargetNmv = (s: string, e: string) =>
    sessions
      .filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status !== "Cancelled")
      .reduce((sum, x) => {
        const rate = brandPlatformRates.find((r) => r.brandId === brandId && r.platform === x.platform)?.returnRate ?? 0;
        return sum + (x.targetGmv || 0) * (1 - rate / 100);
      }, 0);

  // Chart "Target vs Thực Đạt GMV" (brief Module 1) — Target = tổng target đã lên lịch (xem trên),
  // Actual = Total GMV thực tế.
  const trend = useMemo(() => {
    const out: { label: string; kpiTarget: number | null; actual: number }[] = [];
    for (const m of last4Months) {
      const { start: s, end: e } = monthRangeLocal(m);
      const list = sessions.filter((x) => x.brandId === brandId && x.date >= s && x.date <= e && x.status === "Completed");
      const target = scheduledTargetGmv(s, e);
      out.push({
        label: m.slice(5, 7) + "/" + m.slice(2, 4),
        kpiTarget: target > 0 ? target : null,
        actual: list.reduce((sum, x) => sum + (x.actualGmv || 0), 0)
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, brandId, last4Months, brandPlatformRates]);

  const completedPrevPeriod = useMemo(
    () => sessions.filter((s) => s.brandId === brandId && s.date >= prevStart && s.date <= prevEnd && s.status === "Completed"),
    [sessions, brandId, prevStart, prevEnd]
  );

  // Total NMV (brief Module 1) — ước tính = Total GMV × (1 − tỷ lệ hoàn hủy theo brand+platform,
  // Rate Card). CHỈ dùng rate hiện tại (không tra lịch sử theo ngày như lib/pnl.ts) — đủ chính xác
  // cho mức tổng hợp tháng, và Rate Card hiếm khi đổi trong tháng. Là số DỰ KIẾN, disclaimer ở UI.
  const estimateNmv = (list: LiveSession[]) =>
    list.reduce((sum, s) => {
      const rate = brandPlatformRates.find((r) => r.brandId === brandId && r.platform === s.platform)?.returnRate ?? 0;
      return sum + (s.actualGmv || 0) * (1 - rate / 100);
    }, 0);
  const totalNmvCur = estimateNmv(completedInPeriod);
  const totalNmvPrev = estimateNmv(completedPrevPeriod);
  const hasReturnRateConfig = brandPlatformRates.some((r) => r.brandId === brandId);

  // Affiliate GMV (Tab 04, nhập tay Direct GMV mỗi creator) + Video/Product card GMV (File 2, đã
  // ingest sẵn) — 4 thành phần cơ cấu GMV theo brief, không có nguồn nào tách được GMV toàn shop
  // theo kênh nên đều là proxy tốt nhất hiện có (xem note ở bảng chi tiết bên dưới).
  const affiliateGmvCur = useMemo(() => affiliateRows.reduce((sum, r) => sum + (r.directGmv || 0), 0), [affiliateRows]);
  const affiliateGmvPrev = affiliateGmvPrevTotal;
  const liveGmvCur = currentAgg.gmv;
  const liveGmvPrev = prevAgg.gmv;
  const liveAffCur = liveGmvCur + affiliateGmvCur;
  const liveAffPrev = liveGmvPrev + affiliateGmvPrev;
  const videoGmvCur = productCard?.totals.gmvContent ?? 0;
  const videoGmvPrev = productCardPrev?.totals.gmvContent ?? 0;
  const productCardGmvCur = productCard?.totals.gmvCard ?? 0;
  const productCardGmvPrev = productCardPrev?.totals.gmvCard ?? 0;

  const kpiTargetGmvCurRaw = scheduledTargetGmv(start, end);
  const kpiTargetGmvPrevRaw = scheduledTargetGmv(prevStart, prevEnd);
  const kpiTargetGmvCur = kpiTargetGmvCurRaw > 0 ? kpiTargetGmvCurRaw : null;
  const kpiTargetGmvPrev = kpiTargetGmvPrevRaw > 0 ? kpiTargetGmvPrevRaw : null;
  const kpiTargetNmvCurRaw = scheduledTargetNmv(start, end);
  const kpiTargetNmvPrevRaw = scheduledTargetNmv(prevStart, prevEnd);
  const kpiTargetNmvCur = kpiTargetNmvCurRaw > 0 ? kpiTargetNmvCurRaw : null;
  const kpiTargetNmvPrev = kpiTargetNmvPrevRaw > 0 ? kpiTargetNmvPrevRaw : null;

  const totalGmvPrev = completedPrevPeriod.reduce((sum, s) => sum + (s.actualGmv || 0), 0);

  const pctOfTotal = (v: number, total: number) => (total > 0 ? (v / total) * 100 : null);

  // Bảng "Chi Tiết Theo Nguồn Doanh Thu" (14 dòng đúng brief: 4 nguồn không có dòng %
  // + 5 nguồn có kèm dòng "% trên Total GMV" thụt lề).
  const revenueSourceRows = useMemo(
    () => [
      { label: "Target GMV (Lịch Vận Hành)", cur: kpiTargetGmvCur, prev: kpiTargetGmvPrev, pct: false },
      { label: "Target NMV (Lịch Vận Hành)", cur: kpiTargetNmvCur, prev: kpiTargetNmvPrev, pct: false },
      { label: "Total GMV", cur: totalGmvCur, prev: totalGmvPrev, pct: false },
      { label: "Total NMV", cur: totalNmvCur, prev: totalNmvPrev, pct: false },
      { label: "Live + Affiliate GMV", cur: liveAffCur, prev: liveAffPrev, pct: true },
      { label: "Live GMV", cur: liveGmvCur, prev: liveGmvPrev, pct: true },
      { label: "Affiliate GMV", cur: affiliateGmvCur, prev: affiliateGmvPrev, pct: true },
      { label: "Video GMV", cur: videoGmvCur, prev: videoGmvPrev, pct: true },
      { label: "Product Card GMV", cur: productCardGmvCur, prev: productCardGmvPrev, pct: true }
    ],
    [
      kpiTargetGmvCur,
      kpiTargetGmvPrev,
      kpiTargetNmvCur,
      kpiTargetNmvPrev,
      totalGmvCur,
      totalGmvPrev,
      totalNmvCur,
      totalNmvPrev,
      liveAffCur,
      liveAffPrev,
      liveGmvCur,
      liveGmvPrev,
      affiliateGmvCur,
      affiliateGmvPrev,
      videoGmvCur,
      videoGmvPrev,
      productCardGmvCur,
      productCardGmvPrev
    ]
  );

  const gmvCompositionDonutData = useMemo(
    () => [
      { label: "Live", value: liveGmvCur, color: PAL.gold },
      { label: "Affiliate", value: affiliateGmvCur, color: PAL.green },
      { label: "Video", value: videoGmvCur, color: PAL.blue },
      { label: "Product Card", value: productCardGmvCur, color: `${PAL.cream}80` }
    ],
    [liveGmvCur, affiliateGmvCur, videoGmvCur, productCardGmvCur]
  );
  const gmvCompositionTotal = gmvCompositionDonutData.reduce((sum, d) => sum + d.value, 0);

  // "Diễn Biến GMV Theo Ngày" (brief Module 2) — 2 line: gmv_live_session (fill gold) + gmv_indirect
  // (dashed blue), cả 2 từ File 1. Giữ thêm GPM (đã build trước đó, không có trong brief nhưng vẫn
  // hữu ích) làm line thứ 3 trên trục phải thay vì bỏ hẳn công đã làm.
  const dailyChartData = useMemo(
    () =>
      (dailyPerf?.daily ?? []).map((d) => ({
        label: d.date.slice(8, 10) + "/" + d.date.slice(5, 7),
        gmvLiveSession: d.gmvLiveSession,
        gmvIndirect: d.gmvIndirect,
        gpm: d.gpm
      })),
    [dailyPerf]
  );

  // Bảng "Chi Tiết Theo Khung Camp" (brief Module 2) — Target loại B (nhập tay) + Actual từ File 1
  // (dailyGmvByBucket) + giờ live/GMV per giờ/CTR/CTOR từ File 3 (campBuckets, đã dùng xuyên suốt
  // Tab 02). Daily không có Target riêng (brief chỉ định Target cho 3 khung D-Day/Mid-Month/Pay-Day).
  const campTargetByBucket: Record<CampDayBucket, number | null> = {
    dday: monthlyReportRow?.campDdayTargetGmv ?? null,
    midmonth: monthlyReportRow?.campMidmonthTargetGmv ?? null,
    payday: monthlyReportRow?.campPaydayTargetGmv ?? null,
    daily: null
  };
  const campDetailRows = useMemo(
    () =>
      CAMP_DAY_BUCKET_ORDER.map((b) => {
        const agg = aggregateCreatorLivePerfRows(campBuckets[b]);
        return {
          key: b,
          label: CAMP_DAY_BUCKET_LABEL[b],
          target: campTargetByBucket[b],
          actual: dailyGmvByBucket[b],
          hours: agg.hours,
          gmvPerHour: agg.gmvPerHour,
          ctr: agg.ctr,
          ctor: agg.ctor
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campBuckets, dailyGmvByBucket, monthlyReportRow]
  );
  const campTargetVsActualData = useMemo(
    () =>
      campDetailRows
        .filter((r) => r.key !== "daily")
        .map((r) => ({ label: CAMP_DAY_BUCKET_LABEL[r.key].split(" ")[0], target: r.target ?? 0, actual: r.actual })),
    [campDetailRows]
  );

  const skuChartData = useMemo(() => (topSku?.items ?? []).slice(0, 8).map((s) => ({ label: s.name.slice(0, 24), gmv: s.gmv })), [topSku]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: PAL.bg, border: `1px solid ${PAL.line}` }}>
      <div className="flex gap-1 px-4 pt-3 overflow-x-auto" style={{ borderBottom: `1px solid ${PAL.line}` }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap border-b-2 transition-colors"
            style={{
              color: tab === t.id ? PAL.gold : PAL.muted,
              borderColor: tab === t.id ? PAL.gold : "transparent"
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: PAL.muted }}>
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tổng hợp Report Tháng từ Dữ Liệu Gốc...
          </div>
        ) : errorMsg ? (
          <div className="p-4 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
            {errorMsg}
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <div className="space-y-4">
                {runRate && runRate.doneCount > 0 && (
                  <div className="rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>Target kế hoạch</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(runRate.targetTotal)}</div>
                      <div className="text-[10px]" style={{ color: PAL.muted }}>{runRate.doneCount} ca xong · {runRate.pendingCount} còn lại</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>Đã đạt</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.green }}>{formatCurrencyAdaptive(runRate.actualDone)}</div>
                      <div className="text-[10px]" style={{ color: PAL.muted }}>{runRate.targetTotal > 0 ? `${((runRate.actualDone / runRate.targetTotal) * 100).toFixed(0)}% target` : ""}</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>Run-rate</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: runRate.runRate === null ? PAL.muted : runRate.runRate >= 1 ? PAL.green : runRate.runRate >= 0.9 ? PAL.gold : PAL.red }}>
                        {runRate.runRate === null ? "—" : `${(runRate.runRate * 100).toFixed(0)}%`}
                      </div>
                      <div className="text-[10px]" style={{ color: PAL.muted }}>thực tế ÷ target ca đã xong</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>Dự kiến cuối tháng</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: PAL.cream }}>{formatCurrencyAdaptive(runRate.projected)}</div>
                      <div className="text-[10px]" style={{ color: PAL.muted }}>còn lại = target × run-rate</div>
                    </div>
                    <div>
                      <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>{runRate.gap > 0 ? "Thiếu" : "Vượt"}</div>
                      <div className="font-mono text-lg font-bold mt-1" style={{ color: runRate.gap > 0 ? PAL.red : PAL.green }}>{formatCurrencyAdaptive(Math.abs(runRate.gap))}</div>
                      <div className="text-[10px]" style={{ color: PAL.muted }}>{runRate.targetTotal > 0 ? `${((Math.abs(runRate.gap) / runRate.targetTotal) * 100).toFixed(1)}% target` : ""}</div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                      Total GMV
                    </div>
                    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                      {formatCurrencyAdaptive(totalGmvCur)}
                    </div>
                    <div className="text-[11px] mt-1">
                      <MomBadge current={totalGmvCur} previous={totalGmvPrev} />
                    </div>
                    <ProgressBar pct={pctOfTotal(totalGmvCur, kpiTargetGmvCur ?? 0)} />
                  </div>
                  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                      Total NMV
                    </div>
                    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                      {formatCurrencyAdaptive(totalNmvCur)}
                    </div>
                    <div className="text-[11px] mt-1">
                      <MomBadge current={totalNmvCur} previous={totalNmvPrev} />
                    </div>
                    <ProgressBar pct={pctOfTotal(totalNmvCur, kpiTargetNmvCur ?? 0)} />
                    <div className="text-[9.5px] mt-1.5 italic" style={{ color: PAL.muted }}>
                      {hasReturnRateConfig
                        ? "* Dự kiến theo tỷ lệ hoàn hủy Rate Card, không phải số thực tế nghiệm thu."
                        : "* Chưa cấu hình tỷ lệ hoàn hủy ở Rate Card — số này = Total GMV."}
                    </div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                      Live + Affiliate GMV
                    </div>
                    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                      {formatCurrencyAdaptive(liveAffCur)}
                    </div>
                    <div className="text-[11px] mt-1">
                      <MomBadge current={liveAffCur} previous={liveAffPrev} />
                    </div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                    <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                      Affiliate GMV
                    </div>
                    <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                      {formatCurrencyAdaptive(affiliateGmvCur)}
                    </div>
                    <div className="text-[11px] mt-1">
                      <MomBadge current={affiliateGmvCur} previous={affiliateGmvPrev} />
                    </div>
                    <div className="text-[9.5px] mt-1.5 italic" style={{ color: PAL.muted }}>
                      * Tổng Direct GMV nhập tay ở Tab 04, không phải số TikTok tách kênh chính thức.
                    </div>
                  </div>
                </div>

                <Panel
                  title="Target vs Thực Đạt GMV — 4 tháng gần nhất"
                  icon={<BarChart3 className="w-4 h-4" />}
                  sub="Target: tổng target GMV đã lên lịch (Lịch Vận Hành) · Actual: Total GMV thực tế"
                >
                  <div style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={trend}>
                        <CartesianGrid stroke={PAL.line} vertical={false} />
                        <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                        <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                        <Bar dataKey="kpiTarget" name="Target (Lịch Vận Hành)" fill={`${PAL.gold}33`} radius={[4, 4, 0, 0]} />
                        <Bar dataKey="actual" name="Actual" fill={PAL.gold} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Panel
                    title="Chi Tiết Theo Nguồn Doanh Thu"
                    icon={<ListOrdered className="w-4 h-4" />}
                    sub={`So kỳ với ${prevMonth} · % tính trên Total GMV`}
                  >
                    <ReportTable head={["Nguồn", prevMonth, "Tháng Này", "MoM"]}>
                      {revenueSourceRows.map((r) => (
                        <React.Fragment key={r.label}>
                          <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                            <td className="py-2 px-3 font-semibold" style={{ color: PAL.cream }}>
                              {r.label}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {r.prev == null ? "—" : formatCurrencyAdaptive(r.prev)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {r.cur == null ? "—" : formatCurrencyAdaptive(r.cur)}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <MomBadge current={r.cur ?? 0} previous={r.prev ?? 0} />
                            </td>
                          </tr>
                          {r.pct && (
                            <tr style={{ borderBottom: `1px solid ${PAL.line}`, background: `${PAL.panel2}55` }}>
                              <td className="py-1.5 px-3 pl-6 text-[10.5px] italic" style={{ color: PAL.muted }}>
                                — % trên Total GMV
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono text-[10.5px]" style={{ color: PAL.muted }}>
                                {fmtPct(pctOfTotal(r.prev ?? 0, totalGmvPrev))}
                              </td>
                              <td className="py-1.5 px-3 text-right font-mono text-[10.5px]" style={{ color: PAL.muted }}>
                                {fmtPct(pctOfTotal(r.cur ?? 0, totalGmvCur))}
                              </td>
                              <td className="py-1.5 px-3" />
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </ReportTable>
                  </Panel>

                  <Panel title="Cơ Cấu GMV Theo Nguồn" icon={<PieChartIcon className="w-4 h-4" />} sub="Tháng hiện tại — Live/Affiliate/Video/Product card">
                    {gmvCompositionTotal <= 0 ? (
                      <p className="text-sm text-center py-10" style={{ color: PAL.muted }}>
                        Chưa đủ dữ liệu để tính cơ cấu GMV tháng này.
                      </p>
                    ) : (
                      <div style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={gmvCompositionDonutData} dataKey="value" nameKey="label" innerRadius={62} outerRadius={92} paddingAngle={2}>
                              {gmvCompositionDonutData.map((d) => (
                                <Cell key={d.label} fill={d.color} />
                              ))}
                            </Pie>
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 justify-center">
                      {gmvCompositionDonutData.map((d) => (
                        <div key={d.label} className="flex items-center gap-1.5 text-[11px]" style={{ color: PAL.muted }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          {d.label} · {fmtPct(pctOfTotal(d.value, gmvCompositionTotal))}
                        </div>
                      ))}
                    </div>
                  </Panel>
                </div>
              </div>
            )}

            {tab === "livestream" && (
              <div className="space-y-4">
                {!liveCurrent?.hasAnyBatch ? (
                  <Panel title="Livestream Channel" icon={<Radio className="w-4 h-4" />} sub="TikTok Creator Live Performance">
                    <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                      Tháng này chưa có ca nào có số liệu (trợ live up file vào ca / đối soát / nạp bù) và cũng chưa có file "Creator-Live-Performance" ở Dữ Liệu Gốc.
                    </p>
                  </Panel>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-[11px] rounded-xl px-2.5 py-2" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.muted }}>
                      <span className="uppercase tracking-wider text-[10px] font-bold" style={{ color: PAL.cream }}>Nguồn số</span>
                      {liveSource.source === "sessions" ? (
                        <span>
                          {liveSource.sessionCount} ca có số — {liveSource.reconciled} đã đối soát
                          {liveSource.snapshot > 0 ? `, ${liveSource.snapshot} số lúc giao ca` : ""}
                          {liveSource.manual > 0 ? `, ${liveSource.manual} tự khai` : ""}
                          {dailyPerfRaw?.hasAnyBatch ? " · diễn biến ngày từ file Live Performance Core Stats" : ""}
                        </span>
                      ) : (
                        <span>file Creator-Live-Performance ở Dữ Liệu Gốc (tháng này chưa có ca nào có số)</span>
                      )}
                    </div>
                    {(liveCurrent.missingDays.length > 0 || (dailyPerf?.missingDays.length ?? 0) > 0) && (
                      <div
                        className="flex items-start gap-2 text-[11px] rounded-xl p-2.5"
                        style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        Còn thiếu batch Dữ Liệu Gốc cho một số ngày trong tháng — số liệu bên dưới chỉ tính trên phần đã import.
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                        <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                          Actual GMV Livestream
                        </div>
                        <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                          {formatCurrencyAdaptive(currentAgg.gmv)}
                        </div>
                        <div className="text-[11px] mt-1">
                          <MomBadge current={currentAgg.gmv} previous={prevAgg.gmv} />
                        </div>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                        <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                          GMV / Giờ
                        </div>
                        <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                          {formatCurrencyAdaptive(currentAgg.gmvPerHour ?? 0)}
                        </div>
                        <div className="text-[11px] mt-1">
                          <MomBadge current={currentAgg.gmvPerHour ?? 0} previous={prevAgg.gmvPerHour ?? 0} />
                        </div>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                        <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                          Số Giờ Live
                        </div>
                        <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                          {fmtHours(currentAgg.hours)}
                        </div>
                        <div className="text-[11px] mt-1">
                          <MomBadge current={currentAgg.hours} previous={prevAgg.hours} />
                        </div>
                      </div>
                      <div className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                        <div className="text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                          CTOR
                        </div>
                        <div className="font-mono text-xl font-bold mt-1.5" style={{ color: PAL.cream }}>
                          {fmtPct(currentAgg.ctor)}
                        </div>
                        <div className="text-[11px] mt-1">
                          <MomBadge current={currentAgg.ctor ?? 0} previous={prevAgg.ctor ?? 0} />
                        </div>
                      </div>
                    </div>

                    <Panel title="GMV/Giờ & Số Giờ Live" icon={<BarChart3 className="w-4 h-4" />} sub="4 tháng gần nhất — Nguồn: Creator Live Performance">
                      <div style={{ height: 240 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={gmvHourTrend}>
                            <CartesianGrid stroke={PAL.line} vertical={false} />
                            <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                            <YAxis yAxisId="gmvHour" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                            <YAxis yAxisId="hours" orientation="right" stroke={PAL.blue} fontSize={10} tickFormatter={(v) => fmtHours(v)} width={60} />
                            <Tooltip contentStyle={chartTooltipStyle} />
                            <Bar yAxisId="gmvHour" dataKey="gmvPerHour" name="GMV/Giờ" fill={PAL.gold} radius={[3, 3, 0, 0]} />
                            <Line yAxisId="hours" type="monotone" dataKey="hours" name="Số Giờ Live" stroke={PAL.blue} strokeWidth={2} dot={{ r: 3 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>

                    <Panel title="MoM Key Metrics" icon={<BarChart3 className="w-4 h-4" />} sub={`So kỳ với ${prevMonth}`}>
                      <ReportTable head={["Chỉ Số", prevMonth, "Tháng Này"]}>
                        {(
                          [
                            ["GMV Thực Đạt (Live)", (a: CreatorLivePerfAgg) => formatCurrencyAdaptive(a.gmv)],
                            ["Số Phiên Live", (a: CreatorLivePerfAgg) => fmtInt(a.sessionCount)],
                            ["Sản Phẩm Bán Ra", (a: CreatorLivePerfAgg) => fmtInt(a.itemsSold)],
                            ["Đơn Hàng", (a: CreatorLivePerfAgg) => fmtInt(a.orders)],
                            ["Giờ Live", (a: CreatorLivePerfAgg) => fmtHours(a.hours)],
                            ["GMV / Giờ", (a: CreatorLivePerfAgg) => formatCurrencyAdaptive(a.gmvPerHour ?? 0)],
                            ["CTR", (a: CreatorLivePerfAgg) => fmtPct(a.ctr)],
                            ["CTOR", (a: CreatorLivePerfAgg) => fmtPct(a.ctor)]
                          ] as [string, (a: CreatorLivePerfAgg) => string][]
                        ).map(([label, get], idx) => (
                          <tr key={label} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-semibold" style={{ color: PAL.cream }}>
                              {label}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {get(prevAgg)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {get(currentAgg)}
                            </td>
                          </tr>
                        ))}
                      </ReportTable>
                    </Panel>

                    {dailyPerf?.hasAnyBatch && dailyChartData.length > 0 && (
                      <Panel title="Diễn Biến GMV Theo Ngày" icon={<BarChart3 className="w-4 h-4" />} sub="Nguồn: Live Performance Core Stats">
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={dailyChartData}>
                              <CartesianGrid stroke={PAL.line} vertical={false} />
                              <XAxis dataKey="label" stroke={PAL.muted} fontSize={10} interval={2} />
                              <YAxis yAxisId="gmv" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                              <YAxis yAxisId="gpm" orientation="right" stroke={PAL.green} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                              <Area
                                yAxisId="gmv"
                                type="monotone"
                                dataKey="gmvLiveSession"
                                name="GMV Buổi LIVE"
                                stroke={PAL.gold}
                                fill={`${PAL.gold}33`}
                                strokeWidth={2}
                              />
                              <Line
                                yAxisId="gmv"
                                type="monotone"
                                dataKey="gmvIndirect"
                                name="GMV Gián Tiếp"
                                stroke={PAL.blue}
                                strokeWidth={2}
                                strokeDasharray="4 3"
                                dot={false}
                              />
                              <Line yAxisId="gpm" type="monotone" dataKey="gpm" name="GPM" stroke={PAL.green} strokeWidth={1.5} dot={false} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </Panel>
                    )}

                    <Panel
                      title="Khung Chiến Dịch (D-Day / Mid-Month / Pay-Day)"
                      icon={<Flame className="w-4 h-4" />}
                      sub="Target loại B — Actual: SUM(GMV Buổi LIVE) từ Live Performance Core Stats"
                    >
                      {canManage && (
                        <div className="mb-4 space-y-2.5 pb-4" style={{ borderBottom: `1px solid ${PAL.line}` }}>
                          {(
                            [
                              ["D-Day", campDdayStartInput, setCampDdayStartInput, campDdayEndInput, setCampDdayEndInput, campDdayTargetInput, setCampDdayTargetInput],
                              [
                                "Mid-Month",
                                campMidmonthStartInput,
                                setCampMidmonthStartInput,
                                campMidmonthEndInput,
                                setCampMidmonthEndInput,
                                campMidmonthTargetInput,
                                setCampMidmonthTargetInput
                              ],
                              [
                                "Pay-Day",
                                campPaydayStartInput,
                                setCampPaydayStartInput,
                                campPaydayEndInput,
                                setCampPaydayEndInput,
                                campPaydayTargetInput,
                                setCampPaydayTargetInput
                              ]
                            ] as [string, string, (v: string) => void, string, (v: string) => void, string, (v: string) => void][]
                          ).map(([label, startVal, setStart, endVal, setEnd, targetVal, setTarget]) => (
                            <div key={label} className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                              <span className="text-xs font-bold" style={{ color: PAL.cream }}>
                                {label}
                              </span>
                              <input
                                type="date"
                                value={startVal}
                                onChange={(e) => setStart(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                              <input
                                type="date"
                                value={endVal}
                                onChange={(e) => setEnd(e.target.value)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                              <input
                                type="number"
                                value={targetVal}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder="Target GMV"
                                className="px-2.5 py-1.5 rounded-lg text-xs font-mono"
                                style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                            </div>
                          ))}
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={handleSaveCampConfig}
                              disabled={campSaving}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold"
                              style={{ background: PAL.gold, color: "#1a1500" }}
                            >
                              {campSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Lưu Khung Camp
                            </button>
                            {campErrorMsg && (
                              <span className="text-xs font-semibold" style={{ color: PAL.red }}>
                                {campErrorMsg}
                              </span>
                            )}
                            <span className="text-[10.5px] italic" style={{ color: PAL.muted }}>
                              Để trống thì dùng khung mặc định (Mid-Month 13-15, Pay-Day 23-25, D-Day theo ngày trùng lặp gần nhất). Đã nhập camp nào thì camp đó chỉ tính đúng khoảng nhập — khung mặc định của camp đó không còn áp dụng.
                            </span>
                          </div>
                        </div>
                      )}
                      <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={campTargetVsActualData}>
                            <CartesianGrid stroke={PAL.line} vertical={false} />
                            <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                            <YAxis stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                            <Bar dataKey="target" name="Target" fill={`${PAL.gold}2e`} stroke={PAL.gold} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="actual" name="Actual" fill={PAL.gold} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <ReportTable head={["Khung", "Target GMV", "Actual GMV", "Giờ Live", "GMV/Giờ", "CTR", "CTOR"]}>
                        {campDetailRows.map((r, idx) => (
                          <tr key={r.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                              {r.label}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {r.target != null ? formatCurrencyAdaptive(r.target) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {formatCurrencyAdaptive(r.actual)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtHours(r.hours)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {r.gmvPerHour != null ? formatCurrencyAdaptive(r.gmvPerHour) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(r.ctr)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(r.ctor)}
                            </td>
                          </tr>
                        ))}
                      </ReportTable>
                    </Panel>


                    <Panel title="Phễu Chuyển Đổi" icon={<Filter className="w-4 h-4" />} sub="Live Impressions → Views → Product Views → Clicks → Orders">
                      <div style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={funnelStages} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid stroke={PAL.line} horizontal={false} />
                            <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => fmtInt(v)} />
                            <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={10} width={90} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => fmtInt(chartNum(v))} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {funnelStages.map((_, i) => (
                                <Cell key={i} fill={[PAL.gold, PAL.goldDim, `${PAL.gold}88`, PAL.blue, PAL.green][i] ?? PAL.gold} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Panel>

                    <Panel title="Top 10 Phiên Live Hiệu Suất Cao Nhất" icon={<ListOrdered className="w-4 h-4" />} sub="Nguồn: Creator Live Performance">
                      <ReportTable head={["#", "Bắt Đầu", "Thời Lượng", "GMV", "GMV/Giờ", "Đơn Hàng", "SP Bán", "Views", "CTR", "CTOR"]}>
                        {topSessions.map((s, idx) => (
                          <tr key={s.roomId ?? idx} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3 font-mono" style={{ color: PAL.cream }}>
                              {fmtSessionStart(s.startTime)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtHours(s.hours)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {formatCurrencyAdaptive(s.gmv)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {formatCurrencyAdaptive(s.gmvPerHour)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.orders)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.itemsSold)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.views)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(s.ctr)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtPct(s.ctor)}
                            </td>
                          </tr>
                        ))}
                        {topSessions.length === 0 && (
                          <tr>
                            <td colSpan={10} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                              Chưa có phiên live nào trong tháng.
                            </td>
                          </tr>
                        )}
                      </ReportTable>
                    </Panel>
                  </>
                )}

                {/* Audit Module 3 (2026-09-18): 2 panel Host nằm NGOÀI điều kiện "đã có file
                    Creator-Live-Performance trong Dataraw" — chúng tính từ session nội bộ, không
                    dính gì tới file đó. Trước đây chưa up file Dataraw tháng nào là toàn bộ tab
                    Livestream trống, kể cả phần vốn có số. */}
                <Panel title="Host Performance" icon={<Users className="w-4 h-4" />} sub="GMV/giờ theo host — tổng hợp từ lịch vận hành nội bộ">
                  {/* Audit 2026-09-21: khung cao cố định 220px + YAxis interval mặc định khiến recharts
                      GIẤU bớt nhãn khi nhiều host (10 host → 5 nhãn), nhãn còn lại rơi lệch sang thanh
                      bên cạnh nên người đọc tưởng host hạng 2 mới là cao nhất. Cao theo số host +
                      interval={0} để mỗi thanh luôn có đúng nhãn của nó. */}
                  <div style={{ height: Math.max(220, hostChartData.length * 28 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hostChartData} layout="vertical" margin={{ left: 10 }}>
                        <CartesianGrid stroke={PAL.line} horizontal={false} />
                        <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} />
                        <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={11} width={110} interval={0} />
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                        <Bar dataKey="gmvHour" radius={[0, 4, 4, 0]}>
                          {hostChartData.map((_, i) => (
                            <Cell key={i} fill={i === 0 ? PAL.gold : `${PAL.gold}55`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel title="Bảng Chi Tiết Host" icon={<Users className="w-4 h-4" />} sub="Cùng cách tính với tab Hiệu Suất Host của agency — giờ live thật khi có file, ca không có số không tính">
                  {hostQuality.reconciled < hostQuality.total && (
                    <div
                      className="flex items-start gap-2 text-[11px] rounded-xl p-2.5 mb-3"
                      style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {hostQuality.total} phiên: {hostQuality.reconciled} đã đối soát
                        {hostQuality.snapshot > 0 ? `, ${hostQuality.snapshot} số lúc giao ca (chờ đối soát cuối kỳ)` : ""}
                        {hostQuality.manual > 0 ? `, ${hostQuality.manual} talent tự khai (chưa có gì bảo chứng)` : ""}.
                        {" "}Đối soát ở "Vận Hành Live → Đối Soát Số Liệu" trước khi phát hành report.
                      </span>
                    </div>
                  )}
                  {unassignedHost && (
                    <div
                      className="flex items-start gap-2 text-[11px] rounded-xl p-2.5 mb-3"
                      style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        {unassignedHost.sessionCount} ca chưa gán host ({formatCurrencyAdaptive(unassignedHost.gmv)} ·{" "}
                        {unassignedHost.hours.toFixed(1)}h) không nằm trong bảng/biểu đồ này — gán host cho ca để số về đúng người.
                      </span>
                    </div>
                  )}
                  <ReportTable head={["Host", "Số Phiên", "GMV", "Giờ", "GMV/Giờ", "Đơn Hàng", "CTR"]}>
                    {hostPerformance.map((h, idx) => (
                      <tr key={h.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                        <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                          {h.hostName}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {h.sessionCount}
                          {h.quality.reconciled < h.sessionCount ? ` (${h.quality.reconciled} đã đối soát)` : ""}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                          {formatCurrencyAdaptive(h.gmv)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtHours(h.hours)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {h.gmvPerHour != null ? formatCurrencyAdaptive(h.gmvPerHour) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtInt(h.orders)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                          {fmtPct(h.ctr)}
                        </td>
                      </tr>
                    ))}
                    {hostPerformance.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                          Chưa có phiên TikTok nào có số liệu trong tháng.
                        </td>
                      </tr>
                    )}
                  </ReportTable>
                </Panel>
              </div>
            )}

            {tab === "products" && (
              <div className="space-y-4">
                {productCard?.hasAnyBatch && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Lượt Xem Thẻ SP" value={fmtInt(productCard.totals.views)} />
                    <KpiCard label="Lượt Nhấp" value={fmtInt(productCard.totals.clicks)} />
                    <KpiCard label="CTR Trung Bình" value={fmtPct(productCard.totals.ctr)} />
                    <KpiCard label="GMV Từ Thẻ Sản Phẩm" value={formatCurrencyAdaptive(productCard.totals.gmvCard)} />
                  </div>
                )}

                <Panel title="Top SKU Theo GMV" icon={<ShoppingBag className="w-4 h-4" />} sub="Nguồn: Product List">
                  {!topSku?.hasAnyBatch ? (
                    <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                      Chưa có file "Product List" nào được import trong Dữ Liệu Gốc cho tháng này.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <div style={{ height: 260 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={skuChartData} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid stroke={PAL.line} horizontal={false} />
                            <XAxis type="number" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} />
                            <YAxis type="category" dataKey="label" stroke={PAL.muted} fontSize={10} width={160} />
                            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => formatCurrencyAdaptive(chartNum(v))} />
                            <Bar dataKey="gmv" radius={[0, 4, 4, 0]}>
                              {skuChartData.map((_, i) => (
                                <Cell key={i} fill={i === 0 ? PAL.gold : `${PAL.gold}55`} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <ReportTable head={["#", "Sản Phẩm", "GMV", "GMV Live", "Đơn Hàng"]}>
                        {(topSku.items ?? []).map((s, idx) => (
                          <tr key={s.name} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                            <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                              {idx + 1}
                            </td>
                            <td className="py-2 px-3" style={{ color: PAL.cream }}>
                              {s.name}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                              {formatCurrencyAdaptive(s.gmv)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {formatCurrencyAdaptive(s.gmvLive)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                              {fmtInt(s.orders)}
                            </td>
                          </tr>
                        ))}
                      </ReportTable>
                    </div>
                  )}
                </Panel>

                <Panel title="Top Chương Trình Khuyến Mãi" icon={<Megaphone className="w-4 h-4" />} sub="Nguồn: Shop Promotion List">
                  {!topPromo?.hasAnyBatch ? (
                    <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                      Chưa có file "Shop Promotion List" nào được import trong Dữ Liệu Gốc cho tháng này.
                    </p>
                  ) : (
                    <ReportTable head={["#", "Chương Trình", "Trạng Thái", "GMV", "Đơn Hàng", "AOV"]}>
                      {(topPromo.items ?? []).map((p, idx) => (
                        <tr key={p.name + idx} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                          <td className="py-2 px-3 font-mono" style={{ color: PAL.gold }}>
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3" style={{ color: PAL.cream }}>
                            {p.name}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${promoStatusLabel(p.status).color}22`, color: promoStatusLabel(p.status).color }}
                            >
                              {promoStatusLabel(p.status).label}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                            {formatCurrencyAdaptive(p.gmv)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                            {fmtInt(p.orders)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                            {formatCurrencyAdaptive(p.aov)}
                          </td>
                        </tr>
                      ))}
                    </ReportTable>
                  )}
                </Panel>
              </div>
            )}

            {tab === "affiliate" && (
              <div className="space-y-4">
                <div
                  className="flex items-start gap-2 text-[11px] rounded-xl p-2.5"
                  style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Direct GMV/Sản Phẩm Bán/Giá TB/CTR/CTOR có thể nhập từ file "Affiliate — Creator List" (Dữ Liệu Gốc) bằng nút
                  bên dưới — chỉ lấy GMV video + product card, KHÔNG cộng GMV LIVE (đã tính ở Tab 02 Livestream, Room ID không
                  phân biệt được phiên Affiliate với phiên Live thường nên cộng vào đây sẽ đếm trùng). Target/Thời Lượng/Ads
                  Cost/Ngày Live vẫn luôn nhập tay — file này không có các số đó. Runrate/ROAS tự tính từ Direct GMV so với
                  Target/Ads Cost.
                </div>

                {affiliateLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: PAL.muted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải Affiliate...
                  </div>
                ) : (
                  <>
                    {affiliateErrorMsg && (
                      <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
                        {affiliateErrorMsg}
                      </div>
                    )}

                    {canManage && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={handleImportAffiliateFromDataraw}
                          disabled={creatorListImporting}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-60"
                          style={{ background: PAL.panel2, border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                        >
                          {creatorListImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />} Nhập Từ Dữ Liệu Gốc
                        </button>
                        {creatorListErrorMsg && (
                          <span className="text-xs font-semibold" style={{ color: PAL.red }}>
                            {creatorListErrorMsg}
                          </span>
                        )}
                      </div>
                    )}

                    <Panel title="Hiệu Suất Creator Affiliate" icon={<Handshake className="w-4 h-4" />} sub={`Tháng ${month} — nhập tay + nhập từ Dữ Liệu Gốc`}>
                      <div className="space-y-3">
                        {affiliateRows.map((a) => {
                          const roas = roasOf(a.directGmv, a.adsCost);
                          const runrate = runrateOf(a.directGmv, a.targetGmv);
                          const field = (
                            key: keyof AffiliateActualEntry,
                            label: string,
                            type: "text" | "number" = "number",
                            placeholder?: string
                          ) => (
                            <div>
                              <label className="text-[10.5px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                                {label}
                              </label>
                              <input
                                type={type}
                                value={(a[key] as string | number) ?? ""}
                                placeholder={placeholder}
                                onChange={(e) =>
                                  updateAffiliateRow(a._key, { [key]: type === "number" ? (e.target.value ? Number(e.target.value) : undefined) : e.target.value })
                                }
                                disabled={!canManage}
                                className="w-full p-2 rounded-lg text-xs font-mono disabled:opacity-60"
                                style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                              />
                            </div>
                          );
                          return (
                            <div key={a._key} className="rounded-xl p-4" style={{ background: PAL.panel2, border: `1px solid ${PAL.line}` }}>
                              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                                <input
                                  type="text"
                                  value={a.creatorName}
                                  placeholder="Tên creator"
                                  onChange={(e) => updateAffiliateRow(a._key, { creatorName: e.target.value })}
                                  disabled={!canManage}
                                  className="font-black text-sm bg-transparent border-none outline-none disabled:opacity-60"
                                  style={{ color: PAL.gold, minWidth: 140 }}
                                />
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: runrate != null && runrate >= 100 ? `${PAL.green}22` : `${PAL.red}22`, color: runrate != null && runrate >= 100 ? PAL.green : PAL.red }}
                                  >
                                    Runrate {runrate != null ? `${runrate.toFixed(2)}%` : "—"}
                                  </span>
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${PAL.blue}22`, color: PAL.blue }}>
                                    ROAS {fmtRoas(roas)}
                                  </span>
                                  {canManage && (
                                    <button onClick={() => removeAffiliateRow(a._key)} style={{ color: PAL.red }} title="Xoá creator">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {field("liveDateLabel", "Ngày Live", "text", "06-07/8")}
                                {field("targetGmv", "Target")}
                                {field("directGmv", "Direct GMV")}
                                {field("durationHours", "Thời Lượng (h)")}
                                {field("adsCost", "Ads Cost")}
                                {field("itemsSold", "Sản Phẩm Bán")}
                                {field("viewer", "Viewer")}
                                {field("avgPrice", "Giá TB")}
                                {field("ctr", "CTR (%)")}
                                {field("ctor", "CTOR (%)")}
                              </div>
                            </div>
                          );
                        })}
                        {affiliateRows.length === 0 && (
                          <p className="text-sm text-center py-6" style={{ color: PAL.muted }}>
                            Chưa có creator affiliate nào cho tháng {month}.
                          </p>
                        )}
                      </div>
                      {canManage && (
                        <button
                          onClick={addAffiliateRow}
                          className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm Creator
                        </button>
                      )}
                    </Panel>

                    {affiliateChartData.length > 0 && (
                      <Panel title="So Sánh Hiệu Suất Creator" icon={<BarChart3 className="w-4 h-4" />} sub="GMV/giờ vs Runrate">
                        <div style={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={affiliateChartData}>
                              <CartesianGrid stroke={PAL.line} vertical={false} />
                              <XAxis dataKey="label" stroke={PAL.muted} fontSize={11} />
                              <YAxis yAxisId="gmvHour" stroke={PAL.muted} fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={70} />
                              <YAxis yAxisId="runrate" orientation="right" stroke={PAL.green} fontSize={10} tickFormatter={(v) => `${v.toFixed(0)}%`} width={50} />
                              <Tooltip contentStyle={chartTooltipStyle} />
                              <Bar yAxisId="gmvHour" dataKey="gmvHour" name="GMV/giờ (đ)" fill={PAL.gold} radius={[3, 3, 0, 0]} />
                              <Line yAxisId="runrate" type="monotone" dataKey="runrate" name="Runrate (%)" stroke={PAL.green} strokeWidth={2} dot={{ r: 3 }} />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>
                      </Panel>
                    )}

                    {canManage && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleSaveAffiliate}
                          disabled={affiliateSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                          style={{ background: PAL.gold, color: "#1a1500" }}
                        >
                          <Save className="w-4 h-4" /> {affiliateSaving ? "Đang Lưu..." : "Lưu Affiliate"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "plan" && (
              <div className="space-y-4">
                <div
                  className="flex items-start gap-2 text-[11px] rounded-xl p-2.5"
                  style={{ background: "#2a2410", border: `1px solid ${PAL.gold}55`, color: PAL.gold }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Toàn bộ mục này là kế hoạch cho tháng {nextMonth} (chưa xảy ra) — nhập tay hoàn toàn, không đọc Dataraw/lịch
                  vận hành. % phân bổ đã điền sẵn theo tỷ trọng GMV thực đạt trung bình {suggestedPct.isFallback ? "(chưa có dữ liệu lịch sử, đang để mặc định chia đều 25%)" : "của 2 tháng gần nhất"} — sửa tự do trước khi lưu.
                </div>

                {planLoading ? (
                  <div className="flex items-center justify-center py-16 gap-2 text-sm" style={{ color: PAL.muted }}>
                    <Loader2 className="w-4 h-4 animate-spin" /> Đang tải Kế hoạch tháng sau...
                  </div>
                ) : (
                  <>
                    {planErrorMsg && (
                      <div className="p-3 rounded-xl text-xs font-semibold" style={{ background: "#2a1414", border: `1px solid ${PAL.red}55`, color: PAL.red }}>
                        {planErrorMsg}
                      </div>
                    )}

                    <Panel title={`Kế Hoạch Phân Bổ Target — Tháng ${nextMonth}`} icon={<CalendarClock className="w-4 h-4" />}>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div>
                          <label className="text-[10.5px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Target GMV Live Tổng
                          </label>
                          <input
                            type="number"
                            value={planTargetGmv}
                            onChange={(e) => setPlanTargetGmv(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                        <div>
                          <label className="text-[10.5px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Target NMV Tổng
                          </label>
                          <input
                            type="number"
                            value={planTargetNmv}
                            onChange={(e) => setPlanTargetNmv(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                        <div>
                          <label className="text-[10.5px] uppercase tracking-wider block mb-1" style={{ color: PAL.muted }}>
                            Tổng Giờ Live Kế Hoạch
                          </label>
                          <input
                            type="number"
                            value={planTargetHours}
                            onChange={(e) => setPlanTargetHours(e.target.value)}
                            disabled={!canManage}
                            className="w-full p-2.5 rounded-xl font-mono font-bold disabled:opacity-60"
                            style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div style={{ height: 240 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={planDonutData} dataKey="value" nameKey="label" innerRadius={55} outerRadius={90} paddingAngle={2}>
                                {planDonutData.map((d) => (
                                  <Cell key={d.label} fill={d.color} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => `${chartNum(v).toFixed(1)}%`} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <ReportTable head={["Khung", "Phân Bổ (%)", "Target GMV", "Giờ Live", "GMV/Giờ"]}>
                            {planBucketRows.map((b, idx) => {
                              const setter = { daily: setPctDaily, dday: setPctDday, payday: setPctPayday, midmonth: setPctMidmonth }[b.key]!;
                              const value = { daily: pctDaily, dday: pctDday, payday: pctPayday, midmonth: pctMidmonth }[b.key]!;
                              return (
                                <tr key={b.key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                                  <td className="py-2 px-3 font-semibold" style={{ color: PAL.gold }}>
                                    {b.label}
                                  </td>
                                  <td className="py-2 px-3 text-right">
                                    <input
                                      type="number"
                                      value={value}
                                      onChange={(e) => setter(e.target.value)}
                                      disabled={!canManage}
                                      className="w-16 text-right p-1 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono font-bold" style={{ color: PAL.cream }}>
                                    {formatCurrencyAdaptive(b.gmv)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                                    {fmtHours(b.hours)}
                                  </td>
                                  <td className="py-2 px-3 text-right font-mono" style={{ color: PAL.muted }}>
                                    {b.gmvPerHour != null ? formatCurrencyAdaptive(b.gmvPerHour) : "—"}
                                  </td>
                                </tr>
                              );
                            })}
                          </ReportTable>
                          <p className="text-[10.5px] mt-2 text-right" style={{ color: Math.abs(planPctTotal - 100) > 0.5 ? PAL.red : PAL.muted }}>
                            Tổng phân bổ: {planPctTotal.toFixed(1)}% {Math.abs(planPctTotal - 100) > 0.5 ? "(nên bằng 100%)" : ""}
                          </p>
                        </div>
                      </div>
                    </Panel>

                    <Panel title={`Kế Hoạch Affiliate — Tháng ${nextMonth}`} icon={<Handshake className="w-4 h-4" />}>
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs min-w-[760px]">
                          <thead>
                            <tr style={{ borderBottom: `1px solid ${PAL.line}` }}>
                              {["Lịch Live", "Creator", "Camp", "Timeline", "Duration", "Target GMV", "GMV/Giờ KV", "Budget Ads", ""].map((h) => (
                                <th key={h} className="py-2 px-2 text-left text-[10.5px] uppercase tracking-wider" style={{ color: PAL.muted }}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {planRows.map((r, idx) => (
                              <tr key={r._key} style={{ borderBottom: `1px solid ${PAL.line}`, background: idx % 2 ? `${PAL.panel2}55` : "transparent" }}>
                                {(
                                  [
                                    ["scheduleLabel", "text", "6-7.8"],
                                    ["creatorName", "text", "Tên creator"],
                                    ["campTag", "text", "D-Day"],
                                    ["timelineLabel", "text", "19h - 9h"]
                                  ] as [keyof AffiliatePlanEntry, string, string][]
                                ).map(([field, type, placeholder]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type={type}
                                      value={(r[field] as string) ?? ""}
                                      placeholder={placeholder}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value })}
                                      disabled={!canManage}
                                      className="w-full p-1.5 rounded font-medium disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                {(
                                  [
                                    ["durationHours", "h"],
                                    ["targetGmv", "đ"]
                                  ] as [keyof AffiliatePlanEntry, string][]
                                ).map(([field]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type="number"
                                      value={(r[field] as number) ?? ""}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value ? Number(e.target.value) : undefined })}
                                      disabled={!canManage}
                                      className="w-24 text-right p-1.5 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                <td className="py-1.5 px-2 text-right font-mono" style={{ color: PAL.muted }}>
                                  {r.targetGmv && r.durationHours ? formatCurrencyAdaptive(r.targetGmv / r.durationHours) : "—"}
                                </td>
                                {(
                                  [["budgetAds", "đ"]] as [keyof AffiliatePlanEntry, string][]
                                ).map(([field]) => (
                                  <td key={field} className="py-1.5 px-2">
                                    <input
                                      type="number"
                                      value={(r[field] as number) ?? ""}
                                      onChange={(e) => updatePlanRow(r._key, { [field]: e.target.value ? Number(e.target.value) : undefined })}
                                      disabled={!canManage}
                                      className="w-24 text-right p-1.5 rounded font-mono disabled:opacity-60"
                                      style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.cream }}
                                    />
                                  </td>
                                ))}
                                <td className="py-1.5 px-2">
                                  {canManage && (
                                    <button onClick={() => removePlanRow(r._key)} style={{ color: PAL.red }} title="Xoá dòng">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {planRows.length === 0 && (
                              <tr>
                                <td colSpan={9} className="py-6 text-center italic" style={{ color: PAL.muted }}>
                                  Chưa có kế hoạch Affiliate nào cho tháng {nextMonth}.
                                </td>
                              </tr>
                            )}
                          </tbody>
                          {planRows.length > 0 && (
                            <tfoot>
                              <tr style={{ borderTop: `1px solid ${PAL.line}` }}>
                                <td colSpan={5} className="py-2 px-2 font-bold text-right" style={{ color: PAL.cream }}>
                                  Tổng target tháng {nextMonth}
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: PAL.gold }}>
                                  {formatCurrencyAdaptive(planAffiliateTotals.targetGmv)}
                                </td>
                                <td />
                                <td className="py-2 px-2 text-right font-mono font-bold" style={{ color: PAL.gold }}>
                                  {formatCurrencyAdaptive(planAffiliateTotals.budgetAds)}
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {canManage && (
                        <button
                          onClick={addPlanRow}
                          className="mt-3 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg"
                          style={{ background: PAL.panel2, border: `1px solid ${PAL.line}`, color: PAL.gold }}
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm Dòng
                        </button>
                      )}
                    </Panel>

                    {canManage && (
                      <div className="flex justify-end">
                        <button
                          onClick={handleSavePlan}
                          disabled={planSaving}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm disabled:opacity-60"
                          style={{ background: PAL.gold, color: "#1a1500" }}
                        >
                          <Save className="w-4 h-4" /> {planSaving ? "Đang Lưu..." : "Lưu Kế Hoạch Tháng Sau"}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
