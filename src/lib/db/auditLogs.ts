import { supabase } from "../supabaseClient";
import { AuditLogEntry } from "../../types";

interface DbAuditLog {
  id: string;
  performed_by: string | null;
  performed_by_name: string;
  action: string;
  details: string;
  category: AuditLogEntry["category"];
  created_at: string;
}

function fromDb(row: DbAuditLog): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    performedBy: row.performed_by_name,
    action: row.action,
    details: row.details ?? "",
    category: row.category
  };
}

export interface CreateAuditLogInput {
  performedByUserId?: string;
  performedByName: string;
  action: string;
  details: string;
  category: AuditLogEntry["category"];
}

/**
 * Trần số dòng nhật ký nạp về. Khác các bảng lớn dần khác, nhật ký KHÔNG cuộn hết trang: nó chỉ ghi
 * thêm và không bao giờ dừng, còn màn Phân Quyền render thẳng `auditLogs.map(...)` không phân trang
 * — cuộn hết là vừa tải vừa vẽ vô hạn. Chặn ở đây có chủ ý, và số dòng nạp được hiện ngay trên nhãn
 * tab để người xem biết mình đang nhìn bao nhiêu (đừng bỏ nhãn đó đi).
 *
 * Vì sao phải có: PostgREST cắt ở 1.000 dòng mà KHÔNG báo lỗi, nên không khai trần thì tới lúc nhật
 * ký vượt 1.000 màn này vẫn hiện "1000" như thể đó là toàn bộ. Khai rõ 500 thì ít nhất là cố ý.
 */
export const AUDIT_LOG_LIMIT = 500;

// Audit logs are an append-only trail — there is intentionally no update/delete here,
// unlike the 4-function CRUD pattern used for the other entities.
export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(AUDIT_LOG_LIMIT);
  if (error) throw error;
  return (data as DbAuditLog[]).map(fromDb);
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLogEntry> {
  const { data, error } = await supabase
    .from("audit_logs")
    .insert({
      performed_by: input.performedByUserId || null,
      performed_by_name: input.performedByName,
      action: input.action,
      details: input.details ?? "",
      category: input.category
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbAuditLog);
}
