import React, { useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, Clapperboard, Megaphone } from "lucide-react";
import type { Brand, LiveSession } from "../../../types";
import type { CampDayBucket } from "../../../lib/campaignDays";
import { resolveCampBucketType } from "../../../lib/campaignDays";
import { lensScope, waveRows, weekRows, type Lens, type LensPick, type LensRow, type LensScope } from "../../../lib/performance/brandLens";
import { ranIn, type ResolvedPeriod } from "../../../lib/performance/periodCompare";
import { isCountable, sessionHours } from "../../../lib/performance/hostPerformance";
import { profileOf, type MetricDefView } from "../../../lib/platforms/profiles";
import { WAVE_NAME } from "../../../lib/performance/channelHealth";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { BrandLogo } from "../../ui/BrandLogo";
import { PlatformChip } from "../../common/PlatformChip";
import { CardPill, TONE_FILL } from "../ChannelCardView";
import { LANDING_LABEL } from "../../../lib/performance/forecastCone";
import { Card, chartColor, ddmm, money, pct, WEEKDAY, weekdayIdx } from "../shared";
import { CumulativeChart, CumulativeLegend, DayBars, DayBarsLegend, RunRateGauge, TONE_VAR, toneOfPct } from "../../runrate/parts";
import { SHIFT_STATE_LABEL } from "../../../lib/performance/runRateUpdate";
import type { AccountVM } from "../../runrate/types";
import { CampTable, CumChart } from "./PlatformTab";
import { AdsSection, ShopSection, TeamSection } from "./brandBelow";
import { useBrandFiles } from "./useBrandFiles";
import { ForecastHistory, WhySection } from "./brandExtras";
import type { ForecastSnapshot } from "../../../lib/db/forecastSnapshots";
import { BulletinComposer } from "../../brand-workspace/BulletinComposer";
import { BlockHead, rangeLabel, TD, Table } from "./ui";

// Tab "Brand" của Dashboard (demo duyệt 22/10/2026). Tháng đang chạy: đồng hồ RUN-RATE (run-rate theo kế hoạch) + 2 ô nhỏ (% target
// tháng, dự kiến cuối tháng) + 4 ô, rồi 4 nút xem (Tháng · Đợt campaign · Ngày · Ca); Key Metrics và phần dưới đi theo nút đang chọn
// (lib/performance/brandLens.ts). Kỳ khác: biểu đồ luỹ kế + so theo loại ngày + Key Metrics theo kỳ. Số kênh = thẻ kênh (useChannelCards).

const LENSES: { id: Lens; label: string; icon: React.ReactNode }[] = [
  { id: "month", label: "Tháng", icon: <CalendarDays className="w-4 h-4" /> },
  { id: "wave", label: "Đợt campaign", icon: <Megaphone className="w-4 h-4" /> },
  { id: "day", label: "Ngày", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "shift", label: "Ca", icon: <Clapperboard className="w-4 h-4" /> }
];

