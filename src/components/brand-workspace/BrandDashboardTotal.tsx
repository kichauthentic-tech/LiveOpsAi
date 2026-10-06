import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LayoutDashboard } from "lucide-react";
import { BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyReport, LiveSession, ShiftSlot, UserRole } from "../../types";
import { monthPlanRead } from "../../lib/db/monthPlans";
import { effectiveCamp } from "../../lib/campaignDays";
import { todayVn } from "../../lib/performance/brandCommitment";
import { lastDataDate, monthEndOf, monthOutlook, RUN_RATE_BAD, RUN_RATE_WARN, totalsOf } from "../../lib/performance/ceoBrief";
import { planRunRate, projectMonthEnd } from "../../lib/performance/planRunRate";
import { fmtMonth, fmtVndShort } from "../../lib/format";
import { METRIC, metricHint } from "../../lib/metricGlossary";
import { brandMonthKey, type ReportPlatform } from "../../lib/reportPlatform";
import { PageHeader } from "../common/PageHeader";
import { MonthPicker } from "../common/MonthPicker";

// Dashboard brand — "Tổng 2 sàn" (user chốt 06/10: brand xem được cả riêng từng sàn lẫn tổng). Màn này chỉ CỘNG: mỗi
// sàn tính run-rate / dự kiến cuối tháng trên kế hoạch + target của CHÍNH sàn đó (cùng hàm với Dashboard một sàn —
// planRunRate, monthOutlook, projectMonthEnd), dòng Tổng là tổng các con số đó. Phân tích sâu (vì sao, đề xuất, host)
// nằm ở Dashboard từng sàn — năng suất hai sàn khác nhau (VERA Shopee ~1,6x GMV/giờ TikTok T6–T9) nên không gộp.

interface Props {
  brandId: string;
  brandName: string;
  platforms: ReportPlatform[];
  onPickPlatform: (p: ReportPlatform) => void;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  currentRole: UserRole;
  monthlyReports?: Map<string, BrandMonthlyReport>;
  onOpenMonthPlan: () => void;
}

