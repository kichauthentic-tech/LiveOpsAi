import type { Brand, LiveSession } from "../../types";
import type { CampDayBucket } from "../../lib/campaignDays";
import type { ChannelRoom, HostSkillRow, MonthBridge } from "../../lib/performance/controlRoom";
import type { ReportPlatform } from "../../lib/reportPlatform";

/** Một kênh brand × sàn của Phòng Điều Hành — tính một lần ở ControlRoom rồi truyền xuống các khối. */
export interface RoomChannel {
  key: string;
  brand: Brand;
  platform: ReportPlatform;
  name: string;
  /** Ca của kênh (mọi tháng) — đã bỏ ca loại khỏi báo cáo (App.activeSessions). */
  sessions: LiveSession[];
  bucketOf: (date: string) => CampDayBucket;
  /** null = kênh chưa đủ lịch sử để engine v3 chiếu (dưới 15 ca có số). */
  room: ChannelRoom | null;
  target: number | null;
  /** Phòng mặc định (CRM). Rỗng = chưa gán. */
  studioId: string;
  hosts: HostSkillRow[];
  bridge: MonthBridge | null;
}

export const STATE_OF = (p: number | null): { label: string; cls: string } => {
  if (p == null) return { label: "Chưa có target", cls: "text-[var(--text-faint)] bg-[var(--surface-muted)]" };
  if (p >= 0.8) return { label: "Gần như chắc", cls: "text-emerald-400 bg-emerald-500/10" };
  if (p >= 0.2) return { label: "Đang giằng co", cls: "text-sky-400 bg-sky-500/10" };
  if (p >= 0.05) return { label: "Khó đạt", cls: "text-amber-400 bg-amber-500/10" };
  return { label: "Đã ngã ngũ", cls: "text-rose-400 bg-rose-500/10" };
};

/** Màu ô ca theo GMV thật ÷ kỳ vọng (thang phân kỳ đỏ — xám — xanh). */
export const RATIO_COLOR = (r: number): string =>
  r < 0.7 ? "#e5484d" : r < 0.9 ? "#f19b9d" : r <= 1.1 ? "#7d8796" : r <= 1.4 ? "#7fd0b0" : "#2fb57f";
