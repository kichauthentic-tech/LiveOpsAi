import React, { useMemo, useState } from "react";
import type { Brand, BrandContract, BrandMonthlyCommitment, BrandPlatformRate, LiveSession } from "../../types";
import { feeInputOf, settleMonth } from "../../lib/commercial/fees";
import { feeOf, resolveTerms, termsLabel, type MonthFeeInputs, type Platform, type TermsPeriod } from "../../lib/commercial/terms";
import { upsertMonthFeeInputs } from "../../lib/db/brandTerms";
import { monthCommitmentOf } from "../../lib/performance/brandCommitment";
import { errorMessage } from "../../lib/errorMessage";
import { fmtMonth, fmtNum, fmtVndFull } from "../../lib/format";
import { isPnlSession } from "../../lib/pnl";
import { platformOf } from "../../lib/reportPlatform";
import { DEFAULT_RETURN_RATE_ESTIMATE } from "../../lib/refundStatus";
import { monthEndOf } from "../../lib/accounting/monthClose";
import { MonthPicker } from "../common/MonthPicker";
import { Field, NumInput, btnCls } from "./fields";

// “Tính phí tháng”: xem điều khoản ra bao nhiêu tiền trên CÁC CA THẬT của một tháng (cùng hàm settleMonth với Kế Toán; ở đây NMV
// luôn theo % hoàn dự kiến của CRM) và nhập số tháng chưa có nguồn tự động: chi tiêu Ads, số creator đã book, GMV affiliate.

interface Props {
  brand: Brand;
  platform: Platform;
  canEdit: boolean;
  today: string;
  sessions: LiveSession[];
  rate?: BrandPlatformRate;
  contracts: BrandContract[];
  commitments: BrandMonthlyCommitment[];
  periods: TermsPeriod[];
  inputs: MonthFeeInputs[];
  onInputsChanged: (row: MonthFeeInputs) => void;
}

