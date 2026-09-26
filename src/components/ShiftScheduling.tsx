import React, { useEffect, useMemo, useState } from "react";
import {
  AuditLogEntry,
  Brand,
  BrandMonthlyCommitment,
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
  Zap,
  ChevronLeft,
  ChevronRight,
  Flame,
  Target,
  TrendingUp,
  Layers
} from "lucide-react";
import { talentShortName } from "../lib/talentName";
import { CAMPAIGN_DAY_STYLES, getCampaignDayInfo } from "../lib/campaignDays";
import { dateTimeRangesOverlap } from "../lib/dateUtils";
import { CampaignDayRibbon } from "./ui/CampaignDayRibbon";
import { PosterDayCell } from "./ui/PosterCalendarGrid";
import { getBrandTheme } from "../lib/brandTheme";
import { SessionEventCard, SessionCardTone, buildSlotMeta } from "./ui/SessionEventCard";
import { SessionWindow } from "./SessionWindow";
import { SessionReportInput } from "../lib/db/sessionReports";
import { fetchBrandMonthlyCommitments } from "../lib/db/brandContracts";
import { fetchPlanStatuses } from "../lib/db/monthPlans";
import { SchedulingGap, computeSchedulingGaps } from "../lib/performance/brandCommitment";
import { FATIGUE_WEEK_HOURS, HostSuggestion, headlineFor, suggestHosts } from "../lib/performance/hostSuggestion";
import { BulkFinalizePanel } from "./BulkFinalizePanel";
import { eligibleSlots } from "../lib/performance/bulkFinalize";
import { useToast } from "../hooks/useToast";
import { PageIntro } from "./common/PageIntro";

import { fmtFixed } from "../lib/format";
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
  // RPC apply_session_live_snapshot đã ghi DB và trả về LiveSession đầy đủ — chỉ cần đồng bộ
  // lại state, không gọi updateSession (sẽ ghi đè ngược số vừa tính bằng state cũ của client).
  onSessionSnapshotApplied: (session: LiveSession) => void;
  // Nhắc việc (0091): brand chưa chốt Kế Hoạch Tháng cho tháng sau → nút nhảy sang tab đó.
  onOpenMonthPlan?: () => void;
  fatigueWeekHours?: number; // ngưỡng mệt, admin vặn ở AI Training Center; mặc định FATIGUE_WEEK_HOURS
  onCancelSession?: (id: string, reason: string, reopenSlot: boolean) => Promise<boolean>; // 0097, dùng trong Cửa sổ Ca Live
  onSetSessionExcluded?: (id: string, excluded: boolean, reason: string) => Promise<boolean>;
  onRequestDropout?: (sessionId: string, reason: string) => Promise<boolean>; // Đ7 (0116) — talent báo bận, chỉ gửi thông báo cho ops
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
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // ca qua đêm, vd 22:00 -> 00:30
  return mins / 60;
}

const isAdminRole = (role: UserRole) => role === "ceo" || role === "operations" || role === "admin";

// GMV/giờ gọn để nhét cạnh tên host trong dropdown — chỗ này chỉ còn vài ký tự, số đầy đủ xem ở
// tab Hiệu Suất Host.
const fmtPerHour = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr/h`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k/h`;
  return `${Math.round(n)}đ/h`;
};

