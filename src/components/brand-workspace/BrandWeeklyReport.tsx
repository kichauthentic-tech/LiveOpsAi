import React, { useEffect, useMemo, useState } from "react";
import { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot, UserRole } from "../../types";
import { AlertTriangle, CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Database, Download, Loader2, Radio, TrendingDown, TrendingUp, Users } from "lucide-react";
import { fmtVndShort } from "../../lib/format";
import { metricHint } from "../../lib/metricGlossary";
import { downloadSheetsAsXlsx } from "../../lib/exportXlsx";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../lib/errorMessage";
import { DataRawWeekSlice, fetchDataRawWeekSlice } from "../../lib/dataraw/weeklySlice";
import { addDays, eachDay, isoWeekNumber, isoWeekStart } from "../../lib/dateUtils";
import { getTodayDate } from "../../lib/dateUtils";
import { filterSessions, sessionHours } from "../../lib/performance/hostPerformance";
import { metricSheetLabel, metricSheetValue, profileOf, type HostRankRow } from "../../lib/platforms/profiles";
import { channelTitle, platformOf, type ReportPlatform } from "../../lib/reportPlatform";
import { hasLiveNumbers, monthRunRate, monthRunRateFromPlan } from "../../lib/report/sessionsLivePerf";
import { planRunRate, projectMonthEnd } from "../../lib/performance/planRunRate";
import { lastDataDate, monthOutlook } from "../../lib/performance/ceoBrief";
import { fetchMonthPlan } from "../../lib/db/monthPlans";
import { effectiveCamp } from "../../lib/campaignDays";
import { MissingStep, missingSteps } from "../../lib/sessionLedger";
import { DataSourceBadge } from "../common/DataSourceBadge";
import { dataSourceTier } from "../../lib/dataSource";

interface BrandWeeklyReportProps {
  brandId: string;
  brandName: string;
  /** Sàn đang xem (bộ chuyển sàn của Brand workspace): mọi số, kế hoạch, ca mở của report chỉ thuộc sàn này. */
  platform: ReportPlatform;
  sessions: LiveSession[];
  currentRole: UserRole;
  shiftSlots?: ShiftSlot[]; // ca mở chưa có người tuần tới
  // Nút chuyển Tháng/Tuần của Report Tháng — đặt trong thẻ đầu trang này thay vì thành khối riêng phía trên (audit UX 2026-09-29).
  headerExtra?: React.ReactNode;
}

