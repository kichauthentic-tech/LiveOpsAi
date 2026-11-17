import React, { useContext, useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarRange, CheckCircle2, Download, Loader2, MinusCircle, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import type { Brand, BrandChannel, LiveSession, ShiftSlot, UserRole } from "../types";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { fmtFixed, fmtVndFull, fmtVndShort } from "../lib/format";
import { CAMP_DAY_BUCKET_LABEL, type CampDayBucket } from "../lib/campaignDays";
import { platformOf, type ReportPlatform } from "../lib/reportPlatform";
import { downloadSheetsAsXlsx, xlsxFailText } from "../lib/exportXlsx";
import {
  buildWeeklyChannel, channelHeadline, rollupChannels, spanLabel, WEEKLY_THRESHOLDS,
  type PaceLevel, type SessionNote, type WeeklyChannel
} from "../lib/performance/weeklyReport";
import { channelRefs, useChannelCards } from "./dashboard/useChannelCards";
import { LiveFunnel } from "./dashboard/LiveFunnel";
import { useToast } from "../hooks/useToast";
import { periodOf, WeeklyPeriodBar } from "./WeeklyPeriodBar";
import { useWeeklyPeriod } from "../lib/weeklyPeriodStore";
import { PlatformBlockContext } from "./common/PageHeader";
import { PageHeader } from "./common/PageHeader";
import { StatTile } from "./common/StatTile";
import { PlatformChip } from "./common/PlatformChip";
import { SectionNav } from "./common/SectionNav";
import { BrandLogo } from "./ui/BrandLogo";

// Báo Cáo Tuần (agency): MỘT trang cho sếp — mỗi kênh (account × sàn) một mục, trả lời: thực đạt trên target tổng, target/thực đạt
// từng ngày (ngày Campaign tô riêng), tổng từng đợt, ca đáng lưu ý và gãy ở chỉ số nào, ca tốt vì sao. Toàn bộ số do
// `lib/performance/weeklyReport.ts` dựng từ cùng thẻ kênh/run-rate của Dashboard — trang này chỉ vẽ.
// Màu lấy từ token của theme (đổi theme là đổi theo), mức đạt luôn kèm chữ + biểu tượng, không chỉ có màu.

// ---------- màu & nhãn ----------

const C = {
  actual: "var(--accent)",
  target: "var(--text-muted)",
  good: "var(--success)",
  warn: "var(--warning)",
  bad: "var(--danger)",
  grid: "var(--border)",
  faint: "var(--text-faint)",
  future: "var(--surface-hover)"
} as const;

// Dải camp — màu cố định theo loại (cùng tông CAMPAIGN_DAY_STYLES), chỉ để nhận ra ngày Campaign; tên đợt luôn có chữ.
const CAMP_COLOR: Record<Exclude<CampDayBucket, "daily">, string> = { dday: "#e11d48", midmonth: "#f59e0b", payday: "#8b5cf6" };
const CAMP_SHORT: Record<Exclude<CampDayBucket, "daily">, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

const LEVEL: Record<PaceLevel, { label: string; tone: string; bg: string; Icon: React.ComponentType<{ className?: string }> }> = {
  on: { label: "Đạt", tone: "text-[var(--success)]", bg: "bg-[var(--success)]/10 border-[var(--success)]/40", Icon: CheckCircle2 },
  near: { label: "Sát target", tone: "text-[var(--warning)]", bg: "bg-[var(--warning)]/10 border-[var(--warning)]/40", Icon: AlertTriangle },
  behind: { label: "Hụt", tone: "text-[var(--danger)]", bg: "bg-[var(--danger)]/10 border-[var(--danger)]/40", Icon: XCircle },
  none: { label: "Chưa có target", tone: "text-[var(--text-muted)]", bg: "bg-[var(--surface-elevated)] border-[var(--border)]", Icon: MinusCircle }
};
const levelColor = (pct: number | null): string => (pct == null ? C.faint : pct >= 1 ? C.good : pct >= WEEKLY_THRESHOLDS.near ? C.warn : C.bad);
const pctStr = (x: number | null) => (x == null ? "—" : `${fmtFixed(x * 100, 0)}%`);
const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const tooltipBox: React.CSSProperties = { background: "var(--surface-elevated)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", color: "var(--text)", fontSize: 12 };

const LevelBadge: React.FC<{ level: PaceLevel; pct: number | null }> = ({ level, pct }) => {
  const L = LEVEL[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-black ${L.bg} ${L.tone}`}>
      <L.Icon className="w-3.5 h-3.5" /> {L.label}{pct != null && ` · ${pctStr(pct)}`}
    </span>
  );
};

const Card: React.FC<{ title: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({ title, hint, children, className = "" }) => (
  <div className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3 min-w-0 ${className}`}>
    <div>
      <h3 className="text-sm font-black text-[var(--text)]">{title}</h3>
      {hint && <p className="text-2xs text-[var(--text-faint)] mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
);

// ---------- biểu đồ ----------

interface DayTickProps { x?: number; y?: number; payload?: { value: string }; days: Map<string, WeeklyChannel["days"][number]>; dense: boolean }
const DayTick: React.FC<DayTickProps> = ({ x = 0, y = 0, payload, days, dense }) => {
  const d = payload ? days.get(payload.value) : undefined;
  if (!d) return null;
  const camp = d.bucket !== "daily" ? CAMP_COLOR[d.bucket] : null;
  return (
    <g transform={`translate(${x},${y})`}>
      {(!dense || Number(d.date.slice(8, 10)) % 2 === 1) && <text y={12} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{dense ? Number(d.date.slice(8, 10)) : dm(d.date)}</text>}
      {!dense && <text y={25} textAnchor="middle" fontSize={11} fill="var(--text-faint)">{DOW[d.dow]}</text>}
      {camp && <rect x={-9} y={dense ? 17 : 30} width={18} height={4} rx={2} fill={camp} />}
    </g>
  );
};

const DailyChart: React.FC<{ w: WeeklyChannel }> = ({ w }) => {
  const dense = w.days.length > 14;
  const map = useMemo(() => new Map(w.days.map((d) => [d.date, d])), [w.days]);
  const data = w.days.map((d) => ({ date: d.date, actual: d.state === "done" ? d.actual : null, target: d.target, pct: d.pct, state: d.state }));
  const hasCamp = w.days.some((d) => d.bucket !== "daily");
  return (
    <div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: dense ? 8 : 18 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: C.grid }} interval={0} height={dense ? 28 : 44} tick={<DayTick days={map} dense={dense} />} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => fmtVndShort(v)} />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)", opacity: 0.4 }}
              content={({ active, payload }) => {
                const p = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
                const d = p ? map.get(p.date) : undefined;
                if (!d) return null;
                return (
                  <div style={tooltipBox}>
                    <p className="font-bold">{DOW[d.dow]} {dm(d.date)}{d.bucket !== "daily" && <span style={{ color: CAMP_COLOR[d.bucket] }}> · {CAMP_SHORT[d.bucket]}</span>}</p>
                    <p>Target: <b>{fmtVndFull(d.target)}</b></p>
                    <p>Thực đạt: <b>{d.state === "done" ? fmtVndFull(d.actual) : d.state === "waiting" ? "chưa có số" : "chưa tới ngày"}</b></p>
                    {d.pct != null && <p>Đạt: <b>{pctStr(d.pct)}</b> · {d.sessions} ca</p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="actual" name="Thực đạt" radius={[4, 4, 0, 0]} maxBarSize={32} isAnimationActive={false}>
              {data.map((p) => <Cell key={p.date} fill={levelColor(p.pct)} />)}
            </Bar>
            <Line dataKey="target" name="Target" type="stepAfter" stroke={C.target} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[
        { swatch: C.good, label: "≥ 100% target" }, { swatch: C.warn, label: `${WEEKLY_THRESHOLDS.near * 100}–99%` }, { swatch: C.bad, label: `< ${WEEKLY_THRESHOLDS.near * 100}%` },
        { swatch: C.target, label: "Target ngày", dashed: true },
        ...(hasCamp ? (Object.keys(CAMP_COLOR) as (keyof typeof CAMP_COLOR)[]).filter((k) => w.days.some((d) => d.bucket === k)).map((k) => ({ swatch: CAMP_COLOR[k], label: `Ngày ${CAMP_SHORT[k]}`, pill: true })) : [])
      ]} />
    </div>
  );
};

const Legend: React.FC<{ items: { swatch: string; label: string; dashed?: boolean; pill?: boolean }[] }> = ({ items }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-2xs text-[var(--text-muted)]">
    {items.map((i) => (
      <li key={i.label} className="flex items-center gap-1.5">
        <span className={i.dashed ? "w-4 border-t-2 border-dashed" : i.pill ? "w-4 h-1 rounded-full" : "w-2.5 h-2.5 rounded-sm"} style={i.dashed ? { borderColor: i.swatch } : { background: i.swatch }} />
        {i.label}
      </li>
    ))}
  </ul>
);

const CumChart: React.FC<{ w: WeeklyChannel }> = ({ w }) => {
  const data = w.cum.map((c) => ({ date: c.date, cumTarget: c.cumTarget, cumActual: c.cumActual }));
  return (
    <div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <ReferenceArea x1={w.from} x2={w.to} fill="var(--accent)" fillOpacity={0.08} ifOverflow="hidden" />
            <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: C.grid }} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(d: string) => Number(d.slice(8, 10)).toString()} interval={Math.max(0, Math.floor(data.length / 10) - 1)} />
            <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => fmtVndShort(v)} />
            {w.today >= w.month + "-01" && w.today.slice(0, 7) === w.month && <ReferenceLine x={w.today} stroke={C.faint} strokeDasharray="2 3" label={{ value: "Hôm nay", fontSize: 11, fill: "var(--text-faint)", position: "insideTopLeft" }} />}
            <Tooltip
              contentStyle={tooltipBox}
              labelFormatter={(d) => `Luỹ kế tới ${dm(String(d))}`}
              formatter={(v, n) => [v == null ? "chưa có số" : fmtVndFull(Number(v)), n === "cumTarget" ? "Target luỹ kế" : "Thực đạt luỹ kế"]}
            />
            <Line dataKey="cumTarget" type="monotone" stroke={C.target} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line dataKey="cumActual" type="monotone" stroke={C.actual} strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend items={[{ swatch: C.actual, label: "Thực đạt luỹ kế" }, { swatch: C.target, label: "Target luỹ kế", dashed: true }, { swatch: "var(--accent)", label: "Kỳ đang xem (nền vàng nhạt)", pill: true }]} />
    </div>
  );
};

