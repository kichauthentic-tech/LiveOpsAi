import React, { useEffect, useMemo, useState } from "react";
import { Download, FileSignature, Loader2, TrendingUp } from "lucide-react";
import { LiveSession, UserRole } from "../../types";
import { BrandCommitmentRow, fetchBrandCommitmentProgress } from "../../lib/db/brandContracts";
import {
  CommitmentProgress,
  computeCommitmentProgress,
  monthKeyOf,
  todayVn
} from "../../lib/performance/brandCommitment";
import { errorMessage } from "../../lib/errorMessage";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { metricsHiddenFor } from "../../lib/sessionLedger";
import { downloadRowsAsXlsx } from "../../lib/exportXlsx";

// Cam Kết Hợp Đồng — bản CHỈ ĐỌC cho Brand Workspace (Đợt C/1, migration 0108).
//
// Khác hẳn tab "Cam Kết Hợp Đồng" bên Agency (BrandCommitment.tsx): bên đó ops soạn hợp đồng, sinh
// cam kết từng tháng, sửa tay từng tháng, và nhìn xuyên mọi brand để biết "tháng này còn thiếu bao
// nhiêu giờ phải xếp cho brand nào". Màn này trả lời đúng một câu của khách: **tháng này cam kết
// bao nhiêu giờ, đã chạy bao nhiêu, còn bao nhiêu**. Không nút, không form.
//
// ====================================================================================
// VÌ SAO MÀN NÀY VẪN CHẠY ĐƯỢC SAU ĐỢT B — đọc kỹ trước khi sửa
// ====================================================================================
// Đợt B (0107) che số liệu của tháng chưa phát hành với role brand. Thoạt nhìn thì màn này chết
// theo: "đã chạy bao nhiêu giờ" của tháng đang chạy là số của tháng chưa phát hành.
//
// Nó KHÔNG chết, vì `computeCommitmentProgress` cố ý đếm GIỜ CA THEO LỊCH (`plannedHoursOf` →
// `sessionDurationHours(startTime, endTime)`), không phải giờ live thật từ snapshot. Lý do gốc đã
// ghi trong brandCommitment.ts: cam kết hợp đồng và hoá đơn phải đếm CÙNG một loại giờ. Mà
// start_time/end_time nằm trong nhóm "Lịch" của view 0107 — brand luôn thấy, bất kể phát hành.
//
// Thứ DUY NHẤT bị che là tiền: `deliveredGmv` cộng từ `actualGmv`, mà cột đó bị che về 0 với tháng
// chưa phát hành. Nên khối GMV bên dưới chỉ hiện cho tháng đã phát hành — `metricsHiddenFor()` là
// nguồn sự thật cho việc đó, đừng tự viết lại điều kiện.
// ====================================================================================

interface BrandCommitmentViewProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
}

const STATUS_LABEL: Record<CommitmentProgress["status"], string> = {
  no_commitment: "Chưa có cam kết",
  met: "Đã đủ cam kết",
  on_track: "Đang đúng nhịp",
  at_risk: "Cần chú ý",
  behind: "Đang chậm"
};

const STATUS_CLS: Record<CommitmentProgress["status"], string> = {
  no_commitment: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]",
  met: "bg-emerald-950 text-emerald-300 border-emerald-800",
  on_track: "bg-sky-950 text-sky-300 border-sky-800",
  at_risk: "bg-amber-950 text-amber-300 border-amber-800",
  behind: "bg-rose-950 text-rose-300 border-rose-800"
};

function fmtMonth(m: string): string {
  const [y, mm] = m.split("-");
  return `Tháng ${Number(mm)}/${y}`;
}

