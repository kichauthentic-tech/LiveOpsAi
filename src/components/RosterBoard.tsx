import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Send, X } from "lucide-react";
import type { Brand, BrandChannel, BrandStudio, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, TalentRateHistoryEntry, UserRole } from "../types";
import { PageHeader } from "./common/PageHeader";
import { useToast } from "../hooks/useToast";
import { useConfirm, usePrompt } from "../hooks/useConfirm";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndShort } from "../lib/format";
import { talentShortName } from "../lib/talentName";
import { addDays, getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { halfRange } from "../lib/roster/milestones";
import { suggestNextShift } from "../lib/scheduling/nextShift";
import { updateOpenSlotTime } from "../lib/db/shiftSlots";
import {
  fetchRosterChanges,
  fetchRosterDrafts,
  fetchRosterMonths,
  fetchRosterRules,
  fetchRosterWeeks,
  isRosterBackendMissing,
  publishRosterWeek,
  rosterMoveSession,
  rosterReassign,
  saveRosterDraft,
  saveRosterDrafts,
  updateRosterRules,
  type RosterChange,
  type RosterDraft,
  type RosterMonth,
  type RosterWeek
} from "../lib/db/roster";
import type { BrandTalentRule } from "../lib/commercial/terms";
import { analyzeRoster, buildBrandRuleIndex, buildRosterShifts, channelKeyOf, DEFAULT_ROSTER_RULES, type RosterRole, type RosterRules, type RosterShift } from "../lib/roster/rules";
import { autofillWeek, buildFamiliarity, famOf, planCostCut, shiftCost, type CostMove, type RankContext, type RankMode } from "../lib/roster/candidates";
import { ShiftPanel, dayLabel } from "./roster/ShiftPanel";
import { AbsencePanel, ChangeLogPanel, ChecksPanel, HoursCostPanel, MatrixPanel, RulesPanel, WeekGrid, type ChannelRow } from "./roster/panels";
import { NextDesk, NowDesk, nextMonthOf, useRosterDesk, type NowChannel } from "./roster/MonthDesk";
import { MonthStrip, fmtWhen, type MonthAction, type MonthCard } from "./roster/MonthStrip";
import { monthStatus } from "../lib/roster/monthStatus";
import { OpenMonthWizard } from "./roster/OpenMonthWizard";
import { MonthPlanPanel } from "./roster/MonthPlanPanel";
import { WorkloadTable } from "./roster/WorkloadTable";
import { DEFAULT_BOUNDS, GOALS, GOAL_HINT, GOAL_LABEL, applyPlanRows, buildHostPerformance, daysInMonth, planMonth, releaseAutoFilled, type AutoFill, type MonthBounds, type PlanGoal } from "../lib/roster/monthPlanner";
import { platformOf } from "../lib/reportPlatform";
import type { EngineParams } from "../lib/scheduling/engineParams";
import type { ReportPlatform } from "../lib/reportPlatform";

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
  onOpenMonthPlan?: (brandId: string, platform: ReportPlatform) => void;
  onOpenCrm?: (brandId: string, platform: ReportPlatform) => void;
  /** Quyền manage_month_plan (0180) — nút mở Kế Hoạch Tháng ở màn "Mở lịch tháng sau". */
  canOpenMonthPlan?: boolean;
}

// Bản gọn (đợt 1, 25/10 — user chốt cả 4 điểm theo demo https://claude.ai/artifact/6YoM6U3rE89iGcSNESPUyq): bỏ 3 chế độ
// Tháng này / Tháng sau / Tuần và 6 tab con. Một màn: dải trạng thái theo tháng (MonthStrip) + "Việc cần làm" (mỗi việc một nút)
// + lưới tuần có giờ tháng cạnh mỗi kênh. Các màn phụ (Kiểm lịch, Báo nghỉ theo người, Ma trận kênh, Giờ & chi phí, Luật & nhật
// ký, giờ từng kênh tháng này, mở lịch tháng sau) mở dưới lưới từ menu "Thêm" hoặc từ nút của thẻ tháng.
type Section = "plan" | "now" | "next" | "checks" | "absence" | "matrix" | "hours" | "rules";
const MORE: { id: Section; label: string }[] = [
  { id: "plan", label: "Xếp cả tháng theo mục tiêu" },
  { id: "checks", label: "Kiểm lịch (mọi lỗi + cảnh báo)" },
  { id: "absence", label: "Báo nghỉ theo người" },
  { id: "matrix", label: "Ma trận kênh" },
  { id: "hours", label: "Giờ & chi phí" },
  { id: "rules", label: "Luật & nhật ký" },
  { id: "now", label: "Giờ từng kênh tháng này" },
  { id: "next", label: "Mở lịch tháng sau (từng kênh)" }
];
const SECTION_TITLE: Record<Section, string> = {
  plan: "Xếp cả tháng theo mục tiêu",
  now: "Giờ từng kênh tháng này",
  next: "Mở lịch tháng sau",
  checks: "Kiểm lịch",
  absence: "Báo nghỉ theo người",
  matrix: "Ma trận kênh",
  hours: "Giờ & chi phí",
  rules: "Luật & nhật ký"
};

