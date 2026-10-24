import React, { useMemo, useState } from "react";
import { X, CalendarClock, Trash2 } from "lucide-react";
import type { Talent, TalentRateHistoryEntry } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { fmtVndShort } from "../../lib/format";
import { talentShortName } from "../../lib/talentName";
import { shiftHours, type RosterAnalysis, type RosterRole, type RosterShift } from "../../lib/roster/rules";
import { plannedCost, rankCandidates, shiftCost, type Candidate, type RankContext } from "../../lib/roster/candidates";
import { getTodayDate } from "../../lib/dateUtils";

// Ngăn chi tiết một ca của Điều Phối Lịch Live: lỗi/cảnh báo, người đã báo rảnh, gợi ý người cho từng vai (kèm lý do + chi phí), dời giờ, bỏ ca.
// Ca mở ⇒ ghi NHÁP (talent chưa thấy). Ca đã lên lịch ⇒ đổi người / dời giờ phải có lý do (RPC ghi nhật ký, DB báo người liên quan).

const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const dayLabel = (d: string) => `${DOW[new Date(`${d}T00:00:00`).getDay()]} ${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");

const SEV_CLASS: Record<string, string> = {
  block: "bg-red-500/10 text-red-300 border-red-500/30",
  hole: "bg-red-500/10 text-red-300 border-red-500/30",
  warn: "bg-amber-500/10 text-amber-300 border-amber-500/30"
};

interface Props {
  shift: RosterShift;
  analysis: RosterAnalysis;
  ctx: RankContext;
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  showCost: boolean;
  readOnly: boolean;
  busy: boolean;
  onClose: () => void;
  /** `reason` có sẵn (vd "Báo nghỉ: …") ⇒ ca đã lên lịch đổi người không hỏi lý do nữa. */
  onAssign: (shift: RosterShift, role: RosterRole, talentId: string | undefined, reason?: string) => void;
  onMove: (shift: RosterShift, v: { date: string; startTime: string; endTime: string }) => void;
  onRemove: (shift: RosterShift) => void;
}

export const ShiftPanel: React.FC<Props> = ({ shift, analysis, ctx, talents, history, showCost, readOnly, busy, onClose, onAssign, onMove, onRemove }) => {
  const talentById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const nm = (id: string | undefined) => (id ? talentShortName(talentById.get(id)) || "?" : "");
  const issues = analysis.byShift.get(shift.key) ?? [];
  // Ô dời giờ khởi tạo từ ca đang mở; RosterBoard gắn `key` theo ca + giờ nên đổi ca / dời xong là ô tự về giá trị mới.
  const [moveDate, setMoveDate] = useState(shift.date);
  const [moveStart, setMoveStart] = useState(shift.startTime);
  const [moveEnd, setMoveEnd] = useState(shift.endTime);
  // Bản gọn 25/10: tab "Báo nghỉ" riêng thành nút ngay trong thẻ ca — bấm rồi chọn người thay, lý do ghi sẵn.
  const [absent, setAbsent] = useState<RosterRole | null>(null);

  const past = shift.date < getTodayDate();
  const lockedPeople = readOnly || past || shift.segmented;
  const canMove = !readOnly && !past && !shift.hasData;
  const cost = shiftCost(shift, talents, history);

  const roleBlock = (role: RosterRole) => {
    const cur = role === "host" ? shift.hostId : shift.coHostId;
    const list = rankCandidates(shift, role, ctx, analysis);
    const ok = list.filter((c) => !c.blocked).slice(0, 8);
    const blocked = list.length - list.filter((c) => !c.blocked).length;
    const curCost = cur ? plannedCost(talentById.get(cur), history, role, shift.date, shiftHours(shift)) : null;
    return (
      <section className="space-y-2" aria-label={role === "host" ? "Host" : "Trợ live"}>
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="text-sm font-black text-[var(--text)]">
            {role === "host" ? "Host" : "Trợ live"}:{" "}
            {cur ? <span>{nm(cur)}</span> : <span className="text-red-300">chưa có</span>}
          </h4>
          {cur && !lockedPeople && (
            <span className="flex gap-1.5">
              {shift.kind === "session" && (
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={absent === role}
                  onClick={() => setAbsent(absent === role ? null : role)}
                  className={`text-xs font-bold px-2 py-1 rounded-lg border ${absent === role ? "border-[var(--accent)] text-[var(--text)] bg-[var(--accent)]/10" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                >
                  Người này báo nghỉ
                </button>
              )}
              {(shift.kind === "open" || role === "co_host") && (
                <button type="button" disabled={busy} onClick={() => onAssign(shift, role, undefined)} className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded-lg border border-[var(--border)]">
                  Bỏ người
                </button>
              )}
            </span>
          )}
        </div>
        {absent === role && cur && <p className="text-[11px] text-[var(--accent-text)]">Chọn người thay {nm(cur)} bên dưới — lý do "Báo nghỉ" ghi sẵn vào nhật ký, cả hai người nhận thông báo.</p>}
        {!lockedPeople && (
          <ul className="space-y-1.5">
            {ok.map((c) => (
              <CandidateRow
                key={c.talentId}
                c={c}
                role={role}
                name={nm(c.talentId)}
                showCost={showCost}
                busy={busy}
                onPick={() => onAssign(shift, role, c.talentId, absent === role && cur ? `Báo nghỉ: ${nm(cur)}` : undefined)}
                currentCost={curCost && !curCost.missing ? curCost.amount : undefined}
              />
            ))}
            {ok.length === 0 && <li className="text-xs text-[var(--text-muted)]">Không còn ai rảnh và đủ điều kiện.</li>}
          </ul>
        )}
        {!lockedPeople && blocked > 0 && <p className="text-[11px] text-[var(--text-muted)]">{blocked} người khác bận ca trùng giờ hoặc sẽ quá {ctx.rules.maxWeekHours} giờ/tuần nên không hiện.</p>}
      </section>
    );
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[440px] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col" aria-label="Chi tiết ca">
      <div className="p-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold text-[var(--accent-text)]">
            {dayLabel(shift.date)} · {shift.kind === "open" ? (shift.drafted ? "Ca mở · đang nháp" : "Ca mở · chưa xếp") : "Đã lên lịch"}
          </p>
          <h3 className="text-lg font-black text-[var(--text)] flex flex-wrap items-center gap-2">
            {shift.brandName} <PlatformChip platform={shift.platform} />
            <span className="font-mono">{shift.startTime}–{shift.endTime}</span>
          </h3>
          <p className="text-xs text-[var(--text-muted)]">
            Phòng {shift.studioName || "chưa đặt"} · {fmtH(shiftHours(shift))} giờ
            {showCost && (cost.amount > 0 || cost.missing) && (
              <>
                {" "}· Chi phí người: <b className="text-[var(--text)]">{cost.amount > 0 ? fmtVndShort(cost.amount) : "—"}</b>
                {cost.missing && " (có người chưa có rate)"}
              </>
            )}
          </p>
          {shift.kind === "open" && shift.registrants.length > 0 && (
            <p className="text-xs text-emerald-300">Đã báo rảnh: {shift.registrants.map(nm).join(", ")}</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {issues.length > 0 ? (
          <ul className="space-y-1.5">
            {issues.map((i, idx) => (
              <li key={idx} className={`text-xs px-2.5 py-1.5 rounded-lg border ${SEV_CLASS[i.severity]}`}>
                {i.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs px-2.5 py-1.5 rounded-lg border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">Ca này không phạm luật nào.</p>
        )}
        {shift.segmented && <p className="text-xs text-[var(--text-muted)]">Ca đã chia đoạn người đứng (đổi người giữa ca) — đổi người ở Cửa sổ Ca Live để giữ đúng giờ từng người.</p>}
        {past && <p className="text-xs text-[var(--text-muted)]">Ca ngày đã qua — sửa ở Sổ Ca / Cửa sổ Ca Live.</p>}
        {roleBlock("host")}
        {roleBlock("co_host")}

        {canMove && (
          <section className="space-y-2 border-t border-[var(--border)] pt-4">
            <h4 className="text-sm font-black text-[var(--text)] flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> Dời ca
            </h4>
            <div className="flex flex-wrap items-end gap-2 text-xs">
              <label className="flex flex-col gap-1">
                Ngày
                <input type="date" value={moveDate} min={getTodayDate()} onChange={(e) => setMoveDate(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]" />
              </label>
              <label className="flex flex-col gap-1">
                Bắt đầu
                <input type="time" value={moveStart} onChange={(e) => setMoveStart(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]" />
              </label>
              <label className="flex flex-col gap-1">
                Kết thúc
                <input type="time" value={moveEnd} onChange={(e) => setMoveEnd(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]" />
              </label>
              <button
                type="button"
                disabled={busy || (moveDate === shift.date && moveStart === shift.startTime && moveEnd === shift.endTime) || !moveStart || !moveEnd || moveStart === moveEnd}
                onClick={() => onMove(shift, { date: moveDate, startTime: moveStart, endTime: moveEnd })}
                className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white font-bold disabled:opacity-40"
              >
                Dời
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              {shift.kind === "open" ? "Ca chưa có người chốt: dời thẳng, người đã báo rảnh vẫn giữ." : "Ca đã lên lịch: phải ghi lý do; host/trợ nhận thông báo đổi giờ và phải bấm Đã nhận lại."}
            </p>
          </section>
        )}
        {!readOnly && !past && !shift.hasData && (shift.kind === "session" || !shift.planId) && (
          <button type="button" disabled={busy} onClick={() => onRemove(shift)} className="text-xs font-bold text-red-300 hover:text-red-200 flex items-center gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> {shift.kind === "open" ? "Bỏ ca này (ca thêm, chưa có người)" : "Huỷ ca (ghi lý do)"}
          </button>
        )}
        <p className="text-[11px] text-[var(--text-muted)] border-t border-[var(--border)] pt-3">
          {ctx.mode === "cost"
            ? "Đang ưu tiên chi phí thấp: trong nhóm đủ điều kiện (đã đứng kênh ≥ 3 ca, không cảnh báo, tuần ≤ 36 giờ), người đã báo rảnh lên trước rồi tới người rẻ hơn; người còn lại xếp sau."
            : "Thứ tự gợi ý: đã báo rảnh, quen kênh (số ca 90 ngày), giờ tuần còn thấp, ít cảnh báo."}{" "}
          Không xếp theo GMV/giờ của host: đo trên 1.197 ca, thành tích host tháng trước không lặp lại tháng sau.
        </p>
      </div>
    </aside>
  );
};

const CandidateRow: React.FC<{ c: Candidate; role: RosterRole; name: string; showCost: boolean; busy: boolean; onPick: () => void; currentCost?: number }> = ({ c, role, name, showCost, busy, onPick, currentCost }) => (
  <li className="border border-[var(--border)] rounded-xl px-3 py-2 flex items-start justify-between gap-2">
    <div className="min-w-0 space-y-1">
      <p className="text-sm font-bold text-[var(--text)]">{name}</p>
      <div className="flex flex-wrap gap-1">
        {c.registered && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">Đã báo rảnh</span>}
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.famHost + c.famCo > 0 ? "bg-[var(--surface-elevated)] text-[var(--text-muted)]" : "bg-red-500/15 text-red-300"}`}>
          {role === "host" ? `${c.famHost} ca host` : `${c.famCo} ca trợ`} · {role === "host" ? `${c.famCo} ca trợ` : `${c.famHost} ca host`} ở kênh (90 ngày)
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-muted)]">{fmtH(c.weekHours)}h tuần này</span>
        {showCost && (
          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-muted)]">
            {c.cost.missing ? "chưa có rate" : `ca ${fmtVndShort(c.cost.amount)}`}
            {!c.cost.missing && currentCost !== undefined && Math.round(currentCost) !== Math.round(c.cost.amount) && (
              <b className={c.cost.amount < currentCost ? "text-emerald-300" : "text-red-300"}>
                {" "}
                {c.cost.amount < currentCost ? "−" : "+"}
                {fmtVndShort(Math.abs(currentCost - c.cost.amount))}
              </b>
            )}
          </span>
        )}
        {c.issues.map((x) => (
          <span key={x} className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300">
            {x}
          </span>
        ))}
      </div>
    </div>
    <button type="button" disabled={busy} onClick={onPick} className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
      Xếp
    </button>
  </li>
);
