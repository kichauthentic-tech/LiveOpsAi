import React, { useMemo, useState } from "react";
import {
  AuditLogEntry,
  Brand,
  LiveSession,
  ShiftRegistration,
  ShiftSlot,
  Studio,
  SystemUser,
  Talent,
  UserRole
} from "../types";
import {
  Calendar as CalendarIcon,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle,
  Users,
  Radio,
  Check,
  Repeat,
  Zap,
  ChevronLeft,
  ChevronRight,
  Flame
} from "lucide-react";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../lib/campaignDays";
import { timeRangesOverlap } from "../lib/dateUtils";
import { CampaignDayRibbon } from "./ui/CampaignDayRibbon";
import { PosterDayCell } from "./ui/PosterCalendarGrid";
import { getBrandTheme } from "../lib/brandTheme";
import { SessionEventCard, SessionCardTone, buildSlotMeta } from "./ui/SessionEventCard";
import { SessionReportForm } from "./SessionReportForm";
import { SessionReportInput } from "../lib/db/sessionReports";

interface ShiftSchedulingProps {
  currentRole: UserRole;
  activeUser: SystemUser;
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  studios: Studio[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  onDeleteSlot: (id: string) => Promise<void>;
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onUpdateSession: (session: LiveSession) => Promise<boolean>;
  onLogAudit: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
  onSubmitSessionReport: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
}

const WEEKDAY_LABELS = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Tone card cho ca trên lịch ma trận — "open" luôn viền đứt (pending) bất kể đã có
// người đăng ký hay chưa, vì ca CHỈ thật sự chốt khi Ops finalize (đổi status).
const SLOT_TONE: Record<ShiftSlot["status"], SessionCardTone> = {
  open: "pending",
  finalized: "upcoming",
  cancelled: "cancelled"
};
const SLOT_STATUS_LABEL: Record<ShiftSlot["status"], string | undefined> = {
  open: undefined,
  finalized: undefined,
  cancelled: "HUỶ"
};

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

const dayLabel = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const names = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return names[d.getDay()];
};

// FIX L8 (audit 2026-08-21): mins === 0 (gõ nhầm giờ kết thúc = giờ bắt đầu) trước đây cũng cộng
// +1440 như ca qua đêm thật, ra 24 giờ công — chỉ ca qua đêm thật (mins < 0) mới cộng thêm 24h.
const durationHours = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // ca qua đêm, vd 22:00 -> 00:30
  return mins / 60;
}

const isAdminRole = (role: UserRole) => role === "ceo" || role === "operations" || role === "admin";

