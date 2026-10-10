import type { LiveSession } from "../../types";
import { addDays } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { fmtVndShort } from "../format";
import { CampOverrides, resolveCampBucketType } from "../campaignDays";
import { isCountable } from "./hostPerformance";
import type { MonthOutlook } from "./ceoBrief";
import { coneHalf, landingOf, type Landing, type LandingKey } from "./forecastCone";
import { SLOT_BLOCK_LABEL, slotBlock, slotIndex, slotRuleReliable, walkForward, type SlotBlock } from "./slotInsights";
import { CHECKPOINT_LABEL, activeCheckpoint, checkpointAdvice, checkpointsOf, type Checkpoint, type CheckpointAdvice } from "./monthForecast";

// Phương án xử lý theo dự phóng (09/10/2026). Mọi đòn bẩy đều ra SỐ từ chính dữ liệu của kênh (GMV/giờ 28 ngày, lịch còn lại,
// lịch sử ngày camp), kèm căn cứ — không có lời khuyên chung chung. Không có số tiền lãi/lỗ của đòn bẩy vì commission và rate
// chưa nhập (user chốt nhập sau khi app vào vận hành): đòn bẩy tính bằng GMV và giờ, không tính bằng lãi.
//
// Một giờ live THÊM trả ít hơn giờ trung bình (CROCS T9: co giãn ngày thường 0,82) nên giờ cần thêm tính theo
// GMV/giờ × co giãn. Co giãn chỉ dùng khi đủ mẫu; không đủ thì dùng 1 và ghi "tối thiểu".

export interface Elasticity {
  /** GMV ngày tăng bao nhiêu % khi giờ ngày tăng 1% (hồi quy log-log trên ngày thường, kẹp 0,3–1). */
  value: number;
  days: number;
  /** false = không đủ ngày/độ phân tán giờ ⇒ value = 1. */
  reliable: boolean;
}

export const ELASTICITY_LOOKBACK_DAYS = 90;
const ELASTICITY_MIN_DAYS = 15;

/** Hồi quy ln(GMV ngày) theo ln(giờ ngày) trên các ngày THƯỜNG có số — ngày camp bị loại vì giờ và GMV cùng nhảy theo lịch camp. */
export function dayElasticity(sessions: LiveSession[], through: string | null, camp?: CampOverrides): Elasticity {
  const none: Elasticity = { value: 1, days: 0, reliable: false };
  if (!through) return none;
  const from = addDays(through, -(ELASTICITY_LOOKBACK_DAYS - 1));
  const byDay = new Map<string, { g: number; h: number }>();
  for (const s of sessions) {
    if (!isCountable(s) || s.date < from || s.date > through || resolveCampBucketType(s.date, camp) !== "daily") continue;
    const e = byDay.get(s.date) ?? { g: 0, h: 0 };
    e.g += s.actualGmv ?? 0;
    e.h += sessionDurationHours(s.startTime, s.endTime);
    byDay.set(s.date, e);
  }
  const pts = [...byDay.values()].filter((e) => e.g > 0 && e.h > 0).map((e) => [Math.log(e.h), Math.log(e.g)] as const);
  if (pts.length < ELASTICITY_MIN_DAYS) return { ...none, days: pts.length };
  const n = pts.length;
  const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
  const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  if (sxx < 0.5) return { ...none, days: n }; // giờ các ngày gần như bằng nhau — không đo được co giãn
  const slope = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / sxx;
  return { value: Math.min(1, Math.max(0.3, slope)), days: n, reliable: true };
}

export type LeverTone = "fix" | "grow" | "info";

export interface Lever {
  id: "data_missing" | "open_slots" | "add_hours" | "camp_coverage" | "rate_needed" | "best_block" | "scale_hours" | "raise_target" | "keep_pace";
  tone: LeverTone;
  title: string;
  detail: string;
  /** GMV dự kiến thêm / giữ được nếu làm (null = không ước lượng được). */
  gmv: number | null;
  hours: number | null;
  /** Căn cứ tính — hiện cạnh đòn bẩy để người đọc kiểm được. */
  basis: string;
}

