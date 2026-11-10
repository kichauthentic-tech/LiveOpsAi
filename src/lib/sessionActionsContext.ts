import { createContext } from "react";
import type { LiveSession, StaffSegment, Talent } from "../types";
import type { CreateSwapInput } from "./db/shiftSwaps";
import type { ShiftSwapRequest } from "./shiftSwap/swap";

// Hành động trên MỘT ca mà cửa sổ ca (SessionWindow) cần nhưng không đi qua 4 màn trung gian (Sổ Ca, Bảng Vận Hành,
// Lịch, Đăng Ký & Chốt Lịch). App cấp giá trị; SessionWindow đọc. Vắng giá trị = màn đó không cho sửa.
/** Nhường/đổi ca giữa talent (migration 0212): danh sách yêu cầu của tôi (ops/trainer: tất cả) + bốn thao tác. Mỗi thao tác tự báo lỗi
 *  bằng toast và trả true khi thành công; thành công thì danh sách yêu cầu (và lịch, khi duyệt) đã được nạp lại. */
export interface SwapActions {
  requests: ShiftSwapRequest[];
  talents: Talent[];
  create: (input: CreateSwapInput) => Promise<boolean>;
  respond: (id: string, accept: boolean) => Promise<boolean>;
  cancel: (id: string) => Promise<boolean>;
  decide: (id: string, approve: boolean, note: string) => Promise<boolean>;
}

export interface SessionActions {
  swap?: SwapActions;
  /** Thay toàn bộ đoạn giờ người của ca (migration 0138); mảng rỗng = host/trợ làm cả ca. Trả true khi đã lưu. */
  setStaffSegments?: (session: LiveSession, segments: Pick<StaffSegment, "talentId" | "role" | "fromMin" | "toMin">[], reason: string) => Promise<boolean>;
  /** Tháng của ca đã phát hành Report cho brand (đóng sổ, 0133) — DB chặn mọi ghi; cửa sổ ca báo và khoá nút trước khi ops bấm Lưu. */
  isMonthClosed?: (session: LiveSession) => boolean;
}

export const SessionActionsContext = createContext<SessionActions>({});
