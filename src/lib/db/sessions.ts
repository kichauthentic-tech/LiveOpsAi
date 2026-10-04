import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { fetchAllPages } from "./fetchAllPages";
import { LiveSession, LiveSessionReport, UserRole } from "../../types";

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

function sessionFromDb(row: DbLiveSession): Omit<LiveSession, "report"> {
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

// Report của từng ca. (Ba bảng con session_skus/checklist/minute_metrics — di sản Live Sessions Hub,
// 0 dòng, không màn nào đọc — đã bỏ hẳn ở migration 0132.)
async function fetchChildRowsForSessions(sessionIds: string[]): Promise<{ reports: DbSessionReport[] }> {
  if (sessionIds.length === 0) return { reports: [] };
  // Đường MỞ MỘT CA (SessionWindow, sau khi lưu): lọc đúng ca đó. Danh sách luôn ngắn nên không
  // cần chia lô — đường nạp cả Sổ Ca đã tách sang fetchAllReports() bên dưới.
  const { data, error } = await supabase.from("live_session_reports").select("*").in("session_id", sessionIds);
  if (error) throw error;
  return { reports: (data as DbSessionReport[]) ?? [] };
}

// Đường NẠP CẢ SỔ CA — KHÔNG lọc theo session_id, chỉ cuộn trang.
//
// Đo trên production 2026-10-01 bằng chính phiên admin đang đăng nhập, máy rảnh, 3 lượt mỗi bên
// (bỏ lượt đầu vì kết nối lạnh), 229 ca:
//
//     cách cũ — 5 lô `.in()` song song : 578 / 993 / 1405 ms
//     cách này — 1 request cuộn trang  : 119 /  172 /  489 ms      ⇒ nhanh ~4,9× và ổn định hơn hẳn
//
// Trên lần nạp Sổ Ca thật, 5 lô đó chiếm 1.528ms của tổng 1.920ms wall-clock — tức gần như TOÀN BỘ
// đường găng, và `live_session_reports` hôm nay còn đang RỖNG (0 dòng): y hệt thứ audit 2026-09-23
// đã bắt được ở 3 bảng con kia ("gần 2 giây chỉ để nhận về 0 dòng"). Lần đó bỏ hẳn 3 bảng vì không
// màn nào đọc; bảng này thì CÓ đọc thật (sessionIncidents trong lib/sessionLedger.ts, SessionWindow)
// nên không bỏ được — chỉ bỏ cách chia lô.
//
// Vì sao bỏ bộ lọc mà vẫn ra đúng kết quả:
//   • policy của bảng này là `live_session_reports_read_no_brand` (0112) — gate THEO ROLE, không
//     theo ca: role không phải brand thấy tất, brand không thấy gì. Lọc theo session_id không thêm
//     một lớp quyền nào.
//   • `fetchSessions()` vốn nạp TOÀN BỘ ca (fetchAllSessionRows cuộn hết trang), và assembleSessions
//     ghép bằng Map theo id — report của ca không nằm trong danh sách thì bị bỏ qua, không gây sai.
//   • bảng là 1-1 với live_sessions (`session_id` là primary key) nên số dòng không bao giờ vượt
//     số ca; cuộn trang lo phần tăng trưởng.
async function fetchAllReports(): Promise<DbSessionReport[]> {
  return fetchAllPages<DbSessionReport>((from, to) =>
    supabase.from("live_session_reports").select("*").order("session_id", { ascending: true }).range(from, to)
  );
}

function assembleSessions(rows: DbLiveSession[], reports: DbSessionReport[]): LiveSession[] {
  // Index trước thay vì .find() trong vòng lặp — assemble chạy trên toàn bộ ca mỗi lần nạp lại.
  const reportBySessionId = new Map<string, DbSessionReport>();
  for (const r of reports) reportBySessionId.set(r.session_id, r);
  return rows.map((row) => {
    const report = reportBySessionId.get(row.id);
    return {
      ...sessionFromDb(row),
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
  // Hai lượt đọc này độc lập nhau — nối tiếp chỉ cộng dồn RTT vô ích.
  const [rows, reports] = await Promise.all([fetchAllSessionRows(), fetchAllReports()]);
  return assembleSessions(rows, reports);
}

// Chốt người cho ca chờ đăng ký (0133): tạo ca + đánh dấu slot "finalized" trong MỘT transaction, khoá dòng
// slot. Trước đây client ghi 2 bước (insert ca rồi update slot) không kiểm slot còn mở — hai người bấm chốt
// cùng một ca là ra 2 ca, bước 2 lỗi thì phải tự xoá ca mồ côi.
export async function finalizeShiftSlot(slotId: string, hostId: string, coHostId: string | null): Promise<LiveSession> {
  const { data, error } = await supabase.rpc("finalize_shift_slot", { p_slot_id: slotId, p_host_id: hostId, p_co_host_id: coHostId });
  if (error) throw error;
  return { ...sessionFromDb(data as DbLiveSession), report: undefined };
}

export async function updateSession(session: LiveSession): Promise<LiveSession> {
  // RPC thay vì `.update()` thẳng: hàm tự raise khi RLS lọc còn 0 dòng (PostgREST thì im lặng trả 204).
  // Từ 0133 hàm CHỈ ghi cột lịch + người (ngày/giờ/phòng/host/trợ) — các cột số liệu trong payload bị bỏ qua,
  // vì bản client có thể cũ hơn số trợ live vừa up (không có realtime). Trạng thái do DB tự suy; ca đã có số
  // thì DB không cho dời ngày/giờ. Tên còn chữ "children" là di sản (3 bảng con đã bỏ ở 0132).
  const { data, error } = await supabase.rpc("update_session_with_children", {
    p_session_id: session.id,
    p_session: sessionToDb(session)
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
