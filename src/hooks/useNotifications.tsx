import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotification } from "../types";
import { fetchMyNotifications, markNotificationsRead } from "../lib/db/notifications";
import { errorMessage } from "../lib/errorMessage";

// Poll thay vì Supabase Realtime: app chưa bật Realtime cho bảng nào, và một cái chuông đến trễ
// tối đa 45 giây là chấp nhận được với nghiệp vụ xếp ca theo ngày. Bật Realtime là thêm một cơ
// chế mới cho một nhu cầu mà setInterval đã đủ. Nạp lại thêm khi tab được focus lại — người dùng
// quay lại app sau khi rời đi là lúc họ cần thấy chuông đúng nhất.
const POLL_MS = 45_000;

export function useNotifications(enabled: boolean) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const rows = await fetchMyNotifications();
      if (alive.current) {
        setItems(rows);
        setError(null);
      }
    } catch (e) {
      // Chuông hỏng không được làm hỏng app — chỉ ghi lại, UI hiện chuông trống.
      if (alive.current) setError(errorMessage(e, "Không tải được thông báo."));
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      setItems([]);
      return;
    }
    // `last` là biến cục bộ của effect, KHÔNG phải ref: ref bị React Compiler cấm sửa ngoài effect
    // và ở đây cũng không cần sống lâu hơn một lần đăng ký listener.
    let last = 0;
    const run = () => {
      last = Date.now();
      void reload();
    };
    run();
    const timer = window.setInterval(() => {
      // Tab đang ẩn thì bỏ nhịp: trước đây vẫn gọi mỗi 45 giây dù người dùng đang ở tab khác hoặc
      // đã thu nhỏ cửa sổ — mạng và pin trả giá cho dữ liệu không ai nhìn. Trình duyệt có bóp nhịp
      // timer của tab ẩn nhưng KHÔNG dừng hẳn, nên vẫn phải tự chặn ở đây.
      if (document.visibilityState === "hidden") return;
      run();
    }, POLL_MS);
    // Quay lại thì nạp NGAY thay vì đợi tới nhịp kế tiếp (tối đa 45 giây). Cần cả hai sự kiện:
    // đổi tab trong cùng cửa sổ chỉ phát `visibilitychange` (cửa sổ không hề mất focus), còn
    // chuyển sang app khác rồi quay lại thì phát `focus`. Chặn nạp trùng bằng `last` — đo 2026-10-01
    // trong Browser pane thấy `visibilitychange` có thể dội liên tục (mỗi ~6 giây), không chặn thì
    // hoá ra poll dày hơn cả trước khi sửa.
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

  // Đánh dấu lạc quan rồi mới gọi RPC — chuông phải tắt ngay khi bấm, không đợi mạng.
  const markRead = useCallback(async (ids?: string[]) => {
    const now = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (!n.readAt && (!ids || ids.includes(n.id)) ? { ...n, readAt: now } : n))
    );
    try {
      await markNotificationsRead(ids);
    } catch {
      void reload();
    }
  }, [reload]);

  const unreadCount = items.filter((n) => !n.readAt).length;
  return { items, unreadCount, error, reload, markRead };
}
