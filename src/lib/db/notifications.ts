import { supabase } from "../supabaseClient";
import { AppNotification, AppNotificationKind } from "../../types";

// Thông báo trong app (migration 0083). Bảng chỉ mở SELECT cho chính chủ; ghi là trigger trên
// live_sessions, đánh dấu đọc qua RPC. Không có hàm "tạo thông báo" ở đây là CỐ Ý — thêm vào là
// mở lại đúng cái bẫy "mỗi đường ghi mới phải nhớ gọi", mà trigger sinh ra để đóng.

interface DbNotification {
  id: string;
  kind: AppNotificationKind;
  title: string;
  body: string;
  session_id: string | null;
  brand_id: string | null;
  read_at: string | null;
  created_at: string;
}

function fromDb(r: DbNotification): AppNotification {
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    sessionId: r.session_id ?? undefined,
    brandId: r.brand_id ?? undefined,
    readAt: r.read_at ?? undefined,
    createdAt: r.created_at
  };
}

// Chuông chỉ cần một trang gần nhất — RLS đã lọc theo auth.uid(), không cần truyền user.
export async function fetchMyNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, kind, title, body, session_id, brand_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as DbNotification[]).map(fromDb);
}

// ids = undefined → đánh dấu tất cả. Trả về số dòng thật sự đổi.
export async function markNotificationsRead(ids?: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", { p_ids: ids ?? null });
  if (error) throw error;
  return (data as number) ?? 0;
}

// Đ7 (0116): talent báo không đi được ca ĐÃ CHỐT. Ngoại lệ có chủ ý so với ghi chú ở đầu file —
// đây không phải "tạo thông báo cho một lần ghi dữ liệu" (không cột nào đổi: talent KHÔNG được tự
// đổi lịch, việc thay người vẫn của ops), mà là một lời nhắn không có sự kiện DB nào để trigger
// bám vào. Guard "chỉ Host/Trợ của chính ca đó" nằm ở DB.
export async function requestShiftDropout(sessionId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("request_shift_dropout", { p_session_id: sessionId, p_reason: reason });
  if (error) throw error;
}
