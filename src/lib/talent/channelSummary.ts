import type { LiveSession } from "../../types";
import { hostPortions, isCountable, sessionHours } from "../performance/hostPerformance";
import { personRoleMinutes, sessionMinutes } from "../staffSegments";
import { platformOf, type ReportPlatform } from "../reportPlatform";

// Ô "Hiệu suất của bạn theo brand và vai" ở tab Tôi (user duyệt 09/11): mỗi dòng một brand × sàn × vai, chỉ số của CHÍNH talent,
// KHÔNG so với nhóm (user bỏ phần so sánh 09/11).
//  - Host: số ca, giờ, GMV của các ca host (phần của mình khi đổi host giữa ca — hostPortions), GMV/giờ.
//  - Trợ: chỉ số ca và giờ. GMV của ca tính cho host, cộng sang trợ là đếm đôi (cùng luật `assistSessionCount` của Talent Pool).
// Không bao giờ cộng hai sàn. Ca đếm theo `isCountable` (cùng định nghĩa "ca có số" của mọi màn hiệu suất).

export interface ChannelRoleRow {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  role: "host" | "assistant";
  sessions: number;
  hours: number;
  /** Chỉ vai host; vai trợ luôn 0 và UI không hiện. */
  gmv: number;
  gmvPerHour: number;
}

export function myChannelRoleSummary(sessions: LiveSession[], talentId: string | undefined, from: string, to: string): ChannelRoleRow[] {
  if (!talentId) return [];
  const rows = new Map<string, ChannelRoleRow>();
  const rowFor = (s: LiveSession, role: ChannelRoleRow["role"]): ChannelRoleRow => {
    const platform = platformOf(s);
    const key = `${s.brandId}|${platform}|${role}`;
    let r = rows.get(key);
    if (!r) {
      r = { brandId: s.brandId, brandName: s.brandName, platform, role, sessions: 0, hours: 0, gmv: 0, gmvPerHour: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const s of sessions) {
    if (s.date < from || s.date > to || !isCountable(s)) continue;
    for (const p of hostPortions(s)) {
      if (p.hostId !== talentId) continue;
      const r = rowFor(s, "host");
      r.sessions += 1;
      r.hours += sessionHours(p);
      r.gmv += p.actualGmv || 0;
    }
    const coMin = personRoleMinutes(s, talentId, "co_host");
    if (coMin > 0) {
      const r = rowFor(s, "assistant");
      const dur = sessionMinutes(s);
      r.sessions += 1;
      r.hours += dur > 0 ? sessionHours(s) * (coMin / dur) : 0;
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, gmvPerHour: r.role === "host" && r.hours > 0 ? r.gmv / r.hours : 0 }))
    .sort((a, b) => b.hours - a.hours);
}

/** Số brand và số sàn khác nhau trong các dòng — ô "Đang làm cho" ở hàng KPI. */
export function channelReach(rows: ChannelRoleRow[]): { brands: string[]; platforms: ReportPlatform[] } {
  const brands = [...new Set(rows.map((r) => r.brandName))];
  const platforms = [...new Set(rows.map((r) => r.platform))];
  return { brands, platforms };
}