const OPS_ROLES: UserRole[] = ["ceo", "admin", "operations"];
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct = (x: number | null | undefined, digits = 0) => (x == null || !isFinite(x) ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: digits })}%`);
const num = (x: number | null | undefined, digits = 0) => (x == null || !isFinite(x) ? "—" : x.toLocaleString("vi-VN", { maximumFractionDigits: digits }));
const rrTone = (v: number | null | undefined) => (v == null ? "text-[var(--text-faint)]" : v >= RUN_RATE_WARN ? "text-emerald-400" : v >= RUN_RATE_BAD ? "text-amber-300" : "text-rose-400");
const PLATFORM_COLOR: Record<ReportPlatform, string> = { TikTok: "#22d3ee", Shopee: "#f97316" };

interface Row {
  platform: ReportPlatform;
  hidden: boolean;
  sessions: number;
  hours: number;
  gmv: number;
  orders: number;
  gmvPerHour: number | null;
  through: string | null;
  planState: "locked" | "draft" | "none" | "loading";
  target: number | null;
  targetToDate: number | null;
  actualVsPlan: number | null;
  runRate: number | null;
  projection: number | null;
}

export default function BrandDashboardTotal({ brandId, brandName, platforms, onPickPlatform, sessions, shiftSlots, currentRole, monthlyReports, onOpenMonthPlan }: Props) {
  const today = todayVn();
  const isOps = OPS_ROLES.includes(currentRole);
  const brandSessions = useMemo(() => sessions.filter((s) => s.brandId === brandId), [sessions, brandId]);
  // Brand: mặc định tháng gần nhất có ít nhất một sàn đã phát hành.
  const defaultMonth = useMemo(() => {
    if (isOps) return today.slice(0, 7);
    const pub = brandSessions.filter((s) => s.monthPublished && s.date <= today).map((s) => s.date.slice(0, 7)).sort();
    return pub.at(-1) ?? today.slice(0, 7);
  }, [isOps, brandSessions, today]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? defaultMonth;
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);

  const [plans, setPlans] = useState<{ key: string; byPlatform: Partial<Record<ReportPlatform, { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>> } | null>(null);
  const planKey = `${brandId}|${month}`;
  useEffect(() => {
    let alive = true;
    Promise.all(platforms.map((p) => monthPlanRead.take(brandId, month, p).catch(() => null))).then((rs) => {
      if (alive) setPlans({ key: `${brandId}|${month}`, byPlatform: Object.fromEntries(platforms.map((p, i) => [p, rs[i]])) });
    });
    return () => {
      alive = false;
    };
  }, [brandId, month, platforms]);
  const plansReady = plans?.key === planKey;

  const rows: Row[] = useMemo(
    () =>
      platforms.map((p) => {
        const ch = brandSessions.filter((s) => (s.platform ?? "TikTok") === p);
        const inMonth = ch.filter((s) => s.date >= mStart && s.date <= mEnd);
        const hidden = !isOps && inMonth.some((s) => !s.monthPublished);
        const t = totalsOf(inMonth);
        const plan = plansReady ? plans!.byPlatform[p] ?? null : null;
        const camp = effectiveCamp(plan?.plan.campRanges, monthlyReports?.get(brandMonthKey(brandId, month, p)));
        const slots = shiftSlots.filter((sl) => sl.brandId === brandId && (sl.platform ?? "TikTok") === p);
        const locked = plan?.plan.status === "locked";
        const rr = locked ? planRunRate(month, plan!.slots, slots, ch, today, camp) : null;
        const open = slots.filter((sl) => sl.status === "open" && !sl.sessionId);
        const proj = rr ? projectMonthEnd(rr, monthOutlook(month, today, ch, open, null, camp)) : null;
        return {
          platform: p,
          hidden,
          sessions: t.sessions,
          hours: t.hours,
          gmv: t.gmv,
          orders: t.orders,
          gmvPerHour: t.gmvPerHour,
          through: lastDataDate(inMonth, today),
          planState: !plansReady ? "loading" : locked ? "locked" : plan ? "draft" : "none",
          target: rr ? rr.total.target : null,
          targetToDate: rr ? rr.total.targetToDate : null,
          actualVsPlan: rr ? rr.total.actual : null,
          runRate: rr ? rr.total.runRate : null,
          projection: proj?.value ?? null
        };
      }),
    [platforms, brandSessions, mStart, mEnd, isOps, plansReady, plans, monthlyReports, brandId, month, shiftSlots, today]
  );

  const shown = rows.filter((r) => !r.hidden);
  const sum = (f: (r: Row) => number) => shown.reduce((a, r) => a + f(r), 0);
  const total = {
    sessions: sum((r) => r.sessions),
    hours: sum((r) => r.hours),
    gmv: sum((r) => r.gmv),
    orders: sum((r) => r.orders)
  };
  // Target / run-rate / dự kiến tổng chỉ khi MỌI sàn đang hiện đều có kế hoạch đã chốt — cộng target của một sàn với GMV
  // của hai sàn là ra "% đạt" ảo (lỗi E2E #2 của Bản Tin CEO, cùng loại).
  const allPlanned = shown.length > 0 && shown.every((r) => r.target != null);
  const totalTarget = allPlanned ? sum((r) => r.target ?? 0) : null;
  const totalToDate = allPlanned ? sum((r) => r.targetToDate ?? 0) : null;
  const totalActual = allPlanned ? sum((r) => r.actualVsPlan ?? 0) : null;
  const totalProj = allPlanned && shown.every((r) => r.projection != null) ? sum((r) => r.projection ?? 0) : null;
  const totalRunRate = totalToDate && totalActual != null ? totalActual / totalToDate : null;

  const cell = "px-3 py-2 text-right font-mono whitespace-nowrap";
  const planLabel = (r: Row) => (r.planState === "loading" ? "…" : r.planState === "locked" ? fmtVndShort(r.target ?? 0) : r.planState === "draft" ? "kế hoạch nháp" : "chưa có kế hoạch");

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title={`Dashboard · ${brandName} · Tổng 2 sàn`}
        description="Cộng số của từng sàn. Target, run-rate và dự kiến cuối tháng tính riêng trên kế hoạch của mỗi sàn rồi mới cộng; muốn biết vì sao và nên sửa gì thì mở Dashboard từng sàn."
        actions={<MonthPicker value={month} onChange={setPickedMonth} ariaLabel="Tháng" />}
      />

      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
        <h3 className="font-bold text-[var(--text)]">Tháng {fmtMonth(month)}</h3>
        {total.gmv > 0 && (
          <div>
            <div className="flex h-3 rounded-full overflow-hidden bg-[var(--surface-elevated)]" role="img" aria-label="Tỷ trọng GMV theo sàn">
              {shown.filter((r) => r.gmv > 0).map((r) => (
                <div key={r.platform} style={{ flex: r.gmv, background: PLATFORM_COLOR[r.platform] }} title={`${r.platform}: ${fmtVndShort(r.gmv)} (${pct(r.gmv / total.gmv)})`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-[var(--text-muted)]">
              {shown.filter((r) => r.gmv > 0).map((r) => (
                <span key={r.platform} className="inline-flex items-center gap-1.5">
                  <i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: PLATFORM_COLOR[r.platform] }} />
                  {r.platform} {pct(r.gmv / total.gmv)} GMV
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-[var(--text-faint)] text-left">
                <th className="px-3 py-2">Sàn</th>
                <th className="px-3 py-2 text-right">Ca có số</th>
                <th className="px-3 py-2 text-right">Giờ live</th>
                <th className="px-3 py-2 text-right" title={metricHint(METRIC.gmv)}>{METRIC.gmv}</th>
                <th className="px-3 py-2 text-right">GMV/giờ</th>
                <th className="px-3 py-2 text-right">Đơn</th>
                <th className="px-3 py-2 text-right">Target tháng</th>
                <th className="px-3 py-2 text-right" title={metricHint(METRIC.runRate)}>{METRIC.runRate}</th>
                <th className="px-3 py-2 text-right">Dự kiến cuối tháng</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.platform} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-bold text-[var(--text)] whitespace-nowrap">
                    <i className="w-2.5 h-2.5 rounded-sm inline-block mr-1.5" style={{ background: PLATFORM_COLOR[r.platform] }} />
                    {r.platform}
                    {r.through && !r.hidden && <span className="ml-1.5 text-[11px] font-normal text-[var(--text-faint)]">số tới {dm(r.through)}</span>}
                  </td>
                  {r.hidden ? (
                    <td colSpan={8} className="px-3 py-2 text-xs text-[var(--text-muted)]">Số tháng này của {r.platform} hiện khi ops phát hành Report {r.platform}.</td>
                  ) : (
                    <>
                      <td className={cell}>{num(r.sessions)}</td>
                      <td className={cell}>{num(r.hours, 1)}</td>
                      <td className={`${cell} font-bold text-[var(--text)]`}>{fmtVndShort(r.gmv)}</td>
                      <td className={cell}>{r.gmvPerHour != null ? fmtVndShort(r.gmvPerHour) : "—"}</td>
                      <td className={cell}>{num(r.orders)}</td>
                      <td className={`${cell} ${r.planState === "locked" ? "" : "text-[var(--text-faint)] font-sans text-xs"}`}>
                        {r.planState !== "locked" && isOps && r.planState !== "loading" ? (
                          <button onClick={onOpenMonthPlan} className="min-h-6 underline text-[var(--accent-text)]">{planLabel(r)}</button>
                        ) : (
                          planLabel(r)
                        )}
                      </td>
                      <td className={`${cell} font-bold ${rrTone(r.runRate)}`}>{pct(r.runRate, 1)}</td>
                      <td className={cell}>{r.projection != null ? fmtVndShort(r.projection) : "—"}</td>
                    </>
                  )}
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => onPickPlatform(r.platform)} className="min-h-6 text-xs font-bold text-[var(--accent-text)] hover:underline whitespace-nowrap">
                      Xem riêng {r.platform} →
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--border-strong,var(--border))] bg-[var(--surface-base)]">
                <td className="px-3 py-2 font-black text-[var(--text)]">Tổng{shown.length < rows.length ? ` (${shown.map((r) => r.platform).join(", ")})` : ""}</td>
                <td className={cell}>{num(total.sessions)}</td>
                <td className={cell}>{num(total.hours, 1)}</td>
                <td className={`${cell} font-black text-[var(--text)]`}>{fmtVndShort(total.gmv)}</td>
                <td className={cell}>{total.hours > 0 ? fmtVndShort(total.gmv / total.hours) : "—"}</td>
                <td className={cell}>{num(total.orders)}</td>
                <td className={cell}>{totalTarget != null ? fmtVndShort(totalTarget) : "—"}</td>
                <td className={`${cell} font-bold ${rrTone(totalRunRate)}`}>{pct(totalRunRate, 1)}</td>
                <td className={cell}>{totalProj != null ? fmtVndShort(totalProj) : "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {!allPlanned && shown.length > 0 && (
          <p className="text-xs text-[var(--text-muted)] flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
            Dòng Tổng chưa có target/run-rate vì chưa phải sàn nào cũng có Kế Hoạch Tháng đã chốt — cộng target của một sàn với GMV hai sàn sẽ ra % đạt ảo.
          </p>
        )}
        <p className="text-xs text-[var(--text-faint)]">
          Ca có số, giờ live, GMV, đơn: ca đã diễn ra có số trong tháng (bỏ ca loại khỏi báo cáo). GMV Shopee là doanh số đặt hàng, GMV TikTok trước huỷ/hoàn — hai số cùng nghĩa "đặt", cộng được. GMV/giờ hai sàn khác nhau là bình thường; so sánh nên làm trong từng sàn.
        </p>
      </section>
    </div>
  );
}
