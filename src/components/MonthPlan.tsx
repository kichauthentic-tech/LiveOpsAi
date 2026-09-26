import React, { useEffect, useMemo, useState } from "react";
import { Brand, BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyCommitment, BrandStudio, CalendarEventRow, LiveSession, PlanCampRanges, PromoScheme, RecurringShiftTemplate, ShiftSlot, Studio } from "../types";
import { AlertTriangle, Ban, CalendarRange, ChevronLeft, ChevronRight, Lock, Plus, Repeat, Save, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import { errorMessage } from "../lib/errorMessage";
import { PlanSettings, deleteMonthPlan, fetchBrandLockedPlanSlots, fetchCalendarEvents, fetchMonthPlan, fetchPlanStatuses, lockMonthPlan, replacePlanSlots, upsertMonthPlan } from "../lib/db/monthPlans";
import { PlanEvaluation, buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { todayVn } from "../lib/performance/brandCommitment";
import { useDefaultBrand } from "../hooks/useDefaultBrand";
import { CAMPAIGN_DAY_STYLES, resolveCampBucketType } from "../lib/campaignDays";
import {
  PlanDraftSlot,
  allocateDraftTargets,
  daysOfMonth,
  draftsFromSaved,
  draftsFromSuggestion,
  mergeFromTemplates,
  nextSlotForDay,
  slotHours,
  totalsOf,
  validateDrafts
} from "../lib/scheduling/monthPlanGrid";
import { RecurringRulesPanel } from "./scheduling/RecurringRulesPanel";
import { HistorySummary, STRATEGY_LABEL, SuggestResult, SuggestStrategy, buildBorrowedHistory, buildHistory, estimateSlots, suggestMonthPlan } from "../lib/scheduling/suggestEngine";
import { formatCurrencyAdaptive } from "../lib/formatCurrency";
import { EngineParams } from "../lib/scheduling/engineParams";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { useConfirm } from "../hooks/useConfirm";
import { PageIntro } from "./common/PageIntro";

import { fmtFixed } from "../lib/format";
interface MonthPlanProps {
  brands: Brand[];
  studios: Studio[];
  // Lịch sử ca (engine chỉ ăn ca Completed + tiktok_reconciled của đúng brand).
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  promoSchemes: PromoScheme[];
  currentUserId: string;
  recurringShiftTemplates: RecurringShiftTemplate[];
  onCreateTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
  // Chốt xong → App nạp lại shift_slots để Đăng Ký & Chốt Lịch / lịch thấy ca mới.
  onPlanLocked: () => Promise<void>;
  engineParams: EngineParams; // admin vặn ở AI Training Center (0095)
  // Phòng live mặc định của brand (0098) — chốt ghi vào ca sinh ra. Cấu hình của brand, không thuộc
  // kế hoạch: đổi được cả khi kế hoạch đã chốt (chỉ ảnh hưởng lần chốt sau).
  brandStudios: BrandStudio[];
  onSetBrandStudio: (brandId: string, platform: "TikTok" | "Shopee", studioId: string) => Promise<boolean>;
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const DEFAULT_SETTINGS: PlanSettings = { defaultSlotHours: 3, liveWindowStart: "09:00", liveWindowEnd: "23:00", maxSlotsPerDay: 3, notes: "", blackoutDates: [], targetGmv: 0, campRanges: {}, shopTargetGmv: 0 };
const CAMP_RANGE_LABEL: Record<keyof PlanCampRanges, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

const nextMonthOf = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

// Kế Hoạch Tháng — giai đoạn A (0090): lập lưới ngày × ca cho brand, nạp nhanh từ quy tắc lặp,
// chia target theo khung camp của tab 05, chốt → sinh shift_slots. Gợi ý từ lịch sử là giai đoạn B.
export default function MonthPlan({
  brands,
  studios,
  sessions,
  shiftSlots,
  promoSchemes,
  currentUserId,
  recurringShiftTemplates,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onPlanLocked,
  engineParams,
  brandStudios,
  onSetBrandStudio
}: MonthPlanProps) {
  const confirm = useConfirm();
  const today = todayVn();
  const [brandId, setBrandId] = useDefaultBrand(brands, sessions, today);
  const [month, setMonth] = useState(nextMonthOf(today.slice(0, 7), 1));
  const [plan, setPlan] = useState<BrandMonthPlan | null>(null);
  const [settings, setSettings] = useState<PlanSettings>(DEFAULT_SETTINGS);
  const [drafts, setDrafts] = useState<PlanDraftSlot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  const [suggestion, setSuggestion] = useState<{ history: HistorySummary; result: SuggestResult } | null>(null);
  // Giờ engine phải xếp: mặc định = cam kết hợp đồng; ops sửa tại chỗ khi tháng này thoả thuận khác
  // (không lưu — cam kết chính thức vẫn ở Cam Kết Hợp Đồng).
  const [hoursOverride, setHoursOverride] = useState<number | null>(null);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [strategy, setStrategy] = useState<SuggestStrategy>("max");
  const [compare, setCompare] = useState<Record<SuggestStrategy, SuggestResult> | null>(null);
  // Nhắc việc: brand chưa chốt kế hoạch cho THÁNG SAU (theo hôm nay), bất kể đang xem tháng nào.
  const [nextMonthMissing, setNextMonthMissing] = useState<string[]>([]);
  // Giai đoạn D: mọi ca kế hoạch đã chốt của brand (mọi tháng) → đối chiếu thực tế + hiệu chỉnh.
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [lockedSlotsTick, setLockedSlotsTick] = useState(0);

  const brand = brands.find((b) => b.id === brandId);
  const brandStudioId = findBrandStudioId(brandStudios, brandId);
  const brandStudio = studios.find((s) => s.id === brandStudioId);
  const brandTemplates = useMemo(() => recurringShiftTemplates.filter((t) => t.brandId === brandId), [recurringShiftTemplates, brandId]);

  useEffect(() => {
    fetchBrandMonthlyCommitments().then(setCommitments).catch(() => setCommitments([]));
    fetchCalendarEvents().then(setEvents).catch(() => setEvents([]));
  }, []);
  const nextMonth = nextMonthOf(today.slice(0, 7), 1);
  const refreshMissing = () => {
    fetchPlanStatuses(nextMonth)
      .then((m) => setNextMonthMissing(brands.filter((b) => m.get(b.id)?.status !== "locked").map((b) => b.name)))
      .catch(() => setNextMonthMissing([]));
  };
  useEffect(refreshMissing, [brands, nextMonth]);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    fetchBrandLockedPlanSlots(brandId).then((r) => alive && setLockedSlots(r)).catch(() => alive && setLockedSlots([]));
    return () => { alive = false; };
  }, [brandId, lockedSlotsTick]);
  // Kế hoạch vs thực tế của THÁNG ĐANG XEM (chỉ khi đã chốt và có ca gắn).
  const evaluation = useMemo<PlanEvaluation | null>(() => {
    const cur = lockedSlots.filter((ps) => ps.date.startsWith(month));
    return cur.length > 0 ? evaluatePlan(cur, shiftSlots, sessions) : null;
  }, [lockedSlots, month, shiftSlots, sessions]);
  // Hiệu chỉnh cho engine: từ mọi tháng KHÁC tháng đang lập (tránh tự soi vào chính nó).
  const calibration = useMemo(() => {
    const others = lockedSlots.filter((ps) => !ps.date.startsWith(month));
    if (others.length === 0) return null;
    const byMonth = new Map<string, BrandMonthPlanSlot[]>();
    for (const ps of others) { const l = byMonth.get(ps.date.slice(0, 7)) ?? []; l.push(ps); byMonth.set(ps.date.slice(0, 7), l); }
    const cal = buildCalibration([...byMonth.values()].map((l) => evaluatePlan(l, shiftSlots, sessions)), engineParams);
    return cal.observations > 0 ? cal : null;
  }, [lockedSlots, month, shiftSlots, sessions, engineParams]);

  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    setLoading(true);
    setMsg(null);
    fetchMonthPlan(brandId, month)
      .then((r) => {
        if (!alive) return;
        if (r) {
          setPlan(r.plan);
          setSettings({ defaultSlotHours: r.plan.defaultSlotHours, liveWindowStart: r.plan.liveWindowStart, liveWindowEnd: r.plan.liveWindowEnd, maxSlotsPerDay: r.plan.maxSlotsPerDay, notes: r.plan.notes, blackoutDates: r.plan.blackoutDates, targetGmv: r.plan.targetGmv, campRanges: r.plan.campRanges, shopTargetGmv: r.plan.shopTargetGmv });
          setDrafts(draftsFromSaved(r.slots));
        } else {
          setPlan(null);
          setSettings(DEFAULT_SETTINGS);
          setDrafts([]);
        }
        setDirty(false);
        setSuggestion(null);
        setCompare(null);
        setHoursOverride(null); // override giờ là theo brand+tháng, không mang sang brand khác
      })
      .catch((e) => alive && setMsg(`Không tải được kế hoạch: ${errorMessage(e)}`))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [brandId, month]);

  const committedHours = useMemo(
    () => commitments.find((c) => c.brandId === brandId && c.periodMonth === `${month}-01`)?.committedHours ?? 0,
    [commitments, brandId, month]
  );
  const planHours = hoursOverride ?? committedHours;
  // Target và khoảng camp là của riêng kế hoạch (0094) — không đọc Report Tháng.
  const targetTotal = settings.targetGmv > 0 ? settings.targetGmv : 0;
  const campRanges = settings.campRanges;
  const totals = useMemo(() => totalsOf(drafts), [drafts]);
  const errors = useMemo(() => validateDrafts(drafts, settings), [drafts, settings]);
  const locked = plan?.status === "locked";
  // 0091: kế hoạch đã chốt vẫn sửa được; "Chốt lại" đồng bộ ca (thêm mới / huỷ ca mở bị bỏ).
  const editable = true;
  const unsynced = locked ? drafts.filter((d) => !d.slotId).length : 0;
  const eventByDate = useMemo(() => new Map(events.map((e) => [e.date, e])), [events]);
  const brandSchemes = useMemo(() => promoSchemes.filter((sc) => sc.brandId === brandId).map((sc) => ({ start: sc.startDate, end: sc.endDate, label: sc.title })), [promoSchemes, brandId]);
  const history = useMemo(() => buildHistory(sessions, brandId, today, { events, schemes: brandSchemes, params: engineParams }), [sessions, brandId, today, events, brandSchemes, engineParams]);
  // ---- Đ12: brand chưa có ca đối soát nào ----------------------------------------------------
  // `buildHistory` lọc theo brandId, rỗng ⇒ brandGmvPerHour = 0 ⇒ suggestMonthPlan trả mảng rỗng.
  // Lối ra: mượn HÌNH DẠNG của toàn agency, MỨC thì lấy từ chính cam kết của brand (không bịa).
  const coldStart = history.brandGmvPerHour <= 0;
  // Mức mặc định suy từ chính con số brand đã cam kết: target tháng ÷ giờ cần xếp. Đây là kỳ vọng
  // của brand chứ không phải phỏng đoán của engine, nên dùng làm mặc định là trung thực.
  const autoLevel = useMemo(
    () => (targetTotal > 0 && planHours > 0 ? targetTotal / planHours : 0),
    [targetTotal, planHours]
  );
  const [levelOverride, setLevelOverride] = useState(0); // 0 = dùng autoLevel
  const borrowLevel = levelOverride > 0 ? levelOverride : autoLevel;
  const borrowLevelSource = levelOverride > 0 ? "(bạn nhập tay)" : "(suy từ Target GMV tháng ÷ giờ cần xếp)";
  const borrowedHistory = useMemo(
    () =>
      coldStart && borrowLevel > 0
        ? buildBorrowedHistory(sessions, today, { events, schemes: brandSchemes, params: engineParams }, borrowLevel, borrowLevelSource)
        : null,
    [coldStart, borrowLevel, borrowLevelSource, sessions, today, events, brandSchemes, engineParams]
  );
  // Lịch sử engine THỰC SỰ dùng. Có lịch sử thật thì luôn ưu tiên lịch sử thật — không bao giờ mượn
  // đè lên dữ liệu của chính brand.
  const engineHistory = coldStart && borrowedHistory ? borrowedHistory : history;

  const estimateCtx = useMemo(() => ({ camp: campRanges, events, schemes: brandSchemes, calibration: calibration?.factors }), [campRanges, events, brandSchemes, calibration]);
  // Target đi theo lưới (user chốt 2026-09-21): ở giai đoạn NHÁP, mọi thay đổi cấu trúc (thêm/bỏ/dời
  // ca, đổi giờ, cấm ngày, nạp quy tắc) → chia lại target tháng theo dự báo mới của cả lưới, không
  // chờ bấm "Chia target theo dự báo". Sau khi CHỐT, target/ca là số cam kết với brand/host — không
  // chia lại; ca thêm sau chốt mang target = dự báo riêng của nó, phần bù/run-rate là việc của module
  // hỗ trợ vận hành (sau). Sửa target/ca bằng tay không kích hoạt chia lại (thanh "Tổng target" báo lệch).
  const withForecast = (next: PlanDraftSlot[], target = targetTotal, ctx = estimateCtx): PlanDraftSlot[] => {
    if (next.length === 0) return next;
    const w = estimateSlots(engineHistory, next, ctx);
    const flag = (d: PlanDraftSlot) => ({ ...d, highExpectation: d.expectedGmv ? d.targetGmv > d.expectedGmv * engineParams.highExpectationRatio : d.highExpectation });
    if (!locked && target > 0) return allocateDraftTargets(next, target, w).map(flag);
    return next.map((d, i) => flag({
      ...d,
      expectedGmv: w[i] > 0 ? Math.round(w[i]) : d.expectedGmv,
      targetGmv: locked && !d.id && d.targetGmv === 0 && w[i] > 0 ? Math.round(w[i]) : d.targetGmv
    }));
  };
  const toggleBlackout = (day: string) => {
    setSettings((st) => ({ ...st, blackoutDates: st.blackoutDates.includes(day) ? st.blackoutDates.filter((d) => d !== day) : [...st.blackoutDates, day].sort() }));
    setDrafts((prev) => withForecast(prev.filter((d) => d.date !== day || settings.blackoutDates.includes(day))));
    setDirty(true);
  };

  const days = useMemo(() => daysOfMonth(month), [month]);
  const leading = new Date(`${days[0]}T00:00:00`).getDay();
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const draftsByDay = useMemo(() => {
    const m = new Map<string, PlanDraftSlot[]>();
    for (const d of drafts) {
      const l = m.get(d.date) ?? [];
      l.push(d);
      m.set(d.date, l);
    }
    for (const l of m.values()) l.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return m;
  }, [drafts]);

  const update = (key: string, patch: Partial<PlanDraftSlot>) => {
    const structural = patch.startTime !== undefined || patch.endTime !== undefined || patch.date !== undefined;
    setDrafts((prev) => {
      const next = prev.map((d) => (d.key === key ? { ...d, ...patch } : d));
      return structural ? withForecast(next) : next;
    });
    setDirty(true);
  };
  const remove = (key: string) => {
    setDrafts((prev) => withForecast(prev.filter((d) => d.key !== key)));
    setDirty(true);
  };
  const addForDay = (day: string) => {
    const s = nextSlotForDay(day, drafts, settings);
    if (!s) {
      setMsg(`Ngày ${day}: đã đủ ${settings.maxSlotsPerDay} ca hoặc hết chỗ trong khung ${settings.liveWindowStart}-${settings.liveWindowEnd}.`);
      return;
    }
    setDrafts((prev) => withForecast([...prev, s]));
    setDirty(true);
  };
  const loadTemplates = () => {
    const { next, added } = mergeFromTemplates(drafts, brandTemplates, month, brandId, today);
    setDrafts(added > 0 ? withForecast(next) : next);
    setDirty(added > 0 || dirty);
    setMsg(added > 0 ? `Nạp thêm ${added} ca từ quy tắc lặp.` : brandTemplates.filter((t) => t.active).length === 0 ? "Brand chưa có quy tắc lặp nào active." : "Mọi ca theo quy tắc đã có trong lưới.");
  };
  // Chia target tổng xuống ca theo DỰ BÁO từng ca (cùng công thức engine gợi ý); brand chưa có lịch
  // sử thì chia theo giờ.
  const allocate = () => {
    if (targetTotal <= 0) {
      setMsg("Nhập Target GMV tháng ở Tham số lập kế hoạch trước.");
      return;
    }
    if (drafts.length === 0) {
      setMsg("Lưới đang trống — vẽ ca hoặc bấm Gợi ý phân bổ trước.");
      return;
    }
    const weights = estimateSlots(engineHistory, drafts, estimateCtx);
    const byForecast = weights.some((w) => w > 0);
    setDrafts(allocateDraftTargets(drafts, targetTotal, weights));
    setDirty(true);
    setMsg(byForecast ? `Đã chia ${formatCurrencyAdaptive(targetTotal)} theo dự báo từng ca (${history.sessions} ca lịch sử).` : `Brand chưa có lịch sử đối soát — đã chia ${formatCurrencyAdaptive(targetTotal)} đều theo giờ.`);
  };
  // Đổ gợi ý vào lưới. Ngày camp có thể nhiều ca hơn trần ops đặt (engine nới theo giờ/ngày lịch sử) —
  // nâng trần kế hoạch theo, không thì validateDrafts chặn lưu chính cái gợi ý vừa áp.
  const applySuggestion = (base: PlanDraftSlot[], result: SuggestResult) => {
    const next = draftsFromSuggestion(base, result.slots);
    const perDay = new Map<string, number>();
    for (const d of next) perDay.set(d.date, (perDay.get(d.date) ?? 0) + 1);
    const maxDay = Math.max(0, ...perDay.values());
    if (maxDay > settings.maxSlotsPerDay) setSettings((st) => ({ ...st, maxSlotsPerDay: maxDay }));
    setDrafts(next);
    setDirty(true);
  };
  const baseConstraints = useMemo(() => ({
    month,
    today,
    params: engineParams,
    committedHours: planHours,
    targetGmv: targetTotal,
    camp: campRanges,
    liveWindowStart: settings.liveWindowStart,
    liveWindowEnd: settings.liveWindowEnd,
    defaultSlotHours: settings.defaultSlotHours,
    maxSlotsPerDay: settings.maxSlotsPerDay,
    blackoutDates: settings.blackoutDates,
    fixedSlots: drafts.map((d) => ({ date: d.date, startTime: d.startTime, endTime: d.endTime })),
    events,
    schemes: brandSchemes,
    calibration: calibration?.factors
  }), [month, today, engineParams, planHours, targetTotal, campRanges, settings, drafts, events, brandSchemes, calibration]);
  // Lưới nháp vs target: dự báo cả lưới hụt quá ngưỡng → cảnh báo kèm phương án bù giờ (engine chạy
  // chế độ target với lưới hiện tại là ca cố định → phần xếp thêm chính là ca cần bù). Chỉ ở nháp.
  const targetGap = useMemo(() => {
    // engineHistory, KHÔNG phải history: cold start có mượn hình dạng thì vẫn dự báo được, nên vẫn
    // phải cảnh báo hụt target. Bỏ sót chỗ này khi vá Đ12 (2026-09-24), `exhaustive-deps` bắt được.
    if (locked || targetTotal <= 0 || drafts.length === 0 || engineHistory.brandGmvPerHour <= 0) return null;
    const forecast = estimateSlots(engineHistory, drafts, estimateCtx).reduce((a, b) => a + b, 0);
    const gap = targetTotal - forecast;
    const pct = gap / targetTotal;
    if (pct <= engineParams.targetGapWarnPct) return { forecast, gap, pct, fill: null as SuggestResult | null, extraHours: 0, extraSlots: [] as SuggestResult["slots"] };
    const fill = suggestMonthPlan(engineHistory, { ...baseConstraints, mode: "target", strategy });
    const fixed = new Set(drafts.map((d) => `${d.date}|${d.startTime}|${d.endTime}`));
    const extraSlots = fill.slots.filter((sl) => !fixed.has(`${sl.date}|${sl.startTime}|${sl.endTime}`));
    const extraHours = extraSlots.reduce((a, sl) => a + sl.hours, 0);
    return { forecast, gap, pct, fill: fill.hoursToHitTarget !== null && extraSlots.length > 0 ? fill : null, extraHours, extraSlots };
  }, [locked, targetTotal, drafts, engineHistory, estimateCtx, engineParams.targetGapWarnPct, baseConstraints, strategy]);
  // Giai đoạn B — engine gợi ý: ca đang có trong lưới được giữ làm ca cố định, engine xếp thêm cho đủ
  // giờ cam kết và chia target theo dự báo từng ca.
  const suggest = (mode: "hours" | "target" = "hours") => {
    if (mode === "hours" && planHours <= 0) {
      setMsg("Nhập giờ cần xếp (hoặc cam kết ở Cam Kết Hợp Đồng) để engine biết phải xếp bao nhiêu giờ — hoặc nhập Target GMV rồi bấm Xếp theo target.");
      return;
    }
    if (mode === "target" && targetTotal <= 0) {
      setMsg("Nhập Target GMV tháng ở Tham số lập kế hoạch trước.");
      return;
    }
    const base = { ...baseConstraints, mode };
    // Chạy cả 3 phương án để so sánh; áp phương án đang chọn vào lưới.
    const all: Record<SuggestStrategy, SuggestResult> = {
      max: suggestMonthPlan(engineHistory, { ...base, strategy: "max" }),
      balanced: suggestMonthPlan(engineHistory, { ...base, strategy: "balanced" }),
      lean: suggestMonthPlan(engineHistory, { ...base, strategy: "lean" })
    };
    setCompare(all);
    const result = all[strategy];
    setSuggestion({ history: engineHistory, result });
    if (result.slots.length === 0) {
      setMsg(result.notes[0] ?? "Không có gợi ý.");
      return;
    }
    applySuggestion(drafts, result);
    setMsg(`${mode === "target" ? "Xếp theo target" : "Gợi ý"} ${result.slots.length} ca · ${fmtH(result.totalHours)}h · dự báo ${formatCurrencyAdaptive(result.forecastGmv)}${targetTotal > 0 ? ` / target ${formatCurrencyAdaptive(targetTotal)}` : ""}${drafts.length > 0 ? ` (giữ ${drafts.length} ca đang có)` : ""}.`);
  };

  const clearAll = async () => {
    if (!(await confirm("Xoá toàn bộ ca trong lưới nháp?", { danger: true }))) return;
    setDrafts([]);
    setDirty(true);
  };

  const save = async (): Promise<BrandMonthPlan | null> => {
    if (errors.length > 0) {
      setMsg(`Sửa lỗi trước khi lưu: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1})` : ""}`);
      return null;
    }
    setSaving(true);
    try {
      const p = await upsertMonthPlan(brandId, month, settings);
      const saved = await replacePlanSlots(p.id, drafts.map((d) => ({ id: d.id, date: d.date, startTime: d.startTime, endTime: d.endTime, targetGmv: d.targetGmv, expectedGmv: d.expectedGmv, note: d.note })));
      setPlan(p);
      setDrafts(draftsFromSaved(saved));
      setDirty(false);
      setMsg(`Đã lưu nháp: ${saved.length} ca.`);
      return p;
    } catch (e) {
      setMsg(`Không lưu được: ${errorMessage(e)}`);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const lock = async () => {
    if (drafts.length === 0 && !locked) {
      setMsg("Lưới trống — chưa có gì để chốt.");
      return;
    }
    if (drafts.length === 0 && locked && !(await confirm(`Lưới trống — chốt lại sẽ HUỶ toàn bộ ca đang mở của kế hoạch ${brand?.name} tháng ${month} (trừ ca đã có người đăng ký). Tiếp tục?`, { danger: true }))) return;
    const gap = planHours - totals.hours;
    const warn = planHours > 0 && Math.abs(gap) > 0.01 ? `\n\nGiờ kế hoạch ${fmtH(totals.hours)}h ${gap > 0 ? "THIẾU" : "VƯỢT"} ${fmtH(Math.abs(gap))}h so với ${fmtH(planHours)}h cần xếp.` : "";
    const relockNote = locked ? "\n\nChốt lại sẽ mở thêm ca mới và HUỶ ca đang mở đã bị bỏ khỏi kế hoạch (trừ ca đã có người đăng ký)." : "";
    const targetWarn = targetGap && targetGap.pct > engineParams.targetGapWarnPct ? `\n\nDự báo lưới ${formatCurrencyAdaptive(targetGap.forecast)} THIẾU ${formatCurrencyAdaptive(targetGap.gap)} (${Math.round(targetGap.pct * 100)}%) so với target ${formatCurrencyAdaptive(targetTotal)}${targetGap.fill ? ` — cần bù ~${fmtH(targetGap.extraHours)}h.` : " — thêm giờ trong khung cũng không chạm."} Sau khi chốt, target/ca KHÔNG chia lại nữa.` : "";
    const pastCount = drafts.filter((d) => d.date < today).length;
    const pastNote = pastCount > 0 ? `\n\n${pastCount} ca ở ngày đã qua sẽ KHÔNG mở chờ đăng ký (chỉ giữ trong kế hoạch để đối chiếu).` : "";
    const studioNote = brandStudio ? `\n\nCa sinh ra gắn phòng ${brandStudio.name} (${brandStudio.roomNumber}).` : "\n\nBrand CHƯA có phòng live mặc định — ca sinh ra sẽ không có phòng (không kiểm được trùng phòng). Chọn ở Tham số → Phòng live trước nếu cần.";
    if (!(await confirm(`${locked ? "Chốt lại" : "Chốt"} kế hoạch ${brand?.name} tháng ${month}: ${drafts.length} ca chờ đăng ký?${warn}${targetWarn}${relockNote}${studioNote}${pastNote}`))) return;
    const p = await save();
    if (!p) return;
    setSaving(true);
    try {
      const r = await lockMonthPlan(p.id);
      await onPlanLocked();
      const fresh = await fetchMonthPlan(brandId, month);
      if (fresh) {
        setPlan(fresh.plan);
        setDrafts(draftsFromSaved(fresh.slots));
      }
      refreshMissing();
      setLockedSlotsTick((t) => t + 1);
      setMsg(
        `Đã chốt: mở ${r.created} ca mới${r.linked > 0 ? `, gắn ${r.linked} ca đã có sẵn` : ""}${r.cancelled > 0 ? `, huỷ ${r.cancelled} ca bị bỏ` : ""}` +
          `${r.kept_registered > 0 ? `, GIỮ ${r.kept_registered} ca bị bỏ nhưng đã có người đăng ký (xử lý ở Nhân sự ca)` : ""}${(r.skipped_past ?? 0) > 0 ? `, bỏ qua ${r.skipped_past} ca ngày đã qua` : ""} — ${r.total_slots} ca đang chờ đăng ký.`
      );
    } catch (e) {
      setMsg(`Không chốt được: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  // Xoá cả dòng kế hoạch (0115). Khác hẳn "Xoá hết" bên trên — cái đó chỉ dọn lưới nháp trong
  // state, dòng `brand_month_plans` vẫn còn và Toàn Cảnh Brand vẫn đọc nó là "đã lập". Trước 0115
  // không có đường nào xoá dòng đó, kể cả khi lập nhầm brand/nhầm tháng.
  const removePlan = async () => {
    if (!plan) return;
    const openFromPlan = shiftSlots.filter((sl) => sl.status === "open" && sl.brandId === brandId && sl.date.slice(0, 7) === month).length;
    if (
      !(await confirm(
        `XOÁ HẲN kế hoạch ${brand?.name} tháng ${month}?

` +
          `• ${drafts.length} ca trong lưới kế hoạch bị xoá theo.
` +
          `• Ca chờ đăng ký đã sinh ra từ kế hoạch này (khoảng ${openFromPlan} ca đang mở) sẽ bị HUỶ.
` +
          `• Ca đã chốt người thì KHÔNG xoá được — nếu có, DB sẽ chặn và bạn phải xử từng ca ở Nhân sự ca trước.

` +
          `Không hoàn tác được.`,
        { danger: true }
      ))
    )
      return;
    setSaving(true);
    try {
      const r = await deleteMonthPlan(plan.id);
      setPlan(null);
      setDrafts([]);
      setDirty(false);
      await onPlanLocked(); // nạp lại target/ca đã chốt ở App — kế hoạch vừa mất thì target phải mất theo
      refreshMissing();
      setLockedSlotsTick((t) => t + 1);
      setMsg(
        `Đã xoá kế hoạch: ${r.plan_slots_deleted} ca kế hoạch, huỷ ${r.slots_cancelled} ca chờ đăng ký` +
          `${r.slots_had_registrations > 0 ? ` (trong đó ${r.slots_had_registrations} ca đã có người đăng ký rảnh — nhớ báo họ)` : ""}.`
      );
    } catch (e: unknown) {
      setMsg(`Không xoá được kế hoạch: ${errorMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const hoursDelta = planHours > 0 ? totals.hours - planHours : null;
  const targetDelta = targetTotal > 0 ? totals.target - targetTotal : null;

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-blue-400" />
            Kế Hoạch Tháng
          </h2>
          <PageIntro>
            Lập lưới ca cho brand trước khi mở đăng ký: giờ theo cam kết, target đặt ngay trong kế hoạch, chốt là ca đổ xuống Nhân sự ca chờ talent đăng ký.
          </PageIntro>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] text-sm font-bold">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setMonth((m) => nextMonthOf(m, -1))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tháng trước"><ChevronLeft className="w-4 h-4" /></button>
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] font-mono text-sm" />
          <button onClick={() => setMonth((m) => nextMonthOf(m, 1))} className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]" title="Tháng sau"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {nextMonthMissing.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Tháng {nextMonth.slice(5)}/{nextMonth.slice(0, 4)} chưa chốt kế hoạch: <b>{nextMonthMissing.join(", ")}</b> — chốt trước khi mở đăng ký để talent còn thời gian đăng ký.</span>
        </div>
      )}

      {/* Đầu vào + tổng */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-[var(--text)]">Tham số lập kế hoạch</h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Ca mặc định (giờ)</span>
              <input type="number" step="0.5" min="0.5" max="12" disabled={!editable} value={settings.defaultSlotHours} onChange={(e) => { setSettings((s) => ({ ...s, defaultSlotHours: Number(e.target.value) })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Tối đa ca/ngày</span>
              <input type="number" min="1" max="8" disabled={!editable} value={settings.maxSlotsPerDay} onChange={(e) => { setSettings((s) => ({ ...s, maxSlotsPerDay: Number(e.target.value) })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">Live từ</span>
              <input type="time" disabled={!editable} value={settings.liveWindowStart} onChange={(e) => { setSettings((s) => ({ ...s, liveWindowStart: e.target.value })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            </label>
            <label className="block">
              <span className="font-bold text-[var(--text-muted)] block mb-1">đến</span>
              <input type="time" disabled={!editable} value={settings.liveWindowEnd} onChange={(e) => { setSettings((s) => ({ ...s, liveWindowEnd: e.target.value })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            </label>
          </div>
          <label className="block text-xs">
            <span className="font-bold text-[var(--text-muted)] block mb-1">Target GMV tháng (đ)</span>
            <input type="number" min="0" step="1000000" disabled={!editable} value={settings.targetGmv || ""} placeholder="0 = chưa đặt" onChange={(e) => { const t = Number(e.target.value) || 0; setSettings((s) => ({ ...s, targetGmv: t })); if (!locked && t > 0) setDrafts((prev) => withForecast(prev, t)); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            {targetTotal > 0 && <span className="text-[11px] text-[var(--text-faint)]">{formatCurrencyAdaptive(targetTotal)}</span>}
          </label>
          <label className="block text-xs">
            <span className="font-bold text-[var(--text-muted)] block mb-1">KPI GMV (đ) <span className="font-normal text-[var(--text-faint)]">— brand giao, mọi kênh; chỉ để Report Tháng so, không dùng xếp ca</span></span>
            <input type="number" min="0" step="1000000" disabled={!editable} value={settings.shopTargetGmv || ""} placeholder="0 = brand chưa giao" onChange={(e) => { setSettings((s) => ({ ...s, shopTargetGmv: Number(e.target.value) || 0 })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            {settings.shopTargetGmv > 0 && <span className="text-[11px] text-[var(--text-faint)]">{formatCurrencyAdaptive(settings.shopTargetGmv)}{targetTotal > 0 ? ` · Target GMV live = ${Math.round((targetTotal / settings.shopTargetGmv) * 100)}% KPI GMV` : ""}</span>}
          </label>
          <div className="text-xs space-y-1">
            <span className="font-bold text-[var(--text-muted)] block">Khoảng ngày camp <span className="font-normal text-[var(--text-faint)]">(trống = lịch cố định)</span></span>
            {(Object.keys(CAMP_RANGE_LABEL) as (keyof PlanCampRanges)[]).map((k) => {
              const r = campRanges[k];
              const setRange = (start: string, end: string) => {
                const next = { ...campRanges };
                if (start && end) next[k] = { start, end };
                else delete next[k];
                setSettings((s) => ({ ...s, campRanges: next }));
                if (!locked) setDrafts((prev) => withForecast(prev, targetTotal, { ...estimateCtx, camp: next }));
                setDirty(true);
              };
              return (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="w-20 text-[var(--text)]">{CAMP_RANGE_LABEL[k]}</span>
                  <input type="date" disabled={!editable} value={r?.start ?? ""} onChange={(e) => setRange(e.target.value, r?.end ?? e.target.value)} className="flex-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] font-mono disabled:opacity-60" />
                  <span className="text-[var(--text-faint)]">→</span>
                  <input type="date" disabled={!editable} value={r?.end ?? ""} onChange={(e) => setRange(r?.start ?? e.target.value, e.target.value)} className="flex-1 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] font-mono disabled:opacity-60" />
                  {r && editable && <button onClick={() => setRange("", "")} className="text-[var(--text-faint)] hover:text-rose-400" title="Bỏ, dùng lịch cố định"><X className="w-3 h-3" /></button>}
                </div>
              );
            })}
          </div>
          <input type="text" disabled={!editable} value={settings.notes} onChange={(e) => { setSettings((s) => ({ ...s, notes: e.target.value })); setDirty(true); }} placeholder="Ghi chú kế hoạch (tuỳ chọn)" className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-xs text-[var(--text)] disabled:opacity-60" />
          <label className="block text-xs">
            <span className="font-bold text-[var(--text-muted)] block mb-1">Phòng live (TikTok) <span className="font-normal text-[var(--text-faint)]">— cấu hình brand, ca chốt ra gắn phòng này</span></span>
            <select value={brandStudioId} onChange={(e) => { if (brandId) void onSetBrandStudio(brandId, "TikTok", e.target.value); }} className={`w-full bg-[var(--surface-base)] border rounded-lg p-2 text-[var(--text)] ${brandStudioId ? "border-[var(--border)]" : "border-amber-700"}`}>
              <option value="">— Chưa chọn phòng —</option>
              {studios.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.roomNumber})</option>)}
            </select>
          </label>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-[var(--text)]">Giờ live</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Giờ cam kết (Cam Kết Hợp Đồng)</span><b className="text-[var(--text)]">{committedHours > 0 ? `${fmtH(committedHours)}h` : "chưa nhập"}</b></div>
            <div className="flex justify-between items-center gap-2"><span className="text-[var(--text-muted)]">Giờ cần xếp tháng này</span>
              <input type="number" min="0" step="1" disabled={!editable} value={planHours || ""} placeholder="= cam kết" onChange={(e) => setHoursOverride(e.target.value === "" ? null : Number(e.target.value))} className="w-24 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-right font-mono text-[var(--text)] disabled:opacity-60" />
            </div>
            <div className="flex justify-between gap-2"><span className="text-[var(--text-muted)]">Target GMV tháng</span><b className="text-[var(--text)]">{targetTotal > 0 ? formatCurrencyAdaptive(targetTotal) : "chưa đặt"}</b></div>
            <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">Giờ cam kết lấy từ hợp đồng; target đặt ngay trong kế hoạch này. "Gợi ý phân bổ" xếp đủ giờ; "Xếp theo target" xếp tới khi dự báo chạm target và cho biết cần bao nhiêu giờ.</p>
          </div>
        </div>

        <div className={`rounded-2xl p-4 border space-y-2 ${errors.length > 0 ? "bg-rose-950/25 border-rose-900" : "bg-[var(--surface)] border-[var(--border)]"}`}>
          <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
            Lưới hiện tại
            {locked && <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Đã chốt</span>}
            {dirty && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-300 font-bold">chưa lưu</span>}
          </h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <span className="text-[var(--text-muted)]">Số ca / ngày có ca</span><b className="text-[var(--text)] text-right">{totals.slots} / {totals.days}</b>
            <span className="text-[var(--text-muted)]">Tổng giờ</span>
            <b className={`text-right ${hoursDelta === null ? "text-[var(--text)]" : Math.abs(hoursDelta) < 0.01 ? "text-emerald-400" : hoursDelta < 0 ? "text-rose-400" : "text-amber-400"}`}>
              {fmtH(totals.hours)}h{hoursDelta !== null && Math.abs(hoursDelta) >= 0.01 ? ` (${hoursDelta < 0 ? "thiếu" : "vượt"} ${fmtH(Math.abs(hoursDelta))}h)` : ""}
            </b>
            <span className="text-[var(--text-muted)]">Tổng target</span>
            <b className={`text-right ${targetDelta === null ? "text-[var(--text)]" : Math.abs(targetDelta) < 1 ? "text-emerald-400" : "text-amber-400"}`}>
              {formatCurrencyAdaptive(totals.target)}{targetDelta !== null && Math.abs(targetDelta) >= 1 ? ` (${targetDelta < 0 ? "thiếu" : "vượt"} ${formatCurrencyAdaptive(Math.abs(targetDelta))})` : ""}
            </b>
          </div>
          {errors.length > 0 && <p className="text-[11px] text-rose-300">{errors[0]}{errors.length > 1 ? ` · +${errors.length - 1} lỗi` : ""}</p>}
        </div>
      </div>

      {/* Thanh công cụ */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setRulesOpen((v) => !v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--accent-text)] flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Quy tắc lặp ({brandTemplates.length})</button>
        {editable && (
          <>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as SuggestStrategy)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--text)]" title="Phương án gợi ý">
              {(Object.keys(STRATEGY_LABEL) as SuggestStrategy[]).map((k) => <option key={k} value={k}>{STRATEGY_LABEL[k]}</option>)}
            </select>
            <button onClick={() => suggest("hours")} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--accent)]/60 text-xs font-bold text-[var(--accent-text)] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Gợi ý phân bổ</button>
            <button onClick={() => suggest("target")} disabled={targetTotal <= 0} title={targetTotal <= 0 ? "Nhập Target GMV tháng trước" : "Xếp tới khi dự báo chạm target"} className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 text-xs font-bold text-[var(--accent-text)] disabled:opacity-40 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Xếp theo target</button>
            <button onClick={loadTemplates} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">Nạp từ quy tắc</button>
            <button onClick={allocate} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Chia target theo dự báo</button>
            <button onClick={clearAll} disabled={drafts.length === 0} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-rose-400 disabled:opacity-40">Xoá hết</button>
          </>
        )}
        <span className="flex-1 text-[11px] text-[var(--text-muted)] min-w-[160px]">{loading ? "Đang tải…" : msg ?? (locked ? `Đã chốt lúc ${plan?.lockedAt ? new Date(plan.lockedAt).toLocaleString("vi-VN") : ""}. Chốt lại chỉ mở thêm ca chưa có.` : "")}</span>
        {editable && (
          <button onClick={save} disabled={saving || !dirty} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-xs font-bold text-[var(--text)] disabled:opacity-40 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Lưu nháp</button>
        )}
        <button onClick={lock} disabled={saving || loading || errors.length > 0} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {locked ? `Chốt lại (đồng bộ ca)` : `Chốt kế hoạch`}</button>
        {editable && plan && (
          <button onClick={removePlan} disabled={saving || loading} className="px-3 py-1.5 rounded-lg border border-rose-900 text-xs font-bold text-rose-400 hover:bg-rose-950/40 disabled:opacity-40 flex items-center gap-1.5" title="Xoá cả dòng kế hoạch tháng này (khác 'Xoá hết' — cái đó chỉ dọn lưới nháp)"><Trash2 className="w-3.5 h-3.5" /> Xoá kế hoạch</button>
        )}
      </div>

      {/* Đ12 — brand chưa có lịch sử: nói rõ đang mượn gì, và bắt ops xác nhận MỨC trước khi engine
          chạy. Panel này chỉ hiện khi thật sự tay trắng, brand có dữ liệu thì không bao giờ thấy. */}
      {editable && coldStart && (
        <div className="bg-sky-950/30 border border-sky-900/60 rounded-2xl p-3 space-y-2">
          <p className="text-xs text-sky-200 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> {brand?.name ?? "Brand"} chưa có ca đối soát nào — engine không có lịch sử riêng để học
          </p>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
            Có thể mượn <b>hình dạng</b> lịch sử toàn agency: khung giờ/thứ nào hiệu quả hơn, hệ số D-Day · lễ · khuyến mãi,
            lợi suất giảm dần khi live nhiều ca trong ngày. Đó là nhịp xem của người dùng TikTok, dùng chung giữa brand được.
            Riêng <b>mức GMV/giờ</b> thì không mượn được — brand khác ngành hàng, giá khác, tệp khác — nên phải là con số của bạn.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[11px] font-bold text-[var(--text-muted)]">GMV/giờ kỳ vọng</label>
            <input
              type="number" min="0" step="1000000"
              value={levelOverride || ""}
              placeholder={autoLevel > 0 ? `${Math.round(autoLevel).toLocaleString("vi-VN")} (tự suy)` : "nhập số"}
              onChange={(e) => setLevelOverride(Number(e.target.value) || 0)}
              className="w-44 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text)]"
            />
            <span className="text-[11px] text-[var(--text-faint)]">
              {borrowLevel > 0
                ? <>đang dùng <b className="text-sky-300">{Math.round(borrowLevel).toLocaleString("vi-VN")} đ/giờ</b> {borrowLevelSource}</>
                : <span className="text-amber-300">Chưa có mức — nhập Target GMV tháng + giờ cần xếp ở Tham số, hoặc gõ thẳng vào đây.</span>}
            </span>
            {levelOverride > 0 && (
              <button onClick={() => setLevelOverride(0)} className="text-[11px] font-bold text-[var(--text-muted)] underline">về mức tự suy</button>
            )}
          </div>
          {borrowLevel > 0 && !borrowedHistory && (
            <p className="text-[11px] text-rose-300">Cả agency cũng chưa có ca đối soát nào — chưa mượn được của ai. Dùng quy tắc lặp hoặc vẽ tay.</p>
          )}
          {borrowedHistory && (
            <p className="text-[11px] text-[var(--text-faint)]">
              Mượn của {borrowedHistory.borrowedFrom!.brands} brand · {borrowedHistory.borrowedFrom!.sessions} ca · {borrowedHistory.borrowedFrom!.months} tháng.
              Bấm "Gợi ý phân bổ" như bình thường. Mọi con số tiền sẽ tỷ lệ thuận với mức trên, và độ tin cậy luôn hiện là <b>thấp</b>.
            </p>
          )}
        </div>
      )}

      {targetGap && targetGap.pct > engineParams.targetGapWarnPct && (
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-2xl p-3 flex flex-wrap items-center gap-3 text-xs text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-[240px] space-y-0.5">
            <p>
              <b>Lưới này dự báo {formatCurrencyAdaptive(targetGap.forecast)}, thiếu {formatCurrencyAdaptive(targetGap.gap)} ({Math.round(targetGap.pct * 100)}%) so với target {formatCurrencyAdaptive(targetTotal)}</b>
              {" "}— target/ca đang cao hơn dự báo ×{fmtFixed((targetTotal / Math.max(1, targetGap.forecast)), 2)}.
            </p>
            <p className="text-amber-300/90">
              {targetGap.fill
                ? `Bù: thêm ~${fmtH(targetGap.extraHours)}h (${targetGap.extraSlots.length} ca) → ${targetGap.extraSlots.slice(0, 6).map((sl) => `${Number(sl.date.slice(8, 10))}/${Number(sl.date.slice(5, 7))} ${sl.startTime}–${sl.endTime}`).join(", ")}${targetGap.extraSlots.length > 6 ? ` +${targetGap.extraSlots.length - 6} ca` : ""}.`
                : "Lấp hết khung giờ cũng không chạm target theo lịch sử — cần tăng CVR/AOV (scheme KM, ads) hoặc hạ target."}
            </p>
          </div>
          {targetGap.fill && (
            <button onClick={() => { const r = targetGap.fill!; setSuggestion({ history: engineHistory, result: r }); applySuggestion(drafts, r); setMsg(`Đã bù ${targetGap.extraSlots.length} ca · ${fmtH(targetGap.extraHours)}h theo target.`); }} className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/60 text-xs font-bold text-amber-200 hover:bg-amber-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Bù giờ theo gợi ý
            </button>
          )}
        </div>
      )}
      {targetGap && targetGap.pct < -engineParams.targetGapWarnPct && (
        <p className="text-[11px] text-emerald-400 px-1">Lưới này dự báo {formatCurrencyAdaptive(targetGap.forecast)} — vượt target {Math.round(-targetGap.pct * 100)}%; target/ca đang thấp hơn dự báo.</p>
      )}

      {rulesOpen && brand && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <RecurringRulesPanel brandId={brandId} brandName={brand.name} templates={brandTemplates} studios={studios} currentUserId={currentUserId} defaultHours={settings.defaultSlotHours} onCreateTemplate={onCreateTemplate} onToggleTemplate={onToggleTemplate} onDeleteTemplate={onDeleteTemplate} />
        </div>
      )}

      {evaluation && <EvaluationPanel ev={evaluation} calibration={calibration} />}

      {suggestion && (
        <SuggestionPanel history={suggestion.history} result={suggestion.result} committedHours={planHours} targetTotal={targetTotal} compare={compare} current={strategy} onPick={(k) => { setStrategy(k); if (compare) { setSuggestion({ history: suggestion.history, result: compare[k] }); applySuggestion(drafts.filter((d) => d.id || d.slotId), compare[k]); } }} />
      )}

      {/* Lưới ngày × ca */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1.5 min-w-[980px]">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={w} className={`text-center text-[11px] font-black uppercase tracking-wide py-1 rounded-lg ${i === 0 || i === 6 ? "text-rose-300 bg-rose-950/30" : "text-[var(--text-faint)] bg-[var(--surface-base)]"}`}>{w}</div>
          ))}
          {cells.map((day, idx) => {
            if (!day) return <div key={`e${idx}`} className="min-h-[96px] rounded-xl bg-[var(--surface-base)]/40" />;
            const list = draftsByDay.get(day) ?? [];
            const bucket = resolveCampBucketType(day, campRanges);
            const style = bucket !== "daily" ? CAMPAIGN_DAY_STYLES[bucket] : null;
            const past = day < today;
            const dayHours = list.reduce((a, d) => a + slotHours(d), 0);
            const isBlackout = settings.blackoutDates.includes(day);
            const ev = eventByDate.get(day);
            const sch = brandSchemes.find((r) => day >= r.start && day <= r.end);
            return (
              <div key={day} className={`min-h-[96px] rounded-xl border p-1.5 flex flex-col gap-1 ${isBlackout ? "bg-[var(--surface-base)] border-dashed border-rose-800 opacity-70" : style ? style.cell : "bg-[var(--surface-base)] border-[var(--border)]"} ${past ? "opacity-50" : ""}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-black ${style ? style.text : "text-[var(--text)]"}`}>{Number(day.slice(-2))}{style ? ` · ${BUCKET_LABEL[bucket]}` : ""}</span>
                  <span className="text-[11px] text-[var(--text-faint)] flex items-center gap-1">
                    {list.length > 0 ? `${list.length} ca · ${fmtH(dayHours)}h` : ""}
                    {!past && <button onClick={() => toggleBlackout(day)} className={`${isBlackout ? "text-rose-400" : "text-[var(--text-faint)] hover:text-rose-400"}`} title={isBlackout ? "Bỏ cấm live ngày này" : "Cấm live ngày này (engine bỏ qua)"}><Ban className="w-3 h-3" /></button>}
                  </span>
                </div>
                {(ev || sch) && <div className="text-[11px] text-[var(--accent-text)] truncate" title={[ev?.label, sch?.label].filter(Boolean).join(" · ")}>{ev?.label}{ev && sch ? " · " : ""}{sch ? `KM: ${sch.label}` : ""}</div>}
                {isBlackout && <div className="text-[11px] text-rose-400 font-bold">cấm live</div>}
                {list.map((d) => (
                  <div key={d.key} className={`rounded-lg border px-1.5 py-1 text-[11px] space-y-1 ${d.slotId ? "border-emerald-900 bg-emerald-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                    <div className="flex items-center gap-1">
                      <input type="time" disabled={!editable} value={d.startTime} onChange={(e) => update(d.key, { startTime: e.target.value })} className="w-[62px] bg-transparent font-mono text-[11px] text-[var(--text)] disabled:opacity-70" />
                      <span className="text-[var(--text-faint)]">–</span>
                      <input type="time" disabled={!editable} value={d.endTime} onChange={(e) => update(d.key, { endTime: e.target.value })} className="w-[62px] bg-transparent font-mono text-[11px] text-[var(--text)] disabled:opacity-70" />
                      {editable && <button onClick={() => remove(d.key)} className="ml-auto text-rose-400 hover:text-rose-300" title="Bỏ ca"><X className="w-3 h-3" /></button>}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[var(--text-faint)] shrink-0">target</span>
                      <input type="number" disabled={!editable} value={d.targetGmv} onChange={(e) => update(d.key, { targetGmv: Number(e.target.value) })} className="w-full min-w-0 bg-[var(--surface-base)] border border-[var(--border)] rounded px-1 py-0.5 font-mono text-[11px] text-[var(--text)] disabled:opacity-70" />
                    </div>
                    {d.expectedGmv !== undefined && (
                      <div className={`text-[11px] font-bold ${d.highExpectation ? "text-amber-400" : "text-[var(--text-faint)]"}`} title={d.reason}>
                        dự báo {formatCurrencyAdaptive(d.expectedGmv)}{d.highExpectation ? " · target cao" : ""}
                      </div>
                    )}
                    {d.slotId && <div className="text-[11px] text-emerald-400 font-bold">đã mở ca</div>}
                  </div>
                ))}
                {editable && !past && !isBlackout && list.length < settings.maxSlotsPerDay && (
                  <button onClick={() => addForDay(day)} className="mt-auto text-[11px] font-bold text-[var(--text-faint)] hover:text-[var(--accent-text)] flex items-center justify-center gap-1 py-1 border border-dashed border-[var(--border)] rounded-lg"><Plus className="w-3 h-3" /> ca</button>
                )}
              </div>
            );
          })}
        </div>
        {drafts.length === 0 && !loading && (
          <p className="text-center text-xs text-[var(--text-muted)] py-6">Lưới trống — bấm "+ ca" ở từng ngày, hoặc "Nạp từ quy tắc" để điền cả tháng theo khung giờ cố định của brand.</p>
        )}
      </div>
      {locked && (unsynced > 0 || dirty) && (
        <p className="text-[11px] text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Kế hoạch đã chốt nhưng lưới có thay đổi chưa đồng bộ ra ca ({unsynced} ca chưa mở{dirty ? ", có sửa chưa lưu" : ""}) — bấm "Chốt lại (đồng bộ ca)".</p>
      )}
    </div>
  );
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const BUCKET_LABEL: Record<string, string> = { daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };
const CONF_LABEL: Record<SuggestResult["confidence"], string> = { none: "không có lịch sử", low: "thấp", medium: "vừa", high: "cao" };

