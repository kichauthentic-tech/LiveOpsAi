import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_ENGINE_PARAMS, type EngineParams } from "../lib/scheduling/engineParams";
import { defaultViewMonth } from "../lib/defaultMonth";
import { ChevronLeft, ChevronRight, LayoutDashboard } from "lucide-react";
import {
  Brand,
  BrandChannel,
  BrandMonthPlan,
  BrandMonthPlanSlot,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  LiveSession,
  SessionFinance,
  ShiftSlot,
  Talent,
  TalentRateHistoryEntry,
  UserRole
} from "../types";
import {
  Grain,
  MonthOutlook,
  PnlFn,
  Totals,
  buildIssues,
  combineOutlooks,
  financeOf,
  inRange,
  lastDataDate,
  monthOutlook,
  monthEndOf,
  monthTargetOf,
  nextMonthOf,
  periodFor,
  prevMonthOf,
  totalsOf
} from "../lib/performance/ceoBrief";
import { todayVn } from "../lib/performance/brandCommitment";
import { computeSessionPnl } from "../lib/pnl";
import { monthPlanRead, planStatusesRead } from "../lib/db/monthPlans";
import { recordForecastSnapshots } from "../lib/db/forecastSnapshots";
import { coneHalf } from "../lib/performance/forecastCone";
import { addDays, eachDay } from "../lib/dateUtils";
import { CampDayBucket, CampOverrides, effectiveCamp, resolveCampBucketType } from "../lib/campaignDays";
import { channelVerdict, dataCoverage, dataDiscipline, gmvTree, likeForLike, likeForLikeMany, nextWaveReadiness, peopleLoad, targetFeasibility } from "../lib/performance/channelHealth";
import { commitmentsRead, contractsRead } from "../lib/db/brandContracts";
import { computeCommitmentProgress, monthCommitmentOf } from "../lib/performance/brandCommitment";
import { MAX_RECOMMENDED_HOURS } from "./scheduling/TalentLoadTimeline";
import { isCountable, sessionHours } from "../lib/performance/hostPerformance";
import { handlingPlan, type HandlingPlan } from "../lib/performance/handlingPlan";
import { planRunRate, type PlanRunRate } from "../lib/performance/planRunRate";
import { profileOf } from "../lib/platforms/profiles";
import { PageIntro } from "./common/PageIntro";
import { MonthPicker } from "./common/MonthPicker";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { channelTitle, platformOf, brandMonthKey, brandPlatformKey, inPlatformScope, PLATFORM_SCOPE_LABEL, type ReportPlatform } from "../lib/reportPlatform";
import { platformsOfBrand } from "../lib/channels";
import { Card, Kpi, ddmm, hrs, money, num, pct, useTooltip } from "./dashboard/shared";
import { ThisMonth } from "./dashboard/ThisMonth";
import { Health } from "./dashboard/Health";
import { AgencyHealth } from "./dashboard/AgencyHealth";
import { FinanceSection } from "./dashboard/FinanceSection";
import type { ChannelHealth, DashModel } from "./dashboard/model";
import type { BrandContract, BrandMonthlyCommitment } from "../types";

// Dashboard agency. Làm lại 09/10/2026 (4 tab) rồi 10/10/2026 thành HAI tab theo đề xuất https://claude.ai/artifact/DKuM9K9dLJy1nTvFPPtYNX:
//   "Tháng này" (CEO): số tin tới đâu → mỗi kênh MỘT kết luận + nguyên nhân gốc → việc → chi tiết một kênh (cây GMV, thị trường hay mình,
//                      run-rate theo đợt, phương án, đi sâu ngày/ca). Gộp Overview + Deepdive + Action cũ.
//   "Sức khoẻ":       người, host/trợ so mặt bằng trong brand, xu hướng lưu lượng, cam kết giờ, kỷ luật dữ liệu, tiền.
// Luật số ở lib/performance/* (ceoBrief, channelHealth, planRunRate, forecastCone, handlingPlan); file này chỉ tính một lần rồi trình bày.
// "Hôm qua / Hôm nay / đang làm" là việc của Bảng Vận Hành, không còn ở màn CEO. Cắt mọi so sánh ở NGÀY ĐỦ SỐ (≥ 90% giờ ca có số);
// xem theo tháng thì mũi tên so CÙNG LOẠI NGÀY tháng trước (channelHealth.likeForLike), không so ngày lịch.
// Khối tiền chỉ ceo/admin thấy, và chỉ cộng ca ĐỦ dữ liệu để tính tiền. Mỗi sàn một khối riêng (App.perPlatformBlocks): không cộng GMV hai sàn.

