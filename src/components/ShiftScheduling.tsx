import React, { useEffect, useMemo, useState } from "react";
import {
  AuditLogEntry,
  Brand,
  BrandPlatformRate,
  Campaign,
  CampaignRevisionNote,
  LiveSession,
  RecurringShiftTemplate,
  ShiftRegistration,
  ShiftSlot,
  Studio,
  SystemUser,
  Talent,
  UserRole
} from "../types";
import { computeCampaignActualGmv } from "../lib/campaignMetrics";
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle,
  Users,
  Radio,
  DollarSign,
  Check,
  Repeat,
  Sparkles,
  Zap,
  ChevronLeft,
  ChevronRight,
  Target,
  Info,
  Flame,
  Send,
  MessageSquare
} from "lucide-react";

interface ShiftSchedulingProps {
  currentRole: UserRole;
  activeUser: SystemUser;
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  studios: Studio[];
  shiftSlots: ShiftSlot[];
  shiftRegistrations: ShiftRegistration[];
  brandPlatformRates: BrandPlatformRate[];
  recurringShiftTemplates: RecurringShiftTemplate[];
  campaigns: Campaign[];
  campaignRevisionNotes: CampaignRevisionNote[];
  onSendCampaignForApproval: (campaign: Campaign) => Promise<boolean>;
  onCreateSlot: (slot: ShiftSlot) => Promise<boolean>;
  onDeleteSlot: (id: string) => Promise<void>;
  onRegister: (slotId: string, talentId: string) => Promise<boolean>;
  onUnregister: (slotId: string, talentId: string) => Promise<boolean>;
  onFinalizeSlot: (slot: ShiftSlot, hostId: string, coHostId: string | null) => Promise<boolean>;
  onSaveRate: (brandId: string, platform: "TikTok" | "Shopee", ratePerHour: number) => Promise<boolean>;
  onCreateTemplate: (template: RecurringShiftTemplate) => Promise<boolean>;
  onToggleTemplate: (template: RecurringShiftTemplate) => Promise<boolean>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onGenerateMonthSlots: (month: string) => Promise<number>;
  onCreateCampaign: (campaign: Campaign) => Promise<boolean>;
  onUpdateCampaign: (campaign: Campaign) => Promise<boolean>;
  onDeleteCampaign: (id: string) => Promise<void>;
  onSubmitCampaignReview: (
    campaign: Campaign,
    review: { outcome: NonNullable<Campaign["outcome"]>; renewalDecision: NonNullable<Campaign["renewalDecision"]>; reviewNotes: string }
  ) => Promise<boolean>;
  onUpdateSession: (session: LiveSession) => Promise<boolean>;
  onLogAudit: (entry: { action: string; details: string; category: AuditLogEntry["category"] }) => Promise<void>;
  // Từ Campaign Timeline, bấm "Xem trong Lịch" nhảy thẳng tới đúng tháng + lọc theo
  // campaign đó — nonce đổi mỗi lần bấm để useEffect áp dụng lại kể cả khi bấm cùng 1
  // campaign 2 lần liên tiếp (giá trị month/campaignId không đổi thì effect không chạy lại).
  jumpTarget?: { campaignId: string; month: string; nonce: number } | null;
}

const CAMPAIGN_TYPE_LABELS: Record<Campaign["type"], string> = {
  daily: "Daily",
  mega: "Mega D-Day",
  mid_month: "Mid-month",
  payday: "Payday",
  other: "Khác"
};

const APPROVAL_STATUS_LABELS: Record<Campaign["approvalStatus"], string> = {
  draft: "Chưa gửi",
  sent_for_approval: "Đang chờ Brand duyệt",
  revision_requested: "Brand yêu cầu sửa",
  approved: "Đã duyệt"
};

const OUTCOME_LABELS: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "Đạt KPI",
  kpi_missed: "Không đạt KPI",
  partial: "Đạt một phần"
};

const OUTCOME_STYLES: Record<NonNullable<Campaign["outcome"]>, string> = {
  kpi_met: "bg-emerald-950 text-emerald-300",
  kpi_missed: "bg-rose-950 text-rose-300",
  partial: "bg-amber-950 text-amber-300"
};

const RENEWAL_LABELS: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "Gia hạn",
  at_risk: "Có nguy cơ rời",
  churned: "Đã rời (churned)"
};

const RENEWAL_STYLES: Record<NonNullable<Campaign["renewalDecision"]>, string> = {
  renew: "bg-emerald-950 text-emerald-300",
  at_risk: "bg-amber-950 text-amber-300",
  churned: "bg-rose-950 text-rose-300"
};

const APPROVAL_STATUS_STYLES: Record<Campaign["approvalStatus"], string> = {
  draft: "bg-slate-800 text-slate-400",
  sent_for_approval: "bg-blue-950 text-blue-300",
  revision_requested: "bg-rose-950 text-rose-300",
  approved: "bg-emerald-950 text-emerald-300"
};

const WEEKDAY_LABELS = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

const dayLabel = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  const names = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
  return names[d.getDay()];
};

