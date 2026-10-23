import React, { useMemo, useState } from "react";
import type { Brand, LiveSession } from "../../../types";
import { agencyTodos, monthlyTrend, type AgencyTodo, type ChannelCard } from "../../../lib/performance/channelCard";
import { aggregate, isWeak, ranIn, type ResolvedPeriod } from "../../../lib/performance/periodCompare";
import { isCountable, sessionHours } from "../../../lib/performance/hostPerformance";
import { resolveCampBucketType, type CampDayBucket } from "../../../lib/campaignDays";
import { WAVE_NAME } from "../../../lib/performance/channelHealth";
import { addDays, eachDay } from "../../../lib/dateUtils";
import { monthEndOf, prevMonthOf } from "../../../lib/performance/ceoBrief";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { profileOf } from "../../../lib/platforms/profiles";
import { fmtMonth } from "../../../lib/format";
import { StatTile } from "../../common/StatTile";
import { BrandLogo } from "../../ui/BrandLogo";
import { AccountCard } from "../../runrate/AccountCard";
import type { AccountVM } from "../../runrate/types";
import { Card, chartColor, ddmm, money, niceMax, pct } from "../shared";
import { HeatCard, HostTable, LateCard, PairTable, ProfitCard, ShiftLenCard, type Scope } from "./opsBlocks";
import type { PnlFn } from "../../../lib/performance/ceoBrief";
import { BlockHead, Chg, Sect, TD, Table, rangeLabel } from "./ui";

// Tab "Toàn sàn" của Dashboard (demo duyệt 22/10/2026): MỘT sàn, kỳ chọn ở thanh trên, mọi số so kỳ so sánh. Tháng đang chạy thì
// có thẻ run-rate từng brand (thẻ kênh — một lần tính ở useChannelCards) + dự kiến cuối tháng; kỳ khác thì thẻ so cùng kỳ.
// Không cộng gì giữa TikTok và Shopee (kể cả giờ, người).

export interface PlatformTabProps {
  platform: ReportPlatform;
  period: ResolvedPeriod;
  brands: Brand[];
  /** Ca của sàn này (mọi brand chạy sàn). */
  sessions: LiveSession[];
  cards: ChannelCard[];
  vms: AccountVM[];
  cardsLoading: boolean;
  today: string;
  onOpenBrand: (brandId: string) => void;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
  onNavigate: (tab: string) => void;
  /** Chỉ CEO/admin: tính tiền từng ca (null = không thấy tiền). */
  pnl: PnlFn | null;
}

