import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Filter,
  DollarSign,
  Radio,
  ShoppingBag,
  Users,
  Eye,
  Clock,
  Sparkles,
  Layers,
  Building2,
  ArrowUpRight,
  ArrowDownRight,
  Download,
  Info,
  CheckCircle2,
  BarChart2,
  LineChart
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";
import { Brand, Studio, LiveSession } from "../types";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";

export interface KpiComparisonProps {
  brands?: Brand[];
  studios?: Studio[];
  sessions?: LiveSession[];
  /** Chi phí thật của từng session (hostPayout + studioCost + adsCost, xem lib/pnl.ts) — chỉ có ở
   * ngữ cảnh Agency (Dashboards.tsx tự tính bằng computeSessionPnl). Không truyền = không có cách
   * nào tính ROAS thật, thẻ "Lợi Nhuận & ROAS" tự ẩn thay vì bịa số (audit L1). */
  costBySessionId?: Record<string, number>;
  /** Ẩn nhóm chỉ số "Lợi Nhuận & ROAS" (margin nội bộ agency) — dùng khi hiển thị trong Brand
   * Workspace, cùng ý nghĩa với hideCommission ở GmvGrowthTrendline. */
  hideCommission?: boolean;
}

type TimePeriodOption = "this_week_vs_last_week" | "this_month_vs_last_month" | "this_quarter_vs_last_quarter";

interface MetricComparisonItem {
  id: string;
  name: string;
  category: "revenue" | "livestream" | "roi";
  currentValue: number;
  previousValue: number;
  unit: string;
  format: "currency" | "number" | "percentage" | "duration";
  // FIX L1: optional — chỉ gmv (khi có targetGmv thật trong kỳ) mới có target thật, còn lại
  // undefined thay vì bịa currentValue×1.1 (xem currentMetrics).
  target?: number;
  description: string;
}

