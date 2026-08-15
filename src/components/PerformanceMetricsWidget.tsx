import React from "react";
import {
  Radio,
  Eye,
  ShoppingBag,
  DollarSign,
  Activity,
  ArrowUpRight,
  TrendingUp,
  Users,
  Video,
  Zap
} from "lucide-react";
import { LiveSession } from "../types";

interface PerformanceMetricsWidgetProps {
  sessions: LiveSession[];
  onNavigateTab?: (tabId: string) => void;
}

export const PerformanceMetricsWidget: React.FC<PerformanceMetricsWidgetProps> = ({
  sessions,
  onNavigateTab
}) => {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0
    }).format(amount);
  };

  const liveNowSessions = sessions.filter((s) => s.status === "Live Now");
  const upcomingSessions = sessions.filter((s) => s.status === "Upcoming");
  const completedSessions = sessions.filter((s) => s.status === "Completed");

  const totalSessionsCount = sessions.length;
  const liveNowCount = liveNowSessions.length;

  // Revenue Metrics
  const totalTargetGmv = sessions.reduce((sum, s) => sum + (s.targetGmv || 0), 0);
  const totalActualGmv = sessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
  const gmvTargetAchievement =
    totalTargetGmv > 0 ? Math.round((totalActualGmv / totalTargetGmv) * 100) : 0;

  // Viewers & Engagement Metrics
  const totalPeakViewers = sessions.reduce((sum, s) => sum + (s.peakViewers || 0), 0);
  const avgPeakViewerCount =
    totalSessionsCount > 0 ? Math.round(totalPeakViewers / totalSessionsCount) : 0;

  const currentLivePeakViewers = liveNowSessions.reduce(
    (sum, s) => sum + (s.peakViewers || 0),
    0
  );

  const totalViews = sessions.reduce((sum, s) => sum + (s.totalViews || 0), 0);
  const avgViewsPerSession =
    totalSessionsCount > 0 ? Math.round(totalViews / totalSessionsCount) : 0;

  const totalOrders = sessions.reduce((sum, s) => sum + (s.totalOrders || 0), 0);

  const avgCtr =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + (s.ctrAvg || 0), 0) / sessions.length).toFixed(1)
      : "0.0";
  const avgCvr =
    sessions.length > 0
      ? (sessions.reduce((sum, s) => sum + (s.cvrAvg || 0), 0) / sessions.length).toFixed(1)
      : "0.0";

  return (
    <div className="bg-[var(--surface)]/95 border border-[var(--accent)]/30 rounded-3xl p-6 shadow-2xl space-y-5 relative overflow-hidden backdrop-blur-md">
      {/* Background glow effects */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-red-500/5 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-[var(--accent)]/5 rounded-full blur-3xl pointer-events-none"></div>

      {/* Widget Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)]/80 pb-4">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-[var(--text)] tracking-tight flex items-center gap-2">
                <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                Performance Metrics Widget
              </h2>
              <span className="bg-red-500/20 text-red-400 border border-red-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                LIVE NOW ({liveNowCount})
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              {totalSessionsCount} phiên livestream
            </p>
          </div>
        </div>

        {onNavigateTab && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab("dashboard")}
              className="px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-bold shadow-lg shadow-[var(--accent)]/20 transition-all flex items-center gap-1.5"
            >
              <Activity className="w-4 h-4 text-emerald-300" />
              <span>Xem Chi Tiết Studio LiveOps</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-[var(--accent-text)]" />
            </button>
          </div>
        )}
      </div>

      {/* Primary 3 Key Metrics + Detailed Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Metric 1: Total Revenue (Tổng Doanh Thu) */}
        <div className="bg-[var(--surface-base)]/80 p-4 rounded-2xl border border-emerald-500/30 hover:border-emerald-500/60 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              1. Total Revenue
            </span>
            <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="text-xl font-black text-emerald-400 truncate">
            {formatCurrency(totalActualGmv)}
          </div>
          <div className="mt-2 space-y-1 border-t border-[var(--border)] pt-1.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-[var(--text-muted)]">Target GMV:</span>
              <span className="text-[var(--text)] font-bold">{formatCurrency(totalTargetGmv)}</span>
            </div>
            <div className="w-full bg-[var(--surface-elevated)] h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(gmvTargetAchievement, 100)}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-[9px] font-bold">
              <span className="text-[var(--text-muted)]">Tiến độ KPI:</span>
              <span className="text-emerald-400">{gmvTargetAchievement}% Hoàn thành</span>
            </div>
          </div>
        </div>

        {/* Metric 2: Active Streams (Phiên Đang Phát) */}
        <div className="bg-[var(--surface-base)]/80 p-4 rounded-2xl border border-red-500/30 hover:border-red-500/60 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider">
              2. Active Streams
            </span>
            <div className="p-2 bg-red-500/10 rounded-xl border border-red-500/20 group-hover:scale-110 transition-transform">
              <Video className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-[var(--text)]">{liveNowCount}</span>
            <span className="text-[11px] text-red-400 font-bold">/ {totalSessionsCount} tổng phiên</span>
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)] space-y-1 border-t border-[var(--border)] pt-1.5">
            <div className="flex justify-between">
              <span>Đang phát:</span>
              <strong className="text-red-400">{liveNowCount} Studio</strong>
            </div>
            <div className="flex justify-between">
              <span>Sắp diễn ra:</span>
              <strong className="text-amber-400">{upcomingSessions.length} Studio</strong>
            </div>
          </div>
        </div>

        {/* Metric 3: Average Viewer Count (Lượt Mắt Xem Trung Bình) */}
        <div className="bg-[var(--surface-base)]/80 p-4 rounded-2xl border border-[var(--accent)]/30 hover:border-[var(--accent)]/60 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-[var(--accent-text)] uppercase tracking-wider">
              3. Avg Viewer Count
            </span>
            <div className="p-2 bg-[var(--accent)]/10 rounded-xl border border-[var(--accent)]/20 group-hover:scale-110 transition-transform">
              <Users className="w-4 h-4 text-[var(--accent-text)]" />
            </div>
          </div>
          <div className="text-2xl font-black text-[var(--accent-text)]">
            {avgPeakViewerCount.toLocaleString("vi-VN")}{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">người</span>
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)] space-y-1 border-t border-[var(--border)] pt-1.5">
            <div className="flex justify-between">
              <span>Mắt xem đang phát:</span>
              <strong className="text-[var(--accent-text)]">{currentLivePeakViewers.toLocaleString("vi-VN")}</strong>
            </div>
            <div className="flex justify-between">
              <span>Tổng lượt xem (Views):</span>
              <strong className="text-[var(--text)]">{totalViews.toLocaleString("vi-VN")}</strong>
            </div>
          </div>
        </div>

        {/* Metric 4: Total Orders (Tổng Đơn Hàng) */}
        <div className="bg-[var(--surface-base)]/80 p-4 rounded-2xl border border-blue-500/30 hover:border-blue-500/60 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
              Total Orders
            </span>
            <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20 group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-4 h-4 text-blue-400" />
            </div>
          </div>
          <div className="text-2xl font-black text-[var(--text)]">
            {totalOrders.toLocaleString("vi-VN")}{" "}
            <span className="text-xs font-normal text-[var(--text-muted)]">đơn</span>
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)] border-t border-[var(--border)] pt-1.5 flex items-center justify-between">
            <span>Trung bình/Phiên:</span>
            <strong className="text-blue-300">
              {totalSessionsCount > 0 ? Math.round(totalOrders / totalSessionsCount) : 0} đơn
            </strong>
          </div>
        </div>

        {/* Metric 5: Conversion Rates (CTR / CVR) */}
        <div className="bg-[var(--surface-base)]/80 p-4 rounded-2xl border border-amber-500/30 hover:border-amber-500/60 transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
              CTR &amp; CVR Avg
            </span>
            <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4 text-amber-400" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">CTR</div>
              <div className="text-lg font-black text-amber-300">{avgCtr}%</div>
            </div>
            <div className="h-6 w-[1px] bg-[var(--surface-elevated)]"></div>
            <div>
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-bold">CVR</div>
              <div className="text-lg font-black text-emerald-400">{avgCvr}%</div>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[var(--text-muted)] border-t border-[var(--border)] pt-1.5 flex items-center justify-between">
            <span>Hiệu năng AI:</span>
            <strong className="text-emerald-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Tối Ưu
            </strong>
          </div>
        </div>
      </div>

      {/* Live Spotlight Banner (if active stream) */}
      {liveNowSessions.length > 0 && (
        <div className="bg-[var(--surface-base)]/70 rounded-2xl p-3.5 border border-red-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3 min-w-[260px] grow md:grow-0">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div>
              <span className="text-[var(--text-muted)] text-[11px] font-medium">Phiên Phát Sóng Nổi Bật:</span>
              <h4 className="font-bold text-[var(--text)] text-xs truncate max-w-sm">
                {liveNowSessions[0].title}
              </h4>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[var(--text-muted)] text-[11px]">
            <div>
              Brand: <strong className="text-[var(--accent-text)]">{liveNowSessions[0].brandName}</strong>
            </div>
            <div>
              Host: <strong className="text-amber-300">{liveNowSessions[0].hostName}</strong>
            </div>
            <div>
              Mắt xem:{" "}
              <strong className="text-[var(--accent-text)]">
                {liveNowSessions[0].peakViewers.toLocaleString("vi-VN")}
              </strong>
            </div>
            <div>
              GMV:{" "}
              <strong className="text-emerald-400 font-black">
                {formatCurrency(liveNowSessions[0].actualGmv)}
              </strong>
            </div>
          </div>

          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab("dashboard")}
              className="text-[var(--accent-text)] hover:text-white font-bold text-xs flex items-center gap-1 bg-[var(--accent)]/60 hover:bg-[var(--accent-hover)]/60 px-3 py-1.5 rounded-xl border border-[var(--accent)]/40 transition-all"
            >
              <span>Xem LiveOps</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
