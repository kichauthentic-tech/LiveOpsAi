import type { LiveSession, ShiftSlot } from "../../types";
import { buildRosterShifts, shiftHours, type RosterShift } from "./rules";

// Xuất lịch live gửi brand xác nhận (09/11). Sau khi chốt lịch + mở ca đăng ký, ops cần 1 file Excel dạng lịch tháng
// (T2…CN, mỗi tuần một hàng ngày + các khung giờ xếp dọc, bảng Khung giờ / Số ca / Số giờ bên phải) cho từng brand.
// File gửi brand KHÔNG có tên host/trợ, tiền, target — chỉ ngày + khung giờ. Mỗi brand một file riêng (không bao giờ
// nhét brand khác vào file của brand này); bản gộp một file chỉ để xem nội bộ.
// Tách 2 lớp: `buildChannelCalendar` thuần (có test) dựng bố cục; `exportBrandSchedules` mới đụng ExcelJS/JSZip (tải động).

export type ExportPlatform = "TikTok" | "Shopee";
const PLATFORM_ORDER: Record<ExportPlatform, number> = { TikTok: 0, Shopee: 1 };
/** Tiền tố tiêu đề như file mẫu brand ("TTS VERA THÁNG 10 - 2026"). */
const TITLE_PREFIX: Record<ExportPlatform, string> = { TikTok: "TTS", Shopee: "SHOPEE" };

export interface ScheduleChannel {
  brandId: string;
  brandName: string;
  platform: ExportPlatform;
  /** Ca đã lên lịch + ca mở (đã trừ ca huỷ) trong tháng, đã sắp theo ngày/giờ. */
  shifts: RosterShift[];
  shiftCount: number;
  hours: number;
}

export interface CalendarWeek {
  /** 7 ô T2…CN: ngày "YYYY-MM-DD" hoặc null nếu ngoài tháng. */
  dates: (string | null)[];
  /** Các hàng khung giờ; mỗi hàng 7 ô (chuỗi "10:00 - 13:00" hoặc null). Ít nhất 1 hàng. */
  rows: (string | null)[][];
}

export interface CalendarSummaryRow {
  frame: string;
  count: number;
  hours: number;
}