// Static shell (labels, format, category) reused for both current and previous period —
// numeric fields below are placeholders overwritten by real session data in `currentMetrics`.
const COMPARISON_METRICS: Record<TimePeriodOption, MetricComparisonItem[]> = {
  this_week_vs_last_week: [
    {
      id: "gmv",
      name: "Doanh Thu GMV",
      category: "revenue",
      currentValue: 5370000000,
      previousValue: 4180000000,
      unit: "VNĐ",
      format: "currency",
      target: 5000000000,
      description: "Tổng tổng doanh thu khởi tạo từ 18 phiên livestream"
    },
    {
      id: "orders",
      name: "Tổng Đơn Hàng Thành Công",
      category: "revenue",
      currentValue: 18450,
      previousValue: 14200,
      unit: "đơn",
      format: "number",
      target: 16000,
      description: "Đơn hàng thanh toán thành công trong phiên live"
    },
    {
      id: "aov",
      name: "Giá Trị Trung Bình Đơn (AOV)",
      category: "revenue",
      currentValue: 291000,
      previousValue: 294000,
      unit: "VNĐ",
      format: "currency",
      target: 280000,
      description: "Giá trị giỏ hàng trung bình trên mỗi khách chốt đơn"
    },
    {
      id: "live_sessions",
      name: "Số Phiên Livestream",
      category: "livestream",
      currentValue: 18,
      previousValue: 15,
      unit: "phiên",
      format: "number",
      target: 16,
      description: "Phiên phát sóng thực tế tại 3 phòng Studio"
    },
    {
      id: "cvr",
      name: "Tỷ Lệ Chuyển Đổi (CVR)",
      category: "livestream",
      currentValue: 5.4,
      previousValue: 4.3,
      unit: "%",
      format: "percentage",
      target: 4.8,
      description: "Tỷ lệ khách nhấp vào giỏ hàng và hoàn tất đặt hàng"
    },
    {
      id: "peak_ccu",
      name: "Mắt Xem Cao Nhất (Peak CCU)",
      category: "livestream",
      currentValue: 12800,
      previousValue: 9400,
      unit: "mắt",
      format: "number",
      target: 10000,
      description: "Lượng người xem đồng thời cao nhất vào khung giờ vàng"
    },
    {
      id: "avg_duration",
      name: "Thời Gian Xem Trung Bình",
      category: "livestream",
      currentValue: 3.8,
      previousValue: 3.1,
      unit: "phút",
      format: "duration",
      target: 3.5,
      description: "Thời gian người xem ở lại phiên livestream trước khi rời"
    },
    {
      id: "roas",
      name: "Tỷ Lệ ROI / ROAS Agency",
      category: "roi",
      currentValue: 6.8,
      previousValue: 5.9,
      unit: "x",
      format: "number",
      target: 6.0,
      description: "Bội số doanh thu GMV trên chi phí dịch vụ livestream"
    }
  ],
  this_month_vs_last_month: [
    {
      id: "gmv",
      name: "Doanh Thu GMV",
      category: "revenue",
      currentValue: 21800000000,
      previousValue: 17200000000,
      unit: "VNĐ",
      format: "currency",
      target: 20000000000,
      description: "Tổng doanh thu lũy kế tháng hiện tại"
    },
    {
      id: "orders",
      name: "Tổng Đơn Hàng Thành Công",
      category: "revenue",
      currentValue: 74200,
      previousValue: 59100,
      unit: "đơn",
      format: "number",
      target: 68000,
      description: "Số đơn hàng hoàn tất tháng này"
    },
    {
      id: "aov",
      name: "Giá Trị Trung Bình Đơn (AOV)",
      category: "revenue",
      currentValue: 293800,
      previousValue: 291000,
      unit: "VNĐ",
      format: "currency",
      target: 285000,
      description: "AOV trung bình toàn bộ chiến dịch tháng"
    },
    {
      id: "live_sessions",
      name: "Số Phiên Livestream",
      category: "livestream",
      currentValue: 72,
      previousValue: 62,
      unit: "phiên",
      format: "number",
      target: 65,
      description: "Số ca livestream đã triển khai"
    },
    {
      id: "cvr",
      name: "Tỷ Lệ Chuyển Đổi (CVR)",
      category: "livestream",
      currentValue: 5.2,
      previousValue: 4.1,
      unit: "%",
      format: "percentage",
      target: 4.5,
      description: "CVR trung bình cả tháng"
    },
    {
      id: "peak_ccu",
      name: "Mắt Xem Cao Nhất (Peak CCU)",
      category: "livestream",
      currentValue: 15400,
      previousValue: 11200,
      unit: "mắt",
      format: "number",
      target: 12000,
      description: "Peak CCU ghi nhận ở chiến dịch Mega Sale"
    },
    {
      id: "avg_duration",
      name: "Thời Gian Xem Trung Bình",
      category: "livestream",
      currentValue: 3.6,
      previousValue: 3.0,
      unit: "phút",
      format: "duration",
      target: 3.2,
      description: "Trung bình thời gian giữ chân khán giả"
    },
    {
      id: "roas",
      name: "Tỷ Lệ ROI / ROAS Agency",
      category: "roi",
      currentValue: 6.9,
      previousValue: 5.7,
      unit: "x",
      format: "number",
      target: 6.0,
      description: "Hiệu quả ROI tháng hiện tại"
    }
  ],
  this_quarter_vs_last_quarter: [
    {
      id: "gmv",
      name: "Doanh Thu GMV",
      category: "revenue",
      currentValue: 58500000000,
      previousValue: 46200000000,
      unit: "VNĐ",
      format: "currency",
      target: 52000000000,
      description: "Tổng GMV tích lũy toàn quý"
    },
    {
      id: "orders",
      name: "Tổng Đơn Hàng Thành Công",
      category: "revenue",
      currentValue: 198000,
      previousValue: 158000,
      unit: "đơn",
      format: "number",
      target: 175000,
      description: "Tổng lượng đơn chốt thành công quý này"
    },
    {
      id: "aov",
      name: "Giá Trị Trung Bình Đơn (AOV)",
      category: "revenue",
      currentValue: 295400,
      previousValue: 292400,
      unit: "VNĐ",
      format: "currency",
      target: 290000,
      description: "Mức chi tiêu trung bình trên 1 đơn"
    },
    {
      id: "live_sessions",
      name: "Số Phiên Livestream",
      category: "livestream",
      currentValue: 210,
      previousValue: 180,
      unit: "phiên",
      format: "number",
      target: 190,
      description: "Tổng số phiên livestream đã vận hành trong quý"
    },
    {
      id: "cvr",
      name: "Tỷ Lệ Chuyển Đổi (CVR)",
      category: "livestream",
      currentValue: 5.1,
      previousValue: 4.2,
      unit: "%",
      format: "percentage",
      target: 4.5,
      description: "Hiệu suất chuyển đổi trung bình quý"
    },
    {
      id: "peak_ccu",
      name: "Mắt Xem Cao Nhất (Peak CCU)",
      category: "livestream",
      currentValue: 18200,
      previousValue: 13500,
      unit: "mắt",
      format: "number",
      target: 14000,
      description: "Kỷ lục mắt xem đồng thời trong quý"
    },
    {
      id: "avg_duration",
      name: "Thời Gian Xem Trung Bình",
      category: "livestream",
      currentValue: 3.7,
      previousValue: 3.1,
      unit: "phút",
      format: "duration",
      target: 3.3,
      description: "Thời gian ở lại video trung bình"
    },
    {
      id: "roas",
      name: "Tỷ Lệ ROI / ROAS Agency",
      category: "roi",
      currentValue: 6.7,
      previousValue: 5.8,
      unit: "x",
      format: "number",
      target: 6.0,
      description: "ROAS trung bình đối tác ghi nhận"
    }
  ]
};

