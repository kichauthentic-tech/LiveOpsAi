
import { fmtFixed } from "../../../lib/format";

import { PAL } from "./theme";

// Định dạng + mốc tháng dùng riêng trong Report Tháng. Tách khỏi MonthlyReportTabs.tsx 2026-10-01.
// Cố ý tách khỏi src/lib/format.ts dùng chung: mấy hàm này gắn với cách TRÌNH BÀY của riêng report
// (đuôi `Local` là để phân biệt với helper cùng tên ở lib).

export function monthRangeLocal(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  return { start, end: `${month}-${String(lastDay).padStart(2, "0")}` };
}

export function prevMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function nextMonthStrLocal(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

// recharts khai formatter của <Tooltip> nhận ValueType | undefined (string | number | mảng của
// chúng), không phải number — viết thẳng `(v: number) => ...` là nói dối kiểu, strict bắt đúng.
// Bọc một lần ở đây thay vì ép kiểu ở 8 chỗ gọi: ép kiểu thì lần sau recharts đổi signature sẽ
// không còn ai báo.
export function chartNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmtPct(n: number | null): string {
  return n == null ? "—" : `${fmtFixed(n, 2)}%`;
}

export function fmtHours(n: number): string {
  return `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
}

// Status khuyến mãi trong file thật là tiếng Anh nguyên văn (expired/deactivated) — "ongoing" đã
// bị lọc khỏi Top khuyến mãi ở nguồn (monthlyProductSlice.ts) nên không cần map ở đây.
export function promoStatusLabel(status: string): { label: string; color: string } {
  const s = status.toLowerCase();
  if (s === "expired") return { label: "Đã Kết Thúc", color: PAL.gold };
  if (s === "deactivated") return { label: "Đã Tắt", color: PAL.red };
  return { label: status, color: PAL.muted };
}

export function fmtSessionStart(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(shifted.getUTCDate())}/${p(shifted.getUTCMonth() + 1)} ${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`;
}
