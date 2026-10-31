import React, { useState } from "react";
import type { Settlement } from "../lib/commercial/fees";
import type { MonthFeeInputs, Platform } from "../lib/commercial/terms";
import { upsertMonthFeeInputs } from "../lib/db/brandTerms";
import { errorMessage } from "../lib/errorMessage";
import { fmtNum, fmtVndFull } from "../lib/format";
import { Field, NumInput, btnCls } from "./crm/fields";

// Chi tiết phí của MỘT hợp đồng trong tháng (Kế Toán): từng khoản ra bao nhiêu và vì sao. Khoản nào cần số nhập tay của tháng
// (chi tiêu Ads, số creator, GMV affiliate) thì có ô nhập ngay đây — nhập xong bảng tính đổi ngay.

interface Props {
  brandId: string;
  platform: Platform;
  periodMonth: string; // YYYY-MM-01
  settlement: Settlement;
  saved?: MonthFeeInputs;
  canEdit: boolean;
  onSaved: (row: MonthFeeInputs) => void;
}

export const AccountingFeeDetail: React.FC<Props> = ({ brandId, platform, periodMonth, settlement, saved, canEdit, onSaved }) => {
  const [form, setForm] = useState({ ads: saved?.adsSpend ?? 0, creators: saved?.creatorsBooked ?? 0, affGmv: saved?.affiliateGmv ?? 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needs = settlement.needs;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onSaved(
        await upsertMonthFeeInputs(brandId, platform, periodMonth, {
          adsSpend: needs.includes("ads") ? form.ads : saved?.adsSpend,
          creatorsBooked: needs.includes("creators") ? form.creators : saved?.creatorsBooked,
          affiliateGmv: needs.includes("affiliate_gmv") ? form.affGmv : saved?.affiliateGmv,
          note: saved?.note
        })
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-[var(--border-muted)]">
          {settlement.lines.map((l) => (
            <tr key={l.key}>
              <td className="py-1.5 pr-3 align-top">
                <span className="font-semibold text-[var(--text)]">{l.label}</span>
                <span className="block text-[11px] text-[var(--text-faint)]">{l.detail}</span>
              </td>
              <td className={`py-1.5 text-right tabular-nums align-top ${l.amount < 0 ? "text-rose-300" : "text-[var(--text)]"}`}>{fmtVndFull(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {settlement.owedHours > 0 && <p className="text-[11px] text-amber-300">Còn nợ {fmtNum(settlement.owedHours, 1)} giờ cam kết cần bù.</p>}
      {needs.length > 0 && (
        <div className="flex flex-wrap items-end gap-3">
          {needs.includes("ads") && <Field label="Chi tiêu Ads trong tháng" className="w-48"><NumInput label="Chi tiêu Ads trong tháng" value={form.ads} step={1000000} disabled={!canEdit} onChange={(v) => setForm({ ...form, ads: v })} /></Field>}
          {needs.includes("creators") && <Field label="Số creator đã book" className="w-40"><NumInput label="Số creator đã book" value={form.creators} disabled={!canEdit} onChange={(v) => setForm({ ...form, creators: Math.round(v) })} /></Field>}
          {needs.includes("affiliate_gmv") && <Field label="GMV affiliate trong tháng" className="w-48"><NumInput label="GMV affiliate trong tháng" value={form.affGmv} step={1000000} disabled={!canEdit} onChange={(v) => setForm({ ...form, affGmv: v })} /></Field>}
          {canEdit && <button type="button" onClick={save} disabled={busy} className={`${btnCls} mb-0.5`}>{busy ? "…" : "Lưu số tháng"}</button>}
        </div>
      )}
      {error && <p className="text-[11px] text-rose-300">{error}</p>}
    </div>
  );
};
