import React, { useEffect, useMemo, useState } from "react";
import { Calculator, ChevronRight, Download } from "lucide-react";
import type {
  Brand,
  BrandContract,
  BrandMonthlyCommitment,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  LiveSession,
  SessionFinance,
  Talent,
  TalentRateHistoryEntry
} from "../types";
import { PNL_MISSING_LABEL } from "../lib/pnl";
import { HOUR_TOLERANCE, buildMonthClose, monthEndOf, type ContractRevenueRow, type RevenueBasis, type ShopRefundMonth, type TalentPayRow } from "../lib/accounting/monthClose";
import { fetchBrandContracts, fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import { fetchShopDaysMonthSlice } from "../lib/dataraw/monthlyProductSlice";
import { downloadSheetsAsXlsx } from "../lib/exportXlsx";
import { defaultViewMonth } from "../lib/defaultMonth";
import { todayVn } from "../lib/performance/brandCommitment";
import { errorMessage } from "../lib/errorMessage";
import { fmtFixed, fmtMonth, fmtVndFull } from "../lib/format";
import { useToast } from "../hooks/useToast";
import { MonthPicker } from "./common/MonthPicker";
import { PageHeader } from "./common/PageHeader";
import { PlatformChip } from "./common/PlatformChip";
import { StatTile } from "./common/StatTile";

interface AccountingProps {
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  talentRateHistory: TalentRateHistoryEntry[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
}

const TH = "py-2 pr-3 text-[11px] font-semibold text-[var(--text-muted)] whitespace-nowrap";
const TD = "py-2 pr-3 whitespace-nowrap";
const NUM = `${TD} text-right tabular-nums`;

function basisLabel(b: RevenueBasis): string {
  if (b.kind === "hourly") return `Theo giờ · ${fmtVndFull(b.ratePerHour)}/giờ`;
  const rate = `${fmtFixed(b.commissionRate, 1)}% NMV`;
  return b.kind === "nmv_final"
    ? `${rate} · chính thức (hoàn ${fmtFixed(b.returnRate, 1)}% cả shop)`
    : `${rate} · ước tính (hoàn dự kiến ${fmtFixed(b.returnRate, 1)}%)`;
}

function contractLabel(c: ContractRevenueRow): string {
  return c.contract ? c.contract.contractCode || "Hợp đồng không có mã" : "Chưa có hợp đồng hiệu lực";
}

const PeopleTable: React.FC<{ title: string; hint: string; people: TalentPayRow[]; showAssistCols?: boolean; empty: string }> = ({ title, hint, people, showAssistCols = false, empty }) => {
  const [open, setOpen] = useState<string | null>(null);
  const sum = (f: (t: TalentPayRow) => number) => people.reduce((a, t) => a + f(t), 0);
  return (
    <section className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-3">
      <div>
        <h3 className="font-bold text-[var(--text)] text-base">
          {title} <span className="text-xs font-semibold text-[var(--text-muted)]">· {people.length} người</span>
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p>
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left border-b border-[var(--border)]">
                <th className={TH}>Tên</th>
                <th className={`${TH} text-right`}>Ca</th>
                <th className={`${TH} text-right`}>{showAssistCols ? "Giờ host" : "Giờ"}</th>
                {showAssistCols && <th className={`${TH} text-right`}>Giờ trợ live</th>}
                <th className={`${TH} text-right`}>{showAssistCols ? "Công host" : "Công"}</th>
                {showAssistCols && <th className={`${TH} text-right`}>Công trợ live</th>}
                <th className={`${TH} text-right`}>Tổng công</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-muted)]">
              {people.map((t) => {
                const isOpen = open === t.talentId;
                return (
                  <React.Fragment key={t.talentId}>
                    <tr>
                      <td className={`${TD} font-semibold text-[var(--text)]`}>
                        <button type="button" onClick={() => setOpen(isOpen ? null : t.talentId)} aria-expanded={isOpen} className="inline-flex items-center gap-1 min-h-[24px] hover:text-[var(--accent-text)]">
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                          {t.name}
                        </button>
                      </td>
                      <td className={NUM}>{t.sessions}</td>
                      <td className={NUM}>{fmtFixed(showAssistCols ? t.hostHours : t.coHostHours, 1)}</td>
                      {showAssistCols && <td className={NUM}>{t.coHostHours > 0 ? fmtFixed(t.coHostHours, 1) : "—"}</td>}
                      <td className={NUM}>{fmtVndFull(showAssistCols ? t.hostPay : t.coHostPay)}</td>
                      {showAssistCols && <td className={NUM}>{t.coHostPay > 0 ? fmtVndFull(t.coHostPay) : "—"}</td>}
                      <td className={`${NUM} font-bold`}>
                        {t.missingRate ? <span className="text-amber-300" title="Có ca của người này chưa nhập rate">chưa đủ · {fmtVndFull(t.total)}</span> : fmtVndFull(t.total)}
                      </td>
                    </tr>
                    {isOpen &&
                      t.byBrand.map((b) => (
                        <tr key={`${t.talentId}|${b.brandId}|${b.platform}`} className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                          <td className={`${TD} pl-7`}>
                            {b.brandName} <PlatformChip platform={b.platform} />
                          </td>
                          <td className={NUM}>{b.sessions}</td>
                          <td className={NUM}>{fmtFixed(showAssistCols ? b.hostHours : b.coHostHours, 1)}</td>
                          {showAssistCols && <td className={NUM}>{b.coHostHours > 0 ? fmtFixed(b.coHostHours, 1) : "—"}</td>}
                          <td className={NUM}>{fmtVndFull(showAssistCols ? b.hostPay : b.coHostPay)}</td>
                          {showAssistCols && <td className={NUM}>{b.coHostPay > 0 ? fmtVndFull(b.coHostPay) : "—"}</td>}
                          <td className={NUM}>{fmtVndFull(b.hostPay + b.coHostPay)}</td>
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border)] font-bold text-[var(--text)]">
                <td className={TD}>Tổng</td>
                <td className={NUM}>{sum((t) => t.sessions)}</td>
                <td className={NUM}>{fmtFixed(sum((t) => (showAssistCols ? t.hostHours : t.coHostHours)), 1)}</td>
                {showAssistCols && <td className={NUM}>{fmtFixed(sum((t) => t.coHostHours), 1)}</td>}
                <td className={NUM}>{fmtVndFull(sum((t) => (showAssistCols ? t.hostPay : t.coHostPay)))}</td>
                {showAssistCols && <td className={NUM}>{fmtVndFull(sum((t) => t.coHostPay))}</td>}
                <td className={NUM}>{fmtVndFull(sum((t) => t.total))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};

export const Accounting: React.FC<AccountingProps> = ({
  sessions,
  talents,
  brands,
  financeRecords,
  brandPlatformRates,
  talentRateHistory,
  brandPlatformRateHistory
}) => {
  const { showToast } = useToast();
  const today = todayVn();
  const [month, setMonth] = useState(() => defaultViewMonth(today, sessions));
  const [contracts, setContracts] = useState<BrandContract[] | null>(null);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [shopRefunds, setShopRefunds] = useState<{ month: string; byBrand: Record<string, ShopRefundMonth | undefined> } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchBrandContracts(), fetchBrandMonthlyCommitments()])
      .then(([c, m]) => {
        if (!alive) return;
        setContracts(c);
        setCommitments(m);
      })
      .catch((e) => {
        if (!alive) return;
        setContracts([]);
        showToast(`Không nạp được hợp đồng: ${errorMessage(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [showToast]);

  // % hoàn thật của cả shop chỉ cần cho brand thu theo % NMV (tiền chính thức của hợp đồng đó).
  const nmvBrandIds = useMemo(
    () => brands.filter((b) => b.billingModel === "gmv_commission" && sessions.some((s) => s.brandId === b.id && s.date.startsWith(month))).map((b) => b.id),
    [brands, sessions, month]
  );
  useEffect(() => {
    let alive = true;
    const start = `${month}-01`;
    const end = monthEndOf(month);
    Promise.all(
      nmvBrandIds.map(async (id) => {
        const slice = await fetchShopDaysMonthSlice(id, start, end);
        if (!slice.hasAnyBatch || slice.days.length === 0) return [id, undefined] as const;
        const v: ShopRefundMonth = {
          gmv: slice.days.reduce((a, d) => a + d.gmv, 0),
          refunds: slice.days.reduce((a, d) => a + d.refunds, 0),
          lastDate: slice.days[slice.days.length - 1].date
        };
        return [id, v] as const;
      })
    )
      .then((pairs) => {
        if (alive) setShopRefunds({ month, byBrand: Object.fromEntries(pairs) });
      })
      .catch((e) => {
        if (!alive) return;
        setShopRefunds({ month, byBrand: {} });
        showToast(`Không đọc được file Shop Analytics: ${errorMessage(e)}`);
      });
    return () => {
      alive = false;
    };
  }, [month, nmvBrandIds, showToast]);

  const ready = contracts != null && (nmvBrandIds.length === 0 || shopRefunds?.month === month);
  const close = useMemo(() => {
    if (!ready) return null;
    return buildMonthClose({
      month,
      today,
      sessions,
      talents,
      brands,
      financeRecords,
      brandPlatformRates,
      talentRateHistory,
      brandPlatformRateHistory,
      contracts: contracts ?? [],
      commitments,
      shopRefunds: shopRefunds?.month === month ? shopRefunds.byBrand : {}
    });
  }, [ready, month, today, sessions, talents, brands, financeRecords, brandPlatformRates, talentRateHistory, brandPlatformRateHistory, contracts, commitments, shopRefunds]);

  function exportXlsx() {
    if (!close) return;
    const contractRows = close.contracts.map((c) => ({
      Brand: c.brandName,
      Sàn: c.platform,
      "Hợp đồng": contractLabel(c),
      "Cách tính": basisLabel(c.basis),
      "Giờ cam kết": c.committedHours,
      "Giờ đã tính": Math.round(c.hours * 100) / 100,
      "Ca tính được": c.counted,
      "Tổng ca": c.total,
      GMV: Math.round(c.gmv),
      "Doanh thu": Math.round(c.revenue),
      "Doanh thu ước tính": Math.round(c.revenueEstimate),
      "Công host": Math.round(c.hostPay),
      "Công trợ live": Math.round(c.coHostPay),
      Studio: Math.round(c.studioCost),
      Ads: Math.round(c.adsCost),
      "Lãi gộp": Math.round(c.grossProfit)
    }));
    const personRow = (t: TalentPayRow) => ({
      Tên: t.name,
      "Vai chính": t.primaryRole === "host" ? "Host" : "Trợ live",
      "Số ca": t.sessions,
      "Giờ host": Math.round(t.hostHours * 100) / 100,
      "Giờ trợ live": Math.round(t.coHostHours * 100) / 100,
      "Công host": Math.round(t.hostPay),
      "Công trợ live": Math.round(t.coHostPay),
      "Tổng công": Math.round(t.total),
      "Ghi chú": t.missingRate ? "Thiếu rate — số chưa đủ" : ""
    });
    const hostRows = close.hosts.map(personRow);
    const assistantRows = close.assistants.map(personRow);
    const brandHourRows = [...close.hosts, ...close.assistants].flatMap((t) =>
      t.byBrand.map((b) => ({
        Tên: t.name,
        "Vai chính": t.primaryRole === "host" ? "Host" : "Trợ live",
        Brand: b.brandName,
        Sàn: b.platform,
        "Số ca": b.sessions,
        "Giờ host": Math.round(b.hostHours * 100) / 100,
        "Giờ trợ live": Math.round(b.coHostHours * 100) / 100,
        "Công host": Math.round(b.hostPay),
        "Công trợ live": Math.round(b.coHostPay)
      }))
    );
    const checkRows = close.hourCheck.map((h) => ({
      Brand: h.brandName,
      Sàn: h.platform,
      "Số ca": h.sessions,
      "Giờ live của brand": Math.round(h.brandHours * 100) / 100,
      "Tổng giờ host": Math.round(h.hostHours * 100) / 100,
      "Lệch host": Math.round(h.hostGap * 100) / 100,
      "Tổng giờ trợ live": Math.round(h.coHostHours * 100) / 100,
      "Giờ không có trợ": Math.round(h.coHostGap * 100) / 100,
      "Ca chưa có host": h.sessionsNoHost,
      "Ca không có trợ": h.sessionsNoAssistant
    }));
    downloadSheetsAsXlsx(
      [
        { name: "Đối chiếu giờ", rows: checkRows },
        { name: "Doanh thu theo hợp đồng", rows: contractRows },
        { name: "Host", rows: hostRows },
        { name: "Trợ live", rows: assistantRows },
        { name: "Giờ theo brand", rows: brandHourRows }
      ],
      `KeToan_${month}.xlsx`
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  }

  const s = close?.summary;
  const notices: { tone: "rose" | "amber" | "slate"; text: React.ReactNode }[] = [];
  if (close) {
    if (close.missing.sessions > 0)
      notices.push({
        tone: "rose",
        text: (
          <>
            <b>{close.missing.sessions}/{close.summary.total} ca thiếu rate hoặc giá</b> nên không cộng vào doanh thu và chi phí (
            {close.missing.byKind.map(([k, n]) => `${PNL_MISSING_LABEL[k]}: ${n}`).join(" · ")}). Nhập rate ở Talent Pool, giá và tỷ lệ hoàn huỷ ở CRM → Hợp đồng &amp; giá.
          </>
        )
      });
    if (close.unconfirmed.length > 0)
      notices.push({
        tone: "amber",
        text: (
          <>
            <b>{close.unconfirmed.length} ca đã qua giờ nhưng chưa có bằng chứng diễn ra</b> (không số, không report, không giờ live) — chưa tính lương và doanh thu.
          </>
        )
      });
    if (close.backfillCount > 0)
      notices.push({ tone: "slate", text: <>{close.backfillCount} ca nạp bù không tính (rate tháng đó không chuẩn).</> });
    for (const t of close.estimateNotes) notices.push({ tone: "slate", text: t });
    if (close.contracts.some((c) => c.basis.kind === "nmv_final"))
      notices.push({ tone: "slate", text: "NMV chính thức suy từ % hoàn thật của cả shop (file Shop Analytics), không riêng live — là số xấp xỉ." });
  }
  const DOT = { rose: "bg-rose-500", amber: "bg-amber-500", slate: "bg-[var(--text-faint)]" };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Calculator}
        title="Kế Toán"
        description={`Số tháng ${fmtMonth(month)} để đối chiếu với sổ sách: doanh thu theo hợp đồng, công talent, chi phí ca và lãi gộp. Chỉ tính từ dữ liệu trong app.`}
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} size="sm" />
            <button
              type="button"
              onClick={exportXlsx}
              disabled={!close}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[32px] disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />Tải Excel
            </button>
          </>
        }
      />

      {!close || !s ? (
        <p role="status" className="text-sm text-[var(--text-muted)]">Đang nạp hợp đồng và dữ liệu tháng…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile frame="card" label="Doanh thu" value={fmtVndFull(s.revenue)} hint={`tính được ${s.counted}/${s.total} ca`} />
            <StatTile frame="card" label="Công talent" value={fmtVndFull(s.talentPay)} hint="host + trợ live, ca tính được" />
            <StatTile frame="card" label="Chi phí ca" value={fmtVndFull(s.sessionCosts)} hint="studio + Ads theo ca" />
            <StatTile
              frame="card"
              label="Lãi gộp"
              value={s.counted === 0 ? "Chưa tính được" : fmtVndFull(s.grossProfit)}
              tone={s.counted === 0 ? "text-[var(--text-faint)]" : s.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}
              hint={s.revenue > 0 ? `${fmtFixed((s.grossProfit / s.revenue) * 100, 1)}% doanh thu` : undefined}
            />
          </div>

          {notices.length > 0 && (
            <div className="text-[11px] rounded-xl border border-[var(--border)] bg-[var(--surface-base)] divide-y divide-[var(--border-muted)]">
              <p className="px-3 py-1.5 font-semibold text-[var(--text-muted)]">Cần biết trước khi đối chiếu</p>
              {notices.map((n, i) => (
                <div key={i} className="px-3 py-2 flex gap-2">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${DOT[n.tone]}`} aria-hidden />
                  <p className="text-[var(--text-muted)] min-w-0">{n.text}</p>
                </div>
              ))}
            </div>
          )}

          <section className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-3">
            <h3 className="font-bold text-[var(--text)] text-base">Doanh thu và lãi gộp theo hợp đồng</h3>
            {close.contracts.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Tháng {fmtMonth(month)} chưa có ca nào tính tiền.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-[var(--border)]">
                      <th className={TH}>Brand · sàn</th>
                      <th className={TH}>Hợp đồng</th>
                      <th className={TH}>Cách tính</th>
                      <th className={`${TH} text-right`}>Giờ đã tính / cam kết</th>
                      <th className={`${TH} text-right`}>Ca</th>
                      <th className={`${TH} text-right`}>Doanh thu</th>
                      <th className={`${TH} text-right`}>Công talent</th>
                      <th className={`${TH} text-right`}>Studio + Ads</th>
                      <th className={`${TH} text-right`}>Lãi gộp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-muted)]">
                    {close.contracts.map((c) => (
                      <tr key={c.key}>
                        <td className={TD}>
                          <span className="font-semibold text-[var(--text)]">{c.brandName}</span> <PlatformChip platform={c.platform} />
                        </td>
                        <td className={`${TD} ${c.contract ? "text-[var(--text)]" : "text-amber-300"}`}>{contractLabel(c)}</td>
                        <td className={`${TD} text-[var(--text-muted)]`}>{basisLabel(c.basis)}</td>
                        <td className={NUM}>
                          {fmtFixed(c.hours, 1)} / {c.committedHours > 0 ? fmtFixed(c.committedHours, 0) : "—"}
                        </td>
                        <td className={NUM}>{c.counted < c.total ? <span title="ca đủ dữ liệu / tổng ca">{c.counted}/{c.total}</span> : c.total}</td>
                        <td className={NUM}>
                          {fmtVndFull(c.revenue)}
                          {c.basis.kind === "nmv_final" && c.revenue !== c.revenueEstimate && (
                            <div className="text-[11px] text-[var(--text-faint)]" title="so với số ước tính trước đó">
                              ước tính {fmtVndFull(c.revenueEstimate)}
                            </div>
                          )}
                        </td>
                        <td className={NUM}>{fmtVndFull(c.hostPay + c.coHostPay)}</td>
                        <td className={NUM}>{fmtVndFull(c.studioCost + c.adsCost)}</td>
                        <td className={`${NUM} font-bold ${c.grossProfit < 0 ? "text-red-400" : "text-emerald-400"}`}>{c.counted === 0 ? "—" : fmtVndFull(c.grossProfit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-[var(--surface)] p-5 rounded-2xl border border-[var(--border)] space-y-3">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base">Đối chiếu giờ live theo brand</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Giờ live của brand (cộng giờ tính lương từng ca) phải bằng tổng giờ host của mọi người ở brand đó. Trợ live không bắt buộc bằng: phần chênh là giờ ca không có trợ.
              </p>
            </div>
            {close.hourCheck.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Tháng này chưa có ca nào để đối chiếu.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left border-b border-[var(--border)]">
                      <th className={TH}>Brand · sàn</th>
                      <th className={`${TH} text-right`}>Ca</th>
                      <th className={`${TH} text-right`}>Giờ live của brand</th>
                      <th className={`${TH} text-right`}>Tổng giờ host</th>
                      <th className={`${TH} text-right`}>Lệch host</th>
                      <th className={`${TH} text-right`}>Tổng giờ trợ live</th>
                      <th className={`${TH} text-right`}>Giờ không có trợ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-muted)]">
                    {close.hourCheck.map((h) => {
                      const ok = Math.abs(h.hostGap) <= HOUR_TOLERANCE;
                      return (
                        <tr key={`${h.brandId}|${h.platform}`}>
                          <td className={TD}>
                            <span className="font-semibold text-[var(--text)]">{h.brandName}</span> <PlatformChip platform={h.platform} />
                          </td>
                          <td className={NUM}>{h.sessions}</td>
                          <td className={NUM}>{fmtFixed(h.brandHours, 1)}</td>
                          <td className={NUM}>{fmtFixed(h.hostHours, 1)}</td>
                          <td className={`${NUM} font-bold ${ok ? "text-emerald-400" : "text-amber-300"}`}>
                            {ok ? "Khớp" : `${h.hostGap > 0 ? "Thiếu" : "Dư"} ${fmtFixed(Math.abs(h.hostGap), 1)} giờ`}
                            {!ok && h.sessionsNoHost > 0 && <span className="font-normal text-[var(--text-muted)]"> · {h.sessionsNoHost} ca chưa có host</span>}
                          </td>
                          <td className={NUM}>{fmtFixed(h.coHostHours, 1)}</td>
                          <td className={`${NUM} text-[var(--text-muted)]`}>
                            {fmtFixed(h.coHostGap, 1)}
                            {h.sessionsNoAssistant > 0 && <span> · {h.sessionsNoAssistant} ca</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <PeopleTable
            title="Host"
            hint="Ai có làm host trong tháng thì nằm ở đây (kể cả giờ trợ live của họ, ở cột riêng). Bấm một dòng để xem giờ từ brand nào."
            people={close.hosts}
            showAssistCols
            empty="Tháng này chưa có công host."
          />
          <PeopleTable
            title="Trợ live"
            hint="Người chỉ làm trợ live trong tháng. Bấm một dòng để xem giờ từ brand nào."
            people={close.assistants}
            empty="Tháng này chưa có công trợ live riêng."
          />
        </>
      )}
    </div>
  );
};
