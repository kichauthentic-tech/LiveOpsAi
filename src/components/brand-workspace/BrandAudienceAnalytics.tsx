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
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-purple-400" /> Live Audience & Conversion Analytics
        </span>
        <h2 className="text-2xl font-black">Hiệu Suất Xem & Chuyển Đổi</h2>
        <p className="text-[var(--text-muted)] text-xs">
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
              statusFilter === s
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            {s === "ALL" ? "Tất cả" : s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="text-[11px] text-[var(--text-faint)]">PCU trung bình</div>
          <div className="text-xl font-black text-[var(--text)]">{summary.avgPeak.toLocaleString("vi-VN")}</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="text-[11px] text-[var(--text-faint)]">CTR trung bình</div>
          <div className="text-xl font-black text-[var(--text)]">{summary.avgCtr.toFixed(1)}%</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="text-[11px] text-[var(--text-faint)]">CVR trung bình</div>
          <div className="text-xl font-black text-[var(--text)]">{summary.avgCvr.toFixed(1)}%</div>
        </div>
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="text-[11px] text-[var(--text-faint)]">Tổng GMV thực nhận</div>
          <div className="text-xl font-black text-[var(--success)]">{formatCurrencyAdaptive(summary.totalGmv)}</div>
        </div>
      </div>
      {summary.missingCount > 0 && (
        <p className="text-[11px] text-[var(--warning)]">
          {summary.missingCount} phiên trong bộ lọc hiện tại chưa có số liệu (Ops chưa nhập tay sau live) — không tính vào trung bình.
        </p>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
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
                  <tr key={s.id} className="border-b border-[var(--border-muted)]">
                    <td className="py-2.5 px-4 text-[var(--text-muted)] font-mono">
                      {s.date} {s.startTime}-{s.endTime}
                    </td>
                    <td className="py-2.5 px-2 text-[var(--text-muted)]">{s.status}</td>
                    {hasData ? (
                      <>
                        <td className="py-2.5 px-2 text-right text-[var(--text)] font-bold">{(s.peakViewers || 0).toLocaleString("vi-VN")}</td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{(s.totalViews || 0).toLocaleString("vi-VN")}</td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{(s.ctrAvg || 0).toFixed(1)}%</td>
                        <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{(s.cvrAvg || 0).toFixed(1)}%</td>
                        <td className="py-2.5 px-4 text-right text-[var(--success)] font-bold">{formatCurrencyAdaptive(s.actualGmv || 0)}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="py-2.5 px-2 text-[var(--text-faint)] italic">
                        Chưa có số liệu
                      </td>
                    )}
                  </tr>
                );
              })}
              {brandSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[var(--text-faint)] italic">
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
