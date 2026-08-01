import React, { useMemo, useState } from "react";
import {
  LiveSession,
  Talent,
  SessionFinance,
  Brand,
  BrandPlatformRate,
  TalentRateHistoryEntry,
  BrandPlatformRateHistoryEntry,
  MonthlyClose as MonthlyCloseType,
  BrandInvoice,
  UserRole
} from "../types";
import { CalendarCheck, Lock, Unlock, FileText, Plus, Trash2 } from "lucide-react";
import { computeSessionPnl } from "../lib/pnl";

interface MonthlyCloseProps {
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  talentRateHistory: TalentRateHistoryEntry[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  monthlyCloses: MonthlyCloseType[];
  brandInvoices: BrandInvoice[];
  currentRole: UserRole;
  onCloseMonth: (month: string, notes: string) => Promise<void>;
  onReopenMonth: (month: string) => Promise<void>;
  onAddInvoice: (invoice: { brandId: string; month: string; amount: number; dueDate?: string; notes: string }) => Promise<void>;
  onUpdateInvoice: (
    id: string,
    patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>
  ) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

const INVOICE_STATUS_LABEL: Record<BrandInvoice["status"], string> = {
  unpaid: "Chưa thu",
  partial: "Thu một phần",
  paid: "Đã thu đủ"
};

export const MonthlyClose: React.FC<MonthlyCloseProps> = ({
  sessions,
  talents,
  brands,
  financeRecords,
  brandPlatformRates,
  talentRateHistory,
  brandPlatformRateHistory,
  monthlyCloses,
  brandInvoices,
  currentRole,
  onCloseMonth,
  onReopenMonth,
  onAddInvoice,
  onUpdateInvoice,
  onDeleteInvoice
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const canLock = currentRole === "ceo" || currentRole === "admin";

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

  const monthSessions = useMemo(
    () => sessions.filter((s) => s.status === "Completed" && s.date.startsWith(selectedMonth)),
    [sessions, selectedMonth]
  );

  const pnlRows = useMemo(
    () =>
      monthSessions.map((s) =>
        computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory)
      ),
    [monthSessions, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]
  );

  // Payroll: gộp Trả Host (fix + commission, đúng rate tại ngày session) theo từng talent —
  // nối dữ liệu đã có sẵn (computeSessionPnl), không tính lại công thức riêng.
  const payrollByTalent = useMemo(() => {
    const map = new Map<string, { talentId: string; name: string; sessions: number; total: number }>();
    for (const row of pnlRows) {
      const id = row.session.hostId;
      if (!id) continue;
      const cur = map.get(id) ?? { talentId: id, name: row.talent?.name ?? row.session.hostName, sessions: 0, total: 0 };
      cur.sessions += 1;
      cur.total += row.hostPayout;
      map.set(id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [pnlRows]);

  // Doanh thu agency theo brand (đúng billing_model từng brand, xem FinanceHr.tsx/pnl.ts).
  const revenueByBrand = useMemo(() => {
    const map = new Map<string, { brandId: string; name: string; sessions: number; revenue: number; costs: number }>();
    for (const row of pnlRows) {
      const id = row.session.brandId;
      if (!id) continue;
      const cur = map.get(id) ?? { brandId: id, name: row.session.brandName, sessions: 0, revenue: 0, costs: 0 };
      cur.sessions += 1;
      cur.revenue += row.grossAgencyRev;
      cur.costs += row.finance.studioCost + row.finance.adsCost;
      map.set(id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [pnlRows]);

  const totals = useMemo(
    () =>
      pnlRows.reduce(
        (acc, r) => ({
          revenue: acc.revenue + r.grossAgencyRev,
          payroll: acc.payroll + r.hostPayout,
          costs: acc.costs + r.finance.studioCost + r.finance.adsCost
        }),
        { revenue: 0, payroll: 0, costs: 0 }
      ),
    [pnlRows]
  );
  const netProfit = totals.revenue - totals.payroll - totals.costs;

  const monthClose = monthlyCloses.find((m) => m.month === selectedMonth);
  const isLocked = monthClose?.status === "locked";

  const monthInvoices = useMemo(
    () => brandInvoices.filter((inv) => inv.month === selectedMonth),
    [brandInvoices, selectedMonth]
  );
  const invoiceByBrandId = useMemo(() => {
    const map: Record<string, BrandInvoice> = {};
    for (const inv of monthInvoices) map[inv.brandId] = inv;
    return map;
  }, [monthInvoices]);

  async function handleLockToggle() {
    setBusy(true);
    try {
      if (isLocked) {
        await onReopenMonth(selectedMonth);
      } else {
        await onCloseMonth(selectedMonth, closeNotes);
        setCloseNotes("");
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không cập nhật được trạng thái khoá sổ.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateInvoiceForBrand(brandId: string, amount: number) {
    setBusy(true);
    try {
      await onAddInvoice({ brandId, month: selectedMonth, amount, notes: "" });
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không tạo được hoá đơn.");
    } finally {
      setBusy(false);
    }
  }

  async function handleInvoicePatch(id: string, patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>) {
    setBusy(true);
    try {
      await onUpdateInvoice(id, patch);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Không cập nhật được hoá đơn.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-6 rounded-2xl border border-slate-800 shadow-xl space-y-2">
        <span className="text-purple-400 font-semibold text-xs uppercase tracking-wider block flex items-center gap-1.5">
          <CalendarCheck className="w-4 h-4 text-purple-400" /> Module 13: Đóng Sổ Tháng
        </span>
        <h2 className="text-2xl font-black">Payroll, Đối Soát Doanh Thu & Công Nợ Brand</h2>
        <p className="text-xs text-slate-400 max-w-2xl">
          Gộp P&L thật theo phiên (Finance & P&L) thành báo cáo theo tháng, sau đó khoá sổ để số liệu không "tự đổi"
          khi rate/chi phí bị sửa sau này.
        </p>
      </div>

      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-400">Tháng:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="p-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 font-bold text-sm"
            />
          </div>
          {isLocked ? (
            <span className="flex items-center gap-1.5 text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1.5 rounded-full">
              <Lock className="w-3.5 h-3.5" /> Đã khoá sổ
              {monthClose?.lockedAt && <span className="text-slate-500 font-normal">· {new Date(monthClose.lockedAt).toLocaleString("vi-VN")}</span>}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs font-bold bg-emerald-950/40 text-emerald-300 border border-emerald-800 px-3 py-1.5 rounded-full">
              <Unlock className="w-3.5 h-3.5" /> Đang mở
            </span>
          )}
        </div>

        {pnlRows.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Chưa có phiên "Completed" nào trong tháng {selectedMonth}.</p>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="text-slate-400">Tổng Doanh Thu Agency</div>
                <div className="text-lg font-black text-emerald-400">{money(totals.revenue)} đ</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="text-slate-400">Tổng Lương Talent + Chi Phí</div>
                <div className="text-lg font-black text-amber-400">{money(totals.payroll + totals.costs)} đ</div>
              </div>
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                <div className="text-slate-400">P&L Sơ Bộ Công Ty</div>
                <div className={`text-lg font-black ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(netProfit)} đ</div>
              </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2">Lương Talent Theo Tháng ({payrollByTalent.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-800">
                        <th className="py-1.5 pr-2">Talent</th>
                        <th className="py-1.5 pr-2 text-right">Số Phiên</th>
                        <th className="py-1.5 pr-2 text-right">Tổng Trả</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payrollByTalent.map((r) => (
                        <tr key={r.talentId} className="border-b border-slate-800/60">
                          <td className="py-1.5 pr-2 text-slate-200 font-medium">{r.name}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-400">{r.sessions}</td>
                          <td className="py-1.5 pr-2 text-right font-bold text-amber-400">{money(r.total)} đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-300 mb-2">Doanh Thu Theo Brand ({revenueByBrand.length})</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500 border-b border-slate-800">
                        <th className="py-1.5 pr-2">Brand</th>
                        <th className="py-1.5 pr-2 text-right">Số Phiên</th>
                        <th className="py-1.5 pr-2 text-right">Doanh Thu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueByBrand.map((r) => (
                        <tr key={r.brandId} className="border-b border-slate-800/60">
                          <td className="py-1.5 pr-2 text-slate-200 font-medium">{r.name}</td>
                          <td className="py-1.5 pr-2 text-right text-slate-400">{r.sessions}</td>
                          <td className="py-1.5 pr-2 text-right font-bold text-emerald-400">{money(r.revenue)} đ</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}

        {canLock && (
          <div className="border-t border-slate-800 pt-4 flex flex-wrap items-center gap-3">
            {!isLocked && (
              <input
                placeholder="Ghi chú khi khoá sổ (tuỳ chọn)"
                value={closeNotes}
                onChange={(e) => setCloseNotes(e.target.value)}
                className="flex-1 min-w-[220px] p-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-100 text-xs"
              />
            )}
            <button
              onClick={handleLockToggle}
              disabled={busy}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-40 ${
                isLocked ? "bg-amber-600 hover:bg-amber-500 text-white" : "bg-purple-600 hover:bg-purple-500 text-white"
              }`}
            >
              {isLocked ? (
                <>
                  <Unlock className="w-3.5 h-3.5" /> Mở Khoá Sổ Tháng {selectedMonth}
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" /> Đóng Sổ Tháng {selectedMonth}
                </>
              )}
            </button>
            {isLocked && (
              <span className="text-[11px] text-slate-500">
                Session Finance thuộc tháng này đã bị khoá sửa ở tầng Supabase — mọi thao tác sửa ở tab Finance &amp; P&amp;L sẽ bị chặn cho tới khi mở khoá.
              </span>
            )}
          </div>
        )}
        {!canLock && (
          <p className="text-[11px] text-slate-500 border-t border-slate-800 pt-3">Chỉ CEO/Admin mới khoá/mở khoá sổ tháng.</p>
        )}
      </div>

      {/* Brand invoices / debt tracking */}
      <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-400" /> Hoá Đơn &amp; Công Nợ Brand — Tháng {selectedMonth}
          </h3>
          <p className="text-xs text-slate-400">Tính xong doanh thu không có nghĩa đã thu được tiền — theo dõi riêng trạng thái thu tiền từng brand.</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-1.5 pr-2">Brand</th>
                <th className="py-1.5 pr-2 text-right">Doanh Thu Tháng</th>
                <th className="py-1.5 pr-2">Hoá Đơn</th>
                <th className="py-1.5 pr-2">Hạn Thu</th>
                <th className="py-1.5 pr-2">Trạng Thái</th>
                <th className="py-1.5 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {revenueByBrand.map((r) => {
                const invoice = invoiceByBrandId[r.brandId];
                return (
                  <tr key={r.brandId} className="border-b border-slate-800/60 align-middle">
                    <td className="py-2 pr-2 text-slate-200 font-medium">{r.name}</td>
                    <td className="py-2 pr-2 text-right text-slate-300">{money(r.revenue)} đ</td>
                    {invoice ? (
                      <>
                        <td className="py-2 pr-2">
                          <input
                            type="number"
                            defaultValue={invoice.amount}
                            onBlur={(e) => handleInvoicePatch(invoice.id, { amount: Number(e.target.value) })}
                            className="w-28 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            type="date"
                            defaultValue={invoice.dueDate ?? ""}
                            onBlur={(e) => handleInvoicePatch(invoice.id, { dueDate: e.target.value || undefined })}
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <select
                            value={invoice.status}
                            onChange={(e) => handleInvoicePatch(invoice.id, { status: e.target.value as BrandInvoice["status"] })}
                            className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                          >
                            {(Object.keys(INVOICE_STATUS_LABEL) as BrandInvoice["status"][]).map((s) => (
                              <option key={s} value={s}>
                                {INVOICE_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2 pr-2">
                          <button
                            onClick={() => onDeleteInvoice(invoice.id)}
                            className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg"
                            title="Xoá hoá đơn"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="py-2 pr-2">
                        <button
                          onClick={() => handleCreateInvoiceForBrand(r.brandId, r.revenue)}
                          disabled={busy}
                          className="flex items-center gap-1 text-purple-400 hover:underline font-bold disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" /> Lập hoá đơn ({money(r.revenue)} đ)
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {revenueByBrand.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 italic">
                    Chưa có doanh thu brand nào trong tháng này.
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