const fmtHours = (h: number) => `${h.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

/** Thanh tiến độ giờ. Vượt 100% vẫn vẽ đầy, phần vượt nói bằng chữ bên cạnh chứ không tràn khung. */
const Bar: React.FC<{ done: number; scheduled: number; committed: number }> = ({ done, scheduled, committed }) => {
  if (committed <= 0) return null;
  const pctDone = Math.min(100, (done / committed) * 100);
  const pctScheduled = Math.min(100 - pctDone, (scheduled / committed) * 100);
  return (
    <div className="h-2 w-full rounded-full bg-[var(--surface-elevated)] overflow-hidden flex">
      <div className="h-full bg-[var(--success)]" style={{ width: `${pctDone}%` }} title={`Đã chạy ${fmtHours(done)}`} />
      {/* Ca đã xếp nhưng chưa chạy: cùng dải, nhạt hơn — khách thấy được phần đã chắc chắn có lịch. */}
      <div className="h-full bg-[var(--success)]/35" style={{ width: `${pctScheduled}%` }} title={`Đã xếp lịch ${fmtHours(scheduled)}`} />
    </div>
  );
};

const KV: React.FC<{ label: string; value: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div>
    <div className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] font-bold">{label}</div>
    <div className={`mt-0.5 ${strong ? "text-base font-black text-[var(--text)]" : "text-sm font-bold text-[var(--text-muted)]"}`}>
      {value}
    </div>
  </div>
);

export const BrandCommitmentView: React.FC<BrandCommitmentViewProps> = ({
  brandId,
  brandName,
  sessions,
  currentRole
}) => {
  const [rows, setRows] = useState<BrandCommitmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrorMsg(null);
    fetchBrandCommitmentProgress(brandId)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => {
        if (cancelled) return;
        // PGRST205 = view chưa tồn tại, tức migration 0108 chưa chạy trên Supabase. Đây là màn
        // KHÁCH nhìn, không được ném nguyên văn lỗi PostgREST lên đó ("Could not find the table
        // ... in the schema cache. Perhaps you meant ...") — vừa khó hiểu vừa lộ tên bảng nội bộ.
        const code = (e as { code?: string } | null)?.code;
        setErrorMsg(
          code === "PGRST205"
            ? "Mục này đang được thiết lập, sẽ có dữ liệu sau ít phút."
            : errorMessage(e, "Không tải được cam kết hợp đồng")
        );
        if (code === "PGRST205") {
          console.warn('[LiveOps] View "brand_commitment_progress" chưa có trên Supabase — chạy migration 0108.');
        }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  const today = todayVn();
  const thisMonth = `${today.slice(0, 7)}-01`;

  const progress = useMemo(
    () =>
      rows
        .map((r) =>
          computeCommitmentProgress(
            { id: `${r.brandId}-${r.periodMonth}`, brandId: r.brandId, periodMonth: r.periodMonth, committedHours: r.committedHours, committedGmv: r.committedGmv, isOverride: r.isOverride },
            brandName,
            sessions,
            today
          )
        )
        // Mới nhất lên đầu: khách mở màn này để xem tháng đang chạy, không phải để đọc lịch sử.
        .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth)),
    [rows, brandName, sessions, today]
  );

  const current = progress.find((p) => p.periodMonth === thisMonth);
  const contractCode = rows.find((r) => r.contractCode)?.contractCode;

  // Một ca bất kỳ của tháng đó đủ để biết tháng đó có bị che số hay không — điều kiện của
  // metricsHiddenFor chỉ phụ thuộc role + monthPublished, mà monthPublished là theo tháng.
  const monthHasHiddenMetrics = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const s of sessions) {
      if (s.brandId !== brandId) continue;
      const k = monthKeyOf(s.date);
      if (!map.has(k)) map.set(k, metricsHiddenFor(s, currentRole));
    }
    return map;
  }, [sessions, brandId, currentRole]);

  // Xuất Excel — đúng bảng "Lịch sử theo tháng" bên dưới, kể cả cột GMV bị che tháng chưa phát
  // hành (giữ nguyên chữ "chưa phát hành" như trên màn, không tự đoán số).
  const handleExport = () => {
    downloadRowsAsXlsx(
      "Cam Ket Hop Dong",
      progress.map((p) => {
        const gmvHidden = monthHasHiddenMetrics.get(p.periodMonth) ?? false;
        return {
          "Tháng": fmtMonth(p.periodMonth),
          "Cam Kết (giờ)": Math.round(p.committedHours * 10) / 10,
          "Đã Chạy (giờ)": Math.round(p.deliveredHours * 10) / 10,
          "Đã Xếp (giờ)": Math.round(p.scheduledHours * 10) / 10,
          "Chênh Lệch (giờ)": Math.round((p.gapHours > 0 ? -p.gapHours : Math.abs(p.gapHours)) * 10) / 10,
          "GMV": gmvHidden ? "Chưa phát hành" : p.deliveredGmv || 0,
          "Tình Trạng": STATUS_LABEL[p.status]
        };
      }),
      `CamKetHopDong_${brandName}.xlsx`.replace(/\s+/g, "_")
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-[var(--text-faint)] text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải cam kết…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-xl space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <span className="text-[var(--accent-text)] font-semibold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FileSignature className="w-4 h-4" /> Cam Kết Hợp Đồng
            </span>
            <h2 className="text-2xl font-black text-[var(--text)]">
              {brandName}
              {contractCode && <span className="ml-2 text-sm font-bold text-[var(--text-faint)]">· {contractCode}</span>}
            </h2>
          </div>
          {progress.length > 0 && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-3xl">
          Số giờ lên sóng cam kết mỗi tháng và tiến độ thực hiện. Giờ tính theo <b>khung giờ ca đã chốt</b> — cùng loại giờ
          dùng để đối chiếu hợp đồng.
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/80 border border-red-800/50 rounded-xl text-red-300 text-xs font-semibold">{errorMsg}</div>
      )}

      {progress.length === 0 && !errorMsg && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center text-[var(--text-faint)] text-sm">
          Chưa có cam kết hợp đồng nào được thiết lập cho {brandName}.
        </div>
      )}

      {/* Tháng đang chạy — nổi bật riêng, vì đó là câu hỏi khách mở màn này để hỏi. */}
      {current && (
        <div className="bg-[var(--surface)] border border-[var(--accent)]/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-black text-[var(--text)] flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[var(--accent-text)]" /> {fmtMonth(current.periodMonth)} — đang chạy
            </h3>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${STATUS_CLS[current.status]}`}>
              {STATUS_LABEL[current.status]}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <KV label="Cam kết" value={fmtHours(current.committedHours)} strong />
            <KV label="Đã chạy" value={`${fmtHours(current.deliveredHours)} · ${current.deliveredSessions} ca`} strong />
            <KV label="Đã xếp lịch" value={`${fmtHours(current.scheduledHours)} · ${current.scheduledSessions} ca`} />
            <KV
              label={current.gapHours > 0 ? "Còn thiếu" : "Vượt cam kết"}
              value={
                <span className={current.gapHours > 0 ? "text-amber-300" : "text-emerald-400"}>
                  {fmtHours(Math.abs(current.gapHours))}
                </span>
              }
              strong
            />
          </div>

          <Bar done={current.deliveredHours} scheduled={current.scheduledHours} committed={current.committedHours} />
          <p className="text-[11px] text-[var(--text-faint)]">
            Đậm = đã lên sóng · nhạt = ca đã xếp lịch chưa tới ngày. Tổng đã chắc chắn có:{" "}
            <b className="text-[var(--text-muted)]">{fmtHours(current.plannedTotalHours)}</b>/{fmtHours(current.committedHours)}.
          </p>
        </div>
      )}

      {/* Lịch sử theo tháng */}
      {progress.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)] uppercase text-[11px] tracking-wider">
                  <th className="py-2.5 px-4">Tháng</th>
                  <th className="py-2.5 px-2 text-right">Cam kết</th>
                  <th className="py-2.5 px-2 text-right">Đã chạy</th>
                  <th className="py-2.5 px-2 text-right">Đã xếp</th>
                  <th className="py-2.5 px-2 text-right">Chênh lệch</th>
                  <th className="py-2.5 px-2 text-right">GMV</th>
                  <th className="py-2.5 px-2">Tình trạng</th>
                </tr>
              </thead>
              <tbody>
                {progress.map((p) => {
                  const gmvHidden = monthHasHiddenMetrics.get(p.periodMonth) ?? false;
                  return (
                    <tr key={p.periodMonth} className="border-b border-[var(--border-muted)]">
                      <td className="py-2.5 px-4 font-bold text-[var(--text)] whitespace-nowrap">{fmtMonth(p.periodMonth)}</td>
                      <td className="py-2.5 px-2 text-right text-[var(--text-muted)]">{fmtHours(p.committedHours)}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-[var(--text)]">{fmtHours(p.deliveredHours)}</td>
                      <td className="py-2.5 px-2 text-right text-[var(--text-faint)]">
                        {p.scheduledHours > 0 ? fmtHours(p.scheduledHours) : "—"}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right font-bold ${
                          p.gapHours > 0 ? "text-amber-300" : "text-emerald-400"
                        }`}
                      >
                        {p.gapHours > 0 ? `−${fmtHours(p.gapHours)}` : `+${fmtHours(Math.abs(p.gapHours))}`}
                      </td>
                      <td className="py-2.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">
                        {/* Tháng chưa phát hành Report Tháng thì cột tiền chưa được mở (Đợt B).
                            Nói rõ lý do, đừng hiện 0 — "0 đ" đọc thành "không bán được gì". */}
                        {gmvHidden ? (
                          <span className="text-[11px] italic text-[var(--text-faint)]">chưa phát hành</span>
                        ) : p.deliveredGmv > 0 ? (
                          formatCurrencyAdaptive(p.deliveredGmv, "")
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[p.status]}`}>
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
