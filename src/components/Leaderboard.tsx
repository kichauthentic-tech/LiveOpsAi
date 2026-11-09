import React, { useEffect, useMemo, useRef, useState } from "react";
import { Crown, Flame, Trophy } from "lucide-react";
import type { BrandMonthPlan, LiveSession } from "../types";
import { PageHeader } from "./common/PageHeader";
import { MonthPicker, shiftMonthStr } from "./common/MonthPicker";
import { planStatusesRead } from "../lib/db/monthPlans";
import { effectiveCamp, type CampaignDayType } from "../lib/campaignDays";
import { chartColor } from "./dashboard/shared";
import { getTodayDate, getTodayMonth } from "../lib/dateUtils";
import { fmtDateVn, fmtFixed, fmtMonth, fmtNum, fmtVndShort } from "../lib/format";
import { brandPlatformKey, channelTitle } from "../lib/reportPlatform";
import {
  MIN_AWARD_SHIFTS,
  TARGET_TIER_MIN,
  accountsOf,
  assistantBoard,
  campaignTargetBoard,
  hostPerformanceBoard,
  rankMap,
  type AwardAccount,
  type CampaignEvent,
  type ShiftPerson,
  type TargetPayout,
  type TargetScoring,
  type TargetShift
} from "../lib/leaderboard/awards";

// Leader Board (06/11): ba giải user chốt — Ca đạt target (thưởng nóng ngày Campaign), Host hiệu suất, Trợ live xuất sắc — mỗi giải
// xét riêng từng account. Bố cục theo đề xuất Google Stitch user chọn: tab Campaign = thẻ ca + vòng % target (phương án C),
// tab Giải tháng = bục top 3 (phương án A). App chỉ đếm suất (user chốt: tiền công ty tự tính ngoài). Logic: lib/leaderboard/awards.ts.

