import { useCallback, useEffect, useState } from "react";
import { ackMyShifts, fetchShiftAcks, isShiftAcksBackendMissing, type ShiftAck } from "../lib/db/shiftAcks";
import { getTodayDate } from "../lib/dateUtils";
import { errorMessage } from "../lib/errorMessage";
import { useToast } from "./useToast";

// Dòng "Đã nhận lịch" của chính talent đang đăng nhập (0169) — App giữ một bản để tab Hôm nay và chấm đỏ thanh tab nói cùng số.
// `acks = null`: chưa nạp xong hoặc DB chưa chạy 0169 ⇒ màn ẩn phần "Đã nhận" (không hỏi nhận khi chưa ghi được).
// `loadedAt`: mốc giờ của lần nạp — chấm đỏ đếm theo mốc này (không gọi Date.now() lúc render).
export function useShiftAcks(enabled: boolean) {
  const { showToast } = useToast();
  const [state, setState] = useState<{ acks: ShiftAck[] | null; loadedAt: number }>({ acks: null, loadedAt: 0 });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchShiftAcks(getTodayDate())
      .then((acks) => alive && setState({ acks, loadedAt: Date.now() }))
      .catch((e) => {
        if (!isShiftAcksBackendMissing(e)) console.warn("[LiveOps] Không đọc được shift_acks:", e);
        if (alive) setState({ acks: null, loadedAt: Date.now() });
      });
    return () => {
      alive = false;
    };
  }, [enabled, nonce]);

  const ack = useCallback(
    async (sessionIds: string[]): Promise<boolean> => {
      try {
        await ackMyShifts(sessionIds);
        setNonce((n) => n + 1);
        return true;
      } catch (e) {
        showToast(`Không ghi được "Đã nhận": ${errorMessage(e)}`);
        return false;
      }
    },
    [showToast]
  );

  return { acks: state.acks, loadedAt: state.loadedAt, ack };
}