const EventsChart: React.FC<{ w: WeeklyChannel }> = ({ w }) => {
  const rows = [
    ...w.events.map((e) => ({
      name: `${CAMP_SHORT[e.bucket]} ${spanLabel(e.from, e.to)}`,
      target: e.target, actual: e.status === "next" ? null : e.actual, pct: e.pct, status: e.status, color: CAMP_COLOR[e.bucket]
    })),
    { name: "Ngày thường", target: w.daily.target, actual: w.daily.actual, pct: w.daily.pct, status: "done" as const, color: C.faint }
  ].filter((r) => r.target > 0 || (r.actual ?? 0) > 0);
  if (rows.length === 0) return <p className="text-xs text-[var(--text-muted)]">Chưa có target theo đợt.</p>;
  return (
    <div>
      <div style={{ height: Math.max(150, rows.length * 52 + 24) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 0 }} barCategoryGap={10}>
            <CartesianGrid stroke={C.grid} horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={{ stroke: C.grid }} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => fmtVndShort(v)} />
            <YAxis type="category" dataKey="name" width={118} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--text)" }} />
            <Tooltip
              cursor={{ fill: "var(--surface-hover)", opacity: 0.4 }}
              content={({ active, payload }) => {
                const r = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                if (!r) return null;
                return (
                  <div style={tooltipBox}>
                    <p className="font-bold">{r.name}</p>
                    <p>{r.status === "next" ? "Target cả đợt (chưa tới)" : "Target cả đợt"}: <b>{fmtVndFull(r.target)}</b></p>
                    <p>Thực đạt: <b>{r.actual == null ? "—" : fmtVndFull(r.actual)}</b></p>
                    {r.pct != null && <p>Đạt: <b>{pctStr(r.pct)}</b></p>}
                  </div>
                );
              }}
            />
            <Bar dataKey="target" name="Target" fill={C.target} fillOpacity={0.35} radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false} />
            <Bar dataKey="actual" name="Thực đạt" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
              {rows.map((r) => <Cell key={r.name} fill={levelColor(r.pct)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 grid sm:grid-cols-2 gap-x-4 gap-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-2 text-xs border-b border-[var(--border-muted)] py-1">
            <span className="flex items-center gap-1.5 min-w-0"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: r.color }} /><span className="truncate text-[var(--text)]">{r.name}</span>
              {r.status === "next" && <span className="text-2xs text-[var(--text-faint)]">sắp tới</span>}{r.status === "live" && <span className="text-2xs text-[var(--accent-text)]">đang chạy</span>}</span>
            <span className="tabular-nums text-[var(--text-muted)] shrink-0">{r.actual == null ? "—" : fmtVndShort(r.actual)} / {fmtVndShort(r.target)} · <b style={{ color: levelColor(r.pct) }}>{pctStr(r.pct)}</b></span>
          </li>
        ))}
      </ul>
      <Legend items={[{ swatch: C.target, label: "Target cả đợt" }, { swatch: C.good, label: "≥ 100%" }, { swatch: C.warn, label: `${WEEKLY_THRESHOLDS.near * 100}–99%` }, { swatch: C.bad, label: `< ${WEEKLY_THRESHOLDS.near * 100}%` }]} />
    </div>
  );
};

