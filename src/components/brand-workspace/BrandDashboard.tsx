import React, { useMemo, useState, useEffect } from "react";
import { Brand, LiveSession, Talent } from "../../types";
import {
  Store,
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  BarChart3,
  BarChart2,
  Eye,
  MousePointerClick,
  Target,
  Radio,
  ShoppingBag,
  Wifi,
  CalendarClock,
  Calendar,
  AlertTriangle,
  Award
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { computeGmvByDate } from "../../lib/gmvMetrics";
import { getTodayDate, getTodayMonth } from "../../lib/dateUtils";
import { GmvCalendar } from "../GmvCalendar";
import { GmvGrowthTrendline } from "../GmvGrowthTrendline";
import { PerformanceDeviationAlerts } from "../PerformanceDeviationAlerts";
import { KpiComparison } from "../KpiComparison";
import { BrandLogo } from "../ui/BrandLogo";

interface BrandDashboardProps {
  brandId: string;
  brand?: Brand;
  sessions: LiveSession[];
  /** Chỉ dùng avatar/tên/niches để hiển thị leaderboard Top Host — không đọc rate/commission (field nhạy cảm, xem talents_secure). */
  talents?: Talent[];
  onSelectSession?: (session: LiveSession) => void;
  /** Báo lên App khi tab đang mở có lịch GMV — App dùng để tự thu gọn sidebar. */
  onCalendarViewChange?: (isCalendarView: boolean) => void;
}

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `Th${m}/${y}`;
};

type TabKey = "overview" | "performance" | "gmv_forecast" | "alerts" | "gmv_calendar" | "kpi_comparison";

