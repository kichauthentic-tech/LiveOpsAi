import { useCallback, useEffect, useRef, useState } from "react";
import { fetchShiftSwaps } from "../lib/db/shiftSwaps";
import type { ShiftSwapRequest } from "../lib/shiftSwap/swap";

// Yêu cầu nhường/đổi ca (migration 0212). Cùng cách nạp với chuông thông báo: poll 45 giây khi tab đang hiện + nạp lại
// khi quay về tab — người nhận cần thấy yêu cầu ngay khi mở app, người xếp lịch cần thấy hàng đợi mới nhất.
// Lỗi nạp (vd. DB chưa chạy 0212) chỉ làm danh sách trống, không được làm hỏng app.
const POLL_MS = 45_000;

export function useShiftSwaps(enabled: boolean) {
  const [items, setItems] = useState<ShiftSwapRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await fetchShiftSwaps();
      if (alive.current) {
        setItems(rows);
        setLoaded(true);
      }
    } catch {
      if (alive.current) setItems([]);
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) return;
    let last = 0;
    const run = () => {
      last = Date.now();
      void reload();
    };
    run();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      run();
    }, POLL_MS);
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < POLL_MS) return;
      run();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [enabled, reload]);

  // Đăng xuất / đổi vai thành không dùng được ⇒ trả rỗng ngay, không cần setState trong effect.
  return { items: enabled ? items : [], loaded: enabled && loaded, reload };
}
