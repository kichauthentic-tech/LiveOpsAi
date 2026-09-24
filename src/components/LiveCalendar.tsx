import React, { useState, useEffect } from "react";
import { LiveSession, ShiftSlot, ShiftRegistration, Studio, Talent, Brand, PromoScheme, UserRole, BrandStudio, AuditLogEntry } from "../types";
import { schemesForDate } from "../lib/schemeUtils";
import { findBrandStudioId } from "../lib/db/brandStudios";
import { dateTimeRangesOverlap } from "../lib/dateUtils";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../lib/campaignDays";
import { BrandLogo } from "./ui/BrandLogo";
import { getBrandTheme } from "../lib/brandTheme";
import { EventPill } from "./ui/EventPill";
import { CampaignDayRibbon, CampaignDayBanner } from "./ui/CampaignDayRibbon";
import {
  SessionEventCard,
  SESSION_TONE,
  SESSION_STATUS_LABEL,
  buildSessionMeta,
  buildSlotMeta
} from "./ui/SessionEventCard";
import { SlotDetailModal } from "./scheduling/SlotDetailModal";
import { OpenSlotModal } from "./scheduling/OpenSlotModal";
import { SessionWindow } from "./SessionWindow";
import { SessionReportInput } from "../lib/db/sessionReports";
import {
  Calendar as CalendarIcon,
  Building2,
  User,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Tag,
  GripVertical,
  Move
} from "lucide-react";

interface LiveCalendarProps {
  sessions: LiveSession[];
  shiftSlots?: ShiftSlot[];
  shiftRegistrations?: ShiftRegistration[];
  studios: Studio[];
  talents: Talent[];
  brands: Brand[];
  brandStudios?: BrandStudio[]; // phòng mặc định brand × nền tảng (0098) — đổi brand trong form mở ca thì chọn sẵn phòng
  onUpdateSession?: (updatedSession: LiveSession) => Promise<boolean>;
  onCreateSlot?: (slot: ShiftSlot) => Promise<boolean>;
  onDeleteSlot?: (id: string) => Promise<void>;
  onRegisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot?: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  myTalentId?: string;
  currentUserId?: string;
  currentRole?: UserRole;
  schemes?: PromoScheme[];
  onAddScheme?: (scheme: { title: string; description: string; startDate: string; endDate: string }) => Promise<void>;
  onUpdateScheme?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate">>) => Promise<void>;
  onDeleteScheme?: (id: string) => Promise<void>;
  // Cửa sổ Ca Live (2026-09-21): click ca → cùng một cửa sổ với Sổ Ca / Đăng Ký & Chốt Lịch.
  onSubmitSessionReport?: (sessionId: string, input: SessionReportInput) => Promise<boolean>;
  onSessionSnapshotApplied?: (session: LiveSession) => void;
  onDeleteSession?: (id: string) => Promise<void>;
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>;
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  onRequestDropout?: (sessionId: string, reason: string) => Promise<boolean>; // Đ7 (0116) — talent báo bận, chỉ gửi thông báo cho ops
  onLogAudit?: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
}

// Chiều cao vùng card trong 1 ô lịch tháng — đủ cho ~2 card, ô nào nhiều hơn thì cuộn dọc
// bên trong chính ô đó thay vì đẩy vỡ layout lưới hoặc cắt gộp thành "+N phiên nữa".
const MONTH_CELL_LIST_MAX_H = "max-h-[76px] sm:max-h-[168px]";

