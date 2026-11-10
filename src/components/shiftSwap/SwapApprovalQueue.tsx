import React, { useContext, useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { LiveSession } from "../../types";
import { SessionActionsContext } from "../../lib/sessionActionsContext";
import { addDays } from "../../lib/dateUtils";
import { effectiveSegments } from "../../lib/staffSegments";
import { applySwap, partLabel, swapProblems, talentNameOf, type ShiftSwapRequest } from "../../lib/shiftSwap/swap";

// Hàng đợi duyệt đổi/nhường ca cho trainer/OPs (migration 0212): chỉ những yêu cầu người kia ĐÃ đồng ý. Ai bấm trước thắng (DB khoá
// dòng yêu cầu). Mỗi dòng nói rõ ai đổi gì, kèm số giờ tuần trước → sau của hai người — chỉ để trainer cân đối, KHÔNG chặn (user chốt 10/11).
// Duyệt kiểm lại lịch hiện tại: hai yêu cầu cùng chờ mà gộp lại chồng giờ thì yêu cầu duyệt sau bị từ chối.

const weekStart = (date: string): string => {
  const d = new Date(`${date}T00:00:00Z`);
  return addDays(date, -((d.getUTCDay() + 6) % 7));
};

/** Số giờ người này đứng ca trong tuần (thứ 2–CN) chứa `date`, tính theo đoạn đứng thật (ca chia đoạn tính đúng phần của họ). */
function weekHours(sessions: LiveSession[], talentId: string, date: string): number {
  const from = weekStart(date);
  const to = addDays(from, 6);
  let min = 0;
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date > to) continue;
    for (const g of effectiveSegments(s)) if (g.talentId === talentId) min += g.toMin - g.fromMin;
  }
  return Math.round((min / 60) * 10) / 10;
}

const fmtH = (h: number) => `${String(h).replace(".", ",")}h`;

export const SwapApprovalQueue: React.FC<{ sessions: LiveSession[] }> = ({ sessions }) => {
  const swap = useContext(SessionActionsContext).swap;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [nowMs] = useState(() => Date.now());
  const nameOf = useMemo(() => talentNameOf(swap?.talents ?? []), [swap?.talents]);
  const waiting = (swap?.requests ?? []).filter((r) => r.status === "pending_ops").reverse();
  // Yêu cầu còn chờ người kia trả lời: chưa duyệt được, nhưng người xếp lịch cần thấy là có (chỉ xem).
  const awaitingPeer = (swap?.requests ?? []).filter((r) => r.status === "pending_peer").reverse();
  if (!swap || (waiting.length === 0 && awaitingPeer.length === 0)) return null;

  const run = async (id: string, fn: () => Promise<boolean>) => {
    setBusyId(id);
    const ok = await fn();
    setBusyId(null);
    if (ok) {
      setRejecting(null);
      setNote("");
    }
  };

  const hoursLine = (r: ShiftSwapRequest): string | null => {
    const give = sessions.find((s) => s.id === r.give.sessionId);
    if (!give) return null;
    const applied = applySwap(sessions, r, nameOf);
    if ("error" in applied) return null;
    const one = (id: string, name: string) => `${name} ${fmtH(weekHours(sessions, id, give.date))} → ${fmtH(weekHours(applied.sessions, id, give.date))}`;
    return `Giờ tuần ${one(r.fromTalent, r.fromName)} · ${one(r.toTalent, r.toName)}`;
  };

  return (
    <section className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-3 sm:p-4 space-y-3" aria-label="Chờ duyệt đổi ca">
      <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
        <ArrowLeftRight className="w-4 h-4 text-amber-300" /> Chờ duyệt đổi / nhường ca <b className="tabular-nums text-amber-300">{waiting.length}</b>
      </h3>
      {waiting.length === 0 && <p className="text-xs text-[var(--text-muted)]">Chưa có yêu cầu nào người kia đã đồng ý.</p>}
      {waiting.map((r) => {
        const give = sessions.find((s) => s.id === r.give.sessionId);
        const take = r.take ? sessions.find((s) => s.id === r.take!.sessionId) : undefined;
        const problems = swapProblems(sessions, r, { nowMs, nameOf });
        const hours = hoursLine(r);
        return (
          <div key={r.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
            <p className="text-sm text-[var(--text)]">
              <b>{r.fromName}</b> {r.kind === "swap" ? "⇄" : "→"} <b>{r.toName}</b> · {r.kind === "swap" ? "đổi ca" : "nhường ca"}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {give ? partLabel(give, r.give) : "ca"}
              {r.kind === "swap" && r.take ? ` ⇄ ${take ? partLabel(take, r.take) : "ca khác"}` : ""}
              {r.reason ? ` — lý do: ${r.reason}` : ""}
            </p>
            {hours && <p className="text-2xs text-[var(--text-faint)]">{hours}</p>}
            {problems.length > 0 && <p className="text-xs text-red-300">{problems[0]} Không duyệt được — từ chối kèm lý do.</p>}
            {rejecting === r.id ? (
              <div className="space-y-2">
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối (bắt buộc)" className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs" />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => { setRejecting(null); setNote(""); }} className="px-3 py-1.5 min-h-8 rounded-lg text-2xs font-bold text-[var(--text-muted)]">Thôi</button>
                  <button type="button" disabled={!note.trim() || busyId === r.id} onClick={() => void run(r.id, () => swap.decide(r.id, false, note.trim()))} className="px-3 py-1.5 min-h-8 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-2xs font-bold">
                    Từ chối
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setRejecting(r.id)} className="px-3 py-1.5 min-h-8 rounded-lg border border-[var(--border)] text-2xs font-bold text-[var(--text)] hover:border-[var(--accent)]">
                  Từ chối
                </button>
                <button type="button" disabled={problems.length > 0 || busyId === r.id} onClick={() => void run(r.id, () => swap.decide(r.id, true, ""))} className="px-3 py-1.5 min-h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] disabled:opacity-50 text-2xs font-bold">
                  {busyId === r.id ? "Đang duyệt..." : "Duyệt"}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {awaitingPeer.length > 0 && (
        <div className="space-y-1 pt-1">
          <p className="text-2xs font-bold text-[var(--text-faint)]">Đang chờ người nhận trả lời ({awaitingPeer.length}) — chưa duyệt được</p>
          {awaitingPeer.map((r) => {
            const give = sessions.find((s) => s.id === r.give.sessionId);
            return (
              <p key={r.id} className="text-xs text-[var(--text-muted)]">
                <b>{r.fromName}</b> {r.kind === "swap" ? "⇄" : "→"} <b>{r.toName}</b> · {r.kind === "swap" ? "đổi ca" : "nhường ca"}
                {give ? ` · ${partLabel(give, r.give)}` : ""}
              </p>
            );
          })}
        </div>
      )}
    </section>
  );
};