export interface ChannelCalendar {
  weeks: CalendarWeek[];
  summary: CalendarSummaryRow[];
  totalCount: number;
  totalHours: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "09:00" → "9:00", "10:00" → "10:00", "00:30" → "00:30" — đúng cách file mẫu của brand ghi khung giờ (bỏ số 0 đầu của 1–9 giờ, giữ "00"). */
export const fmtClock = (t: string) => {
  const h = Number(t.slice(0, 2));
  return `${h === 0 ? "00" : h}:${t.slice(3, 5)}`;
};
export const fmtFrame = (start: string, end: string) => `${fmtClock(start)} - ${fmtClock(end)}`;

/** Thứ trong tuần kiểu T2=0 … CN=6 của "YYYY-MM-DD" (tính theo UTC để không lệch múi giờ máy). */
function weekdayIndex(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = CN
  return (d + 6) % 7;
}

function addDaysIso(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

/** Mọi kênh (brand × sàn) có ít nhất 1 ca trong tháng — TikTok trước Shopee, brand theo tên. */
export function collectScheduleChannels(sessions: readonly LiveSession[], slots: readonly ShiftSlot[], month: string): ScheduleChannel[] {
  const { from, to } = monthBounds(month);
  const shifts = buildRosterShifts(sessions, slots, [], [], from, to);
  const by = new Map<string, ScheduleChannel>();
  for (const s of shifts) {
    const key = `${s.brandId}|${s.platform}`;
    let ch = by.get(key);
    if (!ch) {
      ch = { brandId: s.brandId, brandName: s.brandName, platform: s.platform, shifts: [], shiftCount: 0, hours: 0 };
      by.set(key, ch);
    }
    ch.shifts.push(s);
    ch.shiftCount += 1;
    ch.hours += shiftHours(s);
  }
  return [...by.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, "vi") || PLATFORM_ORDER[a.platform] - PLATFORM_ORDER[b.platform]);
}

/** Dựng bố cục lịch tháng của 1 kênh. `month` = "YYYY-MM". */
export function buildChannelCalendar(shifts: readonly Pick<RosterShift, "date" | "startTime" | "endTime">[], month: string): ChannelCalendar {
  const { from, to } = monthBounds(month);
  const byDate = new Map<string, { frame: string; start: string }[]>();
  const summary = new Map<string, CalendarSummaryRow & { start: string }>();
  let totalCount = 0;
  let totalHours = 0;
  for (const s of shifts) {
    if (s.date < from || s.date > to) continue;
    const frame = fmtFrame(s.startTime, s.endTime);
    const list = byDate.get(s.date) ?? [];
    list.push({ frame, start: s.startTime });
    byDate.set(s.date, list);
    const h = shiftHours(s);
    const row = summary.get(frame) ?? { frame, count: 0, hours: 0, start: s.startTime };
    row.count += 1;
    row.hours += h;
    summary.set(frame, row);
    totalCount += 1;
    totalHours += h;
  }
  for (const list of byDate.values()) list.sort((a, b) => a.start.localeCompare(b.start) || a.frame.localeCompare(b.frame));

  const weeks: CalendarWeek[] = [];
  let cursor = addDaysIso(from, -weekdayIndex(from));
  while (cursor <= to) {
    const dates: (string | null)[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDaysIso(cursor, i);
      dates.push(d >= from && d <= to ? d : null);
    }
    const height = Math.max(1, ...dates.map((d) => (d ? (byDate.get(d)?.length ?? 0) : 0)));
    const rows: (string | null)[][] = [];
    for (let r = 0; r < height; r++) rows.push(dates.map((d) => (d ? (byDate.get(d)?.[r]?.frame ?? null) : null)));
    weeks.push({ dates, rows });
    cursor = addDaysIso(cursor, 7);
  }

  const summaryRows = [...summary.values()]
    .sort((a, b) => a.start.localeCompare(b.start) || a.frame.localeCompare(b.frame))
    .map(({ frame, count, hours }) => ({ frame, count, hours }));
  return { weeks, summary: summaryRows, totalCount, totalHours };
}

/** "TTS VERA" cho TikTok, "SHOPEE VERA" cho Shopee — như tiêu đề file mẫu ("TTS VERA THÁNG 10 - 2026"). */
export const channelTitle = (c: Pick<ScheduleChannel, "brandName" | "platform">, month: string) =>
  `${TITLE_PREFIX[c.platform]} ${c.brandName.toUpperCase()} THÁNG ${Number(month.slice(5))} - ${month.slice(0, 4)}`;

function safeFile(name: string) {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
const safeSheet = (name: string) => name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);

const DAY_HEAD = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const GOLD = "FFF1C232";
const CREAM = "FFFFF2CC";

type Sheet = import("exceljs").Worksheet;

function renderSheet(ws: Sheet, cal: ChannelCalendar, title: string, month: string) {
  const thin = { style: "thin" as const, color: { argb: "FF000000" } };
  const box = { top: thin, left: thin, bottom: thin, right: thin };
  const center = { horizontal: "center" as const, vertical: "middle" as const };
  ws.columns = [...Array(7)].map(() => ({ width: 19 })).concat([{ width: 17 }, { width: 8 }, { width: 8 }]);
  ws.views = [{ showGridLines: false }];

  ws.mergeCells(1, 1, 1, 7);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: "Times New Roman", bold: true, size: 15, color: { argb: "FFFFFFFF" } };
  t.alignment = center;
  for (let c = 1; c <= 7; c++) ws.getCell(1, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
  ws.getRow(1).height = 26;

  for (let c = 0; c < 7; c++) {
    const cell = ws.getCell(2, c + 1);
    cell.value = DAY_HEAD[c];
    cell.font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    cell.alignment = center;
    cell.border = box;
  }
  ws.getRow(2).height = 22;

  let r = 3;
  const monthNo = Number(month.slice(5));
  for (const w of cal.weeks) {
    for (let c = 0; c < 7; c++) {
      const cell = ws.getCell(r, c + 1);
      const d = w.dates[c];
      cell.value = d ? `${Number(d.slice(8, 10))}-thg ${monthNo}` : null;
      cell.font = { name: "Arial", bold: true, size: 12 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CREAM } };
      cell.alignment = center;
      cell.border = box;
    }
    ws.getRow(r).height = 20;
    r += 1;
    for (const row of w.rows) {
      for (let c = 0; c < 7; c++) {
        const cell = ws.getCell(r, c + 1);
        cell.value = row[c];
        cell.font = { name: "Arial", bold: true, size: 12 };
        cell.alignment = center;
        cell.border = box;
      }
      ws.getRow(r).height = 20;
      r += 1;
    }
  }

