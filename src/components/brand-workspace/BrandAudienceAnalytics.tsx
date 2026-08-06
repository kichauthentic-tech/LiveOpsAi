import React, { useMemo, useState } from "react";
import { LiveSession } from "../../types";
import { BarChart3 } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";

interface BrandAudienceAnalyticsProps {
  brandId: string;
  sessions: LiveSession[];
}

const STATUS_FILTERS: (LiveSession["status"] | "ALL")[] = ["ALL", "Live Now", "Upcoming", "Completed", "Cancelled"];

export const BrandAudienceAnalytics: React.FC<BrandAudienceAnalyticsProps> = ({ brandId, sessions }) => {
  const [statusFilter, setStatusFilter] = useState<LiveSession["status"] | "ALL">("Completed");

  const brandSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.brandId === brandId)
        .filter((s) => statusFilter === "ALL" || s.status === statusFilter)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [sessions, brandId, statusFilter]
  );

  const summary = useMemo(() => {
    const withData = brandSessions.filter((s) => s.peakViewers > 0 || s.totalViews > 0 || s.actualGmv > 0);
    const avgPeak = withData.length ? Math.round(withData.reduce((sum, s) => sum + (s.peakViewers || 0), 0) / withData.length) : 0;
    const avgCtr = withData.length ? withData.reduce((sum, s) => sum + (s.ctrAvg || 0), 0) / withData.length : 0;
    const avgCvr = withData.length ? withData.reduce((sum, s) => sum + (s.cvrAvg || 0), 0) / withData.length : 0;
    const totalGmv = brandSessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);
    return { avgPeak, avgCtr, avgCvr, totalGmv, missingCount: brandSessions.length - withData.length };
  }, [brandSessions]);

  return (
    <div className="space-y-5">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-purple-400" /> Live Audience & Conversion Analytics
        </span>
        <h2 className="text-2xl font-black">Hiệu Suất Xem & Chuyển Đổi</h2>
        <p className="text-slate-400 text-xs">
          PCU (đỉnh người xem), CTR/CVR trung bình, GMV thực nhận theo từng phiên live — nhập tay bởi Ops sau mỗi phiên, chưa tích hợp TikTok
          API thật.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500">PCU trung bình</div>
          <div className="text-xl font-black text-white">{summary.avgPeak.toLocaleString("vi-VN")}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500">CTR trung bình</div>
          <div className="text-xl font-black text-white">{summary.avgCtr.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500">CVR trung bình</div>
          <div className="text-xl font-black text-white">{summary.avgCvr.toFixed(1)}%</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="text-[11px] text-slate-500">Tổng GMV thực nhận</div>
          <div className="text-xl font-black text-emerald-400">{formatCurrencyAdaptive(summary.totalGmv)}</div>
        </div>
      </div>
      {summary.missingCount > 0 && (
        <p className="text-[11px] text-amber-400">
          {summary.missingCount} phiên trong bộ lọc hiện tại chưa có số liệu (Ops chưa nhập tay sau live) — không tính vào trung bình.
        </p>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">Ngày</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                <th className="py-2.5 px-2 text-right">PCU</th>
                <th className="py-2.5 px-2 text-right">Tổng lượt xem</th>
                <th className="py-2.5 px-2 text-right">CTR</th>
                <th className="py-2.5 px-2 text-right">CVR</th>
                <th className="py-2.5 px-4 text-right">GMV thực nhận</th>
              </tr>
            </thead>
            <tbody>
              {brandSessions.map((s) => {
                const hasData = s.peakViewers > 0 || s.totalViews > 0 || s.actualGmv > 0;
                return (
                  <tr key={s.id} className="border-b border-slate-800/60">
                    <td className="py-2.5 px-4 text-slate-300 font-mono">
                      {s.date} {s.startTime}-{s.endTime}
                    </td>
                    <td className="py-2.5 px-2 text-slate-400">{s.status}</td>
                    {hasData ? (
                      <>
                        <td className="py-2.5 px-2 text-right text-slate-200 font-bold">{(s.peakViewers || 0).toLocaleString("vi-VN")}</td>
                        <td className="py-2.5 px-2 text-right text-slate-300">{(s.totalViews || 0).toLocaleString("vi-VN")}</td>
                        <td className="py-2.5 px-2 text-right text-slate-300">{(s.ctrAvg || 0).toFixed(1)}%</td>
                        <td className="py-2.5 px-2 text-right text-slate-300">{(s.cvrAvg || 0).toFixed(1)}%</td>
                        <td className="py-2.5 px-4 text-right text-emerald-400 font-bold">{formatCurrencyAdaptive(s.actualGmv || 0)}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-2.5 px-2 text-slate-600 italic">
                        Chưa có số liệu
                      </td>
                    )}
                  </tr>
                );
              })}
              {brandSessions.length === 0 && (
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
