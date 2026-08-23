import * as XLSX from "xlsx";
import { DataRawColumn, DataRawReportType } from "../../types";

// Parser cho module Dataraw Brand Workspace (migration 0052) — 4 report Excel export tay từ
// TikTok Shop Seller Center, mỗi loại có layout khác nhau (xem sample thật đã xem trong phiên
// làm việc). Không chuẩn hoá/tính toán gì ở đây — chỉ tách đúng bảng dữ liệu + header ra khỏi các
// dòng meta (khoảng ngày/bộ lọc) phía trên, giữ nguyên giá trị cell gốc (string/number) vào "raw"
// để lưu y nguyên vào DB, đọc lại được đầy đủ cho deep-dive sau này dù không biết trước schema cột.

export interface ParsedDataRawImport {
  periodLabel?: string;
  periodStart?: string; // ISO date
  periodEnd?: string; // ISO date
  columns: DataRawColumn[];
  summary?: Record<string, unknown>;
  rows: Record<string, unknown>[];
}

function trimTrailingEmpty(row: unknown[]): unknown[] {
  const out = [...row];
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last === null || last === undefined || last === "") out.pop();
    else break;
  }
  return out;
}

// Khử trùng tên cột (product_list có nhiều nhóm chỉ số dùng lại cùng tên "GMV"/"Đơn hàng"...) —
// cột đầu tiên giữ tên gốc làm key, cột trùng sau đó thêm hậu tố __2/__3 để jsonb không đè nhau.
function dedupeHeaders(headers: unknown[]): DataRawColumn[] {
  const seen: Record<string, number> = {};
  return headers.map((h, idx) => {
    const label = (h === null || h === undefined ? "" : String(h)).trim() || `Cột ${idx + 1}`;
    seen[label] = (seen[label] ?? 0) + 1;
    const key = seen[label] === 1 ? label : `${label}__${seen[label]}`;
    return { key, label };
  });
}

function isBlankRow(row: unknown[] | undefined): boolean {
  return !row || row.every((c) => c === null || c === undefined || c === "");
}

function buildRows(rows: unknown[][], startIdx: number, columns: DataRawColumn[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (isBlankRow(r)) continue;
    const raw: Record<string, unknown> = {};
    columns.forEach((c, idx) => { raw[c.key] = r[idx] ?? null; });
    out.push(raw);
  }
  return out;
}

function readSheetRows(file: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
}

// "dd/mm/yyyy" -> "yyyy-mm-dd"
function vnDateToIso(s: string): string | undefined {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return undefined;
  const [, d, mo, y] = m;
  return `${y}-${mo}-${d}`;
}

function parseShopPromotion(rows: unknown[][]): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(/\[Phạm vi ngày\]:\s*([\d\-T:]+)\s*~\s*([\d\-T:]+)/);
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "ID");
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cột "ID") — file có đúng định dạng "Shop Promotion List" từ TikTok Shop không?');
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  return {
    periodLabel: metaLine.replace(/^\[Phạm vi ngày\]:\s*/, "").trim() || undefined,
    periodStart: metaMatch?.[1]?.slice(0, 10),
    periodEnd: metaMatch?.[2]?.slice(0, 10),
    columns,
    rows: buildRows(rows, headerIdx + 1, columns)
  };
}

function parseProductList(rows: unknown[][]): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(/Ngày phân tích:\s*(\d{2}\/\d{2}\/\d{4})~(\d{2}\/\d{2}\/\d{4})/);
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Tên" && String(r[1] ?? "").trim() === "ID sản phẩm");
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cột "Tên"/"ID sản phẩm") — file có đúng định dạng "Product List" từ TikTok Shop không?');
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  return {
    periodLabel: metaLine.replace(/^Ngày phân tích:\s*/, "").trim() || undefined,
    periodStart: metaMatch ? vnDateToIso(metaMatch[1]) : undefined,
    periodEnd: metaMatch ? vnDateToIso(metaMatch[2]) : undefined,
    columns,
    rows: buildRows(rows, headerIdx + 1, columns)
  };
}

