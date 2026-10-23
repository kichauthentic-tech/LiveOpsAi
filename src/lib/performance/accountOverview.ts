import type { LiveSession } from "../../types";
import type { ReportPlatform } from "../reportPlatform";
import type { ChannelCard } from "./channelCard";
import type { GmvTree } from "./channelHealth";
import { LANDING_LABEL } from "./forecastCone";
import { isCountable } from "./hostPerformance";

// TỔNG QUAN ACCOUNT (24/10/2026, demo https://claude.ai/artifact/AQtXSSHpTxFgbNC8tYTFCH — user duyệt): một dòng cho mỗi kênh
// brand × sàn của MỌI sàn, xếp theo mức rủi ro, để cấp quản lý thấy hết account trên một màn. Không có công thức mới — mọi số đọc
// từ thẻ kênh (channelCard.buildChannelCard): nhãn + xác suất (forecastCone), GMV/giờ cần (handlingPlan.needRate), số giờ bù ở mốc
// điều chỉnh (handlingPlan.checkpoint, giới hạn +30% đã kiểm chứng T7–T9), phân rã GMV/giờ ngày Daily (channelHealth.gmvTree),
// giờ cam kết (brandCommitment). Không cộng số hiệu suất giữa TikTok và Shopee: tổng chỉ theo từng sàn (`platformPace`).

export type RowTone = "bad" | "warn" | "good" | "off";

export type RescueKind =
  /** Dự báo đạt target (Đạt / Sát target) — không cần bù. */
  | "on_track"
  /** Thiếu, số giờ cần thêm nằm trong giới hạn của mốc điều chỉnh. */
  | "save"
  /** Thiếu, cần thêm giờ vượt giới hạn — thêm tối đa vẫn hụt. */
  | "cannot"
  /** Thiếu nhưng không còn ca nào trong lịch để bù. */
  | "no_hours"
  /** Kênh mới: chưa đủ lịch sử để dự báo. */
  | "no_forecast"
  /** Có cam kết giờ nhưng chưa xếp lịch. */
  | "no_schedule"
  /** Chưa chốt Kế Hoạch Tháng nên chưa có target. */
  | "no_plan"
  /** Không chạy tháng này. */
  | "off";

export interface AccountRescue {
  kind: RescueKind;
  /** GMV/giờ cần trên các giờ live còn trong lịch để đạt target. */
  needRate: number | null;
  /** GMV/giờ dự báo của các ca còn lại (hoặc GMV/giờ tháng này khi kênh chưa có dự báo). */
  nowRate: number | null;
  /** Giờ live còn trong lịch. */
  hoursLeft: number | null;
  /** Giờ nên thêm (đã kẹp giới hạn). */
  extraHours: number | null;
  /** % giờ còn lại cần thêm để đạt target (chưa kẹp). */
  needPct: number | null;
  /** Dự báo nếu thêm đủ `extraHours`. */
  projectedAfter: number | null;
}

export interface AccountHours {
  committed: number;
  delivered: number;
  scheduled: number;
  /** > 0 = còn thiếu bấy nhiêu giờ chưa xếp lịch; < 0 = vượt cam kết. */
  gap: number;
}

export interface AccountRow {
  key: string;
  brandId: string;
  brandName: string;
  brandLogo?: string;
  platform: ReportPlatform;
  state: ChannelCard["state"];
  /** Nhỏ = rủi ro cao hơn (đứng trên). */
  rank: number;
  tone: RowTone;
  status: string;
  runRate: number | null;
  asOf: string | null;
  target: number | null;
  actual: number;
  targetToDate: number | null;
  forecast: number | null;
  pHit: number | null;
  rescue: AccountRescue;
  tree: GmvTree | null;
  hours: AccountHours | null;
  waiting: number;
  /** Ngày có ca live gần nhất trước tháng (chỉ khi tháng này không chạy). */
  lastLive: string | null;
}

/** Nhãn dự báo của thẻ kênh, cùng một câu ở mọi màn (thẻ kênh, tab Brand, Tổng quan account). */
export function landingText(card: Pick<ChannelCard, "landing" | "forecast" | "target">): string | null {
  const l = card.landing;
  if (!l) return null;
  if (l.key === "short" && card.forecast && card.target) return `${LANDING_LABEL.short} · dự báo thiếu ~${Math.round((1 - card.forecast.p50 / card.target) * 100)}%`;
  return `${LANDING_LABEL[l.key]} · xác suất đạt ${l.pHit < 0.01 ? "≈ 0" : Math.round(l.pHit * 100)}%`;
}

const NONE: AccountRescue = { kind: "off", needRate: null, nowRate: null, hoursLeft: null, extraHours: null, needPct: null, projectedAfter: null };

