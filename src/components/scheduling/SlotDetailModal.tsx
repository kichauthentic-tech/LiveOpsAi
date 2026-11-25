import React, { useState } from "react";
import { LiveSession, ShiftSlot, ShiftRegistration, Talent } from "../../types";
import { X, Users, UserCheck, UserX, AlertTriangle, ClipboardList } from "lucide-react";
import { dateTimeRangesOverlap } from "../../lib/dateUtils";
import { fmtDateVn } from "../../lib/format";
import { PlatformChip } from "../common/PlatformChip";
import { useConfirm } from "../../hooks/useConfirm";

interface SlotDetailModalProps {
  slot: ShiftSlot;
  onClose: () => void;
  talents: Talent[];
  registrations: ShiftRegistration[]; // toàn bộ, tự lọc theo slot.id
  sessions: LiveSession[]; // agency-wide
  shiftSlots: ShiftSlot[]; // agency-wide — check trùng studio với slot khác
  canManage: boolean; // được xem người đăng ký
  myTalentId?: string; // nếu có — được tự đăng ký/huỷ đăng ký
  onRegister?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister?: (slotId: string, talentId: string) => Promise<boolean>;
  /** Xếp người / chốt / bỏ ca chờ đăng ký chỉ ở Điều Phối Lịch Live (Đợt 2 gom việc trên ca, 21/11) — nút mở đúng tuần, chọn sẵn ca. */
  onOpenRoster?: () => void;
  /** Huỷ (xoá) ca đang mở chưa chốt người ngay tại lịch — chỉ người xếp lịch (canManage). */
  onDeleteSlot?: (id: string) => Promise<void>;
}

// Cửa sổ một ca chờ đăng ký — mở từ Bảng Vận Hành, Lịch & Studio, Lịch Vận Hành brand. Từ 21/11 CHỈ XEM: ai đã báo rảnh, trùng phòng;
// xếp Host + Trợ live, chốt ngay, bỏ ca làm ở MỘT chỗ là Điều Phối Lịch Live (trước đó có 6 cửa chốt người, cửa này bỏ qua nháp/công bố
// tuần của Điều Phối). Talent vẫn tự đăng ký/huỷ ở đây.
const WEEKDAY_VN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  slot,
  onClose,
  talents,
  registrations,
  shiftSlots,
  canManage,
  myTalentId,
  onRegister,
  onUnregister,
  onOpenRoster,
  onDeleteSlot
}) => {
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const canDropSlot = canManage && !!onDeleteSlot && slot.status === "open" && !slot.sessionId;
  const handleDropSlot = async () => {
    if (!onDeleteSlot) return;
    if (!(await confirm(`Huỷ ca chờ đăng ký ${fmtDateVn(slot.date, false)} ${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)} (${slot.brandName})? Các đăng ký rảnh của ca này cũng mất.`, { danger: true }))) return;
    setBusy(true);
    try {
      await onDeleteSlot(slot.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const talentsById = new Map<string, Talent>(talents.map((t) => [t.id, t]));
  const regs = registrations.filter((r) => r.slotId === slot.id);
  const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;

  const studioConflicts = slot.studioId
    ? shiftSlots.filter(
        (s) =>
          s.id !== slot.id &&
          s.status !== "cancelled" &&
          s.studioId === slot.studioId &&
          s.brandId !== slot.brandId &&
          dateTimeRangesOverlap(slot, s)
      )
    : [];

  const handleToggleRegister = async () => {
    if (!myTalentId || !onRegister || !onUnregister) return;
    setBusy(true);
    if (iAmRegistered) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-base)]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl">
        {/* Bố cục 19/10: ngày + giờ là tiêu đề (trước tiêu đề chung "Ca Chờ Đăng Ký", ngày giờ nằm trong một hộp phụ dạng
            2026-10-19 bên dưới). */}
        <div className="flex justify-between items-start gap-3 border-b border-[var(--border)] pb-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
              {slot.brandName} <PlatformChip platform={slot.platform} />
              <span className="font-normal text-[var(--text-faint)]">· ca chờ đăng ký</span>
            </p>
            <h3 className="font-black text-[var(--text)] text-base sm:text-lg mt-0.5">
              {WEEKDAY_VN[new Date(`${slot.date}T00:00:00`).getDay()]} {fmtDateVn(slot.date, false)} · {slot.startTime.slice(0, 5)}–{slot.endTime.slice(0, 5)}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Phòng {slot.studioName || "chưa đặt"}{slot.notes ? ` · ${slot.notes}` : ""}</p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1.5 rounded-lg" aria-label="Đóng">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {studioConflicts.length > 0 && (
          <div className="p-2.5 bg-rose-950/85 border border-rose-800/60 rounded-xl text-2xs text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Trùng Studio với {studioConflicts.length} ca brand khác cùng khung giờ.
          </div>
        )}

        {myTalentId && !canManage && (
          <button
            onClick={handleToggleRegister}
            disabled={busy}
            className={`w-full flex items-center justify-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
              iAmRegistered
                ? "bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800"
                : "bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900"
            }`}
          >
            {iAmRegistered ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
            {iAmRegistered ? "Đã đăng ký · Huỷ" : "Đăng ký ca này"}
          </button>
        )}

        {canManage && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)]">
              <Users className="w-3.5 h-3.5 text-[var(--text-faint)]" /> Đã đăng ký ({regs.length})
            </div>
            {regs.length === 0 ? (
              <p className="text-xs text-[var(--text-faint)]">Chưa có ai đăng ký ca này.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {regs.map((r) => (
                  <span key={r.id} className="text-2xs bg-[var(--surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
                    {talentsById.get(r.talentId)?.name ?? r.talentId}
                  </span>
                ))}
              </div>
            )}

            {onOpenRoster && (
              <button
                type="button"
                onClick={() => { onOpenRoster(); onClose(); }}
                className="w-full flex items-center justify-center gap-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors"
              >
                <ClipboardList className="w-3.5 h-3.5" /> Xếp người ở Điều Phối Lịch Live
              </button>
            )}
            {canDropSlot && (
              <button
                type="button"
                onClick={handleDropSlot}
                disabled={busy}
                className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-rose-800 text-rose-300 hover:bg-rose-950 disabled:opacity-50"
              >
                Huỷ ca đang mở này
              </button>
            )}
          </div>
        )}

        {!myTalentId && !canManage && (
          <p className="text-xs text-[var(--text-faint)] text-center py-2">Chỉ operations mới xem được danh sách đăng ký.</p>
        )}

      </div>
    </div>
  );
};
