import type { LiveSession } from "../../types";
import { assertOnePlatform } from "../platforms/perf";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../scheduling/engineParams";
import { buildHistory, estimateSlots } from "../scheduling/suggestEngine";
import { backtestMonthForecast, type ForecastParams } from "./monthForecast";
import { isCountable } from "./hostPerformance";

// Bảng chấm mô hình dự báo theo tháng (07/11, thay đổi 5 của đề xuất dự báo) — mỗi tháng đã hết, dự báo LÚC LẬP của:
//   v3     engine chính (Kế Hoạch Tháng, Dashboard)
//   sched  bộ xếp ca (`estimateSlots` — mô hình gợi ý lịch)
//   v3_kb  v3 × Kịch bản brand (chỉ có trong sổ, 0201)
// lệch bao nhiêu so với GMV thật. Nguồn: sổ dự báo (con số app thật sự nói lúc chốt, ngoài mẫu) khi có, thiếu thì backtest walk-forward
// (dữ liệu tới ngày 20 tháng trước, lịch = ca đã live thật).
// Luật đổi mô hình (user "làm cả 5", chọn "chờ T11–T12"): chỉ xét tháng có SỔ của cả hai mô hình — backtest đã dùng để chỉnh bộ xếp ca
// 06/11 nên không tính; bộ xếp ca đúng hơn ≥ 2 điểm % ở 2 tháng sổ gần nhất ⇒ báo "đủ điều kiện đổi". App KHÔNG tự đổi.

export type ScoreSource = "ledger" | "backtest";

export interface ModelScoreRow {
  month: string;
  actual: number;
  v3: { error: number; source: ScoreSource } | null;
  sched: { error: number; source: ScoreSource } | null;
  /** Chỉ từ sổ (kịch bản brand không có trong backtest). */
  v3Kb: number | null;
}

export interface LedgerPlanRow {
  month: string;
  kind: string;
  model?: string;
  p50: number;
  asOf: string;
}

export const SWITCH_MIN_GAIN = 0.02;
export const SWITCH_MONTHS = 2;

/** Dòng sổ "plan" cuối cùng của một mô hình trong tháng (chốt lại nhiều lần ⇒ lấy lần cuối trước khi tháng bắt đầu, thiếu thì lần cuối). */
function lastPlan(rows: readonly LedgerPlanRow[], month: string, model: string): LedgerPlanRow | null {
  const xs = rows.filter((r) => r.kind === "plan" && r.month === month && (r.model ?? "v3") === model).sort((a, b) => a.asOf.localeCompare(b.asOf));
  return [...xs].reverse().find((r) => r.asOf < `${month}-01`) ?? xs[xs.length - 1] ?? null;
}

/** GMV thật cả tháng của MỘT kênh (ca có số, kể cả ngoài kế hoạch, bỏ ca loại khỏi báo cáo) — cùng cách chấm cho sổ và Kịch bản brand. */
export function channelMonthActual(channel: readonly LiveSession[], month: string): number {
  return channel.filter((s) => s.date.startsWith(month) && !s.excludedFromReports && isCountable(s)).reduce((a, s) => a + (s.actualGmv ?? 0), 0);
}

export function modelScoreboard(channel: LiveSession[], params: ForecastParams & Partial<EngineParams>, today: string, ledger: readonly LedgerPlanRow[]): ModelScoreRow[] {
  assertOnePlatform(channel, "modelScoreboard");
  const bt = backtestMonthForecast(channel, params, today);
  const actualOf = (m: string) => channelMonthActual(channel, m);
  const months = [...new Set([...bt.folds.map((f) => f.month), ...ledger.filter((r) => r.kind === "plan").map((r) => r.month)])]
    .filter((m) => m < today.slice(0, 7))
    .sort();
  const full: EngineParams = { ...DEFAULT_ENGINE_PARAMS, ...params };
  const rows: ModelScoreRow[] = [];
  for (const m of months) {
    const actual = actualOf(m);
    if (!(actual > 0)) continue;
    const err = (p: number) => p / actual - 1;
    const fold = bt.folds.find((f) => f.month === m);
    const lv3 = lastPlan(ledger, m, "v3");
    const lsc = lastPlan(ledger, m, "sched");
    const lkb = lastPlan(ledger, m, "v3_kb");
    let sched: ModelScoreRow["sched"] = lsc ? { error: err(lsc.p50), source: "ledger" } : null;
    if (!sched && fold) {
      const [y, mo] = m.split("-").map(Number);
      const cut = new Date(Date.UTC(y, mo - 2, 20)).toISOString().slice(0, 10);
      const test = channel.filter((s) => s.date.startsWith(m) && !s.excludedFromReports && s.status === "Completed" && (s.actualGmv ?? 0) > 0);
      const brandId = test[0]?.brandId;
      if (brandId) {
        const h = buildHistory(channel.filter((s) => s.date < cut), brandId, cut, { params: full });
        const p = h.brandGmvPerHour > 0 ? estimateSlots(h, test.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })), {}).reduce((a, v) => a + v, 0) : 0;
        // Backtest chấm trên đúng các ca của fold (ca có GMV) như v3 — cùng mẫu số thì hai mô hình mới so được.
        const ya = test.reduce((a, s) => a + s.actualGmv, 0);
        if (p > 0 && ya > 0) sched = { error: p / ya - 1, source: "backtest" };
      }
    }
    rows.push({
      month: m,
      actual,
      v3: lv3 ? { error: err(lv3.p50), source: "ledger" } : fold ? { error: fold.planError, source: "backtest" } : null,
      sched,
      v3Kb: lkb ? err(lkb.p50) : null
    });
  }
  return rows;
}

export interface SwitchAdvice {
  /** Số tháng có sổ của CẢ HAI mô hình. */
  ledgerMonths: number;
  /** Bộ xếp ca đúng hơn ≥ 2 điểm ở 2 tháng sổ gần nhất. */
  switchToSched: boolean;
  /** Chênh |lệch| trung bình (v3 − bộ xếp ca) trên các tháng sổ, điểm %. Dương = bộ xếp ca đúng hơn. */
  avgGainPts: number | null;
}

export function switchAdvice(rows: readonly ModelScoreRow[]): SwitchAdvice {
  const both = rows.filter((r) => r.v3?.source === "ledger" && r.sched?.source === "ledger");
  const gains = both.map((r) => Math.abs(r.v3!.error) - Math.abs(r.sched!.error));
  const last = gains.slice(-SWITCH_MONTHS);
  return {
    ledgerMonths: both.length,
    switchToSched: last.length === SWITCH_MONTHS && last.every((g) => g >= SWITCH_MIN_GAIN),
    avgGainPts: gains.length ? (gains.reduce((a, v) => a + v, 0) / gains.length) * 100 : null
  };
}