// --- Real date-range helpers (replace the old hardcoded *0.8/*0.85 "previous period" trick) ---

/** Parses a "YYYY-MM-DD" session date string as a local-midnight Date (avoids UTC-shift bugs). */
const parseSessionDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

const startOfCalendarWeek = (d: Date): Date => {
  const r = new Date(d);
  const day = r.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
};

interface DateRange {
  start: Date;
  end: Date;
}

/** Real current/previous date windows for the selected period, anchored to "now". */
const getPeriodRanges = (period: TimePeriodOption, now: Date): { current: DateRange; previous: DateRange } => {
  if (period === "this_week_vs_last_week") {
    const curStart = startOfCalendarWeek(now);
    const curEnd = addDays(curStart, 6);
    return {
      current: { start: curStart, end: curEnd },
      previous: { start: addDays(curStart, -7), end: addDays(curStart, -1) }
    };
  }
  if (period === "this_month_vs_last_month") {
    const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const curEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return { current: { start: curStart, end: curEnd }, previous: { start: prevStart, end: prevEnd } };
  }
  // this_quarter_vs_last_quarter
  const q = Math.floor(now.getMonth() / 3);
  const curStart = new Date(now.getFullYear(), q * 3, 1);
  const curEnd = new Date(now.getFullYear(), q * 3 + 3, 0);
  const prevStart = new Date(now.getFullYear(), q * 3 - 3, 1);
  const prevEnd = new Date(now.getFullYear(), q * 3, 0);
  return { current: { start: curStart, end: curEnd }, previous: { start: prevStart, end: prevEnd } };
};

const isSessionInRange = (session: LiveSession, range: DateRange): boolean => {
  if (!session.date) return false;
  const d = parseSessionDate(session.date);
  return d >= range.start && d <= range.end;
};

/** Số ngày đã trôi qua của kỳ hiện tại tính tới "now" (chặn ở range.end nếu kỳ đã kết thúc). */
const getElapsedDays = (range: DateRange, now: Date): number => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const clampedEnd = today < range.end ? today : range.end;
  if (clampedEnd < range.start) return 0;
  return Math.round((clampedEnd.getTime() - range.start.getTime()) / 86400000) + 1;
};

// FIX L2 (audit 2026-08-21): "kỳ này" (tuần/tháng/quý hiện tại) luôn là một kỳ DỞ DANG — curEnd là
// ngày cuối kỳ trên lịch, phần lớn còn ở tương lai — trong khi "kỳ trước" luôn ĐẦY ĐỦ (đã kết
// thúc). So tổng dở dang với tổng đầy đủ thì mọi chỉ số luôn thấp hơn giả tạo, tăng trưởng luôn
// âm cho tới hết kỳ. Cắt "kỳ trước" xuống đúng số ngày đã trôi qua của "kỳ này" để so sánh công bằng
// (kiểu "cùng kỳ tháng trước"/"tháng-tới-nay" thay vì "tháng dở dang" vs "tháng trọn vẹn").
const getComparablePreviousRange = (previous: DateRange, elapsedDays: number): DateRange => {
  const fullLength = Math.round((previous.end.getTime() - previous.start.getTime()) / 86400000) + 1;
  const cappedDays = Math.max(0, Math.min(elapsedDays, fullLength));
  return { start: previous.start, end: addDays(previous.start, Math.max(0, cappedDays - 1)) };
};

interface PeriodBucket {
  label: string;
  range: DateRange;
}

/** Sub-buckets used for the trajectory chart, sized to the period type. */
const buildBuckets = (period: TimePeriodOption, range: DateRange): PeriodBucket[] => {
  if (period === "this_week_vs_last_week") {
    const labels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
    return labels.map((label, i) => {
      const day = addDays(range.start, i);
      return { label, range: { start: day, end: day } };
    });
  }
  if (period === "this_month_vs_last_month") {
    const totalDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;
    const chunk = Math.ceil(totalDays / 4);
    const buckets: PeriodBucket[] = [];
    for (let i = 0; i < 4; i++) {
      const bStart = addDays(range.start, i * chunk);
      if (bStart > range.end) break;
      const bEnd = addDays(range.start, Math.min((i + 1) * chunk - 1, totalDays - 1));
      buckets.push({ label: `Tuần ${i + 1}`, range: { start: bStart, end: bEnd } });
    }
    return buckets;
  }
  // this_quarter_vs_last_quarter
  return [0, 1, 2].map((i) => {
    const mStart = new Date(range.start.getFullYear(), range.start.getMonth() + i, 1);
    const mEnd = new Date(range.start.getFullYear(), range.start.getMonth() + i + 1, 0);
    return { label: `Tháng ${mStart.getMonth() + 1}`, range: { start: mStart, end: mEnd } };
  });
};

