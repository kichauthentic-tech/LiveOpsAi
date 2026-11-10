import React, { useContext, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { effectiveSegments } from "../../lib/staffSegments";
import { partLabel, swapProblems, talentNameOf, type SwapPart } from "../../lib/shiftSwap/swap";
import { SwapSendBox } from "./SwapSummary";

// Lối vào thứ hai (từ LỊCH AGENCY): bấm ca/đoạn của người khác → "Đổi lấy ca này" → hệ thống liệt kê CA CỦA BẠN đổi được (đã lọc không chồng giờ,
// thường 0–5 ca) → thẻ Trước → Sau → Gửi. Dành cho người đã nhìn lịch và biết mình muốn ca nào; người chưa biết thì dùng trình hướng dẫn trong
// Cửa sổ Ca (chọn ca của mình trước). Cả hai lối vào gửi cùng một yêu cầu `swap` và qua cùng luật DB.

const FIRST = 5;

export const SwapFromTheirShift: React.FC<{
  /** Ca và đoạn của người kia mà bạn muốn lấy. */
  their: { session: LiveSession; talentId: string; fromMin: number; toMin: number };
  allSessions: LiveSession[];
  myTalentId: string;
  onClose: () => void;
}> = ({ their, allSessions, myTalentId, onClose }) => {
  const swap = useContext(SessionActionsContext).swap;
  const [give, setGive] = useState<SwapPart | null>(null);
  const [reason, setReason] = useState("");
  const [more, setMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const talents = swap?.talents;
  const nameOf = useMemo(() => talentNameOf(talents ?? []), [talents]);

  const take: SwapPart = useMemo(() => ({ sessionId: their.session.id, fromMin: their.fromMin, toMin: their.toMin }), [their]);
  const options = useMemo(() => {
    const out: { part: SwapPart; session: LiveSession }[] = [];
    for (const s of allSessions) {
      if (s.id === their.session.id || s.status === "Cancelled") continue;
      for (const g of effectiveSegments(s)) {
        if (g.talentId !== myTalentId) continue;
        const part = { sessionId: s.id, fromMin: g.fromMin, toMin: g.toMin };
        const req = { kind: "swap" as const, fromTalent: myTalentId, toTalent: their.talentId, give: part, take };
        if (swapProblems(allSessions, req, { nowMs, nameOf }).length === 0) out.push({ part, session: s });
      }
    }
    // Gần ngày ca muốn lấy lên đầu (đổi cùng ngày/gần ngày dễ được duyệt nhất); chỉ hiện vài ca đầu, còn lại sau "Xem thêm".
    const gap = (d: string) => Math.abs(Date.parse(`${d}T00:00:00Z`) - Date.parse(`${their.session.date}T00:00:00Z`));
    return out.sort((a, b) => gap(a.session.date) - gap(b.session.date) || (a.session.date + a.session.startTime).localeCompare(b.session.date + b.session.startTime));
  }, [allSessions, myTalentId, their, take, nowMs, nameOf]);

  if (!swap) return null;
  const req = give ? ({ kind: "swap", fromTalent: myTalentId, toTalent: their.talentId, give, take } as const) : null;
  const send = async () => {
    if (!req) return;
    setSending(true);
    const ok = await swap.create({ kind: "swap", give: req.give, toTalent: req.toTalent, take: req.take, reason: reason.trim() });
    setSending(false);
    if (ok) onClose();
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-3 space-y-2.5">
      <p className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
        <ArrowLeftRight className="w-3.5 h-3.5" /> Đổi lấy {partLabel(their.session, take)} của {nameOf(their.talentId)}
      </p>
      {!give ? (
        <>
          <p className="text-2xs text-[var(--text-muted)]">Bạn đưa ca nào? Chỉ hiện ca của bạn đổi được mà hai bên không chồng giờ.</p>
          {options.length === 0 ? (
            <p className="text-xs text-amber-300">Không có ca nào của bạn đổi được với ca này. Thử nhờ {nameOf(their.talentId)} nhường, hoặc chọn người khác.</p>
          ) : (
            <div className="space-y-1">
              {(more ? options : options.slice(0, FIRST)).map((o) => (
                <button key={`${o.part.sessionId}:${o.part.fromMin}`} type="button" onClick={() => setGive(o.part)} className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]">
                  {partLabel(o.session, o.part)}
                </button>
              ))}
              {!more && options.length > FIRST && (
                <button type="button" onClick={() => setMore(true)} className="text-2xs font-bold text-sky-300 hover:text-sky-200 underline">Xem thêm {options.length - FIRST} ca</button>
              )}
            </div>
          )}
          <button type="button" onClick={onClose} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline">Thôi</button>
        </>
      ) : (
        <>
          <SwapSendBox req={req!} sessions={allSessions} nameOf={nameOf} sending={sending} reason={reason} onReason={setReason} onSend={() => void send()} />
          <button type="button" onClick={() => setGive(null)} className="text-2xs text-[var(--text-muted)] hover:text-[var(--text)] underline">‹ Chọn ca khác của tôi</button>
        </>
      )}
    </div>
  );
};
