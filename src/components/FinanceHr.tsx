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
import { DataSourceBadge } from "./common/DataSourceBadge";
import { dataQuality } from "../lib/performance/hostPerformance";
import { todayVn } from "../lib/performance/brandCommitment";

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

  // Audit Module 3 (2026-09-18): trước đây là MỘT danh sách mọi ca Completed từ đầu tới giờ, tổng
  // cộng dồn cả đời — vài tháng nữa là vô nghĩa. Lọc theo tháng, mặc định tháng hiện tại (VN).
  const [month, setMonth] = useState(() => todayVn().slice(0, 7));
  const shiftMonth = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
  };

  // Real P&L is only meaningful for sessions that actually ran and closed with real GMV/orders.
  const completedSessions = useMemo(
    () =>
      sessions
        .filter((s) => s.status === "Completed" && s.date.startsWith(month))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [sessions, month]
  );
  // Độ tin cậy của con số tiền: tổng P&L cộng từ GMV, mà GMV thì có 3 bậc nguồn. Màn tiền phải
  // nói rõ bao nhiêu phần là số chốt — ký duyệt trên số tự khai và số đã đối soát là hai việc khác.
  const quality = useMemo(() => dataQuality(completedSessions), [completedSessions]);

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
          hostPayout: acc.hostPayout + r.hostPayout + r.coHostPayout,
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
      <div className="bg-[var(--surface)] text-[var(--text)] p-6 rounded-2xl border border-[var(--border)] shadow-xl space-y-2">
        <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <DollarSign className="w-4 h-4 text-[var(--accent-text)]" /> Modules 11 & 12: Finance, Unit Economics & HR
        </span>
        <h2 className="text-2xl font-black">Tài Chính P&L Trận Live & Quản Lý Nhân Sự Agency</h2>
      </div>

      {/* Real P&L report per completed session */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <div className="border-b border-[var(--border)] pb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[var(--accent-text)]" /> Báo Cáo P&L Thật Theo Phiên Live
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              GMV & Host lấy từ dữ liệu phiên/talent thật trên Supabase. Commission Agency, chi phí Studio/Ads nhập & lưu thật, chỉ CEO mới duyệt được.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <button onClick={() => shiftMonth(-1)} className="px-2 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">‹</button>
            <input
              type="month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold"
            />
            <button onClick={() => shiftMonth(1)} className="px-2 py-1 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-elevated)]">›</button>
          </div>
          <div className="text-right text-xs bg-[var(--surface-elevated)]/50 border border-[var(--border)] rounded-xl px-4 py-2">
            <div className="text-[var(--text-muted)]">Tổng {rows.length} phiên · Net Profit</div>
            <div className={`text-lg font-black ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {money(totals.netProfit)} đ <span className="text-xs font-bold text-[var(--text-muted)]">({totalMargin}%)</span>
            </div>
          </div>
        </div>

        {rows.length > 0 && quality.reconciled < quality.total && (
          <div className="text-[11px] rounded-xl px-3 py-2 border border-amber-800/60 bg-amber-950/40 text-amber-200">
            Nguồn GMV của {quality.total} phiên: <b>{quality.reconciled}</b> đã đối soát
            {quality.snapshot > 0 && <>, <b>{quality.snapshot}</b> số lúc giao ca (TikTok còn cập nhật hoàn/huỷ)</>}
            {quality.manual > 0 && <>, <b>{quality.manual}</b> talent tự khai (chưa có gì bảo chứng)</>}.
            Số tiền của các phiên chưa đối soát là tạm tính — duyệt sau khi đối soát ở "Vận Hành Live → Đối Soát Số Liệu".
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic py-6 text-center">Không có phiên "Completed" nào trong tháng {month} để tính P&L.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3">Phiên</th>
                  <th className="py-2 pr-3">GMV Thật</th>
                  <th className="py-2 pr-3">Doanh Thu Agency</th>
                  <th className="py-2 pr-3">Chi Phí Studio</th>
                  <th className="py-2 pr-3">Chi Phí Ads (điều chỉnh — để 0 nếu dùng số trợ live báo cáo)</th>
                  <th className="py-2 pr-3">Trả Host / Trợ Live</th>
                  <th className="py-2 pr-3">Net Profit</th>
                  <th className="py-2 pr-3">Duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session: s, finance, talent, isHourly, grossAgencyRev, hostPayout, netProfit, hostPaidHourly, billableHours, otMinutes, earlyLeaveMinutes, coHost, coHostPayout, coHostPaidHourly }) => {
                  return (
                  <tr key={s.id} className="border-b border-[var(--border)]/60 align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-bold text-[var(--text)] flex items-center gap-1.5">
                        {s.title}
                      </div>
                      <div className="text-[var(--text-muted)]">{s.brandName} · {s.date} · Host {talent?.name ?? s.hostName}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-bold text-[var(--text-muted)]">{money(s.actualGmv)} đ</div>
                      <DataSourceBadge dataSource={s.dataSource} className="mt-0.5" />
                    </td>
                    <td className="py-2 pr-3">
                      {isHourly ? (
                        <div>
                          <span className="text-[9px] font-bold bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded-full">
                            Theo giờ live
                          </span>
                          <div className="font-bold text-[var(--text)] mt-0.5">{money(grossAgencyRev)} đ</div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            defaultValue={finance.agencyCommissionRate}
                            disabled={savingId === s.id}
                            onBlur={(e) => handleFieldChange(s.id, "agencyCommissionRate", Number(e.target.value))}
                            className="w-14 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold disabled:opacity-40"
                          />
                          <span className="text-[var(--text-faint)]">% GMV</span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.studioCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "studioCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold disabled:opacity-40"
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        type="number"
                        defaultValue={finance.adsCost}
                        disabled={savingId === s.id}
                        onBlur={(e) => handleFieldChange(s.id, "adsCost", Number(e.target.value))}
                        className="w-24 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold disabled:opacity-40"
                      />
                      <div className="text-[9px] text-[var(--text-faint)] mt-0.5">
                        Trợ live báo cáo: {money(s.report?.adsCost ?? 0)} đ
                      </div>
                    </td>
                    {/* Giai đoạn 3 — nói rõ con số ra từ đâu: talent ăn theo giờ thì hiện giờ
                        công thực tế + phần OT/off sớm host đã khai, để ops đối chiếu khi duyệt. */}
                    <td className="py-2 pr-3">
                      <div className="text-amber-400 font-bold">{money(hostPayout)} đ</div>
                      {hostPaidHourly && (
                        <div className="text-[9px] text-[var(--text-muted)] mt-0.5">
                          {billableHours.toFixed(2)}h × rate/giờ
                          {otMinutes > 0 && <span className="text-emerald-400 font-bold"> · OT +{otMinutes}p</span>}
                          {earlyLeaveMinutes > 0 && <span className="text-amber-400 font-bold"> · off sớm −{earlyLeaveMinutes}p</span>}
                        </div>
                      )}
                      {/* Trợ live có công (user chốt 2026-09-18) — hiện tách dòng để ops thấy Net
                          Profit trừ những ai. Ca có co_host_id nhưng talent đã bị xoá thì không
                          tính được, phải nói ra chứ không im lặng ra 0. */}
                      {coHost ? (
                        <div className="text-[10px] text-amber-300/80 mt-1">
                          Trợ live {coHost.name}: <b>{money(coHostPayout)} đ</b>
                          {coHostPaidHourly && <span className="text-[var(--text-muted)]"> ({billableHours.toFixed(2)}h × rate/giờ)</span>}
                        </div>
                      ) : s.coHostId ? (
                        <div className="text-[10px] text-red-300 mt-1">Trợ live {s.coHostName || "—"} không còn hồ sơ talent — chưa tính công</div>
                      ) : null}
                    </td>
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
                            className="text-emerald-400 hover:bg-emerald-950/80 p-1 rounded-lg disabled:opacity-40"
                            title="Duyệt bảng lương"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprove(s.id, "rejected")}
                            disabled={savingId === s.id}
                            className="text-red-400 hover:bg-red-950/80 p-1 rounded-lg disabled:opacity-40"
                            title="Từ chối"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          <span className="flex items-center gap-1 text-[var(--text-muted)]"><Clock className="w-3 h-3" /> Chờ duyệt</span>
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
