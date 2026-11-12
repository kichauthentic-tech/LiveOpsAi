import { supabase } from "../supabaseClient";

/** PostgREST trả tối đa 1000 dòng/truy vấn và KHÔNG báo lỗi khi cắt — product_list một tháng đã
 *  1.164-1.181 dòng nên không phân trang là mất dữ liệu âm thầm (đã dính đúng lỗi này 2026-09-23:
 *  4 tháng product_list ra 120 SKU thay vì 4.601). Luôn đọc theo trang cho tới khi hết. */
const PAGE = 1000;

// CACHE DÒNG THÔ THEO import_id (11/11) — ngoại lệ có chủ ý của luật "không cache ở lớp đọc" (WORKSPACE §5.3).
// Đo bảng 10/11: brand_dataraw_rows 48 MB / 23.785 dòng (~2 KB/dòng) lớn gấp ~18 lần bảng lớn thứ hai, và mọi lát cắt
// (Report Tháng, Dashboard kỳ, SKU, Kế toán, báo cáo tuần, Affiliate) đều đọc LẠI TRỌN dòng của cả đợt mỗi lần mở màn
// ⇒ egress Supabase Free tăng vọt. Dòng của một đợt nhập chỉ đổi khi upload ghi đè / xoá (cùng id, xem
// `invalidateRawRowsCache` gọi ở brandDataRaw.ts), nên giữ trong bộ nhớ của tab là an toàn; hạn dùng + dấu của đợt
// lo trường hợp máy KHÁC ghi đè đợt. Hai lời gọi chồng nhau dùng chung request đang bay.
// Hết hạn KHÔNG tải lại ngay: hỏi "dấu" của đợt (imported_at + row_count, ~100 byte/đợt) — đợt chưa bị ghi đè thì dùng tiếp
// bản trong bộ nhớ. Máy mở cả ngày vì thế chỉ tải dòng của mỗi đợt một lần, mà vẫn thấy bản ghi đè từ máy khác sau ≤ 10 phút.
const TTL_MS = 10 * 60_000;
const MAX_CACHED_ROWS = 12_000; // ~25 MB JS heap; vượt thì bỏ đợt cũ nhất
type Rows = Record<string, unknown>[];
/** stamp = imported_at của đợt lúc nạp; undefined = không xác nhận được (lỗi đọc dấu / số dòng lệch row_count) ⇒ hết hạn là tải lại. */
const cache = new Map<string, { rows: Rows; at: number; stamp?: string }>();
const pending = new Map<string, Promise<void>>();
let cachedRows = 0;

function evict(id: string) {
  const e = cache.get(id);
  if (e) cachedRows -= e.rows.length;
  cache.delete(id);
}

/** Gọi khi dòng của đợt nhập đổi (ghi đè, xoá). Không truyền id ⇒ xoá hết. */
export function invalidateRawRowsCache(importId?: string): void {
  if (importId === undefined) {
    cache.clear();
    pending.clear();
    cachedRows = 0;
    return;
  }
  evict(importId);
  pending.delete(importId);
}

async function fetchStamps(ids: string[]): Promise<Map<string, { stamp: string; rowCount: number | null }> | null> {
  try {
    const { data, error } = await supabase.from("brand_dataraw_imports").select("id, imported_at, row_count").in("id", ids);
    if (error) return null;
    return new Map(((data as { id: string; imported_at: string; row_count: number | null }[]) ?? []).map((r) => [r.id, { stamp: r.imported_at, rowCount: r.row_count }]));
  } catch {
    return null;
  }
}

async function readRows(ids: string[]): Promise<Map<string, Rows>> {
  const got = new Map<string, Rows>(ids.map((id) => [id, []]));
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("brand_dataraw_rows")
      .select("import_id, raw")
      .in("import_id", ids)
      .order("import_id", { ascending: true })
      .order("row_index", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data as { import_id: string; raw: Record<string, unknown> }[]) ?? [];
    for (const r of page) got.get(r.import_id)?.push(r.raw ?? {});
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return got;
}

function store(got: Map<string, Rows>, stamps: Map<string, { stamp: string; rowCount: number | null }> | null) {
  const now = Date.now();
  for (const [id, rows] of got) {
    evict(id);
    const s = stamps?.get(id);
    // Số dòng lệch row_count = đọc trúng lúc đợt đang bị ghi đè dở ⇒ không gắn dấu, hết hạn sẽ tải lại.
    cache.set(id, { rows, at: now, stamp: s && s.rowCount === rows.length ? s.stamp : undefined });
    cachedRows += rows.length;
  }
  // Giữ trần bộ nhớ: bỏ đợt cũ nhất (Map giữ thứ tự chèn), trừ các đợt vừa nạp.
  for (const id of cache.keys()) {
    if (cachedRows <= MAX_CACHED_ROWS) break;
    if (!got.has(id)) evict(id);
  }
}

/** ids chưa có trong cache (fresh) hoặc đã hết hạn (stale): xác nhận dấu cho stale, tải dòng cho phần còn lại. */
async function loadOrRevalidate(fresh: string[], stale: string[]): Promise<void> {
  // Dấu đọc TRƯỚC/song song với dòng: có ghi đè chen giữa thì dấu cũ hơn dòng ⇒ lần sau tải thừa, không giữ bản cũ.
  const stampsP = fetchStamps([...fresh, ...stale]);
  let toLoad = fresh;
  if (stale.length > 0) {
    const stamps = await stampsP;
    const now = Date.now();
    const changed: string[] = [];
    for (const id of stale) {
      const e = cache.get(id);
      if (e && e.stamp !== undefined && stamps?.get(id)?.stamp === e.stamp) e.at = now;
      else changed.push(id);
    }
    toLoad = [...fresh, ...changed];
  }
  if (toLoad.length === 0) return;
  const [got, st] = await Promise.all([readRows(toLoad), stampsP]);
  store(got, st);
}

export async function fetchRowsPaged(importIds: string[]): Promise<Map<string, Rows>> {
  const byImport = new Map<string, Rows>();
  if (importIds.length === 0) return byImport;
  const now = Date.now();
  const fresh: string[] = [];
  const stale: string[] = [];
  for (const id of new Set(importIds)) {
    if (pending.has(id)) continue;
    const e = cache.get(id);
    if (!e) fresh.push(id);
    else if (now - e.at >= TTL_MS) stale.push(id);
  }
  if (fresh.length + stale.length > 0) {
    const ids = [...fresh, ...stale];
    const p = loadOrRevalidate(fresh, stale).finally(() => {
      for (const id of ids) if (pending.get(id) === p) pending.delete(id);
    });
    for (const id of ids) pending.set(id, p);
  }
  await Promise.all(importIds.map((id) => pending.get(id)).filter((p): p is Promise<void> => !!p));
  for (const id of importIds) {
    // Mảng mới mỗi lời gọi để caller có push/sort không làm hỏng bản trong cache (dòng `raw` dùng chung, chỉ đọc).
    const e = cache.get(id);
    if (e && e.rows.length > 0) byImport.set(id, [...e.rows]);
  }
  return byImport;
}
