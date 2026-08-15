import React, { useState } from "react";
import { ChevronDown, Plus, Tag, Trash2 } from "lucide-react";
import { PromoScheme } from "../../types";
import { schemeCategoryColor } from "../../lib/schemeUtils";

// Bảng Scheme khuyến mãi theo tuần, nhúng thẳng dưới mỗi hàng 7 ô ngày của BrandCalendar —
// tương đương file Excel vận hành thật (hàng = hạng mục khuyến mãi như "Voucher scheme",
// "Combo Deal", "Free Gift"; cột = ngày trong tuần; scheme đa-ngày (vd đợt camp D-Day/Mid-Month)
// tự động gộp thành 1 khối màu trải dài qua các cột đó). Đóng/mở độc lập theo từng tuần (mặc
// định đóng) — cùng kiểu tương tác ẩn/hiện với sidebar (`sidebarCollapsed` trong App.tsx),
// không cần persist localStorage vì đây chỉ là toggle phụ trong 1 phiên xem.
//
// Dùng CSS grid `grid-cols-7` (không phải <table>) để khớp pixel-perfect với lưới ngày của
// `PosterCalendarGrid` phía trên — tên hạng mục in ngay trong khối màu thay vì tách cột riêng
// (cột riêng khiến bảng "xấu"/lệch với lưới ngày — tên hạng mục thường dài, ép cột label rộng
// cố định trong khi khối màu bị bóp hẹp).
//
// **Xếp khối (packing)** — KHÔNG cố định 1 hàng/category (sẽ để trống rất nhiều ô khi 1 category
// chỉ có scheme ngắn ngày). Thay vào đó xếp từng scheme độc lập vào hàng đầu tiên còn chỗ trống ở
// đúng dải cột ngày của nó (thuật toán "first-fit" quen thuộc khi vẽ lịch kiểu Google Calendar) —
// 2 scheme khác category vẫn có thể nằm chung 1 hàng nếu không chồng ngày, tiết kiệm chiều cao.
//
// `category` không phải 1 entity riêng trong DB — chỉ là field text trên từng `PromoScheme`,
// nên không có thao tác "đổi tên hạng mục" riêng: muốn đổi tên, sửa trực tiếp field này trên
// từng scheme (không đồng loạt đổi tên cả nhóm).

