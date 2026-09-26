import { supabase } from "../supabaseClient";
import { BrandMonthPlan, BrandMonthPlanSlot, CalendarEventRow, PlanCampRanges } from "../../types";

// Kế Hoạch Tháng (0090). Bảng nhỏ (1 dòng plan + ≤ ~100 ca/brand/tháng) — đọc theo brand+tháng,
// ghi ca kế hoạch bằng cách thay cả lô (xoá dòng không còn, upsert dòng còn) để UI lưới không phải
// theo dõi từng thao tác.

interface DbPlan {
  id: string;
  brand_id: string;
  month: string;
  status: BrandMonthPlan["status"];
  default_slot_hours: number;
  live_window_start: string;
  live_window_end: string;
  max_slots_per_day: number;
  notes: string;
  blackout_dates: string[] | null;
  target_gmv: number | null;
  camp_ranges: PlanCampRanges | null;
  shop_target_gmv: number | null;
  locked_at: string | null;
  brand_confirmed_at: string | null;
}

interface DbPlanSlot {
  id: string;
  plan_id: string;
  date: string;
  start_time: string;
  end_time: string;
  target_gmv: number;
  expected_gmv: number | null;
  slot_id: string | null;
  note: string;
}

const hhmm = (t: string) => t.slice(0, 5);

const planFromDb = (r: DbPlan): BrandMonthPlan => ({
  id: r.id,
  brandId: r.brand_id,
  month: r.month.slice(0, 7),
  status: r.status,
  defaultSlotHours: Number(r.default_slot_hours),
  liveWindowStart: hhmm(r.live_window_start),
  liveWindowEnd: hhmm(r.live_window_end),
  maxSlotsPerDay: r.max_slots_per_day,
  notes: r.notes,
  blackoutDates: r.blackout_dates ?? [],
  targetGmv: Number(r.target_gmv ?? 0),
  campRanges: r.camp_ranges ?? {},
  shopTargetGmv: Number(r.shop_target_gmv ?? 0),
  lockedAt: r.locked_at ?? undefined,
  brandConfirmedAt: r.brand_confirmed_at ?? undefined
});

const slotFromDb = (r: DbPlanSlot): BrandMonthPlanSlot => ({
  id: r.id,
  planId: r.plan_id,
  date: r.date,
  startTime: hhmm(r.start_time),
  endTime: hhmm(r.end_time),
  targetGmv: Number(r.target_gmv),
  expectedGmv: Number(r.expected_gmv ?? 0),
  slotId: r.slot_id ?? undefined,
  note: r.note
});

export async function fetchMonthPlan(brandId: string, month: string): Promise<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null> {
  const { data, error } = await supabase
    .from("brand_month_plans")
    .select("*")
    .eq("brand_id", brandId)
    .eq("month", `${month}-01`)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const plan = planFromDb(data as DbPlan);
  const { data: rows, error: e2 } = await supabase
    .from("brand_month_plan_slots")
    .select("*")
    .eq("plan_id", plan.id)
    .order("date")
    .order("start_time");
  if (e2) throw e2;
  return { plan, slots: (rows as DbPlanSlot[]).map(slotFromDb) };
}

export async function fetchPlanStatuses(month: string): Promise<Map<string, BrandMonthPlan>> {
  const { data, error } = await supabase.from("brand_month_plans").select("*").eq("month", `${month}-01`);
  if (error) throw error;
  return new Map((data as DbPlan[]).map((r) => [r.brand_id, planFromDb(r)]));
}

export type PlanSettings = Pick<BrandMonthPlan, "defaultSlotHours" | "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay" | "notes" | "blackoutDates" | "targetGmv" | "campRanges" | "shopTargetGmv">;

export async function upsertMonthPlan(brandId: string, month: string, settings: PlanSettings): Promise<BrandMonthPlan> {
  const { data, error } = await supabase
    .from("brand_month_plans")
    .upsert(
      {
        brand_id: brandId,
        month: `${month}-01`,
        default_slot_hours: settings.defaultSlotHours,
        live_window_start: settings.liveWindowStart,
        live_window_end: settings.liveWindowEnd,
        max_slots_per_day: settings.maxSlotsPerDay,
        notes: settings.notes,
        blackout_dates: settings.blackoutDates,
        target_gmv: settings.targetGmv,
        camp_ranges: settings.campRanges,
        shop_target_gmv: settings.shopTargetGmv > 0 ? settings.shopTargetGmv : null
      },
      { onConflict: "brand_id,month" }
    )
    .select()
    .single();
  if (error) throw error;
  return planFromDb(data as DbPlan);
}

