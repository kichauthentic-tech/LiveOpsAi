import React, { useMemo, useState } from "react";
import type { ReserveSlot } from "../types";
import { CHECKPOINT_LABEL, SIM_ELASTICITY, checkpointsOf } from "../lib/performance/monthForecast";
import { resolveCampBucketType, type CampOverrides } from "../lib/campaignDays";
import { daysOfMonth } from "../lib/scheduling/monthPlanGrid";
import { baseShortfall, reserveBudget, reserveHours, reserveLadder, reservePoolHours, suggestReservePool } from "../lib/scheduling/reservePlan";

// Kế Hoạch Tháng — ca dự phòng & mốc kích hoạt (0194). Lập TRƯỚC nhóm ca dự phòng ngoài lưới chính; ở mỗi mốc kiểm (sau D-Day,
// sau Mid-Month, ngày 20) nếu dự báo hụt target thì công thức bù giờ của engine cho biết cần thêm bao nhiêu giờ, bảng dưới chỉ ra
// sẽ mở những ca dự phòng nào. Ca dự phòng không cộng vào target tháng và không sinh ca khi Chốt (xem migration 0194).

const SHORTFALLS = [0.05, 0.1, 0.15];
const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const fmtPct = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });

interface Props {
  month: string;
  drafts: { date: string; startTime: string; endTime: string }[];
  /** Dự báo GMV từng ca (engine v3). Null = kênh chưa đủ lịch sử để dự báo. */
  forecast: ((slots: { date: string; startTime: string; endTime: string }[]) => number[]) | null;
  targetTotal: number;
  camp: CampOverrides;
  slotHours: number;
  windowStart: string;
  windowEnd: string;
  maxSlotsPerDay: number;
  blackoutDates: string[];
  /** Trần bù giờ mỗi mốc (EngineParams.fcCheckpointCap). */
  cap: number;
  reserve: ReserveSlot[];
  onChange: (next: ReserveSlot[]) => void;
  editable: boolean;
  /** DB chưa chạy 0194: ca dự phòng chỉ giữ trên trình duyệt, chưa lưu được. */
  columnMissing: boolean;
  /** Hiện ca dự phòng trên lưới ca bên dưới (chip vàng nét đứt). */
  showOnGrid: boolean;
  onToggleGrid: (on: boolean) => void;
}

