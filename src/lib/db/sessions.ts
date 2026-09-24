import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { LiveSession, ProductSKU, ChecklistItem, MinuteMetric, LiveSessionReport, UserRole } from "../../types";

// brands/studios/talents are all real Supabase tables now (Phases 1/3) and every
// UI form selects these IDs from the real lists — no more free-text fallback, so
// a plain empty-string-to-null coercion is enough (see Phase 5 in PROJECT_STATUS.md).
const orNull = (v: string | undefined | null) => (v ? v : null);

// ĐỌC ca luôn qua view, GHI luôn vào bảng. View `live_sessions_secure` (migration 0107) che cột
// theo role: brand không thấy phần nội bộ agency (target/studio/trợ live/room id) và không thấy
// SỐ LIỆU của tháng chưa phát hành, nhưng vẫn thấy LỊCH.
//
// Đừng "tối ưu" chỗ này về lại `live_sessions`: từ 0107 bảng gốc đã ĐÓNG hẳn với role brand
// (policy `live_sessions_read_no_brand`), nên đọc thẳng bảng sẽ trả 0 ca cho mọi tài khoản brand
// — màn hình trắng chứ không phải rò rỉ, nhưng vẫn là hỏng.
const READ_VIEW = "live_sessions_secure";

// PostgREST trả PGRST205 ("Could not find the table ... in the schema cache") khi view chưa tồn
// tại. Tình huống này chỉ xảy ra đúng một lần: client đã deploy nhưng migration 0107 CHƯA chạy
// trên Supabase (2 việc tách rời nhau — migration phải dán tay vào SQL Editor).
//
// Không có fallback thì hậu quả là TOÀN BỘ app mất sạch ca cho MỌI role cho tới khi ai đó nhớ ra
// phải chạy migration. Có fallback thì app chạy y như trước khi có 0107 — tức không an toàn hơn,
// nhưng cũng không kém đi một chút nào so với hiện trạng, vì bảng gốc lúc đó vẫn đang mở cho brand
// đúng như từ trước tới giờ. Đổi "hỏng toàn bộ" lấy "chưa siết được", rõ ràng là đáng.
//
// Cảnh báo ra console CHỨ KHÔNG nuốt im: fallback này là trạng thái tạm, không phải thiết kế.
const VIEW_MISSING = "PGRST205";
let warnedViewMissing = false;
function warnViewMissing(): void {
  if (warnedViewMissing) return;
  warnedViewMissing = true;
  console.warn(
    `[LiveOps] View "${READ_VIEW}" chưa có trên Supabase — đang đọc tạm từ bảng live_sessions. ` +
      "Role brand vì vậy VẪN thấy số liệu của tháng chưa phát hành. Chạy migration 0107 để đóng lại."
  );
}

interface DbLiveSession {
  id: string;
  title: string;
  brand_id: string | null;
  brand_name: string;
  shop_tiktok_handle: string;
  studio_id: string | null;
  studio_name: string;
  host_id: string | null;
  host_name: string;
  assistant_id: string | null;
  assistant_name: string;
  co_host_id: string | null;
  co_host_name: string;
  platform: LiveSession["platform"];
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
  data_source: LiveSession["dataSource"] | null;
  reconciled_at: string | null;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  tiktok_room_id: string | null;
  // Snapshot theo ca (migration 0078) — chỉ đọc ở đây, đường ghi duy nhất là RPC
  // apply_session_live_snapshot/delete_session_live_snapshot (xem sessionToDb bên dưới).
  actual_start_at: string | null;
  actual_end_at: string | null;
  live_duration_minutes: number | null;
  attributed_items_sold: number | null;
  attributed_sku_orders: number | null;
  impressions: number | null;
  product_impressions: number | null;
  product_clicks: number | null;
  new_followers: number | null;
  comments_count: number | null;
  shares_count: number | null;
  likes_count: number | null;
  live_room_ids: string[] | null;
  is_backfill: boolean | null;
  // Cột CHỈ CÓ ở view `live_sessions_secure` (migration 0107): tháng của ca này đã phát hành cho
  // brand chưa. Các đường trả về row thô từ RPC (cancel_session, submit_live_session_report…)
  // không có cột này — đó đều là đường của ops, và ops thì luôn thấy số, nên mặc định `true`.
  month_published?: boolean | null;
  // 0114 — cờ "đã loại khỏi báo cáo". Có ở cả bảng gốc và view, nhưng row thô do RPC cũ trả về
  // (update_session_with_children, submit_live_session_report…) có sẵn vì chúng `returning *`.
  excluded_from_reports?: boolean | null;
  excluded_reason?: string | null;
  excluded_at?: string | null;
}

