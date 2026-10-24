import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, MessageSquareText, Send, Wand2 } from "lucide-react";
import type { Brand, BrandChannel, BrandStudio, LiveSession, ShiftRegistration, ShiftSlot, Studio, Talent, TalentRateHistoryEntry, UserRole } from "../types";
import { PageHeader } from "./common/PageHeader";
import { useToast } from "../hooks/useToast";
import { useConfirm, usePrompt } from "../hooks/useConfirm";
import { errorMessage } from "../lib/errorMessage";
import { fmtVndShort } from "../lib/format";
import { talentShortName } from "../lib/talentName";
import { addDays, getTodayDate, isoWeekStart } from "../lib/dateUtils";
import { weekScheduleMessage } from "../lib/talent/agenda";
import { updateOpenSlotTime } from "../lib/db/shiftSlots";
import {
  fetchRosterChanges,
  fetchRosterDrafts,
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
  type RosterWeek
} from "../lib/db/roster";
import { analyzeRoster, buildRosterShifts, channelKeyOf, shiftHours, DEFAULT_ROSTER_RULES, type RosterRole, type RosterRules, type RosterShift } from "../lib/roster/rules";
import { autofillWeek, buildFamiliarity, famOf, planCostCut, shiftCost, type CostMove, type RankContext, type RankMode } from "../lib/roster/candidates";
import { ShiftPanel, dayLabel } from "./roster/ShiftPanel";
import { AbsencePanel, ChangeLogPanel, ChecksPanel, HoursCostPanel, MatrixPanel, RulesPanel, WeekGrid, type ChannelRow } from "./roster/panels";
import { NextDesk, NowDesk } from "./roster/MonthDesk";
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
  /** Quyền manage_month_plan (0180) — nút mở Kế Hoạch Tháng ở tab Tháng sau. */
  canOpenMonthPlan?: boolean;
}

type View = "now" | "next" | "week";
const VIEWS: { id: View; label: string }[] = [
  { id: "now", label: "Tháng này" },
  { id: "next", label: "Tháng sau" },
  { id: "week", label: "Tuần" }
];
const loadView = (): View => {
  try {
    const v = localStorage.getItem("roster.view");
    return v === "next" || v === "week" ? v : "now";
  } catch {
    return "now";
  }
};

type Tab = "grid" | "checks" | "absence" | "matrix" | "hours" | "rules";
const TABS: { id: Tab; label: string }[] = [
  { id: "grid", label: "Lịch tuần" },
  { id: "checks", label: "Kiểm lịch" },
  { id: "absence", label: "Báo nghỉ" },
  { id: "matrix", label: "Ma trận kênh" },
  { id: "hours", label: "Giờ & chi phí" },
  { id: "rules", label: "Luật & nhật ký" }
];

