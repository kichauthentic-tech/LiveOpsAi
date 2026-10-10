import React, { useState } from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { runRateTone } from "../../lib/performance/channelHealth";
import { isCountable } from "../../lib/performance/hostPerformance";
import { sessionDurationHours } from "../../lib/pnl";
import type { BucketOutlook } from "../../lib/performance/ceoBrief";
import type { PlanRunRate } from "../../lib/performance/planRunRate";
import type { LiveSession } from "../../types";
import type { DashModel } from "./model";
import { RunRateBar } from "./RunRate";
import { BUCKET_COLOR, BUCKET_LABEL, Card, SectionTitle, WEEKDAY, ddmm, hrs, money, pct, weekdayIdx } from "./shared";

// Tab "Deepdive": một kênh → các đợt camp → từng ngày → từng ca. Bấm một ngày trên lịch để xem các ca của ngày đó.

const TONE_CHIP = { good: "bg-emerald-500/15 text-emerald-400", warn: "bg-amber-500/15 text-amber-300", bad: "bg-rose-500/15 text-rose-400", none: "bg-[var(--surface-elevated)] text-[var(--text-faint)]" } as const;
const TONE_BG = { good: "rgba(16,185,129,0.28)", warn: "rgba(245,158,11,0.30)", bad: "rgba(239,68,68,0.30)", none: "" } as const;

const WaveCard: React.FC<{ b: BucketOutlook; rr: PlanRunRate | null }> = ({ b, rr }) => {
  const line = rr?.buckets.find((x) => x.bucket === b.bucket);
  const runRate = line ? line.runRate : b.targetToDate && b.targetToDate > 0 ? b.actual.gmv / b.targetToDate : null;
  const target = line ? line.target : b.target;
  const to = line ? line.targetToDate : b.targetToDate;
  const next = b.status === "next";
  const range = b.bucket === "daily" ? `${b.days.length} ngày` : b.days.length ? `${ddmm(b.days[0])}–${ddmm(b.days[b.days.length - 1])}` : "";
  const status = { done: "Đã qua", live: "Đang chạy", next: "Sắp tới", none: "—" }[b.status];
  return (
    <Card className="!p-4 space-y-1.5 border-t-4" style={{ borderTopColor: BUCKET_COLOR[b.bucket] }}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-black text-[var(--text)]">{BUCKET_LABEL[b.bucket]}</h4>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-elevated)] text-[var(--text-faint)]">{status}</span>
      </div>
      <p className="text-xs text-[var(--text-faint)]">{range}</p>
      <p className="text-xl font-black text-[var(--text)]">{next ? (b.pendingCount ? `~${money(b.forecast)}` : "Chưa có ca") : b.actual.sessions ? money(b.actual.gmv) : "Chưa có số"}</p>
      <p className="text-[11px] text-[var(--text-faint)]">{next ? (b.pendingCount ? `dự phóng từ ${b.pendingCount} ca trong lịch` : "chưa có ca nào trong lịch") : `${b.actual.sessions} ca · ${b.daysWithData}/${b.days.length} ngày có số`}</p>
      {!next && target != null && target > 0 && (
        <div className="space-y-1">
          <RunRateBar value={runRate} />
          <p className="text-[11px] text-[var(--text-muted)]"><b className="text-[var(--text)]">{pct(runRate)}</b> run-rate · {money(b.actual.gmv)} / {money(to ?? 0)} target tới nay</p>
        </div>
      )}
      {next && target != null && target > 0 && <p className="text-[11px] text-[var(--text-muted)]">Target đợt {money(target)}{b.pendingCount ? ` · lịch hiện chiếu ${pct(b.forecast / target)}` : ""}</p>}
      {!target && <p className="text-[11px] text-[var(--text-faint)]">Chưa có target — chờ chốt Kế Hoạch Tháng.</p>}
      <p className="text-[11px] text-[var(--text-faint)]">GMV/giờ {money(b.actual.gmvPerHour)}{b.perDay != null ? ` · ${money(b.perDay)}/ngày` : ""}</p>
    </Card>
  );
};

