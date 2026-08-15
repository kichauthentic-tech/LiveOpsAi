import React, { useState, useMemo } from "react";
import { LiveSession, Brand } from "../types";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine
} from "recharts";
import {
  TrendingUp,
  Target,
  Sparkles,
  Calendar,
  Filter,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  BarChart3
} from "lucide-react";

interface GmvGrowthTrendlineProps {
  sessions: LiveSession[];
  brands: Brand[];
}

export const GmvGrowthTrendline: React.FC<GmvGrowthTrendlineProps> = ({ sessions, brands }) => {
  const [selectedBrandId, setSelectedBrandId] = useState<string>("all");
  const [scenario, setScenario] = useState<"target" | "aggressive" | "conservative">("target");
  const [viewType, setViewType] = useState<"daily" | "cumulative">("daily");

  // Calculate base daily average from historical sessions
  const filteredSessions = useMemo(() => {
    if (selectedBrandId === "all") return sessions;
    return sessions.filter((s) => s.brandId === selectedBrandId);
  }, [sessions, selectedBrandId]);

  const historicalStats = useMemo(() => {
    const totalHistoricalGmv = filteredSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    const completedCount = filteredSessions.filter((s) => s.status === "Completed" || s.status === "Live Now").length || 1;
    const avgGmvPerSession = totalHistoricalGmv / completedCount;

    return {
      totalHistoricalGmv,
      completedCount,
      avgGmvPerSession
    };
  }, [filteredSessions]);

  /** Real GMV actually recorded per calendar date ("YYYY-MM-DD" -> total actualGmv). */
  const gmvByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSessions) {
      if (!s.date) continue;
      map.set(s.date, (map.get(s.date) || 0) + (s.actualGmv || 0));
    }
    return map;
  }, [filteredSessions]);

  const dateKeyFor = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Scenario Multipliers
  const scenarioMultiplier = {
    conservative: 1.08, // +8%
    target: 1.18,       // +18%
    aggressive: 1.32    // +32%
  }[scenario];

  // Real actuals for the trailing 15 days + a mathematical projection model for the next 15 days.
  // The model side is inherently an estimate — there is no "real data" for the future — so it is
  // clearly labeled as a forecast in the UI (see CustomTooltip and the disclaimer below the chart).
  const chartData = useMemo(() => {
    const data = [];
    const today = new Date();
    const baseDailyGmv = filteredSessions.length > 0 && historicalStats.totalHistoricalGmv > 0
      ? Math.max(10, Math.round(historicalStats.avgGmvPerSession / 1000000))
      : 0; // in Millions VNĐ

    let cumulativeActual = 0;
    let cumulativeProjected = 0;
    let cumulativeAggressive = 0;

    for (let day = 1; day <= 30; day++) {
      // Day label formatting
      const isToday = day === 15;
      const dayLabel = day === 15 ? "D15 (Hôm nay)" : `Ngày ${day}`;

      // Weekend/mid-month multipliers used only for the future projection model
      const weekendBoost = (day % 7 === 6 || day % 7 === 0) ? 1.35 : 0.95;
      const midMonthPeak = (day >= 12 && day <= 16) ? 1.25 : 1.0;

      // Projected Daily GMV calculation (estimate, not historical fact)
      const projectedDaily = Math.round(baseDailyGmv * weekendBoost * midMonthPeak * scenarioMultiplier);
      const aggressiveDaily = Math.round(baseDailyGmv * weekendBoost * midMonthPeak * 1.35);

      // Actual GMV for past 15 days (Day 1 = 14 days ago ... Day 15 = today), read from real sessions
      let actualDaily: number | null = null;
      if (day <= 15) {
        const calendarDate = new Date(today);
        calendarDate.setDate(calendarDate.getDate() - (15 - day));
        const realGmv = gmvByDate.get(dateKeyFor(calendarDate)) || 0;
        actualDaily = Math.round(realGmv / 1000000);
        cumulativeActual += actualDaily;
      }

      cumulativeProjected += projectedDaily;
      cumulativeAggressive += aggressiveDaily;

      data.push({
        dayNumber: day,
        dayLabel,
        isToday,
        isFuture: day > 15,
        actualGmv: actualDaily,
        projectedGmv: projectedDaily,
        stretchGoalGmv: aggressiveDaily,
        cumActualGmv: day <= 15 ? cumulativeActual : null,
        cumProjectedGmv: cumulativeProjected,
        cumAggressiveGmv: cumulativeAggressive
      });
    }

    return data;
  }, [filteredSessions, historicalStats, gmvByDate, scenarioMultiplier]);

  // Key KPI Metrics Calculations
  const metrics = useMemo(() => {
    const actual15Days = chartData.filter((d) => d.dayNumber <= 15).reduce((acc, d) => acc + (d.actualGmv || 0), 0);
    const projected30Days = chartData[chartData.length - 1]?.cumProjectedGmv || 0;
    const targetKpi = sessions.length > 0 
      ? Math.max(1000, Math.round(sessions.reduce((acc, s) => acc + (s.targetGmv || 0), 0) / 1000000)) 
      : 0; // Target KPI in Millions VNĐ
    const pacingPercent = targetKpi > 0 ? Math.round((projected30Days / targetKpi) * 100) : 0;
    const estCommission = Math.round(projected30Days * 0.15); // 15% agency commission

    return {
      actual15Days,
      projected30Days,
      targetKpi,
      pacingPercent,
      estCommission
    };
  }, [chartData]);

  // Custom Tooltip Renderer
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      return (
        <div className="bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] p-3.5 rounded-xl shadow-2xl text-xs space-y-2 min-w-[200px]">
          <div className="font-bold border-b border-[var(--border)] pb-1.5 flex justify-between items-center text-[var(--text-muted)]">
            <span>{label}</span>
            {dataPoint.isFuture ? (
              <span className="bg-purple-900/80 text-purple-300 text-[10px] px-2 py-0.5 rounded font-semibold">Dự báo 30 ngày</span>
            ) : (
              <span className="bg-emerald-900/80 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-semibold">Thực tế đã diễn ra</span>
            )}
          </div>

          <div className="space-y-1">
            {dataPoint.actualGmv !== null && (
              <div className="flex justify-between items-center font-bold text-emerald-400">
                <span>Thực tế ({viewType === "daily" ? "Ngày" : "Cộng dồn"}):</span>
                <span>{(viewType === "daily" ? dataPoint.actualGmv : dataPoint.cumActualGmv)?.toLocaleString()}M đ</span>
              </div>
            )}
            <div className="flex justify-between items-center text-purple-300 font-semibold">
              <span>Dự báo Target ({viewType === "daily" ? "Ngày" : "Cộng dồn"}):</span>
              <span>{(viewType === "daily" ? dataPoint.projectedGmv : dataPoint.cumProjectedGmv)?.toLocaleString()}M đ</span>
            </div>
            <div className="flex justify-between items-center text-amber-300 text-[11px]">
              <span>Kịch bản bứt phá:</span>
              <span>{(viewType === "daily" ? dataPoint.stretchGoalGmv : dataPoint.cumAggressiveGmv)?.toLocaleString()}M đ</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 pb-4 border-b border-[var(--border)]">
        <div className="shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-purple-900/40 text-purple-300 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </span>
            <div>
              <h3 className="font-black text-[var(--text)] text-lg whitespace-nowrap">
                Dự Báo Tăng Trưởng GMV 30 Ngày
              </h3>
            </div>
          </div>
        </div>

        {/* Filters & Scenario Selector */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Brand Filter */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-elevated)] px-3 py-1.5 rounded-xl border border-[var(--border)]">
            <Filter className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <select
              value={selectedBrandId}
              onChange={(e) => setSelectedBrandId(e.target.value)}
              className="bg-transparent font-bold text-[var(--text)] outline-none cursor-pointer"
            >
              <option value="all">Tất cả Brands Đối Tác</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.logo} {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scenario Buttons */}
          <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setScenario("conservative")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                scenario === "conservative" ? "bg-[var(--surface-hover)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              🛡️ An Toàn (+8%)
            </button>
            <button
              onClick={() => setScenario("target")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                scenario === "target" ? "bg-purple-600 text-white shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              🎯 Target Plan (+18%)
            </button>
            <button
              onClick={() => setScenario("aggressive")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                scenario === "aggressive" ? "bg-amber-500 text-slate-950 shadow-sm font-black" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              🚀 Bứt Phá (+32%)
            </button>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center bg-[var(--surface-elevated)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={() => setViewType("daily")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                viewType === "daily" ? "bg-[var(--surface-base)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Theo Ngày
            </button>
            <button
              onClick={() => setViewType("cumulative")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                viewType === "cumulative" ? "bg-[var(--surface-base)] text-[var(--text)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              Cộng Dồn 30 Ngày
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-[var(--surface-elevated)]/50 border border-[var(--border)] space-y-1">
          <span className="text-[var(--text-muted)] text-xs font-semibold block">GMV Thực Tế (15 Ngày Đầu)</span>
          <div className="text-xl font-black text-emerald-400">
            {formatCurrencyAdaptive(metrics.actual15Days * 1_000_000, "VNĐ")}
          </div>
          <span className="text-[10px] text-[var(--text-muted)] font-medium">Lấy trực tiếp từ các phiên livestream đã hoàn thành</span>
        </div>

        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-1">
          <span className="text-purple-300 text-xs font-semibold block">Dự Báo Tổng 30 Ngày</span>
          <div className="text-xl font-black text-purple-200">
            {formatCurrencyAdaptive(metrics.projected30Days * 1_000_000, "VNĐ")}
          </div>
          <span className="text-[10px] text-purple-400 font-bold flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> Kịch bản {scenario.toUpperCase()} (+{scenario === "target" ? "18" : scenario === "aggressive" ? "32" : "8"}%)
          </span>
        </div>

        <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-800/50 space-y-1">
          <span className="text-indigo-300 text-xs font-semibold block">Tỷ Lệ Đạt KPI (Pacing Rate)</span>
          <div className="text-xl font-black text-indigo-200">
            {metrics.pacingPercent}%
          </div>
          <span className="text-[10px] text-indigo-400 font-medium">So với chỉ tiêu KPI 7.5 Tỷ VNĐ / Tháng</span>
        </div>

        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 space-y-1">
          <span className="text-amber-300 text-xs font-semibold block">Hoa Hồng Agency Dự Kiến (15%)</span>
          <div className="text-xl font-black text-amber-200">
            {formatCurrencyAdaptive(metrics.estCommission * 1_000_000, "VNĐ")}
          </div>
          <span className="text-[10px] text-amber-400 font-medium">Commission cơ sở ước tính</span>
        </div>
      </div>

      {/* Main Recharts Trendline Chart */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs text-[var(--text-muted)] font-medium px-1">
          <span>Trục Y: Doanh Thu GMV (Triệu VNĐ)</span>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-[var(--text-muted)] font-bold">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span> GMV Thực Tế (Historical Actual)
            </span>
            <span className="flex items-center gap-1.5 text-purple-600 font-bold">
              <span className="w-3 h-1 border-b-2 border-dashed border-purple-600 inline-block"></span> GMV Dự Báo (30-Day Forecast)
            </span>
            <span className="flex items-center gap-1.5 text-amber-600 font-bold">
              <span className="w-3 h-1 border-b-2 border-dotted border-amber-500 inline-block"></span> Mục Tiêu Bứt Phá
            </span>
          </div>
        </div>

        <div className="h-80 w-full bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-inner">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="actualGmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--success)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="projectedGmvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
              <XAxis dataKey="dayLabel" stroke="var(--text-muted)" fontSize={11} tickMargin={8} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={(val) => `${val}M`} />
              <Tooltip content={<CustomTooltip />} />

              {/* Today Marker Line */}
              <ReferenceLine
                x="D15 (Hôm nay)"
                stroke="var(--danger)"
                strokeDasharray="4 4"
                strokeWidth={2}
                label={{
                  value: "📍 HÔM NAY",
                  fill: "var(--danger)",
                  fontSize: 10,
                  fontWeight: "bold",
                  position: "top"
                }}
              />

              {/* Actual GMV Area / Line */}
              <Area
                type="monotone"
                dataKey={viewType === "daily" ? "actualGmv" : "cumActualGmv"}
                stroke="var(--success)"
                strokeWidth={3.5}
                fillOpacity={1}
                fill="url(#actualGmvGrad)"
                name="Thực Tế (Actual)"
                connectNulls={false}
              />

              {/* Projected GMV Line */}
              <Line
                type="monotone"
                dataKey={viewType === "daily" ? "projectedGmv" : "cumProjectedGmv"}
                stroke="#8b5cf6"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={{ r: 3, fill: "#8b5cf6" }}
                name="Dự Báo Target"
              />

              {/* Stretch Goal Aggressive Line */}
              <Line
                type="monotone"
                dataKey={viewType === "daily" ? "stretchGoalGmv" : "cumAggressiveGmv"}
                stroke="var(--warning)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                dot={false}
                name="Kịch Bản Bứt Phá"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI Executive Predictive Insights Callout */}
      <div className="bg-[var(--surface)] text-[var(--text)] p-4 rounded-xl border border-[var(--border)] flex items-start gap-3 text-xs">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-bold text-[var(--text)] flex items-center gap-2">
            <span>Dự Báo Theo Mô Hình Toán Học (Không Phải Số Liệu Đã Xảy Ra)</span>
            <span className="bg-purple-900/90 text-purple-300 text-[10px] px-2 py-0.5 rounded font-mono">
              Ước tính
            </span>
          </div>
          <p className="text-[var(--text-muted)] leading-relaxed">
            Dựa trên <strong>{historicalStats.completedCount} phiên livestream lịch sử</strong> gần nhất, tốc độ GMV trung bình đạt{" "}
            <strong>{Math.round(historicalStats.avgGmvPerSession / 1000000)}M VNĐ/phiên</strong>. Nếu duy trì đúng kịch bản{" "}
            <strong className="text-purple-300">{scenario.toUpperCase()}</strong>, tổng GMV 30 ngày tới ước tính (mô hình toán, không phải số liệu thực) đạt{" "}
            <strong className="text-emerald-400">{formatCurrencyAdaptive(metrics.projected30Days * 1_000_000, "VNĐ")}</strong>{" "}
            {metrics.pacingPercent > 100
              ? `(vượt KPI đề ra ${metrics.pacingPercent - 100}%)`
              : `(đạt ${metrics.pacingPercent}% KPI đề ra)`}.
          </p>
        </div>
      </div>
    </div>
  );
};