export default function ShiftScheduling({
  currentRole,
  activeUser,
  sessions,
  talents,
  brands,
  studios,
  shiftSlots,
  shiftRegistrations,
  onDeleteSlot,
  onRegister,
  onUnregister,
  onFinalizeSlot,
  onUpdateSession,
  onLogAudit,
  onSubmitSessionReport
}: ShiftSchedulingProps) {
  const admin = isAdminRole(currentRole);
  const myTalentId = activeUser.assignedTalentId;
  const today = getTodayDateString();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [pickByLot, setPickByLot] = useState<Record<string, { hostId: string; coHostId: string }>>({});
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  // Talent tự nhập report cho đúng ca của mình (chỉ 1 form mở tại 1 thời điểm).
  const [openReportSessionId, setOpenReportSessionId] = useState<string | null>(null);

  // Giai đoạn 15c — thay người khẩn cấp trên 1 ca đã chốt (Host/Trợ live báo bận
  // sát giờ live). Danh sách ứng viên thay thế lấy từ session_availability của
  // chính slot đó (những người đã đăng ký rảnh nhưng không được chọn lúc chốt) —
  // không cần bảng mới, đúng phạm vi đã CEO duyệt ở BUSINESS_ROADMAP.md.
  const [emergencySwap, setEmergencySwap] = useState<{ slotId: string; role: "host" | "coHost" } | null>(null);
  const [swapCandidateId, setSwapCandidateId] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);

  const talentsById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const brandById = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const registrationsBySlot = useMemo(() => {
    const map = new Map<string, ShiftRegistration[]>();
    shiftRegistrations.forEach((r) => {
      const list = map.get(r.slotId) ?? [];
      list.push(r);
      map.set(r.slotId, list);
    });
    return map;
  }, [shiftRegistrations]);

  const monthSlots = useMemo(
    () => shiftSlots.filter((s) => s.date.startsWith(selectedMonth)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [shiftSlots, selectedMonth]
  );

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ShiftSlot[]>();
    shiftSlots.forEach((s) => {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    });
    map.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [shiftSlots]);

  // Ưu tiên hoá studio (mục #5 CEO đã duyệt) — 2-3 brand cùng cần 1 studio/khung giờ
  // vàng thì cảnh báo cho Ops quyết định thủ công, không tự động chọn ai được ưu tiên.
  const findStudioConflicts = (date: string, start: string, end: string, studioId: string, brandId: string, excludeSlotId?: string) => {
    if (!studioId) return [];
    return shiftSlots.filter(
      (s) =>
        s.id !== excludeSlotId &&
        s.status !== "cancelled" &&
        s.date === date &&
        s.studioId === studioId &&
        s.brandId !== brandId &&
        timeRangesOverlap(start, end, s.startTime, s.endTime)
    );
  };
  // Lưới ngày đủ tuần (kể cả ngày lấp đầu/cuối từ tháng liền kề) để vẽ lịch ma trận.
  const monthGrid = useMemo(() => {
    const [yearStr, monthStr] = selectedMonth.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const startWeekday = new Date(year, monthIdx, 1).getDay(); // 0 = CN
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    const cells: { date: string; inMonth: boolean }[] = [];
    for (let i = 0; i < totalCells; i++) {
      const d = new Date(year, monthIdx, i - startWeekday + 1);
      const dateStr = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
      cells.push({ date: dateStr, inMonth: d.getMonth() === monthIdx });
    }
    return cells;
  }, [selectedMonth]);

  const visibleSlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : monthSlots;

  const shiftMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setSelectedMonth(`${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`);
    setSelectedDate(null);
  };

  // FIX L9 (audit 2026-08-21): trước đây gộp trùng studio VÀ trùng host vào chung 1 boolean, nhưng
  // thông báo hiển thị luôn cố định là "Host đã chọn trùng lịch" — khi thực tế chỉ trùng phòng
  // studio (host rảnh), ops đọc sai nguyên nhân và đi đổi host thay vì đổi phòng. Trả về riêng
  // từng loại để UI hiện đúng câu, cùng pattern {studioConflict, hostConflict} đã dùng ở
  // LiveCalendar.tsx.
  const checkConflicts = (date: string, start: string, end: string, studioId: string, talentId: string) => {
    let studioConflict = false;
    let hostConflict = false;
    for (const s of sessions) {
      if (s.date !== date || s.status === "Cancelled") continue;
      if (!timeRangesOverlap(s.startTime, s.endTime, start, end)) continue;
      if (studioId && s.studioId === studioId) studioConflict = true;
      if (s.hostId === talentId || s.coHostId === talentId) hostConflict = true;
    }
    return { studioConflict, hostConflict };
  };

  const handleToggleRegister = async (slot: ShiftSlot) => {
    if (!myTalentId) return;
    setBusySlotId(slot.id);
    const already = (registrationsBySlot.get(slot.id) ?? []).some((r) => r.talentId === myTalentId);
    if (already) await onUnregister(slot.id, myTalentId);
    else await onRegister(slot.id, myTalentId);
    setBusySlotId(null);
  };

  const handleFinalize = async (slot: ShiftSlot) => {
    const pick = pickByLot[slot.id];
    if (!pick?.hostId) {
      window.alert("Chọn Host trước khi chốt lịch.");
      return;
    }
    setBusySlotId(slot.id);
    const ok = await onFinalizeSlot(slot, pick.hostId, pick.coHostId || null);
    setBusySlotId(null);
    if (ok) setPickByLot((prev) => ({ ...prev, [slot.id]: { hostId: "", coHostId: "" } }));
  };

  const handleEmergencySwap = async (slot: ShiftSlot, session: LiveSession, role: "host" | "coHost") => {
    const candidate = talentsById.get(swapCandidateId);
    if (!candidate) return;
    setSwapBusy(true);
    const oldName = role === "host" ? session.hostName : session.coHostName;
    const updated: LiveSession =
      role === "host"
        ? { ...session, hostId: candidate.id, hostName: candidate.name }
        : { ...session, coHostId: candidate.id, coHostName: candidate.name };
    const ok = await onUpdateSession(updated);
    if (ok) {
      await onLogAudit({
        action: `Thay người khẩn cấp — ${role === "host" ? "Host" : "Trợ live"}`,
        details: `Ca ${slot.date} ${slot.startTime}-${slot.endTime} (${slot.brandName}): ${oldName || "—"} → ${candidate.name}. Lý do: ${
          swapReason.trim() || "Không ghi lý do"
        }.`,
        category: "Security Alert"
      });
      setEmergencySwap(null);
      setSwapCandidateId("");
      setSwapReason("");
    }
    setSwapBusy(false);
  };

  // Tải theo host trong tháng đang xem — gộp cả vai trò Host lẫn Co-host.
  const loadByTalent = useMemo(() => {
    const map = new Map<string, { name: string; hours: number; shifts: number }>();
    sessions
      .filter((s) => s.date.startsWith(selectedMonth) && s.status !== "Cancelled")
      .forEach((s) => {
        const hrs = durationHours(s.startTime, s.endTime);
        [
          { id: s.hostId, name: s.hostName },
          { id: s.coHostId, name: s.coHostName }
        ].forEach(({ id, name }) => {
          if (!id) return;
          const cur = map.get(id) ?? { name, hours: 0, shifts: 0 };
          cur.hours += hrs;
          cur.shifts += 1;
          map.set(id, cur);
        });
      });
    return Array.from(map.entries())
      .map(([talentId, v]) => ({ talentId, ...v }))
      .sort((a, b) => b.hours - a.hours);
  }, [sessions, selectedMonth]);

  // Giai đoạn 15b — tách cảnh báo "thiếu người" theo số lượng đăng ký thay vì đếm
  // chung: session_availability không phân biệt ai đăng ký với vai trò Host hay
  // Trợ live (chỉ có 1 danh sách "đang rảnh"), nên suy ra 3 tình huống từ SỐ LƯỢNG
  // đăng ký của slot — đúng với cách Ops chốt lịch thật (chọn Host trước, Co-host
  // là người còn lại trong nhóm đã đăng ký): 0 đăng ký = thiếu cả Host lẫn Trợ live;
  // đúng 1 đăng ký = đủ chọn Host nhưng chưa còn ai để chọn Trợ live; ≥2 = đủ cả hai.
  const openFutureSlots = useMemo(
    () => monthSlots.filter((s) => s.status === "open" && s.date >= today),
    [monthSlots, today]
  );
  const slotsMissingBoth = useMemo(
    () => openFutureSlots.filter((s) => (registrationsBySlot.get(s.id) ?? []).length === 0),
    [openFutureSlots, registrationsBySlot]
  );
  const slotsMissingCoHost = useMemo(
    () => openFutureSlots.filter((s) => (registrationsBySlot.get(s.id) ?? []).length === 1),
    [openFutureSlots, registrationsBySlot]
  );

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            Đăng Ký &amp; Chốt Lịch Host
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {admin
              ? "Mở ca, xem ai đã đăng ký, chốt Host + Co-host cho từng ca."
              : "Đăng ký các ca bạn rảnh — Operations sẽ chốt lịch từ danh sách đã đăng ký."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border)] transition-colors"
            title="Tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => {
              setSelectedMonth(e.target.value);
              setSelectedDate(null);
            }}
            className="bg-[var(--surface-base)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-xl bg-[var(--surface-base)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--border)] transition-colors"
            title="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!admin && !myTalentId && (
        <div className="bg-amber-950/85 border border-amber-800 rounded-xl p-4 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Tài khoản của bạn chưa được gán hồ sơ Talent (assigned_talent_id) — liên hệ CEO/Operations để gán trước khi tự đăng ký ca được.
        </div>
      )}

      {/* Cảnh báo gói gọn 1 dòng — chi tiết từng ca xem trên lịch ma trận / danh sách ca theo ngày */}
      {admin && (slotsMissingBoth.length > 0 || slotsMissingCoHost.length > 0) && (
        <div className="bg-rose-950/90 border border-rose-900 rounded-xl px-4 py-2.5 text-sm text-rose-200 flex flex-wrap items-center gap-x-3 gap-y-1">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {slotsMissingBoth.length > 0 && (
            <span>
              <span className="font-bold">{slotsMissingBoth.length}</span> ca chưa có ai đăng ký
            </span>
          )}
          {slotsMissingBoth.length > 0 && slotsMissingCoHost.length > 0 && <span className="text-rose-700">·</span>}
          {slotsMissingCoHost.length > 0 && (
            <span className="text-amber-200">
              <span className="font-bold">{slotsMissingCoHost.length}</span> ca thiếu Trợ live
            </span>
          )}
          <span className="text-rose-300 text-xs">— chọn ngày đỏ/vàng trên lịch để xử lý</span>
        </div>
      )}

      <div className="bg-[#f8f9fa] dark:bg-slate-900 border border-pink-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" /> Lịch Ma Trận Tháng {selectedMonth}
        </h3>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="min-w-[760px] xl:min-w-0">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-black uppercase tracking-wide mb-2">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={`text-center py-2 rounded-xl ${
                    idx === 0 || idx === 6
                      ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                      : "bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {monthGrid.map((cell, cellIdx) => {
                const daySlots = slotsByDate.get(cell.date) ?? [];
                const dayNum = Number(cell.date.slice(8, 10));
                const isToday = cell.date === today;
                const isSelected = cell.date === selectedDate;
                const dayMissingBoth = daySlots.some(
                  (s) => s.status === "open" && cell.date >= today && (registrationsBySlot.get(s.id) ?? []).length === 0
                );
                const dayMissingCoHost = daySlots.some(
                  (s) => s.status === "open" && cell.date >= today && (registrationsBySlot.get(s.id) ?? []).length === 1
                );
                const dayWarningColor = dayMissingBoth ? "bg-rose-500" : dayMissingCoHost ? "bg-amber-400" : null;
                const dayWarningTitle = dayMissingBoth ? "Có ca chưa ai đăng ký" : dayMissingCoHost ? "Có ca thiếu Trợ live" : undefined;
                const campaignDay = getCampaignDayInfo(cell.date);
                const toneClassName = isSelected
                  ? "bg-blue-50 dark:bg-blue-950/50 border-blue-500 shadow-md shadow-blue-600/10"
                  : !cell.inMonth
                  ? "bg-slate-100/60 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/40 opacity-40 hover:opacity-80"
                  : campaignDay
                  ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell
                  : undefined;
                return (
                  <PosterDayCell
                    key={cell.date}
                    day={dayNum}
                    isToday={isToday}
                    isWeekend={cellIdx % 7 === 0 || cellIdx % 7 === 6}
                    title={campaignDay?.label}
                    toneClassName={toneClassName}
                    onClick={() => setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                    badge={
                      dayWarningColor ? (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dayWarningColor}`} title={dayWarningTitle} />
                      ) : undefined
                    }
                    ribbon={
                      // Gọi ở MỌI ô: ô ngày thường chừa dải trống cùng chiều cao nên số ngày cả
                      // hàng vẫn thẳng, dải camp không "chèn" đẩy riêng 3 ô camp xuống.
                      <CampaignDayRibbon
                        info={campaignDay}
                        columnIndex={cellIdx % 7}
                        isGridStart={cellIdx === 0}
                        cellsRemainingInGrid={monthGrid.length - cellIdx}
                        variant="poster"
                      />
                    }
                  >
                    <div className="space-y-1">
                      {daySlots.map((s) => (
                        <SessionEventCard
                          key={s.id}
                          theme={getBrandTheme(s.brandName)}
                          brand={brandById.get(s.brandId ?? "")}
                          brandName={s.brandName}
                          startTime={s.startTime}
                          endTime={s.endTime}
                          meta={buildSlotMeta(s)}
                          tone={SLOT_TONE[s.status]}
                          statusLabel={SLOT_STATUS_LABEL[s.status]}
                          pending={s.status === "open"}
                          tooltip={`${s.startTime}-${s.endTime} · ${s.studioName} · ${
                            s.status === "open"
                              ? `${(registrationsBySlot.get(s.id) ?? []).length} người đăng ký`
                              : s.status === "finalized"
                              ? "Đã chốt"
                              : "Đã huỷ"
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(cell.date === selectedDate ? null : cell.date);
                          }}
                        />
                      ))}
                    </div>
                  </PosterDayCell>
                );
              })}
            </div>
          </div>
        </div>

        {/* Chú giải phải khớp đúng cách SessionEventCard vẽ trạng thái thật: nền card lấy màu
            brand (không có màu cố định theo trạng thái), trạng thái phân biệt bằng KIỂU VIỀN —
            viền đứt = ca mở (chưa/đã có người đăng ký đều cùng 1 kiểu viền, card không có chip
            đếm số người đăng ký nên 2 trạng thái này không phân biệt được bằng mắt), viền liền =
            đã chốt, viền liền mờ = đã huỷ. 2 mục cảnh báo theo NGÀY bên dưới vẫn là chấm màu cố
            định (bg-rose-500/bg-amber-400) vì đó là badge riêng, không phải card. */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-slate-300 dark:bg-slate-700 border-2 border-dashed border-slate-500 dark:border-slate-400" />
            Ca mở, chờ đăng ký
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-slate-300 dark:bg-slate-700 border-2 border-solid border-slate-500 dark:border-slate-400" />
            Đã chốt
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-slate-300 dark:bg-slate-700 border-2 border-solid border-slate-500 dark:border-slate-400 opacity-60 saturate-50" />
            Đã huỷ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Ngày có ca thiếu người
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Ngày có ca thiếu Trợ live
          </span>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="ml-auto text-blue-400 hover:text-blue-300 font-bold">
              × Bỏ lọc ngày {selectedDate}
            </button>
          )}
        </div>
      </div>

      {/* Chỉ hiện danh sách ca của ngày đang chọn — bỏ danh sách dàn trải cả tháng */}
      {selectedDate && (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            {`Ca Ngày ${dayLabel(selectedDate)} ${selectedDate}`}
          </h3>
          <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-400 hover:text-blue-300 font-bold">
            × Đóng
          </button>
        </div>
        <div className="overflow-x-auto -mx-2">
          <div className="min-w-[720px] px-2 space-y-2">
            {visibleSlots.length === 0 && (
              <p className="text-sm text-[var(--text-faint)] py-6 text-center">Chưa có ca nào trong ngày này.</p>
            )}
            {visibleSlots.map((slot) => {
              const regs = registrationsBySlot.get(slot.id) ?? [];
              const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;
              const pick = pickByLot[slot.id] ?? { hostId: "", coHostId: "" };
              const conflict = pick.hostId
                ? checkConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", pick.hostId)
                : { studioConflict: false, hostConflict: false };
              const studioConflicts = findStudioConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", slot.brandId ?? "", slot.id);
              return (
                <div key={slot.id} className="bg-[var(--surface-base)]/80 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-bold text-[var(--text)]">
                        {dayLabel(slot.date)} {slot.date} · {slot.startTime}-{slot.endTime}
                      </span>
                      <span className="text-[var(--text-muted)]">{slot.brandName}</span>
                      <span className="text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full font-bold">{slot.platform}</span>
                      {slot.studioName && <span className="text-[var(--text-faint)] text-xs">{slot.studioName}</span>}
                      {slot.templateId ? (
                        <span className="flex items-center gap-1 text-[10px] text-[var(--accent-text)]" title="Tự động sinh từ quy tắc lặp">
                          <Zap className="w-3 h-3" /> Tự động
                        </span>
                      ) : (
                        <span className="text-[10px] text-[var(--text-faint)]">Phát sinh</span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          slot.status === "finalized"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : slot.status === "cancelled"
                            ? "bg-[var(--surface-elevated)] text-[var(--text-faint)] border border-[var(--border)]"
                            : "bg-blue-950 text-blue-300 border border-blue-800"
                        }`}
                      >
                        {slot.status === "finalized" ? "ĐÃ CHỐT" : slot.status === "cancelled" ? "ĐÃ HUỶ" : `MỞ (${regs.length} đăng ký)`}
                      </span>
                      {slot.status === "open" && slot.date >= today && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                            regs.length === 0
                              ? "bg-rose-950 text-rose-300 border-rose-800"
                              : regs.length === 1
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-emerald-950 text-emerald-300 border-emerald-800"
                          }`}
                        >
                          {regs.length === 0 ? "Thiếu Host & Trợ live" : regs.length === 1 ? "Thiếu Trợ live" : "Đủ người đăng ký"}
                        </span>
                      )}
                      {studioConflicts.length > 0 && slot.status !== "cancelled" && (
                        <span
                          className="flex items-center gap-1 text-[10px] text-rose-300"
                          title={`Ưu tiên hoá: ${studioConflicts.map((c) => `${c.brandName} (${c.startTime}-${c.endTime})`).join(", ")}`}
                        >
                          <Flame className="w-3 h-3" /> Trùng studio {studioConflicts.length} brand khác
                        </span>
                      )}
                    </div>

                    {admin && slot.status === "open" && (
                      <button
                        onClick={() => onDeleteSlot(slot.id)}
                        className="text-[var(--text-faint)] hover:text-rose-400 transition-colors"
                        title="Xoá ca"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!admin && slot.status === "open" && myTalentId && (
                    <button
                      onClick={() => handleToggleRegister(slot)}
                      disabled={busySlotId === slot.id}
                      className={`self-start flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        iAmRegistered
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-rose-950 hover:text-rose-300 hover:border-rose-800"
                          : "bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900"
                      }`}
                    >
                      {iAmRegistered ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {iAmRegistered ? "Đã đăng ký · Hủy" : "Tôi rảnh ca này"}
                    </button>
                  )}

                  {admin && slot.status === "open" && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--border)]/80">
                      <Users className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                      {regs.length === 0 && <span className="text-xs text-[var(--text-faint)]">Chưa ai đăng ký</span>}
                      {regs.map((r) => (
                        <span key={r.id} className="text-[11px] bg-[var(--surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">
                          {talentsById.get(r.talentId)?.name ?? r.talentId}
                        </span>
                      ))}
                      {regs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <select
                            value={pick.hostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, hostId: e.target.value } }))}
                            className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Host…</option>
                            {regs.map((r) => (
                              <option key={r.talentId} value={r.talentId}>
                                {talentsById.get(r.talentId)?.name ?? r.talentId}
                              </option>
                            ))}
                          </select>
                          <select
                            value={pick.coHostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, coHostId: e.target.value } }))}
                            className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Trợ live (tuỳ chọn)…</option>
                            {regs.filter((r) => r.talentId !== pick.hostId).map((r) => (
                              <option key={r.talentId} value={r.talentId}>
                                {talentsById.get(r.talentId)?.name ?? r.talentId}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleFinalize(slot)}
                            disabled={!pick.hostId || busySlotId === slot.id}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" /> Chốt Lịch
                          </button>
                        </div>
                      )}
                      {(conflict.studioConflict || conflict.hostConflict) && (
                        <span className="w-full text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {conflict.hostConflict && conflict.studioConflict
                            ? "Trùng lịch cả Host lẫn Studio với 1 ca khác cùng ngày."
                            : conflict.hostConflict
                            ? "Host đã chọn trùng lịch với 1 ca khác cùng ngày."
                            : "Studio của ca này trùng lịch với 1 ca khác cùng ngày."}
                        </span>
                      )}
                    </div>
                  )}

                  {slot.status === "finalized" &&
                    (() => {
                      const session = slot.sessionId ? sessions.find((s) => s.id === slot.sessionId) : undefined;
                      if (!session) {
                        return (
                          <div className="text-xs text-emerald-300 flex items-center gap-1.5 pt-1 border-t border-[var(--border)]/80">
                            <Check className="w-3.5 h-3.5" /> Đã chốt — xem chi tiết ở tab Live Sessions / Lịch Vận Hành.
                          </div>
                        );
                      }
                      const swapping = emergencySwap?.slotId === slot.id ? emergencySwap : null;
                      const candidateRegs = regs.filter((r) => r.talentId !== session.hostId && r.talentId !== session.coHostId);
                      return (
                        <div className="pt-1 border-t border-[var(--border)]/80 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-emerald-300">Đã chốt</span>
                            <span className="text-[var(--text-muted)]">
                              Host: <span className="text-[var(--text)] font-medium">{session.hostName || "—"}</span>
                            </span>
                            {admin && (
                              <button
                                onClick={() => {
                                  setEmergencySwap({ slotId: slot.id, role: "host" });
                                  setSwapCandidateId("");
                                  setSwapReason("");
                                }}
                                className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold"
                              >
                                <Repeat className="w-3 h-3" /> Báo bận / Tìm người thay
                              </button>
                            )}
                            {session.coHostId && (
                              <>
                                <span className="text-[var(--text-muted)]">
                                  · Trợ live: <span className="text-[var(--text)] font-medium">{session.coHostName}</span>
                                </span>
                                {admin && (
                                  <button
                                    onClick={() => {
                                      setEmergencySwap({ slotId: slot.id, role: "coHost" });
                                      setSwapCandidateId("");
                                      setSwapReason("");
                                    }}
                                    className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-bold"
                                  >
                                    <Repeat className="w-3 h-3" /> Báo bận / Tìm người thay
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {swapping && (
                            <div className="bg-amber-950/80 border border-amber-800 rounded-lg p-2.5 space-y-2">
                              <div className="text-[11px] text-amber-200 font-bold">
                                Tìm người thay cho vai trò {swapping.role === "host" ? "Host" : "Trợ live"}
                              </div>
                              {candidateRegs.length === 0 ? (
                                <div className="text-[11px] text-[var(--text-faint)]">
                                  Không có ứng viên nào khác đã đăng ký rảnh ca này — cần báo tay/mở đăng ký lại.
                                </div>
                              ) : (
                                <select
                                  value={swapCandidateId}
                                  onChange={(e) => setSwapCandidateId(e.target.value)}
                                  className="bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-amber-500"
                                >
                                  <option value="">— Chọn người thay —</option>
                                  {candidateRegs.map((r) => (
                                    <option key={r.talentId} value={r.talentId}>
                                      {talentsById.get(r.talentId)?.name ?? r.talentId}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <input
                                placeholder="Lý do đổi (vd: Host báo bận đột xuất)"
                                value={swapReason}
                                onChange={(e) => setSwapReason(e.target.value)}
                                className="w-full bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text)] focus:outline-none focus:border-amber-500"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEmergencySwap(slot, session, swapping.role)}
                                  disabled={!swapCandidateId || swapBusy}
                                  className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                                >
                                  {swapBusy ? "Đang xử lý..." : "Xác nhận thay người"}
                                </button>
                                <button
                                  onClick={() => {
                                    setEmergencySwap(null);
                                    setSwapCandidateId("");
                                    setSwapReason("");
                                  }}
                                  className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                                >
                                  Huỷ
                                </button>
                              </div>
                            </div>
                          )}
                          {!admin && (myTalentId === session.hostId || myTalentId === session.coHostId) && (
                            <div className="pt-2 border-t border-[var(--border)]/80">
                              {openReportSessionId === session.id ? (
                                <SessionReportForm
                                  session={session}
                                  onSubmit={(input) => onSubmitSessionReport(session.id, input)}
                                  onCancel={() => setOpenReportSessionId(null)}
                                />
                              ) : (
                                <button
                                  onClick={() => setOpenReportSessionId(session.id)}
                                  className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors"
                                >
                                  <Radio className="w-3.5 h-3.5" />
                                  {session.report ? "Sửa Report Ca Này" : "Nhập Report Ca Này"}
                                </button>
                              )}
                              {session.report?.submittedAt && openReportSessionId !== session.id && (
                                <p className="text-[11px] text-[var(--text-faint)] mt-1">
                                  Đã nhập lúc {new Date(session.report.submittedAt).toLocaleString("vi-VN")}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-bold text-[var(--text)] flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-[var(--accent-text)]" /> Tải Theo Host — Tháng {selectedMonth}
        </h3>
        {loadByTalent.length === 0 ? (
          <p className="text-sm text-[var(--text-faint)]">Chưa có ca nào đã chốt trong tháng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-[var(--text-faint)] text-xs uppercase border-b border-[var(--border)]">
                  <th className="pb-2">Host</th>
                  <th className="pb-2 text-right">Số Ca</th>
                  <th className="pb-2 text-right">Tổng Giờ</th>
                </tr>
              </thead>
              <tbody>
                {loadByTalent.map((row) => (
                  <tr key={row.talentId} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="py-2 text-[var(--text)] font-medium">{row.name || talentsById.get(row.talentId)?.name}</td>
                    <td className="py-2 text-right font-mono text-[var(--text-muted)]">{row.shifts}</td>
                    <td className="py-2 text-right font-mono text-[var(--text-muted)]">{row.hours.toFixed(1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
