import { supabase } from "../supabaseClient";
import { BrandDataRawImport, BrandDataRawRow, DataRawReportType } from "../../types";
import { ParsedDataRawImport } from "../dataraw/parseDataRawExcel";

// Module Dataraw Brand Workspace (migration 0052) — xem lib/dataraw/parseDataRawExcel.ts cho
// cách tách bảng dữ liệu từ 4 loại file Excel TikTok Shop. File chỉ lo CRUD import batch + rows.

interface DbImport {
  id: string;
  brand_id: string;
  report_type: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  file_name: string | null;
  columns: BrandDataRawImport["columns"];
  summary: Record<string, unknown> | null;
  row_count: number;
  imported_at: string;
}

function importFromDb(row: DbImport): BrandDataRawImport {
  return {
    id: row.id,
    brandId: row.brand_id,
    reportType: row.report_type as DataRawReportType,
    periodLabel: row.period_label ?? undefined,
    periodStart: row.period_start ?? undefined,
    periodEnd: row.period_end ?? undefined,
    fileName: row.file_name ?? undefined,
    columns: row.columns ?? [],
    summary: row.summary ?? undefined,
    rowCount: row.row_count,
    importedAt: row.imported_at
  };
}

export async function fetchDataRawImports(brandId: string, reportType: DataRawReportType): Promise<BrandDataRawImport[]> {
  const { data, error } = await supabase
    .from("brand_dataraw_imports")
    .select("*")
    .eq("brand_id", brandId)
    .eq("report_type", reportType)
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return ((data as DbImport[]) ?? []).map(importFromDb);
}

interface DbRow {
  id: string;
  import_id: string;
  row_index: number;
  raw: Record<string, unknown>;
}

export async function fetchDataRawRows(importId: string): Promise<BrandDataRawRow[]> {
  const { data, error } = await supabase
    .from("brand_dataraw_rows")
    .select("*")
    .eq("import_id", importId)
    .order("row_index", { ascending: true });
  if (error) throw error;
  return ((data as DbRow[]) ?? []).map((r) => ({ id: r.id, importId: r.import_id, rowIndex: r.row_index, raw: r.raw ?? {} }));
}

const ROW_INSERT_CHUNK = 500;

// "YYYY-MM-DD" -> "YYYY-MM". TikTok export period luôn bắt đầu từ đầu tháng ("Ngày phân tích: 01/08~...")
// nên dùng tháng của periodStart làm khoá gộp — 1 tháng chỉ có đúng 1 batch/report type/brand.
function monthKey(periodStart?: string): string | undefined {
  return periodStart ? periodStart.slice(0, 7) : undefined;
}

// Tìm import cùng tháng (cùng brand+reportType, đã lọc sẵn ở call site) để quyết định ghi đè thay
// vì tạo batch mới — dùng khi ops upload lại report trong tháng đang chạy (TikTok export luôn
// cộng dồn từ đầu tháng nên bản sau là superset của bản trước, không nên cộng dồn dòng trùng).
export function findExistingImportForMonth(imports: BrandDataRawImport[], periodStart?: string): BrandDataRawImport | undefined {
  const key = monthKey(periodStart);
  if (!key) return undefined;
  return imports.find((i) => monthKey(i.periodStart) === key);
}

async function insertRowsChunked(importId: string, rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += ROW_INSERT_CHUNK) {
    const chunk = rows.slice(i, i + ROW_INSERT_CHUNK).map((raw, idx) => ({
      import_id: importId,
      row_index: i + idx,
      raw
    }));
    const { error } = await supabase.from("brand_dataraw_rows").insert(chunk);
    if (error) throw error;
  }
}

// replaceImportId: nếu có nghĩa là ghi đè batch tháng đã tồn tại (xoá rows cũ, update metadata,
// insert rows mới) thay vì tạo batch mới — quyết định replace-hay-tạo-mới do UI làm qua
// findExistingImportForMonth() trước khi gọi, để còn cảnh báo ops trước khi ghi đè.
export async function createOrReplaceDataRawImport(
  brandId: string,
  reportType: DataRawReportType,
  fileName: string,
  parsed: ParsedDataRawImport,
  replaceImportId?: string
): Promise<BrandDataRawImport> {
  if (replaceImportId) {
    const { error: delRowsError } = await supabase.from("brand_dataraw_rows").delete().eq("import_id", replaceImportId);
    if (delRowsError) throw delRowsError;

    const { data: batchData, error: batchError } = await supabase
      .from("brand_dataraw_imports")
      .update({
        period_label: parsed.periodLabel ?? null,
        period_start: parsed.periodStart ?? null,
        period_end: parsed.periodEnd ?? null,
        file_name: fileName,
        columns: parsed.columns,
        summary: parsed.summary ?? null,
        row_count: parsed.rows.length,
        imported_at: new Date().toISOString()
      })
      .eq("id", replaceImportId)
      .select()
      .single();
    if (batchError) throw batchError;
    const batch = importFromDb(batchData as DbImport);
    await insertRowsChunked(batch.id, parsed.rows);
    return batch;
  }

  const { data: batchData, error: batchError } = await supabase
    .from("brand_dataraw_imports")
    .insert({
      brand_id: brandId,
      report_type: reportType,
      period_label: parsed.periodLabel ?? null,
      period_start: parsed.periodStart ?? null,
      period_end: parsed.periodEnd ?? null,
      file_name: fileName,
      columns: parsed.columns,
      summary: parsed.summary ?? null,
      row_count: parsed.rows.length
    })
    .select()
    .single();
  if (batchError) throw batchError;
  const batch = importFromDb(batchData as DbImport);
  await insertRowsChunked(batch.id, parsed.rows);
  return batch;
}

export async function deleteDataRawImport(importId: string): Promise<void> {
  const { error } = await supabase.from("brand_dataraw_imports").delete().eq("id", importId);
  if (error) throw error;
}
