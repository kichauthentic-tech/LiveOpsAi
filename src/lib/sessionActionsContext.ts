import { createContext } from "react";
import type { LiveSession, StaffSegment } from "../types";

// Hành động trên MỘT ca mà cửa sổ ca (SessionWindow) cần nhưng không đi qua 4 màn trung gian (Sổ Ca, Bảng Vận Hành,
// Lịch, Đăng Ký & Chốt Lịch). App cấp giá trị; SessionWindow đọc. Vắng giá trị = màn đó không cho sửa.
export interface SessionActions {
  /** Thay toàn bộ đoạn giờ người của ca (migration 0138); mảng rỗng = host/trợ làm cả ca. Trả true khi đã lưu. */
  setStaffSegments?: (session: LiveSession, segments: Pick<StaffSegment, "talentId" | "role" | "fromMin" | "toMin">[], reason: string) => Promise<boolean>;
}

export const SessionActionsContext = createContext<SessionActions>({});
