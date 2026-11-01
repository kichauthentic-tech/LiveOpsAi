import React, { useMemo, useState } from "react";
import type { LiveSession, ShiftRegistration, ShiftSlot, Talent, TalentRateHistoryEntry } from "../../types";
import { fmtFixed, fmtVndShort } from "../../lib/format";
import { addDays } from "../../lib/dateUtils";
import { PlatformChip } from "../common/PlatformChip";
import { buildFamiliarity } from "../../lib/roster/candidates";
import { buildRosterShifts, shiftHours, type BrandRuleIndex, type RosterRules, type RosterShift } from "../../lib/roster/rules";
import {
  GOALS,
  GOAL_LABEL,
  buildHostPerformance,
  daysInMonth,
  releaseAutoFilled,
  planMonth,
  type AutoFill,
  type MonthBounds,
  type MonthPlan,
  type PlanGoal
} from "../../lib/roster/monthPlanner";
import { dayLabel } from "./ShiftPanel";

// Xếp cả tháng theo mục tiêu (01/11): ba nút Performance / Chi phí / Cân bằng, lịch cả tháng của agency với host + trợ gợi ý (chỉ từ
// pool đã đăng ký đúng ca), và khối khối lượng từng người so với giờ tối thiểu / tối đa. Kết quả tính sống, chỉ ghi DB khi bấm
// "Lưu vào nháp" (nháp, chưa công bố — công bố vẫn theo từng tuần ở màn chính).

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");
const num = (v: string, fallback: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Math.max(0, Number(v)));
const Metric: React.FC<{ label: string; value: string; sub?: string; tone?: "bad" | "warn" | "good" }> = ({ label, value, sub, tone }) => (
  <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2">
    <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
    <div className={`text-lg font-black tabular-nums ${tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-400" : "text-[var(--text)]"}`}>{value}</div>
    {sub && <div className="text-[11px] text-[var(--text-muted)]">{sub}</div>}
  </div>
);

