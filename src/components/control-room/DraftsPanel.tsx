import React, { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { Talent } from "../../types";
import type { SessionDraft } from "../../lib/db/sessionDrafts";
import { brandPlatformKey } from "../../lib/reportPlatform";
import { ddmm, money } from "../dashboard/shared";
import type { RoomChannel } from "./types";

// Ca nháp chờ OP xác nhận (0170). Mỗi dòng sửa được ngày, giờ, host, trợ, phòng; "Xác nhận" gọi accept_session_draft — tạo ca chờ
// đăng ký + chốt người trong MỘT transaction, DB chặn trùng người/phòng như ca thường. Lỗi hiện ngay tại dòng.

interface Edit {
  date: string;
  startTime: string;
  endTime: string;
  hostId: string;
  coHostId: string;
  studioId: string;
}

export const DraftsPanel: React.FC<{
  drafts: SessionDraft[];
  channels: RoomChannel[];
  talents: Talent[];
  studios: { id: string; name: string }[];
  today: string;
  onAccept: (d: SessionDraft, e: Edit) => Promise<void>;
  onDismiss: (ids: string[]) => Promise<void>;
}> = ({ drafts, channels, talents, studios, today, onAccept, onDismiss }) => {
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (drafts.length === 0) return <p className="text-sm text-[var(--text-faint)]">Không có ca nháp nào đang chờ. Tạo từ sa bàn ở trên.</p>;
  const nameOf = (d: SessionDraft) => channels.find((c) => c.key === brandPlatformKey(d.brandId, d.platform))?.name ?? "Kênh";
  const editOf = (d: SessionDraft): Edit => edits[d.id] ?? { date: d.date, startTime: d.startTime, endTime: d.endTime, hostId: d.hostId ?? "", coHostId: d.coHostId ?? "", studioId: d.studioId ?? "" };
  const set = (d: SessionDraft, patch: Partial<Edit>) => setEdits((m) => ({ ...m, [d.id]: { ...editOf(d), ...patch } }));
  const people = [...talents].sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const inputCls = "bg-[var(--surface-muted)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] min-h-[30px]";
  const run = async (id: string, fn: () => Promise<void>) => {
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      await fn();
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err) }));
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button type="button" disabled={busy != null} onClick={() => run("all", () => onDismiss(drafts.map((d) => d.id)))} className="text-xs font-bold text-[var(--text-muted)] hover:text-rose-400 min-h-[28px]">Bỏ cả {drafts.length} ca nháp</button>
      </div>
      {drafts.map((d) => {
        const e = editOf(d);
        return (
          <div key={d.id} className="rounded-xl border border-[var(--border)] p-3 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <b className="text-[var(--text)]">{nameOf(d)} · {ddmm(d.date)} {d.startTime}–{d.endTime}</b>
              <span className="text-xs text-[var(--text-faint)]">Kỳ vọng {money(d.expectedGmv)}{d.reason ? ` · ${d.reason}` : ""}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="Ngày" type="date" min={today} value={e.date} onChange={(ev) => set(d, { date: ev.target.value })} className={inputCls} />
              <input aria-label="Giờ bắt đầu" type="time" value={e.startTime} onChange={(ev) => set(d, { startTime: ev.target.value })} className={inputCls} />
              <input aria-label="Giờ kết thúc" type="time" value={e.endTime} onChange={(ev) => set(d, { endTime: ev.target.value })} className={inputCls} />
              <select aria-label="Host" value={e.hostId} onChange={(ev) => set(d, { hostId: ev.target.value })} className={inputCls}>
                <option value="">Chọn host</option>
                {people.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select aria-label="Trợ live" value={e.coHostId} onChange={(ev) => set(d, { coHostId: ev.target.value })} className={inputCls}>
                <option value="">Không có trợ live</option>
                {people.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select aria-label="Phòng" value={e.studioId} onChange={(ev) => set(d, { studioId: ev.target.value })} className={inputCls}>
                <option value="">Chưa chọn phòng</option>
                {studios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex gap-1.5 ml-auto">
                <button type="button" disabled={busy != null || !e.hostId} onClick={() => run(d.id, () => onAccept(d, e))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white disabled:opacity-40 min-h-[30px]">
                  {busy === d.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}Xác nhận thành ca
                </button>
                <button type="button" disabled={busy != null} onClick={() => run(d.id, () => onDismiss([d.id]))} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] min-h-[30px]"><X className="w-3.5 h-3.5" />Bỏ</button>
              </div>
            </div>
            {errors[d.id] && <p className="text-xs text-rose-400">{errors[d.id]}</p>}
          </div>
        );
      })}
      {errors.all && <p className="text-xs text-rose-400">{errors.all}</p>}
    </div>
  );
};