/** Phễu: mỗi chỉ số một dòng, thanh lệch so với 28 ngày liền trước kỳ (xanh = tốt lên, đỏ = tệ đi; chỉ số trung tính xám). */
// ---------- ca ----------

const TIER_LABEL = { manual: "tự khai", handover: "số giao ca", reconciled: "đã đối soát" } as const;

const SessionCard: React.FC<{ n: SessionNote; kind: "weak" | "strong" }> = ({ n, kind }) => {
  const s: LiveSession = n.session;
  const notes = kind === "weak" ? n.breaks : n.wins;
  const color = kind === "weak" ? C.bad : C.good;
  const width = n.pct != null ? Math.min(100, n.pct * 100) : n.rateRatio != null ? Math.min(100, n.rateRatio * 50) : 0;
  return (
    <li className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-bold text-[var(--text)]">
          {dm(s.date)} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)} · {s.hostName || "chưa gán host"}
          {n.bucket !== "daily" && <span className="ml-1.5 text-2xs font-black" style={{ color: CAMP_COLOR[n.bucket] }}>{CAMP_SHORT[n.bucket]}</span>}
        </p>
        <p className="text-xs tabular-nums text-[var(--text-muted)]">
          <b style={{ color }}>{fmtVndShort(n.actual)}</b>{n.target > 0 && <> / {fmtVndShort(n.target)}</>}
          {n.pct != null && <b style={{ color }}> · {pctStr(n.pct)}</b>}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden" role="img" aria-label={n.pct != null ? `Đạt ${pctStr(n.pct)} target` : "Không có target ca"}>
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
      </div>
      <p className="text-2xs text-[var(--text-muted)]">
        {fmtFixed(n.hours, 1)}h · GMV/giờ <b className="text-[var(--text)]">{fmtVndShort(n.gmvPerHour)}</b>
        {n.rateRatio != null && <> ({n.rateRatio >= 1 ? "+" : "−"}{pctStr(Math.abs(n.rateRatio - 1))} so nền kênh)</>}
        {n.pct == null && " · ca không có target (mở thêm)"} · {TIER_LABEL[n.tier]}
      </p>
      {notes.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {notes.map((m) => (
            <li key={m.key} className="text-2xs rounded border px-1.5 py-0.5" style={{ borderColor: color, color }}>
              {kind === "weak" ? "Gãy" : "Tốt"}: {m.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-2xs text-[var(--text-faint)]">{kind === "weak" ? "Không chỉ số phễu nào lệch rõ so nền — xem giờ live, host, số tự khai." : "Không chỉ số phễu nào vượt rõ nền — GMV đến từ quy mô/giờ live."}</p>
      )}
    </li>
  );
};

// ---------- một kênh ----------

export const ChannelSection: React.FC<{ w: WeeklyChannel; brand?: Pick<Brand, "name" | "logo"> }> = ({ w, brand }) => {
  const r = w.range;
  const L = LEVEL[w.level];
  const lines = useMemo(() => channelHeadline(w), [w]);
  return (
    <section id={`wk-${w.key}`} data-section={w.name} className="space-y-4 scroll-mt-24" aria-label={`Báo cáo ${w.name}`}>
      <div className="flex flex-wrap items-center gap-3">
        <BrandLogo brand={brand ?? { name: w.brandName, logo: w.brandLogo ?? "" }} size="md" />
        <h2 className="text-lg font-black text-[var(--text)]">{w.brandName}</h2>
        <PlatformChip platform={w.platform} />
        <LevelBadge level={w.level} pct={r.pct} />
        {w.monthTotal.keepPace != null && w.monthTotal.target > 0 && (
          <span className="text-xs text-[var(--text-muted)] ml-auto">Giữ nhịp này cuối tháng ≈ <b className="text-[var(--text)]">{fmtVndShort(w.monthTotal.keepPace)}</b> / target tháng <b className="text-[var(--text)]">{fmtVndShort(w.monthTotal.target)}</b></span>
        )}
      </div>

      <ul className={`rounded-xl border p-3 space-y-1 text-sm text-[var(--text)] ${L.bg}`}>
        {lines.map((t, i) => <li key={i} className="flex gap-2"><span className={`${L.tone} select-none`} aria-hidden>•</span><span>{t}</span></li>)}
      </ul>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile frame="card" label="Target tổng" value={r.target > 0 ? fmtVndShort(r.target) : "—"} />
        <StatTile frame="card" label="Thực đạt" value={fmtVndShort(r.actual)} tone={L.tone} hint={r.prevDelta != null ? <span className="inline-flex items-center gap-1">{r.prevDelta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}{pctStr(Math.abs(r.prevDelta))} so kỳ trước</span> : "kỳ trước chưa có số"} />
        <StatTile frame="card" label={r.gap >= 0 ? "Vượt target" : "Còn thiếu"} value={r.target > 0 ? fmtVndShort(Math.abs(r.gap)) : "—"} tone={r.gap >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"} />
        <StatTile frame="card" label="GMV/giờ live" value={fmtVndShort(r.gmvPerHour)} hint={`${fmtFixed(r.hours, 1)}h live`} />
        <StatTile frame="card" label="Ca có số" value={`${r.sessions}`} hint={[r.waiting > 0 && `${r.waiting} chưa có số`, r.cancelled > 0 && `${r.cancelled} huỷ`].filter(Boolean).join(" · ") || "đủ số"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Target vs thực đạt từng ngày" hint="Cột = thực đạt (màu theo % target), đường đứt = target ngày. Gạch màu dưới ngày = ngày Campaign."><DailyChart w={w} /></Card>
        <Card title="Luỹ kế từ đầu tháng" hint="Khoảng cách giữa hai đường = số còn thiếu/vượt so với target luỹ kế."><CumChart w={w} /></Card>
        <Card className="lg:col-span-2" title="Tổng từng đợt" hint="Mỗi dải Campaign liền nhau là một đợt; ngày thường gộp một dòng. Đợt chưa tới hiện target cả đợt."><EventsChart w={w} /></Card>
      </div>

      <Card title="Gãy ở chỉ số nào" hint="So với kỳ liền trước."><LiveFunnel views={[w.funnelView]} /></Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={<span className="flex items-center gap-1.5 text-[var(--danger)]"><XCircle className="w-4 h-4" /> Ca đáng lưu ý</span>} hint={`Đạt dưới ${WEEKLY_THRESHOLDS.weakPct * 100}% target (ca mở thêm: GMV/giờ dưới ${WEEKLY_THRESHOLDS.weakRate * 100}% nền kênh). Chỉ số lệch = thấp hơn nền kênh ${WEEKLY_THRESHOLDS.baselineDays} ngày quá ${Math.round((1 - WEEKLY_THRESHOLDS.breakRatio) * 100)}%.`}>
          {w.weak.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Không có ca nào hụt nặng trong kỳ.</p> : <ul className="space-y-2">{w.weak.map((n) => <SessionCard key={n.session.id} n={n} kind="weak" />)}</ul>}
        </Card>
        <Card title={<span className="flex items-center gap-1.5 text-[var(--success)]"><CheckCircle2 className="w-4 h-4" /> Ca tốt</span>} hint={`Đạt từ 100% target (ca mở thêm: GMV/giờ từ ${WEEKLY_THRESHOLDS.strongRate * 100}% nền). Lý do = chỉ số phễu cao hơn nền kênh quá ${Math.round((WEEKLY_THRESHOLDS.winRatio - 1) * 100)}%.`}>
          {w.strong.length === 0 ? <p className="text-xs text-[var(--text-muted)]">Chưa có ca nào đạt target trong kỳ.</p> : <ul className="space-y-2">{w.strong.map((n) => <SessionCard key={n.session.id} n={n} kind="strong" />)}</ul>}
        </Card>
      </div>

      {w.missing.length > 0 && (
        <div className="rounded-xl border border-[var(--warning)]/40 bg-[var(--warning)]/5 p-3 text-xs text-[var(--text)] space-y-1">
          <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 text-[var(--warning)]" /> Ca có target nhưng chưa có số / đã huỷ</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-[var(--text-muted)]">
            {w.missing.slice(0, 8).map((m, i) => <li key={i}>{dm(m.date)} {m.startTime.slice(0, 5)} · {m.kind === "no_data" ? "chưa có số" : "huỷ"} · target {fmtVndShort(m.target)}{m.hostName && ` · ${m.hostName}`}</li>)}
          </ul>
        </div>
      )}
      <p className="text-2xs text-[var(--text-faint)]">
        {w.targetSource === "plan" ? "Target: Kế Hoạch Tháng đã chốt (ca huỷ giữ target, ca mở thêm target 0)." : w.targetSource === "sessions" ? "Kế hoạch tháng chưa chốt — target lấy từ target của từng ca." : "Chưa có target."}
        {w.manualCount > 0 && ` ${w.manualCount} ca trong kỳ là số tự khai, chưa có file giao ca/đối soát — còn có thể lệch.`}
        {` Nền kênh = ${w.baselineSessions} ca có số trong ${WEEKLY_THRESHOLDS.baselineDays} ngày gần nhất.`}
      </p>
    </section>
  );
};

// ---------- tổng quan sàn ----------

export const OverviewBlock: React.FC<{ list: WeeklyChannel[] }> = ({ list }) => {
  const roll = useMemo(() => rollupChannels(list), [list]);
  const rows = useMemo(
    () => list.filter((c) => c.range.target > 0 || c.range.actual > 0).sort((a, b) => (a.range.pct ?? 9) - (b.range.pct ?? 9)).map((c) => ({ name: c.name, target: c.range.target, actual: c.range.actual, pct: c.range.pct })),
    [list]
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile frame="card" label="Target tổng" value={fmtVndShort(roll.target)} hint={`${roll.channels} account`} />
        <StatTile frame="card" label="Thực đạt" value={fmtVndShort(roll.actual)} />
        <StatTile frame="card" label="% target" value={pctStr(roll.pct)} tone={roll.pct == null ? undefined : roll.pct >= 1 ? "text-[var(--success)]" : roll.pct >= WEEKLY_THRESHOLDS.near ? "text-[var(--warning)]" : "text-[var(--danger)]"} />
        <StatTile frame="card" label="Account đạt / sát / hụt" value={`${roll.on} / ${roll.near} / ${roll.behind}`} hint={roll.none > 0 ? `${roll.none} chưa có target` : undefined} />
      </div>
      {rows.length > 0 && (
        <Card title="Mỗi account: thực đạt so target tổng" hint="Xếp từ hụt nhiều nhất lên đầu.">
          <div style={{ height: Math.max(140, rows.length * 44 + 20) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }} barCategoryGap={8}>
                <CartesianGrid stroke={C.grid} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={{ stroke: C.grid }} tick={{ fontSize: 11, fill: "var(--text-muted)" }} tickFormatter={(v: number) => fmtVndShort(v)} />
                <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--text)" }} />
                <Tooltip
                  cursor={{ fill: "var(--surface-hover)", opacity: 0.4 }}
                  content={({ active, payload }) => {
                    const p = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined;
                    if (!p) return null;
                    return <div style={tooltipBox}><p className="font-bold">{p.name}</p><p>Target tổng: <b>{fmtVndFull(p.target)}</b></p><p>Thực đạt: <b>{fmtVndFull(p.actual)}</b></p><p>Đạt: <b>{pctStr(p.pct)}</b></p></div>;
                  }}
                />
                <Bar dataKey="target" fill={C.target} fillOpacity={0.35} radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false} />
                <Bar dataKey="actual" radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>{rows.map((p) => <Cell key={p.name} fill={levelColor(p.pct)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1">
            {rows.map((p) => <li key={p.name} className="flex justify-between gap-2 text-xs border-b border-[var(--border-muted)] py-1"><span className="text-[var(--text)]">{p.name}</span><span className="tabular-nums text-[var(--text-muted)]">{fmtVndShort(p.actual)} / {fmtVndShort(p.target)} · <b style={{ color: levelColor(p.pct) }}>{pctStr(p.pct)}</b></span></li>)}
          </ul>
          <Legend items={[{ swatch: C.target, label: "Target tổng" }, { swatch: C.good, label: "≥ 100%" }, { swatch: C.warn, label: `${WEEKLY_THRESHOLDS.near * 100}–99%` }, { swatch: C.bad, label: `< ${WEEKLY_THRESHOLDS.near * 100}%` }]} />
        </Card>
      )}
    </div>
  );
};

// ---------- khối của một sàn ----------

interface WeeklyReportProps {
  platform: ReportPlatform;
  today: string;
  /** Brand có kênh ở sàn này. */
  brands: Brand[];
  brandChannels: BrandChannel[];
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  engineParams: EngineParams;
  currentRole: UserRole;
}

export const WeeklyReport: React.FC<WeeklyReportProps> = ({ platform, today, brands, brandChannels, sessions, shiftSlots, engineParams, currentRole }) => {
  const { showToast } = useToast();
  const [period, setPeriod] = useWeeklyPeriod(today);
  const block = useContext(PlatformBlockContext);
  const bounds = useMemo(() => periodOf(period), [period]);
  const refs = useMemo(() => channelRefs(brands, brandChannels, [platform]), [brands, brandChannels, platform]);
  const { cards, loading } = useChannelCards({ month: bounds.month, today, refs, brandChannels, sessions, shiftSlots, engineParams, role: currentRole });

  const channels = useMemo(
    () =>
      cards
        .filter((c) => c.state !== "off")
        .map((card) => buildWeeklyChannel({ card, sessions: sessions.filter((s) => s.brandId === card.brandId && platformOf(s) === card.platform), from: bounds.from, to: bounds.to, today }))
        .sort((a, b) => b.range.target - a.range.target || b.range.actual - a.range.actual),
    [cards, sessions, bounds, today]
  );
  const brandOf = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const exportXlsx = () => {
    const num = (v: number | null) => (v == null || Number.isNaN(v) ? "" : Math.round(v * 1000) / 1000);
    downloadSheetsAsXlsx(
      [
        { name: "Tong quan", rows: channels.map((w) => ({ Account: w.name, "Sàn": w.platform, "Từ": w.from, "Đến": w.to, "Target tổng": w.range.target, "Thực đạt": w.range.actual, "% target tổng": num(w.range.pct), "Chênh": w.range.gap, "Giờ live": num(w.range.hours), "GMV/giờ": num(w.range.gmvPerHour), "Ca có số": w.range.sessions, "Ca chưa có số": w.range.waiting, "Ca huỷ": w.range.cancelled, "Target tháng": w.monthTotal.target, "Giữ nhịp cuối tháng": num(w.monthTotal.keepPace) })) },
        { name: "Theo ngay", rows: channels.flatMap((w) => w.days.map((d) => ({ Account: w.name, "Ngày": d.date, "Loại ngày": CAMP_DAY_BUCKET_LABEL[d.bucket], Target: d.target, "Thực đạt": d.state === "done" ? d.actual : "", "% target": num(d.pct), "Số ca": d.sessions, "Trạng thái": d.state === "done" ? "có số" : d.state === "waiting" ? "chưa có số" : "chưa tới" }))) },
        { name: "Theo dot", rows: channels.flatMap((w) => [...w.events.map((e) => ({ Account: w.name, "Đợt": `${CAMP_DAY_BUCKET_LABEL[e.bucket]} ${e.from}→${e.to}`, "Target cả đợt": e.target, "Thực đạt": e.actual, "% target": num(e.pct) })), { Account: w.name, "Đợt": "Ngày thường", "Target cả đợt": w.daily.target, "Thực đạt": w.daily.actual, "% target": num(w.daily.pct) }]) },
        { name: "Ca luu y va tot", rows: channels.flatMap((w) => [...w.weak.map((n) => ["Đáng lưu ý", n] as const), ...w.strong.map((n) => ["Tốt", n] as const)].map(([kind, n]) => ({ Account: w.name, Loại: kind, "Ngày": n.session.date, "Giờ": `${n.session.startTime.slice(0, 5)}-${n.session.endTime.slice(0, 5)}`, Host: n.session.hostName, Target: n.target, "Thực đạt": n.actual, "% target": num(n.pct), "GMV/giờ": num(n.gmvPerHour), "Chỉ số lệch nền": (kind === "Tốt" ? n.wins : n.breaks).map((m) => m.text).join("; ") }))) }
      ],
      `BaoCaoTuan_${platform}_${bounds.from}_${bounds.to}.xlsx`
    ).catch((e) => showToast(xlsxFailText(e)));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CalendarRange}
        title="Báo Cáo Tuần"
        description={<>Mỗi account một mục: target tổng, target/thực đạt từng ngày (ngày Campaign tô riêng), tổng từng đợt, ca đáng lưu ý và gãy ở chỉ số nào, ca tốt vì sao. Số lấy từ cùng Kế Hoạch Tháng đã chốt và run-rate của Dashboard — không tính lần thứ hai.</>}
        actions={
          <button onClick={exportXlsx} disabled={channels.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> Tải Excel
          </button>
        }
      />
      {(!block || block.first) && <WeeklyPeriodBar value={period} today={today} onChange={setPeriod} />}
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]"><Loader2 className="w-4 h-4 animate-spin" /> Đang nạp kế hoạch tháng…</p>
      ) : channels.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">Không có kênh {platform} nào có ca hoặc kế hoạch trong tháng này.</p>
      ) : (
        <>
          <SectionNav />
          <OverviewBlock list={channels} />
          {channels.map((w) => <ChannelSection key={w.key} w={w} brand={brandOf.get(w.brandId)} />)}
        </>
      )}
    </div>
  );
};