export const MonthSettlementPanel: React.FC<Props> = ({ brand, platform, canEdit, today, sessions, rate, contracts, commitments, periods, inputs, onInputsChanged }) => {
  const [month, setMonth] = useState(today.slice(0, 7));
  const periodMonth = `${month}-01`;
  const asOf = month === today.slice(0, 7) ? today : monthEndOf(month);
  const period = resolveTerms(periods, brand.id, platform, asOf);
  const saved = inputs.find((x) => x.brandId === brand.id && x.platform === platform && x.periodMonth === periodMonth);

  const [draft, setDraft] = useState<{ key: string; ads: number; creators: number; affGmv: number } | null>(null);
  const key = `${month}|${saved?.id ?? ""}`;
  const form = draft?.key === key ? draft : { key, ads: saved?.adsSpend ?? 0, creators: saved?.creatorsBooked ?? 0, affGmv: saved?.affiliateGmv ?? 0 };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthSessions = useMemo(
    () => sessions.filter((s) => s.brandId === brand.id && platformOf(s) === platform && s.date.startsWith(month) && isPnlSession(s, { includeBackfill: false })),
    [sessions, brand.id, platform, month]
  );
  const commit = monthCommitmentOf(commitments, contracts, brand.id, platform, periodMonth);
  const returnRate = rate && rate.returnRate > 0 ? rate.returnRate : DEFAULT_RETURN_RATE_ESTIMATE;

  const terms = period?.terms;
  const needsAds = !!terms && !!feeOf(terms, "ads_mgmt");
  const aff = terms ? feeOf(terms, "affiliate_booking") : undefined;
  const settlement = useMemo(() => {
    if (!terms) return null;
    return settleMonth(terms, {
      sessions: monthSessions.map((s) => feeInputOf(s, returnRate)),
      committedHours: commit.hours,
      committedGmv: commit.gmv,
      adsSpend: needsAds ? (saved?.adsSpend ?? undefined) : undefined,
      creatorsBooked: aff && aff.perCreator > 0 ? saved?.creatorsBooked : undefined,
      affiliateGmv: aff && aff.pctOfAffiliateGmv > 0 ? saved?.affiliateGmv : undefined
    });
  }, [terms, monthSessions, returnRate, commit.hours, commit.gmv, needsAds, aff, saved]);

  async function saveInputs() {
    setBusy(true);
    setError(null);
    try {
      const row = await upsertMonthFeeInputs(brand.id, platform, periodMonth, {
        adsSpend: needsAds ? form.ads : saved?.adsSpend,
        creatorsBooked: aff && aff.perCreator > 0 ? form.creators : saved?.creatorsBooked,
        affiliateGmv: aff && aff.pctOfAffiliateGmv > 0 ? form.affGmv : saved?.affiliateGmv,
        note: saved?.note
      });
      onInputsChanged(row);
      setDraft(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--text-muted)]">
          {period && terms ? `${period.label || "Điều khoản chính"} · ${termsLabel(terms)}` : `Chưa có điều khoản hiệu lực trong ${fmtMonth(month)}.`}
        </p>
        <MonthPicker value={month} onChange={setMonth} align="right" ariaLabel="Tháng tính phí" size="sm" />
      </div>

      {period && terms && settlement && (
        <>
          <p className="text-[11px] text-[var(--text-faint)]">
            {monthSessions.length} ca · {fmtNum(settlement.hours, 1)} giờ · cam kết {commit.hours > 0 ? `${fmtNum(commit.hours, 0)} giờ` : "chưa có"}
            {commit.gmv ? ` · ${fmtVndFull(commit.gmv)} GMV` : ""}
          </p>

          {(needsAds || (aff && (aff.perCreator > 0 || aff.pctOfAffiliateGmv > 0))) && (
            <div className="flex flex-wrap items-end gap-3">
              {needsAds && <Field label="Chi tiêu Ads trong tháng" className="w-48"><NumInput label="Chi tiêu Ads trong tháng" value={form.ads} step={1000000} disabled={!canEdit} onChange={(v) => setDraft({ ...form, ads: v })} /></Field>}
              {aff && aff.perCreator > 0 && <Field label="Số creator đã book" className="w-40"><NumInput label="Số creator đã book" value={form.creators} disabled={!canEdit} onChange={(v) => setDraft({ ...form, creators: Math.round(v) })} /></Field>}
              {aff && aff.pctOfAffiliateGmv > 0 && <Field label="GMV affiliate trong tháng" className="w-48"><NumInput label="GMV affiliate trong tháng" value={form.affGmv} step={1000000} disabled={!canEdit} onChange={(v) => setDraft({ ...form, affGmv: v })} /></Field>}
              {canEdit && <button type="button" onClick={saveInputs} disabled={busy} className={`${btnCls} mb-0.5`}>{busy ? "…" : "Lưu số tháng"}</button>}
            </div>
          )}
          {error && <p className="text-[11px] text-rose-300">{error}</p>}

          <table className="w-full text-xs">
            <tbody className="divide-y divide-[var(--border-muted)]">
              {settlement.lines.length === 0 && <tr><td className="py-2 text-[var(--text-faint)]">Điều khoản chưa có khoản phí nào.</td></tr>}
              {settlement.lines.map((l) => (
                <tr key={l.key}>
                  <td className="py-1.5 pr-3 align-top">
                    <span className="font-semibold text-[var(--text)]">{l.label}</span>
                    <span className="block text-[11px] text-[var(--text-faint)]">{l.detail}</span>
                  </td>
                  <td className={`py-1.5 text-right tabular-nums align-top ${l.amount < 0 ? "text-rose-300" : "text-[var(--text)]"}`}>{fmtVndFull(l.amount)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-black text-[var(--text)]">Tổng phí tháng</td>
                <td className="py-2 text-right tabular-nums font-black text-[var(--text)]">{fmtVndFull(settlement.total)}</td>
              </tr>
            </tbody>
          </table>
          {settlement.missing.length > 0 && <p className="text-[11px] text-amber-300">Chưa tính đủ — còn thiếu: {settlement.missing.join("; ")}.</p>}
          {settlement.owedHours > 0 && <p className="text-[11px] text-amber-300">Còn nợ {fmtNum(settlement.owedHours, 1)} giờ cam kết cần bù.</p>}
          <p className="text-[11px] text-[var(--text-faint)]">Xem thử, hoàn huỷ dự kiến {fmtNum(returnRate, 1)}%. Số chính thức ở Kế Toán.</p>
        </>
      )}
    </div>
  );
};
