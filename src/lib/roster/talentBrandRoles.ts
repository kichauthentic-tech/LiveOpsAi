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
