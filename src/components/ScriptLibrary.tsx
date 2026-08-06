import React, { useMemo, useState } from "react";
import { Brand, LibraryScript, UserRole } from "../types";
import { BookOpen, Plus, Trash2, Maximize2, X, ZoomIn, ZoomOut, Pencil } from "lucide-react";

interface ScriptLibraryProps {
  currentRole: UserRole;
  brands: Brand[];
  scripts: LibraryScript[];
  onAddScript: (script: { brandId?: string; title: string; hook: string; content: string; platform: LibraryScript["platform"] }) => Promise<void>;
  onUpdateScript: (
    id: string,
    patch: Partial<Pick<LibraryScript, "title" | "hook" | "content" | "platform" | "pinnedSkuOrder" | "tags">> & { brandId?: string | null }
  ) => Promise<void>;
  onDeleteScript: (id: string) => Promise<void>;
}

export const ScriptLibrary: React.FC<ScriptLibraryProps> = ({ currentRole, brands, scripts, onAddScript, onUpdateScript, onDeleteScript }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [teleprompterId, setTeleprompterId] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState(1);

  const [newBrandId, setNewBrandId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newHook, setNewHook] = useState("");
  const [newPlatform, setNewPlatform] = useState<LibraryScript["platform"]>("TikTok");
  const [newContent, setNewContent] = useState("");

  const [editTitle, setEditTitle] = useState("");
  const [editHook, setEditHook] = useState("");
  const [editPlatform, setEditPlatform] = useState<LibraryScript["platform"]>("TikTok");
  const [editPinnedSkuOrder, setEditPinnedSkuOrder] = useState("");
  const [editContent, setEditContent] = useState("");

  const brandName = (id?: string) => (id ? brands.find((b) => b.id === id)?.name ?? "—" : "Chung (mọi Brand)");

  const teleprompterScript = useMemo(() => scripts.find((s) => s.id === teleprompterId) ?? null, [scripts, teleprompterId]);

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setBusy(true);
    try {
      await onAddScript({
        brandId: newBrandId || undefined,
        title: newTitle.trim(),
        hook: newHook.trim(),
        content: newContent,
        platform: newPlatform
      });
      setNewBrandId("");
      setNewTitle("");
      setNewHook("");
      setNewPlatform("TikTok");
      setNewContent("");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (s: LibraryScript) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditHook(s.hook);
    setEditPlatform(s.platform);
    setEditPinnedSkuOrder(s.pinnedSkuOrder);
    setEditContent(s.content);
  };

  const handleSaveEdit = async (id: string) => {
    setBusy(true);
    try {
      await onUpdateScript(id, {
        title: editTitle.trim(),
        hook: editHook.trim(),
        platform: editPlatform,
        pinnedSkuOrder: editPinnedSkuOrder.trim(),
        content: editContent
      });
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  };

  if (teleprompterScript) {
    return (
      <div className="fixed inset-0 z-50 bg-black text-white flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
          <div>
            <span className="text-purple-400 font-bold text-xs uppercase tracking-wider">
              Teleprompter · {teleprompterScript.platform}
            </span>
            <h2 className="font-black text-lg">{teleprompterScript.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontScale((f) => Math.max(0.6, f - 0.15))}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
              title="Chữ nhỏ hơn"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setFontScale((f) => Math.min(3, f + 0.15))}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700"
              title="Chữ lớn hơn"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={() => setTeleprompterId(null)} className="p-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-300" title="Đóng">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-10 py-8 space-y-6">
          {teleprompterScript.hook && (
            <p
              className="font-black text-purple-300 italic bg-purple-950/30 border border-purple-800/50 rounded-xl p-4"
              style={{ fontSize: `${1.3 * fontScale}rem`, lineHeight: 1.5 }}
            >
              🔥 {teleprompterScript.hook}
            </p>
          )}
          {teleprompterScript.pinnedSkuOrder && (
            <p className="text-emerald-400 font-bold" style={{ fontSize: `${1 * fontScale}rem` }}>
              📌 Thứ tự ghim SKU: {teleprompterScript.pinnedSkuOrder}
            </p>
          )}
          <p className="whitespace-pre-wrap text-slate-100 font-medium" style={{ fontSize: `${1.15 * fontScale}rem`, lineHeight: 1.8 }}>
            {teleprompterScript.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white flex items-center gap-2">
        <BookOpen className="w-5 h-5 text-purple-400" /> Script & Teleprompter Library
      </h2>

      {canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newBrandId}
              onChange={(e) => setNewBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="">Chung (mọi Brand)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as LibraryScript["platform"])}
              className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            >
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
            </select>
            <input
              type="text"
              placeholder="Tiêu đề kịch bản"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
            <input
              type="text"
              placeholder="Hook 3 giây đầu"
              value={newHook}
              onChange={(e) => setNewHook(e.target.value)}
              className="flex-1 min-w-[160px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
            />
          </div>
          <textarea
            placeholder="Nội dung kịch bản đầy đủ..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newTitle.trim() || !newContent.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Lưu kịch bản
          </button>
        </div>
      )}

      <div className="space-y-3">
        {scripts.map((s) => (
          <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
            {editingId === s.id ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={editPlatform}
                    onChange={(e) => setEditPlatform(e.target.value as LibraryScript["platform"])}
                    className="bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                  >
                    <option value="TikTok">TikTok</option>
                    <option value="Shopee">Shopee</option>
                  </select>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 min-w-[160px] bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                  />
                  <input
                    type="text"
                    placeholder="Thứ tự ghim SKU"
                    value={editPinnedSkuOrder}
                    onChange={(e) => setEditPinnedSkuOrder(e.target.value)}
                    className="w-40 bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Hook 3 giây đầu"
                  value={editHook}
                  onChange={(e) => setEditHook(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                />
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={5}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-1.5 text-white text-xs"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSaveEdit(s.id)}
                    disabled={busy}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
                  >
                    Lưu
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold"
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">{s.platform}</span>
                      <span>{brandName(s.brandId)}</span>
                    </div>
                    <h3 className="font-bold text-slate-100">{s.title}</h3>
                    {s.hook && <p className="text-purple-300 italic text-xs mt-0.5">🔥 {s.hook}</p>}
                    {s.pinnedSkuOrder && <p className="text-emerald-400 text-xs mt-0.5">📌 {s.pinnedSkuOrder}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setTeleprompterId(s.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-950/60 hover:bg-purple-900 text-purple-300 rounded-lg text-xs font-bold"
                      title="Mở Teleprompter"
                    >
                      <Maximize2 className="w-3.5 h-3.5" /> Teleprompter
                    </button>
                    {canEdit && (
                      <>
                        <button onClick={() => startEdit(s)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300" title="Sửa">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteScript(s.id)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-950/40"
                          title="Xoá kịch bản"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-slate-400 text-xs line-clamp-2 whitespace-pre-wrap">{s.content}</p>
              </>
            )}
          </div>
        ))}
        {scripts.length === 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl py-8 text-center text-slate-500 italic text-xs">
            Chưa có kịch bản nào trong thư viện.
          </div>
        )}
      </div>
    </div>
  );
};
