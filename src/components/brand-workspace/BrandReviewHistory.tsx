import React, { useMemo } from "react";
import { Campaign, LiveSession } from "../../types";
import { ClipboardCheck } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { computeCampaignActualGmv } from "../../lib/campaignMetrics";

interface BrandReviewHistoryProps {
  brandId: string;
  campaigns: Campaign[];
  sessions: LiveSession[];
}

const OUTCOME_LABELS: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "Đạt KPI",
  kpi_missed: "Không đạt KPI",
  partial: "Đạt một phần"
};

const OUTCOME_STYLES: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "bg-emerald-950 text-emerald-300 border-emerald-800",
  kpi_missed: "bg-rose-950 text-rose-300 border-rose-800",
  partial: "bg-amber-950 text-amber-300 border-amber-800"
};

const RENEWAL_LABELS: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "Gia hạn",
  at_risk: "Có nguy cơ rời",
  churned: "Đã rời (churned)"
};

const RENEWAL_STYLES: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "bg-emerald-950 text-emerald-300 border-emerald-800",
  at_risk: "bg-amber-950 text-amber-300 border-amber-800",
  churned: "bg-rose-950 text-rose-300 border-rose-800"
};

export const BrandReviewHistory: React.FC<BrandReviewHistoryProps> = ({ brandId, campaigns, sessions }) => {
  const reviewed = useMemo(
    () =>
      campaigns
        .filter((c) => c.brandId === brandId && c.outcome)
        .slice()
        .sort((a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? "")),
    [campaigns, brandId]
  );

  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const campaignActualGmv = useMemo(() => computeCampaignActualGmv(reviewed, brandSessions), [reviewed, brandSessions]);

  const trend = useMemo(() => {
    const counts: Record<NonNullable<Campaign["renewalDecision"]>, number> = { renew: 0, at_risk: 0, churned: 0 };
    reviewed.forEach((c) => {
      if (c.renewalDecision) counts[c.renewalDecision] += 1;
    });
    return counts;
  }, [reviewed]);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-blue-400" /> Báo Cáo Cuối Kỳ
      </h2>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-emerald-900/40 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-emerald-400">{trend.renew}</p>
          <p className="text-[11px] text-slate-500 uppercase font-bold mt-1">Gia hạn</p>
        </div>
        <div className="bg-slate-900 border border-amber-900/40 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-amber-400">{trend.at_risk}</p>
          <p className="text-[11px] text-slate-500 uppercase font-bold mt-1">Có nguy cơ rời</p>
        </div>
        <div className="bg-slate-900 border border-rose-900/40 rounded-2xl p-4 text-center">
          <p className="text-2xl font-black text-rose-400">{trend.churned}</p>
          <p className="text-[11px] text-slate-500 uppercase font-bold mt-1">Đã rời</p>
        </div>
      </div>

      {reviewed.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-sm text-slate-400">
          Chưa có campaign nào được đánh giá cuối kỳ.
        </div>
      ) : (
        <div className="space-y-3">
          {reviewed.map((c) => {
            const actualGmv = campaignActualGmv.get(c.id) ?? 0;
            const pct = c.targetGmv > 0 ? Math.round((actualGmv / c.targetGmv) * 100) : 0;
            return (
              <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-2 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong className="text-base text-white">{c.name}</strong>
                    <p className="text-xs text-slate-500 font-mono">
                      {c.startDate} → {c.endDate}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {c.outcome && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${OUTCOME_STYLES[c.outcome]}`}>
                        {OUTCOME_LABELS[c.outcome]}
                      </span>
                    )}
                    {c.renewalDecision && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${RENEWAL_STYLES[c.renewalDecision]}`}>
                        {RENEWAL_LABELS[c.renewalDecision]}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  GMV thật {formatCurrencyAdaptive(actualGmv)} / KPI {formatCurrencyAdaptive(c.targetGmv)} ({pct}%)
                </p>
                {c.reviewNotes && <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800 rounded-lg p-2">{c.reviewNotes}</p>}
                {c.reviewedAt && <p className="text-[11px] text-slate-600">Đánh giá lúc {new Date(c.reviewedAt).toLocaleString("vi-VN")}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