// Lớp 4 — giải thích gợi ý: lịch sử dùng, hệ số học được, ô giờ mạnh/yếu, đường cong biên, khả thi target.
function SuggestionPanel({ history: h, result: r, committedHours, targetTotal, compare, current, onPick }: { history: HistorySummary; result: SuggestResult; committedHours: number; targetTotal: number; compare: Record<SuggestStrategy, SuggestResult> | null; current: SuggestStrategy; onPick: (k: SuggestStrategy) => void }) {
  const top = h.cells.filter((c) => c.n >= 2).slice(0, 6);
  const weak = h.cells.filter((c) => c.tag === "weak").slice(-4);
  const curve = r.marginal.filter((_, i, arr) => i === arr.length - 1 || i % Math.max(1, Math.floor(arr.length / 5)) === 0);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold text-[var(--text)] flex items-center gap-2"><Sparkles className="w-4 h-4 text-[var(--accent-text)]" /> Vì sao gợi ý như vậy</h3>
        {/* Đ12: với lịch sử MƯỢN, `h.sessions` là số ca của TOÀN AGENCY. Ghi nguyên câu cũ ở đây sẽ
            thành "228 ca đối soát" cho một brand đang có 0 ca — đúng kiểu nói dối mà cả phương án
            "mượn hình dạng" sinh ra để tránh. Nên tách hẳn hai câu. */}
        {h.borrowedFrom ? (
          <span className="text-sky-300">
            Độ tin cậy: <b>{CONF_LABEL[r.confidence]}</b> · <b>lịch sử MƯỢN</b> của {h.borrowedFrom.brands} brand khác
            ({h.borrowedFrom.sessions} ca / {h.borrowedFrom.months} tháng) · mức {formatCurrencyAdaptive(h.brandGmvPerHour)}/giờ {h.borrowedFrom.levelSource}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Độ tin cậy: <b className="text-[var(--text)]">{CONF_LABEL[r.confidence]}</b> · {h.sessions} ca đối soát / {h.months} tháng{h.firstDate ? ` (${h.firstDate} → ${h.lastDate})` : ""} · GMV/giờ TB {formatCurrencyAdaptive(h.brandGmvPerHour)}</span>
        )}
      </div>
      {r.notes.map((n, i) => <p key={i} className="text-[11px] text-amber-300">{n}</p>)}
      {compare && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead><tr className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]"><th className="text-left py-1 pr-3">Phương án</th><th className="text-right py-1 pr-3">Ca</th><th className="text-right py-1 pr-3">Ngày</th><th className="text-right py-1 pr-3">Giờ</th><th className="text-right py-1 pr-3">Dự báo</th><th className="py-1"></th></tr></thead>
            <tbody>
              {(Object.keys(STRATEGY_LABEL) as SuggestStrategy[]).map((k) => {
                const x = compare[k];
                const days = new Set(x.slots.map((sl) => sl.date)).size;
                return (
                  <tr key={k} className={`border-t border-[var(--border)] ${k === current ? "bg-[var(--surface-elevated)]/60" : ""}`}>
                    <td className="py-1 pr-3 font-bold text-[var(--text)]">{STRATEGY_LABEL[k]}<span className="font-normal text-[var(--text-faint)]"> · {k === "max" ? "GMV cao nhất" : k === "balanced" ? "rải đều, ≤ 2 ca/ngày, giờ neo cố định" : "ca dài hơn, ít ngày"}</span></td>
                    <td className="py-1 pr-3 text-right text-[var(--text)]">{x.slots.length}</td>
                    <td className="py-1 pr-3 text-right text-[var(--text)]">{days}</td>
                    <td className="py-1 pr-3 text-right text-[var(--text)]">{fmtH(x.totalHours)}h</td>
                    <td className="py-1 pr-3 text-right font-bold text-[var(--text)]">{formatCurrencyAdaptive(x.forecastGmv)}</td>
                    <td className="py-1 text-right">{k === current ? <span className="text-[11px] text-emerald-400 font-bold">đang dùng</span> : <button onClick={() => onPick(k)} className="text-[11px] font-bold text-[var(--accent-text)]">Dùng</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {(h.eventLearned.holiday || h.eventLearned.event || h.eventLearned.mega_sale || h.schemeLearned) && (
        <p className="text-[11px] text-[var(--text-faint)]">
          Học được từ lịch sử: {h.eventLearned.holiday ? `ngày lễ ×${fmtFixed(h.eventMultipliers.holiday, 2)} · ` : ""}{h.eventLearned.mega_sale ? `mega sale ×${fmtFixed(h.eventMultipliers.mega_sale, 2)} · ` : ""}{h.eventLearned.event ? `sự kiện ×${fmtFixed(h.eventMultipliers.event, 2)} · ` : ""}{h.schemeLearned ? `ngày có scheme KM ×${fmtFixed(h.schemeMultiplier, 2)}` : ""}
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <p className="font-bold text-[var(--text-muted)] mb-1">Khung giờ mạnh nhất (thứ × khối 2h)</p>
          {top.map((c) => (
            <div key={`${c.weekday}-${c.block}`} className="flex justify-between gap-2"><span className="text-[var(--text)]">{WD[c.weekday]} {c.block * 2}–{c.block * 2 + 2}h <span className="text-[var(--text-faint)]">({c.n} ca)</span></span><b className={c.tag === "strong" ? "text-emerald-400" : "text-[var(--text)]"}>{formatCurrencyAdaptive(c.gmvPerHour)}/h</b></div>
          ))}
          {weak.length > 0 && <p className="mt-1 text-[11px] text-[var(--text-faint)]">Yếu: {weak.map((c) => `${WD[c.weekday]} ${c.block * 2}h`).join(", ")}</p>}
        </div>
        <div>
          <p className="font-bold text-[var(--text-muted)] mb-1">Hệ số học từ lịch sử</p>
          {(["dday", "midmonth", "payday"] as const).map((b) => (
            <div key={b} className="flex justify-between gap-2"><span className="text-[var(--text)]">{BUCKET_LABEL[b]}</span><b className="text-[var(--text)]">×{fmtFixed(h.campMultipliers[b], 2)} <span className="text-[11px] font-normal text-[var(--text-faint)]">{h.campLearned[b] ? "học được" : "mặc định"}</span></b></div>
          ))}
          <div className="flex justify-between gap-2 mt-1"><span className="text-[var(--text)]">Giờ/ngày lịch sử</span><b className="text-[var(--text)]">{(["daily", "dday", "midmonth", "payday"] as const).map((b) => h.campHoursLearned[b] ? `${b === "daily" ? "thường" : BUCKET_LABEL[b]} ${fmtFixed(h.campHoursPerDay[b], 1)}h` : "").filter(Boolean).join(" · ") || "chưa học được"}</b></div>
          <div className="flex justify-between gap-2 mt-1"><span className="text-[var(--text)]">Ca thứ 2/3 trong ngày</span><b className="text-[var(--text)]">×{fmtFixed(h.diminishing[1], 2)} / ×{fmtFixed(h.diminishing[2], 2)}</b></div>
        </div>
        <div>
          <p className="font-bold text-[var(--text-muted)] mb-1">Đường cong biên (giờ luỹ kế → GMV dự báo)</p>
          {curve.map((p) => (
            <div key={p.hours} className="flex justify-between gap-2"><span className="text-[var(--text)]">{fmtH(p.hours)}h</span><b className="text-[var(--text)]">{formatCurrencyAdaptive(p.gmv)}</b></div>
          ))}
          <p className="mt-1 text-[11px] text-[var(--text-faint)]">
            {committedHours > 0 ? `Cam kết ${fmtH(committedHours)}h → dự báo ${formatCurrencyAdaptive(r.forecastGmv)}` : ""}
            {targetTotal > 0 ? ` · target ${formatCurrencyAdaptive(targetTotal)}${r.hoursToHitTarget !== null ? ` cần ~${Math.ceil(r.hoursToHitTarget)}h` : " (không chạm được trong khung)"}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// Giai đoạn D — kế hoạch vs thực tế của tháng đang xem + tình trạng hiệu chỉnh.
function EvaluationPanel({ ev, calibration }: { ev: PlanEvaluation; calibration: ReturnType<typeof buildCalibration> | null }) {
  const pending = ev.rows.filter((r) => r.status === "pending").length;
  const worst = ev.rows.filter((r) => r.status === "done" && r.errorPct !== null).sort((a, b) => Math.abs(b.errorPct!) - Math.abs(a.errorPct!)).slice(0, 5);
  const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold text-[var(--text)]">Kế hoạch vs thực tế</h3>
        <span className="text-[var(--text-muted)]">{ev.doneCount} ca đã có số · {pending} ca chưa diễn ra</span>
        {ev.doneCount > 0 && (
          <span className="text-[var(--text-muted)]">Dự báo {formatCurrencyAdaptive(ev.expectedDone)} · target {formatCurrencyAdaptive(ev.targetDone)} · <b className="text-[var(--text)]">thực tế {formatCurrencyAdaptive(ev.actualDone)}</b>{ev.bias !== null ? ` · lệch ${pct(ev.bias)}` : ""}{ev.mape !== null ? ` · sai số TB/ca ${Math.round(ev.mape * 100)}%` : ""}</span>
        )}
      </div>
      {worst.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1.5">
          {worst.map((r) => (
            <div key={`${r.date}${r.startTime}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-2 py-1">
              <div className="font-mono text-[11px] text-[var(--text-muted)]">{r.date.slice(5)} {r.startTime}–{r.endTime}</div>
              <div className="text-[var(--text)]">{formatCurrencyAdaptive(r.actualGmv ?? 0)} <span className="text-[var(--text-faint)]">vs dự báo {formatCurrencyAdaptive(r.expectedGmv)}</span> <b className={r.errorPct! >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(r.errorPct)}</b></div>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[var(--text-faint)]">
        {calibration ? `Engine tháng này đã hiệu chỉnh từ ${calibration.observations} ca kế hoạch có thực tế ở các tháng khác (lệch chung ${pct(calibration.overallBias)}).` : "Chưa có tháng nào khác đã chốt kế hoạch và có thực tế — engine chưa hiệu chỉnh."}
        {" "}Ca ops đặt tay (không có dự báo) không tham gia hiệu chỉnh.
      </p>
    </div>
  );
}
