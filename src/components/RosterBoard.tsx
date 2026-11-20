import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SwapApprovalQueue } from "./shiftSwap/SwapApprovalQueue";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Send, X } from "lucide-react";
import type { Brand, BrandChannel, BrandStudio, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, TalentRateHistoryEntry, UserRole } from "../types";
import { PageHeader } from "./common/PageHeader";
import { useToast } from "../hooks/useToast";
import { useConfirm, usePrompt } from "../hooks/useConfirm";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndShort } from "../lib/format";
import { talentShortName } from "../lib/talentName";
import { addDays, getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { sumGmvByPlatform } from "../lib/platforms/perf";
import { updateOpenSlotTime } from "../lib/db/shiftSlots";
import {
  fetchRosterChanges,
  fetchRosterDrafts,
  fetchRosterMonths,
  fetchRosterRules,
  fetchRosterWeeks,
  isRosterBackendMissing,
  publishRosterWeek,
  publishRosterRange,
  rosterMoveSession,
  rosterReassign,
  saveRosterDraft,
  setSlotNoAssistant,
  openSlotsForSignup,
  saveRosterDrafts,
  updateRosterRules,
  type RosterChange,
  type RosterDraft,
  type RosterMonth,
  type RosterWeek
} from "../lib/db/roster";
import type { BrandTalentRule } from "../lib/commercial/terms";
import { inferRoleRows, type TalentBrandRole } from "../lib/roster/talentBrandRoles";
import { analyzeRoster, buildBrandRuleIndex, buildCancelledShifts, buildRosterShifts, channelKeyOf, DEFAULT_ROSTER_RULES, shiftHours, type RosterRole, type RosterRules, type RosterShift } from "../lib/roster/rules";
import { buildFamiliarity, famOf, planCostCut, shiftCost, type CostMove, type RankContext, type RankMode } from "../lib/roster/candidates";
import { ShiftPanel, dayLabel } from "./roster/ShiftPanel";
import { AbsencePanel, ChangeLogPanel, ChecksPanel, HoursCostPanel, MatrixPanel, RulesPanel, WeekGrid, type ChannelRow } from "./roster/panels";
import { NextDesk, nextMonthOf, useRosterDesk } from "./roster/MonthDesk";
import { MonthStrip, fmtWhen, type MonthAction, type MonthCard } from "./roster/MonthStrip";
import { monthStatus } from "../lib/roster/monthStatus";
import { OpenMonthWizard } from "./roster/OpenMonthWizard";
import { BrandScheduleExportDialog } from "./roster/BrandScheduleExportDialog";
import { MonthPlanPanel } from "./roster/MonthPlanPanel";
import { useMonthCommitments } from "../hooks/useMonthCommitments";
import { useScheduleRules } from "../hooks/useScheduleRules";
import { PersonRulesDesk } from "./roster/PersonRulesDesk";
import { hasRule } from "../lib/roster/placementRules";
import { inferAutoCaps } from "../lib/roster/autoCaps";
import { PersonBar } from "./roster/PersonBar";
import { MoreMenu } from "./ui/MoreMenu";
import { buildPersonRows, defaultRole, personLoad, planPersonBulk, registrationCounts, type BulkPlan } from "../lib/roster/byPerson";
import { buildPersonColors } from "../lib/roster/personColor";
import { WorkloadTable } from "./roster/WorkloadTable";
import { MonthReviewPanel } from "./roster/MonthReviewPanel";
import { DEFAULT_BOUNDS, GOALS, GOAL_HINT, GOAL_LABEL, applyPlanRows, buildBandStrength, buildHostChannelGmv, buildHostPerformance, buildHostPerformancePrevMonth, daysInMonth, personBounds, planMonth, releaseAutoFilled, releaseRoleViolations, type AutoFill, type MonthBounds, type PlanGoal, type PlanTuning } from "../lib/roster/monthPlanner";
import type { EngineParams } from "../lib/scheduling/engineParams";
import { platformOf, type ReportPlatform, type SchedulePlatform } from "../lib/reportPlatform";
import { FeatureOffNote } from "./common/FeatureOffNote";
import { InfoDot } from "./common/InfoDot";

// Điều Phối Lịch Live (0175/0176, 13/10). Quy trình tuần user chốt: Kế Hoạch Tháng chốt ⇒ ca mở → trainer đặt HẠN ĐĂNG KÝ → host/trợ báo rảnh
// (tab Đăng Ký Ca) → trainer xếp NHÁP ở đây (talent/brand không thấy) → "Công bố tuần": chốt cả tuần trong một transaction, mỗi người
// một tin. Sau công bố, đổi người / dời giờ phải có lý do (nhật ký roster_changes). Quá 48 giờ/tuần là luật chặn; còn lại cảnh báo.
// Đợt 1 (24/10, đổi tên từ Bàn Trainer): thêm hai chế độ theo tháng trước lưới tuần — "Tháng này" (giờ live thật so cam kết, hao hụt,
// việc nên làm) và "Tháng sau" (mọi kênh × 6 bước mở lịch, giờ cần mở theo hao hụt kênh). Vẽ ở roster/MonthDesk.tsx.

interface Props {
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  talents: Talent[];
  talentRateHistory: TalentRateHistoryEntry[];
  /** Điều khoản về host với brand (0191) — cảnh báo khi xếp host brand không nhận / độc quyền brand khác. */
  talentRules?: BrandTalentRule[];
  /** Vai được xếp theo brand (0221) — Tự fill / gợi ý / cảnh báo lịch. */
  talentBrandRoles?: TalentBrandRole[];
  brandChannels: BrandChannel[];
  brandStudios: BrandStudio[];
  studios: Studio[];
  brands: Brand[];
  currentRole: UserRole;
  currentUserId?: string;
  onCreateSlot: (slot: ShiftSlot) => Promise<boolean>;
  onDeleteSlot: (id: string) => Promise<void>;
  onCancelSession: (id: string, reason: string, reopenSlot?: boolean) => Promise<boolean>;
  /** Nạp lại ca + ca mở + đăng ký sau khi DB đổi lịch (công bố, đổi người, dời giờ). */
  onScheduleChanged: () => Promise<void>;
  onSessionUpdated: (s: LiveSession) => void;
  onSlotUpdated: (s: ShiftSlot) => void;
  engineParams: EngineParams;
  onOpenMonthPlan?: (brandId: string, platform: SchedulePlatform) => void;
  onOpenCrm?: (brandId: string, platform: SchedulePlatform) => void;
  /** Quyền manage_month_plan (0180) — nút mở Kế Hoạch Tháng ở màn "Mở lịch tháng sau". */
  canOpenMonthPlan?: boolean;
}

// Bản gọn (đợt 1, 25/10 — user chốt cả 4 điểm theo demo https://claude.ai/artifact/6YoM6U3rE89iGcSNESPUyq): bỏ 3 chế độ
// Tháng này / Tháng sau / Tuần và 6 tab con. Một màn: dải trạng thái theo tháng (MonthStrip) + "Việc cần làm" (mỗi việc một nút)
// + lưới tuần có giờ tháng cạnh mỗi kênh. Các màn phụ (Kiểm lịch, Báo nghỉ theo người, Ma trận kênh, Giờ & chi phí, Luật & nhật
// ký, giờ từng kênh tháng này, mở lịch tháng sau) mở dưới lưới từ menu "Thêm" hoặc từ nút của thẻ tháng.
type Section = "plan" | "people" | "next" | "checks" | "absence" | "matrix" | "hours" | "rules";
const MORE: { id: Section; label: string }[] = [
  { id: "plan", label: "Xếp cả tháng theo mục tiêu" },
  { id: "people", label: "Luật đặt giờ từng người" },
  { id: "checks", label: "Kiểm lịch (mọi lỗi + cảnh báo)" },
  { id: "absence", label: "Báo nghỉ theo người" },
  { id: "matrix", label: "Ma trận kênh" },
  { id: "hours", label: "Giờ & chi phí" },
  { id: "rules", label: "Luật & nhật ký" },
  { id: "next", label: "Mở lịch tháng sau (từng kênh)" }
];
const SECTION_TITLE: Record<Section, string> = {
  plan: "Xếp cả tháng theo mục tiêu",
  people: "Luật đặt giờ từng người",
  next: "Mở lịch tháng sau",
  checks: "Kiểm lịch",
  absence: "Báo nghỉ theo người",
  matrix: "Ma trận kênh",
  hours: "Giờ & chi phí",
  rules: "Luật & nhật ký"
};

const STAFF: UserRole[] = ["ceo", "admin", "operations", "trainer"];
const loadMode = (): RankMode => {
  try {
    const m = localStorage.getItem("roster.mode");
    return m === "cost" || m === "gmv" ? m : "balance";
  } catch {
    return "balance";
  }
};

export const RosterBoard: React.FC<Props> = (p) => {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const prompt = usePrompt();
  const canWrite = STAFF.includes(p.currentRole);
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(addDays(getTodayDate(), 7)));
  // 06/11: lịch xếp theo THÁNG — chọn tháng trước rồi tới tuần trong tháng; lưới chỉ vẽ ngày của tháng đang chọn
  // (tuần vắt hai tháng không còn trộn ca tháng trước vào). Mặc định: tháng chứa thứ Năm của tuần tới.
  const [viewMonth, setViewMonth] = useState(() => addDays(isoWeekStart(addDays(getTodayDate(), 7)), 3).slice(0, 7));
  const [section, setSectionState] = useState<Section | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const openSection = (s: Section | null) => {
    setSectionState(s);
    if (moreRef.current) moreRef.current.open = false;
    if (s) requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const [months, setMonths] = useState<RosterMonth[]>([]);
  // Đợt 2 (25/10): "Mở lịch tháng sau" 3 bước trong module (thay việc phải sang Kế Hoạch Tháng từng kênh).
  const [wizardOpen, setWizardOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Xếp nháp theo mục tiêu (01/11): phạm vi theo mốc chốt (ngày 1–15 ~ ngày 20, cả tháng ~ ngày 25), mục tiêu, giờ tối thiểu/tối đa.
  const [goal, setGoal] = useState<PlanGoal>(() => {
    try {
      const g = localStorage.getItem("roster.goal");
      return g === "performance" || g === "cost" ? g : "balance";
    } catch {
      return "balance";
    }
  });
  const [scope, setScope] = useState<"half" | "full">(() => (Number(getTodayDate().slice(8, 10)) < 25 ? "half" : "full"));
  const [bounds, setBounds] = useState<MonthBounds>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem("roster.bounds") ?? "null");
      if (raw?.host && raw?.co_host) return raw as MonthBounds;
    } catch {
      /* mặc định */
    }
    return DEFAULT_BOUNDS;
  });
  // Giờ cam kết = trần giờ của tháng đang xem (0223; chưa chạy migration thì lưu theo trình duyệt).
  const commitments = useMonthCommitments(viewMonth);
  // Quy luật đặt giờ từng người (0224): loại ngày / brand / ca đêm, áp mọi tháng.
  const scheduleRules = useScheduleRules();
  const bandStrength = useMemo(() => buildBandStrength(p.sessions, getTodayDate()), [p.sessions]);
  // Mặc định mọi người có trần giờ TỰ SUY từ 3 tháng đã qua (để chia đợt); cam kết nhập tay (ngoại lệ) ghi đè.
  const autoCaps = useMemo(() => inferAutoCaps(p.sessions, p.talents, getTodayDate(), bounds, p.engineParams.rosterAutoCapSlack), [p.sessions, p.talents, bounds, p.engineParams.rosterAutoCapSlack]);
  const tuning = useMemo<PlanTuning>(() => {
    const soft = Object.fromEntries(Object.entries(autoCaps).map(([id, c]) => [id, { monthMax: c.monthMax, soft: true }]));
    return { params: p.engineParams, personCaps: { ...soft, ...commitments.caps }, personRules: scheduleRules.byTalent, bandStrength };
  }, [p.engineParams, autoCaps, commitments.caps, scheduleRules.byTalent, bandStrength]);
  // Ô nháp do bộ xếp tự fill (slotId → người). Ô Trainer đã đổi tay khác giá trị này nên không bị ghi đè lần sau. Lưu theo trình duyệt.
  const [auto, setAuto] = useState<AutoFill>(() => {
    try {
      return JSON.parse(localStorage.getItem("roster.autofill") ?? "{}") as AutoFill;
    } catch {
      return {};
    }
  });
  const [planNote, setPlanNote] = useState<string | null>(null);
  const [monthsNonce, setMonthsNonce] = useState(0);
  const [mode, setMode] = useState<RankMode>(loadMode);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // "Xếp theo người" (17/11): làm ngay trên lưới tuần — chọn người + vai ⇒ lưới tô sáng, bấm ô để xếp / bỏ. Không có danh sách ca riêng.
  const [moreStats, setMoreStats] = useState(false);
  const [personOn, setPersonOn] = useState(false);
  const [personId, setPersonId] = useState("");
  const [personRole, setPersonRole] = useState<RosterRole | null>(null);
  // Lọc lưới theo brand (mặc định Tất cả). Chỉ ảnh hưởng cách hiển thị lưới, giờ/luật vẫn tính mọi brand.
  const [brandView, setBrandView] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [weeks, setWeeks] = useState<RosterWeek[]>([]);
  const [drafts, setDrafts] = useState<RosterDraft[]>([]);
  const [rules, setRules] = useState<RosterRules>(DEFAULT_ROSTER_RULES);
  const [backendMissing, setBackendMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [costLimit, setCostLimit] = useState(10);
  const [costPlan, setCostPlan] = useState<{ moves: CostMove[]; save: number; shifts: RosterShift[] } | null>(null);
  const [changes, setChanges] = useState<RosterChange[] | null>(null);
  const [changesNonce, setChangesNonce] = useState(0);
  useEffect(() => {
    if (section !== "rules") return;
    let cancelled = false;
    fetchRosterChanges(new Date(Date.now() - 30 * 86400000).toISOString())
      .then((c) => !cancelled && setChanges(c))
      .catch(() => !cancelled && setChanges([]));
    return () => {
      cancelled = true;
    };
  }, [section, changesNonce]);
  // Hạn đăng ký theo tháng (0180) cho dải tháng. Đọc lại khi đóng màn "Mở lịch tháng sau" (nơi đặt hạn).
  useEffect(() => {
    let cancelled = false;
    fetchRosterMonths(getTodayDate().slice(0, 7))
      .then((m) => !cancelled && setMonths(m))
      .catch(() => !cancelled && setMonths([]));
    return () => {
      cancelled = true;
    };
  }, [monthsNonce]);

  const applyRosterError = useCallback((e: unknown) => {
    if (isRosterBackendMissing(e)) setBackendMissing(true);
    else setLoadError(errorMessage(e));
  }, []);
  const applyRoster = useCallback(([w, d, r]: [RosterWeek[], RosterDraft[], RosterRules]) => {
    setWeeks(w);
    setDrafts(d);
    setRules(r);
    setBackendMissing(false);
    setLoadError(null);
  }, []);
  const loadRoster = () => Promise.all([fetchRosterWeeks(addDays(isoWeekStart(getTodayDate()), -7)), fetchRosterDrafts(), fetchRosterRules()]);
  const reloadRoster = async () => {
    try {
      applyRoster(await loadRoster());
    } catch (e) {
      applyRosterError(e);
    }
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRosterWeeks(addDays(isoWeekStart(getTodayDate()), -7)), fetchRosterDrafts(), fetchRosterRules()])
      .then((r) => !cancelled && applyRoster(r))
      .catch((e) => !cancelled && applyRosterError(e));
    return () => {
      cancelled = true;
    };
  }, [applyRoster, applyRosterError]);

  const readOnly = !canWrite || backendMissing;
  const weekEnd = addDays(weekStart, 6);
  const goMonth = (delta: number) => {
    const [y, m] = viewMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    const next = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const now = getTodayDate();
    setViewMonth(next);
    setWeekStart(isoWeekStart(now.slice(0, 7) === next ? now : `${next}-01`));
    setSelectedKey(null);
    setCostPlan(null);
  };
  /** Các tuần (thứ Hai) chạm tháng đang xem, kèm nhãn ngày trong tháng ("1–6", "7–13"…). */
  const monthWeeks = useMemo(() => {
    const first = `${viewMonth}-01`;
    const last = `${viewMonth}-${String(daysInMonth(viewMonth)).padStart(2, "0")}`;
    const out: { start: string; label: string }[] = [];
    for (let w = isoWeekStart(first); w <= last; w = addDays(w, 7)) {
      const a = w < first ? first : w;
      const b = addDays(w, 6) > last ? last : addDays(w, 6);
      out.push({ start: w, label: a === b ? String(Number(a.slice(8))) : `${Number(a.slice(8))}–${Number(b.slice(8))}` });
    }
    return out;
  }, [viewMonth]);

  const talentById = useMemo(() => new Map(p.talents.map((t) => [t.id, t])), [p.talents]);
  const nameOf = useCallback((id: string) => talentShortName(talentById.get(id)) || "?", [talentById]);
  const fam = useMemo(() => buildFamiliarity(p.sessions, weekStart), [p.sessions, weekStart]);
  const familiar = useCallback((tid: string, ck: string) => {
    const f = famOf(fam, tid, ck);
    return f.host + f.co;
  }, [fam]);

  // Tuần trước + tuần đang xem (bắt khoảng nghỉ / chuỗi ngày qua tuần) + 1 ngày sau (ca qua đêm CN).
  const shifts = useMemo(
    () => buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(weekStart, -7), addDays(weekEnd, 1)),
    [p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, weekStart, weekEnd]
  );
  const cancelledWk = useMemo(() => buildCancelledShifts(p.sessions, weekStart, weekEnd), [p.sessions, weekStart, weekEnd]);
  const personColors = useMemo(() => buildPersonColors(p.talents), [p.talents]);
  const inferredRoles = useMemo(() => inferRoleRows(p.sessions), [p.sessions]);
  const brandRules = useMemo(
    () => ((p.talentRules?.length ?? 0) > 0 || (p.talentBrandRoles?.length ?? 0) > 0 || inferredRoles.length > 0 ? buildBrandRuleIndex(p.talentRules ?? [], (id) => p.brands.find((b) => b.id === id)?.name ?? "brand", p.talentBrandRoles ?? [], inferredRoles) : undefined),
    [p.talentRules, p.talentBrandRoles, p.brands, inferredRoles]
  );
  const analysis = useMemo(() => analyzeRoster(shifts, rules, weekStart, nameOf, familiar, brandRules), [shifts, rules, weekStart, nameOf, familiar, brandRules]);
  const hostPerf = useMemo(() => buildHostPerformance(p.sessions, getTodayDate()), [p.sessions]);
  const hostChGmv = useMemo(() => buildHostChannelGmv(p.sessions, getTodayDate()), [p.sessions]);
  const ctx: RankContext = useMemo(
    () => ({ shifts, rules, weekStart, fam, talents: p.talents, history: p.talentRateHistory, mode, nameOf, brandRules, perf: hostPerf, chGmv: hostChGmv }),
    [shifts, rules, weekStart, fam, p.talents, p.talentRateHistory, mode, nameOf, brandRules, hostPerf, hostChGmv]
  );
  const wk = useMemo(() => shifts.filter((s) => s.date >= weekStart && s.date <= weekEnd), [shifts, weekStart, weekEnd]);
  // "Theo người": cả tháng đang xem (+ 7 ngày trước để bắt khoảng nghỉ / chuỗi ngày, + 1 ngày sau cho ca qua đêm).
  const monthShifts = useMemo(
    () => (personOn ? buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(`${viewMonth}-01`, -7), addDays(`${viewMonth}-${String(daysInMonth(viewMonth)).padStart(2, "0")}`, 1)) : []),
    [personOn, p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, viewMonth]
  );

  const brandNameById = useMemo(() => new Map(p.brands.map((b) => [b.id, b.name])), [p.brands]);
  const channels: ChannelRow[] = useMemo(() => {
    const rows = new Map<string, ChannelRow>();
    for (const c of p.brandChannels) {
      // Brand không còn trong danh sách hiển thị (đã ẩn / ngừng hợp tác) ⇒ không vẽ dòng kênh không tên.
      if (c.status !== "active" || !brandNameById.has(c.brandId)) continue;
      rows.set(channelKeyOf(c.brandId, c.platform), { key: channelKeyOf(c.brandId, c.platform), brandId: c.brandId, brandName: brandNameById.get(c.brandId) ?? "", platform: c.platform });
    }
    for (const s of [...wk, ...cancelledWk]) if (!rows.has(s.channelKey)) rows.set(s.channelKey, { key: s.channelKey, brandId: s.brandId, brandName: s.brandName, platform: s.platform });
    return [...rows.values()].sort((a, b) => a.brandName.localeCompare(b.brandName) || (a.platform === b.platform ? 0 : a.platform.toLowerCase() === "tiktok" ? -1 : b.platform.toLowerCase() === "tiktok" ? 1 : a.platform.localeCompare(b.platform)));
  }, [p.brandChannels, brandNameById, wk, cancelledWk]);

  const gridChannels = useMemo(() => (brandView === "all" || !channels.some((c) => c.brandId === brandView) ? channels : channels.filter((c) => c.brandId === brandView)), [channels, brandView]);
  const gridBrands = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of channels) if (c.brandName) seen.set(c.brandId, c.brandName);
    return [...seen].map(([id, name]) => ({ id, name }));
  }, [channels]);

  const showCost = p.talents.some((t) => t.ratePerHour > 0 || t.assistantRatePerHour > 0 || t.ratePerSession > 0) || p.talentRateHistory.length > 0;
  const weekIssues = analysis.issues;
  const blocks = weekIssues.filter((i) => i.severity === "block");
  const warns = weekIssues.filter((i) => i.severity === "warn");
  const overWeek = warns.filter((i) => i.code === "week_over");
  const openShifts = wk.filter((s) => s.kind === "open");
  // 0207: nháp có host mà chưa trợ / No Asst KHÔNG công bố (RPC bỏ qua, ca vẫn mở cho talent đăng ký trợ) ⇒ đếm riêng.
  const holdCoShifts = openShifts.filter((s) => s.drafted && !!s.hostId && !s.coHostId && !s.noAssistant);
  const publishableShifts = openShifts.filter((s) => s.drafted && !!s.hostId);
  const draftedCount = publishableShifts.length;
  const outsideDrafts = publishableShifts.filter((s) => s.date.slice(0, 7) !== viewMonth).length;
  const weekCost = wk.reduce((s, x) => s + shiftCost(x, p.talents, p.talentRateHistory).amount, 0);
  const costMissing = wk.filter((x) => shiftCost(x, p.talents, p.talentRateHistory).missing).length;
  const selected = selectedKey ? shifts.find((s) => s.key === selectedKey) ?? null : null;

  // ---- số theo tháng (dải tháng + giờ cạnh kênh + việc cần làm) ----
  const today = getTodayDate();
  const deskProps = {
    today,
    sessions: p.sessions,
    shiftSlots: p.shiftSlots,
    brands: p.brands,
    brandChannels: p.brandChannels,
    engineParams: p.engineParams,
    currentRole: p.currentRole,
    onOpenMonthPlan: p.onOpenMonthPlan,
    onOpenCrm: p.onOpenCrm,
    canOpenMonthPlan: p.canOpenMonthPlan,
    canWrite: !readOnly
  };
  const desk = useRosterDesk({ ...deskProps, registrations: p.shiftRegistrations, drafts, weeks });
  // GMV/giờ theo KÊNH (brand × sàn) 28 ngày gần nhất — nền cho GMV ước tính của tuần. Không chia theo host (hiệu suất host phần lớn là nhiễu).
  const chGmvPerHour = useMemo(() => {
    const from = addDays(today, -28);
    const byCh = new Map<string, LiveSession[]>();
    for (const x of p.sessions) {
      if (x.status === "Cancelled" || x.date < from || x.date >= today || !(x.actualGmv > 0) || shiftHours(x) <= 0) continue;
      const k = channelKeyOf(x.brandId, x.platform);
      byCh.set(k, [...(byCh.get(k) ?? []), x]);
    }
    const out = new Map<string, number>();
    for (const [k, rows] of byCh) {
      // Mỗi nhóm là MỘT kênh brand × sàn nên cộng không lẫn hai sàn.
      const gmv = sumGmvByPlatform(rows)[rows[0].platform as ReportPlatform] ?? 0;
      const hrs = rows.map(shiftHours).reduce((u, v) => u + v, 0);
      if (hrs >= 10) out.set(k, gmv / hrs);
    }
    return out;
  }, [p.sessions, today]);
  // Thanh chỉ số của phạm vi đang xem (brand đang chọn hoặc tất cả): giờ tháng, chi phí tuần, độ phủ ca, độ tập trung giờ trong tuần.
  const brandStats = useMemo(() => {
    const inScope = (s: { brandId: string }) => brandView === "all" || !channels.some((c) => c.brandId === brandView) || s.brandId === brandView;
    const ws = wk.filter(inScope);
    const hours = new Map<string, number>();
    let filled = 0, cost = 0, missing = 0, noRate = 0;
    const gmv: Record<"TikTok" | "Shopee", number> = { TikTok: 0, Shopee: 0 };
    for (const s of ws) {
      const h = shiftHours(s);
      const r = chGmvPerHour.get(s.channelKey);
      if (r) gmv[platformOf(s)] += r * h;
      else noRate++;
      for (const id of [s.hostId, s.coHostId]) if (id) hours.set(id, (hours.get(id) ?? 0) + h);
      if (s.hostId && (s.coHostId || s.noAssistant)) filled++;
      const c = shiftCost(s, p.talents, p.talentRateHistory);
      cost += c.amount;
      if (c.missing) missing++;
    }
    const sorted = [...hours.values()].sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    const top = (n: number) => (total > 0 ? Math.round((sorted.slice(0, n).reduce((a, b) => a + b, 0) / total) * 100) : 0);
    const month = viewMonth === desk.month ? desk.nowRows.filter((r) => inScope(r)) : [];
    const done = month.reduce((a, r) => a + r.h.delivered, 0);
    const planned = month.reduce((a, r) => a + r.h.scheduled + r.h.open, 0);
    const committed = month.reduce((a, r) => a + r.committed, 0);
    return { gmv, noRate, shifts: ws.length, filled, cost, missing, people: hours.size, top1: top(1), top3: top(3), done, planned, committed, hasMonth: month.length > 0 };
  }, [wk, brandView, channels, p.talents, p.talentRateHistory, viewMonth, desk.month, desk.nowRows, chGmvPerHour]);

  const m0 = desk.month, m1 = desk.next, m2 = nextMonthOf(m1);
  const wizardChannels = useMemo(
    () =>
      // Website (sàn chỉ lịch) không có cam kết giờ / kế hoạch tháng nên không qua trình mở tháng: xếp bằng "Thêm ca mở" + lưới tuần.
      desk.nextRows.filter((r): r is typeof r & { platform: ReportPlatform } => r.platform !== "Website").map((r) => ({
        brandId: r.brandId,
        platform: r.platform,
        brandName: r.brandName,
        shrink: r.shrink,
        prevHours: desk.nowRows.find((x) => x.brandId === r.brandId && x.platform === r.platform)?.committed ?? 0
      })),
    [desk.nextRows, desk.nowRows]
  );
  const openWizard = () => {
    if (desk.loading) {
      showToast("Đang tính số các kênh, thử lại sau vài giây.");
      return;
    }
    setWizardOpen(true);
  };
  const nowIso = new Date().toISOString();
  const statusOf = useCallback(
    (month: string) =>
      monthStatus({ month, today, now: nowIso, sessions: p.sessions, slots: p.shiftSlots, registrations: p.shiftRegistrations, drafts, weeks, milestones: months.find((m) => m.month === month) }),
    // nowIso đổi mỗi lần vẽ — chỉ dùng để so với hạn đăng ký, không cần vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, p.sessions, p.shiftSlots, p.shiftRegistrations, drafts, weeks, months]
  );
  const st0 = useMemo(() => statusOf(m0), [statusOf, m0]);
  const st1 = useMemo(() => statusOf(m1), [statusOf, m1]);
  const st2 = useMemo(() => statusOf(m2), [statusOf, m2]);
  const short = desk.nowRows.filter((r) => r.verdict && r.verdict.add > 0.5).sort((a, b) => b.verdict!.add - a.verdict!.add);
  const monthEndDay = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 0)).getUTCDate();
  const daysLeft = monthEndDay(m0) - Number(today.slice(8, 10)) + 1;
  const daysToNext = daysLeft;
  const noCommitNext = desk.nextRows.filter((r) => r.r.step === "commit").length;
  const monthCards: MonthCard[] = [
    { status: st0, liveText: desk.loading ? "Đang tính giờ các kênh…" : `Còn ${daysLeft} ngày · ${short.length ? `${short.length} kênh thiếu giờ` : "các kênh đủ giờ"}` },
    { status: st1, noneText: desk.loading ? undefined : `Còn ${daysToNext} ngày tới ngày 1 · ${noCommitNext}/${desk.nextRows.length} kênh chưa có giờ cam kết.` },
    { status: st2, later: true }
  ];
  const sameCh = (ch: ChannelRow) => (r: { brandId: string; platform: string }) => r.brandId === ch.brandId && r.platform === ch.platform;
  const channelMeta = (ch: ChannelRow): React.ReactNode => {
    if (viewMonth === m0) {
      const r = desk.nowRows.find(sameCh(ch));
      if (!r) return null;
      const h = r.h;
      const total = Math.max(r.committed, h.delivered + h.scheduled + h.open, 1);
      const w = (v: number) => `${Math.min(100, (v / total) * 100)}%`;
      return (
        <span className="mt-1.5 block space-y-1" title="Giờ cả tháng: xanh đậm = đã live thật, xanh nhạt = còn trong lịch">
          <span className="flex h-1.5 rounded-full bg-[var(--surface-base)] overflow-hidden">
            <i className="block bg-[var(--success)]" style={{ width: w(h.delivered) }} />
            <i className="block bg-[var(--success)] opacity-40" style={{ width: w(h.scheduled + h.open) }} />
          </span>
          <span className="block text-2xs tabular-nums text-[var(--text-muted)]">
            {Math.round(h.delivered)} + {Math.round(h.scheduled + h.open)}
            {r.committed > 0 ? ` / ${Math.round(r.committed)} giờ` : " giờ"}
          </span>
          {r.verdict && <span className={`block text-2xs font-bold ${r.verdict.tone === "bad" ? "text-rose-400" : r.verdict.tone === "good" ? "text-emerald-400" : "text-[var(--text-faint)]"}`}>{r.verdict.text}</span>}
        </span>
      );
    }
    if (viewMonth === m1) {
      const r = desk.nextRows.find(sameCh(ch));
      if (!r) return null;
      const need = r.r.toOpen;
      return (
        <span className="mt-1.5 block space-y-1">
          {need ? (
            <span className="flex h-1.5 rounded-full bg-[var(--surface-base)] overflow-hidden">
              <i className="block bg-[var(--success)] opacity-60" style={{ width: `${Math.min(100, (r.r.opened / need) * 100)}%` }} />
            </span>
          ) : null}
          <span className="block text-2xs tabular-nums text-[var(--text-muted)]">
            {Math.round(r.r.opened)}
            {need ? ` / ${Math.ceil(need)} giờ cần mở` : " giờ đã mở"}
          </span>
          <span className={`block text-2xs font-bold ${r.r.step === "done" ? "text-emerald-400" : r.r.step === "commit" || r.r.step === "plan" ? "text-rose-400" : "text-amber-300"}`}>{r.r.next}</span>
        </span>
      );
    }
    return null;
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // ---- ghi ----
  const assign = (shift: RosterShift, role: RosterRole, talentId: string | undefined, presetReason?: string) =>
    run(async () => {
      if (shift.kind === "open") {
        const coHostId = role === "co_host" ? talentId : shift.coHostId;
        // Chọn trợ thì thẻ No Asst tự tắt (một ca không vừa có trợ vừa không trợ).
        const next: RosterDraft = { slotId: shift.slotId!, hostId: role === "host" ? talentId : shift.hostId, coHostId, noAssistant: coHostId ? undefined : shift.noAssistant };
        await saveRosterDraft(next, p.currentUserId);
        setDrafts((prev) => [...prev.filter((d) => d.slotId !== next.slotId), ...(next.hostId || next.coHostId ? [next] : [])]);
        showToast(talentId ? `Nháp: ${nameOf(talentId)} vào ca ${shift.brandName} ${shift.startTime}` : "Đã bỏ người khỏi nháp");
        return;
      }
      const hostId = role === "host" ? talentId : shift.hostId;
      const coId = role === "co_host" ? talentId : shift.coHostId;
      if (!hostId) {
        showToast("Ca đã lên lịch phải có host — chọn người thay trước, hoặc huỷ ca.");
        return;
      }
      const reason = presetReason ?? (await prompt(`Lý do đổi ${role === "host" ? "host" : "trợ live"} ca ${shift.brandName} ${dayLabel(shift.date)} ${shift.startTime} (ghi vào nhật ký, người bị rút nhận thông báo)`, { placeholder: "vd: Host báo ốm" }));
      if (!reason?.trim()) return;
      const saved = await rosterReassign(shift.sessionId!, hostId, coId ?? null, reason.trim());
      p.onSessionUpdated(saved);
      setChangesNonce((n) => n + 1);
      showToast(`Đã đổi người ca ${shift.brandName} ${shift.startTime} — đã báo người liên quan`);
    });

  /** Thẻ "No Asst" (0207): ca nháp lưu vào nháp (cần host trước); ca đã công bố đổi cột trên ca chờ đăng ký đã chốt. */
  const setNoAssistant = (shift: RosterShift, value: boolean) =>
    run(async () => {
      if (shift.kind === "open") {
        if (!shift.hostId) {
          showToast("Chọn host trước rồi mới gắn No Asst.");
          return;
        }
        const next: RosterDraft = { slotId: shift.slotId!, hostId: shift.hostId, coHostId: value ? undefined : shift.coHostId, noAssistant: value };
        await saveRosterDraft(next, p.currentUserId);
        setDrafts((prev) => [...prev.filter((d) => d.slotId !== next.slotId), next]);
        showToast(value ? "Đã gắn No Asst — ca này chủ ý không có trợ live (OPS giao ca)" : "Đã gỡ No Asst — ca lại cần trợ live trước khi công bố");
        return;
      }
      const slot = shift.finalSlotId ? p.shiftSlots.find((sl) => sl.id === shift.finalSlotId) : undefined;
      if (!slot) {
        showToast("Ca nhập từ Sheet hoặc ca nối không gắn được No Asst.");
        return;
      }
      await setSlotNoAssistant(slot.id, value);
      p.onSlotUpdated({ ...slot, noAssistant: value || undefined });
      showToast(value ? "Đã gắn No Asst cho ca đã công bố" : "Đã gỡ No Asst");
    });

  /** Đặt hạn đăng ký riêng cho ca còn thiếu người (0207) — sau đó talent đăng ký thêm được dù hạn tháng/đợt đã qua. */
  const reopenSignup = (shift: RosterShift, deadline: Date) =>
    run(async () => {
      const when = `${deadline.getHours()}:${String(deadline.getMinutes()).padStart(2, "0")} ${deadline.getDate()}/${deadline.getMonth() + 1}`;
      if (!(await confirm(`Mở đăng ký thêm cho ca ${shift.brandName} ${dayLabel(shift.date)} ${shift.startTime} tới ${when}? Talent thấy ca trong tab Đăng ký ca với thẻ "Cần ${shift.hostId ? "trợ live" : "host"}".`, { confirmLabel: "Mở đăng ký" }))) return;
      const n = await openSlotsForSignup([shift.slotId!], deadline);
      await p.onScheduleChanged();
      showToast(n > 0 ? `Đã mở đăng ký thêm tới ${when}` : "Ca không còn mở — không đặt được hạn");
    });

  const move = (shift: RosterShift, v: { date: string; startTime: string; endTime: string }) =>
    run(async () => {
      if (shift.kind === "open") {
        const saved = await updateOpenSlotTime(shift.slotId!, v);
        p.onSlotUpdated(saved);
        setSelectedKey(`o:${saved.id}`);
        showToast("Đã dời ca mở");
        return;
      }
      const reason = await prompt(`Lý do dời ca ${shift.brandName} ${dayLabel(shift.date)} ${shift.startTime} sang ${dayLabel(v.date)} ${v.startTime}–${v.endTime}`, { placeholder: "vd: Brand đổi khung live" });
      if (!reason?.trim()) return;
      const saved = await rosterMoveSession(shift.sessionId!, v.date, v.startTime, v.endTime, reason.trim());
      p.onSessionUpdated(saved);
      setChangesNonce((n) => n + 1);
      showToast("Đã dời ca — host/trợ nhận thông báo đổi giờ");
    });

  const remove = (shift: RosterShift) =>
    run(async () => {
      if (shift.kind === "open") {
        if (!(await confirm(`Bỏ ca mở ${shift.brandName} ${dayLabel(shift.date)} ${shift.startTime}–${shift.endTime}? Lượt báo rảnh của ca này cũng mất.`, { danger: true, confirmLabel: "Bỏ ca" }))) return;
        await p.onDeleteSlot(shift.slotId!);
        setSelectedKey(null);
        return;
      }
      const reason = await prompt(`Lý do huỷ ca ${shift.brandName} ${dayLabel(shift.date)} ${shift.startTime}–${shift.endTime} (host/trợ nhận thông báo)`, { placeholder: "vd: Brand dừng live ngày này" });
      if (!reason?.trim()) return;
      if (await p.onCancelSession(shift.sessionId!, reason.trim(), false)) setSelectedKey(null);
    });

  const addShift = (ch: ChannelRow, date: string, hint?: { start: string; end: string; note: string }) =>
    run(async () => {
      const start = await prompt(`Thêm ca ${ch.brandName} ${ch.platform} ${dayLabel(date)} — giờ bắt đầu${hint ? `\n${hint.note}` : ""}`, { inputType: "time", defaultValue: hint?.start ?? "19:00" });
      if (!start) return;
      const end = await prompt(`Giờ kết thúc (bắt đầu ${start})`, { inputType: "time", defaultValue: hint && start === hint.start ? hint.end : `${String((Number(start.slice(0, 2)) + 3) % 24).padStart(2, "0")}:${start.slice(3, 5)}` });
      if (!end || end === start) return;
      const studioId = p.brandStudios.find((b) => b.brandId === ch.brandId && b.platform === ch.platform)?.studioId;
      const studio = p.studios.find((s) => s.id === studioId);
      const ok = await p.onCreateSlot({
        id: "",
        date,
        startTime: start,
        endTime: end,
        brandId: ch.brandId,
        brandName: ch.brandName,
        platform: ch.platform,
        studioId: studio?.id,
        studioName: studio?.name ?? "",
        notes: "",
        status: "open"
      });
      if (ok) showToast(`Đã thêm ca mở ${ch.brandName} ${dayLabel(date)} ${start}–${end}. Kênh đã chốt kế hoạch thì đây là ca tăng cường (không cộng target tháng).`);
    });

  /** "Xếp tất cả ca hợp lệ" ở màn Theo người: ghi nháp những ô `planPersonBulk` đã chọn. */
  const applyPersonBulk = (plan: BulkPlan, name: string) =>
    run(async () => {
      const rows = new Map<string, RosterDraft>();
      for (const pl of plan.placed) {
        const s = plan.shifts.find((x) => x.key === pl.shiftKey)!;
        rows.set(pl.slotId, { slotId: pl.slotId, hostId: s.hostId, coHostId: s.coHostId, noAssistant: s.coHostId ? undefined : s.noAssistant });
      }
      await saveRosterDrafts([...rows.values()], p.currentUserId);
      setDrafts((prev) => [...prev.filter((d) => !rows.has(d.slotId)), ...rows.values()]);
      showToast(`Đã xếp ${name} vào ${plan.placed.length} ca (nháp)${plan.skipped ? `, bỏ qua ${plan.skipped} ca` : ""}`);
    });

  const personTalent = personOn && personId ? talentById.get(personId) : undefined;
  const monthCtx = useMemo(() => ({ ...ctx, shifts: monthShifts }), [ctx, monthShifts]);
  const personCounts = useMemo(() => (personOn ? registrationCounts(monthShifts, viewMonth) : new Map<string, { registered: number; placed: number }>()), [personOn, monthShifts, viewMonth]);
  const personPeople = useMemo(
    () =>
      p.talents
        .filter((t) => personCounts.has(t.id))
        .map((t) => ({ talent: t, registered: personCounts.get(t.id)!.registered }))
        .sort((a, b) => b.registered - a.registered || talentShortName(a.talent).localeCompare(talentShortName(b.talent), "vi")),
    [p.talents, personCounts]
  );
  const roleNow: RosterRole = personRole ?? (personTalent ? defaultRole(personTalent, { hostId: undefined, coHostId: undefined, noAssistant: false } as RosterShift) : "host");
  const personRows = useMemo(() => (personTalent ? buildPersonRows(monthShifts, personTalent, viewMonth, monthCtx, roleNow).filter((r) => r.shift.date >= today) : []), [personTalent, monthShifts, viewMonth, monthCtx, roleNow, today]);
  const personBulk = useMemo(() => (personTalent ? planPersonBulk(monthShifts, personTalent, viewMonth, monthCtx, roleNow) : null), [personTalent, monthShifts, viewMonth, monthCtx, roleNow]);
  const personHours = useMemo(() => {
    if (!personTalent || !personBulk) return undefined;
    const l = personLoad(monthShifts, personTalent.id, viewMonth);
    const b = personBounds(personTalent, bounds, rules, viewMonth);
    const add = personBulk.placed.reduce((sum, pl) => sum + shiftHours(monthShifts.find((x) => x.key === pl.shiftKey)!), 0);
    return { placed: l.host + l.co, min: b.min, max: b.max, addIfAll: add };
  }, [personTalent, personBulk, monthShifts, viewMonth, bounds, rules]);

  /** Bấm ô trên lưới. Đang chọn người: ô họ đăng ký ⇒ xếp (hỏi nếu cảnh báo / thay người); ô họ đã xếp ⇒ hỏi rồi bỏ; ô khác ⇒ mở chi tiết ca như thường. */
  const onGridSelect = async (key: string) => {
    const row = personTalent ? personRows.find((r) => r.shift.key === key) : undefined;
    if (!personTalent || !row) return setSelectedKey(key);
    if (readOnly) return showToast("Bạn chỉ có quyền xem lịch.");
    const nm = nameOf(personTalent.id);
    const label = `${row.shift.brandName} ${dayLabel(row.shift.date)} ${row.shift.startTime}`;
    if (row.holds) {
      if (await confirm(`Bỏ ${nm} khỏi ca ${label}?`, { confirmLabel: "Bỏ khỏi ca" })) await assign(row.shift, row.holds, undefined);
      return;
    }
    if (row.blocked) return showToast(`Không xếp được: ${row.blocked}`);
    if (row.noCo) return showToast("Ca này gắn No Asst — không có chỗ trợ.");
    const rl = row.role === "host" ? "Host" : "Trợ";
    if (row.takenBy) {
      if (!(await confirm(`Thay ${nameOf(row.takenBy)} bằng ${nm} (${rl}) — ${label}? ${nameOf(row.takenBy)} vẫn giữ lượt đăng ký ca này.`, { confirmLabel: "Thay người" }))) return;
    } else if (row.issues.length > 0) {
      if (!(await confirm(`${nm} vào ca ${label} sẽ có cảnh báo: ${row.issues.join("; ")}. Vẫn xếp?`, { confirmLabel: "Vẫn xếp" }))) return;
    }
    await assign(row.shift, row.role, personTalent.id);
  };
  const bulkPerson = async () => {
    if (!personTalent || !personBulk || personBulk.placed.length === 0) return;
    const h = personHours?.addIfAll ?? 0;
    if (!(await confirm(`Xếp ${nameOf(personTalent.id)} làm ${roleNow === "host" ? "Host" : "Trợ"} vào ${personBulk.placed.length} ca (${Math.round(h * 10) / 10} giờ) trong NHÁP — chỉ ca còn trống, không trùng giờ, không cảnh báo. Talent chưa thấy cho tới khi công bố.`, { confirmLabel: `Xếp ${personBulk.placed.length} ca` }))) return;
    await applyPersonBulk(personBulk, nameOf(personTalent.id));
  };

  const applyCost = () =>
    run(async () => {
      if (!costPlan) return;
      const rows = new Map<string, RosterDraft>();
      for (const m of costPlan.moves) {
        const s = costPlan.shifts.find((x) => x.key === m.shiftKey)!;
        rows.set(s.slotId!, { slotId: s.slotId!, hostId: s.hostId, coHostId: s.coHostId, noAssistant: s.noAssistant });
      }
      await saveRosterDrafts([...rows.values()], p.currentUserId);
      setDrafts((prev) => [...prev.filter((d) => !rows.has(d.slotId)), ...rows.values()]);
      showToast(`Đã đổi ${costPlan.moves.length} người trong nháp, tiết kiệm ${fmtVndShort(costPlan.save)} tuần này`);
      setCostPlan(null);
    });

  const planRange = useMemo(() => ({ from: `${viewMonth}-01`, to: scope === "half" ? `${viewMonth}-15` : `${viewMonth}-${String(daysInMonth(viewMonth)).padStart(2, "0")}` }), [viewMonth, scope]);
  const planMinScale = scope === "half" ? 15 / daysInMonth(viewMonth) : 1;
  const planScopeLabel = `${scope === "half" ? "ngày 1–15" : "cả tháng"} tháng ${Number(viewMonth.slice(5))}`;
  const persistAuto = (a: AutoFill) => {
    setAuto(a);
    try {
      localStorage.setItem("roster.autofill", JSON.stringify(a));
    } catch {
      /* chỉ là tiện ích */
    }
  };
  const changeBounds = (b: MonthBounds) => {
    setBounds(b);
    try {
      localStorage.setItem("roster.bounds", JSON.stringify(b));
    } catch {
      /* chỉ là tiện ích */
    }
  };
  /** Bấm một mục tiêu: xếp lại và GHI NHÁP ngay (talent chưa thấy). Chỉ ghi đè ô do bộ xếp đã fill; ô Trainer tự xếp được giữ. */
  const pickGoal = (g: PlanGoal) =>
    run(async () => {
      setGoal(g);
      try {
        localStorage.setItem("roster.goal", g);
      } catch {
        /* chỉ là tiện ích */
      }
      const monthEnd = `${viewMonth}-${String(daysInMonth(viewMonth)).padStart(2, "0")}`;
      const freed0 = releaseAutoFilled(buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(`${viewMonth}-01`, -7), addDays(monthEnd, 7)), auto, planRange);
      // Nháp đang đứng sai vai (theo cài đặt vai hoặc tự suy từ lịch sử) cũng được gỡ để xếp lại, kể cả ô xếp tay / nháp cũ.
      const { shifts: freed, released: wrongRole } = releaseRoleViolations(freed0, brandRules, planRange);
      const plan = planMonth({ shifts: freed, month: viewMonth, today, goal: g, bounds, guaranteeMin: true, rules, talents: p.talents, history: p.talentRateHistory, fam, perf: buildHostPerformancePrevMonth(p.sessions, viewMonth, today), brandRules, range: planRange, minScale: planMinScale, tuning });
      const { rows, nextAuto } = applyPlanRows(plan, freed, auto, planRange);
      // Ô bị gỡ vì sai vai mà lần này không ai lấp được ⇒ vẫn phải ghi dòng rỗng để xoá nháp cũ.
      for (const w of wrongRole) {
        if (rows.some((r) => r.slotId === w.slotId)) continue;
        const sh = freed.find((x) => x.slotId === w.slotId);
        if (sh) rows.push({ slotId: w.slotId, hostId: sh.hostId, coHostId: sh.coHostId, noAssistant: sh.noAssistant });
      }
      if (plan.totals.openShifts === 0) {
        setPlanNote(`Chưa có ca mở nào trong ${planScopeLabel}. Mở lịch ở "Mở lịch tháng sau" trước.`);
        return;
      }
      if (rows.length > 0) {
        await saveRosterDrafts(rows, p.currentUserId);
        setDrafts((prev) => [...prev.filter((d) => !rows.some((r) => r.slotId === d.slotId)), ...rows.filter((r) => r.hostId || r.coHostId)]);
      }
      persistAuto(nextAuto);
      const empty = plan.unfilled.filter((u) => u.reason === "no_registrant").length;
      setPlanNote(`${GOAL_LABEL[g]} · ${planScopeLabel}: lấp ${plan.totals.plannedCount} chỗ vào nháp, còn ${plan.unfilled.length} chỗ trống${empty ? ` (${empty} chỗ chưa ai đăng ký)` : ""}.${wrongRole.length ? ` Đã gỡ ${wrongRole.length} ô đang sai vai (${[...new Set(wrongRole.map((w) => nameOf(w.talentId)))].slice(0, 4).join(", ")}${new Set(wrongRole.map((w) => w.talentId)).size > 4 ? "…" : ""}) để xếp lại.` : ""} Nháp, talent chưa thấy.`);
    });
  // Tuần (Thứ 2) có nháp trong phạm vi đang chọn. Từ 0227 chỉ công bố đúng khoảng ngày (không kéo cả tuần vắt biên).
  const rangeWeeks = useMemo(() => {
    const byWeek = new Map<string, number>();
    for (const sl of p.shiftSlots) {
      if (sl.status !== "open" || sl.sessionId || sl.date < planRange.from || sl.date > planRange.to) continue;
      if (!drafts.some((d) => d.slotId === sl.id && d.hostId)) continue;
      const w = isoWeekStart(sl.date);
      byWeek.set(w, (byWeek.get(w) ?? 0) + 1);
    }
    return [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [p.shiftSlots, drafts, planRange]);
  /** Công bố lần lượt mọi tuần có nháp trong phạm vi: MỘT hộp xác nhận, mỗi tuần là một giao dịch riêng (tuần lỗi dừng lại, tuần đã xong giữ nguyên). */
  const publishRange = () =>
    run(async () => {
      const weekEndOf = (w: string) => addDays(w, 6);
      const total = rangeWeeks.reduce((n, [, c]) => n + c, 0);
      const people = new Set<string>();
      for (const d of drafts) if (p.shiftSlots.some((sl) => sl.id === d.slotId && rangeWeeks.some(([w]) => sl.date >= w && sl.date <= weekEndOf(w)))) [d.hostId, d.coHostId].forEach((x) => x && people.add(x));
      // 0206: quá giờ tuần chỉ cảnh báo — liệt kê từng tuần/người trước khi công bố.
      const overLines = rangeWeeks.flatMap(([w]) =>
        analyzeRoster(buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(w, -7), addDays(w, 7)), rules, w, nameOf, undefined, brandRules)
          .issues.filter((i) => i.code === "week_over")
          .map((i) => `tuần ${dayLabel(w)}: ${i.text.replace(/ có (.+) trong tuần.*/, " $1")}`)
      );
      const inRange = p.shiftSlots.filter((sl) => sl.status === "open" && !sl.sessionId && sl.date >= planRange.from && sl.date <= planRange.to);
      const hostOf = (id: string) => drafts.find((d) => d.slotId === id)?.hostId;
      const noHostN = inRange.filter((sl) => !hostOf(sl.id)).length;
      const noCoN = inRange.filter((sl) => { const d = drafts.find((x) => x.slotId === sl.id); return !!d?.hostId && !d.coHostId && !d.noAssistant; }).length;
      const msg = [
        `Công bố lịch ${dayLabel(planRange.from)} – ${dayLabel(planRange.to)} một lần?`,
        `${total} ca có host thành ca thật; khoảng ${people.size} host/trợ nhận tin (mỗi người một tin cho mỗi tuần).`,
        noCoN > 0 ? `${noCoN} ca chưa có trợ vẫn được chốt — thêm trợ (hoặc No Asst) sau.` : "",
        noHostN > 0 ? `${noHostN} ca chưa có host giữ là ca mở, talent thấy "Cần host" và đăng ký thêm.` : "",
        `Chỉ công bố ca trong ${dayLabel(planRange.from)} – ${dayLabel(planRange.to)}, ca ngoài khoảng này giữ nguyên nháp.`,
        overLines.length > 0 ? `⚠ Quá ${rules.maxWeekHours} giờ/tuần (không chặn): ${overLines.join("; ")}.` : ""
      ]
        .filter(Boolean)
        .join("\n");
      if (!(await confirm(msg, { confirmLabel: `Công bố ${total} ca` }))) return;
      let published = 0;
      let notified = 0;
      try {
        ({ published, notified } = await publishRosterRange(planRange.from, planRange.to, rangeWeeks.map(([w]) => w)));
      } catch (e) {
        await Promise.all([p.onScheduleChanged(), reloadRoster()]);
        showToast(`Chưa công bố được: ${errorMessage(e)}`);
        return;
      }
      await Promise.all([p.onScheduleChanged(), reloadRoster()]);
      persistAuto(
        Object.fromEntries(
          Object.entries(auto).filter(([id]) => {
            const sl = p.shiftSlots.find((x) => x.id === id);
            return !!sl && !rangeWeeks.some(([w]) => sl.date >= w && sl.date <= weekEndOf(w));
          })
        )
      );
      setPlanNote(null);
      showToast(`Đã công bố ${published} ca (${dayLabel(planRange.from)}–${dayLabel(planRange.to)}), gửi ${notified} tin cho host/trợ${noCoN > 0 ? ` · ${noCoN} ca chờ chốt trợ` : ""}${noHostN > 0 ? ` · ${noHostN} ca chờ host` : ""}`);
    });
  // Khối lượng từng người theo lịch + nháp HIỆN CÓ (không xếp thêm), tính tới hết phạm vi đang chọn (1–15 hoặc cả tháng).
  const workload = useMemo(() => {
    const monthShifts = buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(`${viewMonth}-01`, -7), addDays(`${viewMonth}-31`, 7));
    return planMonth({ shifts: monthShifts, month: viewMonth, today, goal, bounds, guaranteeMin: false, rules, talents: p.talents, history: p.talentRateHistory, fam: new Map(), perf: buildHostPerformancePrevMonth(p.sessions, viewMonth, today), brandRules, minScale: planMinScale, reportOnly: true, loadTo: planRange.to, tuning });
  }, [p.sessions, p.shiftSlots, p.shiftRegistrations, drafts, viewMonth, today, goal, bounds, rules, p.talents, p.talentRateHistory, brandRules, planMinScale, planRange.to, tuning]);
  const clearAuto = () =>
    run(async () => {
      const freed = releaseAutoFilled(buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, `${viewMonth}-01`, planRange.to), auto, planRange);
      const { rows, nextAuto } = applyPlanRows({ assignments: [], unfilled: [], load: [], totals: {} as never }, freed, auto, planRange);
      if (rows.length > 0) {
        await saveRosterDrafts(rows, p.currentUserId);
        setDrafts((prev) => [...prev.filter((d) => !rows.some((r) => r.slotId === d.slotId)), ...rows.filter((r) => r.hostId || r.coHostId)]);
      }
      persistAuto(nextAuto);
      setPlanNote(`Đã gỡ phần tự fill của ${planScopeLabel}. Ô bạn xếp tay được giữ.`);
    });

  const publish = () =>
    run(async () => {
      const holes = openShifts.filter((s) => !s.hostId).length;
      const msg = [
        `Công bố lịch tuần ${dayLabel(weekStart)} – ${dayLabel(weekEnd)}?`,
        `${draftedCount} ca nháp sẽ thành ca thật, mỗi host/trợ nhận MỘT tin liệt kê ca của mình.`,
        outsideDrafts > 0 ? `Gồm cả ${outsideDrafts} ca nháp ngoài tháng ${Number(viewMonth.slice(5))}.` : "",
        holes > 0 ? `${holes} ca mở chưa có host sẽ vẫn mở (không công bố).` : "",
        holdCoShifts.length > 0 ? `${holdCoShifts.length} ca đã có host nhưng chưa có trợ vẫn được chốt — thêm trợ (hoặc No Asst) sau: ${holdCoShifts.slice(0, 4).map((s) => `${s.brandName} ${dayLabel(s.date)} ${s.startTime}`).join(", ")}${holdCoShifts.length > 4 ? "…" : ""}.` : "",
        // 0206: quá giờ tuần chỉ cảnh báo — nêu đích danh để người công bố nhìn thấy trước khi bấm.
        overWeek.length > 0 ? `⚠ Quá ${rules.maxWeekHours} giờ/tuần (không chặn): ${overWeek.map((i) => i.text.replace(/ có (.+) trong tuần.*/, " $1")).join("; ")}.` : "",
        warns.length - overWeek.length > 0 ? `Còn ${warns.length - overWeek.length} cảnh báo khác (không chặn).` : ""
      ]
        .filter(Boolean)
        .join("\n");
      if (!(await confirm(msg, { confirmLabel: "Công bố" }))) return;
      const r = await publishRosterWeek(weekStart);
      await Promise.all([p.onScheduleChanged(), reloadRoster()]);
      showToast(`Đã công bố ${r.published} ca, gửi ${r.notified} tin cho host/trợ${holdCoShifts.length > 0 ? ` · ${holdCoShifts.length} ca chờ chốt trợ` : ""}`);
    });

  const saveRules = (r: RosterRules) =>
    run(async () => {
      await updateRosterRules(r, p.currentUserId);
      setRules(r);
      showToast("Đã lưu ngưỡng luật lịch");
    });

  const changeMode = (m: RankMode) => {
    setMode(m);
    setCostPlan(null);
    try {
      localStorage.setItem("roster.mode", m);
    } catch {
      /* chế độ chỉ là tiện ích */
    }
  };


  // ---- việc cần làm: mỗi việc một nút ----
  const goWeekOf = (date: string) => {
    setViewMonth(date.slice(0, 7));
    setWeekStart(isoWeekStart(date));
    setSelectedKey(null);
    setCostPlan(null);
  };
  const copyText = async (text: string, ok: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(ok);
    } catch {
      showToast("Trình duyệt chặn chép — thử lại bằng Chrome/Safari bản mới");
    }
  };
  const nudge = (month: string) => {
    const st = statusOf(month);
    const missing = p.talents.filter((t) => t.profileId && (t.role === "Host" || t.role === "Assistant") && !st.signedIds.has(t.id)).map((t) => talentShortName(t));
    if (missing.length === 0) {
      showToast("Ai có tài khoản cũng đã đăng ký ít nhất một ca.");
      return;
    }
    const text = `Nhắc đăng ký ca tháng ${Number(month.slice(5))}${st.deadline ? ` trước ${fmtWhen(st.deadline)}` : ""}: ${missing.join(", ")}. Vào app → Đăng ký ca: ${window.location.origin}/nhan-su-ca`;
    void copyText(text, `Đã chép tin nhắc ${missing.length} người chưa đăng ký — dán vào nhóm Zalo`);
  };
  const onMonthAction = (kind: MonthAction, month: string) => {
    if (kind === "next") {
      if (month === m1) openWizard();
      else openSection("next");
    }
    else if (kind === "nudge") nudge(month);
    else if (kind === "staff") {
      const first = p.shiftSlots
        .filter((sl) => sl.date.slice(0, 7) === month && sl.date >= today && sl.status === "open" && !sl.sessionId && !drafts.find((d) => d.slotId === sl.id)?.hostId)
        .map((sl) => sl.date)
        .sort()[0];
      // Không còn ca thiếu host thì tới ca đã có host mà chờ trợ / No Asst (0207).
      const firstCo = p.shiftSlots
        .filter((sl) => sl.date.slice(0, 7) === month && sl.date >= today && sl.status === "open" && !sl.sessionId && (() => { const d = drafts.find((x) => x.slotId === sl.id); return !!d?.hostId && !d.coHostId && !d.noAssistant; })())
        .map((sl) => sl.date)
        .sort()[0];
      if (first ?? firstCo) goWeekOf((first ?? firstCo)!);
    } else if (kind === "publish") {
      const w = statusOf(month).weeksToPublish[0];
      if (w) goWeekOf(w);
    }
  };

  const publishLabel = blocks.length > 0 ? `Công bố tuần này · ${blocks.length} lỗi` : draftedCount > 0 ? `Công bố tuần này · ${draftedCount} ca` : "Tuần này không có nháp";

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        title="Điều Phối Lịch Live"
        description="Một màn cho lịch live mọi brand: trạng thái từng tháng và lịch tuần với giờ tháng cạnh mỗi kênh."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1">
              <button type="button" onClick={() => goMonth(-1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tháng trước">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-bold text-[var(--text)] whitespace-nowrap">
                Tháng {Number(viewMonth.slice(5))}/{viewMonth.slice(0, 4)}
              </span>
              <button type="button" onClick={() => goMonth(1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tháng sau">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button type="button" disabled={readOnly || busy || blocks.length > 0 || draftedCount === 0} onClick={publish} title={blocks.length > 0 ? "Còn lỗi chặn — bấm ca viền đỏ để sửa" : draftedCount === 0 ? "Chỉ ca nháp mới cần công bố" : undefined} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-black disabled:opacity-40">
              <Send className="w-4 h-4" /> {publishLabel}
            </button>
            <details ref={moreRef} className="relative">
              <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center gap-1 px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)]">
                Thêm <ChevronDown className="w-3.5 h-3.5" />
              </summary>
              <div className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 shadow-2xl">
                {MORE.map((m) => (
                  <button key={m.id} type="button" onClick={() => openSection(m.id)} className={`block w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-[var(--surface-hover)] ${section === m.id ? "font-bold text-[var(--text)]" : "text-[var(--text-muted)]"}`}>
                    {m.label}
                    {m.id === "checks" && blocks.length + warns.length > 0 && <span className="ml-1.5 text-2xs tabular-nums text-[var(--text-faint)]">{blocks.length} lỗi · {warns.length} cảnh báo</span>}
                  </button>
                ))}
                <button type="button" onClick={() => { if (moreRef.current) moreRef.current.open = false; setExportOpen(true); }} title="Tải lịch cả tháng ra Excel để gửi brand xác nhận" className="block w-full text-left px-3 py-2 rounded-lg text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
                  Xuất lịch gửi brand (Excel)
                </button>
              </div>
            </details>
          </>
        }
      >
        {backendMissing && <FeatureOffNote tone="band" what="đặt hạn, xếp nháp và công bố lịch (chỉ xem được lịch đã có)" />}
        {loadError && <p className="text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">Không tải được dữ liệu Điều Phối Lịch Live: {loadError}</p>}
        {desk.commitError && <p className="text-xs text-amber-300">Không đọc được cam kết hợp đồng — giờ cam kết để trống.</p>}
      </PageHeader>

      {canWrite && <SwapApprovalQueue sessions={p.sessions} />}

      <MonthStrip
        cards={monthCards}
        viewMonth={viewMonth}
        today={today}
        onAction={onMonthAction}
        onPick={(m) => {
          const [y1, m1] = viewMonth.split("-").map(Number);
          const [y2, m2] = m.split("-").map(Number);
          if (m !== viewMonth) goMonth((y2 - y1) * 12 + (m2 - m1));
        }}
      />

      <div className="space-y-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 sm:p-3 min-w-0">
          {/* Gọn 17/11: "chọn xem gì" (tuần + brand) MỘT hàng, đặt trước "xếp gì" (Tự fill / Xếp theo người). */}
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs" aria-label="Chọn tuần và brand">
            <div className="flex flex-wrap items-center gap-2" aria-label="Tuần trong tháng">
              <span className="font-black text-[var(--text)]">Tuần</span>
              <div className="flex flex-wrap items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 font-bold" role="group">
                {monthWeeks.map((w) => (
                  <button key={w.start} type="button" aria-pressed={weekStart === w.start} onClick={() => goWeekOf(w.start < `${viewMonth}-01` ? `${viewMonth}-01` : w.start)} className={`px-2.5 py-1 rounded-lg tabular-nums ${weekStart === w.start ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
            {gridBrands.length > 1 && (
              <div className="flex flex-wrap items-center gap-2" aria-label="Brand">
                <span className="font-black text-[var(--text)]">Brand</span>
                <div className="flex flex-wrap items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 font-bold" role="group">
                  {[{ id: "all", name: "Tất cả" }, ...gridBrands].map((b) => (
                    <button key={b.id} type="button" aria-pressed={brandView === b.id} onClick={() => setBrandView(b.id)} className={`px-2.5 py-1 rounded-lg ${brandView === b.id ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!monthWeeks.some((w) => w.start === weekStart) && <span className="text-amber-300">Tuần {dayLabel(weekStart)} – {dayLabel(weekEnd)} không thuộc tháng này — chọn một tuần.</span>}
          </div>
          {/* Gọn 17/11 ("rút gọn chỗ này"): MỘT hàng — phạm vi, 3 mục tiêu, Xếp theo người, ⋯ (gỡ tự fill, so sánh), Công bố. Câu hướng dẫn vào ⓘ. */}
          <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2" aria-label="Tự fill nháp theo mục tiêu">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <span className="font-black text-[var(--text)]">
                Tự fill nháp
                <InfoDot label="Tự fill nháp">Bấm một mục tiêu là ghi NHÁP ngay, talent chưa thấy. Chỉ lấy người đã đăng ký đúng ca, giữ giờ tối thiểu/tối đa và luật lịch. Ô bạn tự xếp không bị ghi đè.</InfoDot>
              </span>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1 font-bold" role="group" aria-label="Phạm vi theo mốc chốt">
                {(
                  [
                    ["half", "Ngày 1–15"],
                    ["full", "Cả tháng"]
                  ] as const
                ).map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={scope === k} onClick={() => setScope(k)} className={`px-2.5 py-1 rounded-lg ${scope === k ? "seg-on" : "text-[var(--text-muted)]"}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1" role="group" aria-label="Mục tiêu">
                {GOALS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    disabled={readOnly || busy}
                    aria-pressed={goal === g && planNote !== null}
                    title={GOAL_HINT[g]}
                    onClick={() => void pickGoal(g)}
                    className={`px-3 py-1.5 rounded-lg border font-bold disabled:opacity-40 ${goal === g && planNote !== null ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}
                  >
                    {GOAL_LABEL[g]}
                  </button>
                ))}
              </div>
              <button type="button" aria-pressed={personOn} onClick={() => { setPersonOn((v) => !v); setSelectedKey(null); }} title="Chọn một talent, lưới tô sáng ca họ đã đăng ký, bấm ô để xếp" className={`px-3 py-1.5 rounded-lg border font-bold ${personOn ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                Xếp theo người
              </button>
              <MoreMenu
                className="ml-auto"
                items={[
                  { label: "Luật đặt giờ từng người", onClick: () => openSection("people") },
                  { label: "So sánh 3 mục tiêu", onClick: () => openSection("plan") },
                  { label: "Gỡ phần tự fill", onClick: () => void clearAuto(), disabled: readOnly || busy || Object.keys(auto).length === 0 }
                ]}
              />
              <button type="button" disabled={readOnly || busy || rangeWeeks.length === 0} onClick={() => void publishRange()} title="Công bố một lần mọi ca có host trong phạm vi đang chọn; ca thiếu trợ vẫn chốt, ca thiếu host giữ mở" className="px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-black disabled:opacity-40">
                {rangeWeeks.length > 0 ? `Công bố ${scope === "half" ? "15 ngày" : "cả tháng"}` : "Chưa có nháp"}
              </button>
            </div>
            {planNote && <p className="mt-1.5 text-2xs text-[var(--text-muted)]">{planNote}</p>}
          </div>
          {personOn && (
            <PersonBar
              people={personPeople}
              personId={personId}
              role={roleNow}
              onPerson={setPersonId}
              onRole={setPersonRole}
              hours={personHours}
              bulkCount={personBulk?.placed.length ?? 0}
              readOnly={readOnly}
              busy={busy}
              onBulk={() => void bulkPerson()}
              onClose={() => setPersonOn(false)}
            />
          )}
          <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-xs tabular-nums" aria-label="Chỉ số tuần">
            <span className="font-black text-[var(--text)]">{brandView === "all" ? "Tất cả brand" : gridBrands.find((b) => b.id === brandView)?.name ?? "Tất cả brand"}</span>
            {brandStats.hasMonth && (
              <span title="Giờ cả tháng: đã live + còn trong lịch / giờ cam kết">
                Giờ tháng <b className="text-[var(--text)]">{Math.round(brandStats.done)} + {Math.round(brandStats.planned)}{brandStats.committed > 0 ? ` / ${Math.round(brandStats.committed)}` : ""}</b>
              </span>
            )}
            <span>Tuần: <b className="text-[var(--text)]">{brandStats.filled}/{brandStats.shifts}</b> ca đủ người</span>
            {showCost && (
              <span title={brandStats.missing > 0 ? `${brandStats.missing} ca chưa có đơn giá nên chưa tính` : undefined}>
                Chi phí tuần <b className="text-[var(--text)]">{fmtVndShort(brandStats.cost)}</b>
                {brandStats.missing > 0 && <span className="text-amber-300"> (thiếu giá {brandStats.missing} ca)</span>}
              </span>
            )}
            <button type="button" aria-expanded={moreStats} onClick={() => setMoreStats((v) => !v)} className="text-2xs font-bold text-[var(--accent-text)] hover:underline">
              {moreStats ? "Ẩn số liệu khác" : "Số liệu khác"}
            </button>
            {moreStats && (
              <>
            {(["TikTok", "Shopee"] as const).filter((pl) => brandStats.gmv[pl] > 0).map((pl) => (
                <span key={pl} title="Ước tính theo GMV/giờ của kênh 28 ngày gần nhất × giờ đã xếp, sai số ~20%. Không tính theo người; không cộng hai sàn.">
                  GMV ước tính {pl} <b className="text-[var(--text)]">{fmtVndShort(brandStats.gmv[pl] * 0.8)}–{fmtVndShort(brandStats.gmv[pl] * 1.2)}</b>
                </span>
              ))}
              {brandStats.noRate > 0 && <span className="text-amber-300">{brandStats.noRate} ca chưa có lịch sử để ước tính</span>}
              <span title="Tỷ lệ giờ tuần dồn vào 1 / 3 người nhiều giờ nhất">
                Tập trung giờ: top 1 <b className="text-[var(--text)]">{brandStats.top1}%</b> · top 3 <b className="text-[var(--text)]">{brandStats.top3}%</b> ({brandStats.people} người)
              </span>
              </>
            )}
          </div>
          <WeekGrid weekStart={weekStart} month={viewMonth} channels={gridChannels} shifts={wk} cancelled={cancelledWk} analysis={analysis} nameOf={nameOf} roleOf={(id) => talentById.get(id)?.role} colorOf={(id) => personColors.get(id)} selectedKey={selectedKey} canAdd={!readOnly} onSelect={(k) => void onGridSelect(k)} onAdd={addShift} channelMeta={channelMeta} focus={personTalent ? { talentId: personTalent.id, name: nameOf(personTalent.id) } : null} />
        </div>
        <details className="group bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 space-y-2" aria-label="Khối lượng nhân sự">
          {/* Gập mặc định (trainer: Điều Phối rối mắt) — chỉ mở khi cần cân giờ. */}
          <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-black text-[var(--text)]">Khối lượng nhân sự · {planScopeLabel}</h2>
            <span className="text-2xs text-[var(--text-muted)]">
              {workload.totals.below} dưới tối thiểu · {workload.totals.over} vượt tối đa · bấm để xem
            </span>
          </summary>
          <p className="text-2xs text-[var(--text-muted)]">
            Đậm = đã lên lịch · nhạt = nháp · vạch đứng = giờ tối thiểu
            <InfoDot label="Chú giải thanh giờ">Nháp là ca chưa công bố. Vạch đứng là giờ tối thiểu (đảm bảo thu nhập), cuối thanh là giờ tối đa.</InfoDot>
          </p>
          <div className="grid gap-3 xl:grid-cols-2">
            {(["host", "assistant"] as const).map((role) => {
              const rows = workload.load.filter((l) => (role === "host" ? l.role === "host" : l.role !== "host"));
              return (
                <div key={role} className="space-y-1.5 min-w-0">
                  <h3 className="text-xs font-black text-[var(--text)]">
                    {role === "host" ? "Host" : "Trợ"} <span className="font-medium text-[var(--text-muted)]">· {rows.length} người</span>
                  </h3>
                  <WorkloadTable load={rows} nameOf={nameOf} showCost={showCost} hideRole emptyText={`Chưa có ca hay đăng ký ${role === "host" ? "host" : "trợ"} trong tháng này.`} />
                </div>
              );
            })}
          </div>
        </details>
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 space-y-3" aria-label="Tổng kết tháng theo người">
          <h2 className="text-sm font-black text-[var(--text)]">Tổng kết tháng theo người</h2>
          <MonthReviewPanel month={viewMonth} sessions={p.sessions} talents={p.talents} history={p.talentRateHistory} nameOf={nameOf} showCost={showCost} />
        </section>
      </div>

      {section && (
        <div ref={sectionRef} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl scroll-mt-4">
          <div className="flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 border-b border-[var(--border)]">
            <h2 className="text-sm font-black text-[var(--text)]">{SECTION_TITLE[section]}</h2>
            <button
              type="button"
              onClick={() => {
                if (section === "next") setMonthsNonce((n) => n + 1);
                openSection(null);
              }}
              className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-3 sm:p-4">
            {section === "plan" && (
              <MonthPlanPanel
                month={viewMonth}
                goal={goal}
                onGoal={pickGoal}
                range={planRange}
                minScale={planMinScale}
                bounds={bounds}
                onBounds={changeBounds}
                tuning={tuning}
                commitments={commitments}
                autoCaps={autoCaps}
                ruleCount={scheduleRules.rules.filter(hasRule).length}
                onOpenRules={() => openSection("people")}
                auto={auto}
                scopeLabel={planScopeLabel}
                today={today}
                sessions={p.sessions}
                shiftSlots={p.shiftSlots}
                registrations={p.shiftRegistrations}
                drafts={drafts}
                talents={p.talents}
                history={p.talentRateHistory}
                rules={rules}
                brandRules={brandRules}
                nameOf={nameOf}
                showCost={showCost}
              />
            )}
            {section === "people" && <PersonRulesDesk month={viewMonth} talents={p.talents} brands={p.brands} nameOf={nameOf} commitments={commitments} scheduleRules={scheduleRules} autoCaps={autoCaps} readOnly={readOnly} />}
            {section === "next" && <NextDesk {...deskProps} registrations={p.shiftRegistrations} drafts={drafts} weeks={weeks} />}
            {section === "checks" && <ChecksPanel analysis={analysis} shifts={wk} onSelect={setSelectedKey} />}
            {section === "absence" && <AbsencePanel key={weekStart} weekStart={weekStart} shifts={shifts} analysis={analysis} ctx={ctx} talents={p.talents} showCost={showCost} readOnly={readOnly} busy={busy} onAssign={assign} />}
            {section === "matrix" && <MatrixPanel channels={channels} fam={fam} talents={p.talents} />}
            {section === "hours" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[var(--text-muted)]">Khi gợi ý người:</span>
                  <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 font-bold" role="group" aria-label="Ưu tiên khi gợi ý người">
                    {(
                      [
                        ["balance", "Cân bằng"],
                        ["cost", "Tiết kiệm chi phí"],
                        ["gmv", "Tối ưu GMV"]
                      ] as const
                    ).map(([k, l]) => (
                      <button key={k} type="button" aria-pressed={mode === k} onClick={() => changeMode(k)} className={`px-3 py-1.5 rounded-lg ${mode === k ? "seg-on" : "text-[var(--text-muted)]"}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <span className="text-[var(--text-muted)] tabular-nums">
                    Chi phí người tuần này: {showCost && weekCost > 0 ? fmtVndShort(weekCost) : "chưa tính được"}
                    {showCost && costMissing > 0 ? ` (${costMissing} ca thiếu rate)` : ""}
                    {!showCost && " — nhập rate ở Talent Pool"}
                  </span>
                </div>
                <HoursCostPanel
                  weekStart={weekStart}
                  channels={channels}
                  shifts={shifts}
                  analysis={analysis}
                  rules={rules}
                  talents={p.talents}
                  history={p.talentRateHistory}
                  showCost={showCost}
                  readOnly={readOnly}
                  busy={busy}
                  costLimit={costLimit}
                  onCostLimit={(n) => {
                    setCostLimit(n);
                    setCostPlan(null);
                  }}
                  costPlan={costPlan}
                  onFindCost={() => setCostPlan(planCostCut(ctx, costLimit))}
                  onApplyCost={applyCost}
                  onDropCost={() => setCostPlan(null)}
                  nameOf={nameOf}
                />
              </div>
            )}
            {section === "rules" && (
              <div className="space-y-5">
                <RulesPanel key={JSON.stringify(rules)} rules={rules} readOnly={readOnly} busy={busy} onSave={saveRules} />
                <ChangeLogPanel changes={changes} sessions={p.sessions} nameOf={nameOf} />
              </div>
            )}
          </div>
        </div>
      )}

      {exportOpen && <BrandScheduleExportDialog month={viewMonth} sessions={p.sessions} shiftSlots={p.shiftSlots} onClose={() => setExportOpen(false)} />}

      {wizardOpen && (
        <OpenMonthWizard
          month={m1}
          today={today}
          channels={wizardChannels}
          sessions={p.sessions}
          shiftSlots={p.shiftSlots}
          saved={months.find((m) => m.month === m1)}
          onClose={() => setWizardOpen(false)}
          onDone={async () => {
            await Promise.all([p.onScheduleChanged(), reloadRoster()]);
            setMonthsNonce((n) => n + 1);
          }}
        />
      )}

      {selected && (
        <ShiftPanel
          key={`${selected.key}|${selected.date}|${selected.startTime}|${selected.endTime}`}
          shift={selected}
          analysis={analysis}
          ctx={ctx}
          talents={p.talents}
          history={p.talentRateHistory}
          showCost={showCost}
          readOnly={readOnly}
          busy={busy}
          onClose={() => setSelectedKey(null)}
          onAssign={(s, r, t, reason) => void assign(s, r, t, reason)}
          onNoAssistant={(s, v) => void setNoAssistant(s, v)}
          onReopenSignup={(s, d) => void reopenSignup(s, d)}
          onMove={(s, v) => void move(s, v)}
          onRemove={(s) => void remove(s)}
          onMode={changeMode}
        />
      )}
    </div>
  );
};
