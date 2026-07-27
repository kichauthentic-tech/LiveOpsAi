import React, { useState, useMemo } from "react";
import { UserRole, LiveSession, Studio, Brand, Talent } from "../types";
import {
  TrendingUp,
  DollarSign,
  Radio,
  Building2,
  Users,
  Award,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Activity,
  ArrowUpRight,
  Clock,
  BarChart2,
  LayoutDashboard
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { KpiComparison } from "./KpiComparison";
import { GmvGrowthTrendline } from "./GmvGrowthTrendline";
import { PerformanceDeviationAlerts } from "./PerformanceDeviationAlerts";

interface DashboardsProps {
  currentRole: UserRole;
  sessions: LiveSession[];
  studios: Studio[];
  brands: Brand[];
  talents: Talent[];
  onSelectSession: (session: LiveSession) => void;
  onNavigateTab?: (tab: string) => void;
}

const WEEKLY_GMV_DATA = [
  { day: "Thứ 2", gmv: 320 },
  { day: "Thứ 3", gmv: 450 },
  { day: "Thứ 4", gmv: 390 },
  { day: "Thứ 5", gmv: 610 },
  { day: "Thứ 6", gmv: 890 },
  { day: "Thứ 7", gmv: 1250 },
  { day: "Chủ Nhật", gmv: 1420 }
];

const STUDIO_OCCUPANCY_DATA = [
  { studio: "Studio A (Beauty)", hours: 8.5, capacity: 10 },
  { studio: "Studio B (Fashion)", hours: 6.0, capacity: 10 },
  { studio: "Studio C (Tech/Home)", hours: 7.0, capacity: 10 }
];

export const Dashboards: React.FC<DashboardsProps> = ({
  currentRole,
  sessions,
  studios,
  brands,
  talents,
  onSelectSession,
  onNavigateTab
}) => {
  const [dashboardSubTab, setDashboardSubTab] = useState<"overview" | "gmv_forecast" | "kpi_comparison" | "alerts">("overview");
  const liveSessions = sessions.filter((s) => s.status === "Live Now");
  const liveSession = liveSessions[0] || sessions[0] || null;
  const totalActualGmv = sessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  const totalCommission = Math.round(totalActualGmv * 0.15);
  const totalSessionsCount = sessions.length;
  const liveCount = sessions.filter((s) => s.status === "Live Now").length;
  const upcomingCount = sessions.filter((s) => s.status === "Upcoming").length;
  const occupancyHours = (sessions.length * 2.5).toFixed(1);
  const occupancyRate = studios.length > 0 ? Math.min(100, Math.round((sessions.length * 2.5) / (studios.length * 10) * 100)) : 0;

  const weeklyGmvData = useMemo(() => {
    if (sessions.length === 0) {
      return [
        { day: "Thứ 2", gmv: 0 },
        { day: "Thứ 3", gmv: 0 },
        { day: "Thứ 4", gmv: 0 },
        { day: "Thứ 5", gmv: 0 },
        { day: "Thứ 6", gmv: 0 },
        { day: "Thứ 7", gmv: 0 },
        { day: "Chủ Nhật", gmv: 0 }
      ];
    }
    const days = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"];
    return days.map((day, idx) => {
      const dayGmv = sessions.filter((_, sIdx) => sIdx % 7 === idx).reduce((acc, s) => acc + (s.actualGmv || 0), 0);
      return { day, gmv: Math.round(dayGmv / 1000000) };
    });
  }, [sessions]);

  // Calculate count of sessions with >20% deviation
  const deviatingSessionsCount = sessions.filter((s) => {
    if (s.targetGmv > 0 && (s.actualGmv > 0 || s.status === "Live Now")) {
      const devPct = Math.abs((s.actualGmv - s.targetGmv) / s.targetGmv);
      return devPct >= 0.20;
    }
    return false;
  }).length;

  const subTabHeader = (
    <div className="flex flex-wrap items-center justify-between bg-slate-900/90 p-2 rounded-2xl border border-slate-800 shadow-md mb-4 gap-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setDashboardSubTab("overview")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            dashboardSubTab === "overview"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Tổng Quan Dashboard</span>
        </button>

        <button
          onClick={() => setDashboardSubTab("gmv_forecast")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            dashboardSubTab === "gmv_forecast"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <span>Dự Báo GMV 30 Ngày</span>
          <span className="bg-purple-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-md uppercase">
            30D Trend
          </span>
        </button>

        <button
          onClick={() => setDashboardSubTab("alerts")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
            dashboardSubTab === "alerts"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30 font-black"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Cảnh Báo Lệch KPI</span>
          {deviatingSessionsCount > 0 && (
            <span className="bg-red-500 text-white font-black text-[10px] px-2 py-0.5 rounded-full animate-bounce">
              {deviatingSessionsCount} Alerts (&gt;20%)
            </span>
          )}
        </button>

        <button
          onClick={() => setDashboardSubTab("kpi_comparison")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            dashboardSubTab === "kpi_comparison"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <span>So Sánh KPI Theo Kỳ</span>
        </button>
      </div>

      <div className="text-[11px] text-slate-400 font-medium hidden sm:block pr-3">
        Giao diện xem theo vai trò: <strong className="text-blue-400 uppercase font-bold">{currentRole}</strong>
      </div>
    </div>
  );

  if (dashboardSubTab === "alerts") {
    return (
      <div className="space-y-6">
        {subTabHeader}
        <PerformanceDeviationAlerts sessions={sessions} onSelectSession={onSelectSession} />
      </div>
    );
  }

  if (dashboardSubTab === "gmv_forecast") {
    return (
      <div className="space-y-6">
        {subTabHeader}
        <GmvGrowthTrendline sessions={sessions} brands={brands} />
      </div>
    );
  }

  if (dashboardSubTab === "kpi_comparison") {
    return (
      <div className="space-y-6">
        {subTabHeader}
        <KpiComparison brands={brands} studios={studios} sessions={sessions} />
      </div>
    );
  }

  // Role: CEO / Director
  if (currentRole === "ceo") {
    return (
      <div className="space-y-6">
        {subTabHeader}

        {/* CEO Top Banner */}
        <div className="flex flex-wrap items-center justify-between bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg gap-4">
          <div>
            <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block">Executive Dashboard</span>
            <h2 className="text-2xl font-black">Báo Cáo Tổng Quan Giám Đốc (CEO Dashboard)</h2>
            <p className="text-slate-400 text-xs mt-1">
              3 Studio hoạt động · Net Margin 24.5%
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Real-time P&L Synced
            </span>
          </div>
        </div>

        {/* Performance Deviation Alert Bar */}
        <PerformanceDeviationAlerts sessions={sessions} onSelectSession={onSelectSession} isCompact={true} />

        {/* CEO Key Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Tổng GMV Hiện Tại</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-slate-100">{totalActualGmv.toLocaleString()} đ</div>
            <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> {sessions.length > 0 ? "Thống kê từ " + sessions.length + " phiên live" : "Chưa có dữ liệu phiên live"}
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Doanh Thu Agency (Commission)</span>
              <DollarSign className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-black text-slate-100">{totalCommission.toLocaleString()} đ</div>
            <div className="text-xs text-slate-400 font-medium">Commission ước tính: 15%</div>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Công Suất Studio (Occupancy)</span>
              <Building2 className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black text-slate-100">{occupancyRate}%</div>
            <div className="text-xs text-indigo-600 font-medium">{occupancyHours}h / {studios.length * 10}h công suất khôi phục</div>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-2">
            <div className="flex justify-between items-center text-slate-400 text-xs font-medium">
              <span>Tổng Số Phiên Livestream</span>
              <Radio className="w-4 h-4 text-red-500" />
            </div>
            <div className="text-2xl font-black text-slate-100">{totalSessionsCount} Phiên</div>
            <div className="text-xs text-red-500 font-bold">{liveCount} Đang Live | {upcomingCount} Sắp Live</div>
          </div>
        </div>

        {/* 30-Day GMV Projection & Historical Trendline */}
        <GmvGrowthTrendline sessions={sessions} brands={brands} />

        {/* Charts Section */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* GMV Trend Chart */}
          <div className="lg:col-span-2 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Xu Hướng Doanh Thu GMV Theo Tuần (Triệu VNĐ)</h3>
              </div>
              <span className="text-xs font-bold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-lg">Tuần Hiện Tại / 2026</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyGmvData}>
                  <defs>
                    <linearGradient id="gmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip formatter={(value: any) => [`${value} Triệu đ`, "GMV"]} />
                  <Area type="monotone" dataKey="gmv" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#gmvGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top Hosts Leaderboard */}
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-1.5">
                <Award className="w-5 h-5 text-amber-500" /> Top Host Xuất Sắc
              </h3>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab("talents")}
                  className="text-xs text-purple-600 font-semibold hover:underline"
                >
                  Xem tất cả
                </button>
              )}
            </div>
            <div className="space-y-3">
              {talents.length === 0 ? (
                <div className="p-4 bg-slate-800/40 border border-slate-800 rounded-xl text-center text-xs text-slate-400 italic">
                  Chưa có thông tin Host. Thêm Host mới trong tab Talent Pool.
                </div>
              ) : (
                talents.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-800">
                    <div className="flex items-center space-x-3">
                      <span className="font-black text-xs text-slate-400 w-4">#{i+1}</span>
                      <img src={t.avatar} alt={t.name} className="w-9 h-9 rounded-full object-cover border border-purple-300" />
                      <div>
                        <h4 className="font-bold text-slate-100 text-xs">{t.name}</h4>
                        <p className="text-[10px] text-slate-400">
                          {Array.isArray(t.niches) ? t.niches.join(", ") : String(t.niches || t.role || "Đa ngành")}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-xs text-emerald-600">{(t.avgGmvPerSession / 1000000).toFixed(0)}M đ/live</div>
                      <div className="text-[10px] text-slate-400">CVR: {t.cvrAvg}%</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Active Session Quick Monitor */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl border border-purple-700/50 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 animate-ping"></span>
              <h3 className="font-extrabold text-lg">
                Giám Sát {liveSessions.length} Phiên Live Đang Phát Sóng (Real-time Session Monitor)
              </h3>
            </div>
            {liveSession && (
              <button
                onClick={() => onSelectSession(liveSession)}
                className="bg-white text-slate-900 font-bold px-4 py-2 rounded-xl text-xs hover:bg-slate-100 transition-all shadow"
              >
                Mở Chi Tiết Operational Graph →
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4 pt-2">
            {liveSessions.length === 0 ? (
              <div className="md:col-span-2 p-6 bg-white/5 border border-white/10 rounded-xl text-center text-xs text-purple-200">
                Hiện chưa có phiên livestream nào đang phát sóng. Hãy tạo phiên live mới trong tab <strong className="text-white">Live Sessions</strong> để bắt đầu thử nghiệm.
              </div>
            ) : (
              liveSessions.map((ls) => {
              const devPct = ls.targetGmv > 0 ? ((ls.actualGmv - ls.targetGmv) / ls.targetGmv) * 100 : 0;
              const isDeviating = Math.abs(devPct) >= 20;

              return (
                <div
                  key={ls.id}
                  onClick={() => onSelectSession(ls)}
                  className="bg-white/10 hover:bg-white/15 border border-white/10 hover:border-purple-400 p-4 rounded-xl cursor-pointer transition-all space-y-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-purple-300 font-bold text-[11px] block">{ls.studioName}</span>
                      <h4 className="font-black text-white text-base mt-0.5">{ls.brandName}</h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isDeviating && (
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          devPct >= 20 ? "bg-emerald-500/30 text-emerald-300 border border-emerald-400/50" : "bg-red-500/30 text-red-300 border border-red-400/50 animate-pulse"
                        }`}>
                          {devPct >= 20 ? `⚡ +${devPct.toFixed(0)}%` : `🚨 ${devPct.toFixed(0)}%`}
                        </span>
                      )}
                      <span className="bg-red-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Radio className="w-3 h-3 animate-pulse" /> LIVE NOW
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2 text-xs">
                    <div className="bg-slate-900/60 p-2 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Host:</span>
                      <strong className="text-white truncate block">{ls.hostName}</strong>
                    </div>
                    <div className="bg-slate-900/60 p-2 rounded-lg">
                      <span className="text-slate-400 text-[10px] block">Peak CCU:</span>
                      <strong className="text-indigo-300 block">{ls.peakViewers.toLocaleString()}</strong>
                    </div>
                    <div className="bg-emerald-500/20 border border-emerald-400/40 p-2 rounded-lg">
                      <span className="text-emerald-200 text-[10px] block">GMV Thực Thu:</span>
                      <strong className="text-emerald-300 font-bold block">{ls.actualGmv.toLocaleString()} đ</strong>
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        </div>

        {/* Embedded Period KPI Comparison Component */}
        <KpiComparison brands={brands} studios={studios} />
      </div>
    );
  }

  // Role: Operations Manager
  if (currentRole === "operations") {
    return (
      <div className="space-y-6">
        {subTabHeader}
        <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-lg flex flex-wrap justify-between items-center gap-4">
          <div>
            <span className="text-indigo-400 font-semibold text-xs uppercase tracking-wider block">Operations Center</span>
            <h2 className="text-2xl font-black">Trung Tâm Vận Hành Studio & Equipment</h2>
            <p className="text-slate-400 text-xs mt-1">3 Studio · 52 thiết bị</p>
          </div>
          <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-xl text-xs font-semibold">
            Status: ALL SYSTEMS NOMINAL
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {studios.map((s) => (
            <div key={s.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-slate-400 font-medium">{s.roomNumber}</span>
                  <h3 className="font-bold text-slate-100 text-base">{s.name}</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                  s.status === "Live Now" ? "bg-red-500/20 text-red-300 animate-pulse" :
                  s.status === "Booked" ? "bg-amber-500/20 text-amber-300" :
                  "bg-emerald-500/20 text-emerald-300"
                }`}>
                  {s.status}
                </span>
              </div>
              <p className="text-xs text-slate-300 bg-slate-800/40 p-2.5 rounded-xl border border-slate-800">{s.theme}</p>
              <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-slate-800">
                <span>Thiết bị đã gắn: <strong>{s.equipmentCount} món</strong></span>
                <span>Sức chứa: <strong>{s.capacity} người</strong></span>
              </div>
            </div>
          ))}
        </div>

        {/* Studio Occupancy Chart */}
        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-100 text-base">Thời Gian Vận Hành Lịch Live Studio Hôm Nay (Giờ)</h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STUDIO_OCCUPANCY_DATA}>
                <XAxis dataKey="studio" stroke="#94a3b8" fontSize={12} />
                <YAxis stroke="#94a3b8" fontSize={12} />
                <Tooltip formatter={(val: any) => [`${val} Giờ`, "Thời gian sử dụng"]} />
                <Bar dataKey="hours" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // Role: Brand Client Portal
  if (currentRole === "brand") {
    return (
      <div className="space-y-6">
        {subTabHeader}
        <div className="bg-emerald-950 text-white p-6 rounded-2xl border border-emerald-800 shadow-lg flex flex-wrap justify-between items-center gap-4">
          <div>
            <span className="text-emerald-400 font-semibold text-xs uppercase tracking-wider block">Brand Client Portal</span>
            <h2 className="text-2xl font-black">Cổng Thông Tin Đối Tác Nhãn Hàng: Cocoon Vietnam</h2>
          </div>
          <span className="bg-emerald-800/80 text-emerald-200 border border-emerald-600 px-3 py-1.5 rounded-xl text-xs font-semibold">
            Đại diện KAM: Lê Quốc Bảo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
            <span className="text-xs text-slate-400 font-medium block">Tổng GMV Đã Tích Lũy</span>
            <div className="text-2xl font-black text-slate-100">1,250,000,000 đ</div>
            <span className="text-[10px] text-emerald-600 font-semibold">Vượt 115% KPI Cam Kết</span>
          </div>
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
            <span className="text-xs text-slate-400 font-medium block">Tổng Số Đơn Hàng Thành Công</span>
            <div className="text-2xl font-black text-slate-100">4,320 Đơn</div>
            <span className="text-[10px] text-slate-400">Tỷ lệ hủy/hoàn: 2.1% (Mức an toàn)</span>
          </div>
          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
            <span className="text-xs text-slate-400 font-medium block">ROI Trung Bình Trận Live</span>
            <div className="text-2xl font-black text-emerald-600">6.8x</div>
            <span className="text-[10px] text-slate-400">Doanh thu / Chi phí Agency</span>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-100 text-base">Lịch Sử Phiên Live & Video Replay</h3>
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="p-4 rounded-xl border border-slate-800 flex flex-wrap justify-between items-center gap-4 hover:border-emerald-400 transition-all">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100 text-sm">{s.title}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      s.status === "Live Now" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{s.hostName} · {s.studioName} · {s.date}</p>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-black text-emerald-600 text-sm">{s.actualGmv.toLocaleString()} VNĐ</div>
                  <button onClick={() => onSelectSession(s)} className="text-xs font-bold text-purple-600 hover:underline">
                    Xem Báo Cáo Phút-Theo-Phút →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Role: Talent / Host Portal
  return (
    <div className="space-y-6">
      {subTabHeader}
      <div className="bg-amber-950 text-white p-6 rounded-2xl border border-amber-800 shadow-lg flex flex-wrap justify-between items-center gap-4">
        <div>
          <span className="text-amber-400 font-semibold text-xs uppercase tracking-wider block">Host & Talent Portal</span>
          <h2 className="text-2xl font-black">Giao Diện Host Livestream: Yến Nhi (Nhi Nham Nho)</h2>
        </div>
        <div className="bg-amber-800/80 px-4 py-2 rounded-xl text-right">
          <span className="text-[10px] text-amber-200 block">Xếp hạng Host:</span>
          <strong className="text-lg font-black text-amber-300">SCORE 94/100 (TOP 1)</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-400 font-medium block">Thu Nhập Commission Dự Kiến</span>
          <div className="text-2xl font-black text-emerald-600">32,500,000 đ</div>
          <span className="text-[10px] text-slate-400">Tháng 07/2026 (12 phiên live)</span>
        </div>
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-400 font-medium block">Tỷ Lệ Chuyển Đổi Trung Bình (CVR)</span>
          <div className="text-2xl font-black text-purple-600">5.4%</div>
          <span className="text-[10px] text-emerald-600 font-medium">Cao hơn 1.8% so với trung bình ngành</span>
        </div>
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm space-y-1">
          <span className="text-xs text-slate-400 font-medium block">Thời Gian Giữ Chân Khán Giả</span>
          <div className="text-2xl font-black text-indigo-600">3 Phút 04 Giây</div>
          <span className="text-[10px] text-slate-400">Giữ mắt xem ổn định top 1 agency</span>
        </div>
      </div>

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-100 text-base">AI Host Coaching & Feedback Mới Nhất</h3>
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-3 text-xs text-purple-200">
          <p className="leading-relaxed font-medium">
            &quot;Host Yến Nhi biểu cảm rất cuốn hút, phản xạ đọc comment mượt mà. Tuy nhiên ở phút 20-25 cần lưu ý tránh giải thích thuật ngữ chuyên ngành Skincare quá lâu. Tăng thời lượng swatch son/test sản phẩm lên da trực tiếp trước ống kính!&quot;
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-purple-800/50 font-bold">
            <div>Chốt Đơn: <span className="text-purple-300">92/100</span></div>
            <div>Năng Lượng: <span className="text-purple-300">96/100</span></div>
            <div>Kiến Thức Sản Phẩm: <span className="text-purple-300">90/100</span></div>
            <div>Tốc Độ Nói: <span className="text-purple-300">82/100</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};