/** GMV/giờ của các ca có số trong tháng (dùng khi kênh chưa có dự báo). */
function monthRate(card: ChannelCard): number | null {
  const t = card.trend.find((p) => p.month === card.month);
  return t?.gmvPerHour ?? null;
}

export function accountRow(card: ChannelCard, sessions: LiveSession[] = []): AccountRow {
  const cm = card.commitment;
  const hours: AccountHours | null = cm ? { committed: cm.committedHours, delivered: cm.deliveredHours, scheduled: cm.scheduledHours, gap: cm.gapHours } : null;
  const actual = card.pace?.actual ?? card.monthActual;
  const forecast = card.forecast?.p50 ?? null;
  const unscheduledCommitment = !!hours && hours.gap > 0.5 && hours.scheduled < 0.5;
  let lastLive: string | null = null;
  if (card.state === "off") for (const s of sessions) if (s.date < `${card.month}-01` && isCountable(s) && (!lastLive || s.date > lastLive)) lastLive = s.date;

  let tone: RowTone, status: string, rescue: AccountRescue, rank: number;
  if (card.state !== "live") {
    if (unscheduledCommitment) {
      tone = "bad";
      status = "Chưa có lịch live";
      rescue = { ...NONE, kind: "no_schedule" };
      rank = 0;
    } else if (card.state === "off") {
      tone = "off";
      // Có ca live trước đó = tạm dừng; chưa từng có ca (brand mới, hợp đồng bắt đầu tháng sau) = chưa chạy.
      status = `${lastLive ? "Tạm dừng" : "Chưa chạy"} tháng ${Number(card.month.slice(5))}`;
      rescue = NONE;
      rank = 900;
    } else {
      tone = "warn";
      status = card.planStatus === "draft" ? "Chưa chốt Kế Hoạch Tháng" : "Chưa lập Kế Hoạch Tháng";
      rescue = { ...NONE, kind: "no_plan" };
      rank = 700;
    }
  } else if (!card.forecast || !card.landing) {
    tone = "off";
    status = card.newChannel ? "Kênh mới · chưa có dự báo" : "Chưa có dự báo";
    const left = hours?.scheduled ?? null;
    rescue = {
      ...NONE,
      kind: "no_forecast",
      needRate: card.target && left && left > 0 ? Math.max(0, card.target - actual) / left : null,
      nowRate: monthRate(card),
      hoursLeft: left
    };
    rank = 100 + 100 * (card.pace?.runRate ?? 1);
  } else {
    const k = card.landing.key;
    tone = k === "short" ? "bad" : k === "unlikely" ? "warn" : "good";
    status = landingText(card)!;
    const cp = card.plan?.checkpoint ?? null;
    const base = { needRate: card.need?.perHour ?? null, nowRate: card.need?.blended ?? null, hoursLeft: card.plan?.remainingHours ?? null, needPct: cp?.needPct ?? null };
    if (k === "safe" || k === "likely") rescue = { ...base, kind: "on_track", extraHours: null, projectedAfter: null };
    else if (!cp || !(base.hoursLeft && base.hoursLeft > 0)) rescue = { ...base, kind: "no_hours", extraHours: null, projectedAfter: null };
    else rescue = { ...base, kind: cp.capped ? "cannot" : "save", extraHours: Math.ceil(cp.extraHours), projectedAfter: cp.projectedAfter };
    rank = 100 + 100 * (card.target ? card.forecast.p50 / card.target : 1);
  }

  return {
    key: card.key,
    brandId: card.brandId,
    brandName: card.brandName,
    brandLogo: card.brandLogo,
    platform: card.platform,
    state: card.state,
    rank,
    tone,
    status,
    runRate: card.pace?.runRate ?? null,
    asOf: card.pace?.asOf ?? card.shownThrough,
    target: card.target,
    actual,
    targetToDate: card.pace?.targetToDate ?? null,
    forecast,
    pHit: card.landing?.pHit ?? null,
    rescue,
    tree: card.state === "live" ? card.tree : null,
    hours,
    waiting: card.coverage.missingSessions,
    lastLive
  };
}

/** Rủi ro cao lên trên; cùng mức thì theo tên brand rồi sàn để thứ tự không nhảy. */
export function sortAccounts(rows: AccountRow[]): AccountRow[] {
  return [...rows].sort((a, b) => a.rank - b.rank || a.brandName.localeCompare(b.brandName) || a.platform.localeCompare(b.platform));
}

export interface PlatformPace {
  /** Σ thực đạt tới ca gần nhất có số của các kênh có kế hoạch. */
  actual: number;
  /** Σ target luỹ kế tới cùng mốc. */
  targetToDate: number;
  /** Σ target tháng. */
  target: number;
  /** Σ dự báo cuối tháng của kênh có target (kênh chưa có dự báo cộng phần đã đạt). */
  forecast: number;
}