  // Bảng tổng theo khung giờ (cột H–J), bắt đầu từ hàng 2 để thẳng với tiêu đề thứ.
  const head = ["Khung giờ", "Số ca", "Số giờ"];
  head.forEach((h, i) => {
    const cell = ws.getCell(2, 8 + i);
    cell.value = h;
    cell.font = { name: "Times New Roman", bold: true, size: 12 };
    cell.alignment = center;
    cell.border = box;
  });
  let sr = 3;
  for (const s of cal.summary) {
    const cells = [ws.getCell(sr, 8), ws.getCell(sr, 9), ws.getCell(sr, 10)];
    cells[0].value = s.frame;
    cells[1].value = s.count;
    cells[2].value = s.hours;
    cells[1].numFmt = "0.0";
    cells[2].numFmt = "0.0";
    for (const c of cells) {
      c.font = { name: "Arial", bold: true, size: 12 };
      c.alignment = center;
      c.border = box;
    }
    sr += 1;
  }
  const tot = [ws.getCell(sr + 1, 9), ws.getCell(sr + 1, 10)];
  tot[0].value = cal.totalCount;
  tot[1].value = cal.totalHours;
  for (const c of tot) {
    c.numFmt = "0.0";
    c.font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFF0000" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    c.alignment = center;
    c.border = box;
  }
}

async function workbookBuffer(channels: ScheduleChannel[], month: string): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const c of channels) {
    const title = channelTitle(c, month);
    let name = safeSheet(channels.every((x) => x.brandId === c.brandId) ? c.platform : `${c.brandName} ${c.platform}`);
    for (let n = 2; used.has(name); n++) name = `${safeSheet(name).slice(0, 27)} ${n}`;
    used.add(name);
    renderSheet(wb.addWorksheet(name), buildChannelCalendar(c.shifts, month), title, month);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type ExportMode = "per-brand" | "single";

/**
 * Tải file. "per-brand": 1 .zip, trong đó mỗi brand 1 file .xlsx (sheet TikTok / Shopee riêng) — để gửi brand.
 * "single": 1 .xlsx gộp mọi kênh mỗi kênh 1 sheet — chỉ xem nội bộ. Brand chỉ có 1 kênh thì "per-brand" vẫn ra zip nhất quán.
 */
export async function exportBrandSchedules(channels: ScheduleChannel[], month: string, mode: ExportMode): Promise<{ files: number }> {
  if (channels.length === 0) throw new Error("Không có kênh nào để xuất.");
  const tag = `T${Number(month.slice(5))}-${month.slice(0, 4)}`;
  if (mode === "single") {
    const buf = await workbookBuffer(channels, month);
    saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Lich_live_${tag}_tat_ca_brand.xlsx`);
    return { files: 1 };
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const byBrand = new Map<string, ScheduleChannel[]>();
  for (const c of channels) byBrand.set(c.brandId, [...(byBrand.get(c.brandId) ?? []), c]);
  for (const list of byBrand.values()) {
    const buf = await workbookBuffer(list, month);
    zip.file(`Lich_live_${safeFile(list[0].brandName)}_${tag}.xlsx`, buf);
  }
  saveBlob(await zip.generateAsync({ type: "blob" }), `Lich_live_${tag}_gui_brand.zip`);
  return { files: byBrand.size };
}