interface CeoBriefProps {
  /** Sàn của workspace agency (07/10). */
  platform: ReportPlatform;
  sessions: LiveSession[];
  brands: Brand[];
  /** Kênh brand × sàn (0149) — nguồn duy nhất cho "brand chạy sàn nào". */
  brandChannels: BrandChannel[];
  talents: Talent[];
  shiftSlots: ShiftSlot[];
  /** brandMonthKey (brand × tháng × sàn) → target từng ca của Kế Hoạch Tháng đã chốt, gồm cả ca đã mất shift_slot (lỗi E2E #1). */
  planSlotTargets: Map<string, { date: string; target: number }[]>;
  planMonthTotals: Map<string, number>;
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  talentRateHistory: TalentRateHistoryEntry[];
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  /** Tham số engine (AI Training Center) — dự báo tháng v3 đọc nhóm `fc*`/`alloc*`. Thiếu = mặc định. */
  engineParams?: EngineParams;
}

type DashTab = "month" | "health";
const TAB_LABEL: Record<DashTab, string> = { month: "Tháng này", health: "Sức khoẻ" };

// Trạng thái kế hoạch tháng này + tháng sau — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts).
export function prefetchCeoBrief(_ctx: TabPrefetchCtx): void {
  const month = todayVn().slice(0, 7);
  planStatusesRead.prefetch(month);
  planStatusesRead.prefetch(nextMonthOf(month));
  commitmentsRead.prefetch();
  contractsRead.prefetch();
}

