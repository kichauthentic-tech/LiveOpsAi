import React, { useState } from "react";
import { ChevronDown, Plus, Tag, Trash2 } from "lucide-react";
import { PromoScheme } from "../../types";
import { schemeCategoriesInOrder, schemesForDate } from "../../lib/schemeUtils";

// Bảng Scheme khuyến mãi theo tuần, nhúng thẳng dưới mỗi hàng 7 ô ngày của BrandCalendar —
// tương đương file Excel vận hành thật (hàng = hạng mục khuyến mãi như "Voucher scheme",
// "Combo Deal", "Free Gift"; cột = ngày trong tuần; ô nào thuộc cùng 1 scheme đa-ngày (vd
// đợt camp D-Day/Mid-Month) tự động gộp ô bằng colSpan). Đóng/mở độc lập theo từng tuần (mặc
// định đóng) — cùng kiểu tương tác ẩn/hiện với sidebar (`sidebarCollapsed` trong App.tsx),
// không cần persist localStorage vì đây chỉ là toggle phụ trong 1 phiên xem.
//
// `category` không phải 1 entity riêng trong DB — chỉ là field text trên từng `PromoScheme`,
// nên "hàng" ở đây được suy ra (group by) từ dữ liệu hiện có, không có thao tác "đổi tên hạng
// mục" riêng: muốn đổi tên, xoá rồi tạo lại các scheme dưới hạng mục mới.