const CAN_VIEW_ROLES: UserRole[] = ["ceo", "operations", "admin"];
const DOW = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const fmtInt = (n: number) => Math.round(n).toLocaleString("vi-VN");
const fmtH = (n: number) => `${n.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
const fmtPct = (x: number | null, d = 0) => (x === null ? "—" : `${(x * 100).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`);
const MISSING_LABEL: Record<MissingStep, string> = { snapshot: "chưa up file", report: "chưa giao ca", reconcile: "chưa đối soát" };

// Hoisted ra module scope (react-hooks/static-components, audit 2026-09-24) — định nghĩa lại bên
// trong BrandWeeklyReport thì mỗi render tạo ra một component KHÁC (identity mới), React coi như
// unmount/remount toàn bộ 8 ô KPI thay vì chỉ update props.
const Kpi: React.FC<{ label: string; value: string; delta?: number | null; hint?: string; tone?: "good" | "bad" | "warn" }> = ({ label, value, delta, hint, tone }) => (
  <div className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-3">
    <p className="text-[11px] uppercase tracking-wider font-bold text-[var(--text-faint)]" title={metricHint(label)}>{label}</p>
    <p className={`text-lg font-black mt-0.5 ${tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-rose-400" : tone === "warn" ? "text-amber-300" : "text-[var(--text)]"}`}>{value}</p>
    {delta !== undefined && (
      <p className={`text-[11px] font-bold mt-0.5 flex items-center gap-1 ${delta === null ? "text-[var(--text-faint)]" : delta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
        {delta === null ? "tuần trước chưa có số" : <>{delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />} {fmtPct(Math.abs(delta))} so tuần trước</>}
      </p>
    )}
    {hint && <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{hint}</p>}
  </div>
);

// Report Tuần (làm lại 2026-09-21) — báo cáo VẬN HÀNH nội bộ, đọc-only, không draft/publish (Report
// Tháng mới là bản giao brand). Nguồn: `live_sessions` (ca có số: đối soát/snapshot/nạp bù) + target
// kế hoạch đã đổ xuống ca + shift_slots cho tuần tới. Dataraw (số TikTok toàn shop theo ngày) chỉ
// đặt cạnh để ops thấy GMV live chiếm bao nhiêu trong shop — không còn là nguồn chính.
export const BrandWeeklyReport: React.FC<BrandWeeklyReportProps> = ({ brandId, brandName, platform, sessions: allSessions, currentRole, shiftSlots: allShiftSlots = [], headerExtra }) => {
  const today = getTodayDate();
  const prof = profileOf(platform);
  // TikTok và Shopee là hai báo cáo riêng (user chốt 07/10): ca/slot của brand này chỉ giữ ĐÚNG SÀN.
  const sessions = useMemo(() => allSessions.filter((s) => s.brandId !== brandId || platformOf(s) === platform), [allSessions, brandId, platform]);
  const shiftSlots = useMemo(() => allShiftSlots.filter((sl) => sl.brandId !== brandId || platformOf(sl) === platform), [allShiftSlots, brandId, platform]);
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(today));
  const [sliceRaw, setSlice] = useState<DataRawWeekSlice | null>(null);
  const [loadingRaw, setLoading] = useState(true);
  // Total GMV theo ngày là file Shop Analytics của TikTok Shop — Shopee không có cột này (file theo ngày của Shopee ở Report Tháng).
  const slice = prof.hasShopAnalytics ? sliceRaw : null;
  const loading = prof.hasShopAnalytics && loadingRaw;

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const prevStart = useMemo(() => addDays(weekStart, -7), [weekStart]);
  const prevEnd = useMemo(() => addDays(weekStart, -1), [weekStart]);
  const nextStart = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const nextEnd = useMemo(() => addDays(weekStart, 13), [weekStart]);
  const { week, year } = useMemo(() => isoWeekNumber(weekStart), [weekStart]);

  useEffect(() => {
    let cancelled = false;
    if (!prof.hasShopAnalytics) return;
    setLoading(true);
    fetchDataRawWeekSlice(brandId, weekStart, weekEnd)
      .then((s) => !cancelled && setSlice(s))
      .catch(() => !cancelled && setSlice(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [brandId, weekStart, weekEnd, prof]);

  const inRange = (from: string, to: string) => sessions.filter((s) => s.brandId === brandId && s.date >= from && s.date <= to);
  const weekSessions = useMemo(() => inRange(weekStart, weekEnd), [sessions, brandId, weekStart, weekEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevSessions = useMemo(() => inRange(prevStart, prevEnd), [sessions, brandId, prevStart, prevEnd]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextSessions = useMemo(() => inRange(nextStart, nextEnd).filter((s) => s.status !== "Cancelled"), [sessions, brandId, nextStart, nextEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  // Run-rate tháng-tới-nay của tháng chứa cuối tuần đang xem.
  // Tháng có Kế Hoạch Tháng đã chốt ⇒ theo plan ban đầu (planRunRate, cùng số với Dashboard brand).
  const monthKey = weekEnd.slice(0, 7);
  // Kế hoạch của mọi tháng mà tuần trước / tuần này / tuần tới chạm vào — target tuần và target ca chờ đăng ký
  // lấy từ ca kế hoạch đã chốt (audit 2026-09-28 mục 4), không cộng ngược từ target các ca đang tồn tại.
  const planMonths = useMemo(() => [...new Set([prevStart, weekStart, weekEnd, nextEnd].map((d) => d.slice(0, 7)))], [prevStart, weekStart, weekEnd, nextEnd]);
  const [plans, setPlans] = useState<Map<string, { plan: BrandMonthPlan; slots: BrandMonthPlanSlot[] } | null>>(new Map());
  useEffect(() => {
    let alive = true;
    Promise.all(planMonths.map((m) => fetchMonthPlan(brandId, m, platform).catch(() => null))).then((rs) => {
      if (alive) setPlans(new Map(planMonths.map((m, i) => [m, rs[i]])));
    });
    return () => {
      alive = false;
    };
  }, [brandId, planMonths, platform]);
  const monthPlan = plans.get(monthKey) ?? null;
  const lockedPlanSlots = useMemo(
    () => [...plans.values()].flatMap((p) => (p?.plan.status === "locked" ? p.slots : [])),
    [plans]
  );
  const lockedMonths = useMemo(() => new Set([...plans.entries()].filter(([, p]) => p?.plan.status === "locked").map(([m]) => m)), [plans]);
  const planTargetByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const ps of lockedPlanSlots) m.set(ps.date, (m.get(ps.date) ?? 0) + Math.max(0, ps.targetGmv || 0));
    return m;
  }, [lockedPlanSlots]);
  const planTargetBySlotId = useMemo(() => new Map(lockedPlanSlots.filter((ps) => ps.slotId).map((ps) => [ps.slotId!, Math.max(0, ps.targetGmv || 0)])), [lockedPlanSlots]);
  const through = useMemo(() => lastDataDate(sessions.filter((s) => s.brandId === brandId), today), [sessions, brandId, today]);
  // Target một ngày: tháng có kế hoạch chốt ⇒ Σ target ca kế hoạch của ngày đó (ca huỷ GIỮ target — luật planRunRate);
  // tháng chưa chốt ⇒ như trước, Σ target các ca chưa huỷ.
  const targetOfDay = (d: string, daySessions: LiveSession[]) =>
    lockedMonths.has(d.slice(0, 7)) ? planTargetByDate.get(d) ?? 0 : daySessions.filter((s) => s.status !== "Cancelled").reduce((a, s) => a + (s.targetGmv ?? 0), 0);

  const totals = (list: LiveSession[], from: string, to: string) => {
    const done = list.filter(hasLiveNumbers);
    const gmv = done.reduce((a, s) => a + (s.actualGmv ?? 0), 0);
    const hours = done.reduce((a, s) => a + sessionHours(s), 0);
    const orders = done.reduce((a, s) => a + (s.totalOrders ?? 0), 0);
    // % Target = GMV ÷ target các ngày đã có số (≤ ngày cuối có số) — cùng luật run-rate tháng. Bản cũ chia cho
    // target của riêng các ca đã có số nên ca huỷ / ca chưa có file rơi khỏi mẫu số và % đẹp hơn thực tế.
    const days = eachDay(from, to);
    const target = days.reduce((a, d) => a + targetOfDay(d, list.filter((s) => s.date === d)), 0);
    const targetDone = days.filter((d) => through != null && d <= through).reduce((a, d) => a + targetOfDay(d, list.filter((s) => s.date === d)), 0);
    return {
      done: done.length,
      cancelled: list.filter((s) => s.status === "Cancelled").length,
      noData: list.filter((s) => s.status === "Completed" && !hasLiveNumbers(s)).length,
      upcoming: list.filter((s) => s.status === "Upcoming" || s.status === "Live Now").length,
      gmv,
      hours,
      gmvPerHour: hours > 0 ? gmv / hours : 0,
      orders,
      // Bộ chỉ số của sàn (hồ sơ sàn) — cùng hàm với Report Tháng / Dashboard / Hiệu Suất Host.
      m: prof.metrics.ofSessions(done, sessionHours),
      target,
      targetDone,
      achieved: targetDone > 0 ? gmv / targetDone : null,
      reconciled: done.filter((s) => dataSourceTier(s) === "reconciled").length,
      snapshot: done.filter((s) => dataSourceTier(s) === "handover").length,
      manual: done.filter((s) => dataSourceTier(s) === "manual").length
    };
  };
  const cur = useMemo(() => totals(weekSessions, weekStart, weekEnd), [weekSessions, weekStart, weekEnd, planTargetByDate, lockedMonths, through]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => totals(prevSessions, prevStart, prevEnd), [prevSessions, prevStart, prevEnd, planTargetByDate, lockedMonths, through]); // eslint-disable-line react-hooks/exhaustive-deps
  const wow = (a: number, b: number) => (b > 0 ? a / b - 1 : null);

  const monthRr = useMemo(() => {
    if (monthPlan?.plan.status === "locked" && monthPlan.plan.month === monthKey) {
      const bs = sessions.filter((s) => s.brandId === brandId);
      // Khung camp hiệu lực (effectiveCamp — cùng luật mọi màn): khung của Kế Hoạch Tháng.
      const camp = effectiveCamp(monthPlan.plan.campRanges);
      const rr = planRunRate(monthKey, monthPlan.slots, shiftSlots ?? [], bs, getTodayDate(), camp);
      const open = (shiftSlots ?? []).filter((sl) => sl.brandId === brandId && sl.status === "open" && !sl.sessionId);
      return monthRunRateFromPlan(rr, projectMonthEnd(rr, monthOutlook(monthKey, getTodayDate(), bs, open, null, camp)));
    }
    const [y, m] = monthKey.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return monthRunRate(sessions, brandId, `${monthKey}-01`, `${monthKey}-${String(last).padStart(2, "0")}`);
  }, [monthPlan, sessions, brandId, monthKey, shiftSlots]);

  const days = useMemo(() => eachDay(weekStart, weekEnd), [weekStart, weekEnd]);
  const dailyRows = useMemo(
    () =>
      days.map((d, i) => {
        const list = weekSessions.filter((s) => s.date === d);
        const t = totals(list, d, d);
        const shop = slice?.daily.find((x) => x.date === d);
        return { date: d, dow: DOW[i], planned: list.filter((s) => s.status !== "Cancelled").length, ...t, shopGmv: shop?.gmv ?? null, shopFromLive: shop?.gmvFromLive ?? null };
      }),
    [days, weekSessions, slice, planTargetByDate, lockedMonths, through] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const topSessions = useMemo(() => weekSessions.filter(hasLiveNumbers).sort((a, b) => (b.actualGmv ?? 0) - (a.actualGmv ?? 0)).slice(0, 5), [weekSessions]);
  // Ca chưa gán host không đứng chung bảng host (audit 2026-09-21) — hiện thành dòng nhắc riêng.
  const { ranked: hosts, unassigned: unassignedHost } = useMemo(() => {
    const r = prof.metrics.hostRanking(filterSessions(weekSessions, {}));
    return { ranked: [...r.ranked].sort((a, b) => b.gmv - a.gmv), unassigned: r.unassigned };
  }, [prof, weekSessions]);
  // Bảng Key Metrics: một dòng = một chỉ số, giá trị kỳ này / kỳ trước / từng host. Sàn quyết định bộ chỉ số.
  type MetricRow = { key: string; label: string; extra: boolean; goodWhenUp: boolean | null; fmt: (v: number | null) => string; cur: number | null; prev: number | null; host: (h: HostRankRow) => number | null };
  const metricRows: MetricRow[] = prof.metrics.defs.map((d) => ({
    key: d.key, label: d.label, extra: !!d.extra, goodWhenUp: d.goodWhenUp, fmt: (v) => prof.metrics.fmt(d, v),
    cur: prof.metrics.value(cur.m, d.key), prev: prof.metrics.value(prev.m, d.key),
    host: (h) => prof.metrics.value(h, d.key)
  }));
  const todo = useMemo(() => weekSessions.map((s) => ({ s, missing: missingSteps(s, today) })).filter((x) => x.missing.length > 0).sort((a, b) => a.s.date.localeCompare(b.s.date)), [weekSessions, today]);
  const nextOpenSlots = useMemo(() => shiftSlots.filter((sl) => sl.brandId === brandId && sl.status === "open" && sl.date >= nextStart && sl.date <= nextEnd), [shiftSlots, brandId, nextStart, nextEnd]);
  // Target tuần tới: cùng luật targetOfDay — ca kế hoạch chưa có người (ca chờ đăng ký) vẫn mang target của nó.
  const nextTarget = eachDay(nextStart, nextEnd).reduce((a, d) => a + targetOfDay(d, nextSessions.filter((s) => s.date === d)), 0);

  // Xuất Excel — đúng các bảng đang hiện trên màn (Theo ngày + Key Metrics tuần/host), không tính số mới.
  const { showToast } = useToast();
  const handleExport = () => {
    downloadSheetsAsXlsx(
      [
        {
          name: "Theo Ngay",
          rows: dailyRows.map((r) => ({
            "Ngày": `${r.dow} ${r.date}`,
            "Ca": r.planned > 0 ? `${r.done}/${r.planned}` : "",
            "Giờ live": Math.round(r.hours * 100) / 100,
            "LIVE GMV": Math.round(r.gmv),
            "Target GMV": Math.round(r.target),
            "% Target": r.achieved == null ? "" : Math.round(r.achieved * 10000) / 100,
            "GMV/giờ": Math.round(r.gmvPerHour),
            "Orders": r.orders,
            ...(slice?.hasAnyBatch ? { "Total GMV (TikTok)": r.shopGmv ?? "" } : {})
          }))
        },
        {
          name: "Key Metrics",
          rows: prof.metrics.defs.map((d) => ({
            "Chỉ số": metricSheetLabel(d),
            "Tuần này": metricSheetValue(prof.metrics.value(cur.m, d.key)),
            "Tuần trước": metricSheetValue(prof.metrics.value(prev.m, d.key))
          }))
        },
        {
          name: "Host Tuan Nay",
          rows: hosts.map((h) => ({
            "Host": h.label,
            "Sessions": h.sessionCount,
            ...Object.fromEntries(prof.metrics.defs.map((d) => [metricSheetLabel(d), metricSheetValue(prof.metrics.value(h, d.key))]))
          }))
        }
      ],
      `ReportTuan_${brandName}_tuan${week}-${year}.xlsx`.replace(/\s+/g, "_")
    ).catch((e) => showToast(`Không tải được file Excel: ${errorMessage(e)}`));
  };

  if (!CAN_VIEW_ROLES.includes(currentRole)) {
    return <div className="bg-[var(--surface)] p-6 rounded-2xl border border-[var(--border)] text-sm text-[var(--text-muted)]">Bạn không có quyền xem Report Tuần.</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-sm space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[11px] font-bold text-[var(--text-faint)] uppercase tracking-wider">Report Tuần · vận hành nội bộ</p>
            <h3 className="font-bold text-[var(--text)] text-lg flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-emerald-500" /> {channelTitle(brandName, platform, false)} — Tuần {week}/{year}
              <span className="text-sm font-normal text-[var(--text-muted)]">({fmtDay(weekStart)} → {fmtDay(weekEnd)})</span>
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {headerExtra}
            <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tuần trước"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setWeekStart(isoWeekStart(today))} className="px-3 py-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]">Tuần này</button>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tuần sau"><ChevronRight className="w-4 h-4" /></button>
            <button
              onClick={handleExport}
              title="Xuất Theo Ngày + Host Tuần Này ra Excel"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <Download className="w-3.5 h-3.5" /> Xuất Excel
            </button>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="LIVE GMV tuần" value={fmtVndShort(cur.gmv)} delta={wow(cur.gmv, prev.gmv)} tone={cur.gmv > 0 ? "good" : undefined} />
        <Kpi label="Target GMV tuần" value={cur.target > 0 ? fmtVndShort(cur.target) : "—"} hint={cur.achieved !== null ? `${fmtPct(cur.achieved)} Target tới ngày có số${through && through < weekEnd && through >= weekStart ? ` (${fmtDay(through)})` : ""}` : cur.target > 0 ? "chưa có ca xong" : "chưa có kế hoạch đã chốt"} tone={cur.achieved === null ? undefined : cur.achieved >= 1 ? "good" : cur.achieved >= 0.9 ? "warn" : "bad"} />
        <Kpi label="Giờ live" value={fmtH(cur.hours)} delta={wow(cur.hours, prev.hours)} hint={`${cur.done} ca`} />
        <Kpi label="GMV/giờ" value={fmtVndShort(cur.gmvPerHour)} delta={wow(cur.gmvPerHour, prev.gmvPerHour)} />
        <Kpi
          label={`Run-rate tháng ${monthKey.slice(5, 7)}`}
          value={monthRr?.runRate === null || monthRr?.runRate === undefined ? "—" : fmtPct(monthRr.runRate)}
          hint={monthRr ? `${fmtVndShort(monthRr.actualDone)} / ${fmtVndShort(monthRr.targetTotal)} · dự kiến ${fmtVndShort(monthRr.projected)}` : "tháng chưa có target"}
          tone={monthRr?.runRate == null ? undefined : monthRr.runRate >= 1 ? "good" : monthRr.runRate >= 0.9 ? "warn" : "bad"}
        />
      </div>

      {/* Theo ngày */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
        <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><Radio className="w-4 h-4 text-[var(--accent-text)]" /> Theo ngày</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-[var(--text-faint)] text-left text-[11px] uppercase tracking-wider">
                <th className="py-1.5 pr-2">Ngày</th>
                <th className="py-1.5 pr-2 text-right">Sessions</th>
                <th className="py-1.5 pr-2 text-right">Giờ live</th>
                <th className="py-1.5 pr-2 text-right">LIVE GMV</th>
                <th className="py-1.5 pr-2 text-right">Target GMV</th>
                <th className="py-1.5 pr-2 text-right">% Target</th>
                <th className="py-1.5 pr-2 text-right">GMV/giờ</th>
                <th className="py-1.5 pr-2 text-right">Orders</th>
                {slice?.hasAnyBatch && <th className="py-1.5 text-right" title="Total GMV theo TikTok (Dữ Liệu Gốc)">Total GMV (TikTok)</th>}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r) => (
                <tr key={r.date} className={`border-t border-[var(--border)]/60 ${r.date === today ? "bg-[var(--accent)]/5" : ""}`}>
                  <td className="py-1.5 pr-2 font-mono text-[var(--text)]">{r.dow} {fmtDay(r.date)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.planned > 0 ? `${r.done}/${r.planned}` : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.hours > 0 ? fmtH(r.hours) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-bold text-[var(--text)]">{r.gmv > 0 ? fmtVndShort(r.gmv) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-faint)]">{r.target > 0 ? fmtVndShort(r.target) : "—"}</td>
                  <td className={`py-1.5 pr-2 text-right font-bold ${r.achieved === null ? "text-[var(--text-faint)]" : r.achieved >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(r.achieved)}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.gmvPerHour > 0 ? fmtVndShort(r.gmvPerHour) : "—"}</td>
                  <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{r.orders > 0 ? fmtInt(r.orders) : "—"}</td>
                  {slice?.hasAnyBatch && (
                    <td className="py-1.5 text-right text-[var(--text-faint)]" title={r.shopFromLive !== null ? `Seller LIVE GMV theo TikTok: ${fmtVndShort(r.shopFromLive)}` : undefined}>
                      {r.shopGmv !== null ? fmtVndShort(r.shopGmv) : "thiếu file"}
                    </td>
                  )}
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--border)] font-bold">
                <td className="py-1.5 pr-2 text-[var(--text)]">Tuần</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{cur.done}/{weekSessions.filter((s) => s.status !== "Cancelled").length}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{fmtH(cur.hours)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text)]">{fmtVndShort(cur.gmv)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-faint)]">{cur.target > 0 ? fmtVndShort(cur.target) : "—"}</td>
                <td className={`py-1.5 pr-2 text-right ${cur.achieved === null ? "text-[var(--text-faint)]" : cur.achieved >= 1 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(cur.achieved)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{fmtVndShort(cur.gmvPerHour)}</td>
                <td className="py-1.5 pr-2 text-right text-[var(--text-muted)]">{fmtInt(cur.orders)}</td>
                {slice?.hasAnyBatch && <td className="py-1.5 text-right text-[var(--text-faint)]">{fmtVndShort(slice.daily.reduce((a, x) => a + x.gmv, 0))}</td>}
              </tr>
            </tbody>
          </table>
        </div>
        {loading ? (
          <p className="text-[11px] text-[var(--text-faint)] flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Đang đọc Dữ Liệu Gốc…</p>
        ) : slice?.hasAnyBatch ? (
          <p className="text-[11px] text-[var(--text-faint)] flex items-center gap-1">
            <Database className="w-3 h-3" /> Cột "Total GMV (TikTok)" = GMV mọi kênh của shop theo file Dữ Liệu Gốc, để thấy live chiếm bao nhiêu
            {slice.missingDays.length > 0 && <> · thiếu file {slice.missingDays.length} ngày ({slice.missingDays.map(fmtDay).join(", ")})</>}.
          </p>
        ) : (
          <p className="text-[11px] text-[var(--text-faint)]">Chưa có file Dữ Liệu Gốc tuần này — chỉ có số từ ca.</p>
        )}
      </div>

      <div>
        {/* Top ca */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm">Top ca tuần</h4>
          {topSessions.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic">Chưa có ca nào có số.</p>
          ) : (
            <ul className="grid grid-cols-1 lg:grid-cols-2 gap-1.5">
              {topSessions.map((s, i) => (
                <li key={s.id} className="flex items-center gap-2 text-xs bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
                  <span className="w-5 text-center font-black text-[var(--text-faint)]">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[var(--text)]">{DOW[days.indexOf(s.date)] ?? ""} {fmtDay(s.date)} · {s.startTime}–{s.endTime}</p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">{s.hostName || "chưa gán"}{s.coHostName ? ` · trợ ${s.coHostName}` : ""} · {fmtH(sessionHours(s))} · {fmtInt(s.totalOrders ?? 0)} đơn</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-emerald-400">{fmtVndShort(s.actualGmv)}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{fmtVndShort(s.actualGmv / Math.max(0.5, sessionHours(s)))}/h{s.targetGmv > 0 ? ` · ${fmtPct(s.actualGmv / s.targetGmv)} target` : ""}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      {/* Key Metrics tuần + từng host (thay bảng "Host tuần này" 4 cột) */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
        <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><Users className="w-4 h-4 text-[var(--accent-text)]" /> Key Metrics · tuần & host</h4>
        {unassignedHost && (
          <p className="text-[11px] text-amber-300">
            {unassignedHost.sessionCount} ca chưa gán host ({fmtVndShort(unassignedHost.gmv)}) có trong cột Tuần này nhưng không có cột host riêng.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[var(--text-faint)] text-left text-[11px] uppercase tracking-wider">
                <th className="py-1.5 pr-3">Chỉ số</th>
                <th className="py-1.5 pr-3 text-right">Tuần này</th>
                <th className="py-1.5 pr-3 text-right">Tuần trước</th>
                <th className="py-1.5 pr-3 text-right border-r border-[var(--border)]">±</th>
                {hosts.map((h) => <th key={h.key} className="py-1.5 px-2 text-right whitespace-nowrap normal-case">{h.label} · {h.sessionCount} ca</th>)}
              </tr>
            </thead>
            <tbody>
              {metricRows.map((d) => {
                const a = d.cur, b = d.prev;
                const chg = a != null && b != null && b !== 0 ? a / b - 1 : null;
                const tone = chg == null || d.goodWhenUp == null || Math.abs(chg) < 0.005 ? "text-[var(--text-faint)]" : chg > 0 === d.goodWhenUp ? "text-emerald-400" : "text-rose-400";
                return (
                  <tr key={d.key} className="border-t border-[var(--border)]/60">
                    <td className={`py-1.5 pr-3 whitespace-nowrap ${d.extra ? "text-[var(--text-faint)]" : "text-[var(--text)]"} font-medium`} title={metricHint(d.label)}>{d.label}</td>
                    <td className="py-1.5 pr-3 text-right font-bold text-[var(--text)] whitespace-nowrap">{d.fmt(a)}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--text-muted)] whitespace-nowrap">{d.fmt(b)}</td>
                    <td className={`py-1.5 pr-3 text-right font-bold whitespace-nowrap border-r border-[var(--border)] ${tone}`}>{chg == null ? "—" : `${chg >= 0 ? "+" : "−"}${fmtPct(Math.abs(chg))}`}</td>
                    {hosts.map((h) => <td key={h.key} className="py-1.5 px-2 text-right text-[var(--text-muted)] whitespace-nowrap">{d.fmt(d.host(h))}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-faint)]">± so tuần trước: xanh = tốt lên, đỏ = xấu đi, {prof.metricsLegend}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Việc còn thiếu */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-4 space-y-2">
          <h4 className="font-bold text-[var(--text)] text-sm flex items-center gap-2"><ClipboardList className="w-4 h-4 text-amber-400" /> Còn thiếu để chốt tuần {todo.length > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">{todo.length}</span>}</h4>
          {todo.length === 0 ? (
            <p className="text-xs text-emerald-400">Mọi ca đã qua đều đủ file · report · đối soát.</p>
          ) : (
            <ul className="space-y-1">
              {todo.map(({ s, missing }) => (
                <li key={s.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono text-[var(--text)]">{fmtDay(s.date)} {s.startTime}–{s.endTime}</span>
                  <span className="text-[var(--text-muted)]">{s.hostName || "chưa gán"}</span>
                  <DataSourceBadge dataSource={s.dataSource} platform={s.platform} />
                  {missing.map((m) => (
                    <span key={m} className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${m === "reconcile" ? "bg-sky-950 text-sky-300 border-sky-800" : "bg-amber-950 text-amber-300 border-amber-800"}`}>{MISSING_LABEL[m]}</span>
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
            {nextSessions.length} ca đã chốt{nextTarget > 0 ? ` · target tuần ${fmtVndShort(nextTarget)}` : ""}
            {nextOpenSlots.length > 0 && <> · <span className="text-rose-300 font-bold">{nextOpenSlots.length} ca chưa có người</span></>}
          </p>
          {nextSessions.length === 0 && nextOpenSlots.length === 0 ? (
            <p className="text-xs text-[var(--text-faint)] italic flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Chưa có ca nào — chốt Kế Hoạch Tháng hoặc mở ca chờ đăng ký.</p>
          ) : (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {[...nextSessions.map((s) => ({ key: s.id, date: s.date, time: `${s.startTime}–${s.endTime}`, who: s.hostName || "chưa gán", open: false, target: s.targetGmv ?? 0 })), ...nextOpenSlots.map((sl) => ({ key: sl.id, date: sl.date, time: `${sl.startTime}–${sl.endTime}`, who: "chờ đăng ký", open: true, target: planTargetBySlotId.get(sl.id) ?? 0 }))]
                .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
                .map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-[var(--text)]">{fmtDay(r.date)} {r.time}</span>
                    <span className={r.open ? "text-rose-300 font-bold" : "text-[var(--text-muted)]"}>{r.who}</span>
                    {r.target > 0 && <span className="ml-auto text-[var(--text-faint)]">{fmtVndShort(r.target)}</span>}
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};
