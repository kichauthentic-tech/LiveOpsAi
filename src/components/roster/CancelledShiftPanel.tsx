import React, { useMemo } from "react";
import { X } from "lucide-react";
import type { Talent } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { talentShortName } from "../../lib/talentName";
import { shiftHours, type RosterAnalysis, type RosterShift } from "../../lib/roster/rules";
import { checkPlacement, type RankContext } from "../../lib/roster/candidates";
import { dayLabel } from "./ShiftPanel";

// Ngăn một ca ĐÃ HUỶ ở Điều Phối Lịch Live (0233): mở lại giữ người cũ (nếu họ còn rảnh), hoặc mở lại thành ca mở để xếp người khác
// như mọi ca mở (nháp → chốt). Ghi DB ở RosterBoard (lý do chọn nhanh, nhật ký roster_changes).

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");

interface Props {
  shift: RosterShift;
  analysis: RosterAnalysis;
  ctx: RankContext;
  talents: readonly Talent[];
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  /** Khôi phục chính ca với host (bắt buộc) + trợ (tuỳ). */
  onRestore: (shift: RosterShift, hostId: string, coHostId: string | undefined) => void;
  /** Mở lại thành ca mở (chưa người) để xếp ở lưới như ca mở khác. */
  onReopenOpen: (shift: RosterShift) => void;
}

export const CancelledShiftPanel: React.FC<Props> = ({ shift, analysis, ctx, talents, readOnly, busy, onClose, onRestore, onReopenOpen }) => {
  const nm = (id: string | undefined) => (id ? talentShortName(talents.find((t) => t.id === id)) || "?" : "");
  // Người cũ còn rảnh không: cùng luật chặn của bộ gợi ý người (trùng ca, "x" ở luật tháng, brand không nhận).
  const hostBlock = useMemo(() => (shift.hostId ? checkPlacement(shift, shift.hostId, "host", ctx, analysis.entries).blocked : undefined), [shift, ctx, analysis]);
  const coBlock = useMemo(() => (shift.coHostId ? checkPlacement(shift, shift.coHostId, "co_host", ctx, analysis.entries).blocked : undefined), [shift, ctx, analysis]);
  const canKeep = !!shift.hostId && !hostBlock;
  const keepCo = shift.coHostId && !coBlock ? shift.coHostId : undefined;

  const personLine = (label: string, id: string | undefined, block: string | undefined) => (
    <li className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--text-muted)]">{label}</span>
      {id ? (
        <span className="text-right">
          <b className="text-[var(--text)]">{nm(id)}</b>
          <span className={`block text-2xs ${block ? "text-red-300" : "text-emerald-300"}`}>{block ? block : "còn rảnh khung này"}</span>
        </span>
      ) : (
        <span className="text-[var(--text-faint)]">chưa có</span>
      )}
    </li>
  );

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col" aria-label="Ca đã huỷ">
      <div className="p-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-2xs font-semibold text-red-300">{dayLabel(shift.date)} · Ca đã huỷ</p>
          <h3 className="text-lg font-black text-[var(--text)] flex flex-wrap items-center gap-2">
            {shift.brandName} <PlatformChip platform={shift.platform} />
            <span className="font-mono">{shift.startTime}–{shift.endTime}</span>
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Phòng {shift.studioName || "chưa đặt"} · {fmtH(shiftHours(shift))} giờ
          </p>
          {shift.cancelReason && <p className="text-xs text-red-300/90">Lý do huỷ: {shift.cancelReason}</p>}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        <ul className="space-y-2">
          {personLine("Host lúc huỷ", shift.hostId, hostBlock)}
          {personLine("Trợ lúc huỷ", shift.coHostId, coBlock)}
        </ul>
        {!readOnly && (
          <div className="space-y-2">
            {shift.hostId && (
              <button
                type="button"
                disabled={busy || !canKeep}
                onClick={() => canKeep && onRestore(shift, shift.hostId!, keepCo)}
                className="w-full text-left px-3 py-2 rounded-xl bg-[var(--accent)] text-white font-bold disabled:opacity-40"
              >
                Mở lại ca, giữ host {nm(shift.hostId)}
                {keepCo ? ` + trợ ${nm(keepCo)}` : shift.coHostId ? " (trợ cũ bận — chưa có trợ)" : ""}
                <span className="block text-2xs font-medium opacity-90">Ca thành ca thật như trước khi huỷ, người giữ nguyên nhận tin "ca được mở lại".</span>
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onReopenOpen(shift)}
              className="w-full text-left px-3 py-2 rounded-xl border border-[var(--border)] text-[var(--text)] font-bold hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              Mở lại thành ca mở để xếp người khác
              <span className="block text-2xs font-medium text-[var(--text-muted)]">Ca về dạng ca mở trên lưới: chọn host/trợ (nháp), rồi công bố hoặc ⋯ → Chốt ngay.</span>
            </button>
            {shift.hostId && !canKeep && <p className="text-2xs text-[var(--text-muted)]">Host cũ không còn rảnh khung này — mở thành ca mở rồi chọn người khác.</p>}
          </div>
        )}
        <p className="text-2xs text-[var(--text-faint)]">Mở lại xong, gạch ngang của ca này không còn trên lịch gửi brand. Lý do mở lại ghi vào nhật ký đổi lịch.</p>
      </div>
    </aside>
  );
};
