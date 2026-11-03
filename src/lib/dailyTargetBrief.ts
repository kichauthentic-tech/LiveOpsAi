// Bản tin target ngày: một trang cho team live biết hôm nay mỗi phiên cần đạt bao nhiêu và cả tháng đang ở đâu.
// Chỉ đọc `sessions` đã lọc ca loại khỏi báo cáo (activeSessions) — không tự lọc lại. Target cộng qua `planTargetOf`
// (ca tăng cường không thuộc target tháng). Hai sàn KHÔNG cộng chung: mỗi kênh = brand × sàn một khối riêng.
import type { LiveSession } from "../types";
import { planTargetOf } from "./performance/targetAllocation";
import { fmtVndShort } from "./format";
import { salesTerm } from "./metricGlossary";

export interface BriefChannel {
  key: string;
  brandName: string;
  platform: LiveSession["platform"];
  sessions: LiveSession[];
  dayTarget: number;
  /** Target cả tháng của kênh (cộng các ca trong tháng, không tính ca huỷ). */
  monthTarget: number;
  /** Số đã ghi nhận từ đầu tháng tới hết ngày hôm trước. */
  monthActual: number;
  /** Target các ca còn lại từ ngày này trở đi — để so với phần còn thiếu. */
  remainingPlanned: number;
  remainingDays: number;
}

export interface DailyTargetBrief {
  date: string;
  channels: BriefChannel[];
  totalSessions: number;
  /** Tổng target ngày theo sàn — không cộng TikTok với Shopee. */
  dayTargetByPlatform: Record<LiveSession["platform"], number>;
}

const live = (s: LiveSession) => s.status !== "Cancelled";

export function buildDailyTargetBrief(sessions: LiveSession[], date: string): DailyTargetBrief {
  const month = date.slice(0, 7);
  const map = new Map<string, BriefChannel>();
  const dayTargetByPlatform = { TikTok: 0, Shopee: 0 } as DailyTargetBrief["dayTargetByPlatform"];
  const daysInMonth = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0).getDate();
  const remainingDays = daysInMonth - Number(date.slice(8, 10)) + 1;
  let totalSessions = 0;

  for (const s of sessions) {
    if (!live(s) || s.date.slice(0, 7) !== month) continue;
    const key = `${s.brandName}|${s.platform}`;
    let ch = map.get(key);
    if (!ch) {
      ch = { key, brandName: s.brandName, platform: s.platform, sessions: [], dayTarget: 0, monthTarget: 0, monthActual: 0, remainingPlanned: 0, remainingDays };
      map.set(key, ch);
    }
    const t = planTargetOf(s);
    ch.monthTarget += t;
    if (s.date < date) ch.monthActual += s.actualGmv || 0;
    else ch.remainingPlanned += t;
    if (s.date === date) {
      ch.sessions.push(s);
      ch.dayTarget += t;
      dayTargetByPlatform[s.platform] += t;
      totalSessions++;
    }
  }
  const channels = [...map.values()]
    .filter((c) => c.sessions.length > 0)
    .map((c) => ({ ...c, sessions: [...c.sessions].sort((a, b) => a.startTime.localeCompare(b.startTime)) }))
    .sort((a, b) => a.brandName.localeCompare(b.brandName, "vi") || a.platform.localeCompare(b.platform));
  return { date, channels, totalSessions, dayTargetByPlatform };
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Tin chép vào nhóm Zalo của team live. Chỉ target + người + tiến độ; không dự báo, không nhãn rủi ro. */
export function briefToText(b: DailyTargetBrief): string {
  if (b.totalSessions === 0) return `Bản tin target ${dm(b.date)}: hôm nay không có phiên live.`;
  const lines: string[] = [`BẢN TIN TARGET ${dm(b.date)} · ${b.totalSessions} phiên`];
  for (const c of b.channels) {
    const gmv = salesTerm(c.platform);
    lines.push("", `${c.brandName} · ${c.platform} — target ngày ${fmtVndShort(c.dayTarget)}`);
    for (const s of c.sessions) {
      const who = [s.hostName || "chưa gán host", s.coHostName ? `trợ ${s.coHostName}` : ""].filter(Boolean).join(" + ");
      lines.push(`• ${s.startTime}–${s.endTime} ${who}: ${planTargetOf(s) > 0 ? fmtVndShort(planTargetOf(s)) : "chưa có target"}`);
    }
    if (c.monthTarget > 0) {
      const gap = Math.max(0, c.monthTarget - c.monthActual);
      lines.push(`Tháng: ${gmv} ${fmtVndShort(c.monthActual)} / ${fmtVndShort(c.monthTarget)} (còn thiếu ${fmtVndShort(gap)}, ${c.remainingDays} ngày)`);
    }
  }
  const t = b.dayTargetByPlatform;
  lines.push("", `Tổng target ngày: TikTok ${fmtVndShort(t.TikTok)} · Shopee ${fmtVndShort(t.Shopee)}`);
  return lines.join("\n");
}
