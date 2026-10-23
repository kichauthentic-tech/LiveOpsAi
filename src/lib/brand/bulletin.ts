import type { ChannelCard } from "../performance/channelCard";
import type { ReportPlatform } from "../reportPlatform";

// Bản tin cho brand (21/10/2026, 0179) — ảnh chụp thẻ kênh lúc ops bấm "Gửi bản tin". Cổng brand đọc bản tin, KHÔNG tự tính lại từ ca
// (số tháng chưa phát hành bị che với brand ở live_sessions_secure — 0107). Luật 4 (user chốt 21/10): bản tin không có nhãn hay xác
// suất; brand thấy tới nay, nhịp so kế hoạch, dự kiến cuối tháng, giờ đã chạy so cam kết.

export interface BulletinPayload {
  v: 1;
  name: string;
  /** "YYYY-MM". */
  month: string;
  /** Ngày "số tới" (module Run-rate) — null khi tháng chưa có số. */
  asOf: string | null;
  lastShift: { date: string; startTime: string; endTime: string } | null;
  target: number | null;
  actual: number;
  targetToDate: number | null;
  /** Thực đạt ÷ target tới mốc (nhịp). */
  runRate: number | null;
  /** Dự kiến cuối tháng (engine) — null với kênh mới chưa đủ lịch sử. */
  forecast: number | null;
  hours: { delivered: number; committed: number; scheduled: number } | null;
}

export interface Bulletin {
  id: string;
  brandId: string;
  platform: ReportPlatform;
  month: string;
  asOf: string | null;
  payload: BulletinPayload;
  note: string;
  publishedAt: string;
}

export function bulletinFromCard(c: ChannelCard): BulletinPayload {
  return {
    v: 1,
    name: c.name,
    month: c.month,
    asOf: c.pace?.asOf ?? c.shownThrough,
    lastShift: c.pace?.lastShift ?? null,
    target: c.target,
    actual: Math.round(c.pace?.actual ?? c.monthActual),
    targetToDate: c.pace ? Math.round(c.pace.targetToDate) : null,
    runRate: c.pace?.runRate ?? null,
    forecast: c.forecast ? Math.round(c.forecast.p50) : null,
    hours: c.commitment
      ? { delivered: Math.round(c.commitment.deliveredHours * 10) / 10, committed: Math.round(c.commitment.committedHours * 10) / 10, scheduled: Math.round(c.commitment.scheduledHours * 10) / 10 }
      : null
  };
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const money = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}B`;
  if (a >= 1e6) return `${(v / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M`;
  return `${Math.round(v / 1e3).toLocaleString("vi-VN")}K`;
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hrs = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;

/** Tin nhắn dán Zalo cho brand — cùng số với cổng brand, không nhãn/xác suất. */
export function bulletinText(p: BulletinPayload, note: string, link?: string): string {
  const lines = [`${p.name} · tháng ${Number(p.month.slice(5))}/${p.month.slice(0, 4)}${p.asOf ? ` · số tới ${p.lastShift ? `ca ${p.lastShift.startTime}–${p.lastShift.endTime} ` : ""}${ddmm(p.lastShift?.date ?? p.asOf)}` : ""}`];
  lines.push(`• Đã đạt ${money(p.actual)}${p.target ? ` / target ${money(p.target)}` : ""}${p.runRate != null ? ` — ${pct(p.runRate)} so kế hoạch tới nay` : ""}`);
  if (p.forecast != null) lines.push(`• Dự kiến cuối tháng ~${money(p.forecast)}`);
  if (p.hours) lines.push(`• Giờ live đã chạy ${hrs(p.hours.delivered)} / cam kết ${hrs(p.hours.committed)} (còn ${hrs(p.hours.scheduled)} trong lịch)`);
  if (note.trim()) lines.push("", note.trim());
  if (link) lines.push("", `Xem chi tiết: ${link}`);
  return lines.join("\n");
}
