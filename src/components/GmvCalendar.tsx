import React, { useMemo, useState } from "react";
import { LiveSession } from "../types";
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { computeGmvByDate, DailyGmv } from "../lib/gmvMetrics";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../lib/campaignDays";

interface GmvCalendarProps {
  sessions: LiveSession[];
  title?: string;
  subtitle?: string;
  month?: string;
  onMonthChange?: (month: string) => void;
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

const getTodayMonth = () => new Date().toISOString().slice(0, 7);
const getTodayDate = () => new Date().toISOString().slice(0, 10);

const cellTone = (day: DailyGmv | undefined, dateStr: string, todayDate: string) => {
  if (!day || day.sessionCount === 0) return "bg-slate-950/50 border-slate-800/70";
  if (day.target === 0) return "bg-slate-900 border-slate-800";
  const pct = day.actual / day.target;
  if (dateStr > todayDate) return "bg-slate-900 border-slate-800"; // tương lai, chưa live
  if (pct >= 1) return "bg-emerald-950/60 border-emerald-800/60";
  if (pct >= 0.7) return "bg-amber-950/50 border-amber-800/50";
  return "bg-red-950/50 border-red-900/50";
};

export const GmvCalendar: React.FC<GmvCalendarProps> = ({
  sessions,
  title = "Lịch GMV: Target vs Actual",
  subtitle = "Theo dõi target/actual GMV từng ngày và tiến độ dự phóng cuối tháng.",
  month: controlledMonth,
  onMonthChange
}) => {
  const [internalMonth, setInternalMonth] = useState(getTodayMonth());
  const month = controlledMonth ?? internalMonth;
  const setMonth = (updater: (mo: string) => string) => {
    const next = updater(month);
    if (onMonthChange) onMonthChange(next);
    else setInternalMonth(next);
  };
  const todayDate = getTodayDate();
  const todayMonth = getTodayMonth();

  const gmvByDate = useMemo(() => computeGmvByDate(sessions), [sessions]);

  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = firstDay.getDay();
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const monthSummary = useMemo(() => {
    let target = 0;
    let actual = 0;
    let targetElapsed = 0;
    let actualElapsed = 0;
    let daysElapsed = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${`${d}`.padStart(2, "0")}`;
      const day = gmvByDate.get(dateStr);
      if (!day) continue;
      target += day.target;
      actual += day.actual;
      if (month === todayMonth && dateStr <= todayDate) {
        targetElapsed += day.target;
        actualElapsed += day.actual;
      }
    }
    if (month === todayMonth) daysElapsed = Number(todayDate.slice(8, 10));

    const achievedPct = target > 0 ? (actual / target) * 100 : 0;

    let projectedEom: number | null = null;
    let projectedPct: number | null = null;
    if (month === todayMonth && daysElapsed > 0 && daysElapsed < daysInMonth) {
      const avgDailyActual = actualElapsed / daysElapsed;
      projectedEom = avgDailyActual * daysInMonth;
      projectedPct = target > 0 ? (projectedEom / target) * 100 : null;
    }

    return { target, actual, achievedPct, targetElapsed, actualElapsed, projectedEom, projectedPct, daysElapsed };
  }, [gmvByDate, month, daysInMonth, todayMonth, todayDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-400" /> {title}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMonth((mo) => shiftMonth(mo, -1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(() => e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setMonth((mo) => shiftMonth(mo, 1))}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
          <span className="text-blue-400 font-semibold text-xs uppercase tracking-wider">Target tháng</span>
          <p className="text-2xl font-black text-white">{formatCurrencyAdaptive(monthSummary.target)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
          <span className="text-emerald-400 font-semibold text-xs uppercase tracking-wider">Actual tháng</span>
          <p className="text-2xl font-black text-white">{formatCurrencyAdaptive(monthSummary.actual)}</p>
          <p className="text-xs text-slate-500">{monthSummary.achievedPct.toFixed(0)}% target</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
          <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Dự phóng cuối tháng
          </span>
          {monthSummary.projectedEom !== null ? (
            <>
              <p className="text-2xl font-black text-white">{formatCurrencyAdaptive(monthSummary.projectedEom)}</p>
              <p className="text-xs text-slate-500">
                {monthSummary.projectedPct !== null ? `${monthSummary.projectedPct.toFixed(0)}% target` : "—"} • run-rate {monthSummary.daysElapsed} ngày đã qua
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500 pt-1">
              {month === todayMonth ? "Chưa đủ dữ liệu ngày đã qua." : "Chỉ tính dự phóng cho tháng hiện tại."}
            </p>
          )}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="grid grid-cols-7 gap-1.5 text-[10px] font-bold text-slate-500 uppercase mb-1.5">
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} className="text-center py-1">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`b-${idx}`} className="min-h-[76px]" />;
            const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
            const daily = gmvByDate.get(dateStr);
            const pct = daily && daily.target > 0 ? Math.round((daily.actual / daily.target) * 100) : null;
            const isToday = dateStr === todayDate;
            const campaignDay = getCampaignDayInfo(dateStr);
            return (
              <div
                key={dateStr}
                title={campaignDay?.label}
                className={`min-h-[76px] border rounded-lg p-1.5 space-y-0.5 ${cellTone(daily, dateStr, todayDate)} ${
                  isToday ? "ring-1 ring-blue-500" : campaignDay ? CAMPAIGN_DAY_STYLES[campaignDay.type].ring : ""
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] text-slate-500 font-mono">{day}</span>
                  {campaignDay && (
                    <span
                      className={`text-[8px] font-bold px-1 rounded leading-tight ${CAMPAIGN_DAY_STYLES[campaignDay.type].badge}`}
                    >
                      {campaignDay.shortLabel}
                    </span>
                  )}
                </div>
                {daily && daily.sessionCount > 0 ? (
                  <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 leading-tight">Target: {formatCurrencyAdaptive(daily.target)}</p>
                    <p className="text-[9px] font-bold text-white leading-tight">Actual: {formatCurrencyAdaptive(daily.actual)}</p>
                    {pct !== null && dateStr <= todayDate && (
                      <p
                        className={`text-[9px] font-black leading-tight ${
                          pct >= 100 ? "text-emerald-400" : pct >= 70 ? "text-amber-400" : "text-red-400"
                        }`}
                      >
                        {pct}%
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-[9px] text-slate-600 italic">—</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
