import type { CampDayBucket } from "../campaignDays";
import type { PersonLoad } from "./channelHealth";
import type { ChannelRoom, MonthBridge, PlannedSession } from "./controlRoom";
import type { HostSuggestion } from "./hostSuggestion";

// Bản tóm tắt số liệu gửi kèm câu hỏi ở "Hỏi số liệu" (Phòng Điều Hành 11/10/2026; từ 24/10 là Bảng Vận Hành · Cả tháng). Thuần — chỉ định dạng lại ĐÚNG các số màn
// đang hiện (một nguồn số), không tính gì mới. Không có tiền lương, rate, SĐT. Mỗi kênh brand × sàn đứng riêng.

const BUCKET: Record<CampDayBucket, string> = { daily: "ngày thường", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };
const m = (v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1e9) return `${s}${(a / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}B`;
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}K`;
  return `${s}${Math.round(a)}`;
};
const p = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
const d = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export interface AskChannel {
  name: string;
  room: ChannelRoom | null;
  /** Host đã live cho kênh, theo thứ tự gợi ý của cửa sổ chốt ca (suggestHosts, 90 ngày, cùng sàn). */
  hosts: HostSuggestion[];
  bridge: MonthBridge | null;
  /** Lịch sử theo tháng (ca có số): tháng, số ca, giờ, GMV. */
  history: { month: string; sessions: number; hours: number; gmv: number }[];
}

export function buildAskContext(x: { today: string; month: string; channels: AskChannel[]; people: PersonLoad[]; plan: PlannedSession[]; channelNameOf: (key: string) => string }): string {
  const L: string[] = [];
  L.push(`Hôm nay ${d(x.today)}/${x.today.slice(0, 4)}. Tháng đang xem ${x.month.slice(5, 7)}/${x.month.slice(0, 4)}. Ca hôm nay chưa chắc đã có số.`);
  L.push("");
  L.push("## KÊNH (brand × sàn) — tháng này");
  L.push("kênh | target | đã có | dự kiến cuối tháng | dải 80% | khả năng đạt hiện tại | khả năng lúc đầu tháng | mức target 50/50 lúc đầu tháng | mức 80% chắc | ca đã live đạt so kỳ vọng");
  for (const c of x.channels) {
    const r = c.room;
    if (!r) {
      L.push(`${c.name} | chưa đủ lịch sử để chiếu (dưới 15 ca có số)`);
      continue;
    }
    L.push(`${c.name} | ${m(r.target)} | ${m(r.now.actual)} | ${m(r.now.projected)} | ${m(r.now.lo)}–${m(r.now.hi)} | ${p(r.now.pHit)} | ${p(r.start.pHit)} | ${m(r.start.p50)} | ${m(r.start.p80)} | ${p(r.ratio)}`);
  }
  L.push("");
  L.push("## ĐƯỜNG KHẢ NĂNG ĐẠT THEO NGÀY (ngày: xác suất)");
  for (const c of x.channels) if (c.room?.target) L.push(`${c.name}: ${c.room.curve.map((pt, i) => `${i === 0 ? "đầu tháng" : d(pt.asOf)} ${p(pt.pHit)}`).join(", ")}`);
  L.push("");
  L.push("## CA THÁNG NÀY ĐÃ CÓ SỐ (kênh | ngày | giờ | loại ngày | host | trợ live | GMV | GMV kỳ vọng | điểm xác suất ca này làm thay đổi)");
  for (const c of x.channels) {
    const r = c.room;
    if (!r) continue;
    const sw = new Map(r.swings.map((s) => [s.id, s]));
    for (const s of r.sessions) {
      if (s.actual == null) continue;
      const w = sw.get(s.id);
      L.push(`${c.name} | ${d(s.date)} | ${s.startTime}–${s.endTime} | ${BUCKET[s.bucket]} | ${s.hostName || "chưa gán"} | ${s.coHostName || "—"} | ${m(s.actual)} | ${m(w?.expectedNow ?? s.expected)} | ${w?.deltaP == null ? "—" : `${(w.deltaP * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm`}`);
    }
  }
  L.push("");
  L.push("## CA SẮP TỚI TRÊN LỊCH (kênh | ngày | giờ | loại ngày | host | trợ | GMV kỳ vọng)");
  for (const c of x.channels) {
    const r = c.room;
    if (!r) continue;
    for (const s of r.sessions) if (s.actual == null) L.push(`${c.name} | ${d(s.date)} | ${s.startTime}–${s.endTime} | ${BUCKET[s.bucket]} | ${s.hostName || "chưa gán"} | ${s.coHostName || "—"} | ${m(r.expectedNowById.get(s.id) ?? s.expected * r.levelFactor)}`);
  }
  L.push("");
  L.push("## HOST THEO THỨ TỰ GỢI Ý LÚC CHỐT CA (90 ngày, cùng kênh; GMV/giờ chưa trừ khung giờ — chênh giữa host phần lớn do được xếp ca nào) — kênh | host | số ca | GMV/giờ");
  for (const c of x.channels) for (const h of c.hosts) L.push(`${c.name} | ${h.name} | ${h.brandSessions} | ${m(h.brandGmvPerHour)}`);
  L.push("");
  L.push("## CẦU GMV THÁNG TRƯỚC SO THÁNG TRƯỚC NỮA — kênh | tháng | GMV đầu | do giờ | do cơ cấu ca (camp, khung giờ, độ dài) | do năng suất nền (thị trường + đội) | GMV cuối | giờ");
  for (const c of x.channels) {
    const b = c.bridge;
    if (b) L.push(`${c.name} | ${b.monthA.slice(5)}→${b.monthB.slice(5)} | ${m(b.gmvA)} | ${m(b.hours)} | ${m(b.mix)} | ${m(b.level)} | ${m(b.gmvB)} | ${Math.round(b.hoursA)}h→${Math.round(b.hoursB)}h`);
  }
  L.push("");
  L.push("## LỊCH SỬ THEO THÁNG (ca có số) — kênh | tháng | số ca | giờ | GMV | GMV/giờ");
  for (const c of x.channels) for (const h of c.history) L.push(`${c.name} | ${h.month} | ${h.sessions} | ${Math.round(h.hours)} | ${m(h.gmv)} | ${m(h.hours > 0 ? h.gmv / h.hours : null)}`);
  L.push("");
  L.push("## TẢI NGƯỜI THÁNG NÀY (cả ca sắp tới) — người | giờ host | giờ trợ | tuần nặng nhất | số ngày quá 6 giờ | kênh");
  for (const pl of x.people.slice(0, 30)) L.push(`${pl.name} | ${Math.round(pl.hostHours)} | ${Math.round(pl.assistantHours)} | ${pl.peakWeek ? `${Math.round(pl.peakWeek.hours)}h (tuần từ ${d(pl.peakWeek.start)})` : "—"} | ${pl.heavyDays} | ${pl.channels.join(", ")}`);
  if (x.plan.length) {
    L.push("");
    L.push("## SA BÀN ĐANG THỬ (ca thêm chưa tạo) — kênh | ngày | giờ | host gợi ý | trợ gợi ý | GMV kỳ vọng");
    for (const s of x.plan) L.push(`${x.channelNameOf(s.candidate.channelKey)} | ${d(s.candidate.date)} | ${s.candidate.startTime}–${s.candidate.endTime} | ${s.host.name} | ${s.assistant.name} | ${m(s.candidate.expected)}`);
  }
  return L.join("\n");
}
