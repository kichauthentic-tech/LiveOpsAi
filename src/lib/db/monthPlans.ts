import { supabase } from "../supabaseClient";
import { BrandMonthPlan, BrandMonthPlanSlot } from "../../types";

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
  locked_at: string | null;
}

interface DbPlanSlot {
  id: string;
  plan_id: string;
  date: string;
  start_time: string;
  end_time: string;
  target_gmv: number;
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
  lockedAt: r.locked_at ?? undefined
});

const slotFromDb = (r: DbPlanSlot): BrandMonthPlanSlot => ({
  id: r.id,
  planId: r.plan_id,
  date: r.date,
  startTime: hhmm(r.start_time),
  endTime: hhmm(r.end_time),
  targetGmv: Number(r.target_gmv),
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

export type PlanSettings = Pick<BrandMonthPlan, "defaultSlotHours" | "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay" | "notes">;

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
        notes: settings.notes
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
  note: string;
}

// Thay toàn bộ ca kế hoạch của plan bằng bản nháp: xoá dòng không còn trong nháp, upsert phần còn
// lại (theo khoá plan|ngày|giờ nên đổi giờ một ca = dòng mới; slot_id của dòng cũ mất theo — đúng,
// vì ca thật cũ không còn khớp kế hoạch nữa, giai đoạn C xử lý huỷ).
export async function replacePlanSlots(planId: string, drafts: PlanSlotDraft[]): Promise<BrandMonthPlanSlot[]> {
  const keep = drafts.map((d) => d.id).filter((x): x is string => !!x);
  let del = supabase.from("brand_month_plan_slots").delete().eq("plan_id", planId);
  if (keep.length > 0) del = del.not("id", "in", `(${keep.join(",")})`);
  const { error: e1 } = await del;
  if (e1) throw e1;
  if (drafts.length > 0) {
    const { error: e2 } = await supabase.from("brand_month_plan_slots").upsert(
      drafts.map((d) => ({
        ...(d.id ? { id: d.id } : {}),
        plan_id: planId,
        date: d.date,
        start_time: d.startTime,
        end_time: d.endTime,
        target_gmv: d.targetGmv,
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
  total_slots: number;
}

export async function lockMonthPlan(planId: string): Promise<LockPlanResult> {
  const { data, error } = await supabase.rpc("lock_month_plan", { p_plan_id: planId });
  if (error) throw error;
  return data as LockPlanResult;
}
