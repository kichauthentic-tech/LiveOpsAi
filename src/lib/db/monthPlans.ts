import { supabase } from "../supabaseClient";
import { dedupeInFlight } from "./dedupeInFlight";
import { prefetchable } from "./prefetch";
import { fetchAllPages } from "./fetchAllPages";
import { LockedPlanRow, LockedPlanTargets, lockedPlanTargetsFromRows } from "../scheduling/lockedPlanTargets";
import { RetargetAuditRow, RetargetBatch, summarizeRetargetBatches } from "../scheduling/retarget";
import { BrandMonthPlan, BrandMonthPlanSlot, CalendarEventRow, PlanCampRanges, PlanGroupTargets } from "../../types";
import { platformOf, brandPlatformKey, type ReportPlatform } from "../reportPlatform";

// Kế Hoạch Tháng (0090). Bảng nhỏ (1 dòng plan + ≤ ~100 ca/brand/tháng) — đọc theo brand+tháng,
// ghi ca kế hoạch bằng cách thay cả lô (xoá dòng không còn, upsert dòng còn) để UI lưới không phải
// theo dõi từng thao tác.

interface DbPlan {
  id: string;
  brand_id: string;
  month: string;
  /** 0140 — DB chưa chạy 0140 thì không có cột: coi là TikTok. */
  platform?: ReportPlatform | null;
  status: BrandMonthPlan["status"];
  default_slot_hours: number;
  live_window_start: string;
  live_window_end: string;
  max_slots_per_day: number;
  notes: string;
  blackout_dates: string[] | null;
  target_gmv: number | null;
  camp_ranges: PlanCampRanges | null;
  /** 0161 — DB chưa chạy 0161 thì không có cột. */
  group_targets?: PlanGroupTargets | null;
  shop_target_gmv: number | null;
  ads_budget: number | null;
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

// Có cột group_targets trên DB chưa (0161)? Biết sau lần đọc đầu tiên; chưa biết (null) thì chỉ gửi khi thật sự có target nhóm,
// để DB chưa chạy 0161 vẫn lưu được kế hoạch như cũ.
let groupTargetsColumn: boolean | null = null;

/** Chỉ giữ khoá hợp lệ với số > 0. */
export function cleanGroupTargets(g: PlanGroupTargets | null | undefined): PlanGroupTargets {
  const out: PlanGroupTargets = {};
  for (const k of ["dday", "midmonth", "payday", "daily"] as const) {
    const v = Number(g?.[k] ?? 0);
    if (Number.isFinite(v) && v > 0) out[k] = Math.round(v);
  }
  return out;
}

const planFromDb = (r: DbPlan): BrandMonthPlan => ({
  id: r.id,
  brandId: r.brand_id,
  month: r.month.slice(0, 7),
  platform: platformOf(r),
  status: r.status,
  defaultSlotHours: Number(r.default_slot_hours),
  liveWindowStart: hhmm(r.live_window_start),
  liveWindowEnd: hhmm(r.live_window_end),
  maxSlotsPerDay: r.max_slots_per_day,
  notes: r.notes,
  blackoutDates: r.blackout_dates ?? [],
  targetGmv: Number(r.target_gmv ?? 0),
  campRanges: r.camp_ranges ?? {},
  groupTargets: cleanGroupTargets(r.group_targets),
  shopTargetGmv: Number(r.shop_target_gmv ?? 0),
  adsBudget: Number(r.ads_budget ?? 0),
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

/**
 * MỘT request: plan nhúng luôn các ca kế hoạch (PostgREST embed qua FK plan_id). Trước 2026-10-03 là hai
 * truy vấn NỐI TIẾP (plan rồi slots theo plan.id) — đo trên Dashboard CROCS: thêm nguyên một vòng mạng
 * (840 → 1.080 ms) mỗi lần mở màn. Thứ tự slot (date, start_time) đặt trên bảng nhúng.
 *
 * Đi qua `dedupeInFlight`: `BrandDashboard` gọi cùng (brand, tháng) với nơi khác có thể chồng thời gian
 * (đo 2026-10-01: 4 request thay vì 2 trước khi gộp). Mỗi caller vẫn tự `planFromDb`/`slotFromDb` ra đối
 * tượng riêng, chỉ dùng chung dòng JSON thô. Xem đầu file dedupeInFlight.ts.
 */
export async function fetchMonthPlan(
  brandId: string,
  month: string,
  platform: ReportPlatform = "TikTok"
): Promise<{ plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null> {
  // Kế hoạch theo sàn (0140): đọc mọi kế hoạch của (brand, tháng) rồi lọc sàn phía client — DB chưa chạy 0140 (thiếu
  // cột platform) vẫn đọc được, coi mọi kế hoạch là TikTok. Một khoá dedupe cho cả hai sàn: Dashboard "Tổng" đọc cả hai.
  const rows = await dedupeInFlight(`brand_month_plans+slots|${brandId}|${month}`, async () => {
    const { data, error } = await supabase
      .from("brand_month_plans")
      .select("*, brand_month_plan_slots(*)")
      .eq("brand_id", brandId)
      .eq("month", `${month}-01`)
      .order("date", { referencedTable: "brand_month_plan_slots" })
      .order("start_time", { referencedTable: "brand_month_plan_slots" });
    if (error) throw error;
    return (data ?? []) as (DbPlan & { brand_month_plan_slots: DbPlanSlot[] })[];
  });
  if (rows.length > 0) groupTargetsColumn = "group_targets" in rows[0];
  const data = rows.find((r) => platformOf(r) === platform);
  if (!data) return null;
  return { plan: planFromDb(data), slots: (data.brand_month_plan_slots ?? []).map(slotFromDb) };
}

/** Kế hoạch của mọi brand trong tháng. Khoá = `brandPlatformKey` (brandId cho TikTok, "brandId|Shopee" cho Shopee). */
export async function fetchPlanStatuses(month: string): Promise<Map<string, BrandMonthPlan>> {
  const { data, error } = await supabase.from("brand_month_plans").select("*").eq("month", `${month}-01`);
  if (error) throw error;
  return new Map((data as DbPlan[]).map((r) => [brandPlatformKey(r.brand_id, r.platform), planFromDb(r)]));
}

export type PlanSettings = Pick<BrandMonthPlan, "defaultSlotHours" | "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay" | "notes" | "blackoutDates" | "targetGmv" | "campRanges" | "groupTargets" | "shopTargetGmv" | "adsBudget">;

export async function upsertMonthPlan(brandId: string, month: string, settings: PlanSettings, platform: ReportPlatform = "TikTok"): Promise<BrandMonthPlan> {
  const groupTargets = cleanGroupTargets(settings.groupTargets);
  const sendGroupTargets = groupTargetsColumn === true || Object.keys(groupTargets).length > 0;
  const { data, error } = await supabase
    .from("brand_month_plans")
    .upsert(
      {
        brand_id: brandId,
        month: `${month}-01`,
        platform,
        default_slot_hours: settings.defaultSlotHours,
        live_window_start: settings.liveWindowStart,
        live_window_end: settings.liveWindowEnd,
        max_slots_per_day: settings.maxSlotsPerDay,
        notes: settings.notes,
        blackout_dates: settings.blackoutDates,
        target_gmv: settings.targetGmv,
        camp_ranges: settings.campRanges,
        ...(sendGroupTargets ? { group_targets: groupTargets } : {}),
        shop_target_gmv: settings.shopTargetGmv > 0 ? settings.shopTargetGmv : null,
        ads_budget: settings.adsBudget > 0 ? settings.adsBudget : null
      },
      { onConflict: "brand_id,month,platform" }
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
  linked_sessions?: number; // 0151: ca kế hoạch gắn vào ca thật nạp sẵn (không mở đăng ký)
}

export async function lockMonthPlan(planId: string): Promise<LockPlanResult> {
  const { data, error } = await supabase.rpc("lock_month_plan", { p_plan_id: planId });
  if (error) throw error;
  return data as LockPlanResult;
}

export type { LockedPlanTargets };

// Target/ca của mọi kế hoạch ĐÃ CHỐT. Bảng nhỏ, đọc 1 lần + sau mỗi lần chốt.
// RLS lọc sẵn theo brand với role `brand` (0105), nên map trả về của họ chỉ có brand của họ.
// KHÔNG lọc `slot_id is not null` — xem lỗi E2E #1 ở lib/scheduling/lockedPlanTargets.ts.
export async function fetchLockedPlanTargets(): Promise<LockedPlanTargets> {
  // Đọc target của MỌI kế hoạch đã chốt, cộng dồn qua từng tháng — bảng tăng nhanh nhất nhóm này
  // (đo 2026-10-01: 75 dòng cho 1 tháng, tức chạm trần 1.000 của PostgREST trong khoảng một năm).
  // Mất dòng ở đây là target của ca sai mà không có dấu hiệu gì. Xem src/lib/db/fetchAllPages.ts.
  const data = await fetchAllPages<LockedPlanRow>((from, to) =>
    supabase
      .from("brand_month_plan_slots")
      // plan(*) chứ không gọi tên cột: DB chưa chạy 0140 (thiếu platform) vẫn đọc được — lockedPlanTargetsFromRows coi là TikTok.
      .select("slot_id,target_gmv,date,plan:brand_month_plans!inner(*)")
      .eq("plan.status", "locked")
      .order("slot_id", { ascending: true })
      .range(from, to)
  );
  return lockedPlanTargetsFromRows(data);
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

// Mọi ca kế hoạch của các plan ĐÃ CHỐT của brand — gồm cả ca đã mất shift_slot (lỗi E2E #1): evaluatePlan
// xếp chúng vào "unlinked" thay vì để target biến khỏi bảng "Kế hoạch vs thực tế".
export async function fetchBrandLockedPlanSlots(brandId: string, platform: ReportPlatform = "TikTok"): Promise<BrandMonthPlanSlot[]> {
  // select * của kế hoạch (không gọi tên cột platform) để DB chưa chạy 0140 vẫn đọc được; lọc sàn phía client.
  const { data, error } = await supabase
    .from("brand_month_plan_slots")
    .select("*,plan:brand_month_plans!inner(*)")
    .eq("plan.status", "locked")
    .eq("plan.brand_id", brandId)
    .order("date");
  if (error) throw error;
  type Row = DbPlanSlot & { plan: DbPlan | DbPlan[] | null };
  return ((data as Row[]) ?? [])
    .filter((r) => {
      const plan = Array.isArray(r.plan) ? r.plan[0] : r.plan;
      return platformOf(plan ?? {}) === platform;
    })
    .map(slotFromDb);
}

// Lượt đọc nạp-trước-được (lib/db/prefetch.ts) — định nghĩa MỘT chỗ cạnh hàm db để mọi màn dùng chung đúng key.
export const planStatusesRead = prefetchable("planStatuses", fetchPlanStatuses);
export const monthPlanRead = prefetchable("monthPlan", fetchMonthPlan);
export const calendarEventsRead = prefetchable("calendarEvents", fetchCalendarEvents);
export const lockedPlanSlotsRead = prefetchable("lockedPlanSlots", fetchBrandLockedPlanSlots);

// Chia lại target CẢ LƯỚI của kế hoạch đã chốt, kể cả ca đã qua (0162). RPC security definer, chỉ ceo/admin; ghi nhật ký.
export interface RetargetResult {
  batch_id: string;
  changed: number;
  past_changed: number;
  old_total: number;
  new_total: number;
}

export async function retargetMonthPlan(planId: string, targets: { id: string; target: number }[], note = ""): Promise<RetargetResult> {
  const { data, error } = await supabase.rpc("retarget_month_plan", { p_plan_id: planId, p_targets: targets, p_note: note });
  if (error) {
    // PGRST202 = PostgREST không thấy hàm: DB chưa chạy 0162.
    if (error.code === "PGRST202") throw new Error("DB chưa chạy migration 0162 (retarget_month_plan) — chạy SQL trong Supabase rồi thử lại.");
    throw error;
  }
  return data as RetargetResult;
}

// Nhật ký các vòng chia lại của một kế hoạch (mới nhất trước). Bảng chưa có (chưa chạy 0162) ⇒ [] chứ không báo lỗi.
export async function fetchRetargetHistory(planId: string, today: string): Promise<RetargetBatch[]> {
  const { data, error } = await supabase
    .from("plan_target_audit")
    .select("batch_id,changed_at,changed_by,note,date,old_target,new_target")
    .eq("plan_id", planId)
    .order("changed_at", { ascending: false })
    .limit(1000);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw error;
  }
  return summarizeRetargetBatches((data as RetargetAuditRow[]) ?? [], today);
}
