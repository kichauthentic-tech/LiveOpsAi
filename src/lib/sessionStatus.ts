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

export function withEffectiveStatus(sessions: LiveSession[], nowMs: number): LiveSession[] {
  return sessions.map((s) => {
    const st = effectiveStatus(s, nowMs);
    return st === s.status ? s : { ...s, status: st };
  });
}