export default function CeoBrief(props: CeoBriefProps) {
  const { platform, sessions, brands, brandChannels, talents, shiftSlots, planSlotTargets, planMonthTotals, financeRecords, brandPlatformRates, brandPlatformRateHistory, talentRateHistory, currentRole, onNavigate } = props;
  const engineParams = props.engineParams ?? DEFAULT_ENGINE_PARAMS;
  const today = todayVn();
  const canSeeMoney = currentRole === "ceo" || currentRole === "admin";
  const [grain, setGrain] = useState<Grain>("month");
  // Mở tháng gần nhất có ca, không phải tháng của hôm nay (lib/defaultMonth.ts — audit người mới 2026-10-04).
  const [anchor, setAnchor] = useState(() => {
    const m = defaultViewMonth(today, sessions);
    return m === today.slice(0, 7) ? today : `${m}-01`;
  });
  const [customEnd, setCustomEnd] = useState(today);
  const [brandId, setBrandId] = useState<string>("all");
  const [tab, setTab] = useState<DashTab>("month");
  // Kênh đang mở chi tiết ở "Tháng này" (null = kênh cần xử lý nhất).
  const [channelPick, setChannelPick] = useState<string | null>(null);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [contracts, setContracts] = useState<BrandContract[]>([]);
  // Ca kế hoạch của các kênh đã CHỐT (brandId → ca) — nguồn của run-rate theo ca/ngày/đợt (planRunRate).
  const [planSlots, setPlanSlots] = useState<Map<string, BrandMonthPlanSlot[]>>(new Map());
  // Sàn do workspace agency quyết định (07/10): hai sàn không gộp được nên Bản Tin CEO chỉ có MỘT sàn, không có "cả 2 sàn".
  const [plans, setPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const [nextPlans, setNextPlans] = useState<Map<string, BrandMonthPlan>>(new Map());
  const tooltip = useTooltip();

  const scopeIds = useMemo(() => (brandId === "all" ? brands.map((b) => b.id) : [brandId]), [brandId, brands]);
  const platformSessions = useMemo(() => sessions.filter((s) => inPlatformScope(s, platform)), [sessions, platform]);
  const scopeSessions = useMemo(() => platformSessions.filter((s) => scopeIds.includes(s.brandId)), [platformSessions, scopeIds]);
  const dataEnd = useMemo(() => lastDataDate(scopeSessions, today), [scopeSessions, today]);
  // Ngày đủ số (≥ 90% giờ ca có số) — mọi kỳ cắt ở đây, không ở "ngày cuối có số bất kỳ" (10/10: 09/10 mới 6/21 ca có số).
  const completeEnd = useMemo(() => dataCoverage(scopeSessions, today).completeThrough ?? dataEnd, [scopeSessions, today, dataEnd]);
  const period = useMemo(() => periodFor(grain, anchor, today, completeEnd, customEnd), [grain, anchor, today, completeEnd, customEnd]);
  const month = (grain === "month" ? anchor : period.start).slice(0, 7);

  useEffect(() => {
    let alive = true;
    planStatusesRead.take(month).then((m) => alive && setPlans(m)).catch(() => alive && setPlans(new Map()));
    return () => { alive = false; };
  }, [month]);
  // Chỉ đọc ca kế hoạch của kênh ĐÃ CHỐT (kế hoạch nháp không có run-rate). Một request mỗi brand, dedupe với màn khác.
  useEffect(() => {
    let alive = true;
    const locked = brands.filter((b) => plans.get(brandPlatformKey(b.id, platform))?.status === "locked");
    if (locked.length === 0) return;
    Promise.all(locked.map((b) => monthPlanRead.take(b.id, month, platform).then((r): [string, BrandMonthPlanSlot[]] => [b.id, r?.slots ?? []]).catch((): [string, BrandMonthPlanSlot[]] => [b.id, []])))
      .then((rows) => alive && setPlanSlots(new Map(rows)));
    return () => { alive = false; };
  }, [plans, brands, platform, month]);
  useEffect(() => {
    let alive = true;
    planStatusesRead.take(nextMonthOf(today.slice(0, 7))).then((m) => alive && setNextPlans(m)).catch(() => alive && setNextPlans(new Map()));
    return () => { alive = false; };
  }, [today]);
  // Cam kết giờ (CRM / Kế Hoạch Tháng) cho khối "Cam kết giờ và kỷ luật dữ liệu". Lỗi đọc ⇒ coi như chưa có cam kết.
  useEffect(() => {
    let alive = true;
    commitmentsRead.take().then((x) => alive && setCommitments(x)).catch(() => alive && setCommitments([]));
    contractsRead.take().then((x) => alive && setContracts(x)).catch(() => alive && setContracts([]));
    return () => { alive = false; };
  }, []);

  // ---------- tiền ----------
  const pnl: PnlFn = useMemo(() => {
    const financeBySessionId = Object.fromEntries(financeRecords.map((f) => [f.sessionId, f]));
    const talentById = Object.fromEntries(talents.map((t) => [t.id, t]));
    const brandById = Object.fromEntries(brands.map((b) => [b.id, b]));
    return (s: LiveSession) => {
      const r = computeSessionPnl(s, financeBySessionId, talentById, brandById, brandPlatformRates, talentRateHistory, brandPlatformRateHistory);
      return { revenue: r.grossAgencyRev, cost: r.grossAgencyRev - r.netProfit, profit: r.netProfit, missing: r.missingInputs };
    };
  }, [financeRecords, talents, brands, brandPlatformRates, talentRateHistory, brandPlatformRateHistory]);

  // ---------- kênh, khung camp, dự phóng ----------
  // Mỗi kênh brand × sàn một outlook (target của kế hoạch ĐÚNG SÀN), rồi cộng theo brand trong phạm vi sàn đang xem.
  const channels = useMemo(
    () => brands.filter((b) => platformsOfBrand(brandChannels, b.id).includes(platform)).map((b) => ({ b, p: platform })),
    [brands, brandChannels, platform]
  );
  // Khung camp hiệu lực của từng kênh (kế hoạch đã chốt có thể nới D-Day, vd CROCS 08–11/10) — cùng luật mọi màn (effectiveCamp).
  const bucketOfCh = useMemo(() => {
    const out = new Map<string, (d: string) => CampDayBucket>();
    for (const { b, p } of channels) {
      const camp: CampOverrides = effectiveCamp(plans.get(brandPlatformKey(b.id, p))?.campRanges);
      out.set(b.id, (d: string) => resolveCampBucketType(d, camp));
    }
    return out;
  }, [channels, plans]);
  const channelOutlooks = useMemo(() => {
    const out = new Map<string, MonthOutlook>();
    for (const { b, p } of channels) {
      const key = brandMonthKey(b.id, month, p);
      const plan = plans.get(brandPlatformKey(b.id, p));
      // Cùng luật khung camp với mọi màn (effectiveCamp).
      const camp: CampOverrides = effectiveCamp(plan?.campRanges);
      const lockedSlotTargets = planSlotTargets.get(key) ?? [];
      const target = monthTargetOf(month, planMonthTotals.get(key), lockedSlotTargets);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      const open = shiftSlots.filter((sl) => sl.brandId === b.id && platformOf(sl) === p && sl.status === "open" && !sl.sessionId);
      out.set(brandPlatformKey(b.id, p), monthOutlook(month, today, chSessions, open, target, camp, engineParams));
    }
    return out;
  }, [channels, plans, month, shiftSlots, planSlotTargets, planMonthTotals, sessions, today, engineParams]);
  const outlooks = useMemo(() => {
    const out = new Map<string, MonthOutlook>();
    for (const b of brands) {
      const parts = channels.filter((c) => c.b.id === b.id).map((c) => channelOutlooks.get(brandPlatformKey(b.id, c.p))!).filter(Boolean);
      if (parts.length) out.set(b.id, parts.length === 1 ? parts[0] : combineOutlooks(month, today, parts));
    }
    return out;
  }, [brands, channels, channelOutlooks, month, today]);
  const scopeOutlook = useMemo(() => combineOutlooks(month, today, scopeIds.map((id) => outlooks.get(id)!).filter(Boolean)), [month, today, scopeIds, outlooks]);
  const multiPlatform = (id: string) => platformsOfBrand(brandChannels, id).length > 1;
  const channelName = (b: Brand, p: ReportPlatform) => channelTitle(b.name, p, multiPlatform(b.id));

  // ---------- kỳ đang xem ----------
  const hasPeriod = period.end >= period.start;
  const curSessions = useMemo(() => (hasPeriod ? inRange(scopeSessions, period.start, period.end) : []), [scopeSessions, period, hasPeriod]);
  const prevSessions = useMemo(() => inRange(scopeSessions, period.prevStart, period.prevEnd), [scopeSessions, period]);
  // Xem theo tháng: mũi tên so CÙNG LOẠI NGÀY tháng trước (ngày thường thứ k ↔ thứ k, đợt camp cùng vị trí; mỗi kênh theo khung camp của nó).
  const lfl = useMemo(
    () =>
      grain === "month" && hasPeriod
        ? likeForLikeMany(
            channels.filter(({ b }) => scopeIds.includes(b.id)).map(({ b }) => ({ sessions: platformSessions.filter((s) => s.brandId === b.id), bucketCur: bucketOfCh.get(b.id)! })),
            month,
            period.end
          )
        : null,
    [grain, hasPeriod, channels, scopeIds, platformSessions, bucketOfCh, month, period.end]
  );
  const cmpCurSessions = lfl ? lfl.cur : curSessions;
  const cmpPrevSessions = lfl ? lfl.prev : prevSessions;
  const cur = useMemo(() => totalsOf(curSessions), [curSessions]);
  const noCur = curSessions.length === 0;
  const prev = useMemo(() => totalsOf(prevSessions), [prevSessions]);
  const cmpCur = useMemo(() => totalsOf(cmpCurSessions), [cmpCurSessions]);
  const cmpPrev = useMemo(() => totalsOf(cmpPrevSessions), [cmpPrevSessions]);
  const fin = useMemo(() => (canSeeMoney ? financeOf(curSessions, pnl) : null), [canSeeMoney, curSessions, pnl]);
  const finPrev = useMemo(() => (canSeeMoney ? financeOf(prevSessions, pnl) : null), [canSeeMoney, prevSessions, pnl]);

  const sparkDays = useMemo(() => {
    if (!hasPeriod) return [];
    const from = grain === "day" || period.end === period.start ? addDays(period.end, -13) : period.start;
    return eachDay(from, period.end);
  }, [grain, period, hasPeriod]);
  // Bộ chỉ số của sàn đang xem (hồ sơ sàn) — ô phễu đọc từ đây, không rẽ nhánh theo tên sàn.
  const prof = profileOf(platform);
  const metricsOf = (xs: LiveSession[]) => prof.metrics.ofSessions(xs.filter(isCountable), sessionHours);
  const curM = useMemo(() => metricsOf(curSessions), [curSessions, prof]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpCurM = useMemo(() => metricsOf(cmpCurSessions), [cmpCurSessions, prof]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmpPrevM = useMemo(() => metricsOf(cmpPrevSessions), [cmpPrevSessions, prof]); // eslint-disable-line react-hooks/exhaustive-deps
  // Line theo ngày của kỳ đang xem + đường nét đứt kỳ so sánh. Tháng: ngày i ↔ ngày cùng loại tháng trước; kỳ khác: lùi cùng số ngày.
  const prevOffset = hasPeriod ? eachDay(period.prevStart, period.start).length - 1 : 0;
  const sparkBuckets = (days: string[]) => {
    const byDate = new Map<string, LiveSession[]>();
    for (const s of scopeSessions) if (s.date >= (days[0] ?? "9") && s.date <= (days[days.length - 1] ?? "")) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
    return byDate;
  };
  const strictPrev = !(grain === "day" || period.end === period.start); // xem 1 ngày: line 14 ngày gần nhất, kỳ trước lùi cùng số ngày, không cắt theo prevEnd
  const sparkOf = (pick: (xs: LiveSession[]) => number | null) => {
    const curBy = sparkBuckets(sparkDays);
    if (lfl) return { series: sparkDays.map((d) => pick(curBy.get(d) ?? []) ?? 0), prevSeries: sparkDays.map((d) => (lfl.prevByCurDay.has(d) ? pick(lfl.prevByCurDay.get(d)!) ?? 0 : null)) };
    const prevDays = sparkDays.map((d) => addDays(d, -prevOffset));
    const prevBy = sparkBuckets(prevDays);
    return {
      series: sparkDays.map((d) => pick(curBy.get(d) ?? []) ?? 0),
      prevSeries: prevDays.map((d) => (strictPrev && (d < period.prevStart || d > period.prevEnd) ? null : pick(prevBy.get(d) ?? []) ?? 0)),
    };
  };
  const seriesM = (key: string) => sparkOf((xs) => prof.metrics.value(metricsOf(xs), key));
  const series = (pick: (t: Totals) => number | null) => sparkOf((xs) => pick(totalsOf(xs)));

  // Sổ độ chính xác dự báo (0163, engine target v3 P7): khi ceo/ops/admin xem THÁNG NÀY, ghi dự phóng của từng kênh cho hôm nay
  // (mở nhiều lần thì DB ghi đè dòng của ngày). Mỗi kênh tối đa một lần ghi cho mỗi (ngày, số dự phóng) trong phiên. Lỗi ghi không
  // làm hỏng Dashboard — chỉ mất một dòng sổ.
  const ledgerWritten = useRef(new Set<string>());
  useEffect(() => {
    if (!["ceo", "operations", "admin"].includes(currentRole) || month !== today.slice(0, 7)) return;
    const rows = channels
      .map(({ b, p }) => ({ b, p, o: channelOutlooks.get(brandPlatformKey(b.id, p)) }))
      .filter((x): x is { b: Brand; p: ReportPlatform; o: MonthOutlook } => !!x.o && x.o.forecastModel === "shape" && x.o.projectionMethod !== "none" && (x.o.actual > 0 || x.o.pending.length > 0))
      .map(({ b, p, o }) => {
        const half = coneHalf(o.actual, o.projected, o.coneCoef);
        return { brandId: b.id, platform: p, month, asOf: today, kind: "daily" as const, p50: o.projected, lo: o.projected - half, hi: o.projected + half, actual: o.actual, target: o.target?.total ?? null, seenShare: o.shape?.seenShare ?? null, ratio: o.shape?.ratio ?? null };
      })
      .filter((r) => !ledgerWritten.current.has(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    if (rows.length === 0) return;
    rows.forEach((r) => ledgerWritten.current.add(`${r.brandId}|${r.platform}|${r.asOf}|${Math.round(r.p50)}`));
    recordForecastSnapshots(rows).catch((e) => console.warn("Ghi sổ dự báo không được:", e));
  }, [channelOutlooks, channels, currentRole, month, today]);

  const issues = useMemo(
    () =>
      buildIssues({
        today,
        // Cảnh báo theo từng kênh brand × sàn: cộng hai sàn thì sàn tụt bị sàn chạy tốt che mất.
        brands: channels
          .filter(({ b }) => scopeIds.includes(b.id))
          .map(({ b, p }) => ({
            brandId: b.id,
            name: channelName(b, p),
            clientName: b.name,
            platform: p,
            outlook: channelOutlooks.get(brandPlatformKey(b.id, p))!,
            lastData: lastDataDate(sessions.filter((s) => s.brandId === b.id && platformOf(s) === p), today),
            nextPlan: nextPlans.get(brandPlatformKey(b.id, p))?.status ?? null
          })),
        periodSessions: curSessions,
        finance: fin,
        agencyScope: brandId === "all",
        fmt: money
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- channelName chỉ đọc `channels`
    [today, channels, scopeIds, channelOutlooks, sessions, nextPlans, curSessions, fin, brandId]
  );

  // ---------- điều khiển kỳ ----------
  const shift = (dir: -1 | 1) => {
    if (grain === "day") setAnchor(addDays(anchor, dir));
    else if (grain === "week") setAnchor(addDays(anchor, dir * 7));
    else if (grain === "month") setAnchor(`${dir < 0 ? prevMonthOf(anchor.slice(0, 7)) : nextMonthOf(anchor.slice(0, 7))}-01`);
  };
  const pickGrain = (g: Grain) => {
    setGrain(g);
    if (g === "day") setAnchor(completeEnd && completeEnd < today ? completeEnd : addDays(today, -1));
    else if (g === "custom") { setAnchor(`${today.slice(0, 7)}-01`); setCustomEnd(today); }
    else setAnchor(today);
  };
  const periodLabel = !hasPeriod
    ? "Kỳ này chưa có số"
    : grain === "day"
      ? `Ngày ${ddmm(period.start)}`
      : grain === "month"
        ? `Tháng ${Number(month.slice(5))}/${month.slice(0, 4)} · ${ddmm(period.start)}–${ddmm(period.end)}`
        : `${ddmm(period.start)} → ${ddmm(period.end)}`;
  const compareLabel = grain === "day" ? `so với cùng thứ tuần trước (${ddmm(period.prevStart)})` : grain === "month" ? "so cùng loại ngày tháng trước (ngày thường ↔ ngày thường, đợt camp cùng vị trí)" : `so với ${ddmm(period.prevStart)}–${ddmm(period.prevEnd)}`;
  const canNext = grain === "custom" ? false : grain === "day" ? anchor < today : period.calendarEnd < today;
  const inputCls = "bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]";
  const stale = completeEnd != null && completeEnd < addDays(today, -1);
  // ---------- run-rate theo kế hoạch đã chốt + phương án xử lý (từng kênh) ----------
  const planRR = useMemo(() => {
    const out = new Map<string, PlanRunRate>();
    for (const { b, p } of channels) {
      const slots = planSlots.get(b.id);
      if (!slots || slots.length === 0 || plans.get(brandPlatformKey(b.id, p))?.status !== "locked") continue;
      const camp: CampOverrides = effectiveCamp(plans.get(brandPlatformKey(b.id, p))?.campRanges);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      out.set(b.id, planRunRate(month, slots, shiftSlots.filter((sl) => sl.brandId === b.id), chSessions, today, camp));
    }
    return out;
  }, [channels, planSlots, plans, sessions, shiftSlots, month, today]);
  const handling = useMemo(() => {
    const out = new Map<string, HandlingPlan>();
    for (const { b, p } of channels) {
      const o = channelOutlooks.get(brandPlatformKey(b.id, p));
      if (!o || (o.actual <= 0 && o.pending.length === 0)) continue;
      const camp: CampOverrides = effectiveCamp(plans.get(brandPlatformKey(b.id, p))?.campRanges);
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      const plan = plans.get(brandPlatformKey(b.id, p));
      out.set(b.id, handlingPlan({ outlook: o, today, sessions: chSessions, camp, slotHours: plan?.defaultSlotHours, checkpointCap: engineParams.fcCheckpointCap }));
    }
    return out;
  }, [channels, channelOutlooks, plans, sessions, today, engineParams.fcCheckpointCap]);

  // ---------- sức khoẻ từng kênh (lib/performance/channelHealth.ts) ----------
  const health = useMemo(() => {
    const out = new Map<string, ChannelHealth>();
    const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
    for (const { b, p } of channels) {
      const o = channelOutlooks.get(brandPlatformKey(b.id, p));
      if (!o) continue;
      const bucketOf = bucketOfCh.get(b.id)!;
      const chSessions = sessions.filter((s) => s.brandId === b.id && platformOf(s) === p);
      const coverage = dataCoverage(chSessions, today, mStart, mEnd);
      const plan = plans.get(brandPlatformKey(b.id, p));
      const locked = plan?.status === "locked";
      const feasibility = locked ? targetFeasibility(chSessions, month, planSlots.get(b.id) ?? []) : null;
      const tree = gmvTree(profileOf(platform).metrics, likeForLike(chSessions, month, coverage.completeThrough, bucketOf, undefined, (k) => k === "daily"));
      const openByDate = new Map<string, number>();
      for (const x of o.pending) if (x.kind === "open_slot") openByDate.set(x.date, (openByDate.get(x.date) ?? 0) + x.hours);
      const wave = month === today.slice(0, 7) ? nextWaveReadiness(chSessions, openByDate, month, today, bucketOf) : null;
      const mc = monthCommitmentOf(commitments, contracts, b.id, p, mStart);
      const commitment = mc.source === "none" || mc.hours <= 0
        ? null
        : computeCommitmentProgress({ id: mc.row?.id ?? "", brandId: b.id, platform: p, periodMonth: mStart, committedHours: mc.hours, committedGmv: mc.gmv, isOverride: mc.source === "month" }, b.name, chSessions, today);
      out.set(b.id, {
        coverage,
        feasibility,
        tree,
        wave,
        verdict: channelVerdict({ outlook: o, coverage, feasibility, tree, wave, today }),
        discipline: dataDiscipline({
          coverage,
          today,
          monthSessions: chSessions.filter((s) => s.date >= mStart && s.date <= mEnd),
          commitmentHours: mc.source === "none" ? null : mc.hours,
          planTarget: locked ? plan!.targetGmv : null,
          planSlotSum: locked ? planMonthTotals.get(brandMonthKey(b.id, month, p)) ?? null : null
        }),
        commitment,
        bucketOf
      });
    }
    return out;
  }, [channels, channelOutlooks, bucketOfCh, sessions, today, month, plans, planSlots, platform, commitments, contracts, planMonthTotals]);
  const coverage = useMemo(() => dataCoverage(scopeSessions, today, `${month}-01`, monthEndOf(`${month}-01`)), [scopeSessions, today, month]);
  // Tải người: số vận hành nên tính cả hai sàn (một người là một người); phạm vi brand thì chỉ ca của brand đó.
  const people = useMemo(
    () => peopleLoad(sessions.filter((s) => brandId === "all" || s.brandId === brandId), `${month}-01`, monthEndOf(`${month}-01`), (s) => channelTitle(s.brandName, platformOf(s), platformsOfBrand(brandChannels, s.brandId).length > 1), MAX_RECOMMENDED_HOURS),
    [sessions, brandId, month, brandChannels]
  );

  const scopedBrands = useMemo(() => brands.filter((b) => scopeIds.includes(b.id)), [brands, scopeIds]);
  const model: DashModel = {
    platform, today, month, brands, scopeIds, platformSessions, scopeSessions, outlooks, scopeOutlook, planRR, handling, health, coverage,
    cur, prev, cmp: { cur: cmpCur, prev: cmpPrev }, issues, channelName: (b) => channelName(b, platform)
  };

  // Ô tiền chỉ dựng khi đã tính được ít nhất một ca — chưa nhập rate thì khối Tài chính ở tab Sức khoẻ nói còn thiếu gì.
  const showMoney = canSeeMoney && !!fin && fin.priced > 0;
  const kpi = (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      <Kpi empty={noCur} label="LIVE GMV" value={money(cur.gmv)} cur={cmpCur.gmv} prev={cmpPrev.gmv} extra={`${num(cur.sessions)} ca`} {...series((t) => t.gmv)} />
      <Kpi empty={noCur} label="Giờ live" value={hrs(cur.hours)} cur={cmpCur.hours} prev={cmpPrev.hours} {...series((t) => t.hours)} />
      <Kpi empty={noCur} label="GMV/giờ" value={money(cur.gmvPerHour)} cur={cmpCur.gmvPerHour} prev={cmpPrev.gmvPerHour} {...series((t) => t.gmvPerHour)} />
      <Kpi empty={noCur} label="Orders" value={prof.metrics.value(curM, "orders") == null ? "—" : num(cur.orders)} cur={cmpCur.orders} prev={cmpPrev.orders} extra={cur.aov ? `${prof.basketLabel} ${money(cur.aov)}` : undefined} {...series((t) => t.orders)} />
      {prof.briefKpis.map(({ key, label }) => {
        const def = prof.metrics.defs.find((d) => d.key === key)!;
        const c = prof.metrics.value(curM, key);
        return <Kpi key={key} empty={noCur} label={label} value={prof.metrics.fmt(def, c)} cur={prof.metrics.value(cmpCurM, key) ?? 0} prev={prof.metrics.value(cmpPrevM, key) ?? 0} {...seriesM(key)} />;
      })}
      {showMoney && (
        <>
          <Kpi label="Doanh thu agency" value={money(fin!.revenue)} cur={fin!.revenue} prev={finPrev?.priced ? finPrev.revenue : null} extra={`${fin!.priced}/${fin!.sessions} ca đủ dữ liệu`} locked />
          <Kpi label="Lãi gộp" value={money(fin!.profit)} cur={fin!.profit} prev={finPrev?.priced ? finPrev.profit : null} extra={fin!.margin != null ? `biên ${pct(fin!.margin)}` : undefined} locked />
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-5 sm:space-y-7" onMouseMove={tooltip.onMove} onMouseLeave={tooltip.onLeave}>
      {tooltip.node}

      {/* Đầu trang + bộ lọc */}
      <Card className="!p-4 sm:!p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-[var(--accent-text)]" /> Dashboard
            </h2>
            <PageIntro>
              Mỗi kênh về đâu cuối tháng và vì sao, việc gì cần làm, rồi sức khoẻ agency: người, khách, dữ liệu{canSeeMoney ? ", tiền" : ""}. Mọi so sánh cắt ở ngày đủ số và so cùng loại ngày.
            </PageIntro>
          </div>
          <span
            className={`self-start shrink-0 text-xs font-bold px-3 py-1.5 rounded-full ${stale ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}
            title="Ngày cuối mà ít nhất 90% giờ ca đã chạy có số, trong phạm vi brand đang xem"
          >
            {completeEnd ? `● Số đủ tới ${ddmm(completeEnd)}${stale ? " — còn ca chờ số" : ""}` : "Chưa có số liệu"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-[var(--surface-base)] border border-[var(--border)] rounded-xl p-1" role="group" aria-label="Kỳ xem">
            {(["day", "week", "month", "custom"] as Grain[]).map((g) => (
              <button
                key={g}
                onClick={() => pickGrain(g)}
                aria-pressed={grain === g}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${grain === g ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}
              >
                {{ day: "Ngày", week: "Tuần", month: "Tháng", custom: "Tuỳ chọn" }[g]}
              </button>
            ))}
          </div>
          {grain !== "custom" && (
            <div className="inline-flex items-center gap-1">
              <button onClick={() => shift(-1)} className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Kỳ trước"><ChevronLeft className="w-4 h-4" /></button>
              {grain === "day" && <input type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${inputCls} font-mono`} aria-label="Ngày" />}
              {grain === "month" && <MonthPicker value={anchor.slice(0, 7)} max={today.slice(0, 7)} onChange={(m) => setAnchor(`${m}-01`)} arrows={false} ariaLabel="Tháng" />}
              {grain === "week" && <span className="px-2 text-sm font-bold text-[var(--text)]">{ddmm(period.start)} – {ddmm(period.calendarEnd)}</span>}
              <button onClick={() => shift(1)} disabled={!canNext} className="p-2 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-30" aria-label="Kỳ sau"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
          {grain === "custom" && (
            <div className="inline-flex items-center gap-1.5 text-sm text-[var(--text-faint)]">
              <input type="date" value={anchor} max={today} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${inputCls} font-mono`} aria-label="Từ ngày" />→
              <input type="date" value={customEnd} max={today} onChange={(e) => e.target.value && setCustomEnd(e.target.value)} className={`${inputCls} font-mono`} aria-label="Đến ngày" />
            </div>
          )}
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className={inputCls} aria-label="Brand">
            <option value="all">Tất cả brand</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Đang xem <b className="text-[var(--text)]">{periodLabel}</b>
          {" · "}<b className="text-[var(--text)]">{PLATFORM_SCOPE_LABEL[platform]}</b>
          {hasPeriod && <> · mũi tên {compareLabel} · nét đứt trên biểu đồ nhỏ = kỳ so sánh</>}
          {period.cutByData && <span className="text-amber-300"> · kỳ cắt tới {ddmm(period.end)} vì sau ngày đó chưa đủ 90% giờ ca có số</span>}
        </p>
        <div className="flex flex-wrap gap-1 border-t border-[var(--border)] pt-3" role="tablist" aria-label="Phần của Dashboard">
          {(Object.keys(TAB_LABEL) as DashTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-bold transition-colors ${tab === t ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]/40"}`}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </Card>

      {tab === "month" && (
        <ThisMonth m={model} kpi={kpi} selected={channelPick} onSelect={setChannelPick} onNavigate={onNavigate} canReadShop={["ceo", "operations", "admin"].includes(currentRole)} />
      )}
      {tab === "health" && (
        <Health
          m={model}
          people={people}
          dayLimit={MAX_RECOMMENDED_HOURS}
          weekLimit={engineParams.fatigueWeekHours}
          agencyTiles={<AgencyHealth m={model} curSessions={curSessions} onNavigate={onNavigate} />}
          finance={canSeeMoney && fin ? <FinanceSection fin={fin} finPrev={finPrev} sessions={curSessions} brands={scopedBrands} pnl={pnl} period={period} onNavigate={onNavigate} /> : null}
        />
      )}
    </div>
  );
}