export const ReservePlanPanel: React.FC<Props> = ({ month, drafts, forecast, targetTotal, camp, slotHours, windowStart, windowEnd, maxSlotsPerDay, blackoutDates, cap, reserve, onChange, editable, columnMissing, showOnGrid, onToggleGrid }) => {
  const [budget, setBudget] = useState("");
  const bucketOf = (d: string) => resolveCampBucketType(d, camp);
  const checkpoints = useMemo(() => checkpointsOf(month, daysOfMonth(month), bucketOf), [month, camp]); // eslint-disable-line react-hooks/exhaustive-deps
  const planHoursAfter = (from: string) => drafts.filter((d) => d.date >= from).reduce((a, d) => a + reserveHours(d), 0);

  const slotRows = useMemo(() => {
    if (!forecast || drafts.length === 0) return [];
    const f = forecast(drafts);
    return drafts.map((d, i) => ({ date: d.date, hours: reserveHours(d), forecast: f[i] ?? 0 }));
  }, [forecast, drafts]);
  const p50 = slotRows.reduce((a, r) => a + r.forecast, 0);
  const base = baseShortfall(targetTotal, p50);
  const sized = useMemo(
    () => (targetTotal > 0 && slotRows.length > 0 ? reserveBudget({ checkpoints, target: targetTotal, slots: slotRows, shortfall: base, elasticity: SIM_ELASTICITY, cap, slotHours }) : null),
    [checkpoints, targetTotal, slotRows, base, cap, slotHours]
  );
  const defaultBudget = sized?.hours ?? (checkpoints.length ? Math.max(slotHours, Math.round(planHoursAfter(checkpoints[0].date) * cap)) : 0);
  const budgetHours = Number(budget) > 0 ? Number(budget) : defaultBudget;
  // Cột "hiện tại" = hụt thật giữa target và dự báo lưới (chỉ khi ≥ 1% và không trùng cột giả định).
  const baseCol = base >= 0.01 && !SHORTFALLS.some((v) => Math.abs(v - base) < 0.005) ? base : null;
  const cols = baseCol != null ? [baseCol, ...SHORTFALLS].sort((a, b) => a - b) : SHORTFALLS;
  const ladder = useMemo(
    () => (targetTotal > 0 && slotRows.length > 0 ? reserveLadder({ checkpoints, target: targetTotal, slots: slotRows, pool: reserve, shortfalls: cols, elasticity: SIM_ELASTICITY, cap }) : []),
    [checkpoints, targetTotal, slotRows, reserve, cap, cols.join(",")] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const suggest = () => {
    if (!forecast || checkpoints.length === 0) return;
    onChange(suggestReservePool({ month, fromDate: checkpoints[0].date, planned: drafts, windowStart, windowEnd, slotHours, maxSlotsPerDay, blackoutDates, budgetHours, forecast }));
  };
  const poolHours = reservePoolHours(reserve);

  if (drafts.length === 0) return null;
  const byCp = checkpoints.map((cp) => ({ cp, cells: cols.map((sf) => ladder.find((r) => r.checkpoint.key === cp.key && r.shortfall === sf)) }));
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 text-xs" data-testid="reserve-plan">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-sm font-bold text-[var(--text)]">Ca dự phòng</h3>
        <span className="text-[var(--text-muted)] tabular-nums"><b className="text-[var(--text)]">{reserve.length} ca · {fmtH(poolHours)}h</b>{planHoursAfter("") > 0 && reserve.length > 0 && <> ≈ {Math.round((poolHours / planHoursAfter("")) * 100)}% giờ lưới</>}</span>
        <label className="flex items-center gap-1.5 text-[var(--text-muted)] cursor-pointer"><input type="checkbox" checked={showOnGrid} onChange={(e) => onToggleGrid(e.target.checked)} />Hiện trên lưới ca</label>
        {editable && forecast && (
          <span className="ml-auto flex items-center gap-2" title={`Chọn khung giờ trống có GMV dự báo cao nhất từ ngày mốc đầu (${checkpoints[0] ? dm(checkpoints[0].date) : "—"}), mỗi ngày một ca, không đè ca chính. Mặc định = giờ cần bù ở mốc đầu theo mức hụt hiện tại + 25% dư (tối thiểu theo hụt 5%), không quá +${Math.round(cap * 100)}% giờ còn lại.`}>
            <input type="number" min="0" step="1" value={budget} placeholder={String(defaultBudget)} onChange={(e) => setBudget(e.target.value)} aria-label="Ngân sách giờ dự phòng" className="w-14 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 font-mono text-[var(--text)]" />
            <span className="text-[var(--text-faint)]">giờ</span>
            <button onClick={suggest} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold">{reserve.length ? "Gợi ý lại" : "Gợi ý ca dự phòng"}</button>
            {reserve.length > 0 && <button onClick={() => onChange([])} className="px-2 py-1.5 text-[var(--text-faint)] hover:text-[var(--text)]">Xoá</button>}
          </span>
        )}
      </header>

      {columnMissing && <p className="text-amber-300">Database chưa chạy migration 0194 — ca dự phòng chưa lưu được.</p>}
      {base >= 0.01 && (
        <p className={sized?.capped ? "text-rose-400" : "text-[var(--text-muted)]"}>
          Target đang cao hơn dự báo lưới <b>{fmtPct(base)}</b>, nên nhóm dự phòng mặc định {fmtH(defaultBudget)}h (đủ bù ngay ở mốc đầu + dư 25%).
          {sized?.capped && <> Mức hụt này <b>vượt trần bù +{Math.round(cap * 100)}%</b> (cần ≈ {fmtH(sized.needHours)}h) — ca dự phòng không đủ cứu: đàm phán lại target với brand hoặc tăng giờ lưới chính.</>}
        </p>
      )}
      {!forecast && <p className="text-[var(--text-muted)]">Kênh chưa đủ lịch sử để dự báo từng ca — chưa gợi ý được.</p>}

      {ladder.length > 0 && (
        <table className="w-full text-left tabular-nums">
          <caption className="text-left text-[var(--text-muted)] pb-1">Tới mốc mà dự báo tháng hụt target …</caption>
          <thead className="text-[var(--text-faint)]">
            <tr><th className="py-1 pr-3 font-medium">Mốc</th>{cols.map((sf) => <th key={sf} className={`py-1 pr-3 font-medium ${sf === baseCol ? "text-amber-300" : ""}`}>{sf === baseCol ? `hiện tại ${fmtPct(sf)}` : `hụt ${Math.round(sf * 100)}%`}</th>)}</tr>
          </thead>
          <tbody>
            {byCp.map(({ cp, cells }) => (
              <tr key={cp.key} className="border-t border-[var(--border)]">
                <td className="py-1.5 pr-3 text-[var(--text)]">{CHECKPOINT_LABEL[cp.key]} <span className="text-[var(--text-faint)]">{dm(cp.date)}</span></td>
                {cells.map((row, i) => (
                  <td key={cols[i]} className="py-1.5 pr-3">
                    {!row?.advice || !row.pick ? "—" : (
                      <>
                        <span className="text-[var(--text)]">mở {row.pick.picked.length} ca</span> <span className="text-[var(--text-faint)]">({fmtH(row.advice.extraHours)}h)</span>
                        {row.pick.shortHours > 0 && <span className="text-amber-300"> thiếu {fmtH(row.pick.shortHours)}h</span>}
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {ladder.length > 0 && <p className="text-[var(--text-faint)]">Giờ cần thêm theo công thức mốc kiểm của engine (trần +{Math.round(cap * 100)}%). Mốc đầu chỉ dùng tối đa 60% giờ dự phòng, mốc giữa 80% — phần còn lại giữ cho mốc sau. Ca dự phòng không cộng vào target; mở bằng "Mở ca" ở Lịch & Studio.</p>}
    </section>
  );
};