export const PlatformTab: React.FC<PlatformTabProps> = (p) => {
  const { platform, period: P, brands, sessions, cards, vms, cardsLoading, today, onOpenBrand, onOpenMonthPlan, onNavigate } = p;
  const label = rangeLabel(P.start, P.end), prevLabel = P.noBase ? "—" : rangeLabel(P.prevStart, P.prevEnd);
  const cur = useMemo(() => ranIn(sessions, P.start, P.end), [sessions, P.start, P.end]);
  const prev = useMemo(() => (P.noBase ? null : ranIn(sessions, P.prevStart, P.prevEnd)), [sessions, P.noBase, P.prevStart, P.prevEnd]);
  const scope: Scope = { cur, prev, label, prevLabel };
  const c = aggregate(cur), b = prev ? aggregate(prev) : null, weak = isWeak(c, b);
  const live = cards.filter((x) => x.state !== "off");
  const todos = useMemo(() => agencyTodos(cards), [cards]);

  // Run-rate theo kế hoạch của cả sàn = Σ đã đạt ÷ Σ kế hoạch tới nay của các thẻ (mỗi thẻ tới ca mới nhất có số của nó).
  const rrAct = live.reduce((a, x) => a + (x.pace?.actual ?? 0), 0), rrExp = live.reduce((a, x) => a + (x.pace?.targetToDate ?? 0), 0);
  const tgt = live.reduce((a, x) => a + (x.target ?? 0), 0);
  const withFc = live.filter((x) => x.target);
  const fc = withFc.reduce((a, x) => a + (x.forecast?.p50 ?? x.pace?.actual ?? x.monthActual), 0);
  const scheduledLeft = useMemo(() => {
    if (!P.isCurrentMonth) return null;
    const from = addDays(today, 0), to = monthEndOf(`${today.slice(0, 7)}-01`);
    return sessions.filter((s) => s.status !== "Cancelled" && s.status !== "Completed" && s.date >= from && s.date <= to).reduce((a, s) => a + sessionHours(s), 0);
  }, [P.isCurrentMonth, sessions, today]);

  // Hai hàng KPI cùng một khung cột (6 khi tháng này, 4 khi kỳ khác) để ô thẳng hàng; ô cao bằng nhau (h-full).
  const kpiGrid = `grid grid-cols-2 gap-2.5 ${P.isCurrentMonth ? "md:grid-cols-3 xl:grid-cols-6" : "xl:grid-cols-4"}`;
  const tile = (labelText: string, value: string, hint: React.ReactNode) => <StatTile frame="card" size="lg" label={labelText} value={value} hint={hint} className="h-full" />;
  const vs = (x: number | null | undefined, f: (v: number) => string) => (x == null ? null : <span className="text-[var(--text-faint)]"> vs {f(x)}</span>);
  const nf = (v: number, d = 0) => v.toLocaleString("vi-VN", { maximumFractionDigits: d });

  return (
    <div className="space-y-5">
      {/* Vận hành trước (giờ, ca, người) — số hiệu suất sau. */}
      <div className={kpiGrid}>
        {tile(`Giờ live · ${profileOf(platform).label}`, `${nf(c.hours)} giờ`, <><Chg cur={c.hours} prev={b?.hours} weak />{vs(b?.hours, (v) => `${nf(v)} giờ`)}</>)}
        {tile("Sessions", nf(c.n), <><Chg cur={c.n} prev={b?.n} weak />{vs(b?.n, (v) => nf(v))}</>)}
        {tile("Người có ca (host + trợ)", nf(c.people), <><Chg cur={c.people} prev={b?.people} weak />{vs(b?.people, (v) => nf(v))}</>)}
        {tile("Giờ live/ca", c.hoursPerShift == null ? "—" : `${nf(c.hoursPerShift, 1)} giờ`, <><Chg cur={c.hoursPerShift} prev={b?.hoursPerShift} weak />{vs(b?.hoursPerShift, (v) => `${nf(v, 1)} giờ`)}</>)}
        {P.isCurrentMonth && tile(`Giờ đã xếp ${rangeLabel(today, monthEndOf(`${today.slice(0, 7)}-01`))}`, `${nf(scheduledLeft ?? 0)} giờ`, `${live.length}/${cards.length} kênh đang chạy`)}
        {P.isCurrentMonth && tile("Ca chưa có số", nf(c.noData), c.noData > 0 ? <button type="button" onClick={() => onNavigate("sessions")} className="font-bold text-amber-300 hover:underline min-h-[24px]">Mở Sổ Ca →</button> : "đủ số")}
      </div>
      <div className={kpiGrid}>
        {tile(`GMV ${label}`, money(c.gmv), <><Chg cur={c.gmv} prev={b?.gmv} weak={weak} />{vs(b?.gmv, money)}</>)}
        {P.isCurrentMonth && tile(`Run-rate theo kế hoạch · ${profileOf(platform).label}`, rrExp > 0 ? pct(rrAct / rrExp) : "—", rrExp > 0 ? `${money(rrAct)} / ${money(rrExp)} kế hoạch tới nay${tgt ? ` · đã đạt ${pct(rrAct / tgt)} target tháng` : ""}` : "chưa có kế hoạch chốt")}
        {P.isCurrentMonth && tile("Dự kiến cuối tháng", tgt ? `~${money(fc)}` : "—", tgt ? `${pct(fc / tgt)} của target ${money(tgt)}` : "chưa có target")}
        {tile("GMV/giờ", money(c.gph), <><Chg cur={c.gph} prev={b?.gph} weak={weak} />{vs(b?.gph, money)}</>)}
        {tile("Orders · CVR", nf(c.orders), <><Chg cur={c.orders} prev={b?.orders} weak={weak} /> · CVR <b className="text-[var(--text-muted)]">{c.cvr == null ? "—" : `${nf(c.cvr * 100, 2)}%`}</b> <Chg cur={c.cvr} prev={b?.cvr} points digits={2} weak={weak} /></>)}
        {tile("AOV", money(c.aov), <><Chg cur={c.aov} prev={b?.aov} weak={weak} />{vs(b?.aov, money)}</>)}
      </div>

      {P.isCurrentMonth ? (
        <section className="space-y-2.5" aria-label="Run-rate từng brand">
          <Sect title="Run-rate từng brand" sub={`${live.length} brand trên ${profileOf(platform).label} · run-rate theo kế hoạch = đã đạt ÷ target của các ca đã chạy (tới ca mới nhất có số), khác với % target tháng · dòng cuối mỗi thẻ: so cùng kỳ · bấm thẻ để mở brand`} />
          <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-3 px-3 sm:mx-0 sm:px-0 sm:pb-0 sm:overflow-visible sm:grid sm:grid-cols-2 xl:grid-cols-4">
            {vms.map((vm) => (
              <div key={vm.key} className="snap-start shrink-0 w-[82%] sm:w-auto min-w-0 flex flex-col [&>*]:flex-1">
                <AccountCard vm={vm} selected={false} onSelect={() => onOpenBrand(vm.brand.id)} onOpenMonthPlan={onOpenMonthPlan} compare={cardsLoading ? null : <CmpLine sessions={sessions.filter((s) => s.brandId === vm.brand.id)} P={P} />} />
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="space-y-2.5" aria-label="Từng brand so cùng kỳ">
          <Sect title="Từng brand" sub={`${label} so với ${prevLabel} · bấm thẻ để mở brand`} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {brands.map((br) => <PeriodCard key={br.id} brand={br} sessions={sessions.filter((s) => s.brandId === br.id)} P={P} onOpen={() => onOpenBrand(br.id)} />)}
          </div>
        </section>
      )}

      <CumChart sessions={sessions} P={P} cards={P.isCurrentMonth ? live : []} title={`GMV luỹ kế · các brand ${profileOf(platform).label}`} />

      {P.isCurrentMonth && <Todos todos={todos} onNavigate={onNavigate} />}

      <CampTable sessions={sessions} P={P} />

      <Sect title="Vận hành" sub="con người, giờ giấc, cách xếp ca" />
      <div className="grid gap-4 xl:grid-cols-2 items-start">
        <LateCard s={scope} />
        <ShiftLenCard s={scope} />
      </div>
      {p.pnl && <ProfitCard s={scope} pnl={p.pnl} />}
      <HeatCard s={scope} />
      <HostTable s={scope} brands={brands} showBrand title="Host" />
      <PairTable s={scope} brands={brands} />

      <MonthlyTables brands={brands} sessions={sessions} through={P.isCurrentMonth ? P.end : P.end} />
    </div>
  );
};

// ---------------------------------------------------------------------------

/** Dòng so cùng kỳ ở chân thẻ run-rate. */
const CmpLine: React.FC<{ sessions: LiveSession[]; P: ResolvedPeriod }> = ({ sessions, P }) => {
  const label = rangeLabel(P.start, P.end), prevLabel = rangeLabel(P.prevStart, P.prevEnd);
  const c = aggregate(ranIn(sessions, P.start, P.end)), b = P.noBase ? null : aggregate(ranIn(sessions, P.prevStart, P.prevEnd));
  if (!b || !b.n) return <>{label} so với {prevLabel}: kỳ trước kênh chưa chạy</>;
  if (!c.n) return <>{label}: không có ca · kỳ so sánh {prevLabel} có {b.n} ca, {money(b.gmv)}</>;
  const w = isWeak(c, b);
  return <>{label} so với {prevLabel}: GMV <Chg cur={c.gmv} prev={b.gmv} weak={w} /> · GMV/giờ <Chg cur={c.gph} prev={b.gph} weak={w} /> · giờ <Chg cur={c.hours} prev={b.hours} weak /></>;
};

const PeriodCard: React.FC<{ brand: Brand; sessions: LiveSession[]; P: ResolvedPeriod; onOpen: () => void }> = ({ brand, sessions, P, onOpen }) => {
  const c = aggregate(ranIn(sessions, P.start, P.end)), b = P.noBase ? null : aggregate(ranIn(sessions, P.prevStart, P.prevEnd));
  const w = isWeak(c, b);
  return (
    <button type="button" onClick={onOpen} className="relative text-left rounded-2xl border border-[var(--border)] hover:border-[var(--text-faint)] bg-[var(--surface)] p-4 flex flex-col gap-3 min-w-0 overflow-hidden">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: chartColor(brand.name) }} />
      <div className="flex items-center gap-2.5"><BrandLogo brand={brand} size="md" /><b className="text-sm text-[var(--text)] truncate">{brand.name}</b></div>
      {c.n === 0 ? (
        <p className="text-xs text-[var(--text-faint)]">Không có ca trong kỳ{b?.n ? ` · kỳ so sánh có ${b.n} ca, ${money(b.gmv)}` : ""}.</p>
      ) : (
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div><dt className="text-[var(--text-faint)]">GMV</dt><dd className="font-black text-base text-[var(--text)] tabular-nums">{money(c.gmv)}</dd><dd><Chg cur={c.gmv} prev={b?.gmv} weak={w} /></dd></div>
          <div><dt className="text-[var(--text-faint)]">GMV/giờ</dt><dd className="font-black text-base text-[var(--text)] tabular-nums">{money(c.gph)}</dd><dd><Chg cur={c.gph} prev={b?.gph} weak={w} /></dd></div>
          <div><dt className="text-[var(--text-faint)]">Giờ live</dt><dd className="font-black text-base text-[var(--text)] tabular-nums">{Math.round(c.hours)}</dd><dd><Chg cur={c.hours} prev={b?.hours} weak /></dd></div>
        </dl>
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// GMV luỹ kế cả sàn: kỳ này (nét liền) so kỳ so sánh (nét đứt, cùng thứ tự ngày); tháng đang chạy thêm target cộng dồn + dự kiến.
// ---------------------------------------------------------------------------

export const CumChart: React.FC<{ sessions: LiveSession[]; P: ResolvedPeriod; cards: ChannelCard[]; title: string; height?: number }> = ({ sessions, P, cards, title, height = 240 }) => {
  const [mode, setMode] = useState<"cum" | "day">("cum");
  const curDays = eachDay(P.start, P.end);
  const xEnd = P.isCurrentMonth ? monthEndOf(P.start) : P.end;
  const axis = eachDay(P.start, xEnd);
  const prevDays = P.noBase ? [] : P.isCurrentMonth ? eachDay(P.prevStart, monthEndOf(P.prevStart)) : eachDay(P.prevStart, P.prevEnd);
  const byDay = (days: string[]) => {
    const m = new Map<string, number>();
    for (const s of sessions) if (isCountable(s)) m.set(s.date, (m.get(s.date) ?? 0) + (s.actualGmv || 0));
    return days.map((d) => m.get(d) ?? 0);
  };
  const cd = byDay(curDays), pd = byDay(prevDays);
  const cum = (xs: number[]) => xs.reduce<number[]>((acc, v, i) => (acc.push((acc[i - 1] ?? 0) + v), acc), []);
  const ca = mode === "cum" ? cum(cd) : cd, pa = mode === "cum" ? cum(pd) : pd;
  // Target cộng dồn theo ca đã xếp (Σ các thẻ) + dự kiến cuối tháng (Σ dự báo thẻ kênh).
  const tgtDaily = axis.map((d) => cards.reduce((a, c) => a + (c.report?.days.find((x) => x.date === d)?.target ?? 0), 0));
  const tgtCum = cum(tgtDaily);
  const tgtTotal = cards.reduce((a, c) => a + (c.target ?? 0), 0);
  const fcTotal = cards.filter((c) => c.target).reduce((a, c) => a + (c.forecast?.p50 ?? c.pace?.actual ?? c.monthActual), 0);
  const showTgt = mode === "cum" && P.isCurrentMonth && tgtTotal > 0;
  const W = 760, H = height, L = 52, R = showTgt ? 120 : 16, T = 18, B = 24, iw = W - L - R, ih = H - T - B;
  const n = Math.max(axis.length, pa.length, 1);
  const X = (i: number) => L + (iw * (i + 0.5)) / n;
  const top = Math.max(...ca, ...pa, showTgt ? Math.max(tgtTotal, fcTotal, tgtCum[tgtCum.length - 1] ?? 0) : 0, 1);
  const ymax = niceMax(top * 1.04), Y = (v: number) => T + ih - (ih * v) / ymax;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const path = (xs: number[]) => xs.map((v, i) => `${i ? "L" : "M"}${r1(X(i))} ${r1(Y(v))}`).join("");
  const last = ca.length - 1;
  return (
    <Card>
      <BlockHead
        title={title}
        sub={`${rangeLabel(P.start, P.end)} (nét liền) so với ${P.noBase ? "—" : rangeLabel(P.prevStart, P.prevEnd)} (nét đứt)${P.isCurrentMonth ? " · nét đứt chạy hết tháng trước để thấy tháng trước kết thúc ở đâu" : ""}`}
        right={
          <div className="inline-flex p-0.5 rounded-lg border border-[var(--border)]" role="group" aria-label="Kiểu biểu đồ">
            {(["cum", "day"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} className={`px-2.5 py-1 rounded-md text-xs font-bold min-h-[28px] ${mode === m ? "seg-on" : "text-[var(--text-muted)]"}`}>{m === "cum" ? "Luỹ kế" : "Theo ngày"}</button>)}
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
        {[0, 1, 2, 3, 4].map((j) => { const v = (ymax * j) / 4; return <g key={j}><line x1={L} x2={L + iw} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray={j ? "2 4" : undefined} /><text x={L - 6} y={Y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-faint)">{money(v)}</text></g>; })}
        {axis.map((d, i) => (i % Math.ceil(n / 7) === 0 ? <text key={d} x={X(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-faint)">{ddmm(d)}</text> : null))}
        {mode === "day" ? (
          <>
            {pa.map((v, i) => <rect key={`p${i}`} x={X(i) - iw / n / 2 + 1} y={Y(v)} width={Math.max(1, iw / n / 2 - 1)} height={Y(0) - Y(v)} fill="var(--text-faint)" opacity=".45" />)}
            {ca.map((v, i) => <rect key={`c${i}`} x={X(i)} y={Y(v)} width={Math.max(1, iw / n / 2 - 1)} height={Y(0) - Y(v)} fill="var(--accent)" opacity=".85" />)}
          </>
        ) : (
          <>
            {pa.length > 0 && <path d={path(pa)} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeDasharray="5 4" />}
            {showTgt && <path d={path(tgtCum)} fill="none" stroke="var(--warning)" strokeWidth="1.3" strokeDasharray="5 4" opacity=".7" />}
            {ca.length > 0 && <path d={`${path(ca)}L${X(last)} ${Y(0)}L${X(0)} ${Y(0)}Z`} fill="var(--accent)" opacity=".12" />}
            {ca.length > 0 && <path d={path(ca)} fill="none" stroke="var(--accent)" strokeWidth="2.2" />}
            {ca.length > 0 && <circle cx={X(last)} cy={Y(ca[last])} r="4" fill="var(--accent)" />}
            {ca.length > 0 && <text x={X(last) - 6} y={Y(ca[last]) - 9} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text)">{money(ca[last])}</text>}
            {showTgt && <path d={`M${X(last)} ${Y(ca[last] ?? 0)}L${X(axis.length - 1)} ${Y(fcTotal)}`} fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeDasharray="2 3" />}
            {showTgt && <text x={L + iw + 6} y={Y(tgtTotal) + 3.5} fontSize="10.5" fontWeight="600" fill="var(--warning)">Target {money(tgtTotal)}</text>}
            {showTgt && <text x={L + iw + 6} y={Y(fcTotal) + (Math.abs(Y(fcTotal) - Y(tgtTotal)) < 14 ? 17 : 3.5)} fontSize="10.5" fontWeight="600" fill="var(--text-muted)">~{money(fcTotal)} dự kiến</text>}
          </>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-[var(--text-faint)]">
        <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-[var(--accent)]" />{rangeLabel(P.start, P.end)}</span>
        {!P.noBase && <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-[var(--text-faint)]" />{P.isCurrentMonth ? fmtMonth(P.prevStart.slice(0, 7)) : rangeLabel(P.prevStart, P.prevEnd)}</span>}
        {showTgt && <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dashed border-[var(--warning)]" />Target cộng dồn</span>}
        {showTgt && <span className="inline-flex items-center gap-1.5"><i className="w-4 border-t-2 border-dotted border-[var(--text-muted)]" />Tới dự kiến cuối tháng (thẻ kênh)</span>}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------

// 23/10: chỉ việc từ dự báo; việc vận hành (up số, chốt kế hoạch tháng sau, giờ cam kết) có một chỗ là Bảng Vận Hành — ở đây chỉ dẫn sang.
const Todos: React.FC<{ todos: AgencyTodo[]; onNavigate: (tab: string) => void }> = ({ todos, onNavigate }) => (
  <Card>
    <BlockHead title="Việc cần làm" />
    <ul className="space-y-2">
      {todos.map((t, i) => (
        <li key={i} className="flex gap-2.5 text-sm">
          <i className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${t.tone === "bad" ? "bg-rose-400" : t.tone === "warn" ? "bg-amber-300" : "bg-[var(--text-faint)]"}`} aria-hidden="true" />
          <span className="min-w-0 text-[var(--text-muted)] leading-snug">{t.text}</span>
        </li>
      ))}
      <li className="flex gap-2.5 text-sm">
        <i className="mt-1.5 w-2 h-2 rounded-full shrink-0 bg-[var(--text-faint)]" aria-hidden="true" />
        <span className="min-w-0 text-[var(--text-muted)] leading-snug">
          Up số ca, chốt kế hoạch tháng sau, giờ cam kết còn thiếu: ở Bảng Vận Hành
          <button type="button" onClick={() => onNavigate("calendar")} className="ml-1.5 min-h-[24px] text-xs font-bold text-[var(--accent-text)] hover:underline">Mở →</button>
        </span>
      </li>
    </ul>
  </Card>
);

// ---------------------------------------------------------------------------
// So công bằng theo loại ngày: ngày sale chỉ so với ngày sale cùng loại.
// ---------------------------------------------------------------------------

const BUCKETS: CampDayBucket[] = ["dday", "midmonth", "payday", "daily"];
export const CampTable: React.FC<{ sessions: LiveSession[]; P: ResolvedPeriod }> = ({ sessions, P }) => {
  const group = (a: string, b: string) => {
    const m = new Map<CampDayBucket, { days: Set<string>; gmv: number; hours: number }>();
    for (const s of sessions) {
      if (s.date < a || s.date > b || !isCountable(s)) continue;
      const k = resolveCampBucketType(s.date);
      const o = m.get(k) ?? { days: new Set<string>(), gmv: 0, hours: 0 };
      o.days.add(s.date); o.gmv += s.actualGmv || 0; o.hours += sessionHours(s);
      m.set(k, o);
    }
    return m;
  };
  const cm = group(P.start, P.end), pm = P.noBase ? new Map() : group(P.prevStart, P.prevEnd);
  const dayList = (s: Set<string>, k: CampDayBucket) => (k === "daily" ? `${s.size} ngày` : [...s].sort().map(ddmm).join(", "));
  const rows = BUCKETS.filter((k) => cm.has(k) || pm.has(k));
  return (
    <Card>
      <BlockHead title="So công bằng theo loại ngày" sub={`${rangeLabel(P.start, P.end)} so với ${P.noBase ? "—" : rangeLabel(P.prevStart, P.prevEnd)} · GMV trung bình mỗi ngày có ca, theo từng loại ngày`} />
      <Table head={["Loại ngày", "Kỳ này", "Kỳ so sánh", "GMV/ngày", "so kỳ trước", "GMV/giờ", "so kỳ trước"]} empty={rows.length ? undefined : "Kỳ này chưa có ca có số."}>
        {rows.map((k) => {
          const x = cm.get(k), y = pm.get(k);
          const gd = x ? x.gmv / x.days.size : null, gdB = y ? y.gmv / y.days.size : null;
          const gh = x && x.hours ? x.gmv / x.hours : null, ghB = y && y.hours ? y.gmv / y.hours : null;
          return (
            <tr key={k}>
              <td className={`${TD} font-semibold text-[var(--text)]`}>{k === "daily" ? "Daily" : WAVE_NAME[k]}</td>
              <td className={`${TD} text-[var(--text-muted)]`}>{x ? dayList(x.days, k) : "—"}</td>
              <td className={`${TD} text-[var(--text-faint)]`}>{y ? dayList(y.days, k) : "—"}</td>
              <td className={TD}>{money(gd)}</td>
              <td className={TD}><Chg cur={gd} prev={gdB} />{gdB != null && <span className="text-[var(--text-faint)]"> vs {money(gdB)}</span>}</td>
              <td className={TD}>{money(gh)}</td>
              <td className={TD}><Chg cur={gh} prev={ghB} /></td>
            </tr>
          );
        })}
      </Table>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// GMV và GMV/giờ theo tháng (5 tháng), tháng đang chạy cắt ở ngày đủ số.
// ---------------------------------------------------------------------------

const MonthlyTables: React.FC<{ brands: Brand[]; sessions: LiveSession[]; through: string }> = ({ brands, sessions, through }) => {
  const month = through.slice(0, 7);
  const rows = brands.map((b) => ({ b, t: monthlyTrend(sessions.filter((s) => s.brandId === b.id), month, through) })).filter((r) => r.t.some((x) => x.gmv > 0));
  const months = rows[0]?.t.map((x) => x.month) ?? [month, prevMonthOf(month)];
  const partial = through < monthEndOf(`${month}-01`);
  const head = ["Brand", ...months.map((m) => `T${Number(m.slice(5))}${m === month && partial ? "*" : ""}`)];
  return (
    <div className="grid gap-4 xl:grid-cols-2 items-start">
      <Card>
        <BlockHead title="GMV theo tháng" sub={partial ? `* T${Number(month.slice(5))} tính tới ${ddmm(through)}` : undefined} />
        <Table head={head} empty={rows.length ? undefined : "Chưa có ca có số."}>
          {rows.map(({ b, t }) => <tr key={b.id}><td className={`${TD} font-semibold text-[var(--text)]`}>{b.name}</td>{t.map((x) => <td key={x.month} className={TD}>{x.gmv ? money(x.gmv) : "—"}</td>)}</tr>)}
        </Table>
      </Card>
      <Card>
        <BlockHead title="GMV/giờ theo tháng" sub="GMV ÷ giờ live của ca có số" />
        <Table head={head} empty={rows.length ? undefined : "Chưa có ca có số."}>
          {rows.map(({ b, t }) => <tr key={b.id}><td className={`${TD} font-semibold text-[var(--text)]`}>{b.name}</td>{t.map((x) => <td key={x.month} className={TD}>{money(x.gmvPerHour)}</td>)}</tr>)}
        </Table>
      </Card>
    </div>
  );
};
