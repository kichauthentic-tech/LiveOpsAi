import React, { useState, useEffect } from "react";
import { LiveSession, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, Studio, Talent, Brand, SystemUser, PromoScheme, UserRole } from "../types";
import { schemesForDate } from "../lib/schemeUtils";
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
import { SchemeManager } from "./SchemeManager";
import { RecurringTemplateManager } from "./scheduling/RecurringTemplateManager";
import { SlotDetailModal } from "./scheduling/SlotDetailModal";
import {
  Calendar as CalendarIcon,
  Clock,
  Building2,
  User,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Layers,
  Search,
  X,
  Zap,
  Info,
  ChevronLeft,
  ChevronRight,
  Eye,
  TrendingUp,
  Tag,
  Check,
  GripVertical,
  Move
} from "lucide-react";
import { authedFetch } from "../lib/authedFetch";

export interface TimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
  name: string;
}

interface LiveCalendarProps {
  sessions: LiveSession[];
  shiftSlots?: ShiftSlot[];
  shiftRegistrations?: ShiftRegistration[];
  studios: Studio[];
  talents: Talent[];
  brands: Brand[];
  users: SystemUser[];
  onAddSession?: (newSession: LiveSession) => Promise<boolean>;
  onUpdateSession?: (updatedSession: LiveSession) => Promise<boolean>;
  onCreateSlot?: (slot: ShiftSlot) => Promise<boolean>;
  onDeleteSlot?: (id: string) => Promise<void>;
  onRegisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregisterSlot?: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot?: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  myTalentId?: string;
  currentUserId?: string;
  currentRole?: UserRole;
  recurringShiftTemplates?: RecurringShiftTemplate[];
  onCreateTemplate?: (t: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate?: (t: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate?: (id: string) => Promise<void>;
  onGenerateMonthSlots?: (month: string) => Promise<number>;
  schemes?: PromoScheme[];
  onAddScheme?: (scheme: { title: string; description: string; startDate: string; endDate: string }) => Promise<void>;
  onUpdateScheme?: (id: string, patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate">>) => Promise<void>;
  onDeleteScheme?: (id: string) => Promise<void>;
}

// Số card tối đa trong 1 ô lịch tháng — card session giờ cao hơn pill 1 dòng cũ nên phải giới hạn,
// phần dư gộp thành dòng "+N phiên nữa" (bấm vào ô để sang Ma Trận Ngày xem đủ).
const MONTH_CELL_MAX_SESSIONS = 2;
const MONTH_CELL_MAX_SLOTS = 2;

// Ngày hôm nay theo giờ local, format YYYY-MM-DD
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Cố định 5 Ca Live Chuẩn
const FIXED_TIME_SLOTS: TimeSlot[] = [
  { id: "slot1", label: "08:00 - 11:00", start: "08:00", end: "11:00", name: "Sáng (Khai Mạc)" },
  { id: "slot2", label: "11:00 - 14:00", start: "11:00", end: "14:00", name: "Trưa (Flash Sale)" },
  { id: "slot3", label: "14:00 - 17:00", start: "14:00", end: "17:00", name: "Chiều (Khung Giờ Bạc)" },
  { id: "slot4", label: "17:00 - 20:00", start: "17:00", end: "20:00", name: "Tối Sớm (Giờ Tan Tầm)" },
  { id: "slot5", label: "20:00 - 23:00", start: "20:00", end: "23:00", name: "Đêm Vàng (GOLDEN MEGA)" },
];

export const LiveCalendar: React.FC<LiveCalendarProps> = ({
  sessions: propSessions,
  shiftSlots = [],
  shiftRegistrations = [],
  studios,
  talents,
  brands,
  users,
  onAddSession,
  onUpdateSession,
  onCreateSlot,
  onDeleteSlot,
  onRegisterSlot,
  onUnregisterSlot,
  onFinalizeSlot,
  myTalentId,
  currentUserId,
  currentRole,
  recurringShiftTemplates = [],
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateMonthSlots,
  schemes = [],
  onAddScheme,
  onUpdateScheme,
  onDeleteScheme
}) => {
  const canEditSchemes = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";
  const canManageTemplates = canEditSchemes && !!onCreateTemplate && !!onGenerateMonthSlots;
  const [showSchemeManager, setShowSchemeManager] = useState(false);
  const moderators = users.filter((u) => u.role === "moderator");
  // Sync sessions with propSessions so clean test mode is respected
  const [sessions, setSessions] = useState<LiveSession[]>(propSessions);

  useEffect(() => {
    setSessions(propSessions);
  }, [propSessions]);

  // View Mode: Month, Week, Day Matrix, Talent Workload, List
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "talent_workload" | "list">("day");

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
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<LiveSession | null>(null);
  const [selectedSlotDetail, setSelectedSlotDetail] = useState<ShiftSlot | null>(null);
  const canManageSlots = currentRole === "ceo" || currentRole === "admin" || currentRole === "operations";

  // New Booking Form State
  const [bookingMode, setBookingMode] = useState<"session" | "slot">("session");
  const [newTitle, setNewTitle] = useState("");
  const [newBrandId, setNewBrandId] = useState(brands[0]?.id || "");
  const [newStudioId, setNewStudioId] = useState(studios[0]?.id || "");
  const [newHostId, setNewHostId] = useState(talents[0]?.id || "");
  const [newCoHostId, setNewCoHostId] = useState("");
  const [newDate, setNewDate] = useState(selectedDate);
  const [newStartTime, setNewStartTime] = useState("14:00");
  const [newEndTime, setNewEndTime] = useState("17:00");
  const [newTargetGmv, setNewTargetGmv] = useState(200000000);
  const [newAssistantId, setNewAssistantId] = useState(moderators[0]?.id || "");

  // Edit state cho session đã có (mở từ panel chi tiết)
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editDate, setEditDate] = useState("");
  const [editStartTime, setEditStartTime] = useState("");
  const [editEndTime, setEditEndTime] = useState("");
  const [editStudioId, setEditStudioId] = useState("");
  const [editHostId, setEditHostId] = useState("");
  const [editCoHostId, setEditCoHostId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // AI Recommendation State
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [isOptimizingSchedule, setIsOptimizingSchedule] = useState(false);

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

  const handleDropOnDayMatrix = async (e: React.DragEvent, targetStudio: Studio, targetSlot: TimeSlot) => {
    e.preventDefault();
    setDragOverCellKey(null);
    const sessionId = e.dataTransfer.getData("text/plain") || draggedSessionId;
    if (!sessionId) return;

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    // Check if dropping on exact same slot and studio
    if (
      session.studioId === targetStudio.id &&
      session.startTime === targetSlot.start &&
      session.endTime === targetSlot.end &&
      session.date === selectedDate
    ) {
      setDraggedSessionId(null);
      return;
    }

    // Check conflict on target studio and slot
    const conflict = sessions.find(
      (s) =>
        s.id !== sessionId &&
        s.date === selectedDate &&
        s.studioId === targetStudio.id &&
        s.startTime < targetSlot.end &&
        s.endTime > targetSlot.start &&
        s.status !== "Cancelled"
    );

    if (conflict) {
      showToast(
        `⚠️ Không thể chuyển! Phòng ${targetStudio.name} đã có phiên live "${conflict.brandName}" ở ca ${targetSlot.label}!`,
        "warning"
      );
      setDraggedSessionId(null);
      return;
    }

    // Update session
    const updatedSession: LiveSession = {
      ...session,
      studioId: targetStudio.id,
      studioName: targetStudio.name,
      startTime: targetSlot.start,
      endTime: targetSlot.end,
      date: selectedDate
    };

    // Don't optimistically mutate local `sessions` here — it's synced from propSessions
    // (source of truth in App.tsx). Painting the move before the write is confirmed would
    // leave a stale/incorrect position on screen if the Supabase update fails, since nothing
    // would ever revert it back. Await the real result and only celebrate on success.
    setDraggedSessionId(null);
    const ok = onUpdateSession ? await onUpdateSession(updatedSession) : true;
    if (ok) {
      showToast(
        `✨ Đã chuyển phiên live "${session.brandName}" sang ${targetStudio.name} (${targetSlot.label})!`,
        "success"
      );
    }
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
        `✨ Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
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
        `✨ Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
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

  // Conflict Checker
  const checkConflicts = (studioId: string, hostId: string, date: string, start: string, end: string, excludeSessionId?: string) => {
    const conflicts = {
      studioConflict: false,
      hostConflict: false,
      studioConflictWith: "",
      hostConflictWith: ""
    };

    sessions.forEach((s) => {
      if (s.id === excludeSessionId) return;
      if (s.date === date && s.status !== "Cancelled") {
        if (s.startTime < end && s.endTime > start) {
          if (s.studioId === studioId) {
            conflicts.studioConflict = true;
            conflicts.studioConflictWith = s.title;
          }
          if (s.hostId === hostId) {
            conflicts.hostConflict = true;
            conflicts.hostConflictWith = `${s.hostName} (${s.title})`;
          }
        }
      }
    });

    return conflicts;
  };

  const currentFormConflicts = checkConflicts(newStudioId, newHostId, newDate, newStartTime, newEndTime);
  const currentEditConflicts = selectedSessionDetail
    ? checkConflicts(editStudioId, editHostId, editDate, editStartTime, editEndTime, selectedSessionDetail.id)
    : { studioConflict: false, hostConflict: false, studioConflictWith: "", hostConflictWith: "" };

  // Save new session hoặc mở ca chờ đăng ký (tuỳ bookingMode)
  const handleSaveBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    const brandObj = brands.find((b) => b.id === newBrandId);
    const studioObj = studios.find((s) => s.id === newStudioId);

    if (bookingMode === "slot") {
      const newSlot: ShiftSlot = {
        id: `slot-${Date.now()}`,
        date: newDate,
        startTime: newStartTime,
        endTime: newEndTime,
        brandId: newBrandId || undefined,
        brandName: brandObj?.name || "Brand Partner",
        platform: "TikTok",
        studioId: newStudioId || undefined,
        studioName: studioObj?.name || "Studio Standard",
        notes: newTitle,
        status: "open",
        createdBy: currentUserId
      };
      const ok = onCreateSlot ? await onCreateSlot(newSlot) : true;
      if (!ok) return;
      setIsBookingModalOpen(false);
      setNewTitle("");
      setAiSuggestion(null);
      return;
    }

    const hostObj = talents.find((t) => t.id === newHostId);
    const coHostObj = talents.find((t) => t.id === newCoHostId);
    const assistantObj = moderators.find((m) => m.id === newAssistantId);
    const assistantName = assistantObj?.name || "Chưa gán Trợ Lý";

    const createdSession: LiveSession = {
      id: `session-${Date.now()}`,
      title: newTitle || `Phiên Live ${brandObj?.name || 'Brand'} - ${newStartTime}`,
      brandId: newBrandId,
      brandName: brandObj?.name || "Brand Partner",
      shopTikTokHandle: `@${brandObj?.name.toLowerCase().replace(/\s+/g, '') || 'shop'}_official`,
      studioId: newStudioId,
      studioName: studioObj?.name || "Studio Standard",
      hostId: newHostId,
      hostName: hostObj?.name || "Host Live",
      assistantId: newAssistantId || undefined,
      assistantName,
      coHostId: newCoHostId || undefined,
      coHostName: coHostObj?.name || "",
      platform: "TikTok",
      date: newDate,
      startTime: newStartTime,
      endTime: newEndTime,
      status: "Upcoming",
      targetGmv: Number(newTargetGmv),
      actualGmv: 0,
      totalOrders: 0,
      avgWatchTimeSeconds: 0,
      peakViewers: 0,
      totalViews: 0,
      ctrAvg: 0,
      cvrAvg: 0,
      skus: [],
      checklist: [
        { id: "c1", task: "Kiểm tra hệ thống mic & camera studio", category: "Tech", completed: false, assignedTo: "Kỹ thuật viên" },
        { id: "c2", task: "Setup ánh sáng & bối cảnh chụp mẫu sản phẩm", category: "Studio", completed: false, assignedTo: "Stylist" },
        { id: "c3", task: "Duyệt danh sách SKU & Mã Giảm Giá TikTok Shop", category: "TikTok App", completed: false, assignedTo: assistantName },
        { id: "c4", task: "Duyệt Kịch bản chốt đơn & tung Deal Flash Sale", category: "Host & Script", completed: false, assignedTo: hostObj?.name || "Host" }
      ],
      minuteMetrics: []
    };

    // Rely on propSessions (source of truth) updating after the write succeeds — the local
    // `sessions` mirror re-syncs via the useEffect above — instead of optimistically inserting
    // here and risking a phantom session staying visible if the create actually fails.
    const ok = onAddSession ? await onAddSession(createdSession) : true;
    if (!ok) return;

    setIsBookingModalOpen(false);
    setNewTitle("");
    setNewCoHostId("");
    setAiSuggestion(null);
  };

  const openEditDetail = (session: LiveSession) => {
    setEditDate(session.date);
    setEditStartTime(session.startTime);
    setEditEndTime(session.endTime);
    setEditStudioId(session.studioId);
    setEditHostId(session.hostId);
    setEditCoHostId(session.coHostId || "");
    setIsEditingDetail(true);
  };

  const handleSaveDetailEdit = async () => {
    if (!selectedSessionDetail) return;
    const studioObj = studios.find((s) => s.id === editStudioId);
    const hostObj = talents.find((t) => t.id === editHostId);
    const coHostObj = talents.find((t) => t.id === editCoHostId);

    const updated: LiveSession = {
      ...selectedSessionDetail,
      date: editDate,
      startTime: editStartTime,
      endTime: editEndTime,
      studioId: editStudioId,
      studioName: studioObj?.name || selectedSessionDetail.studioName,
      hostId: editHostId,
      hostName: hostObj?.name || selectedSessionDetail.hostName,
      coHostId: editCoHostId || undefined,
      coHostName: coHostObj?.name || ""
    };

    setSavingEdit(true);
    const ok = onUpdateSession ? await onUpdateSession(updated) : true;
    setSavingEdit(false);
    if (!ok) return;
    setSelectedSessionDetail(updated);
    setIsEditingDetail(false);
  };

  // AI Optimizer
  const runFallbackScheduleOptimizer = (brandName: string, industry: string) => {
    let suggestedSlot = "20:00 - 23:00";
    let suggestedHostName = "Yến Nhi";
    let reason = "Ngành Beauty/Mỹ phẩm có CVR cao nhất vào khung giờ Tối Đêm Vàng.";

    if (industry.includes("Thời trang") || industry.includes("Nam")) {
      suggestedSlot = "14:00 - 17:00";
      suggestedHostName = "Hoàng Nam";
      reason = "Ngành Thời trang Nam đạt đòn bẩy đơn cao vào chiều trước giờ tan tầm.";
    } else if (industry.includes("Gia dụng")) {
      suggestedSlot = "11:00 - 14:00";
      suggestedHostName = "Bích Ngọc";
      reason = "Gia dụng bếp phù hợp nghỉ trưa dân văn phòng.";
    }

    const matchedHost = talents.find((t) => t.name.includes(suggestedHostName)) || talents[0];

    return {
      suggestedSlot,
      suggestedHostId: matchedHost?.id || null,
      suggestedHostName: matchedHost?.name || suggestedHostName,
      reason,
      predictedGmvLift: "+25%"
    };
  };

  const applyScheduleSuggestion = (
    brandName: string,
    industry: string,
    result: { suggestedSlot: string; suggestedHostId: string | null; suggestedHostName: string; reason: string; predictedGmvLift: string },
    isMock: boolean
  ) => {
    const [slotStart, slotEnd] = result.suggestedSlot.split(" - ");
    setNewStartTime(slotStart);
    setNewEndTime(slotEnd);
    const matchedHost = talents.find((t) => t.id === result.suggestedHostId) || talents.find((t) => t.name.includes(result.suggestedHostName));
    if (matchedHost) setNewHostId(matchedHost.id);

    setAiSuggestion(
      `🤖 ${isMock ? "AI Recommendation (chưa cấu hình Gemini API key)" : "Gemini AI Recommendation"} cho ${brandName} (${industry}):\n` +
      `• Khung giờ Vàng tối ưu: ${result.suggestedSlot}\n` +
      `• Host đề xuất: ${result.suggestedHostName}\n` +
      `• Lý do: ${result.reason}\n` +
      `• Dự báo GMV tiềm năng: ${result.predictedGmvLift} so với phiên thường.`
    );
  };

  const handleAiOptimizeSchedule = async () => {
    const brandObj = brands.find((b) => b.id === newBrandId);
    const brandName = brandObj?.name || "Thương hiệu";
    const industry = brandObj?.industry || "Thương mại điện tử";

    setIsOptimizingSchedule(true);
    try {
      const res = await authedFetch("/api/gemini/optimize-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand: brandObj, timeSlots: FIXED_TIME_SLOTS, talents })
      });
      const data = await res.json();
      if (data.success && data.suggestedSlot) {
        applyScheduleSuggestion(brandName, industry, data, !!data.isMock);
        return;
      }
      throw new Error(data.error || "Empty AI schedule result");
    } catch (e) {
      console.error("AI Schedule Optimizer failed, dùng fallback công thức:", e);
      applyScheduleSuggestion(brandName, industry, runFallbackScheduleOptimizer(brandName, industry), true);
    } finally {
      setIsOptimizingSchedule(false);
    }
  };

  const brandById = new Map<string, Brand>(brands.map((b) => [b.id, b]));
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

  // Calculate Occupancy KPI for selected date
  const totalSlotsForDay = FIXED_TIME_SLOTS.length * studios.length;
  const bookedSlotsCount = sessions.filter((s) => s.date === selectedDate && s.status !== "Cancelled").length;
  const occupancyPercent = Math.min(100, Math.round((bookedSlotsCount / totalSlotsForDay) * 100));

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
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-blue-400 font-semibold text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" /> Operating Calendar & Multi-View Studio Allocator
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Lịch Vận Hành Phiên Live
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setNewDate(selectedDate);
              setIsBookingModalOpen(true);
            }}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Đặt Lịch Phiên Live Mới
          </button>
        </div>
      </div>