export const KpiComparison: React.FC<KpiComparisonProps> = ({
  brands = [],
  studios = [],
  sessions,
  costBySessionId,
  hideCommission = false
}) => {
  const [timePeriod, setTimePeriod] = useState<TimePeriodOption>("this_week_vs_last_week");
  const [selectedCategory, setSelectedCategory] = useState<"all" | "revenue" | "livestream" | "roi">("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [activeMetricTab, setActiveMetricTab] = useState<"gmv" | "orders">("gmv");

  const effectiveSessions = useMemo(() => {
    if (!sessions) return [];
    if (selectedBrand === "all") return sessions;
    return sessions.filter((s) => s.brandId === selectedBrand || s.brandName === selectedBrand);
  }, [sessions, selectedBrand]);

  // Real current/previous date windows for the selected period (anchored to today).
  const periodRanges = useMemo(() => getPeriodRanges(timePeriod, new Date()), [timePeriod]);

  // FIX L2: kỳ trước dùng để SO SÁNH (thẻ KPI, delta%, so sánh Studio) bị cắt xuống cùng số ngày đã
  // trôi qua của kỳ này — tránh so "tháng dở dang" với "tháng trọn vẹn". periodRanges.previous (đầy
  // đủ) vẫn giữ nguyên cho biểu đồ quỹ đạo (trajectoryData) vì đó là biểu đồ xu hướng, không phải %.
  const comparablePreviousRange = useMemo(() => {
    const elapsedDays = getElapsedDays(periodRanges.current, new Date());
    return getComparablePreviousRange(periodRanges.previous, elapsedDays);
  }, [periodRanges]);

  const currentPeriodSessions = useMemo(
    () => effectiveSessions.filter((s) => isSessionInRange(s, periodRanges.current)),
    [effectiveSessions, periodRanges]
  );
  const previousPeriodSessions = useMemo(
    () => effectiveSessions.filter((s) => isSessionInRange(s, comparablePreviousRange)),
    [effectiveSessions, comparablePreviousRange]
  );

  /** Aggregates the metrics this component tracks from a real slice of sessions. */
  const summarizeSessions = (list: LiveSession[]) => {
    const totalGmv = list.reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    const totalTargetGmv = list.reduce((acc, s) => acc + (s.targetGmv || 0), 0);
    const totalOrders = list.reduce((acc, s) => acc + (s.totalOrders || 0), 0);
    const avgAov = totalOrders > 0 ? Math.round(totalGmv / totalOrders) : 0;
    const avgCvr = list.length > 0 ? Number((list.reduce((acc, s) => acc + (s.cvrAvg || 0), 0) / list.length).toFixed(1)) : 0;
    const maxPeakCcu = Math.max(0, ...list.map((s) => s.peakViewers || 0));
    const avgWatchMinutes = list.length > 0
      ? Number((list.reduce((acc, s) => acc + ((s.avgWatchTimeSeconds || 0) / 60), 0) / list.length).toFixed(1))
      : 0;
    // FIX L1 (audit 2026-08-21): công thức cũ giả định MỌI session tốn đúng 50.000.000đ — con số
    // bịa, không liên quan gì tới chi phí thật (studio/ads/lương host) của agency. Dùng chi phí
    // thật (costBySessionId, do Dashboards.tsx tính bằng computeSessionPnl) khi có; không có thì
    // approxRoas = 0 thay vì bịa một hệ số — hideCommission ở trên đã ẩn hẳn thẻ này khi dùng
    // trong Brand Workspace (không có costBySessionId), nên 0 chỉ thật sự hiển thị khi đang ở
    // Agency mà chưa có session Completed nào trong kỳ, đúng nghĩa "chưa có dữ liệu".
    const totalRealCost = costBySessionId ? list.reduce((acc, s) => acc + (costBySessionId[s.id] || 0), 0) : 0;
    const approxRoas = totalRealCost > 0 ? Number((totalGmv / totalRealCost).toFixed(1)) : 0;
    // FIX L2: "Số Phiên Livestream" chỉ tính phiên đã/đang thực sự diễn ra (Completed/Live Now) —
    // trước đây đếm luôn cả Cancelled và Upcoming (lịch tương lai chưa chắc diễn ra), phóng đại
    // hoạt động thật trong kỳ.
    const heldSessionsCount = list.filter((s) => s.status === "Completed" || s.status === "Live Now").length;
    return { totalGmv, totalTargetGmv, totalOrders, avgAov, avgCvr, maxPeakCcu, avgWatchMinutes, approxRoas, count: list.length, heldSessionsCount };
  };

  const rawMetrics = COMPARISON_METRICS[timePeriod];
  const currentMetrics = useMemo(() => {
    const cur = summarizeSessions(currentPeriodSessions);
    const prev = summarizeSessions(previousPeriodSessions);

    // FIX L1 (audit 2026-08-21): trước đây MỌI metric (trừ gmv khi có targetGmv thật) đặt
    // target = currentValue × 1.1/1.05 — một "mục tiêu" tự tham chiếu chính số hiện tại, nên
    // thanh tiến độ luôn hiện ~91-95% bất kể thực tế tốt/xấu ra sao. Không có nguồn target thật
    // nào cho orders/aov/cvr/peak_ccu/avg_duration/roas trong data model (chỉ session.targetGmv
    // là target thật, dùng riêng cho gmv) — để target = undefined thay vì bịa, UI dưới tự ẩn khối
    // Target/thanh tiến độ khi không có target thật, chỉ còn so sánh current vs kỳ trước (thật).
    return rawMetrics.map((m) => {
      if (m.id === "gmv") {
        return {
          ...m,
          currentValue: cur.totalGmv,
          previousValue: prev.totalGmv,
          target: cur.totalTargetGmv > 0 ? cur.totalTargetGmv : undefined
        };
      }
      if (m.id === "orders") {
        return { ...m, currentValue: cur.totalOrders, previousValue: prev.totalOrders, target: undefined };
      }
      if (m.id === "aov") {
        return { ...m, currentValue: cur.avgAov, previousValue: prev.avgAov, target: undefined };
      }
      if (m.id === "live_sessions") {
        return { ...m, currentValue: cur.heldSessionsCount, previousValue: prev.heldSessionsCount, target: undefined };
      }
      if (m.id === "cvr") {
        return { ...m, currentValue: cur.avgCvr, previousValue: prev.avgCvr, target: undefined };
      }
      if (m.id === "peak_ccu") {
        return { ...m, currentValue: cur.maxPeakCcu, previousValue: prev.maxPeakCcu, target: undefined };
      }
      if (m.id === "avg_duration") {
        return { ...m, currentValue: cur.avgWatchMinutes, previousValue: prev.avgWatchMinutes, target: undefined };
      }
      if (m.id === "roas") {
        return { ...m, currentValue: cur.approxRoas, previousValue: prev.approxRoas, target: undefined };
      }
      return m;
    });
  }, [currentPeriodSessions, previousPeriodSessions, rawMetrics]);

  const filteredMetrics = currentMetrics.filter((m) => {
    if (hideCommission && m.category === "roi") return false;
    return selectedCategory === "all" ? true : m.category === selectedCategory;
  });

  const trajectoryData = useMemo(() => {
    const currentBuckets = buildBuckets(timePeriod, periodRanges.current);
    const previousBuckets = buildBuckets(timePeriod, periodRanges.previous);
    return currentBuckets.map((bucket, idx) => {
      const prevBucket = previousBuckets[idx];
      const curSessionsInBucket = effectiveSessions.filter((s) => isSessionInRange(s, bucket.range));
      const prevSessionsInBucket = prevBucket ? effectiveSessions.filter((s) => isSessionInRange(s, prevBucket.range)) : [];
      return {
        label: bucket.label,
        current: Math.round(curSessionsInBucket.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000),
        previous: Math.round(prevSessionsInBucket.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000),
        ordersCurrent: curSessionsInBucket.reduce((acc, s) => acc + (s.totalOrders || 0), 0),
        ordersPrev: prevSessionsInBucket.reduce((acc, s) => acc + (s.totalOrders || 0), 0)
      };
    });
  }, [timePeriod, periodRanges, effectiveSessions]);

  const studioComparisonData = useMemo(() => {
    if (!studios || studios.length === 0) return [];
    return studios.map((st) => {
      const curStudioSessions = currentPeriodSessions.filter((s) => s.studioId === st.id || s.studioName === st.name);
      const prevStudioSessions = previousPeriodSessions.filter((s) => s.studioId === st.id || s.studioName === st.name);
      return {
        name: st.name,
        currentGMV: Math.round(curStudioSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000),
        prevGMV: Math.round(prevStudioSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000),
        currentSessions: curStudioSessions.length,
        prevSessions: prevStudioSessions.length
      };
    });
  }, [currentPeriodSessions, previousPeriodSessions, studios]);

  // Helper formatting function
  const formatMetricValue = (value: number, format: MetricComparisonItem["format"], unit: string) => {
    if (format === "currency") {
      return formatCurrencyAdaptive(value, unit);
    }
    if (format === "percentage") {
      return `${value}%`;
    }
    if (format === "duration") {
      return `${value} ${unit}`;
    }
    return `${value.toLocaleString()} ${unit}`;
  };

  const getDeltaInfo = (item: MetricComparisonItem) => {
    const diff = item.currentValue - item.previousValue;
    const percent = item.previousValue > 0 ? ((diff / item.previousValue) * 100).toFixed(1) : "0.0";
    const isPositive = diff >= 0;
    return { diff, percent: Number(percent), isPositive };
  };

  const getTimePeriodLabel = (period: TimePeriodOption) => {
    switch (period) {
      case "this_week_vs_last_week":
        return { current: "Tuần Này", previous: "Tuần Trước" };
      case "this_month_vs_last_month":
        return { current: "Tháng Này", previous: "Tháng Trước" };
      case "this_quarter_vs_last_quarter":
        return { current: "Quý Này", previous: "Quý Trước" };
    }
  };

  const labels = getTimePeriodLabel(timePeriod);

  const topStudioInsight = useMemo(() => {
    const totalGmv = studioComparisonData.reduce((acc, s) => acc + s.currentGMV, 0);
    if (totalGmv <= 0) return null;
    const top = [...studioComparisonData].sort((a, b) => b.currentGMV - a.currentGMV)[0];
    return { name: top.name, pct: ((top.currentGMV / totalGmv) * 100).toFixed(1) };
  }, [studioComparisonData]);

  // Growth driver highlights — derived from the real currentMetrics computed above, not hardcoded copy.
  const getGrowthHighlights = () => {
    if (currentPeriodSessions.length === 0) {
      return [
        {
          title: "Chưa Có Dữ Liệu Tăng Trưởng",
          desc: "Hệ thống đang ở trạng thái trống (Clean State). Hãy tạo phiên live mới để AI bắt đầu phân tích.",
          tag: "Clean State"
        },
        {
          title: "Tối Ưu Công Suất Studio",
          desc: "Sẵn sàng ghi nhận ca live khi bạn khởi tạo phiên đầu tiên.",
          tag: "Studio Idle"
        },
        {
          title: "Chỉ Số ROAS & Lợi Nhuận",
          desc: "Hệ thống sẽ tự động tổng hợp chỉ số ngay khi phát sinh doanh thu thực tế.",
          tag: "ROAS Ready"
        }
      ];
    }

    const gmvMetric = currentMetrics.find((m) => m.id === "gmv");
    const cvrMetric = currentMetrics.find((m) => m.id === "cvr");
    const peakMetric = currentMetrics.find((m) => m.id === "peak_ccu");
    const roasMetric = currentMetrics.find((m) => m.id === "roas");
    const gmvDelta = gmvMetric ? getDeltaInfo(gmvMetric) : null;

    return [
      {
        title: gmvDelta
          ? `Tăng Trưởng GMV ${gmvDelta.isPositive ? "+" : ""}${gmvDelta.percent}%`
          : "Tăng Trưởng GMV",
        desc: `So với ${labels.previous.toLowerCase()}, GMV của ${currentPeriodSessions.length} phiên trong ${labels.current.toLowerCase()} ${gmvDelta && gmvDelta.isPositive ? "tăng" : "giảm"}.`,
        tag: "GMV"
      },
      {
        title: `Tỉ Lệ CVR ${cvrMetric ? cvrMetric.currentValue : 0}%`,
        desc: "Tỷ lệ chuyển đổi trung bình thực tế trên toàn bộ phiên trong kỳ.",
        tag: "CVR"
      },
      {
        title: `Peak CCU ${peakMetric ? peakMetric.currentValue.toLocaleString() : 0}`,
        desc: `ROAS Agency ước tính ${roasMetric ? roasMetric.currentValue : 0}x trong kỳ này.`,
        tag: "Peak CCU"
      }
    ];
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl p-5 sm:p-7 text-[var(--text)] shadow-2xl space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-[var(--accent)]/20 text-[var(--accent-text)] rounded-xl border border-[var(--accent)]/30">
              <BarChart2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--text)]">
              So Sánh KPI Theo Kỳ
            </h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] max-w-2xl">
            GMV, Đơn, CVR, ROI, CCU — kỳ hiện tại so với kỳ trước
          </p>
        </div>

        {/* TIMEFRAME TOGGLE BUTTONS */}
        <div className="flex items-center gap-1.5 bg-[var(--surface-base)] p-1.5 rounded-2xl border border-[var(--border)]">
          <button
            onClick={() => setTimePeriod("this_week_vs_last_week")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_week_vs_last_week"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Tuần Này vs Tuần Trước</span>
          </button>

          <button
            onClick={() => setTimePeriod("this_month_vs_last_month")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_month_vs_last_month"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Tháng Này vs Tháng Trước</span>
          </button>

          <button
            onClick={() => setTimePeriod("this_quarter_vs_last_quarter")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_quarter_vs_last_quarter"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Quý Này vs Quý Trước</span>
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-base)]/80 p-3 rounded-2xl border border-[var(--border)]/80 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[var(--text-muted)] font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" /> Nhóm Chỉ Số:
          </span>
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "all"
                ? "bg-[var(--surface-elevated)] text-blue-400 border border-blue-500/40"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setSelectedCategory("revenue")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "revenue"
                ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Doanh Thu & Đơn Hàng
          </button>
          <button
            onClick={() => setSelectedCategory("livestream")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "livestream"
                ? "bg-purple-950 text-purple-300 border border-purple-500/40"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Livestream & Viewer
          </button>
          {!hideCommission && (
            <button
              onClick={() => setSelectedCategory("roi")}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                selectedCategory === "roi"
                  ? "bg-amber-950 text-amber-300 border border-amber-500/40"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Lợi Nhuận & ROAS
            </button>
          )}
        </div>

        {/* Brand Selector Filter */}
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] font-semibold">Thương hiệu:</span>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] text-xs rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-500"
          >
            <option value="all">Tất cả Nhãn Hàng (Agency General)</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.industry})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KEY METRICS CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {filteredMetrics.map((item) => {
          const delta = getDeltaInfo(item);
          const currentFormatted = formatMetricValue(item.currentValue, item.format, item.unit);
          const previousFormatted = formatMetricValue(item.previousValue, item.format, item.unit);
          const hasRealTarget = item.target !== undefined;
          const isTargetAchieved = hasRealTarget && item.currentValue >= item.target!;

          return (
            <div
              key={item.id}
              className="bg-[var(--surface-base)]/90 border border-[var(--border)] hover:border-[var(--border)] rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all hover:shadow-xl relative overflow-hidden group h-full"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2 min-h-[2.25rem]">
                  <span className="text-[11px] font-semibold text-[var(--text-muted)] leading-snug line-clamp-2 flex-1">
                    {item.name}
                  </span>

                  {/* Growth Pill Badge */}
                  <div
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold flex items-center gap-1 shrink-0 ${
                      delta.isPositive
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                        : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                    }`}
                  >
                    {delta.isPositive ? (
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    ) : (
                      <ArrowDownRight className="w-3.5 h-3.5" />
                    )}
                    <span>{delta.isPositive ? `+${delta.percent}%` : `${delta.percent}%`}</span>
                  </div>
                </div>

                <div className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight">{currentFormatted}</div>
              </div>

              {/* Comparison vs Previous Period */}
              <div className="bg-[var(--surface)]/80 rounded-xl p-2.5 border border-[var(--border)]/80 text-[11px] space-y-1">
                <div className="flex justify-between items-center text-[var(--text-muted)]">
                  <span className="truncate">{labels.previous}:</span>
                  <strong className="text-[var(--text)] shrink-0 ml-2 font-mono">{previousFormatted}</strong>
                </div>

                <div className="flex justify-between items-center text-[var(--text-muted)]">
                  <span>Delta:</span>
                  <strong className={`shrink-0 ml-2 font-mono ${delta.isPositive ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}`}>
                    {delta.isPositive ? "+" : ""}
                    {formatMetricValue(Math.abs(delta.diff), item.format, item.unit)}
                  </strong>
                </div>
              </div>

              {/* Visual Mini Comparison Bar — chỉ hiện khi có target THẬT (session.targetGmv cho
                  gmv). Các metric khác không có nguồn target thật trong data model nên không hiện
                  khối này thay vì bịa target = currentValue×1.1 (audit L1). */}
              {hasRealTarget && (
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] text-[var(--text-muted)]">
                    <span className="truncate">Target: {formatMetricValue(item.target!, item.format, item.unit)}</span>
                    <span className={`flex items-center gap-0.5 shrink-0 ml-1 ${isTargetAchieved ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}`}>
                      {isTargetAchieved ? (
                        <><CheckCircle2 className="w-3 h-3" /> Đạt</>
                      ) : (
                        <><TrendingUp className="w-3 h-3" /> Chưa Đạt</>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-[var(--surface-elevated)] rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-[var(--accent)] transition-all duration-500 rounded-full"
                      style={{
                        width: `${Math.min(100, (item.currentValue / Math.max(item.currentValue, item.target!)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* DUAL COMPARISON CHART SECTION */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Chart Card (Trajectory comparison) */}
        <div className="lg:col-span-2 bg-[var(--surface-base)]/90 border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                <LineChart className="w-5 h-5 text-[var(--accent-text)]" />
                Quỹ Đạo Tăng Trưởng Theo Thời Gian ({labels.current} vs {labels.previous})
              </h3>
              <p className="text-xs text-[var(--text-muted)]">So sánh nhịp độ phát sinh doanh thu và đơn hàng qua từng ngày/tuần</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] flex items-center text-xs">
                <button
                  onClick={() => setActiveMetricTab("gmv")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    activeMetricTab === "gmv" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  Doanh Thu GMV (Triệu đ)
                </button>
                <button
                  onClick={() => setActiveMetricTab("orders")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    activeMetricTab === "orders" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"
                  }`}
                >
                  Đơn Hàng
                </button>
              </div>

              <div className="bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)] flex items-center text-xs">
                <button
                  onClick={() => setChartType("area")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    chartType === "area" ? "bg-[var(--surface-elevated)] text-[var(--accent-text)]" : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  }`}
                  title="Biểu đồ Miền (Area Chart)"
                >
                  Area
                </button>
                <button
                  onClick={() => setChartType("bar")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    chartType === "bar" ? "bg-[var(--surface-elevated)] text-[var(--accent-text)]" : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  }`}
                  title="Biểu đồ Cột So Sánh (Grouped Bar)"
                >
                  Bar
                </button>
              </div>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "area" ? (
                <AreaChart data={trajectoryData}>
                  <defs>
                    <linearGradient id="currentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--text-faint)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--text-faint)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-faint)" fontSize={12} />
                  <YAxis stroke="var(--text-faint)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "12px" }}
                    formatter={(val: any, name: any) => [
                      activeMetricTab === "gmv" ? `${val} Triệu VNĐ` : `${val} đơn`,
                      name === "current" ? labels.current : labels.previous
                    ]}
                  />
                  <Legend formatter={(value) => (value === "current" ? labels.current : labels.previous)} />
                  <Area
                    type="monotone"
                    dataKey={activeMetricTab === "gmv" ? "current" : "ordersCurrent"}
                    name="current"
                    stroke="var(--accent)"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#currentGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetricTab === "gmv" ? "previous" : "ordersPrev"}
                    name="previous"
                    stroke="var(--text-faint)"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#prevGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={trajectoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" stroke="var(--text-faint)" fontSize={12} />
                  <YAxis stroke="var(--text-faint)" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "12px" }}
                    formatter={(val: any, name: any) => [
                      activeMetricTab === "gmv" ? `${val} Triệu VNĐ` : `${val} đơn`,
                      name === "current" ? labels.current : labels.previous
                    ]}
                  />
                  <Legend formatter={(value) => (value === "current" ? labels.current : labels.previous)} />
                  <Bar
                    dataKey={activeMetricTab === "gmv" ? "current" : "ordersCurrent"}
                    name="current"
                    fill="var(--accent)"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey={activeMetricTab === "gmv" ? "previous" : "ordersPrev"}
                    name="previous"
                    fill="var(--text-faint)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Studio Level Performance Comparison */}
        <div className="bg-[var(--surface-base)]/90 border border-[var(--border)] rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[var(--accent-text)]" />
              So Sánh Doanh Thu Theo Studio (Triệu VNĐ)
            </h3>
            <p className="text-xs text-[var(--text-muted)]">Đóng góp của 3 Studio phòng máy trong kỳ hiện tại vs kỳ trước</p>

            <div className="h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studioComparisonData} layout="vertical">
                  <XAxis type="number" stroke="var(--text-faint)" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="var(--text-muted)" fontSize={10} width={90} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", borderRadius: "12px" }}
                    formatter={(val: any) => [`${val} Triệu VNĐ`, "GMV"]}
                  />
                  <Bar dataKey="currentGMV" name="Kỳ Này" fill="var(--accent)" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="prevGMV" name="Kỳ Trước" fill="var(--border)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[var(--surface)]/80 p-3 rounded-xl border border-[var(--border)]/80 text-xs text-[var(--text-muted)] space-y-1">
            <div className="font-bold text-[var(--accent-text)] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> {topStudioInsight ? `${topStudioInsight.name} chiếm ${topStudioInsight.pct}% tổng GMV` : "Chưa phát sinh doanh thu"}
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {topStudioInsight
                ? `${topStudioInsight.name} dẫn đầu GMV trong ${labels.current.toLowerCase()} theo dữ liệu phiên live thực tế.`
                : "Tất cả studio phòng máy đang sẵn sàng nhận ca live mới."}
            </p>
          </div>
        </div>
      </div>

      {/* AI GROWTH DRIVERS BREAKDOWN */}
      <div className="bg-gradient-to-r from-blue-950/80 via-[var(--surface)] to-indigo-950/80 border border-blue-900/50 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400 animate-spin-slow shrink-0" />
            <h3 className="font-bold text-[var(--text)] text-base">Phân Tích Yếu Tố Tăng Trưởng (AI Growth Breakdown)</h3>
          </div>
          <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/40 px-2.5 py-1 rounded-xl font-mono font-bold shrink-0">
            LiveOps AI Insights
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {getGrowthHighlights().map((h, i) => (
            <div
              key={i}
              className="bg-[var(--surface)]/90 border border-[var(--border)]/90 p-4 rounded-xl flex flex-col justify-between space-y-2 hover:border-blue-500/40 transition-all h-full"
            >
              <div className="flex justify-between items-start gap-2 h-7">
                <h4 className="font-bold text-xs text-blue-300 leading-snug line-clamp-1">{h.title}</h4>
                <span className="text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] font-semibold px-2 py-0.5 rounded-md shrink-0">
                  {h.tag}
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed min-h-[2.5rem] flex-1">{h.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