// Nhãn cho 1 ứng viên: luôn nói rõ số đang hiện là của brand này hay số chung. Ops tưởng số chung
// là số của brand rồi xếp nhầm là kiểu sai nguy hiểm nhất mà màn này có thể gây ra.
const suggestionLabel = (s: HostSuggestion, fatigueAt: number) => {
  const h = headlineFor(s);
  // Giai đoạn D: thêm khung giờ (host mạnh tối ≠ mạnh trưa), số ca đã xếp trong tháng, cảnh mệt.
  const extras = [
    s.blockSessions >= 2 ? `khung này ${fmtPerHour(s.blockGmvPerHour)}` : "",
    s.monthSessions > 0 ? `${s.monthSessions} ca tháng này` : "",
    s.weekHours > fatigueAt ? `⚠ ${fmtFixed(s.weekHours, 0)}h tuần này` : ""
  ].filter(Boolean);
  const tail = extras.length > 0 ? ` · ${extras.join(" · ")}` : "";
  if (h.scope === "none") return `${s.name} · chưa có dữ liệu${tail}`;
  const scope = h.scope === "brand" ? "brand này" : "chung";
  return `${s.name} · ${fmtPerHour(h.value)} (${scope}, ${h.sessions} ca)${tail}`;
};

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
  onSubmitSessionReport,
  onSessionSnapshotApplied,
  onOpenMonthPlan,
  fatigueWeekHours = FATIGUE_WEEK_HOURS,
  onCancelSession,
  onSetSessionExcluded,
  onRequestDropout
}: ShiftSchedulingProps) {
  const { showToast } = useToast();
  const admin = isAdminRole(currentRole);
  const myTalentId = activeUser.assignedTalentId;
  const today = getTodayDateString();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Tái cấu trúc 2026-09-21 ("Nhân sự ca"): mặc định là DANH SÁCH ca theo ngày (từ hôm nay), lịch
  // tháng chỉ là chế độ xem phụ — tránh lặp lại lịch tháng của Kế Hoạch Tháng.
  const [view, setView] = useState<"list" | "calendar">("list");
  const [showPast, setShowPast] = useState(false);

  const [pickByLot, setPickByLot] = useState<Record<string, { hostId: string; coHostId: string }>>({});
  const [busySlotId, setBusySlotId] = useState<string | null>(null);

  // Talent tự nhập report cho đúng ca của mình (chỉ 1 form mở tại 1 thời điểm).
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);


  // Cam kết hợp đồng (migration 0081) — nạp ngay tại đây thay vì truyền từ App: RLS chỉ cho
  // ceo/admin/operations đọc, đúng bằng isAdminRole(), nên talent gọi cũng chỉ ra mảng rỗng.
  // Không chặn màn hình nếu lỗi/thiếu quyền — phần cảnh báo cam kết chỉ ẩn đi, việc xếp ca vẫn
  // chạy bình thường.
  const [commitments, setCommitments] = useState<BrandMonthlyCommitment[]>([]);
  useEffect(() => {
    if (!admin) return;
    let alive = true;
    fetchBrandMonthlyCommitments()
      .then((rows) => { if (alive) setCommitments(rows); })
      .catch(() => { if (alive) setCommitments([]); });
    return () => { alive = false; };
  }, [admin]);

  const [planMissing, setPlanMissing] = useState<string[]>([]);
  useEffect(() => {
    if (!admin) return;
    const [y, m] = today.slice(0, 7).split("-").map(Number);
    const d = new Date(y, m, 1);
    const next = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
    let alive = true;
    fetchPlanStatuses(next)
      .then((map) => { if (alive) setPlanMissing(brands.filter((b) => map.get(b.id)?.status !== "locked").map((b) => b.name)); })
      .catch(() => { if (alive) setPlanMissing([]); });
    return () => { alive = false; };
  }, [admin, brands, today]);

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

  // Hai hàm dò trùng dưới đây chạy MỖI DÒNG ca trong `visibleSlots.map()` — bản cũ quét trọn
  // `sessions` (229 ca thật) và trọn `shiftSlots` cho từng dòng, tức O(số dòng × kho ca). Một
  // tháng 60 ca là ~28k vòng lặp mỗi lần render.
  //
  // `dateTimeRangesOverlap` đã tự trả false khi 2 ngày cách nhau > 1 (ca dài nhất < 24h), nên
  // chỉ cần soi ngày hôm trước / hôm đó / hôm sau. Index sẵn theo ngày là đủ đưa về O(số dòng).
  const neighborDates = (date: string) => {
    const d = new Date(`${date}T00:00:00`);
    const fmt = (x: Date) => `${x.getFullYear()}-${`${x.getMonth() + 1}`.padStart(2, "0")}-${`${x.getDate()}`.padStart(2, "0")}`;
    const prev = new Date(d); prev.setDate(prev.getDate() - 1);
    const next = new Date(d); next.setDate(next.getDate() + 1);
    return [fmt(prev), date, fmt(next)];
  };
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, LiveSession[]>();
    for (const s of sessions) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [sessions]);

  // Ưu tiên hoá studio (mục #5 CEO đã duyệt) — 2-3 brand cùng cần 1 studio/khung giờ
  // vàng thì cảnh báo cho Ops quyết định thủ công, không tự động chọn ai được ưu tiên.
  const findStudioConflicts = (date: string, start: string, end: string, studioId: string, brandId: string, excludeSlotId?: string) => {
    if (!studioId) return [];
    const out: ShiftSlot[] = [];
    for (const day of neighborDates(date)) {
      for (const s of slotsByDate.get(day) ?? []) {
        if (
          s.id !== excludeSlotId &&
          s.status !== "cancelled" &&
          s.studioId === studioId &&
          s.brandId !== brandId &&
          dateTimeRangesOverlap({ date, startTime: start, endTime: end }, s)
        ) {
          out.push(s);
        }
      }
    }
    return out;
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

  const visibleSlots = useMemo(
    () =>
      selectedDate
        ? slotsByDate.get(selectedDate) ?? []
        : monthSlots.filter((sl) => showPast || sl.date >= today).filter((sl) => admin || sl.status !== "cancelled"),
    [selectedDate, slotsByDate, monthSlots, showPast, today, admin]
  );

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
    // Chỉ ngày liền kề — xem ghi chú ở findStudioConflicts phía trên.
    for (const day of neighborDates(date)) {
      for (const s of sessionsByDate.get(day) ?? []) {
        if (s.status === "Cancelled") continue;
        if (!dateTimeRangesOverlap(s, { date, startTime: start, endTime: end })) continue;
        if (studioId && s.studioId === studioId) studioConflict = true;
        if (s.hostId === talentId || s.coHostId === talentId) hostConflict = true;
      }
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
      showToast("Chọn Host trước khi chốt lịch.");
      return;
    }
    setBusySlotId(slot.id);
    const ok = await onFinalizeSlot(slot, pick.hostId, pick.coHostId || null);
    setBusySlotId(null);
    if (ok) setPickByLot((prev) => ({ ...prev, [slot.id]: { hostId: "", coHostId: "" } }));
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

  // Cam kết hợp đồng của THÁNG ĐANG XEM, đã trừ phần ca đã mở chờ chốt. Chỉ giữ brand còn phải
  // mở thêm — brand đã đủ không cần chiếm chỗ trên màn xếp lịch.
  const schedulingGaps = useMemo<SchedulingGap[]>(
    () =>
      admin
        ? computeSchedulingGaps(
            commitments,
            Object.fromEntries(brands.map((b) => [b.id, b.name])),
            sessions,
            shiftSlots,
            `${selectedMonth}-01`
          ).filter((g) => g.committedHours > 0)
        : [],
    [admin, commitments, brands, sessions, shiftSlots, selectedMonth]
  );
  const gapsNeedingSlots = useMemo(
    () => schedulingGaps.filter((g) => g.hoursStillToOpen > 0.01),
    [schedulingGaps]
  );

  // Tên ngắn (nickname 0087, không có thì 2 từ cuối) — ma trận tháng chật, cần phân biệt người trùng tên.
  const talentNameById = useMemo(
    () => new Map(talents.map((t) => [t.id, talentShortName(t)])),
    [talents]
  );

  // Chốt hàng loạt (điểm nghẽn #3 của audit) — panel tự lập kế hoạch khi mở, nên chỉ cần biết
  // CÓ ca nào đáng chốt hay không để quyết định hiện nút.
  const [bulkOpen, setBulkOpen] = useState(false);
  const bulkCandidateCount = useMemo(
    () => (admin ? eligibleSlots(shiftSlots, registrationsBySlot, selectedMonth, today).length : 0),
    [admin, shiftSlots, registrationsBySlot, selectedMonth, today]
  );

  // Mốc lấy lịch sử hiệu suất khi gợi ý host: 90 ngày gần nhất. Lấy cả đời thì host đã tiến bộ
  // (hoặc đi xuống) từ nửa năm trước vẫn kéo trung bình, không phản ánh phong độ hiện tại.
  const perfSince = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() - 90);
    return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
  }, [today]);

  // Gợi ý host: `suggestHosts()` quét TRỌN kho ca (229 ca thật) cho mỗi ca mở. Bản cũ gọi thẳng
  // trong thân `visibleSlots.map()`, nên mọi lần render — kể cả nhịp tick mỗi phút của App —
  // đều quét lại số ca × số dòng. Gom về một useMemo, chỉ tính lại khi danh sách ca / người đăng
  // ký / kho ca thật sự đổi.
  const suggestionsBySlot = useMemo(() => {
    const map = new Map<string, HostSuggestion[]>();
    if (!admin) return map;
    for (const slot of visibleSlots) {
      if (slot.status !== "open") continue;
      const regs = registrationsBySlot.get(slot.id) ?? [];
      map.set(
        slot.id,
        suggestHosts(
          regs.map((r) => r.talentId),
          talentNameById,
          sessions,
          slot.brandId,
          new Date(`${slot.date}T00:00:00`).getDay(),
          perfSince,
          { date: slot.date, startTime: slot.startTime, endTime: slot.endTime }
        )
      );
    }
    return map;
  }, [admin, visibleSlots, registrationsBySlot, talentNameById, sessions, perfSince]);

  // Sắp xếp theo tên tiếng Việt 1 lần cho cả màn, thay vì `.sort()` lại trong từng dòng ca —
  // mỗi dòng chỉ còn lọc ra người chưa đăng ký (giữ nguyên thứ tự đã sắp).
  const talentsSortedByName = useMemo(
    () => [...talents].sort((a, b) => a.name.localeCompare(b.name, "vi")),
    [talents]
  );

  return (
    <div className="space-y-6">
      <div className="bg-[var(--surface)] border border-[var(--border)] p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)] flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            {admin ? "Nhân sự ca" : "Đăng Ký Ca"}
          </h2>
          <PageIntro>
            {admin
              ? "Chốt Host + Trợ live cho từng ca trước tháng. Đổi người, số liệu, report của ca đã chốt: mở ca (Cửa sổ Ca Live)."
              : "Đăng ký các ca bạn rảnh — Operations sẽ chốt lịch từ danh sách đã đăng ký."}
          </PageIntro>
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

      {admin && planMissing.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-900 rounded-xl px-4 py-2.5 text-xs text-amber-200 flex flex-wrap items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Tháng sau chưa chốt kế hoạch ca: <b>{planMissing.join(", ")}</b>.</span>
          {onOpenMonthPlan && <button onClick={onOpenMonthPlan} className="ml-auto text-[11px] font-bold text-amber-100 underline underline-offset-2">Mở Kế Hoạch Tháng →</button>}
        </div>
      )}

      {admin && bulkCandidateCount > 0 && !bulkOpen && (
        <button
          onClick={() => setBulkOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-[var(--surface)] border border-[var(--border)] hover:border-blue-700 rounded-2xl px-4 py-3 text-sm font-bold text-[var(--text)] transition-colors"
        >
          <Layers className="w-4 h-4 text-blue-400" />
          Chốt lịch hàng loạt
          <span className="text-xs font-normal text-[var(--text-muted)]">
            — {bulkCandidateCount} ca đang mở đã có người đăng ký
          </span>
        </button>
      )}

      {admin && bulkOpen && (
        <BulkFinalizePanel
          slots={shiftSlots}
          registrationsBySlot={registrationsBySlot}
          sessions={sessions}
          talentNameById={talentNameById}
          month={selectedMonth}
          today={today}
          perfSince={perfSince}
          fatigueWeekHours={fatigueWeekHours}
          onFinalizeSlot={onFinalizeSlot}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {/* Cam kết hợp đồng của tháng đang xem — trả lời "còn phải MỞ thêm bao nhiêu giờ ca", tín
          hiệu đứng trước việc chốt ai. Số đã trừ phần ca đã mở chờ chốt nên là việc còn phải làm
          thật, không phải tổng khoảng cách với cam kết. */}
      {admin && schedulingGaps.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-[var(--text)]">Cam kết hợp đồng tháng này</h3>
            {gapsNeedingSlots.length === 0 && (
              <span className="text-[11px] text-emerald-400 font-bold">· đã mở đủ ca cho mọi brand</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {schedulingGaps.map((g) => {
              const done = g.hoursStillToOpen <= 0.01;
              return (
                <div
                  key={g.brandId}
                  className={`rounded-xl p-3 border ${
                    done ? "bg-emerald-950/30 border-emerald-900" : "bg-rose-950/25 border-rose-900"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-bold text-[var(--text)] truncate">{g.brandName}</span>
                    <span className="text-[11px] text-[var(--text-faint)] shrink-0">
                      cam kết {g.committedHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h
                    </span>
                  </div>
                  <p className={`text-lg font-black mt-0.5 ${done ? "text-emerald-400" : "text-rose-400"}`}>
                    {done
                      ? "Đã mở đủ"
                      : `Cần mở thêm ${g.hoursStillToOpen.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-relaxed">
                    Đã live {g.deliveredHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h · đã chốt chưa live{" "}
                    {g.scheduledHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h · đang mở chờ chốt{" "}
                    {g.openSlotHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h ({g.openSlotCount} ca)
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-faint)] mt-2">
            Giờ ca theo lịch, cùng loại giờ dùng để tính tiền brand. Brand chưa đặt cam kết không hiện ở đây — nhập ở tab Cam Kết Hợp Đồng.
          </p>
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-[var(--surface)] border border-[var(--border)] rounded-xl p-1 w-fit">
          <button onClick={() => { setView("list"); setSelectedDate(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === "list" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Danh sách ca</button>
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === "calendar" ? "bg-[var(--accent)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text)]"}`}>Lịch tháng</button>
        </div>
        {view === "list" && !selectedDate && (
          <label className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> gồm ca đã qua
          </label>
        )}
      </div>

      {view === "calendar" && (
      <div className="bg-[#f8f9fa] dark:bg-slate-900 border border-pink-200 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-blue-500 dark:text-blue-400" /> Lịch Ma Trận Tháng {selectedMonth}
        </h3>
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <div className="min-w-[760px] xl:min-w-0">
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-black uppercase tracking-wide mb-2">
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
      )}

      {/* Danh sách ca: chế độ "list" = cả tháng từ hôm nay, nhóm theo ngày; chế độ lịch = ngày đang chọn */}
      {(selectedDate || view === "list") && (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h3 className="font-bold text-[var(--text)] flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            {selectedDate ? `Ca Ngày ${dayLabel(selectedDate)} ${selectedDate}` : `Ca tháng ${selectedMonth}${showPast ? "" : " · từ hôm nay"}`}
          </h3>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-400 hover:text-blue-300 font-bold">
              × Đóng
            </button>
          )}
        </div>
        <div className="-mx-2">
          <div className="px-2 space-y-2">
            {visibleSlots.length === 0 && (
              <p className="text-sm text-[var(--text-faint)] py-6 text-center">{selectedDate ? "Chưa có ca nào trong ngày này." : "Chưa có ca nào — ca được mở khi chốt Kế Hoạch Tháng."}</p>
            )}
            {visibleSlots.map((slot, idx) => {
              const dayHeader = !selectedDate && (idx === 0 || visibleSlots[idx - 1].date !== slot.date);
              const regs = registrationsBySlot.get(slot.id) ?? [];
              const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;
              const pick = pickByLot[slot.id] ?? { hostId: "", coHostId: "" };
              const conflict = pick.hostId
                ? checkConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", pick.hostId)
                : { studioConflict: false, hostConflict: false };
              const studioConflicts = findStudioConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", slot.brandId ?? "", slot.id);
              // Hiệu suất của đúng những người đã đăng ký ca này, với đúng brand và đúng thứ của
              // ca — tính ngay tại đây thay vì bắt ops nhớ số từ tab Hiệu Suất Host rồi quay lại.
              const suggestions = suggestionsBySlot.get(slot.id) ?? [];
              const hasAnyPerfData = suggestions.some((s) => s.overallSessions > 0);
              // Q1 (audit 2026-09-21): ops hay xếp qua Zalo rồi mới vào app → cho chọn cả người CHƯA
              // đăng ký rảnh (nhóm "Người khác"), cảnh báo rõ; gợi ý xếp hạng vẫn chỉ cho người đã đăng ký.
              const registeredIds = new Set(regs.map((r) => r.talentId));
              const others = admin && slot.status === "open" ? talentsSortedByName.filter((t) => !registeredIds.has(t.id)) : [];
              const hostUnregistered = !!pick.hostId && !registeredIds.has(pick.hostId);
              const coHostUnregistered = !!pick.coHostId && !registeredIds.has(pick.coHostId);
              const coHostConflict = pick.coHostId ? checkConflicts(slot.date, slot.startTime, slot.endTime, "", pick.coHostId).hostConflict : false;
              return (
                <React.Fragment key={slot.id}>
                {dayHeader && (
                  <p className={`text-[11px] font-black uppercase tracking-wide pt-2 ${slot.date === today ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}>
                    {dayLabel(slot.date)} {slot.date}{slot.date === today ? " · hôm nay" : ""}
                  </p>
                )}
                <div className="bg-[var(--surface-base)]/80 border border-[var(--border)] rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="font-mono font-bold text-[var(--text)]">
                        {dayLabel(slot.date)} {slot.date} · {slot.startTime}-{slot.endTime}
                      </span>
                      <span className="text-[var(--text-muted)]">{slot.brandName}</span>
                      <span className="text-[11px] bg-[var(--surface-elevated)] text-[var(--text-muted)] px-2 py-0.5 rounded-full font-bold">{slot.platform}</span>
                      {slot.studioName && <span className="text-[var(--text-faint)] text-xs">{slot.studioName}</span>}
                      {slot.templateId ? (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--accent-text)]" title="Tự động sinh từ quy tắc lặp">
                          <Zap className="w-3 h-3" /> Tự động
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--text-faint)]">Phát sinh</span>
                      )}
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
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
                          className={`text-[11px] px-2 py-0.5 rounded-full font-bold border ${
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
                          className="flex items-center gap-1 text-[11px] text-rose-300"
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
                      className={`w-full sm:w-auto sm:self-start justify-center flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
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
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                          <select
                            value={pick.hostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, hostId: e.target.value } }))}
                            className="flex-1 min-w-[140px] bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                          >
                            <option value="">Host…</option>
                            {/* Thứ tự option = thứ tự xếp hạng hiệu suất, không phải thứ tự đăng ký */}
                            {suggestions.length > 0 && (
                              <optgroup label="Đã đăng ký rảnh">
                                {suggestions.map((s) => (
                                  <option key={s.talentId} value={s.talentId}>
                                    {suggestionLabel(s, fatigueWeekHours)}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {others.length > 0 && (
                              <optgroup label="Người khác (chưa đăng ký rảnh)">
                                {others.map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <select
                            value={pick.coHostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, coHostId: e.target.value } }))}
                            className="flex-1 min-w-[140px] bg-[var(--surface-base)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-blue-500"
                          >
                            {/* Cố ý KHÔNG hiện GMV/giờ ở ô Trợ live: số đó là hiệu suất khi làm
                                HOST, gắn vào vai trợ live sẽ khiến ops xếp người theo một con số
                                không nói gì về vai trò họ sắp làm. */}
                            <option value="">Trợ live (tuỳ chọn)…</option>
                            {suggestions.some((s) => s.talentId !== pick.hostId) && (
                              <optgroup label="Đã đăng ký rảnh">
                                {suggestions.filter((s) => s.talentId !== pick.hostId).map((s) => (
                                  <option key={s.talentId} value={s.talentId}>
                                    {s.name}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {others.some((t) => t.id !== pick.hostId) && (
                              <optgroup label="Người khác (chưa đăng ký rảnh)">
                                {others.filter((t) => t.id !== pick.hostId).map((t) => (
                                  <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                          <button
                            onClick={() => handleFinalize(slot)}
                            disabled={!pick.hostId || busySlotId === slot.id}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" /> Chốt Lịch
                          </button>
                        </div>
                      {(hostUnregistered || coHostUnregistered) && (
                        <span className="w-full text-[11px] text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {hostUnregistered && coHostUnregistered ? "Host và Trợ live" : hostUnregistered ? "Host" : "Trợ live"} đã chọn CHƯA đăng ký rảnh ca này — xác nhận với bạn ấy trước khi chốt (chốt xong hệ thống mới báo).
                        </span>
                      )}
                      {coHostConflict && (
                        <span className="w-full text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Trợ live đã chọn trùng lịch với 1 ca khác cùng ngày.
                        </span>
                      )}
                      {/* Bảng xếp hạng chi tiết — dropdown chỉ đủ chỗ cho 1 con số, chỗ này mới
                          tách được "mạnh với brand này" khác "mạnh vào thứ này". Bấm 1 phát là
                          chọn luôn làm Host, không phải mở lại dropdown. */}
                      {suggestions.length > 1 && hasAnyPerfData && (
                        <div className="w-full pt-2 mt-1 border-t border-[var(--border)]/60">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <TrendingUp className="w-3 h-3 text-[var(--text-faint)]" />
                            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wide">
                              Hiệu suất 90 ngày gần nhất
                            </span>
                          </div>
                          <div className="flex flex-col gap-1">
                            {suggestions.map((s) => {
                              const chosen = pick.hostId === s.talentId;
                              return (
                                <button
                                  key={s.talentId}
                                  type="button"
                                  onClick={() =>
                                    setPickByLot((prev) => ({
                                      ...prev,
                                      [slot.id]: { ...pick, hostId: s.talentId, coHostId: pick.coHostId === s.talentId ? "" : pick.coHostId }
                                    }))
                                  }
                                  className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-left px-2 py-1 rounded-lg border transition-colors ${
                                    chosen
                                      ? "bg-emerald-950/40 border-emerald-800"
                                      : "bg-[var(--surface-elevated)]/50 border-transparent hover:border-[var(--border)]"
                                  }`}
                                  title={chosen ? "Đang chọn làm Host" : "Chọn làm Host"}
                                >
                                  <span className={`text-[11px] font-bold ${chosen ? "text-emerald-300" : "text-[var(--text)]"}`}>
                                    {s.name}
                                  </span>
                                  {s.brandSessions > 0 ? (
                                    <span className="text-[11px] text-emerald-400">
                                      {fmtPerHour(s.brandGmvPerHour)} với brand này ({s.brandSessions} ca)
                                    </span>
                                  ) : s.overallSessions > 0 ? (
                                    <span className="text-[11px] text-[var(--text-muted)]">
                                      chưa live brand này · {fmtPerHour(s.overallGmvPerHour)} chung ({s.overallSessions} ca)
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-[var(--text-faint)]">chưa có ca nào có số liệu</span>
                                  )}
                                  {s.weekdaySessions > 0 && (
                                    <span className="text-[11px] text-sky-400">
                                      {fmtPerHour(s.weekdayGmvPerHour)} vào {dayLabel(slot.date)} ({s.weekdaySessions} ca)
                                    </span>
                                  )}
                                  {s.confidence === "low" && (
                                    <span className="text-[11px] text-amber-400">ít dữ liệu, chỉ tham khảo</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
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
                            <Check className="w-3.5 h-3.5" /> Đã chốt — xem chi tiết ở tab Sổ Ca / Lịch Vận Hành.
                          </div>
                        );
                      }
                      return (
                        <div className="pt-1 border-t border-[var(--border)]/80 flex flex-wrap items-center gap-2 text-xs">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span className="text-emerald-300">Đã chốt</span>
                          <span className="text-[var(--text-muted)]">
                            Host: <span className="text-[var(--text)] font-medium">{session.hostName || "—"}</span>
                            {session.coHostId && <> · Trợ live: <span className="text-[var(--text)] font-medium">{session.coHostName}</span></>}
                          </span>
                          {/* U2 (2026-09-21): báo bận/thay người, số liệu, report — tất cả trong Cửa sổ Ca Live. */}
                          <button
                            onClick={() => setOpenSessionId(session.id)}
                            className="ml-auto flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 transition-colors"
                          >
                            <Radio className="w-3.5 h-3.5" /> {admin ? "Mở ca · đổi người" : "Mở ca"}
                          </button>
                        </div>
                      );
                    })()}
                </div>
                </React.Fragment>
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
                    <td className="py-2 text-right font-mono text-[var(--text-muted)]">{fmtFixed(row.hours, 1)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {openSessionId && (() => {
        const os = sessions.find((x) => x.id === openSessionId);
        return os ? (
          <SessionWindow
            session={os}
            brand={brandById.get(os.brandId)}
            viewer={{ role: currentRole, myTalentId }}
            today={today}
            allSessions={sessions}
            studios={admin ? studios : undefined}
            talents={admin ? talents : undefined}
            onClose={() => setOpenSessionId(null)}
            onSubmitSessionReport={onSubmitSessionReport}
            onSessionSnapshotApplied={onSessionSnapshotApplied}
            onUpdateSession={admin ? onUpdateSession : undefined}
            onCancelSession={admin ? onCancelSession : undefined}
            onSetSessionExcluded={admin ? onSetSessionExcluded : undefined}
            onRequestDropout={onRequestDropout}
            onLogAudit={admin ? onLogAudit : undefined}
          />
        ) : null;
      })()}
    </div>
  );
}
