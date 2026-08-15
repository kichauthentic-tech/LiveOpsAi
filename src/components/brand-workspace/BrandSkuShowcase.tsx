import React, { useMemo, useState } from "react";
import { BrandSku, UserRole } from "../../types";
import { Package, Plus, Trash2, Star } from "lucide-react";

interface BrandSkuShowcaseProps {
  brandId: string;
  currentRole: UserRole;
  brandSkus: BrandSku[];
  onAddSku: (sku: { brandId: string; name: string; skuCode: string; flashPrice: number; originalPrice: number }) => Promise<void>;
  onUpdateSku: (
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) => Promise<void>;
  onDeleteSku: (id: string) => Promise<void>;
}

const STATUS_LABEL: Record<BrandSku["status"], string> = {
  active: "Đang lên sóng",
  inactive: "Tạm ẩn"
};

export const BrandSkuShowcase: React.FC<BrandSkuShowcaseProps> = ({ brandId, currentRole, brandSkus, onAddSku, onUpdateSku, onDeleteSku }) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSkuCode, setNewSkuCode] = useState("");
  const [newFlashPrice, setNewFlashPrice] = useState("");
  const [newOriginalPrice, setNewOriginalPrice] = useState("");

  const skus = useMemo(
    () =>
      brandSkus
        .filter((s) => s.brandId === brandId)
        .slice()
        .sort((a, b) => a.pinOrder - b.pinOrder || a.name.localeCompare(b.name)),
    [brandSkus, brandId]
  );

  const heroCount = useMemo(() => skus.filter((s) => s.isHero).length, [skus]);

  const handleCreate = async () => {
    const flashPrice = Number(newFlashPrice);
    const originalPrice = Number(newOriginalPrice);
    if (!newName.trim() || !Number.isFinite(flashPrice) || flashPrice < 0) return;
    setBusy(true);
    try {
      await onAddSku({
        brandId,
        name: newName.trim(),
        skuCode: newSkuCode.trim(),
        flashPrice,
        originalPrice: Number.isFinite(originalPrice) ? originalPrice : 0
      });
      setNewName("");
      setNewSkuCode("");
      setNewFlashPrice("");
      setNewOriginalPrice("");
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) => {
    setBusy(true);
    try {
      await onUpdateSku(id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <Package className="w-5 h-5 text-[var(--accent-text)]" /> SKU Showcase & Hero Product Catalog
        </h2>
        <span className="text-sm font-bold text-[var(--warning)] flex items-center gap-1">
          <Star className="w-3.5 h-3.5" /> {heroCount} Hero SKU
        </span>
      </div>

      {canEdit && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Tên SKU"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[140px] bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="text"
            placeholder="Mã SKU"
            value={newSkuCode}
            onChange={(e) => setNewSkuCode(e.target.value)}
            className="w-28 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Giá flash-deal"
            value={newFlashPrice}
            onChange={(e) => setNewFlashPrice(e.target.value)}
            className="w-32 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
          />
          <input
            type="number"
            placeholder="Giá gốc"
            value={newOriginalPrice}
            onChange={(e) => setNewOriginalPrice(e.target.value)}
            className="w-28 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] text-xs focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newName.trim() || !newFlashPrice}
            className="flex items-center gap-1 px-3 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm SKU
          </button>
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[var(--text-faint)] border-b border-[var(--border)]">
                <th className="py-2.5 px-4">Ghim</th>
                <th className="py-2.5 px-2">SKU</th>
                <th className="py-2.5 px-2 text-right">Giá flash-deal</th>
                <th className="py-2.5 px-2 text-right">Giá gốc</th>
                <th className="py-2.5 px-2 text-right">Xả kho %</th>
                <th className="py-2.5 px-2">Hero</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border-muted)] align-middle">
                  <td className="py-2.5 px-4">
                    {canEdit ? (
                      <input
                        type="number"
                        defaultValue={s.pinOrder}
                        onBlur={(e) => handlePatch(s.id, { pinOrder: Number(e.target.value) })}
                        className="w-14 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold"
                      />
                    ) : (
                      <span className="text-[var(--text-muted)] font-mono">{s.pinOrder}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    <div className="font-bold text-[var(--text-muted)]">{s.name}</div>
                    <div className="text-[var(--text-faint)] font-mono">{s.skuCode || "—"}</div>
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        defaultValue={s.flashPrice}
                        onBlur={(e) => handlePatch(s.id, { flashPrice: Number(e.target.value) })}
                        className="w-28 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold text-right"
                      />
                    ) : (
                      <span className="text-[var(--success)] font-bold">{s.flashPrice.toLocaleString("vi-VN")}đ</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        defaultValue={s.originalPrice}
                        onBlur={(e) => handlePatch(s.id, { originalPrice: Number(e.target.value) })}
                        className="w-28 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold text-right"
                      />
                    ) : (
                      <span className="text-[var(--text-muted)] line-through">{s.originalPrice.toLocaleString("vi-VN")}đ</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={s.clearanceRate}
                        onBlur={(e) => handlePatch(s.id, { clearanceRate: Number(e.target.value) })}
                        className="w-16 p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold text-right"
                      />
                    ) : (
                      <span className="text-[var(--text-muted)] font-bold">{s.clearanceRate}%</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    <button
                      onClick={() => canEdit && handlePatch(s.id, { isHero: !s.isHero })}
                      disabled={!canEdit}
                      title={canEdit ? "Đặt/bỏ Hero SKU" : undefined}
                      className={`p-1 rounded-lg ${s.isHero ? "text-[var(--warning)]" : "text-[var(--text-faint)]"} ${canEdit ? "hover:bg-[var(--surface-elevated)]" : ""}`}
                    >
                      <Star className="w-4 h-4" fill={s.isHero ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={s.status}
                        onChange={(e) => handlePatch(s.id, { status: e.target.value as BrandSku["status"] })}
                        className="p-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-base)] text-[var(--text)] font-bold"
                      >
                        {(Object.keys(STATUS_LABEL) as BrandSku["status"][]).map((s2) => (
                          <option key={s2} value={s2}>
                            {STATUS_LABEL[s2]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[var(--text-muted)] font-bold">{STATUS_LABEL[s.status]}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <button onClick={() => onDeleteSku(s.id)} className="text-[var(--danger)] hover:bg-red-950/40 p-1 rounded-lg" title="Xoá SKU">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {skus.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="py-8 text-center text-[var(--text-faint)] italic">
                    Chưa có SKU nào lên sóng.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
