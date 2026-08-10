import React, { useMemo } from "react";
import { Brand, LiveSession, BrandInvoice } from "../../types";
import { Store, Receipt, TrendingUp } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { GmvCalendar } from "../GmvCalendar";

interface BrandDashboardProps {
  brandId: string;
  brand?: Brand;
  sessions: LiveSession[];
  brandInvoices: BrandInvoice[];
}

const getTodayMonth = () => new Date().toISOString().slice(0, 7);

export const BrandDashboard: React.FC<BrandDashboardProps> = ({ brandId, brand, sessions, brandInvoices }) => {
  const thisMonth = getTodayMonth();
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);

  const monthGmv = useMemo(
    () =>
      brandSessions
        .filter((s) => s.status === "Completed" && s.date.startsWith(thisMonth))
        .reduce((acc, s) => acc + (s.actualGmv || 0), 0),
    [brandSessions, thisMonth]
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
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-1">
        <span className="text-amber-400 font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
          <Receipt className="w-4 h-4" /> Công nợ hiện tại
        </span>
        <p className="text-base font-bold text-white">{formatCurrencyAdaptive(debt.outstanding)}</p>
        <p className="text-xs text-slate-400">{debt.invoiceCount} hoá đơn đã lập</p>
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
