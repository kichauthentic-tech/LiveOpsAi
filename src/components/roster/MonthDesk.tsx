import React, { useEffect, useMemo, useState } from "react";
import { useToast } from "../../hooks/useToast";
import { useConfirm } from "../../hooks/useConfirm";
import { errorMessage } from "../../lib/errorMessage";
import { addDays } from "../../lib/dateUtils";
import { AlertTriangle, ChevronRight } from "lucide-react";
import type { Brand, BrandChannel, BrandContract, BrandMonthlyCommitment, LiveSession, ShiftRegistration, ShiftSlot, UserRole } from "../../types";
import type { EngineParams } from "../../lib/scheduling/engineParams";
import { fetchRosterMonths, isRosterBackendMissing, setRosterMonthDeadline, type RosterDraft, type RosterMonth, type RosterWeek } from "../../lib/db/roster";
import { commitmentsRead, contractsRead } from "../../lib/db/brandContracts";
import { monthCommitmentOf } from "../../lib/performance/brandCommitment";
import { accountRow, sortAccounts, type AccountRow, type RowTone } from "../../lib/performance/accountOverview";
import { channelVerdict, type ChannelVerdict } from "../../lib/roster/monthStatus";
import { brandPlatformKey, type ReportPlatform } from "../../lib/reportPlatform";
import { channelShrinkage, nextRow, nowActions, nowHours, shrinkSums, NEXT_STEPS, type ChannelShrinkage, type DeskTone, type NextRow, type NowHours } from "../../lib/roster/monthDesk";
import { channelRefs, useChannelCards } from "../dashboard/useChannelCards";
import { money, pct } from "../dashboard/shared";
import { StatTile } from "../common/StatTile";
import { PlatformChip } from "../common/PlatformChip";
import { EARLY_REASON_LABEL } from "../../lib/handover";

// Điều Phối Lịch Live — hai tab theo tháng (đợt 1, 24/10). "Tháng này": giờ live thật so cam kết, hao hụt kênh, việc nên làm
// (đọc "Khả năng bù thiếu hụt" của Dashboard qua accountRow — không có dự báo riêng). "Tháng sau": mọi kênh × 6 bước mở lịch,
// giờ cần mở = cam kết ÷ (1 − hao hụt). Logic ở lib/roster/monthDesk.ts; màn này chỉ vẽ.

const TONE_PILL: Record<RowTone | DeskTone, string> = {
  bad: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  warn: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  good: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  off: "bg-[var(--surface-elevated)] text-[var(--text-faint)] border-[var(--border)]"
};
const TONE_TEXT: Record<DeskTone, string> = { bad: "text-rose-400", warn: "text-amber-300", good: "text-emerald-400", off: "text-[var(--text-faint)]" };
const Pill: React.FC<{ tone: RowTone | DeskTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border leading-snug whitespace-nowrap ${TONE_PILL[tone]}`}>{children}</span>
);
const h0 = (v: number) => Math.round(v).toLocaleString("vi-VN");
/** "bán kém 3 · chưa ghi lý do 2" — giờ tắt sớm theo lý do khai lúc giao ca, giờ lớn trước; bỏ phần < 0,5 giờ. */
const reasonText = (m: NowHours["shortByReason"]) =>
  (Object.entries(m) as [keyof typeof m, number][])
    .filter(([, v]) => v >= 0.5)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k === "none" ? "chưa ghi lý do" : EARLY_REASON_LABEL[k].toLowerCase()} ${h0(v)}`)
    .join(" · ");
const pct1 = (v: number) => `${(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%`;
const monthLabel = (m: string) => `tháng ${Number(m.slice(5))}/${m.slice(0, 4)}`;
export const nextMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

