import React, { useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, Clapperboard, Megaphone } from "lucide-react";
import type { CampDayBucket } from "../../lib/campaignDays";
import { runRateVerdict } from "../../lib/performance/runRateUpdate";
import { PlatformChip } from "../common/PlatformChip";
import { BrandLogo } from "../ui/BrandLogo";
import { Card, chartColor, ddmm, money, pct } from "../dashboard/shared";
import { isTentative } from "./AccountCard";
import { DayLens, MonthLens, ShiftLens, WaveLens, type Lens, type LensFocus } from "./lenses";
import { RunRateGauge, TONE_VAR, TonePill } from "./parts";
import type { AccountVM } from "./types";

const tabular = "tabular-nums";

const LENSES: { id: Lens; label: string; icon: React.ReactNode }[] = [
  { id: "month", label: "Tháng", icon: <CalendarDays className="w-4 h-4" /> },
  { id: "wave", label: "Đợt campaign", icon: <Megaphone className="w-4 h-4" /> },
  { id: "day", label: "Ngày", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "shift", label: "Ca", icon: <Clapperboard className="w-4 h-4" /> }
];

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div className="min-w-0 rounded-xl bg-[var(--surface-base)]/60 border border-[var(--border-muted)] px-3 py-2.5">
    <div className="text-[11px] font-bold text-[var(--text-faint)] truncate">{label}</div>
    <div className={`text-lg font-black leading-tight truncate ${tabular}`} style={{ color: tone ?? "var(--text)" }}>{value}</div>
    {hint && <div className="text-[11px] text-[var(--text-faint)] truncate">{hint}</div>}
  </div>
);

