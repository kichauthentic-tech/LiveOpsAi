import React, { useMemo, useState } from "react";
import { X, CalendarClock, Info } from "lucide-react";
import { MoreMenu } from "../ui/MoreMenu";
import type { Talent, TalentRateHistoryEntry } from "../../types";
import { PlatformChip } from "../common/PlatformChip";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import { talentShortName } from "../../lib/talentName";
import { shiftHours, type RosterAnalysis, type RosterRole, type RosterShift } from "../../lib/roster/rules";
import { rankCandidates, shiftCost, type Candidate, type RankContext, type RankMode } from "../../lib/roster/candidates";
import { getTodayDate } from "../../lib/dateUtils";
import { extraSignupDeadline } from "../../lib/roster/milestones";

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
  /** Thẻ "No Asst" (0207): ca chủ ý không có trợ live. */
  onNoAssistant?: (shift: RosterShift, value: boolean) => void;
  /** Mở lại đăng ký cho ca còn thiếu người sau khi hạn tháng/đợt đã qua (0207). */
  onReopenSignup?: (shift: RosterShift, deadline: Date) => void;
  onMove: (shift: RosterShift, v: { date: string; startTime: string; endTime: string }) => void;
  onRemove: (shift: RosterShift) => void;
  /** Đổi chế độ gợi ý (Cân bằng / Tiết kiệm chi phí / Tối ưu GMV) — cùng chế độ của thanh công cụ Điều Phối. */
  onMode?: (m: RankMode) => void;
}

const MODES: { key: RankMode; label: string; hint: string }[] = [
  { key: "balance", label: "Cân bằng", hint: "Đã báo rảnh, quen kênh, giờ tuần thấp, cộng nhẹ hiệu suất và chi phí." },
  { key: "cost", label: "Tiết kiệm chi phí", hint: "Người rẻ hơn lên trước, vẫn phải quen kênh (≥ 3 ca) và không quá giờ tuần." },
  { key: "gmv", label: "Tối ưu GMV", hint: "Host có GMV/giờ cao hơn kỳ vọng cùng kênh × khung giờ lên trước (chỉ số co về ×1,00 theo số ca; lặp lại yếu giữa các tháng, r = 0,23)." }
];