interface DeskProps {
  today: string;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  brands: Brand[];
  brandChannels: BrandChannel[];
  engineParams: EngineParams;
  currentRole: UserRole;
  onOpenMonthPlan?: (brandId: string, platform: ReportPlatform) => void;
  onOpenCrm?: (brandId: string, platform: ReportPlatform) => void;
  /** Quyền manage_month_plan (0180: ceo/admin/operations/trainer) — nút mở Kế Hoạch Tháng. */
  canOpenMonthPlan?: boolean;
  /** Ghi được (đặt hạn đăng ký): role xếp lịch + DB đã có 0176. */
  canWrite?: boolean;
}

/** Cam kết + hợp đồng (lượt đọc dùng chung với Kế Hoạch Tháng / Dashboard). Role trainer chưa đọc được tới khi có quyền ở DB (đợt 2). */
function useCommitments() {
  const [data, setData] = useState<{ commitments: BrandMonthlyCommitment[]; contracts: BrandContract[]; error: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all([commitmentsRead.take(), contractsRead.take()])
      .then(([commitments, contracts]) => alive && setData({ commitments, contracts, error: false }))
      .catch(() => alive && setData({ commitments: [], contracts: [], error: true }));
    return () => {
      alive = false;
    };
  }, []);
  return data;
}

function useDeskCards(p: DeskProps, month: string) {
  const active = useMemo(() => p.brandChannels.filter((c) => c.status === "active"), [p.brandChannels]);
  const refs = useMemo(() => channelRefs(p.brands, active), [p.brands, active]);
  const reportSessions = useMemo(() => p.sessions.filter((s) => !s.excludedFromReports), [p.sessions]);
  const { cards, loading } = useChannelCards({ month, today: p.today, refs, brandChannels: p.brandChannels, sessions: reportSessions, shiftSlots: p.shiftSlots, engineParams: p.engineParams, role: p.currentRole });
  // Ca "loại khỏi báo cáo" (thường là dòng trùng của ca restart/ca nối) không tính giờ — cùng danh sách ca với Dashboard.
  const shrink = useMemo(() => shrinkSums(reportSessions, p.today), [reportSessions, p.today]);
  return { cards, loading, shrink, reportSessions, paused: p.brandChannels.length - active.length };
}

const ShrinkCell: React.FC<{ s: ChannelShrinkage }> = ({ s }) => (
  <span
    className="tabular-nums"
    title={
      s.source === "channel"
        ? `60 ngày qua: ${h0(s.plannedHours)} giờ xếp · huỷ ${pct1(s.cancelRate)} · live ngắn hơn lịch ${pct1(s.shortRate)}${s.applied !== s.rate ? ` · đo ${pct1(s.rate)}, dùng ${pct1(s.applied)} (kẹp 3–15%)` : ""}`
        : s.source === "agency"
          ? `Kênh chưa đủ 30 giờ xếp trong 60 ngày — dùng trung bình agency ${pct1(s.rate)}`
          : "Chưa có dữ liệu — dùng mức sàn 3%"
    }
  >
    {pct1(s.applied)}
    {s.source !== "channel" && <span className="ml-1 text-[11px] text-[var(--text-faint)]">{s.source === "agency" ? "trung bình YFB" : "sàn"}</span>}
  </span>
);

const ChannelName: React.FC<{ name: string; platform: ReportPlatform }> = ({ name, platform }) => (
  <span className="flex items-center gap-2 font-bold text-[var(--text)] whitespace-nowrap">
    {name} <PlatformChip platform={platform} />
  </span>
);

