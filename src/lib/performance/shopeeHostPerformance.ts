import type { LiveSession } from "../../types";
import { assertOnePlatform } from "../platforms/perf";
import { expandHostPortions, hostKey, sessionHours, UNASSIGNED_HOST_KEY } from "./hostPerformance";
import { addShopeeInput, emptyShopeeCounts, shopeeInputFromSession, shopeeKeyMetrics, type ShopeeKeyCounts, type ShopeeKeyMetrics } from "../report/shopeeKeyMetrics";

// Xếp hạng host SÀN SHOPEE: cùng cách gom host (kể cả đổi host giữa ca) với byHost() của TikTok, nhưng cộng bằng
// bộ chỉ số Shopee (Viewers/ATC/ABS/Items Sold) thay vì 18 chỉ số TikTok. Ghi chú ở lib/report/shopeeKeyMetrics.ts.

export interface ShopeePerfRow extends ShopeeKeyMetrics {
  key: string;
  label: string;
  sessionCount: number;
}

export function byHostShopee(sessions: LiveSession[]): ShopeePerfRow[] {
  assertOnePlatform(sessions, "byHostShopee");
  const acc = new Map<string, { t: ShopeeKeyCounts; label: string }>();
  for (const s of expandHostPortions(sessions)) {
    const k = hostKey(s);
    const cur = acc.get(k) ?? { t: emptyShopeeCounts(), label: s.hostName || "Chưa gán host" };
    addShopeeInput(cur.t, shopeeInputFromSession(s, sessionHours(s)));
    acc.set(k, cur);
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ ...shopeeKeyMetrics(v.t), key, label: v.label, sessionCount: v.t.sessions }))
    .sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0));
}

export function splitUnassignedShopee(rows: ShopeePerfRow[]): { ranked: ShopeePerfRow[]; unassigned: ShopeePerfRow | null } {
  return { ranked: rows.filter((r) => r.key !== UNASSIGNED_HOST_KEY), unassigned: rows.find((r) => r.key === UNASSIGNED_HOST_KEY) ?? null };
}