function parseLiveAnalysis(rows: unknown[][]): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(/Phạm vi ngày:\s*([\d\-]+)\s*~\s*([\d\-]+)/);
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "ID nhà sáng tạo");
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cột "ID nhà sáng tạo") — file có đúng định dạng "Live Analysis" từ TikTok Shop không?');
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  return {
    periodLabel: metaLine.replace(/^Phạm vi ngày:\s*/, "").trim() || undefined,
    periodStart: metaMatch?.[1],
    periodEnd: metaMatch?.[2],
    columns,
    rows: buildRows(rows, headerIdx + 1, columns)
  };
}

// Shop Analytics có 2 khối tách biệt: "Tổng quan dữ liệu" (2 dòng: Tổng giá trị/Phần trăm thay
// đổi, theo cột chỉ số) rồi "Dữ liệu theo ngày" (bảng theo ngày, header riêng). Khối tổng quan
// lưu vào "summary" ở batch, không trộn vào rows — rows chỉ chứa bảng theo ngày.
function parseShopAnalytics(rows: unknown[][]): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(/Ngày phân tích:\s*(\d{2}\/\d{2}\/\d{4})-(\d{2}\/\d{2}\/\d{4})/);
  const compareLine = String(rows[0]?.[1] ?? "");

  const overviewHeaderIdx = rows.findIndex((r, i) => i > 0 && r && String(r[1] ?? "").trim() === "GMV");
  let summary: Record<string, unknown> | undefined;
  if (overviewHeaderIdx !== -1) {
    const metricHeader = trimTrailingEmpty(rows[overviewHeaderIdx]).slice(1);
    const metricCols = dedupeHeaders(metricHeader);
    const totalsRow = rows[overviewHeaderIdx + 1] ?? [];
    const changeRow = rows[overviewHeaderIdx + 2] ?? [];
    const totals: Record<string, unknown> = {};
    const changePct: Record<string, unknown> = {};
    metricCols.forEach((c, idx) => {
      totals[c.key] = totalsRow[idx + 1] ?? null;
      changePct[c.key] = changeRow[idx + 1] ?? null;
    });
    summary = { totals, changePct };
  }

  const dailyHeaderIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Ngày");
  if (dailyHeaderIdx === -1) {
    throw new Error('Không tìm thấy bảng "Dữ liệu theo ngày" — file có đúng định dạng "Shop Analytics" từ TikTok Shop không?');
  }
  const header = trimTrailingEmpty(rows[dailyHeaderIdx]);
  const columns = dedupeHeaders(header);

  return {
    periodLabel: [metaLine.replace(/^Ngày phân tích:\s*/, "").trim(), compareLine.trim()].filter(Boolean).join(" | ") || undefined,
    periodStart: metaMatch ? vnDateToIso(metaMatch[1]) : undefined,
    periodEnd: metaMatch ? vnDateToIso(metaMatch[2]) : undefined,
    columns,
    summary,
    rows: buildRows(rows, dailyHeaderIdx + 1, columns)
  };
}

// Live Performance Core Stats + Product Card Traffic Stats — cả 2 đều là bảng phẳng theo NGÀY,
// header anchored ở cột "Thời gian" (khác "Ngày" của Shop Analytics), không có khối tổng quan
// riêng như Shop Analytics. Meta dòng đầu khác định dạng nhẹ giữa 2 loại (có/không ngoặc vuông)
// nên vẫn tách 2 hàm riêng thay vì dùng chung 1 regex, để lỗi định dạng báo đúng loại report.
function parseDailyByThoiGianHeader(rows: unknown[][], metaRegex: RegExp, metaPrefix: RegExp, reportLabel: string): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(metaRegex);
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Thời gian");
  if (headerIdx === -1) {
    throw new Error(`Không tìm thấy dòng tiêu đề (cột "Thời gian") — file có đúng định dạng "${reportLabel}" từ TikTok Shop không?`);
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  return {
    periodLabel: metaLine.replace(metaPrefix, "").trim() || undefined,
    periodStart: metaMatch?.[1],
    periodEnd: metaMatch?.[2],
    columns,
    rows: buildRows(rows, headerIdx + 1, columns)
  };
}

function parseLivePerformanceCoreStats(rows: unknown[][]): ParsedDataRawImport {
  return parseDailyByThoiGianHeader(rows, /Phạm vi ngày:\s*([\d\-]+)\s*~\s*([\d\-]+)/, /^Phạm vi ngày:\s*/, "Live Performance Core Stats");
}