/** Thanh giờ: live thật (đặc) + còn trong lịch (nhạt) + phần phải xếp thêm (đỏ), vạch = giờ cam kết. */
const HourBar: React.FC<{ h: NowHours }> = ({ h }) => {
  const extra = Math.max(0, h.extra);
  const max = Math.max(h.committed, h.delivered + h.scheduled + h.open + extra, 1) * 1.05;
  const w = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="relative h-2.5 min-w-[120px] rounded-full bg-[var(--surface-base)]">
      <i className="absolute inset-y-0 left-0 rounded-l-full bg-[var(--success)]" style={{ width: w(h.delivered) }} />
      <i className="absolute inset-y-0 bg-[var(--success)] opacity-35" style={{ left: w(h.delivered), width: w(h.scheduled + h.open) }} />
      {extra > 0.5 && <i className="absolute inset-y-0 bg-[var(--danger)] opacity-80" style={{ left: w(h.delivered + h.scheduled + h.open), width: w(extra) }} />}
      {h.committed > 0 && <i className="absolute -inset-y-1 w-0.5 bg-[var(--text)]" style={{ left: w(h.committed) }} />}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------------------

export interface NowChannel {
  brandId: string;
  platform: ReportPlatform;
  brandName: string;
  row: AccountRow;
  h: NowHours;
  committed: number;
  verdict: ChannelVerdict | null;
}
export interface NextChannel {
  brandId: string;
  platform: ReportPlatform;
  brandName: string;
  committedHours: number | null;
  /** Hao hụt áp cho kênh (đã kẹp 3–15%). */
  shrink: number;
  r: NextRow;
}

/**
 * Số theo tháng cho màn chính bản gọn (25/10): giờ + một kết luận mỗi kênh tháng này (cùng accountRow/nowHours của NowDesk) và
 * bước mở lịch mỗi kênh tháng sau (cùng nextRow của NextDesk). Hai màn chi tiết cũ vẫn tự tính khi mở từ menu.
 */
export function useRosterDesk(p: DeskProps & { registrations: ShiftRegistration[]; drafts: RosterDraft[]; weeks: RosterWeek[] }) {
  const month = p.today.slice(0, 7);
  const next = nextMonthOf(month);
  const now = useDeskCards(p, month);
  const nx = useDeskCards(p, next);
  const cm = useCommitments();
  const nowRows: NowChannel[] = useMemo(() => {
    if (!cm) return [];
    return now.cards
      .map((card) => {
        const row = accountRow(card, now.reportSessions);
        const c = monthCommitmentOf(cm.commitments, cm.contracts, row.brandId, row.platform, `${month}-01`);
        const s = channelShrinkage(now.shrink, brandPlatformKey(row.brandId, row.platform));
        const h = nowHours(now.reportSessions, p.shiftSlots, row.brandId, row.platform, month, p.today, c.hours, s.applied);
        const saveExtra = row.rescue.kind === "save" ? row.rescue.extraHours : null;
        return { brandId: row.brandId, platform: row.platform, brandName: row.brandName, row, h, committed: c.hours, verdict: channelVerdict(c.hours > 0 ? h : null, saveExtra) };
      })
      .filter((r) => r.row.state !== "off" || r.committed > 0);
  }, [now.cards, now.reportSessions, now.shrink, cm, month, p.shiftSlots, p.today]);
  const nextRows: NextChannel[] = useMemo(() => {
    if (!cm) return [];
    return nx.cards.map((card) => {
      const c = monthCommitmentOf(cm.commitments, cm.contracts, card.brandId, card.platform, `${next}-01`);
      const s = channelShrinkage(nx.shrink, brandPlatformKey(card.brandId, card.platform));
      const committedHours = c.source === "none" ? null : c.hours;
      const r = nextRow({
        brandId: card.brandId,
        platform: card.platform,
        month: next,
        committedHours,
        committedGmv: c.gmv ?? null,
        planStatus: card.planStatus,
        shrink: s.applied,
        sessions: nx.reportSessions,
        slots: p.shiftSlots,
        registrations: p.registrations,
        drafts: p.drafts,
        weeks: p.weeks
      });
      return { brandId: card.brandId, platform: card.platform, brandName: card.brandName, committedHours, shrink: s.applied, r };
    });
  }, [nx.cards, nx.shrink, nx.reportSessions, cm, next, p.shiftSlots, p.registrations, p.drafts, p.weeks]);
  return { month, next, nowRows, nextRows, loading: now.loading || nx.loading || !cm, commitError: !!cm?.error };
}

export const NowDesk: React.FC<DeskProps> = (p) => {
  const month = p.today.slice(0, 7);
  const { cards, loading, shrink, reportSessions } = useDeskCards(p, month);
  const cm = useCommitments();
  const rows = useMemo(() => {
    if (!cm) return [];
    const mStart = `${month}-01`;
    return sortAccounts(cards.map((c) => accountRow(c, reportSessions)))
      .map((row) => {
        const c = monthCommitmentOf(cm.commitments, cm.contracts, row.brandId, row.platform, mStart);
        const s = channelShrinkage(shrink, brandPlatformKey(row.brandId, row.platform));
        const h = nowHours(reportSessions, p.shiftSlots, row.brandId, row.platform, month, p.today, c.hours, s.applied);
        return { row, s, h, committed: c.hours, name: row.brandName };
      })
      .filter((r) => r.row.state !== "off" || r.committed > 0);
  }, [cards, cm, month, reportSessions, p.shiftSlots, p.today, shrink]);
  const off = cards.filter((c) => c.state === "off" && !rows.some((r) => r.row.key === c.key));

  const withCommit = rows.filter((r) => r.committed > 0);
  const sum = (f: (r: (typeof rows)[number]) => number) => withCommit.reduce((a, r) => a + f(r), 0);
  const lost = rows.reduce((a, r) => a + Math.max(0, r.h.deliveredPlanned - r.h.delivered), 0);
  const lostLowSales = rows.reduce((a, r) => a + (r.h.shortByReason.low_sales ?? 0), 0);
  const toAdd = sum((r) => Math.max(0, r.h.extra));
  const short = rows.filter((r) => r.row.tone === "bad").length;
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();
  const daysLeft = monthEnd - Number(p.today.slice(8, 10)) + 1;

  if (loading || !cm) return <p className="text-sm text-[var(--text-muted)] py-6">Đang tính giờ và dự báo các kênh…</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        {monthLabel(month)} · còn {daysLeft} ngày · giờ cam kết đếm theo <b className="text-[var(--text)]">giờ live thật</b> (ca chưa có giờ thật tạm tính theo lịch) · dự báo và khả năng bù lấy từ Dashboard
      </p>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
        <StatTile frame="card" label="Giờ cam kết" value={`${h0(sum((r) => r.committed))} giờ`} hint={`${withCommit.length} kênh có cam kết giờ`} />
        <StatTile frame="card" label="Đã live thật" value={`${h0(sum((r) => r.h.delivered))} giờ`} hint={lost > 0.5 ? `mất ${h0(lost)} giờ vì tắt sớm${lostLowSales >= 0.5 ? `, ${h0(lostLowSales)} giờ vì bán kém` : ""}` : undefined} />
        <StatTile frame="card" label="Còn trong lịch" value={`${h0(sum((r) => r.h.scheduled + r.h.open))} giờ`} hint="ca đã chốt + ca mở chờ chốt" />
        <StatTile frame="card" label="Cần xếp thêm" value={`${h0(toAdd)} giờ`} tone={toAdd > 0.5 ? "text-rose-400" : "text-emerald-400"} hint="để đủ cam kết, đã gồm phòng hờ" />
        <StatTile frame="card" label="Kênh hụt target" value={String(short)} tone={short ? "text-rose-400" : "text-emerald-400"} hint={`trên ${rows.length} kênh đang chạy`} />
      </div>
      {cm.error && <p className="text-xs text-amber-300">Không đọc được cam kết hợp đồng — cột cam kết để trống.</p>}
      {/* Một khối mỗi kênh (không phải bảng): ở màn hẹp ba phần xếp dọc, "Nên làm" không bị đẩy ra ngoài màn. */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
        {rows.map(({ row, s, h, committed, name }) => (
          <div key={row.key} className="grid gap-3 p-3 sm:p-4 md:grid-cols-[minmax(170px,220px)_minmax(220px,1fr)_minmax(240px,1.2fr)]">
            <div className="min-w-0 space-y-1">
              <ChannelName name={name} platform={row.platform} />
              <Pill tone={row.tone}>{row.status}</Pill>
              {row.target != null && <p className="text-[11px] tabular-nums text-[var(--text-faint)]">{money(row.actual)} / {money(row.target)}{row.forecast != null ? ` · dự báo ${pct(row.forecast / row.target)}` : ""}</p>}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[var(--text-muted)] mb-1.5">
                Giờ live thật + trong lịch / cam kết · hao hụt <ShrinkCell s={s} />
              </p>
              <HourBar h={h} />
              <p className="mt-1.5 text-xs tabular-nums text-[var(--text-muted)]">
                <b className="text-[var(--text)]">{h0(h.delivered)}</b> + {h0(h.scheduled + h.open)} / {committed > 0 ? <b className="text-[var(--text)]">{h0(committed)} giờ</b> : "không cam kết giờ"}
                {h.deliveredPlanned - h.delivered > 0.5 && (
                  <span className="text-amber-300">
                    {" "}· tắt sớm −{h0(h.deliveredPlanned - h.delivered)}
                    {reasonText(h.shortByReason) && <span className="text-[var(--text-faint)]"> ({reasonText(h.shortByReason)})</span>}
                  </span>
                )}
                {h.estimated > 0 && <span className="text-[var(--text-faint)]" title="Ca đã live chưa có giờ live thật (chưa tải lên file) — tạm tính theo lịch"> · {h.estimated} ca tạm tính</span>}
              </p>
            </div>
            <ul className="min-w-0 space-y-1 text-xs">
              {nowActions(row, committed > 0 ? h : null, money).map((x, i) => (
                <li key={i} className={i === 0 ? `font-bold ${TONE_TEXT[x.tone]}` : "text-[var(--text-muted)]"}>
                  {x.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {off.length > 0 && <p className="text-xs text-[var(--text-faint)]">Không chạy tháng này: {off.map((c) => c.name).join(", ")}.</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------------------------------------

const StepDots: React.FC<{ r: NextRow }> = ({ r }) => (
  <span className="flex items-center gap-1" aria-label={`Bước hiện tại: ${r.next}`}>
    {NEXT_STEPS.map((st) => {
      const done = r.done.has(st.key);
      const cur = r.step === st.key || (r.step === "lock" && st.key === "plan");
      return (
        <i
          key={st.key}
          title={st.label}
          className={`block w-3 h-3 rounded ${done ? "bg-[var(--success)]" : cur ? "bg-[var(--warning)]" : "border border-dashed border-[var(--text-faint)]"}`}
        />
      );
    })}
  </span>
);

export const NextDesk: React.FC<DeskProps & { registrations: ShiftRegistration[]; drafts: RosterDraft[]; weeks: RosterWeek[] }> = (p) => {
  const month = nextMonthOf(p.today.slice(0, 7));
  const { cards, loading, shrink, paused, reportSessions } = useDeskCards(p, month);
  const cm = useCommitments();
  const canPlan = !!p.canOpenMonthPlan;
  const rows = useMemo(() => {
    if (!cm) return [];
    return cards
      .map((card) => {
        const c = monthCommitmentOf(cm.commitments, cm.contracts, card.brandId, card.platform, `${month}-01`);
        const s = channelShrinkage(shrink, brandPlatformKey(card.brandId, card.platform));
        const r = nextRow({
          brandId: card.brandId,
          platform: card.platform,
          month,
          committedHours: c.source === "none" ? null : c.hours,
          committedGmv: c.gmv ?? null,
          planStatus: card.planStatus,
          shrink: s.applied,
          sessions: reportSessions,
          slots: p.shiftSlots,
          registrations: p.registrations,
          drafts: p.drafts,
          weeks: p.weeks
        });
        return { card, c, s, r };
      })
      .sort((a, b) => NEXT_ORDER[a.r.step] - NEXT_ORDER[b.r.step] || a.card.name.localeCompare(b.card.name));
  }, [cards, cm, month, shrink, reportSessions, p.shiftSlots, p.registrations, p.drafts, p.weeks]);

  const daysToStart = Math.round((Date.parse(`${month}-01T00:00:00Z`) - Date.parse(`${p.today}T00:00:00Z`)) / 86400000);
  const committed = rows.reduce((a, x) => a + (x.c.hours || 0), 0);
  const toOpen = rows.reduce((a, x) => a + (x.r.toOpen ?? 0), 0);
  const opened = rows.reduce((a, x) => a + x.r.opened, 0);
  const locked = rows.filter((x) => x.card.planStatus === "locked").length;

  if (loading || !cm) return <p className="text-sm text-[var(--text-muted)] py-6">Đang tải kế hoạch và cam kết {monthLabel(month)}…</p>;
  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--text-muted)]">
        {monthLabel(month)} · còn {daysToStart} ngày tới ngày đầu tháng · giờ cần mở = giờ cam kết ÷ (1 − hao hụt của kênh 60 ngày qua, kẹp 3–15%)
        {paused > 0 && ` · ${paused} kênh tạm dừng không hiện`}
      </p>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        <StatTile frame="card" label="Giờ cam kết" value={`${h0(committed)} giờ`} hint={`${rows.filter((x) => x.c.source !== "none").length}/${rows.length} kênh đã có cam kết`} />
        <StatTile frame="card" label="Giờ cần mở" value={`${h0(toOpen)} giờ`} hint={`gồm ${h0(rows.reduce((a, x) => a + x.r.buffer, 0))} giờ phòng hờ`} />
        <StatTile frame="card" label="Đã mở" value={`${h0(opened)} giờ`} tone={opened + 0.5 < toOpen ? "text-rose-400" : "text-emerald-400"} hint="ca đã chốt + ca mở chờ đăng ký" />
        <StatTile frame="card" label="Kế hoạch đã chốt" value={`${locked}/${rows.length}`} tone={locked < rows.length ? "text-amber-300" : "text-emerald-400"} hint="kênh đang chạy" />
      </div>
      {cm.error && <p className="text-xs text-amber-300">Không đọc được cam kết hợp đồng — cột cam kết để trống.</p>}
      <MonthDeadline month={month} today={p.today} openSlots={rows.reduce((a, x) => a + x.r.openSlots, 0)} canWrite={!!p.canWrite} />
      <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--text-muted)] text-left border-b border-[var(--border)] whitespace-nowrap">
              <th className="px-3 py-2 font-medium">Kênh</th>
              <th className="px-3 py-2 font-medium">Bước tiếp theo</th>
              <th className="px-3 py-2 font-medium text-right">Cam kết</th>
              <th className="px-3 py-2 font-medium text-right">Hao hụt</th>
              <th className="px-3 py-2 font-medium text-right">Cần mở</th>
              <th className="px-3 py-2 font-medium">Đã mở</th>
              <th className="px-3 py-2 font-medium">Target · dự báo của lịch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ card, c, s, r }) => {
              const tone: DeskTone = r.step === "done" ? "good" : r.step === "commit" || r.step === "plan" ? "bad" : "warn";
              const fill = r.toOpen ? Math.min(100, (r.opened / r.toOpen) * 100) : r.opened > 0 ? 100 : 0;
              return (
                <tr key={card.key} className="border-b border-[var(--border)]/60 align-top">
                  <td className="px-3 py-3">
                    <ChannelName name={card.brandName} platform={card.platform} />
                  </td>
                  <td className="px-3 py-3 min-w-[200px]">
                    <StepDots r={r} />
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Pill tone={tone}>{r.next}</Pill>
                      {r.gmvSuspicious && p.onOpenCrm && (
                        <button type="button" onClick={() => p.onOpenCrm!(card.brandId, card.platform)} className="text-[11px] font-bold text-[var(--accent-text)] hover:underline">
                          Sửa GMV ở CRM
                        </button>
                      )}
                      {(r.step === "commit" || r.step === "plan" || r.step === "lock" || r.step === "open") &&
                        (canPlan && p.onOpenMonthPlan ? (
                          <button type="button" onClick={() => p.onOpenMonthPlan!(card.brandId, card.platform)} className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--accent-text)] hover:underline">
                            Kế Hoạch Tháng <ChevronRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-[var(--text-faint)]">làm ở Kế Hoạch Tháng</span>
                        ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    {c.source === "none" ? (
                      <span className="text-[var(--text-faint)]">chưa có</span>
                    ) : (
                      <>
                        <b className="text-[var(--text)]">{c.hours > 0 ? `${h0(c.hours)} giờ` : "—"}</b>
                        <p className={`text-[11px] ${r.gmvSuspicious ? "text-amber-300 font-bold" : "text-[var(--text-faint)]"}`}>
                          {r.gmvSuspicious && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
                          GMV {c.gmv ? (r.gmvSuspicious ? `${c.gmv.toLocaleString("vi-VN")}?` : money(c.gmv)) : "—"}
                        </p>
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <ShrinkCell s={s} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.toOpen != null ? (
                      <span title={`${h0(c.hours)} ÷ (1 − ${pct1(s.applied)})`}>
                        <b className="text-[var(--text)]">{h0(Math.ceil(r.toOpen))}</b>
                        <span className="text-[11px] text-[var(--text-faint)]"> (+{h0(r.buffer)})</span>
                      </span>
                    ) : (
                      <span className="text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-[110px]">
                    <div className="relative h-2 rounded-full bg-[var(--surface-base)]">
                      <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${fill}%`, background: fill >= 99.5 ? "var(--success)" : "var(--warning)" }} />
                    </div>
                    <p className="mt-1 text-[11px] tabular-nums text-[var(--text-muted)]">
                      {h0(r.opened)} giờ{r.openSlots > 0 ? ` · ${r.openSlots} ca mở` : ""}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums whitespace-nowrap">
                    {card.planStatus !== "locked" ? (
                      <span className="text-[var(--text-faint)]">{card.planStatus === "draft" ? "nháp, chưa chốt" : "chưa lập"}</span>
                    ) : (
                      <>
                        <span className="text-[var(--text)] font-bold">{money(card.target)}</span>
                        <p className="text-[11px] text-[var(--text-faint)]">{card.forecast && card.target ? `dự báo ~${money(card.forecast.p50)} (${pct(card.forecast.p50 / card.target)})` : "chưa đủ ca để dự báo"}</p>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[var(--text-faint)]">
        6 bước: {NEXT_STEPS.map((s) => s.label).join(" → ")}. Cam kết tháng nhập ở Kế Hoạch Tháng (mặc định lấy từ hợp đồng ở CRM). Đăng ký, xếp người, công bố làm ở lịch tuần phía trên.
      </p>
    </div>
  );
};

const NEXT_ORDER: Record<NextRow["step"], number> = { commit: 0, plan: 1, lock: 2, open: 3, signup: 4, staff: 5, publish: 6, done: 7 };

const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`;
};

/** Một hạn đăng ký cho cả tháng (0180, user chốt 24/10). Qua hạn DB chặn talent đăng ký/rút; người xếp lịch vẫn đăng ký hộ được. */
const MonthDeadline: React.FC<{ month: string; today: string; openSlots: number; canWrite: boolean }> = ({ month, today, openSlots, canWrite }) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<{ month: string; list: RosterMonth[]; missing: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [edit, setEdit] = useState<{ month: string; date?: string; time?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchRosterMonths(month)
      .then((list) => alive && setState({ month, list, missing: false }))
      .catch((e) => alive && setState({ month, list: [], missing: isRosterBackendMissing(e) }));
    return () => {
      alive = false;
    };
  }, [month, nonce]);
  const saved = state?.month === month ? state.list.find((x) => x.month === month)?.signupDeadline : undefined;
  const savedD = saved ? new Date(saved) : null;
  // Gợi ý khi chưa có hạn: 17:00 năm ngày trước đầu tháng (đủ thời gian xếp người + công bố); ngày đó đã qua thì 17:00 ngày kia.
  const suggest = addDays(`${month}-01`, -5) > today ? addDays(`${month}-01`, -5) : addDays(today, 2);
  const cur = edit?.month === month ? edit : null;
  const date = cur?.date ?? (savedD ? `${savedD.getFullYear()}-${String(savedD.getMonth() + 1).padStart(2, "0")}-${String(savedD.getDate()).padStart(2, "0")}` : suggest);
  const time = cur?.time ?? (savedD ? `${String(savedD.getHours()).padStart(2, "0")}:${String(savedD.getMinutes()).padStart(2, "0")}` : "17:00");
  const passed = !!saved && new Date(saved) <= new Date();
  const missing = !!state?.missing;
  const loaded = state?.month === month;

  const save = async () => {
    const iso = new Date(`${date}T${time}:00`).toISOString();
    if (new Date(iso) <= new Date() && !(await confirm("Hạn này đã qua — host/trợ sẽ không đăng ký được nữa cho tháng này. Vẫn đặt?"))) return;
    setBusy(true);
    try {
      const r = await setRosterMonthDeadline(month, iso);
      setEdit(null);
      setNonce((n) => n + 1);
      showToast(`Đã đặt hạn ${fmtWhen(iso)}${r.notified > 0 ? ` — đã báo ${r.notified} host/trợ (${r.openSlots} ca mở)` : r.openSlots === 0 ? " — chưa có ca mở nên chưa báo ai" : ""}`);
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <b className="text-sm text-[var(--text)]">Hạn đăng ký {monthLabel(month)}</b>
        <span className={missing ? "text-amber-300" : !saved ? "text-[var(--text-faint)]" : passed ? "text-amber-300" : "text-emerald-400"}>
          {!loaded ? "Đang tải hạn đăng ký…" : missing ? "Chưa chạy migration 0180 — chưa đặt được hạn theo tháng" : !saved ? "Chưa đặt hạn" : passed ? `Đã đóng đăng ký lúc ${fmtWhen(saved)}` : `Đang nhận đăng ký tới ${fmtWhen(saved)}`}
          {" · "}
          {openSlots > 0 ? `${openSlots} ca mở chờ đăng ký` : "chưa có ca mở — chốt Kế Hoạch Tháng để có ca cho talent đăng ký"}
        </span>
      </div>
      {canWrite && loaded && !missing && (
        <span className="flex flex-wrap items-end gap-2">
          <input type="date" aria-label="Ngày hạn đăng ký" value={date} onChange={(e) => setEdit({ month, date: e.target.value, time: cur?.time })} className="px-2 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]" />
          <input type="time" aria-label="Giờ hạn đăng ký" value={time} onChange={(e) => setEdit({ month, date: cur?.date, time: e.target.value })} className="px-2 py-1 rounded-lg bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text)]" />
          <button type="button" disabled={busy || !date || !time} onClick={() => void save()} className="px-3 py-1.5 rounded-lg border border-[var(--border)] font-bold text-[var(--text)] disabled:opacity-40">
            {saved ? "Đổi hạn" : "Đặt hạn + báo talent"}
          </button>
        </span>
      )}
    </div>
  );
};