const ShiftTable: React.FC<{ date: string; today: string; rr: PlanRunRate | null; sessions: LiveSession[] }> = ({ date, today, rr, sessions }) => {
  const inPlan = rr?.slots.filter((s) => s.planSlot.date === date).sort((a, z) => a.planSlot.startTime.localeCompare(z.planSlot.startTime)) ?? [];
  const offPlan = rr?.offPlan.filter((x) => x.session.date === date) ?? [];
  const plain = rr ? [] : sessions.filter((s) => s.date === date && s.status !== "Cancelled").sort((a, z) => a.startTime.localeCompare(z.startTime));
  const state = { done: "có số", no_data: "chờ số", pending: "chưa diễn ra", cancelled: "đã huỷ" } as const;
  const thBase = "px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap";
  const th = `${thBase} text-right`, thL = `${thBase} text-left`;
  if (inPlan.length === 0 && offPlan.length === 0 && plain.length === 0) return <p className="text-sm text-[var(--text-faint)]">Ngày này không có ca nào.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)]">
          <tr><th className={`${thL}`}>Ca</th><th className={`${thL}`}>Host</th><th className={th}>Target</th><th className={th}>GMV</th><th className={th}>% Target</th><th className={`${thL}`}>Trạng thái</th></tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {inPlan.map((t) => {
            const tone = runRateTone(t.pctTarget);
            return (
              <tr key={t.planSlot.id}>
                <td className="px-3 py-2 whitespace-nowrap text-[var(--text)]">{t.planSlot.startTime.slice(0, 5)}–{t.planSlot.endTime.slice(0, 5)}</td>
                <td className="px-3 py-2 text-[var(--text-muted)]">{t.session?.hostName || "—"}</td>
                <td className="px-3 py-2 text-right text-[var(--text-muted)] whitespace-nowrap">{t.target > 0 ? money(t.target) : "—"}</td>
                <td className="px-3 py-2 text-right font-bold text-[var(--text)] whitespace-nowrap">{t.state === "done" ? money(t.actual) : "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{t.pctTarget != null ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${TONE_CHIP[tone]}`}>{pct(t.pctTarget)}</span> : "—"}</td>
                <td className="px-3 py-2 text-[var(--text-faint)] text-xs">{state[t.state]}</td>
              </tr>
            );
          })}
          {offPlan.map(({ session: s }) => (
            <tr key={s.id}>
              <td className="px-3 py-2 whitespace-nowrap text-[var(--text)]">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{s.hostName || "—"}</td>
              <td className="px-3 py-2 text-right text-[var(--text-faint)]">0</td>
              <td className="px-3 py-2 text-right font-bold text-[var(--text)] whitespace-nowrap">{money(s.actualGmv)}</td>
              <td className="px-3 py-2 text-right text-[var(--text-faint)]">—</td>
              <td className="px-3 py-2 text-[var(--text-faint)] text-xs">ngoài kế hoạch</td>
            </tr>
          ))}
          {plain.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 whitespace-nowrap text-[var(--text)]">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}</td>
              <td className="px-3 py-2 text-[var(--text-muted)]">{s.hostName || "—"}</td>
              <td className="px-3 py-2 text-right text-[var(--text-faint)]">—</td>
              <td className="px-3 py-2 text-right font-bold text-[var(--text)] whitespace-nowrap">{isCountable(s) ? money(s.actualGmv) : "—"}</td>
              <td className="px-3 py-2 text-right text-[var(--text-faint)] text-xs whitespace-nowrap">{isCountable(s) && sessionDurationHours(s.startTime, s.endTime) > 0 ? `${money((s.actualGmv ?? 0) / sessionDurationHours(s.startTime, s.endTime))}/giờ` : "—"}</td>
              <td className="px-3 py-2 text-[var(--text-faint)] text-xs">{isCountable(s) ? "có số" : s.date < today ? "chờ số" : "chưa diễn ra"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// `channelId` (10/10): nằm trong phần chi tiết của MỘT kênh ở "Tháng này" — kênh do bảng kết luận chọn, không hiện bộ chọn kênh riêng.
export const DrillDown: React.FC<{ m: DashModel; onNavigate: (tab: string) => void; channelId?: string }> = ({ m, onNavigate, channelId }) => {
  const choices = m.brands.filter((b) => m.scopeIds.includes(b.id) && m.outlooks.get(b.id));
  const [picked, setBrandId] = useState("");
  const pickedBrand = channelId ?? picked;
  // Kênh đang chọn bị loại khỏi phạm vi (đổi bộ lọc brand) thì rơi về kênh đầu — suy ra lúc vẽ, không đồng bộ bằng effect.
  // Mặc định: kênh đã chốt kế hoạch (có run-rate tới ca), không thì kênh nhiều GMV nhất.
  const fallback = choices.find((c) => m.planRR.has(c.id)) ?? [...choices].sort((a, z) => (m.outlooks.get(z.id)?.actual ?? 0) - (m.outlooks.get(a.id)?.actual ?? 0))[0];
  const brandId = choices.some((c) => c.id === pickedBrand) ? pickedBrand : fallback?.id ?? "";
  const [pickedDay, setPickedDay] = useState<{ key: string; day: string } | null>(null);
  const dayKey = `${brandId}|${m.month}`;
  const day = pickedDay?.key === dayKey ? pickedDay.day : null;
  const setDay = (d: string) => setPickedDay({ key: dayKey, day: d });
  const b = choices.find((x) => x.id === brandId);
  const o = b ? m.outlooks.get(b.id) : undefined;
  const rr = b ? m.planRR.get(b.id) ?? null : null;
  const sessions = m.platformSessions.filter((s) => s.brandId === brandId);
  if (!b || !o) return <Card><p className="text-sm text-[var(--text-faint)]">Chưa có kênh nào có số trong phạm vi đang xem.</p></Card>;

  const campOf = (d: string) => o.buckets.find((x) => x.bucket !== "daily" && x.days.includes(d))?.bucket;
  const gmvMax = Math.max(1, ...o.days.map((d) => o.actualByDate.get(d) ?? 0));
  const shade = [0.18, 0.32, 0.46, 0.6, 0.76, 0.92].map((a) => `rgba(59, 130, 246, ${a})`);
  const m0 = `${m.month}-01`;
  const selected = day ?? (m.today.startsWith(m.month) ? m.today : o.days[0]);
  const hasPlan = !!rr && (rr.total.target > 0);
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {!channelId && <div className="inline-flex flex-wrap bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Chọn kênh">
          {choices.map((c) => (
            <button key={c.id} onClick={() => setBrandId(c.id)} aria-pressed={brandId === c.id} className={`px-3 py-1.5 rounded-lg text-sm font-bold inline-flex items-center gap-2 transition-colors ${brandId === c.id ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
              <BrandLogo brand={c} size="xs" /> {m.channelName(c)}
            </button>
          ))}
        </div>}
        {!hasPlan && (
          <button onClick={() => onNavigate("month_plan")} className="min-h-6 px-1 rounded inline-flex items-center text-xs font-bold text-[var(--accent-text)] hover:underline">Chưa chốt Kế Hoạch Tháng nên chưa có run-rate theo đợt, ngày, ca — chốt kế hoạch →</button>
        )}
      </div>

      <section className="space-y-3">
        <SectionTitle title="Từng đợt campaign" note="Run-rate đợt = GMV ÷ target các ca kế hoạch của đợt có ngày ≤ ngày cuối có số" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">{o.buckets.filter((x) => x.status !== "none").map((x) => <WaveCard key={x.bucket} b={x} rr={rr} />)}</div>
      </section>

      <section className="space-y-3">
        <SectionTitle title={`Từng ngày · tháng ${Number(m.month.slice(5))}`} note={hasPlan ? "Màu = run-rate của ngày (đỏ < 85%, vàng 85–95%, xanh ≥ 95%) · sọc = còn trong lịch" : "Màu = GMV của ngày (đậm = nhiều) · sọc = còn trong lịch"} />
        <Card>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY.map((w) => <div key={w} className="text-[11px] text-center text-[var(--text-faint)] font-bold">{w}</div>)}
            {Array.from({ length: weekdayIdx(m0) }).map((_, i) => <div key={`e${i}`} />)}
            {o.days.map((d) => {
              const g = o.actualByDate.get(d) ?? 0, f = o.forecastByDate.get(d) ?? 0, t = o.target?.byDate.get(d) ?? 0;
              const camp = campOf(d);
              const pendingDay = o.pending.some((p) => p.date === d);
              const rrDay = t > 0 && g > 0 && !pendingDay ? g / t : null;
              const k = g > 0 ? Math.min(5, Math.floor((g / gmvMax) * 6)) : -1;
              let style: React.CSSProperties = {};
              if (rrDay != null && hasPlan) style = { background: TONE_BG[runRateTone(rrDay)] };
              else if (k >= 0) style = { background: shade[k], color: k >= 3 ? "#ffffff" : "var(--text)" };
              else if (f > 0) style = { background: "repeating-linear-gradient(135deg, var(--surface-base) 0 5px, var(--surface-elevated) 5px 7px)" };
              const sel = d === selected;
              return (
                <button
                  key={d}
                  onClick={() => setDay(d)}
                  aria-pressed={sel}
                  className={`rounded-lg p-1.5 min-h-[56px] flex flex-col justify-between text-left text-[11px] ${k < 0 && !f ? "bg-[var(--surface-base)] text-[var(--text-faint)]" : ""} ${camp ? "ring-1 ring-inset ring-[var(--text-muted)]" : ""} ${sel ? "outline outline-2 outline-[var(--accent)]" : ""}`}
                  style={style}
                  data-tip={`${ddmm(d)} (${WEEKDAY[weekdayIdx(d)]})${camp ? ` · ${BUCKET_LABEL[camp]}` : ""}\n${g ? `GMV ${money(g)}` : f ? `Dự phóng ${money(f)}` : "Không có ca"}${t > 0 ? `\nTarget ${money(t)}${rrDay != null ? ` · ${pct(rrDay)}` : ""}` : ""}`}
                >
                  <span className="font-bold">{Number(d.slice(8))}{camp ? " ◆" : ""}</span>
                  <span className="font-bold truncate hidden sm:block">{rrDay != null && hasPlan ? pct(rrDay) : g ? money(g) : f ? `~${money(f)}` : ""}</span>
                </button>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="space-y-3">
        <SectionTitle title={`Các ca ngày ${ddmm(selected)}`} note={hasPlan ? "% Target của ca = GMV ÷ target ca trong Kế Hoạch Tháng" : "Chưa có kế hoạch chốt nên chưa có target theo ca"} />
        <Card className="!p-0"><ShiftTable date={selected} today={m.today} rr={rr} sessions={sessions} /></Card>
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">Ngày {ddmm(selected)}: {hrs(o.pending.filter((p) => p.date === selected).reduce((a, p) => a + p.hours, 0))} còn trong lịch chưa có số.</p>
      </section>
    </div>
  );
};