// Ngày hôm nay theo giờ local, format YYYY-MM-DD
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const LiveCalendar: React.FC<LiveCalendarProps> = ({
  sessions: propSessions,
  shiftSlots = [],
  shiftRegistrations = [],
  studios,
  talents,
  brands,
  brandStudios = [],
  onUpdateSession,
  onCreateSlot,
  onDeleteSlot,
  onRegisterSlot,
  onUnregisterSlot,
  onFinalizeSlot,
  myTalentId,
  currentUserId,
  currentRole,
  schemes = [],
  onAddScheme,
  onUpdateScheme,
  onDeleteScheme,
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onDeleteSession,
  onCancelSession,
  onSetSessionExcluded,
  onRequestDropout,
  onLogAudit
}) => {
  // Sync sessions with propSessions so clean test mode is respected
  const [sessions, setSessions] = useState<LiveSession[]>(propSessions);

  useEffect(() => {
    setSessions(propSessions);
  }, [propSessions]);

  // View Mode: Month, Week, Day Matrix, Talent Workload, List
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "talent_workload">("day");

  // Selected Date string YYYY-MM-DD (defaults to real today's date)
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayDateString());

  // Selected Month Year state for Month view navigation (defaults to current month/year)
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth() + 1); // 1-indexed

  // Filters
  const [selectedStudioFilter, setSelectedStudioFilter] = useState<string>("ALL");
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>("ALL");
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<LiveSession | null>(null);
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<ShiftSlot | null>(null);
  const canManageSlots = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  // Q2: form duy nhất là "Mở ca chờ đăng ký" (OpenSlotModal); prefill ngày/phòng/giờ từ ô được bấm.
  const [slotModal, setSlotModal] = useState<{ date: string; studioId?: string; start?: string; end?: string } | null>(null);


  // Drag and Drop State
  const [draggedSessionId, setDraggedSessionId] = useState<string | null>(null);
  const [dragOverCellKey, setDragOverCellKey] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{
    text: string;
    type: "success" | "warning";
  } | null>(null);

  const showToast = (text: string, type: "success" | "warning" = "success") => {
    setToastNotification({ text, type });
    setTimeout(() => {
      setToastNotification(null);
    }, 4500);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, session: LiveSession) => {
    e.dataTransfer.setData("text/plain", session.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggedSessionId(session.id);
  };

  const handleDragEnd = () => {
    setDraggedSessionId(null);
    setDragOverCellKey(null);
  };

  const handleDragOver = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverCellKey !== cellKey) {
      setDragOverCellKey(cellKey);
    }
  };

  const handleDragLeave = (e: React.DragEvent, cellKey: string) => {
    e.preventDefault();
    if (dragOverCellKey === cellKey) {
      setDragOverCellKey(null);
    }
  };

  // Q3: thả thẻ ca vào hàng phòng khác → chỉ đổi phòng, giữ nguyên giờ (giờ là cam kết với brand).
  const handleDropOnStudioRow = async (e: React.DragEvent, targetStudio: Studio) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const sessionId = e.dataTransfer.getData("text/plain") || draggedSessionId;
    if (!sessionId) return;
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (session.studioId === targetStudio.id) {
      setDraggedSessionId(null);
      return;
    }
    const conflict = sessions.find(
      (s) =>
        s.id !== sessionId &&
        s.studioId === targetStudio.id &&
        dateTimeRangesOverlap(s, session) &&
        s.status !== "Cancelled"
    );
    if (conflict) {
      showToast(`Không thể chuyển! Phòng ${targetStudio.name} đã có "${conflict.brandName}" ${conflict.startTime}–${conflict.endTime}.`, "warning");
      setDraggedSessionId(null);
      return;
    }
    setDraggedSessionId(null);
    const ok = onUpdateSession ? await onUpdateSession({ ...session, studioId: targetStudio.id, studioName: targetStudio.name }) : true;
    if (ok) showToast(`Đã chuyển "${session.brandName}" ${session.startTime}–${session.endTime} sang ${targetStudio.name}.`, "success");
  };


  const handleDropOnWeekDay = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const sessionId = e.dataTransfer.getData("text/plain") || draggedSessionId;
    if (!sessionId) return;

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    if (session.date === targetDateStr) {
      setDraggedSessionId(null);
      return;
    }

    const updatedSession: LiveSession = { ...session, date: targetDateStr };
    setDraggedSessionId(null);
    const ok = onUpdateSession ? await onUpdateSession(updatedSession) : true;
    if (ok) {
      showToast(
        `Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
        "success"
      );
    }
  };

  const handleDropOnMonthDay = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const sessionId = e.dataTransfer.getData("text/plain") || draggedSessionId;
    if (!sessionId) return;

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    if (session.date === targetDateStr) {
      setDraggedSessionId(null);
      return;
    }

    const updatedSession: LiveSession = { ...session, date: targetDateStr };
    setDraggedSessionId(null);
    const ok = onUpdateSession ? await onUpdateSession(updatedSession) : true;
    if (ok) {
      showToast(
        `Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
        "success"
      );
    }
  };

  // Helper Date Parsing & Formatters
  const formatDateString = (year: number, month: number, day: number) => {
    const m = month < 10 ? `0${month}` : `${month}`;
    const d = day < 10 ? `0${day}` : `${day}`;
    return `${year}-${m}-${d}`;
  };

  const parseDateString = (dateStr: string) => {
    const parts = dateStr.split("-").map(Number);
    return { year: parts[0], month: parts[1], day: parts[2] };
  };

  // Helper to get day of week name in Vietnamese
  const getDayOfWeekName = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayIndex = d.getDay(); // 0 = Sun, 1 = Mon...
    const names = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return names[dayIndex];
  };

  // Get week date range (Monday to Sunday) containing selectedDate
  const getWeekDates = (dateStr: string) => {
    const curr = new Date(dateStr);
    const day = curr.getDay();
    // distance to Monday (0 is Sunday, so if Sunday go back 6 days, else go back day - 1)
    const diffToMon = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMon);

    const weekDates: { dateStr: string; dayName: string; dayNum: number }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const dateNum = d.getDate();
      const formatted = formatDateString(year, month, dateNum);
      const dayNames = ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
      weekDates.push({
        dateStr: formatted,
        dayName: dayNames[d.getDay()],
        dayNum: dateNum
      });
    }
    return weekDates;
  };

  // Get days array for Month View (7 columns starting Mon -> Sun)
  const getMonthGridDays = (year: number, month: number) => {
    const firstDayOfMonth = new Date(year, month - 1, 1);
    const lastDayOfMonth = new Date(year, month, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // 0 = Sun, 1 = Mon... convert to Monday-indexed (0 = Mon, 6 = Sun)
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days = [];

    // Padding days from previous month
    const prevMonthLastDay = new Date(year, month - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDayNum = prevMonthLastDay - i;
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      days.push({
        dateStr: formatDateString(prevYear, prevMonth, prevDayNum),
        dayNum: prevDayNum,
        isCurrentMonth: false
      });
    }

    // Days of current month
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        dateStr: formatDateString(year, month, d),
        dayNum: d,
        isCurrentMonth: true
      });
    }

    // Padding days for next month to complete grid (42 cells or 35 cells)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      days.push({
        dateStr: formatDateString(nextYear, nextMonth, i),
        dayNum: i,
        isCurrentMonth: false
      });
    }

    return days;
  };

  // Navigation handlers
  const handlePrevPeriod = () => {
    if (viewMode === "month") {
      if (currentMonth === 1) {
        setCurrentMonth(12);
        setCurrentYear(currentYear - 1);
      } else {
        setCurrentMonth(currentMonth - 1);
      }
    } else if (viewMode === "week") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      const newStr = formatDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
      setSelectedDate(newStr);
      setCurrentMonth(d.getMonth() + 1);
      setCurrentYear(d.getFullYear());
    } else {
      // Day / Talent
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      const newStr = formatDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
      setSelectedDate(newStr);
      setCurrentMonth(d.getMonth() + 1);
      setCurrentYear(d.getFullYear());
    }
  };

  const handleNextPeriod = () => {
    if (viewMode === "month") {
      if (currentMonth === 12) {
        setCurrentMonth(1);
        setCurrentYear(currentYear + 1);
      } else {
        setCurrentMonth(currentMonth + 1);
      }
    } else if (viewMode === "week") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      const newStr = formatDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
      setSelectedDate(newStr);
      setCurrentMonth(d.getMonth() + 1);
      setCurrentYear(d.getFullYear());
    } else {
      // Day / Talent
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 1);
      const newStr = formatDateString(d.getFullYear(), d.getMonth() + 1, d.getDate());
      setSelectedDate(newStr);
      setCurrentMonth(d.getMonth() + 1);
      setCurrentYear(d.getFullYear());
    }
  };

  const handleGoToday = () => {
    const today = getTodayDateString();
    setSelectedDate(today);
    const parsed = parseDateString(today);
    setCurrentYear(parsed.year);
    setCurrentMonth(parsed.month);
  };

  const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b]));
  const talentLookup = (id: string | undefined) => (id ? talents.find((t) => t.id === id) : undefined);
  // Session/ShiftSlot lưu sẵn `brandName`; tra theo tên để lấy logo cho các chỗ chỉ có tên (chú giải).
  const brandByName = new Map<string, Brand>(brands.map((b) => [b.name, b]));

  // Filter sessions
  const filteredSessions = sessions.filter((s) => {
    if (selectedStudioFilter !== "ALL" && s.studioId !== selectedStudioFilter) return false;
    if (selectedHostFilter !== "ALL" && s.hostId !== selectedHostFilter) return false;
    if (selectedBrandFilter !== "ALL" && s.brandId !== selectedBrandFilter) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchBrand = s.brandName.toLowerCase().includes(q);
      const matchHost = s.hostName.toLowerCase().includes(q);
      const matchStudio = s.studioName.toLowerCase().includes(q);
      if (!matchTitle && !matchBrand && !matchHost && !matchStudio) return false;
    }
    return true;
  });

  // Ca đang mở chờ đăng ký (chưa có host) — vẽ song song với session đã chốt
  // trên mọi view, cùng bộ filter studio/brand (host filter không áp dụng vì
  // slot chưa có host).
  const openSlots = shiftSlots.filter((sl) => {
    if (sl.status !== "open") return false;
    if (selectedStudioFilter !== "ALL" && sl.studioId !== selectedStudioFilter) return false;
    if (selectedBrandFilter !== "ALL" && sl.brandId !== selectedBrandFilter) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchBrand = sl.brandName.toLowerCase().includes(q);
      const matchStudio = sl.studioName.toLowerCase().includes(q);
      const matchNotes = sl.notes.toLowerCase().includes(q);
      if (!matchBrand && !matchStudio && !matchNotes) return false;
    }
    return true;
  });


  // Current Week dates for Week View
  const currentWeekDates = getWeekDates(selectedDate);

  // Month Grid Days for Month View
  const monthGridDays = getMonthGridDays(currentYear, currentMonth);

  // Chú giải màu brand cho Lịch Tháng — chỉ liệt kê brand thật sự có phiên/ca trong tháng đang xem,
  // để bảng chú giải không dài bằng cả danh sách brand của agency.
  const monthPrefix = `${currentYear}-${`${currentMonth}`.padStart(2, "0")}`;
  const monthBrandNames = Array.from(
    new Set(
      [
        ...filteredSessions.filter((s) => s.date.startsWith(monthPrefix) && s.status !== "Cancelled").map((s) => s.brandName),
        ...openSlots.filter((sl) => sl.date.startsWith(monthPrefix)).map((sl) => sl.brandName)
      ].filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "vi"));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[var(--accent-text)] font-semibold text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-[var(--accent-text)] shrink-0" /> Vận Hành Live
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-[var(--text)] tracking-tight">
            Lịch Vận Hành
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setSlotModal({ date: selectedDate })}
            className="w-full sm:w-auto bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-[var(--accent)]/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Mở ca chờ đăng ký
          </button>
        </div>
      </div>

      {/* Primary Navigation & Date View Control Bar */}
      <div className="bg-[var(--surface)]/90 border border-[var(--border)] p-3 sm:p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* View Mode Switcher */}
        <div className="overflow-x-auto no-scrollbar pb-1 lg:pb-0">
          <div className="flex items-center bg-[var(--surface-base)] p-1 rounded-xl border border-[var(--border)] text-xs font-bold whitespace-nowrap min-w-max">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "month"
                  ? "bg-[var(--accent)] text-white shadow-sm font-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Lịch Tháng
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "week"
                  ? "bg-[var(--accent)] text-white shadow-sm font-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Lịch Tuần
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "day"
                  ? "bg-[var(--accent)] text-white shadow-sm font-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Phòng theo giờ
            </button>
            <button
              onClick={() => setViewMode("talent_workload")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "talent_workload"
                  ? "bg-[var(--accent)] text-white shadow-sm font-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <User className="w-3.5 h-3.5" /> Tải Lịch Host
            </button>
          </div>
        </div>

        {/* Date / Month / Week Step Navigation */}
        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 text-xs">
          <div className="flex items-center gap-1 bg-[var(--surface-base)] p-1 rounded-xl border border-[var(--border)]">
            <button
              onClick={handlePrevPeriod}
              className="p-1.5 hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] rounded-lg transition-colors"
              title="Thời gian trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleGoToday}
              className="px-2.5 py-1 text-[11px] font-bold bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-colors"
            >
              Hôm Nay
            </button>

            <span className="font-mono font-bold text-[var(--text)] px-2.5 text-xs text-center min-w-[140px]">
              {viewMode === "month" && `Tháng ${currentMonth < 10 ? '0' + currentMonth : currentMonth} / ${currentYear}`}
              {viewMode === "week" && `Tuần (${currentWeekDates[0]?.dayNum}/${parseDateString(currentWeekDates[0]?.dateStr || '').month} - ${currentWeekDates[6]?.dayNum}/${parseDateString(currentWeekDates[6]?.dateStr || '').month})`}
              {(viewMode === "day" || viewMode === "talent_workload") && `${getDayOfWeekName(selectedDate)}, ${selectedDate}`}
            </span>

            <button
              onClick={handleNextPeriod}
              className="p-1.5 hover:bg-[var(--surface-elevated)] text-[var(--text-muted)] rounded-lg transition-colors"
              title="Thời gian tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Date Picker */}
          <div className="flex items-center gap-2 bg-[var(--surface-base)] px-3 py-1.5 rounded-xl border border-[var(--border)]">
            <CalendarIcon className="w-3.5 h-3.5 text-[var(--accent-text)] shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  setSelectedDate(val);
                  const parsed = parseDateString(val);
                  setCurrentYear(parsed.year);
                  setCurrentMonth(parsed.month);
                }
              }}
              className="bg-transparent text-[var(--text)] focus:outline-none cursor-pointer font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* DRAG & DROP HELPER BANNER */}
      {draggedSessionId ? (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-4 py-3 rounded-2xl shadow-xl border border-blue-400/50 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <GripVertical className="w-5 h-5 text-amber-300 shrink-0" />
            <span>Đang kéo — thả để đổi lịch</span>
          </div>
          <span className="text-[10px] bg-black/40 px-2.5 py-1 rounded-lg font-mono font-bold shrink-0">
            Giữ &amp; Di Chuột Để Thả
          </span>
        </div>
      ) : (
        <div className="bg-[var(--surface)]/60 border border-[var(--border)]/80 px-4 py-2.5 rounded-xl text-xs text-[var(--text-muted)] flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong className="text-blue-300 font-semibold">Kéo-thả:</strong> ở Phòng theo giờ, kéo thẻ ca sang hàng phòng khác để đổi phòng (giữ giờ); ở Lịch Tuần/Tháng, kéo sang ngày khác để đổi ngày. Đổi giờ thì mở ca → Sửa.
          </span>
        </div>
      )}

      {/* TOAST NOTIFICATION POPUP */}
      {toastNotification && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-center gap-3 text-xs font-bold max-w-md animate-bounce ${
            toastNotification.type === "warning"
              ? "bg-rose-950/90 border-rose-600 text-rose-200"
              : "bg-emerald-950/90 border-emerald-500 text-emerald-200"
          }`}
        >
          {toastNotification.type === "warning" ? (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <span className="flex-1 leading-relaxed">{toastNotification.text}</span>
          <button
            onClick={() => setToastNotification(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Dropdowns & Search — đặt ngay trên lịch để lọc áp dụng tức thì cho view đang xem */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm theo tên phiên, Host, Brand..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-xl pl-9 pr-3 py-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-medium"
          />
        </div>

        <select
          value={selectedStudioFilter}
          onChange={(e) => setSelectedStudioFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-medium"
        >
          <option value="ALL">Tất cả phòng Studio ({studios.length})</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={selectedHostFilter}
          onChange={(e) => setSelectedHostFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-medium"
        >
          <option value="ALL">Tất cả talent ({talents.length})</option>
          {talents.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
          ))}
        </select>

        <select
          value={selectedBrandFilter}
          onChange={(e) => setSelectedBrandFilter(e.target.value)}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-2 text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-medium"
        >
          <option value="ALL">Tất cả Brand Khách Hàng ({brands.length})</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* VIEW 1: MONTH VIEW (Lịch Tháng - Bảng Lịch 30/31 Ngày) */}
      {viewMode === "month" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--border)] pb-3 gap-2">
            <div>
              <h3 className="font-black text-[var(--text)] text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[var(--accent-text)] shrink-0" /> Tổng Quan Lịch Tháng {currentMonth}/{currentYear}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Kéo thả để đổi lịch · Màu badge = màu nhận diện của brand</p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-semibold">
              {monthBrandNames.map((name) => {
                const theme = getBrandTheme(name);
                return (
                  <span
                    key={name}
                    style={{ background: theme.primary, color: theme.onPrimary, borderColor: theme.secondary }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-black uppercase tracking-tight shadow-sm"
                  >
                    <BrandLogo brand={brandByName.get(name)} size="xs" className="rounded bg-white" />
                    {name}
                  </span>
                );
              })}
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border-2 border-dashed border-[var(--border)] text-[var(--text-muted)] text-[10px] font-black uppercase">
                Viền đứt = ca chờ ĐK
              </span>
            </div>
          </div>

          {/* Month Calendar Grid — dưới xl, 7 cột chia nhau <100px/ô thì card session không còn đọc
              được, nên cho cuộn ngang với bề rộng tối thiểu thay vì bóp card thành sọc vô nghĩa. */}
          <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="grid grid-cols-7 gap-1 sm:gap-2 min-w-[1080px] xl:min-w-0">
            {/* Header days of week */}
            {["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"].map((d, idx) => (
              <div
                key={idx}
                className={`p-1 sm:p-2 text-center font-black text-xs uppercase rounded-xl ${
                  idx >= 5
                    ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                    : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                }`}
              >
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d === "Chủ Nhật" ? "CN" : d.replace("Thứ ", "T")}</span>
              </div>
            ))}

            {/* Grid Days */}
            {monthGridDays.map((cell, idx) => {
              const daySessions = filteredSessions.filter((s) => s.date === cell.dateStr && s.status !== "Cancelled");
              const daySlots = openSlots.filter((sl) => sl.date === cell.dateStr);
              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === getTodayDateString();
              const totalGmvTarget = daySessions.reduce((acc, curr) => acc + curr.targetGmv, 0);
              const hasLiveNow = daySessions.some((s) => s.status === "Live Now");

              const monthCellKey = `month_${cell.dateStr}`;
              const isMonthHovered = dragOverCellKey === monthCellKey;
              const daySchemes = schemesForDate(schemes, cell.dateStr);
              const campaignDay = getCampaignDayInfo(cell.dateStr);

              return (
                <div
                  key={idx}
                  onDragOver={(e) => handleDragOver(e, monthCellKey)}
                  onDragLeave={(e) => handleDragLeave(e, monthCellKey)}
                  onDrop={(e) => handleDropOnMonthDay(e, cell.dateStr)}
                  onClick={() => {
                    setSelectedDate(cell.dateStr);
                    setViewMode("day");
                  }}
                  title={campaignDay?.label}
                  className={`min-h-[110px] sm:min-h-[215px] p-1 sm:p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between relative overflow-visible ${
                    isMonthHovered
                      ? "bg-[var(--accent)]/15 border-2 border-dashed border-[var(--accent)] scale-[1.02] shadow-xl shadow-[var(--accent)]/20"
                      : !cell.isCurrentMonth
                      ? "bg-[var(--surface-muted)] border-[var(--border-muted)] opacity-40 hover:opacity-80"
                      : isToday
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400 shadow-md"
                      : isSelected
                      ? "bg-[var(--accent)]/10 border-[var(--accent)] shadow-md shadow-[var(--accent)]/10"
                      : campaignDay
                      ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell
                      : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--text-faint)] hover:bg-[var(--surface-hover)]"
                  }`}
                >
                  {isToday && (
                    // z-30 > z-20 của CampaignDayRibbon — ngày "hôm nay" rơi vào dải camp (D-Day/
                    // Mid-Month/Pay-Day) vẫn phải đọc được chữ "HÔM NAY", không bị dải banner đè lên.
                    <span className="absolute -top-2 right-1.5 shrink-0 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white leading-none shadow-md z-30 tracking-wide">
                      HÔM NAY
                    </span>
                  )}
                  {/* Gọi ở MỌI ô (kể cả ngày thường) — ô thường chừa dải trống cùng chiều cao nên
                      số ngày của 3 ngày camp không bị đẩy tụt so với cả hàng. */}
                  <CampaignDayRibbon
                    info={campaignDay}
                    columnIndex={idx % 7}
                    isGridStart={idx === 0}
                    cellsRemainingInGrid={monthGridDays.length - idx}
                    variant="liveMonth"
                  />

                  <div className="flex justify-between items-start flex-wrap gap-1">
                    <span
                      className={`shrink-0 text-sm sm:text-base font-black ${
                        isToday
                          ? "text-orange-600 dark:text-orange-400"
                          : isSelected
                          ? "text-[var(--accent-text)]"
                          : "text-[var(--text)]"
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap shrink-0">
                      {daySchemes.length > 0 && (
                        <span
                          title={daySchemes.map((s) => `${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n")}
                          className="text-[10px] leading-none"
                        >
                          <Tag className="w-2.5 h-2.5" />
                        </span>
                      )}
                      {hasLiveNow && (
                        <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse tracking-wide">
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Session badges in cell — card to theo màu brand (lib/brandTheme.ts).
                      Ngày nào nhiều session/ca hơn chỗ chứa thì cuộn dọc trong chính ô đó,
                      không cắt gộp thành "+N nữa" nữa — click vào card vẫn xem chi tiết được. */}
                  <div
                    className={`space-y-1.5 my-1 flex-1 overflow-y-auto overscroll-contain pr-0.5 scrollbar-thin ${MONTH_CELL_LIST_MAX_H}`}
                  >
                    {daySessions.map((ds) => (
                      <SessionEventCard
                        key={ds.id}
                        theme={getBrandTheme(ds.brandName)}
                        brand={brandById.get(ds.brandId)}
                        brandName={ds.brandName}
                        startTime={ds.startTime}
                        endTime={ds.endTime}
                        meta={buildSessionMeta(ds, talentLookup)}
                        targetGmv={ds.targetGmv}
                        metaLimit={4}
                        tone={SESSION_TONE[ds.status]}
                        statusLabel={SESSION_STATUS_LABEL[ds.status]}
                        dragging={draggedSessionId === ds.id}
                        draggable
                        tooltip={`${ds.title} · ${ds.studioName} · Host ${ds.hostName}${
                          ds.coHostName ? ` · Trợ ${ds.coHostName}` : ""
                        } — kéo thả sang ngày khác để chuyển lịch`}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleDragStart(e, ds);
                        }}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSessionDetail(ds);
                        }}
                      />
                    ))}
                    {daySlots.map((sl) => (
                      <SessionEventCard
                        key={sl.id}
                        theme={getBrandTheme(sl.brandName)}
                        brand={brandById.get(sl.brandId ?? "")}
                        brandName={sl.brandName}
                        startTime={sl.startTime}
                        endTime={sl.endTime}
                        meta={buildSlotMeta(sl)}
                        metaLimit={2}
                        tone="pending"
                        pending
                        tooltip={`Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · ${sl.studioName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSlotDetail(sl);
                        }}
                      />
                    ))}
                  </div>

                  {/* Day total GMV */}
                  {totalGmvTarget > 0 ? (
                    <div className="text-[9px] font-mono font-bold text-[var(--success)] pt-1 border-t border-[var(--border-muted)] truncate">
                      Target: {(totalGmvTarget / 1000000).toFixed(0)}M
                    </div>
                  ) : (
                    <div className="text-[9px] text-[var(--text-faint)] italic">Trống lịch</div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {/* VIEW 2: WEEK VIEW (Lịch Tuần - 7 Ngày Từ T2 Đến CN) */}
      {viewMode === "week" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-[var(--border)] pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-black text-[var(--text)] text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[var(--accent-text)]" /> Lịch Vận Hành Tuần
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Kéo thả để đổi lịch</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {currentWeekDates.map((wDay, wIdx) => {
              const daySessions = filteredSessions.filter((s) => s.date === wDay.dateStr && s.status !== "Cancelled");
              const daySlots = openSlots.filter((sl) => sl.date === wDay.dateStr);
              const isSelected = wDay.dateStr === selectedDate;
              const isToday = wDay.dateStr === getTodayDateString();

              const weekCellKey = `week_${wDay.dateStr}`;
              const isWeekHovered = dragOverCellKey === weekCellKey;
              const daySchemes = schemesForDate(schemes, wDay.dateStr);
              const campaignDay = getCampaignDayInfo(wDay.dateStr);

              return (
                <div
                  key={wDay.dateStr}
                  onDragOver={(e) => handleDragOver(e, weekCellKey)}
                  onDragLeave={(e) => handleDragLeave(e, weekCellKey)}
                  onDrop={(e) => handleDropOnWeekDay(e, wDay.dateStr)}
                  title={campaignDay?.label}
                  className={`bg-[var(--surface)] rounded-2xl p-3 border space-y-3 transition-all overflow-visible ${
                    isWeekHovered
                      ? "border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/10 shadow-xl shadow-[var(--accent)]/20 scale-[1.01]"
                      : isSelected
                      ? "border-[var(--accent)]/80 bg-[var(--accent)]/5"
                      : campaignDay
                      ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell
                      : "border-[var(--border)]"
                  }`}
                >
                  {/* Desktop (md:grid-cols-7, hàng ngang thật): dải banner nối liền qua 3 ngày của
                      đợt camp, đồng bộ kỹ thuật với Poster Calendar/lịch tháng. Mobile xếp dọc
                      1 cột nên "nối ngang" vô nghĩa — vẫn dùng badge rời như cũ. */}
                  <div className="hidden md:block">
                    <CampaignDayRibbon
                      info={campaignDay}
                      columnIndex={wIdx}
                      isGridStart={wIdx === 0}
                      cellsRemainingInGrid={currentWeekDates.length - wIdx}
                      variant="liveWeek"
                    />
                  </div>
                  {campaignDay && <CampaignDayBanner info={campaignDay} className="-mt-0.5 md:hidden" />}
                  <div
                    onClick={() => setSelectedDate(wDay.dateStr)}
                    className="flex justify-between items-center border-b border-[var(--border-muted)] pb-2 cursor-pointer"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-1">
                        {wDay.dayName}
                        {daySchemes.length > 0 && (
                          <span title={daySchemes.map((s) => `${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n")}>
                            <Tag className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </span>
                      <strong className={`text-sm font-mono font-bold ${isToday ? "text-[var(--accent-text)]" : "text-[var(--text)]"}`}>
                        {wDay.dayNum}/{parseDateString(wDay.dateStr).month}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-[var(--surface-elevated)] text-[var(--text-muted)] font-bold px-2 py-0.5 rounded-full">
                        {daySessions.length}
                      </span>
                      {daySlots.length > 0 && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50 font-bold px-2 py-0.5 rounded-full">
                          {daySlots.length} chờ ĐK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Session cards under this day — cuộn dọc khi nhiều hơn 2 card, đồng bộ với
                      ô lịch tháng (MONTH_CELL_LIST_MAX_H) thay vì đẩy cả hàng tuần cao dần. */}
                  <div className="space-y-2 min-h-[160px] max-h-[230px] overflow-y-auto overscroll-contain pr-0.5 scrollbar-thin">
                    {daySlots.map((sl) => (
                      <SessionEventCard
                        key={sl.id}
                        theme={getBrandTheme(sl.brandName)}
                        brand={brandById.get(sl.brandId ?? "")}
                        brandName={sl.brandName}
                        startTime={sl.startTime}
                        endTime={sl.endTime}
                        meta={buildSlotMeta(sl)}
                        size="md"
                        tone="pending"
                        pending
                        tooltip="Ca chờ đăng ký — bấm để xem/đăng ký/chốt lịch"
                        onClick={() => setSelectedSlotDetail(sl)}
                      />
                    ))}
                    {daySessions.map((ds) => (
                      <SessionEventCard
                        key={ds.id}
                        theme={getBrandTheme(ds.brandName)}
                        brand={brandById.get(ds.brandId)}
                        brandName={ds.brandName}
                        startTime={ds.startTime}
                        endTime={ds.endTime}
                        title={ds.title}
                        meta={buildSessionMeta(ds, talentLookup)}
                        targetGmv={ds.targetGmv}
                        size="md"
                        tone={SESSION_TONE[ds.status]}
                        statusLabel={SESSION_STATUS_LABEL[ds.status]}
                        dragging={draggedSessionId === ds.id}
                        draggable
                        tooltip="Kéo để đổi ngày"
                        onDragStart={(e) => handleDragStart(e, ds)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedSessionDetail(ds)}
                      />
                    ))}

                    {daySessions.length === 0 && daySlots.length === 0 && (
                      <div
                        onClick={() => {
                          setSelectedDate(wDay.dateStr);
                          if (canManageSlots) setSlotModal({ date: wDay.dateStr });
                        }}
                        className={`h-24 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                          isWeekHovered
                            ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent-text)] font-bold"
                            : "border-[var(--border)] hover:border-[var(--accent)]/60 text-[var(--text-faint)] hover:text-[var(--accent-text)]"
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        <span className="text-[10px] font-semibold">
                          {isWeekHovered ? "Thả vào đây" : "Trống"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 3: TIMELINE PHÒNG STUDIO — Q3 (audit 2026-09-21): trục giờ liên tục thay 5 khối 3h cố
          định; mỗi ca là 1 khối đúng giờ thật (09–12, 21–00…), 2 ca sát nhau không đè nhau. */}
      {viewMode === "day" && (() => {
        const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
        // Ca qua đêm (end <= start) kéo sang hôm sau.
        const endMin = (start: string, end: string) => { const e = toMin(end); return e <= toMin(start) ? e + 24 * 60 : e; };
        const daySessions = filteredSessions.filter((s) => s.date === selectedDate && s.status !== "Cancelled");
        const daySlots = openSlots.filter((sl) => sl.date === selectedDate);
        const allStarts = [...daySessions.map((s) => toMin(s.startTime)), ...daySlots.map((sl) => toMin(sl.startTime))];
        const allEnds = [...daySessions.map((s) => endMin(s.startTime, s.endTime)), ...daySlots.map((sl) => endMin(sl.startTime, sl.endTime))];
        const axisStart = Math.min(8 * 60, ...allStarts.map((m) => Math.floor(m / 60) * 60));
        const axisEnd = Math.max(23 * 60, ...allEnds.map((m) => Math.ceil(m / 60) * 60));
        const span = axisEnd - axisStart;
        const hours: number[] = [];
        for (let m = axisStart; m <= axisEnd; m += 60) hours.push(m);
        const fmtHour = (m: number) => `${`${Math.floor(m / 60) % 24}`.padStart(2, "0")}:00`;
        const pos = (start: string, end: string) => ({ left: `${((toMin(start) - axisStart) / span) * 100}%`, width: `${((endMin(start, end) - toMin(start)) / span) * 100}%` });
        const noRoomSessions = daySessions.filter((s) => !studios.some((st) => st.id === s.studioId));
        const noRoomSlots = daySlots.filter((sl) => !studios.some((st) => st.id === sl.studioId));
        const totalHours = daySessions.reduce((a, s) => a + (endMin(s.startTime, s.endTime) - toMin(s.startTime)) / 60, 0);
        const campaignDay = getCampaignDayInfo(selectedDate);
        return (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          {campaignDay && <CampaignDayBanner info={campaignDay} className="w-full !rounded-xl justify-center py-1.5" />}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--border)] pb-3 gap-2">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[var(--accent-text)] shrink-0" /> Phòng Studio theo giờ — {selectedDate} ({getDayOfWeekName(selectedDate)})
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {daySessions.length} ca đã chốt · {daySlots.length} ca chờ đăng ký · {totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h live. Kéo thẻ ca sang hàng phòng khác để đổi phòng (giữ giờ).
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-[var(--text-muted)]">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-rose-500 ring-2 ring-rose-400 ring-offset-1 ring-offset-[var(--surface)] animate-pulse" /> Live</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-[var(--surface-hover)] border-2 border-solid border-[var(--border)]" /> Đã chốt</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-md bg-[var(--surface-elevated)]/60 border-2 border-dashed border-[var(--border)]" /> Chờ đăng ký</span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]/80 scrollbar-thin">
            <div className="min-w-[860px]">
              {/* Trục giờ */}
              <div className="flex border-b border-[var(--border)] bg-[var(--surface-base)] text-[10px] font-mono text-[var(--text-muted)]">
                <div className="w-44 shrink-0 p-2 font-bold uppercase tracking-wider border-r border-[var(--border)] sticky left-0 bg-[var(--surface-base)] z-10">Phòng</div>
                <div className="relative flex-1 h-8">
                  {hours.map((m) => (
                    <span key={m} className="absolute top-2 -translate-x-1/2" style={{ left: `${((m - axisStart) / span) * 100}%` }}>{fmtHour(m)}</span>
                  ))}
                </div>
              </div>
              {studios.map((std) => {
                const rowSessions = daySessions.filter((s) => s.studioId === std.id).sort((a, b) => a.startTime.localeCompare(b.startTime));
                const rowSlots = daySlots.filter((sl) => sl.studioId === std.id);
                const rowKey = `row_${std.id}`;
                const hovered = dragOverCellKey === rowKey;
                return (
                  <div key={std.id} className={`flex border-b border-[var(--border)]/60 last:border-b-0 transition-colors ${hovered ? "bg-[var(--accent)]/15" : "hover:bg-[var(--surface-elevated)]/20"}`}>
                    <div className="w-44 shrink-0 p-3 border-r border-[var(--border)] sticky left-0 bg-[var(--surface)] z-10">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border)] text-[var(--accent-text)] shrink-0"><Building2 className="w-3.5 h-3.5" /></span>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-bold text-[var(--text)] truncate">{std.name}</p>
                          <p className="text-[10px] text-[var(--text-muted)] font-mono">{std.roomNumber}</p>
                        </div>
                      </div>
                    </div>
                    <div
                      className="relative flex-1 h-[132px]"
                      onDragOver={(e) => handleDragOver(e, rowKey)}
                      onDragLeave={(e) => handleDragLeave(e, rowKey)}
                      onDrop={(e) => handleDropOnStudioRow(e, std)}
                      onDoubleClick={() => canManageSlots && setSlotModal({ date: selectedDate, studioId: std.id })}
                      title={canManageSlots ? "Bấm đôi để mở ca chờ đăng ký ở phòng này" : undefined}
                    >
                      {hours.map((m) => (
                        <span key={m} className="absolute top-0 bottom-0 border-l border-[var(--border)]/40" style={{ left: `${((m - axisStart) / span) * 100}%` }} />
                      ))}
                      {rowSlots.map((sl) => (
                        <div key={sl.id} className="absolute top-2 bottom-2 px-0.5" style={pos(sl.startTime, sl.endTime)}>
                          <SessionEventCard
                            theme={getBrandTheme(sl.brandName)}
                            brand={brandById.get(sl.brandId ?? "")}
                            brandName={sl.brandName}
                            startTime={sl.startTime}
                            endTime={sl.endTime}
                            meta={buildSlotMeta(sl)}
                            size="md"
                            tone="pending"
                            pending
                            tooltip={`Ca chờ đăng ký · ${sl.startTime}-${sl.endTime} · Bấm để xem/đăng ký/chốt lịch`}
                            onClick={() => setSelectedSlotDetail(sl)}
                          />
                        </div>
                      ))}
                      {rowSessions.map((ms) => (
                        <div key={ms.id} className="absolute top-2 bottom-2 px-0.5" style={pos(ms.startTime, ms.endTime)}>
                          <SessionEventCard
                            theme={getBrandTheme(ms.brandName)}
                            brand={brandById.get(ms.brandId)}
                            brandName={ms.brandName}
                            startTime={ms.startTime}
                            endTime={ms.endTime}
                            title={ms.title}
                            meta={buildSessionMeta(ms, talentLookup)}
                            targetGmv={ms.targetGmv}
                            size="md"
                            tone={SESSION_TONE[ms.status]}
                            statusLabel={SESSION_STATUS_LABEL[ms.status]}
                            dragging={draggedSessionId === ms.id}
                            draggable
                            tooltip="Kéo sang hàng phòng khác để đổi phòng"
                            onDragStart={(e) => handleDragStart(e, ms)}
                            onDragEnd={handleDragEnd}
                            onClick={() => setSelectedSessionDetail(ms)}
                          />
                        </div>
                      ))}
                      {rowSessions.length === 0 && rowSlots.length === 0 && (
                        <span className="absolute inset-0 flex items-center justify-center text-[11px] text-[var(--text-faint)] pointer-events-none">
                          {hovered ? "Thả vào đây để đổi phòng" : "Trống"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {(noRoomSessions.length > 0 || noRoomSlots.length > 0) && (
                <div className="flex border-t border-amber-900/60 bg-amber-950/20">
                  <div className="w-44 shrink-0 p-3 border-r border-[var(--border)] sticky left-0 bg-[var(--surface)] z-10">
                    <p className="text-xs font-bold text-amber-300">Chưa gán phòng</p>
                    <p className="text-[10px] text-[var(--text-muted)]">mở ca → sửa phòng</p>
                  </div>
                  <div className="relative flex-1 h-[132px]">
                    {noRoomSlots.map((sl) => (
                      <div key={sl.id} className="absolute top-2 bottom-2 px-0.5" style={pos(sl.startTime, sl.endTime)}>
                        <SessionEventCard theme={getBrandTheme(sl.brandName)} brand={brandById.get(sl.brandId ?? "")} brandName={sl.brandName} startTime={sl.startTime} endTime={sl.endTime} meta={buildSlotMeta(sl)} size="md" tone="pending" pending onClick={() => setSelectedSlotDetail(sl)} />
                      </div>
                    ))}
                    {noRoomSessions.map((ms) => (
                      <div key={ms.id} className="absolute top-2 bottom-2 px-0.5" style={pos(ms.startTime, ms.endTime)}>
                        <SessionEventCard theme={getBrandTheme(ms.brandName)} brand={brandById.get(ms.brandId)} brandName={ms.brandName} startTime={ms.startTime} endTime={ms.endTime} title={ms.title} meta={buildSessionMeta(ms, talentLookup)} targetGmv={ms.targetGmv} size="md" tone={SESSION_TONE[ms.status]} statusLabel={SESSION_STATUS_LABEL[ms.status]} dragging={draggedSessionId === ms.id} draggable onDragStart={(e) => handleDragStart(e, ms)} onDragEnd={handleDragEnd} onClick={() => setSelectedSessionDetail(ms)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        );
      })()}


      {/* VIEW 4: TALENT WORKLOAD */}
      {viewMode === "talent_workload" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-[var(--border)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[var(--text)] text-base flex items-center gap-2">
                <User className="w-5 h-5 text-[var(--accent-text)] shrink-0" /> Tải Làm Việc Host - Ngày {selectedDate}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">Tổng thời lượng live trong ngày</p>
            </div>
            <span className="bg-blue-950 text-blue-300 border border-blue-800/80 text-xs font-bold px-3 py-1 rounded-full self-start sm:self-auto">
              Max Khuyên Dùng: 6 giờ / ngày
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {talents.map((t) => {
              const hostSessions = sessions.filter((s) => s.hostId === t.id && s.date === selectedDate && s.status !== "Cancelled");
              const totalMinutesToday = hostSessions.reduce((acc, curr) => {
                const [h1, m1] = curr.startTime.split(":").map(Number);
                const [h2, m2] = curr.endTime.split(":").map(Number);
                let minutes = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (minutes < 0) minutes += 24 * 60; // ca qua đêm, vd 22:00 -> 05:00
                return acc + minutes;
              }, 0);
              const totalHoursToday = Math.round((totalMinutesToday / 60) * 10) / 10;

              const isOverloaded = totalHoursToday > 5;

              return (
                <div key={t.id} className="bg-[var(--surface-base)] border border-[var(--border)] p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center space-x-3">
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-[var(--border)] shrink-0" />
                      <div>
                        <h4 className="font-bold text-[var(--text)] text-sm line-clamp-1">{t.name}</h4>
                        <span className="text-xs text-[var(--accent-text)] font-medium">{t.role} • Score: {t.overallScore}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        isOverloaded
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : totalHoursToday > 0
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-[var(--surface-elevated)] text-[var(--text-muted)]"
                      }`}
                    >
                      {isOverloaded ? (<span className="inline-flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Cảnh Báo Quá Tải</span>) : totalHoursToday > 0 ? "Bận Phiên Live" : "Rảnh"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between font-medium">
                      <span className="text-[var(--text-muted)]">Tổng giờ live ngày {selectedDate}:</span>
                      <strong className={isOverloaded ? "text-rose-400" : "text-emerald-400"}>{totalHoursToday} Giờ Live</strong>
                    </div>
                    <div className="w-full h-2 bg-[var(--surface-elevated)] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOverloaded ? "bg-rose-500" : "bg-[var(--accent)]"}`}
                        style={{ width: `${Math.min(100, (totalHoursToday / 6) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-[var(--border)]">
                    <span className="text-[10px] font-bold text-[var(--text-faint)] uppercase block">Phiên Được Phân Bổ:</span>
                    {hostSessions.length > 0 ? (
                      hostSessions.map((hs) => (
                        <div key={hs.id} className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-xs flex justify-between items-center gap-2">
                          <span className="font-bold text-[var(--text)] truncate">{hs.title}</span>
                          <span className="font-mono text-[10px] text-[var(--accent-text)] shrink-0">{hs.startTime}-{hs.endTime}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-[var(--text-faint)] italic">Chưa có lịch phiên live trong ngày này.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {slotModal && canManageSlots && onCreateSlot && (
        <OpenSlotModal
          brands={brands}
          studios={studios}
          brandStudios={brandStudios}
          sessions={sessions}
          shiftSlots={shiftSlots}
          initialDate={slotModal.date}
          initialStudioId={slotModal.studioId}
          initialStart={slotModal.start}
          initialEnd={slotModal.end}
          currentUserId={currentUserId}
          onClose={() => setSlotModal(null)}
          onCreateSlot={onCreateSlot}
        />
      )}

      {/* SESSION DETAIL MODAL */}
      {selectedSessionDetail && (
        <SessionWindow
          session={sessions.find((x) => x.id === selectedSessionDetail.id) ?? selectedSessionDetail}
          brand={brandById.get(selectedSessionDetail.brandId)}
          viewer={{ role: currentRole ?? "talent", myTalentId }}
          today={getTodayDateString()}
          allSessions={sessions}
          studios={studios}
          talents={talents}
          onClose={() => setSelectedSessionDetail(null)}
          onSubmitSessionReport={onSubmitSessionReport}
          onSessionSnapshotApplied={onSessionSnapshotApplied}
          onUpdateSession={onUpdateSession}
          onDeleteSession={onDeleteSession}
          onCancelSession={onCancelSession}
          onSetSessionExcluded={onSetSessionExcluded}
          onRequestDropout={onRequestDropout}
          onLogAudit={onLogAudit}
        />
      )}

      {selectedSlotDetail && (
        <SlotDetailModal
          slot={selectedSlotDetail}
          onClose={() => setSelectedSlotDetail(null)}
          talents={talents}
          registrations={shiftRegistrations}
          sessions={sessions}
          shiftSlots={shiftSlots}
          canManage={canManageSlots}
          myTalentId={myTalentId}
          onRegister={onRegisterSlot}
          onUnregister={onUnregisterSlot}
          onFinalizeSlot={onFinalizeSlot}
          onDeleteSlot={onDeleteSlot}
        />
      )}
    </div>
  );
};
