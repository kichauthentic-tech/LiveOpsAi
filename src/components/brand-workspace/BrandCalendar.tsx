import React, { useMemo, useState } from "react";
import { LiveSession, PromoScheme, Studio, Talent } from "../../types";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { schemesForDate } from "../../lib/schemeUtils";

interface BrandCalendarProps {
  brandId: string;
  sessions: LiveSession[];
  studios: Studio[];
  talents: Talent[];
  schemes?: PromoScheme[];
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const STATUS_STYLES: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-600 text-white",
  Upcoming: "bg-amber-600 text-white",
  Completed: "bg-emerald-700 text-white",
  Cancelled: "bg-slate-700 text-slate-300"
};

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

export const BrandCalendar: React.FC<BrandCalendarProps> = ({ brandId, sessions, studios, talents, schemes = [] }) => {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${`${today.getMonth() + 1}`.padStart(2, "0")}`);

  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);

  const studioById = useMemo(() => {
    const map: Record<string, Studio> = {};
    for (const s of studios) map[s.id] = s;
    return map;
  }, [studios]);
  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);
  const [y, m] = month.split("-").map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const leadingBlanks = firstDay.getDay();

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    brandSessions
      .filter((s) => s.date.startsWith(month))
      .forEach((s) => {
        const list = map.get(s.date) ?? [];
        list.push(s);
        map.set(s.date, list);
      });
    return map;
  }, [brandSessions, month]);

  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" /> Lịch Vận Hành
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">Chỉ hiện phiên live của riêng brand này.</p>
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
            onChange={(e) => setMonth(e.target.value)}
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
            if (day === null) return <div key={`b-${idx}`} className="min-h-[84px]" />;
            const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
            const daySessions = sessionsByDate.get(dateStr) ?? [];
            const daySchemes = schemesForDate(schemes, dateStr);
            return (
              <div key={dateStr} className="min-h-[84px] bg-slate-950/80 border border-slate-800 rounded-lg p-1.5 space-y-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 font-mono">{day}</span>
                  {daySchemes.length > 0 && (
                    <span
                      title={daySchemes.map((s) => `${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n")}
                      className="text-[9px] leading-none"
                    >
                      🏷️
                    </span>
                  )}
                </div>
                {daySessions.slice(0, 3).map((s) => (
                  <div
                    key={s.id}
                    title={`${s.startTime}-${s.endTime} • ${studioById[s.studioId]?.name ?? s.studioName} • Host ${
                      talentById[s.hostId]?.name ?? s.hostName
                    }`}
                    className={`text-[9px] font-bold px-1 py-0.5 rounded truncate ${STATUS_STYLES[s.status]}`}
                  >
                    {s.startTime} {s.hostName}
                  </div>
                ))}
                {daySessions.length > 3 && <span className="text-[9px] text-slate-500">+{daySessions.length - 3} khác</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        {(sessionsByDate.size === 0 || Array.from(sessionsByDate.values()).flat().length === 0) && (
          <p className="text-sm text-slate-500 text-center py-6">Không có phiên live nào trong tháng {month}.</p>
        )}
        {Array.from(sessionsByDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, list]) => (
            <div key={date} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 space-y-1.5">
              <p className="text-xs font-bold text-slate-300 font-mono">{date}</p>
              {list.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className={`px-2 py-0.5 rounded-full font-bold ${STATUS_STYLES[s.status]}`}>{s.status}</span>
                  <span>
                    {s.startTime}-{s.endTime}
                  </span>
                  <span>Host: {s.hostName}</span>
                  <span>Studio: {s.studioName}</span>
                  <span className="ml-auto font-bold text-emerald-400">{formatCurrencyAdaptive(s.actualGmv || 0)}</span>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
};
