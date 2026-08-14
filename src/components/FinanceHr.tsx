import React, { useMemo, useState } from "react";
import {
  LiveSession,
  Talent,
  SessionFinance,
  SystemUser,
  Brand,
  BrandPlatformRate,
  TalentRateHistoryEntry,
  BrandPlatformRateHistoryEntry
} from "../types";
import { DollarSign, TrendingUp, CheckCircle2, XCircle, Clock } from "lucide-react";
import { DEFAULT_FINANCE, computeSessionPnl } from "../lib/pnl";

interface FinanceHrProps {
  sessions: LiveSession[];
  talents: Talent[];
  financeRecords: SessionFinance[];
  users: SystemUser[];
  brands: Brand[];
  brandPlatformRates: BrandPlatformRate[];
  talentRateHistory: TalentRateHistoryEntry[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  onUpdateFinance: (
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "agencyCommissionRate" | "studioCost" | "adsCost" | "notes">>
  ) => Promise<void>;
  onSetFinanceApproval: (sessionId: string, status: SessionFinance["approvalStatus"]) => Promise<void>;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

export const FinanceHr: React.FC<FinanceHrProps> = ({
  sessions,
  talents,
  financeRecords,
  users,
  brands,
  brandPlatformRates,
  talentRateHistory,
  brandPlatformRateHistory,
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

  const brandById = useMemo(() => {
    const map: Record<string, Brand> = {};
    for (const b of brands) map[b.id] = b;
    return map;
  }, [brands]);

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
    return completedSessions.map((s) =>
      computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory)
    );
  }, [completedSessions, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]);

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
                  <th className="py-2 pr-3">Doanh Thu Agency</th>
                  <th className="py-2 pr-3">Chi Phí Studio</th>
                  <th className="py-2 pr-3">Chi Phí Ads</th>
                  <th className="py-2 pr-3">Trả Host</th>
                  <th className="py-2 pr-3">Net Profit</th>
                  <th className="py-2 pr-3">Duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session: s, finance, talent, isHourly, grossAgencyRev, hostPayout, netProfit }) => {
                  return (
                  <tr key={s.id} className="border-b border-slate-800/60 align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-bold text-slate-200 flex items-center gap-1.5">
                        {s.title}
                      </div>
                      <div className="text-slate-400">{s.brandName} · {s.date} · Host {talent?.name ?? s.hostName}</div>
                    </td>
                    <td className="py-2 pr-3 font-bold text-slate-300">{money(s.actualGmv)} đ</td>
                    <td className="py-2 pr-3">
                      {isHourly ? (
                        <div>
                          <span className="text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded-full">
                            Theo giờ live
                          </span>
                          <div className="font-bold text-slate-200 mt-0.5">{money(grossAgencyRev)} đ</div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            defaultValue={finance.agencyCommissionRate}
                            disabled={savingId === s.id}
                            onBlur={(e) => handleFieldChange(s.id, "agencyCommissionRate", Number(e.target.value))}
                            className="w-14 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold disabled:opacity-40"
                          />
                          <span className="text-slate-500">% GMV</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.studioCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "studioCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.adsCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "adsCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold disabled:opacity-40"
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
                          className="flex items-center gap-1 text-emerald-400 font-bold hover:underline disabled:opacity-40"
                          title={finance.approvedByUserId ? `Duyệt bởi ${userNameById[finance.approvedByUserId] ?? finance.approvedByUserId}` : undefined}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt
                        </button>
                      ) : finance.approvalStatus === "rejected" ? (
                        <button
                          onClick={() => handleApprove(s.id, "pending")}
                          disabled={savingId === s.id}
                          className="flex items-center gap-1 text-red-400 font-bold hover:underline disabled:opacity-40"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Từ chối
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(s.id, "approved")}
                            disabled={savingId === s.id}
                            className="text-emerald-400 hover:bg-emerald-950/40 p-1 rounded-lg disabled:opacity-40"
                            title="Duyệt bảng lương"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprove(s.id, "rejected")}
                            disabled={savingId === s.id}
                            className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg disabled:opacity-40"
                            title="Từ chối"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <span className="flex items-center gap-1 text-slate-400"><Clock className="w-3 h-3" /> Chờ duyệt</span>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
