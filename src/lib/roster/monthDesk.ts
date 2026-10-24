import type { EarlyLeaveReason, LiveSession, ShiftRegistration, ShiftSlot } from "../../types";
import type { RosterDraft, RosterWeek } from "../db/roster";
import type { AccountRow } from "../performance/accountOverview";
import { isDelivered, isScheduled, plannedHoursOf, realLiveHoursOf } from "../performance/brandCommitment";
import { brandPlatformKey, platformOf, type ReportPlatform } from "../reportPlatform";
import { addDays, isoWeekStart } from "../dateUtils";
import { sessionDurationHours } from "../pnl";

// Điều Phối Lịch Live — đợt 1 (24/10, user duyệt https://claude.ai/artifact/Rjp94U78WQfT1UehDwAPNX). Hàm thuần cho hai tab theo
// tháng: "Tháng này" (giờ live thật so cam kết, hao hụt, việc nên làm) và "Tháng sau" (6 bước mở lịch × mọi kênh).
//
// HAO HỤT ("shrinkage" của ngành xếp ca) = phần giờ đã xếp mà không lên live: ca huỷ + live ngắn hơn lịch (tắt sớm). Đo T10
// (01–23/10, 753 giờ lịch): huỷ 2,3% + ngắn 5,0%; theo kênh 4,8%…15,6%; ca tắt sớm bán 0,67× GMV/giờ của kênh. Giờ cần xếp =
// giờ cần giao ÷ (1 − hao hụt) — CHIA, không cộng (chuẩn workforce management). Không xếp/gợi ý người theo GMV ở đây.

export const SHRINK_DAYS = 60;
export const SHRINK_FLOOR = 0.03;
export const SHRINK_CAP = 0.15;
/** Dưới mức này kênh dùng hao hụt trung bình agency (kênh mới / ít ca). */
export const SHRINK_MIN_HOURS = 30;

export interface ShrinkSums {
  plannedHours: number;
  cancelledHours: number;
  /** Giờ lịch của ca có giờ live thật (mẫu để đo phần ngắn hơn lịch). */
  checkedHours: number;
  shortHours: number;
}

export interface ChannelShrinkage extends ShrinkSums {
  cancelRate: number;
  shortRate: number;
  /** Tỷ lệ đo được (chưa kẹp). */
  rate: number;
  /** Tỷ lệ dùng để tính giờ cần xếp: kẹp [SHRINK_FLOOR, SHRINK_CAP]. */
  applied: number;
  /** "channel" = số của chính kênh; "agency" = kênh ít dữ liệu, dùng trung bình agency; "floor" = chưa có dữ liệu nào. */
  source: "channel" | "agency" | "floor";
}

const EMPTY: ShrinkSums = { plannedHours: 0, cancelledHours: 0, checkedHours: 0, shortHours: 0 };

/** Cộng giờ lịch / giờ huỷ / giờ thiếu của ca app tạo (không tính ca nạp bù) trong `days` ngày trước `today`, theo kênh brand|sàn. */
export function shrinkSums(sessions: readonly LiveSession[], today: string, days = SHRINK_DAYS): { byChannel: Map<string, ShrinkSums>; agency: ShrinkSums } {
  const from = addDays(today, -days);
  const byChannel = new Map<string, ShrinkSums>();
  const agency = { ...EMPTY };
  for (const s of sessions) {
    if (s.isBackfill || s.date < from || s.date >= today || s.status === "Upcoming" || s.status === "Live Now") continue;
    const key = brandPlatformKey(s.brandId, platformOf(s));
    const o = byChannel.get(key) ?? { ...EMPTY };
    const h = plannedHoursOf(s);
    for (const t of [o, agency]) {
      t.plannedHours += h;
      if (s.status === "Cancelled") t.cancelledHours += h;
    }
    if (s.status !== "Cancelled") {
      const real = realLiveHoursOf(s);
      if (real != null)
        for (const t of [o, agency]) {
          t.checkedHours += h;
          t.shortHours += Math.max(0, h - real);
        }
    }
    byChannel.set(key, o);
  }
  return { byChannel, agency };
}

