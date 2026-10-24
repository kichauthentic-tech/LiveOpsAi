import type { Brand, LiveSession } from "../../types";
import type { CampDayBucket } from "../../lib/campaignDays";
import type { ChannelRoom, MonthBridge } from "../../lib/performance/controlRoom";
import type { HostSuggestion } from "../../lib/performance/hostSuggestion";
import type { ReportPlatform } from "../../lib/reportPlatform";

/** Một kênh brand × sàn của Bảng Vận Hành · Cả tháng — tính một lần ở OpsMonthView rồi truyền xuống các khối. */
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
  /** Host đã live cho kênh (90 ngày), theo thứ tự gợi ý của cửa sổ chốt ca — chỉ cho "Hỏi số liệu". */
  hosts: HostSuggestion[];
  bridge: MonthBridge | null;
}
