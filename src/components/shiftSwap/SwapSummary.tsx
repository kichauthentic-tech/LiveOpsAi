import React from "react";
import { ArrowRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { partLabel, type ShiftSwapRequest } from "../../lib/shiftSwap/swap";

// Thẻ "Trước → Sau" của một yêu cầu nhường/đổi: mỗi người một khối, hai dòng — "Bỏ" và "Nhận". Dùng ở bước cuối của trình hướng dẫn
// và ở lối vào từ lịch agency, để người gửi thấy đúng điều sẽ xảy ra với CẢ HAI bên trước khi bấm Gửi.

type Req = Pick<ShiftSwapRequest, "kind" | "fromTalent" | "toTalent" | "give" | "take">;

const Row: React.FC<{ sign: "-" | "+"; text: string }> = ({ sign, text }) => (
  <p className="text-xs flex items-start gap-1.5">
    <span className={`font-bold w-3 shrink-0 ${sign === "-" ? "text-red-300" : "text-emerald-300"}`}>{sign === "-" ? "−" : "+"}</span>
    <span className="text-[var(--text)] min-w-0">{text}</span>
  </p>
);

export const SwapSummary: React.FC<{ req: Req; sessions: LiveSession[]; nameOf: (id: string) => string }> = ({ req, sessions, nameOf }) => {
  const label = (p: { sessionId: string; fromMin: number; toMin: number }) => {
    const s = sessions.find((x) => x.id === p.sessionId);
    return s ? partLabel(s, p) : "ca khác";
  };
  const give = label(req.give);
  const take = req.kind === "swap" && req.take ? label(req.take) : null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1">
        <p className="text-2xs font-bold text-[var(--text-muted)]">{nameOf(req.fromTalent)} (bạn)</p>
        <Row sign="-" text={give} />
        {take && <Row sign="+" text={take} />}
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-1 relative">
        <ArrowRight className="hidden sm:block absolute -left-[13px] top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-faint)] bg-[var(--surface-elevated)] rounded-full" />
        <p className="text-2xs font-bold text-[var(--text-muted)]">{nameOf(req.toTalent)}</p>
        <Row sign="+" text={give} />
        {take && <Row sign="-" text={take} />}
      </div>
    </div>
  );
};

/** Khối gửi: thẻ Trước → Sau + lý do + nút. Dùng chung để hai lối vào không lệch nhau. */
export const SwapSendBox: React.FC<{
  req: Req;
  sessions: LiveSession[];
  nameOf: (id: string) => string;
  sending: boolean;
  reason: string;
  onReason: (v: string) => void;
  onSend: () => void;
}> = ({ req, sessions, nameOf, sending, reason, onReason, onSend }) => (
  <div className="space-y-2.5">
    <SwapSummary req={req} sessions={sessions} nameOf={nameOf} />
    <input value={reason} onChange={(e) => onReason(e.target.value)} placeholder="Lý do (vd: trùng lịch học, việc gia đình)" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs" />
    <p className="text-2xs text-[var(--text-muted)]">
      <b>Lịch KHÔNG tự đổi</b> — {nameOf(req.toTalent)} đồng ý rồi trainer/OPs duyệt. Cả hai được báo ở mỗi bước.
    </p>
    <div className="flex justify-end">
      <button type="button" onClick={onSend} disabled={sending} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-2xs">
        {sending ? "Đang gửi..." : `Gửi cho ${nameOf(req.toTalent)}`}
      </button>
    </div>
  </div>
);
