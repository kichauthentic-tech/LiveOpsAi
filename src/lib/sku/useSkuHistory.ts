import { useEffect, useState } from "react";
import { fetchSkuHistoryInputs } from "../dataraw/monthlyProductSlice";
import { prefetchable } from "../db/prefetch";
import { errorMessage } from "../errorMessage";
import type { UserRole } from "../../types";
import { buildSkuHistory, type SkuHistory, type SkuPlatform } from "./skuHistory";

// Lịch sử hiệu suất SKU từ file Sản Phẩm đã tải (chỉ ops — RLS Dữ Liệu Gốc 0052). Dùng chung cho tab "Sản phẩm lên live" và
// "Giỏ live đề xuất"; nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
const skuHistoryRead = prefetchable("skuHistory", fetchSkuHistoryInputs);

export const canReadSkuHistory = (role?: UserRole | null) => !role || role === "ceo" || role === "admin" || role === "operations";

export function prefetchSkuHistory(brandId: string | null | undefined, role?: UserRole | null): void {
  if (brandId && canReadSkuHistory(role)) skuHistoryRead.prefetch(brandId);
}

export type SkuHistoryByPlatform = Partial<Record<SkuPlatform, SkuHistory>>;

export function useSkuHistory(brandId: string, enabled: boolean): { history: SkuHistoryByPlatform | null; error: string | null } {
  const [history, setHistory] = useState<SkuHistoryByPlatform | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    skuHistoryRead
      .take(brandId)
      .then((r) => {
        if (cancelled) return;
        const h: SkuHistoryByPlatform = {};
        if (r.tiktok.length) h.TikTok = buildSkuHistory("TikTok", r.tiktok);
        if (r.shopee.length) h.Shopee = buildSkuHistory("Shopee", r.shopee);
        setHistory(h);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(errorMessage(e, "Không tải được hiệu suất SKU"));
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, brandId]);
  return { history, error };
}
