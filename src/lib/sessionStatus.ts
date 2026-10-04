import { LiveSession } from "../types";

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
  return (s.dataSource ?? "manual") !== "manual" || (s.actualGmv ?? 0) > 0 || (s.totalViews ?? 0) > 0;
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
