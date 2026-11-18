import React, { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import type { Brand, LiveSession, Talent, TalentRateHistoryEntry } from "../types";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { BUCKET_LABEL, LANE_LABEL, backtestMonth, hiShare, measureMonth, mixTotal, suggestLanes, type BacktestResult, type Bucket, type PlanScore } from "../lib/roster/lanes";
import { buildHostPerformancePrevMonth, type HostLane } from "../lib/roster/monthPlanner";
import { addDays } from "../lib/dateUtils";
import { todayVn } from "../lib/performance/brandCommitment";
import { talentShortName } from "../lib/talentName";
import { fmtFixed } from "../lib/format";
import { InfoDot } from "./common/InfoDot";

// AI Training Center — "Cơ cấu giờ & làn host". Chỉ đọc: đo cơ cấu giờ Campaign / cao điểm / thường của một tháng đã qua, host thật sự làm ở cơ cấu nào,
// làn gợi ý, và nút "Thử xếp lại" (bộ xếp cũ vs bộ xếp có làn, không ghi gì). Phép đo ở lib/roster/lanes.ts.

interface Props {
  sessions: readonly LiveSession[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  brands: readonly Brand[];
  params: EngineParams;
}

const lastMonths = (today: string, n: number) => {
  const out: string[] = [];
  let d = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < n; i++) {
    out.push(d.slice(0, 7));
    d = addDays(d, -1).slice(0, 7) + "-01";
  }
  return out;
};
const BUCKETS: Bucket[] = ["camp", "peak", "regular"];
const TONE: Record<Bucket, string> = { camp: "var(--accent)", peak: "color-mix(in srgb, var(--accent) 50%, transparent)", regular: "var(--border)" };
const pc = (v: number | null) => (v === null ? "—" : `${fmtFixed(v, 0)}%`);
const idx = (v: number | null) => (v === null ? "—" : fmtFixed(v, 2));

const MixBar: React.FC<{ mix: Record<Bucket, number> }> = ({ mix }) => {
  const total = mixTotal(mix);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-base)]" role="img" aria-label={BUCKETS.map((b) => `${BUCKET_LABEL[b]} ${fmtFixed(total > 0 ? (mix[b] / total) * 100 : 0, 0)}%`).join(", ")}>
      {BUCKETS.map((b) => (
        <span key={b} style={{ width: `${total > 0 ? (mix[b] / total) * 100 : 0}%`, background: TONE[b] }} />
      ))}
    </div>
  );
};

const ROWS: { label: string; get: (s: PlanScore) => string }[] = [
  { label: "Ca có host", get: (s) => pc(s.fillPct) },
  { label: "PFM host ca Campaign + cao điểm", get: (s) => idx(s.perfHi) },
  { label: "PFM host ca thường", get: (s) => idx(s.perfRegular) },
  { label: "Cast ≤ trần · Daily TikTok", get: (s) => pc(s.castTiktokRegular) },
  { label: "Cast ≤ trần · Shopee", get: (s) => pc(s.castShopee) },
  { label: "Giờ khớp làn của host", get: (s) => pc(s.laneFitPct) },
  { label: "Chi phí host (K)", get: (s) => fmtFixed(s.hostCostK, 0) },
  { label: "Số host có ca", get: (s) => String(s.hostsUsed) },
  { label: "Giờ nhiều nhất một host", get: (s) => `${fmtFixed(s.maxHours, 0)}h` }
];

