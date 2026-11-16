import type { LiveSession } from "../../types";

// Vai được xếp của talent theo từng brand (0221). Không có dòng = chưa cài ⇒ không hạn chế (cách xếp cũ).

export type TalentBrandRoleKind = "host" | "assistant" | "both";

export interface TalentBrandRole {
  id: string;
  talentId: string;
  brandId: string;
  role: TalentBrandRoleKind;
}

export const TALENT_BRAND_ROLE_LABEL: Record<TalentBrandRoleKind, string> = {
  host: "Host",
  assistant: "Trợ live",
  both: "Cả hai"
};

/** Ca host / ca trợ của một người ở từng brand (bỏ ca huỷ) — căn cứ gợi ý cài sẵn, không tự áp. */
export function roleHistoryByBrand(sessions: readonly LiveSession[], talentId: string): Map<string, { host: number; assist: number }> {
  const out = new Map<string, { host: number; assist: number }>();
  const bump = (brandId: string, k: "host" | "assist") => {
    const cur = out.get(brandId) ?? { host: 0, assist: 0 };
    cur[k] += 1;
    out.set(brandId, cur);
  };
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    if (s.hostId === talentId) bump(s.brandId, "host");
    if (s.assistantId === talentId || s.coHostId === talentId) bump(s.brandId, "assist");
  }
  return out;
}

/** Gợi ý vai từng brand từ lịch sử: chỉ có ca host ⇒ host, chỉ có ca trợ ⇒ trợ, cả hai ⇒ cả hai. Brand chưa có ca nào không gợi ý. */
export function suggestRolesFromHistory(history: ReadonlyMap<string, { host: number; assist: number }>): Map<string, TalentBrandRoleKind> {
  const out = new Map<string, TalentBrandRoleKind>();
  for (const [brandId, h] of history) {
    if (h.host > 0 && h.assist > 0) out.set(brandId, "both");
    else if (h.host > 0) out.set(brandId, "host");
    else if (h.assist > 0) out.set(brandId, "assistant");
  }
  return out;
}
