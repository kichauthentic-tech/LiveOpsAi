import React from "react";
import { BrandLogo } from "../ui/BrandLogo";
import { combineCones, landingOfMany } from "../../lib/performance/forecastCone";
import { forecastFlags, coneHalf } from "../../lib/performance/forecastCone";
import { runRateLadder } from "../../lib/performance/runRateLadder";
import { combineOutlooks, inRange, monthEndOf, prevMonthOf, totalsOf, type MonthOutlook } from "../../lib/performance/ceoBrief";
import { addDays } from "../../lib/dateUtils";
import { isCountable } from "../../lib/performance/hostPerformance";
import { sessionDurationHours } from "../../lib/pnl";
import type { Lever } from "../../lib/performance/handlingPlan";
import { PLATFORM_SCOPE_LABEL } from "../../lib/reportPlatform";
import type { DashModel } from "./model";
import { ConeChart, LandingChip, RunRateBar, RunRateLadder } from "./RunRate";
import { BUCKET_LABEL, Card, Delta, SectionTitle, ddmm, hrs, money, num, pct } from "./shared";

// Tab "Overview": sáu câu CEO hỏi — đang ở đâu, cuối tháng về đâu, sắp tới gì, đang làm gì, kết quả ra sao, cần làm gì.

const TONE_DOT = { fix: "bg-rose-400", grow: "bg-sky-400", info: "bg-[var(--text-faint)]" } as const;