/** Tổng của MỘT sàn (gọi riêng từng sàn — không cộng TikTok với Shopee). */
export function platformPace(cards: ChannelCard[]): PlatformPace {
  const live = cards.filter((c) => c.state !== "off");
  return {
    actual: live.reduce((a, c) => a + (c.pace?.actual ?? 0), 0),
    targetToDate: live.reduce((a, c) => a + (c.pace?.targetToDate ?? 0), 0),
    target: live.reduce((a, c) => a + (c.target ?? 0), 0),
    forecast: live.filter((c) => c.target).reduce((a, c) => a + (c.forecast?.p50 ?? c.pace?.actual ?? c.monthActual), 0)
  };
}

const vnNum = (v: number, d = 0) => v.toLocaleString("vi-VN", { maximumFractionDigits: d });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * "Hành động đề xuất" của một dòng — chỉ ghép lại các con số đã có trên dòng (không có luật mới). `fmtMoney` = fmtVndShort,
 * `leverOwner` = channelHealth.LEVER_OWNER (truyền vào để lib này không kéo phần trình bày).
 */
export function accountActions(r: AccountRow, today: string, fmtMoney: (v: number) => string, leverOwner: Record<string, string>, slotHours = 3): string[] {
  const out: string[] = [];
  const x = r.rescue;
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const daysLeft = Math.max(1, monthEnd - Number(today.slice(8, 10)) + 1);
  if (x.kind === "no_schedule" && r.hours) {
    out.push(`Lập Kế Hoạch Tháng và xếp lịch live ngay: cam kết ${vnNum(r.hours.committed)} giờ, đã xếp 0 giờ, còn ${daysLeft} ngày (~${vnNum(r.hours.gap / daysLeft)} giờ live/ngày) — hoặc thống nhất với brand chuyển phần giờ cam kết sang tháng sau.`);
  } else if (x.kind === "no_plan") {
    out.push("Chốt Kế Hoạch Tháng để có target và dự báo cho kênh này.");
  } else if (x.kind === "off") {
    out.push(r.lastLive ? `Không có ca live từ ${ddmm(r.lastLive)}. Nếu brand đã dừng kênh này, không cần lập Kế Hoạch Tháng.` : "Không có ca live tháng này.");
  } else if (x.kind === "cannot" && x.needPct != null && x.extraHours != null && x.projectedAfter != null && r.target) {
    out.push(`Cần thêm +${vnNum(x.needPct * 100)}% giờ, vượt giới hạn +30%: thêm tối đa ~${vnNum(x.extraHours)} giờ chỉ đưa dự báo lên ~${fmtMoney(x.projectedAfter)} (${vnNum((x.projectedAfter / r.target) * 100)}% target). Báo brand sớm và đề xuất điều chỉnh target.`);
  } else if (x.kind === "save" && x.extraHours != null && x.projectedAfter != null) {
    out.push(`Thêm ~${vnNum(x.extraHours)} giờ live (≈ ${Math.ceil(x.extraHours / slotHours)} ca ${slotHours}h) trước cuối tháng là dự báo đạt ${fmtMoney(x.projectedAfter)}.`);
  } else if (x.kind === "no_hours") {
    out.push("Không còn ca nào trong lịch tháng này để bù: báo brand sớm khả năng hụt.");
  } else if (x.kind === "no_forecast" && r.target) {
    out.push(`Kênh chưa đủ lịch sử để dự báo: đạt ${fmtMoney(r.actual)} / ${fmtMoney(r.target)} (${vnNum((r.actual / r.target) * 100)}%)${x.needRate != null && x.nowRate ? `; để đạt target cần ${fmtMoney(x.needRate)}/giờ, hiện đạt ${fmtMoney(x.nowRate)}/giờ` : ""}.`);
  }
  const w = r.tree?.worst;
  if (w && w.change < -0.03) out.push(`Yếu tố giảm mạnh nhất: ${w.label} −${vnNum(Math.abs(w.change) * 100, Math.abs(w.change) < 0.1 ? 1 : 0)}% · Đầu mối xử lý: ${leverOwner[w.label] ?? "xem chi tiết từng ca"}.`);
  if (r.hours && x.kind !== "no_schedule") {
    if (r.hours.gap > 0.5) out.push(`Còn ${vnNum(r.hours.gap)} giờ cam kết chưa xếp lịch live.`);
    else if (r.hours.gap < -0.5 && (x.kind === "cannot" || x.kind === "save")) out.push(`Giờ đã live + đã xếp vượt cam kết ${vnNum(-r.hours.gap)} giờ.`);
  }
  if (r.waiting > 0) out.push(`Cập nhật số liệu ${r.waiting} ca đã live còn thiếu để dự báo chính xác hơn.`);
  return out;
}