export interface PlanSlotDraft {
  id?: string; // có = dòng đã tồn tại
  date: string;
  startTime: string;
  endTime: string;
  targetGmv: number;
  expectedGmv?: number;
  note: string;
}

// Thay toàn bộ ca kế hoạch của plan bằng bản nháp, khoá theo (ngày, giờ bắt đầu, giờ kết thúc):
// dòng DB có khoá không còn trong nháp → xoá; phần còn lại upsert theo khoá tự nhiên (không gửi id —
// PostgREST upsert bắt mọi dòng cùng cột, trộn dòng có/không id là "null value in column id").
// Đổi giờ một ca = khoá mới → dòng mới, dòng cũ bị xoá (slot_id cũ mất theo — ca thật cũ sẽ được
// lock_month_plan 0091 huỷ khi chốt lại).
export async function replacePlanSlots(planId: string, drafts: PlanSlotDraft[]): Promise<BrandMonthPlanSlot[]> {
  const keyOf = (d: { date: string; startTime: string; endTime: string }) => `${d.date}|${d.startTime}|${d.endTime}`;
  const want = new Set(drafts.map(keyOf));
  const { data: existing, error: e0 } = await supabase.from("brand_month_plan_slots").select("id,date,start_time,end_time").eq("plan_id", planId);
  if (e0) throw e0;
  const stale = ((existing as { id: string; date: string; start_time: string; end_time: string }[]) ?? [])
    .filter((r) => !want.has(keyOf({ date: r.date, startTime: hhmm(r.start_time), endTime: hhmm(r.end_time) })))
    .map((r) => r.id);
  if (stale.length > 0) {
    const { error: e1 } = await supabase.from("brand_month_plan_slots").delete().in("id", stale);
    if (e1) throw e1;
  }
  if (drafts.length > 0) {
    const { error: e2 } = await supabase.from("brand_month_plan_slots").upsert(
      drafts.map((d) => ({
        plan_id: planId,
        date: d.date,
        start_time: d.startTime,
        end_time: d.endTime,
        target_gmv: d.targetGmv,
        expected_gmv: d.expectedGmv ?? 0,
        note: d.note
      })),
      { onConflict: "plan_id,date,start_time,end_time" }
    );
    if (e2) throw e2;
  }
  const { data, error } = await supabase.from("brand_month_plan_slots").select("*").eq("plan_id", planId).order("date").order("start_time");
  if (error) throw error;
  return (data as DbPlanSlot[]).map(slotFromDb);
}

export interface LockPlanResult {
  created: number;
  linked: number;
  cancelled: number; // 0091: ca mở bị bỏ khỏi kế hoạch, chưa ai đăng ký → huỷ
  kept_registered: number; // bị bỏ khỏi kế hoạch nhưng đã có người đăng ký → giữ, ops tự xử
  total_slots: number;
  skipped_past?: number; // 0099: ca kế hoạch ở ngày đã qua, không sinh slot
}

export async function lockMonthPlan(planId: string): Promise<LockPlanResult> {
  const { data, error } = await supabase.rpc("lock_month_plan", { p_plan_id: planId });
  if (error) throw error;
  return data as LockPlanResult;
}

export interface LockedPlanTargets {
  // shift_slot id → target/ca. App nối shift_slots.session_id → live_sessions để đổ xuống ca thật.
  bySlotId: Map<string, number>;
  // "brandId|YYYY-MM" → TỔNG target đã chốt của tháng đó (Σ mọi ca kế hoạch, kể cả ca CHƯA chốt
  // người nên chưa có live_session). Đ5 (2026-09-24): thiếu con số này thì mọi chỗ hỏi "target
  // tháng bao nhiêu" phải cộng ngược từ các ca đang tồn tại, và tổng đó TỤT mỗi khi còn ca kế
  // hoạch chưa xếp người — Report Tháng vì thế báo 145% target trong khi thực tế mới đạt 72,5%.
  monthTotals: Map<string, number>;
}

