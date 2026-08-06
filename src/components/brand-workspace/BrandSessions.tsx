import React, { useMemo, useState } from "react";
import {
  Brand,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  LiveSession,
  SessionFinance,
  Talent,
  TalentRateHistoryEntry
} from "../../types";
import { Radio } from "lucide-react";
import { computeSessionPnl } from "../../lib/pnl";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";

interface BrandSessionsProps {
  brandId: string;
  brand?: Brand;
  sessions: LiveSession[];
  talents: Talent[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  talentRateHistory: TalentRateHistoryEntry[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
}

const STATUS_STYLES: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-950 text-red-300 border-red-800",
  Upcoming: "bg-amber-950 text-amber-300 border-amber-800",
  Completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Cancelled: "bg-slate-800 text-slate-500 border-slate-700"
};

const STATUS_FILTERS: (LiveSession["status"] | "ALL")[] = ["ALL", "Live Now", "Upcoming", "Completed", "Cancelled"];

export const BrandSessions: React.FC<BrandSessionsProps> = ({
  brandId,
  brand,
  sessions,
  talents,
  financeRecords,
  brandPlatformRates,
  talentRateHistory,
  brandPlatformRateHistory
}) => {
  const [statusFilter, setStatusFilter] = useState<LiveSession["status"] | "ALL">("ALL");

  const brandSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.brandId === brandId)
        .filter((s) => statusFilter === "ALL" || s.status === statusFilter)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, brandId, statusFilter]
  );

  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);
  const financeBySessionId = useMemo(() => {
    const map: Record<string, SessionFinance> = {};
    for (const f of financeRecords) map[f.sessionId] = f;
    return map;
  }, [financeRecords]);
  const brandById = useMemo(() => (brand ? { [brand.id]: brand } : {}), [brand]);

  const rows = useMemo(
    () =>
      brandSessions.map((s) =>
        computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory)
      ),
    [brandSessions, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Radio className="w-5 h-5 text-blue-400" /> Sessions
        </h2>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              {s === "ALL" ? "Tất cả" : s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">Ngày</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2">Host</th>
                <th className="py-2.5 px-2 text-right">GMV thực tế</th>
                <th className="py-2.5 px-2 text-right">Doanh thu Agency</th>
                <th className="py-2.5 px-2 text-right">Trả Host</th>
                <th className="py-2.5 px-4 text-right">Lợi nhuận</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session.id} className="border-b border-slate-800/60">
                  <td className="py-2.5 px-4 text-slate-300 font-mono">
                    {r.session.date} {r.session.startTime}-{r.session.endTime}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.session.status]}`}>
                      {r.session.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300">{r.session.hostName}</td>
                  <td className="py-2.5 px-2 text-right text-slate-200 font-bold">{formatCurrencyAdaptive(r.session.actualGmv || 0)}</td>
                  <td className="py-2.5 px-2 text-right text-blue-400">{formatCurrencyAdaptive(r.grossAgencyRev)}</td>
                  <td className="py-2.5 px-2 text-right text-amber-400">{formatCurrencyAdaptive(r.hostPayout)}</td>
                  <td className={`py-2.5 px-4 text-right font-bold ${r.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrencyAdaptive(r.netProfit)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 italic">
                    Không có phiên live nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