const STAFF: UserRole[] = ["ceo", "admin", "operations", "trainer"];
const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");
const fmtDeadline = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getDate()}/${d.getMonth() + 1}`;
};
const loadMode = (): RankMode => {
  try {
    return localStorage.getItem("roster.mode") === "cost" ? "cost" : "balance";
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
  const [tab, setTab] = useState<Tab>("grid");
  const [view, setViewState] = useState<View>(loadView);
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem("roster.view", v);
    } catch {
      /* nhớ chế độ chỉ là tiện ích */
    }
  };
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
    if (tab !== "rules") return;
    let cancelled = false;
    fetchRosterChanges(new Date(Date.now() - 30 * 86400000).toISOString())
      .then((c) => !cancelled && setChanges(c))
      .catch(() => !cancelled && setChanges([]));
    return () => {
      cancelled = true;
    };
  }, [tab, changesNonce]);

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
  const week = weeks.find((w) => w.weekStart === weekStart);
  const goWeek = (delta: number) => {
    setWeekStart(addDays(weekStart, delta));
    setSelectedKey(null);
    setCostPlan(null);
  };

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
  const analysis = useMemo(() => analyzeRoster(shifts, rules, weekStart, nameOf, familiar), [shifts, rules, weekStart, nameOf, familiar]);
  const ctx: RankContext = useMemo(
    () => ({ shifts, rules, weekStart, fam, talents: p.talents, history: p.talentRateHistory, mode, nameOf }),
    [shifts, rules, weekStart, fam, p.talents, p.talentRateHistory, mode, nameOf]
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
  const noHost = wk.filter((s) => !s.hostId).length;
  const noCo = wk.filter((s) => !s.coHostId).length;
  const weekCost = wk.reduce((s, x) => s + shiftCost(x, p.talents, p.talentRateHistory).amount, 0);
  const costMissing = wk.filter((x) => shiftCost(x, p.talents, p.talentRateHistory).missing).length;
  const thin = channels.filter((ch) => {
    const list = wk.filter((s) => s.channelKey === ch.key);
    return list.length > 0 && new Set(list.map((s) => s.hostId).filter(Boolean)).size <= 3;
  });
  const registrantCount = new Set(openShifts.flatMap((s) => s.registrants)).size;
  const selected = selectedKey ? shifts.find((s) => s.key === selectedKey) ?? null : null;

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

  const addShift = (ch: ChannelRow, date: string) =>
    run(async () => {
      const start = await prompt(`Thêm ca ${ch.brandName} ${ch.platform} ${dayLabel(date)} — giờ bắt đầu`, { inputType: "time", defaultValue: "19:00" });
      if (!start) return;
      const end = await prompt(`Giờ kết thúc (bắt đầu ${start})`, { inputType: "time", defaultValue: `${String((Number(start.slice(0, 2)) + 3) % 24).padStart(2, "0")}:${start.slice(3, 5)}` });
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
        showToast(res.missed ? `Không lấp được ${res.missed} chỗ: không ai rảnh, quen kênh và không phạm luật` : "Tuần này không còn ca mở trống người");
        return;
      }
      const bySlot = new Map<string, RosterDraft>();
      for (const s of res.shifts) if (s.kind === "open" && s.slotId && res.assignments.some((a) => a.slotId === s.slotId)) bySlot.set(s.slotId, { slotId: s.slotId, hostId: s.hostId, coHostId: s.coHostId });
      await saveRosterDrafts([...bySlot.values()], p.currentUserId);
      setDrafts((prev) => [...prev.filter((d) => !bySlot.has(d.slotId)), ...bySlot.values()]);
      showToast(`Đã lấp ${res.assignments.length} chỗ vào nháp${res.missed ? `, còn ${res.missed} chỗ không ai đủ điều kiện` : ""}`);
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

  const publish = () =>
    run(async () => {
      const holes = openShifts.filter((s) => !s.hostId).length;
      const msg = [
        `Công bố lịch tuần ${dayLabel(weekStart)} – ${dayLabel(weekEnd)}?`,
        `${draftedCount} ca nháp sẽ thành ca thật, mỗi host/trợ nhận MỘT tin liệt kê ca của mình.`,
        holes > 0 ? `${holes} ca mở chưa có host sẽ vẫn mở (không công bố).` : "",
        warns.length > 0 ? `Còn ${warns.length} cảnh báo (không chặn).` : ""
      ]
        .filter(Boolean)
        .join("\n");
      if (!(await confirm(msg, { confirmLabel: "Công bố" }))) return;
      const r = await publishRosterWeek(weekStart);
      await Promise.all([p.onScheduleChanged(), reloadRoster()]);
      showToast(`Đã công bố ${r.published} ca, gửi ${r.notified} tin cho host/trợ`);
    });

  // Tin Zalo cho nhóm host/trợ (app talent bản 2, 16/10): ca ĐÃ CHỐT của tuần đang xem theo từng người + link vào thẳng "Ca của
  // tôi" để bấm "Đã xem". Không cần đã công bố qua Điều Phối Lịch Live — lịch xếp từ Google Sheet (ca thật) cũng chép được.
  const copyZalo = async () => {
    const text = weekScheduleMessage(p.sessions, weekStart, weekEnd, p.talents, `${window.location.origin}/ca-cua-toi`);
    try {
      await navigator.clipboard.writeText(text);
      showToast("Đã chép tin lịch tuần — dán vào nhóm Zalo");
    } catch {
      showToast("Trình duyệt chặn chép — thử lại bằng Chrome/Safari bản mới");
    }
  };

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


  return (
    <div className="space-y-4">
      <PageHeader
        icon={ClipboardList}
        title="Điều Phối Lịch Live"
        description="Lịch live của mọi brand: giữ đủ giờ cam kết (tính cả giờ phòng hờ), mở lịch tháng sau theo cam kết, xếp người và công bố lịch tuần."
        actions={
          <>
            <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 text-xs font-bold" role="tablist" aria-label="Chế độ xem">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`px-3 py-1.5 rounded-lg ${view === v.id ? "seg-on" : "text-[var(--text-muted)]"}`}>
                  {v.label}
                </button>
              ))}
            </div>
            {view === "week" && (
            <>
            <div className="flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1">
              <button type="button" onClick={() => goWeek(-7)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tuần trước">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 text-xs font-bold text-[var(--text)] whitespace-nowrap">
                {dayLabel(weekStart)} – {dayLabel(weekEnd)}
              </span>
              <button type="button" onClick={() => goWeek(7)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Tuần sau">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface-base)] p-1 text-xs font-bold" role="group" aria-label="Ưu tiên khi gợi ý người">
              {(
                [
                  ["balance", "Cân bằng"],
                  ["cost", "Chi phí thấp"]
                ] as const
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={mode === k} onClick={() => changeMode(k)} className={`px-3 py-1.5 rounded-lg ${mode === k ? "seg-on" : "text-[var(--text-muted)]"}`}>
                  {l}
                </button>
              ))}
            </div>
            <button type="button" disabled={readOnly || busy || openShifts.length === 0} onClick={doAutofill} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)] disabled:opacity-40">
              <Wand2 className="w-4 h-4" /> Tự lấp chỗ trống
            </button>
            <button type="button" onClick={copyZalo} title="Chép lịch đã chốt của tuần này theo từng người, kèm link vào app" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text)]">
              <MessageSquareText className="w-4 h-4" /> Chép tin Zalo
            </button>
            <button type="button" disabled={readOnly || busy || blocks.length > 0 || draftedCount === 0} onClick={publish} title={blocks.length > 0 ? "Còn lỗi chặn — xem tab Kiểm lịch" : draftedCount === 0 ? "Chưa có ca nháp nào" : undefined} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--accent)] text-white text-xs font-black disabled:opacity-40">
              <Send className="w-4 h-4" /> Công bố tuần
            </button>
            </>
            )}
          </>
        }
      >
        {backendMissing && <p className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2">Chưa chạy migration 0175 + 0176 trên DB: màn chỉ xem được lịch đã có, chưa đặt hạn / xếp nháp / công bố được.</p>}
        {loadError && <p className="text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2">Không tải được dữ liệu Điều Phối Lịch Live: {loadError}</p>}
        {view === "week" && (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2 text-xs">
          <span className={`px-2 py-1 rounded-full font-bold ${week?.publishedAt ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>
            {week?.publishedAt ? `Đã công bố ${fmtDeadline(week.publishedAt)}` : "Chưa công bố"}
          </span>
          <span className="text-[var(--text-muted)]">
            {openShifts.length} ca mở · {draftedCount} nháp · {registrantCount} người đã báo rảnh
          </span>
          {!week?.publishedAt && openShifts.length === 0 && <span className="text-[var(--text-muted)]">Tuần này không có ca mở — các ca đã lên lịch từ trước; đổi người / dời ca ở thẻ ca (có ghi lý do).</span>}
          {!week?.publishedAt && openShifts.length > 0 && (
            <span className="text-[var(--text-muted)]">
              Hạn đăng ký đặt một lần cho cả tháng ở{" "}
              <button type="button" onClick={() => setView("next")} className="font-bold text-[var(--accent-text)] hover:underline">
                Tháng sau
              </button>
              .
            </span>
          )}
        </div>
        )}
      </PageHeader>

      {view !== "week" && (() => {
        const desk = {
          today: getTodayDate(),
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
        return view === "now" ? <NowDesk {...desk} /> : <NextDesk {...desk} registrations={p.shiftRegistrations} drafts={drafts} weeks={weeks} />;
      })()}

      {view === "week" && (
      <>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-5">
        {[
          { v: `${wk.length} ca · ${fmtH(wk.reduce((s, x) => s + shiftHours(x), 0))}h`, l: "Lịch tuần (ca thật + ca mở)", tone: "" },
          { v: `${noHost} / ${noCo}`, l: "Ca thiếu host / thiếu trợ", tone: noHost ? "text-red-400" : noCo ? "text-amber-400" : "text-emerald-400" },
          { v: `${blocks.length} · ${warns.length}`, l: "Lỗi chặn · cảnh báo", tone: blocks.length ? "text-red-400" : warns.length ? "text-amber-400" : "text-emerald-400" },
          showCost
            ? { v: weekCost > 0 ? fmtVndShort(weekCost) : "—", l: `Chi phí người theo lịch${costMissing ? ` (${costMissing} ca thiếu rate)` : ""}`, tone: "" }
            : { v: "Chưa có rate", l: "Nhập rate ở Talent Pool để tính chi phí ca", tone: "text-[var(--text-muted)]" },
          { v: thin.length ? thin.map((c) => `${c.brandName} ${c.platform}`).join(", ") : "không", l: "Kênh dùng ≤ 3 host tuần này", tone: thin.length ? "text-amber-400" : "text-emerald-400" }
        ].map((k) => (
          <div key={k.l} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 min-w-0">
            <p className={`text-base font-black font-mono truncate ${k.tone || "text-[var(--text)]"}`}>{k.v}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{k.l}</p>
          </div>
        ))}
      </div>

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl">
        <div className="flex gap-1 px-2 border-b border-[var(--border)] overflow-x-auto" role="tablist">
          {TABS.map((t) => {
            const n = t.id === "checks" ? blocks.length : 0;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 ${tab === t.id ? "border-[var(--accent)] text-[var(--text)] font-bold" : "border-transparent text-[var(--text-muted)]"}`}>
                {t.label}
                {n > 0 && <span className="ml-1.5 px-1.5 rounded-full bg-red-500/20 text-red-300 text-xs font-bold">{n}</span>}
              </button>
            );
          })}
        </div>
        <div className="p-3 sm:p-4">
          {tab === "grid" && (
            <WeekGrid weekStart={weekStart} channels={channels} shifts={wk} analysis={analysis} nameOf={nameOf} selectedKey={selectedKey} canAdd={!readOnly} onSelect={setSelectedKey} onAdd={addShift} />
          )}
          {tab === "checks" && <ChecksPanel analysis={analysis} shifts={wk} onSelect={setSelectedKey} />}
          {tab === "absence" && <AbsencePanel key={weekStart} weekStart={weekStart} shifts={shifts} analysis={analysis} ctx={ctx} talents={p.talents} showCost={showCost} readOnly={readOnly} busy={busy} onAssign={assign} />}
          {tab === "matrix" && <MatrixPanel channels={channels} fam={fam} talents={p.talents} />}
          {tab === "hours" && (
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
          )}
          {tab === "rules" && (
            <div className="space-y-5">
              <RulesPanel key={JSON.stringify(rules)} rules={rules} readOnly={readOnly} busy={busy} onSave={saveRules} />
              <ChangeLogPanel changes={changes} sessions={p.sessions} nameOf={nameOf} />
            </div>
          )}
        </div>
      </div>

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
          onAssign={(s, r, t) => void assign(s, r, t)}
          onMove={(s, v) => void move(s, v)}
          onRemove={(s) => void remove(s)}
        />
      )}
      </>
      )}
    </div>
  );
};
