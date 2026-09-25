import { supabase } from "../supabaseClient";

/** PostgREST trả tối đa 1000 dòng/truy vấn và KHÔNG báo lỗi khi cắt — product_list một tháng đã
 *  1.164-1.181 dòng nên không phân trang là mất dữ liệu âm thầm (đã dính đúng lỗi này 2026-09-23:
 *  4 tháng product_list ra 120 SKU thay vì 4.601). Luôn đọc theo trang cho tới khi hết. */
const PAGE = 1000;

export async function fetchRowsPaged(importIds: string[]): Promise<Map<string, Record<string, unknown>[]>> {
  const byImport = new Map<string, Record<string, unknown>[]>();
  if (importIds.length === 0) return byImport;
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("brand_dataraw_rows")
      .select("import_id, raw")
      .in("import_id", importIds)
      .order("import_id", { ascending: true })
      .order("row_index", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data as { import_id: string; raw: Record<string, unknown> }[]) ?? [];
    for (const r of page) {
      const list = byImport.get(r.import_id) ?? [];
      list.push(r.raw ?? {});
      byImport.set(r.import_id, list);
    }
    if (page.length < PAGE) break;
    from += PAGE;
  }
  return byImport;
}