interface Props {
  month: string;
  goal: PlanGoal;
  onGoal: (g: PlanGoal) => void;
  range: { from: string; to: string };
  minScale: number;
  bounds: MonthBounds;
  onBounds: (b: MonthBounds) => void;
  /** Phần nháp do bộ xếp tự fill — gỡ ra để so sánh "nếu xếp lại" cho đúng. */
  auto: AutoFill;
  scopeLabel: string;
  today: string;
  sessions: readonly LiveSession[];
  shiftSlots: readonly ShiftSlot[];
  registrations: readonly ShiftRegistration[];
  drafts: readonly { slotId: string; hostId?: string; coHostId?: string }[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  rules: RosterRules;
  brandRules?: BrandRuleIndex;
  nameOf: (id: string) => string;
  showCost: boolean;
}

export const MonthPlanPanel: React.FC<Props> = (p) => {
  const { goal, bounds } = p;
  const [guaranteeMin, setGuaranteeMin] = useState(true);
  const [brandFilter, setBrandFilter] = useState("");

  const pickGoal = p.onGoal;
  const setBound = (role: keyof MonthBounds, k: "min" | "max", v: string) => p.onBounds({ ...bounds, [role]: { ...bounds[role], [k]: num(v, bounds[role][k]) } });

  const monthStart = `${p.month}-01`;
  const monthEnd = `${p.month}-${String(daysInMonth(p.month)).padStart(2, "0")}`;
  const shifts = useMemo(
    () => releaseAutoFilled(buildRosterShifts(p.sessions, p.shiftSlots, p.drafts, p.registrations, addDays(monthStart, -7), addDays(monthEnd, 7)), p.auto, p.range),
    [p.sessions, p.shiftSlots, p.drafts, p.registrations, monthStart, monthEnd, p.auto, p.range]
  );
  const fam = useMemo(() => buildFamiliarity(p.sessions, monthStart), [p.sessions, monthStart]);
  const perf = useMemo(() => buildHostPerformance(p.sessions, p.today), [p.sessions, p.today]);

  // Tính cả ba mục tiêu một lượt để trainer so sánh trước khi chọn (rẻ: vài trăm ca × vài chục người).
  const plans = useMemo(() => {
    const out = {} as Record<PlanGoal, MonthPlan>;
    for (const g of GOALS) out[g] = planMonth({ shifts, month: p.month, today: p.today, goal: g, bounds, guaranteeMin, rules: p.rules, talents: p.talents, history: p.history, fam, perf, brandRules: p.brandRules, range: p.range, minScale: p.minScale });
    return out;
  }, [shifts, p.month, p.today, bounds, guaranteeMin, p.rules, p.talents, p.history, fam, perf, p.brandRules, p.range, p.minScale]);
  const plan = plans[goal];

  const monthShifts = useMemo(() => shifts.filter((s) => s.date.slice(0, 7) === p.month), [shifts, p.month]);
  const who = useMemo(() => {
    const m = new Map<string, { host?: string; co?: string; planned: { host: boolean; co: boolean } }>();
    for (const s of monthShifts) m.set(s.key, { host: s.hostId, co: s.coHostId, planned: { host: false, co: false } });
    for (const a of plan.assignments) {
      const o = m.get(a.shiftKey);
      if (!o) continue;
      if (a.role === "host") {
        o.host = a.talentId;
        o.planned.host = a.source === "plan";
      } else {
        o.co = a.talentId;
        o.planned.co = a.source === "plan";
      }
    }
    return m;
  }, [monthShifts, plan.assignments]);
  const unfilledBy = useMemo(() => new Map(plan.unfilled.map((u) => [`${u.shiftKey}|${u.role}`, u])), [plan.unfilled]);

  const brands = useMemo(() => [...new Map(monthShifts.map((s) => [s.brandId, s.brandName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [monthShifts]);
  const days = useMemo(() => {
    const by = new Map<string, RosterShift[]>();
    for (const s of monthShifts) {
      if (brandFilter && s.brandId !== brandFilter) continue;
      const l = by.get(s.date) ?? [];
      l.push(s);
      by.set(s.date, l);
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [monthShifts, brandFilter]);

  const T = plan.totals;
  const noOpen = T.openShifts === 0;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        Đang xem <b className="text-[var(--text)]">{p.scopeLabel}</b>, mục tiêu <b className="text-[var(--text)]">{GOAL_LABEL[goal]}</b>. Đổi mục tiêu bằng 3 nút trên calendar; số dưới đây là kết quả nếu xếp lại theo từng mục tiêu.
      </p>

      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 text-xs">
        {(
          [
            ["host", "Host"],
            ["co_host", "Trợ live"]
          ] as const
        ).map(([role, label]) => (
          <div key={role} className="flex items-center gap-1.5">
            <span className="font-bold text-[var(--text)]">{label}</span>
            <span className="text-[var(--text-muted)]">giờ/tháng tối thiểu</span>
            <input type="number" min={0} value={bounds[role].min} onChange={(e) => setBound(role, "min", e.target.value)} className="w-14 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 tabular-nums" aria-label={`${label} giờ tối thiểu`} />
            <span className="text-[var(--text-muted)]">tối đa</span>
            <input type="number" min={0} value={bounds[role].max} onChange={(e) => setBound(role, "max", e.target.value)} className="w-14 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 tabular-nums" aria-label={`${label} giờ tối đa`} />
          </div>
        ))}
        <label className="flex items-center gap-1.5 text-[var(--text-muted)]" title="Người đã đăng ký mà dưới giờ tối thiểu sẽ nhận thêm ca từ người đang nhiều giờ hơn">
          <input type="checkbox" checked={guaranteeMin} onChange={(e) => setGuaranteeMin(e.target.checked)} /> Đảm bảo giờ tối thiểu
        </label>
        <span className="text-[11px] text-[var(--text-faint)]">Mặc định đo giờ live thật T8–T10: tối thiểu ≈ P25, tối đa ≈ P90 của người có ca. Tối đa còn bị chặn bởi luật giờ tuần/ngày.</span>
      </div>

      {noOpen ? (
        <p className="text-sm text-[var(--text-muted)]">Chưa có ca mở nào trong phạm vi này để xếp. Mở lịch ở “Mở lịch tháng sau” trước.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-base)] text-[var(--text-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">So sánh ba mục tiêu</th>
                  <th className="px-3 py-2 text-right font-bold">Chỗ đã lấp</th>
                  <th className="px-3 py-2 text-right font-bold">Chi phí người cả tháng</th>
                  <th className="px-3 py-2 text-right font-bold">Chỉ số host (theo giờ)</th>
                  <th className="px-3 py-2 text-right font-bold">Dưới tối thiểu</th>
                  <th className="px-3 py-2 text-right font-bold">Vượt tối đa</th>
                </tr>
              </thead>
              <tbody>
                {GOALS.map((g) => {
                  const t = plans[g].totals;
                  return (
                    <tr key={g} className={`border-t border-[var(--border)] ${g === goal ? "bg-[var(--accent)]/10" : ""}`}>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => pickGoal(g)} className="font-bold text-[var(--text)] hover:underline">
                          {GOAL_LABEL[g]}
                        </button>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {t.filled}/{t.spots}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{p.showCost ? fmtVndShort(t.cost) : "chưa có rate"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.perfIndex == null ? "—" : fmtFixed(t.perfIndex, 2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.below}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.over}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--text-faint)]">
            Chỉ số host: 1,00 = bằng kỳ vọng cùng kênh × khung giờ, đo trên {`90`} ngày gần nhất và co về 1,00 khi ít ca. Thành tích host tháng trước dự báo tháng sau yếu (đo 13/10: r từ −0,13 đến 0,23), nên đây là căn cứ phụ — chênh vài phần trăm đừng coi là hơn kém.
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Chỗ đã có người" value={`${T.filled}/${T.spots}`} sub={`${T.plannedCount} chỗ do gợi ý này lấp`} tone={T.filled < T.spots ? "warn" : "good"} />
            <Metric label="Chi phí người (ca mở)" value={p.showCost ? fmtVndShort(T.openCost) : "—"} sub={p.showCost ? `cả tháng ${fmtVndShort(T.cost)}` : undefined} tone={T.costMissing > 0 ? "warn" : undefined} />
            <Metric label="Dưới giờ tối thiểu" value={String(T.below)} sub="người đã đăng ký mà chưa đủ giờ" tone={T.below > 0 ? "warn" : "good"} />
            <Metric label="Vượt giờ tối đa" value={String(T.over)} sub={plan.unfilled.length ? `${plan.unfilled.length} chỗ chưa lấp được` : undefined} tone={T.over > 0 ? "bad" : "good"} />
          </div>

          <section aria-label="Lịch cả tháng" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-black text-[var(--text)]">Lịch cả tháng của agency</h3>
              <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                Brand
                <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)} className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-2 py-1 text-[var(--text)]">
                  <option value="">Tất cả</option>
                  {brands.map(([id, n]) => (
                    <option key={id} value={id}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)]">
              {days.map(([date, list]) => (
                <div key={date} className="grid gap-2 px-3 py-2 sm:grid-cols-[64px_minmax(0,1fr)]">
                  <div className="text-xs font-black text-[var(--text)]">{dayLabel(date)}</div>
                  <div className="space-y-1">
                    {list.map((s) => {
                      const w = who.get(s.key);
                      const slot = (role: "host" | "co_host") => {
                        const id = role === "host" ? w?.host : w?.co;
                        const planned = role === "host" ? w?.planned.host : w?.planned.co;
                        if (id) return <span className={planned ? "font-bold text-[var(--accent)]" : "text-[var(--text)]"}>{p.nameOf(id)}</span>;
                        const u = unfilledBy.get(`${s.key}|${role}`);
                        return (
                          <span className="text-rose-400" title={u?.detail}>
                            {s.kind === "session" ? "chưa có" : u?.reason === "no_registrant" ? "chưa ai đăng ký" : "chưa lấp được"}
                          </span>
                        );
                      };
                      return (
                        <div key={s.key} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                          <span className="tabular-nums text-[var(--text-muted)] w-[88px]">
                            {s.startTime}–{s.endTime}
                          </span>
                          <span className="flex items-center gap-1 min-w-[110px] font-bold text-[var(--text)]">
                            {s.brandName} <PlatformChip platform={s.platform} />
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Host: {slot("host")}
                          </span>
                          <span className="text-[var(--text-muted)]">
                            Trợ: {slot("co_host")}
                          </span>
                          {s.kind === "open" && <span className="text-[11px] text-[var(--text-faint)]">{s.registrants.length} đăng ký · {fmtH(shiftHours(s))}h</span>}
                          {s.kind === "session" && <span className="text-[11px] text-[var(--text-faint)]">đã lên lịch</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {days.length === 0 && <p className="px-3 py-3 text-xs text-[var(--text-muted)]">Không có ca nào trong bộ lọc.</p>}
            </div>
            <p className="text-[11px] text-[var(--text-faint)]">Chữ màu nhấn = người do gợi ý này chọn. Chữ thường = ca đã lên lịch hoặc nháp có sẵn.</p>
          </section>
        </>
      )}
    </div>
  );
};
