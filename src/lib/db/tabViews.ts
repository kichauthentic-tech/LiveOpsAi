import { supabase } from "../supabaseClient";

// Đếm lượt mở tab (0123, audit UX 2026-09-26 P2) — số liệu để quyết gộp/bỏ mục menu thay vì đoán.
// Ghi: ai đăng nhập cũng ghi được dòng CỦA MÌNH (user/role/giờ do trigger DB điền, client không khai).
// Đọc: chỉ ceo/admin (RLS) — role khác gọi tabUsageSummary nhận mảng rỗng.

export type TabViewWorkspace = "agency" | "brand";

/**
 * Ghi 1 lượt mở tab. Không bao giờ ném lỗi, không chờ: đếm lượt mở là phụ, không được làm chậm hay
 * làm vỡ việc mở tab (VD migration 0123 chưa chạy → bảng chưa có → bỏ qua im lặng).
 */
export function logTabView(workspace: TabViewWorkspace, tab: string, brandId: string | null): void {
  void supabase
    .from("ui_tab_views")
    .insert({ workspace, tab, brand_id: brandId })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) console.debug("[tabViews] không ghi được lượt mở tab:", error.message);
    });
}

export interface TabUsageRow {
  workspace: TabViewWorkspace;
  tab: string;
  role: string;
  opens: number;
  users: number;
  firstViewed: string;
  lastViewed: string;
}

export async function fetchTabUsageSummary(days: number): Promise<TabUsageRow[]> {
  const { data, error } = await supabase.rpc("tab_usage_summary", { p_days: days });
  if (error) throw error;
  return ((data ?? []) as {
    workspace: TabViewWorkspace;
    tab: string;
    role: string;
    opens: number;
    users: number;
    first_viewed: string;
    last_viewed: string;
  }[]).map((r) => ({
    workspace: r.workspace,
    tab: r.tab,
    role: r.role,
    opens: Number(r.opens),
    users: Number(r.users),
    firstViewed: r.first_viewed,
    lastViewed: r.last_viewed
  }));
}
