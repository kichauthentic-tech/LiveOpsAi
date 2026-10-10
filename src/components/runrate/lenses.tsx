import React from "react";
import { ArrowRight, CalendarDays, CircleSlash, Clock3, ListChecks } from "lucide-react";
import type { CampDayBucket } from "../../lib/campaignDays";
import { WAVE_NAME } from "../../lib/performance/channelHealth";
import { SHIFT_STATE_LABEL, type AccountRunRate, type RRDay, type RRShift, type RRWave } from "../../lib/performance/runRateUpdate";
import { BUCKET_COLOR, Card, SectionTitle, WEEKDAY, ddmm, money, pct, weekdayIdx } from "../dashboard/shared";
import { fmtVndShort } from "../../lib/format";
import { BucketChip, CumulativeChart, CumulativeLegend, DAY_STATE_LABEL, DayBars, DayBarsLegend, PctBar, TONE_VAR, TonePill, WaveStatusPill, toneOfPct } from "./parts";

export type Lens = "month" | "wave" | "day" | "shift";
export interface LensFocus {
  lens: Lens;
  wave?: CampDayBucket | null;
  day?: string | null;
}

const tabular = "tabular-nums";
const rangeText = (a: string, b: string) => (a === b ? ddmm(a) : `${ddmm(a)}–${ddmm(b)}`);

// ---------------------------------------------------------------------------
// Tháng: đường lũy kế + từng tuần
// ---------------------------------------------------------------------------