interface SchemeWeekStripProps {
  brandId: string;
  weekDates: (string | null)[]; // đúng 7 phần tử, null = ô đệm ngoài tháng
  schemes: PromoScheme[]; // đã lọc theo brandId từ call-site
  canManage: boolean;
  onAdd?: (scheme: { title: string; description: string; startDate: string; endDate: string; brandId: string; category: string }) => Promise<void>;
  onUpdate?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

interface PackedSegment {
  scheme: PromoScheme;
  colStart: number; // 0-6, cột ngày bắt đầu trong tuần đang xem
  colEnd: number; // 0-6, cột ngày kết thúc (inclusive)
  row: number; // hàng được xếp vào (0-based, tính từ thuật toán first-fit)
}

// Mỗi scheme có 1 khoảng ngày liên tục (startDate→endDate) nên giao của nó với 7 ngày trong
// tuần cũng luôn liên tục — không cần gộp nhiều mảnh như trước, chỉ cần tìm cột đầu/cuối còn
// active. Sau đó xếp (first-fit) vào hàng đầu tiên không có khối nào khác chồng cột với nó.
function buildPackedSegments(weekSchemes: PromoScheme[], weekDates: (string | null)[]): PackedSegment[] {
  const raw = weekSchemes
    .map((scheme) => {
      let colStart = -1;
      let colEnd = -1;
      weekDates.forEach((d, idx) => {
        if (d && d >= scheme.startDate && d <= scheme.endDate) {
          if (colStart === -1) colStart = idx;
          colEnd = idx;
        }
      });
      return { scheme, colStart, colEnd };
    })
    .filter((seg) => seg.colStart !== -1)
    // Cột bắt đầu sớm hơn xếp trước; cùng cột bắt đầu thì khối rộng hơn xếp trước (dễ đóng gói
    // gọn hơn là để khối hẹp chiếm chỗ trước rồi khối rộng phải rớt xuống hàng mới).
    .sort((a, b) => a.colStart - b.colStart || b.colEnd - b.colStart - (a.colEnd - a.colStart));

  const rowOccupancy: { colStart: number; colEnd: number }[][] = [];
  const packed: PackedSegment[] = [];
  for (const seg of raw) {
    let rowIndex = rowOccupancy.findIndex((occupied) =>
      occupied.every((iv) => seg.colEnd < iv.colStart || seg.colStart > iv.colEnd)
    );
    if (rowIndex === -1) {
      rowIndex = rowOccupancy.length;
      rowOccupancy.push([]);
    }
    rowOccupancy[rowIndex].push({ colStart: seg.colStart, colEnd: seg.colEnd });
    packed.push({ scheme: seg.scheme, colStart: seg.colStart, colEnd: seg.colEnd, row: rowIndex });
  }
  return packed;
}

const EMPTY_DRAFT = { category: "", content: "", startDate: "", endDate: "" };

export const SchemeWeekStrip: React.FC<SchemeWeekStripProps> = ({ brandId, weekDates, schemes, canManage, onAdd, onUpdate, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ text: string; category: string; startDate: string; endDate: string }>({
    text: "",
    category: "",
    startDate: "",
    endDate: ""
  });
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [newRow, setNewRow] = useState(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);

  const weekSchemes = schemes.filter((s) => weekDates.some((d) => d && d >= s.startDate && d <= s.endDate));
  const packedSegments = buildPackedSegments(weekSchemes, weekDates);
  const rowCount = Math.max(1, ...packedSegments.map((seg) => seg.row + 1));
  const firstDate = weekDates.find((d) => d) ?? "";
  const lastDate = [...weekDates].reverse().find((d) => d) ?? "";

  if (weekSchemes.length === 0 && !canManage) return null;

  // Nhãn khoảng ngày của tuần này (vd "02/08 – 08/08") — in ngay trên nút toggle để không bị
  // nhầm strip này thuộc tuần nào khi nhiều tuần liền kề đều đóng, nhìn giống 1 dải liên tục.
  const formatDDMM = (d: string) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "");
  const weekLabel = firstDate && lastDate ? `${formatDDMM(firstDate)} – ${formatDDMM(lastDate)}` : "";

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
    <div className="col-span-7 -mt-1 mb-1.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-xl rounded-t-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 border-t-2 border-t-amber-400 dark:border-t-amber-600 text-amber-700 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
      >
        <Tag className="w-3.5 h-3.5 shrink-0" />
        <span>
          {weekSchemes.length > 0 ? `Scheme khuyến mãi (${weekSchemes.length})` : "Chưa có scheme — bấm để thêm"}
          {weekLabel && <span className="font-mono font-normal opacity-70 ml-1">· Tuần {weekLabel}</span>}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-1.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-white dark:bg-slate-900/80 p-2">
          <datalist id="scheme-categories">
            {Array.from(new Set(schemes.map((s) => s.category))).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <div
            className="grid grid-cols-7 gap-1.5"
            style={{ gridTemplateRows: `repeat(${rowCount}, minmax(2.25rem, auto))` }}
          >
            {packedSegments.map((seg) => {
              const color = schemeCategoryColor(seg.scheme.category);
              const isEditing = editingId === seg.scheme.id;
              return (
                <div
                  key={seg.scheme.id}
                  style={{ gridColumn: `${seg.colStart + 1} / ${seg.colEnd + 2}`, gridRow: seg.row + 1 }}
                  onClick={() => canManage && !isEditing && startEdit(seg.scheme)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${color.bg} ${color.border} ${
                    canManage ? "cursor-pointer hover:brightness-95 dark:hover:brightness-125 transition-[filter]" : ""
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={draft.category}
                        onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                        list="scheme-categories"
                        placeholder="Hạng mục"
                        className={`w-full bg-white/70 dark:bg-slate-900/60 rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wide ${color.text} focus:outline-none focus:ring-1 focus:ring-amber-500`}
                      />
                      <textarea
                        autoFocus
                        value={draft.text}
                        onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                        rows={2}
                        className="w-full min-w-[140px] bg-white/70 dark:bg-slate-900/60 rounded p-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-500"
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
                          className="ml-auto px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold disabled:opacity-50"
                        >
                          Lưu
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => onDelete && (onDelete(seg.scheme.id), setEditingId(null))}
                          className="p-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wide ${color.text} opacity-80`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color.dot}`} />
                        {seg.scheme.category}
                      </p>
                      <p className={`mt-0.5 font-semibold leading-snug whitespace-pre-wrap ${color.text}`}>{seg.scheme.description}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {canManage && onAdd && (
            <div className="pt-2 mt-2 border-t border-amber-100 dark:border-amber-950/40">
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