interface SchemeWeekStripProps {
  brandId: string;
  weekDates: (string | null)[]; // đúng 7 phần tử, null = ô đệm ngoài tháng
  schemes: PromoScheme[]; // đã lọc theo brandId từ call-site
  canManage: boolean;
  onAdd?: (scheme: { title: string; description: string; startDate: string; endDate: string; brandId: string; category: string }) => Promise<void>;
  onUpdate?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

interface Segment {
  span: number;
  date: string | null;
  scheme: PromoScheme | null;
}

function buildRowSegments(categorySchemes: PromoScheme[], weekDates: (string | null)[]): Segment[] {
  const schemeAt = (date: string | null) => (date ? schemesForDate(categorySchemes, date)[0] ?? null : null);
  const segments: Segment[] = [];
  let i = 0;
  while (i < weekDates.length) {
    const date = weekDates[i];
    const scheme = schemeAt(date);
    let span = 1;
    while (i + span < weekDates.length) {
      const nextScheme = schemeAt(weekDates[i + span]);
      if (scheme && nextScheme && scheme.id === nextScheme.id) span++;
      else break;
    }
    segments.push({ span, date, scheme });
    i += span;
  }
  return segments;
}

const EMPTY_DRAFT = { category: "", content: "", startDate: "", endDate: "" };

export const SchemeWeekStrip: React.FC<SchemeWeekStripProps> = ({ brandId, weekDates, schemes, canManage, onAdd, onUpdate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; startDate: string; endDate: string }>({ text: "", startDate: "", endDate: "" });
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [newRow, setNewRow] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const weekSchemes = schemes.filter((s) => weekDates.some((d) => d && d >= s.startDate && d <= s.endDate));
  const categories = schemeCategoriesInOrder(weekSchemes);
  const firstDate = weekDates.find((d) => d) ?? "";
  const lastDate = [...weekDates].reverse().find((d) => d) ?? "";

  if (categories.length === 0 && !canManage) return null;

  const startEdit = (scheme: PromoScheme) => {
    setEditingId(scheme.id);
    setDraft({ text: scheme.description, startDate: scheme.startDate, endDate: scheme.endDate });
  };

  const saveEdit = async () => {
    if (!editingId || !onUpdate || !onDelete) return;
    setBusy(true);
    try {
      if (!draft.text.trim()) {
        await onDelete(editingId);
      } else {
        await onUpdate(editingId, { description: draft.text.trim(), startDate: draft.startDate, endDate: draft.endDate });
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
        startDate: newRow.startDate || firstDate,
        endDate: newRow.endDate || newRow.startDate || lastDate,
        brandId,
        category: newRow.category.trim()
      });
      setNewRow(EMPTY_DRAFT);
      setAddingCategory(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col-span-7 -mt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
      >
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span>{categories.length > 0 ? `Scheme khuyến mãi (${categories.length})` : "Chưa có scheme — bấm để thêm"}</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1.5 overflow-x-auto rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900/80">
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              {categories.map((category) => {
                const categorySchemes = weekSchemes.filter((s) => s.category === category);
                const segments = buildRowSegments(categorySchemes, weekDates);
                return (
                  <tr key={category} className="border-t border-amber-100 dark:border-amber-950/40 first:border-t-0">
                    <td className="w-24 shrink-0 px-2 py-1.5 font-bold text-slate-600 dark:text-slate-300 align-top bg-amber-50/60 dark:bg-amber-950/20 whitespace-nowrap">
                      {category}
                    </td>
                    {segments.map((seg, si) => {
                      if (!seg.date) return <td key={si} colSpan={seg.span} className="px-2 py-1.5 bg-slate-50 dark:bg-slate-950/40" />;
                      const isEditing = seg.scheme && editingId === seg.scheme.id;
                      return (
                        <td
                          key={si}
                          colSpan={seg.span}
                          onClick={() => canManage && seg.scheme && !isEditing && startEdit(seg.scheme)}
                          className={`px-2 py-1.5 align-top text-slate-700 dark:text-slate-300 ${
                            canManage && seg.scheme ? "cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950/30" : ""
                          }`}
                        >
                          {isEditing ? (
                            <div className="space-y-1">
                              <textarea
                                autoFocus
                                value={draft.text}
                                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                                rows={2}
                                className="w-full min-w-[140px] bg-slate-100 dark:bg-slate-800 rounded p-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={draft.startDate}
                                  onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                                  className="bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5 text-[10px]"
                                />
                                <span className="text-slate-400">→</span>
                                <input
                                  type="date"
                                  value={draft.endDate}
                                  onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                                  className="bg-slate-100 dark:bg-slate-800 rounded px-1 py-0.5 text-[10px]"
                                />
                                <button
                                  disabled={busy}
                                  onClick={saveEdit}
                                  className="ml-auto px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold disabled:opacity-50"
                                >
                                  Lưu
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => onDelete && seg.scheme && (onDelete(seg.scheme.id), setEditingId(null))}
                                  className="p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            seg.scheme?.description || ""
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {canManage && onAdd && (
            <div className="p-2 border-t border-amber-100 dark:border-amber-950/40">
              {addingCategory === null ? (
                <button
                  onClick={() => {
                    setNewRow({ ...EMPTY_DRAFT, startDate: firstDate, endDate: lastDate });
                    setAddingCategory("");
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
                    list="scheme-categories"
                    className="min-w-[130px] bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <datalist id="scheme-categories">
                    {Array.from(new Set(schemes.map((s) => s.category))).map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    placeholder="Nội dung"
                    value={newRow.content}
                    onChange={(e) => setNewRow((d) => ({ ...d, content: e.target.value }))}
                    className="flex-1 min-w-[160px] bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type="date"
                    value={newRow.startDate}
                    onChange={(e) => setNewRow((d) => ({ ...d, startDate: e.target.value }))}
                    className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-1 text-[10px]"
                  />
                  <span className="text-slate-400">→</span>
                  <input
                    type="date"
                    value={newRow.endDate}
                    onChange={(e) => setNewRow((d) => ({ ...d, endDate: e.target.value }))}
                    className="bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-1 text-[10px]"
                  />
                  <button
                    disabled={busy || !newRow.category.trim() || !newRow.content.trim()}
                    onClick={submitNewRow}
                    className="px-2 py-1 rounded bg-amber-600 text-white text-[11px] font-bold disabled:opacity-50"
                  >
                    Thêm
                  </button>
                  <button onClick={() => setAddingCategory(null)} className="px-2 py-1 rounded text-slate-400 text-[11px]">
                    Huỷ
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