type View = "campaign" | "month";
const ALL = "__all";
const EVENT_NAME: Record<CampaignDayType, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };
const seg = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-bold min-h-[30px] transition-colors whitespace-nowrap ${on ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`;
const CARD = "bg-[var(--surface)] border border-[var(--border)] rounded-2xl";

/** "+22% so trung vị"; làm tròn về 0 thì không ghi dấu (1,00 hiện "−0%" dễ đọc thành tụt). */
const pctVsMedian = (index: number) => {
  const p = Math.round((index - 1) * 100) || 0; // || 0: Math.round(-0,4) = -0 in ra "-0"
  return `${p > 0 ? "+" : ""}${fmtNum(p, 0)}% so trung vị`;
};

const initials = (name: string) => {
  const w = name.trim().split(/[\s.]+/).filter(Boolean);
  if (w.length === 0) return "?";
  return (w.length === 1 ? w[0].slice(0, 2) : `${w[w.length - 2][0]}${w[w.length - 1][0]}`).toUpperCase();
};

/** Số chạy từ 0 lên khi đổi giá trị (tắt khi người dùng chọn giảm chuyển động). */
function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  const still = typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (still) return;
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      setShown(a + (value - a) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, still]);
  return still ? value : shown;
}

const CountUp: React.FC<{ value: number; fmt: (n: number) => string }> = ({ value, fmt }) => <>{fmt(useCountUp(value))}</>;

const Avatar: React.FC<{ name: string; role?: ShiftPerson["role"]; size?: "sm" | "lg"; gold?: boolean }> = ({ name, role, size = "sm", gold }) => (
  <span
    title={name}
    className={`inline-flex items-center justify-center rounded-full font-black shrink-0 border ${
      size === "lg" ? "w-14 h-14 text-base" : "w-8 h-8 text-2xs"
    } ${
      gold
        ? "border-[var(--accent)] text-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))]"
        : role === "co_host"
          ? "border-sky-400/50 text-sky-300 bg-sky-400/10"
          : "border-[var(--border)] text-[var(--text)] bg-[var(--surface-elevated)]"
    }`}
  >
    {initials(name)}
  </span>
);

/** Vòng % target: đầy ở 100%; Mức 1 vàng, Mức 2 vàng + sáng, đang live xanh, chưa đạt xám. */
const Ring: React.FC<{ ratio: number; tier: 1 | 2 | null; live: boolean; upcoming: boolean }> = ({ ratio, tier, live, upcoming }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const [fill, setFill] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(Math.min(1, ratio)));
    return () => cancelAnimationFrame(id);
  }, [ratio]);
  const color = tier ? "var(--accent)" : live ? "var(--success)" : "var(--text-faint)";
  const pct = useCountUp(Math.round(ratio * 100));
  return (
    <div className={`relative w-[84px] h-[84px] shrink-0 ${tier === 2 ? "lb-glow" : ""}`}>
      <svg viewBox="0 0 84 84" className="w-full h-full -rotate-90" aria-hidden="true">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        {!upcoming && (
          <circle
            cx="42"
            cy="42"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fill)}
            style={{ transition: "stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)" }}
          />
        )}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        {upcoming ? (
          <span className="text-2xs text-[var(--text-faint)]">chưa live</span>
        ) : (
          <span className={`text-lg font-black tabular-nums ${tier ? "text-[var(--accent)]" : "text-[var(--text)]"}`}>{Math.round(pct)}%</span>
        )}
      </span>
    </div>
  );
};

const statusPill = (sh: TargetShift) => {
  if (sh.upcoming) return <span className="text-2xs font-bold px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-muted)]">Sắp live</span>;
  if (sh.live)
    return (
      <span className="inline-flex items-center gap-1.5 text-2xs font-bold px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300">
        <span className="relative flex w-2 h-2">
          <span className="absolute inline-flex w-full h-full rounded-full bg-rose-400 opacity-75 animate-ping motion-reduce:animate-none" />
          <span className="relative inline-flex w-2 h-2 rounded-full bg-rose-500" />
        </span>
        Đang live
      </span>
    );
  if (sh.tier)
    return (
      <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] text-[var(--accent)]">
        Mức {sh.tier}
      </span>
    );
  return <span className="text-2xs font-bold px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--text-faint)]">Chưa đạt</span>;
};

const ShiftCard: React.FC<{ sh: TargetShift; showAccount: boolean }> = ({ sh, showAccount }) => {
  const s = sh.session;
  const need1 = sh.target * TARGET_TIER_MIN[1] - (s.actualGmv || 0);
  const need2 = sh.target * TARGET_TIER_MIN[2] - (s.actualGmv || 0);
  const split = sh.people.filter((p) => p.share < 0.999);
  return (
    <article
      className={`${CARD} p-4 flex flex-col gap-3 min-w-0 transition-shadow ${sh.tier ? "border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] lb-tier" : ""}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {showAccount && (
            <p className="text-xs font-bold text-[var(--text)] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: chartColor(s.brandName) }} />
              {channelTitle(s.brandName, s.platform, true)}
            </p>
          )}
          <p className="text-2xs text-[var(--text-muted)] tabular-nums">
            {fmtDateVn(s.date, false)} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
          </p>
        </div>
        {statusPill(sh)}
      </header>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xs text-[var(--text-muted)]">{sh.upcoming ? "Target ca" : "GMV / target ca"}</p>
          <p className="text-xl font-black tabular-nums text-[var(--text)] leading-tight">
            {sh.upcoming ? (sh.target > 0 ? fmtVndShort(sh.target) : "—") : <CountUp value={s.actualGmv || 0} fmt={fmtVndShort} />}
            {!sh.upcoming && <span className="text-xs font-bold text-[var(--text-faint)]"> / {fmtVndShort(sh.target)}</span>}
          </p>
          {sh.live && need1 > 0 && <p className="text-2xs text-[var(--text-muted)] mt-1">Cần thêm <b className="text-[var(--text)]">{fmtVndShort(need1)}</b> để đạt Mức 1</p>}
          {sh.live && need1 <= 0 && need2 > 0 && <p className="text-2xs text-[var(--text-muted)] mt-1">Cần thêm <b className="text-[var(--text)]">{fmtVndShort(need2)}</b> để đạt Mức 2</p>}
        </div>
        <Ring ratio={sh.ratio} tier={sh.tier} live={sh.live} upcoming={sh.upcoming} />
      </div>
      <footer className="flex items-center gap-2 pt-3 border-t border-[var(--border-muted)] min-w-0">
        <div className="flex -space-x-2 shrink-0">
          {sh.people.map((p) => (
            <Avatar key={`${p.role}${p.talentId}`} name={p.name} role={p.role} />
          ))}
        </div>
        <p className="text-xs text-[var(--text)] min-w-0 truncate">
          {sh.people.length === 0 ? <span className="text-[var(--text-faint)]">Chưa xếp người</span> : sh.people.map((p) => p.name).join(" + ")}
        </p>
      </footer>
      {split.length > 0 && (
        <p className="text-2xs text-[var(--text-faint)] -mt-1">Đổi người giữa ca: {split.map((p) => `${p.name} ${Math.round(p.minutes)}p`).join(" · ")}</p>
      )}
    </article>
  );
};

