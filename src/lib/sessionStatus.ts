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

// OT / off sớm theo THỜI LƯỢNG LIVE: `liveDurationMinutes` (tổng thời lượng các room đã TRỪ mốc ca trước, 0078/0153) − thời
// lượng kế hoạch. Team live luôn phải đủ duration đã đặt ⇒ vào trễ thì cuối ca tự OT, nên không có nhãn "vào trễ" riêng; con số
// quan trọng (và là số tính công) là tổng giờ live so với kế hoạch. Khác cách đo bằng giờ kết thúc thật: `actual_end_at` là giờ
// kết thúc MUỘN NHẤT của room nên ca nối cùng room bị báo OT bừa, còn thời lượng đã tách riêng từng ca. Giờ vào/ra thật
// (`actual_start_at`/`actual_end_at`, giờ của room) chỉ đưa vào tooltip để tham khảo.
// Ngưỡng 10 phút để không báo nhiễu; OT quá 3 giờ nhiều khả năng là room khác/ca chưa tách chứ không phải host kéo dài.
// Ca nạp bù: giờ thật chính là giờ kế hoạch (sinh từ room) nên không có gì để so.
export const DURATION_DEVIATION_MIN = 10;
export const OT_MAX_MIN = 180;

export interface DurationDeviationInfo {
  kind: "ot" | "early";
  /** Phút lệch (luôn dương). */
  minutes: number;
  plannedMinutes: number;
  liveMinutes: number;
  /** HH:MM giờ VN của room trong file — chỉ để tham khảo, có thể thiếu. */
  actualStart?: string;
  actualEnd?: string;
}

const vnClock = (ms: number) => new Date(ms + 7 * 3600000).toISOString().slice(11, 16);

export function durationDeviationInfo(
  s: Pick<LiveSession, "date" | "startTime" | "endTime" | "status" | "isBackfill" | "liveDurationMinutes" | "actualStartAt" | "actualEndAt">
): DurationDeviationInfo | null {
  if (s.isBackfill || s.status === "Cancelled" || !((s.liveDurationMinutes ?? 0) > 0)) return null;
  const liveMinutes = Math.round(s.liveDurationMinutes!);
  const [start, end] = sessionWindowMs(s);
  const plannedMinutes = Math.round((end - start) / 60000);
  const diff = liveMinutes - plannedMinutes;
  const kind = diff >= DURATION_DEVIATION_MIN && diff <= OT_MAX_MIN ? "ot" : -diff >= DURATION_DEVIATION_MIN ? "early" : null;
  if (!kind) return null;
  const clock = (iso?: string) => {
    const ms = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(ms) ? vnClock(ms) : undefined;
  };
  return { kind, minutes: Math.abs(diff), plannedMinutes, liveMinutes, actualStart: clock(s.actualStartAt), actualEnd: clock(s.actualEndAt) };
}

/** "25p", "1h05", "8h" — phút → nhãn ngắn (dấu +/− do nơi vẽ thêm). */
export function minutesLabel(minutes: number): string {
  return minutes < 60 ? `${minutes}p` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// % Target của ca ĐÃ XONG có số liệu = Thực đạt ÷ Target (tên chuẩn trong metricGlossary). Ngưỡng màu là mốc hiển thị, không
// phải luật nghiệp vụ: ≥100 đạt, 60–99 trung tính, <60 thấp. Mốc đỏ hạ 70 → 60 ngày 09/10 (user chốt) sau backtest chia target ca:
// ngay cả khi target đúng kỳ vọng thì ~14% ca vẫn dưới 70% (và ~12% trên 130%) chỉ vì nhiễu từng ca; mốc 60% còn ~10% ca (p10 của
// GMV/target = 0,62). Một ca đỏ KHÔNG nói host kém — đánh giá host trên nhiều ca cộng dồn.
export const PCT_TARGET_HIT = 100;
export const PCT_TARGET_LOW = 60;

export interface TargetPct {
  pct: number;
  level: "hit" | "mid" | "low";
}

export function targetPct(
  s: Pick<LiveSession, "status" | "targetGmv" | "actualGmv" | "dataSource" | "totalViews" | "isBackfill" | "excludedFromReports" | "monthPublished">
): TargetPct | null {
  if (s.status !== "Completed" || s.monthPublished === false || s.excludedFromReports) return null;
  if (!(s.targetGmv > 0) || !hasSessionData(s)) return null;
  const pct = Math.round(((s.actualGmv ?? 0) / s.targetGmv) * 100);
  return { pct, level: pct >= PCT_TARGET_HIT ? "hit" : pct >= PCT_TARGET_LOW ? "mid" : "low" };
}
