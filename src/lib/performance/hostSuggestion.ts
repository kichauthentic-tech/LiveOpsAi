import { LiveSession } from "../../types";
import { isCountable, sessionHours, weekdayOf } from "./hostPerformance";

// Đưa tín hiệu hiệu suất vào ĐÚNG lúc ops chọn người (màn Đăng Ký & Chốt Lịch), thay vì bắt ops
// nhớ số từ tab Hiệu Suất Host rồi nhảy màn hình. Cùng định nghĩa "ca đáng đếm" và "giờ" với
// hostPerformance.ts — import lại chứ không chép, để hai màn hình không bao giờ nói hai con số
// khác nhau về cùng một host.

export interface HostSuggestion {
  talentId: string;
  name: string;
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
}

// Dưới 3 ca thì trung bình GMV/giờ bị 1 phiên bùng nổ (hoặc 1 phiên chết) kéo lệch hoàn toàn.
const MIN_SESSIONS_FOR_CONFIDENCE = 3;

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
  sinceDate?: string // "YYYY-MM-DD", bỏ qua ca cũ hơn mốc này
): HostSuggestion[] {
  const ids = new Set(candidateIds);
  const overall = new Map<string, Acc>();
  const byBrand = new Map<string, Acc>();
  const byWeekday = new Map<string, Acc>();

  for (const s of sessions) {
    if (!s.hostId || !ids.has(s.hostId)) continue;
    if (!isCountable(s)) continue;
    if (sinceDate && s.date < sinceDate) continue;
    overall.set(s.hostId, add(overall.get(s.hostId) ?? EMPTY, s));
    if (brandId && s.brandId === brandId) byBrand.set(s.hostId, add(byBrand.get(s.hostId) ?? EMPTY, s));
    if (weekdayOf(s.date) === weekday) byWeekday.set(s.hostId, add(byWeekday.get(s.hostId) ?? EMPTY, s));
  }

  const rows = candidateIds.map<HostSuggestion>((id) => {
    const b = byBrand.get(id) ?? EMPTY;
    const w = byWeekday.get(id) ?? EMPTY;
    const o = overall.get(id) ?? EMPTY;
    return {
      talentId: id,
      name: talentNameById.get(id) ?? id,
      brandGmvPerHour: perHour(b),
      brandSessions: b.count,
      weekdayGmvPerHour: perHour(w),
      weekdaySessions: w.count,
      overallGmvPerHour: perHour(o),
      overallSessions: o.count,
      confidence: o.count === 0 ? "none" : o.count < MIN_SESSIONS_FOR_CONFIDENCE ? "low" : "ok"
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
