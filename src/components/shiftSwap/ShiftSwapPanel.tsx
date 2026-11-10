import React, { useContext, useState } from "react";
import { ArrowLeftRight, Clock } from "lucide-react";
import type { LiveSession } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { isOpenStatus } from "../../lib/shiftSwap/swap";
import { SwapWizard } from "./SwapWizard";

// Nhường ca / đổi ca ngay trong Cửa sổ Ca Live của talent (migration 0212). Ở đây chỉ là CỬA VÀO: nút mở trình hướng dẫn từng bước
// (SwapWizard) hoặc, nếu ca này đã có yêu cầu đang chờ, trạng thái + nút thu hồi. Lịch không tự đổi: người kia đồng ý rồi
// trainer/OPs duyệt. Luật giờ/tuần không chặn (trainer tự cân đối).

export const ShiftSwapPanel: React.FC<{ session: LiveSession; allSessions: LiveSession[]; myTalentId: string }> = ({ session: s, allSessions, myTalentId }) => {
  const swap = useContext(SessionActionsContext).swap;
  const [open, setOpen] = useState(false);
  if (!swap) return null;

  const myOpen = swap.requests.filter((r) => isOpenStatus(r.status) && r.fromTalent === myTalentId && (r.give.sessionId === s.id || r.take?.sessionId === s.id));
  if (myOpen.length > 0) {
    return (
      <div className="pt-3 border-t border-[var(--border)] space-y-2">
        {myOpen.map((r) => (
          <div key={r.id} className="rounded-xl border border-sky-800 bg-sky-950/30 p-3 space-y-1.5">
            <p className="text-xs text-sky-200 flex items-start gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {r.kind === "swap" ? "Đổi ca với" : "Nhường ca cho"} <b>{r.toName}</b>
                {r.status === "pending_peer" ? " — chờ họ đồng ý." : " — họ đã đồng ý, chờ trainer/OPs duyệt."} <b>Lịch chưa đổi.</b>
              </span>
            </p>
            <button type="button" onClick={() => void swap.cancel(r.id)} className="text-2xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] underline">
              Thu hồi yêu cầu
            </button>
          </div>
        ))}
      </div>
    );
  }

  if (!open) {
    return (
      <div className="pt-3 border-t border-[var(--border)]">
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-2xs font-bold text-sky-300 hover:text-sky-200 transition-colors">
          <ArrowLeftRight className="w-3.5 h-3.5" /> Nhường hoặc đổi ca này
        </button>
      </div>
    );
  }

  return <SwapWizard session={s} allSessions={allSessions} myTalentId={myTalentId} talents={swap.talents} onClose={() => setOpen(false)} />;
};
