import { useEffect, useMemo, useRef, useState } from "react";
import { defaultPlanMonth } from "../lib/defaultMonth";
import { Brand, BrandChannel, BrandContract, BrandMonthPlan, BrandMonthPlanSlot, BrandMonthlyCommitment, BrandStudio, CalendarEventRow, LiveSession, PlanCampRanges, PromoScheme, RecurringShiftTemplate, ShiftSlot, Studio, Talent } from "../types";
import { AlertTriangle, Ban, CalendarRange, Lock, Plus, Repeat, Save, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { commitmentsRead, contractsRead, upsertMonthlyCommitment } from "../lib/db/brandContracts";
import type { TabPrefetchCtx } from "../lib/db/prefetch";
import { loadRememberedBrandId } from "../lib/defaultBrand";
import { errorMessage } from "../lib/errorMessage";
import { PlanSettings, calendarEventsRead, deleteMonthPlan, fetchBrandLockedPlanSlots, fetchMonthPlan, fetchPlanStatuses, lockMonthPlan, lockedPlanSlotsRead, monthPlanRead, planStatusesRead, replacePlanSlots, upsertMonthPlan } from "../lib/db/monthPlans";
import { PlanEvaluation, buildCalibration, evaluatePlan } from "../lib/scheduling/planEvaluation";
import { computeCommitmentProgress, contractCovering, monthCommitmentOf, todayVn } from "../lib/performance/brandCommitment";
import { useDefaultBrand } from "../hooks/useDefaultBrand";
import { CAMPAIGN_DAY_STYLES, resolveCampBucketType } from "../lib/campaignDays";
import { targetWeightModel, targetWeights } from "../lib/performance/slotInsights";
import {
  PlanDraftSlot,
  allocateDraftTargets,
  crossBrandCheck,
  daysOfMonth,
  draftKeyOf,
  draftsFromSaved,
  draftsFromSessions,
  draftsFromSuggestion,
  endsAfterMidnight,
  mergeFromTemplates,
  nextSlotForDay,
  slotHours,
  totalsOf,
  validateDrafts
} from "../lib/scheduling/monthPlanGrid";
import { RecurringRulesPanel } from "./scheduling/RecurringRulesPanel";
import { HistorySummary, STRATEGY_LABEL, SuggestResult, SuggestStrategy, buildBorrowedHistory, buildHistory, estimateSlots, suggestMonthPlan } from "../lib/scheduling/suggestEngine";
import { EngineParams } from "../lib/scheduling/engineParams";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { useConfirm } from "../hooks/useConfirm";
import { PageIntro } from "./common/PageIntro";

import { fmtMonth, fmtFixed, fmtVndShort, fmtVndFull } from "../lib/format";
import { MonthPicker } from "./common/MonthPicker";
import { channelTitle, platformOf, brandPlatformKey, type ReportPlatform } from "../lib/reportPlatform";
import { platformsOfBrand } from "../lib/channels";
interface MonthPlanProps {
  /** Sàn của workspace agency (07/10): kế hoạch, target, cam kết của sàn này — không còn nút chuyển sàn trong màn. */
  platform: ReportPlatform;
  /** Brand CÓ KÊNH ở sàn này (App lọc theo brand_channels, 0149). */
  brands: Brand[];
  channels: BrandChannel[];
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
  // Phòng live mặc định của brand (0098) — chốt ghi vào ca sinh ra. Cấu hình của brand: CHỈ ĐỌC ở đây, đổi ở CRM →
  // "Hợp đồng & giá" (gộp cấu hình 06/10; trước đó ô chọn phòng nằm ở màn này).
  brandStudios: BrandStudio[];
  /** Sang CRM, bung sẵn "Hợp đồng & giá" của brand × sàn. */
  onOpenCrm?: (brandId: string, platform: "TikTok" | "Shopee") => void;
  // Chỉ để so số ca chạy song song toàn agency với số người (audit workflow #12).
  talents: Talent[];
}

const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const fmtH = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
const DEFAULT_SETTINGS: PlanSettings = { defaultSlotHours: 3, liveWindowStart: "09:00", liveWindowEnd: "23:00", maxSlotsPerDay: 3, notes: "", blackoutDates: [], targetGmv: 0, campRanges: {}, shopTargetGmv: 0, adsBudget: 0 };
const CAMP_RANGE_LABEL: Record<keyof PlanCampRanges, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

const nextMonthOf = (month: string, delta: number) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

// Kế Hoạch Tháng — giai đoạn A (0090): lập lưới ngày × ca cho brand, nạp nhanh từ quy tắc lặp,
// chia target theo khung camp của tab 05, chốt → sinh shift_slots. Gợi ý từ lịch sử là giai đoạn B.
// Lượt đọc lúc mở màn — nạp trước trong lúc chờ đợt nạp chung (lib/db/prefetch.ts). Brand mặc định là brand
// đã nhớ (useDefaultBrand ưu tiên nó); chưa nhớ brand nào thì phần theo brand đợi màn mount như cũ.
export function prefetchMonthPlan(_ctx: TabPrefetchCtx): void {
  const next = nextMonthOf(todayVn().slice(0, 7), 1);
  commitmentsRead.prefetch();
  contractsRead.prefetch();
  calendarEventsRead.prefetch();
  planStatusesRead.prefetch(next);
  planStatusesRead.prefetch(todayVn().slice(0, 7));
  const remembered = loadRememberedBrandId();
  if (remembered) {
    monthPlanRead.prefetch(remembered, next, "TikTok");
    lockedPlanSlotsRead.prefetch(remembered, "TikTok");
  }
}

export default function MonthPlan({
  platform: platformProp,
  brands,
  channels,
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
  onOpenCrm,
  talents
}: MonthPlanProps) {
  const confirm = useConfirm();
  const today = todayVn();
  const [brandId, setBrandId] = useDefaultBrand(brands, sessions, today);
  // Kế hoạch theo sàn (0140): mỗi brand × tháng × sàn một kế hoạch, target riêng (user chốt 06/10). Đổi brand mà sàn đã
  // chọn không có ở brand mới thì về sàn đầu của brand đó.
  const platforms = useMemo(() => (brandId ? platformsOfBrand(channels, brandId) : []), [brandId, channels]);
  // Sàn mở sẵn: sàn đã nhớ cùng brand (nút "Lập kế hoạch VERA Shopee" ở Dashboard/Toàn Cảnh/Việc cần làm — rememberBrandId).
  const platform: ReportPlatform = platformProp;
  const brandLabel = (name: string | undefined) => channelTitle(name ?? "", platform, platforms.length > 1).replace(" · ", " ");
  // Lịch sử cho engine/dự báo: chỉ ca CÙNG SÀN (năng suất hai sàn khác nhau — VERA Shopee ~1,6x GMV/giờ TikTok).
  // Kiểm trùng phòng/người (crossBrandCheck) vẫn dùng mọi ca: người và phòng là vật lý, không theo sàn.
  const platformSessions = useMemo(() => sessions.filter((s) => platformOf(s) === platform), [sessions, platform]);
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
  const [contracts, setContracts] = useState<BrandContract[]>([]);
  const [suggestion, setSuggestion] = useState<{ history: HistorySummary; result: SuggestResult } | null>(null);
  // Cam kết CỦA THÁNG NÀY (gộp cấu hình 06/10): chỗ nhập duy nhất. Mặc định = điều khoản hợp đồng ở CRM; sửa ở đây là
  // lưu thật vào dòng cam kết của tháng (trước đó là ô "giờ cần xếp" không lưu + module Cam Kết Hợp Đồng riêng).
  // Chuỗi = đang gõ; null = theo số đã lưu / hợp đồng.
  const [commitHoursDraft, setCommitHoursDraft] = useState<string | null>(null);
  const [commitGmvDraft, setCommitGmvDraft] = useState<string | null>(null);
  const [commitSaving, setCommitSaving] = useState(false);
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [strategy, setStrategy] = useState<SuggestStrategy>("max");
  const [compare, setCompare] = useState<Record<SuggestStrategy, SuggestResult> | null>(null);
  // Nhắc việc: brand chưa chốt kế hoạch cho THÁNG SAU (theo hôm nay), bất kể đang xem tháng nào.
  const [nextMonthMissing, setNextMonthMissing] = useState<string[]>([]);
  // Kế hoạch THÁNG NÀY còn nháp (đã tạo, chưa chốt) — việc đang treo. Mở màn thì nhảy về đó thay vì tháng sau
  // (lib/defaultMonth.ts, audit người mới 2026-10-04: 04/10 kế hoạch T10 CROCS còn nháp mà màn mở T11 trống).
  const [curMonthDrafts, setCurMonthDrafts] = useState<Brand[]>([]);
  const userPicked = useRef(false);
  // Giai đoạn D: mọi ca kế hoạch đã chốt của brand (mọi tháng) → đối chiếu thực tế + hiệu chỉnh.
  const [lockedSlots, setLockedSlots] = useState<BrandMonthPlanSlot[]>([]);
  const [lockedSlotsTick, setLockedSlotsTick] = useState(0);

  const brand = brands.find((b) => b.id === brandId);
  const brandStudioId = findBrandStudioId(brandStudios, brandId, platform);
  const brandStudio = studios.find((s) => s.id === brandStudioId);
  const brandTemplates = useMemo(
    () => recurringShiftTemplates.filter((t) => t.brandId === brandId && platformOf(t) === platform),
    [recurringShiftTemplates, brandId, platform]
  );

  useEffect(() => {
    commitmentsRead.take().then(setCommitments).catch(() => setCommitments([]));
    contractsRead.take().then(setContracts).catch(() => setContracts([]));
    calendarEventsRead.take().then(setEvents).catch(() => setEvents([]));
  }, []);
  const nextMonth = nextMonthOf(today.slice(0, 7), 1);
  // `initial` = lượt mount (lấy bản nạp trước nếu có); sau khi chốt/xoá kế hoạch thì luôn đọc mới.
  const refreshMissing = (initial = false) => {
    (initial ? planStatusesRead.take(nextMonth) : fetchPlanStatuses(nextMonth))
      .then((m) =>
        setNextMonthMissing(
          // Chỉ sàn của workspace (07/10): kế hoạch sàn khác thuộc workspace của sàn đó.
          brands.filter((b) => m.get(brandPlatformKey(b.id, platformProp))?.status !== "locked").map((b) => b.name)
        )
      )
      .catch(() => setNextMonthMissing([]));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => refreshMissing(true), [brands, nextMonth, platformProp]);
  useEffect(() => {
    const cur = today.slice(0, 7);
    let alive = true;
    planStatusesRead.take(cur).then((m) => {
      if (!alive) return;
      const drafts = brands.filter((b) => m.get(brandPlatformKey(b.id, platformProp))?.status === "draft");
      setCurMonthDrafts(drafts);
      // Chỉ nhảy tháng khi chính brand đang mở có nháp tháng này (đến từ nút "Chốt kế hoạch" của brand khác thì
      // giữ đúng brand đó); brand khác còn nháp thì banner bên dưới nhắc.
      if (userPicked.current || !drafts.some((b) => b.id === brandId)) return;
      setMonth(defaultPlanMonth(today, new Set([cur])));
    }).catch(() => {});
    return () => { alive = false; };
    // Chỉ lúc mount: sau khi người dùng tự chọn brand/tháng thì không nhảy nữa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!brandId) return;
    let alive = true;
    (lockedSlotsTick === 0 ? lockedPlanSlotsRead.take(brandId, platform) : fetchBrandLockedPlanSlots(brandId, platform)).then((r) => alive && setLockedSlots(r)).catch(() => alive && setLockedSlots([]));
    return () => { alive = false; };
  }, [brandId, platform, lockedSlotsTick]);
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
    monthPlanRead.take(brandId, month, platform)
      .then((r) => {
        if (!alive) return;
        if (r) {
          setPlan(r.plan);
          setSettings({ defaultSlotHours: r.plan.defaultSlotHours, liveWindowStart: r.plan.liveWindowStart, liveWindowEnd: r.plan.liveWindowEnd, maxSlotsPerDay: r.plan.maxSlotsPerDay, notes: r.plan.notes, blackoutDates: r.plan.blackoutDates, targetGmv: r.plan.targetGmv, campRanges: r.plan.campRanges, shopTargetGmv: r.plan.shopTargetGmv, adsBudget: r.plan.adsBudget });
          setDrafts(draftsFromSaved(r.slots));
        } else {
          setPlan(null);
          setSettings(DEFAULT_SETTINGS);
          setDrafts([]);
        }
        setDirty(false);
        setSuggestion(null);
        setCompare(null);
        setCommitHoursDraft(null); // số đang gõ là của brand × sàn × tháng cũ — không mang sang
        setCommitGmvDraft(null);
      })
      .catch((e) => alive && setMsg(`Không tải được kế hoạch: ${errorMessage(e)}`))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [brandId, month, platform]);

  const monthCommit = useMemo(
    () => monthCommitmentOf(commitments, contracts, brandId, platform, `${month}-01`),
    [commitments, contracts, brandId, platform, month]
  );
  const commitDirty = commitHoursDraft !== null || commitGmvDraft !== null;
  const commitHoursText = commitHoursDraft ?? (monthCommit.source === "none" ? "" : String(monthCommit.hours));
  const commitGmvText = commitGmvDraft ?? (monthCommit.gmv === undefined ? "" : String(monthCommit.gmv));
  // Engine xếp đúng số giờ cam kết của tháng (đang gõ cũng tính — để "Gợi ý phân bổ" thử ngay số mới).
  const planHours = Number(commitHoursText) > 0 ? Number(commitHoursText) : 0;
  // GMV cam kết (audit workflow 2026-10-04 #7): so với Target GMV tháng của kế hoạch.
  const committedGmv = Number(commitGmvText) > 0 ? Number(commitGmvText) : 0;
  // Tiến độ giao giờ của tháng đang xem — cùng hàm với Toàn Cảnh Brand / Nhân sự ca / tab Hợp Đồng của brand.
  const commitProgress = useMemo(
    () =>
      planHours > 0
        ? computeCommitmentProgress(
            { id: "cur", brandId, platform, periodMonth: `${month}-01`, committedHours: planHours, committedGmv: committedGmv || undefined, isOverride: monthCommit.source === "month" },
            brands.find((b) => b.id === brandId)?.name ?? "",
            sessions,
            today
          )
        : null,
    [planHours, committedGmv, brandId, platform, month, monthCommit.source, brands, sessions, today]
  );

  /** Ghi cam kết tháng đang xem (nếu có sửa). Trả false khi lỗi — nơi gọi dừng lại. */
  const saveCommitment = async (): Promise<boolean> => {
    if (!commitDirty || !brandId) return true;
    const hoursRaw = commitHoursText.trim();
    const hours = hoursRaw === "" ? 0 : Number(hoursRaw);
    const gmvRaw = commitGmvText.trim();
    const gmv = gmvRaw === "" ? undefined : Number(gmvRaw);
    if (!Number.isFinite(hours) || hours < 0 || (gmv !== undefined && (!Number.isFinite(gmv) || gmv < 0))) {
      setMsg("Giờ / GMV cam kết phải là số không âm (để trống GMV nếu không cam kết).");
      return false;
    }
    const contract = contractCovering(contracts, brandId, platform, `${month}-01`);
    setCommitSaving(true);
    try {
      const row = await upsertMonthlyCommitment({
        brandId,
        periodMonth: `${month}-01`,
        platform,
        committedHours: hours,
        committedGmv: gmv,
        contractId: contract?.id,
        // Bằng đúng điều khoản hợp đồng ⇒ vẫn "theo hợp đồng" (sửa hợp đồng ở CRM thì tháng này đổi theo).
        isOverride: !contract || hours !== contract.monthlyHours || gmv !== contract.monthlyGmv
      });
      setCommitments((prev) => [...prev.filter((c) => !(c.brandId === row.brandId && platformOf(c) === platformOf(row) && c.periodMonth === row.periodMonth)), row]);
      setCommitHoursDraft(null);
      setCommitGmvDraft(null);
      return true;
    } catch (e) {
      setMsg(`Không lưu được cam kết tháng: ${errorMessage(e)}`);
      return false;
    } finally {
      setCommitSaving(false);
    }
  };
  // Target và khoảng camp là của riêng kế hoạch (0094) — không đọc Report Tháng.
  const targetTotal = settings.targetGmv > 0 ? settings.targetGmv : 0;
  const campRanges = settings.campRanges;
  const totals = useMemo(() => totalsOf(drafts), [drafts]);
  const errors = useMemo(() => validateDrafts(drafts, settings), [drafts, settings]);
  // #12: kế hoạch từng brand không thấy brand khác — trùng phòng mặc định + số ca chạy song song toàn agency.
  const crossBrand = useMemo(
    () => crossBrandCheck(drafts, { brandId, studioId: brandStudioId || undefined, sessions, shiftSlots, today }),
    [drafts, brandId, brandStudioId, sessions, shiftSlots, today]
  );
  const clashKeys = useMemo(() => new Set(crossBrand.clashes.map((c) => c.key)), [crossBrand]);
  const hostCapacity = talents.filter((t) => t.role !== "Assistant").length;
  const overCapacity = crossBrand.peak && (crossBrand.peak.concurrent > studios.length || crossBrand.peak.concurrent > hostCapacity) ? crossBrand.peak : null;
  const locked = plan?.status === "locked";
  // 0091: kế hoạch đã chốt vẫn sửa được; "Chốt lại" đồng bộ ca (thêm mới / huỷ ca mở bị bỏ).
  const editable = true;
  const unsynced = locked ? drafts.filter((d) => !d.slotId).length : 0;
  // Kế hoạch ĐÃ CHỐT (audit workflow 2026-10-04 #3/#4; DB chặn bằng trigger 0133): ca đã chốt người không dời/bỏ
  // trong lưới được — "Chốt lại" chỉ huỷ ca CÒN MỞ, nên ca cũ sẽ giữ nguyên giờ cũ kèm host và một ca mới mở thêm
  // ở giờ mới. Ca ngày đã qua giữ nguyên giờ + target như lúc chốt (mẫu số run-rate).
  const finalizedSlotIds = useMemo(() => new Set(shiftSlots.filter((sl) => sl.status === "finalized").map((sl) => sl.id)), [shiftSlots]);
  const isPastFrozen = (d: PlanDraftSlot) => locked && !!d.id && d.date < today;
  const isStaffed = (d: PlanDraftSlot) => locked && !!d.slotId && finalizedSlotIds.has(d.slotId);
  const timeLocked = (d: PlanDraftSlot) => isPastFrozen(d) || isStaffed(d);
  const eventByDate = useMemo(() => new Map(events.map((e) => [e.date, e])), [events]);
  const brandSchemes = useMemo(() => promoSchemes.filter((sc) => sc.brandId === brandId).map((sc) => ({ start: sc.startDate, end: sc.endDate, label: sc.title })), [promoSchemes, brandId]);
  const history = useMemo(() => buildHistory(platformSessions, brandId, today, { events, schemes: brandSchemes, params: engineParams }), [platformSessions, brandId, today, events, brandSchemes, engineParams]);
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
        ? buildBorrowedHistory(platformSessions, today, { events, schemes: brandSchemes, params: engineParams }, borrowLevel, borrowLevelSource)
        : null,
    [coldStart, borrowLevel, borrowLevelSource, platformSessions, today, events, brandSchemes, engineParams]
  );
  // Lịch sử engine THỰC SỰ dùng. Có lịch sử thật thì luôn ưu tiên lịch sử thật — không bao giờ mượn
  // đè lên dữ liệu của chính brand.
  const engineHistory = coldStart && borrowedHistory ? borrowedHistory : history;

  const estimateCtx = useMemo(() => ({ camp: campRanges, events, schemes: brandSchemes, calibration: calibration?.factors }), [campRanges, events, brandSchemes, calibration]);
  // Chia target ca theo chỉ số khung giờ + vị trí ngày camp (user chốt 2026-09-28): ca 11–13h lịch sử
  // chỉ đạt ~0,8 lần mặt bằng mà nhận target ngang ca 19–20h thì % Target đỏ vì KHUNG, không vì host.
  // null khi brand chưa đủ 2 tháng lịch sử ⇒ vẫn chia theo dự báo engine như trước.
  const weightModel = useMemo(
    // Lịch sử xếp loại ngày theo lịch cố định, KHÔNG theo khung camp tháng đang lập: khung nhập tay là ngày của THÁNG NÀY,
    // áp lên T6–T9 nó xoá D-Day/Mid-Month/Pay Day cũ khỏi lịch sử (07/10: nhập D-Day 8–11 ⇒ GMV/giờ D-Day = ngày thường ⇒ target ca
    // D-Day bằng ca thường, thấp hơn dự báo cả chục triệu). Khung nhập tay chỉ dùng để xếp loại cho CA CỦA THÁNG (allocationWeights).
    () => targetWeightModel(platformSessions.filter((s) => s.brandId === brandId), month, (d) => resolveCampBucketType(d)),
    [platformSessions, brandId, month]
  );
  const allocationWeights = (next: PlanDraftSlot[], forecasts: number[]) =>
    weightModel ? targetWeights(next, weightModel, (d) => resolveCampBucketType(d, campRanges)) : forecasts;
  // Target đi theo lưới (user chốt 2026-09-21): ở giai đoạn NHÁP, mọi thay đổi cấu trúc (thêm/bỏ/dời
  // ca, đổi giờ, cấm ngày, nạp quy tắc) → chia lại target tháng theo dự báo mới của cả lưới, không
  // chờ bấm "Chia target theo dự báo". Sau khi CHỐT, target/ca là số cam kết với brand/host — không
  // chia lại; ca thêm sau chốt mang target = dự báo riêng của nó, phần bù/run-rate là việc của module
  // hỗ trợ vận hành (sau). Sửa target/ca bằng tay không kích hoạt chia lại (thanh "Tổng target" báo lệch).
  const withForecast = (next: PlanDraftSlot[], target = targetTotal, ctx = estimateCtx): PlanDraftSlot[] => {
    if (next.length === 0) return next;
    const w = estimateSlots(engineHistory, next, ctx);
    const flag = (d: PlanDraftSlot) => ({ ...d, highExpectation: d.expectedGmv ? d.targetGmv > d.expectedGmv * engineParams.highExpectationRatio : d.highExpectation });
    if (!locked && target > 0) return allocateDraftTargets(next, target, allocationWeights(next, w), w).map(flag);
    return next.map((d, i) => flag({
      ...d,
      expectedGmv: w[i] > 0 ? Math.round(w[i]) : d.expectedGmv,
      targetGmv: locked && !d.id && d.targetGmv === 0 && w[i] > 0 ? Math.round(w[i]) : d.targetGmv
    }));
  };
  const toggleBlackout = (day: string) => {
    setSettings((st) => ({ ...st, blackoutDates: st.blackoutDates.includes(day) ? st.blackoutDates.filter((d) => d !== day) : [...st.blackoutDates, day].sort() }));
    // Ca đã chốt người của ngày đó giữ lại — DB không cho bỏ (0133), huỷ ở Cửa sổ Ca Live trước.
    setDrafts((prev) => withForecast(prev.filter((d) => d.date !== day || settings.blackoutDates.includes(day) || timeLocked(d))));
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
  const remove = async (key: string) => {
    const d = drafts.find((x) => x.key === key);
    // Bỏ ca khỏi kế hoạch đã chốt = bỏ luôn target của nó khỏi target tháng. Luật run-rate: ca kế hoạch HUỶ thì
    // giữ target — muốn vậy thì huỷ ca ở Nhân sự ca, đừng bỏ khỏi lưới. Nói rõ trước khi bỏ.
    if (locked && d?.id && d.targetGmv > 0 && !(await confirm(
      `Bỏ ca ${d.date.slice(8)}/${d.date.slice(5, 7)} ${d.startTime}–${d.endTime} khỏi kế hoạch đã chốt?\n\nTarget ${fmtVndShort(d.targetGmv)} của ca này sẽ bị trừ khỏi target tháng. Nếu chỉ là ca không chạy được (vẫn tính vào mẫu số run-rate) thì huỷ ca ở Bảng Vận Hành thay vì bỏ khỏi lưới.`,
      { danger: true }
    ))) return;
    setDrafts((prev) => withForecast(prev.filter((x) => x.key !== key)));
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
  // Ca đã nhập sẵn (file lịch / tạo tay) của brand × sàn × tháng đang xem — nguồn của "Dựng lưới từ ca đã nhập" và của số ca
  // Chốt sẽ GẮN thay vì mở ca chờ đăng ký (0151).
  const monthSessions = useMemo(
    () => platformSessions.filter((s) => s.brandId === brandId && s.date.slice(0, 7) === month && s.status !== "Cancelled"),
    [platformSessions, brandId, month]
  );
  // Lịch tháng đã nhập bằng file thì kế hoạch phải dựng theo ĐÚNG lịch đó: lưới nháp tự sinh gần như không khớp ca thật (đo 07/10:
  // CROCS T10 26/75 ca khớp giờ) nên chốt nó sẽ mở hàng chục ca chờ đăng ký trùng và để 60+ ca thật "ngoài kế hoạch, target 0".
  const loadFromSessions = async () => {
    if (monthSessions.length === 0) {
      setMsg(`${brandLabel(brand?.name)} chưa có ca nào đã nhập trong tháng ${fmtMonth(month)}.`);
      return;
    }
    if (!locked && drafts.length > 0 && !(await confirm(`Dựng lại lưới theo ${monthSessions.length} ca đã nhập? ${drafts.length} ca nháp đang có sẽ được thay (chưa lưu thì mất). Target ghi sẵn trên ca đã nhập được giữ; chưa có thì chia từ Target GMV tháng.`))) return;
    const { next, added, duplicates } = draftsFromSessions(monthSessions, locked ? drafts : []);
    const perDay = new Map<string, number>();
    for (const d of next) perDay.set(d.date, (perDay.get(d.date) ?? 0) + 1);
    const overnight = next.some((d) => endsAfterMidnight(d));
    const ends = next.filter((d) => !endsAfterMidnight(d)).map((d) => d.endTime);
    setSettings((st) => ({
      ...st,
      maxSlotsPerDay: Math.min(8, Math.max(st.maxSlotsPerDay, ...perDay.values())),
      liveWindowStart: [st.liveWindowStart, ...next.map((d) => d.startTime)].sort()[0],
      liveWindowEnd: [st.liveWindowEnd, ...ends, ...(overnight ? ["23:59"] : [])].sort().at(-1) ?? st.liveWindowEnd
    }));
    const fileTarget = totalsOf(next).target;
    if (fileTarget > 0) {
      // Target đã ghi trên ca thật: giữ nguyên từng ca, KHÔNG chia lại; target tháng = tổng.
      if (!locked) setSettings((st) => ({ ...st, targetGmv: Math.round(fileTarget) }));
      setDrafts(next);
    } else {
      setDrafts(withForecast(next));
    }
    setDirty(true);
    const noTarget = next.filter((d) => d.targetGmv <= 0).length;
    setMsg(
      `${locked ? `Thêm ${added} ca đã nhập chưa có trong kế hoạch` : `Đã dựng lưới ${next.length} ca theo lịch đã nhập`}${duplicates > 0 ? ` (bỏ ${duplicates} ca trùng hệt giờ)` : ""}. ` +
        (fileTarget > 0
          ? `Target lấy từ ca đã nhập: tổng ${fmtVndShort(fileTarget)}${noTarget > 0 ? `, ${noTarget} ca chưa có target` : ""}. `
          : targetTotal > 0
            ? `Đã chia ${fmtVndShort(targetTotal)} xuống ca. `
            : "Chưa có target — nhập Target GMV tháng rồi bấm Chia lại target. ") +
        "Kiểm tra rồi bấm Chốt: ca đã nhập được GẮN vào kế hoạch, không mở ca chờ đăng ký."
    );
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
    setDrafts(allocateDraftTargets(drafts, targetTotal, allocationWeights(drafts, weights), weights));
    setDirty(true);
    setMsg(
      weightModel
        ? `Đã chia ${fmtVndShort(targetTotal)} theo giờ × GMV/giờ từng loại ngày${weightModel.useSlot ? " × chỉ số khung giờ" : ""}${weightModel.useCamp ? " × vị trí ngày trong đợt Mid-Month/Pay Day" : ""} (lịch sử các tháng trước).`
        : byForecast
          ? `Đã chia ${fmtVndShort(targetTotal)} theo dự báo từng ca (${history.sessions} ca lịch sử).`
          : `Brand chưa có lịch sử đối soát — đã chia ${fmtVndShort(targetTotal)} đều theo giờ.`
    );
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
      setMsg("Nhập giờ cam kết tháng này (ô bên phải — mặc định lấy từ hợp đồng ở CRM) để engine biết phải xếp bao nhiêu giờ — hoặc nhập Target GMV rồi bấm Xếp theo target.");
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
    setMsg(`${mode === "target" ? "Xếp theo target" : "Gợi ý"} ${result.slots.length} ca · ${fmtH(result.totalHours)}h · dự báo ${fmtVndShort(result.forecastGmv)}${targetTotal > 0 ? ` / target ${fmtVndShort(targetTotal)}` : ""}${drafts.length > 0 ? ` (giữ ${drafts.length} ca đang có)` : ""}.`);
  };

  const clearAll = async () => {
    if (!(await confirm("Xoá toàn bộ ca trong lưới nháp?", { danger: true }))) return;
    setDrafts([]);
    setDirty(true);
  };

  // Audit 2026-09-28 mục 2: kế hoạch ĐÃ CHỐT (hoặc đang chốt) thì "Target GMV tháng" = Σ target các ca. Ô này là
  // cái Toàn Cảnh Brand, Kế Hoạch Tháng Sau (brand) và Report Tháng phần 7 đọc; Dashboard/run-rate/Bản Tin CEO
  // cộng target từng ca. Sửa tay target một ca hay thêm ca sau chốt mà không đồng bộ ô này ⇒ hai số cho một tháng.
  // Giai đoạn nháp giữ nguyên: ô tháng là con số ops nhập để chia xuống lưới.
  const save = async (opts?: { committing?: boolean }): Promise<BrandMonthPlan | null> => {
    if (errors.length > 0) {
      setMsg(`Sửa lỗi trước khi lưu: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1})` : ""}`);
      return null;
    }
    if (!(await saveCommitment())) return null;
    setSaving(true);
    try {
      const toSave = locked || opts?.committing ? { ...settings, targetGmv: Math.round(totals.target) } : settings;
      if (toSave !== settings) setSettings(toSave);
      const p = await upsertMonthPlan(brandId, month, toSave, platform);
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
    if (drafts.length === 0 && locked && !(await confirm(`Lưới trống — chốt lại sẽ HUỶ toàn bộ ca đang mở của kế hoạch ${brandLabel(brand?.name)} tháng ${fmtMonth(month)} (trừ ca đã có người đăng ký). Tiếp tục?`, { danger: true }))) return;
    const gap = planHours - totals.hours;
    const warn = planHours > 0 && Math.abs(gap) > 0.01 ? `\n\nGiờ kế hoạch ${fmtH(totals.hours)}h ${gap > 0 ? "THIẾU" : "VƯỢT"} ${fmtH(Math.abs(gap))}h so với ${fmtH(planHours)}h cam kết tháng này.` : "";
    const relockNote = locked ? "\n\nChốt lại sẽ mở thêm ca mới và HUỶ ca đang mở đã bị bỏ khỏi kế hoạch (trừ ca đã có người đăng ký)." : "";
    const targetWarn = targetGap && targetGap.pct > engineParams.targetGapWarnPct ? `\n\nDự báo lưới ${fmtVndShort(targetGap.forecast)} THIẾU ${fmtVndShort(targetGap.gap)} (${Math.round(targetGap.pct * 100)}%) so với target ${fmtVndShort(targetTotal)}${targetGap.fill ? ` — cần bù ~${fmtH(targetGap.extraHours)}h.` : " — thêm giờ trong khung cũng không chạm."} Sau khi chốt, target/ca KHÔNG chia lại nữa.` : "";
    const sumDelta = Math.round(totals.target) - targetTotal;
    const sumNote = Math.abs(sumDelta) >= 1
      ? `\n\nTarget các ca cộng lại ${fmtVndShort(totals.target)} ${sumDelta > 0 ? "VƯỢT" : "THIẾU"} ${fmtVndShort(Math.abs(sumDelta))} so với ô Target GMV tháng ${fmtVndShort(targetTotal)}. Sau khi chốt, target tháng = tổng các ca (${fmtVndShort(totals.target)}) ở mọi màn.`
      : "";
    // 0151: ca kế hoạch trùng giờ với ca đã nhập thì được GẮN vào ca đó (không mở ca chờ đăng ký), kể cả ngày đã qua.
    const enteredKeys = new Set(monthSessions.map(draftKeyOf));
    const matchedCount = drafts.filter((d) => !d.slotId && enteredKeys.has(draftKeyOf(d))).length;
    const pastCount = drafts.filter((d) => d.date < today && !enteredKeys.has(draftKeyOf(d))).length;
    const matchedNote = matchedCount > 0 ? `\n\n${matchedCount} ca trùng giờ với ca đã nhập sẽ được GẮN vào ca đó (nhận target, không mở đăng ký). Cần migration 0151 đã chạy — chưa chạy thì chốt sẽ mở thêm ca chờ đăng ký trùng giờ.` : "";
    const pastNote =
      pastCount > 0
        ? `\n\n${pastCount} ca ở ngày đã qua không có ca đã nhập tương ứng sẽ KHÔNG mở chờ đăng ký (chỉ giữ target trong kế hoạch). Ca nào đã live thật: mở ca đúng ngày giờ đó ở Lịch & Studio → "Mở ca chờ đăng ký" — ca mở TRƯỚC khi chốt sẽ được gắn vào kế hoạch và nhận target; mở sau thì bấm "Chốt lại".`
        : "";
    const studioNote = brandStudio ? `\n\nCa sinh ra gắn phòng ${brandStudio.name} (${brandStudio.roomNumber}).` : "\n\nBrand CHƯA có phòng live mặc định — ca sinh ra sẽ không có phòng (không kiểm được trùng phòng). Chọn ở CRM → Hợp đồng & giá trước nếu cần.";
    const clashNote = crossBrand.clashes.length > 0
      ? `\n\n⚠ ${crossBrand.clashes.length} ca TRÙNG PHÒNG với brand khác (vd ${crossBrand.clashes[0].date.slice(8)}/${crossBrand.clashes[0].date.slice(5, 7)} ${crossBrand.clashes[0].startTime}: ${crossBrand.clashes[0].roomTakenBy}). Chốt vẫn gắn phòng này — phải đổi phòng từng ca sau.`
      : "";
    const capNote = overCapacity ? `\n\n⚠ Ngày ${overCapacity.date.slice(8)}/${overCapacity.date.slice(5, 7)} ${overCapacity.startTime} có ${overCapacity.concurrent} ca chạy cùng lúc toàn agency — có ${studios.length} phòng, ${hostCapacity} người host.` : "";
    if (!(await confirm(`${locked ? "Chốt lại" : "Chốt"} kế hoạch ${brandLabel(brand?.name)} tháng ${fmtMonth(month)}: ${drafts.length} ca${matchedCount > 0 ? ` (${matchedCount} gắn ca đã nhập, ${drafts.length - matchedCount} chờ đăng ký)` : " chờ đăng ký"}?${warn}${targetWarn}${sumNote}${relockNote}${studioNote}${clashNote}${capNote}${matchedNote}${pastNote}`))) return;
    const p = await save({ committing: true });
    if (!p) return;
    setSaving(true);
    try {
      const r = await lockMonthPlan(p.id);
      await onPlanLocked();
      const fresh = await fetchMonthPlan(brandId, month, platform);
      if (fresh) {
        setPlan(fresh.plan);
        setDrafts(draftsFromSaved(fresh.slots));
      }
      refreshMissing();
      setLockedSlotsTick((t) => t + 1);
      setMsg(
        `Đã chốt: mở ${r.created} ca mới${(r.linked_sessions ?? 0) > 0 ? `, gắn ${r.linked_sessions} ca đã nhập` : ""}${r.linked > 0 ? `, gắn ${r.linked} ca đã có sẵn` : ""}${r.cancelled > 0 ? `, huỷ ${r.cancelled} ca bị bỏ` : ""}` +
          `${r.kept_registered > 0 ? `, GIỮ ${r.kept_registered} ca bị bỏ nhưng đã có người đăng ký (xử lý ở Bảng Vận Hành)` : ""}${(r.skipped_past ?? 0) > 0 ? `, bỏ qua ${r.skipped_past} ca ngày đã qua (ca nào đã live: mở ca đúng giờ ở Lịch & Studio rồi bấm Chốt lại để gắn target)` : ""} — ${r.total_slots} ca kế hoạch đã có ca thật/ca chờ${r.created > 0 ? ` (${r.created} ca đang chờ đăng ký)` : ""}.`
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
        `XOÁ HẲN kế hoạch ${brandLabel(brand?.name)} tháng ${fmtMonth(month)}?

` +
          `• ${drafts.length} ca trong lưới kế hoạch bị xoá theo.
` +
          `• Ca chờ đăng ký đã sinh ra từ kế hoạch này (khoảng ${openFromPlan} ca đang mở) sẽ bị HUỶ.
` +
          `• Ca đã chốt người thì KHÔNG xoá được — nếu có, DB sẽ chặn và bạn phải xử từng ca ở Bảng Vận Hành trước.

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
          <h2 className="text-lg font-black text-[var(--text)] flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-blue-400" />
            Kế Hoạch Tháng
          </h2>
          <PageIntro>
            Lập lưới ca cho brand trước khi mở đăng ký: giờ cam kết và target của tháng đặt ngay tại đây (mặc định lấy từ hợp đồng ở CRM), chốt là ca đổ xuống Bảng Vận Hành chờ talent đăng ký.
          </PageIntro>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={brandId} onChange={(e) => { userPicked.current = true; setBrandId(e.target.value); }} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] text-sm font-bold">
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <MonthPicker value={month} onChange={(m) => { userPicked.current = true; setMonth(m); }} />
        </div>
      </div>

      {curMonthDrafts.length > 0 && !(month === today.slice(0, 7) && curMonthDrafts.some((b) => b.id === brandId)) && (
        <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Kế hoạch <b>tháng này</b> ({fmtMonth(today.slice(0, 7))}) còn là nháp, chưa chốt: <b>{curMonthDrafts.map((b) => b.name).join(", ")}</b> — chưa chốt thì chưa có ca để talent đăng ký và Dashboard chưa có target.</span>
          <button
            onClick={() => { userPicked.current = true; setBrandId(curMonthDrafts[0].id); setMonth(today.slice(0, 7)); }}
            className="ml-auto px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 font-bold text-amber-100 hover:bg-amber-500/30"
          >
            Mở kế hoạch {curMonthDrafts[0].name} tháng {fmtMonth(today.slice(0, 7))}
          </button>
        </div>
      )}

      {nextMonthMissing.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Tháng {fmtMonth(nextMonth)} chưa chốt kế hoạch: <b>{nextMonthMissing.join(", ")}</b> — chốt trước khi mở đăng ký để talent còn thời gian đăng ký.</span>
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
            <span className="font-bold text-[var(--text-muted)] block mb-1">Target GMV tháng</span>
            <input type="number" min="0" step="1000000" disabled={!editable || locked} title={locked ? "Kế hoạch đã chốt: target tháng = tổng target các ca, sửa target từng ca trong lưới" : undefined} value={settings.targetGmv || ""} placeholder="0 = chưa đặt" onChange={(e) => { const t = Number(e.target.value) || 0; setSettings((s) => ({ ...s, targetGmv: t })); if (!locked && t > 0) setDrafts((prev) => withForecast(prev, t)); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            {locked ? (
              <span className="text-[11px] text-[var(--text-faint)]">Đã chốt — lưu sẽ ghi = tổng target các ca ({fmtVndShort(totals.target)})</span>
            ) : (
              targetTotal > 0 && <span className="text-[11px] text-[var(--text-faint)]">{fmtVndShort(targetTotal)}</span>
            )}
          </label>
          <label className="block text-xs">
            <span className="font-bold text-[var(--text-muted)] block mb-1">KPI GMV <span className="font-normal text-[var(--text-faint)]">— brand giao, mọi kênh; chỉ để Report Tháng so, không dùng xếp ca</span></span>
            <input type="number" min="0" step="1000000" disabled={!editable} value={settings.shopTargetGmv || ""} placeholder="0 = brand chưa giao" onChange={(e) => { setSettings((s) => ({ ...s, shopTargetGmv: Number(e.target.value) || 0 })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            {settings.shopTargetGmv > 0 && <span className="text-[11px] text-[var(--text-faint)]">{fmtVndShort(settings.shopTargetGmv)}{targetTotal > 0 ? ` · Target GMV live = ${Math.round((targetTotal / settings.shopTargetGmv) * 100)}% KPI GMV` : ""}</span>}
          </label>
          <label className="block text-xs">
            <span className="font-bold text-[var(--text-muted)] block mb-1">Ngân sách Ads <span className="font-normal text-[var(--text-faint)]">— cả tháng; Report Tháng tính % đã dùng</span></span>
            <input type="number" min="0" step="1000000" disabled={!editable} value={settings.adsBudget || ""} placeholder="0 = chưa đặt" onChange={(e) => { setSettings((s) => ({ ...s, adsBudget: Number(e.target.value) || 0 })); setDirty(true); }} className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-[var(--text)] font-mono disabled:opacity-60" />
            {settings.adsBudget > 0 && <span className="text-[11px] text-[var(--text-faint)]">{fmtVndShort(settings.adsBudget)}</span>}
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
                // Điện thoại: nhãn lên dòng riêng + ô ngày được co (min-w-0) — 2 ô date giữ bề rộng tự nhiên
                // 156px làm cả trang tràn ngang 31px ở 375px (audit UX 2026-09-29).
                <div key={k} className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                  <span className="w-full sm:w-20 text-[var(--text)]">{CAMP_RANGE_LABEL[k]}</span>
                  <input type="date" disabled={!editable} value={r?.start ?? ""} onChange={(e) => setRange(e.target.value, r?.end ?? e.target.value)} className="flex-1 min-w-0 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] font-mono disabled:opacity-60" />
                  <span className="text-[var(--text-faint)]">→</span>
                  <input type="date" disabled={!editable} value={r?.end ?? ""} onChange={(e) => setRange(r?.start ?? e.target.value, e.target.value)} className="flex-1 min-w-0 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-1.5 py-1 text-[11px] text-[var(--text)] font-mono disabled:opacity-60" />
                  {r && editable && <button onClick={() => setRange("", "")} className="-m-1.5 p-1.5 text-[var(--text-faint)] hover:text-rose-400" title="Bỏ, dùng lịch cố định"><X className="w-3 h-3" /></button>}
                </div>
              );
            })}
          </div>
          <input type="text" disabled={!editable} value={settings.notes} onChange={(e) => { setSettings((s) => ({ ...s, notes: e.target.value })); setDirty(true); }} placeholder="Ghi chú kế hoạch (tuỳ chọn)" className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg p-2 text-xs text-[var(--text)] disabled:opacity-60" />
          <div className="text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--text-muted)]">
              <b>Phòng live ({platform}):</b>{" "}
              {brandStudio ? <span className="text-[var(--text)]">{brandStudio.name} ({brandStudio.roomNumber})</span> : <span className="text-amber-300">chưa chọn</span>}
              <span className="text-[var(--text-faint)]"> — ca chốt ra gắn phòng này</span>
            </span>
            {onOpenCrm && brandId && (
              <button onClick={() => onOpenCrm(brandId, platform)} className="text-[11px] font-bold text-[var(--accent-text)] hover:underline">{brandStudio ? "Đổi ở CRM" : "Chọn ở CRM"} →</button>
            )}
          </div>
        </div>

        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-bold text-[var(--text)]">Cam kết tháng {fmtMonth(month)}</h3>
          <div className="text-xs space-y-1.5">
            <div className="flex justify-between items-center gap-2">
              <label htmlFor="mp-commit-hours" className="text-[var(--text-muted)]">Giờ cam kết</label>
              <input id="mp-commit-hours" type="number" min="0" step="1" value={commitHoursText} placeholder="chưa có" onChange={(e) => setCommitHoursDraft(e.target.value)} className="w-28 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-right font-mono text-[var(--text)]" />
            </div>
            <div className="flex justify-between items-center gap-2">
              <label htmlFor="mp-commit-gmv" className="text-[var(--text-muted)]">GMV cam kết <span className="text-[var(--text-faint)]">(tuỳ chọn)</span></label>
              <input id="mp-commit-gmv" type="number" min="0" step="1000000" value={commitGmvText} placeholder="không cam kết" onChange={(e) => setCommitGmvDraft(e.target.value)} className="w-36 bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-right font-mono text-[var(--text)]" />
            </div>
            <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">
              {monthCommit.source === "month" ? (
                <>Đã sửa riêng tháng này{monthCommit.contract ? ` (hợp đồng: ${fmtH(monthCommit.contract.monthlyHours)}h/tháng)` : ""}.</>
              ) : monthCommit.source === "contract" ? (
                <>Theo hợp đồng{monthCommit.contract?.contractCode ? ` ${monthCommit.contract.contractCode}` : ""} ở CRM. Sửa ô trên nếu tháng này brand mua thêm/bớt giờ.</>
              ) : (
                <>Chưa có hợp đồng {platform} phủ tháng này — nhập điều khoản ở CRM, hoặc gõ thẳng số của tháng này.</>
              )}
              {onOpenCrm && brandId && (
                <button onClick={() => onOpenCrm(brandId, platform)} className="ml-1 font-bold text-[var(--accent-text)] hover:underline">Hợp đồng ở CRM →</button>
              )}
            </p>
            {commitDirty && (
              <button onClick={() => void saveCommitment()} disabled={commitSaving} className="w-full text-[11px] font-bold px-2 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white disabled:opacity-50">
                {commitSaving ? "Đang lưu…" : "Lưu cam kết tháng này"}
              </button>
            )}
            {commitProgress && month <= today.slice(0, 7) && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1.5 border-t border-[var(--border)]/60">
                <span className="text-[var(--text-muted)]">Đã live</span><b className="text-right text-emerald-400">{fmtH(commitProgress.deliveredHours)}h · {commitProgress.deliveredSessions} ca</b>
                <span className="text-[var(--text-muted)]">Đang xếp</span><b className="text-right text-sky-400">{fmtH(commitProgress.scheduledHours)}h · {commitProgress.scheduledSessions} ca</b>
                {commitProgress.unconfirmedSessions > 0 && (
                  <><span className="text-[var(--text-muted)]" title="Ca đã qua giờ mà không có số/report/giờ live — chưa tính là đã giao">Chờ xác nhận</span><b className="text-right text-amber-300">{fmtH(commitProgress.unconfirmedHours)}h · {commitProgress.unconfirmedSessions} ca</b></>
                )}
                <span className="text-[var(--text-muted)]">Còn phải xếp</span>
                <b className={`text-right ${commitProgress.gapHours > 0 ? "text-rose-400" : "text-emerald-400"}`}>{commitProgress.gapHours > 0 ? `${fmtH(commitProgress.gapHours)}h` : "đủ"}</b>
              </div>
            )}
            <div className="flex justify-between gap-2 pt-1.5 border-t border-[var(--border)]/60"><span className="text-[var(--text-muted)]">Target GMV tháng</span><b className="text-[var(--text)]">{targetTotal > 0 ? fmtVndShort(targetTotal) : "chưa đặt"}</b></div>
            {!locked && committedGmv > 0 && targetTotal <= 0 && (
              <button
                onClick={() => { setSettings((st) => ({ ...st, targetGmv: committedGmv })); setDrafts((prev) => withForecast(prev, committedGmv)); setDirty(true); }}
                className="w-full text-[11px] font-bold px-2 py-1.5 rounded-lg border border-[var(--accent)]/50 text-[var(--accent-text)]"
              >
                Đặt target = GMV cam kết ({fmtVndShort(committedGmv)})
              </button>
            )}
            {committedGmv > 0 && targetTotal > 0 && targetTotal < committedGmv && (
              <p className="text-[11px] text-amber-300">Target kế hoạch thấp hơn GMV cam kết {fmtVndShort(committedGmv - targetTotal)} — run-rate đạt 100% vẫn hụt cam kết với brand.</p>
            )}
            <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">"Gợi ý phân bổ" xếp đủ giờ cam kết; "Xếp theo target" xếp tới khi dự báo chạm target và cho biết cần bao nhiêu giờ.</p>
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
              {fmtVndShort(totals.target)}{targetDelta !== null && Math.abs(targetDelta) >= 1 ? ` (${targetDelta < 0 ? "thiếu" : "vượt"} ${fmtVndShort(Math.abs(targetDelta))})` : ""}
            </b>
          </div>
          {errors.length > 0 && <p className="text-[11px] text-rose-300">{errors[0]}{errors.length > 1 ? ` · +${errors.length - 1} lỗi` : ""}</p>}
        </div>
      </div>

      {/* Thanh công cụ */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 flex flex-wrap items-center gap-2">
        <button onClick={() => setRulesOpen((v) => !v)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--accent-text)] flex items-center gap-1.5"><Repeat className="w-3.5 h-3.5" /> Quy tắc lặp ({brandTemplates.length})</button>
        {editable && !locked && (
          <>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as SuggestStrategy)} className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--text)]" title="Phương án gợi ý">
              {(Object.keys(STRATEGY_LABEL) as SuggestStrategy[]).map((k) => <option key={k} value={k}>{STRATEGY_LABEL[k]}</option>)}
            </select>
            <button onClick={() => suggest("hours")} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--accent)]/60 text-xs font-bold text-[var(--accent-text)] flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Gợi ý phân bổ</button>
            <button onClick={() => suggest("target")} disabled={targetTotal <= 0} title={targetTotal <= 0 ? "Nhập Target GMV tháng trước" : "Xếp tới khi dự báo chạm target"} className="px-3 py-1.5 rounded-lg border border-[var(--accent)]/40 text-xs font-bold text-[var(--accent-text)] disabled:opacity-40 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> Xếp theo target</button>
          </>
        )}
        {editable && monthSessions.length > 0 && (
          <button onClick={() => void loadFromSessions()} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--accent)]/60 text-xs font-bold text-[var(--accent-text)] flex items-center gap-1.5" title="Lịch tháng đã nhập bằng file/tạo tay: dựng kế hoạch theo đúng các ca đó rồi Chốt để đồng bộ">
            <CalendarRange className="w-3.5 h-3.5" /> Dựng lưới từ {monthSessions.length} ca đã nhập
          </button>
        )}
        {editable && <button onClick={loadTemplates} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)]">Nạp từ quy tắc</button>}
        {/* Sau khi chốt: không gợi ý lại / chia lại target / xoá hết — target từng ca là số đã cam kết (luật run-rate). */}
        {editable && !locked && (
          <>
            <button onClick={allocate} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-[var(--text)] hover:border-[var(--accent)] flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5" /> Chia lại target</button>
            <button onClick={clearAll} disabled={drafts.length === 0} className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs font-bold text-rose-400 disabled:opacity-40">Xoá hết</button>
          </>
        )}
        <span className="flex-1 text-[11px] text-[var(--text-muted)] min-w-[160px]">{loading ? "Đang tải…" : msg ?? (locked ? `Đã chốt lúc ${plan?.lockedAt ? new Date(plan.lockedAt).toLocaleString("vi-VN") : ""}. Chốt lại chỉ mở thêm ca chưa có.` : "")}</span>
        {/* Phải khoá cả khi `loading` như nút Chốt/Xoá bên cạnh, không chỉ theo `dirty`: effect nạp
            brand/tháng mới chỉ `setDirty(false)` TRONG .then(), nên suốt 1–2s chờ fetch thì `dirty`
            vẫn là của brand cũ và `drafts` vẫn là lưới brand cũ — bấm kịp lúc đó là `save()` ghi
            lưới brand A vào kế hoạch brand B, mà `replacePlanSlots` còn XOÁ các ca của B không
            khớp. Lỗi E2E 28/09 #7. */}
        {/* Kế hoạch đã chốt KHÔNG có lớp nháp — lưu là ghi thẳng vào số đã chốt. Chỉ còn "Chốt lại" (lưu + đồng bộ ca). */}
        {editable && !locked && (
          <button onClick={() => save()} disabled={saving || loading || !dirty} className="px-3 py-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-xs font-bold text-[var(--text)] disabled:opacity-40 flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Lưu nháp</button>
        )}
        <button onClick={lock} disabled={saving || loading || errors.length > 0} className="px-3 py-1.5 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-xs font-bold disabled:opacity-40 flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> {locked ? `Chốt lại (đồng bộ ca)` : `Chốt kế hoạch`}</button>
        {editable && plan && (
          <button onClick={removePlan} disabled={saving || loading} className="px-3 py-1.5 rounded-lg border border-rose-900 text-xs font-bold text-rose-400 hover:bg-rose-950/40 disabled:opacity-40 flex items-center gap-1.5" title="Xoá cả dòng kế hoạch tháng này (khác 'Xoá hết' — cái đó chỉ dọn lưới nháp)"><Trash2 className="w-3.5 h-3.5" /> Xoá kế hoạch</button>
        )}
      </div>

      {(crossBrand.clashes.length > 0 || overCapacity) && (
        <div className="bg-rose-950/30 border border-rose-900 rounded-xl px-4 py-2.5 text-xs text-rose-200 space-y-1">
          {crossBrand.clashes.length > 0 && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {crossBrand.clashes.length} ca trong lưới trùng phòng {brandStudio?.name ?? ""} với brand khác (viền đỏ) — vd{" "}
                {crossBrand.clashes.slice(0, 3).map((c) => `${c.date.slice(8)}/${c.date.slice(5, 7)} ${c.startTime}: ${c.roomTakenBy}`).join(" · ")}.
                Chốt vẫn gắn phòng này cho mọi ca; đổi giờ hoặc đổi phòng từng ca sau khi chốt.
              </span>
            </p>
          )}
          {overCapacity && (
            <p className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Đỉnh {overCapacity.concurrent} ca chạy cùng lúc toàn agency ({overCapacity.date.slice(8)}/{overCapacity.date.slice(5, 7)} {overCapacity.startTime}–{overCapacity.endTime}, tính cả ca của brand khác) — có {studios.length} phòng và {hostCapacity} người host.
              </span>
            </p>
          )}
        </div>
      )}

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
                ? <>đang dùng <b className="text-sky-300">{fmtVndFull(borrowLevel)}/giờ</b> {borrowLevelSource}</>
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
              <b>Lưới này dự báo {fmtVndShort(targetGap.forecast)}, thiếu {fmtVndShort(targetGap.gap)} ({Math.round(targetGap.pct * 100)}%) so với target {fmtVndShort(targetTotal)}</b>
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
        <p className="text-[11px] text-emerald-400 px-1">Lưới này dự báo {fmtVndShort(targetGap.forecast)} — vượt target {Math.round(-targetGap.pct * 100)}%; target/ca đang thấp hơn dự báo.</p>
      )}

      {rulesOpen && brand && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <RecurringRulesPanel brandId={brandId} brandName={brand.name} platform={platform} templates={brandTemplates} studios={studios} currentUserId={currentUserId} defaultHours={settings.defaultSlotHours} onCreateTemplate={onCreateTemplate} onToggleTemplate={onToggleTemplate} onDeleteTemplate={onDeleteTemplate} />
        </div>
      )}

      {evaluation && <EvaluationPanel ev={evaluation} calibration={calibration} />}

      {suggestion && (
        <SuggestionPanel history={suggestion.history} result={suggestion.result} committedHours={planHours} targetTotal={targetTotal} compare={compare} current={strategy} onPick={(k) => { setStrategy(k); if (compare) { setSuggestion({ history: suggestion.history, result: compare[k] }); applySuggestion(drafts.filter((d) => d.id || d.slotId), compare[k]); } }} />
      )}

      {/* Lưới ngày × ca */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 overflow-x-auto">
        <div className="grid grid-cols-7 gap-1.5 min-w-[1100px]">
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
                    {/* -m-1.5 p-1.5: vùng bấm 24×24 (sàn WCAG 2.5.8) nhưng không đẩy cao dòng ngày — M5. */}
                    {!past && <button onClick={() => toggleBlackout(day)} className={`-m-1.5 p-1.5 ${isBlackout ? "text-rose-400" : "text-[var(--text-faint)] hover:text-rose-400"}`} title={isBlackout ? "Bỏ cấm live ngày này" : "Cấm live ngày này (engine bỏ qua)"}><Ban className="w-3 h-3" /></button>}
                  </span>
                </div>
                {(ev || sch) && <div className="text-[11px] text-[var(--accent-text)] truncate" title={[ev?.label, sch?.label].filter(Boolean).join(" · ")}>{ev?.label}{ev && sch ? " · " : ""}{sch ? `KM: ${sch.label}` : ""}</div>}
                {isBlackout && <div className="text-[11px] text-rose-400 font-bold">cấm live</div>}
                {list.map((d) => (
                  // Audit UX lần 2 — M5. Đo 29/09: 331/383 phần tử bấm của màn này thấp hơn sàn 24px (WCAG
                  // 2.5.8) — 150 ô giờ cao 18px, 75 nút "Bỏ ca" 12×12, 75 ô target 23px, 31 nút cấm live 12×12.
                  // Khi nâng lên 24px mới lộ ra lỗi nằm sẵn từ trước: hàng giờ CẦN nhiều hơn chỗ nó có. Ô ngày
                  // rộng 153px ⇒ thẻ ca chỉ còn 125px, mà riêng 2 ô `input[type=time]` của Chrome đã cần 2×63px
                  // (đo bằng width:auto — 62px cũ đã thiếu 1px), cộng dấu "–" và nút xoá là 166px. Phần thừa
                  // tràn sang ô ngày BÊN CẠNH và bị ô đó phủ lên: elementsFromPoint cho thấy bấm vào giữa icon
                  // "Bỏ ca" không ăn. Nay xếp lại cho vừa thật: padding px-1 (thẻ còn 129px), hàng 1 chỉ 2 ô giờ
                  // (63+2+63 = 128), nút xoá xuống hàng 2 cạnh ô target, dạng rút gọn của target gộp vào dòng
                  // "dự báo" sẵn có nên không tốn thêm chiều cao.
                  <div key={d.key} className={`rounded-lg border px-1 py-1 text-[11px] space-y-1 ${clashKeys.has(d.key) ? "border-rose-700 bg-rose-950/30" : d.slotId ? "border-emerald-900 bg-emerald-950/30" : "border-[var(--border)] bg-[var(--surface)]"}`}>
                    <div className="flex items-center gap-0.5">
                      <input type="time" aria-label="Giờ bắt đầu" disabled={!editable || timeLocked(d)} value={d.startTime} onChange={(e) => update(d.key, { startTime: e.target.value })} className="w-[63px] min-h-6 shrink-0 bg-transparent font-mono text-[11px] text-[var(--text)] disabled:opacity-70" />
                      <input type="time" aria-label="Giờ kết thúc" disabled={!editable || timeLocked(d)} value={d.endTime} onChange={(e) => update(d.key, { endTime: e.target.value })} className="w-[63px] min-h-6 shrink-0 bg-transparent font-mono text-[11px] text-[var(--text)] disabled:opacity-70" />
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        disabled={!editable || isPastFrozen(d)}
                        value={d.targetGmv}
                        onChange={(e) => update(d.key, { targetGmv: Number(e.target.value) })}
                        aria-label="Target GMV của ca"
                        title="Target GMV của ca"
                        className="w-full min-w-0 min-h-6 bg-[var(--surface-base)] border border-[var(--border)] rounded px-1 py-0.5 font-mono text-[11px] text-[var(--text)] disabled:opacity-70"
                      />
                      {editable && !timeLocked(d) && <button onClick={() => void remove(d.key)} className="shrink-0 p-1.5 text-rose-400 hover:text-rose-300" title="Bỏ ca"><X className="w-3 h-3" /></button>}
                    </div>
                    {/* Số thô 8 chữ số gõ tay rất dễ thừa/thiếu một số 0 — dạng rút gọn đặt ngay dưới để thấy
                        sai bậc, gộp cùng dòng "dự báo" sẵn có nên thẻ ca không cao thêm. */}
                    {(d.targetGmv > 0 || d.expectedGmv !== undefined) && (
                      <div className={`text-[11px] font-bold ${d.highExpectation ? "text-amber-400" : "text-[var(--text-faint)]"}`} title={d.reason}>
                        {d.targetGmv > 0 ? fmtVndShort(d.targetGmv) : ""}
                        {d.targetGmv > 0 && d.expectedGmv !== undefined ? " · " : ""}
                        {d.expectedGmv !== undefined ? `dự báo ${fmtVndShort(d.expectedGmv)}` : ""}
                        {d.highExpectation ? " · target cao" : ""}
                      </div>
                    )}
                    {clashKeys.has(d.key) && <div className="text-[11px] text-rose-300 font-bold" title={crossBrand.clashes.find((c) => c.key === d.key)?.roomTakenBy}>trùng phòng brand khác</div>}
                    {isStaffed(d) ? (
                      <div className="text-[11px] text-emerald-400 font-bold" title="Đổi giờ/bỏ ca: huỷ hoặc sửa ca ở Cửa sổ Ca Live">đã chốt người</div>
                    ) : d.slotId ? (
                      <div className="text-[11px] text-emerald-400 font-bold">đã mở ca</div>
                    ) : null}
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
            ({h.borrowedFrom.sessions} ca / {h.borrowedFrom.months} tháng) · mức {fmtVndShort(h.brandGmvPerHour)}/giờ {h.borrowedFrom.levelSource}
          </span>
        ) : (
          <span className="text-[var(--text-muted)]">Độ tin cậy: <b className="text-[var(--text)]">{CONF_LABEL[r.confidence]}</b> · {h.sessions} ca đối soát / {h.months} tháng{h.firstDate ? ` (${h.firstDate} → ${h.lastDate})` : ""} · GMV/giờ TB {fmtVndShort(h.brandGmvPerHour)}</span>
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
                    <td className="py-1 pr-3 text-right font-bold text-[var(--text)]">{fmtVndShort(x.forecastGmv)}</td>
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
            <div key={`${c.weekday}-${c.block}`} className="flex justify-between gap-2"><span className="text-[var(--text)]">{WD[c.weekday]} {c.block * 2}–{c.block * 2 + 2}h <span className="text-[var(--text-faint)]">({c.n} ca)</span></span><b className={c.tag === "strong" ? "text-emerald-400" : "text-[var(--text)]"}>{fmtVndShort(c.gmvPerHour)}/h</b></div>
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
            <div key={p.hours} className="flex justify-between gap-2"><span className="text-[var(--text)]">{fmtH(p.hours)}h</span><b className="text-[var(--text)]">{fmtVndShort(p.gmv)}</b></div>
          ))}
          <p className="mt-1 text-[11px] text-[var(--text-faint)]">
            {committedHours > 0 ? `Cam kết ${fmtH(committedHours)}h → dự báo ${fmtVndShort(r.forecastGmv)}` : ""}
            {targetTotal > 0 ? ` · target ${fmtVndShort(targetTotal)}${r.hoursToHitTarget !== null ? ` cần ~${Math.ceil(r.hoursToHitTarget)}h` : " (không chạm được trong khung)"}` : ""}
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
        {/* `target`/`thực tế` tính trên MỌI ca đã xong; `Dự báo` chỉ có ở ca qua engine, nên khi hai
            tập lệch nhau phải nói rõ bao nhiêu ca có dự báo — nếu không, phần chênh bị đọc nhầm thành
            engine dự sai (xem `actualForecast` ở planEvaluation.ts). */}
        {ev.doneCount > 0 && (
          <span className="text-[var(--text-muted)]">{ev.forecastCount > 0 ? <>Dự báo {fmtVndShort(ev.expectedDone)}{ev.forecastCount < ev.doneCount ? ` (${ev.forecastCount}/${ev.doneCount} ca)` : ""} · </> : ""}target {fmtVndShort(ev.targetDone)} · <b className="text-[var(--text)]">thực tế {fmtVndShort(ev.actualDone)}</b>{ev.bias !== null ? ` · lệch ${pct(ev.bias)}` : ""}{ev.mape !== null ? ` · sai số TB/ca ${Math.round(ev.mape * 100)}%` : ""}</span>
        )}
      </div>
      {worst.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1.5">
          {worst.map((r) => (
            <div key={`${r.date}${r.startTime}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface-base)] px-2 py-1">
              <div className="font-mono text-[11px] text-[var(--text-muted)]">{r.date.slice(5)} {r.startTime}–{r.endTime}</div>
              <div className="text-[var(--text)]">{fmtVndShort(r.actualGmv ?? 0)} <span className="text-[var(--text-faint)]">vs dự báo {fmtVndShort(r.expectedGmv)}</span> <b className={r.errorPct! >= 0 ? "text-emerald-400" : "text-rose-400"}>{pct(r.errorPct)}</b></div>
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