export const BrandTab: React.FC<{
  brand: Brand;
  brands: Brand[];
  onPickBrand: (id: string) => void;
  platform: ReportPlatform;
  period: ResolvedPeriod;
  platSessions: LiveSession[];
  vm: AccountVM | null;
  today: string;
  onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void;
  onNavigate: (tab: string) => void;
  /** Sổ dự báo của kênh (0163) — biểu đồ dự báo qua từng ngày. */
  ledger?: ForecastSnapshot[];
  /** Mở từ workspace brand: một brand, không có hàng chọn brand. */
  locked?: boolean;
}> = ({ brand, brands, onPickBrand, platform, period: P, platSessions, vm, today, onOpenMonthPlan, onNavigate, locked, ledger }) => {
  const sessions = useMemo(() => platSessions.filter((s) => s.brandId === brand.id), [platSessions, brand.id]);
  const card = vm?.card ?? null;
  const r = vm?.report ?? null;
  const live = P.isCurrentMonth && !!r && r.asOf != null;
  const [pick, setPick] = useState<LensPick>({ lens: "month", week: null, wave: "dday", day: null, shiftId: null });
  const lens: Lens = live ? pick.lens : "month";
  const files = useBrandFiles(brand.id, platform, P.end.slice(0, 7));
  const weeks = useMemo(() => (r ? weekRows(r) : null), [r]);
  const waves = useMemo(() => (r ? waveRows(r) : null), [r]);
  const bucketOf = useMemo(() => card?.bucketOf ?? ((d: string) => resolveCampBucketType(d)), [card]);

  // Phạm vi Key Metrics / đội live / khung giờ.
  const ran = useMemo(() => sessions.filter((s) => s.status === "Completed"), [sessions]);
  const scope: LensScope = useMemo(() => {
    if (live && r?.asOf && weeks) {
      const wave = waves?.rows.some((w) => w.bucket === pick.wave) ? pick.wave : (waves?.rows[0]?.bucket ?? "daily");
      return lensScope({ sessions: ran, month: r.month, asOf: r.asOf, pick: { ...pick, wave }, bucketOf, weeks: weeks.rows });
    }
    return { by: "Kỳ ở thanh trên", label: rangeLabel(P.start, P.end), baseLabel: P.noBase ? "—" : rangeLabel(P.prevStart, P.prevEnd), cur: ranIn(sessions, P.start, P.end), base: P.noBase ? [] : ranIn(sessions, P.prevStart, P.prevEnd), unit: null };
  }, [live, r, weeks, waves, pick, ran, bucketOf, P, sessions]);

  const set = (p: Partial<LensPick>) => setPick((x) => ({ ...x, ...p }));
  const teamScope = { cur: scope.cur, prev: scope.base.length || P.noBase ? scope.base : null, label: scope.label, prevLabel: scope.baseLabel };

  return (
    <div className="space-y-5">
      {!locked && <div className="flex flex-wrap items-center gap-2">
        {brands.map((b) => (
          <button key={b.id} type="button" aria-pressed={b.id === brand.id} onClick={() => onPickBrand(b.id)} className={`px-3 py-1.5 rounded-xl text-sm font-bold min-h-[34px] border ${b.id === brand.id ? "seg-on border-transparent" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>{b.name}</button>
        ))}
      </div>}

      {P.isCurrentMonth ? (
        <>
          {r ? <RunRateHead vm={vm!} onNavigate={onNavigate} /> : <NoPlan vm={vm} brand={brand} platform={platform} onOpenMonthPlan={onOpenMonthPlan} />}
          {/* Bản tin cho brand (cổng brand 0179) — một hàng gọn, không còn là khối lớn (user 22/10). */}
          {card && card.state !== "off" && <BulletinComposer card={card} />}
        </>
      ) : (
        <>
          <CumChart sessions={sessions} P={P} cards={[]} title={`GMV · ${brand.name} ${platform}`} />
          <CampTable sessions={sessions} P={P} />
        </>
      )}

      {live && r && weeks && waves && (
        <>
          <div role="tablist" aria-label="Xem theo" className="flex gap-1 p-1 rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
            {LENSES.map((l) => (
              <button key={l.id} type="button" role="tab" aria-selected={lens === l.id} onClick={() => set({ lens: l.id })}
                className={`flex-1 min-w-[88px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap min-h-[44px] transition-colors ${lens === l.id ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/40"}`}>
                {l.icon}{l.label}
              </button>
            ))}
          </div>
          {lens === "month" && (
            <Card>
              <BlockHead title="Đã đạt so với target, cộng dồn theo ngày" sub={`Nét liền dừng ở ngày có dữ liệu cuối (${ddmm(r.asOf!)})`} />
              <CumulativeChart r={r} color={chartColor(brand.name)} showPace={false} />
              <CumulativeLegend color={chartColor(brand.name)} showPace={false} />
              <RowsTable kind="Tuần" rows={weeks.rows} total={weeks.total} selected={pick.week ?? ""} onPick={(id) => set({ week: id && id !== pick.week ? id : null })} card={card} lastHead="Target cả kỳ"
                foot="Bấm một tuần: Key Metrics bên dưới đổi theo tuần đó, so với cùng ngày tháng trước; bấm “Cả tháng tới nay” để quay lại. Target tuần = target các ca đã xếp, cộng phần target tháng chưa xếp vào ca (chia theo tỷ lệ), nên các tuần cộng lại đúng bằng dòng cả tháng." />
            </Card>
          )}
          {lens === "wave" && (
            <Card>
              <BlockHead title="Theo loại ngày camp" sub={`Tính đến ngày có dữ liệu cuối (${ddmm(r.asOf!)}) · bấm một dòng: Key Metrics và nhân sự live bên dưới đổi theo loại ngày đó`} />
              <RowsTable kind="Loại ngày" rows={waves.rows} total={waves.total} selected={scope.wave ?? ""} onPick={(id) => id && set({ wave: id as CampDayBucket })} card={card} lastHead="Target còn lại" remaining totalClickable={false} />
            </Card>
          )}
          {lens === "day" && (
            <Card>
              <BlockHead title="Từng ngày" sub="Cột = đã đạt · vạch = target ngày · bấm một ngày: Key Metrics bên dưới đổi theo ngày đó"
                right={<button type="button" onClick={() => set({ lens: "shift" })} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] min-h-[30px]">Xem các ca ngày {ddmm(pick.day ?? r.asOf!)} →</button>} />
              <DayBars r={r} color={chartColor(brand.name)} pickDay={pick.day ?? r.asOf} onPick={(d) => set({ day: d, shiftId: null })} />
              <DayBarsLegend />
            </Card>
          )}
          {lens === "shift" && <ShiftPicker r={r} day={pick.day ?? r.asOf!} shiftId={pick.shiftId} sessions={ran} onDay={(d) => set({ day: d, shiftId: null })} onShift={(id) => set({ shiftId: id })} />}
        </>
      )}

      <KeyMetrics platform={platform} scope={scope} />

      {live && lens === "month" && card && ledger && <ForecastHistory card={card} rows={ledger} />}
      {live && lens === "month" && card && <WhySection card={card} sessions={sessions} platform={platform} files={files} today={today} onNavigate={onNavigate} />}

      {lens === "month" && (
        <>
          <ShopSection files={files} platform={platform} />
          <AdsSection files={files} />
          <TeamSection s={teamScope} brands={brands} />
        </>
      )}
      {lens === "wave" && <TeamSection s={teamScope} brands={brands} wave={scope.wave ? (scope.wave === "daily" ? "ngày Daily" : WAVE_NAME[scope.wave]) : undefined} />}
      {lens !== "month" && (
        <BelowNote lens={lens} wave={scope.wave} day={pick.day ?? r?.asOf ?? null} onGo={(l) => set({ lens: l })} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Đầu tab: đồng hồ RUN-RATE + 2 ô nhỏ bên dưới; bên phải tên, 2 câu, 4 ô (bố cục cũ của app, user chốt 22/10)
// ---------------------------------------------------------------------------

const RunRateHead: React.FC<{ vm: AccountVM; onNavigate: (tab: string) => void }> = ({ vm, onNavigate }) => {
  const r = vm.report!, t = r.total, card = vm.card;
  const ahead = (t.gap ?? 0) >= 0, gap = Math.abs(t.gap ?? 0);
  const fill = card?.landing ? TONE_FILL[card.landing.key] : "var(--text-faint)";
  const rrColor = TONE_VAR[toneOfPct(t.runRate)];
  const fc = card?.forecast ?? null;
  const pM = t.target ? t.actual / t.target : null, pPlan = t.target ? t.targetToDate / t.target : null, pF = fc && t.target ? fc.p50 / t.target : null;
  const lead = fc && (t.runRate ?? 0) >= 0.95 && card?.landing && (card.landing.key === "unlikely" || card.landing.key === "short") ? `Run-rate ${pct(t.runRate)} nhưng vẫn "${LANDING_LABEL[card.landing.key]}": dự báo` : "Dự báo";
  const tentative = r.tail.shifts > 0;
  const small = "rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2 grid grid-rows-[auto_auto_auto_auto] text-left min-w-0";
  return (
    <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ background: `radial-gradient(900px 260px at 0% 0%, ${chartColor(vm.brand.name)}, transparent 70%)` }} />
      <div className="relative grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] items-start">
        <div className="flex flex-col items-center gap-2">
          <RunRateGauge value={t.runRate} tone={toneOfPct(t.runRate)} color={rrColor} />
          {card && <CardPill card={card} />}
          <div className="grid grid-cols-2 gap-2 w-full mt-1">
            <div className={small}>
              <span className="text-[11px] text-[var(--text-faint)] truncate">% Target tháng</span>
              <b className="text-lg font-black text-[var(--text)] tabular-nums leading-tight">{pct(pM)}</b>
              <span className="text-[11px] text-[var(--text-faint)] truncate tabular-nums">{money(t.actual)} / {money(t.target)}</span>
              <span className="text-[11px] text-[var(--text-faint)] truncate">target luỹ kế {pct(pPlan)}</span>
            </div>
            <div className={small}>
              <span className="text-[11px] text-[var(--text-faint)] truncate">Dự báo cuối tháng</span>
              <b className="text-lg font-black tabular-nums leading-tight" style={{ color: fc ? fill : "var(--text-faint)" }}>{fc ? pct(pF) : "—"}</b>
              <span className="text-[11px] text-[var(--text-faint)] truncate tabular-nums">{fc ? `~${money(fc.p50)}` : "kênh mới"}</span>
              <span className="text-[11px] text-[var(--text-faint)] truncate">{fc && card?.landing ? `xác suất đạt ${card.landing.pHit < 0.01 ? "≈ 0%" : pct(card.landing.pHit)}` : "chưa có dự báo"}</span>
            </div>
          </div>
        </div>
        <div className="space-y-3.5 min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <BrandLogo brand={vm.brand} size="md" />
            <h3 className="text-xl font-black text-[var(--text)]">{vm.brand.name}</h3>
            <PlatformChip platform={vm.platform} />
            <span className="text-xs text-[var(--text-faint)]">Tháng {Number(r.month.slice(5))}/{r.month.slice(0, 4)}{r.asOf ? ` · dữ liệu đến ${ddmm(r.asOf)}` : ""}</span>
          </div>
          {t.runRate == null ? (
            <p className="text-sm text-[var(--text-muted)]">Chưa có ca nào đã live và có số liệu trong tháng, nên chưa tính được Run-rate.</p>
          ) : (
            <div className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-muted)] space-y-1">
              <p>Run-rate theo kế hoạch: các ca đã live đạt <b className="text-[var(--text)]">{money(t.actual)}</b> trên target của chính các ca đó <b className="text-[var(--text)]">{money(t.targetToDate)}</b>, {ahead ? "vượt" : "thiếu"} <b style={{ color: ahead ? "var(--success)" : rrColor }}>{money(gap)}</b> so với tiến độ.</p>
              {card && (
                <p>
                  {fc ? <>{lead} cuối tháng <b className="text-[var(--text)]">~{money(fc.p50)}</b> (khoảng {money(Math.max(0, fc.lo))}–{money(fc.hi)}){pF != null && <>, <b className="text-[var(--text)]">{pct(pF)}</b> target</>}.</> : card.newChannel ? "Kênh mới (dưới 15 ca lịch sử): chưa dự báo cuối tháng." : "Chưa đủ số + lịch để dự báo cuối tháng."}
                  {card.need && <> Để đạt target cần <b className="text-[var(--text)]">{money(card.need.perHour)}/giờ</b> cho {Math.round(card.need.hours)} giờ live còn trong lịch{card.need.blended != null && <> (hiện đạt {money(card.need.blended)}/giờ)</>}.</>}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              ["Target tháng", money(t.target), `% Target ${pct(pM)}`],
              ["Đã đạt", money(t.actual), `${t.elapsedDays} ngày đã tính`],
              ["Target luỹ kế", money(t.targetToDate), "target các ca đến ngày có dữ liệu"],
              [ahead ? "Vượt target luỹ kế" : "Chênh so target luỹ kế", <span key="g" style={{ color: ahead ? "var(--success)" : rrColor }}>{`${ahead ? "+" : "−"}${money(gap)}`}</span>, r.offPlan.length > 0 ? `${r.offPlan.length} ca ngoài kế hoạch: ${money(r.offPlanActual)}` : ""]
            ].map(([l, v, h], i) => (
              <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-3 min-w-0">
                <p className="text-xs text-[var(--text-muted)]">{l}</p>
                <p className="text-lg font-black tabular-nums text-[var(--text)] leading-tight mt-0.5">{v}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5 truncate">{h || " "}</p>
              </div>
            ))}
          </div>
          {card?.commitment && <p className="text-xs text-[var(--text-muted)]">Giờ cam kết: đã live <b className="text-[var(--text)]">{Math.round(card.commitment.deliveredHours)}/{Math.round(card.commitment.committedHours)} giờ</b> · còn {Math.round(card.commitment.scheduledHours)} giờ trong lịch{card.commitment.gapHours > 0.5 ? <b className="text-amber-300"> · thiếu {Math.round(card.commitment.gapHours)} giờ chưa xếp</b> : ""}</p>}
          {(tentative || vm.missingSessions > 0) && (
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-300" />
              <div className="flex-1 min-w-0 space-y-0.5">
                {tentative && <p>Run-rate gồm {r.tail.shifts} ca sau ngày đủ số{vm.completeThrough ? ` (${ddmm(vm.completeThrough)})` : ""}{r.tail.lastShift ? `, tới ca ${r.tail.lastShift.startTime}–${r.tail.lastShift.endTime} ${ddmm(r.tail.lastShift.date)}` : ""}, mỗi ca so với target đúng ca đó{r.tail.unreconciled > 0 ? `; ${r.tail.unreconciled} ca chưa đối soát nên còn đổi` : ""}.</p>}
                {vm.missingSessions > 0 && <p>{vm.missingSessions} ca đã live chưa có số liệu{vm.oldestMissing ? `, cũ nhất ${ddmm(vm.oldestMissing)}` : ""}{r.noDataCount - r.noDataWaiting > 0 ? ": run-rate có thể thấp hơn thực tế." : ": chưa vào run-rate, có số là tự cập nhật."}</p>}
              </div>
              {vm.missingSessions > 0 && <button type="button" onClick={() => onNavigate("sessions")} className="font-bold underline underline-offset-2 hover:text-amber-100 min-h-[24px]">Mở Sổ Ca</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const NoPlan: React.FC<{ vm: AccountVM | null; brand: Brand; platform: ReportPlatform; onOpenMonthPlan: (brandId: string, platform: ReportPlatform) => void }> = ({ vm, brand, platform, onOpenMonthPlan }) => {
  const off = vm?.card?.state === "off";
  return (
    <Card>
      <p className="text-sm font-bold text-[var(--text)]">{vm?.loading ? "Đang đọc kế hoạch…" : off ? `${brand.name} ${platform} không có ca nào tháng này.` : vm?.planStatus === "draft" ? "Kế hoạch tháng còn nháp, chưa chốt." : `${brand.name} ${platform} chưa lập Kế Hoạch Tháng.`}</p>
      {!vm?.loading && <p className="text-sm text-[var(--text-muted)] mt-1">Run-rate và dự báo cần target của các ca đã chốt. Key Metrics, shop, đội live bên dưới vẫn xem được.</p>}
      {!vm?.loading && <button type="button" onClick={() => onOpenMonthPlan(brand.id, platform)} className="mt-3 text-xs font-bold px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] min-h-[32px]">Mở Kế Hoạch Tháng →</button>}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Bảng tuần / loại ngày, dòng cuối "Cả tháng tới nay"
// ---------------------------------------------------------------------------

const RowsTable: React.FC<{ kind: string; rows: LensRow[]; total: LensRow; selected: string; onPick: (id: string) => void; card: AccountVM["card"] | null; lastHead: string; remaining?: boolean; totalClickable?: boolean; foot?: string }> = ({ kind, rows, total, selected, onPick, card, lastHead, remaining, totalClickable = true, foot }) => {
  const fcLine = card?.forecast && card.target ? `dự báo ~${money(card.forecast.p50)} · ${pct(card.forecast.p50 / card.target)}` : "";
  return (
    <div className="mt-3">
      <Table head={[kind, "Đã đạt", "Target tới nay", "Run-rate", lastHead]}>
        {[...rows, total].map((w) => {
          const isTot = w.id === "", fut = !isTot && w.status === "next" && w.targetToDate === 0;
          const on = (selected || "") === w.id;
          const clickable = !fut && (!isTot || totalClickable);
          const tone = toneOfPct(w.runRate);
          const last = remaining ? w.target - w.targetToDate : w.target;
          return (
            <tr key={w.id || "tot"} onClick={clickable ? () => onPick(w.id) : undefined} aria-selected={on}
              className={`${clickable ? "cursor-pointer hover:bg-[var(--surface-hover)]/40" : ""} ${on ? "bg-[var(--accent)]/10" : ""} ${isTot ? "border-t-2 border-[var(--border)] font-bold" : ""} ${fut ? "opacity-60" : ""}`}>
              <td className={TD}><b className="text-[var(--text)]">{w.name}</b><span className="block text-[11px] font-normal text-[var(--text-faint)]">{w.when}{!isTot && w.status === "live" && kind === "Tuần" ? " · đang chạy" : !isTot && w.status === "done" && kind === "Tuần" ? " · đã xong" : ""}</span></td>
              <td className={TD}>{fut ? "—" : money(w.actual)}</td>
              <td className={TD}>{fut ? <span className="text-[var(--text-faint)]">chưa tới</span> : money(w.targetToDate)}</td>
              <td className={TD}>
                <span className="inline-flex items-center gap-2 justify-end">
                  <span className="relative w-20 h-2 rounded-full bg-[var(--surface-base)] hidden sm:inline-block"><i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fut || w.runRate == null ? 0 : Math.min(100, (w.runRate / 1.2) * 100)}%`, background: TONE_VAR[tone] }} /><b className="absolute -top-0.5 -bottom-0.5 w-px bg-[var(--text-faint)]" style={{ left: `${100 / 1.2}%` }} /></span>
                  <b className="tabular-nums" style={{ color: TONE_VAR[tone] }}>{fut ? "—" : pct(w.runRate)}</b>
                </span>
              </td>
              <td className={TD}>{last > 0 ? money(last) : "—"}{isTot && fcLine && <span className="block text-[11px] font-normal text-[var(--text-faint)]">{fcLine}</span>}</td>
            </tr>
          );
        })}
      </Table>
      {foot && <p className="text-xs text-[var(--text-faint)] mt-3 leading-snug">{foot}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ca: chọn ngày rồi bấm một ca
// ---------------------------------------------------------------------------

const ShiftPicker: React.FC<{ r: NonNullable<AccountVM["report"]>; day: string; shiftId: string | null; sessions: LiveSession[]; onDay: (d: string) => void; onShift: (id: string) => void }> = ({ r, day, shiftId, sessions, onDay, onShift }) => {
  const days = r.days.filter((d) => d.shifts > 0 || d.actual > 0);
  const d = days.find((x) => x.date === day) ?? days[days.length - 1];
  const shifts = r.shifts.filter((s) => s.date === d?.date);
  const ranToday = sessions.filter((s) => s.date === d?.date);
  const selId = shiftId ?? ranToday.find(isCountable)?.id ?? null;
  return (
    <Card>
      <BlockHead title="Từng ca" sub="Chọn ngày, rồi bấm một ca: Key Metrics bên dưới đổi theo ca đó" />
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {days.map((x) => (
          <button key={x.date} type="button" aria-pressed={x.date === d?.date} onClick={() => onDay(x.date)}
            className={`shrink-0 min-w-[52px] rounded-xl border px-2 py-1.5 text-center min-h-[48px] ${x.date === d?.date ? "border-[var(--accent)] bg-[var(--accent)]/10" : x.withData < x.shifts && x.state !== "future" ? "border-amber-500/40" : "border-[var(--border)]"}`}>
            <span className="block text-[11px] text-[var(--text-faint)]">{WEEKDAY[weekdayIdx(x.date)]}</span>
            <b className="block text-sm text-[var(--text)] tabular-nums">{x.date.slice(8, 10)}</b>
          </button>
        ))}
      </div>
      {d && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-sm">
            <b className="text-[var(--text)]">Ngày {ddmm(d.date)} · {WEEKDAY[weekdayIdx(d.date)]}</b>
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-base)] text-[var(--text-muted)]">{d.bucket === "daily" ? "Daily" : WAVE_NAME[d.bucket]}</span>
            <span className="text-xs text-[var(--text-faint)]">{d.withData}/{d.shifts} ca có số</span>
            <span className="sm:ml-auto text-[var(--text-muted)]">Đạt <b className="text-[var(--text)] tabular-nums">{d.withData ? money(d.actual) : "—"}</b> / target <b className="text-[var(--text)] tabular-nums">{money(d.target)}</b>{d.withData && d.target ? <> · <b className="tabular-nums">{pct(d.actual / d.target)}</b></> : null}</span>
          </div>
          <div className="mt-2 divide-y divide-[var(--border-muted)]">
            {shifts.map((s) => {
              const ses = ranToday.find((x) => x.startTime.slice(0, 5) === s.startTime.slice(0, 5));
              const on = !!ses && ses.id === selId;
              const tone = toneOfPct(s.pctTarget);
              return (
                <button key={s.id} type="button" disabled={!ses} onClick={() => ses && onShift(ses.id)} aria-pressed={on}
                  className={`w-full grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[96px_minmax(0,1fr)_110px_minmax(0,200px)_52px] gap-x-3 gap-y-0.5 items-center py-2 px-2 text-left text-sm rounded-lg ${on ? "bg-[var(--accent)]/10" : ses ? "hover:bg-[var(--surface-hover)]/40" : ""}`}>
                  <span className="tabular-nums font-bold text-[var(--text)]">{on ? "▸ " : ""}{s.startTime}–{s.endTime}</span>
                  <span className="truncate text-[var(--text-muted)]">{[s.hostName, s.assistantName].filter(Boolean).join(" + ") || "Chưa có người"}</span>
                  <span className="text-[11px] text-[var(--text-faint)] hidden sm:block">{SHIFT_STATE_LABEL[s.state]}</span>
                  <span className="tabular-nums text-[var(--text)] col-span-2 sm:col-span-1">{s.state === "done" ? money(s.actual) : s.state === "no_data" ? "Ca đã live, chưa có số liệu" : "Chưa tới giờ"}<span className="text-[var(--text-faint)]"> / target {money(s.target)}</span></span>
                  <b className="tabular-nums text-right" style={{ color: TONE_VAR[tone] }}>{s.pctTarget == null ? "" : pct(s.pctTarget)}</b>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Key Metrics theo phạm vi đang chọn
// ---------------------------------------------------------------------------

const VOLUME = new Set(["gmv", "itemsSold", "orders", "productImpressions", "productClicks", "views", "impressions", "hours", "items", "viewers", "atc", "skuOrders"]);

const KeyMetrics: React.FC<{ platform: ReportPlatform; scope: LensScope }> = ({ platform, scope }) => {
  const prof = profileOf(platform);
  const curGot = scope.cur.filter(isCountable), baseGot = scope.base.filter(isCountable);
  const c = prof.metrics.ofSessions(curGot, sessionHours), b = prof.metrics.ofSessions(baseGot, sessionHours);
  const units = (xs: LiveSession[]) => (scope.unit === "ca" ? xs.length : new Set(xs.map((s) => s.date)).size);
  const kc = scope.unit ? Math.max(1, units(curGot)) : 1, kb = scope.unit ? Math.max(1, units(baseGot)) : 1;
  const norm = kc > 1 || kb > 1;
  const weak = baseGot.length === 0 || baseGot.length < 5 || (!scope.unit && curGot.length < 5);
  const cell = (d: MetricDefView, big: boolean) => {
    const cv = prof.metrics.value(c, d.key), bv = baseGot.length ? prof.metrics.value(b, d.key) : null;
    const vol = VOLUME.has(d.key);
    const cn = vol && cv != null ? cv / kc : cv, bn = vol && bv != null ? bv / kb : bv;
    const ch = bn && cn != null ? cn / bn - 1 : null;
    const cls = ch == null || d.goodWhenUp == null || Math.abs(ch) < 0.02 || weak ? "text-[var(--text-faint)]" : ch > 0 === d.goodWhenUp ? "text-emerald-400" : "text-rose-400";
    return (
      <div key={d.key} className={`min-w-0 ${big ? "h-full rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-3" : "py-1.5"}`}>
        <p className="text-xs text-[var(--text-muted)] truncate">{d.label}</p>
        <p className={`${big ? "text-lg" : "text-sm"} font-black tabular-nums text-[var(--text)] leading-tight`}>{prof.metrics.fmt(d, cv)}</p>
        <p className="text-[11px] truncate">{ch == null ? <span className="text-[var(--text-faint)]">{baseGot.length ? "—" : "kỳ so sánh chưa có số"}</span> : <><span className={`font-bold ${cls}`}>{ch >= 0 ? "+" : "−"}{(Math.abs(ch) * 100).toLocaleString("vi-VN", { maximumFractionDigits: Math.abs(ch) < 0.1 ? 1 : 0 })}%</span> <span className="text-[var(--text-faint)]">({prof.metrics.fmt(d, bn)}{vol && norm ? `/${scope.unit}` : ""})</span></>}</p>
      </div>
    );
  };
  return (
    <Card>
      <BlockHead title={`Key Metrics · ${scope.label}`} sub={<><span className="inline-block px-2 py-0.5 rounded-full bg-[var(--surface-base)] text-[var(--text-muted)] mr-1.5">theo: {scope.by}</span>% thay đổi so với {scope.baseLabel}, số trong ngoặc là giá trị kỳ so sánh{norm ? ` (chỉ số tổng quy về bình quân mỗi ${scope.unit})` : ""} · {curGot.length} ca có số liệu</>} />
      {curGot.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Không có ca có số trong {scope.label}. Chọn ngày, đợt hoặc ca khác.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">{prof.metrics.defs.filter((d) => d.group === "result").map((d) => cell(d, true))}</div>
          {prof.metrics.groups.filter((g) => g.group !== "result").map((g) => (
            <div key={g.group}>
              <p className="text-xs font-bold text-[var(--text-muted)]" title={g.hint}>{g.label}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-x-4">{prof.metrics.defs.filter((d) => d.group === g.group).map((d) => cell(d, false))}</div>
            </div>
          ))}
          {weak && baseGot.length > 0 && <p className="text-xs text-[var(--text-faint)]">Dưới 5 ca ở một bên: % thay đổi hiển thị mờ, chưa kết luận.</p>}
          {prof.metrics.coverageNotes(c).map((n) => <p key={n.text} className={`text-xs ${n.tone === "warn" ? "text-amber-300" : "text-[var(--text-faint)]"}`}>{n.text}</p>)}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// Ở nút Đợt / Ngày / Ca: phần chỉ có số theo tháng thu lại một dòng
// ---------------------------------------------------------------------------

const BelowNote: React.FC<{ lens: Lens; wave?: CampDayBucket; day: string | null; onGo: (l: Lens) => void }> = ({ lens, wave, day, onGo }) => {
  const back = <button type="button" onClick={() => onGo("month")} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] min-h-[30px]">Về nút Tháng</button>;
  const w = wave ? (wave === "daily" ? "những ngày đó" : `các ngày ${WAVE_NAME[wave]}`) : "các ngày của đợt";
  const note =
    lens === "wave"
      ? ["Shop, SKU, quảng cáo và khuyến mãi không tách được theo đợt", `File brand gửi chỉ có số cả tháng. Muốn xem theo đợt cần brand xuất thêm file SKU riêng cho ${w}.`, back]
      : lens === "day"
        ? [`Ngày ${day ? ddmm(day) : ""}: chỉ xem số của ngày ở trên và Key Metrics`, "Một ngày chỉ 2–3 ca, quá ít để xếp hạng host hay so khung giờ. Host và trợ live từng ca ở nút Ca; shop, SKU, quảng cáo ở nút Tháng.", <><button type="button" onClick={() => onGo("shift")} className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] min-h-[30px]">Xem các ca ngày này</button>{back}</>]
        : ["Ca đang chọn: host, trợ live và số của ca ở bảng trên", "Nhân sự live, khung giờ, shop và quảng cáo cần nhiều ca hoặc chỉ có số cả tháng: xem ở nút Tháng hoặc Đợt campaign.", back];
  return (
    <Card className="!py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 basis-80 min-w-0"><p className="text-sm font-bold text-[var(--text)]">{note[0]}</p><p className="text-xs text-[var(--text-muted)] mt-0.5">{note[1]}</p></div>
        <div className="flex flex-wrap gap-2">{note[2]}</div>
      </div>
    </Card>
  );
};
