import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import type { LiveSession, Talent, TalentRateHistoryEntry } from "../../types";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import { getTodayDate } from "../../lib/dateUtils";
import { REPORT_PLATFORMS } from "../../lib/reportPlatform";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../lib/errorMessage";
import { buildMonthReview, castPctOf, type ReviewRole } from "../../lib/roster/monthReview";
import { exportMonthReview } from "../../lib/roster/monthReviewExport";

// Tổng kết tháng theo người (13/11, theo sheet nghiệm thu của trainer): giờ Plan vs Nghiệm thu, cast Plan vs Nghiệm thu, GMV mang về
// (tách TikTok / Shopee, không cộng gộp) và cast %. Số lấy cùng công thức tiền công của Finance (`computeSessionPnl`).

const shiftMonth = (month: string, delta: number) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + delta, 1)).toISOString().slice(0, 7);
const fmtH = (h: number) => `${(Math.round(h * 10) / 10).toLocaleString("vi-VN")}h`;

export const MonthReviewPanel: React.FC<{
  month: string;
  sessions: LiveSession[];
  talents: Talent[];
  history: TalentRateHistoryEntry[];
  nameOf: (id: string) => string;
  showCost: boolean;
}> = ({ month: initialMonth, sessions, talents, history, nameOf, showCost }) => {
  const { showToast } = useToast();
  const [month, setMonth] = useState(initialMonth);
  const [role, setRole] = useState<ReviewRole>("host");
  const [busy, setBusy] = useState(false);
  const today = getTodayDate();
  const review = useMemo(() => buildMonthReview({ sessions, talents, history, month, role, today }), [sessions, talents, history, month, role, today]);

  if (!showCost) return <p className="text-sm text-[var(--text-muted)]">Chưa có rate nào — nhập rate ở Talent Pool để xem tổng kết cast.</p>;

  const isHost = role === "host";
  const t = review.totals;
  const rateText = (r: { rateMin: number; rateMax: number; perSession: boolean }) =>
    r.rateMax <= 0 ? (r.perSession ? "theo phiên" : "—") : r.rateMin === r.rateMax ? fmtVndShort(r.rateMax) : `${fmtVndShort(r.rateMin)}–${fmtVndShort(r.rateMax)}`;
  // Chỉ cast % từng sàn (số GMV nằm ở tooltip); sàn chưa đủ 3 giờ thì bỏ hẳn, không hiện chữ thừa.
  const pctLines = (by: typeof t.byPlatform) =>
    REPORT_PLATFORMS.map((p) => ({ p, v: castPctOf(by[p]) }))
      .filter((x) => x.v !== null)
      .map(({ p, v }) => (
        <span key={p} className="block whitespace-nowrap" title={`${p}: GMV ${fmtVndShort(by[p].gmv)} · cast ${fmtVndShort(by[p].cast)} · ${fmtH(by[p].hours)}`}>
          <span className="text-2xs text-[var(--text-faint)]">{p === "TikTok" ? "TikTok" : "Shopee"}</span> <b className="text-[var(--text)]">{fmtFixed((v as number) * 100, 1)}%</b>
        </span>
      ));
  // Dòng "plan" chỉ hiện khi lệch ≥ 5% so với nghiệm thu — còn lại là số lặp, chỉ gây rối.
  const planNote = (actual: number, plan: number, text: string) => (plan > 0 && Math.abs(actual - plan) / plan >= 0.05 ? <span className="block text-2xs text-[var(--text-faint)]">plan {text}</span> : null);

  const download = async () => {
    setBusy(true);
    try {
      await exportMonthReview(review, month, role, nameOf);
    } catch (e) {
      showToast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))} className="p-1.5 rounded-lg border border-[var(--border)]">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-sm font-bold tabular-nums">T{Number(month.slice(5))}/{month.slice(0, 4)}</span>
          <button type="button" aria-label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))} className="p-1.5 rounded-lg border border-[var(--border)]">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 text-xs font-bold" role="group" aria-label="Vai">
          {(["host", "co_host"] as const).map((r) => (
            <button key={r} type="button" aria-pressed={role === r} onClick={() => setRole(r)} className={`px-3 py-1.5 rounded-lg ${role === r ? "seg-on" : "text-[var(--text-muted)]"}`}>
              {r === "host" ? "Host" : "Trợ live"}
            </button>
          ))}
        </div>
        <button type="button" disabled={busy || review.rows.length === 0} onClick={download} className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Tải Excel
        </button>
      </div>
      <p className="text-2xs text-[var(--text-muted)]">
        Giờ và cast là số nghiệm thu (đã cộng OT, trừ off sớm); "plan" chỉ hiện khi lệch ≥ 5%.
        {review.hasUpcoming && " Tháng còn ca chưa diễn ra nên nghiệm thu thấp hơn plan."}
      </p>
      <div className="overflow-auto rounded-xl border border-[var(--border)] max-h-[560px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--surface-base)] text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-bold">{isHost ? "Host" : "Trợ live"}</th>
              <th className="px-2 py-2 text-right font-bold" title="Rate theo giờ tại ngày ca">Mức cast/giờ</th>
              <th className="px-2 py-2 text-right font-bold" title="Giờ nghiệm thu, dòng nhỏ là giờ plan">Giờ</th>
              <th className="px-2 py-2 text-right font-bold" title="Tiền cast nghiệm thu, dòng nhỏ là cast plan">Cast</th>
              {isHost && <th className="px-2 py-2 text-right font-bold" title="Tiền cast ÷ GMV host mang về, tính riêng từng sàn. Rê chuột vào số để xem GMV.">Cast / GMV</th>}
              <th className="px-3 py-2 text-left font-bold">So tháng trước</th>
            </tr>
          </thead>
          <tbody>
            {review.rows.length > 0 && (
              <tr className="border-t border-[var(--border)] font-bold bg-[var(--surface-base)]/60">
                <td className="px-3 py-1.5">Tổng · {review.rows.length} người</td>
                <td />
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtH(t.actualHours)}
                  {planNote(t.actualHours, t.planHours, fmtH(t.planHours))}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtVndShort(t.actualCost)}
                  {planNote(t.actualCost, t.planCost, fmtVndShort(t.planCost))}
                </td>
                {isHost && <td className="px-2 py-1.5 text-right tabular-nums">{pctLines(t.byPlatform)}</td>}
                <td />
              </tr>
            )}
            {review.rows.map((r) => (
              <tr key={r.talentId} className="border-t border-[var(--border)] align-top">
                <td className="px-3 py-1.5 font-bold text-[var(--text)] whitespace-nowrap">{nameOf(r.talentId) || r.talentId}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[var(--text-muted)]">{rateText(r)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {fmtH(r.actualHours)}
                  {planNote(r.actualHours, r.planHours, fmtH(r.planHours))}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.costMissing && r.actualCost <= 0 ? <span className="text-2xs text-amber-300">chưa có rate</span> : fmtVndShort(r.actualCost)}
                  {!(r.costMissing && r.planCost <= 0) && planNote(r.actualCost, r.planCost, fmtVndShort(r.planCost))}
                  {r.costMissing && r.actualCost > 0 && <span className="block text-2xs text-amber-300">thiếu rate vài ca</span>}
                </td>
                {isHost && <td className="px-2 py-1.5 text-right tabular-nums">{pctLines(r.byPlatform).length > 0 ? pctLines(r.byPlatform) : <span className="text-[var(--text-faint)]">—</span>}</td>}
                <td className="px-3 py-1.5 text-[var(--text-muted)]" title={r.reasons.join(" · ")}>{r.reasons.length > 0 ? r.reasons[0] : <span className="text-[var(--text-faint)]">—</span>}</td>
              </tr>
            ))}
            {review.rows.length === 0 && (
              <tr>
                <td colSpan={isHost ? 6 : 5} className="px-3 py-3 text-[var(--text-muted)]">
                  Tháng này chưa có ca nào của {isHost ? "host" : "trợ live"}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