export const ShiftPanel: React.FC<Props> = ({ shift, analysis, ctx, talents, history, showCost, readOnly, busy, onClose, onAssign, onNoAssistant, onReopenSignup, onMove, onRemove, onMode }) => {
  const talentById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const nm = (id: string | undefined) => (id ? talentShortName(talentById.get(id)) || "?" : "");
  const issues = analysis.byShift.get(shift.key) ?? [];
  // Ô dời giờ khởi tạo từ ca đang mở; RosterBoard gắn `key` theo ca + giờ nên đổi ca / dời xong là ô tự về giá trị mới.
  const [moveDate, setMoveDate] = useState(shift.date);
  const [moveStart, setMoveStart] = useState(shift.startTime);
  const [moveEnd, setMoveEnd] = useState(shift.endTime);
  // Bản gọn 25/10: tab "Báo nghỉ" riêng thành nút ngay trong thẻ ca — bấm rồi chọn người thay, lý do ghi sẵn.
  const [absent, setAbsent] = useState<RosterRole | null>(null);
  // Cửa sổ gọn 09/11: một vai một lúc (ô chạm Host / Trợ), Dời ca mở từ ⋯.
  const [roleTab, setRoleTab] = useState<RosterRole>(() => (!shift.hostId || shift.coHostId ? "host" : "co_host"));
  const [moving, setMoving] = useState(false);
  const [everyone, setEveryone] = useState(false);

  const past = shift.date < getTodayDate();
  const lockedPeople = readOnly || past || shift.segmented;
  const canMove = !readOnly && !past && !shift.hasData;
  const cost = shiftCost(shift, talents, history);

  const roleBlock = (role: RosterRole) => {
    const cur = role === "host" ? shift.hostId : shift.coHostId;
    // 09/11: chỉ gợi ý trong nhóm đã đăng ký ca này, rồi mới áp luật (bận / quá giờ tuần) + chế độ xếp hạng. "Xem cả người chưa đăng ký" là lối thoát.
    const full = rankCandidates(shift, role, ctx, analysis);
    const list = everyone ? full : full.filter((c) => c.registered);
    const unregistered = full.length - full.filter((c) => c.registered).length;
    const ok = list.filter((c) => !c.blocked).slice(0, 8);
    const blocked = list.length - list.filter((c) => !c.blocked).length;
    return (
      <section className="space-y-2" aria-label={role === "host" ? "Host" : "Trợ live"}>
        {/* Tên người đang xếp đã ở ô chạm vai phía trên (09/11) — dòng này chỉ còn thao tác với người đó. */}
        <div className="flex items-baseline justify-end gap-2 empty:hidden">
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
        {role === "co_host" && !cur && onNoAssistant && !readOnly && !past && !shift.segmented && (shift.kind === "open" ? !!shift.hostId : !!shift.finalSlotId) && (
          <button
            type="button"
            disabled={busy}
            aria-pressed={!!shift.noAssistant}
            onClick={() => onNoAssistant(shift, !shift.noAssistant)}
            title="Ca không có trợ live thì OPS giao ca. Gắn thẻ này để ca được công bố mà không bị tính là thiếu trợ."
            className={`w-full text-left text-xs font-bold px-3 py-2 rounded-xl border ${shift.noAssistant ? "seg-on" : "border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)]"}`}
          >
            No Asst — ca chủ ý không có trợ live{shift.noAssistant ? " (đang bật, bấm để gỡ)" : ""}
          </button>
        )}
        {absent === role && cur && <p className="text-2xs text-[var(--accent-text)]">Chọn người thay {nm(cur)} bên dưới — lý do "Báo nghỉ" ghi sẵn vào nhật ký, cả hai người nhận thông báo.</p>}
        {!lockedPeople && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-[var(--text-muted)] border-b border-[var(--border)]">
                  <th className="py-1.5 pr-2 font-semibold">
                    <span className="inline-flex items-center gap-1" title={`${MODES.find((m) => m.key === ctx.mode)?.hint ?? ""} Không xếp người bận ca trùng giờ / quá ${ctx.rules.maxWeekHours}h tuần.`}>
                      Người <Info className="w-3 h-3" />
                    </span>
                  </th>
                  {showCost && <th className={`py-1.5 px-1 font-semibold text-right ${ctx.mode === "cost" ? "text-[var(--accent-text)]" : ""}`} title="Chi phí cast của CẢ CA này = rate/giờ × số giờ.">Cast ca này</th>}
                  {role === "host" && <th className={`py-1.5 px-1 font-semibold text-right ${ctx.mode === "gmv" ? "text-[var(--accent-text)]" : ""}`} title="GMV/giờ thật của host ở đúng kênh của ca này, 90 ngày. % = cast/giờ ÷ GMV/giờ (cần ≥ 3 ca). Số nhỏ = số ca làm căn cứ.">GMV/giờ</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {ok.map((c) => (
                  <CandidateRow
                    key={c.talentId}
                    c={c}
                    role={role}
                    name={nm(c.talentId)}
                    showCost={showCost}
                    hours={shiftHours(shift)}
                    maxWeek={ctx.rules.maxWeekHours}
                    warnWeek={ctx.rules.warnWeekHours}
                    busy={busy}
                    onPick={() => onAssign(shift, role, c.talentId, absent === role && cur ? `Báo nghỉ: ${nm(cur)}` : undefined)}
                  />
                ))}
              </tbody>
            </table>
            {ok.length === 0 && (
              <p className="text-xs text-[var(--text-muted)] py-2">
                {everyone ? "Không còn ai rảnh và đủ điều kiện." : shift.registrants.length === 0 ? "Chưa ai đăng ký ca này." : "Người đã đăng ký đều đang bận hoặc không đủ điều kiện."}
              </p>
            )}
          </div>
        )}
        {!lockedPeople && blocked > 0 && <p className="text-2xs text-[var(--text-faint)]">Ẩn {blocked} người đang bận ca trùng giờ.</p>}
        {!lockedPeople && (everyone || unregistered > 0) && (
          <button type="button" onClick={() => setEveryone((v) => !v)} className="text-2xs font-bold text-[var(--accent-text)] hover:underline">
            {everyone ? "Chỉ hiện người đã đăng ký" : `Xem cả ${unregistered} người chưa đăng ký`}
          </button>
        )}
      </section>
    );
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-[540px] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col" aria-label="Chi tiết ca">
      <div className="p-4 border-b border-[var(--border)] flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-2xs font-semibold text-[var(--accent-text)]">
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
        <div className="flex items-center gap-1.5 shrink-0">
          <MoreMenu
            items={[
              ...(canMove ? [{ label: moving ? "Ẩn dời ca" : "Dời ca", onClick: () => setMoving((v) => !v) }] : []),
              ...(!readOnly && !past && !shift.hasData && (shift.kind === "session" || !shift.planId)
                ? [{ label: shift.kind === "open" ? "Bỏ ca này (ca thêm, chưa có người)" : "Huỷ ca (ghi lý do)", onClick: () => onRemove(shift), danger: true, disabled: busy }]
                : [])
            ]}
          />
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Đóng">
            <X className="w-4 h-4" />
          </button>
        </div>
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
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Vai">
          {(["host", "co_host"] as const).map((r) => {
            const id = r === "host" ? shift.hostId : shift.coHostId;
            return (
              <button key={r} type="button" aria-pressed={roleTab === r} onClick={() => setRoleTab(r)} className={`min-h-9 px-3 rounded-xl border text-xs font-bold ${roleTab === r ? "seg-on" : "border-[var(--border)] text-[var(--text)]"}`}>
                {r === "host" ? "Host" : "Trợ"} · {id ? nm(id) : r === "co_host" && shift.noAssistant ? <span className="text-amber-300">No Asst</span> : <span className="text-red-300">chưa có</span>}
              </button>
            );
          })}
        </div>
        {!lockedPeople && onMode && (
          <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 text-xs font-bold w-fit" role="group" aria-label="Ưu tiên khi gợi ý người">
            {MODES.map((m) => (
              <button key={m.key} type="button" title={m.hint} aria-pressed={ctx.mode === m.key} onClick={() => onMode(m.key)} className={`px-3 py-1.5 rounded-lg ${ctx.mode === m.key ? "seg-on" : "text-[var(--text-muted)]"}`}>
                {m.label}
              </button>
            ))}
          </div>
        )}
        {roleBlock(roleTab)}

        {onReopenSignup && !readOnly && !past && shift.kind === "open" && (!shift.hostId || (!shift.coHostId && !shift.noAssistant)) && (() => {
          const dl = extraSignupDeadline(shift.date, shift.startTime, new Date());
          return (
            <div className="rounded-xl border border-[var(--border)] px-3 py-2.5 space-y-1.5">
              <p className="text-xs text-[var(--text-muted)]">
                Ca còn thiếu {!shift.hostId ? "host" : "trợ live"}. Hết hạn đăng ký của tháng/đợt thì talent không báo rảnh được nữa — đặt hạn riêng cho ca này để họ đăng ký thêm.
              </p>
              <button type="button" disabled={busy || !dl} onClick={() => dl && onReopenSignup(shift, dl)} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50">
                {dl ? `Mở đăng ký thêm tới ${dl.getHours()}:${String(dl.getMinutes()).padStart(2, "0")} ${dl.getDate()}/${dl.getMonth() + 1}` : "Ca sát giờ — không còn thời gian mở đăng ký"}
              </button>
            </div>
          );
        })()}

        {canMove && moving && (
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
            <p className="text-2xs text-[var(--text-muted)]">
              {shift.kind === "open" ? "Ca chưa có người chốt: dời thẳng, người đã báo rảnh vẫn giữ." : "Ca đã lên lịch: phải ghi lý do; host/trợ nhận thông báo đổi giờ và phải bấm Đã nhận lại."}
            </p>
          </section>
        )}
      </div>
    </aside>
  );
};

