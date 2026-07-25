import React, { useState } from "react";
import { LiveSession } from "../types";
import { DollarSign, TrendingUp, Award, Calculator, ArrowUpRight, ShieldCheck } from "lucide-react";

interface FinanceHrProps {
  sessions: LiveSession[];
}

export const FinanceHr: React.FC<FinanceHrProps> = ({ sessions }) => {
  const [calcGmv, setCalcGmv] = useState(200000000); // 200 Million đ
  const [agencyCommRate, setAgencyCommRate] = useState(15); // 15%
  const [hostFixRate, setHostFixRate] = useState(4500000); // 4.5M đ
  const [hostCommRate, setHostCommRate] = useState(3.5); // 3.5%
  const [studioCost, setStudioCost] = useState(2000000); // 2M đ
  const [adsCost, setAdsCost] = useState(5000000); // 5M đ

  // Calculations
  const grossAgencyRev = (calcGmv * agencyCommRate) / 100;
  const hostPayout = hostFixRate + (calcGmv * hostCommRate) / 100;
  const totalDirectCost = hostPayout + studioCost + adsCost;
  const netAgencyProfit = grossAgencyRev - totalDirectCost;
  const marginPercent = grossAgencyRev > 0 ? ((netAgencyProfit / grossAgencyRev) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-purple-400" /> Modules 11 & 12: Finance, Unit Economics & HR
        </span>
        <h2 className="text-2xl font-black">Tài Chính P&L Trận Live & Quản Lý Nhân Sự Agency</h2>
        <p className="text-slate-400 text-xs">
          Tính toán biên lợi nhuận Net Margin từng phiên live, hoa hồng Host & dự báo dòng tiền Cash Flow
        </p>
      </div>

      {/* Session Unit Economics Calculator */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-600" /> Trình Tính Lợi Nhuận Ròng 1 Phiên Livestream (Unit Economics Calculator)
          </h3>
          <p className="text-xs text-slate-500">Mô phỏng doanh thu commission agency, chi phí Host, Studio & Ads để đo biên Net Margin</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Inputs */}
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Dự Phóng GMV Phiên Live (VNĐ):</label>
              <input
                type="number"
                value={calcGmv}
                onChange={(e) => setCalcGmv(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
              />
              {sessions.length > 0 && (
                <select
                  onChange={(e) => {
                    const s = sessions.find((sess) => sess.id === e.target.value);
                    if (s) setCalcGmv(s.actualGmv);
                  }}
                  defaultValue=""
                  className="w-full mt-1.5 p-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-500 bg-slate-50"
                >
                  <option value="" disabled>Hoặc nạp GMV từ phiên live thực tế...</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} — {(s.actualGmv / 1000000).toFixed(1)}M đ
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Commission Agency (% GMV):</label>
                <input
                  type="number"
                  value={agencyCommRate}
                  onChange={(e) => setAgencyCommRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Lương Cứng Host (Fix Rate):</label>
                <input
                  type="number"
                  value={hostFixRate}
                  onChange={(e) => setHostFixRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Host Comm (%):</label>
                <input
                  type="number"
                  value={hostCommRate}
                  onChange={(e) => setHostCommRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Chi Phí Studio:</label>
                <input
                  type="number"
                  value={studioCost}
                  onChange={(e) => setStudioCost(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">Chi Phí Ads Live:</label>
                <input
                  type="number"
                  value={adsCost}
                  onChange={(e) => setAdsCost(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Output Card */}
          <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between shadow-xl">
            <div>
              <span className="text-xs text-purple-400 font-bold uppercase tracking-wider block">P&L Calculation Result</span>
              <h4 className="text-xl font-black text-white mt-1">Báo Cáo Lợi Nhuận Ròng Dự Kiến</h4>
            </div>

            <div className="space-y-2 text-xs border-y border-slate-800 py-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Doanh thu Agency (Commission):</span>
                <strong className="text-emerald-400 font-bold">{grossAgencyRev.toLocaleString()} đ</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Trả Host (Fix + Comm):</span>
                <strong className="text-amber-400 font-bold">{hostPayout.toLocaleString()} đ</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chi phí Studio & Ads:</span>
                <strong className="text-slate-300 font-bold">{(studioCost + adsCost).toLocaleString()} đ</strong>
              </div>
            </div>

            <div className="bg-purple-950/80 p-4 rounded-xl border border-purple-800/80 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-purple-300 block uppercase font-bold">Net Profit Agency:</span>
                <strong className="text-2xl font-black text-white">{netAgencyProfit.toLocaleString()} VNĐ</strong>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-sm font-black px-3 py-1.5 rounded-xl">
                Margin: {marginPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
