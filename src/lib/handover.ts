import type { LiveSession } from "../types";

// Giao ca (0144, Đợt 2 lịch 2 sàn). Logic thuần — màn ở components/HandoverForm.tsx, ghi ở lib/db/handovers.ts.
//
// Người trực dán đúng link dashboard họ đang dán vào Google Sheet (Working File T8–T9: 87–97% dòng có link), app đọc ra
// sàn + mã phòng/phiên. Hai dạng thật trong file:
//   TikTok Shop  https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366&region=vn&...
//   Shopee       https://banhang.shopee.vn/creator-center/dashboard/live/41439111
// Cùng regex với private.parse_dashboard_link ở DB — sửa một bên thì sửa cả bên kia (tests/handover.test.ts canh).

export type HandoverPlatform = LiveSession["platform"];

export function parseDashboardLink(link: string): { platform: HandoverPlatform; liveRef: string } | null {
  const s = link.trim();
  if (/shopee\./i.test(s)) {
    const m = s.match(/\/live\/(\d+)/i);
    return m ? { platform: "Shopee", liveRef: m[1] } : null;
  }
  if (/tiktok/i.test(s)) {
    const m = s.match(/room_id=(\d+)/i);
    return m ? { platform: "TikTok", liveRef: m[1] } : null;
  }
  return null;
}

/** "11.513.359" / "11,513,359" / "11513359" ⇒ 11513359; ô trống ⇒ null. Số dashboard luôn là số nguyên. */
export function parseCount(text: string): number | null {
  const digits = text.replace(/[^\d]/g, "");
  return digits === "" ? null : Number(digits);
}

/** 11513359 ⇒ "11.513.359" (cách viết trên dashboard TikTok/Shopee bản Việt). */
export function fmtCount(n: number | null | undefined): string {
  return n == null ? "" : n.toLocaleString("vi-VN");
}

export interface HandoverInput {
  link: string;
  cumGmv: number;
  cumViews: number;
  /** TikTok: số đơn (bắt buộc). Shopee: không hỏi. */
  cumOrders: number | null;
  /** Shopee: ATC. TikTok: không hỏi. */
  cumAtc: number | null;
  coinSpent: number | null;
  otMinutes: number;
  earlyLeaveMinutes: number;
  restartCount: number;
  hostLate: boolean;
  statusNote: string;
}

/** Ca trước cùng phòng đã giao (RPC handover_previous). */
export interface PreviousHandover {
  sessionId: string;
  startTime: string;
  endTime: string;
  cumGmv: number;
  cumOrders: number | null;
  cumViews: number | null;
  cumAtc: number | null;
}

/** Phần của ca này = số đang thấy − số ca trước cùng phòng (cùng phép tính với private.apply_handover_chain). */
export function handoverShare(
  input: Pick<HandoverInput, "cumGmv" | "cumViews" | "cumOrders" | "cumAtc">,
  prev: PreviousHandover | null
): { gmv: number; views: number; orders: number | null; atc: number | null; belowPrevious: boolean } {
  const minus = (a: number | null, b: number | null | undefined) => (a == null ? null : Math.max(a - (b ?? 0), 0));
  return {
    gmv: Math.max(input.cumGmv - (prev?.cumGmv ?? 0), 0),
    views: Math.max(input.cumViews - (prev?.cumViews ?? 0), 0),
    orders: minus(input.cumOrders, prev?.cumOrders),
    atc: minus(input.cumAtc, prev?.cumAtc),
    belowPrevious: !!prev && input.cumGmv < prev.cumGmv
  };
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
