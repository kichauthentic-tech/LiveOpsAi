import type { LiveSession, Talent } from "../../types";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { sessionDurationHours } from "../pnl";
import { addDays } from "../dateUtils";
import { plannedCost } from "../roster/candidates";

// Chi phí giờ live THÊM (06/11, user duyệt đề xuất "mỗi đề xuất bù giờ ghi kèm chi phí"): ca bổ sung / bù giờ chưa có người, nên chi phí
// = giờ × (rate host + rate trợ trung bình theo GIỜ của những người đã live chính kênh đó gần đây). Rate = rate hiện tại của hồ sơ
// (`plannedCost`, cùng luật Finance: trợ ưu tiên rate trợ, không có rate giờ thì rate/phiên). Chỉ lương host + trợ — không gồm phòng,
// Ads; không có hoa hồng GMV (user chốt 06/10). Người xem không đọc được rate (talents_secure che) ⇒ null, màn không hiện số.

export interface HourCost {
  /** Chi phí ước cho 1 giờ live (host + trợ). null = không đủ rate để ước. */
  perHour: number | null;
  hostPerHour: number | null;
  assistantPerHour: number | null;
  /** Số ca gần đây dùng để ước. */
  sessions: number;
}

export function channelHourCost(sessions: readonly LiveSession[], talents: readonly Talent[], brandId: string, platform: ReportPlatform, today: string, days = 60): HourCost {
  const byId = new Map(talents.map((t) => [t.id, t]));
  const from = addDays(today, -days);
  const recent = sessions.filter((s) => s.brandId === brandId && platformOf(s) === platform && s.status !== "Cancelled" && s.date >= from && s.date <= today);
  let hostCost = 0, hostHours = 0, coCost = 0, coHours = 0, coSessions = 0;
  for (const s of recent) {
    const h = sessionDurationHours(s.startTime, s.endTime);
    if (h <= 0) continue;
    const host = byId.get(s.hostId);
    if (host && !host.rateHidden) {
      const c = plannedCost(host, [], "host", s.date, h);
      if (!c.missing) {
        hostCost += c.amount;
        hostHours += h;
      }
    }
    if (s.coHostId) {
      coSessions++;
      const co = byId.get(s.coHostId);
      if (co && !co.rateHidden) {
        const c = plannedCost(co, [], "co_host", s.date, h);
        if (!c.missing) {
          coCost += c.amount;
          coHours += h;
        }
      }
    }
  }
  const hostPerHour = hostHours > 0 ? hostCost / hostHours : null;
  // Trợ chỉ tính theo tỷ lệ ca có trợ của kênh (kênh không xếp trợ thì không cộng).
  const coShare = recent.length > 0 ? coSessions / recent.length : 0;
  const assistantPerHour = coHours > 0 ? (coCost / coHours) * coShare : coShare === 0 ? 0 : null;
  return { perHour: hostPerHour !== null && assistantPerHour !== null ? hostPerHour + assistantPerHour : null, hostPerHour, assistantPerHour, sessions: recent.length };
}
