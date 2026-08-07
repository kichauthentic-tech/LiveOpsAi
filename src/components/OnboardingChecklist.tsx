import React, { useEffect, useMemo, useState } from "react";
import { Brand, BrandOnboardingChecklistItem, OnboardingChecklistTemplateItem, UserRole } from "../types";
import { ClipboardCheck, Plus, Sparkles, Trash2 } from "lucide-react";

interface OnboardingChecklistProps {
  currentRole: UserRole;
  brands: Brand[];
  templateItems: OnboardingChecklistTemplateItem[];
  brandChecklists: BrandOnboardingChecklistItem[];
  onAddTemplateItem: (item: { title: string; description: string }) => Promise<void>;
  onUpdateTemplateItem: (id: string, patch: Partial<Pick<OnboardingChecklistTemplateItem, "title" | "description" | "isActive">>) => Promise<void>;
  onDeleteTemplateItem: (id: string) => Promise<void>;
  onInstantiateChecklist: (brandId: string) => Promise<void>;
  onAddChecklistItem: (item: { brandId: string; title: string; description: string }) => Promise<void>;
  onUpdateChecklistItem: (
    id: string,
    patch: Partial<Pick<BrandOnboardingChecklistItem, "title" | "description" | "assignee" | "deadline" | "status">>
  ) => Promise<void>;
  onDeleteChecklistItem: (id: string) => Promise<void>;
}

const STATUS_LABEL: Record<BrandOnboardingChecklistItem["status"], string> = {
  pending: "Chưa bắt đầu",
  in_progress: "Đang làm",
  completed: "Hoàn thành"
};