export const BrandDashboard: React.FC<BrandDashboardProps> = ({
  brandId,
  brand,
  sessions,
  talents = [],
  onSelectSession,
  onCalendarViewChange
}) => {
  const [tab, setTab] = useState<TabKey>("overview");

  // Tab "Lịch GMV" là lưới lịch 7 cột → báo lên App để sidebar tự thu gọn (đồng bộ hành vi với Agency Dashboard).
  useEffect(() => {
    onCalendarViewChange?.(tab === "gmv_calendar");
    return () => onCalendarViewChange?.(false);
  }, [tab, onCalendarViewChange]);

  const [month, setMonth] = useState(getTodayMonth());
  const thisMonth = getTodayMonth();
  const todayDate = getTodayDate();
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);

  const completedThisMonth = useMemo(
    () => brandSessions.filter((s) => s.status === "Completed" && s.date.startsWith(thisMonth)),
    [brandSessions, thisMonth]
  );

  const monthGmv = useMemo(() => completedThisMonth.reduce((acc, s) => acc + (s.actualGmv || 0), 0), [completedThisMonth]);

  const monthAov = useMemo(() => {
    const orders = completedThisMonth.reduce((acc, s) => acc + (s.totalOrders || 0), 0);
    return orders > 0 ? monthGmv / orders : 0;
  }, [completedThisMonth, monthGmv]);

  const momGrowthPct = useMemo(() => {
    const prevMonth = shiftMonth(thisMonth, -1);
    const prevGmv = brandSessions
      .filter((s) => s.status === "Completed" && s.date.startsWith(prevMonth))
      .reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    if (prevGmv <= 0) return null;
    return ((monthGmv - prevGmv) / prevGmv) * 100;
  }, [brandSessions, thisMonth, monthGmv]);

  const growthTrendData = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(thisMonth, i - 5);
      const gmv = brandSessions
        .filter((s) => s.status === "Completed" && s.date.startsWith(m))
        .reduce((acc, s) => acc + (s.actualGmv || 0), 0);
      return { month: monthLabel(m), gmv };
    });
  }, [brandSessions, thisMonth]);

  // Top Host cho riêng brand này — đồng bộ panel "Top Host Xuất Sắc" của Agency Dashboard (Dashboards.tsx),
  // nhưng xếp hạng theo GMV trung bình/phiên mà host đó tạo ra thật cho chính brand này, không phải avgGmvPerSession toàn agency.
  const topHostsForBrand = useMemo(() => {
    const byHost = new Map<string, { hostId: string; hostName: string; totalGmv: number; sessionCount: number; cvrSum: number }>();
    brandSessions
      .filter((s) => s.status === "Completed" && s.actualGmv > 0)
      .forEach((s) => {
        const entry = byHost.get(s.hostId) || { hostId: s.hostId, hostName: s.hostName, totalGmv: 0, sessionCount: 0, cvrSum: 0 };
        entry.totalGmv += s.actualGmv || 0;
        entry.sessionCount += 1;
        entry.cvrSum += s.cvrAvg || 0;
        byHost.set(s.hostId, entry);
      });
    return Array.from(byHost.values())
      .map((h) => ({
        ...h,
        avgGmv: h.totalGmv / h.sessionCount,
        avgCvr: h.cvrSum / h.sessionCount,
        talent: talents.find((t) => t.id === h.hostId)
      }))
      .sort((a, b) => b.avgGmv - a.avgGmv)
      .slice(0, 5);
  }, [brandSessions, talents]);

  const nextSession = useMemo(() => {
    const live = brandSessions.find((s) => s.status === "Live Now");
    if (live) return live;
    return brandSessions
      .filter((s) => s.status === "Upcoming" && s.date >= todayDate)
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0];
  }, [brandSessions, todayDate]);

  const selectedMonthSessions = useMemo(
    () => brandSessions.filter((s) => s.date.startsWith(month)),
    [brandSessions, month]
  );

  const performanceSummary = useMemo(() => {
    const withData = selectedMonthSessions.filter((s) => s.peakViewers > 0 || s.totalViews > 0 || s.actualGmv > 0);
    const avgPeak = withData.length ? Math.round(withData.reduce((sum, s) => sum + (s.peakViewers || 0), 0) / withData.length) : 0;
    const avgCtr = withData.length ? withData.reduce((sum, s) => sum + (s.ctrAvg || 0), 0) / withData.length : 0;
    const avgCvr = withData.length ? withData.reduce((sum, s) => sum + (s.cvrAvg || 0), 0) / withData.length : 0;
    const completed = selectedMonthSessions.filter((s) => s.status === "Completed");
    const totalGmv = completed.reduce((acc, s) => acc + (s.actualGmv || 0), 0);
    const totalOrders = completed.reduce((acc, s) => acc + (s.totalOrders || 0), 0);
    const avgAov = totalOrders > 0 ? totalGmv / totalOrders : 0;
    return { avgPeak, avgCtr, avgCvr, completedCount: completed.length, avgAov };
  }, [selectedMonthSessions]);

  const dailyTrendData = useMemo(() => {
    const gmvByDate = computeGmvByDate(selectedMonthSessions);
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dateStr = `${month}-${`${i + 1}`.padStart(2, "0")}`;
      const day = gmvByDate.get(dateStr);
      return { day: `${i + 1}`, target: day?.target || 0, actual: day?.actual || 0 };
    });
  }, [selectedMonthSessions, month]);

  // Cùng ngưỡng lệch KPI với Agency Dashboard (Dashboards.tsx) để badge cảnh báo nhất quán.
  const deviatingSessionsCount = useMemo(
    () =>
      brandSessions.filter((s) => {
        if (s.targetGmv > 0 && (s.actualGmv > 0 || s.status === "Live Now")) {
          const devPct = Math.abs((s.actualGmv - s.targetGmv) / s.targetGmv);
          return devPct >= 0.2;
        }
        return false;
      }).length,
    [brandSessions]
  );

  const brandOnly = useMemo(() => (brand ? [brand] : []), [brand]);

  if (!brand) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-10 text-center text-sm text-[var(--text-muted)]">
        Không tìm thấy dữ liệu Brand này.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex items-center gap-4 shadow-xl">
        <BrandLogo brand={brand} size="lg" />
        <div>
          <h2 className="text-xl font-black text-[var(--text)]">{brand.name}</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {brand.industry} • {brand.contactName} • Hợp đồng: <span className="text-[var(--success)] font-bold">{brand.contractStatus}</span>
          </p>
        </div>
      </div>

      {/* Thanh sub-tab đồng bộ pattern với Agency Dashboard (Dashboards.tsx `subTabHeader`) — mỗi tab giữ 1 màu nhận diện riêng. */}
      <div className="flex flex-wrap items-center gap-2 bg-[var(--surface)]/90 p-2 rounded-2xl border border-[var(--border)] shadow-md">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            tab === "overview"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          <LayoutDashboard className="w-4 h-4" />
          <span>Tổng Quan</span>
        </button>

        <button
          onClick={() => setTab("performance")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            tab === "performance"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Báo Cáo Hiệu Suất</span>
        </button>

        <button
          onClick={() => setTab("gmv_forecast")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            tab === "gmv_forecast"
              ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          <TrendingUp className="w-4 h-4 text-purple-400" />
          <span>Dự Báo GMV 30 Ngày</span>
          <span className="bg-purple-500 text-white font-black text-[9px] px-1.5 py-0.5 rounded-md uppercase">
            30D Trend
          </span>
        </button>

        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 relative ${
            tab === "alerts"
              ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30 font-black"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
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
          onClick={() => setTab("gmv_calendar")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            tab === "gmv_calendar"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          <Calendar className="w-4 h-4 text-blue-400" />
          <span>Lịch GMV Target/Actual</span>
        </button>

        <button
          onClick={() => setTab("kpi_comparison")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            tab === "kpi_comparison"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
              : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-elevated)]"
          }`}
        >
          <BarChart2 className="w-4 h-4 text-emerald-400" />
          <span>So Sánh KPI Theo Kỳ</span>
        </button>
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-[var(--accent)]/10 to-[var(--surface)] border border-[var(--accent)]/30 rounded-2xl p-5 shadow-xl">
              <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> GMV tháng {thisMonth}
              </span>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{formatCurrencyAdaptive(monthGmv)}</p>
              {momGrowthPct !== null && (
                <p
                  className={`text-xs font-bold mt-1 flex items-center gap-1 ${
                    momGrowthPct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                  }`}
                >
                  {momGrowthPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {momGrowthPct >= 0 ? "+" : ""}
                  {momGrowthPct.toFixed(1)}% so tháng trước
                </p>
              )}
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
              <span className="text-[var(--warning)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4" /> AOV trung bình tháng này
              </span>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{formatCurrencyAdaptive(monthAov)}</p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5">
              <span className="text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-4 h-4" /> Tổng GMV tích luỹ
              </span>
              <p className="text-2xl font-black text-[var(--text)] mt-1">{formatCurrencyAdaptive(brand.totalGmv)}</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-[var(--text)]">Xu Hướng GMV 6 Tháng Gần Nhất</h3>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTrendData}>
                  <defs>
                    <linearGradient id="brandGmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="var(--text-faint)" fontSize={11} />
                  <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={56} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrencyAdaptive(Number(value)), "GMV"]}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="gmv" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#brandGmvGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="font-bold text-[var(--text)] text-sm flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" /> Top Host Xuất Sắc Cho {brand.name}
            </h3>
            {topHostsForBrand.length === 0 ? (
              <div className="p-4 bg-[var(--surface-elevated)]/40 border border-[var(--border)] rounded-xl text-center text-xs text-[var(--text-muted)] italic">
                Chưa có phiên live hoàn thành để xếp hạng host.
              </div>
            ) : (
              <div className="space-y-2">
                {topHostsForBrand.map((h, i) => (
                  <div
                    key={h.hostId}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surface-elevated)]/40 border border-[var(--border)]"
                  >
                    <div className="flex items-center space-x-3">
                      <span className="font-black text-xs text-[var(--text-muted)] w-4">#{i + 1}</span>
                      {h.talent?.avatar ? (
                        <img src={h.talent.avatar} alt={h.hostName} className="w-9 h-9 rounded-full object-cover border border-[var(--accent)]/40" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[var(--surface-base)] border border-[var(--accent)]/40 flex items-center justify-center text-xs font-bold text-[var(--text-muted)]">
                          {h.hostName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <h4 className="font-bold text-[var(--text)] text-xs">{h.hostName}</h4>
                        <p className="text-[10px] text-[var(--text-muted)]">{h.sessionCount} phiên live cho {brand.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-xs text-emerald-600">{formatCurrencyAdaptive(h.avgGmv)}/live</div>
                      <div className="text-[10px] text-[var(--text-muted)]">CVR: {h.avgCvr.toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-xl">
            <span className="text-[var(--text-muted)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
              {nextSession?.status === "Live Now" ? <Wifi className="w-4 h-4 text-[var(--danger)]" /> : <CalendarClock className="w-4 h-4" />}
              Đang Vận Hành Cho Bạn
            </span>
            {nextSession ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[var(--text)] font-bold flex items-center gap-2">
                    {nextSession.status === "Live Now" && (
                      <span className="text-[10px] bg-[var(--danger)] text-white px-1.5 py-0.5 rounded font-black animate-pulse">LIVE</span>
                    )}
                    {nextSession.title}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {nextSession.date} • {nextSession.startTime}-{nextSession.endTime} • Host: {nextSession.hostName} • {nextSession.platform}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-faint)]">Chưa có phiên live nào sắp tới được lên lịch.</p>
            )}
          </div>
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <span className="text-red-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Số phiên live
              </span>
              <p className="text-xl font-black text-[var(--text)] mt-1">{performanceSummary.completedCount}</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <span className="text-[var(--accent-text)] font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> PCU trung bình
              </span>
              <p className="text-xl font-black text-[var(--text)] mt-1">{performanceSummary.avgPeak.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <span className="text-sky-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5" /> CTR trung bình
              </span>
              <p className="text-xl font-black text-[var(--text)] mt-1">{performanceSummary.avgCtr.toFixed(1)}%</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <span className="text-emerald-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> CVR trung bình
              </span>
              <p className="text-xl font-black text-[var(--text)] mt-1">{performanceSummary.avgCvr.toFixed(1)}%</p>
            </div>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
              <span className="text-amber-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" /> AOV trung bình
              </span>
              <p className="text-xl font-black text-[var(--text)] mt-1">{formatCurrencyAdaptive(performanceSummary.avgAov)}</p>
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text)]">Xu Hướng GMV Theo Ngày — Target vs Actual</h3>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">
                Đọc nhanh xu hướng theo tuần/tháng của {brand.name} trong {month}. Xem dạng lịch đầy đủ ở tab "Lịch GMV Target/Actual".
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData}>
                  <XAxis dataKey="day" stroke="var(--text-faint)" fontSize={10} interval={1} />
                  <YAxis stroke="var(--text-faint)" fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={56} />
                  <Tooltip
                    formatter={(value: any, name: string) => [formatCurrencyAdaptive(Number(value)), name === "target" ? "Target" : "Actual"]}
                    labelFormatter={(d) => `Ngày ${d}`}
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }}
                  />
                  <Legend formatter={(v) => (v === "target" ? "Target" : "Actual")} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="target" fill="var(--border)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {tab === "gmv_forecast" && (
        <GmvGrowthTrendline sessions={brandSessions} brands={brandOnly} hideCommission hideBrandFilter />
      )}

      {tab === "alerts" && (
        <PerformanceDeviationAlerts
          sessions={brandSessions}
          onSelectSession={onSelectSession ?? (() => {})}
        />
      )}

      {tab === "gmv_calendar" && (
        <GmvCalendar
          sessions={brandSessions}
          title="Lịch GMV: Target vs Actual"
          subtitle={`Theo dõi target/actual GMV từng ngày của ${brand.name} và tiến độ dự phóng cuối tháng.`}
          month={month}
          onMonthChange={setMonth}
        />
      )}

      {tab === "kpi_comparison" && <KpiComparison brands={brandOnly} sessions={brandSessions} />}
    </div>
  );
};
