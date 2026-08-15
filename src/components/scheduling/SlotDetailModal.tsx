import React, { useState } from "react";
import { LiveSession, ShiftSlot, ShiftRegistration, Talent } from "../../types";
import { X, Users, UserCheck, UserX, Check, AlertTriangle, Trash2 } from "lucide-react";

interface SlotDetailModalProps {
  slot: ShiftSlot;
  onClose: () => void;
  talents: Talent[];
  registrations: ShiftRegistration[]; // toàn bộ, tự lọc theo slot.id
  sessions: LiveSession[]; // agency-wide — check trùng lịch
  shiftSlots: ShiftSlot[]; // agency-wide — check trùng studio với slot khác
  canManage: boolean; // được xem người đăng ký + chọn Host/Co-Host + chốt lịch + xoá
  myTalentId?: string; // nếu có — được tự đăng ký/huỷ đăng ký
  onRegister?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister?: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot?: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onDeleteSlot?: (id: string) => Promise<void>;
}

// Panel đăng ký/chốt lịch cho 1 Ca — mở trực tiếp từ bất kỳ view lịch nào
// (Month/Week/Day Matrix/List, Agency hoặc Brand) thay vì bắt buộc phải sang
// "Đăng Ký & Chốt Lịch". Logic đăng ký/chốt giữ nguyên y hệt ShiftScheduling.tsx.
export const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  slot,
  onClose,
  talents,
  registrations,
  sessions,
  shiftSlots,
  canManage,
  myTalentId,
  onRegister,
  onUnregister,
  onFinalizeSlot,
  onDeleteSlot
}) => {
  const [hostId, setHostId] = useState("");
  const [coHostId, setCoHostId] = useState("");
  const [busy, setBusy] = useState(false);

  const talentsById = new Map<string, Talent>(talents.map((t) => [t.id, t]));
  const regs = registrations.filter((r) => r.slotId === slot.id);
  const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;

  const timeOverlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

  const hostConflict =
    !!hostId &&
    sessions.some(
      (s) =>
        s.date === slot.date &&
        s.status !== "Cancelled" &&
        timeOverlaps(s.startTime, s.endTime, slot.startTime, slot.endTime) &&
        (s.hostId === hostId || s.coHostId === hostId)
    );

  const studioConflicts = slot.studioId
    ? shiftSlots.filter(
        (s) =>
          s.id !== slot.id &&
          s.status !== "cancelled" &&
          s.date === slot.date &&
          s.studioId === slot.studioId &&
          s.brandId !== slot.brandId &&
          timeOverlaps(slot.startTime, slot.endTime, s.startTime, s.endTime)
      )
    : [];

  const handleToggleRegister = async () => {
    if (!myTalentId || !onRegister || !onUnregister) return;
    setBusy(true);
    if (iAmRegistered) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusy(false);
  };

  const handleFinalize = async () => {
    if (!hostId || !onFinalizeSlot) {
      if (!hostId) window.alert("Chọn Host trước khi chốt lịch.");
      return;
    }
    setBusy(true);
    const ok = await onFinalizeSlot(slot, hostId, coHostId || null);
    setBusy(false);
    if (ok) onClose();
  };

  const handleDelete = async () => {
    if (!onDeleteSlot) return;
    setBusy(true);
    await onDeleteSlot(slot.id);
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[var(--surface-base)]/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex justify-between items-start border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-bold text-amber-400 uppercase font-mono">{slot.brandName}</span>
            <h3 className="font-bold text-[var(--text)] text-base sm:text-lg">Ca Chờ Đăng Ký</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && onDeleteSlot && (
              <button onClick={handleDelete} disabled={busy} className="text-[var(--text-faint)] hover:text-rose-400 p-1 rounded-lg" title="Xoá ca">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs bg-[var(--surface-base)] p-3 rounded-xl border border-[var(--border)]">
          <div>Ngày: <strong className="text-[var(--text)] block font-mono">{slot.date}</strong></div>
          <div>Khung giờ: <strong className="text-[var(--text)] block font-mono">{slot.startTime} - {slot.endTime}</strong></div>
          <div>Phòng Studio: <strong className="text-[var(--text)] block">{slot.studioName || "—"}</strong></div>
          <div>Nền tảng: <strong className="text-[var(--text)] block">{slot.platform}</strong></div>
          {slot.notes && <div className="col-span-2">Ghi chú: <strong className="text-[var(--text)] block">{slot.notes}</strong></div>}
        </div>

        {studioConflicts.length > 0 && (
          <div className="p-2.5 bg-rose-950/85 border border-rose-800/60 rounded-xl text-[11px] text-rose-300 flex items-center gap-1.5">
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
            {iAmRegistered ? "Đã đăng ký · Huỷ" : "Tôi rảnh ca này"}
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
                  <span key={r.id} className="text-[11px] bg-[var(--surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
                    {talentsById.get(r.talentId)?.name ?? r.talentId}
                  </span>
                ))}
              </div>
            )}

            {regs.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <select
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                  className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                >
                  <option value="">Host…</option>
                  {regs.map((r) => (
                    <option key={r.talentId} value={r.talentId}>{talentsById.get(r.talentId)?.name ?? r.talentId}</option>
                  ))}
                </select>
                <select
                  value={coHostId}
                  onChange={(e) => setCoHostId(e.target.value)}
                  className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-2 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                >
                  <option value="">Trợ live (tuỳ chọn)…</option>
                  {regs.filter((r) => r.talentId !== hostId).map((r) => (
                    <option key={r.talentId} value={r.talentId}>{talentsById.get(r.talentId)?.name ?? r.talentId}</option>
                  ))}
                </select>
              </div>
            )}

            {hostConflict && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> Host đã chọn trùng lịch với 1 phiên khác cùng ngày.
              </p>
            )}

            {onFinalizeSlot && (
              <button
                onClick={handleFinalize}
                disabled={!hostId || busy || regs.length === 0}
                className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> {busy ? "Đang chốt..." : "Chốt Lịch"}
              </button>
            )}
          </div>
        )}

        {!myTalentId && !canManage && (
          <p className="text-xs text-[var(--text-faint)] text-center py-2">Xem chi tiết đăng ký ở "Đăng Ký &amp; Chốt Lịch".</p>
        )}

        <div className="pt-2 border-t border-[var(--border)] flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] font-bold rounded-xl text-xs">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
