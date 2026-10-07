import { LiveSession } from "../types";
import { dataSourceTier } from "./dataSource";

// Trạng thái HIỂN THỊ của ca theo giờ thật (audit N1, 0096). DB chỉ ghi 'Completed' khi có số liệu
// hoặc job quét chạy; giữa hai lần đó client tự suy để Bảng Vận Hành / Ca Của Tôi / Sổ Ca không
// hiện "Sắp tới" cho ca đã xong, và có "Đang live" trong khung giờ. 'Cancelled' không bao giờ đổi.
// Ca qua đêm (end <= start) kết thúc vào ngày hôm sau — cùng quy ước session_end_at() trong DB.
function atVn(date: string, hhmm: string, plusDays = 0): number {
  const d = new Date(`${date}T${hhmm.slice(0, 5)}:00+07:00`);
  return d.getTime() + plusDays * 86400000;
}

export function sessionWindowMs(s: Pick<LiveSession, "date" | "startTime" | "endTime">): [number, number] {
  const start = atVn(s.date, s.startTime);
  let end = atVn(s.date, s.endTime);
  if (end <= start) end += 86400000;
  return [start, end];
}

export function effectiveStatus(s: LiveSession, nowMs: number): LiveSession["status"] {
  if (s.status === "Cancelled" || s.status === "Completed") return s.status;
  const [start, end] = sessionWindowMs(s);
  if (nowMs >= end) return "Completed";
  if (nowMs >= start) return "Live Now";
  return "Upcoming";
}

// Trả về ĐÚNG mảng đầu vào khi không ca nào đổi trạng thái — không phải tiết kiệm vài phép map,
// mà để giữ IDENTITY của mảng.
//
// App.tsx tick `nowMs` mỗi 60 giây để "Đang live"/"Đã xong" tự đổi khi mở lâu. Bản cũ luôn
// `.map()` ra mảng mới, nên mỗi phút `sessions` lại là một tham chiếu khác — kéo theo ~33 useMemo
// trong các component con (đều có `sessions` trong mảng dependency) invalidate và tính lại toàn
// bộ, dù 59/60 lần tick chẳng có gì đổi. Giữ identity là cắt đứt đúng dây chuyền đó ngay gốc.
export function withEffectiveStatus(sessions: LiveSession[], nowMs: number): LiveSession[] {
  let changed = false;
  const next = sessions.map((s) => {
    const st = effectiveStatus(s, nowMs);
    if (st === s.status) return s;
    changed = true;
    return { ...s, status: st };
  });
  return changed ? next : sessions;
}

/**
 * Ca đã có số liệu ở DB — CÙNG vế `v_has_data` của `update_session_with_children` (0133): DB không cho dời
 * ngày/giờ của ca này (ranh giới snapshot + đối soát tính theo giờ ca), form Sửa ca khoá sẵn ô ngày/giờ.
 */
export function hasSessionData(s: Pick<LiveSession, "dataSource" | "actualGmv" | "totalViews">): boolean {
  return dataSourceTier(s) !== "manual" || (s.actualGmv ?? 0) > 0 || (s.totalViews ?? 0) > 0;
}

/**
 * Có bằng chứng ca đã THẬT SỰ diễn ra: có số, có report của host, có giờ live thật, hoặc nạp bù từ file.
 * Ca quá giờ tự sang "Completed" (0096) dù có ai live hay không — thiếu bằng chứng thì chưa được coi là đã
 * giao giờ cho brand (Cam kết hợp đồng) hay đã làm công (P&L): đó là ca "chờ xác nhận" — ops up số/nhập
 * report nếu ca có diễn ra, hoặc huỷ ca nếu không.
 */
export function hasLiveEvidence(s: LiveSession): boolean {
  return hasSessionData(s) || !!s.report || (s.liveDurationMinutes ?? 0) > 0 || !!s.isBackfill;
}

/**
 * Ca đã qua giờ (Completed), chưa huỷ, chưa có bằng chứng diễn ra — xem `hasLiveEvidence`. Role brand ở tháng
 * chưa phát hành bị view che số (`monthPublished === false`) nên không phân biệt được — không bao giờ coi là
 * "chờ xác nhận" ở phía đó.
 */
export function isUnconfirmedPast(s: LiveSession): boolean {
  return s.status === "Completed" && s.monthPublished !== false && !hasLiveEvidence(s);
}

// Vào live TRỄ so với giờ kế hoạch — chỉ nói điều số liệu đủ chắc để nói. `actual_start_at` = giờ bắt đầu SỚM NHẤT của
// các room trong file số liệu (0078), KHÔNG phải "giờ ca này bắt đầu": ca nối tiếp trong một room đã live từ ca trước sẽ
// có giờ vào SỚM hơn kế hoạch hàng giờ. Vì vậy chỉ báo khi vào MUỘN (≥ LATE_START_MIN); vào sớm/đúng giờ thì im lặng,
// và muộn quá LATE_START_MAX_MIN thì nhiều khả năng là room khác chứ không phải host trễ. Ca nạp bù: giờ thật chính là
// giờ kế hoạch (sinh từ room) nên không có gì để so. Dữ liệu chỉ có SAU khi file số liệu được up — ca đang live thường chưa có.
export const LATE_START_MIN = 10;
export const LATE_START_MAX_MIN = 180;

export interface LateStartInfo {
  minutes: number;
  /** HH:MM giờ VN. */
  plannedStart: string;
  actualStart: string;
  actualEnd?: string;
}

const vnClock = (ms: number) => new Date(ms + 7 * 3600000).toISOString().slice(11, 16);

export function lateStartInfo(s: Pick<LiveSession, "date" | "startTime" | "endTime" | "status" | "isBackfill" | "actualStartAt" | "actualEndAt">): LateStartInfo | null {
  if (!s.actualStartAt || s.isBackfill || s.status === "Cancelled") return null;
  const actual = Date.parse(s.actualStartAt);
  if (!Number.isFinite(actual)) return null;
  const [planned] = sessionWindowMs(s);
  const minutes = Math.round((actual - planned) / 60000);
  if (minutes < LATE_START_MIN || minutes > LATE_START_MAX_MIN) return null;
  const end = s.actualEndAt ? Date.parse(s.actualEndAt) : NaN;
  return { minutes, plannedStart: vnClock(planned), actualStart: vnClock(actual), actualEnd: Number.isFinite(end) ? vnClock(end) : undefined };
}

/** Nhãn ngắn cho huy hiệu trên thẻ: "+12p", "+1h05". */
export function lateStartLabel(minutes: number): string {
  return minutes < 60 ? `+${minutes}p` : `+${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}