const STATUS_COLOR: Record<BrandOnboardingChecklistItem["status"], string> = {
  pending: "text-slate-400",
  in_progress: "text-amber-400",
  completed: "text-emerald-400"
};

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({
  currentRole,
  brands,
  templateItems,
  brandChecklists,
  onAddTemplateItem,
  onUpdateTemplateItem,
  onDeleteTemplateItem,
  onInstantiateChecklist,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem
}) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState("");
  const [newTemplateDesc, setNewTemplateDesc] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState(brands[0]?.id ?? "");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDesc, setNewItemDesc] = useState("");

  // brands fetch async ở App.tsx nên rỗng lúc component khởi tạo — chốt lại
  // selectedBrandId khi danh sách brand đã load xong (tránh kẹt ở "" trong khi
  // dropdown hiển thị nhầm brand đầu tiên).
  useEffect(() => {
    if (!selectedBrandId && brands.length > 0) setSelectedBrandId(brands[0].id);
  }, [brands, selectedBrandId]);

  const activeTemplateItems = useMemo(() => templateItems.filter((t) => t.isActive), [templateItems]);

  const brandItems = useMemo(
    () =>
      brandChecklists
        .filter((c) => c.brandId === selectedBrandId)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [brandChecklists, selectedBrandId]
  );

  const completedCount = brandItems.filter((i) => i.status === "completed").length;

  const handleAddTemplateItem = async () => {
    if (!newTemplateTitle.trim()) return;
    setBusy(true);
    try {
      await onAddTemplateItem({ title: newTemplateTitle.trim(), description: newTemplateDesc.trim() });
      setNewTemplateTitle("");
      setNewTemplateDesc("");
    } finally {
      setBusy(false);
    }
  };

  const handleInstantiate = async () => {
    if (!selectedBrandId) return;
    setBusy(true);
    try {
      await onInstantiateChecklist(selectedBrandId);
    } finally {
      setBusy(false);
    }
  };

  const handleAddItem = async () => {
    if (!selectedBrandId || !newItemTitle.trim()) return;
    setBusy(true);
    try {
      await onAddChecklistItem({ brandId: selectedBrandId, title: newItemTitle.trim(), description: newItemDesc.trim() });
      setNewItemTitle("");
      setNewItemDesc("");
    } finally {
      setBusy(false);
    }
  };

  const handlePatchItem = async (
    id: string,
    patch: Partial<Pick<BrandOnboardingChecklistItem, "title" | "description" | "assignee" | "deadline" | "status">>
  ) => {
    setBusy(true);
    try {
      await onUpdateChecklistItem(id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-blue-400" /> Onboarding Checklist theo Brand
        </h2>
        {canEdit && (
          <button
            onClick={() => setShowTemplateEditor((v) => !v)}
            className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showTemplateEditor ? "Ẩn Template chuẩn" : "Quản lý Template chuẩn"}
          </button>
        )}
      </div>

      {canEdit && showTemplateEditor && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-bold text-slate-400">
            Template chuẩn (dùng chung cho mọi brand — sửa ở đây không ảnh hưởng checklist đã khởi tạo trước đó)
          </div>
          <div className="space-y-2">
            {templateItems.map((t) => (
              <div key={t.id} className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-2">
                <input
                  type="text"
                  defaultValue={t.title}
                  onBlur={(e) => onUpdateTemplateItem(t.id, { title: e.target.value })}
                  className="flex-1 min-w-[140px] bg-transparent text-white text-xs font-bold focus:outline-none"
                />
                <input
                  type="text"
                  defaultValue={t.description}
                  placeholder="Mô tả"
                  onBlur={(e) => onUpdateTemplateItem(t.id, { description: e.target.value })}
                  className="flex-1 min-w-[160px] bg-transparent text-slate-300 text-xs focus:outline-none"
                />
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input type="checkbox" checked={t.isActive} onChange={(e) => onUpdateTemplateItem(t.id, { isActive: e.target.checked })} />
                  Active
                </label>
                <button onClick={() => onDeleteTemplateItem(t.id)} className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {templateItems.length === 0 && <div className="text-xs text-slate-500 italic py-2">Chưa có bước nào trong template chuẩn.</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800">
            <input
              type="text"
              placeholder="Tiêu đề bước mới"
              value={newTemplateTitle}
              onChange={(e) => setNewTemplateTitle(e.target.value)}
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Mô tả"
              value={newTemplateDesc}
              onChange={(e) => setNewTemplateDesc(e.target.value)}
              className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleAddTemplateItem}
              disabled={busy || !newTemplateTitle.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm bước
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={selectedBrandId}
          onChange={(e) => setSelectedBrandId(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {brandItems.length > 0 && (
          <span className="text-xs text-slate-400">
            Tiến độ: <span className="font-bold text-white">{completedCount}/{brandItems.length}</span> hoàn thành
          </span>
        )}
      </div>

      {brandItems.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
          <div className="text-slate-500 text-sm italic">Brand này chưa có checklist onboarding.</div>
          {canEdit && (
            <button
              onClick={handleInstantiate}
              disabled={busy || !selectedBrandId || activeTemplateItems.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Khởi tạo checklist từ Template ({activeTemplateItems.length} bước)
            </button>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-800">
                  <th className="py-2.5 px-4">Việc cần làm</th>
                  <th className="py-2.5 px-2">PIC</th>
                  <th className="py-2.5 px-2">Deadline</th>
                  <th className="py-2.5 px-2">Trạng thái</th>
                  {canEdit && <th className="py-2.5 px-4"></th>}
                </tr>
              </thead>
              <tbody>
                {brandItems.map((item) => (
                  <tr key={item.id} className="border-b border-slate-800/60 align-middle">
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-slate-200">{item.title}</div>
                      {item.description && <div className="text-slate-500">{item.description}</div>}
                    </td>
                    <td className="py-2.5 px-2">
                      {canEdit ? (
                        <input
                          type="text"
                          defaultValue={item.assignee}
                          placeholder="Người phụ trách"
                          onBlur={(e) => handlePatchItem(item.id, { assignee: e.target.value })}
                          className="w-28 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                        />
                      ) : (
                        <span className="text-slate-300">{item.assignee || "—"}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {canEdit ? (
                        <input
                          type="date"
                          defaultValue={item.deadline ?? ""}
                          onBlur={(e) => handlePatchItem(item.id, { deadline: e.target.value })}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                        />
                      ) : (
                        <span className="text-slate-300">{item.deadline || "—"}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2">
                      {canEdit ? (
                        <select
                          value={item.status}
                          onChange={(e) => handlePatchItem(item.id, { status: e.target.value as BrandOnboardingChecklistItem["status"] })}
                          className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                        >
                          {(Object.keys(STATUS_LABEL) as BrandOnboardingChecklistItem["status"][]).map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`font-bold ${STATUS_COLOR[item.status]}`}>{STATUS_LABEL[item.status]}</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="py-2.5 px-4">
                        <button
                          onClick={() => onDeleteChecklistItem(item.id)}
                          className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg"
                          title="Xoá bước này"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 p-4 border-t border-slate-800">
              <input
                type="text"
                placeholder="Thêm việc riêng cho brand này"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                className="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <input
                type="text"
                placeholder="Mô tả"
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddItem}
                disabled={busy || !newItemTitle.trim()}
                className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm việc
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
