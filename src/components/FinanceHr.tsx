import React, { useMemo, useState } from "react";
import { LiveSession, Talent, SessionFinance, SystemUser } from "../types";
import { DollarSign, TrendingUp, Calculator, CheckCircle2, XCircle, Clock } from "lucide-react";

interface FinanceHrProps {
  sessions: LiveSession[];
  talents: Talent[];
  financeRecords: SessionFinance[];
  users: SystemUser[];
  currentUserId?: string;
  onUpdateFinance: (
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "agencyCommissionRate" | "studioCost" | "adsCost" | "notes">>
  ) => Promise<void>;
  onSetFinanceApproval: (sessionId: string, status: SessionFinance["approvalStatus"]) => Promise<void>;
}

const DEFAULT_FINANCE: Omit<SessionFinance, "sessionId"> = {
  agencyCommissionRate: 15,
  studioCost: 0,
  adsCost: 0,
  approvalStatus: "pending",
  notes: ""
};

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

export const FinanceHr: React.FC<FinanceHrProps> = ({
  sessions,
  talents,
  financeRecords,
  users,
  currentUserId,
  onUpdateFinance,
  onSetFinanceApproval
}) => {
  const [savingId, setSavingId] = useState<string | null>(null);

  const financeBySessionId = useMemo(() => {
    const map: Record<string, SessionFinance> = {};
    for (const f of financeRecords) map[f.sessionId] = f;
    return map;
  }, [financeRecords]);

  const talentById = useMemo(() => {
    const map: Record<string, Talent> = {};
    for (const t of talents) map[t.id] = t;
    return map;
  }, [talents]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users) map[u.id] = u.name;
    return map;
  }, [users]);

  // Real P&L is only meaningful for sessions that actually ran and closed with real GMV/orders.
  const completedSessions = useMemo(
    () => sessions.filter((s) => s.status === "Completed").sort((a, b) => (a.date < b.date ? 1 : -1)),
    [sessions]
  );

  const rows = useMemo(() => {
    return completedSessions.map((s) => {
      const finance = financeBySessionId[s.id] ?? { sessionId: s.id, ...DEFAULT_FINANCE };
      const talent = talentById[s.hostId];
      const hostFixRate = finance.hostFixRateOverride ?? talent?.ratePerSession ?? 0;
      const hostCommRate = finance.hostCommissionRateOverride ?? talent?.commissionRate ?? 0;
      const grossAgencyRev = (s.actualGmv * finance.agencyCommissionRate) / 100;
      const hostPayout = hostFixRate + (s.actualGmv * hostCommRate) / 100;
      const totalCost = hostPayout + finance.studioCost + finance.adsCost;
      const netProfit = grossAgencyRev - totalCost;
      return { session: s, finance, talent, grossAgencyRev, hostPayout, netProfit };
    });
  }, [completedSessions, financeBySessionId, talentById]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          gmv: acc.gmv + r.session.actualGmv,
          grossAgencyRev: acc.grossAgencyRev + r.grossAgencyRev,
          hostPayout: acc.hostPayout + r.hostPayout,
          netProfit: acc.netProfit + r.netProfit
        }),
        { gmv: 0, grossAgencyRev: 0, hostPayout: 0, netProfit: 0 }
      ),
    [rows]
  );
  const totalMargin = totals.grossAgencyRev > 0 ? ((totals.netProfit / totals.grossAgencyRev) * 100).toFixed(1) : "0";

  async function handleFieldChange(
    sessionId: string,
    field: "agencyCommissionRate" | "studioCost" | "adsCost",
    value: number
  ) {
    setSavingId(sessionId);
    try {
      await onUpdateFinance(sessionId, { [field]: value });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không lưu được số liệu tài chính.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleApprove(sessionId: string, status: SessionFinance["approvalStatus"]) {
    setSavingId(sessionId);
    try {
      await onSetFinanceApproval(sessionId, status);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không cập nhật được trạng thái duyệt. Có thể bạn không có quyền CEO.");
    } finally {
      setSavingId(null);
    }
  }

  // Simulator inputs kept separate from the real report below — for quick what-if scenarios
  // that don't correspond to any actual session.
  const [calcGmv, setCalcGmv] = useState(200000000);
  const [agencyCommRate, setAgencyCommRate] = useState(15);
  const [hostFixRate, setHostFixRate] = useState(4500000);
  const [hostCommRate, setHostCommRate] = useState(3.5);
  const [studioCost, setStudioCost] = useState(2000000);
  const [adsCost, setAdsCost] = useState(5000000);
  const simGrossAgencyRev = (calcGmv * agencyCommRate) / 100;
  const simHostPayout = hostFixRate + (calcGmv * hostCommRate) / 100;
  const simTotalDirectCost = simHostPayout + studioCost + adsCost;
  const simNetAgencyProfit = simGrossAgencyRev - simTotalDirectCost;
  const simMarginPercent = simGrossAgencyRev > 0 ? ((simNetAgencyProfit / simGrossAgencyRev) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-purple-400" /> Modules 11 & 12: Finance, Unit Economics & HR
        </span>
        <h2 className="text-2xl font-black">Tài Chính P&L Trận Live & Quản Lý Nhân Sự Agency</h2>
      </div>

      {/* Real P&L report per completed session */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-400" /> Báo Cáo P&L Thật Theo Phiên Live
            </h3>
            <p className="text-xs text-slate-400">
              GMV & Host lấy từ dữ liệu phiên/talent thật trên Supabase. Commission Agency, chi phí Studio/Ads nhập & lưu thật, chỉ CEO mới duyệt được.
            </p>
          </div>
          <div className="text-right text-xs bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-2">
            <div className="text-slate-400">Tổng {rows.length} phiên · Net Profit</div>
            <div className={`text-lg font-black ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {money(totals.netProfit)} đ <span className="text-xs font-bold text-slate-400">({totalMargin}%)</span>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-6 text-center">Chưa có phiên live nào ở trạng thái "Completed" để tính P&L thật.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3">Phiên</th>
                  <th className="py-2 pr-3">GMV Thật</th>
                  <th className="py-2 pr-3">Comm Agency %</th>
                  <th className="py-2 pr-3">Chi Phí Studio</th>
                  <th className="py-2 pr-3">Chi Phí Ads</th>
                  <th className="py-2 pr-3">Trả Host</th>
                  <th className="py-2 pr-3">Net Profit</th>
                  <th className="py-2 pr-3">Duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session: s, finance, talent, grossAgencyRev, hostPayout, netProfit }) => (
                  <tr key={s.id} className="border-b border-slate-800/60 align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-bold text-slate-200">{s.title}</div>
                      <div className="text-slate-400">{s.brandName} · {s.date} · Host {talent?.name ?? s.hostName}</div>
                    </td>
                    <td className="py-2 pr-3 font-bold text-slate-300">{money(s.actualGmv)} đ</td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.agencyCommissionRate}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "agencyCommissionRate", Number(e.target.value))}
                        className="w-16 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.studioCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "studioCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.adsCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "adsCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      />
                    </td>
                    <td className="py-2 pr-3 text-amber-400 font-bold">{money(hostPayout)} đ</td>
                    <td className={`py-2 pr-3 font-black ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {money(netProfit)} đ
                    </td>
                    <td className="py-2 pr-3">
                      {finance.approvalStatus === "approved" ? (
                        <button
                          onClick={() => handleApprove(s.id, "pending")}
                          disabled={savingId === s.id}
                          className="flex items-center gap-1 text-emerald-400 font-bold hover:underline"
                          title={finance.approvedByUserId ? `Duyệt bởi ${userNameById[finance.approvedByUserId] ?? finance.approvedByUserId}` : undefined}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt
                        </button>
                      ) : finance.approvalStatus === "rejected" ? (
                        <button
                          onClick={() => handleApprove(s.id, "pending")}
                          disabled={savingId === s.id}
                          className="flex items-center gap-1 text-red-400 font-bold hover:underline"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(s.id, "approved")}
                            disabled={savingId === s.id}
                            className="text-emerald-400 hover:bg-emerald-950/40 p-1 rounded-lg"
                            title="Duyệt bảng lương"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprove(s.id, "rejected")}
                            disabled={savingId === s.id}
                            className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg"
                            title="Từ chối"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <span className="flex items-center gap-1 text-slate-400"><Clock className="w-3 h-3" /> Chờ duyệt</span>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Session Unit Economics Simulator (what-if, not tied to a real session) */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-6">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-400" /> Trình Mô Phỏng What-If (Unit Economics Calculator)
          </h3>
          <p className="text-xs text-slate-400">Mô phỏng kịch bản giả định — không lưu vào Supabase, không gắn với phiên live thật nào</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-slate-300 block mb-1">Dự Phóng GMV Phiên Live (VNĐ):</label>
              <input
                type="number"
                value={calcGmv}
                onChange={(e) => setCalcGmv(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Commission Agency (% GMV):</label>
                <input
                  type="number"
                  value={agencyCommRate}
                  onChange={(e) => setAgencyCommRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Lương Cứng Host (Fix Rate):</label>
                <input
                  type="number"
                  value={hostFixRate}
                  onChange={(e) => setHostFixRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Host Comm (%):</label>
                <input
                  type="number"
                  value={hostCommRate}
                  onChange={(e) => setHostCommRate(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Chi Phí Studio:</label>
                <input
                  type="number"
                  value={studioCost}
                  onChange={(e) => setStudioCost(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="font-bold text-slate-300 block mb-1">Chi Phí Ads Live:</label>
                <input
                  type="number"
                  value={adsCost}
                  onChange={(e) => setAdsCost(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 space-y-4 flex flex-col justify-between shadow-xl">
            <div>
              <span className="text-xs text-purple-400 font-bold uppercase tracking-wider block">P&L Calculation Result</span>
              <h4 className="text-xl font-black text-white mt-1">Báo Cáo Lợi Nhuận Ròng Dự Kiến</h4>
            </div>

            <div className="space-y-2 text-xs border-y border-slate-800 py-3">
              <div className="flex justify-between">
                <span className="text-slate-400">Doanh thu Agency (Commission):</span>
                <strong className="text-emerald-400 font-bold">{simGrossAgencyRev.toLocaleString()} đ</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Trả Host (Fix + Comm):</span>
                <strong className="text-amber-400 font-bold">{simHostPayout.toLocaleString()} đ</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Chi phí Studio & Ads:</span>
                <strong className="text-slate-300 font-bold">{(studioCost + adsCost).toLocaleString()} đ</strong>
              </div>
            </div>

            <div className="bg-purple-950/80 p-4 rounded-xl border border-purple-800/80 flex justify-between items-center">
              <div>
                <span className="text-[10px] text-purple-300 block uppercase font-bold">Net Profit Agency:</span>
                <strong className="text-2xl font-black text-white">{simNetAgencyProfit.toLocaleString()} VNĐ</strong>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-sm font-black px-3 py-1.5 rounded-xl">
                Margin: {simMarginPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
