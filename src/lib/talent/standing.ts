import type { LiveSession } from "../../types";
import { resolveCampBucketType } from "../campaignDays";
import { addDays } from "../dateUtils";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { hostReliability, type HostReliability } from "../report/deepAnalysis";

// Hiệu suất của CHÍNH talent ở tab "Tôi" (user chốt 11/10 phương án C): mỗi kênh brand × sàn một dòng, so với mặt bằng của
// cả nhóm ca cùng kênh — cùng phép tính `hostReliability` của Dashboard agency (GMV thực ÷ GMV kỳ vọng ở cùng tháng × loại ngày ×
// buổi, khoảng tin cậy 95%). Không có tên người khác, không xếp hạng, không cộng hai sàn.
// Loại ngày theo LỊCH CAMP CỐ ĐỊNH: role talent không đọc được Kế Hoạch Tháng (RLS 0105) nên không có khung camp tuỳ chỉnh —
// ghi rõ ở màn.

export const STANDING_DAYS = 90;

export interface ChannelStanding extends HostReliability {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  role: "host" | "assistant";
}

const bucketOf = (date: string) => resolveCampBucketType(date);

export function myChannelStanding(sessions: LiveSession[], talentId: string | undefined, today: string): ChannelStanding[] {
  if (!talentId) return [];
  const from = addDays(today, -STANDING_DAYS);
  const recent = sessions.filter((s) => s.date >= from && s.date < today);
  const channels = new Map<string, { brandId: string; brandName: string; platform: ReportPlatform; xs: LiveSession[] }>();
  for (const s of recent) {
    const platform = platformOf(s);
    const key = `${s.brandId}|${platform}`;
    const c = channels.get(key) ?? { brandId: s.brandId, brandName: s.brandName, platform, xs: [] };
    c.xs.push(s);
    channels.set(key, c);
  }
  const out: ChannelStanding[] = [];
  for (const c of channels.values()) {
    if (!c.xs.some((s) => s.hostId === talentId || s.coHostId === talentId)) continue;
    for (const role of ["host", "assistant"] as const) {
      const mine = hostReliability(c.xs, bucketOf, role).find((r) => r.key === talentId);
      if (mine) out.push({ ...mine, brandId: c.brandId, brandName: c.brandName, platform: c.platform, role });
    }
  }
  return out.sort((a, b) => b.sessions - a.sessions);
}