export const MonthLens: React.FC<{ r: AccountRunRate; color: string }> = ({ r, color }) => (
  <div className="space-y-4">
    <Card>
      <SectionTitle title="Đã đạt so với target, cộng dồn theo ngày" note="Đường nét liền dừng ở ngày số tới; nét đứt là nếu phần còn lại cũng chạy đúng nhịp hiện tại" />
      <div className="mt-3">
        <CumulativeChart r={r} color={color} />
        <CumulativeLegend color={color} />
      </div>
    </Card>
    <Card>
      <SectionTitle title="Từng tuần" note="Tuần tính từ thứ Hai; tuần đầu/cuối có thể ngắn hơn 7 ngày" />
      <div className="mt-3 divide-y divide-[var(--border-muted)]">
        {r.weeks.map((w) => {
          const tone = toneOfPct(w.runRate);
          return (
            <div key={w.index} className="py-3 grid grid-cols-[1fr_auto] lg:grid-cols-[minmax(150px,1.1fr)_minmax(110px,1.4fr)_repeat(2,minmax(76px,0.7fr))_auto] gap-x-4 gap-y-1.5 items-center">
              <div className="min-w-0">
                <div className="text-sm font-bold text-[var(--text)] truncate">{w.label}</div>
                <div className="mt-0.5"><WaveStatusPill status={w.status} /></div>
              </div>
              <div className="col-span-2 lg:col-span-1 order-last lg:order-none"><PctBar value={w.runRate} tone={tone} label={`Run-rate ${pct(w.runRate)}`} /></div>
              <div className="hidden lg:block text-right"><div className="text-[11px] text-[var(--text-faint)]">Đạt</div><div className={`text-sm font-bold text-[var(--text)] ${tabular}`}>{w.status === "next" ? "—" : money(w.actual)}</div></div>
              <div className="hidden lg:block text-right"><div className="text-[11px] text-[var(--text-faint)]">Target tuần</div><div className={`text-sm font-bold text-[var(--text-muted)] ${tabular}`}>{money(w.target)}</div></div>
              <div className="justify-self-end text-right min-w-[64px]">
                {w.status === "next" ? <span className="text-xs text-[var(--text-faint)]">chưa tới</span> : <span className={`text-lg font-black ${tabular}`} style={{ color: TONE_VAR[tone] }}>{pct(w.runRate)}</span>}
                <div className={`lg:hidden text-[11px] text-[var(--text-faint)] ${tabular}`}>{w.status === "next" ? money(w.target) : `${money(w.actual)} / ${money(w.targetToDate)}`}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  </div>
);

// ---------------------------------------------------------------------------
// Đợt campaign
// ---------------------------------------------------------------------------

const WaveCard: React.FC<{ w: RRWave; onFocus: (f: LensFocus) => void; active: boolean }> = ({ w, onFocus, active }) => {
  const tone = toneOfPct(w.runRate);
  const camp = w.bucket !== "daily";
  return (
    <div className={`relative rounded-2xl border p-4 flex flex-col gap-3 bg-[var(--surface)] overflow-hidden transition-colors ${active ? "border-[var(--accent)]" : "border-[var(--border)]"}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: BUCKET_COLOR[w.bucket], opacity: camp ? 1 : 0.4 }} />
      <div className="flex items-start justify-between gap-2 pt-1">
        <div className="min-w-0">
          <BucketChip bucket={w.bucket} label={w.label} />
          <div className="text-xs text-[var(--text-faint)] mt-0.5">{camp ? `${rangeText(w.from, w.to)} · ${w.days.length} ngày` : `${w.days.length} ngày không camp`}</div>
        </div>
        <WaveStatusPill status={w.status} />
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <div className={`text-3xl font-black leading-none ${tabular}`} style={{ color: w.status === "next" ? "var(--text-faint)" : TONE_VAR[tone] }}>{w.status === "next" ? "—" : pct(w.runRate)}</div>
          <div className="text-[11px] text-[var(--text-faint)] mt-1">run-rate của đợt</div>
        </div>
        {w.status !== "next" && <TonePill tone={tone}>{tone === "good" ? "Đúng tiến độ" : tone === "warn" ? "Hơi chậm" : tone === "bad" ? "Chậm" : "Chưa có số"}</TonePill>}
      </div>
      <PctBar value={w.status === "next" ? null : w.runRate} tone={tone} label={`Run-rate đợt ${w.label}: ${pct(w.runRate)}`} />
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-[var(--text-faint)]">Đạt</dt><dd className={`font-bold text-[var(--text)] ${tabular}`}>{w.status === "next" ? "—" : money(w.actual)}</dd></div>
        <div><dt className="text-[var(--text-faint)]">Kỳ vọng tới nay</dt><dd className={`font-bold text-[var(--text-muted)] ${tabular}`}>{w.status === "next" ? "—" : money(w.targetToDate)}</dd></div>
        <div><dt className="text-[var(--text-faint)]">Target đợt</dt><dd className={`font-bold text-[var(--text-muted)] ${tabular}`}>{money(w.target)}</dd></div>
      </dl>
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--text-faint)]">
        <span>{w.shiftsDone}/{w.shifts} ca có số{w.status !== "next" && w.pctTarget != null ? ` · ${pct(w.pctTarget)} target cả đợt` : ""}</span>
      </div>
      <div className="flex flex-wrap gap-2 mt-auto pt-1">
        <button type="button" onClick={() => onFocus({ lens: "day", wave: w.bucket })} className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[28px]">
          <CalendarDays className="w-3.5 h-3.5" />Từng ngày
        </button>
        <button type="button" onClick={() => onFocus({ lens: "shift", wave: w.bucket })} className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--accent)] min-h-[28px]">
          <ListChecks className="w-3.5 h-3.5" />Từng ca
        </button>
      </div>
    </div>
  );
};

export const WaveLens: React.FC<{ r: AccountRunRate; waveFilter: CampDayBucket | null; onFocus: (f: LensFocus) => void }> = ({ r, waveFilter, onFocus }) => (
  <div className="space-y-3">
    <SectionTitle title="Từng đợt campaign" note="Mỗi đợt tính run-rate riêng: thực đạt ÷ target các ca của đợt tới ngày số tới" />
    {r.waves.length === 0 ? (
      <Card><p className="text-sm text-[var(--text-muted)]">Kế hoạch tháng này chưa có ca nào có target.</p></Card>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {r.waves.map((w) => <WaveCard key={w.bucket} w={w} onFocus={onFocus} active={waveFilter === w.bucket} />)}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Ngày
// ---------------------------------------------------------------------------

export const WaveFilterChip: React.FC<{ bucket: CampDayBucket | null; onClear: () => void }> = ({ bucket, onClear }) =>
  bucket ? (
    <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 text-xs font-bold pl-2.5 pr-2 py-1 rounded-full border border-[var(--accent)] text-[var(--accent-text)] bg-[var(--accent)]/10 min-h-[28px]" title="Bỏ lọc đợt">
      <i className="w-2 h-2 rounded-full inline-block" style={{ background: BUCKET_COLOR[bucket] }} />
      Đợt {WAVE_NAME[bucket]}
      <span aria-hidden="true" className="text-sm leading-none">×</span>
    </button>
  ) : null;

export const DayLens: React.FC<{ r: AccountRunRate; color: string; waveFilter: CampDayBucket | null; pickDay: string | null; onFocus: (f: LensFocus) => void; onClearWave: () => void }> = ({ r, color, waveFilter, pickDay, onFocus, onClearWave }) => {
  const rows = r.days.filter((d) => !waveFilter || d.bucket === waveFilter);
  const dim = (d: RRDay) => !!waveFilter && d.bucket !== waveFilter;
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Đạt từng ngày so với target của ngày" />
          <WaveFilterChip bucket={waveFilter} onClear={onClearWave} />
        </div>
        <div className="mt-3">
          <DayBars r={r} color={color} pickDay={pickDay} dim={waveFilter ? dim : undefined} onPick={(date) => onFocus({ lens: "shift", day: date, wave: waveFilter })} />
          <DayBarsLegend />
        </div>
      </Card>
      <Card className="!p-0 overflow-hidden">
        <div className="hidden lg:grid grid-cols-[120px_64px_1fr_1fr_minmax(150px,1.3fr)_20px] gap-x-4 px-5 py-2.5 text-[11px] font-bold text-[var(--text-faint)] border-b border-[var(--border)]">
          <span>Ngày</span><span>Ca</span><span className="text-right">Target</span><span className="text-right">Đạt</span><span>% target ngày</span><span />
        </div>
        <div className="divide-y divide-[var(--border-muted)]">
          {rows.map((d) => {
            const tone = toneOfPct(d.pctTarget);
            const muted = d.state === "empty" || d.state === "future";
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onFocus({ lens: "shift", day: d.date, wave: waveFilter })}
                className={`w-full text-left grid grid-cols-[1fr_auto_auto] lg:grid-cols-[120px_64px_1fr_1fr_minmax(150px,1.3fr)_20px] gap-x-4 gap-y-0.5 items-center px-4 sm:px-5 py-2.5 hover:bg-[var(--surface-hover)]/40 transition-colors border-l-[3px] min-h-[44px] ${pickDay === d.date ? "bg-[var(--accent)]/5" : ""}`}
                style={{ borderLeftColor: d.target > 0 && d.counted ? TONE_VAR[tone] : "transparent" }}
              >
                <span className="min-w-0">
                  <span className={`text-sm font-bold ${muted ? "text-[var(--text-faint)]" : "text-[var(--text)]"} ${tabular}`}>{ddmm(d.date)} <span className="font-medium text-[var(--text-faint)]">{WEEKDAY[weekdayIdx(d.date)]}</span></span>
                  <span className="block"><BucketChip bucket={d.bucket} label={WAVE_NAME[d.bucket]} /></span>
                </span>
                <span className={`hidden lg:block text-xs ${tabular} ${d.state === "missing" ? "text-amber-300 font-bold" : "text-[var(--text-faint)]"}`}>{d.shifts > 0 ? `${d.withData}/${d.shifts}` : "—"}</span>
                <span className={`text-right text-sm ${tabular} ${muted ? "text-[var(--text-faint)]" : "text-[var(--text-muted)]"}`}>{d.target > 0 ? money(d.target) : "—"}</span>
                <span className={`text-right text-sm font-bold ${tabular} ${d.state === "partial" ? "text-[var(--text-faint)] italic" : "text-[var(--text)]"}`}>
                  {d.state === "future" || (d.state === "empty" && d.actual <= 0) ? "—" : money(d.actual)}
                  {d.pctTarget != null && <span className="lg:hidden block text-[11px] font-black" style={{ color: TONE_VAR[tone] }}>{pct(d.pctTarget)}</span>}
                </span>
                <span className="hidden lg:flex items-center gap-2 min-w-0">
                  {d.pctTarget != null ? (
                    <>
                      <span className="flex-1 min-w-0"><PctBar value={d.pctTarget} tone={tone} height={6} /></span>
                      <span className={`w-11 text-right text-sm font-black ${tabular}`} style={{ color: TONE_VAR[tone] }}>{pct(d.pctTarget)}</span>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--text-faint)]">{d.state === "partial" || d.state === "missing" ? DAY_STATE_LABEL[d.state] : d.state === "future" ? "chưa tới" : d.state === "empty" ? "không có ca" : d.target <= 0 ? "ngoài kế hoạch" : ""}</span>
                  )}
                </span>
                <ArrowRight className="hidden lg:block w-4 h-4 text-[var(--text-faint)]" />
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ca
// ---------------------------------------------------------------------------

const STATE_PILL: Record<RRShift["state"], string> = {
  done: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
  no_data: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  pending: "bg-[var(--surface-base)] text-[var(--text-faint)] border-[var(--border)] border-dashed",
  cancelled: "bg-rose-500/10 text-rose-400 border-rose-500/25"
};

const ShiftCard: React.FC<{ s: RRShift }> = ({ s }) => {
  const tone = toneOfPct(s.pctTarget);
  const who = [s.hostName, s.assistantName].filter(Boolean).join(" + ");
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 flex flex-col gap-2.5 ${s.state === "cancelled" ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`flex items-center gap-1.5 text-sm font-black text-[var(--text)] ${tabular}`}><Clock3 className="w-3.5 h-3.5 text-[var(--text-faint)]" />{s.startTime}–{s.endTime}</div>
          <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">{who || <span className="text-[var(--text-faint)]">Chưa có người</span>}</div>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${STATE_PILL[s.state]}`}>{SHIFT_STATE_LABEL[s.state]}</span>
      </div>
      {s.state === "done" ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-lg font-black text-[var(--text)] ${tabular}`}>{money(s.actual)}</span>
            <span className={`text-xs text-[var(--text-faint)] ${tabular}`}>/ target {money(s.target)}</span>
          </div>
          {s.pctTarget != null ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0"><PctBar value={s.pctTarget} tone={tone} height={6} /></div>
              <span className={`text-sm font-black w-11 text-right ${tabular}`} style={{ color: TONE_VAR[tone] }}>{pct(s.pctTarget)}</span>
            </div>
          ) : (
            <span className="text-xs text-[var(--text-faint)]">Ca này không có target</span>
          )}
        </>
      ) : s.state === "cancelled" ? (
        <div className="text-xs text-[var(--text-muted)]">Ca đã huỷ — target {money(s.target)} <b className="text-[var(--text)]">vẫn tính</b> vào run-rate.</div>
      ) : (
        <div className={`flex items-baseline justify-between text-xs ${tabular}`}>
          <span className="text-[var(--text-faint)]">{s.state === "no_data" ? "Ca đã chạy, chưa có số" : "Chưa tới giờ"}</span>
          <span className="text-[var(--text-muted)]">target {money(s.target)}</span>
        </div>
      )}
    </div>
  );
};

export const ShiftLens: React.FC<{ r: AccountRunRate; waveFilter: CampDayBucket | null; pickDay: string | null; onFocus: (f: LensFocus) => void; onClearWave: () => void }> = ({ r, waveFilter, pickDay, onFocus, onClearWave }) => {
  const dayList = r.days.filter((d) => (d.shifts > 0 || d.actual > 0) && (!waveFilter || d.bucket === waveFilter));
  const day = (pickDay && dayList.find((d) => d.date === pickDay)?.date) ?? dayList.find((d) => d.date === r.asOf)?.date ?? dayList[dayList.length - 1]?.date ?? null;
  const dayRow = r.days.find((d) => d.date === day) ?? null;
  const shifts = r.shifts.filter((s) => s.date === day);
  const off = r.offPlan.filter((x) => x.session.date === day);
  const tone = toneOfPct(dayRow?.pctTarget ?? null);
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Chọn ngày" note="Chỉ hiện ngày có ca" />
          <WaveFilterChip bucket={waveFilter} onClear={onClearWave} />
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {dayList.length === 0 && <span className="text-sm text-[var(--text-muted)]">Không có ngày nào có ca.</span>}
          {dayList.map((d) => {
            const t = toneOfPct(d.pctTarget);
            const sel = d.date === day;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onFocus({ lens: "shift", day: d.date, wave: waveFilter })}
                aria-pressed={sel}
                className={`shrink-0 min-w-[58px] rounded-xl border px-2.5 py-2 text-center transition-colors min-h-[52px] ${sel ? "border-[var(--accent)] bg-[var(--accent)]/10" : "border-[var(--border)] bg-[var(--surface-base)] hover:border-[var(--text-faint)]"}`}
              >
                <span className="block text-[11px] font-bold text-[var(--text-faint)]">{WEEKDAY[weekdayIdx(d.date)]}</span>
                <span className={`block text-sm font-black text-[var(--text)] ${tabular}`}>{ddmm(d.date)}</span>
                <span className="mx-auto mt-1 block h-1 w-6 rounded-full" style={{ background: d.pctTarget != null ? TONE_VAR[t] : "var(--border)" }} />
              </button>
            );
          })}
        </div>
      </Card>

      {dayRow && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 px-1">
            <div>
              <h3 className="text-base sm:text-lg font-black text-[var(--text)]">Ngày {ddmm(dayRow.date)} · {WEEKDAY[weekdayIdx(dayRow.date)]}</h3>
              <div className="mt-0.5 flex items-center gap-3"><BucketChip bucket={dayRow.bucket} label={WAVE_NAME[dayRow.bucket]} /><span className="text-xs text-[var(--text-faint)]">{dayRow.withData}/{dayRow.shifts} ca có số</span></div>
            </div>
            <div className="text-right">
              <div className={`text-sm text-[var(--text-muted)] ${tabular}`}>Đạt <b className="text-[var(--text)]">{dayRow.state === "future" ? "—" : money(dayRow.actual)}</b> / target <b className="text-[var(--text)]">{money(dayRow.target)}</b></div>
              {dayRow.pctTarget != null && <div className={`text-2xl font-black leading-none mt-0.5 ${tabular}`} style={{ color: TONE_VAR[tone] }}>{pct(dayRow.pctTarget)}</div>}
            </div>
          </div>
          {shifts.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{shifts.map((s) => <ShiftCard key={s.id} s={s} />)}</div>
          ) : (
            <Card><p className="text-sm text-[var(--text-muted)] flex items-center gap-2"><CircleSlash className="w-4 h-4" />Ngày này không có ca trong Kế Hoạch Tháng.</p></Card>
          )}
          {off.length > 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-3.5 space-y-2">
              <div className="text-xs font-bold text-[var(--text-muted)]">Ca ngoài Kế Hoạch Tháng ({off.length}) — có số nhưng target 0, vẫn cộng vào thực đạt</div>
              {off.map((x) => (
                <div key={x.session.id} className={`flex flex-wrap items-baseline justify-between gap-2 text-sm ${tabular}`}>
                  <span className="text-[var(--text)]">{x.session.startTime.slice(0, 5)}–{x.session.endTime.slice(0, 5)} <span className="text-[var(--text-faint)]">· {[x.session.hostName, x.session.assistantName || x.session.coHostName].filter(Boolean).join(" + ") || "chưa có người"}</span></span>
                  <b className="text-[var(--text)]">{fmtVndShort(x.session.actualGmv ?? 0)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