function parseProductCardTrafficStats(rows: unknown[][]): ParsedDataRawImport {
  return parseDailyByThoiGianHeader(rows, /\[Phạm vi ngày\]:\s*([\d\-]+)\s*~\s*([\d\-]+)/, /^\[Phạm vi ngày\]:\s*/, "Product Card Traffic Stats");
}

// Creator-Live-Performance (migration 0066) — xuất từ TikTok Creator Center, tiếng Anh, 1
// dòng/phiên live theo Room ID (khác live_analysis theo Seller Center). Meta dòng đầu chỉ là
// "yyyy-mm-dd ~ yyyy-mm-dd" trần, không có prefix chữ nào cả — khác mọi report khác.
function parseCreatorLivePerformance(rows: unknown[][]): ParsedDataRawImport {
  const metaLine = String(rows[0]?.[0] ?? "");
  const metaMatch = metaLine.match(/^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/);
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Room ID");
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cột "Room ID") — file có đúng định dạng "Creator-Live-Performance" từ TikTok không?');
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  return {
    periodLabel: metaLine.trim() || undefined,
    periodStart: metaMatch?.[1],
    periodEnd: metaMatch?.[2],
    columns,
    rows: buildRows(rows, headerIdx + 1, columns)
  };
}

// "..._20260701-20260731.xlsx" -> {start: "2026-07-01", end: "2026-07-31"}
function periodFromFileName(fileName: string): { start?: string; end?: string } {
  const m = fileName.match(/(\d{4})(\d{2})(\d{2})-(\d{4})(\d{2})(\d{2})/);
  if (!m) return {};
  const [, y1, m1, d1, y2, m2, d2] = m;
  return { start: `${y1}-${m1}-${d1}`, end: `${y2}-${m2}-${d2}` };
}

// Transaction Analysis — Creator List (migration 0074) — export tiếng Anh từ TikTok Shop Partner
// Center, 1 dòng/creator affiliate. Khác mọi report khác ở chỗ hàng 0 LÀ header luôn (không có
// dòng meta phạm vi ngày riêng), hàng 1 là mô tả cột (bỏ qua) rồi mới tới data — nên kỳ báo cáo
// phải lấy từ chính tên file (dạng "..._YYYYMMDD-YYYYMMDD.xlsx").
function parseTransactionAnalysisCreatorList(rows: unknown[][], fileName: string): ParsedDataRawImport {
  const headerIdx = rows.findIndex((r) => r && String(r[0] ?? "").trim() === "Creator name");
  if (headerIdx === -1) {
    throw new Error('Không tìm thấy dòng tiêu đề (cột "Creator name") — file có đúng định dạng "Transaction Analysis - Creator List" từ TikTok Shop Partner Center không?');
  }
  const header = trimTrailingEmpty(rows[headerIdx]);
  const columns = dedupeHeaders(header);
  const period = periodFromFileName(fileName);
  return {
    periodLabel: period.start && period.end ? `${period.start} ~ ${period.end}` : undefined,
    periodStart: period.start,
    periodEnd: period.end,
    columns,
    // headerIdx + 2: hàng headerIdx + 1 là dòng mô tả cột (text dài, không phải data), bỏ qua.
    rows: buildRows(rows, headerIdx + 2, columns)
  };
}

export async function parseDataRawExcel(file: File, reportType: DataRawReportType): Promise<ParsedDataRawImport> {
  const buf = await file.arrayBuffer();
  const rows = readSheetRows(buf);
  switch (reportType) {
    case "shop_promotion": return parseShopPromotion(rows);
    case "product_list": return parseProductList(rows);
    case "live_analysis": return parseLiveAnalysis(rows);
    case "shop_analytics": return parseShopAnalytics(rows);
    case "live_performance_core_stats": return parseLivePerformanceCoreStats(rows);
    case "product_card_traffic_stats": return parseProductCardTrafficStats(rows);
    case "creator_live_performance": return parseCreatorLivePerformance(rows);
    case "transaction_analysis_creator_list": return parseTransactionAnalysisCreatorList(rows, file.name);
  }
}
