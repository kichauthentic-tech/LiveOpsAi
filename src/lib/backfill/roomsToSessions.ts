// Nạp bù ca từ file Creator-Live-Performance (migration 0086) — phần logic thuần, không import
// supabaseClient để unit test chạy được (xem quy ước ở lib/performance/targetAllocation.ts).
import { LiveSession } from "../../types";
import { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";

// Đúng hình dạng 1 phần tử p_rows của RPC create_backfill_sessions.
export interface BackfillRoomPayload {
  room_id: string;
  room_title: string;
  started_at: string;
  ended_at: string;
  duration_minutes: number;
  gmv: number;
  orders: number;
  items_sold: number;
  sku_orders: number;
  views: number;
  impressions: number;
  product_impressions: number;
  product_clicks: number;
  new_followers: number;
  comments: number;
  shares: number;
  likes: number;
  avg_view_duration_sec: number;
}

// Cùng lý do với extractRooms.ts: cột "Duration" làm tròn xuống phút, lấy hiệu End−Start làm chuẩn.
function durationMinutes(r: CreatorLivePerfRow): number {
  if (r.endTime) {
    const ms = new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
    if (Number.isFinite(ms) && ms > 0) return Math.round((ms / 60000) * 10000) / 10000;
  }
  return Math.round(r.hours * 60 * 10000) / 10000;
}

export function roomToPayload(r: CreatorLivePerfRow): BackfillRoomPayload | null {
  if (!r.roomId || !r.startTime || !r.endTime) return null;
  return {
    room_id: r.roomId,
    room_title: r.roomTitle ?? "",
    started_at: r.startTime,
    ended_at: r.endTime,
    duration_minutes: durationMinutes(r),
    gmv: r.gmv,
    orders: r.orders,
    items_sold: r.itemsSold,
    sku_orders: r.skuOrders,
    views: r.views,
    impressions: r.impressions,
    product_impressions: r.productImpressions,
    product_clicks: r.productClicks,
    new_followers: r.newFollowers,
    comments: r.comments,
    shares: r.shares,
    likes: r.likes,
    avg_view_duration_sec: r.avgViewDurationSec
  };
}

// Room đã thuộc ca nào của brand (snapshot lúc giao ca, đối soát, hoặc lần sinh trước) — cùng
// điều kiện với skip-check trong RPC, để UI báo trước "sẽ tạo N / đã có M" khớp với kết quả thật.
export function roomIdsLinkedToSessions(sessions: LiveSession[], brandId: string): Set<string> {
  const out = new Set<string>();
  for (const s of sessions) {
    if (s.brandId !== brandId) continue;
    if (s.tiktokRoomId) out.add(s.tiktokRoomId);
    for (const id of s.liveRoomIds ?? []) out.add(id);
  }
  return out;
}

export interface BackfillPlan {
  toCreate: BackfillRoomPayload[];
  existing: number;
  invalid: number;
  // Room dài bất thường — thường là host không tắt stream giữa 2 ca, nên gợi ý tách sau khi sinh.
  longRooms: BackfillRoomPayload[];
}

export const LONG_ROOM_MINUTES = 5 * 60;

export function planBackfill(rows: CreatorLivePerfRow[], linked: Set<string>): BackfillPlan {
  const plan: BackfillPlan = { toCreate: [], existing: 0, invalid: 0, longRooms: [] };
  const seen = new Set<string>();
  for (const r of rows) {
    const p = roomToPayload(r);
    if (!p) { plan.invalid++; continue; }
    if (seen.has(p.room_id)) continue; // file có thể lặp room khi ops up nhiều batch chồng ngày
    seen.add(p.room_id);
    if (linked.has(p.room_id)) { plan.existing++; continue; }
    plan.toCreate.push(p);
    if (p.duration_minutes >= LONG_ROOM_MINUTES) plan.longRooms.push(p);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Lưới gán host: ngày × "Ca 1..N" (thứ tự ca trong ngày theo giờ bắt đầu)
// ---------------------------------------------------------------------------
export interface HostGridCell {
  session: LiveSession;
  col: number; // 0-based: Ca 1, Ca 2...
}
export interface HostGridRow {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = CN
  cells: (HostGridCell | null)[];
}
export interface HostGrid {
  rows: HostGridRow[];
  columns: number;
}

export function buildHostGrid(sessions: LiveSession[], brandId: string, month: string): HostGrid {
  const byDate = new Map<string, LiveSession[]>();
  for (const s of sessions) {
    if (s.brandId !== brandId || !s.date.startsWith(month) || s.status === "Cancelled") continue;
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  let columns = 0;
  const rows: HostGridRow[] = [];
  for (const [date, list] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => (a.actualStartAt ?? a.startTime).localeCompare(b.actualStartAt ?? b.startTime) || a.startTime.localeCompare(b.startTime));
    columns = Math.max(columns, list.length);
    const [y, m, d] = date.split("-").map(Number);
    rows.push({ date, weekday: new Date(y, m - 1, d).getDay(), cells: list.map((session, col) => ({ session, col })) });
  }
  for (const r of rows) while (r.cells.length < columns) r.cells.push(null);
  return { rows, columns };
}

export interface HostAssignment {
  hostId: string; // "" = trống
  coHostId: string;
}
export type DraftAssignments = Record<string, HostAssignment>; // sessionId → draft

export function currentAssignment(s: LiveSession): HostAssignment {
  return { hostId: s.hostId ?? "", coHostId: s.coHostId ?? "" };
}

// "Điền theo thứ": mọi ô ở cột `col` rơi vào các thứ đã chọn nhận cùng một cặp host/trợ.
// `onlyEmpty` = chỉ điền ô đang trống (không đè ca đã gán tay).
export function fillByWeekday(
  grid: HostGrid,
  draft: DraftAssignments,
  opts: { weekdays: Set<number>; col: number; hostId?: string; coHostId?: string; onlyEmpty: boolean }
): DraftAssignments {
  const next = { ...draft };
  for (const row of grid.rows) {
    if (!opts.weekdays.has(row.weekday)) continue;
    const cell = row.cells[opts.col];
    if (!cell) continue;
    const cur = next[cell.session.id] ?? currentAssignment(cell.session);
    const patch: HostAssignment = { ...cur };
    if (opts.hostId !== undefined && (!opts.onlyEmpty || !cur.hostId)) patch.hostId = opts.hostId;
    if (opts.coHostId !== undefined && (!opts.onlyEmpty || !cur.coHostId)) patch.coHostId = opts.coHostId;
    next[cell.session.id] = patch;
  }
  return next;
}

// "Sao chép tháng trước": khớp theo (thứ trong tuần, cột) — ca T2 Ca 1 tháng trước là ai thì T2 Ca 1
// tháng này là người đó. Lấy người xuất hiện nhiều nhất trong ô (thứ, cột) của tháng trước.
export function copyFromPreviousMonth(grid: HostGrid, prev: HostGrid, draft: DraftAssignments, onlyEmpty: boolean): DraftAssignments {
  const tally = new Map<string, Map<string, number>>(); // "weekday|col" → "host|cohost" → count
  for (const row of prev.rows) {
    row.cells.forEach((cell, col) => {
      if (!cell) return;
      const a = currentAssignment(cell.session);
      if (!a.hostId && !a.coHostId) return;
      const k = `${row.weekday}|${col}`;
      const m = tally.get(k) ?? new Map<string, number>();
      const v = `${a.hostId}|${a.coHostId}`;
      m.set(v, (m.get(v) ?? 0) + 1);
      tally.set(k, m);
    });
  }
  const next = { ...draft };
  for (const row of grid.rows) {
    row.cells.forEach((cell, col) => {
      if (!cell) return;
      const m = tally.get(`${row.weekday}|${col}`);
      if (!m) return;
      const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const [hostId, coHostId] = best.split("|");
      const cur = next[cell.session.id] ?? currentAssignment(cell.session);
      next[cell.session.id] = {
        hostId: !onlyEmpty || !cur.hostId ? hostId : cur.hostId,
        coHostId: !onlyEmpty || !cur.coHostId ? coHostId : cur.coHostId
      };
    });
  }
  return next;
}

// Chỉ những ca có thay đổi so với DB mới gửi lên RPC.
export function diffAssignments(sessions: LiveSession[], draft: DraftAssignments): { session_id: string; host_id: string | null; co_host_id: string | null }[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const out: { session_id: string; host_id: string | null; co_host_id: string | null }[] = [];
  for (const [id, a] of Object.entries(draft)) {
    const s = byId.get(id);
    if (!s) continue;
    const cur = currentAssignment(s);
    if (cur.hostId === a.hostId && cur.coHostId === a.coHostId) continue;
    out.push({ session_id: id, host_id: a.hostId || null, co_host_id: a.coHostId || null });
  }
  return out;
}

export function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
}
