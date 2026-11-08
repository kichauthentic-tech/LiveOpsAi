// Kịch bản brand (07/11, migration 0201) — sau buổi họp monthly, CEO ghi những gì brand nói mà lịch sử ca không có: Ads tăng/giảm,
// voucher/scheme, hàng mới, hết hàng, mức tham gia campaign sàn (11.11, 12.12), mùa vụ. Mỗi dòng = một % + lý do.
//
//   dự báo cuối = dự báo engine × Π(1 + pct)
//
// Vì sao: lúc lập kế hoạch mọi công thức đều sai ~20% (thử 8 cách, 06/11) vì GMV/giờ của kênh trôi 0,6–1,9 lần theo nhu cầu của brand —
// thông tin đó chỉ brand có. Nhưng điều chỉnh tay chỉ giúp khi có lý do cụ thể, còn điều chỉnh TĂNG hay sai chiều (Fildes và cộng sự
// 2009, 60.000 dự báo chuỗi cung ứng; target brand T10 cao hơn thực tế ở cả 5/5 kênh) ⇒ dòng nào cũng bắt buộc lý do, và hết tháng
// app chấm lại từng dòng (`scoreScenario`) để biết loại thông tin nào của brand thật sự giúp đoán đúng.

import type { ScenarioLine } from "../../types";
export type { ScenarioLine };

export const SCENARIO_MAX_PCT = 0.5;
export const SCENARIO_MAX_LINES = 20;

/** Gợi ý nhãn dòng — chỉ để chọn nhanh, gõ nhãn khác vẫn được. */
export const SCENARIO_PRESETS = ["Ads tháng này", "Voucher / scheme", "Sản phẩm mới", "Hết hàng / thiếu size", "Mức tham gia campaign sàn", "Mùa vụ"] as const;

const clampPct = (v: number) => Math.max(-SCENARIO_MAX_PCT, Math.min(SCENARIO_MAX_PCT, v));

/** Đọc mảng jsonb từ DB — bỏ dòng hỏng, kẹp %. */
export function cleanScenario(raw: unknown): ScenarioLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ScenarioLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const pct = Number(o.pct);
    const label = String(o.label ?? "").trim();
    if (!label || !Number.isFinite(pct)) continue;
    out.push({ id: String(o.id ?? `${out.length}`), label, pct: clampPct(pct), reason: String(o.reason ?? "").trim(), at: String(o.at ?? "") });
  }
  return out.slice(0, SCENARIO_MAX_LINES);
}

/** Π(1 + pct) — 1 khi không có dòng nào. */
export function scenarioFactor(lines: readonly Pick<ScenarioLine, "pct">[]): number {
  return lines.reduce((f, l) => f * (1 + clampPct(l.pct)), 1);
}

/** Lỗi nhập một dòng (null = hợp lệ). Lý do bắt buộc với MỌI dòng; dòng tăng nhắc thêm vì hay sai chiều. */
export function scenarioLineError(l: Pick<ScenarioLine, "label" | "pct" | "reason">): string | null {
  if (!l.label.trim()) return "Ghi điều brand nói (vd \"Ads tháng này\").";
  if (!Number.isFinite(l.pct) || l.pct === 0) return "Nhập % ảnh hưởng (khác 0).";
  if (Math.abs(l.pct) > SCENARIO_MAX_PCT) return `Một dòng tối đa ±${SCENARIO_MAX_PCT * 100}%.`;
  if (!l.reason.trim()) return l.pct > 0 ? "Dòng tăng cần lý do cụ thể (điều chỉnh tăng hay sai chiều nhất)." : "Ghi lý do (nguồn: email, buổi họp…).";
  return null;
}

export interface ScenarioScore {
  /** Dự báo engine ÷ thực tế − 1. */
  engineError: number;
  /** Dự báo sau kịch bản ÷ thực tế − 1. */
  adjustedError: number;
  /** Điểm % bớt sai của cả kịch bản (dương = kịch bản làm dự báo đúng hơn). */
  gainPts: number;
  /** Từng dòng: bỏ riêng dòng đó thì |lệch| đổi bao nhiêu — dương = dòng đó giúp. */
  perLine: { id: string; label: string; pct: number; gainPts: number }[];
}

/** Chấm kịch bản khi đã có GMV thực tế của tháng. null khi thiếu số. */
export function scoreScenario(engineP50: number, lines: readonly ScenarioLine[], actual: number): ScenarioScore | null {
  if (!(engineP50 > 0) || !(actual > 0)) return null;
  const err = (f: number) => (engineP50 * f) / actual - 1;
  const all = scenarioFactor(lines);
  const adjustedError = err(all);
  const engineError = err(1);
  return {
    engineError,
    adjustedError,
    gainPts: (Math.abs(engineError) - Math.abs(adjustedError)) * 100,
    perLine: lines.map((l) => {
      const without = all / (1 + clampPct(l.pct));
      return { id: l.id, label: l.label, pct: l.pct, gainPts: (Math.abs(err(without)) - Math.abs(adjustedError)) * 100 };
    })
  };
}