const durationHours = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  let [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60; // ca qua đêm, vd 22:00 -> 00:30
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
  brandPlatformRates,
  recurringShiftTemplates,
  campaigns,
  campaignRevisionNotes,
  onSendCampaignForApproval,
  onCreateSlot,
  onDeleteSlot,
  onRegister,
  onUnregister,
  onFinalizeSlot,
  onSaveRate,
  onCreateTemplate,
  onToggleTemplate,
  onDeleteTemplate,
  onGenerateMonthSlots,
  onCreateCampaign,
  onUpdateCampaign,
  onDeleteCampaign,
  onSubmitCampaignReview,
  onUpdateSession,
  onLogAudit,
  jumpTarget
}: ShiftSchedulingProps) {
  const admin = isAdminRole(currentRole);
  const myTalentId = activeUser.assignedTalentId;
  const today = getTodayDateString();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7)); // "YYYY-MM"
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [newDate, setNewDate] = useState(today);
  const [newStart, setNewStart] = useState("20:00");
  const [newEnd, setNewEnd] = useState("23:00");
  const [newBrandId, setNewBrandId] = useState(brands[0]?.id ?? "");
  const [newPlatform, setNewPlatform] = useState<"TikTok" | "Shopee">("TikTok");
  const [newStudioId, setNewStudioId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newCampaignId, setNewCampaignId] = useState("");
  const [creating, setCreating] = useState(false);

  const [pickByLot, setPickByLot] = useState<Record<string, { hostId: string; coHostId: string }>>({});
  const [busySlotId, setBusySlotId] = useState<string | null>(null);
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});

  // Giai đoạn 15c — thay người khẩn cấp trên 1 ca đã chốt (Host/Trợ live báo bận
  // sát giờ live). Danh sách ứng viên thay thế lấy từ session_availability của
  // chính slot đó (những người đã đăng ký rảnh nhưng không được chọn lúc chốt) —
  // không cần bảng mới, đúng phạm vi đã CEO duyệt ở BUSINESS_ROADMAP.md.
  const [emergencySwap, setEmergencySwap] = useState<{ slotId: string; role: "host" | "coHost" } | null>(null);
  const [swapCandidateId, setSwapCandidateId] = useState("");
  const [swapReason, setSwapReason] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);

  const [tplWeekday, setTplWeekday] = useState(1);
  const [tplStart, setTplStart] = useState("20:00");
  const [tplEnd, setTplEnd] = useState("23:00");
  const [tplBrandId, setTplBrandId] = useState(brands[0]?.id ?? "");
  const [tplPlatform, setTplPlatform] = useState<"TikTok" | "Shopee">("TikTok");
  const [tplStudioId, setTplStudioId] = useState("");
  const [tplCampaignId, setTplCampaignId] = useState("");
  const [creatingTpl, setCreatingTpl] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  // Campaign form (Giai đoạn 15)
  const [campBrandId, setCampBrandId] = useState(brands[0]?.id ?? "");
  const [campName, setCampName] = useState("");
  const [campType, setCampType] = useState<Campaign["type"]>("daily");
  const [campTargetGmv, setCampTargetGmv] = useState(0);
  const [campStartDate, setCampStartDate] = useState(today);
  const [campEndDate, setCampEndDate] = useState(today);
  const [campHostBriefing, setCampHostBriefing] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [campaignFilter, setCampaignFilter] = useState("");

  useEffect(() => {
    if (!jumpTarget) return;
    setSelectedMonth(jumpTarget.month);
    setCampaignFilter(jumpTarget.campaignId);
    setSelectedDate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTarget?.nonce]);

  // Giai đoạn 25 — panel đánh giá cuối campaign, chỉ 1 campaign mở cùng lúc.
  const [reviewingCampaignId, setReviewingCampaignId] = useState<string | null>(null);
  const [reviewOutcome, setReviewOutcome] = useState<NonNullable<Campaign["outcome"]>>("kpi_met");
  const [reviewRenewal, setReviewRenewal] = useState<NonNullable<Campaign["renewalDecision"]>>("renew");
  const [reviewNotesDraft, setReviewNotesDraft] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  const talentsById = useMemo(() => new Map(talents.map((t) => [t.id, t])), [talents]);
  const registrationsBySlot = useMemo(() => {
    const map = new Map<string, ShiftRegistration[]>();
    shiftRegistrations.forEach((r) => {
      const list = map.get(r.slotId) ?? [];
      list.push(r);
      map.set(r.slotId, list);
    });
    return map;
  }, [shiftRegistrations]);

  const campaignsById = useMemo(() => new Map(campaigns.map((c) => [c.id, c])), [campaigns]);
  const campaignsForNewBrand = useMemo(
    () => campaigns.filter((c) => c.brandId === newBrandId && c.status !== "cancelled"),
    [campaigns, newBrandId]
  );
  const campaignsForTplBrand = useMemo(
    () => campaigns.filter((c) => c.brandId === tplBrandId && c.status !== "cancelled"),
    [campaigns, tplBrandId]
  );
  const monthCampaigns = useMemo(
    () =>
      campaigns
        .filter((c) => c.startDate <= `${selectedMonth}-31` && c.endDate >= `${selectedMonth}-01`)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [campaigns, selectedMonth]
  );

  // Giai đoạn 26 — GMV thật của campaign (xem src/lib/campaignMetrics.ts).
  const campaignActualGmv = useMemo(() => computeCampaignActualGmv(campaigns, sessions), [campaigns, sessions]);

  const monthSlotsUnfiltered = useMemo(
    () => shiftSlots.filter((s) => s.date.startsWith(selectedMonth)).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)),
    [shiftSlots, selectedMonth]
  );
  const monthSlots = useMemo(
    () => (campaignFilter ? monthSlotsUnfiltered.filter((s) => s.campaignId === campaignFilter) : monthSlotsUnfiltered),
    [monthSlotsUnfiltered, campaignFilter]
  );

  const slotsByDate = useMemo(() => {
    const source = campaignFilter ? shiftSlots.filter((s) => s.campaignId === campaignFilter) : shiftSlots;
    const map = new Map<string, ShiftSlot[]>();
    source.forEach((s) => {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    });
    map.forEach((list) => list.sort((a, b) => a.startTime.localeCompare(b.startTime)));
    return map;
  }, [shiftSlots, campaignFilter]);

  // Ưu tiên hoá studio (mục #5 CEO đã duyệt) — 2-3 brand cùng cần 1 studio/khung giờ
  // vàng thì cảnh báo cho Ops quyết định thủ công, không tự động chọn ai được ưu tiên.
  const timeOverlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;
  const findStudioConflicts = (date: string, start: string, end: string, studioId: string, brandId: string, excludeSlotId?: string) => {
    if (!studioId) return [];
    return shiftSlots.filter(
      (s) =>
        s.id !== excludeSlotId &&
        s.status !== "cancelled" &&
        s.date === date &&
        s.studioId === studioId &&
        s.brandId !== brandId &&
        timeOverlaps(start, end, s.startTime, s.endTime)
    );
  };
  const newSlotConflicts = useMemo(
    () => findStudioConflicts(newDate, newStart, newEnd, newStudioId, newBrandId),
    [shiftSlots, newDate, newStart, newEnd, newStudioId, newBrandId]
  );

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

  const rateFor = (brandId: string, platform: "TikTok" | "Shopee") =>
    brandPlatformRates.find((r) => r.brandId === brandId && r.platform === platform);

  const checkConflicts = (date: string, start: string, end: string, studioId: string, talentId: string) => {
    return sessions.some(
      (s) =>
        s.date === date &&
        s.status !== "Cancelled" &&
        s.startTime < end &&
        s.endTime > start &&
        ((studioId && s.studioId === studioId) || s.hostId === talentId || s.coHostId === talentId)
    );
  };

  const handleCreateSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSlotConflicts.length > 0) {
      const names = newSlotConflicts.map((c) => `${c.brandName} (${c.startTime}-${c.endTime})`).join(", ");
      if (!window.confirm(`Studio này đã có ca của brand khác cùng khung giờ: ${names}. Vẫn mở ca mới?`)) return;
    }
    const brand = brands.find((b) => b.id === newBrandId);
    const studio = studios.find((s) => s.id === newStudioId);
    setCreating(true);
    const ok = await onCreateSlot({
      id: `slot-${Date.now()}`,
      date: newDate,
      startTime: newStart,
      endTime: newEnd,
      brandId: newBrandId || undefined,
      brandName: brand?.name ?? "",
      platform: newPlatform,
      studioId: newStudioId || undefined,
      studioName: studio?.name ?? "",
      notes: newNotes,
      status: "open",
      campaignId: newCampaignId || undefined
    });
    setCreating(false);
    if (ok) {
      setNewNotes("");
      setNewCampaignId("");
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const brand = brands.find((b) => b.id === tplBrandId);
    const studio = studios.find((s) => s.id === tplStudioId);
    setCreatingTpl(true);
    await onCreateTemplate({
      id: `tpl-${Date.now()}`,
      weekday: tplWeekday,
      brandId: tplBrandId || undefined,
      brandName: brand?.name ?? "",
      platform: tplPlatform,
      startTime: tplStart,
      endTime: tplEnd,
      studioId: tplStudioId || undefined,
      studioName: studio?.name ?? "",
      notes: "",
      active: true,
      campaignId: tplCampaignId || undefined
    });
    setCreatingTpl(false);
  };

  const resetCampaignForm = () => {
    setCampBrandId(brands[0]?.id ?? "");
    setCampName("");
    setCampType("daily");
    setCampTargetGmv(0);
    setCampStartDate(today);
    setCampEndDate(today);
    setCampHostBriefing("");
  };

  const handleCreateCampaignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const brand = brands.find((b) => b.id === campBrandId);
    if (!brand || !campName.trim()) return;
    setCreatingCampaign(true);
    const ok = await onCreateCampaign({
      id: `campaign-${Date.now()}`,
      brandId: campBrandId,
      brandName: brand.name,
      name: campName.trim(),
      type: campType,
      targetGmv: Number(campTargetGmv) || 0,
      startDate: campStartDate,
      endDate: campEndDate,
      status: "draft",
      hostBriefing: campHostBriefing,
      approvalStatus: "draft",
      reviewNotes: ""
    });
    setCreatingCampaign(false);
    if (ok) resetCampaignForm();
  };

  const handleCampaignStatusChange = async (campaign: Campaign, status: Campaign["status"]) => {
    await onUpdateCampaign({ ...campaign, status });
  };

  const openReviewPanel = (campaign: Campaign) => {
    setReviewingCampaignId(campaign.id);
    setReviewOutcome(campaign.outcome ?? "kpi_met");
    setReviewRenewal(campaign.renewalDecision ?? "renew");
    setReviewNotesDraft(campaign.reviewNotes ?? "");
  };

  const handleSubmitReview = async (campaign: Campaign) => {
    setReviewBusy(true);
    const ok = await onSubmitCampaignReview(campaign, {
      outcome: reviewOutcome,
      renewalDecision: reviewRenewal,
      reviewNotes: reviewNotesDraft.trim()
    });
    setReviewBusy(false);
    if (ok) setReviewingCampaignId(null);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateMsg(null);
    const count = await onGenerateMonthSlots(selectedMonth);
    setGenerating(false);
    setGenerateMsg(count > 0 ? `Đã sinh ${count} ca mới cho tháng ${selectedMonth}.` : "Không có ca mới nào để sinh (đã sinh đủ hoặc chưa có quy tắc lặp nào).");
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

  const handleSaveRate = async (brandId: string) => {
    const key = `${brandId}:${newPlatform}`;
    const raw = rateDraft[key];
    if (raw === undefined) return;
    await onSaveRate(brandId, newPlatform, Number(raw) || 0);
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
      <div className="bg-slate-900 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-400" />
            Đăng Ký &amp; Chốt Lịch Host
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {admin
              ? "Mở ca, xem ai đã đăng ký, chốt Host + Co-host cho từng ca."
              : "Đăng ký các ca bạn rảnh — Operations sẽ chốt lịch từ danh sách đã đăng ký."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
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
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
            title="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {monthCampaigns.length > 0 && (
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              title="Lọc theo Campaign"
            >
              <option value="">Tất cả Campaign</option>
              {monthCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName} · {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!admin && !myTalentId && (
        <div className="bg-amber-950/60 border border-amber-800 rounded-xl p-4 text-sm text-amber-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Tài khoản của bạn chưa được gán hồ sơ Talent (assigned_talent_id) — liên hệ CEO/Operations để gán trước khi tự đăng ký ca được.
        </div>
      )}

      {admin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" /> Campaign Tháng {selectedMonth}
          </h3>
          <p className="text-xs text-slate-500 -mt-2">
            Kế hoạch theo tháng của brand (Daily/Mega D-Day/Mid-month/Payday...) với KPI GMV đã chốt — gán vào Ca/Quy Tắc Lặp bên dưới để phân bổ giờ live theo đúng campaign.
          </p>

          {monthCampaigns.length > 0 && (
            <div className="space-y-1.5">
              {monthCampaigns.map((c) => {
                const slotCount = shiftSlots.filter((s) => s.campaignId === c.id).length;
                const notes = campaignRevisionNotes.filter((n) => n.campaignId === c.id);
                return (
                  <div key={c.id} className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-white">{c.brandName}</span>
                      <span className="text-slate-300">{c.name}</span>
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{CAMPAIGN_TYPE_LABELS[c.type]}</span>
                      <span className="text-slate-500 font-mono">{c.startDate} → {c.endDate}</span>
                      <span className="text-emerald-400 font-bold">KPI {c.targetGmv.toLocaleString("vi-VN")}đ</span>
                      <span className="text-slate-500">{slotCount} ca đã gán</span>
                      {c.hostBriefing && (
                        <span className="flex items-center gap-1 text-amber-300" title={c.hostBriefing}>
                          <Info className="w-3 h-3" /> Có brief Host
                        </span>
                      )}
                      <div className="flex items-center gap-2 ml-auto">
                        <select
                          value={c.status}
                          onChange={(e) => handleCampaignStatusChange(c, e.target.value as Campaign["status"])}
                          className={`px-2 py-1 rounded-lg font-bold border ${
                            c.status === "active"
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : c.status === "completed"
                              ? "bg-blue-950 text-blue-300 border-blue-800"
                              : c.status === "cancelled"
                              ? "bg-slate-800 text-slate-500 border-slate-700"
                              : "bg-amber-950 text-amber-300 border-amber-800"
                          }`}
                        >
                          <option value="draft">Draft</option>
                          <option value="active">Active</option>
                          <option value="completed">Completed</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <button onClick={() => onDeleteCampaign(c.id)} className="text-slate-500 hover:text-rose-400 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] border-t border-slate-800/80 pt-2">
                      <span className="text-slate-500">Duyệt với Brand:</span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${APPROVAL_STATUS_STYLES[c.approvalStatus]}`}>
                        {APPROVAL_STATUS_LABELS[c.approvalStatus]}
                      </span>
                      {c.sentAt && <span className="text-slate-500">Gửi lúc {new Date(c.sentAt).toLocaleString("vi-VN")}</span>}
                      {c.approvedAt && <span className="text-emerald-400">Duyệt lúc {new Date(c.approvedAt).toLocaleString("vi-VN")}</span>}
                      {(c.approvalStatus === "draft" || c.approvalStatus === "revision_requested") && (
                        <button
                          onClick={() => onSendCampaignForApproval(c)}
                          className="ml-auto flex items-center gap-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 px-2.5 py-1 rounded-lg font-bold transition-colors"
                        >
                          <Send className="w-3 h-3" /> Gửi Brand Duyệt
                        </button>
                      )}
                    </div>

                    {notes.length > 0 && (
                      <div className="space-y-1 border-t border-slate-800/80 pt-2">
                        <span className="text-[11px] text-amber-400 font-bold flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> Yêu cầu sửa từ Brand ({notes.length})
                        </span>
                        {notes.slice(0, 3).map((n) => (
                          <p key={n.id} className="text-[11px] text-slate-400 pl-4">
                            <span className="text-slate-300 font-bold">{n.requestedByName}</span> ({new Date(n.createdAt).toLocaleString("vi-VN")}): {n.note}
                          </p>
                        ))}
                      </div>
                    )}

                    {c.status === "completed" && (() => {
                      const actualGmv = campaignActualGmv.get(c.id) ?? 0;
                      const pct = c.targetGmv > 0 ? Math.round((actualGmv / c.targetGmv) * 100) : 0;
                      const reviewing = reviewingCampaignId === c.id;
                      return (
                        <div className="space-y-2 border-t border-slate-800/80 pt-2">
                          <div className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="text-slate-500">Đánh giá cuối campaign:</span>
                            <span className="text-slate-300">
                              Thật {actualGmv.toLocaleString("vi-VN")}đ / KPI {c.targetGmv.toLocaleString("vi-VN")}đ ({pct}%)
                            </span>
                            {c.outcome && <span className={`px-2 py-0.5 rounded-full font-bold ${OUTCOME_STYLES[c.outcome]}`}>{OUTCOME_LABELS[c.outcome]}</span>}
                            {c.renewalDecision && (
                              <span className={`px-2 py-0.5 rounded-full font-bold ${RENEWAL_STYLES[c.renewalDecision]}`}>{RENEWAL_LABELS[c.renewalDecision]}</span>
                            )}
                            {!reviewing && (
                              <button
                                onClick={() => openReviewPanel(c)}
                                className="ml-auto flex items-center gap-1 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded-lg font-bold transition-colors"
                              >
                                <Check className="w-3 h-3" /> {c.outcome ? "Sửa Đánh Giá" : "Đánh Giá"}
                              </button>
                            )}
                          </div>
                          {c.reviewNotes && !reviewing && <p className="text-[11px] text-slate-400 pl-1">{c.reviewNotes}</p>}
                          {c.reviewedAt && !reviewing && (
                            <span className="text-[11px] text-slate-600 pl-1">Đánh giá lúc {new Date(c.reviewedAt).toLocaleString("vi-VN")}</span>
                          )}

                          {reviewing && (
                            <div className="bg-slate-950/80 border border-emerald-800/60 rounded-lg p-3 space-y-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select
                                  value={reviewOutcome}
                                  onChange={(e) => setReviewOutcome(e.target.value as NonNullable<Campaign["outcome"]>)}
                                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                                >
                                  {Object.entries(OUTCOME_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={reviewRenewal}
                                  onChange={(e) => setReviewRenewal(e.target.value as NonNullable<Campaign["renewalDecision"]>)}
                                  className="bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                                >
                                  {Object.entries(RENEWAL_LABELS).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <textarea
                                value={reviewNotesDraft}
                                onChange={(e) => setReviewNotesDraft(e.target.value)}
                                placeholder="Ghi chú đánh giá (lý do đạt/không đạt KPI, dấu hiệu rủi ro rời Brand...)"
                                rows={2}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleSubmitReview(c)}
                                  disabled={reviewBusy}
                                  className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors"
                                >
                                  {reviewBusy ? "Đang lưu..." : "Lưu Đánh Giá"}
                                </button>
                                <button
                                  onClick={() => setReviewingCampaignId(null)}
                                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                                >
                                  Huỷ
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}

          <form onSubmit={handleCreateCampaignSubmit} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-slate-800 pt-3">
            <select
              value={campBrandId}
              onChange={(e) => setCampBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Tên campaign (VD: Mega 8/8)"
              required
              value={campName}
              onChange={(e) => setCampName(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500 sm:col-span-2"
            />
            <select
              value={campType}
              onChange={(e) => setCampType(e.target.value as Campaign["type"])}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {Object.entries(CAMPAIGN_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              placeholder="KPI GMV"
              value={campTargetGmv}
              onChange={(e) => setCampTargetGmv(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 sm:col-span-3 lg:col-span-2">
              <input
                type="date"
                required
                value={campStartDate}
                onChange={(e) => setCampStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
              <input
                type="date"
                required
                value={campEndDate}
                onChange={(e) => setCampEndDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <textarea
              placeholder="Brief/đào tạo cho Host của campaign này (tuỳ chọn) — hiển thị cho Host khi xem ca thuộc campaign"
              value={campHostBriefing}
              onChange={(e) => setCampHostBriefing(e.target.value)}
              rows={2}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500 sm:col-span-3 lg:col-span-5"
            />
            <button
              type="submit"
              disabled={creatingCampaign || !campBrandId}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors sm:col-span-3 lg:col-span-1"
            >
              {creatingCampaign ? "Đang tạo..." : "+ Tạo Campaign"}
            </button>
          </form>
        </div>
      )}

      {admin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Repeat className="w-4 h-4 text-purple-400" /> Quy Tắc Lặp (Ca Cố Định Theo Tuần)
          </h3>
          <p className="text-xs text-slate-500 -mt-2">
            Khai báo 1 lần, hệ thống tự sinh ca cho cả tháng — thay vì mở tay từng ca lặp lại mỗi tuần.
          </p>

          {recurringShiftTemplates.length > 0 && (
            <div className="space-y-1.5">
              {recurringShiftTemplates.map((t) => (
                <div
                  key={t.id}
                  className={`flex flex-wrap items-center gap-2 text-xs bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 ${
                    !t.active ? "opacity-50" : ""
                  }`}
                >
                  <span className="font-mono font-bold text-white w-14">{WEEKDAY_LABELS[t.weekday]}</span>
                  <span className="font-mono text-slate-300">{t.startTime}-{t.endTime}</span>
                  <span className="text-slate-400">{t.brandName || "—"}</span>
                  <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{t.platform}</span>
                  {t.studioName && <span className="text-slate-500">{t.studioName}</span>}
                  {t.campaignId && campaignsById.get(t.campaignId) && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Target className="w-3 h-3" /> {campaignsById.get(t.campaignId)?.name}
                    </span>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => onToggleTemplate(t)}
                      className={`px-2 py-1 rounded-lg font-bold ${
                        t.active
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-slate-800 text-slate-400 border border-slate-700"
                      }`}
                    >
                      {t.active ? "Đang bật" : "Đã tắt"}
                    </button>
                    <button onClick={() => onDeleteTemplate(t.id)} className="text-slate-500 hover:text-rose-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleCreateTemplate} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-t border-slate-800 pt-3">
            <select
              value={tplWeekday}
              onChange={(e) => setTplWeekday(Number(e.target.value))}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              {WEEKDAY_LABELS.map((label, idx) => (
                <option key={idx} value={idx}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="time"
              required
              value={tplStart}
              onChange={(e) => setTplStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={tplEnd}
              onChange={(e) => setTplEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={tplBrandId}
              onChange={(e) => setTplBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={tplPlatform}
              onChange={(e) => setTplPlatform(e.target.value as "TikTok" | "Shopee")}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
            </select>
            <select
              value={tplStudioId}
              onChange={(e) => setTplStudioId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Studio (tuỳ chọn) —</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={tplCampaignId}
              onChange={(e) => setTplCampaignId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Campaign (tuỳ chọn) —</option>
              {campaignsForTplBrand.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={creatingTpl || !tplBrandId}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors sm:col-span-3 lg:col-span-6"
            >
              {creatingTpl ? "Đang thêm..." : "+ Thêm Quy Tắc Lặp"}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
            <button
              onClick={handleGenerate}
              disabled={generating || recurringShiftTemplates.every((t) => !t.active)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              {generating ? "Đang sinh ca..." : `Sinh Ca Cho Tháng ${selectedMonth}`}
            </button>
            {generateMsg && <span className="text-xs text-slate-400">{generateMsg}</span>}
          </div>
        </div>
      )}

      {admin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" /> Mở Ca Mới (Phát Sinh)
          </h3>
          <form onSubmit={handleCreateSlot} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <input
              type="date"
              required
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <input
              type="time"
              required
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            />
            <select
              value={newBrandId}
              onChange={(e) => setNewBrandId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Brand —</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value as "TikTok" | "Shopee")}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="TikTok">TikTok</option>
              <option value="Shopee">Shopee</option>
            </select>
            <select
              value={newStudioId}
              onChange={(e) => setNewStudioId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Studio (tuỳ chọn) —</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={newCampaignId}
              onChange={(e) => setNewCampaignId(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— Campaign (tuỳ chọn) —</option>
              {campaignsForNewBrand.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Ghi chú (tuỳ chọn)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-white text-sm focus:outline-none focus:border-blue-500 sm:col-span-2 lg:col-span-3"
            />
            <button
              type="submit"
              disabled={creating || !newBrandId}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl px-4 py-2 text-sm transition-colors sm:col-span-1 lg:col-span-3"
            >
              {creating ? "Đang mở..." : "Mở Ca Đăng Ký"}
            </button>
          </form>

          {newSlotConflicts.length > 0 && (
            <div className="flex items-start gap-2 text-xs bg-rose-950/50 border border-rose-800 rounded-xl p-3 text-rose-200">
              <Flame className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Ưu tiên hoá studio — studio này đã có ca khác cùng khung giờ:</div>
                <div>
                  {newSlotConflicts.map((c) => `${c.brandName} (${c.startTime}-${c.endTime})`).join(", ")}
                </div>
                <div className="text-rose-300/80 mt-0.5">Cân nhắc đổi studio/khung giờ, hoặc xác nhận khi mở ca nếu cố ý ưu tiên brand này.</div>
              </div>
            </div>
          )}

          {newBrandId && (
            <div className="flex items-center gap-3 text-xs text-slate-400 border-t border-slate-800 pt-3">
              <DollarSign className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Rate/giờ ({newPlatform}, {brands.find((b) => b.id === newBrandId)?.name}):</span>
              <input
                type="number"
                min={0}
                placeholder={String(rateFor(newBrandId, newPlatform)?.ratePerHour ?? 0)}
                value={rateDraft[`${newBrandId}:${newPlatform}`] ?? ""}
                onChange={(e) => setRateDraft((prev) => ({ ...prev, [`${newBrandId}:${newPlatform}`]: e.target.value }))}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-white w-32 font-mono focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={() => handleSaveRate(newBrandId)}
                className="text-blue-400 hover:text-blue-300 font-bold"
              >
                Lưu Rate
              </button>
              <span className="text-slate-500">
                → Target GMV/ca ({durationHours(newStart, newEnd).toFixed(1)}h) ={" "}
                {((rateFor(newBrandId, newPlatform)?.ratePerHour ?? 0) * durationHours(newStart, newEnd)).toLocaleString("vi-VN")}đ
              </span>
            </div>
          )}
        </div>
      )}

      {admin && slotsMissingBoth.length > 0 && (
        <div className="bg-rose-950/50 border border-rose-800 rounded-xl p-4 text-sm text-rose-200">
          <div className="font-bold flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4" /> {slotsMissingBoth.length} ca chưa có ai đăng ký (thiếu cả Host &amp; Trợ live)
          </div>
          <div className="flex flex-wrap gap-2">
            {slotsMissingBoth.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedDate(s.date)}
                className="bg-rose-900/60 border border-rose-800 rounded-lg px-2 py-1 font-mono text-xs hover:bg-rose-900 transition-colors"
              >
                {s.date} {s.startTime}-{s.endTime} · {s.brandName}
              </button>
            ))}
          </div>
        </div>
      )}

      {admin && slotsMissingCoHost.length > 0 && (
        <div className="bg-amber-950/50 border border-amber-800 rounded-xl p-4 text-sm text-amber-200">
          <div className="font-bold flex items-center gap-2 mb-2">
            <UserX className="w-4 h-4" /> {slotsMissingCoHost.length} ca đã có người đăng ký làm Host, còn thiếu Trợ live (Co-host)
          </div>
          <div className="flex flex-wrap gap-2">
            {slotsMissingCoHost.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedDate(s.date)}
                className="bg-amber-900/60 border border-amber-800 rounded-lg px-2 py-1 font-mono text-xs hover:bg-amber-900 transition-colors"
              >
                {s.date} {s.startTime}-{s.endTime} · {s.brandName}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <CalendarIcon className="w-4 h-4 text-blue-400" /> Lịch Ma Trận Tháng {selectedMonth}
        </h3>
        <div className="overflow-x-auto -mx-2">
          <div className="min-w-[760px] px-2">
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {WEEKDAY_LABELS.map((label, idx) => (
                <div
                  key={label}
                  className={`text-center text-[11px] font-bold uppercase tracking-wide py-1 ${
                    idx === 0 || idx === 6 ? "text-amber-400" : "text-slate-500"
                  }`}
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {monthGrid.map((cell) => {
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
                const visibleChips = daySlots.slice(0, 3);
                const extra = daySlots.length - visibleChips.length;
                return (
                  <button
                    key={cell.date}
                    onClick={() => setSelectedDate(cell.date === selectedDate ? null : cell.date)}
                    className={`text-left min-h-[92px] sm:min-h-[108px] rounded-lg p-1.5 flex flex-col gap-1 border transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-950/30"
                        : isToday
                        ? "border-purple-600 bg-slate-950/80"
                        : "border-slate-800 bg-slate-950/50 hover:border-slate-700"
                    } ${!cell.inMonth ? "opacity-35" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${isToday ? "text-purple-300" : "text-slate-300"}`}>{dayNum}</span>
                      {dayWarningColor && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dayWarningColor}`} title={dayWarningTitle} />}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {visibleChips.map((s) => {
                        const regsCount = (registrationsBySlot.get(s.id) ?? []).length;
                        const dotColor =
                          s.status === "finalized"
                            ? "bg-emerald-400"
                            : s.status === "cancelled"
                            ? "bg-slate-600"
                            : regsCount === 0
                            ? "bg-rose-400"
                            : "bg-blue-400";
                        const shortBrand = s.brandName ? (s.brandName.length > 9 ? `${s.brandName.slice(0, 8)}…` : s.brandName) : "—";
                        return (
                          <span
                            key={s.id}
                            className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded bg-slate-900/80 ${
                              s.status === "cancelled" ? "text-slate-600 line-through" : "text-slate-300"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                            <span className="font-mono shrink-0">{s.startTime}</span>
                            <span className="truncate">{shortBrand}</span>
                          </span>
                        );
                      })}
                      {extra > 0 && <span className="text-[10px] text-slate-500 px-1">+{extra} khác</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 mt-3 pt-3 border-t border-slate-800">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> Mở, chưa ai đăng ký
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" /> Mở, đã có người đăng ký
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Đã chốt
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" /> Đã huỷ
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400" />
            {selectedDate ? `Ca Ngày ${dayLabel(selectedDate)} ${selectedDate}` : `Danh Sách Ca Tháng ${selectedMonth}`}
          </h3>
          {selectedDate && (
            <button onClick={() => setSelectedDate(null)} className="text-xs text-blue-400 hover:text-blue-300 font-bold">
              Xem cả tháng
            </button>
          )}
        </div>
        <div className="overflow-x-auto -mx-2">
          <div className="min-w-[720px] px-2 space-y-2">
            {visibleSlots.length === 0 && (
              <p className="text-sm text-slate-500 py-6 text-center">
                {selectedDate ? "Chưa có ca nào trong ngày này." : "Chưa có ca nào mở trong tháng này."}
              </p>
            )}
            {visibleSlots.map((slot) => {
              const regs = registrationsBySlot.get(slot.id) ?? [];
              const iAmRegistered = myTalentId ? regs.some((r) => r.talentId === myTalentId) : false;
              const pick = pickByLot[slot.id] ?? { hostId: "", coHostId: "" };
              const conflict =
                pick.hostId && checkConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", pick.hostId);
              const slotCampaign = slot.campaignId ? campaignsById.get(slot.campaignId) : undefined;
              const studioConflicts = findStudioConflicts(slot.date, slot.startTime, slot.endTime, slot.studioId ?? "", slot.brandId ?? "", slot.id);
              return (
                <div key={slot.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-mono font-bold text-white">
                        {dayLabel(slot.date)} {slot.date} · {slot.startTime}-{slot.endTime}
                      </span>
                      <span className="text-slate-400">{slot.brandName}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-bold">{slot.platform}</span>
                      {slot.studioName && <span className="text-slate-500 text-xs">{slot.studioName}</span>}
                      {slot.templateId ? (
                        <span className="flex items-center gap-1 text-[10px] text-purple-300" title="Tự động sinh từ quy tắc lặp">
                          <Zap className="w-3 h-3" /> Tự động
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600">Phát sinh</span>
                      )}
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          slot.status === "finalized"
                            ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                            : slot.status === "cancelled"
                            ? "bg-slate-800 text-slate-500 border border-slate-700"
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
                      {slotCampaign && (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-300" title={slotCampaign.hostBriefing || undefined}>
                          <Target className="w-3 h-3" /> {slotCampaign.name}
                          {slotCampaign.hostBriefing && <Info className="w-3 h-3 text-amber-300" />}
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
                        className="text-slate-500 hover:text-rose-400 transition-colors"
                        title="Xoá ca"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {!admin && slotCampaign?.hostBriefing && (
                    <div className="text-[11px] text-amber-200 bg-amber-950/40 border border-amber-900 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{slotCampaign.hostBriefing}</span>
                    </div>
                  )}

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
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {regs.length === 0 && <span className="text-xs text-slate-600">Chưa ai đăng ký</span>}
                      {regs.map((r) => (
                        <span key={r.id} className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">
                          {talentsById.get(r.talentId)?.name ?? r.talentId}
                        </span>
                      ))}
                      {regs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 ml-auto">
                          <select
                            value={pick.hostId}
                            onChange={(e) => setPickByLot((prev) => ({ ...prev, [slot.id]: { ...pick, hostId: e.target.value } }))}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
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
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
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
                      {conflict && (
                        <span className="w-full text-[11px] text-rose-400 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> Host đã chọn trùng lịch với 1 ca khác cùng ngày.
                        </span>
                      )}
                    </div>
                  )}

                  {slot.status === "finalized" &&
                    (() => {
                      const session = slot.sessionId ? sessions.find((s) => s.id === slot.sessionId) : undefined;
                      if (!session) {
                        return (
                          <div className="text-xs text-emerald-300 flex items-center gap-1.5 pt-1 border-t border-slate-800/80">
                            <Check className="w-3.5 h-3.5" /> Đã chốt — xem chi tiết ở tab Live Sessions / Lịch Vận Hành.
                          </div>
                        );
                      }
                      const swapping = emergencySwap?.slotId === slot.id ? emergencySwap : null;
                      const candidateRegs = regs.filter((r) => r.talentId !== session.hostId && r.talentId !== session.coHostId);
                      return (
                        <div className="pt-1 border-t border-slate-800/80 space-y-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span className="text-emerald-300">Đã chốt</span>
                            <span className="text-slate-400">
                              Host: <span className="text-white font-medium">{session.hostName || "—"}</span>
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
                                <span className="text-slate-400">
                                  · Trợ live: <span className="text-white font-medium">{session.coHostName}</span>
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
                            <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-2.5 space-y-2">
                              <div className="text-[11px] text-amber-200 font-bold">
                                Tìm người thay cho vai trò {swapping.role === "host" ? "Host" : "Trợ live"}
                              </div>
                              {candidateRegs.length === 0 ? (
                                <div className="text-[11px] text-slate-500">
                                  Không có ứng viên nào khác đã đăng ký rảnh ca này — cần báo tay/mở đăng ký lại.
                                </div>
                              ) : (
                                <select
                                  value={swapCandidateId}
                                  onChange={(e) => setSwapCandidateId(e.target.value)}
                                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
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
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-amber-500"
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
                                  className="text-xs text-slate-400 hover:text-white"
                                >
                                  Huỷ
                                </button>
                              </div>
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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <Users className="w-4 h-4 text-purple-400" /> Tải Theo Host — Tháng {selectedMonth}
        </h3>
        {loadByTalent.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có ca nào đã chốt trong tháng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[420px]">
              <thead>
                <tr className="text-left text-slate-500 text-xs uppercase border-b border-slate-800">
                  <th className="pb-2">Host</th>
                  <th className="pb-2 text-right">Số Ca</th>
                  <th className="pb-2 text-right">Tổng Giờ</th>
                </tr>
              </thead>
              <tbody>
                {loadByTalent.map((row) => (
                  <tr key={row.talentId} className="border-b border-slate-800/60 last:border-0">
                    <td className="py-2 text-white font-medium">{row.name || talentsById.get(row.talentId)?.name}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{row.shifts}</td>
                    <td className="py-2 text-right font-mono text-slate-300">{row.hours.toFixed(1)}h</td>
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
