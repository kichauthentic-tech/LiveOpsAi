import React, { useMemo, useState } from "react";
import { Brand, LiveSession } from "../../types";
import {
  Store,
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  BarChart3,
  Eye,
  MousePointerClick,
  Target,
  Radio,
  ShoppingBag,
  Wifi,
  CalendarClock
} from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { computeGmvByDate } from "../../lib/gmvMetrics";
import { GmvCalendar } from "../GmvCalendar";

interface BrandDashboardProps {
  brandId: string;
  brand?: Brand;
  sessions: LiveSession[];
}

const getTodayMonth = () => new Date().toISOString().slice(0, 7);
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const monthLabel = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `Th${m}/${y}`;
};

type TabKey = "overview" | "performance";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Tổng Quan", icon: LayoutDashboard },
  { key: "performance", label: "Báo Cáo Hiệu Suất", icon: BarChart3 }
];

export const BrandDashboard: React.FC<BrandDashboardProps> = ({ brandId, brand, sessions }) => {
  const [tab, setTab] = useState<TabKey>("overview");
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

  if (!brand) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
        Không tìm thấy dữ liệu Brand này.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex items-center gap-4 shadow-xl">
        <span className="text-4xl">{brand.logo || "🏷️"}</span>
        <div>
          <h2 className="text-xl font-black text-white">{brand.name}</h2>
          <p className="text-xs text-slate-400">
            {brand.industry} • {brand.contactName} • Hợp đồng: <span className="text-emerald-400 font-bold">{brand.contractStatus}</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold transition-colors ${
              tab === key
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-950/60 to-slate-900 border border-blue-900/40 rounded-2xl p-5 shadow-xl">
              <span className="text-blue-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" /> GMV tháng {thisMonth}
              </span>
              <p className="text-2xl font-black text-white mt-1">{formatCurrencyAdaptive(monthGmv)}</p>
              {momGrowthPct !== null && (
                <p
                  className={`text-xs font-bold mt-1 flex items-center gap-1 ${
                    momGrowthPct >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {momGrowthPct >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                  {momGrowthPct >= 0 ? "+" : ""}
                  {momGrowthPct.toFixed(1)}% so tháng trước
                </p>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <span className="text-amber-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-4 h-4" /> AOV trung bình tháng này
              </span>
              <p className="text-2xl font-black text-white mt-1">{formatCurrencyAdaptive(monthAov)}</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
                <Store className="w-4 h-4" /> Tổng GMV tích luỹ
              </span>
              <p className="text-2xl font-black text-white mt-1">{formatCurrencyAdaptive(brand.totalGmv)}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-white">Xu Hướng GMV 6 Tháng Gần Nhất</h3>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growthTrendData}>
                  <defs>
                    <linearGradient id="brandGmvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={56} />
                  <Tooltip
                    formatter={(value: any) => [formatCurrencyAdaptive(Number(value)), "GMV"]}
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="gmv" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#brandGmvGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5 mb-3">
              {nextSession?.status === "Live Now" ? <Wifi className="w-4 h-4 text-red-400" /> : <CalendarClock className="w-4 h-4" />}
              Đang Vận Hành Cho Bạn
            </span>
            {nextSession ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-white font-bold flex items-center gap-2">
                    {nextSession.status === "Live Now" && (
                      <span className="text-[10px] bg-red-600 text-white px-1.5 py-0.5 rounded font-black animate-pulse">LIVE</span>
                    )}
                    {nextSession.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {nextSession.date} • {nextSession.startTime}-{nextSession.endTime} • Host: {nextSession.hostName} • {nextSession.platform}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Chưa có phiên live nào sắp tới được lên lịch.</p>
            )}
          </div>
        </div>
      )}

      {tab === "performance" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-red-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5" /> Số phiên live
              </span>
              <p className="text-xl font-black text-white mt-1">{performanceSummary.completedCount}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-purple-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> PCU trung bình
              </span>
              <p className="text-xl font-black text-white mt-1">{performanceSummary.avgPeak.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-sky-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <MousePointerClick className="w-3.5 h-3.5" /> CTR trung bình
              </span>
              <p className="text-xl font-black text-white mt-1">{performanceSummary.avgCtr.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-emerald-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> CVR trung bình
              </span>
              <p className="text-xl font-black text-white mt-1">{performanceSummary.avgCvr.toFixed(1)}%</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <span className="text-amber-400 font-semibold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" /> AOV trung bình
              </span>
              <p className="text-xl font-black text-white mt-1">{formatCurrencyAdaptive(performanceSummary.avgAov)}</p>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white">Xu Hướng GMV Theo Ngày — Target vs Actual</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Đọc nhanh xu hướng theo tuần/tháng của {brand.name} trong {month}. Dùng cùng bộ lọc tháng với lịch bên dưới.
              </p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData}>
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={10} interval={1} />
                  <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(v) => formatCurrencyAdaptive(v)} width={56} />
                  <Tooltip
                    formatter={(value: any, name: string) => [formatCurrencyAdaptive(Number(value)), name === "target" ? "Target" : "Actual"]}
                    labelFormatter={(d) => `Ngày ${d}`}
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                  />
                  <Legend formatter={(v) => (v === "target" ? "Target" : "Actual")} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="target" fill="#334155" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <GmvCalendar
            sessions={brandSessions}
            title="Lịch GMV: Target vs Actual"
            subtitle={`Theo dõi target/actual GMV từng ngày của ${brand.name} và tiến độ dự phóng cuối tháng.`}
            month={month}
            onMonthChange={setMonth}
          />
        </div>
      )}
    </div>
  );
};
