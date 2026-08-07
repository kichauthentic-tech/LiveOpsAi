import React, { useMemo } from "react";
import { Brand, Campaign, LiveSession, BrandInvoice } from "../../types";
import { Store, Target, Receipt, TrendingUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { computeCampaignActualGmv } from "../../lib/campaignMetrics";
import { GmvCalendar } from "../GmvCalendar";

interface BrandDashboardProps {
  brandId: string;
  brand?: Brand;
  campaigns: Campaign[];
  sessions: LiveSession[];
  brandInvoices: BrandInvoice[];
}

const getTodayMonth = () => new Date().toISOString().slice(0, 7);

export const BrandDashboard: React.FC<BrandDashboardProps> = ({ brandId, brand, campaigns, sessions, brandInvoices }) => {
  const thisMonth = getTodayMonth();
  const brandCampaigns = useMemo(() => campaigns.filter((c) => c.brandId === brandId), [campaigns, brandId]);
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  const campaignActualGmv = useMemo(() => computeCampaignActualGmv(brandCampaigns, brandSessions), [brandCampaigns, brandSessions]);

  const monthGmv = useMemo(
    () =>
      brandSessions
        .filter((s) => s.status === "Completed" && s.date.startsWith(thisMonth))
        .reduce((acc, s) => acc + (s.actualGmv || 0), 0),
    [brandSessions, thisMonth]
  );

  const activeCampaign = useMemo(
    () => brandCampaigns.find((c) => c.status === "active") ?? brandCampaigns.find((c) => c.status === "draft"),
    [brandCampaigns]
  );

  const debt = useMemo(() => {
    const invoices = brandInvoices.filter((inv) => inv.brandId === brandId);
    const outstanding = invoices.reduce((acc, inv) => acc + Math.max(0, inv.amount - inv.paidAmount), 0);
    return { invoiceCount: invoices.length, outstanding };
  }, [brandInvoices, brandId]);

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

      <div className="bg-gradient-to-br from-blue-950/60 to-slate-900 border border-blue-900/40 rounded-2xl p-6 shadow-xl">
        <span className="text-blue-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> GMV tháng {thisMonth}
        </span>
        <p className="text-3xl font-black text-white mt-1">{formatCurrencyAdaptive(monthGmv)}</p>
        {activeCampaign && (
          <div className="mt-3">
            <div className="flex justify-between text-[11px] font-bold mb-1">
              <span className="text-slate-400">So với KPI campaign &quot;{activeCampaign.name}&quot;</span>
              <span className="text-emerald-400">
                {activeCampaign.targetGmv > 0 ? Math.round(((campaignActualGmv.get(activeCampaign.id) ?? 0) / activeCampaign.targetGmv) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full"
                style={{
                  width: `${Math.min(
                    100,
                    activeCampaign.targetGmv > 0 ? ((campaignActualGmv.get(activeCampaign.id) ?? 0) / activeCampaign.targetGmv) * 100 : 0
                  )}%`
                }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
          <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Target className="w-4 h-4" /> Campaign đang chạy
          </span>
          {activeCampaign ? (
            <>
              <p className="text-base font-bold text-white">{activeCampaign.name}</p>
              <p className="text-xs text-slate-400">
                {activeCampaign.startDate} → {activeCampaign.endDate} • KPI {formatCurrencyAdaptive(activeCampaign.targetGmv)}
              </p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Chưa có campaign nào đang chạy.</p>
          )}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
          <span className="text-amber-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Receipt className="w-4 h-4" /> Công nợ hiện tại
          </span>
          <p className="text-base font-bold text-white">{formatCurrencyAdaptive(debt.outstanding)}</p>
          <p className="text-xs text-slate-400">{debt.invoiceCount} hoá đơn đã lập</p>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <span className="text-slate-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Store className="w-4 h-4" /> Tổng GMV tích luỹ
        </span>
        <p className="text-2xl font-black text-white mt-1">{formatCurrencyAdaptive(brand.totalGmv)}</p>
      </div>

      <GmvCalendar
        sessions={brandSessions}
        title="Lịch GMV: Target vs Actual"
        subtitle={`Theo dõi target/actual GMV từng ngày của ${brand.name} và tiến độ dự phóng cuối tháng.`}
      />
    </div>
  );
};
