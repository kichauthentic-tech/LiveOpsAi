import React, { useState, useEffect } from "react";
import { LiveSession, Studio, Talent, Brand } from "../types";
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

export interface TimeSlot {
  id: string;
  label: string;
  start: string;
  end: string;
  name: string;
}

interface LiveCalendarProps {
  sessions: LiveSession[];
  studios: Studio[];
  talents: Talent[];
  brands: Brand[];
  onAddSession?: (newSession: LiveSession) => void;
}

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
  studios,
  talents,
  brands,
  onAddSession
}) => {
  // Sync sessions with propSessions so clean test mode is respected
  const [sessions, setSessions] = useState<LiveSession[]>(propSessions);

  useEffect(() => {
    setSessions(propSessions);
  }, [propSessions]);

  // View Mode: Month, Week, Day Matrix, Talent Workload, List
  const [viewMode, setViewMode] = useState<"month" | "week" | "day" | "talent_workload" | "list">("day");

  // Selected Date string YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState<string>("2026-07-23");

  // Selected Month Year state for Month view navigation (default July 2026)
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(7); // 1-indexed (July = 7)

  // Filters
  const [selectedStudioFilter, setSelectedStudioFilter] = useState<string>("ALL");
  const [selectedHostFilter, setSelectedHostFilter] = useState<string>("ALL");
  const [selectedBrandFilter, setSelectedBrandFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [selectedSessionDetail, setSelectedSessionDetail] = useState<LiveSession | null>(null);

  // New Booking Form State
  const [newTitle, setNewTitle] = useState("");
  const [newBrandId, setNewBrandId] = useState(brands[0]?.id || "");
  const [newStudioId, setNewStudioId] = useState(studios[0]?.id || "");
  const [newHostId, setNewHostId] = useState(talents[0]?.id || "");
  const [newDate, setNewDate] = useState(selectedDate);
  const [newStartTime, setNewStartTime] = useState("14:00");
  const [newEndTime, setNewEndTime] = useState("17:00");
  const [newTargetGmv, setNewTargetGmv] = useState(200000000);
  const [newAssistant, setNewAssistant] = useState("Lê Minh Tuấn (Moderator)");

  // AI Recommendation State
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

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

  const handleDropOnDayMatrix = (e: React.DragEvent, targetStudio: Studio, targetSlot: TimeSlot) => {
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
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            studioId: targetStudio.id,
            studioName: targetStudio.name,
            startTime: targetSlot.start,
            endTime: targetSlot.end,
            date: selectedDate
          };
        }
        return s;
      })
    );

    showToast(
      `✨ Đã chuyển phiên live "${session.brandName}" sang ${targetStudio.name} (${targetSlot.label})!`,
      "success"
    );
    setDraggedSessionId(null);
  };

  const handleDropOnWeekDay = (e: React.DragEvent, targetDateStr: string) => {
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

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            date: targetDateStr
          };
        }
        return s;
      })
    );

    showToast(
      `✨ Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
      "success"
    );
    setDraggedSessionId(null);
  };

  const handleDropOnMonthDay = (e: React.DragEvent, targetDateStr: string) => {
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

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === sessionId) {
          return {
            ...s,
            date: targetDateStr
          };
        }
        return s;
      })
    );

    showToast(
      `✨ Đã chuyển phiên live "${session.brandName}" sang ngày ${targetDateStr}!`,
      "success"
    );
    setDraggedSessionId(null);
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
    const today = "2026-07-23";
    setSelectedDate(today);
    setCurrentYear(2026);
    setCurrentMonth(7);
  };

  // Conflict Checker
  const checkConflicts = (studioId: string, hostId: string, date: string, start: string, end: string) => {
    const conflicts = {
      studioConflict: false,
      hostConflict: false,
      studioConflictWith: "",
      hostConflictWith: ""
    };

    sessions.forEach((s) => {
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

  // Save new session
  const handleSaveBooking = (e: React.FormEvent) => {
    e.preventDefault();
    const brandObj = brands.find((b) => b.id === newBrandId);
    const studioObj = studios.find((s) => s.id === newStudioId);
    const hostObj = talents.find((t) => t.id === newHostId);

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
      assistantName: newAssistant,
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
        { id: "c3", task: "Duyệt danh sách SKU & Mã Giảm Giá TikTok Shop", category: "TikTok App", completed: false, assignedTo: newAssistant },
        { id: "c4", task: "Duyệt Kịch bản chốt đơn & tung Deal Flash Sale", category: "Host & Script", completed: false, assignedTo: hostObj?.name || "Host" }
      ],
      minuteMetrics: []
    };

    setSessions([createdSession, ...sessions]);
    if (onAddSession) onAddSession(createdSession);

    setIsBookingModalOpen(false);
    setNewTitle("");
    setAiSuggestion(null);
  };

  // AI Optimizer
  const handleAiOptimizeSchedule = () => {
    const brandObj = brands.find((b) => b.id === newBrandId);
    const brandName = brandObj?.name || "Thương hiệu";
    const industry = brandObj?.industry || "Thương mại điện tử";

    let suggestedSlot = "20:00 - 23:00";
    let suggestedHost = "Yến Nhi (Nhi Nham Nho)";
    let reason = "Ngành Beauty/Mỹ phẩm có CVR cao nhất vào khung giờ Tối Đêm Vàng. Host Yến Nhi có CVR 5.4% cao nhất dàn KOC.";

    if (industry.includes("Thời trang") || industry.includes("Nam")) {
      suggestedSlot = "14:00 - 17:00";
      suggestedHost = "Hoàng Nam (Nam Style)";
      reason = "Ngành Thời trang Nam đạt đòn bẩy đơn cao vào chiều trước giờ tan tầm. Hoàng Nam từng mang lại 2.18 tỷ GMV.";
    } else if (industry.includes("Gia dụng")) {
      suggestedSlot = "11:00 - 14:00";
      suggestedHost = "Bích Ngọc (Ngọc Skincare)";
      reason = "Gia dụng bếp phù hợp nghỉ trưa dân văn phòng.";
    }

    setNewStartTime(suggestedSlot.split(" - ")[0]);
    setNewEndTime(suggestedSlot.split(" - ")[1]);
    const matchedHost = talents.find((t) => t.name.includes(suggestedHost.split(" ")[0])) || talents[0];
    if (matchedHost) setNewHostId(matchedHost.id);

    setAiSuggestion(
      `🤖 Gemini AI Recommendation cho ${brandName} (${industry}):\n` +
      `• Khung giờ Vàng tối ưu: ${suggestedSlot}\n` +
      `• Host đề xuất: ${suggestedHost}\n` +
      `• Lý do: ${reason}\n` +
      `• Dự báo GMV tiềm năng: +25% so với phiên thường.`
    );
  };

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

  // Calculate Occupancy KPI for selected date
  const totalSlotsForDay = FIXED_TIME_SLOTS.length * studios.length;
  const bookedSlotsCount = sessions.filter((s) => s.date === selectedDate && s.status !== "Cancelled").length;
  const occupancyPercent = Math.min(100, Math.round((bookedSlotsCount / totalSlotsForDay) * 100));

  // Current Week dates for Week View
  const currentWeekDates = getWeekDates(selectedDate);

  // Month Grid Days for Month View
  const monthGridDays = getMonthGridDays(currentYear, currentMonth);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-blue-400 font-semibold text-[11px] sm:text-xs uppercase tracking-wider flex items-center gap-1.5">
            <CalendarIcon className="w-4 h-4 text-blue-400 shrink-0" /> Operating Calendar & Multi-View Studio Allocator
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Lịch Vận Hành Phiên Live (Xem Theo Ngày / Tuần / Tháng)
          </h2>
          <p className="text-slate-400 text-xs leading-relaxed">
            Điều phối phòng Studio, phân bổ Host & KOC, tự động phát hiện xung đột lịch theo ca cố định
          </p>
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
              <Layers className="w-3.5 h-3.5" /> Tất Cả ({filteredSessions.length})
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

      {/* DRAG & DROP HELPER BANNER */}
      {draggedSessionId ? (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-4 py-3 rounded-2xl shadow-xl border border-blue-400/50 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <GripVertical className="w-5 h-5 text-amber-300 shrink-0" />
            <span>ĐANG KÉO PHIÊN LIVE: Thả vào ô Studio / Ca Live (Lịch Ngày) hoặc Cột Ngày (Lịch Tuần/Tháng) để đổi lịch trực tiếp!</span>
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
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-3 gap-2">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-400 shrink-0" /> Tổng Quan Lịch Tháng {currentMonth}/{currentYear}
              </h3>
              <p className="text-xs text-slate-400">Kéo thả ca live vào ngày bất kỳ để thay đổi ngày diễn ra phiên live</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-rose-400"><span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span> Live Now</span>
              <span className="flex items-center gap-1 text-blue-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Có phiên live</span>
            </div>
          </div>

          {/* Month Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Header days of week */}
            {["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"].map((d, idx) => (
              <div key={idx} className="p-2 text-center text-slate-400 font-bold text-xs uppercase bg-slate-950/80 rounded-lg">
                {d}
              </div>
            ))}

            {/* Grid Days */}
            {monthGridDays.map((cell, idx) => {
              const daySessions = filteredSessions.filter((s) => s.date === cell.dateStr && s.status !== "Cancelled");
              const isSelected = cell.dateStr === selectedDate;
              const isToday = cell.dateStr === "2026-07-23";
              const totalGmvTarget = daySessions.reduce((acc, curr) => acc + curr.targetGmv, 0);
              const hasLiveNow = daySessions.some((s) => s.status === "Live Now");

              const monthCellKey = `month_${cell.dateStr}`;
              const isMonthHovered = dragOverCellKey === monthCellKey;

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
                  className={`min-h-[90px] sm:min-h-[110px] p-2 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isMonthHovered
                      ? "bg-blue-950/80 border-2 border-dashed border-blue-400 scale-[1.02] shadow-xl shadow-blue-500/20"
                      : !cell.isCurrentMonth
                      ? "bg-slate-950/30 border-slate-800/40 opacity-40 hover:opacity-80"
                      : isSelected
                      ? "bg-blue-950/50 border-blue-500 shadow-md shadow-blue-600/10"
                      : "bg-slate-950/80 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-xs font-mono font-bold w-6 h-6 rounded-full flex items-center justify-center ${
                        isToday
                          ? "bg-blue-600 text-white"
                          : isSelected
                          ? "bg-blue-950 text-blue-400 border border-blue-500"
                          : "text-slate-300"
                      }`}
                    >
                      {cell.dayNum}
                    </span>
                    {daySessions.length > 0 && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${hasLiveNow ? "bg-rose-600 text-white animate-pulse" : "bg-blue-600/20 text-blue-400 border border-blue-500/30"}`}>
                        {daySessions.length} phiên
                      </span>
                    )}
                  </div>

                  {/* Session badges in cell */}
                  <div className="space-y-1 my-1">
                    {daySessions.slice(0, 2).map((ds) => (
                      <div
                        key={ds.id}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          handleDragStart(e, ds);
                        }}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSessionDetail(ds);
                        }}
                        className={`text-[9px] p-1 rounded font-medium truncate flex items-center gap-1 cursor-grab active:cursor-grabbing hover:opacity-90 ${
                          draggedSessionId === ds.id ? "opacity-30 border-dashed border-amber-400" : ""
                        } ${
                          ds.status === "Live Now" ? "bg-rose-950 text-rose-300 border border-rose-800" : "bg-slate-900 text-slate-300 border border-slate-800"
                        }`}
                        title="Kéo thả sang ngày khác để chuyển lịch"
                      >
                        <GripVertical className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                        <strong className="text-white">{ds.startTime}</strong> {ds.brandName}
                      </div>
                    ))}
                    {daySessions.length > 2 && (
                      <span className="text-[9px] text-slate-500 font-bold block">+ {daySessions.length - 2} phiên nữa...</span>
                    )}
                  </div>

                  {/* Day total GMV */}
                  {totalGmvTarget > 0 ? (
                    <div className="text-[9px] font-mono font-bold text-emerald-400 pt-1 border-t border-slate-800/60 truncate">
                      Target: {(totalGmvTarget / 1000000).toFixed(0)}M
                    </div>
                  ) : (
                    <div className="text-[9px] text-slate-600 italic">Trống lịch</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: WEEK VIEW (Lịch Tuần - 7 Ngày Từ T2 Đến CN) */}
      {viewMode === "week" && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-blue-400" /> Lịch Vận Hành Tuần
              </h3>
              <p className="text-xs text-slate-400">Kéo thả phiên live sang các cột ngày trong tuần để chuyển ngày làm việc</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {currentWeekDates.map((wDay) => {
              const daySessions = filteredSessions.filter((s) => s.date === wDay.dateStr && s.status !== "Cancelled");
              const isSelected = wDay.dateStr === selectedDate;
              const isToday = wDay.dateStr === "2026-07-23";

              const weekCellKey = `week_${wDay.dateStr}`;
              const isWeekHovered = dragOverCellKey === weekCellKey;

              return (
                <div
                  key={wDay.dateStr}
                  onDragOver={(e) => handleDragOver(e, weekCellKey)}
                  onDragLeave={(e) => handleDragLeave(e, weekCellKey)}
                  onDrop={(e) => handleDropOnWeekDay(e, wDay.dateStr)}
                  className={`bg-slate-950 rounded-2xl p-3 border space-y-3 transition-all ${
                    isWeekHovered
                      ? "border-2 border-dashed border-blue-400 bg-blue-950/40 shadow-xl shadow-blue-500/20 scale-[1.01]"
                      : isSelected
                      ? "border-blue-500/80 bg-blue-950/20"
                      : "border-slate-800"
                  }`}
                >
                  <div
                    onClick={() => setSelectedDate(wDay.dateStr)}
                    className="flex justify-between items-center border-b border-slate-800/80 pb-2 cursor-pointer"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">{wDay.dayName}</span>
                      <strong className={`text-sm font-mono font-bold ${isToday ? "text-blue-400" : "text-white"}`}>
                        {wDay.dayNum}/{parseDateString(wDay.dateStr).month}
                      </strong>
                    </div>
                    <span className="text-[10px] bg-slate-900 text-slate-400 font-bold px-2 py-0.5 rounded-full">
                      {daySessions.length}
                    </span>
                  </div>

                  {/* Session cards under this day */}
                  <div className="space-y-2 min-h-[160px]">
                    {daySessions.map((ds) => (
                      <div
                        key={ds.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, ds)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedSessionDetail(ds)}
                        className={`p-2.5 rounded-xl border text-xs space-y-1 cursor-grab active:cursor-grabbing transition-all hover:scale-[1.02] ${
                          draggedSessionId === ds.id ? "opacity-30 border-dashed border-amber-400" : ""
                        } ${
                          ds.status === "Live Now"
                            ? "bg-rose-950/60 border-rose-500/60 text-white shadow animate-pulse"
                            : "bg-slate-900 border-slate-800 text-slate-200 hover:border-blue-500/50"
                        }`}
                        title="Kéo thả sang cột ngày khác để đổi ngày phiên live"
                      >
                        <div className="flex justify-between items-center gap-1">
                          <span className="font-mono text-[10px] text-blue-400 font-bold flex items-center gap-1">
                            <GripVertical className="w-3 h-3 text-slate-400 shrink-0 cursor-grab" />
                            {ds.startTime}-{ds.endTime}
                          </span>
                          <span className="text-[9px] bg-slate-800 text-slate-300 font-semibold px-1 rounded truncate">
                            {ds.studioName.split(" - ")[0]}
                          </span>
                        </div>

                        <p className="font-bold text-white line-clamp-1 text-[11px]">{ds.brandName}</p>
                        <p className="text-[10px] text-slate-400 line-clamp-1">{ds.title}</p>

                        <div className="flex justify-between items-center pt-1 text-[10px] border-t border-slate-800/80">
                          <span className="text-slate-400 truncate">{ds.hostName.split(" ")[0]}</span>
                          <span className="font-mono font-bold text-emerald-400">{(ds.targetGmv/1000000).toFixed(0)}M</span>
                        </div>
                      </div>
                    ))}

                    {daySessions.length === 0 && (
                      <div
                        onClick={() => {
                          setSelectedDate(wDay.dateStr);
                          setNewDate(wDay.dateStr);
                          setIsBookingModalOpen(true);
                        }}
                        className={`h-24 rounded-xl border border-dashed transition-all cursor-pointer flex flex-col items-center justify-center space-y-1 ${
                          isWeekHovered
                            ? "border-blue-400 bg-blue-950/40 text-blue-300 font-bold"
                            : "border-slate-800/80 hover:border-blue-500/50 text-slate-600 hover:text-blue-400"
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
              </h3>
              <p className="text-xs text-slate-400">Kéo thả ca live vào bất kỳ ô Studio/Ca Live để đổi phòng hoặc ca làm việc linh hoạt</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-rose-400"><span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span> Live</span>
              <span className="flex items-center gap-1 text-blue-400"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Đã Đặt</span>
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
                            <div
                              draggable
                              onDragStart={(e) => handleDragStart(e, matchedSession)}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedSessionDetail(matchedSession)}
                              className={`p-2.5 rounded-xl border transition-all cursor-grab active:cursor-grabbing hover:scale-[1.02] space-y-1.5 shadow ${
                                draggedSessionId === matchedSession.id ? "opacity-30 border-dashed border-amber-400" : ""
                              } ${
                                matchedSession.status === "Live Now"
                                  ? "bg-rose-950/60 border-rose-500/60 text-white hover:border-rose-400 animate-pulse"
                                  : "bg-blue-950/40 border-blue-500/40 text-slate-200 hover:border-blue-400"
                              }`}
                              title="Kéo thả sang ô Studio / Ca Live khác để chuyển đổi ca nhanh chóng"
                            >
                              <div className="flex justify-between items-start gap-1">
                                <span className="font-black text-xs text-white line-clamp-1 flex items-center gap-1">
                                  <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0 cursor-grab hover:text-blue-400" />
                                  {matchedSession.brandName}
                                </span>
                                {matchedSession.status === "Live Now" ? (
                                  <span className="bg-rose-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">LIVE</span>
                                ) : (
                                  <span className="bg-blue-600/30 text-blue-300 text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                    {matchedSession.startTime}-{matchedSession.endTime}
                                  </span>
                                )}
                              </div>

                              <p className="text-[11px] text-slate-300 line-clamp-1 font-medium">{matchedSession.title}</p>

                              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/60">
                                <span className="text-slate-400 font-semibold flex items-center gap-1 truncate">
                                  <User className="w-3 h-3 text-blue-400 shrink-0" /> {matchedSession.hostName.split(" ")[0]}
                                </span>
                                <span className="font-mono font-bold text-emerald-400 shrink-0">
                                  {(matchedSession.targetGmv / 1000000).toFixed(0)}M Target
                                </span>
                              </div>
                            </div>
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
              <p className="text-xs text-slate-400">Kiểm tra tổng thời lượng live trong ngày để phân bổ đều năng lượng Host</p>
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
          <h3 className="font-bold text-white text-base">Danh Sách Tất Cả Các Phiên Live</h3>
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
                      <span className="text-[10px] text-blue-400 font-semibold">{s.brandName}</span>
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

            {/* AI Optimizer Trigger Button */}
            <div className="bg-gradient-to-r from-blue-950 to-indigo-950 border border-blue-800/80 p-3.5 rounded-xl space-y-2">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-400 shrink-0" /> Gemini AI Schedule Matching
                </span>
                <button
                  type="button"
                  onClick={handleAiOptimizeSchedule}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow transition-all active:scale-95"
                >
                  <Zap className="w-3.5 h-3.5" /> Gợi Ý Khung Giờ Vàng AI
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  <label className="font-bold text-slate-300 block mb-1">Trợ Lý Vận Hành (Moderator):</label>
                  <input
                    type="text"
                    value={newAssistant}
                    onChange={(e) => setNewAssistant(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>
              </div>

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

              <div>
                <label className="font-bold text-slate-300 block mb-1">KPI Target GMV Cam Kết (VNĐ):</label>
                <input
                  type="number"
                  value={newTargetGmv}
                  onChange={(e) => setNewTargetGmv(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-blue-500 font-mono font-bold"
                />
              </div>

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
                <span className="text-[10px] font-bold text-blue-400 uppercase font-mono">{selectedSessionDetail.brandName}</span>
                <h3 className="font-bold text-white text-base sm:text-lg">{selectedSessionDetail.title}</h3>
              </div>
              <button
                onClick={() => setSelectedSessionDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-3 rounded-xl border border-slate-800">
              <div>Ngày Live: <strong className="text-white block font-mono">{selectedSessionDetail.date}</strong></div>
              <div>Khung giờ: <strong className="text-white block font-mono">{selectedSessionDetail.startTime} - {selectedSessionDetail.endTime}</strong></div>
              <div>Phòng Studio: <strong className="text-white block">{selectedSessionDetail.studioName}</strong></div>
              <div>Host chính: <strong className="text-white block">{selectedSessionDetail.hostName}</strong></div>
              <div>Trợ lý / Moderator: <strong className="text-white block">{selectedSessionDetail.assistantName}</strong></div>
              <div>Target GMV: <strong className="text-emerald-400 block font-mono font-bold">{selectedSessionDetail.targetGmv.toLocaleString()} VNĐ</strong></div>
            </div>

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
    </div>
  );
};
