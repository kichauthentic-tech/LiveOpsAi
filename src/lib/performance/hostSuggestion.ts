import { LiveSession } from "../../types";
import { hostPortions, isCountable, sessionHours, weekdayOf } from "./hostPerformance";
import { personRoleMinutes, sessionMinutes } from "../staffSegments";
import { platformOf, type ReportPlatform } from "../reportPlatform";

// Đưa tín hiệu hiệu suất vào ĐÚNG lúc ops chọn người (màn Đăng Ký & Chốt Lịch), thay vì bắt ops
// nhớ số từ tab Hiệu Suất Host rồi nhảy màn hình. Cùng định nghĩa "ca đáng đếm" và "giờ" với
// hostPerformance.ts — import lại chứ không chép, để hai màn hình không bao giờ nói hai con số
// khác nhau về cùng một host.

export interface HostSuggestion {
  talentId: string;
  name: string;
  /** Sàn của ca đang chốt — mọi số GMV/giờ dưới đây chỉ tính từ ca cùng sàn này. */
  platform: ReportPlatform;
  // Với đúng BRAND của ca đang chốt.
  brandGmvPerHour: number;
  brandSessions: number;
  // Vào đúng THỨ của ca đang chốt (mọi brand) — host mạnh cuối tuần khác host mạnh ngày thường.
  weekdayGmvPerHour: number;
  weekdaySessions: number;
  // Toàn bộ, dùng khi chưa từng live cho brand này.
  overallGmvPerHour: number;
  overallSessions: number;
  // "none" = chưa có ca nào đáng đếm; "low" = có nhưng dưới ngưỡng, số chỉ để tham khảo;
  // "ok" = đủ mẫu. Hiện cảnh báo chứ KHÔNG giấu số: ops vẫn cần thấy để tự cân nhắc.
  confidence: "none" | "low" | "ok";
  // Giai đoạn D (Kế Hoạch Tháng) — lớp host × khung giờ + mệt mỏi + công bằng:
  // GMV/giờ của host trong ca CHỒNG KHUNG GIỜ với ca đang chốt (mọi brand) — host mạnh tối khác host mạnh trưa.
  blockGmvPerHour: number;
  blockSessions: number;
  // Giờ đã xếp (chốt host, chưa huỷ) trong cùng tuần T2–CN với ca đang chốt, tính cả vai trò trợ.
  weekHours: number;
  // Số ca đã xếp trong cùng tháng (host + trợ) — để chia đều, không dồn 1 người.
  monthSessions: number;
}

export interface SlotContext {
  date: string;
  startTime: string;
  endTime: string;
  /** Sàn của ca đang chốt. Số hiệu suất (GMV/giờ) chỉ tính từ ca CÙNG SÀN — user chốt 07/10: không bao giờ gộp
   *  hiệu suất TikTok với Shopee (VERA Shopee ~1,66x TikTok, gộp là host chạy Shopee tự lên đầu cho ca TikTok).
   *  Mệt mỏi / công bằng (giờ tuần, ca tháng) vẫn đếm mọi sàn: một người là một người. */
  platform: ReportPlatform;
}

// Ngưỡng cảnh báo mệt: > 24h/tuần đã xếp (≈ 8 ca 3h) — ops vẫn chọn được, chỉ được nhắc.
export const FATIGUE_WEEK_HOURS = 24;

