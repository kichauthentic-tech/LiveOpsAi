import React, { useMemo, useState } from "react";
import { LiveSession, UserRole } from "../../types";
import { Radio, X } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { SessionReportForm } from "../SessionReportForm";
import { SessionReportInput } from "../../lib/db/sessionReports";

interface BrandSessionsProps {
  brandId: string;
  sessions: LiveSession[];
  currentRole: UserRole;
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
}

const CAN_EDIT_REPORT_ROLES: UserRole[] = ["ceo", "operations", "admin"];

const STATUS_STYLES: Record<LiveSession["status"], string> = {
  "Live Now": "bg-red-950 text-red-300 border-red-800",
  Upcoming: "bg-amber-950 text-amber-300 border-amber-800",
  Completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  Cancelled: "bg-slate-800 text-slate-500 border-slate-700"
};

const STATUS_FILTERS: (LiveSession["status"] | "ALL")[] = ["ALL", "Live Now", "Upcoming", "Completed", "Cancelled"];

export const BrandSessions: React.FC<BrandSessionsProps> = ({ brandId, sessions, currentRole, onSubmitSessionReport }) => {
  const [statusFilter, setStatusFilter] = useState<LiveSession["status"] | "ALL">("ALL");
  const [reportSessionId, setReportSessionId] = useState<string | null>(null);
  const canEditReport = CAN_EDIT_REPORT_ROLES.includes(currentRole);

  const rows = useMemo(
    () =>
      sessions
        .filter((s) => s.brandId === brandId)
        .filter((s) => statusFilter === "ALL" || s.status === statusFilter)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, brandId, statusFilter]
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
                <th className="py-2.5 px-2">Nền tảng</th>
                <th className="py-2.5 px-2">Host</th>
                <th className="py-2.5 px-2 text-right">Target GMV</th>
                <th className="py-2.5 px-2 text-right">GMV thực tế</th>
                <th className="py-2.5 px-2 text-right">Peak Viewers</th>
                <th className="py-2.5 px-4 text-right">CTR / CVR</th>
                {canEditReport && <th className="py-2.5 px-4 text-right">Report</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60">
                  <td className="py-2.5 px-4 text-slate-300 font-mono">
                    {s.date} {s.startTime}-{s.endTime}
                  </td>
                  <td className="py-2.5 px-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLES[s.status]}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300">{s.platform}</td>
                  <td className="py-2.5 px-2 text-slate-300">{s.hostName}</td>
                  <td className="py-2.5 px-2 text-right text-slate-400">{formatCurrencyAdaptive(s.targetGmv || 0)}</td>
                  <td className="py-2.5 px-2 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(s.actualGmv || 0)}</td>
                  <td className="py-2.5 px-2 text-right text-indigo-300">{(s.peakViewers || 0).toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-slate-300">
                    {(s.ctrAvg || 0)}% / {(s.cvrAvg || 0)}%
                  </td>
                  {canEditReport && (
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setReportSessionId(s.id)}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors"
                      >
                        {s.report ? "Sửa" : "Nhập"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEditReport ? 9 : 8} className="py-8 text-center text-slate-500 italic">
                    Không có phiên live nào khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reportSessionId &&
        (() => {
          const session = rows.find((s) => s.id === reportSessionId);
          if (!session) return null;
          return (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-white">
                    Report Ca — {session.date} {session.startTime}-{session.endTime} ({session.hostName || "—"})
                  </h3>
                  <button onClick={() => setReportSessionId(null)} className="text-slate-500 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SessionReportForm
                  session={session}
                  onSubmit={(input) => onSubmitSessionReport(session.id, input)}
                  onCancel={() => setReportSessionId(null)}
                />
              </div>
            </div>
          );
        })()}
    </div>
  );
};
