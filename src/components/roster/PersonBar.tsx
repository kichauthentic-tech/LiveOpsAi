import React from "react";
import { X } from "lucide-react";
import type { Talent } from "../../types";
import { talentShortName } from "../../lib/talentName";
import type { RosterRole } from "../../lib/roster/rules";

// Thanh "Xếp theo người" (17/11, chị trainer: "không cần list ca, sáng trên grid là được"): một hàng điều khiển ngay trên lịch tuần.
// Chọn người + vai ⇒ lưới tô sáng ca họ đăng ký / đã xếp (WeekGrid `focus`); bấm ô trên lưới để xếp hoặc bỏ (RosterBoard.personPlace).

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");

interface Props {
  people: { talent: Talent; registered: number }[];
  personId: string;
  role: RosterRole;
  onPerson: (id: string) => void;
  onRole: (r: RosterRole) => void;
  /** Giờ tháng đã xếp / mức tối thiểu–tối đa của người đang chọn (chưa chọn thì undefined). */
  hours?: { placed: number; min: number; max: number; addIfAll: number };
  bulkCount: number;
  readOnly: boolean;
  busy: boolean;
  onBulk: () => void;
  onClose: () => void;
}

export const PersonBar: React.FC<Props> = ({ people, personId, role, onPerson, onRole, hours, bulkCount, readOnly, busy, onBulk, onClose }) => (
  <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--accent)]/50 bg-[var(--surface-base)] px-3 py-2 text-xs" aria-label="Xếp theo người">
    <span className="font-black text-[var(--text)]">Xếp theo người</span>
    <select aria-label="Người" value={personId} onChange={(e) => onPerson(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] font-bold min-w-44">
      <option value="">Chọn người…</option>
      {people.map(({ talent, registered }) => (
        <option key={talent.id} value={talent.id}>
          {talentShortName(talent)} · {registered} ca đăng ký
        </option>
      ))}
    </select>
    <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 font-bold" role="group" aria-label="Vai">
      {(["host", "co_host"] as const).map((r) => (
        <button key={r} type="button" aria-pressed={role === r} onClick={() => onRole(r)} className={`px-2.5 py-1 rounded-lg ${role === r ? "seg-on" : "text-[var(--text-muted)]"}`}>
          {r === "host" ? "Host" : "Trợ"}
        </button>
      ))}
    </div>
    {personId ? (
      <>
        {hours && (
          <span className="text-[var(--text-muted)] tabular-nums">
            {fmtH(hours.placed)}h / {hours.min}–{hours.max}h
            {hours.addIfAll > 0 && <> → <b className={hours.placed + hours.addIfAll > hours.max ? "text-amber-300" : "text-[var(--text)]"}>{fmtH(hours.placed + hours.addIfAll)}h</b></>}
          </span>
        )}
        <span className="text-[var(--text-muted)]">
          <b className="text-sky-300">Viền xanh dương</b>: bấm để xếp · <b className="text-emerald-300">xanh lá</b>: bấm để bỏ
        </span>
        <button type="button" disabled={readOnly || busy || bulkCount === 0} onClick={onBulk} title="Chỉ ô còn trống, không trùng giờ, không cảnh báo. Không bao giờ thay người đã có." className="ml-auto px-2.5 py-1 rounded-lg border border-[var(--border)] font-bold text-[var(--text)] hover:border-[var(--accent)] disabled:opacity-40">
          {bulkCount > 0 ? `Xếp hết ${bulkCount} ca hợp lệ` : "Không còn ca hợp lệ"}
        </button>
      </>
    ) : (
      <span className="text-[var(--text-muted)]">Chọn người để lưới tô sáng các ca họ đã đăng ký.</span>
    )}
    <button type="button" onClick={onClose} className={`${personId ? "" : "ml-auto"} p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]`} aria-label="Đóng xếp theo người">
      <X className="w-3.5 h-3.5" />
    </button>
  </div>
);
