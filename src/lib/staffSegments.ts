import type { LiveSession, StaffSegment } from "../types";
import type { DateTimeRange } from "./dateUtils";
import { addDays } from "./dateUtils";

// Đổi người GIỮA CA (migration 0138). Ca vẫn là MỘT đơn vị (một room, một GMV, một target); thứ thay đổi là "ai làm
// những phút nào". MỘT nơi định nghĩa cho mọi màn — lương (pnl), trùng lịch (conflicts), hiệu suất host,
// hiển thị — để không màn nào tự suy luận riêng.
//
// Quy ước:
//   - Vai nào có đoạn thì đoạn là nguồn sự thật cho vai đó; vai không có đoạn thì host_id / co_host_id làm CẢ CA
//     (cách tính cũ, nên ca không đổi người cho ra đúng số như trước).
//   - fromMin/toMin là phút kể từ giờ bắt đầu ca.
//   - Không có hoa hồng theo GMV (user chốt 06/10): lương = rate theo giờ x giờ của từng người.

export type StaffRole = StaffSegment["role"];

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Độ dài ca theo phút (ca qua đêm cộng 24h) — cùng luật với DB (set_session_staff_segments). */
export function sessionMinutes(s: Pick<LiveSession, "startTime" | "endTime">): number {
  let m = toMin(s.endTime) - toMin(s.startTime);
  if (m < 0) m += 24 * 60;
  return m;
}

/** Ca có đoạn giờ riêng cho vai này (hoặc cho bất kỳ vai nào nếu không truyền role). */
export function hasStaffSegments(s: Pick<LiveSession, "staffSegments">, role?: StaffRole): boolean {
  const segs = s.staffSegments;
  if (!segs || segs.length === 0) return false;
  return role ? segs.some((g) => g.role === role) : true;
}

/** Danh sách đoạn HIỆU LỰC: đoạn khai báo của vai đó, hoặc (vai không có đoạn) người host_id / co_host_id làm cả ca. */
export function effectiveSegments(s: LiveSession): StaffSegment[] {
  const dur = sessionMinutes(s);
  const out: StaffSegment[] = [];
  for (const role of ["host", "co_host"] as const) {
    const own = (s.staffSegments ?? []).filter((g) => g.role === role);
    if (own.length > 0) {
      out.push(...own);
      continue;
    }
    const id = role === "host" ? s.hostId : s.coHostId;
    if (id && dur > 0) {
      out.push({ talentId: id, talentName: (role === "host" ? s.hostName : s.coHostName) ?? "", role, fromMin: 0, toMin: dur });
    }
  }
  return out;
}

/** Đoạn hiệu lực của một vai, theo thứ tự giờ vào. */
export function segmentsOfRole(s: LiveSession, role: StaffRole): StaffSegment[] {
  return effectiveSegments(s)
    .filter((g) => g.role === role)
    .sort((a, b) => a.fromMin - b.fromMin);
}

/** Số phút một người làm một vai trong ca (cộng mọi đoạn của người đó ở vai đó). */
export function personRoleMinutes(s: LiveSession, talentId: string, role: StaffRole): number {
  return segmentsOfRole(s, role).filter((g) => g.talentId === talentId).reduce((sum, g) => sum + (g.toMin - g.fromMin), 0);
}