// 3 interface dưới đây chỉ còn phục vụ ĐƯỜNG GHI (*ToDb → replace_session_children). Hàm đọc
// ngược (*FromDb) đã xoá 2026-09-23 cùng với việc bỏ nạp 3 bảng con — xem ghi chú dài ở
// fetchChildRowsForSessions() nếu cần dựng lại đường đọc.
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

interface DbSessionReport {
  session_id: string;
  restart_count: number;
  cross_live: boolean;
  host_late: boolean;
  ot_minutes: number;
  early_leave_minutes: number;
  status_note: string;
  gmv_total: number | null;
  dashboard_link_1: string | null;
  dashboard_link_2: string | null;
  impression_count: number | null;
  ads_cost: number | null;
  enter_room_rate: number | null;
  ctor: number | null;
  avg_order_value: number | null;
  atc_count: number | null;
  gpm: number | null;
  checkout_count: number | null;
  coin_spent: number | null;
  submitted_by_talent_id: string | null;
  submitted_by_role: UserRole | null;
  submitted_at: string | null;
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

function reportFromDb(row: DbSessionReport): LiveSessionReport {
  return {
    sessionId: row.session_id,
    restartCount: row.restart_count,
    crossLive: row.cross_live,
    hostLate: row.host_late,
    otMinutes: row.ot_minutes ?? 0,
    earlyLeaveMinutes: row.early_leave_minutes ?? 0,
    statusNote: row.status_note,
    gmvTotal: row.gmv_total ?? undefined,
    dashboardLink1: row.dashboard_link_1 ?? undefined,
    dashboardLink2: row.dashboard_link_2 ?? undefined,
    impressionCount: row.impression_count ?? undefined,
    adsCost: row.ads_cost ?? undefined,
    enterRoomRate: row.enter_room_rate ?? undefined,
    ctor: row.ctor ?? undefined,
    avgOrderValue: row.avg_order_value ?? undefined,
    atcCount: row.atc_count ?? undefined,
    gpm: row.gpm ?? undefined,
    checkoutCount: row.checkout_count ?? undefined,
    coinSpent: row.coin_spent ?? undefined,
    submittedByTalentId: row.submitted_by_talent_id ?? undefined,
    submittedByRole: row.submitted_by_role ?? undefined,
    submittedAt: row.submitted_at ?? undefined
  };
}

function sessionFromDb(row: DbLiveSession): Omit<LiveSession, "skus" | "checklist" | "minuteMetrics" | "report"> {
  return {
    id: row.id,
    title: row.title,
    brandId: row.brand_id ?? "",
    brandName: row.brand_name,
    shopTikTokHandle: row.shop_tiktok_handle,
    studioId: row.studio_id ?? "",
    studioName: row.studio_name,
    hostId: row.host_id ?? "",
    hostName: row.host_name,
    assistantId: row.assistant_id ?? undefined,
    assistantName: row.assistant_name,
    coHostId: row.co_host_id ?? undefined,
    coHostName: row.co_host_name,
    platform: row.platform,
    date: row.date,
    startTime: toHhMm(row.start_time),
    endTime: toHhMm(row.end_time),
    status: row.status,
    // View trả NULL cho các cột bị che (brand + tháng chưa phát hành). Ép về 0 để giữ kiểu
    // `number` của LiveSession — nếu không phải sửa lan ra hàng chục component. Số 0 này KHÔNG
    // được hiện thẳng cho brand ("0 đ" đọc như agency bán được 0 đồng): UI phải xét `monthPublished`
    // trước rồi mới quyết hiện số hay hiện "chưa phát hành".
    targetGmv: row.target_gmv ?? 0,
    actualGmv: row.actual_gmv ?? 0,
    totalOrders: row.total_orders ?? 0,
    avgWatchTimeSeconds: row.avg_watch_time_seconds ?? 0,
    peakViewers: row.peak_viewers ?? 0,
    totalViews: row.total_views ?? 0,
    ctrAvg: row.ctr_avg ?? 0,
    cvrAvg: row.cvr_avg ?? 0,
    aiAnalysis: row.ai_analysis ?? undefined,
    dataSource: row.data_source ?? "manual",
    reconciledAt: row.reconciled_at ?? undefined,
    cancelReason: row.cancel_reason || undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    excludedFromReports: row.excluded_from_reports ?? false,
    excludedReason: row.excluded_reason || undefined,
    excludedAt: row.excluded_at ?? undefined,
    tiktokRoomId: row.tiktok_room_id ?? undefined,
    actualStartAt: row.actual_start_at ?? undefined,
    actualEndAt: row.actual_end_at ?? undefined,
    liveDurationMinutes: row.live_duration_minutes ?? undefined,
    attributedItemsSold: row.attributed_items_sold ?? undefined,
    attributedSkuOrders: row.attributed_sku_orders ?? undefined,
    impressions: row.impressions ?? undefined,
    productImpressions: row.product_impressions ?? undefined,
    productClicks: row.product_clicks ?? undefined,
    newFollowers: row.new_followers ?? undefined,
    commentsCount: row.comments_count ?? undefined,
    sharesCount: row.shares_count ?? undefined,
    likesCount: row.likes_count ?? undefined,
    liveRoomIds: row.live_room_ids ?? undefined,
    isBackfill: row.is_backfill ?? false,
    monthPublished: row.month_published ?? true
  };
}

function sessionToDb(s: LiveSession) {
  return {
    title: s.title,
    brand_id: orNull(s.brandId),
    brand_name: s.brandName ?? "",
    shop_tiktok_handle: s.shopTikTokHandle ?? "",
    studio_id: orNull(s.studioId),
    studio_name: s.studioName ?? "",
    host_id: orNull(s.hostId),
    host_name: s.hostName ?? "",
    assistant_id: orNull(s.assistantId),
    assistant_name: s.assistantName ?? "",
    co_host_id: orNull(s.coHostId),
    co_host_name: s.coHostName ?? "",
    platform: s.platform ?? "TikTok",
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

function checklistToDb(sessionId: string, item: ChecklistItem) {
  return {
    session_id: sessionId,
    task: item.task,
    category: item.category,
    completed: item.completed,
    assigned_to: item.assignedTo
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

// CHỈ nạp `live_session_reports`. Ba bảng con còn lại (`session_skus`, `session_checklist_items`,
// `session_minute_metrics`) CỐ Ý không nạp nữa — audit 2026-09-23:
//
//   - Không một màn hình nào đọc `session.skus` / `.checklist` / `.minuteMetrics`. Chúng là di
//     sản của Live Sessions Hub (màn demo: chart phút / checklist / SKU / AI coach) đã xoá hẳn
//     ngày 2026-09-13; grep toàn repo chỉ còn khai báo kiểu trong types.ts và literal `[]` lúc
//     tạo ca ở App.tsx. Trên DB thật cả 3 bảng đang 0 dòng.
//   - Chi phí thì có thật: 229 ca ÷ lô 50 = 5 lô × 4 bảng = 20 request MỖI LẦN TẢI TRANG, và
//     vòng `for ... await` cũ làm các lô chạy NỐI TIẾP nhau — đo được 1078ms → 2955ms, tức gần
//     2 giây chỉ để nhận về 0 dòng.
//
// Đường GHI (replace_session_children / update_session_with_children) giữ nguyên, kiểu LiveSession
// giữ nguyên, 3 trường trả về mảng rỗng — đúng bằng thứ mọi consumer đang thấy hôm nay. Muốn dựng
// lại màn nào cần 3 bảng đó thì nạp riêng cho ĐÚNG ca đang mở, đừng kéo cả bảng lúc mở app.
async function fetchChildRowsForSessions(sessionIds: string[]): Promise<{ reports: DbSessionReport[] }> {
  if (sessionIds.length === 0) return { reports: [] };
  // .in() đi trên query string — hơn vài trăm uuid là vượt giới hạn URL của gateway, nên vẫn chia
  // lô. Mỗi lô cũng chịu trần 1000 dòng của PostgREST (1 report/ca nên 50 ca là 50 dòng).
  // Các lô chạy SONG SONG: chúng độc lập hoàn toàn, nối tiếp chỉ cộng dồn RTT vô ích.
  const CHUNK = 50;
  const chunks: string[][] = [];
  for (let i = 0; i < sessionIds.length; i += CHUNK) chunks.push(sessionIds.slice(i, i + CHUNK));
  const results = await Promise.all(
    chunks.map((ids) => supabase.from("live_session_reports").select("*").in("session_id", ids))
  );
  const reports: DbSessionReport[] = [];
  for (const res of results) {
    if (res.error) throw res.error;
    reports.push(...((res.data as DbSessionReport[]) ?? []));
  }
  return { reports };
}

function assembleSessions(rows: DbLiveSession[], reports: DbSessionReport[]): LiveSession[] {
  // Index trước thay vì .find() trong vòng lặp — assemble chạy trên toàn bộ ca mỗi lần nạp lại.
  const reportBySessionId = new Map<string, DbSessionReport>();
  for (const r of reports) reportBySessionId.set(r.session_id, r);
  return rows.map((row) => {
    const report = reportBySessionId.get(row.id);
    return {
      ...sessionFromDb(row),
      skus: [],
      checklist: [],
      minuteMetrics: [],
      report: report ? reportFromDb(report) : undefined
    };
  });
}

// PostgREST trên Supabase cắt mỗi request ở 1000 dòng (max-rows) và KHÔNG báo lỗi — trước khi có
// nạp bù ca từ file (0086) tổng ca chưa bao giờ chạm ngưỡng, nhưng 4 brand × 6 tháng × ~60 room là
// vượt ngay. Phân trang bằng range() tới khi trang trả về ít hơn PAGE.
const PAGE = 1000;
async function fetchAllSessionRows(): Promise<DbLiveSession[]> {
  const out: DbLiveSession[] = [];
  // Rơi về bảng gốc một lần rồi giữ nguyên cho các trang sau — không thử lại view mỗi trang.
  let source: string = READ_VIEW;
  for (let from = 0; ; from += PAGE) {
    const page = () =>
      supabase
        .from(source)
        .select("*")
        .order("date", { ascending: false })
        .order("start_time", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
    let { data, error } = await page();
    if (error?.code === VIEW_MISSING && source === READ_VIEW) {
      warnViewMissing();
      source = "live_sessions";
      ({ data, error } = await page());
    }
    if (error) throw error;
    const rows = (data as DbLiveSession[]) ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

// Đóng ca đã qua giờ kết thúc mà chưa ai ghi số (0096). Gọi lúc app mở; lỗi thì bỏ qua — client vẫn
// suy trạng thái theo giờ để hiển thị (lib/sessionStatus.ts).
export async function completePastSessions(): Promise<number> {
  const { data, error } = await supabase.rpc("complete_past_sessions");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchSessions(): Promise<LiveSession[]> {
  const rows = await fetchAllSessionRows();
  const { reports } = await fetchChildRowsForSessions(rows.map((r) => r.id));
  return assembleSessions(rows, reports);
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
    minuteMetrics: session.minuteMetrics ?? [],
    report: undefined
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
  const { reports } = await fetchChildRowsForSessions([row.id]);
  return assembleSessions([row], reports)[0];
}

// Dùng sau khi gọi RPC submit_live_session_report (src/lib/db/sessionReports.ts) — RPC đó chỉ
// trả về row live_sessions thô, cần assemble lại đầy đủ (kèm .report) trước khi cập nhật state.
export async function fetchSessionById(id: string): Promise<LiveSession> {
  let { data, error } = await supabase.from(READ_VIEW).select("*").eq("id", id).single();
  if (error?.code === VIEW_MISSING) {
    warnViewMissing();
    ({ data, error } = await supabase.from("live_sessions").select("*").eq("id", id).single());
  }
  if (error) throw error;
  const row = data as DbLiveSession;
  const { reports } = await fetchChildRowsForSessions([row.id]);
  return assembleSessions([row], reports)[0];
}

// Huỷ ca (0097): ca -> Cancelled + slot đã chốt -> cancelled trong 1 transaction; chặn nếu ca đã có số.
// reopenSlot (0113): true = ca chờ đăng ký gắn với ca này về "mở" để ops chốt người khác, giữ
// nguyên đăng ký rảnh cũ + liên kết với ca kế hoạch. false = huỷ hẳn cả slot (hành vi của 0097).
export async function cancelSession(id: string, reason: string, reopenSlot = false): Promise<LiveSession> {
  const { data, error } = await supabase.rpc("cancel_session", { p_session_id: id, p_reason: reason, p_reopen_slot: reopenSlot });
  if (error) throw error;
  const rows = [data as DbLiveSession];
  const { reports } = await fetchChildRowsForSessions([id]);
  return assembleSessions(rows, reports)[0];
}

// Loại ca khỏi báo cáo / đưa trở lại (0114). Đường THAY THẾ cho việc xoá cứng khi ca đã có số:
// `cancel_session` cố ý chặn ca có số, `deleteSession` thì ẩn nút ở UI — nên trước 0114 ca nhập
// nhầm chỉ gỡ được bằng SQL tay. Lý do là bắt buộc khi loại (DB tự chặn, errcode 22023).
export async function setSessionExcluded(id: string, excluded: boolean, reason = ""): Promise<LiveSession> {
  const { data, error } = await supabase.rpc("set_session_excluded", {
    p_session_id: id,
    p_excluded: excluded,
    p_reason: reason
  });
  if (error) throw error;
  const { reports } = await fetchChildRowsForSessions([id]);
  return assembleSessions([data as DbLiveSession], reports)[0];
}

export async function deleteSession(id: string): Promise<void> {
  const { data, error } = await supabase.from("live_sessions").delete().eq("id", id).select("id");
  if (error) throw error;
  assertAffected(data, "xoá ca");
}
