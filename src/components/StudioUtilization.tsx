import React, { useMemo, useState } from "react";
import { LiveSession, Studio } from "../types";
import { sessionDurationHours } from "../lib/pnl";
import { BarChart3, ChevronLeft, ChevronRight, Gauge } from "lucide-react";

interface StudioUtilizationProps {
  studios: Studio[];
  sessions: LiveSession[];
}

interface DateRange {
  start: Date;
  end: Date;
}

const parseSessionDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const toDateInputValue = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

const isInRange = (dateStr: string, range: DateRange): boolean => {
  const d = parseSessionDate(dateStr);
  return d >= range.start && d <= range.end;
};

const fmtDate = (d: Date) => d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

export const StudioUtilization: React.FC<StudioUtilizationProps> = ({ studios, sessions }) => {
  const todayStr = toDateInputValue(new Date());
  const [periodType, setPeriodType] = useState<"week" | "month">("month");
  const [selectedMonth, setSelectedMonth] = useState(todayStr.slice(0, 7));
  const [weekAnchor, setWeekAnchor] = useState(todayStr);

  const range: DateRange = useMemo(() => {
    if (periodType === "week") {
      const start = startOfCalendarWeek(parseSessionDate(weekAnchor));
      return { start, end: addDays(start, 6) };
    }
    const [y, m] = selectedMonth.split("-").map(Number);
    return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
  }, [periodType, selectedMonth, weekAnchor]);

  const numDays = Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1;

  const shiftWeek = (delta: number) => setWeekAnchor(toDateInputValue(addDays(parseSessionDate(weekAnchor), delta * 7)));
  const shiftMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  };

  const studioStats = useMemo(() => {
    return studios
      .map((s) => {
        const studioSessions = sessions.filter(
          (sess) => sess.studioId === s.id && sess.status !== "Cancelled" && isInRange(sess.date, range)
        );
        const usedHours = studioSessions.reduce((sum, sess) => sum + sessionDurationHours(sess.startTime, sess.endTime), 0);
        const capacityHours = s.dailyAvailableHours * numDays;
        const utilizationPct = capacityHours > 0 ? (usedHours / capacityHours) * 100 : 0;
        return { studio: s, sessionsCount: studioSessions.length, usedHours, capacityHours, utilizationPct };
      })
      .sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [studios, sessions, range, numDays]);

  const totals = useMemo(() => {
    const usedHours = studioStats.reduce((sum, s) => sum + s.usedHours, 0);
    const capacityHours = studioStats.reduce((sum, s) => sum + s.capacityHours, 0);
    return { usedHours, capacityHours, utilizationPct: capacityHours > 0 ? (usedHours / capacityHours) * 100 : 0 };
  }, [studioStats]);

  const overloaded = studioStats.filter((s) => s.utilizationPct >= 85);
  const idle = studioStats.filter((s) => s.utilizationPct < 40 && s.capacityHours > 0);

  const badgeFor = (pct: number) => {
    if (pct >= 85) return { label: "Quá Tải", cls: "bg-red-500/20 text-red-300" };
    if (pct >= 40) return { label: "Tối Ưu", cls: "bg-emerald-500/20 text-emerald-300" };
    return { label: "Nhàn Rỗi", cls: "bg-amber-500/20 text-amber-300" };
  };

  const barColor = (pct: number) => (pct >= 85 ? "bg-red-500" : pct >= 40 ? "bg-emerald-500" : "bg-amber-500");

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-purple-400" /> Giai Đoạn 23: Studio Utilization & Capacity Planning
        </span>
        <h2 className="text-2xl font-black">Tỷ Lệ Lấp Đầy Studio</h2>
        <p className="text-xs text-slate-400">
          Số giờ live thật đã dùng / tổng giờ hoạt động khả dụng của từng studio — cơ sở quyết định đầu tư thêm studio hay tái phân bổ lịch.
        </p>
      </div>

      {/* Period selector */}
      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 text-xs font-bold">
          <button
            onClick={() => setPeriodType("week")}
            className={`px-4 py-2 rounded-xl transition-all ${periodType === "week" ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >
            Theo Tuần
          </button>
          <button
            onClick={() => setPeriodType("month")}
            className={`px-4 py-2 rounded-xl transition-all ${periodType === "month" ? "bg-purple-600 text-white shadow" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}
          >
            Theo Tháng
          </button>
        </div>

        {periodType === "week" ? (
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => shiftWeek(-1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={weekAnchor}
              onChange={(e) => setWeekAnchor(e.target.value)}
              className="p-2 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
            />
            <button onClick={() => shiftWeek(1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-slate-400 font-semibold">
              Tuần {fmtDate(range.start)} → {fmtDate(range.end)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <button onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="p-2 border border-slate-700 bg-slate-950 rounded-xl font-semibold text-slate-100"
            />
            <button onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Company-wide summary */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 font-semibold">Tổng Giờ Đã Dùng</span>
          <p className="text-2xl font-black text-slate-100 mt-1">{totals.usedHours.toFixed(1)}h</p>
          <p className="text-[10px] text-slate-500">/ {totals.capacityHours.toFixed(0)}h khả dụng</p>
        </div>
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 font-semibold">Tỷ Lệ Lấp Đầy Toàn Công Ty</span>
          <p className="text-2xl font-black text-slate-100 mt-1">{totals.utilizationPct.toFixed(1)}%</p>
        </div>
        <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm">
          <span className="text-xs text-slate-400 font-semibold">Studio Quá Tải / Nhàn Rỗi</span>
          <p className="text-2xl font-black text-slate-100 mt-1">
            <span className="text-red-400">{overloaded.length}</span> / <span className="text-amber-400">{idle.length}</span>
          </p>
        </div>
      </div>

      {overloaded.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/40 rounded-2xl p-4 text-xs text-red-200">
          🔥 <strong>{overloaded.map((s) => s.studio.name).join(", ")}</strong> đang lấp đầy ≥85% — cân nhắc đầu tư thêm studio hoặc dời bớt ca sang studio còn trống.
        </div>
      )}
      {idle.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 rounded-2xl p-4 text-xs text-amber-200">
          💤 <strong>{idle.map((s) => s.studio.name).join(", ")}</strong> đang lấp đầy &lt;40% — cân nhắc dồn lịch/quảng bá thêm trước khi đầu tư studio mới.
        </div>
      )}

      {/* Per-studio table */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" /> Chi Tiết Theo Studio
        </h3>
        {studioStats.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">Chưa có Studio nào để tính toán.</p>
        ) : (
          <div className="space-y-3">
            {studioStats.map(({ studio, sessionsCount, usedHours, capacityHours, utilizationPct }) => {
              const badge = badgeFor(utilizationPct);
              return (
                <div key={studio.id} className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-100">{studio.name}</span>
                      <span className="text-slate-500 ml-2">({studio.roomNumber})</span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${barColor(utilizationPct)}`}
                      style={{ width: `${Math.min(100, utilizationPct)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>
                      {usedHours.toFixed(1)}h / {capacityHours.toFixed(0)}h khả dụng ({studio.dailyAvailableHours}h/ngày × {numDays} ngày)
                    </span>
                    <span>
                      {utilizationPct.toFixed(1)}% · {sessionsCount} phiên
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
