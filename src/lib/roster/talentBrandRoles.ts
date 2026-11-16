import type { LiveSession } from "../../types";

// Vai được xếp của talent theo từng brand (0221). Không có dòng = chưa cài ⇒ không hạn chế (cách xếp cũ).

export type TalentBrandRoleKind = "host" | "assistant" | "both";

export type TalentBrandRolePlatform = "all" | "TikTok" | "Shopee";

export interface TalentBrandRole {
  id: string;
  /** "all" = cả hai sàn (dòng từ 0221). */
  platform: TalentBrandRolePlatform;
  talentId: string;
  brandId: string;
  role: TalentBrandRoleKind;
}

export const TALENT_BRAND_ROLE_LABEL: Record<TalentBrandRoleKind, string> = {
  host: "Host",
  assistant: "Trợ live",
  both: "Cả hai"
};

/** Ca host / ca trợ của một người ở từng brand × sàn (bỏ ca huỷ) — căn cứ gợi ý cài sẵn, không tự áp. Khoá `${brandId}|${platform}`. */
export function roleHistoryByChannel(sessions: readonly LiveSession[], talentId: string): Map<string, { host: number; assist: number }> {
  const out = new Map<string, { host: number; assist: number }>();
  const bump = (key: string, k: "host" | "assist") => {
    const cur = out.get(key) ?? { host: 0, assist: 0 };
    cur[k] += 1;
    out.set(key, cur);
  };
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    const key = `${s.brandId}|${s.platform}`;
    if (s.hostId === talentId) bump(key, "host");
    if (s.assistantId === talentId || s.coHostId === talentId) bump(key, "assist");
  }
  return out;
}

/** Gợi ý vai từng kênh từ lịch sử: chỉ có ca host ⇒ host, chỉ có ca trợ ⇒ trợ, cả hai ⇒ cả hai. Kênh chưa có ca nào không gợi ý. */
export function suggestRolesFromHistory(history: ReadonlyMap<string, { host: number; assist: number }>): Map<string, TalentBrandRoleKind> {
  const out = new Map<string, TalentBrandRoleKind>();
  for (const [key, h] of history) {
    if (h.host > 0 && h.assist > 0) out.set(key, "both");
    else if (h.host > 0) out.set(key, "host");
    else if (h.assist > 0) out.set(key, "assistant");
  }
  return out;
}

/** Số ca tối thiểu để tự suy vai từ lịch sử (chỉ làm một vai suốt ≥ ngưỡng này ⇒ coi như chỉ được xếp vai đó ở kênh đó). */
export const INFER_MIN_SESSIONS = 10;

/** Vai suy ra từ lịch sử một kênh: chỉ có ca host (≥ ngưỡng) ⇒ host, chỉ có ca trợ (≥ ngưỡng) ⇒ trợ; còn lại không suy (undefined). */
export function inferKind(h: { host: number; assist: number } | undefined): TalentBrandRoleKind | undefined {
  if (!h) return undefined;
  if (h.host >= INFER_MIN_SESSIONS && h.assist === 0) return "host";
  if (h.assist >= INFER_MIN_SESSIONS && h.host === 0) return "assistant";
  return undefined;
}

/** Mọi dòng vai suy ra từ lịch sử cho cả agency (brand × sàn × người). Cài tay luôn thắng — xem `buildBrandRuleIndex`. */
export function inferRoleRows(sessions: readonly LiveSession[]): { brandId: string; platform: "TikTok" | "Shopee"; talentId: string; role: TalentBrandRoleKind }[] {
  const acc = new Map<string, { host: number; assist: number }>();
  const bump = (key: string, k: "host" | "assist") => {
    const cur = acc.get(key) ?? { host: 0, assist: 0 };
    cur[k] += 1;
    acc.set(key, cur);
  };
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    if (s.hostId) bump(`${s.brandId}|${s.platform}|${s.hostId}`, "host");
    const asst = s.assistantId || s.coHostId;
    if (asst) bump(`${s.brandId}|${s.platform}|${asst}`, "assist");
  }
  const out: { brandId: string; platform: "TikTok" | "Shopee"; talentId: string; role: TalentBrandRoleKind }[] = [];
  for (const [key, h] of acc) {
    const role = inferKind(h);
    if (!role) continue;
    const [brandId, platform, talentId] = key.split("|") as [string, "TikTok" | "Shopee", string];
    out.push({ brandId, platform, talentId, role });
  }
  return out;
}

/** Số ca tối thiểu cho nút "cài tự động cho tất cả" (ghi dòng thật, sửa được từng người): thấp hơn `INFER_MIN_SESSIONS` vì ghi ra thì thấy và sửa được. */
export const BULK_MIN_SESSIONS = 3;

/** Dòng cần ghi để cài vai cho MỌI talent từ lịch sử: chỉ kênh CHƯA có dòng cài tay (theo sàn hoặc chung), đủ ≥ BULK_MIN_SESSIONS ca ở vai đó; chỉ làm một vai ⇒ vai đó, làm cả hai ⇒ cả hai. */
export function bulkSuggestRows(
  sessions: readonly LiveSession[],
  existing: readonly TalentBrandRole[],
  valid: { talentIds: ReadonlySet<string>; brandIds: ReadonlySet<string> }
): { talentId: string; brandId: string; platform: "TikTok" | "Shopee"; role: TalentBrandRoleKind }[] {
  const acc = new Map<string, { host: number; assist: number }>();
  const bump = (key: string, k: "host" | "assist") => {
    const cur = acc.get(key) ?? { host: 0, assist: 0 };
    cur[k] += 1;
    acc.set(key, cur);
  };
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    if (s.hostId) bump(`${s.brandId}|${s.platform}|${s.hostId}`, "host");
    const asst = s.assistantId || s.coHostId;
    if (asst) bump(`${s.brandId}|${s.platform}|${asst}`, "assist");
  }
  const has = new Set(existing.map((r) => `${r.brandId}|${r.platform}|${r.talentId}`));
  const out: { talentId: string; brandId: string; platform: "TikTok" | "Shopee"; role: TalentBrandRoleKind }[] = [];
  for (const [key, h] of acc) {
    const [brandId, platform, talentId] = key.split("|") as [string, "TikTok" | "Shopee", string];
    if (!valid.talentIds.has(talentId) || !valid.brandIds.has(brandId)) continue;
    if (has.has(key) || has.has(`${brandId}|all|${talentId}`)) continue;
    if (h.host + h.assist < BULK_MIN_SESSIONS) continue;
    out.push({ talentId, brandId, platform, role: h.host > 0 && h.assist > 0 ? "both" : h.host > 0 ? "host" : "assistant" });
  }
  return out;
}
