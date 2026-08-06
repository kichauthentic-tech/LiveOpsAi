import React, { useMemo, useState } from "react";
import { Brand, ProductSample, Studio, UserRole } from "../types";
import { Boxes, Plus, Trash2 } from "lucide-react";

interface ProductSampleInventoryProps {
  currentRole: UserRole;
  brands: Brand[];
  studios: Studio[];
  productSamples: ProductSample[];
  onAddSample: (sample: { brandId: string; studioId?: string; productName: string; sampleCode: string; quantity: number }) => Promise<void>;
  onUpdateSample: (
    id: string,
    patch: Partial<Pick<ProductSample, "studioId" | "productName" | "sampleCode" | "quantity" | "status" | "locationNote" | "notes">>
  ) => Promise<void>;
  onDeleteSample: (id: string) => Promise<void>;
}

const STATUS_LABEL: Record<ProductSample["status"], string> = {
  in_transit: "Đang chuyển tới",
  at_studio: "Có mặt tại Studio",
  returned: "Đã trả về Brand",
  damaged: "Hư hỏng",
  lost: "Thất lạc"
};

const STATUS_COLOR: Record<ProductSample["status"], string> = {
  in_transit: "text-blue-400",
  at_studio: "text-emerald-400",
  returned: "text-slate-400",
  damaged: "text-amber-400",
  lost: "text-red-400"
};

export const ProductSampleInventory: React.FC<ProductSampleInventoryProps> = ({
  currentRole,
  brands,
  studios,
  productSamples,
  onAddSample,
  onUpdateSample,
  onDeleteSample
}) => {
  const canEdit = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const [busy, setBusy] = useState(false);
  const [filterStudio, setFilterStudio] = useState<string>("");
  const [newBrandId, setNewBrandId] = useState("");
  const [newStudioId, setNewStudioId] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [newSampleCode, setNewSampleCode] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");

  const brandName = (id: string) => brands.find((b) => b.id === id)?.name ?? "—";
  const studioName = (id?: string) => (id ? studios.find((s) => s.id === id)?.name ?? "—" : "Chưa gán Studio");

  const samples = useMemo(
    () => productSamples.filter((s) => !filterStudio || s.studioId === filterStudio),
    [productSamples, filterStudio]
  );

  const handleCreate = async () => {
    const quantity = Number(newQuantity);
    if (!newBrandId || !newProductName.trim() || !Number.isFinite(quantity) || quantity < 0) return;
    setBusy(true);
    try {
      await onAddSample({
        brandId: newBrandId,
        studioId: newStudioId || undefined,
        productName: newProductName.trim(),
        sampleCode: newSampleCode.trim(),
        quantity
      });
      setNewBrandId("");
      setNewStudioId("");
      setNewProductName("");
      setNewSampleCode("");
      setNewQuantity("1");
    } finally {
      setBusy(false);
    }
  };

  const handlePatch = async (
    id: string,
    patch: Partial<Pick<ProductSample, "studioId" | "productName" | "sampleCode" | "quantity" | "status" | "locationNote" | "notes">>
  ) => {
    setBusy(true);
    try {
      await onUpdateSample(id, patch);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Boxes className="w-5 h-5 text-blue-400" /> Product Sample Inventory
        </h2>
        <select
          value={filterStudio}
          onChange={(e) => setFilterStudio(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
        >
          <option value="">Tất cả Studio</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {canEdit && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-2">
          <select
            value={newBrandId}
            onChange={(e) => setNewBrandId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">Chọn Brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <select
            value={newStudioId}
            onChange={(e) => setNewStudioId(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="">Chưa gán Studio</option>
            {studios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Tên sản phẩm mẫu"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            className="flex-1 min-w-[140px] bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            placeholder="Mã code"
            value={newSampleCode}
            onChange={(e) => setNewSampleCode(e.target.value)}
            className="w-28 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min={0}
            placeholder="SL"
            value={newQuantity}
            onChange={(e) => setNewQuantity(e.target.value)}
            className="w-16 bg-slate-950 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newBrandId || !newProductName.trim()}
            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Thêm hàng mẫu
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-800">
                <th className="py-2.5 px-4">Sản phẩm</th>
                <th className="py-2.5 px-2">Brand</th>
                <th className="py-2.5 px-2">Studio</th>
                <th className="py-2.5 px-2 text-right">SL</th>
                <th className="py-2.5 px-2">Vị trí</th>
                <th className="py-2.5 px-2">Trạng thái</th>
                {canEdit && <th className="py-2.5 px-4"></th>}
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.id} className="border-b border-slate-800/60 align-middle">
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-200">{s.productName}</div>
                    <div className="text-slate-500 font-mono">{s.sampleCode || "—"}</div>
                  </td>
                  <td className="py-2.5 px-2 text-slate-300">{brandName(s.brandId)}</td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={s.studioId ?? ""}
                        onChange={(e) => handlePatch(s.id, { studioId: e.target.value || undefined })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        <option value="">Chưa gán Studio</option>
                        {studios.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">{studioName(s.studioId)}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-right">
                    {canEdit ? (
                      <input
                        type="number"
                        min={0}
                        defaultValue={s.quantity}
                        onBlur={(e) => handlePatch(s.id, { quantity: Number(e.target.value) })}
                        className="w-16 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold text-right"
                      />
                    ) : (
                      <span className="text-slate-300 font-bold">{s.quantity}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <input
                        type="text"
                        defaultValue={s.locationNote}
                        placeholder="Vd: Kệ A3"
                        onBlur={(e) => handlePatch(s.id, { locationNote: e.target.value })}
                        className="w-28 p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100"
                      />
                    ) : (
                      <span className="text-slate-400">{s.locationNote || "—"}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {canEdit ? (
                      <select
                        value={s.status}
                        onChange={(e) => handlePatch(s.id, { status: e.target.value as ProductSample["status"] })}
                        className="p-1.5 rounded-lg border border-slate-700 bg-slate-950 text-slate-100 font-bold"
                      >
                        {(Object.keys(STATUS_LABEL) as ProductSample["status"][]).map((s2) => (
                          <option key={s2} value={s2}>
                            {STATUS_LABEL[s2]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`font-bold ${STATUS_COLOR[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="py-2.5 px-4">
                      <button
                        onClick={() => onDeleteSample(s.id)}
                        className="text-red-400 hover:bg-red-950/40 p-1 rounded-lg"
                        title="Xoá hàng mẫu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {samples.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 7 : 6} className="py-8 text-center text-slate-500 italic">
                    Chưa có hàng mẫu nào được ghi nhận.
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
