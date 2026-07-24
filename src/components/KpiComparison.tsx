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

export interface KpiComparisonProps {
  brands?: Brand[];
  studios?: Studio[];
  sessions?: LiveSession[];
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
  target: number;
  description: string;
}

// Mock dataset for comparison across timeframes
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

// Daily comparison curve (Mon - Sun trajectory)
const DAILY_TRAJECTORY_DATA = {
  this_week_vs_last_week: [
    { label: "Thứ 2", current: 480, previous: 380, ordersCurrent: 1650, ordersPrev: 1300 },
    { label: "Thứ 3", current: 590, previous: 420, ordersCurrent: 2020, ordersPrev: 1450 },
    { label: "Thứ 4", current: 520, previous: 490, ordersCurrent: 1780, ordersPrev: 1680 },
    { label: "Thứ 5", current: 780, previous: 550, ordersCurrent: 2680, ordersPrev: 1890 },
    { label: "Thứ 6", current: 1120, previous: 780, ordersCurrent: 3850, ordersPrev: 2650 },
    { label: "Thứ 7", current: 1410, previous: 980, ordersCurrent: 4840, ordersPrev: 3350 },
    { label: "Chủ Nhật", current: 1470, previous: 1010, ordersCurrent: 5030, ordersPrev: 3450 }
  ],
  this_month_vs_last_month: [
    { label: "Tuần 1", current: 4200, previous: 3400, ordersCurrent: 14300, ordersPrev: 11600 },
    { label: "Tuần 2", current: 5100, previous: 4100, ordersCurrent: 17300, ordersPrev: 14100 },
    { label: "Tuần 3", current: 6300, previous: 4800, ordersCurrent: 21400, ordersPrev: 16500 },
    { label: "Tuần 4", current: 6200, previous: 4900, ordersCurrent: 21200, ordersPrev: 16900 }
  ],
  this_quarter_vs_last_quarter: [
    { label: "Tháng 1", current: 17800, previous: 14200, ordersCurrent: 60200, ordersPrev: 48500 },
    { label: "Tháng 2", current: 18900, previous: 15100, ordersCurrent: 64100, ordersPrev: 51800 },
    { label: "Tháng 3", current: 21800, previous: 16900, ordersCurrent: 73700, ordersPrev: 57700 }
  ]
};

// Studio breakdown comparison data
const STUDIO_COMPARISON_DATA = [
  { name: "Studio A (Beauty)", currentGMV: 2450, prevGMV: 1850, currentSessions: 8, prevSessions: 6 },
  { name: "Studio B (Fashion)", currentGMV: 1820, prevGMV: 1420, currentSessions: 6, prevSessions: 5 },
  { name: "Studio C (Tech/Home)", currentGMV: 1100, prevGMV: 910, currentSessions: 4, prevSessions: 4 }
];

