import React, { useState } from "react";
import type { Brand, BrandChannel, BrandStudio, Studio } from "../types";
import { findBrandStudioId } from "../lib/db/brandStudios";

// Khối CRM của kênh Website (sàn chỉ lịch, 20/11): không hợp đồng, không giá brand, không target, không file số liệu — chỉ có
// tên website (để nhận ra kênh), phòng live mặc định (ca Website mặc định vào phòng này) và tạm dừng. Tiền công host/trợ lấy từ
// rate theo giờ của từng người ở Talent Pool như mọi ca, nên không có ô giá ở đây.
const inputCls = "w-full bg-[var(--surface-elevated)] text-[var(--text)] text-xs px-2 py-1.5 rounded-lg border border-[var(--border)] disabled:opacity-60";

export const WebsiteChannelPanel: React.FC<{
  brand: Brand;
  channel?: BrandChannel;
  studios: Studio[];
  brandStudios: BrandStudio[];
  canEdit: boolean;
  onUpdateChannel?: (id: string, patch: Partial<Pick<BrandChannel, "shopName" | "shopRef" | "status">>) => Promise<unknown>;
  onSetBrandStudio: (brandId: string, platform: "Website", studioId: string) => Promise<boolean>;
}> = ({ brand, channel, studios, brandStudios, canEdit, onUpdateChannel, onSetBrandStudio }) => {
  const real = !!channel && !channel.id.startsWith("derived:");
  const [name, setName] = useState(channel?.shopName ?? "");
  const studioId = findBrandStudioId(brandStudios, brand.id, "Website");
  const dirty = real && name.trim() !== channel!.shopName;
  return (
    <div className="space-y-3">
      <p className="text-2xs text-[var(--text-muted)]">
        Kênh Website chỉ dùng để xếp lịch và tính công: không có hợp đồng, giá brand, target hay report. Tiền host/trợ tính theo rate theo giờ của từng người.
      </p>
      <div className="bg-[var(--surface-base)]/60 border border-[var(--border)] rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div className="text-xs font-black text-[var(--text)] w-full sm:w-auto sm:self-center">
          Kênh Website
          {real && channel!.status === "paused" && <span className="ml-1.5 text-2xs font-bold text-amber-300">tạm dừng</span>}
        </div>
        <label className="flex-1 min-w-[10rem] text-2xs text-[var(--text-muted)] space-y-1">
          <span className="block">Tên / địa chỉ website</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || !real} placeholder="vd. crocs.com.vn" className={inputCls} />
        </label>
        {canEdit && real && onUpdateChannel && (
          <div className="flex gap-2">
            <button
              disabled={!dirty}
              onClick={() => void onUpdateChannel(channel!.id, { shopName: name.trim() })}
              className="min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--accent)] text-[var(--accent-fg,#fff)] disabled:opacity-40"
            >
              Lưu
            </button>
            <button
              onClick={() => void onUpdateChannel(channel!.id, { status: channel!.status === "paused" ? "active" : "paused" })}
              className="min-h-6 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              title={channel!.status === "paused" ? "Kênh chạy lại: hiện ở mọi màn lập lịch" : "Tạm dừng: không xếp ca mới cho kênh này"}
            >
              {channel!.status === "paused" ? "Chạy lại" : "Tạm dừng"}
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-black text-[var(--text)]">Phòng live mặc định</span>
        <select
          value={studioId}
          disabled={!canEdit}
          aria-label="Phòng live mặc định Website"
          onChange={(e) => void onSetBrandStudio(brand.id, "Website", e.target.value)}
          className={`${inputCls} sm:max-w-xs ${studioId ? "" : "border-amber-700"}`}
        >
          <option value="">— Chưa chọn phòng —</option>
          {studios.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.roomNumber})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
