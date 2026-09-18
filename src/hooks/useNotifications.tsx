import { useCallback, useEffect, useRef, useState } from "react";
import { AppNotification } from "../types";
import { fetchMyNotifications, markNotificationsRead } from "../lib/db/notifications";

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
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      setItems([]);
      return;
    }
    void reload();
    const timer = window.setInterval(() => void reload(), POLL_MS);
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
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
