import { supabase } from "../supabaseClient";
import { LiveSession, ProductSKU, ChecklistItem, MinuteMetric } from "../../types";

// brands/studios/talents are all real Supabase tables now (Phases 1/3) and every
// UI form selects these IDs from the real lists — no more free-text fallback, so
// a plain empty-string-to-null coercion is enough (see Phase 5 in PROJECT_STATUS.md).
const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbLiveSession {
  id: string;
  title: string;
  brand_id: string | null;
  brand_name: string;
  project_id: string | null;
  shop_tiktok_handle: string;
  studio_id: string | null;
  studio_name: string;
  host_id: string | null;
  host_name: string;
  assistant_name: string;
  date: string;
  start_time: string;
  end_time: string;
  status: LiveSession["status"];
  target_gmv: number;
  actual_gmv: number;
  total_orders: number;
  avg_watch_time_seconds: number;
  peak_viewers: number;
  total_views: number;
  ctr_avg: number;
  cvr_avg: number;
  ai_analysis: LiveSession["aiAnalysis"] | null;
}

interface DbSessionSku {
  id: string;
  session_id: string;
  code: string;
  name: string;
  category: string;
  original_price: number;
  live_price: number;
  commission: number;
  stock: number;
  sold_in_session: number;
  click_count: number;
  ctr: number;
  cvr: number;
}

interface DbChecklistItem {
  id: string;
  session_id: string;
  task: string;
  category: ChecklistItem["category"];
  completed: boolean;
  assigned_to: string;
}

interface DbMinuteMetric {
  id: string;
  session_id: string;
  minute: number;
  time_string: string;
  viewers: number;
  peak_viewers: number;
  gmv_cumulative: number;
  gmv_per_minute: number;
  ctr: number;
  cvr: number;
  product_clicks: number;
  comments: number;
  event_trigger: string | null;
}

// Postgres `time` columns come back from PostgREST as "HH:MM:SS" (e.g. "17:00:00"), but every
// consumer in the app (FIXED_TIME_SLOTS, <input type="time">, conflict-checking string compares)
// works in "HH:MM". Left un-normalized, a session's end_time "20:00:00" reads as lexicographically
// GREATER than a slot boundary "20:00" (longer string beats its own prefix), so a session ending
// exactly at a slot boundary was matching both that slot and the next one in the Day Matrix view.
const toHhMm = (t: string) => t.slice(0, 5);

function sessionFromDb(row: DbLiveSession): Omit<LiveSession, "skus" | "checklist" | "minuteMetrics"> {
  return {
    id: row.id,
    title: row.title,
    brandId: row.brand_id ?? "",
    brandName: row.brand_name,
    projectId: row.project_id ?? undefined,
    shopTikTokHandle: row.shop_tiktok_handle,
    studioId: row.studio_id ?? "",
    studioName: row.studio_name,
    hostId: row.host_id ?? "",
    hostName: row.host_name,
    assistantName: row.assistant_name,
    date: row.date,
    startTime: toHhMm(row.start_time),
    endTime: toHhMm(row.end_time),
    status: row.status,
    targetGmv: row.target_gmv,
    actualGmv: row.actual_gmv,
    totalOrders: row.total_orders,
    avgWatchTimeSeconds: row.avg_watch_time_seconds,
    peakViewers: row.peak_viewers,
    totalViews: row.total_views,
    ctrAvg: row.ctr_avg,
    cvrAvg: row.cvr_avg,
    aiAnalysis: row.ai_analysis ?? undefined
  };
}

function sessionToDb(s: LiveSession) {
  return {
    title: s.title,
    brand_id: orNull(s.brandId),
    brand_name: s.brandName ?? "",
    project_id: orNull(s.projectId),
    shop_tiktok_handle: s.shopTikTokHandle ?? "",
    studio_id: orNull(s.studioId),
    studio_name: s.studioName ?? "",
    host_id: orNull(s.hostId),
    host_name: s.hostName ?? "",
    assistant_name: s.assistantName ?? "",
    date: s.date,
    start_time: s.startTime,
    end_time: s.endTime,
    status: s.status,
    target_gmv: s.targetGmv ?? 0,
    actual_gmv: s.actualGmv ?? 0,
    total_orders: s.totalOrders ?? 0,
    avg_watch_time_seconds: s.avgWatchTimeSeconds ?? 0,
    peak_viewers: s.peakViewers ?? 0,
    total_views: s.totalViews ?? 0,
    ctr_avg: s.ctrAvg ?? 0,
    cvr_avg: s.cvrAvg ?? 0,
    ai_analysis: s.aiAnalysis ?? null
  };
}

function skuFromDb(row: DbSessionSku): ProductSKU {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    originalPrice: row.original_price,
    livePrice: row.live_price,
    commission: row.commission,
    stock: row.stock,
    soldInSession: row.sold_in_session,
    clickCount: row.click_count,
    ctr: row.ctr,
    cvr: row.cvr
  };
}

function skuToDb(sessionId: string, sku: ProductSKU) {
  return {
    session_id: sessionId,
    code: sku.code,
    name: sku.name,
    category: sku.category,
    original_price: sku.originalPrice,
    live_price: sku.livePrice,
    commission: sku.commission,
    stock: sku.stock,
    sold_in_session: sku.soldInSession,
    click_count: sku.clickCount,
    ctr: sku.ctr,
    cvr: sku.cvr
  };
}

function checklistFromDb(row: DbChecklistItem): ChecklistItem {
  return {
    id: row.id,
    task: row.task,
    category: row.category,
    completed: row.completed,
    assignedTo: row.assigned_to
  };
}

