import React, { useContext, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { clockAtOffset, effectiveSegments } from "../../lib/staffSegments";
import { talentNameOf } from "../../lib/shiftSwap/swap";
import { SwapFromTheirShift } from "./SwapFromTheirShift";

// Lối vào B trong Cửa sổ Ca khi talent xem ca CỦA NGƯỜI KHÁC (từ lịch Cả Agency): mỗi phần của người khác một dòng "Đổi lấy phần này".
// Bấm vào ⇒ SwapFromTheirShift liệt kê ca của mình đổi được rồi tới thẻ Trước → Sau.

export const SwapTheirShiftEntry: React.FC<{ session: LiveSession; allSessions: LiveSession[]; myTalentId: string }> = ({ session: s, allSessions, myTalentId }) => {
  const swap = useContext(SessionActionsContext).swap;
  const [openKey, setOpenKey] = useState<string | null>(null);
  const nameOf = useMemo(() => talentNameOf(swap?.talents ?? []), [swap?.talents]);
  const parts = useMemo(() => effectiveSegments(s).filter((g) => g.talentId && g.talentId !== myTalentId), [s, myTalentId]);
  if (!swap || parts.length === 0) return null;

  return (
    <div className="pt-3 border-t border-[var(--border)] space-y-2">
      {parts.map((g) => {
        const key = `${g.talentId}:${g.role}:${g.fromMin}`;
        const label = `${nameOf(g.talentId)} ${clockAtOffset(s, g.fromMin)}–${clockAtOffset(s, g.toMin)}`;
        return openKey === key ? (
          <SwapFromTheirShift key={key} their={{ session: s, talentId: g.talentId, fromMin: g.fromMin, toMin: g.toMin }} allSessions={allSessions} myTalentId={myTalentId} onClose={() => setOpenKey(null)} />
        ) : (
          <button key={key} type="button" onClick={() => setOpenKey(key)} className="inline-flex items-center gap-1.5 text-2xs font-bold text-sky-300 hover:text-sky-200 transition-colors mr-3">
            <ArrowLeftRight className="w-3.5 h-3.5" /> Đổi lấy phần của {label}
          </button>
        );
      })}
    </div>
  );
};