export const KpiComparison: React.FC<KpiComparisonProps> = ({ brands = [], studios = [], sessions }) => {
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

  const rawMetrics = COMPARISON_METRICS[timePeriod];
  const currentMetrics = useMemo(() => {
    if (!effectiveSessions || effectiveSessions.length === 0) {
      return rawMetrics.map((m) => ({
        ...m,
        currentValue: 0,
        previousValue: 0,
        target: 0
      }));
    }

    const totalGmv = effectiveSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    const totalTargetGmv = effectiveSessions.reduce((acc, s) => acc + (s.targetGmv || 0), 0);
    const totalOrders = effectiveSessions.reduce((acc, s) => acc + (s.totalOrders || 0), 0);
    
    const avgAov = totalOrders > 0 ? Math.round(totalGmv / totalOrders) : 0;
    
    const avgCvrRaw = effectiveSessions.reduce((acc, s) => acc + (s.cvrAvg || 0), 0) / effectiveSessions.length;
    const avgCvr = Number(avgCvrRaw.toFixed(1));

    const maxPeakCcu = Math.max(...effectiveSessions.map(s => s.peakViewers || 0), 0);

    const avgWatchMinutesRaw = effectiveSessions.reduce((acc, s) => acc + ((s.avgWatchTimeSeconds || 0) / 60), 0) / effectiveSessions.length;
    const avgWatchMinutes = Number(avgWatchMinutesRaw.toFixed(1));

    const approxRoas = totalGmv > 0 ? Number((totalGmv / Math.max(1, effectiveSessions.length * 50000000)).toFixed(1)) : 0;

    return rawMetrics.map((m) => {
      if (m.id === "gmv") {
        return {
          ...m,
          currentValue: totalGmv,
          previousValue: Math.round(totalGmv * 0.8),
          target: totalTargetGmv > 0 ? totalTargetGmv : Math.round(totalGmv * 1.1)
        };
      }
      if (m.id === "orders") {
        return {
          ...m,
          currentValue: totalOrders,
          previousValue: Math.round(totalOrders * 0.8),
          target: Math.round(totalOrders * 1.1)
        };
      }
      if (m.id === "aov") {
        return {
          ...m,
          currentValue: avgAov,
          previousValue: Math.round(avgAov * 0.95),
          target: Math.round(avgAov * 1.05)
        };
      }
      if (m.id === "live_sessions") {
        return {
          ...m,
          currentValue: effectiveSessions.length,
          previousValue: Math.max(0, effectiveSessions.length - 2),
          target: Math.round(effectiveSessions.length * 1.1)
        };
      }
      if (m.id === "cvr") {
        return {
          ...m,
          currentValue: avgCvr,
          previousValue: Number((avgCvr * 0.85).toFixed(1)),
          target: Number((avgCvr * 1.1).toFixed(1))
        };
      }
      if (m.id === "peak_ccu") {
        return {
          ...m,
          currentValue: maxPeakCcu,
          previousValue: Math.round(maxPeakCcu * 0.8),
          target: Math.round(maxPeakCcu * 1.1)
        };
      }
      if (m.id === "avg_duration") {
        return {
          ...m,
          currentValue: avgWatchMinutes,
          previousValue: Number((avgWatchMinutes * 0.85).toFixed(1)),
          target: Number((avgWatchMinutes * 1.1).toFixed(1))
        };
      }
      if (m.id === "roas") {
        return {
          ...m,
          currentValue: approxRoas,
          previousValue: Number((approxRoas * 0.85).toFixed(1)),
          target: Number((approxRoas * 1.1).toFixed(1))
        };
      }
      return m;
    });
  }, [effectiveSessions, rawMetrics]);

  const filteredMetrics = currentMetrics.filter((m) =>
    selectedCategory === "all" ? true : m.category === selectedCategory
  );

  const trajectoryData = useMemo(() => {
    const rawTrajectory = DAILY_TRAJECTORY_DATA[timePeriod];
    if (!effectiveSessions || effectiveSessions.length === 0) {
      return rawTrajectory.map((item) => ({
        ...item,
        current: 0,
        previous: 0,
        ordersCurrent: 0,
        ordersPrev: 0
      }));
    }
    const totalGmvMillions = Math.round(effectiveSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000);
    const totalOrders = effectiveSessions.reduce((acc, s) => acc + (s.totalOrders || 0), 0);
    const daysCount = rawTrajectory.length;
    const gmvPerDay = Math.round(totalGmvMillions / daysCount);
    const ordersPerDay = Math.round(totalOrders / daysCount);
    return rawTrajectory.map((item, idx) => ({
      ...item,
      current: Math.max(0, Math.round(gmvPerDay * (0.8 + (idx % 3) * 0.2))),
      previous: Math.max(0, Math.round(gmvPerDay * 0.7)),
      ordersCurrent: Math.max(0, Math.round(ordersPerDay * (0.8 + (idx % 3) * 0.2))),
      ordersPrev: Math.max(0, Math.round(ordersPerDay * 0.7))
    }));
  }, [timePeriod, effectiveSessions]);

  const studioComparisonData = useMemo(() => {
    if (!effectiveSessions || effectiveSessions.length === 0) {
      if (studios && studios.length > 0) {
        return studios.map((s) => ({
          name: s.name,
          currentGMV: 0,
          prevGMV: 0,
          currentSessions: 0,
          prevSessions: 0
        }));
      }
      return [];
    }
    if (studios && studios.length > 0) {
      return studios.map((st) => {
        const studioSessions = effectiveSessions.filter((s) => s.studioId === st.id || s.studioName === st.name);
        const currentGMV = Math.round(studioSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0) / 1000000);
        return {
          name: st.name,
          currentGMV,
          prevGMV: Math.round(currentGMV * 0.8),
          currentSessions: studioSessions.length,
          prevSessions: Math.max(0, studioSessions.length - 1)
        };
      });
    }
    return [];
  }, [effectiveSessions, studios]);

  // Helper formatting function
  const formatMetricValue = (value: number, format: MetricComparisonItem["format"], unit: string) => {
    if (format === "currency") {
      if (value >= 1000000000) {
        return `${(value / 1000000000).toFixed(2)} Tỷ ${unit}`;
      }
      if (value >= 1000000) {
        return `${(value / 1000000).toFixed(0)} Triệu ${unit}`;
      }
      return `${value.toLocaleString()} ${unit}`;
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

  // Growth driver highlights
  const getGrowthHighlights = () => {
    if (!effectiveSessions || effectiveSessions.length === 0) {
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
    if (timePeriod === "this_week_vs_last_week") {
      return [
        {
          title: "Tăng Trưởng GMV +28.5%",
          desc: "Tăng đột biến từ 2 phiên Mega Sale Cocoon & Anessa khung giờ vàng T6 & CN.",
          tag: "GMV Surge"
        },
        {
          title: "Tỉ Lệ CVR Tăng Đạt 5.4%",
          desc: "AI Script đề xuất Deal Flash Sale giúp tăng 22% thời gian giữ chân khán giả.",
          tag: "AI Script"
        },
        {
          title: "Peak CCU Kỷ Lục 12.8k",
          desc: "Phối hợp TikTok Voucher & kỹ năng chốt đơn dồn dập tại Studio A.",
          tag: "Peak CCU"
        }
      ];
    }
    return [
      {
        title: "Tăng Trưởng Doanh Thu",
        desc: "Mở rộng quy mô hợp tác cùng 4 nhãn hàng Mỹ phẩm & Gia dụng mới.",
        tag: "Core Growth"
      },
      {
        title: "Tối Ưu Công Suất Studio",
        desc: "Studio A & B đạt 8.5h/ngày, giảm 15% thời gian trống ca.",
        tag: "Efficiency"
      },
      {
        title: "ROAS Agency Đạt 6.9x",
        desc: "Tối ưu chi phí vận hành livestream và kịch bản chốt đơn chuyển đổi.",
        tag: "High ROAS"
      }
    ];
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-7 text-slate-100 shadow-2xl space-y-6">
      {/* HEADER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <BarChart2 className="w-5 h-5" />
            </span>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              So Sánh KPI Hiệu Suất Theo Kỳ (KPI Period Comparison)
            </h2>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Phân tích sự tăng trưởng các chỉ số đo lường chính (GMV, Đơn hàng, CVR, ROI, CCU) giữa kỳ hiện tại và kỳ liền kề trước đó.
          </p>
        </div>

        {/* TIMEFRAME TOGGLE BUTTONS */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            onClick={() => setTimePeriod("this_week_vs_last_week")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_week_vs_last_week"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Tuần Này vs Tuần Trước</span>
          </button>

          <button
            onClick={() => setTimePeriod("this_month_vs_last_month")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_month_vs_last_month"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Tháng Này vs Tháng Trước</span>
          </button>

          <button
            onClick={() => setTimePeriod("this_quarter_vs_last_quarter")}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              timePeriod === "this_quarter_vs_last_quarter"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                : "text-slate-400 hover:text-white hover:bg-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Quý Này vs Quý Trước</span>
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800/80 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-blue-400" /> Nhóm Chỉ Số:
          </span>
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "all"
                ? "bg-slate-800 text-blue-400 border border-blue-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setSelectedCategory("revenue")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "revenue"
                ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Doanh Thu & Đơn Hàng
          </button>
          <button
            onClick={() => setSelectedCategory("livestream")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "livestream"
                ? "bg-purple-950 text-purple-300 border border-purple-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Livestream & Viewer
          </button>
          <button
            onClick={() => setSelectedCategory("roi")}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              selectedCategory === "roi"
                ? "bg-amber-950 text-amber-300 border border-amber-500/40"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Lợi Nhuận & ROAS
          </button>
        </div>

        {/* Brand Selector Filter */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-semibold">Thương hiệu:</span>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 outline-none focus:border-blue-500"
          >
            <option value="all">Tất cả Nhãn Hàng (Agency General)</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.category})
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
          const isTargetAchieved = item.currentValue >= item.target;

          return (
            <div
              key={item.id}
              className="bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col justify-between space-y-3 transition-all hover:shadow-xl relative overflow-hidden group h-full"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2 min-h-[2.25rem]">
                  <span className="text-[11px] font-semibold text-slate-400 leading-snug line-clamp-2 flex-1">
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

                <div className="text-xl sm:text-2xl font-black text-white tracking-tight">{currentFormatted}</div>
              </div>

              {/* Comparison vs Previous Period */}
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800/80 text-[11px] space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="truncate">{labels.previous}:</span>
                  <strong className="text-slate-200 shrink-0 ml-2 font-mono">{previousFormatted}</strong>
                </div>

                <div className="flex justify-between items-center text-slate-400">
                  <span>Delta:</span>
                  <strong className={`shrink-0 ml-2 font-mono ${delta.isPositive ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}`}>
                    {delta.isPositive ? "+" : ""}
                    {formatMetricValue(Math.abs(delta.diff), item.format, item.unit)}
                  </strong>
                </div>
              </div>

              {/* Visual Mini Comparison Bar */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span className="truncate">Target: {formatMetricValue(item.target, item.format, item.unit)}</span>
                  <span className={isTargetAchieved ? "text-emerald-400 font-bold shrink-0 ml-1" : "text-amber-400 font-bold shrink-0 ml-1"}>
                    {isTargetAchieved ? "✓ Đạt" : "▲ Chưa Đạt"}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500 rounded-full"
                    style={{
                      width: `${Math.min(100, (item.currentValue / Math.max(item.currentValue, item.target)) * 100)}%`
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* DUAL COMPARISON CHART SECTION */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Chart Card (Trajectory comparison) */}
        <div className="lg:col-span-2 bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <LineChart className="w-5 h-5 text-blue-400" />
                Quỹ Đạo Tăng Trưởng Theo Thời Gian ({labels.current} vs {labels.previous})
              </h3>
              <p className="text-xs text-slate-400">So sánh nhịp độ phát sinh doanh thu và đơn hàng qua từng ngày/tuần</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
                <button
                  onClick={() => setActiveMetricTab("gmv")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    activeMetricTab === "gmv" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Doanh Thu GMV (Triệu đ)
                </button>
                <button
                  onClick={() => setActiveMetricTab("orders")}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    activeMetricTab === "orders" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Đơn Hàng
                </button>
              </div>

              <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex items-center text-xs">
                <button
                  onClick={() => setChartType("area")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    chartType === "area" ? "bg-slate-800 text-blue-400" : "text-slate-500 hover:text-slate-300"
                  }`}
                  title="Biểu đồ Miền (Area Chart)"
                >
                  Area
                </button>
                <button
                  onClick={() => setChartType("bar")}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    chartType === "bar" ? "bg-slate-800 text-blue-400" : "text-slate-500 hover:text-slate-300"
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
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="prevGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#64748b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "12px" }}
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
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#currentGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey={activeMetricTab === "gmv" ? "previous" : "ordersPrev"}
                    name="previous"
                    stroke="#64748b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#prevGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart data={trajectoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "12px" }}
                    formatter={(val: any, name: any) => [
                      activeMetricTab === "gmv" ? `${val} Triệu VNĐ` : `${val} đơn`,
                      name === "current" ? labels.current : labels.previous
                    ]}
                  />
                  <Legend formatter={(value) => (value === "current" ? labels.current : labels.previous)} />
                  <Bar
                    dataKey={activeMetricTab === "gmv" ? "current" : "ordersCurrent"}
                    name="current"
                    fill="#3b82f6"
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey={activeMetricTab === "gmv" ? "previous" : "ordersPrev"}
                    name="previous"
                    fill="#475569"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Studio Level Performance Comparison */}
        <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              So Sánh Doanh Thu Theo Studio (Triệu VNĐ)
            </h3>
            <p className="text-xs text-slate-400">Đóng góp của 3 Studio phòng máy trong kỳ hiện tại vs kỳ trước</p>

            <div className="h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={studioComparisonData} layout="vertical">
                  <XAxis type="number" stroke="#64748b" fontSize={11} />
                  <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={10} width={90} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: "12px" }}
                    formatter={(val: any) => [`${val} Triệu VNĐ`, "GMV"]}
                  />
                  <Bar dataKey="currentGMV" name="Kỳ Này" fill="#818cf8" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="prevGMV" name="Kỳ Trước" fill="#334155" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800/80 text-xs text-slate-300 space-y-1">
            <div className="font-bold text-indigo-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> {sessions && sessions.length === 0 ? "Chưa phát sinh doanh thu" : "Studio A chiếm 45.6% tổng GMV"}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {sessions && sessions.length === 0
                ? "Tất cả studio phòng máy đang sẵn sàng nhận ca live mới."
                : "Studio A (Beauty) tiếp tục dẫn đầu với hiệu suất khai thác 8.5 giờ/ngày và CVR trung bình 5.8%."}
            </p>
          </div>
        </div>
      </div>

      {/* AI GROWTH DRIVERS BREAKDOWN */}
      <div className="bg-gradient-to-r from-blue-950/80 via-slate-900 to-indigo-950/80 border border-blue-900/50 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400 animate-spin-slow shrink-0" />
            <h3 className="font-bold text-white text-base">Phân Tích Yếu Tố Tăng Trưởng (AI Growth Breakdown)</h3>
          </div>
          <span className="text-xs bg-blue-600/30 text-blue-300 border border-blue-500/40 px-2.5 py-1 rounded-xl font-mono font-bold shrink-0">
            LiveOps AI Insights
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-4 items-stretch">
          {getGrowthHighlights().map((h, i) => (
            <div
              key={i}
              className="bg-slate-900/90 border border-slate-800/90 p-4 rounded-xl flex flex-col justify-between space-y-2 hover:border-blue-500/40 transition-all h-full"
            >
              <div className="flex justify-between items-start gap-2 h-7">
                <h4 className="font-bold text-xs text-blue-300 leading-snug line-clamp-1">{h.title}</h4>
                <span className="text-[10px] bg-slate-800 text-slate-300 font-semibold px-2 py-0.5 rounded-md shrink-0">
                  {h.tag}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed min-h-[2.5rem] flex-1">{h.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
