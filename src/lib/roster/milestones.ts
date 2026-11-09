import { addDays } from "../dateUtils";

// Mốc lịch tháng sau (06/11, user chốt): lập lịch CẢ tháng một lần, chốt theo 2 đợt trong tháng trước:
//   ngày 5 mở đăng ký · ngày 10 hết hạn đăng ký ca ngày 1–15 · ngày 15 chốt lịch 1–15
//   ngày 20 hết hạn đăng ký ca 16–cuối · ngày 25 chốt lịch phần còn lại.
// DB (0200): roster_months.signup_deadline = hạn đợt 1, signup_deadline_2 = hạn đợt 2 (trống ⇒ hạn đợt 1 áp cả tháng),
// publish_by_1/2 = ngày chốt (chỉ nhắc việc). Ca bổ sung có hạn riêng shift_slots.signup_deadline — thay mọi hạn khác.

/** Ngày cuối của đợt 1. */
export const HALF_SPLIT_DAY = 15;
export const DEFAULT_SIGNUP_TIME = "17:00";
/** Mở lịch muộn: hạn đăng ký đầu tiên cách hôm nay ít nhất ngần này ngày (gợi ý mặc định, người đặt vẫn sửa được). */
export const MIN_SIGNUP_LEAD_DAYS = 3;

export type Half = 1 | 2;
export const halfOf = (date: string): Half => (Number(date.slice(8, 10)) > HALF_SPLIT_DAY ? 2 : 1);

export interface MonthMilestones {
  /** "YYYY-MM" */
  month: string;
  signupDeadline?: string;
  signupDeadline2?: string;
  /** "YYYY-MM-DD" */
  publishBy1?: string;
  publishBy2?: string;
}

/** Hạn đăng ký đang áp cho MỘT ca — đúng thứ tự DB xét (0200): hạn riêng của ca → hạn đợt theo ngày → hạn tuần cũ (lấy hạn sớm hơn). */
export function slotDeadline(date: string, m: MonthMilestones | undefined, weekDeadline?: string, own?: string): string | undefined {
  if (own) return own;
  const md = m ? (halfOf(date) === 2 && m.signupDeadline2 ? m.signupDeadline2 : m.signupDeadline) : undefined;
  if (!md) return weekDeadline;
  if (!weekDeadline) return md;
  return new Date(md) <= new Date(weekDeadline) ? md : weekDeadline;
}

export interface MilestoneDraft {
  d1Date: string;
  d1Time: string;
  d2Date: string;
  d2Time: string;
  p1: string;
  p2: string;
}

const prevMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
};

/**
 * Mốc mặc định cho tháng `month`: ngày 10/15/20/25 của tháng trước. Mốc đã qua (mở lịch muộn) dời tới `today + MIN_SIGNUP_LEAD_DAYS`
 * (09/11: mặc định cũ "ngày mai" cho talent chưa tới 1 ngày để đăng ký ca 1–15/12), các mốc sau giữ khoảng cách tối thiểu 1 ngày
 * để thứ tự vẫn đúng: hạn đợt 1 < chốt đợt 1, hạn đợt 2 < chốt đợt 2.
 */
export function defaultMilestones(month: string, today: string): MilestoneDraft {
  const pm = prevMonth(month);
  const at = (d: number) => `${pm}-${String(d).padStart(2, "0")}`;
  const floor = addDays(today, MIN_SIGNUP_LEAD_DAYS);
  const d1 = at(10) < floor ? floor : at(10);
  const p1 = at(15) <= d1 ? addDays(d1, 1) : at(15);
  const d2 = at(20) <= d1 ? addDays(d1, 1) : at(20);
  const p2 = at(25) <= d2 ? addDays(d2, 1) : at(25);
  return { d1Date: d1, d1Time: DEFAULT_SIGNUP_TIME, d2Date: d2, d2Time: DEFAULT_SIGNUP_TIME, p1, p2 };
}

/** Bản nháp từ mốc đã lưu (ô trống lấy mặc định). */
export function draftFromSaved(m: MonthMilestones | undefined, month: string, today: string): MilestoneDraft {
  const def = defaultMilestones(month, today);
  const split = (iso?: string) => {
    if (!iso) return null;
    const d = new Date(iso);
    return { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, time: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
  };
  const a = split(m?.signupDeadline);
  const b = split(m?.signupDeadline2);
  return {
    d1Date: a?.date ?? def.d1Date,
    d1Time: a?.time ?? def.d1Time,
    d2Date: b?.date ?? def.d2Date,
    d2Time: b?.time ?? def.d2Time,
    p1: m?.publishBy1 ?? def.p1,
    p2: m?.publishBy2 ?? def.p2
  };
}

/** Lỗi thứ tự mốc (null = hợp lệ). */
export function milestoneError(d: MilestoneDraft): string | null {
  const t1 = `${d.d1Date}T${d.d1Time}`;
  const t2 = `${d.d2Date}T${d.d2Time}`;
  if (!d.d1Date || !d.d2Date || !d.p1 || !d.p2) return "Điền đủ 4 mốc.";
  if (t2 < t1) return "Hạn đăng ký đợt 2 phải sau hạn đợt 1.";
  if (d.p1 < d.d1Date) return "Ngày chốt lịch đợt 1 phải từ hạn đăng ký đợt 1 trở đi.";
  if (d.p2 < d.d2Date) return "Ngày chốt lịch đợt 2 phải từ hạn đăng ký đợt 2 trở đi.";
  if (d.p2 < d.p1) return "Ngày chốt lịch đợt 2 phải sau đợt 1.";
  return null;
}

export const halfRange = (month: string, half: Half): string => {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return half === 1 ? `1–${HALF_SPLIT_DAY}/${m}` : `${HALF_SPLIT_DAY + 1}–${last}/${m}`;
};

const toIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

/** Bản nháp → tham số RPC set_roster_month_milestones (giờ theo máy người đặt, như ô hạn cũ). */
export function milestonePayload(d: MilestoneDraft): { deadline1: string; deadline2: string; publishBy1: string; publishBy2: string } {
  return { deadline1: toIso(d.d1Date, d.d1Time), deadline2: toIso(d.d2Date, d.d2Time), publishBy1: d.p1, publishBy2: d.p2 };
}

/** Bản nháp có khác mốc đã lưu không (khác ⇒ ghi + báo talent). */
export function milestonesChanged(d: MilestoneDraft, saved: MonthMilestones | undefined): boolean {
  if (!saved) return true;
  const p = milestonePayload(d);
  const same = (a: string | undefined, b: string) => !!a && new Date(a).getTime() === new Date(b).getTime();
  return !same(saved.signupDeadline, p.deadline1) || !same(saved.signupDeadline2, p.deadline2) || saved.publishBy1 !== p.publishBy1 || saved.publishBy2 !== p.publishBy2;
}