      {/* Primary Navigation & Date View Control Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-3 sm:p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* View Mode Switcher */}
        <div className="overflow-x-auto no-scrollbar pb-1 lg:pb-0">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold whitespace-nowrap min-w-max">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "month"
                  ? "bg-blue-600 text-white shadow-sm font-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Lịch Tháng
            </button>
            <button
              onClick={() => setViewMode("week")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "week"
                  ? "bg-blue-600 text-white shadow-sm font-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" /> Lịch Tuần
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "day"
                  ? "bg-blue-600 text-white shadow-sm font-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Building2 className="w-3.5 h-3.5" /> Ma Trận Ngày (Studio)
            </button>
            <button
              onClick={() => setViewMode("talent_workload")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "talent_workload"
                  ? "bg-blue-600 text-white shadow-sm font-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <User className="w-3.5 h-3.5" /> Tải Lịch Host
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === "list"
                  ? "bg-blue-600 text-white shadow-sm font-black"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="w-3.5 h-3.5" /> Tất Cả ({filteredSessions.length}{openSlots.length > 0 ? ` +${openSlots.length} chờ ĐK` : ""})
            </button>
          </div>
        </div>

        {/* Date / Month / Week Step Navigation */}
        <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2 text-xs">
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={handlePrevPeriod}
              className="p-1.5 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
              title="Thời gian trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleGoToday}
              className="px-2.5 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg transition-colors"
            >
              Hôm Nay
            </button>

            <span className="font-mono font-bold text-white px-2.5 text-xs text-center min-w-[140px]">
              {viewMode === "month" && `Tháng ${currentMonth < 10 ? '0' + currentMonth : currentMonth} / ${currentYear}`}
              {viewMode === "week" && `Tuần (${currentWeekDates[0]?.dayNum}/${parseDateString(currentWeekDates[0]?.dateStr || '').month} - ${currentWeekDates[6]?.dayNum}/${parseDateString(currentWeekDates[6]?.dateStr || '').month})`}
              {(viewMode === "day" || viewMode === "talent_workload" || viewMode === "list") && `${getDayOfWeekName(selectedDate)}, ${selectedDate}`}
            </span>

            <button
              onClick={handleNextPeriod}
              className="p-1.5 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors"
              title="Thời gian tiếp"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Date Picker */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
            <CalendarIcon className="w-3.5 h-3.5 text-blue-400 shrink-0" />
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
              className="bg-transparent text-white focus:outline-none cursor-pointer font-mono text-xs"
            />
          </div>
        </div>
      </div>

      {/* Filter Dropdowns & Search */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Tìm theo tên phiên, Host, Brand..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white focus:outline-none focus:border-blue-500 font-medium"
          />
        </div>

        <select
          value={selectedStudioFilter}
          onChange={(e) => setSelectedStudioFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-white focus:outline-none focus:border-blue-500 font-medium"
        >
          <option value="ALL">🏢 Tất cả phòng Studio ({studios.length})</option>
          {studios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={selectedHostFilter}
          onChange={(e) => setSelectedHostFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-white focus:outline-none focus:border-blue-500 font-medium"
        >
          <option value="ALL">🎙️ Tất cả Host / KOC ({talents.length})</option>
          {talents.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.role})</option>
          ))}
        </select>

        <select
          value={selectedBrandFilter}
          onChange={(e) => setSelectedBrandFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-white focus:outline-none focus:border-blue-500 font-medium"
        >
          <option value="ALL">🌿 Tất cả Brand Khách Hàng ({brands.length})</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </div>

      {/* SCHEME KHUYẾN MÃI (Giai đoạn C3) */}
      {canEditSchemes && (
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowSchemeManager((v) => !v)}
            className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
          >
            <Tag className="w-3.5 h-3.5" /> {showSchemeManager ? "Ẩn Scheme khuyến mãi" : `Quản lý Scheme khuyến mãi (${schemes.length})`}
          </button>
        </div>
      )}
      {canEditSchemes && showSchemeManager && (
        <SchemeManager
          schemes={schemes}
          onAdd={async (s) => {
            if (onAddScheme) await onAddScheme(s);
          }}
          onUpdate={async (id, patch) => {
            if (onUpdateScheme) await onUpdateScheme(id, patch);
          }}
          onDelete={async (id) => {
            if (onDeleteScheme) await onDeleteScheme(id);
          }}
        />
      )}

      {canManageTemplates && (
        <RecurringTemplateManager
          templates={recurringShiftTemplates}
          brands={brands}
          studios={studios}
          currentMonth={currentMonth}
          currentYear={currentYear}
          currentUserId={currentUserId}
          onCreateTemplate={onCreateTemplate!}
          onToggleTemplate={onToggleTemplate!}
          onDeleteTemplate={onDeleteTemplate!}
          onGenerateMonthSlots={onGenerateMonthSlots!}
        />
      )}


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
        <div className="bg-slate-900/60 border border-slate-800/80 px-4 py-2.5 rounded-xl text-xs text-slate-400 flex items-center gap-2">
          <GripVertical className="w-4 h-4 text-blue-400 shrink-0" />
          <span>
            <strong className="text-blue-300 font-semibold">Tính năng Kéo-Thả (Drag &amp; Drop):</strong> Kéo trực tiếp thẻ ca live sang ô Studio/Khung giờ mới hoặc Ngày khác để đổi thời gian lịch live nhanh chóng không cần mở form.
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
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: MONTH VIEW (Lịch Tháng - Bảng Lịch 30/31 Ngày) */}
      {viewMode === "month" && (
        <div className="bg-[#f8f9fa] dark:bg-slate-900 border border-pink-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-200 dark:border-slate-800 pb-3 gap-2">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-500 dark:text-blue-400 shrink-0" /> Tổng Quan Lịch Tháng {currentMonth}/{currentYear}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kéo thả để đổi lịch · Màu badge = màu nhận diện của brand</p>
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
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border-2 border-dashed border-slate-400 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase">
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
                    : "bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400"
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
                      ? "bg-blue-100 dark:bg-blue-950/80 border-2 border-dashed border-blue-400 scale-[1.02] shadow-xl shadow-blue-500/20"
                      : !cell.isCurrentMonth
                      ? "bg-slate-100/60 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/40 opacity-40 hover:opacity-80"
                      : isToday
                      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400 shadow-md"
                      : isSelected
                      ? "bg-blue-50 dark:bg-blue-950/50 border-blue-500 shadow-md shadow-blue-600/10"
                      : campaignDay
                      ? CAMPAIGN_DAY_STYLES[campaignDay.type].cell
                      : "bg-white dark:bg-slate-950/80 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
                  }`}
                >
                  {isToday && (
                    <span className="absolute -top-2 right-1.5 shrink-0 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white leading-none shadow-md z-10 tracking-wide">
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
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-700 dark:text-slate-300"
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
                          🏷️
                        </span>
                      )}
                      {hasLiveNow && (
                        <span className="text-[8px] sm:text-[9px] font-black px-1.5 py-0.5 rounded-full bg-rose-600 text-white animate-pulse tracking-wide">
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Session badges in cell — card to theo màu brand (lib/brandTheme.ts) */}
                  <div className="space-y-1.5 my-1 flex-1">
                    {daySessions.slice(0, MONTH_CELL_MAX_SESSIONS).map((ds) => (
                      <SessionEventCard
                        key={ds.id}
                        theme={getBrandTheme(ds.brandName)}
                        brand={brandById.get(ds.brandId)}
                        brandName={ds.brandName}
                        startTime={ds.startTime}
                        endTime={ds.endTime}
                        meta={buildSessionMeta(ds)}
                        metaLimit={3}
                        tone={SESSION_TONE[ds.status]}
                        statusLabel={SESSION_STATUS_LABEL[ds.status]}
                        dragging={draggedSessionId === ds.id}
                        draggable
                        tooltip={`${ds.title} · ${ds.studioName} · Host ${ds.hostName}${
                          ds.coHostName ? ` · Co-Host ${ds.coHostName}` : ""
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
                    {daySessions.length > MONTH_CELL_MAX_SESSIONS && (
                      <span className="text-[9px] text-slate-500 font-bold block">
                        + {daySessions.length - MONTH_CELL_MAX_SESSIONS} phiên nữa...
                      </span>
                    )}
                    {daySlots.slice(0, MONTH_CELL_MAX_SLOTS).map((sl) => (
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
                    {daySlots.length > MONTH_CELL_MAX_SLOTS && (
                      <span className="text-[9px] text-amber-600 dark:text-amber-500 font-bold block">
                        + {daySlots.length - MONTH_CELL_MAX_SLOTS} ca chờ ĐK nữa...
                      </span>
                    )}
                  </div>

                  {/* Day total GMV */}
                  {totalGmvTarget > 0 ? (
                    <div className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 pt-1 border-t border-slate-200 dark:border-slate-800/60 truncate">
                      Target: {(totalGmvTarget / 1000000).toFixed(0)}M
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-400 dark:text-slate-600 italic">Trống lịch</div>
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
        <div className="bg-[#f8f9fa] dark:bg-slate-900 border border-pink-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" /> Lịch Vận Hành Tuần
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kéo thả để đổi lịch</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {currentWeekDates.map((wDay) => {
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
                  className={`bg-white dark:bg-slate-950 rounded-2xl p-3 border space-y-3 transition-all ${
                    isWeekHovered
                      ? "border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-950/40 shadow-xl shadow-blue-500/20 scale-[1.01]"
                      : isSelected
                      ? "border-blue-500/80 bg-blue-50/60 dark:bg-blue-950/20"
                      : "border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {campaignDay && <CampaignDayBanner info={campaignDay} className="-mt-0.5" />}
                  <div
                    onClick={() => setSelectedDate(wDay.dateStr)}
                    className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800/80 pb-2 cursor-pointer"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                        {wDay.dayName}
                        {daySchemes.length > 0 && (
                          <span title={daySchemes.map((s) => `${s.title}${s.description ? ` — ${s.description}` : ""}`).join("\n")}>
                            🏷️
                          </span>
                        )}
                      </span>
                      <strong className={`text-sm font-mono font-bold ${isToday ? "text-blue-600 dark:text-blue-400" : "text-slate-900 dark:text-white"}`}>
                        {wDay.dayNum}/{parseDateString(wDay.dateStr).month}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 font-bold px-2 py-0.5 rounded-full">
                        {daySessions.length}
                      </span>
                      {daySlots.length > 0 && (
                        <span className="text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700/50 font-bold px-2 py-0.5 rounded-full">
                          {daySlots.length} chờ ĐK
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Session cards under this day */}
                  <div className="space-y-2 min-h-[160px]">
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
                        meta={buildSessionMeta(ds)}
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
                          setNewDate(wDay.dateStr);
                          setIsBookingModalOpen(true);
                        }}
                        className={`h-24 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                          isWeekHovered
                            ? "border-blue-400 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-300 font-bold"
                            : "border-slate-300 dark:border-slate-800/80 hover:border-blue-400 dark:hover:border-blue-500/50 text-slate-400 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400"
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

      {/* VIEW 3: DAY MATRIX VIEW (Ma Trận Phòng Studio Với 5 Ca Cố Định) */}
      {viewMode === "day" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400 shrink-0" /> Ma Trận Phân Bổ Phòng Studio - Ngày {selectedDate} ({getDayOfWeekName(selectedDate)})
                {(() => {
                  const campaignDay = getCampaignDayInfo(selectedDate);
                  return campaignDay ? <CampaignDayBanner info={campaignDay} /> : null;
                })()}
              </h3>
              <p className="text-xs text-slate-400">Kéo thả ca live vào bất kỳ ô Studio/Ca Live để đổi phòng hoặc ca làm việc linh hoạt</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-rose-400"><span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span> Live</span>
              <span className="flex items-center gap-1 text-blue-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Đã Đặt</span>
              <span className="flex items-center gap-1 text-amber-400"><span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span> Chờ Đăng Ký</span>
              <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> Trống</span>
            </div>
          </div>

          {/* Table Container with Sticky Room Name Column */}
          <div className="overflow-x-auto relative rounded-xl border border-slate-800/80 scrollbar-thin">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold text-slate-400 bg-slate-950">
                  <th className="p-3 w-48 uppercase tracking-wider sticky left-0 bg-slate-950 z-20 border-r border-slate-800 shadow-md">
                    Phòng Studio
                  </th>
                  {FIXED_TIME_SLOTS.map((slot) => (
                    <th key={slot.id} className="p-3 text-center border-r border-slate-800/80 min-w-[170px] bg-slate-950">
                      <div className="font-mono text-white text-xs">{slot.label}</div>
                      <span className="text-[10px] text-slate-400 font-medium line-clamp-1">{slot.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {studios.map((std) => (
                  <tr key={std.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="p-3 font-bold text-white sticky left-0 bg-slate-900 z-10 border-r border-slate-800 shadow-md">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-blue-400 shrink-0">🏢</span>
                        <div>
                          <p className="text-xs sm:text-sm font-bold text-white line-clamp-1">{std.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{std.roomNumber}</p>
                        </div>
                      </div>
                    </td>

                    {FIXED_TIME_SLOTS.map((slot) => {
                      const matchedSession = filteredSessions.find(
                        (s) =>
                          s.date === selectedDate &&
                          s.studioId === std.id &&
                          s.startTime < slot.end &&
                          s.endTime > slot.start &&
                          s.status !== "Cancelled"
                      );
                      const matchedSlot = !matchedSession
                        ? openSlots.find(
                            (sl) =>
                              sl.date === selectedDate &&
                              sl.studioId === std.id &&
                              sl.startTime < slot.end &&
                              sl.endTime > slot.start
                          )
                        : undefined;

                      const matrixCellKey = `matrix_${std.id}_${slot.id}`;
                      const isMatrixHovered = dragOverCellKey === matrixCellKey;

                      return (
                        <td
                          key={slot.id}
                          onDragOver={(e) => handleDragOver(e, matrixCellKey)}
                          onDragLeave={(e) => handleDragLeave(e, matrixCellKey)}
                          onDrop={(e) => handleDropOnDayMatrix(e, std, slot)}
                          className={`p-2 border-r border-slate-800/60 align-top transition-all ${
                            isMatrixHovered ? "bg-blue-950/80 border-2 border-dashed border-blue-400 scale-[1.01]" : ""
                          }`}
                        >
                          {matchedSession ? (
                            <SessionEventCard
                              theme={getBrandTheme(matchedSession.brandName)}
                              brand={brandById.get(matchedSession.brandId)}
                              brandName={matchedSession.brandName}
                              startTime={matchedSession.startTime}
                        endTime={matchedSession.endTime}
                              title={matchedSession.title}
                              meta={buildSessionMeta(matchedSession)}
                              size="md"
                              tone={SESSION_TONE[matchedSession.status]}
                              statusLabel={SESSION_STATUS_LABEL[matchedSession.status]}
                              dragging={draggedSessionId === matchedSession.id}
                              draggable
                              tooltip="Kéo để đổi ca"
                              onDragStart={(e) => handleDragStart(e, matchedSession)}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedSessionDetail(matchedSession)}
                            />
                          ) : matchedSlot ? (
                            <SessionEventCard
                              theme={getBrandTheme(matchedSlot.brandName)}
                              brand={brandById.get(matchedSlot.brandId ?? "")}
                              brandName={matchedSlot.brandName}
                              startTime={matchedSlot.startTime}
                        endTime={matchedSlot.endTime}
                              meta={buildSlotMeta(matchedSlot)}
                              size="md"
                              tone="pending"
                              pending
                              tooltip={`Ca chờ đăng ký · ${matchedSlot.startTime}-${matchedSlot.endTime} · Bấm để xem/đăng ký/chốt lịch`}
                              onClick={() => setSelectedSlotDetail(matchedSlot)}
                            />
                          ) : (
                            <div
                              onClick={() => {
                                setNewStudioId(std.id);
                                setNewDate(selectedDate);
                                setNewStartTime(slot.start);
                                setNewEndTime(slot.end);
                                setIsBookingModalOpen(true);
                              }}
                              className={`h-20 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                                isMatrixHovered
                                  ? "border-emerald-400 bg-emerald-950/50 text-emerald-300 font-bold scale-105"
                                  : "border-slate-800/80 hover:border-blue-500/50 hover:bg-blue-950/20 text-slate-600 hover:text-blue-400"
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              <span className="text-[10px] font-semibold">
                                {isMatrixHovered ? "Thả vào đây" : "Trống - Đặt"}
                              </span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: TALENT WORKLOAD */}
      {viewMode === "talent_workload" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <User className="w-5 h-5 text-blue-400 shrink-0" /> Tải Làm Việc Host & KOC - Ngày {selectedDate}
              </h3>
              <p className="text-xs text-slate-400">Tổng thời lượng live trong ngày</p>
            </div>
            <span className="bg-blue-950 text-blue-300 border border-blue-800/80 text-xs font-bold px-3 py-1 rounded-full self-start sm:self-auto">
              Max Khuyên Dùng: 6 giờ / ngày
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {talents.map((t) => {
              const hostSessions = sessions.filter((s) => s.hostId === t.id && s.date === selectedDate && s.status !== "Cancelled");
              const totalHoursToday = hostSessions.reduce((acc, curr) => {
                const [h1] = curr.startTime.split(":").map(Number);
                const [h2] = curr.endTime.split(":").map(Number);
                return acc + (h2 - h1);
              }, 0);

              const isOverloaded = totalHoursToday > 5;

              return (
                <div key={t.id} className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center space-x-3">
                      <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-sm line-clamp-1">{t.name}</h4>
                        <span className="text-xs text-blue-400 font-medium">{t.role} • Score: {t.overallScore}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                        isOverloaded
                          ? "bg-rose-950 text-rose-300 border border-rose-800"
                          : totalHoursToday > 0
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isOverloaded ? "⚠️ Cảnh Báo Quá Tải" : totalHoursToday > 0 ? "Bận Phiên Live" : "Rảnh"}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between font-medium">
                      <span className="text-slate-400">Tổng giờ live ngày {selectedDate}:</span>
                      <strong className={isOverloaded ? "text-rose-400" : "text-emerald-400"}>{totalHoursToday} Giờ Live</strong>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isOverloaded ? "bg-rose-500" : "bg-blue-500"}`}
                        style={{ width: `${Math.min(100, (totalHoursToday / 6) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-slate-800">
                    <span className="text-[10px] font-bold text-slate-500 uppercase block">Phiên Được Phân Bổ:</span>
                    {hostSessions.length > 0 ? (
                      hostSessions.map((hs) => (
                        <div key={hs.id} className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs flex justify-between items-center gap-2">
                          <span className="font-bold text-slate-200 truncate">{hs.title}</span>
                          <span className="font-mono text-[10px] text-blue-400 shrink-0">{hs.startTime}-{hs.endTime}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">Chưa có lịch phiên live trong ngày này.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 5: LIST VIEW */}
      {viewMode === "list" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white text-base">Danh Sách Tất Cả Các Phiên Live &amp; Ca Chờ Đăng Ký</h3>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950">
                  <th className="p-3">Tên Phiên Live & Brand</th>
                  <th className="p-3">Ngày & Khung Giờ</th>
                  <th className="p-3">Phòng Studio</th>
                  <th className="p-3">Host & KOC</th>
                  <th className="p-3">Mục Tiêu GMV</th>
                  <th className="p-3 text-right">Trạng Thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredSessions.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => setSelectedSessionDetail(s)}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                  >
                    <td className="p-3 font-bold text-white">
                      <div>{s.title}</div>
                      <span className="text-[10px] text-blue-400 font-semibold inline-flex items-center gap-1"><BrandLogo brand={brandById.get(s.brandId)} size="xs" /> {s.brandName}</span>
                    </td>
                    <td className="p-3 font-mono text-slate-300">
                      {s.date} <strong className="text-white block">{s.startTime} - {s.endTime}</strong>
                    </td>
                    <td className="p-3 text-slate-300">{s.studioName}</td>
                    <td className="p-3 font-medium text-slate-200">{s.hostName}</td>
                    <td className="p-3 font-mono font-bold text-emerald-400">{s.targetGmv.toLocaleString()} đ</td>
                    <td className="p-3 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          s.status === "Live Now"
                            ? "bg-rose-600 text-white animate-pulse"
                            : s.status === "Completed"
                            ? "bg-slate-800 text-slate-300"
                            : "bg-blue-600/20 text-blue-400"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {openSlots.map((sl) => (
                  <tr key={sl.id} onClick={() => setSelectedSlotDetail(sl)} className="hover:bg-amber-950/20 transition-colors cursor-pointer">
                    <td className="p-3 font-bold text-amber-100">
                      <div>{sl.notes || "Ca chờ đăng ký"}</div>
                      <span className="text-[10px] text-amber-400 font-semibold inline-flex items-center gap-1"><BrandLogo brand={brandById.get(sl.brandId)} size="xs" /> {sl.brandName}</span>
                    </td>
                    <td className="p-3 font-mono text-slate-300">
                      {sl.date} <strong className="text-white block">{sl.startTime} - {sl.endTime}</strong>
                    </td>
                    <td className="p-3 text-slate-300">{sl.studioName}</td>
                    <td className="p-3 font-medium text-amber-300/80 italic">Chưa có Host</td>
                    <td className="p-3 font-mono font-bold text-slate-500">—</td>
                    <td className="p-3 text-right">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/60 text-amber-400 border border-amber-700/50">
                        Chờ ĐK
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QUICK BOOKING MODAL */}
      {isBookingModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl overflow-y-auto max-h-[92vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-base sm:text-lg">Đặt Lịch Phiên Live Mới</h3>
              </div>
              <button
                onClick={() => setIsBookingModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chế độ tạo: Session đã có host hay Ca mở chờ đăng ký */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setBookingMode("session")}
                className={`flex-1 px-3 py-2 rounded-lg transition-all ${
                  bookingMode === "session" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Tạo Session Trực Tiếp (đã có Host)
              </button>
              <button
                type="button"
                onClick={() => setBookingMode("slot")}
                className={`flex-1 px-3 py-2 rounded-lg transition-all ${
                  bookingMode === "slot" ? "bg-blue-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Mở Ca Chờ Đăng Ký
              </button>
            </div>
            {bookingMode === "slot" && (
              <p className="text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl p-2.5">
                Ca sẽ hiện ở "Đăng Ký &amp; Chốt Lịch" để host tự đăng ký — Ops chốt Host chính thức sau, chưa cần chọn Host ở đây.
              </p>
            )}

            {/* AI Optimizer Trigger Button */}
            <div className={`bg-gradient-to-r from-blue-950 to-indigo-950 border border-blue-800/80 p-3.5 rounded-xl space-y-2 ${bookingMode === "slot" ? "opacity-40 pointer-events-none" : ""}`}>
              <div className="flex justify-between items-center flex-wrap gap-2">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0" /> Gemini AI Schedule Matching
                </span>
                <button
                  type="button"
                  onClick={handleAiOptimizeSchedule}
                  disabled={isOptimizingSchedule}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow transition-all active:scale-95"
                >
                  <Zap className="w-3.5 h-3.5" /> {isOptimizingSchedule ? "Đang phân tích..." : "Gợi Ý Khung Giờ Vàng AI"}
                </button>
              </div>
              {aiSuggestion && (
                <div className="text-xs text-slate-200 font-mono whitespace-pre-line bg-slate-950/80 p-3 rounded-lg border border-blue-500/30">
                  {aiSuggestion}
                </div>
              )}
            </div>

            {/* Quick Shift Slot Presets */}
            <div className="space-y-1 text-xs">
              <label className="font-bold text-slate-300 block">Chọn Nhanh Ca Live Cố Định:</label>
              <div className="flex flex-wrap gap-1.5">
                {FIXED_TIME_SLOTS.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => {
                      setNewStartTime(st.start);
                      setNewEndTime(st.end);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border font-mono font-bold text-[11px] transition-all ${
                      newStartTime === st.start && newEndTime === st.end
                        ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {st.label} ({st.name.split(" ")[0]})
                  </button>
                ))}
              </div>
            </div>

            {/* Conflict Warnings */}
            {(currentFormConflicts.studioConflict || currentFormConflicts.hostConflict) && (
              <div className="p-3.5 bg-rose-950/80 border border-rose-700/80 rounded-xl text-xs space-y-1 text-rose-200 font-medium">
                <div className="flex items-center gap-1.5 font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" /> XUNG ĐỘT LỊCH ĐƯỢC PHÁT HIỆN:
                </div>
                {currentFormConflicts.studioConflict && (
                  <p>• Trùng Studio: Phòng đã có phiên live "{currentFormConflicts.studioConflictWith}"!</p>
                )}
                {currentFormConflicts.hostConflict && (
                  <p>• Trùng Host: Host đã có lịch phiên "{currentFormConflicts.hostConflictWith}"!</p>
                )}
              </div>
            )}

            <form onSubmit={handleSaveBooking} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-300 block mb-1">Tiêu Đề Chiến Dịch / Phiên Live:</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Mega Live 8/8 Flash Sale Mỹ Phẩm Cocoon"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Thương Hiệu (Brand):</label>
                  <select
                    value={newBrandId}
                    onChange={(e) => setNewBrandId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.industry})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Phòng Studio:</label>
                  <select
                    value={newStudioId}
                    onChange={(e) => setNewStudioId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    {studios.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.roomNumber})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {bookingMode === "session" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Host Chính (Main Host):</label>
                  <select
                    value={newHostId}
                    onChange={(e) => setNewHostId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    {talents.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role} • CVR: {t.cvrAvg}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Co-Host (tuỳ chọn):</label>
                  <select
                    value={newCoHostId}
                    onChange={(e) => setNewCoHostId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">-- Không có Co-Host --</option>
                    {talents.filter((t) => t.id !== newHostId).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Trợ Lý Vận Hành (Moderator):</label>
                  <select
                    value={newAssistantId}
                    onChange={(e) => setNewAssistantId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  >
                    <option value="">-- Chưa gán Trợ Lý --</option>
                    {moderators.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.customRoleTitle || "Moderator"})
                      </option>
                    ))}
                  </select>
                  {moderators.length === 0 && (
                    <p className="text-[10px] text-amber-400 mt-1">
                      Chưa có tài khoản role Moderator nào — tạo ở tab Users &amp; Permissions.
                    </p>
                  )}
                </div>
              </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Ngày Live:</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Giờ Bắt Đầu:</label>
                  <input
                    type="time"
                    value={newStartTime}
                    onChange={(e) => setNewStartTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Giờ Kết Thúc:</label>
                  <input
                    type="time"
                    value={newEndTime}
                    onChange={(e) => setNewEndTime(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {bookingMode === "session" && (
              <div>
                <label className="font-bold text-slate-300 block mb-1">KPI Target GMV Cam Kết (VNĐ):</label>
                <input
                  type="number"
                  value={newTargetGmv}
                  onChange={(e) => setNewTargetGmv(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
                />
              </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsBookingModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-600/30"
                >
                  Xác Nhận Đặt Lịch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SESSION DETAIL MODAL */}
      {selectedSessionDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-4 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold text-blue-400 uppercase font-mono inline-flex items-center gap-1">
                  <BrandLogo brand={brandById.get(selectedSessionDetail.brandId)} size="xs" /> {selectedSessionDetail.brandName}
                </span>
                <h3 className="font-bold text-white text-base sm:text-lg">{selectedSessionDetail.title}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onUpdateSession && !isEditingDetail && (
                  <button
                    onClick={() => openEditDetail(selectedSessionDetail)}
                    className="text-[11px] font-bold text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg border border-blue-800/60 bg-blue-950/40"
                  >
                    Sửa
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedSessionDetail(null);
                    setIsEditingDetail(false);
                  }}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {isEditingDetail ? (
              <div className="space-y-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
                {(currentEditConflicts.studioConflict || currentEditConflicts.hostConflict) && (
                  <div className="p-2.5 bg-rose-950/80 border border-rose-700/80 rounded-xl text-[11px] space-y-1 text-rose-200 font-medium">
                    {currentEditConflicts.studioConflict && <p>• Trùng Studio: "{currentEditConflicts.studioConflictWith}"!</p>}
                    {currentEditConflicts.hostConflict && <p>• Trùng Host: "{currentEditConflicts.hostConflictWith}"!</p>}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Ngày:</label>
                    <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Giờ bắt đầu:</label>
                    <input type="time" value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                  </div>
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Giờ kết thúc:</label>
                    <input type="time" value={editEndTime} onChange={(e) => setEditEndTime(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono" />
                  </div>
                </div>
                <div>
                  <label className="font-bold text-slate-400 block mb-1">Phòng Studio:</label>
                  <select value={editStudioId} onChange={(e) => setEditStudioId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white">
                    {studios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Host chính:</label>
                    <select value={editHostId} onChange={(e) => setEditHostId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white">
                      {talents.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-400 block mb-1">Co-Host:</label>
                    <select value={editCoHostId} onChange={(e) => setEditCoHostId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white">
                      <option value="">-- Không có --</option>
                      {talents.filter((t) => t.id !== editHostId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setIsEditingDetail(false)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold text-[11px]"
                  >
                    Huỷ
                  </button>
                  <button
                    onClick={handleSaveDetailEdit}
                    disabled={savingEdit}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold text-[11px]"
                  >
                    {savingEdit ? "Đang lưu..." : "Lưu Thay Đổi"}
                  </button>
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>Ngày Live: <strong className="text-white block font-mono">{selectedSessionDetail.date}</strong></div>
              <div>Khung giờ: <strong className="text-white block font-mono">{selectedSessionDetail.startTime} - {selectedSessionDetail.endTime}</strong></div>
              <div>Phòng Studio: <strong className="text-white block">{selectedSessionDetail.studioName}</strong></div>
              <div>Host chính: <strong className="text-white block">{selectedSessionDetail.hostName}</strong></div>
              {selectedSessionDetail.coHostName && (
                <div>Co-Host: <strong className="text-white block">{selectedSessionDetail.coHostName}</strong></div>
              )}
              <div>Trợ lý / Moderator: <strong className="text-white block">{selectedSessionDetail.assistantName}</strong></div>
              <div>Target GMV: <strong className="text-emerald-400 block font-mono font-bold">{selectedSessionDetail.targetGmv.toLocaleString()} VNĐ</strong></div>
            </div>
            )}

            <div className="space-y-2 text-xs">
              <h4 className="font-bold text-slate-300">Checklist Chuẩn Bị ({selectedSessionDetail.checklist.filter(c => c.completed).length}/{selectedSessionDetail.checklist.length}):</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {selectedSessionDetail.checklist.map((ck) => (
                  <div key={ck.id} className="p-2 bg-slate-950 rounded-lg border border-slate-800/80 flex items-center justify-between">
                    <span className={`text-slate-300 ${ck.completed ? "line-through opacity-60" : ""}`}>{ck.task}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ck.completed ? "bg-emerald-950 text-emerald-400" : "bg-amber-950 text-amber-400"}`}>
                      {ck.completed ? "Đã xong" : "Chưa làm"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
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
