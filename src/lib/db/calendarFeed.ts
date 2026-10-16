import { authedFetch } from "../authedFetch";

// Link lịch riêng (.ics) của host/trợ đang đăng nhập — server giữ mã (bảng talent_calendar_feeds, 0177), client chỉ ghép URL.

export class CalendarFeedNotReady extends Error {}

async function read(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (res.status === 501) throw new CalendarFeedNotReady(body.error ?? "Chưa chạy migration 0177");
  if (!res.ok || !body.token) throw new Error(body.error ?? `Lỗi ${res.status}`);
  return body.token;
}

export const fetchMyCalendarToken = async () => read(await authedFetch("/api/me/calendar-feed"));
export const rotateMyCalendarToken = async () => read(await authedFetch("/api/me/calendar-feed/rotate", { method: "POST" }));

export interface CalendarLinks {
  /** https — dán vào Google Calendar → "Từ URL", hoặc chép gửi. */
  https: string;
  /** webcal — iPhone mở thẳng hộp "Đăng ký lịch". */
  webcal: string;
  /** Mở Google Calendar với sẵn lịch cần thêm (Android / máy tính). */
  google: string;
}

export function calendarLinks(origin: string, token: string): CalendarLinks {
  const https = `${origin}/api/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:/, "webcal:");
  return { https, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}