function checklistToDb(sessionId: string, item: ChecklistItem) {
  return {
    session_id: sessionId,
    task: item.task,
    category: item.category,
    completed: item.completed,
    assigned_to: item.assignedTo
  };
}

function minuteMetricFromDb(row: DbMinuteMetric): MinuteMetric {
  return {
    minute: row.minute,
    timeString: row.time_string,
    viewers: row.viewers,
    peakViewers: row.peak_viewers,
    gmvCumulative: row.gmv_cumulative,
    gmvPerMinute: row.gmv_per_minute,
    ctr: row.ctr,
    cvr: row.cvr,
    productClicks: row.product_clicks,
    comments: row.comments,
    eventTrigger: row.event_trigger ?? undefined
  };
}

function minuteMetricToDb(sessionId: string, m: MinuteMetric) {
  return {
    session_id: sessionId,
    minute: m.minute,
    time_string: m.timeString,
    viewers: m.viewers,
    peak_viewers: m.peakViewers,
    gmv_cumulative: m.gmvCumulative,
    gmv_per_minute: m.gmvPerMinute,
    ctr: m.ctr,
    cvr: m.cvr,
    product_clicks: m.productClicks,
    comments: m.comments,
    event_trigger: m.eventTrigger ?? null
  };
}

// Delete-then-reinsert of the 3 child tables used to run as separate client
// calls — if an insert failed partway through, the preceding delete had
// already committed, permanently losing that session's child data. Now
// delegated to a single Postgres function (see migration 0006) so the whole
// delete+insert set runs in one implicit transaction and rolls back together
// on any failure.
async function replaceChildRows(sessionId: string, session: LiveSession) {
  const { error } = await supabase.rpc("replace_session_children", {
    p_session_id: sessionId,
    p_skus: (session.skus ?? []).map((sku) => skuToDb(sessionId, sku)),
    p_checklist: (session.checklist ?? []).map((item) => checklistToDb(sessionId, item)),
    p_metrics: (session.minuteMetrics ?? []).map((m) => minuteMetricToDb(sessionId, m))
  });
  if (error) throw error;
}

async function fetchChildRowsForSessions(sessionIds: string[]) {
  if (sessionIds.length === 0) {
    return { skus: [] as DbSessionSku[], checklist: [] as DbChecklistItem[], metrics: [] as DbMinuteMetric[] };
  }
  const [skusRes, checklistRes, metricsRes] = await Promise.all([
    supabase.from("session_skus").select("*").in("session_id", sessionIds),
    supabase.from("session_checklist_items").select("*").in("session_id", sessionIds),
    supabase.from("session_minute_metrics").select("*").in("session_id", sessionIds).order("minute", { ascending: true })
  ]);
  if (skusRes.error) throw skusRes.error;
  if (checklistRes.error) throw checklistRes.error;
  if (metricsRes.error) throw metricsRes.error;
  return {
    skus: (skusRes.data as DbSessionSku[]) ?? [],
    checklist: (checklistRes.data as DbChecklistItem[]) ?? [],
    metrics: (metricsRes.data as DbMinuteMetric[]) ?? []
  };
}

function assembleSessions(rows: DbLiveSession[], skus: DbSessionSku[], checklist: DbChecklistItem[], metrics: DbMinuteMetric[]): LiveSession[] {
  return rows.map((row) => ({
    ...sessionFromDb(row),
    skus: skus.filter((r) => r.session_id === row.id).map(skuFromDb),
    checklist: checklist.filter((r) => r.session_id === row.id).map(checklistFromDb),
    minuteMetrics: metrics.filter((r) => r.session_id === row.id).map(minuteMetricFromDb)
  }));
}

export async function fetchSessions(): Promise<LiveSession[]> {
  const { data, error } = await supabase.from("live_sessions").select("*").order("date", { ascending: false }).order("start_time", { ascending: false });
  if (error) throw error;
  const rows = (data as DbLiveSession[]) ?? [];
  const { skus, checklist, metrics } = await fetchChildRowsForSessions(rows.map((r) => r.id));
  return assembleSessions(rows, skus, checklist, metrics);
}

export async function createSession(session: LiveSession): Promise<LiveSession> {
  const { data, error } = await supabase.from("live_sessions").insert(sessionToDb(session)).select().single();
  if (error) throw error;
  const row = data as DbLiveSession;
  await replaceChildRows(row.id, session);
  return {
    ...sessionFromDb(row),
    skus: session.skus ?? [],
    checklist: session.checklist ?? [],
    minuteMetrics: session.minuteMetrics ?? []
  };
}

export async function updateSession(session: LiveSession): Promise<LiveSession> {
  // Parent row update + child table replace used to be 2 separate calls — a
  // failure in the child replace left the parent already committed with new
  // values while children kept their old contents (see migration 0007).
  // Now both run inside a single Postgres function call / transaction.
  const { data, error } = await supabase.rpc("update_session_with_children", {
    p_session_id: session.id,
    p_session: sessionToDb(session),
    p_skus: (session.skus ?? []).map((sku) => skuToDb(session.id, sku)),
    p_checklist: (session.checklist ?? []).map((item) => checklistToDb(session.id, item)),
    p_metrics: (session.minuteMetrics ?? []).map((m) => minuteMetricToDb(session.id, m))
  });
  if (error) throw error;
  const row = data as DbLiveSession;
  const { skus, checklist, metrics } = await fetchChildRowsForSessions([row.id]);
  return assembleSessions([row], skus, checklist, metrics)[0];
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from("live_sessions").delete().eq("id", id);
  if (error) throw error;
}
