// Gộp các dòng `brand_month_plan_slots` của kế hoạch ĐÃ CHỐT thành các map target App dùng. Hàm thuần
// (không đụng supabaseClient) để test được — fetchLockedPlanTargets (lib/db/monthPlans.ts) chỉ truy vấn.
//
// Lỗi E2E #1 (2026-09-28): trước đây truy vấn lọc `slot_id is not null`. Xoá một ca chờ đăng ký ở Nhân
// sự ca ⇒ FK `on delete set null` đưa `slot_id` của ca kế hoạch về null ⇒ target ca đó biến khỏi tổng
// tháng (VERA T9: 100M → 14,7M, Report Tháng + Bản Tin CEO báo "Đạt 124%") trong khi Toàn Cảnh Brand
// đọc thẳng kế hoạch vẫn 100M. Luật user chốt cùng ngày: target = plan BAN ĐẦU — ca kế hoạch huỷ hay
// mất liên kết vẫn giữ target. Nên tổng tháng + target theo ngày cộng MỌI ca kế hoạch; chỉ map theo
// shift_slot (đổ target xuống ca thật) mới cần slot_id.

import { brandMonthKey } from "../reportPlatform";

export interface LockedPlanTargets {
  // shift_slot id → target/ca. App nối shift_slots.session_id → live_sessions để đổ xuống ca thật.
  bySlotId: Map<string, number>;
  // brandMonthKey ("brandId|YYYY-MM", Shopee thêm "|Shopee" — 0140) → TỔNG target đã chốt của tháng đó (Σ mọi ca kế hoạch, kể cả ca CHƯA chốt
  // người và ca đã mất shift_slot). Đ5 (2026-09-24): thiếu con số này thì mọi chỗ hỏi "target tháng
  // bao nhiêu" phải cộng ngược từ các ca đang tồn tại, và tổng đó TỤT mỗi khi còn ca kế hoạch chưa
  // xếp người — Report Tháng vì thế báo 145% target trong khi thực tế mới đạt 72,5%.
  monthTotals: Map<string, number>;
  // brandMonthKey → target từng ca kế hoạch theo ngày (gồm ca đã mất shift_slot). Bản Tin CEO đặt
  // target vào đúng ngày từ đây, không suy ngược qua shift_slots đang tồn tại.
  slotTargets: Map<string, { date: string; target: number }[]>;
}

export interface LockedPlanRow {
  slot_id: string | null;
  target_gmv: number | string | null;
  date: string;
  // platform thiếu (DB chưa chạy 0140) = TikTok.
  plan: { brand_id: string; platform?: string | null } | { brand_id: string; platform?: string | null }[] | null;
}

export function lockedPlanTargetsFromRows(rows: LockedPlanRow[]): LockedPlanTargets {
  const bySlotId = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  const slotTargets = new Map<string, { date: string; target: number }[]>();
  for (const r of rows) {
    const target = Number(r.target_gmv) || 0;
    if (r.slot_id) bySlotId.set(r.slot_id, target);
    // PostgREST trả quan hệ !inner ra object hay mảng 1 phần tử tuỳ cách suy khoá — nhận cả hai
    // thay vì cược vào một dạng (đoán sai thì brand_id ra undefined và tổng tháng âm thầm về 0).
    const plan = Array.isArray(r.plan) ? r.plan[0] : r.plan;
    const brandId = plan?.brand_id;
    if (!brandId || !r.date) continue;
    const key = brandMonthKey(brandId, r.date, plan?.platform);
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + target);
    slotTargets.set(key, [...(slotTargets.get(key) ?? []), { date: r.date, target }]);
  }
  return { bySlotId, monthTotals, slotTargets };
}