export const Cockpit: React.FC<{
  m: DashModel;
  kpi: React.ReactNode;
  issues: React.ReactNode;
  selected: string;
  onSelectBrand: (id: string) => void;
  onNavigate: (tab: string) => void;
  onOpenPlan: () => void;
}> = ({ m, kpi, issues, selected, onSelectBrand, onNavigate, onOpenPlan }) => {
  const scopeBrands = m.brands.filter((b) => m.scopeIds.includes(b.id));
  const outs = scopeBrands.map((b) => ({ b, o: m.outlooks.get(b.id) })).filter((x): x is { b: typeof x.b; o: MonthOutlook } => !!x.o);
  const withForecast = outs.filter((x) => x.o.projectionMethod !== "none" && (x.o.actual > 0 || x.o.pending.length > 0));
  const withTarget = outs.filter((x) => x.o.target);
  const waiting = outs.filter((x) => !x.o.target && (x.o.actual > 0 || x.o.pending.length > 0));

  // Cuối tháng về đâu: cộng dự phóng các kênh, dải theo căn bậc hai tổng bình phương.
  const cone = combineCones(withForecast.map((x) => x.o));
  const landing = withTarget.length ? landingOfMany(withTarget.map((x) => x.o)) : null;
  const prevMonth = prevMonthOf(m.month);
  const prevFull = totalsOf(inRange(m.scopeSessions, `${prevMonth}-01`, monthEndOf(`${prevMonth}-01`))).gmv;

  // Thang run-rate, biểu đồ và đợt camp sắp tới chỉ cộng các brand CÓ target (brand chưa chốt kế hoạch không có mẫu số, cộng vào chỉ thổi phồng %;
  // khoảng ngày camp lấy theo kế hoạch đã chốt — có thể khác lịch cố định).
  const scoped = withTarget.length ? combineOutlooks(m.month, m.today, withTarget.map((x) => x.o)) : m.scopeOutlook;

  // Sắp tới.
  const futurePending = outs.flatMap((x) => x.o.pending.filter((p) => p.date >= m.today));
  const remainingHours = futurePending.reduce((a, p) => a + p.hours, 0);
  const next = scoped.buckets.find((b) => b.bucket !== "daily" && (b.status === "next" || b.status === "live"));
  const nextHours = next ? futurePending.filter((p) => next.days.includes(p.date)).reduce((a, p) => a + p.hours, 0) : 0;

  // Cần làm gì: đòn bẩy nổi nhất của các kênh.
  const levers: (Lever & { channel: string })[] = [];
  for (const { b } of outs) for (const l of m.handling.get(b.id)?.levers ?? []) levers.push({ ...l, channel: b.name });
  const leverOrder = { fix: 0, grow: 1, info: 2 } as const;
  levers.sort((a, z) => leverOrder[a.tone] - leverOrder[z.tone] || (z.gmv ?? 0) - (a.gmv ?? 0));

  const ladder = runRateLadder(scoped, m.today);
  const ladderNote = withTarget.length
    ? `Gồm ${withTarget.map((x) => x.b.name).join(", ")} (đã chốt Kế Hoạch Tháng ${Number(m.month.slice(5))}).${waiting.length ? ` Chưa có run-rate: ${waiting.map((x) => x.b.name).join(", ")} — chờ OP chốt kế hoạch tháng.` : ""} Ca kế hoạch bị huỷ vẫn giữ target; ca ngoài kế hoạch có GMV nhưng target 0.`
    : "";

  const flagsOf = (o: MonthOutlook) => forecastFlags(o, m.today);
  const mainFlags = outs.length === 1 ? flagsOf(outs[0].o) : [];

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Sáu câu hỏi */}
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <Card className="!p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">1 · Đang ở đâu</p>
          <p className="text-2xl font-black text-[var(--text)]">{money(m.cur.gmv)}</p>
          <p className="text-xs text-[var(--text-faint)] flex flex-wrap items-center gap-x-1.5">LIVE GMV kỳ đang xem <Delta cur={m.cur.gmv} prev={m.prev.gmv} /> so kỳ trước</p>
        </Card>
        <Card className="!p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">2 · Cuối tháng về đâu</p>
          {withForecast.length === 0 ? (
            <p className="text-sm text-[var(--text-faint)] pt-1">Chưa có số hay lịch để chiếu.</p>
          ) : (
            <>
              <p className="text-2xl font-black text-[var(--text)]">{money(cone.projected)}</p>
              <p className="text-xs text-[var(--text-faint)] leading-snug">Dải ~80%: {money(cone.lo)} – {money(cone.hi)}{prevFull > 0 ? ` · bằng ${pct(cone.projected / prevFull)} cả tháng ${Number(prevMonth.slice(5))} (${money(prevFull)})` : ""}</p>
              {landing && landing.pHit != null && (
                <p className="text-xs flex flex-wrap items-center gap-1.5 pt-0.5">
                  <LandingChip keyName={landing.key} />
                  <span className="text-[var(--text-muted)]">{withTarget.length > 0 && withTarget.length < outs.length ? `${withTarget.map((x) => x.b.name).join(", ")}: ` : ""}khả năng đạt target ≈ {pct(landing.pHit)}</span>
                </p>
              )}
            </>
          )}
        </Card>
        <Card className="!p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">3 · Sắp tới</p>
          <p className="text-2xl font-black text-[var(--text)]">{hrs(remainingHours)}</p>
          <p className="text-xs text-[var(--text-faint)] leading-snug">còn trong lịch tháng này ({futurePending.length} ca){next ? ` · ${BUCKET_LABEL[next.bucket]} ${ddmm(next.days[0])}–${ddmm(next.days[next.days.length - 1])}: ${hrs(nextHours)} lịch` : ""}</p>
        </Card>
        <Card className="!p-4 space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">4 · Cần làm gì</p>
          {levers.length === 0 ? (
            <p className="text-sm text-[var(--text-faint)]">Chưa có việc nào nổi lên.</p>
          ) : (
            <ul className="space-y-1.5">
              {levers.slice(0, 2).map((l, i) => (
                <li key={i} className="text-xs text-[var(--text-muted)] leading-snug flex gap-2">
                  <i className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[l.tone]}`} />
                  <span><b className="text-[var(--text)]">{outs.length > 1 ? `${l.channel}: ` : ""}{l.title}</b></span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={onOpenPlan} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-xs font-bold text-[var(--accent-text)] hover:underline">Xem Action →</button>
        </Card>
      </section>
      {mainFlags.length > 0 && (
        <ul className="text-[11px] text-[var(--text-faint)] leading-snug space-y-0.5 -mt-3">
          {mainFlags.map((f, i) => <li key={i} className={f.level === "warn" ? "text-amber-300" : ""}>{f.level === "warn" ? "! " : "· "}{f.text}</li>)}
        </ul>
      )}

      {/* Kết quả kỳ + cần chú ý */}
      <section className="space-y-3">
        <SectionTitle title="Kết quả trong kỳ" />
        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_1fr] gap-4 items-start">
          {kpi}
          {issues}
        </div>
      </section>

      {/* Run-rate bốn tầng + biểu đồ lũy kế */}
      <section className="space-y-3">
        <SectionTitle title="Run-rate và dự phóng" note={`Tháng ${Number(m.month.slice(5))} · ${PLATFORM_SCOPE_LABEL[m.platform]}`} />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {ladder.length > 0 ? (
            <RunRateLadder rows={ladder} note={ladderNote} />
          ) : (
            <Card className="space-y-2">
              <h4 className="font-black text-[var(--text)]">Run-rate bốn tầng</h4>
              <p className="text-sm text-[var(--text-muted)] leading-snug">
                Chưa brand nào chốt Kế Hoạch Tháng {Number(m.month.slice(5))} nên chưa có target để tính run-rate (tháng, đợt camp, ngày, ca). Dự phóng cuối tháng bên cạnh vẫn chạy bình thường.
              </p>
              <button onClick={() => onNavigate("month_plan")} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-sm font-bold text-[var(--accent-text)] hover:underline">Chốt Kế Hoạch Tháng →</button>
            </Card>
          )}
          <Card>
            <h4 className="font-black text-[var(--text)] mb-1">GMV cộng dồn, target và dự phóng</h4>
            {outs.length > 0 ? <ConeChart outlook={scoped} month={m.month} scale={coneScale((withTarget.length ? withTarget : withForecast).map((x) => x.o))} /> : <p className="text-sm text-[var(--text-faint)] py-6">Chưa có số.</p>}
          </Card>
        </div>
      </section>

      <AccountsTable m={m} outs={outs} selected={selected} onSelectBrand={onSelectBrand} onNavigate={onNavigate} />
      <Triptych m={m} outs={outs} />
    </div>
  );
};

/** Hệ số co dải khi cộng nhiều kênh (căn bậc hai tổng bình phương ÷ tổng thẳng). */
function coneScale(list: MonthOutlook[]): number {
  const lin = list.reduce((a, o) => a + coneHalf(o.actual, o.projected, o.coneCoef), 0);
  return lin > 0 ? combineCones(list).half / lin : 1;
}

// ---------------------------------------------------------------------------

const AccountsTable: React.FC<{ m: DashModel; outs: { b: DashModel["brands"][number]; o: MonthOutlook }[]; selected: string; onSelectBrand: (id: string) => void; onNavigate: (tab: string) => void }> = ({ m, outs, selected, onSelectBrand, onNavigate }) => {
  const thBase = "px-3 py-2 text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)] whitespace-nowrap";
  const th = `${thBase} text-right`, thL = `${thBase} text-left`;
  const td = "px-3 py-2.5 text-right whitespace-nowrap";
  const rows = outs
    .map(({ b, o }) => {
      const bs = m.platformSessions.filter((s) => s.brandId === b.id);
      const landing = o.target && o.projectionMethod !== "none" ? landingOfMany([o]) : null;
      const half = coneHalf(o.actual, o.projected, o.coneCoef);
      const last = bs.filter((s) => isCountable(s) && s.date <= m.today).map((s) => s.date).sort().pop() ?? null;
      return { b, o, landing, half, last, rr: m.planRR.get(b.id) ?? null };
    })
    .sort((a, z) => z.o.actual - a.o.actual);
  const anyTarget = rows.some((r) => r.o.target);
  return (
    <section className="space-y-3">
      <SectionTitle title="Từng tài khoản" note={`Bấm một dòng để xem riêng brand đó · số của tháng ${Number(m.month.slice(5))}`} />
      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border)]">
            <tr>
              <th className={`${thL}`}>Tài khoản</th>
              <th className={th}>GMV tới nay</th>
              <th className={th}>Dự phóng cuối tháng</th>
              {anyTarget && <th className={th}>Target</th>}
              {anyTarget && <th className={`${thL}`}>Run-rate</th>}
              {anyTarget && <th className={`${thL}`}>Dự phóng ÷ target</th>}
              <th className={`${thL}`}>Khả năng đạt</th>
              <th className={th}>Số đến</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map(({ b, o, landing, half, last }) => (
              <tr key={b.id} onClick={() => onSelectBrand(b.id)} onKeyDown={(e) => e.key === "Enter" && onSelectBrand(b.id)} tabIndex={0}
                className={`cursor-pointer hover:bg-[var(--surface-hover)]/40 ${selected === b.id ? "bg-[var(--accent)]/10" : ""}`}>
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 font-bold text-[var(--text)] whitespace-nowrap"><BrandLogo brand={b} size="xs" /> {b.name}</span>
                </td>
                <td className={`${td} font-bold text-[var(--text)]`}>{o.actual > 0 ? money(o.actual) : "—"}</td>
                <td className={td}>
                  {o.projectionMethod === "none" ? <span className="text-[var(--text-faint)]">—</span> : (
                    <>
                      <b className="text-[var(--text)]">{money(o.projected)}</b>
                      {half > 0 && <span className="block text-[11px] text-[var(--text-faint)]">{money(o.projected - half)} – {money(o.projected + half)}</span>}
                    </>
                  )}
                </td>
                {anyTarget && <td className={`${td} text-[var(--text-muted)]`}>{o.target ? money(o.target.total) : "—"}</td>}
                {anyTarget && (
                  <td className="px-3 py-2.5 min-w-[150px]">
                    {o.runRate != null ? <div className="flex items-center gap-2"><div className="flex-1"><RunRateBar value={o.runRate} /></div><b className="text-xs text-[var(--text)] w-10 text-right">{pct(o.runRate)}</b></div> : <span className="text-xs text-[var(--text-faint)]">chờ chốt kế hoạch</span>}
                  </td>
                )}
                {anyTarget && (
                  <td className="px-3 py-2.5 min-w-[150px]">
                    {landing?.ratio != null ? <div className="flex items-center gap-2"><div className="flex-1"><RunRateBar value={landing.ratio} /></div><b className="text-xs text-[var(--text)] w-10 text-right">{pct(landing.ratio)}</b></div> : <span className="text-xs text-[var(--text-faint)]">—</span>}
                  </td>
                )}
                <td className="px-3 py-2.5">{landing ? <span className="inline-flex items-center gap-1.5"><LandingChip keyName={landing.key} />{landing.pHit != null && <span className="text-xs text-[var(--text-faint)]">{pct(landing.pHit)}</span>}</span> : <LandingChip keyName="no_target" />}</td>
                <td className={`${td} text-[var(--text-faint)] font-mono text-xs`}>{last ? ddmm(last) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {!anyTarget && (
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">
          Cột Target, Run-rate và Dự phóng ÷ target hiện khi OP chốt Kế Hoạch Tháng.{" "}
          <button onClick={() => onNavigate("month_plan")} className="min-h-6 -mx-1 px-1 rounded inline-flex items-center text-[var(--accent-text)] font-bold hover:underline">Chốt Kế Hoạch Tháng →</button>
        </p>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Đang làm · Sắp tới · Kết quả
// ---------------------------------------------------------------------------

const Triptych: React.FC<{ m: DashModel; outs: { b: DashModel["brands"][number]; o: MonthOutlook }[] }> = ({ m, outs }) => {
  const todays = m.scopeSessions.filter((s) => s.date === m.today && s.status !== "Cancelled").sort((a, z) => a.startTime.localeCompare(z.startTime));
  const pctOf = new Map<string, number>();
  for (const rr of m.planRR.values()) for (const sl of rr.slots) if (sl.session && sl.pctTarget != null) pctOf.set(sl.session.id, sl.pctTarget);

  const week = Array.from({ length: 7 }, (_, i) => addDays(m.today, i + 1)).map((d) => {
    let h = 0, g = 0;
    for (const { o } of outs) for (const p of o.pending) if (p.date === d) { h += p.hours; g += p.forecast; }
    const camp = outs[0]?.o.buckets.find((b) => b.bucket !== "daily" && b.days.includes(d))?.bucket;
    return { d, h, g, camp };
  });

  // Kết quả: % Target của ca (chỉ ca thuộc kế hoạch đã chốt). Chưa có kế hoạch nào ⇒ xếp theo GMV/giờ trong cùng sàn.
  const done = m.scopeSessions.filter((s) => isCountable(s) && s.date.startsWith(m.month) && s.date <= m.today);
  const ranked = pctOf.size > 0
    ? done.filter((s) => pctOf.has(s.id)).map((s) => ({ s, v: pctOf.get(s.id)!, label: pct(pctOf.get(s.id)!), good: pctOf.get(s.id)! })).sort((a, z) => z.v - a.v)
    : done.filter((s) => sessionDurationHours(s.startTime, s.endTime) > 0).map((s) => { const v = (s.actualGmv ?? 0) / sessionDurationHours(s.startTime, s.endTime); return { s, v, label: `${money(v)}/giờ`, good: 1 }; }).sort((a, z) => z.v - a.v);
  const best = ranked.slice(0, 3), worst = ranked.length > 6 ? ranked.slice(-3).reverse() : [];
  const chip = (v: number) => (pctOf.size > 0 ? (v >= 0.95 ? "bg-emerald-500/15 text-emerald-400" : v >= 0.85 ? "bg-amber-500/15 text-amber-300" : "bg-rose-500/15 text-rose-400") : "bg-[var(--surface-elevated)] text-[var(--text)]");
  const row = (s: (typeof ranked)[number]) => (
    <tr key={s.s.id}>
      <td className="py-1 text-[var(--text-muted)] whitespace-nowrap">{ddmm(s.s.date)} {s.s.startTime.slice(0, 5)}</td>
      <td className="py-1 px-2 text-[var(--text)] truncate max-w-[110px]">{outs.length > 1 ? s.s.brandName : s.s.hostName || "—"}</td>
      <td className="py-1 text-right"><span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${chip(s.v)}`}>{s.label}</span></td>
    </tr>
  );
  return (
    <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Đang làm · hôm nay {ddmm(m.today)}</p>
        {todays.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Hôm nay không có ca nào.</p> : (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-[var(--border)]">
              {todays.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5 text-[var(--text-muted)] whitespace-nowrap">{s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}</td>
                  <td className="py-1.5 px-2 text-[var(--text)] truncate max-w-[120px]">{outs.length > 1 ? `${s.brandName} · ` : ""}{s.hostName || "chưa có host"}</td>
                  <td className="py-1.5 text-right">
                    {pctOf.has(s.id) ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${chip(pctOf.get(s.id)!)}`}>{pct(pctOf.get(s.id)!)}</span> : isCountable(s) ? <span className="text-[var(--text-muted)]">{money(s.actualGmv)}</span> : <span className="text-[var(--text-faint)]">{s.status === "Live Now" ? "đang live" : "chưa có số"}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">% = % Target của ca (ca thuộc Kế Hoạch Tháng đã chốt).</p>
      </Card>
      <Card className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Sắp tới · 7 ngày</p>
        <table className="w-full text-xs">
          <tbody className="divide-y divide-[var(--border)]">
            {week.map((w) => (
              <tr key={w.d}>
                <td className="py-1.5 text-[var(--text-muted)] whitespace-nowrap">{ddmm(w.d)}{w.camp && <span className="ml-1.5 text-[11px] font-bold px-1.5 rounded bg-amber-500/15 text-amber-300">{BUCKET_LABEL[w.camp]}</span>}</td>
                <td className="py-1.5 text-right text-[var(--text-muted)]">{w.h > 0 ? `${num(w.h)}h` : "—"}</td>
                <td className="py-1.5 text-right font-bold text-[var(--text)]">{w.g > 0 ? money(w.g) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">Giờ trong lịch và GMV dự phóng theo GMV/giờ 28 ngày.</p>
      </Card>
      <Card className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]">Kết quả · ca tốt nhất / kém nhất tháng</p>
        {ranked.length === 0 ? <p className="text-sm text-[var(--text-faint)]">Chưa có ca nào có số trong tháng.</p> : (
          <table className="w-full text-xs">
            <tbody className="divide-y divide-[var(--border)]">
              {best.map(row)}
              {worst.length > 0 && <tr><td colSpan={3} className="py-1 text-[11px] text-[var(--text-faint)]">kém nhất</td></tr>}
              {worst.map(row)}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-[var(--text-faint)] leading-snug">{pctOf.size > 0 ? "Xếp theo % Target của ca." : "Chưa có kế hoạch chốt nên xếp theo GMV/giờ của ca; có kế hoạch thì chuyển sang % Target."}</p>
      </Card>
    </section>
  );
};