function eventState(ev: Pick<CampaignEvent, "from" | "to">, today: string): "now" | "done" | "soon" {
  return today < ev.from ? "soon" : today > ev.to ? "done" : "now";
}

/** Gộp đợt cùng loại của nhiều account (chế độ "Tất cả account"). */
function mergeEvents(list: CampaignEvent[][]): CampaignEvent[] {
  const by = new Map<CampaignDayType, CampaignEvent>();
  for (const evs of list)
    for (const e of evs) {
      const o = by.get(e.type);
      if (!o) {
        by.set(e.type, { ...e, shifts: [...e.shifts] });
        continue;
      }
      o.from = e.from < o.from ? e.from : o.from;
      o.to = e.to > o.to ? e.to : o.to;
      o.shifts.push(...e.shifts);
      o.withTarget += e.withTarget;
      o.hit += e.hit;
      o.tier2 += e.tier2;
      o.noTarget += e.noTarget;
      o.upcoming += e.upcoming;
      o.actual += e.actual;
      o.targetDone += e.targetDone;
      o.final = o.final && e.final;
      // Gộp nhiều account: % đợt là tổng chung, MỨC xét riêng từng account (suất đã tính ở từng account) ⇒ không hiện mức chung.
      o.ratio = o.targetDone > 0 ? o.actual / o.targetDone : null;
      o.tier = null;
    }
  const order = (x: TargetShift) => (x.live ? 0 : x.upcoming ? 2 : 1);
  return [...by.values()]
    .sort((a, b) => a.from.localeCompare(b.from))
    .map((e) => ({ ...e, shifts: e.shifts.sort((a, b) => order(a) - order(b) || (a.upcoming ? `${a.session.date}${a.session.startTime}`.localeCompare(`${b.session.date}${b.session.startTime}`) : b.ratio - a.ratio)) }));
}

function mergePayouts(list: TargetPayout[][]): TargetPayout[] {
  const by = new Map<string, TargetPayout>();
  for (const ps of list)
    for (const p of ps) {
      const k = `${p.role}|${p.talentId}`;
      const o = by.get(k);
      if (o) {
        o.tier1 += p.tier1;
        o.tier2 += p.tier2;
        o.units += p.units;
      } else by.set(k, { ...p });
    }
  return [...by.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "vi"));
}