export const AccountDetail: React.FC<{ vm: AccountVM; lens: Lens; onLens: (l: Lens) => void; onNavigate: (tab: string) => void }> = ({ vm, lens, onLens, onNavigate }) => {
  const r = vm.report;
  const [waveFilter, setWaveFilter] = useState<CampDayBucket | null>(null);
  const [pickDay, setPickDay] = useState<string | null>(null);
  if (!r) return null;
  const color = chartColor(vm.brand.name);
  const t = r.total;
  const v = runRateVerdict(t.runRate);
  const focus = (f: LensFocus) => {
    onLens(f.lens);
    if (f.wave !== undefined) setWaveFilter(f.wave);
    if (f.day !== undefined) setPickDay(f.day);
  };
  const tentative = isTentative(vm);
  const ahead = (t.gap ?? 0) >= 0;

  return (
    <div className="space-y-4">
      <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6 overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[0.14]" style={{ background: `radial-gradient(900px 260px at 0% 0%, ${color}, transparent 70%)` }} />
        <div className="relative grid gap-5 lg:grid-cols-[auto_1fr] items-center">
          <div className="flex flex-col items-center gap-2 mx-auto lg:mx-0">
            <RunRateGauge value={t.runRate} tone={v.tone} />
            <TonePill tone={v.tone}>{v.label}</TonePill>
          </div>
          <div className="space-y-3.5 min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <BrandLogo brand={vm.brand} size="md" />
              <h3 className="text-xl font-black text-[var(--text)]">{vm.brand.name}</h3>
              <PlatformChip platform={vm.platform} />
              <span className="text-xs text-[var(--text-faint)]">Tháng {Number(r.month.slice(5))}/{r.month.slice(0, 4)}{r.asOf ? ` · số tới hết ${ddmm(r.asOf)}` : ""}</span>
            </div>
            {t.runRate == null ? (
              <p className="text-sm text-[var(--text-muted)]">Chưa có ca nào đã chạy và có số trong tháng, nên chưa tính được run-rate.</p>
            ) : (
              <div className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-muted)] space-y-1">
                <p>
                  Đã đạt <b className="text-[var(--text)]">{money(t.actual)}</b> trên kỳ vọng <b className="text-[var(--text)]">{money(t.targetToDate)}</b> — {ahead ? "vượt" : "thiếu"}{" "}
                  <b style={{ color: TONE_VAR[ahead ? "good" : v.tone] }}>{money(Math.abs(t.gap ?? 0))}</b> so với tiến độ.
                </p>
                {t.keepPace != null && (
                  <p>
                    Giữ nhịp này, cuối tháng khoảng <b className="text-[var(--text)]">{money(t.keepPace)}</b>{t.keepPacePct != null && <> (<b className="text-[var(--text)]">{pct(t.keepPacePct)}</b> target)</>}.
                    {t.needPerRemainingDay != null && t.remainingDays > 0 && (
                      <> Muốn kịp target cần <b className="text-[var(--text)]">{money(t.needPerRemainingDay)}/ngày</b> trong {t.remainingDays} ngày còn lại{t.perDayNow != null && <> (đang đạt {money(t.perDayNow)}/ngày)</>}.</>
                    )}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Target tháng" value={money(t.target)} hint={t.pctTarget != null ? `đã đạt ${pct(t.pctTarget)}` : undefined} />
              <Stat label="Đã đạt" value={money(t.actual)} hint={`${t.elapsedDays} ngày đã tính`} />
              <Stat label="Kỳ vọng tới nay" value={money(t.targetToDate)} hint="target các ca tới ngày số tới" />
              <Stat label={ahead ? "Vượt tiến độ" : "Thiếu so tiến độ"} value={t.gap == null ? "—" : `${ahead ? "+" : "−"}${money(Math.abs(t.gap))}`} tone={t.gap == null ? undefined : TONE_VAR[ahead ? "good" : v.tone]} hint={r.offPlan.length > 0 ? `${r.offPlan.length} ca ngoài kế hoạch: ${money(r.offPlanActual)}` : undefined} />
            </div>
            {(tentative || vm.missingSessions > 0) && (
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200 leading-snug">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px text-amber-300" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  {tentative && <p>Số tới {r.asOf ? ddmm(r.asOf) : "—"} nằm sau ngày đủ số{vm.completeThrough ? ` (${ddmm(vm.completeThrough)})` : ""} — run-rate là số tạm tính.</p>}
                  {vm.missingSessions > 0 && <p>{vm.missingSessions} ca đã chạy chưa có số{vm.oldestMissing ? `, cũ nhất ${ddmm(vm.oldestMissing)}` : ""}: run-rate có thể thấp hơn thực tế.</p>}
                </div>
                {vm.missingSessions > 0 && <button type="button" onClick={() => onNavigate("sessions")} className="font-bold underline underline-offset-2 hover:text-amber-100 min-h-[24px]">Mở Sổ Ca</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Xem theo" className="flex gap-1 p-1 rounded-2xl bg-[var(--surface)] border border-[var(--border)] overflow-x-auto">
        {LENSES.map((l) => (
          <button key={l.id} type="button" role="tab" aria-selected={lens === l.id} onClick={() => onLens(l.id)}
            className={`flex-1 min-w-[88px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap min-h-[44px] transition-colors ${lens === l.id ? "bg-[var(--accent)] text-[var(--accent-contrast)] shadow" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/40"}`}>
            {l.icon}{l.label}
          </button>
        ))}
      </div>

      {lens === "month" && <MonthLens r={r} color={color} />}
      {lens === "wave" && <WaveLens r={r} waveFilter={waveFilter} onFocus={focus} />}
      {lens === "day" && <DayLens r={r} color={color} waveFilter={waveFilter} pickDay={pickDay} onFocus={focus} onClearWave={() => setWaveFilter(null)} />}
      {lens === "shift" && <ShiftLens r={r} waveFilter={waveFilter} pickDay={pickDay} onFocus={focus} onClearWave={() => setWaveFilter(null)} />}
      {r.noDataCount > 0 && lens !== "shift" && (
        <Card className="!py-3"><p className="text-xs text-[var(--text-muted)]">{r.noDataCount} ca kế hoạch đã qua nhưng chưa có số — vẫn nằm trong mẫu số (target) của run-rate. Xem ở mục “Ca”.</p></Card>
      )}
    </div>
  );
};
