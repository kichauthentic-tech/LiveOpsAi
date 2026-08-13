import React, { useMemo, useState } from "react";
import { BrandInvoice, UserRole } from "../../types";
import { Receipt, Plus, Trash2 } from "lucide-react";
import { getTodayMonth } from "../../lib/dateUtils";

interface BrandInvoicesProps {
  brandId: string;
  currentRole: UserRole;
  brandInvoices: BrandInvoice[];
  onAddInvoice: (invoice: { brandId: string; month: string; amount: number; dueDate?: string; notes: string }) => Promise<void>;
  onUpdateInvoice: (
    id: string,
    patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>
  ) => Promise<void>;
  onDeleteInvoice: (id: string) => Promise<void>;
}

const INVOICE_STATUS_LABEL: Record<BrandInvoice["status"], string> = {
  unpaid: "Chưa thu",
  partial: "Thu một phần",
  paid: "Đã thu đủ"
};

export const BrandInvoices: React.FC<BrandInvoicesProps> = ({ brandId, currentRole, brandInvoices, onAddInvoice, onUpdateInvoice, onDeleteInvoice }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [newMonth, setNewMonth] = useState(getTodayMonth());
  const [newAmount, setNewAmount] = useState("");

  const invoices = useMemo(
    () =>
      brandInvoices
        .filter((inv) => inv.brandId === brandId)
        .slice()
        .sort((a, b) => b.month.localeCompare(a.month)),
    [brandInvoices, brandId]
  );

  const outstanding = useMemo(() => invoices.reduce((acc, inv) => acc + Math.max(0, inv.amount - inv.paidAmount), 0), [invoices]);

  const handleCreate = async () => {
    const amount = Number(newAmount);
    if (!Number.isFinite(amount) || amount <= 0 || !newMonth) return;
    setBusy(true);
    try {
      await onAddInvoice({ brandId, month: newMonth, amount, notes: "" });
      setNewAmount("");
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (id: string, patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>) => {
    setBusy(true);
    try {
      await onUpdateInvoice(id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Receipt className="w-5 h-5 text-blue-400" /> Hoá Đơn & Công Nợ
        </h2>
        <span className="text-sm font-bold text-amber-400">Còn phải thu: {outstanding.toLocaleString("vi-VN")}đ</span>
      </div>

      {canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={newMonth}
            onChange={(e) => setNewMonth(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <input
            type="number"
            placeholder="Số tiền hoá đơn"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            className="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newAmount}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Lập hoá đơn
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">Tháng</th>
                <th className="py-2.5 px-2 text-right">Số tiền</th>
                <th className="py-2.5 px-2 text-right">Đã thu</th>
                <th className="py-2.5 px-2">Hạn thu</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-800/60">
                  <td className="py-2.5 px-4 text-slate-300 font-mono">{inv.month}</td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        defaultValue={inv.amount}
                        onBlur={(e) => handlePatch(inv.id, { amount: Number(e.target.value) })}
                        className="w-28 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold text-right"
                      />
                    ) : (
                      <span className="text-slate-200 font-bold">{inv.amount.toLocaleString("vi-VN")}đ</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        defaultValue={inv.paidAmount}
                        onBlur={(e) => handlePatch(inv.id, { paidAmount: Number(e.target.value) })}
                        className="w-28 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold text-right"
                      />
                    ) : (
                      <span className="text-emerald-400 font-bold">{inv.paidAmount.toLocaleString("vi-VN")}đ</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <input
                        type="date"
                        defaultValue={inv.dueDate ?? ""}
                        onBlur={(e) => handlePatch(inv.id, { dueDate: e.target.value || undefined })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    ) : (
                      <span className="text-slate-400">{inv.dueDate ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={inv.status}
                        onChange={(e) => handlePatch(inv.id, { status: e.target.value as BrandInvoice["status"] })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        {(Object.keys(INVOICE_STATUS_LABEL) as BrandInvoice["status"][]).map((s) => (
                          <option key={s} value={s}>
                            {INVOICE_STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300 font-bold">{INVOICE_STATUS_LABEL[inv.status]}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <button onClick={() => onDeleteInvoice(inv.id)} className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg" title="Xoá hoá đơn">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-slate-500 italic">
                    Chưa có hoá đơn nào.
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