function rateOf(x: ShrinkSums): { cancelRate: number; shortRate: number; rate: number } {
  const cancelRate = x.plannedHours > 0 ? x.cancelledHours / x.plannedHours : 0;
  const shortRate = x.checkedHours > 0 ? x.shortHours / x.checkedHours : 0;
  return { cancelRate, shortRate, rate: cancelRate + shortRate * (1 - cancelRate) };
}

const clampShrink = (r: number) => Math.min(SHRINK_CAP, Math.max(SHRINK_FLOOR, r));

export function channelShrinkage(sums: { byChannel: Map<string, ShrinkSums>; agency: ShrinkSums }, key: string): ChannelShrinkage {
  const own = sums.byChannel.get(key) ?? EMPTY;
  if (own.plannedHours >= SHRINK_MIN_HOURS && own.checkedHours > 0) {
    const r = rateOf(own);
    return { ...own, ...r, applied: clampShrink(r.rate), source: "channel" };
  }
  if (sums.agency.plannedHours >= SHRINK_MIN_HOURS && sums.agency.checkedHours > 0) {
    const r = rateOf(sums.agency);
    return { ...own, ...rateOf(own), rate: r.rate, applied: clampShrink(r.rate), source: "agency" };
  }
  return { ...own, cancelRate: 0, shortRate: 0, rate: 0, applied: SHRINK_FLOOR, source: "floor" };
}

/** Giờ phải xếp để giao đủ `hours` giờ live khi `shrink` phần giờ xếp bị mất. */
export const hoursToSchedule = (hours: number, shrink: number): number => (hours > 0 ? hours / (1 - shrink) : 0);

// ---------------------------------------------------------------------------------------------------------------------------
// Tháng này
// ---------------------------------------------------------------------------------------------------------------------------

export interface NowHours {
  committed: number;
  /** Giờ live thật đã giao (ca chưa có giờ thật tính theo lịch — `estimated` ca). */
  delivered: number;
  /** Cùng các ca đã giao, tính theo lịch. */
  deliveredPlanned: number;
  estimated: number;
  /** Giờ ca đã chốt còn trong lịch. */
  scheduled: number;
  /** Giờ ca mở chờ chốt từ hôm nay. */
  open: number;
  /** Giờ còn phải giao để đủ cam kết. */
  remaining: number;
  /** Giờ phải có trong lịch (đã tính hao hụt) để giao đủ phần còn lại. */
  needScheduled: number;
  /** > 0 = phải xếp thêm; < 0 = lịch dư so với cam kết + phòng hờ. */
  extra: number;
  /** Phần phòng hờ trong `needScheduled`. */
  buffer: number;
  /** Giờ live ngắn hơn lịch của ca đã giao, theo lý do khai lúc giao ca (0180); "none" = chưa ghi lý do. */
  shortByReason: Partial<Record<EarlyLeaveReason | "none", number>>;
}

export function nowHours(sessions: readonly LiveSession[], slots: readonly ShiftSlot[], brandId: string, platform: ReportPlatform, month: string, today: string, committed: number, shrink: number): NowHours {
  let delivered = 0, deliveredPlanned = 0, estimated = 0, scheduled = 0, open = 0;
  const shortByReason: NowHours["shortByReason"] = {};
  for (const s of sessions) {
    if (s.brandId !== brandId || platformOf(s) !== platform || s.date.slice(0, 7) !== month) continue;
    if (isDelivered(s)) {
      const real = realLiveHoursOf(s);
      delivered += real ?? plannedHoursOf(s);
      deliveredPlanned += plannedHoursOf(s);
      if (real == null) estimated += 1;
      else if (real < plannedHoursOf(s)) {
        const k = s.report?.earlyLeaveReason ?? "none";
        shortByReason[k] = (shortByReason[k] ?? 0) + plannedHoursOf(s) - real;
      }
    } else if (isScheduled(s)) scheduled += plannedHoursOf(s);
  }
  for (const sl of slots)
    if (sl.brandId === brandId && platformOf(sl) === platform && sl.status === "open" && !sl.sessionId && sl.date.slice(0, 7) === month && sl.date >= today)
      open += sessionDurationHours(sl.startTime, sl.endTime);
  const remaining = Math.max(0, committed - delivered);
  const needScheduled = hoursToSchedule(remaining, shrink);
  return { committed, delivered, deliveredPlanned, estimated, scheduled, open, remaining, needScheduled, extra: needScheduled - scheduled - open, buffer: needScheduled - remaining, shortByReason };
}

