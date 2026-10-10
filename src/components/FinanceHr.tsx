import React, { useMemo, useState } from "react";
import { defaultViewMonth } from "../lib/defaultMonth";
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
import { PNL_MISSING_LABEL, PnlMissingInput, computeSessionPnl, isPnlSession } from "../lib/pnl";
import { sessionAdsCost } from "../lib/metrics/adsCost";
import { DataSourceBadge } from "./common/DataSourceBadge";
import { dataQuality } from "../lib/performance/hostPerformance";
import { errorMessage } from "../lib/errorMessage";
import { todayVn } from "../lib/performance/brandCommitment";
import { useToast } from "../hooks/useToast";
import { PageIntro } from "./common/PageIntro";
import { isUnconfirmedPast } from "../lib/sessionStatus";

import { fmtMonth, fmtFixed } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { PageHeader } from "./common/PageHeader";
import { PlatformChip } from "./common/PlatformChip";
import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../lib/reportPlatform";
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
    patch: Partial<Pick<SessionFinance, "studioCost" | "notes">>
  ) => Promise<void>;
  onSetFinanceApproval: (sessionId: string, status: SessionFinance["approvalStatus"]) => Promise<void>;
}

const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

// Nhãn ngắn để gộp các mục thiếu của một ca thành MỘT nhãn trong bảng (10/10: trước đó mỗi mục
// một nhãn dài, 70/70 ca thiếu 2–3 mục → mỗi dòng cao 3–4 hàng). Nhãn đầy đủ nằm ở `title`.
const MISSING_SHORT: Record<PnlMissingInput, string> = {
  host_rate: "rate host",
  cohost_rate: "rate trợ live",
  brand_rate: "rate brand",
  commission_default: "% commission"
};

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
  const { showToast } = useToast();
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
  const [month, setMonth] = useState(() => defaultViewMonth(todayVn(), sessions)); // tháng gần nhất có ca (lib/defaultMonth.ts)

  // Real P&L is only meaningful for sessions that actually ran and closed with real GMV/orders.
  // Ca backfill (sinh từ file để nạp bù tháng cũ, 0086) bỏ ra: rate card tháng đó không chuẩn.
  const completedSessions = useMemo(
    () =>
      sessions
        .filter((s) => isPnlSession(s, { includeBackfill: false }) && s.date.startsWith(month))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [sessions, month]
  );
  // Ca nạp bù cùng tháng: không tính ở đây nhưng PHẢI nói ra — trước audit 2026-09-28 tháng 9 (47 ca, toàn nạp bù)
  // hiện "Không có phiên Completed nào" trong khi Bản Tin CEO (có tính ca nạp bù) báo 47 ca.
  const backfillCount = useMemo(
    () => sessions.filter((s) => isPnlSession(s, { includeBackfill: true }) && s.isBackfill && s.date.startsWith(month)).length,
    [sessions, month]
  );
  // #5 (audit workflow 2026-10-04): ca quá giờ tự thành "đã xong" kể cả khi không ai live. Không có bằng chứng
  // (số/report/giờ live) thì KHÔNG vào tiền — nhưng phải nói ra, không thì lương tháng thiếu mà không ai biết.
  const unconfirmed = useMemo(
    () => sessions.filter((s) => s.date.startsWith(month) && !s.isBackfill && isUnconfirmedPast(s)).sort((a, b) => (a.date < b.date ? -1 : 1)),
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
          grossAgencyRev: acc.grossAgencyRev + r.grossAgencyRev,
          hostPayout: acc.hostPayout + r.hostPayout + r.coHostPayout,
          netProfit: acc.netProfit + r.netProfit
        }),
        // Chỉ cộng TIỀN (cộng được qua sàn). Không có tổng GMV: user chốt 07/10 không cộng GMV TikTok với Shopee.
        { grossAgencyRev: 0, hostPayout: 0, netProfit: 0 }
      ),
    [rows]
  );
  // Lãi/lỗ THEO KÊNH (Bước 4 đa sàn, 07/10): tiền của agency cộng được qua mọi kênh (user chốt) — một bảng toàn agency, mỗi dòng
  // một kênh brand × sàn. Không có cột GMV: GMV hai sàn không cộng.
  const byChannel = useMemo(() => {
    const m = new Map<string, { brandName: string; platform: ReportPlatform; n: number; rev: number; pay: number; profit: number }>();
    for (const r of rows) {
      const p = platformOf(r.session);
      const k = `${r.session.brandId}|${p}`;
      const e = m.get(k) ?? { brandName: r.session.brandName, platform: p, n: 0, rev: 0, pay: 0, profit: 0 };
      e.n += 1;
      e.rev += r.grossAgencyRev;
      e.pay += r.hostPayout + r.coHostPayout;
      e.profit += r.netProfit;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => REPORT_PLATFORMS.indexOf(a.platform) - REPORT_PLATFORMS.indexOf(b.platform) || a.brandName.localeCompare(b.brandName));
  }, [rows]);

  const totalMargin = totals.grossAgencyRev > 0 ? fmtFixed(((totals.netProfit / totals.grossAgencyRev) * 100), 1) : "0";

  // Đ3: phiên nào đang được tính bằng rate = 0 / % mặc định. Số 0 vì "chưa nhập rate" và số 0 vì
  // "thật sự không tốn tiền" cho ra cùng một Net Profit, nên màn tiền phải tự nói ra — chứ không
  // phải để người đọc tự đoán. Đếm theo từng loại thiếu để câu cảnh báo chỉ đúng chỗ cần sửa.
  const missingSummary = useMemo(() => {
    const byKind = new Map<PnlMissingInput, number>();
    let rowsAffected = 0;
    for (const r of rows) {
      if (r.missingInputs.length === 0) continue;
      rowsAffected += 1;
      for (const m of r.missingInputs) byKind.set(m, (byKind.get(m) ?? 0) + 1);
    }
    return { rowsAffected, byKind: [...byKind.entries()] };
  }, [rows]);

  async function handleFieldChange(
    sessionId: string,
    field: "studioCost",
    value: number
  ) {
    setSavingId(sessionId);
    try {
      await onUpdateFinance(sessionId, { [field]: value });
    } catch (e) {
      showToast(errorMessage(e, "Không lưu được số liệu tài chính."));
    } finally {
      setSavingId(null);
    }
  }

  async function handleApprove(sessionId: string, status: SessionFinance["approvalStatus"]) {
    setSavingId(sessionId);
    try {
      await onSetFinanceApproval(sessionId, status);
    } catch (e) {
      showToast(errorMessage(e, "Không cập nhật được trạng thái duyệt. Có thể bạn không có quyền CEO."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        title="Finance & P&L"
        description="Lãi/lỗ theo từng ca đã chạy xong trong tháng: GMV, hoa hồng agency, chi phí host, studio và ads."
        actions={<MonthPicker value={month} onChange={setMonth} size="sm" />}
      />

      {/* Real P&L report per completed session */}
      <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] shadow-sm space-y-4">
        <div className="border-b border-[var(--border)] pb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[var(--accent-text)]" /> Lãi/lỗ từng ca
            </h3>
            <PageIntro>
              GMV lấy từ số của ca, tiền trả host/trợ live tính theo rate ở Talent Pool, doanh thu agency theo giá của brand (CRM → Hợp đồng & giá). Chi phí studio nhập ở đây, Ads theo ca lấy từ report ca. Chỉ CEO duyệt.
            </PageIntro>
          </div>
          <div className="text-right text-xs bg-[var(--surface-elevated)]/50 border border-[var(--border)] rounded-xl px-4 py-2">
            <div className="text-[var(--text-muted)]">
              Tổng {rows.length} ca{backfillCount > 0 && rows.length > 0 ? ` (không tính ${backfillCount} ca nạp bù)` : ""} · Lãi/lỗ
              {missingSummary.rowsAffected > 0 && (
                <span className="text-amber-300 font-bold"> · {rows.length - missingSummary.rowsAffected}/{rows.length} ca đủ rate</span>
              )}
            </div>
            <div className={`text-lg font-black ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {money(totals.netProfit)} <span className="text-xs font-bold text-[var(--text-muted)]">({totalMargin}%)</span>
            </div>
          </div>
        </div>

        {/* Đ3 (2026-09-24): trước bản này màn P&L in ra con số chắc nịch dựng trên rate = 0 và %
            commission mặc định trong code, không một chữ cảnh báo — trong khi Report Tháng thì đã
            cảnh báo đúng kiểu này cho tỷ lệ hoàn huỷ. Đây là cùng một câu, đặt đúng chỗ.
            10/10: 3 dải cảnh báo (thiếu rate / ca chưa xác nhận / nguồn GMV) gộp thành MỘT khối,
            mỗi lý do một dòng có chấm màu — trước đó 3 hộp màu chồng nhau đẩy bảng xuống ~230px. */}
        {(missingSummary.rowsAffected > 0 || unconfirmed.length > 0 || (rows.length > 0 && quality.reconciled < quality.total)) && (
          <div className="text-[11px] rounded-xl border border-[var(--border)] bg-[var(--surface-base)] divide-y divide-[var(--border-muted)]">
            <p className="px-3 py-1.5 font-bold text-[var(--text-muted)] uppercase tracking-wider">Số trên trang này chưa chắc chắn vì</p>
            {missingSummary.rowsAffected > 0 && (
              <div className="px-3 py-2 flex gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-rose-500 shrink-0" aria-hidden />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-rose-200">
                    <b>{missingSummary.rowsAffected}/{rows.length} ca đang tính bằng rate chưa nhập</b> — Lãi/lỗ ở trên KHÔNG phải số thật,
                    nó đang coi phần chưa nhập là 0 (hoặc dùng % mặc định trong code).
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {missingSummary.byKind.map(([kind, n], i) => (
                      <span key={kind}>
                        {i > 0 && " · "}
                        {PNL_MISSING_LABEL[kind]}: {n} phiên
                      </span>
                    ))}
                    . Nhập rate talent ở "Talent Pool", giá + tỷ lệ hoàn huỷ của brand ở "CRM → Hợp đồng & giá".
                  </p>
                </div>
              </div>
            )}
            {unconfirmed.length > 0 && (
              <div className="px-3 py-2 flex gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
                <div className="space-y-0.5 min-w-0">
                  <p className="text-amber-200">
                    <b>{unconfirmed.length} ca đã qua giờ nhưng chưa có bằng chứng diễn ra</b> (không số, không report, không giờ live) — CHƯA tính
                    lương/doanh thu. Ca có chạy: giao ca ở Cửa sổ Ca Live. Ca không diễn ra: huỷ ca để khỏi tính vào giờ cam kết.
                  </p>
                  <p className="text-[var(--text-muted)]">
                    {unconfirmed.slice(0, 8).map((s) => `${s.brandName} ${s.date.slice(8)}/${s.date.slice(5, 7)} ${s.startTime} (${s.hostName || "chưa gán"})`).join(" · ")}
                    {unconfirmed.length > 8 ? ` · +${unconfirmed.length - 8} ca` : ""}
                  </p>
                </div>
              </div>
            )}
            {rows.length > 0 && quality.reconciled < quality.total && (
              <div className="px-3 py-2 flex gap-2">
                <span className="mt-1 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-hidden />
                <p className="text-amber-200 min-w-0">
                  Nguồn GMV của {quality.total} phiên: <b>{quality.reconciled}</b> đã đối soát
                  {quality.snapshot > 0 && <>, <b>{quality.snapshot}</b> số lúc giao ca (sàn còn cập nhật đơn/hoàn/huỷ sau đó)</>}
                  {quality.manual > 0 && <>, <b>{quality.manual}</b> talent tự khai (chưa có gì bảo chứng)</>}.
                  <span className="text-[var(--text-muted)]"> Số tiền của các phiên chưa đối soát là tạm tính — duyệt sau khi đối soát ở Dữ Liệu Gốc của brand (mục Đối soát số liệu).</span>
                </p>
              </div>
            )}
          </div>
        )}

        {byChannel.length > 1 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3">Kênh</th>
                  <th className="py-2 pr-3 text-right">Ca</th>
                  <th className="py-2 pr-3 text-right">Doanh thu agency</th>
                  <th className="py-2 pr-3 text-right">Trả host / trợ live</th>
                  <th className="py-2 pr-3 text-right">Lãi/lỗ</th>
                  <th className="py-2 pr-3 text-right">Biên</th>
                </tr>
              </thead>
              <tbody>
                {byChannel.map((c) => (
                  <tr key={`${c.brandName}|${c.platform}`} className="border-b border-[var(--border-muted)]">
                    <td className="py-2 pr-3 font-bold text-[var(--text)] whitespace-nowrap">{c.brandName} <PlatformChip platform={c.platform} /></td>
                    <td className="py-2 pr-3 text-right font-mono">{c.n}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(c.rev)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{money(c.pay)}</td>
                    <td className={`py-2 pr-3 text-right font-mono font-bold ${c.profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(c.profit)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{c.rev > 0 ? `${fmtFixed((c.profit / c.rev) * 100, 1)}%` : "—"}</td>
                  </tr>
                ))}
                <tr className="bg-[var(--surface-elevated)]/40 font-bold">
                  <td className="py-2 pr-3 text-[var(--text)]">Toàn agency</td>
                  <td className="py-2 pr-3 text-right font-mono">{rows.length}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(totals.grossAgencyRev)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{money(totals.hostPayout)}</td>
                  <td className={`py-2 pr-3 text-right font-mono ${totals.netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>{money(totals.netProfit)}</td>
                  <td className="py-2 pr-3 text-right font-mono">{totalMargin}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] italic py-6 text-center">
            {backfillCount > 0
              ? `Tháng ${fmtMonth(month)} chỉ có ${backfillCount} ca nạp bù từ file — Finance & P&L không tính ca nạp bù (lương và giá các tháng đó chưa nhập chuẩn). Xem GMV và giờ của các ca này ở Dashboard.`
              : `Không có ca nào đã xong trong tháng ${fmtMonth(month)} để tính P&L.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3">Ca</th>
                  <th className="py-2 pr-3">GMV</th>
                  <th className="py-2 pr-3">Doanh thu agency</th>
                  <th className="py-2 pr-3">Chi phí studio</th>
                  <th className="py-2 pr-3">Chi phí ads (report ca)</th>
                  <th className="py-2 pr-3">Trả host / trợ live</th>
                  <th className="py-2 pr-3">Lãi/lỗ</th>
                  <th className="py-2 pr-3">Duyệt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ session: s, finance, talent, isHourly, agencyCommissionRate, grossAgencyRev, hostPayout, netProfit, hostPaidHourly, billableHours, otMinutes, earlyLeaveMinutes, coHost, coHostPayout, coHostPaidHourly, coHostUsesAssistantRate, missingInputs, excluded, payouts, segmented }) => {
                  return (
                  <tr key={s.id} className="border-b border-[var(--border)]/60 align-middle">
                    <td className="py-2 pr-3">
                      <div className="font-bold text-[var(--text)] flex items-center gap-1.5 flex-wrap">
                        {s.title}
                        {excluded && (
                          <span className="text-[11px] font-bold bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-0.5 rounded-full" title={s.excludedReason ? `Lý do loại: ${s.excludedReason}` : undefined}>
                            Đã loại khỏi báo cáo — chỉ tính công, không tính GMV/doanh thu
                          </span>
                        )}
                        {missingInputs.length > 0 && (
                          <span className="text-[11px] font-bold bg-rose-950 text-rose-300 border border-rose-800 px-1.5 py-0.5 rounded-full" title={missingInputs.map((m) => PNL_MISSING_LABEL[m]).join("\n")}>
                            Thiếu {missingInputs.map((m) => MISSING_SHORT[m]).join(" · ")}
                          </span>
                        )}
                      </div>
                      <div className="text-[var(--text-muted)]">{s.brandName} · {s.date} · Host {talent?.name ?? s.hostName}</div>
                    </td>
                    <td className="py-2 pr-3">
                      <div className={`font-bold text-[var(--text-muted)] ${excluded ? "line-through" : ""}`}>{money(s.actualGmv)}</div>
                      <DataSourceBadge dataSource={s.dataSource} platform={s.platform} className="mt-0.5" />
                    </td>
                    <td className="py-2 pr-3">
                      {isHourly ? (
                        <div>
                          <span className="text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-800 px-1.5 py-0.5 rounded-full">
                            Theo giờ live
                          </span>
                          <div className="font-bold text-[var(--text)] mt-0.5">{money(grossAgencyRev)}</div>
                        </div>
                      ) : (
                        // % hoa hồng theo brand × sàn ở CRM (gộp cấu hình 06/10) — không sửa từng ca ở đây.
                        <div>
                          <span className="text-[11px] font-bold text-[var(--text-muted)]">{agencyCommissionRate}% NMV</span>
                          <div className="font-bold text-[var(--text)] mt-0.5">{money(grossAgencyRev)}</div>
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
                      {/* Một nguồn: số trợ live nhập ở report ca (gộp 06/10 — bỏ ô sửa thứ hai ở đây). */}
                      <div className="font-bold text-[var(--text-muted)]">{money(sessionAdsCost(s))}</div>
                    </td>
                    {/* Giai đoạn 3 — nói rõ con số ra từ đâu: talent ăn theo giờ thì hiện giờ
                        công thực tế + phần OT/off sớm host đã khai, để ops đối chiếu khi duyệt. */}
                    <td className="py-2 pr-3">
                      <div className="text-amber-400 font-bold">{money(hostPayout)}</div>
                      {/* Đổi người giữa ca (0138): mỗi người một dòng — công theo giờ của chính họ. */}
                      {segmented && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5 space-y-0.5">
                          {payouts.map((p) => (
                            <div key={`${p.role}-${p.talentId}`}>
                              {p.role === "host" ? "Host" : "Trợ"} {p.name}: {fmtFixed(p.hours, 2)}h · <b>{p.missingRate ? "chưa có rate" : money(p.payout)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                      {!segmented && hostPaidHourly && (
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                          {fmtFixed(billableHours, 2)}h × rate/giờ
                          {otMinutes > 0 && <span className="text-emerald-400 font-bold"> · OT +{otMinutes}p</span>}
                          {earlyLeaveMinutes > 0 && <span className="text-amber-400 font-bold"> · off sớm −{earlyLeaveMinutes}p</span>}
                        </div>
                      )}
                      {/* Trợ live có công (user chốt 2026-09-18) — hiện tách dòng để ops thấy Net
                          Profit trừ những ai. Ca có co_host_id nhưng talent đã bị xoá thì không
                          tính được, phải nói ra chứ không im lặng ra 0. */}
                      {segmented ? null : coHost ? (
                        <div className="text-[11px] text-amber-300/80 mt-1">
                          Trợ live {coHost.name}: <b>{money(coHostPayout)}</b>
                          {coHostPaidHourly && <span className="text-[var(--text-muted)]"> ({fmtFixed(billableHours, 2)}h × {coHostUsesAssistantRate ? "rate trợ/giờ" : "rate host/giờ — chưa đặt rate trợ"})</span>}
                        </div>
                      ) : s.coHostId ? (
                        <div className="text-[11px] text-red-300 mt-1">Trợ live {s.coHostName || "—"} không còn hồ sơ talent — chưa tính công</div>
                      ) : null}
                    </td>
                    <td className={`py-2 pr-3 font-black ${netProfit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {money(netProfit)}
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