export const LaneMixCard: React.FC<Props> = ({ sessions, talents, history, brands, params }) => {
  const today = todayVn();
  const months = useMemo(() => lastMonths(today, 4), [today]);
  const [month, setMonth] = useState(months[1] ?? months[0]);
  const [weight, setWeight] = useState(0.3);
  const [result, setResult] = useState<BacktestResult | null | undefined>(undefined);
  const brandNames = useMemo(() => new Map(brands.map((b) => [b.id, b.name])), [brands]);
  const nameOf = (id: string) => talentShortName(talents.find((t) => t.id === id), id);

  const mix = useMemo(() => measureMonth(sessions, month, params), [sessions, month, params]);
  const rows = useMemo(() => {
    const ids = [...mix.byHost.keys()];
    const perf = buildHostPerformancePrevMonth(sessions, month, `${month}-01`);
    const lane = new Map(suggestLanes(ids, talents, history, perf, `${month}-01`, params).map((l) => [l.talentId, l]));
    return ids
      .map((id) => ({ id, mix: mix.byHost.get(id)!, lane: lane.get(id)!, pfm: perf.get(id)?.index ?? null }))
      .sort((a, b) => mixTotal(b.mix) - mixTotal(a.mix));
  }, [mix, sessions, month, talents, history, params]);

  const run = () => setResult(backtestMonth({ sessions, talents, history, brandNames, month, params, laneWeight: weight }));
  const changeMonth = (m: string) => {
    setMonth(m);
    setResult(undefined);
  };
  const demandHi = hiShare(mix.total);

  return (
    <div className="space-y-3 border-t border-[var(--border)] pt-6" data-testid="lane-mix">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 data-section="Cơ cấu giờ & làn host" className="text-lg font-black text-[var(--text)] flex items-center gap-2">
          <Layers className="w-5 h-5 text-[var(--accent-text)]" /> Cơ cấu giờ &amp; làn host
          <InfoDot label="Cách đo">Giờ tính theo giờ ca đã diễn ra. Campaign = D-Day, Mid-Month, Pay Day. Cao điểm = khung giờ có GMV/giờ cao so với trung vị cùng kênh (tính từ dữ liệu trước tháng đó). Làn gợi ý từ rate và PFM tháng trước; chưa ảnh hưởng lịch cho tới khi bật điểm thưởng làn ở nhóm Tự fill lịch live.</InfoDot>
        </h2>
        <select value={month} onChange={(e) => changeMonth(e.target.value)} aria-label="Tháng đo" className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-2 py-1 text-xs font-bold text-[var(--text)]">
          {months.map((m) => (
            <option key={m} value={m}>
              {m.slice(5)}/{m.slice(0, 4)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2 text-xs">
          <div className="flex justify-between gap-2">
            <span className="font-bold text-[var(--text)]">Giờ cần xếp trong tháng</span>
            <span className="tabular-nums text-[var(--text-muted)]">
              {fmtFixed(mixTotal(mix.total), 0)}h · cao điểm + camp {fmtFixed(demandHi * 100, 0)}%
            </span>
          </div>
          <MixBar mix={mix.total} />
          <div className="flex gap-3 text-2xs text-[var(--text-muted)]">
            {BUCKETS.map((b) => (
              <span key={b} className="tabular-nums">
                <i className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: TONE[b] }} />
                {BUCKET_LABEL[b]} {fmtFixed(mix.total[b], 0)}h
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-3">
            <button type="button" onClick={run} className="min-h-7 rounded-md bg-[var(--accent)] px-3 font-bold text-white">
              Thử xếp lại
            </button>
            <label className="flex items-center gap-1 text-[var(--text-muted)]">
              điểm thưởng làn
              <input type="number" min={0.05} max={1} step={0.05} value={weight} onChange={(e) => setWeight(Number(e.target.value) || 0.3)} aria-label="Điểm thưởng làn khi thử" className="w-14 rounded-md border border-[var(--border)] bg-[var(--surface-base)] px-1.5 py-0.5 tabular-nums" />
            </label>
            <InfoDot label="Thử xếp lại">Dựng lại mọi ca thật của tháng thành ca mở, cho mọi host đã làm trong tháng đều đăng ký, rồi xếp bằng bộ xếp cũ và bộ xếp có làn. Là cận trên vì bỏ qua lịch rảnh thật. Không ghi gì vào app.</InfoDot>
          </div>

          {result === null && <p className="text-[var(--text-faint)]">Tháng này chưa có ca để thử.</p>}
          {result && (
            <div className="overflow-x-auto pt-1">
              <p className="pb-1 text-2xs text-[var(--text-muted)]">
                {result.shifts} ca · {result.poolHosts} host + {result.poolAssistants} trợ trong nhóm · cao điểm + camp {fmtFixed(result.demandHiPct, 0)}%
              </p>
              <table className="w-full tabular-nums">
                <thead>
                  <tr className="text-left text-[var(--text-muted)]">
                    <th className="py-1 font-bold" />
                    <th className="px-2 text-right font-bold">Thật</th>
                    <th className="px-2 text-right font-bold">Xếp cũ</th>
                    <th className="px-2 text-right font-bold">Có làn</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((r) => (
                    <tr key={r.label} className="border-t border-[var(--border)]">
                      <td className="py-1 text-[var(--text)]">{r.label}</td>
                      <td className="px-2 text-right">{r.get(result.actual)}</td>
                      <td className="px-2 text-right">{r.get(result.baseline)}</td>
                      <td className="px-2 text-right font-bold text-[var(--text)]">{r.get(result.lane)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 text-xs">
          <div className="max-h-96 divide-y divide-[var(--border)] overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="space-y-1 py-1.5" title={r.lane.why}>
                <div className="flex justify-between gap-2">
                  <span className="truncate font-bold text-[var(--text)]">{nameOf(r.id)}</span>
                  <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                    {fmtFixed(mixTotal(r.mix), 0)}h · PFM {idx(r.pfm)} · làn {LANE_LABEL[r.lane.lane as HostLane].toLowerCase()}
                  </span>
                </div>
                <MixBar mix={r.mix} />
              </div>
            ))}
            {rows.length === 0 && <p className="py-2 text-[var(--text-faint)]">Tháng này chưa có host nào làm ca.</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