export type DeskTone = "bad" | "warn" | "good" | "off";
export interface DeskAction {
  tone: DeskTone;
  text: string;
}

const vn = (v: number) => Math.round(v).toLocaleString("vi-VN");

/**
 * Việc nên làm của một kênh trong tháng: ghép giờ cam kết (đã tính hao hụt) với "khả năng bù" của Dashboard (accountRow.rescue —
 * không tính lại dự báo). Thêm giờ vì GMV CHỈ khi rescue = "save" (giờ cần thêm ≤ +30%, giới hạn đã kiểm T7–T9).
 */
export function nowActions(row: AccountRow, h: NowHours | null, fmtMoney: (v: number) => string): DeskAction[] {
  const out: DeskAction[] = [];
  const x = row.rescue;
  const commitExtra = h && h.committed > 0 ? h.extra : 0;
  const saveExtra = x.kind === "save" && x.extraHours != null ? x.extraHours : 0;
  const add = Math.max(commitExtra, saveExtra);
  if (add > 0.5) {
    const why = saveExtra >= commitExtra ? "là dự báo đạt target" : `để đủ cam kết${h && h.buffer > 0.5 ? ` (gồm ~${vn(h.buffer)} giờ phòng hờ)` : ""}`;
    out.push({ tone: x.kind === "save" || commitExtra > 0.5 ? "bad" : "warn", text: `Xếp thêm ~${vn(add)} giờ live ${why}.` });
  }
  if (x.kind === "cannot" && x.needRate != null && x.nowRate != null)
    out.push({ tone: "warn", text: `Không thêm giờ vì GMV: cần ${fmtMoney(x.needRate)}/giờ, đang ${fmtMoney(x.nowRate)}/giờ. Báo brand sớm.` });
  if (h && h.committed > 0 && h.extra < -0.5 && x.kind !== "save" && x.kind !== "on_track")
    out.push({ tone: "warn", text: `Lịch dư ~${vn(-h.extra)} giờ so với cam kết + phòng hờ mà thêm giờ không bù được target: cân nhắc bỏ bớt ca.` });
  if (x.kind === "on_track" && add <= 0.5) out.push({ tone: "good", text: "Đúng tiến độ target. Giữ lịch." });
  if (x.kind === "no_plan") out.push({ tone: "warn", text: "Chưa chốt Kế Hoạch Tháng nên chưa có target." });
  if (x.kind === "no_schedule") out.push({ tone: "bad", text: "Có cam kết giờ nhưng chưa có lịch live." });
  if (x.kind === "no_forecast") out.push({ tone: "off", text: "Kênh mới, chưa đủ lịch sử để dự báo GMV." });
  if (x.kind === "no_hours") out.push({ tone: "warn", text: "Không còn ca nào trong lịch để bù target." });
  if (out.length === 0 && h && h.committed > 0 && h.extra <= 0.5) out.push({ tone: "good", text: "Đủ giờ cam kết (đã tính phòng hờ)." });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tháng sau
// ---------------------------------------------------------------------------------------------------------------------------

export type NextStep = "commit" | "plan" | "lock" | "open" | "signup" | "staff" | "publish" | "done";
export const NEXT_STEPS: { key: Exclude<NextStep, "done" | "lock">; label: string }[] = [
  { key: "commit", label: "Cam kết" },
  { key: "plan", label: "Kế hoạch" },
  { key: "open", label: "Ca mở" },
  { key: "signup", label: "Đăng ký" },
  { key: "staff", label: "Xếp người" },
  { key: "publish", label: "Công bố" }
];

export interface NextInput {
  brandId: string;
  platform: ReportPlatform;
  month: string;
  committedHours: number | null;
  committedGmv: number | null;
  planStatus: "locked" | "draft" | "none";
  shrink: number;
  sessions: readonly LiveSession[];
  slots: readonly ShiftSlot[];
  registrations: readonly ShiftRegistration[];
  drafts: readonly RosterDraft[];
  weeks: readonly RosterWeek[];
}

export interface NextRow {
  toOpen: number | null;
  buffer: number;
  /** Giờ đã có trong lịch tháng: ca đã chốt + ca mở. */
  opened: number;
  sessionHours: number;
  openSlots: number;
  slotsWithSignup: number;
  slotsDrafted: number;
  /** Tuần (bắt đầu Thứ 2) có ca mở đã nháp người nhưng chưa công bố. */
  weeksToPublish: number;
  /** GMV cam kết > 0 mà dưới 1M — gần như chắc nhập thiếu đơn vị (FUJIWA 450). */
  gmvSuspicious: boolean;
  step: NextStep;
  /** Bước đã qua (đánh dấu trên dải 6 bước). */
  done: Set<NextStep>;
  next: string;
}

export function nextRow(x: NextInput): NextRow {
  const inMonth = (d: string) => d.slice(0, 7) === x.month;
  const mine = <T extends { brandId?: string; platform?: string | null }>(r: T) => r.brandId === x.brandId && platformOf(r) === x.platform;
  let sessionHours = 0;
  for (const s of x.sessions) if (mine(s) && inMonth(s.date) && s.status !== "Cancelled") sessionHours += plannedHoursOf(s);
  const open = x.slots.filter((sl) => mine(sl) && inMonth(sl.date) && sl.status === "open" && !sl.sessionId);
  const openHours = open.reduce((a, sl) => a + sessionDurationHours(sl.startTime, sl.endTime), 0);
  const regSlots = new Set(x.registrations.map((r) => r.slotId));
  const draftBy = new Map(x.drafts.map((d) => [d.slotId, d]));
  const slotsWithSignup = open.filter((sl) => regSlots.has(sl.id)).length;
  const drafted = open.filter((sl) => !!draftBy.get(sl.id)?.hostId);
  const published = new Set(x.weeks.filter((w) => w.publishedAt).map((w) => w.weekStart));
  const weeksToPublish = new Set(drafted.map((sl) => isoWeekStart(sl.date)).filter((w) => !published.has(w))).size;

  const hasCommit = (x.committedHours ?? 0) > 0 || (x.committedGmv ?? 0) > 0;
  const toOpen = (x.committedHours ?? 0) > 0 ? hoursToSchedule(x.committedHours!, x.shrink) : null;
  const opened = sessionHours + openHours;
  const done = new Set<NextStep>();
  let step: NextStep, next: string;
  if (!hasCommit) {
    step = "commit";
    next = "Nhập cam kết tháng";
  } else {
    done.add("commit");
    if (x.planStatus !== "locked") {
      step = x.planStatus === "draft" ? "lock" : "plan";
      next = x.planStatus === "draft" ? "Chốt Kế Hoạch Tháng" : "Lập Kế Hoạch Tháng";
    } else {
      done.add("plan");
      if (toOpen != null && opened < toOpen - 0.5) {
        step = "open";
        next = `Mở thêm ~${vn(toOpen - opened)} giờ`;
      } else {
        done.add("open");
        if (open.length > 0 && slotsWithSignup < open.length) {
          step = "signup";
          next = `Chờ đăng ký: ${slotsWithSignup}/${open.length} ca có người`;
        } else {
          done.add("signup");
          if (drafted.length < open.length) {
            step = "staff";
            next = `Xếp người: ${open.length - drafted.length} ca chưa có host`;
          } else {
            done.add("staff");
            if (weeksToPublish > 0) {
              step = "publish";
              next = `Công bố ${weeksToPublish} tuần`;
            } else {
              done.add("publish");
              step = "done";
              next = "Đã xong lịch tháng";
            }
          }
        }
      }
    }
  }
  return {
    toOpen,
    buffer: toOpen != null ? toOpen - x.committedHours! : 0,
    opened,
    sessionHours,
    openSlots: open.length,
    slotsWithSignup,
    slotsDrafted: drafted.length,
    weeksToPublish,
    gmvSuspicious: (x.committedGmv ?? 0) > 0 && (x.committedGmv ?? 0) < 1e6,
    step,
    done,
    next
  };
}