export type PlanMode = "no_target" | "no_forecast" | "short" | "unlikely" | "likely" | "safe";

export interface HandlingPlan {
  mode: PlanMode;
  landing: LandingKey;
  /** Target − dự phóng (dương = thiếu). */
  gap: number | null;
  remainingHours: number;
  /** GMV/giờ cần trên các giờ ca còn lại để chạm target, và GMV/giờ đang chiếu. */
  needRate: number | null;
  blendedRate: number | null;
  /** GMV/giờ ngày thường × co giãn — giá trị của MỘT giờ thêm. Null khi chưa có GMV/giờ 28 ngày. */
  marginalRate: number | null;
  /** Dự phóng GMV của các ca còn lại (từ hôm nay). */
  futureForecast: number;
  elasticity: Elasticity;
  levers: Lever[];
  /** Ba mốc điều chỉnh giờ của tháng (sau đợt D-Day, sau Mid-Month, ngày 20 — engine target v3). */
  checkpoints: Checkpoint[];
  /** Phương án ở mốc gần nhất đã tới (null trước mốc đầu, khi chưa có target hoặc không còn ca). */
  checkpoint: CheckpointAdvice | null;
}

export interface PlanInput {
  outlook: MonthOutlook;
  today: string;
  /** Mọi ca của kênh (brand × sàn) — để tính co giãn, lịch sử ngày camp, khung giờ. */
  sessions: LiveSession[];
  camp?: CampOverrides;
  /** Giờ một ca điển hình để đổi "giờ cần thêm" ra "số ca" (mặc định kế hoạch). */
  slotHours?: number;
  /** Mốc điều chỉnh: bù tối đa +X giờ của phần còn lại (EngineParams.fcCheckpointCap). Thiếu = 0,3. */
  checkpointCap?: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const h1 = (v: number) => round1(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export function handlingPlan(x: PlanInput): HandlingPlan {
  const o = x.outlook;
  const landing = landingOf(o);
  const slotHours = x.slotHours && x.slotHours > 0 ? x.slotHours : 3;
  const bucketOf = (d: string) => resolveCampBucketType(d, x.camp);
  const future = o.pending.filter((p) => p.date >= x.today);
  const remainingHours = future.reduce((a, p) => a + p.hours, 0);
  const futureForecast = future.reduce((a, p) => a + p.forecast, 0);
  const blendedRate = remainingHours > 0 && o.rates ? futureForecast / remainingHours : null;
  const el = dayElasticity(x.sessions, o.through, x.camp);
  const marginalDaily = o.rates ? o.rates.daily * el.value : null;
  const marginalCamp = o.rates ? o.rates.camp * el.value : null;
  const elNote = el.reliable ? `co giãn ${el.value.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} từ ${el.days} ngày thường` : "chưa đủ ngày thường để đo co giãn nên tính tối thiểu";
  const gap = o.target && o.projectionMethod !== "none" ? o.target.total - o.projected : null;
  const mode: PlanMode = landing.key === "no_target" ? "no_target" : landing.key === "no_forecast" ? "no_forecast" : landing.key;
  const levers: Lever[] = [];
  // P6 (engine target v3): mốc gần nhất đã tới ⇒ giờ cần đổi cho phần còn lại theo co giãn, kẹp trần. Trước mốc đầu vẫn tính để
  // biết sớm, chỉ là chưa tới lúc chốt điều chỉnh.
  const checkpoints = checkpointsOf(o.month, o.days, bucketOf);
  const cp = activeCheckpoint(checkpoints, x.today) ?? checkpoints[0] ?? null;
  const checkpoint = cp && o.target && o.projectionMethod !== "none"
    ? checkpointAdvice(cp, o.target.total, o.projected, futureForecast, remainingHours, el.value, x.checkpointCap ?? 0.3)
    : null;

  // 1. Số chưa về của ca đã chạy — sửa trước vì mọi con số khác đang dựa vào ước tính.
  const missingPast = o.pending.filter((p) => p.kind === "session" && p.date < x.today);
  if (missingPast.length > 0) {
    const g = missingPast.reduce((a, p) => a + p.forecast, 0);
    levers.push({
      id: "data_missing",
      tone: "fix",
      title: `Cập nhật số của ${missingPast.length} ca đã chạy`,
      detail: `Đang tạm tính ${g > 0 ? `khoảng ${fmtVndShort(g)} ` : ""}theo dự báo từng ca. Up file giao ca / đối soát để thay bằng số thật — dự phóng và run-rate sẽ chính xác hơn.`,
      gmv: g > 0 ? g : null,
      hours: round1(missingPast.reduce((a, p) => a + p.hours, 0)),
      basis: "Ca đã quá ngày mà chưa có số (monthOutlook.pending, loại ca)."
    });
  }

  // 2. Ca mở chưa có người — dự phóng đang coi như sẽ có người nhận.
  const open = future.filter((p) => p.kind === "open_slot");
  if (open.length > 0) {
    const g = open.reduce((a, p) => a + p.forecast, 0);
    levers.push({
      id: "open_slots",
      tone: "fix",
      title: `Lấp ${open.length} ca còn mở chưa có người`,
      detail: `${h1(open.reduce((a, p) => a + p.hours, 0))} giờ đang nằm trong dự phóng. Không ai nhận thì dự phóng mất khoảng ${fmtVndShort(g)} GMV.`,
      gmv: g,
      hours: round1(open.reduce((a, p) => a + p.hours, 0)),
      basis: "Ca mở trong lịch × dự báo từng ca (engine target v3: hình dạng tháng × mức đã cập nhật bằng số trong tháng; kênh chưa đủ lịch sử: GMV/giờ 28 ngày)."
    });
  }

  // 3. Ngày camp còn lại mà lịch mỏng hơn mọi khi.
  if (o.rates && marginalCamp != null) {
    const histDays = new Map<string, number>();
    const from = addDays(o.through ?? x.today, -119);
    for (const s of x.sessions) {
      if (!isCountable(s) || s.date < from || s.date > (o.through ?? x.today) || bucketOf(s.date) === "daily") continue;
      histDays.set(s.date, (histDays.get(s.date) ?? 0) + sessionDurationHours(s.startTime, s.endTime));
    }
    const hist = [...histDays.values()];
    const typical = hist.length >= 3 ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
    if (typical && typical > 0) {
      const schedBy = new Map<string, number>();
      for (const p of future) if (bucketOf(p.date) !== "daily") schedBy.set(p.date, (schedBy.get(p.date) ?? 0) + p.hours);
      const campDaysLeft = o.days.filter((d) => d >= x.today && bucketOf(d) !== "daily");
      const thin = campDaysLeft.map((d) => ({ d, sched: schedBy.get(d) ?? 0 })).filter((r) => r.sched < typical * 0.7);
      if (thin.length > 0) {
        const miss = thin.reduce((a, r) => a + (typical - r.sched), 0);
        levers.push({
          id: "camp_coverage",
          tone: "grow",
          title: `Ngày camp còn lại đang ít giờ hơn thường: ${thin.length} ngày`,
          detail: `Lịch mới có ${h1(thin.reduce((a, r) => a + r.sched, 0))}h so với khoảng ${h1(typical * thin.length)}h mọi khi (${h1(typical)}h/ngày camp). Đủ giờ thì thêm khoảng ${h1(miss)}h.`,
          gmv: miss * marginalCamp,
          hours: round1(miss),
          basis: `Giờ trung bình một ngày camp trong 120 ngày gần nhất (${hist.length} ngày) × GMV/giờ camp 28 ngày, ${elNote}.`
        });
      }
    }
  }

  // 4. Khung giờ nên dồn thêm (chỉ khi quy tắc qua backtest walk-forward).
  let bestBlock: { block: SlotBlock; idx: number } | null = null;
  {
    const idx = slotIndex(x.sessions, bucketOf, 400);
    const wf = walkForward(x.sessions, bucketOf, (s) => slotBlock(s.startTime));
    if (slotRuleReliable(idx, wf)) {
      const rows = Object.values(idx).filter((r): r is NonNullable<typeof r> => !!r && r.lo > 1 && r.sessions >= 5);
      rows.sort((a, b) => b.idx - a.idx);
      if (rows[0]) bestBlock = { block: rows[0].block, idx: rows[0].idx };
    }
  }

  const adding = landing.key === "short" || landing.key === "unlikely";
  if (gap != null && gap > 0 && checkpoint && checkpoint.pct > 0) {
    // 5. Thiếu: cần thêm bao nhiêu giờ — công thức mốc điều chỉnh (đổi_giờ = ((R̂ + thiếu) ÷ R̂)^(1 ÷ co_giãn) − 1, kẹp trần).
    const hrs = checkpoint.extraHours;
    const cpLabel = `${CHECKPOINT_LABEL[checkpoint.checkpoint.key]} (${Number(checkpoint.checkpoint.date.slice(8))}/${Number(checkpoint.checkpoint.date.slice(5, 7))})`;
    levers.push({
      id: "add_hours",
      tone: "grow",
      title: `Mốc ${cpLabel}: thêm khoảng ${Math.ceil(hrs)} giờ live (+${Math.round(checkpoint.pct * 100)}% giờ còn lại, ≈ ${Math.ceil(hrs / slotHours)} ca ${slotHours}h)`,
      detail: `${checkpoint.capped ? `Để chạm target cần +${Math.round(checkpoint.needPct * 100)}% giờ — vượt trần +${Math.round((x.checkpointCap ?? 0.3) * 100)}%, nên thêm tới trần VÀ báo brand sớm khả năng hụt (làm đủ trần thì dự phóng ≈ ${fmtVndShort(checkpoint.projectedAfter)}). ` : `Làm đủ thì dự phóng ≈ ${fmtVndShort(checkpoint.projectedAfter)} (chạm target). `}${bestBlock ? `Ưu tiên khung ${SLOT_BLOCK_LABEL[bestBlock.block].toLowerCase()} — chỉ số ${bestBlock.idx.toLocaleString("vi-VN", { maximumFractionDigits: 2 })} so với ngày thường (qua backtest).` : "Chưa đủ dữ liệu để chỉ khung giờ nào tốt hơn."}`,
      gmv: checkpoint.projectedAfter - o.projected,
      hours: Math.ceil(hrs),
      basis: `Thiếu ${fmtVndShort(gap)} trên dự phóng ${fmtVndShort(futureForecast)} của ${h1(remainingHours)}h còn lại; giờ cần = ((còn lại + thiếu) ÷ còn lại)^(1 ÷ co giãn) − 1; ${elNote}. Ba mốc điều chỉnh mỗi tháng: sau đợt D-Day, sau Mid-Month, ngày 20.`
    });
  }
  // 6. GMV/giờ cần trên giờ còn lại.
  const needFuture = o.target ? o.target.total - (o.actual + missingPast.reduce((a, p) => a + p.forecast, 0)) : null;
  const needRate = needFuture != null && remainingHours > 0 ? Math.max(0, needFuture) / remainingHours : null;
  if (adding && needRate != null && blendedRate && blendedRate > 0) {
    const up = needRate / blendedRate - 1;
    levers.push({
      id: "rate_needed",
      tone: "info",
      title: `Nếu giữ nguyên lịch: cần GMV/giờ cao hơn ${Math.round(up * 100)}%`,
      detail: up > 0.25 ? "Tăng cỡ này bằng kịch bản/ưu đãi khó đạt một mình — nên kèm thêm giờ hoặc báo brand sớm về khả năng hụt." : "Tăng trong tầm với bằng ưu đãi và kịch bản chốt ở các ca còn lại.",
      gmv: null,
      hours: null,
      basis: `Cần ${fmtVndShort(needRate)}/giờ trên ${h1(remainingHours)}h còn lại, đang chiếu ${fmtVndShort(blendedRate)}/giờ.`
    });
  }

  if (!adding && gap != null && o.target && marginalDaily && marginalDaily > 0) {
    // 7. Đủ/vượt: mở rộng.
    const per = slotHours * marginalDaily;
    if (landing.key === "safe") {
      levers.push({
        id: "scale_hours",
        tone: "grow",
        title: `Mở rộng: mỗi ca ${slotHours}h thêm ≈ ${fmtVndShort(per)} GMV`,
        detail: `${bestBlock ? `Khung ${SLOT_BLOCK_LABEL[bestBlock.block].toLowerCase()} đang tốt nhất (chỉ số ${bestBlock.idx.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}). ` : ""}Chi phí và lãi của giờ thêm sẽ tính được khi đã nhập commission và rate.`,
        gmv: per,
        hours: slotHours,
        basis: `GMV/giờ ngày thường 28 ngày × co giãn; ${elNote}.`
      });
      if (landing.ratio != null && landing.ratio >= 1.15) {
        levers.push({
          id: "raise_target",
          tone: "info",
          title: `Dự phóng vượt target ${Math.round((landing.ratio - 1) * 100)}% — cân nhắc đề xuất brand nâng target`,
          detail: "Nâng target giữa tháng giúp run-rate phản ánh đúng mục tiêu và mở cửa thêm ngân sách giờ live.",
          gmv: null,
          hours: null,
          basis: "Dự phóng ÷ target; dải tin cậy nằm trên target."
        });
      }
    } else {
      levers.push({
        id: "keep_pace",
        tone: "info",
        title: "Giữ nhịp, chưa cần thêm giờ — nhưng chưa chắc",
        detail: "Dự phóng chạm target nhưng dải tin cậy vẫn chạm dưới target. Lấp hết ca mở và cập nhật số ca đã chạy trước khi nghĩ tới mở rộng.",
        gmv: null,
        hours: null,
        basis: "Khả năng đạt target dưới 80%."
      });
    }
  }

  const order: Record<LeverTone, number> = { fix: 0, grow: 1, info: 2 };
  levers.sort((a, b) => order[a.tone] - order[b.tone] || (b.gmv ?? 0) - (a.gmv ?? 0));
  return { mode, landing: landing.key, gap, remainingHours, needRate, blendedRate, marginalRate: marginalDaily, futureForecast, elasticity: el, levers, checkpoints, checkpoint };
}

export interface WhatIf {
  addHours: number;
  /** Đổi GMV/giờ của các ca còn lại, đơn vị phần trăm (10 = +10%). */
  ratePct: number;
}

/**
 * Thử một kịch bản: thêm giờ live và/hoặc đổi GMV/giờ phần còn lại. Dải tin cậy tính lại theo phần còn lại MỚI.
 * Giờ thêm trả theo GMV/giờ × co giãn (không phải GMV/giờ trung bình).
 */
export function applyWhatIf(o: MonthOutlook, plan: HandlingPlan, w: WhatIf): { projected: number; landing: Landing } {
  const projected = o.projected + w.addHours * (plan.marginalRate ?? 0) + (plan.futureForecast * w.ratePct) / 100;
  const half = coneHalf(o.actual, projected, o.coneCoef);
  return { projected, landing: landingOf({ actual: o.actual, projected, projectionMethod: o.projectionMethod, target: o.target, coneCoef: o.coneCoef }, half) };
}