// Target/ca của mọi kế hoạch ĐÃ CHỐT. Bảng nhỏ, đọc 1 lần + sau mỗi lần chốt.
// RLS lọc sẵn theo brand với role `brand` (0105), nên map trả về của họ chỉ có brand của họ.
export async function fetchLockedPlanTargets(): Promise<LockedPlanTargets> {
  const { data, error } = await supabase
    .from("brand_month_plan_slots")
    .select("slot_id,target_gmv,date,plan:brand_month_plans!inner(status,brand_id)")
    .eq("plan.status", "locked")
    .not("slot_id", "is", null);
  if (error) throw error;
  const bySlotId = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  type Row = { slot_id: string | null; target_gmv: number; date: string; plan: { brand_id: string } | { brand_id: string }[] };
  for (const r of (data as Row[]) ?? []) {
    const target = Number(r.target_gmv) || 0;
    if (r.slot_id) bySlotId.set(r.slot_id, target);
    // PostgREST trả quan hệ !inner ra object hay mảng 1 phần tử tuỳ cách suy khoá — nhận cả hai
    // thay vì cược vào một dạng (đoán sai thì brand_id ra undefined và tổng tháng âm thầm về 0).
    const brandId = Array.isArray(r.plan) ? r.plan[0]?.brand_id : r.plan?.brand_id;
    if (!brandId || !r.date) continue;
    const key = `${brandId}|${r.date.slice(0, 7)}`;
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + target);
  }
  return { bySlotId, monthTotals };
}

export interface DeletePlanResult {
  brand_id: string;
  month: string;
  plan_slots_deleted: number;
  slots_cancelled: number;
  slots_had_registrations: number;
}

// Xoá kế hoạch tháng (0115). RPC chứ không phải `.delete()`: `shift_slots.plan_id` là
// `on delete set null` nên xoá thẳng dòng plan sẽ để lại ca chờ đăng ký MỒ CÔI (vẫn hiện ở Nhân sự
// ca, vẫn cho đăng ký, không còn đường tra về kế hoạch). RPC huỷ ca `open` + xoá plan trong một
// transaction, và chặn nếu đã có ca chốt người.
export async function deleteMonthPlan(planId: string): Promise<DeletePlanResult> {
  const { data, error } = await supabase.rpc("delete_month_plan", { p_plan_id: planId });
  if (error) throw error;
  return data as DeletePlanResult;
}

export async function fetchCalendarEvents(): Promise<CalendarEventRow[]> {
  const { data, error } = await supabase.from("calendar_events").select("id,date,kind,label").order("date");
  if (error) throw error;
  return (data as CalendarEventRow[]) ?? [];
}

// Mọi ca kế hoạch ĐÃ CHỐT của 1 brand có dự báo engine (expected_gmv > 0) và đã gắn ca thật — đầu vào
// cho đối chiếu kế hoạch vs thực tế + hiệu chỉnh (giai đoạn D).
// Brand xác nhận đã xem lịch tháng sau (0110). RPC security definer — brand không có policy UPDATE
// nào trên brand_month_plans, guard role/chủ sở hữu nằm trong thân hàm phía DB.
export async function confirmMonthPlan(planId: string): Promise<BrandMonthPlan> {
  const { data, error } = await supabase.rpc("confirm_month_plan", { p_plan_id: planId });
  if (error) throw error;
  return planFromDb(data as DbPlan);
}

export async function fetchBrandLockedPlanSlots(brandId: string): Promise<BrandMonthPlanSlot[]> {
  const { data, error } = await supabase
    .from("brand_month_plan_slots")
    .select("*,plan:brand_month_plans!inner(status,brand_id)")
    .eq("plan.status", "locked")
    .eq("plan.brand_id", brandId)
    .not("slot_id", "is", null)
    .order("date");
  if (error) throw error;
  return ((data as DbPlanSlot[]) ?? []).map(slotFromDb);
}
