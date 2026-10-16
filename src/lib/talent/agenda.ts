import type { LiveSession } from "../../types";
import { addDays, isoWeekStart } from "../dateUtils";
import { fmtDateVn } from "../format";
import { talentShortName } from "../talentName";
import { effectiveSegments } from "../staffSegments";
import { dayTimeline, isMine, loadBetween, myRole, type TimelineItem } from "./myShifts";
import type { ChannelStanding } from "./standing";

// App talent bản 2 (16/10): tab "Ca của tôi" là MỘT danh sách theo ngày — mỗi ca hiện một lần (bản 1 hiện cùng một ca ở 3 khối:
// ca kế tiếp / chờ nhận / lịch hôm nay). Đo + đề xuất: https://claude.ai/artifact/JVFAC43zih6h2AaS1anErA

/** Màn rộng (laptop / PC, ≥ 1024px = mốc `lg` của Tailwind): app talent đổi bố cục theo BỀ RỘNG cửa sổ, không theo loại máy (đoán
 *  máy qua user-agent sai với iPad, điện thoại xoay ngang, cửa sổ thu nhỏ trên laptop). Dưới mốc này dùng bố cục điện thoại. */
export const TALENT_WIDE_QUERY = "(min-width: 1024px)";
/** Lưới tuần 7 cột cần ≥ 1280px: đo 16/10 ở cửa sổ 1100px (sidebar 256px) mỗi cột còn 107px, thẻ ca chỉ còn hiện giờ. */
export const TALENT_WEEK_GRID_QUERY = "(min-width: 1280px)";

/** 7 ngày T2 → CN của tuần chứa `date`. */
export const weekDates = (date: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(isoWeekStart(date), i));

export type AgendaRangeKey = "this" | "next" | "later";
export interface AgendaRange {
  key: AgendaRangeKey;
  label: string;
  from: string;
  to: string;
}

/** Tuần này (hôm nay → CN), tuần sau (T2 → CN), sau nữa (từ T2 tuần kế tiếp trở đi). */
export function agendaRanges(today: string): AgendaRange[] {
  const monday = isoWeekStart(today);
  return [
    { key: "this", label: "Tuần này", from: today, to: addDays(monday, 6) },
    { key: "next", label: "Tuần sau", from: addDays(monday, 7), to: addDays(monday, 13) },
    { key: "later", label: "Sau nữa", from: addDays(monday, 14), to: "9999-12-31" }
  ];
}

export interface AgendaDay {
  date: string;
  items: TimelineItem[];
  hours: number;
}

/** Ca chưa huỷ của tôi trong khoảng, nhóm theo ngày, kèm khoảng nghỉ giữa hai ca cùng ngày. */
export function agendaDays(mine: LiveSession[], talentId: string, from: string, to: string): AgendaDay[] {
  const dates = [...new Set(mine.filter((s) => s.status !== "Cancelled" && s.date >= from && s.date <= to).map((s) => s.date))].sort();
  return dates.map((date) => ({ date, items: dayTimeline(mine, date), hours: loadBetween(mine, talentId, date, date).hours }));
}

/** Chấm đỏ của tab "Ca của tôi" = việc host làm được trên điện thoại: có lịch mới cần xem (1 dù bao nhiêu ca) + mỗi chỗ bị
 *  xếp trùng giờ. Bản 1 đếm từng ca chờ nhận + ca "cần giao" (giao ca do admin làm trên máy phòng live) ⇒ 26 với một host. */
export const myBadgeCount = (pendingAcks: number, clashes: number): number => (pendingAcks > 0 ? 1 : 0) + clashes;

/** Dòng hiệu suất có kết luận (trên/dưới mặt bằng) tách khỏi dòng "trong dao động" — đo 16/10: 96/105 dòng là "trong dao động",
 *  27/36 người không có dòng nào kết luận được. */
export function splitStanding(rows: ChannelStanding[]): { clear: ChannelStanding[]; unclear: ChannelStanding[] } {
  return { clear: rows.filter((r) => r.verdict !== "unclear"), unclear: rows.filter((r) => r.verdict === "unclear") };
}

/** "cao hơn mặt bằng khoảng 16%" — nói bằng chữ, không in khoảng tin cậy. */
export function standingSentence(r: Pick<ChannelStanding, "ratio" | "verdict">): string {
  const pct = Math.round(Math.abs(r.ratio - 1) * 100);
  return r.verdict === "above" ? `cao hơn mặt bằng khoảng ${pct}%` : r.verdict === "below" ? `thấp hơn mặt bằng khoảng ${pct}%` : "ngang mặt bằng";
}

// ---------- Tin Zalo lúc công bố lịch tuần ----------

const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const dayShort = (d: string) => `${WEEKDAY[new Date(`${d}T00:00:00`).getDay()]} ${fmtDateVn(d, false)}`;

type NameSource = { id: string; name: string; nickname?: string };

/** Tin dán vào nhóm Zalo: link vào thẳng "Ca của tôi" + ca của từng người trong khoảng (theo tên, ca theo giờ). Người chỉ đứng
 *  một đoạn khi đổi người giữa ca (0138) vẫn có tên. Không có số GMV/target/rate. */
export function weekScheduleMessage(sessions: LiveSession[], from: string, to: string, talents: NameSource[], link: string): string {
  const byId = new Map(talents.map((t) => [t.id, t]));
  const xs = sessions
    .filter((s) => s.status !== "Cancelled" && !s.isBackfill && s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const people = new Map<string, LiveSession[]>();
  for (const s of xs) {
    for (const id of new Set(effectiveSegments(s).map((g) => g.talentId))) {
      if (!isMine(s, id)) continue;
      people.set(id, [...(people.get(id) ?? []), s]);
    }
  }
  const name = (id: string, s: LiveSession) => talentShortName(byId.get(id), s.hostId === id ? s.hostName : s.coHostName) || "?";
  const blocks = [...people.entries()]
    .map(([id, ss]) => ({ id, label: name(id, ss[0]), ss }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"))
    .map(({ id, label, ss }) => {
      const lines = ss.map((s) => `  ${dayShort(s.date)} ${s.startTime}–${s.endTime} · ${s.brandName} ${s.platform} · ${myRole(s, id) === "host" ? "Host" : "Trợ live"}`);
      return [`${label} – ${ss.length} ca`, ...lines].join("\n");
    });
  return [
    `LỊCH LIVE ${fmtDateVn(from, false)} – ${fmtDateVn(to, false)}`,
    `Mở link xem ca của bạn và bấm "Đã xem":`,
    link,
    "",
    ...(blocks.length ? blocks.flatMap((b) => [b, ""]) : ["Chưa có ca nào trong tuần này."])
  ]
    .join("\n")
    .trimEnd();
}