export const mondayOf = (date: string) => {
  const d = new Date(`${date}T00:00:00`);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const rangesOverlap = (aS: string, aE: string, bS: string, bE: string) => {
  const a1 = toMin(aS), b1 = toMin(bS);
  let a2 = toMin(aE), b2 = toMin(bE);
  if (a2 <= a1) a2 += 1440;
  if (b2 <= b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
};

// Dưới 3 ca thì trung bình GMV/giờ bị 1 phiên bùng nổ (hoặc 1 phiên chết) kéo lệch hoàn toàn.
// Export để Talent Pool dùng chung đúng một ngưỡng — hai màn không được nói "đủ mẫu" ở mốc khác nhau.
export const MIN_SESSIONS_FOR_CONFIDENCE = 3;

interface Acc {
  gmv: number;
  hours: number;
  count: number;
}

const EMPTY: Acc = { gmv: 0, hours: 0, count: 0 };

function add(a: Acc, s: LiveSession): Acc {
  return { gmv: a.gmv + (s.actualGmv ?? 0), hours: a.hours + sessionHours(s), count: a.count + 1 };
}

function perHour(a: Acc): number {
  return a.hours > 0 ? a.gmv / a.hours : 0;
}

export function suggestHosts(
  candidateIds: string[],
  talentNameById: Map<string, string>,
  sessions: LiveSession[],
  brandId: string | undefined,
  weekday: number,
  sinceDate: string | undefined, // "YYYY-MM-DD", bỏ qua ca cũ hơn mốc này
  slot: SlotContext
): HostSuggestion[] {
  const ids = new Set(candidateIds);
  const overall = new Map<string, Acc>();
  const byBrand = new Map<string, Acc>();
  const byWeekday = new Map<string, Acc>();
  const byBlock = new Map<string, Acc>();
  const weekHours = new Map<string, number>();
  const monthSessions = new Map<string, number>();
  const weekStart = mondayOf(slot.date);
  const weekEnd = (() => { const d = new Date(`${weekStart}T00:00:00`); d.setDate(d.getDate() + 6); return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`; })();
  const monthKey = slot.date.slice(0, 7);

  for (const s of sessions) {
    // Mệt mỏi / công bằng: đếm cả vai trò trợ, cả ca sắp tới, trừ ca huỷ.
    if (s.status !== "Cancelled") {
      // Đổi người giữa ca (0138): chỉ tính phần giờ người đó đứng ca.
      const dur = sessionMinutes(s);
      for (const pid of new Set([s.hostId, s.coHostId, ...(s.staffSegments ?? []).map((g) => g.talentId)])) {
        if (!pid || !ids.has(pid)) continue;
        const mins = personRoleMinutes(s, pid, "host") + personRoleMinutes(s, pid, "co_host");
        if (mins <= 0) continue;
        if (s.date >= weekStart && s.date <= weekEnd) weekHours.set(pid, (weekHours.get(pid) ?? 0) + (dur > 0 ? sessionHours(s) * (mins / dur) : 0));
        if (s.date.startsWith(monthKey)) monthSessions.set(pid, (monthSessions.get(pid) ?? 0) + 1);
      }
    }
    if (!isCountable(s)) continue;
    if (sinceDate && s.date < sinceDate) continue;
    if (platformOf(s) !== slot.platform) continue;
    // Đổi host giữa ca: mỗi host một phần (số + giờ chia theo giờ đứng ca).
    for (const p of hostPortions(s)) {
      if (!p.hostId || !ids.has(p.hostId)) continue;
      overall.set(p.hostId, add(overall.get(p.hostId) ?? EMPTY, p));
      if (brandId && p.brandId === brandId) byBrand.set(p.hostId, add(byBrand.get(p.hostId) ?? EMPTY, p));
      if (weekdayOf(p.date) === weekday) byWeekday.set(p.hostId, add(byWeekday.get(p.hostId) ?? EMPTY, p));
      if (rangesOverlap(p.startTime, p.endTime, slot.startTime, slot.endTime)) byBlock.set(p.hostId, add(byBlock.get(p.hostId) ?? EMPTY, p));
    }
  }

  const rows = candidateIds.map<HostSuggestion>((id) => {
    const b = byBrand.get(id) ?? EMPTY;
    const w = byWeekday.get(id) ?? EMPTY;
    const o = overall.get(id) ?? EMPTY;
    return {
      talentId: id,
      name: talentNameById.get(id) ?? id,
      platform: slot.platform,
      brandGmvPerHour: perHour(b),
      brandSessions: b.count,
      weekdayGmvPerHour: perHour(w),
      weekdaySessions: w.count,
      overallGmvPerHour: perHour(o),
      overallSessions: o.count,
      confidence: o.count === 0 ? "none" : o.count < MIN_SESSIONS_FOR_CONFIDENCE ? "low" : "ok",
      blockGmvPerHour: perHour(byBlock.get(id) ?? EMPTY),
      blockSessions: (byBlock.get(id) ?? EMPTY).count,
      weekHours: weekHours.get(id) ?? 0,
      monthSessions: monthSessions.get(id) ?? 0
    };
  });

  // Xếp hạng: ai đã từng live cho ĐÚNG brand này lên trước (số liệu sát nhất), rồi tới số chung.
  // Người chưa có dữ liệu xuống cuối — không phải vì kém, mà vì không có căn cứ để xếp trên.
  return rows.sort((a, b) => {
    if (a.brandSessions > 0 !== b.brandSessions > 0) return a.brandSessions > 0 ? -1 : 1;
    if (a.brandSessions > 0 && b.brandSessions > 0) return b.brandGmvPerHour - a.brandGmvPerHour;
    if (a.overallSessions > 0 !== b.overallSessions > 0) return a.overallSessions > 0 ? -1 : 1;
    return b.overallGmvPerHour - a.overallGmvPerHour;
  });
}

// Con số đại diện để gắn cạnh tên trong dropdown: ưu tiên số của đúng brand, không có thì số
// chung. Trả kèm nhãn nguồn để UI nói rõ đang hiện số gì — hiện số chung mà để ops tưởng là số
// của brand này là kiểu sai nguy hiểm nhất (ops tin nhầm rồi xếp nhầm).
export function headlineFor(s: HostSuggestion): { value: number; scope: "brand" | "overall" | "none"; sessions: number } {
  if (s.brandSessions > 0) return { value: s.brandGmvPerHour, scope: "brand", sessions: s.brandSessions };
  if (s.overallSessions > 0) return { value: s.overallGmvPerHour, scope: "overall", sessions: s.overallSessions };
  return { value: 0, scope: "none", sessions: 0 };
}
