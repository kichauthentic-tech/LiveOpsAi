import React, { useState } from "react";
import { PromoScheme } from "../types";
import { Tag, Plus, Trash2 } from "lucide-react";

interface SchemeManagerProps {
  schemes: PromoScheme[];
  onAdd: (scheme: { title: string; description: string; startDate: string; endDate: string }) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate">>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

// Panel quản lý Scheme (khuyến mãi theo khoảng ngày) — nhúng vào LiveCalendar,
// chỉ hiện cho ceo/operations/admin (canEdit đã gate ở call-site).
export const SchemeManager: React.FC<SchemeManagerProps> = ({ schemes, onAdd, onUpdate, onDelete }) => {
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleAdd = async () => {
    if (!title.trim() || !startDate || !endDate) return;
    setBusy(true);
    try {
      await onAdd({ title: title.trim(), description: description.trim(), startDate, endDate });
      setTitle("");
      setDescription("");
      setStartDate("");
      setEndDate("");
    } finally {
      setBusy(false);
    }
  };

  const sorted = [...schemes].sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
      <div className="text-xs font-bold text-[var(--text-muted)] flex items-center gap-1.5">
        <Tag className="w-3.5 h-3.5 text-amber-400" /> Scheme khuyến mãi (hiện badge nhãn <Tag className="w-3 h-3 inline" /> trên ô ngày trong khoảng áp dụng)
      </div>
      <div className="space-y-2">
        {sorted.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-2 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2">
            <input
              type="text"
              defaultValue={s.title}
              onBlur={(e) => onUpdate(s.id, { title: e.target.value })}
              className="flex-1 min-w-[120px] bg-transparent text-[var(--text)] text-xs font-bold focus:outline-none"
            />
            <input
              type="text"
              defaultValue={s.description}
              placeholder="Mô tả (mã voucher nếu có)"
              onBlur={(e) => onUpdate(s.id, { description: e.target.value })}
              className="flex-1 min-w-[160px] bg-transparent text-[var(--text-muted)] text-xs focus:outline-none"
            />
            <input
              type="date"
              defaultValue={s.startDate}
              onBlur={(e) => onUpdate(s.id, { startDate: e.target.value })}
              className="bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-1 text-[var(--text)] text-[11px]"
            />
            <span className="text-[var(--text-faint)] text-xs">→</span>
            <input
              type="date"
              defaultValue={s.endDate}
              onBlur={(e) => onUpdate(s.id, { endDate: e.target.value })}
              className="bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-1 text-[var(--text)] text-[11px]"
            />
            <button onClick={() => onDelete(s.id)} className="text-red-400 hover:bg-red-950/80 p-1 rounded-lg">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {sorted.length === 0 && <div className="text-xs text-[var(--text-faint)] italic py-2">Chưa có scheme khuyến mãi nào.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
        <input
          type="text"
          placeholder="Tên scheme (vd Flash Sale 8.8)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 min-w-[140px] bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="text"
          placeholder="Mô tả (mã voucher nếu có)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="flex-1 min-w-[160px] bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
        />
        <button
          onClick={handleAdd}
          disabled={busy || !title.trim() || !startDate || !endDate}
          className="flex items-center gap-1 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm Scheme
        </button>
      </div>
    </div>
  );
};