/** Đồng hồ HH:MM của phút thứ `min` kể từ giờ bắt đầu ca. */
export function clockAtOffset(s: Pick<LiveSession, "startTime">, min: number): string {
  const t = (toMin(s.startTime) + min) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Phút kể từ giờ bắt đầu ca của một đồng hồ HH:MM (đồng hồ nhỏ hơn giờ bắt đầu = sau nửa đêm). null nếu sai định dạng. */
export function offsetOfClock(s: Pick<LiveSession, "startTime" | "endTime">, hhmm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  let d = toMin(hhmm) - toMin(s.startTime);
  if (d < 0) d += 24 * 60;
  return d;
}

/** Khoảng đồng hồ + ngày của một đoạn — để kiểm trùng lịch bằng cùng hàm dateTimeRangesOverlap. */
export function segmentRange(s: Pick<LiveSession, "date" | "startTime">, g: Pick<StaffSegment, "fromMin" | "toMin">): DateTimeRange {
  return {
    date: addDays(s.date, Math.floor((toMin(s.startTime) + g.fromMin) / (24 * 60))),
    startTime: clockAtOffset(s, g.fromMin),
    endTime: clockAtOffset(s, g.toMin)
  };
}

/** Các khoảng thời gian một người thật sự đứng ca (host hoặc trợ). Ca không đổi người = cả ca. */
export function personWindows(s: LiveSession, talentId: string): DateTimeRange[] {
  if (!hasStaffSegments(s)) {
    return s.hostId === talentId || s.coHostId === talentId ? [s] : [];
  }
  return effectiveSegments(s)
    .filter((g) => g.talentId === talentId)
    .map((g) => segmentRange(s, g));
}

export interface StaffShare {
  talentId: string;
  name: string;
  minutes: number;
  /** Phần của người này trong tổng phút của vai (0..1). */
  share: number;
}

/** Ai làm vai này và chiếm bao nhiêu phần. Ca không đổi người: một người, share = 1. Vai trống: []. */
export function roleShares(s: LiveSession, role: StaffRole): StaffShare[] {
  const segs = segmentsOfRole(s, role);
  const by = new Map<string, StaffShare>();
  for (const g of segs) {
    const cur = by.get(g.talentId) ?? { talentId: g.talentId, name: g.talentName, minutes: 0, share: 0 };
    cur.minutes += g.toMin - g.fromMin;
    if (!cur.name && g.talentName) cur.name = g.talentName;
    by.set(g.talentId, cur);
  }
  const total = [...by.values()].reduce((sum, p) => sum + p.minutes, 0);
  return [...by.values()].map((p) => ({ ...p, share: total > 0 ? p.minutes / total : 0 })).sort((a, b) => b.minutes - a.minutes);
}

/** Kiểm đoạn trước khi gửi DB — cùng luật với RPC (DB vẫn kiểm lần nữa). Trả lời nhắc tiếng Việt hoặc null. */
export function validateSegments(s: Pick<LiveSession, "startTime" | "endTime">, segs: Pick<StaffSegment, "talentId" | "role" | "fromMin" | "toMin">[]): string | null {
  const dur = sessionMinutes(s);
  for (const g of segs) {
    if (!g.talentId) return "Có đoạn chưa chọn người.";
    if (!Number.isFinite(g.fromMin) || !Number.isFinite(g.toMin)) return "Có đoạn thiếu giờ vào/ra.";
    if (g.fromMin < 0 || g.toMin > dur) return `Giờ của đoạn phải nằm trong ca (${s.startTime}–${s.endTime}).`;
    if (g.toMin <= g.fromMin) return "Giờ ra phải sau giờ vào.";
  }
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const a = segs[i], b = segs[j];
      if (a.fromMin < b.toMin && b.fromMin < a.toMin && (a.role === b.role || a.talentId === b.talentId)) {
        return a.role === b.role
          ? "Hai người cùng một vai không được làm cùng một lúc."
          : "Một người không thể làm hai vai cùng một lúc.";
      }
    }
  }
  return null;
}

/** Dòng mô tả người đứng ca theo đoạn, vd "Host: Linh 10:00–11:30 → Thảo 11:30–13:00". Rỗng khi ca không chia đoạn. */
export function describeStaff(s: LiveSession): string[] {
  if (!hasStaffSegments(s)) return [];
  const out: string[] = [];
  for (const role of ["host", "co_host"] as const) {
    if (!hasStaffSegments(s, role)) continue;
    const parts = segmentsOfRole(s, role).map((g) => `${g.talentName || "?"} ${clockAtOffset(s, g.fromMin)}–${clockAtOffset(s, g.toMin)}`);
    out.push(`${role === "host" ? "Host" : "Trợ"}: ${parts.join(" → ")}`);
  }
  return out;
}