const CandidateRow: React.FC<{ c: Candidate; role: RosterRole; name: string; showCost: boolean; hours: number; maxWeek: number; warnWeek: number; busy: boolean; onPick: () => void }> = ({
  c,
  role,
  name,
  showCost,
  hours,
  maxWeek,
  warnWeek,
  busy,
  onPick
}) => {
  const after = c.weekHours + hours;
  return (
    <tr className="border-b border-[var(--border-muted)] align-middle">
      <td className="py-1.5 pr-2">
        <span className="font-bold text-[var(--text)]">{name}</span>
        {c.registered && <span className="ml-1.5 text-2xs font-bold text-emerald-300">báo rảnh</span>}
        <span className="block text-2xs text-[var(--text-faint)] whitespace-nowrap" title="Số ca đã làm ở kênh này trong 90 ngày · giờ đã xếp trong tuần (sau ca này: giờ / mức tối đa)">
          <span className={c.famHost + c.famCo > 0 ? "" : "text-red-300"}>{role === "host" ? c.famHost : c.famCo} ca ở kênh</span>
          {(role === "host" ? c.famCo : c.famHost) > 0 && ` (+${role === "host" ? c.famCo : c.famHost} ${role === "host" ? "trợ" : "host"})`} · tuần{" "}
          <span className={after > warnWeek ? "text-amber-300 font-bold" : ""} title={`Sau ca này: ${fmtH(after)}h / ${maxWeek}h`}>{fmtH(c.weekHours)}h</span>
        </span>
        {c.issues.length > 0 && <span className="block text-2xs text-amber-300">{c.issues.join(" · ")}</span>}
      </td>
      {showCost && (
        <td className="py-1.5 px-1 text-right tabular-nums whitespace-nowrap" title={c.cost.missing ? "Chưa có rate" : c.cost.hourly && hours > 0 ? `${fmtVndShort(c.cost.amount / hours)}/giờ × ${fmtH(hours)} giờ` : "Rate theo phiên"}>
          {c.cost.missing ? <span className="text-2xs text-[var(--text-faint)]">chưa có rate</span> : fmtVndShort(c.cost.amount)}
          {!c.cost.missing && c.cost.hourly && hours > 0 && <span className="block text-2xs text-[var(--text-faint)]">{fmtVndShort(c.cost.amount / hours)}/giờ</span>}
        </td>
      )}
      {role === "host" && (
        <td
          className="py-1.5 px-1 text-right tabular-nums whitespace-nowrap"
          title={
            c.chGmv
              ? `${c.chGmv.n} ca host ở kênh này làm căn cứ${c.chGmv.n < 3 ? " — chưa đủ 3 ca nên chưa tính cast %" : ""}${c.perf ? ` · Hiệu suất ×${fmtFixed(c.perf.index, 2)} so với kỳ vọng kênh × khung giờ (${c.perf.n} ca)` : ""}`
              : "Chưa có ca host có GMV ở kênh này trong 90 ngày"
          }
        >
          {c.chGmv ? fmtVndShort(c.chGmv.gmvPerHour) : "—"}
          {c.castPct !== undefined && showCost && <span className="block text-2xs text-[var(--text-muted)]">cast {fmtFixed(c.castPct * 100, 1)}%</span>}
          {c.chGmv && c.chGmv.n < 3 && <span className="block text-2xs text-[var(--text-faint)]">mới {c.chGmv.n} ca</span>}
        </td>
      )}
      <td className="py-1.5 pl-1 text-right">
        <button type="button" disabled={busy} onClick={onPick} className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
          Xếp
        </button>
      </td>
    </tr>
  );
};