interface Todo {
  key: string;
  tone: "bad" | "warn";
  text: string;
  sub?: string;
  action?: { label: string; run: () => void };
}

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
  const brandRules = useMemo(() => (p.talentRules && p.talentRules.length > 0 ? buildBrandRuleIndex(p.talentRules, (id) => p.brands.find((b) => b.id === id)?.name ?? "brand") : undefined), [p.talentRules, p.brands]);
  const analysis = useMemo(() => analyzeRoster(shifts, rules, weekStart, nameOf, familiar, brandRules), [shifts, rules, weekStart, nameOf, familiar, brandRules]);
  const hostPerf = useMemo(() => buildHostPerformance(p.sessions, getTodayDate()), [p.sessions]);
  const ctx: RankContext = useMemo(
    () => ({ shifts, rules, weekStart, fam, talents: p.talents, history: p.talentRateHistory, mode, nameOf, brandRules, perf: hostPerf }),
    [shifts, rules, weekStart, fam, p.talents, p.talentRateHistory, mode, nameOf, brandRules, hostPerf]
  );
  const wk = useMemo(() => shifts.filter((s) => s.date >= weekStart && s.date <= weekEnd), [shifts, weekStart, weekEnd]);

  const brandNameById = useMemo(() => new Map(p.brands.map((b) => [b.id, b.name])), [p.brands]);
  const channels: ChannelRow[] = useMemo(() => {
    const rows = new Map<string, ChannelRow>();
    for (const c of p.brandChannels) {
      if (c.status !== "active") continue;
      rows.set(channelKeyOf(c.brandId, c.platform), { key: channelKeyOf(c.brandId, c.platform), brandId: c.brandId, brandName: brandNameById.get(c.brandId) ?? "", platform: c.platform });
    }
    for (const s of wk) if (!rows.has(s.channelKey)) rows.set(s.channelKey, { key: s.channelKey, brandId: s.brandId, brandName: s.brandName, platform: s.platform });
    return [...rows.values()].sort((a, b) => a.brandName.localeCompare(b.brandName) || a.platform.localeCompare(b.platform));
  }, [p.brandChannels, brandNameById, wk]);

  const showCost = p.talents.some((t) => t.ratePerHour > 0 || t.assistantRatePerHour > 0 || t.ratePerSession > 0) || p.talentRateHistory.length > 0;
  const weekIssues = analysis.issues;
  const blocks = weekIssues.filter((i) => i.severity === "block");
  const warns = weekIssues.filter((i) => i.severity === "warn");
  const openShifts = wk.filter((s) => s.kind === "open");
  const draftedCount = openShifts.filter((s) => s.drafted).length;
  const overWeek = warns.filter((i) => i.code === "week_over");
  const outsideDrafts = openShifts.filter((s) => s.drafted && s.date.slice(0, 7) !== viewMonth).length;
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
  const m0 = desk.month, m1 = desk.next, m2 = nextMonthOf(m1);
  const wizardChannels = useMemo(
    () =>
      desk.nextRows.map((r) => ({
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
        const next: RosterDraft = { slotId: shift.slotId!, hostId: role === "host" ? talentId : shift.hostId, coHostId: role === "co_host" ? talentId : shift.coHostId };
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

  const doAutofill = () =>
    run(async () => {
      const res = autofillWeek(ctx);
      if (res.assignments.length === 0) {
        showToast(res.missed ? `Không xếp được ${res.missed} chỗ: không ai rảnh, quen kênh và không phạm luật` : "Tuần này không còn ca mở trống người");
        return;
      }
      const bySlot = new Map<string, RosterDraft>();
      for (const s of res.shifts) if (s.kind === "open" && s.slotId && res.assignments.some((a) => a.slotId === s.slotId)) bySlot.set(s.slotId, { slotId: s.slotId, hostId: s.hostId, coHostId: s.coHostId });
      await saveRosterDrafts([...bySlot.values()], p.currentUserId);
      setDrafts((prev) => [...prev.filter((d) => !bySlot.has(d.slotId)), ...bySlot.values()]);
      showToast(`Đã xếp ${res.assignments.length} chỗ vào nháp${res.missed ? `, còn ${res.missed} chỗ không ai đủ điều kiện` : ""}`);
    });

  const applyCost = () =>
    run(async () => {
      if (!costPlan) return;
      const rows = new Map<string, RosterDraft>();
      for (const m of costPlan.moves) {
        const s = costPlan.shifts.find((x) => x.key === m.shiftKey)!;
        rows.set(s.slotId!, { slotId: s.slotId!, hostId: s.hostId, coHostId: s.coHostId });
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
      const freed = releaseAutoFilled(buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(`${viewMonth}-01`, -7), addDays(monthEnd, 7)), auto, planRange);
      const plan = planMonth({ shifts: freed, month: viewMonth, today, goal: g, bounds, guaranteeMin: true, rules, talents: p.talents, history: p.talentRateHistory, fam, perf: buildHostPerformance(p.sessions, today), brandRules, range: planRange, minScale: planMinScale });
      const { rows, nextAuto } = applyPlanRows(plan, freed, auto, planRange);
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
      setPlanNote(`${GOAL_LABEL[g]} · ${planScopeLabel}: lấp ${plan.totals.plannedCount} chỗ vào nháp, còn ${plan.unfilled.length} chỗ trống${empty ? ` (${empty} chỗ chưa ai đăng ký)` : ""}. Nháp, talent chưa thấy.`);
    });
  // Tuần (Thứ 2) có nháp trong phạm vi đang chọn. Tuần nằm vắt qua ngày 15/cuối tháng được công bố TRỌN tuần (RPC công bố theo tuần).
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
      const noHost = p.shiftSlots.filter((sl) => sl.status === "open" && !sl.sessionId && rangeWeeks.some(([w]) => sl.date >= w && sl.date <= weekEndOf(w)) && drafts.some((d) => d.slotId === sl.id && !d.hostId));
      if (noHost.length > 0) {
        showToast(`Còn ${noHost.length} ca nháp chỉ có trợ, chưa có host (${noHost.slice(0, 3).map((sl) => `${sl.brandName} ${dayLabel(sl.date)}`).join(", ")}). Xếp host hoặc gỡ nháp ca đó rồi công bố lại.`);
        return;
      }
      const total = rangeWeeks.reduce((n, [, c]) => n + c, 0);
      const people = new Set<string>();
      for (const d of drafts) if (p.shiftSlots.some((sl) => sl.id === d.slotId && rangeWeeks.some(([w]) => sl.date >= w && sl.date <= weekEndOf(w)))) [d.hostId, d.coHostId].forEach((x) => x && people.add(x));
      const msg = [
        `Công bố ${rangeWeeks.length} tuần (${rangeWeeks.map(([w]) => `${dayLabel(w)}–${dayLabel(weekEndOf(w))}`).join("; ")})?`,
      // 0206: quá giờ tuần chỉ cảnh báo — liệt kê từng tuần/người trước khi công bố.
      const overLines = rangeWeeks.flatMap(([w]) =>
        analyzeRoster(buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(w, -7), addDays(w, 7)), rules, w, nameOf, undefined, brandRules)
          .issues.filter((i) => i.code === "week_over")
          .map((i) => `tuần ${dayLabel(w)}: ${i.text.replace(/ có (.+) trong tuần.*/, " $1")}`)
      );
        `${total}+ ca nháp thành ca thật; khoảng ${people.size} host/trợ nhận tin (mỗi người một tin cho mỗi tuần).`,
        "Tuần vắt qua ngày cuối của phạm vi được công bố trọn tuần, gồm cả nháp ngoài phạm vi.",
        overLines.length > 0 ? `⚠ Quá ${rules.maxWeekHours} giờ/tuần (không chặn): ${overLines.join("; ")}.` : ""
      ]
        .filter(Boolean)
        .join("\n");
      if (!(await confirm(msg, { confirmLabel: `Công bố ${rangeWeeks.length} tuần` }))) return;
      let published = 0;
      let notified = 0;
      for (const [w] of rangeWeeks) {
        try {
          const r = await publishRosterWeek(w);
          published += r.published;
          notified += r.notified;
        } catch (e) {
          await Promise.all([p.onScheduleChanged(), reloadRoster()]);
          showToast(`Dừng ở tuần ${dayLabel(w)}: ${errorMessage(e)}. Đã công bố ${published} ca của các tuần trước đó.`);
          return;
        }
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
      showToast(`Đã công bố ${published} ca của ${rangeWeeks.length} tuần, gửi ${notified} tin cho host/trợ`);
    });
  // Khối lượng từng người theo lịch + nháp HIỆN CÓ (không xếp thêm), tính tới hết phạm vi đang chọn (1–15 hoặc cả tháng).
  const workload = useMemo(() => {
    const monthShifts = buildRosterShifts(p.sessions, p.shiftSlots, drafts, p.shiftRegistrations, addDays(`${viewMonth}-01`, -7), addDays(`${viewMonth}-31`, 7));
    return planMonth({ shifts: monthShifts, month: viewMonth, today, goal, bounds, guaranteeMin: false, rules, talents: p.talents, history: p.talentRateHistory, fam: new Map(), perf: buildHostPerformance(p.sessions, today), brandRules, minScale: planMinScale, reportOnly: true, loadTo: planRange.to });
  }, [p.sessions, p.shiftSlots, p.shiftRegistrations, drafts, viewMonth, today, goal, bounds, rules, p.talents, p.talentRateHistory, brandRules, planMinScale, planRange.to]);
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
        outsideDrafts > 0 ? `Công bố theo tuần nên gồm cả ${outsideDrafts} ca nháp ngoài tháng ${Number(viewMonth.slice(5))} (ngày đang ẩn trên lưới).` : "",
        holes > 0 ? `${holes} ca mở chưa có host sẽ vẫn mở (không công bố).` : "",
        // 0206: quá giờ tuần chỉ cảnh báo — nêu đích danh để người công bố nhìn thấy trước khi bấm.
        overWeek.length > 0 ? `⚠ Quá ${rules.maxWeekHours} giờ/tuần (không chặn): ${overWeek.map((i) => i.text.replace(/ có (.+) trong tuần.*/, " $1")).join("; ")}.` : "",
        warns.length - overWeek.length > 0 ? `Còn ${warns.length - overWeek.length} cảnh báo khác (không chặn).` : ""
      ]
        .filter(Boolean)
        .join("\n");
      if (!(await confirm(msg, { confirmLabel: "Công bố" }))) return;
      const r = await publishRosterWeek(weekStart);
      await Promise.all([p.onScheduleChanged(), reloadRoster()]);
      showToast(`Đã công bố ${r.published} ca, gửi ${r.notified} tin cho host/trợ`);
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
  /** Thêm ca cho kênh thiếu giờ: ca tốt nhất còn trống theo bộ xếp ca của Kế Hoạch Tháng (06/11); kênh chưa có lịch sử thì như cũ —
   *  ngày còn lại kênh ít ca nhất, giờ 19:00. Người dùng vẫn sửa giờ trước khi tạo. */
  const addShiftFor = (r: NowChannel) => {
    const ch = { key: channelKeyOf(r.brandId, r.platform), brandId: r.brandId, brandName: r.brandName, platform: r.platform as ChannelRow["platform"] };
    const next = suggestNextShift(p.sessions, p.shiftSlots, r.brandId, r.platform as ReportPlatform, m0, today, p.engineParams);
    if (next) {
      goWeekOf(next.date);
      void addShift(ch, next.date, { start: next.startTime, end: next.endTime, note: `Gợi ý: ${next.startTime}–${next.endTime} — khung còn trống hiệu quả nhất theo lịch sử kênh (dự báo ~${fmtVndShort(next.expectedGmv)}).` });
      return;
    }
    const end = `${m0}-${String(monthEndDay(m0)).padStart(2, "0")}`;
    let best: string | null = null;
    let bestN = Infinity;
    for (let d = today; d <= end; d = addDays(d, 1)) {
      const n =
        p.sessions.filter((s) => s.brandId === r.brandId && platformOf(s) === r.platform && s.date === d && s.status !== "Cancelled").length +
        p.shiftSlots.filter((sl) => sl.brandId === r.brandId && platformOf(sl) === r.platform && sl.date === d && sl.status === "open" && !sl.sessionId).length;
      if (n < bestN) {
        best = d;
        bestN = n;
      }
    }
    if (!best) return;
    goWeekOf(best);
    void addShift(ch, best);
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
    if (kind === "now") openSection("now");
    else if (kind === "next") {
      if (month === m1) openWizard();
      else openSection("next");
    }
    else if (kind === "nudge") nudge(month);
    else if (kind === "staff") {
      const first = p.shiftSlots
        .filter((sl) => sl.date.slice(0, 7) === month && sl.date >= today && sl.status === "open" && !sl.sessionId && !drafts.find((d) => d.slotId === sl.id)?.hostId)
        .map((sl) => sl.date)
        .sort()[0];
      if (first) goWeekOf(first);
    } else if (kind === "publish") {
      const w = statusOf(month).weeksToPublish[0];
      if (w) goWeekOf(w);
    }
  };

  const todos: Todo[] = [];
  if (blocks.length > 0)
    todos.push({ key: "blocks", tone: "bad", text: `${blocks.length} lỗi chặn công bố ở tuần đang xem.`, sub: blocks[0].text, action: { label: "Xem ca", run: () => setSelectedKey(blocks[0].shiftKey) } });
  const mNext = `tháng ${Number(m1.slice(5))}`;
  if (st1.phase === "none" && !desk.loading)
    todos.push({ key: "next", tone: "bad", text: `${mNext[0].toUpperCase()}${mNext.slice(1)} bắt đầu sau ${daysToNext} ngày, chưa mở ca nào.`, sub: `${noCommitNext}/${desk.nextRows.length} kênh chưa có giờ cam kết.`, action: { label: `Mở lịch ${mNext}`, run: openWizard } });
  else if (st1.phase === "no_deadline")
    todos.push({ key: "next", tone: "warn", text: `${mNext[0].toUpperCase()}${mNext.slice(1)} đang nhận đăng ký (chưa đặt hạn): ${st1.slotsWithSignup}/${st1.openSlots} ca có người báo rảnh.`, sub: `${st1.noHost} ca chưa có host. Đặt hạn là tuỳ chọn — chốt miệng với talent cũng được.`, action: { label: "Đặt hạn (không bắt buộc)", run: openWizard } });
  else if (st1.phase === "signup")
    todos.push({ key: "next", tone: "warn", text: `${mNext[0].toUpperCase()}${mNext.slice(1)} đang nhận đăng ký tới ${fmtWhen(st1.deadline!)}: ${st1.slotsWithSignup}/${st1.openSlots} ca có người báo rảnh.`, action: { label: "Chép tin nhắc người chưa đăng ký", run: () => nudge(m1) } });
  else if (st1.phase === "staff")
    todos.push({ key: "next", tone: "bad", text: `${mNext[0].toUpperCase()}${mNext.slice(1)}: còn ${st1.noHost} ca mở chưa có host.`, sub: `${st1.noHostWithSignup} ca có người báo rảnh. Mỗi tuần bấm Tự xếp người rồi Công bố.`, action: { label: "Tới tuần còn trống", run: () => onMonthAction("staff", m1) } });
  else if (st1.phase === "publish")
    todos.push({ key: "next", tone: "warn", text: `${mNext[0].toUpperCase()}${mNext.slice(1)}: ${st1.weeksToPublish.length} tuần có ca nháp chưa công bố.`, action: { label: "Tới tuần chưa công bố", run: () => onMonthAction("publish", m1) } });
  // Mốc chốt lịch từng đợt (0200, user chốt 06/11: chốt ca 1–15 ngày 15, ca 16–cuối ngày 25 tháng trước). Nhắc từ 2 ngày trước mốc.
  for (const h of st1.halves) {
    if (!h.publishBy || (h.noHost === 0 && h.toPublish === 0) || addDays(h.publishBy, -2) > today) continue;
    const when = h.publishBy < today ? `đã quá hạn chốt ${dayLabel(h.publishBy)}` : h.publishBy === today ? "hôm nay phải chốt" : `chốt trước ${dayLabel(h.publishBy)}`;
    const firstWeek = h.weeksToPublish[0];
    todos.push({
      key: `half-${h.half}`,
      tone: h.publishBy <= today ? "bad" : "warn",
      text: `Lịch đợt ${h.half} ${mNext} (ca ${halfRange(m1, h.half)}) ${when}: ${[h.noHost > 0 ? `${h.noHost} ca chưa có host` : "", h.toPublish > 0 ? `${h.toPublish} ca nháp chưa công bố` : ""].filter(Boolean).join(", ")}.`,
      action: h.noHost > 0 && h.firstNoHostDate ? { label: "Tới tuần còn trống", run: () => goWeekOf(h.firstNoHostDate!) } : firstWeek ? { label: "Tới tuần chưa công bố", run: () => goWeekOf(firstWeek) } : undefined
    });
  }
  for (const r of short.slice(0, 3))
    todos.push({
      key: `short-${r.brandId}-${r.platform}`,
      tone: "bad",
      text: `${r.brandName} ${r.platform} ${r.verdict!.text} tháng này.`,
      sub: r.committed > 0 ? `Để đủ ${Math.round(r.committed)} giờ cam kết, đã gồm phòng hờ.` : "Không cam kết giờ; Dashboard dự báo thêm giờ là kịp target.",
      action: !readOnly && daysLeft > 0 ? { label: "Thêm ca", run: () => addShiftFor(r) } : undefined
    });
  if (short.length > 3) todos.push({ key: "short-more", tone: "warn", text: `Và ${short.length - 3} kênh khác thiếu giờ tháng này.`, action: { label: "Xem giờ từng kênh", run: () => openSection("now") } });
  for (const s of wk.filter((x) => x.kind === "session" && !x.hostId && x.date >= today).slice(0, 3))
    todos.push({ key: `hole-${s.key}`, tone: "bad", text: `${s.brandName} ${s.platform} ${dayLabel(s.date)} ${s.startTime} chưa có host.`, action: { label: "Chọn host", run: () => setSelectedKey(s.key) } });
  const seenClash = new Set<string>();
  for (const i of weekIssues.filter((x) => x.code === "clash" && x.severity === "warn")) {
    const s = wk.find((x) => x.key === i.shiftKey);
    const k = `${i.talentId}|${s?.date}`;
    if (!s || seenClash.has(k) || seenClash.size >= 2) continue;
    seenClash.add(k);
    todos.push({ key: `clash-${i.shiftKey}-${i.talentId}`, tone: "warn", text: `${s.brandName} ${s.platform} ${dayLabel(s.date)} ${s.startTime}: ${i.text.replace(" — ca đã lên lịch từ trước, không chặn công bố", "")}.`, sub: "Lịch nhập từ Sheet nên không chặn. Đổi một ca nếu không cố ý.", action: { label: "Xem ca", run: () => setSelectedKey(s.key) } });
  }
  const noCoShifts = wk.filter((s) => s.kind === "session" && s.hostId && !s.coHostId && s.date >= today && !s.segmented);
  if (noCoShifts.length > 0)
    todos.push({ key: "noco", tone: "warn", text: `${noCoShifts.length} ca tuần này chưa có trợ live.`, sub: "Ca không có trợ thì OP giao ca. Bấm để xếp lần lượt.", action: { label: "Xếp ca đầu tiên", run: () => setSelectedKey(noCoShifts[0].key) } });
  const openNoHost = openShifts.filter((s) => !s.hostId).length;
  if (openNoHost > 0 && !(viewMonth === m1 && st1.phase === "signup"))
    todos.push({ key: "open", tone: "warn", text: `${openNoHost} ca mở tuần này chưa có người.`, sub: "Tự xếp ưu tiên người đã báo rảnh, rồi người quen kênh, giờ tuần thấp.", action: readOnly ? undefined : { label: "Tự xếp người vào chỗ trống", run: doAutofill } });
  if (draftedCount > 0 && blocks.length === 0)
    todos.push({ key: "pub", tone: "warn", text: `${draftedCount} ca nháp tuần này chưa công bố.`, sub: "Công bố xong mỗi host/trợ nhận một tin.", action: readOnly ? undefined : { label: "Công bố", run: publish } });
  // Ô tự fill có người đã rút đăng ký sau đó (talent bấm huỷ đăng ký): nháp còn giữ người không còn rảnh.
  const staleAuto = Object.entries(auto).filter(([slotId, a]) => {
    const d = drafts.find((x) => x.slotId === slotId);
    if (!d || !p.shiftSlots.some((sl) => sl.id === slotId && sl.status === "open" && !sl.sessionId)) return false;
    const regs = p.shiftRegistrations.filter((r) => r.slotId === slotId).map((r) => r.talentId);
    return (!!a.hostId && d.hostId === a.hostId && !regs.includes(a.hostId)) || (!!a.coHostId && d.coHostId === a.coHostId && !regs.includes(a.coHostId));
  }).length;
  if (staleAuto > 0)
    todos.push({ key: "stale-auto", tone: "warn", text: `${staleAuto} ca nháp tự fill có người đã rút đăng ký.`, sub: `Bấm để xếp lại theo mục tiêu ${GOAL_LABEL[goal]} (ô bạn xếp tay không đổi).`, action: readOnly ? undefined : { label: "Xếp lại", run: () => void pickGoal(goal) } });
  const cannot = desk.nowRows.filter((r) => r.row.rescue.kind === "cannot" && r.row.rescue.needRate != null && r.row.rescue.nowRate != null);
  if (cannot.length > 0) {
    const lines = cannot.map((r) => `${r.brandName} ${r.platform} cần ${fmtVndShort(r.row.rescue.needRate!)}/giờ, đang ${fmtVndShort(r.row.rescue.nowRate!)}/giờ`);
    todos.push({
      key: "boss",
      tone: "warn",
      text: `${cannot.map((r) => `${r.brandName} ${r.platform}`).join(", ")}: thêm giờ cũng không kịp target tháng này.`,
      sub: "Giờ cam kết vẫn xếp đủ; báo quản lý để nói với brand.",
      action: { label: "Chép tin báo quản lý", run: () => void copyText(`Dự báo hụt target tháng ${Number(m0.slice(5))} dù thêm giờ: ${lines.join("; ")}.`, "Đã chép tin — dán vào Zalo cho quản lý") }
    });
  }

  const publishLabel = blocks.length > 0 ? `Công bố · ${blocks.length} lỗi` : draftedCount > 0 ? `Công bố ${draftedCount} ca nháp` : "Không có nháp";

  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        title="Điều Phối Lịch Live"
        description="Một màn cho lịch live mọi brand: trạng thái từng tháng, việc cần làm, lịch tuần với giờ tháng cạnh mỗi kênh."
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
            <button type="button" disabled={readOnly || busy || blocks.length > 0 || draftedCount === 0} onClick={publish} title={blocks.length > 0 ? "Còn lỗi chặn — bấm ca viền đỏ để sửa" : draftedCount === 0 ? "Ca đã lên lịch không cần công bố; chỉ ca nháp mới cần" : undefined} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-contrast)] text-xs font-black disabled:opacity-40">
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
              </div>
            </details>
          </>
        }
      >
        {backendMissing && <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2">Chưa chạy migration 0175 + 0176 trên DB: màn chỉ xem được lịch đã có, chưa đặt hạn / xếp nháp / công bố được.</p>}
        {loadError && <p className="text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">Không tải được dữ liệu Điều Phối Lịch Live: {loadError}</p>}
        {desk.commitError && <p className="text-xs text-amber-300">Không đọc được cam kết hợp đồng — giờ cam kết để trống.</p>}
      </PageHeader>

      <MonthStrip cards={monthCards} viewMonth={viewMonth} today={today} onAction={onMonthAction} />

      <div className="space-y-3">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-2 sm:p-3 min-w-0">
          <div className="mb-3 space-y-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] px-3 py-2" aria-label="Tự fill nháp theo mục tiêu">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
              <span className="font-black text-[var(--text)]">Tự fill nháp</span>
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
              <span className="text-[var(--text-muted)]">tháng {Number(viewMonth.slice(5))} · mục tiêu</span>
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
              <button type="button" disabled={readOnly || busy || rangeWeeks.length === 0} onClick={() => void publishRange()} title="Công bố lần lượt mọi tuần có nháp trong phạm vi đang chọn, chỉ một hộp xác nhận" className="ml-auto px-2.5 py-1 rounded-lg bg-[var(--accent)] text-[var(--accent-contrast)] font-black disabled:opacity-40">
                {rangeWeeks.length > 0 ? `Công bố ${rangeWeeks.length} tuần` : "Không có nháp để công bố"}
              </button>
              <button type="button" disabled={readOnly || busy || Object.keys(auto).length === 0} onClick={() => void clearAuto()} title="Gỡ người do bộ xếp đã fill trong phạm vi đang chọn; ô bạn xếp tay được giữ" className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-40">
                Gỡ phần tự fill
              </button>
              <button type="button" onClick={() => openSection("plan")} className="px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]">
                So sánh 3 mục tiêu
              </button>
            </div>
            <p className="text-2xs text-[var(--text-muted)]">{planNote ?? "Chỉ lấy người đã đăng ký đúng ca, giữ giờ tối thiểu/tối đa và luật lịch. Bấm là ghi NHÁP ngay, talent chưa thấy; ô bạn tự xếp không bị ghi đè."}</p>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs" aria-label="Tuần trong tháng">
            <span className="font-black text-[var(--text)]">Tháng {Number(viewMonth.slice(5))} · tuần</span>
            <div className="flex flex-wrap items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 font-bold" role="group">
              {monthWeeks.map((w) => (
                <button key={w.start} type="button" aria-pressed={weekStart === w.start} onClick={() => goWeekOf(w.start < `${viewMonth}-01` ? `${viewMonth}-01` : w.start)} className={`px-2.5 py-1 rounded-lg tabular-nums ${weekStart === w.start ? "seg-on" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>
                  {w.label}
                </button>
              ))}
            </div>
            {!monthWeeks.some((w) => w.start === weekStart) && <span className="text-amber-300">Tuần {dayLabel(weekStart)} – {dayLabel(weekEnd)} không thuộc tháng này — chọn một tuần.</span>}
          </div>
          <WeekGrid weekStart={weekStart} month={viewMonth} channels={channels} shifts={wk} analysis={analysis} nameOf={nameOf} selectedKey={selectedKey} canAdd={!readOnly} onSelect={setSelectedKey} onAdd={addShift} channelMeta={channelMeta} />
        </div>
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 space-y-2" aria-label="Khối lượng nhân sự">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-black text-[var(--text)]">Khối lượng nhân sự · {planScopeLabel}</h2>
            <span className="text-2xs text-[var(--text-muted)]">
              {workload.totals.below} dưới tối thiểu · {workload.totals.over} vượt tối đa · tính theo ca đã lên lịch + nháp hiện có
            </span>
          </div>
          <p className="text-2xs text-[var(--text-muted)]">Thanh: đậm = ca đã lên lịch, nhạt = nháp chưa công bố; vạch đứng = giờ tối thiểu (đảm bảo thu nhập), cuối thanh = giờ tối đa.</p>
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
        </section>
        <aside className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 space-y-2" aria-label="Việc cần làm">
          <h2 className="flex items-baseline justify-between gap-2 text-sm font-black text-[var(--text)]">
            Việc cần làm
            <span className="text-2xs font-medium text-[var(--text-muted)]">{desk.loading ? "đang tính…" : todos.length ? `${todos.length} việc` : "không còn việc"}</span>
          </h2>
          {todos.length === 0 && !desk.loading && <p className="text-xs text-[var(--text-muted)]">Tuần đang xem và tháng sau không còn việc gì cần làm.</p>}
          <div className="grid gap-2 sm:grid-cols-2 max-h-[232px] overflow-y-auto pr-1">
          {todos.map((t) => (
            <div key={t.key} className={`rounded-xl border border-[var(--border)] border-l-[3px] ${t.tone === "bad" ? "border-l-rose-500" : "border-l-amber-400"} bg-[var(--surface-base)] px-3 py-2 space-y-1.5`}>
              <p className="text-xs text-[var(--text)]">{t.text}</p>
              {t.sub && <p className="text-2xs text-[var(--text-muted)]">{t.sub}</p>}
              {t.action && (
                <button type="button" disabled={busy} onClick={t.action.run} className="text-xs font-bold px-2.5 py-1 rounded-lg border border-[var(--accent)]/60 bg-[var(--accent)]/10 text-[var(--text)] hover:bg-[var(--accent)]/20 disabled:opacity-40">
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
          </div>
        </aside>
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
            {section === "now" && <NowDesk {...deskProps} />}
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
          onMove={(s, v) => void move(s, v)}
          onRemove={(s) => void remove(s)}
          onMode={changeMode}
        />
      )}
    </div>
  );
};