const CampaignView: React.FC<{ events: CampaignEvent[]; payouts: TargetPayout[]; showAccount: boolean; today: string; scoring: TargetScoring; onScoring: (s: TargetScoring) => void }> = ({ events, payouts, showAccount, today, scoring, onScoring }) => {
  const defaultPick = useMemo(() => {
    const now = events.find((e) => eventState(e, today) === "now") ?? events.find((e) => eventState(e, today) === "soon") ?? events[events.length - 1];
    return now?.type ?? null;
  }, [events, today]);
  // Chưa bấm đợt nào ⇒ đợt đang diễn ra / sắp tới. Đổi account hay tháng thì App đổi `key` nên lựa chọn tự về mặc định.
  const [picked, setPick] = useState<CampaignDayType | null>(null);
  const pick = picked && events.some((e) => e.type === picked) ? picked : defaultPick;
  const ev = events.find((e) => e.type === pick) ?? null;
  const [listOpen, setListOpen] = useState<CampaignDayType | null>(null);

  if (events.length === 0)
    return <p className={`${CARD} p-5 text-xs text-[var(--text-muted)]`}>Tháng này chưa có ca Campaign nào trong lịch.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[var(--text-faint)]">Chấm giải:</span>
        <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1" role="group" aria-label="Cách chấm giải Ca đạt target">
          {(
            [
              ["event", "Cả đợt"],
              ["shift", "Từng ca"]
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={scoring === k} onClick={() => onScoring(k)} className={`${seg(scoring === k)} px-3 min-h-[28px]`}>
              {l}
            </button>
          ))}
        </div>
        <span className="text-2xs text-[var(--text-faint)]">
          {scoring === "event" ? "Cả đợt đạt ≥ 100% target ⇒ mọi ca có target của đợt Mức 1, ≥ 120% ⇒ Mức 2. Một ca chỉ ~20 đơn nên ca lẻ đạt/hụt phần lớn là may rủi." : "Từng ca tự đạt ≥ 100% / ≥ 120% target ca."}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {events.map((e) => {
          const st = eventState(e, today);
          const on = e.type === pick;
          return (
            <button
              key={e.type}
              type="button"
              onClick={() => setPick(e.type)}
              aria-pressed={on}
              className={`${CARD} p-4 text-left transition-colors ${on ? "seg-on" : "hover:border-[var(--text-faint)]"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-black text-[var(--text)] flex items-center gap-1.5">
                  {st === "now" && <Flame className="w-4 h-4 text-rose-400" />}
                  {EVENT_NAME[e.type]}
                </p>
                <span className={`text-2xs font-bold ${st === "now" ? "text-rose-300" : st === "done" ? "text-[var(--text-muted)]" : "text-sky-300"}`}>
                  {st === "now" ? "Đang diễn ra" : st === "done" ? "Đã xong" : "Sắp tới"}
                </span>
              </div>
              <p className="text-2xs text-[var(--text-faint)] tabular-nums">
                {fmtDateVn(e.from, false)}
                {e.to !== e.from ? ` – ${fmtDateVn(e.to, false)}` : ""}
              </p>
              {scoring === "event" ? (
                <p className="mt-2 text-2xl font-black tabular-nums leading-none">
                  <span className={e.ratio === null ? "text-[var(--text-faint)]" : e.ratio >= 1.2 ? "text-[var(--accent)]" : e.ratio >= 1 ? "text-emerald-400" : "text-[var(--text)]"}>{e.ratio === null ? "—" : `${Math.round(e.ratio * 100)}%`}</span>
                  <span className="text-sm font-bold text-[var(--text-faint)]"> target cả đợt</span>
                </p>
              ) : (
                <p className="mt-2 text-2xl font-black tabular-nums text-[var(--text)] leading-none">
                  {e.hit}
                  <span className="text-sm font-bold text-[var(--text-faint)]"> / {e.withTarget} ca đạt</span>
                </p>
              )}
              <p className="text-2xs text-[var(--text-muted)] mt-1">
                {scoring === "event" ? (
                  <>{e.tier ? <b className="text-[var(--accent)]">Mức {e.tier}</b> : e.final ? "chưa đạt" : "chưa xong đợt"} · {e.hit}/{e.withTarget} ca tự đạt</>
                ) : (
                  <>Mức 2: <b className="text-[var(--accent)]">{e.tier2}</b></>
                )}
                {e.upcoming > 0 && <> · {e.upcoming} ca sắp live</>}
                {e.noTarget > 0 && <> · {e.noTarget} ca không có target</>}
              </p>
            </button>
          );
        })}
      </div>

      {/* Cửa sổ gọn 09/11: ca CHƯA live (sắp tới, chưa có số) gập thành một dòng — đo 09/11: D-Day đang diễn ra có 70/72 thẻ "sắp
          live" không một số nào, trang dài 6,8 màn. Ca đang live / đã xong vẫn hiện thẻ vì thẻ có số; bấm "Xem danh sách" mở phần còn lại. */}
      {ev &&
        (() => {
          const upcoming = ev.shifts.filter((sh) => sh.upcoming);
          const shown = listOpen === ev.type ? ev.shifts : ev.shifts.filter((sh) => !sh.upcoming);
          return (
            <>
              {shown.length > 0 && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`Ca ${EVENT_NAME[ev.type]}`}>
                  {shown.map((sh) => (
                    <ShiftCard key={sh.session.id} sh={sh} showAccount={showAccount} />
                  ))}
                </section>
              )}
              {upcoming.length > 0 && (
                <div className={`${CARD} p-4 flex flex-wrap items-center justify-between gap-2`}>
                  <p className="text-xs text-[var(--text-muted)]">
                    <b className="text-[var(--text)]">{upcoming.length} ca sắp live</b> · chưa có số
                  </p>
                  <button
                    type="button"
                    aria-expanded={listOpen === ev.type}
                    onClick={() => setListOpen(listOpen === ev.type ? null : ev.type)}
                    className="min-h-9 px-3 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-elevated)]"
                  >
                    {listOpen === ev.type ? "Ẩn ca sắp live" : "Xem danh sách"}
                  </button>
                </div>
              )}
            </>
          );
        })()}

      <section className={`${CARD} p-4 sm:p-5`}>
        <h3 className="text-xs font-bold text-[var(--text)]">Suất thưởng Ca đạt target trong tháng</h3>
        <p className="text-2xs text-[var(--text-faint)] mt-0.5">Mức 1 = 1 suất, Mức 2 = 2 suất, nhân phần phút người đó có mặt trong ca. {scoring === "event" ? "Chỉ tính đợt đã xong hết ca." : "Chỉ tính ca đã xong."}</p>
        {payouts.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] mt-3">{scoring === "event" ? "Chưa có đợt Campaign nào xong mà đạt target." : "Chưa có ca Campaign nào đạt target."}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs text-[var(--text-faint)]">
                  <th className="font-semibold pb-2 pr-3">Người</th>
                  <th className="font-semibold pb-2 pr-3">Vai</th>
                  <th className="font-semibold pb-2 pr-3 text-right">Ca Mức 1</th>
                  <th className="font-semibold pb-2 pr-3 text-right">Ca Mức 2</th>
                  <th className="font-semibold pb-2 text-right">Suất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-muted)]">
                {payouts.map((p) => (
                  <tr key={`${p.role}${p.talentId}`}>
                    <td className="py-2 pr-3 font-bold text-[var(--text)] whitespace-nowrap">{p.name}</td>
                    <td className="py-2 pr-3 text-[var(--text-muted)]">{p.role === "host" ? "Host" : "Trợ live"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{p.tier1}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[var(--accent)]">{p.tier2}</td>
                    <td className="py-2 text-right tabular-nums font-black text-[var(--text)]">{fmtFixed(p.units, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

interface PodiumRow {
  talentId: string;
  name: string;
  rank: number | null;
  shifts: number;
  eligible: boolean;
  /** Số chính trên bục / thanh. */
  score: number;
  /** Dòng phụ dưới số. */
  sub: string;
  badge?: string;
}

/** `prevRanked` = tháng trước có bảng xếp hạng (T9 trở về trước chưa có target ca ⇒ giải trợ live không có hạng — đừng ghi "mới" cho cả bảng). */
const RankDelta: React.FC<{ now: number | null; prev: number | undefined; prevRanked: boolean }> = ({ now, prev, prevRanked }) => {
  if (!now || !prevRanked) return null;
  if (prev === undefined) return <span className="text-2xs font-bold text-sky-300">mới</span>;
  if (prev === now) return <span className="text-2xs text-[var(--text-faint)]">=</span>;
  return prev > now ? (
    <span className="text-2xs font-bold text-[var(--success)]">▲{prev - now}</span>
  ) : (
    <span className="text-2xs font-bold text-[var(--danger)]">▼{now - prev}</span>
  );
};

const CONFETTI = Array.from({ length: 16 }, (_, i) => i);

const Podium: React.FC<{
  title: string;
  method: string;
  rows: PodiumRow[];
  prev: Map<string, number>;
  fmtScore: (n: number) => string;
  barMax: number;
  closed: boolean;
}> = ({ title, method, rows, prev, fmtScore, barMax, closed }) => {
  const ranked = rows.filter((r) => r.rank);
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const waiting = rows.filter((r) => !r.eligible);
  const order = [top[1], top[0], top[2]];
  return (
    <section className={`${CARD} p-4 sm:p-5 flex flex-col gap-4 min-w-0`}>
      <header>
        <h3 className="text-sm font-black text-[var(--text)] flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-[var(--accent)]" /> {title}
        </h3>
        <p className="text-2xs text-[var(--text-faint)] mt-0.5">{method}</p>
      </header>
      {top.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Chưa ai đủ {MIN_AWARD_SHIFTS} ca trong tháng.</p>
      ) : (
        <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
          {order.map((r, i) => {
            if (!r) return <div key={`empty${i}`} />;
            const first = r.rank === 1;
            return (
              <div key={r.talentId} className="flex flex-col items-center text-center min-w-0">
                <div className="relative">
                  {first && <Crown className="w-5 h-5 text-[var(--accent)] absolute -top-5 left-1/2 -translate-x-1/2" />}
                  <Avatar name={r.name} size="lg" gold={first} />
                </div>
                <p className="mt-1.5 text-xs font-bold text-[var(--text)] truncate max-w-full">{r.name}</p>
                <p className="text-2xs text-[var(--text-faint)]">{r.shifts} ca</p>
                <div
                  className={`relative overflow-hidden mt-2 w-full rounded-t-xl border border-b-0 px-2 pt-3 pb-3 flex flex-col items-center gap-1 ${
                    first
                      ? "h-36 border-[color-mix(in_srgb,var(--accent)_50%,var(--border))] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--accent)_16%,var(--surface)),var(--surface))] lb-shimmer"
                      : r.rank === 2
                        ? "h-28 border-[var(--border)] bg-[var(--surface-elevated)]"
                        : "h-24 border-[var(--border)] bg-[var(--surface-elevated)]"
                  }`}
                >
                  {first && closed && (
                    <span className="lb-confetti" aria-hidden="true">
                      {CONFETTI.map((k) => (
                        <i key={k} style={{ left: `${(k * 37) % 100}%`, animationDelay: `${(k % 8) * 90}ms` }} />
                      ))}
                    </span>
                  )}
                  <span className="text-2xs font-bold text-[var(--text-muted)]">Hạng {r.rank}</span>
                  <span className={`font-black tabular-nums leading-none ${first ? "text-2xl text-[var(--accent)]" : "text-xl text-[var(--text)]"}`}>
                    <CountUp value={r.score} fmt={fmtScore} />
                  </span>
                  <span className="text-2xs text-[var(--text-muted)]">{r.sub}</span>
                  <span className="flex items-center gap-1.5">
                    {r.badge && <span className="text-2xs font-bold text-[var(--success)]">{r.badge}</span>}
                    <RankDelta now={r.rank} prev={prev.get(r.talentId)} prevRanked={prev.size > 0} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {rest.length > 0 && (
        <ol className="divide-y divide-[var(--border-muted)]">
          {rest.map((r) => (
            <li key={r.talentId} className="flex items-center gap-3 py-2">
              <span className="w-5 text-xs font-bold text-[var(--text-faint)] tabular-nums">{r.rank}</span>
              <Avatar name={r.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-[var(--text)] truncate">{r.name}</span>
                <span className="block text-2xs text-[var(--text-faint)]">
                  {r.shifts} ca · {r.sub}
                </span>
              </span>
              <span className="hidden sm:block w-24 h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden">
                <span className="block h-full rounded-full bg-[var(--text-muted)]" style={{ width: `${Math.min(100, (r.score / barMax) * 100)}%` }} />
              </span>
              <span className="w-12 text-right text-sm font-black tabular-nums text-[var(--text)]">{fmtScore(r.score)}</span>
              <span className="w-6 text-right">
                <RankDelta now={r.rank} prev={prev.get(r.talentId)} prevRanked={prev.size > 0} />
              </span>
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && (
        <details className="text-2xs text-[var(--text-muted)]">
          <summary className="cursor-pointer min-h-[24px] flex items-center">Chưa đủ {MIN_AWARD_SHIFTS} ca ({waiting.length} người)</summary>
          <ul className="mt-1.5 space-y-1">
            {waiting.map((r) => (
              <li key={r.talentId}>
                {r.name} — {r.shifts} ca, còn {MIN_AWARD_SHIFTS - r.shifts} ca
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
};

export const Leaderboard: React.FC<{ sessions: LiveSession[] }> = ({ sessions }) => {
  const today = getTodayDate();
  const thisMonth = getTodayMonth();
  const [month, setMonth] = useState(thisMonth);
  const [view, setView] = useState<View>("campaign");
  const [scoring, setScoring] = useState<TargetScoring>("event");
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  useEffect(() => {
    let alive = true;
    planStatusesRead
      .take(month)
      .then((m) => alive && setPlans(m))
      .catch(() => alive && setPlans(new Map()));
    return () => {
      alive = false;
    };
  }, [month]);

  const accounts = useMemo(() => accountsOf(sessions, month), [sessions, month]);
  const [pick, setPick] = useState<string>(ALL);
  const account: AwardAccount | null = accounts.find((a) => a.key === pick) ?? null;
  // Giải tháng luôn theo MỘT account — "Tất cả" chỉ có ở tab Campaign.
  const monthAccount = account ?? accounts[0] ?? null;
  const multi = useMemo(() => {
    const n = new Map<string, number>();
    for (const a of accounts) n.set(a.brandId, (n.get(a.brandId) ?? 0) + 1);
    return n;
  }, [accounts]);

  const campaign = useMemo(() => {
    const list = account ? [account] : accounts;
    const boards = list.map((a) => campaignTargetBoard(sessions, a, month, effectiveCamp(plans.get(brandPlatformKey(a.brandId, a.platform))?.campRanges), scoring));
    return { events: mergeEvents(boards.map((b) => b.events)), payouts: mergePayouts(boards.map((b) => b.payouts)) };
  }, [sessions, month, plans, account, accounts, scoring]);

  const monthly = useMemo(() => {
    if (!monthAccount) return null;
    const prevMonth = shiftMonthStr(month, -1);
    const campOf = (m: string) => (m === month ? effectiveCamp(plans.get(brandPlatformKey(monthAccount.brandId, monthAccount.platform))?.campRanges) : undefined);
    const hosts = hostPerformanceBoard(sessions, monthAccount, month, campOf(month));
    const assist = assistantBoard(sessions, monthAccount, month);
    return {
      hosts,
      // Tháng trước dùng lịch Campaign cố định (khung riêng chỉ nạp cho tháng đang xem) — chỉ để tính ▲▼.
      hostPrev: rankMap(hostPerformanceBoard(sessions, monthAccount, prevMonth, campOf(prevMonth))),
      assist,
      assistPrev: rankMap(assistantBoard(sessions, monthAccount, prevMonth).rows)
    };
  }, [sessions, month, monthAccount, plans]);

  const chip = (key: string, label: string, color?: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setPick(key)}
      aria-pressed={pick === key || (view === "month" && key === monthAccount?.key && pick === ALL)}
      className={`${seg(pick === key || (view === "month" && key === monthAccount?.key && pick === ALL))} border border-[var(--border)] flex items-center gap-1.5`}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Trophy}
        title="Leader Board"
        description={
          <>
            Ba giải, mỗi giải xét riêng từng account (brand × sàn). <b>Ca đạt target</b>: ca ngày Campaign đạt ≥ 100% target ca là Mức 1, ≥ 120% là
            Mức 2, suất chia theo phút từng người có mặt. <b>Host hiệu suất</b>: GMV/giờ so với trung vị cùng account, cùng khung giờ trong tháng; ca Campaign
            quy về mức Daily để người được xếp nhiều ngày sale không tự lên hạng; người ít ca được kéo về 1,00. <b>Trợ live xuất sắc</b>: tỷ lệ ca có mặt đạt target ca (mọi ngày trong tháng). Hai giải tháng cần ≥ {MIN_AWARD_SHIFTS}{" "}
            ca. Không xếp theo GMV tổng: đo T6–T10, người GMV cao nhất trùng người được xếp nhiều giờ nhất ở 18/23 account-tháng.
          </>
        }
        tabs={
          <div className="flex gap-1 rounded-xl border border-[var(--border)] p-1" role="tablist" aria-label="Phần của Leader Board">
            {(
              [
                ["campaign", "Campaign"],
                ["month", "Giải tháng"]
              ] as const
            ).map(([v, l]) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`${seg(view === v)} !text-sm px-3.5 min-h-[32px]`}>
                {l}
              </button>
            ))}
          </div>
        }
        actions={<MonthPicker value={month} onChange={setMonth} max={thisMonth} ariaLabel="Tháng xét giải" />}
      >
        {accounts.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Account">
            {view === "campaign" && chip(ALL, "Tất cả account")}
            {accounts.map((a) => chip(a.key, channelTitle(a.brandName, a.platform, (multi.get(a.brandId) ?? 0) > 1), chartColor(a.brandName)))}
          </div>
        )}
      </PageHeader>

      {accounts.length === 0 ? (
        <p className={`${CARD} p-5 text-xs text-[var(--text-muted)]`}>Tháng {fmtMonth(month)} chưa có ca nào.</p>
      ) : view === "campaign" ? (
        <CampaignView key={`${month}${pick}`} events={campaign.events} payouts={campaign.payouts} showAccount={!account} today={today} scoring={scoring} onScoring={setScoring} />
      ) : (
        monthly && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Podium
              title="Host hiệu suất"
              method="GMV/giờ so với trung vị cùng khung giờ của account trong tháng, ca Campaign quy về mức Daily (1,00 = bằng trung vị)"
              rows={monthly.hosts.map((r) => ({
                talentId: r.talentId,
                name: r.name,
                rank: r.rank,
                shifts: r.shifts,
                eligible: r.eligible,
                score: r.index,
                sub: pctVsMedian(r.index),
                badge: r.clearlyAbove ? "vượt rõ" : undefined
              }))}
              prev={monthly.hostPrev}
              fmtScore={(n) => fmtFixed(n, 2)}
              barMax={Math.max(1.5, ...monthly.hosts.map((r) => r.index))}
              closed={month < thisMonth}
            />
            <Podium
              title="Trợ live xuất sắc"
              method={`Tỷ lệ ca có mặt đạt target ca · cả account: ${fmtNum(monthly.assist.accountRate * 100, 0)}% của ${monthly.assist.shiftsWithTarget} ca có target`}
              rows={monthly.assist.rows.map((r) => ({
                talentId: r.talentId,
                name: r.name,
                rank: r.rank,
                shifts: r.shifts,
                eligible: r.eligible,
                score: r.index * 100,
                sub: `đạt ${r.hits}/${r.shifts} ca`
              }))}
              prev={monthly.assistPrev}
              fmtScore={(n) => `${fmtNum(n, 0)}%`}
              barMax={100}
              closed={month < thisMonth}
            />
          </div>
        )
      )}
    </div>
  );
};
