import type { LiveSession } from "../types";

// Giao ca (0144/0145/0154). Logic thuần. Cả hai sàn giao ca bằng FILE số liệu + chọn sự cố (FileHandover); ghi ở
// lib/db/handovers.ts. (Trước 08/10 ca Shopee dán link dashboard + gõ số — bỏ khi chuyển sang file Live List, 0154.)

/** "11.513.359" / "11,513,359" / "11513359" ⇒ 11513359; ô trống ⇒ null. Số dashboard luôn là số nguyên. */
export function parseCount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

/** 11513359 ⇒ "11.513.359" (cách viết trên dashboard TikTok/Shopee bản Việt). */
export function fmtCount(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("vi-VN");
}

/** Ca đã được giao ca qua màn mới (khác report cũ gõ tay). */
export function hasHandover(s: Pick<LiveSession, "report">): boolean {
  return !!s.report?.handoverAt;
}

/** Ai giao ca: trợ live của ca (cột co_host_id hoặc một đoạn trợ khi đổi người giữa ca); ca không trợ ⇒ OPS (user chốt 06/10). */
export function isHandoverPerson(s: Pick<LiveSession, "coHostId" | "staffSegments">, talentId: string | undefined): boolean {
  if (!talentId) return false;
  return s.coHostId === talentId || (s.staffSegments ?? []).some((g) => g.role === "co_host" && g.talentId === talentId);
}

/** Câu nói ai phải giao ca này — hiện cho host / người không có quyền. */
export function handoverOwnerLabel(s: Pick<LiveSession, "coHostId" | "coHostName">): string {
  return s.coHostId ? `Trợ live ${s.coHostName || ""} giao ca`.replace("  ", " ") : "Ca không có trợ — OPS giao ca";
}

/** Mốc phút hay gặp cho OT / off sớm (cùng mốc với form report cũ). */
export const MINUTE_PRESETS = [15, 30, 45, 60];
