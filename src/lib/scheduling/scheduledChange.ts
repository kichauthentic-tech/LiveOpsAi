import type { LiveSession } from "../../types";
import { hasSessionData } from "../sessionStatus";
import { hasStaffSegments } from "../staffSegments";

// Gom việc trên ca (Đợt 1, 21/11 — user: "một chức năng làm ở nhiều nơi"). MỘT luật cho đổi người / dời giờ một ca đã lên lịch,
// dù bấm từ Cửa sổ ca (Bảng Vận Hành, Sổ Ca, Lịch & Studio, Lịch brand), kéo thả trên Lịch & Studio hay ô chọn người ở Điều Phối Lịch Live:
//   • Ca CHƯA diễn ra (hôm nay trở đi) ⇒ đi qua RPC của Điều Phối (roster_move_session / roster_reassign, 0176): phải ghi lý do, ghi vào
//     MỘT sổ `roster_changes` (Điều Phối → "Luật & nhật ký" đọc sổ này). Trước 21/11 sửa ở Cửa sổ ca thì lý do tuỳ chọn và chỉ vào
//     audit_logs — hai sổ cho cùng một việc.
//   • Ca ĐÃ QUA, ca chia đoạn người (0138), ca bỏ trống host ⇒ RPC không nhận (DB chặn đúng các trường hợp này) — sửa thẳng như cũ: đây
//     là ghi cho đúng thực tế sau ca, không phải đổi lịch.
// Thông báo cho host/trợ do trigger notify_session_changes (0116) gửi ở MỌI đường — không phụ thuộc đường nào.

export type ScheduleEdit = Pick<LiveSession, "date" | "startTime" | "endTime" | "studioId" | "hostId"> & { coHostId?: string };

export interface ScheduledChangePlan {
  timeChanged: boolean;
  peopleChanged: boolean;
  studioChanged: boolean;
  /** true ⇒ dùng RPC Điều Phối (lý do bắt buộc, ghi roster_changes); false ⇒ sửa thẳng (updateSession). */
  viaRoster: boolean;
  /** Vì sao không đi đường Điều Phối — để nói với người sửa (rỗng khi viaRoster). */
  directWhy: string;
}

export function planScheduledChange(base: LiveSession, next: ScheduleEdit, today: string): ScheduledChangePlan {
  const timeChanged = next.date !== base.date || next.startTime !== base.startTime || next.endTime !== base.endTime;
  const peopleChanged = (next.hostId || "") !== (base.hostId || "") || (next.coHostId || "") !== (base.coHostId || "");
  const studioChanged = (next.studioId || "") !== (base.studioId || "");
  const out = { timeChanged, peopleChanged, studioChanged };
  if (!timeChanged && !peopleChanged) return { ...out, viaRoster: false, directWhy: "" };
  const why =
    base.status === "Cancelled" ? "ca đã huỷ"
    : base.date < today ? "ca ngày đã qua — sửa cho đúng thực tế"
    : timeChanged && next.date < today ? "dời sang ngày đã qua"
    : hasStaffSegments(base) ? "ca đang chia người theo đoạn giờ"
    : peopleChanged && !next.hostId ? "bỏ trống host"
    : timeChanged && hasSessionData(base) ? "ca đã có số"
    : "";
  return { ...out, viaRoster: !why, directWhy: why };
}
