import React, { useMemo, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import type { LiveSession, StaffSegment, Talent } from "../types";
import { clockAtOffset, effectiveSegments, hasStaffSegments, offsetOfClock, segmentRange, sessionMinutes, validateSegments } from "../lib/staffSegments";
import { personClash } from "../lib/scheduling/conflicts";
import { useConfirm } from "../hooks/useConfirm";

// Đổi người GIỮA CA (migration 0138): ghi ai làm host / trợ live từ giờ nào tới giờ nào. Ca vẫn là một ca (một GMV, một
// target); lương và giờ làm tính theo từng người. Ca không chia đoạn = host/trợ làm cả ca như trước.

type Row = { role: StaffSegment["role"]; talentId: string; from: string; to: string };

interface Props {
  session: LiveSession;
  talents: Talent[];
  allSessions: LiveSession[];
  onSave: (segments: Pick<StaffSegment, "talentId" | "role" | "fromMin" | "toMin">[], reason: string) => Promise<boolean>;
  onClose: () => void;
}

const inputCls = "w-full bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs";
const ROLE_LABEL: Record<StaffSegment["role"], string> = { host: "Host", co_host: "Trợ live" };
const fmtH = (min: number) => `${(min / 60).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}h`;

function initialRows(s: LiveSession): Row[] {
  const rows = effectiveSegments(s)
    .sort((a, b) => (a.role === b.role ? a.fromMin - b.fromMin : a.role === "host" ? -1 : 1))
    .map((g) => ({ role: g.role, talentId: g.talentId, from: clockAtOffset(s, g.fromMin), to: clockAtOffset(s, g.toMin) }));
  return rows.length > 0 ? rows : [{ role: "host", talentId: "", from: s.startTime, to: s.endTime }];
}

export const StaffSegmentsEditor: React.FC<Props> = ({ session: s, talents, allSessions, onSave, onClose }) => {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Row[]>(() => initialRows(s));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const dur = sessionMinutes(s);
  const nameOf = (id: string) => talents.find((t) => t.id === id)?.name ?? "";

  const parsed = useMemo(
    () =>
      rows.map((r) => {
        const fromMin = offsetOfClock(s, r.from);
        const toRaw = offsetOfClock(s, r.to);
        // Giờ ra trùng đúng giờ ca kết thúc nhưng offset quay về 0 chỉ khi ca dài 24h — không xảy ra; 0 coi là sai.
        return { talentId: r.talentId, role: r.role, fromMin: fromMin ?? NaN, toMin: toRaw ?? NaN };
      }),
    [rows, s]
  );
  const error = useMemo(() => validateSegments(s, parsed), [parsed, s]);

  const clashes = useMemo(
    () =>
      parsed.map((g) => {
        if (!g.talentId || !Number.isFinite(g.fromMin) || !Number.isFinite(g.toMin) || g.toMin <= g.fromMin) return "";
        const c = personClash(allSessions, segmentRange(s, g), g.talentId, s.id);
        return c ? `Trùng ca ${c.brandName} ${c.startTime}–${c.endTime}` : "";
      }),
    [parsed, allSessions, s]
  );

  // Khoảng ca không có người ở từng vai (cảnh báo, không chặn — ca có thể thật sự trống trợ một lúc).
  const gaps = useMemo(() => {
    const out: string[] = [];
    for (const role of ["host", "co_host"] as const) {
      const segs = parsed.filter((g) => g.role === role && Number.isFinite(g.fromMin) && Number.isFinite(g.toMin) && g.toMin > g.fromMin).sort((a, b) => a.fromMin - b.fromMin);
      if (segs.length === 0) continue;
      let cursor = 0;
      for (const g of segs) {
        if (g.fromMin > cursor) out.push(`${ROLE_LABEL[role]} trống ${clockAtOffset(s, cursor)}–${clockAtOffset(s, g.fromMin)}`);
        cursor = Math.max(cursor, g.toMin);
      }
      if (cursor < dur) out.push(`${ROLE_LABEL[role]} trống ${clockAtOffset(s, cursor)}–${s.endTime}`);
    }
    return out;
  }, [parsed, s, dur]);

  const totals = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of parsed) {
      if (!g.talentId || !Number.isFinite(g.fromMin) || !Number.isFinite(g.toMin) || g.toMin <= g.fromMin) continue;
      const k = `${g.talentId}|${g.role}`;
      m.set(k, (m.get(k) ?? 0) + (g.toMin - g.fromMin));
    }
    return [...m.entries()].map(([k, min]) => {
      const [id, role] = k.split("|");
      return `${nameOf(id) || "?"} ${role === "host" ? "host" : "trợ"} ${fmtH(min)}`;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nameOf đọc talents
  }, [parsed, talents]);

  const update = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () =>
    setRows((prev) => {
      const last = prev[prev.length - 1];
      return [...prev, { role: last?.role ?? "co_host", talentId: "", from: last?.to ?? s.startTime, to: s.endTime }];
    });

  const save = async () => {
    if (error) return;
    setSaving(true);
    const ok = await onSave(parsed, reason);
    setSaving(false);
    if (ok) onClose();
  };

  const reset = async () => {
    if (!(await confirm("Bỏ chia đoạn? Host và Trợ live hiện tại sẽ làm cả ca như bình thường.", { danger: true }))) return;
    setSaving(true);
    const ok = await onSave([], reason);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <section className="space-y-3 text-xs bg-[var(--surface-base)] p-3 rounded-xl border border-[var(--border)]" aria-label="Đổi người giữa ca">
      <div className="flex items-start gap-2">
        <Users className="w-4 h-4 mt-0.5 text-[var(--accent)] shrink-0" />
        <div>
          <p className="font-bold text-[var(--text)]">Đổi người giữa ca</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Ghi ai làm Host / Trợ live từ giờ nào đến giờ nào trong ca {s.startTime}–{s.endTime}. GMV vẫn của cả ca; lương và giờ làm tính theo
            giờ của từng người.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="space-y-1">
            <div className="grid grid-cols-[88px_1fr_88px_88px_28px] gap-1.5 items-center">
              <select value={r.role} onChange={(e) => update(i, { role: e.target.value as Row["role"] })} className={inputCls} aria-label="Vai">
                <option value="host">Host</option>
                <option value="co_host">Trợ live</option>
              </select>
              <select value={r.talentId} onChange={(e) => update(i, { talentId: e.target.value })} className={inputCls} aria-label="Người">
                <option value="">-- Chọn người --</option>
                {talents.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <input type="time" value={r.from} onChange={(e) => update(i, { from: e.target.value })} className={`${inputCls} font-mono`} aria-label="Từ giờ" />
              <input type="time" value={r.to} onChange={(e) => update(i, { to: e.target.value })} className={`${inputCls} font-mono`} aria-label="Đến giờ" />
              <button
                type="button"
                onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-[var(--surface-elevated)]"
                aria-label="Xoá đoạn"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {clashes[i] && <p className="text-[11px] text-rose-300 pl-1">{nameOf(r.talentId) || "Người này"}: {clashes[i]}</p>}
          </div>
        ))}
      </div>

      <button type="button" onClick={add} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text)] font-bold text-[11px]">
        <Plus className="w-3.5 h-3.5" /> Thêm đoạn
      </button>

      {totals.length > 0 && <p className="text-[11px] text-[var(--text-muted)]">Giờ làm: {totals.join(" · ")}</p>}
      {gaps.length > 0 && <p className="text-[11px] text-amber-300">{gaps.join(" · ")} — không ai đứng ca khoảng này.</p>}
      {error && <p className="text-[11px] text-rose-300 font-medium">{error}</p>}

      <label className="block">
        <span className="font-bold text-amber-300 block mb-1">
          Lý do <span className="font-normal text-[var(--text-faint)]">(vào thay, ra sớm, báo bận…) — ghi vào nhật ký</span>
        </span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vd: Trúc Như 2h đầu, Thảo vào thay 30 phút cuối" className={inputCls} />
      </label>

      <div className="flex items-center justify-between gap-2 pt-1">
        {hasStaffSegments(s) ? (
          <button type="button" onClick={reset} disabled={saving} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">
            Bỏ chia đoạn (cả ca một người)
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold text-[11px]">Đóng</button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !!error}
            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-60 text-white font-bold text-[11px]"
          >
            {saving ? "Đang lưu..." : "Lưu các đoạn"}
          </button>
        </div>
      </div>
    </section>
  );
};
