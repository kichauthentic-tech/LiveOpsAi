import React, { useState } from "react";
import { Plus, Tag, Trash2 } from "lucide-react";
import { PromoScheme } from "../../types";
import { schemeCategoryColor, schemesForDate } from "../../lib/schemeUtils";

// Bản rút gọn của SchemeWeekStrip cho view 1-ngày (Lịch Vận Hành → chế độ Ngày) — không cần
// gộp colSpan theo tuần (chỉ 1 ngày duy nhất), nên hiện các scheme active ngày đó thành 1 danh
// sách khối màu dọc (cùng bảng màu `schemeCategoryColor` để nhất quán với SchemeWeekStrip ở
// chế độ Tháng). Cùng quy ước: ẩn ngày bắt đầu/kết thúc ở chế độ xem thường, chỉ hiện khi bấm
// vào để sửa (theo phản hồi user ở SchemeWeekStrip — xem WORKSPACE_DESIGN.md).

interface SchemeDayPanelProps {
  brandId: string;
  date: string;
  schemes: PromoScheme[]; // đã lọc theo brandId từ call-site, CHƯA lọc theo ngày
  canManage: boolean;
  onAdd?: (scheme: { title: string; description: string; startDate: string; endDate: string; brandId: string; category: string }) => Promise<void>;
  onUpdate?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

const EMPTY_DRAFT = { category: "", content: "", startDate: "", endDate: "" };

export const SchemeDayPanel: React.FC<SchemeDayPanelProps> = ({ brandId, date, schemes, canManage, onAdd, onUpdate, onDelete }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; category: string; startDate: string; endDate: string }>({
    text: "",
    category: "",
    startDate: "",
    endDate: ""
  });
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const daySchemes = schemesForDate(schemes, date);

  if (daySchemes.length === 0 && !canManage) return null;

  const startEdit = (scheme: PromoScheme) => {
    setEditingId(scheme.id);
    setDraft({ text: scheme.description, category: scheme.category, startDate: scheme.startDate, endDate: scheme.endDate });
  };

  const saveEdit = async () => {
    if (!editingId || !onUpdate || !onDelete) return;
    setBusy(true);
    try {
      if (!draft.text.trim()) {
        await onDelete(editingId);
      } else {
        await onUpdate(editingId, {
          description: draft.text.trim(),
          category: draft.category.trim() || "Chung",
          startDate: draft.startDate,
          endDate: draft.endDate
        });
      }
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  const submitNewRow = async () => {
    if (!onAdd || !newRow.category.trim() || !newRow.content.trim()) return;
    setBusy(true);
    try {
      await onAdd({
        title: newRow.category.trim(),
        description: newRow.content.trim(),
        startDate: newRow.startDate || date,
        endDate: newRow.endDate || newRow.startDate || date,
        brandId,
        category: newRow.category.trim()
      });
      setNewRow(EMPTY_DRAFT);
      setAdding(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 shadow-sm space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
        <Tag className="w-4 h-4 text-[var(--warning)]" /> Scheme khuyến mãi ngày {date}
      </h3>

      <datalist id="scheme-categories-day">
        {Array.from(new Set(schemes.map((s) => s.category))).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {daySchemes.length === 0 && !adding && <p className="text-xs text-[var(--text-faint)]">Chưa có scheme nào áp dụng ngày này.</p>}

      <div className="space-y-1.5">
        {daySchemes.map((scheme) => {
          const color = schemeCategoryColor(scheme.category);
          const isEditing = editingId === scheme.id;
          return (
            <div
              key={scheme.id}
              onClick={() => canManage && !isEditing && startEdit(scheme)}
              className={`rounded-lg border px-3 py-2 text-[12px] ${color.bg} ${color.border} ${
                canManage ? "cursor-pointer hover:brightness-95 dark:hover:brightness-125 transition-[filter]" : ""
              }`}
            >
              {isEditing ? (
                <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={draft.category}
                    onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                    list="scheme-categories-day"
                    placeholder="Hạng mục"
                    className={`w-full bg-white/70 dark:bg-slate-900/60 rounded px-1.5 py-1 text-[10px] font-black uppercase tracking-wide ${color.text} focus:outline-none focus:ring-1 focus:ring-amber-500`}
                  />
                  <textarea
                    autoFocus
                    value={draft.text}
                    onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                    rows={2}
                    className="w-full bg-white/70 dark:bg-slate-900/60 rounded p-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      type="date"
                      value={draft.startDate}
                      onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                      className="bg-white/70 dark:bg-slate-900/60 rounded px-1 py-0.5 text-[10px]"
                    />
                    <span className="text-slate-400">→</span>
                    <input
                      type="date"
                      value={draft.endDate}
                      onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                      className="bg-white/70 dark:bg-slate-900/60 rounded px-1 py-0.5 text-[10px]"
                    />
                    <button
                      disabled={busy}
                      onClick={saveEdit}
                      className="ml-auto px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold disabled:opacity-50"
                    >
                      Lưu
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => onDelete && (onDelete(scheme.id), setEditingId(null))}
                      className="p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide ${color.text} opacity-80`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                    {scheme.category}
                  </p>
                  <p className={`mt-0.5 font-semibold leading-snug whitespace-pre-wrap ${color.text}`}>{scheme.description}</p>
                </>
              )}
            </div>
          );
        })}
      </div>

      {canManage && onAdd && (
        <div className="pt-2 border-t border-[var(--border)]">
          {!adding ? (
            <button
              onClick={() => {
                setNewRow({ ...EMPTY_DRAFT, startDate: date, endDate: date });
                setAdding(true);
              }}
              className="flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm scheme
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                type="text"
                placeholder="Hạng mục (vd Voucher scheme)"
                value={newRow.category}
                onChange={(e) => setNewRow((d) => ({ ...d, category: e.target.value }))}
                list="scheme-categories-day"
                className="min-w-[130px] bg-[var(--surface-elevated)] rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="text"
                placeholder="Nội dung"
                value={newRow.content}
                onChange={(e) => setNewRow((d) => ({ ...d, content: e.target.value }))}
                className="flex-1 min-w-[160px] bg-[var(--surface-elevated)] rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <input
                type="date"
                value={newRow.startDate}
                onChange={(e) => setNewRow((d) => ({ ...d, startDate: e.target.value }))}
                className="bg-[var(--surface-elevated)] rounded px-1.5 py-1 text-[10px]"
              />
              <span className="text-[var(--text-faint)]">→</span>
              <input
                type="date"
                value={newRow.endDate}
                onChange={(e) => setNewRow((d) => ({ ...d, endDate: e.target.value }))}
                className="bg-[var(--surface-elevated)] rounded px-1.5 py-1 text-[10px]"
              />
              <button
                disabled={busy || !newRow.category.trim() || !newRow.content.trim()}
                onClick={submitNewRow}
                className="px-2 py-1 rounded bg-amber-600 text-white text-[11px] font-bold disabled:opacity-50"
              >
                Thêm
              </button>
              <button onClick={() => setAdding(false)} className="px-2 py-1 rounded text-[var(--text-faint)] text-[11px]">
                Huỷ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
