import React, { useContext, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { isOpenStatus, partLabel, swapProblems, talentNameOf, type ShiftSwapRequest } from "../../lib/shiftSwap/swap";

// Hộp "Đổi ca" ở màn Ca của tôi (migration 0212): yêu cầu gửi cho tôi chờ tôi trả lời, yêu cầu của tôi đang chờ ai, và kết quả gần đây.
// Người kia đồng ý rồi mới tới trainer/OPs duyệt; lịch chỉ đổi khi được duyệt.

const WEEK_MS = 7 * 24 * 3600 * 1000;

function describe(r: ShiftSwapRequest, sessions: LiveSession[]): string {
  const give = sessions.find((s) => s.id === r.give.sessionId);
  const take = r.take ? sessions.find((s) => s.id === r.take!.sessionId) : undefined;
  const g = give ? partLabel(give, r.give) : "ca";
  return r.kind === "swap" ? `${g} ⇄ ${take && r.take ? partLabel(take, r.take) : "ca khác"}` : g;
}

export const SwapInbox: React.FC<{ sessions: LiveSession[]; myTalentId?: string }> = ({ sessions, myTalentId }) => {
  const swap = useContext(SessionActionsContext).swap;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [nowMs] = useState(() => Date.now());
  const nameOf = useMemo(() => talentNameOf(swap?.talents ?? []), [swap?.talents]);
  if (!swap || !myTalentId) return null;

  const incoming = swap.requests.filter((r) => r.status === "pending_peer" && r.toTalent === myTalentId);
  const outgoing = swap.requests.filter((r) => isOpenStatus(r.status) && r.fromTalent === myTalentId);
  const recent = swap.requests
    .filter((r) => (r.status === "declined" || r.status === "rejected" || r.status === "approved") && r.fromTalent === myTalentId && nowMs - Date.parse(r.decidedAt ?? r.peerAnsweredAt ?? r.createdAt) < WEEK_MS)
    .slice(0, 3);
  if (incoming.length + outgoing.length + recent.length === 0) return null;

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusyId(id);
    await fn();
    setBusyId(null);
  };

  return (
    <div className="rounded-xl border border-sky-800 bg-sky-950/30 p-3 space-y-2.5">
      <p className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
        <ArrowLeftRight className="w-3.5 h-3.5" /> Đổi / nhường ca
      </p>

      {incoming.map((r) => {
        const problems = swapProblems(sessions, r, { nowMs, nameOf });
        return (
          <div key={r.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5 space-y-2">
            <p className="text-xs text-[var(--text)]">
              <b>{r.fromName}</b> {r.kind === "swap" ? "muốn đổi ca với bạn" : "muốn nhường ca cho bạn"}: <b>{describe(r, sessions)}</b>
              {r.reason ? <span className="text-[var(--text-muted)]"> — {r.reason}</span> : null}
            </p>
            {problems.length > 0 && <p className="text-2xs text-red-300">{problems[0]} Không đồng ý được.</p>}
            <p className="text-2xs text-[var(--text-muted)]">Bạn đồng ý rồi trainer/OPs duyệt mới đổi — lịch chưa đổi.</p>
            <div className="flex gap-2 justify-end">
              <button type="button" disabled={busyId === r.id} onClick={() => void run(r.id, () => swap.respond(r.id, false))} className="px-3 py-1.5 min-h-8 rounded-lg border border-[var(--border)] text-2xs font-bold text-[var(--text-muted)] disabled:opacity-60">
                Không nhận
              </button>
              <button type="button" disabled={busyId === r.id || problems.length > 0} onClick={() => void run(r.id, () => swap.respond(r.id, true))} className="px-3 py-1.5 min-h-8 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-2xs font-bold">
                Đồng ý
              </button>
            </div>
          </div>
        );
      })}

      {outgoing.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-2 text-xs text-sky-200">
          <p className="min-w-0">
            {r.kind === "swap" ? "Đổi với" : "Nhường cho"} <b>{r.toName}</b>: {describe(r, sessions)} —{" "}
            {r.status === "pending_peer" ? "chờ họ đồng ý" : "họ đã đồng ý, chờ trainer/OPs duyệt"}.
          </p>
          <button type="button" disabled={busyId === r.id} onClick={() => void run(r.id, () => swap.cancel(r.id))} className="shrink-0 text-2xs font-bold underline text-[var(--text-muted)] disabled:opacity-60">
            Thu hồi
          </button>
        </div>
      ))}

      {recent.map((r) => (
        <p key={r.id} className={`text-2xs ${r.status === "approved" ? "text-emerald-300" : "text-amber-300"}`}>
          {r.status === "approved" ? "Đã duyệt" : r.status === "declined" ? `${r.toName} không nhận` : `Không duyệt${r.decisionNote ? ` (${r.decisionNote})` : ""}`}: {describe(r, sessions)}
        </p>
      ))}
    </div>
  );
};
