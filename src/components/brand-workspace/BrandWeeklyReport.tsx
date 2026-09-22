import React, { useEffect, useMemo, useState } from "react";
import { LiveSession, ShiftSlot, UserRole } from "../../types";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Database, Loader2, Radio, TrendingDown, TrendingUp, Users } from "lucide-react";
import { formatCurrencyAdaptive } from "../../lib/formatCurrency";
import { DataRawWeekSlice, addDays, eachDay, fetchDataRawWeekSlice, isoWeekNumber, isoWeekStart } from "../../lib/dataraw/weeklySlice";
import { getTodayDate } from "../../lib/dateUtils";
import { byHost, filterSessions, sessionHours, splitUnassignedHost } from "../../lib/performance/hostPerformance";
import { hasLiveNumbers, monthRunRate } from "../../lib/report/sessionsLivePerf";
import { MissingStep, missingSteps } from "../../lib/sessionLedger";
import { DataSourceBadge } from "../common/DataSourceBadge";

interface BrandWeeklyReportProps {
  brandId: string;
  brandName: string;
  sessions: LiveSession[];
  currentRole: UserRole;
  shiftSlots?: ShiftSlot[]; // ca mở chưa có người tuần tới
}

const CAN_VIEW_ROLES: UserRole[] = ["ceo", "operations", "admin"];
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtH = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const fmtPct = (x: number | null, d = 0) => (x === null ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
const MISSING_LABEL: Record<MissingStep, string> = { snapshot: "chưa up file", report: "chưa report", reconcile: "chưa đối soát" };

// Report Tuần (làm lại 2026-09-21) — báo cáo VẬN HÀNH nội bộ, đọc-only, không draft/publish (Report
// Tháng mới là bản giao brand). Nguồn: `live_sessions` (ca có số: đối soát/snapshot/nạp bù) + target
// kế hoạch đã đổ xuống ca + shift_slots cho tuần tới. Dataraw (số TikTok toàn shop theo ngày) chỉ
// đặt cạnh để ops thấy GMV live chiếm bao nhiêu trong shop — không còn là nguồn chính.
export const BrandWeeklyReport: React.FC<BrandWeeklyReportProps> = ({ brandId, brandName, sessions, currentRole, shiftSlots = [] }) => {
  const today = getTodayDate();
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(today));
  const [slice, setSlice] = useState<DataRawWeekSlice | null>(null);
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const prevStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const prevEnd = useMemo(() => addDays(weekStart, -1), [weekStart]);
  const nextStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const nextEnd = useMemo(() => addDays(weekStart, 13), [weekStart]);
  const { week, year } = useMemo(() => isoWeekNumber(weekStart), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchDataRawWeekSlice(brandId, weekStart, weekEnd)
      .then((s) => !cancelled && setSlice(s))
      .catch(() => !cancelled && setSlice(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, weekStart, weekEnd]);

  const inRange = (from: string, to: string) => sessions.filter((s) => s.brandId === brandId && s.date >= from && s.date <= to);
  const weekSessions = useMemo(() => inRange(weekStart, weekEnd), [sessions, brandId, weekStart, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevSessions = useMemo(() => inRange(prevStart, prevEnd), [sessions, brandId, prevStart, prevEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextSessions = useMemo(() => inRange(nextStart, nextEnd).filter((s) => s.status !== "Cancelled"), [sessions, brandId, nextStart, nextEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = (list: LiveSession[]) => {
    const done = list.filter(hasLiveNumbers);
    const gmv = done.reduce((a, s) => a + (s.actualGmv ?? 0), 0);
    const hours = done.reduce((a, s) => a + sessionHours(s), 0);
    const orders = done.reduce((a, s) => a + (s.totalOrders ?? 0), 0);
    const views = done.reduce((a, s) => a + (s.totalViews ?? 0), 0);
    const clicks = done.reduce((a, s) => a + (s.productClicks ?? 0), 0);
    // "CTR live" phải cùng công thức với Report Tháng (lib/report/sessionsLivePerf.ts: views /
    // impressions). Bản cũ lấy productClicks / views nên cùng một cái tên mà hai màn ra hai số
    // (tuần 38: 50,6% ở đây vs 3,2% ở Tab 02) — audit 2026-09-21.
    const impressions = done.reduce((a, s) => a + (s.impressions ?? 0), 0);
    const productImpressions = done.reduce((a, s) => a + (s.productImpressions ?? 0), 0);
    const target = list.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + (s.targetGmv ?? 0), 0);
    const targetDone = done.reduce((a, s) => a + (s.targetGmv ?? 0), 0);
    return {
      done: done.length,
      cancelled: list.filter((s) => s.status === "Cancelled").length,
      noData: list.filter((s) => s.status === "Completed" && !hasLiveNumbers(s)).length,
      upcoming: list.filter((s) => s.status === "Upcoming" || s.status === "Live Now").length,
      gmv,
      hours,
      gmvPerHour: hours > 0 ? gmv / hours : 0,
      orders,
      aov: orders > 0 ? gmv / orders : 0,
      views,
      cvr: views > 0 ? orders / views : null,
      liveCtr: impressions > 0 ? views / impressions : null,
      productCtr: productImpressions > 0 ? clicks / productImpressions : null,
      target,
      targetDone,
      achieved: targetDone > 0 ? gmv / targetDone : null,
      reconciled: done.filter((s) => s.dataSource === "tiktok_reconciled").length,
      snapshot: done.filter((s) => s.dataSource === "live_snapshot").length,
      manual: done.filter((s) => s.dataSource === "manual").length
    };
  };
  const cur = useMemo(() => totals(weekSessions), [weekSessions]);
  const prev = useMemo(() => totals(prevSessions), [prevSessions]);
  const wow = (a: number, b: number) => (b > 0 ? a / b - 1 : null);

  // Run-rate tháng-tới-nay của tháng chứa cuối tuần đang xem.
  const monthKey = weekEnd.slice(0, 7);
  const monthRr = useMemo(() => {
    const [y, m] = monthKey.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return monthRunRate(sessions, brandId, `${monthKey}-01`, `${monthKey}-${String(last).padStart(2, "0")}`);
  }, [sessions, brandId, monthKey]);

  const days = useMemo(() => eachDay(weekStart, weekEnd), [weekStart, weekEnd]);
  const dailyRows = useMemo(
    () =>
      days.map((d, i) => {
        const list = weekSessions.filter((s) => s.date === d);
        const t = totals(list);
        const shop = slice?.daily.find((x) => x.date === d);
        return { date: d, dow: DOW[i], planned: list.filter((s) => s.status !== "Cancelled").length, ...t, shopGmv: shop?.gmv ?? null, shopFromLive: shop?.gmvFromLive ?? null };
      }),
    [days, weekSessions, slice]
  );

  const topSessions = useMemo(() => weekSessions.filter(hasLiveNumbers).sort((a, b) => (b.actualGmv ?? 0) - (a.actualGmv ?? 0)).slice(0, 5), [weekSessions]);
  // Ca chưa gán host không đứng chung bảng host (audit 2026-09-21) — hiện thành dòng nhắc riêng.
  const { ranked: hosts, unassigned: unassignedHost } = useMemo(
    () => splitUnassignedHost(byHost(filterSessions(weekSessions, {})).sort((a, b) => b.gmv - a.gmv)),
    [weekSessions]
  );
  const todo = useMemo(() => weekSessions.map((s) => ({ s, missing: missingSteps(s, today) })).filter((x) => x.missing.length > 0).sort((a, b) => a.s.date.localeCompare(b.s.date)), [weekSessions, today]);
  const nextOpenSlots = useMemo(() => shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && sl.date >= nextStart && sl.date <= nextEnd), [shiftSlots, brandId, nextStart, nextEnd]);
  const nextTarget = nextSessions.reduce((a, s) => a + (s.targetGmv ?? 0), 0);

  if (!CAN_VIEW_ROLES.includes(currentRole)) {
    return <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] text-sm text-[var(--text-muted)]">Bạn không có quyền xem Report Tuần.</div>;
  }

  const Kpi: React.FC<{ label: string; value: string; delta?: number | null; hint?: string; tone?: "good" | "bad" | "warn" }> = ({ label, value, delta, hint, tone }) => (
    <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--text-faint)]">{label}</p>
      <p className={`text-lg font-black mt-0.5 ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-300" : "text-[var(--text)]"}`}>{value}</p>
      {delta !== undefined && (
        <p className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${delta === null ? "text-[var(--text-faint)]" : delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
          {delta === null ? "tuần trước chưa có số" : <>{delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {fmtPct(Math.abs(delta))} so tuần trước</>}
        </p>
      )}
      {hint && <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10px] font-bold text-[var(--text-faint)] uppercase tracking-wider">Report Tuần · vận hành nội bộ</p>
            <h3 className="font-bold text-[var(--text)] text-lg flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-emerald-500" /> {brandName} — Tuần {week}/{year}
              <span className="text-sm font-normal text-[var(--text-muted)]">({fmtDay(weekStart)} → {fmtDay(weekEnd)})</span>
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tuần trước"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setWeekStart(isoWeekStart(today))} className="px-3 py-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]">Tuần này</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tuần sau"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          {weekSessions.length} ca trong tuần — {cur.done} có số ({cur.reconciled} đã đối soát{cur.snapshot > 0 ? `, ${cur.snapshot} số lúc giao ca` : ""}{cur.manual > 0 ? `, ${cur.manual} tự khai` : ""})
          {cur.noData > 0 && <> · <span className="text-amber-300">{cur.noData} đã qua chưa có số</span></>}
          {cur.upcoming > 0 && <> · {cur.upcoming} sắp tới</>}
          {cur.cancelled > 0 && <> · {cur.cancelled} huỷ</>}
        </p>
      </div>

      {/* KPI tuần */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="GMV tuần" value={formatCurrencyAdaptive(cur.gmv)} delta={wow(cur.gmv, prev.gmv)} tone={cur.gmv > 0 ? "good" : undefined} />
        <Kpi label="Target tuần" value={cur.target > 0 ? formatCurrencyAdaptive(cur.target) : "—"} hint={cur.achieved !== null ? `đạt ${fmtPct(cur.achieved)} trên ca đã xong` : cur.target > 0 ? "chưa có ca xong" : "chưa có kế hoạch đã chốt"} tone={cur.achieved === null ? undefined : cur.achieved >= 1 ? "good" : cur.achieved >= 0.9 ? "warn" : "bad"} />
        <Kpi label="Giờ live thật" value={fmtH(cur.hours)} delta={wow(cur.hours, prev.hours)} hint={`${cur.done} ca`} />
        <Kpi label="GMV / giờ" value={formatCurrencyAdaptive(cur.gmvPerHour)} delta={wow(cur.gmvPerHour, prev.gmvPerHour)} />
        <Kpi label="Đơn" value={fmtInt(cur.orders)} delta={wow(cur.orders, prev.orders)} hint={cur.aov > 0 ? `AOV ${formatCurrencyAdaptive(cur.aov)}` : undefined} />
        <Kpi label="View" value={fmtInt(cur.views)} delta={wow(cur.views, prev.views)} />
        <Kpi
          label="CVR (đơn/view)"
          value={fmtPct(cur.cvr, 2)}
          hint={[
            cur.liveCtr !== null ? `CTR live ${fmtPct(cur.liveCtr, 1)}` : null,
            cur.productCtr !== null ? `CTR sản phẩm ${fmtPct(cur.productCtr, 2)}` : null
          ]
            .filter(Boolean)
            .join(" · ") || undefined}
        />
        <Kpi
          label={`Run-rate tháng ${monthKey.slice(5, 7)}`}
          value={monthRr?.runRate === null || monthRr?.runRate === undefined ? "—" : fmtPct(monthRr.runRate)}
          hint={monthRr ? `${formatCurrencyAdaptive(monthRr.actualDone)} / ${formatCurrencyAdaptive(monthRr.targetTotal)} · dự kiến ${formatCurrencyAdaptive(monthRr.projected)}` : "tháng chưa có target"}
          tone={monthRr?.runRate == null ? undefined : monthRr.runRate >= 1 ? "good" : monthRr.runRate >= 0.9 ? "warn" : "bad"}
        />
      </div>

      {/* Theo ngày */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
        <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><Radio className="w-4 h-4 text-[var(--accent-text)]" /> Theo ngày</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-[var(--text-faint)] text-left text-[10px] uppercase tracking-wider">
                <th className="py-1.5 pr-2">Ngày</th>
                <th className="py-1.5 pr-2 text-right">Ca</th>
                <th className="py-1.5 pr-2 text-right">Giờ</th>
                <th className="py-1.5 pr-2 text-right">GMV live</th>
                <th className="py-1.5 pr-2 text-right">Target</th>
                <th className="py-1.5 pr-2 text-right">Đạt</th>
                <th className="py-1.5 pr-2 text-right">GMV/giờ</th>
                <th className="py-1.5 pr-2 text-right">Đơn</th>
                {slice?.hasAnyBatch && <th className="py-1.5 text-right" title="GMV toàn shop theo TikTok (Dữ Liệu Gốc)">Shop (TikTok)</th>}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.date} className={`border-t border-[var(--border)]/60 ${r.date === today ? "bg-[var(--accent)]/5" : ""}`}>
                  <td className="py-1.5 pr-2 font-mono text-[var(--text)]">{r.dow} {fmtDay(r.date)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.planned > 0 ? `${r.done}/${r.planned}` : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.hours > 0 ? fmtH(r.hours) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-bold text-[var(--text)]">{r.gmv > 0 ? formatCurrencyAdaptive(r.gmv) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-faint)]">{r.target > 0 ? formatCurrencyAdaptive(r.target) : "—"}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold ${r.achieved === null ? "text-[var(--text-faint)]" : r.achieved >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(r.achieved)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.gmvPerHour > 0 ? formatCurrencyAdaptive(r.gmvPerHour) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.orders > 0 ? fmtInt(r.orders) : "—"}</td>
                  {slice?.hasAnyBatch && (
                    <td className="py-1.5 text-right text-[var(--text-faint)]" title={r.shopFromLive !== null ? `GMV từ live theo TikTok: ${formatCurrencyAdaptive(r.shopFromLive)}` : undefined}>
                      {r.shopGmv !== null ? formatCurrencyAdaptive(r.shopGmv) : "thiếu file"}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--border)] font-bold">
                <td className="py-1.5 pr-2 text-[var(--text)]">Tuần</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{cur.done}/{weekSessions.filter((s) => s.status !== "Cancelled").length}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{fmtH(cur.hours)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text)]">{formatCurrencyAdaptive(cur.gmv)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-faint)]">{cur.target > 0 ? formatCurrencyAdaptive(cur.target) : "—"}</td>
                <td className={`py-1.5 pr-2 text-right ${cur.achieved === null ? "text-[var(--text-faint)]" : cur.achieved >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(cur.achieved)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{formatCurrencyAdaptive(cur.gmvPerHour)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{fmtInt(cur.orders)}</td>
                {slice?.hasAnyBatch && <td className="py-1.5 text-right text-[var(--text-faint)]">{formatCurrencyAdaptive(slice.daily.reduce((a, x) => a + x.gmv, 0))}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        {loading ? (
          <p className="text-[10px] text-[var(--text-faint)] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Đang đọc Dữ Liệu Gốc…</p>
        ) : slice?.hasAnyBatch ? (
          <p className="text-[10px] text-[var(--text-faint)] flex items-center gap-1">
            <Database className="w-3 h-3" /> Cột "Shop (TikTok)" = GMV toàn shop theo file Dữ Liệu Gốc, để thấy live chiếm bao nhiêu
            {slice.missingDays.length > 0 && <> · thiếu file {slice.missingDays.length} ngày ({slice.missingDays.map(fmtDay).join(", ")})</>}.
          </p>
        ) : (
          <p className="text-[10px] text-[var(--text-faint)]">Chưa có file Dữ Liệu Gốc tuần này — chỉ có số từ ca.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top ca */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm">Top ca tuần</h4>
          {topSessions.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào có số.</p>
          ) : (
            <ul className="space-y-1.5">
              {topSessions.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 text-xs bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
                  <span className="w-5 text-center font-black text-[var(--text-faint)]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[var(--text)]">{DOW[days.indexOf(s.date)] ?? ""} {fmtDay(s.date)} · {s.startTime}–{s.endTime}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{s.hostName || "chưa gán"}{s.coHostName ? ` · trợ ${s.coHostName}` : ""} · {fmtH(sessionHours(s))} · {fmtInt(s.totalOrders ?? 0)} đơn</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400">{formatCurrencyAdaptive(s.actualGmv)}</p>
                    <p className="text-[10px] text-[var(--text-faint)]">{formatCurrencyAdaptive(s.actualGmv / Math.max(0.5, sessionHours(s)))}/h{s.targetGmv > 0 ? ` · ${fmtPct(s.actualGmv / s.targetGmv)} target` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Host */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><Users className="w-4 h-4 text-[var(--accent-text)]" /> Host tuần này</h4>
          {unassignedHost && (
            <p className="text-[10px] text-amber-300">
              {unassignedHost.sessionCount} ca chưa gán host ({formatCurrencyAdaptive(unassignedHost.gmv)}) không tính vào bảng này.
            </p>
          )}
          {hosts.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào có số.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[var(--text-faint)] text-left text-[10px] uppercase tracking-wider">
                  <th className="py-1">Host</th>
                  <th className="py-1 text-right">Ca</th>
                  <th className="py-1 text-right">Giờ</th>
                  <th className="py-1 text-right">GMV</th>
                  <th className="py-1 text-right">GMV/giờ</th>
                </tr>
              </thead>
              <tbody>
                {hosts.map((h) => (
                  <tr key={h.key} className="border-t border-[var(--border)]/60">
                    <td className="py-1.5 text-[var(--text)] font-medium">{h.label}</td>
                    <td className="py-1.5 text-right text-[var(--text-muted)]">{h.sessionCount}</td>
                    <td className="py-1.5 text-right text-[var(--text-muted)]">{fmtH(h.hours)}</td>
                    <td className="py-1.5 text-right font-bold text-[var(--text)]">{formatCurrencyAdaptive(h.gmv)}</td>
                    <td className="py-1.5 text-right text-[var(--text-muted)]">{formatCurrencyAdaptive(h.gmvPerHour)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Việc còn thiếu */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-amber-400" /> Còn thiếu để chốt tuần {todo.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">{todo.length}</span>}</h4>
          {todo.length === 0 ? (
            <p className="text-xs text-emerald-400">Mọi ca đã qua đều đủ file · report · đối soát.</p>
          ) : (
            <ul className="space-y-1">
              {todo.map(({ s, missing }) => (
                <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-[var(--text)]">{fmtDay(s.date)} {s.startTime}–{s.endTime}</span>
                  <span className="text-[var(--text-muted)]">{s.hostName || "chưa gán"}</span>
                  <DataSourceBadge dataSource={s.dataSource} />
                  {missing.map((m) => (
                    <span key={m} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${m === "reconcile" ? "bg-sky-950 text-sky-300 border-sky-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>{MISSING_LABEL[m]}</span>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tuần tới */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm">Tuần tới ({fmtDay(nextStart)} → {fmtDay(nextEnd)})</h4>
          <p className="text-[11px] text-[var(--text-muted)]">
            {nextSessions.length} ca đã chốt{nextTarget > 0 ? ` · target ${formatCurrencyAdaptive(nextTarget)}` : ""}
            {nextOpenSlots.length > 0 && <> · <span className="text-rose-300 font-bold">{nextOpenSlots.length} ca chưa có người</span></>}
          </p>
          {nextSessions.length === 0 && nextOpenSlots.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Chưa có ca nào — chốt Kế Hoạch Tháng hoặc mở ca chờ đăng ký.</p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {[...nextSessions.map((s) => ({ key: s.id, date: s.date, time: `${s.startTime}–${s.endTime}`, who: s.hostName || "chưa gán", open: false, target: s.targetGmv ?? 0 })), ...nextOpenSlots.map((sl) => ({ key: sl.id, date: sl.date, time: `${sl.startTime}–${sl.endTime}`, who: "chờ đăng ký", open: true, target: 0 }))]
                .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                .map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[var(--text)]">{fmtDay(r.date)} {r.time}</span>
                    <span className={r.open ? "text-rose-300 font-bold" : "text-[var(--text-muted)]"}>{r.who}</span>
                    {r.target > 0 && <span className="ml-auto text-[var(--text-faint)]">{formatCurrencyAdaptive(r.target)}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
