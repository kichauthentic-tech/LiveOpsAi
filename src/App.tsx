import React, { useState, useEffect, useMemo } from "react";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry, WorkflowRule, Talent, Studio, Equipment, Brand, SessionFinance, TikTokConnectionStatus, TikTokWebhookEvent, AiAgentPrompt, BrandPlatformRate, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, TalentRateHistoryEntry, BrandPlatformRateHistoryEntry, BrandSku, PromoScheme } from "./types";
import { ALL_PERMISSION_DEFINITIONS } from "./data/mockData";
import { fetchTalents, updateTalent, deleteTalent } from "./lib/db/talents";
import { fetchStudios, createStudio, updateStudio, deleteStudio } from "./lib/db/studios";
import { fetchEquipments, createEquipment, updateEquipment, deleteEquipment } from "./lib/db/equipments";
import { fetchSessions, createSession, updateSession, deleteSession } from "./lib/db/sessions";
import { submitSessionReport, SessionReportInput } from "./lib/db/sessionReports";
import { fetchBrands, createBrand, updateBrand, deleteBrand } from "./lib/db/brands";
import { fetchUsers, updateUserProfile, inviteUser, deleteUserAccount, InviteUserPayload } from "./lib/db/users";
import { fetchWorkflowRules, createWorkflowRule, updateWorkflowRule, deleteWorkflowRule } from "./lib/db/workflowRules";
import { fetchAuditLogs, createAuditLog } from "./lib/db/auditLogs";
import { fetchRolePermissions, updateRolePermissions } from "./lib/db/rolePermissions";
import { fetchSessionFinances, upsertSessionFinance, setSessionFinanceApproval } from "./lib/db/finance";
import { fetchTikTokStatus, fetchTikTokWebhookEvents } from "./lib/db/tiktokIntegration";
import { fetchAiAgentPrompts, updateAiAgentPrompt } from "./lib/db/aiAgentPrompts";
import { fetchBrandPlatformRates, upsertBrandPlatformRate, upsertBrandPlatformReturnRate } from "./lib/db/brandPlatformRates";
import { fetchShiftSlots, createShiftSlot, createShiftSlots, updateShiftSlot, deleteShiftSlot } from "./lib/db/shiftSlots";
import { fetchShiftRegistrations, registerForSlot, unregisterFromSlot } from "./lib/db/shiftRegistrations";
import {
  fetchRecurringShiftTemplates,
  createRecurringShiftTemplate,
  updateRecurringShiftTemplate,
  deleteRecurringShiftTemplate
} from "./lib/db/recurringShiftTemplates";
import { fetchTalentRateHistory } from "./lib/db/talentRateHistory";
import { fetchBrandPlatformRateHistory } from "./lib/db/brandPlatformRateHistory";
import { fetchBrandSkus, createBrandSku, updateBrandSku, deleteBrandSku } from "./lib/db/brandSkus";
import { fetchPromoSchemes, createPromoScheme, updatePromoScheme, deletePromoScheme } from "./lib/db/promoSchemes";
import {
  LayoutDashboard,
  Radio,
  FileText,
  Users,
  Building2,
  Briefcase,
  Link2,
  DollarSign,
  Bot,
  Menu,
  X,
  Calendar as CalendarIcon,
  ShieldCheck,
  Lock,
  ShieldAlert,
  UserCheck,
  BrainCircuit,
  UserCog,
  CalendarClock,
  Store,
  Package,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { Header, WorkspaceContext } from "./components/Header";
import { BrandDashboard } from "./components/brand-workspace/BrandDashboard";
import { BrandCalendar } from "./components/brand-workspace/BrandCalendar";
import { BrandSessions } from "./components/brand-workspace/BrandSessions";
import { BrandSkuShowcase } from "./components/brand-workspace/BrandSkuShowcase";
import { BrandAudienceAnalytics } from "./components/brand-workspace/BrandAudienceAnalytics";
import { BrandMonthlyReport } from "./components/brand-workspace/BrandMonthlyReport";
import { Login } from "./components/Login";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { AccountSettings } from "./components/AccountSettings";
import { MyTalentProfile } from "./components/MyTalentProfile";
import { useAuth } from "./hooks/useAuth";
import { Dashboards } from "./components/Dashboards";
import { LiveSessionHub } from "./components/LiveSessionHub";
import { LiveCalendar } from "./components/LiveCalendar";
import { TalentMatcher, NewTalentAccountPayload } from "./components/TalentMatcher";
import { StudioEquipment } from "./components/StudioEquipment";
import { CrmProjects } from "./components/CrmProjects";
import { TikTokApiAutomation } from "./components/TikTokApiAutomation";
import { FinanceHr } from "./components/FinanceHr";
import { AiMultiAgent } from "./components/AiMultiAgent";
import { UserRoleSettings } from "./components/UserRoleSettings";
import { AiTrainingCenter } from "./components/AiTrainingCenter";
import ShiftScheduling from "./components/ShiftScheduling";

const STORAGE_PREFIX = "liveops_os_v2_";

// Các tab mà nội dung chính là lưới lịch — vào là tự thu gọn sidebar để lấy chiều ngang
// (lưới 7 cột / ma trận 5 khung giờ cần ~150px mỗi ô, xem WORKSPACE_DESIGN.md).
// 2 dashboard cũng có lịch GMV nhưng nằm trong sub-tab, nên xử lý riêng qua
// `onCalendarViewChange` chứ không liệt kê ở đây.
const CALENDAR_TABS = new Set(["calendar", "brand_calendar", "shift_scheduling"]);

function loadStorage<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(STORAGE_PREFIX + key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("Failed to save state to localStorage:", e);
  }
}

export default function App() {
  const { session, profile, loading: authLoading, signOut, passwordRecovery } = useAuth();

  const currentRole: UserRole = profile?.role ?? "talent";
  const [activeTab, setActiveTab] = useState<string>(() => loadStorage("activeTab", "dashboard"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Thu gọn sidebar thành thanh icon (w-16) để nhường không gian ngang cho calendar.
  // Chỉ áp dụng từ breakpoint md trở lên — dưới md sidebar vẫn là drawer trượt như cũ.
  //
  // 3 mảnh state:
  //  - `sidebarPref`: lựa chọn tay của user cho các module KHÔNG có lịch (persist).
  //  - `dashboardCalendarView`: 2 dashboard báo lên khi sub-tab đang mở là lịch GMV.
  //  - `sidebarCollapsed`: trạng thái thật đang render = tự thu gọn trong module có lịch,
  //    ngoài ra trả về đúng `sidebarPref`.
  const [sidebarPref, setSidebarPref] = useState<boolean>(() => loadStorage("sidebarCollapsed", false));
  useEffect(() => saveStorage("sidebarCollapsed", sidebarPref), [sidebarPref]);

  const [dashboardCalendarView, setDashboardCalendarView] = useState(false);
  const isCalendarModule =
    CALENDAR_TABS.has(activeTab) ||
    ((activeTab === "dashboard" || activeTab === "brand_dashboard") && dashboardCalendarView);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(sidebarPref);
  // Vào module có lịch → tự thu gọn; rời đi → trả lại đúng lựa chọn tay của user.
  // Nếu user tự mở lại sidebar khi đang ở trong module lịch thì effect này không chạy
  // (deps không đổi) nên tôn trọng thao tác đó cho tới lần chuyển module kế tiếp.
  useEffect(() => {
    setSidebarCollapsed(isCalendarModule ? true : sidebarPref);
  }, [isCalendarModule, sidebarPref]);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      // Chỉ ghi đè lựa chọn mặc định khi đang ở module không có lịch — thao tác tay
      // trong module lịch chỉ có tác dụng tạm thời, không đổi mặc định của user.
      if (!isCalendarModule) setSidebarPref(next);
      return next;
    });
  }, [isCalendarModule]);

  // Phím tắt Cmd/Ctrl + B — chuẩn quen thuộc của các app có sidebar (VSCode, Notion...).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  // Giai đoạn A — Workspace Agency ↔ Brand (xem WORKSPACE_DESIGN.md). Chỉ có ý nghĩa với
  // ceo/admin/operations (những role được phép nhìn xuyên brand); role "brand" tự khoá vào
  // đúng 1 brand của họ ở effectiveWorkspace bên dưới, không dùng state raw này.
  const [workspace, setWorkspace] = useState<WorkspaceContext>(() =>
    loadStorage<WorkspaceContext>("workspace", { type: "agency" })
  );
  useEffect(() => saveStorage("workspace", workspace), [workspace]);

  // Role Permissions Matrix — real data from Supabase `role_permissions` (Phase 6), no mock/localStorage fallback
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({} as RolePermissionsMap);
  const [phase6Loading, setPhase6Loading] = useState(true);
  const [phase6Error, setPhase6Error] = useState<string | null>(null);

  // Session Finance (P&L per completed session) — real data from Supabase `session_finance` (Phase 7), no mock fallback
  const [financeRecords, setFinanceRecords] = useState<SessionFinance[]>([]);
  const [phase7Loading, setPhase7Loading] = useState(true);
  const [phase7Error, setPhase7Error] = useState<string | null>(null);

  // TikTok Shop Partner API connection status + webhook log (Phase 9), no mock fallback
  const [tiktokStatus, setTiktokStatus] = useState<TikTokConnectionStatus | null>(null);
  const [tiktokStatusLoading, setTiktokStatusLoading] = useState(true);
  const [tiktokStatusError, setTiktokStatusError] = useState<string | null>(null);
  const [tiktokWebhookEvents, setTiktokWebhookEvents] = useState<TikTokWebhookEvent[]>([]);

  // AI Training Center prompts — real data from Supabase `ai_agent_prompts` (Giai đoạn 13),
  // admin-only (RLS blocks read/write for every other role, incl. ceo). Only fetched for
  // an admin session so non-admin users never see a 403 flash for a tab they can't reach.
  const [aiAgentPrompts, setAiAgentPrompts] = useState<AiAgentPrompt[]>([]);
  const [aiAgentPromptsLoading, setAiAgentPromptsLoading] = useState(true);
  const [aiAgentPromptsError, setAiAgentPromptsError] = useState<string | null>(null);

  // Workflow Rules / Audit Logs — real data from Supabase (Phase 5), no mock fallback
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [phase5Loading, setPhase5Loading] = useState(true);
  const [phase5Error, setPhase5Error] = useState<string | null>(null);

  // System Users — real data from Supabase `profiles` (Phase 4), no mock fallback
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [phase4Loading, setPhase4Loading] = useState(true);
  const [phase4Error, setPhase4Error] = useState<string | null>(null);

  // Talents / Studios / Equipments — real data from Supabase (Phase 1), no mock fallback
  const [talents, setTalents] = useState<Talent[]>([]);
  const [studios, setStudios] = useState<Studio[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [phase1Loading, setPhase1Loading] = useState(true);
  const [phase1Error, setPhase1Error] = useState<string | null>(null);

  // Live Sessions — real data from Supabase (Phase 2), no mock fallback
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<LiveSession | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Brands — real data from Supabase (Phase 3), no mock fallback
  const [brands, setBrands] = useState<Brand[]>([]);
  const [phase3Loading, setPhase3Loading] = useState(true);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);

  // Đăng ký & Chốt Lịch Host — real data from Supabase `brand_platform_rates`/`shift_slots`/
  // `session_availability` (Giai đoạn 14a), no mock fallback.
  const [brandPlatformRates, setBrandPlatformRates] = useState<BrandPlatformRate[]>([]);
  const [shiftSlots, setShiftSlots] = useState<ShiftSlot[]>([]);
  const [shiftRegistrations, setShiftRegistrations] = useState<ShiftRegistration[]>([]);
  const [recurringShiftTemplates, setRecurringShiftTemplates] = useState<RecurringShiftTemplate[]>([]);
  const [phase14Loading, setPhase14Loading] = useState(true);
  const [phase14Error, setPhase14Error] = useState<string | null>(null);


  // Rate Card Versioning (Giai đoạn 19) — lịch sử rate theo thời gian, ghi tự động bởi DB
  // trigger (migration 0018). Chỉ đọc, dùng để tra rate đúng tại ngày của session cũ ở
  // FinanceHr.tsx thay vì đọc giá trị hiện tại của talents/brandPlatformRates.
  const [talentRateHistory, setTalentRateHistory] = useState<TalentRateHistoryEntry[]>([]);
  const [brandPlatformRateHistory, setBrandPlatformRateHistory] = useState<BrandPlatformRateHistoryEntry[]>([]);
  const [phase19Loading, setPhase19Loading] = useState(true);
  const [phase19Error, setPhase19Error] = useState<string | null>(null);

  // Giai đoạn B1 — SKU Showcase & Hero Product Catalog (Brand Workspace, xem
  // WORKSPACE_DESIGN.md#6). Fetch 1 lần ở agency-level, mỗi Brand Workspace
  // tự filter theo brandId.
  const [brandSkus, setBrandSkus] = useState<BrandSku[]>([]);
  const [phaseB1Loading, setPhaseB1Loading] = useState(true);
  const [phaseB1Error, setPhaseB1Error] = useState<string | null>(null);
  // Giai đoạn C3 — Scheme khuyến mãi tích hợp Calendar. Áp dụng theo khoảng ngày, agency-wide.
  const [promoSchemes, setPromoSchemes] = useState<PromoScheme[]>([]);
  const [phaseC3Loading, setPhaseC3Loading] = useState(true);
  const [phaseC3Error, setPhaseC3Error] = useState<string | null>(null);

  // Giai đoạn C4 — Price List Import (SKU pricing theo platform, Brand Workspace).

  // Previously these fetch errors were only stored in state and never rendered anywhere — a
  // failed fetch left a tab silently empty forever with no indication anything went wrong.
  const [dismissedDataErrorSignature, setDismissedDataErrorSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase1Loading(true);
    Promise.all([fetchTalents(), fetchStudios(), fetchEquipments()])
      .then(([t, s, e]) => {
        if (cancelled) return;
        setTalents(t);
        setStudios(s);
        setEquipments(e);
        setPhase1Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase1Error(err.message ?? "Không tải được dữ liệu Talent/Studio/Equipment từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase1Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setSessionsLoading(true);
    fetchSessions()
      .then((s) => {
        if (cancelled) return;
        setSessions(s);
        setSelectedSession((prev) => prev ?? s[0] ?? null);
        setSessionsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSessionsError(err.message ?? "Không tải được dữ liệu Live Sessions từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase3Loading(true);
    fetchBrands()
      .then((b) => {
        if (cancelled) return;
        setBrands(b);
        setPhase3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase3Error(err.message ?? "Không tải được dữ liệu Brand từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase3Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase4Loading(true);
    fetchUsers()
      .then((u) => {
        if (cancelled) return;
        setUsers(u);
        setPhase4Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase4Error(err.message ?? "Không tải được danh sách tài khoản người dùng từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase4Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase5Loading(true);
    Promise.all([fetchWorkflowRules(), fetchAuditLogs()])
      .then(([w, a]) => {
        if (cancelled) return;
        setWorkflowRules(w);
        setAuditLogs(a);
        setPhase5Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase5Error(err.message ?? "Không tải được Workflow Rules/Audit Logs từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase5Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase6Loading(true);
    fetchRolePermissions()
      .then((map) => {
        if (cancelled) return;
        setRolePermissions(map);
        setPhase6Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase6Error(err.message ?? "Không tải được Ma Trận Phân Quyền Role từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase6Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase14Loading(true);
    Promise.all([fetchBrandPlatformRates(), fetchShiftSlots(), fetchShiftRegistrations(), fetchRecurringShiftTemplates()])
      .then(([rates, slots, regs, templates]) => {
        if (cancelled) return;
        setBrandPlatformRates(rates);
        setShiftSlots(slots);
        setShiftRegistrations(regs);
        setRecurringShiftTemplates(templates);
        setPhase14Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase14Error(err.message ?? "Không tải được dữ liệu Đăng Ký & Chốt Lịch Host từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase14Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase19Loading(true);
    Promise.all([fetchTalentRateHistory(), fetchBrandPlatformRateHistory()])
      .then(([talentHistory, brandHistory]) => {
        if (cancelled) return;
        setTalentRateHistory(talentHistory);
        setBrandPlatformRateHistory(brandHistory);
        setPhase19Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase19Error(err.message ?? "Không tải được Lịch Sử Rate Card từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase19Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhase7Loading(true);
    fetchSessionFinances()
      .then((f) => {
        if (cancelled) return;
        setFinanceRecords(f);
        setPhase7Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase7Error(err.message ?? "Không tải được dữ liệu Finance & HR từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase7Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhaseB1Loading(true);
    fetchBrandSkus()
      .then((skus) => {
        if (cancelled) return;
        setBrandSkus(skus);
        setPhaseB1Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseB1Error(err.message ?? "Không tải được SKU Showcase từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhaseB1Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhaseC3Loading(true);
    fetchPromoSchemes()
      .then((schemes) => {
        if (cancelled) return;
        setPromoSchemes(schemes);
        setPhaseC3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseC3Error(err.message ?? "Không tải được Scheme khuyến mãi từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhaseC3Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session || currentRole !== "admin") {
      setAiAgentPromptsLoading(false);
      return;
    }
    let cancelled = false;
    setAiAgentPromptsLoading(true);
    fetchAiAgentPrompts()
      .then((p) => {
        if (cancelled) return;
        setAiAgentPrompts(p);
        setAiAgentPromptsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAiAgentPromptsError(err.message ?? "Không tải được AI Training Center từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setAiAgentPromptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, currentRole]);

  async function handleUpdateAiAgentPrompt(agentKey: string, systemPrompt: string) {
    const updated = await updateAiAgentPrompt(agentKey, systemPrompt);
    setAiAgentPrompts((prev) => prev.map((p) => (p.agentKey === agentKey ? updated : p)));
  }

  const refreshTikTokStatus = () => {
    if (!session) return;
    setTiktokStatusLoading(true);
    Promise.all([fetchTikTokStatus(), fetchTikTokWebhookEvents()])
      .then(([status, events]) => {
        setTiktokStatus(status);
        setTiktokWebhookEvents(events);
        setTiktokStatusError(null);
      })
      .catch((err) => {
        setTiktokStatusError(err.message ?? "Không tải được trạng thái kết nối TikTok.");
      })
      .finally(() => setTiktokStatusLoading(false));
  };

  useEffect(() => {
    if (!session) return;
    refreshTikTokStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  async function handleUpdateSessionFinance(
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "agencyCommissionRate" | "studioCost" | "adsCost" | "notes">>
  ) {
    try {
      const updated = await upsertSessionFinance(sessionId, patch);
      setFinanceRecords((prev) => {
        const others = prev.filter((f) => f.sessionId !== sessionId);
        return [...others, updated];
      });
    } catch (e: any) {
      window.alert(`Không thể cập nhật Finance & HR: ${e.message ?? e}`);
    }
  }

  async function handleSetSessionFinanceApproval(sessionId: string, status: SessionFinance["approvalStatus"]) {
    try {
      const updated = await setSessionFinanceApproval(sessionId, status);
      setFinanceRecords((prev) => {
        const others = prev.filter((f) => f.sessionId !== sessionId);
        return [...others, updated];
      });
    } catch (e: any) {
      window.alert(`Không thể cập nhật trạng thái duyệt: ${e.message ?? e}`);
    }
  }

  async function handleAddBrandSku(sku: { brandId: string; name: string; skuCode: string; flashPrice: number; originalPrice: number }) {
    const created = await createBrandSku({ ...sku, createdBy: profile?.id });
    setBrandSkus((prev) => [...prev, created]);
  }

  async function handleUpdateBrandSku(
    id: string,
    patch: Partial<
      Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
    >
  ) {
    const updated = await updateBrandSku(id, patch);
    setBrandSkus((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDeleteBrandSku(id: string) {
    await deleteBrandSku(id);
    setBrandSkus((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddPromoScheme(scheme: {
    title: string;
    description: string;
    startDate: string;
    endDate: string;
    brandId?: string;
    category?: string;
  }) {
    const created = await createPromoScheme({ ...scheme, createdBy: profile?.id });
    setPromoSchemes((prev) => [...prev, created]);
  }

  async function handleUpdatePromoScheme(
    id: string,
    patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>
  ) {
    const updated = await updatePromoScheme(id, patch);
    setPromoSchemes((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDeletePromoScheme(id: string) {
    await deletePromoScheme(id);
    setPromoSchemes((prev) => prev.filter((s) => s.id !== id));
  }

  // LocalStorage sync effects
  useEffect(() => saveStorage("activeTab", activeTab), [activeTab]);

  // Live Sessions are real Supabase data now (Phase 2) — no mock filtering applies
  const rawActiveSessions = sessions;
  // Brands/Talents/Studios/Equipments are real Supabase data now — no mock filtering applies
  const rawActiveBrands = brands;
  const rawActiveTalents = talents;
  const rawActiveStudios = studios;
  const rawActiveEquipments = equipments;
  // Workflow Rules/Audit Logs are real Supabase data now (Phase 5) — no mock filtering applies
  const activeWorkflowRules = workflowRules;
  const activeAuditLogs = auditLogs;
  // Users are real Supabase data now (Phase 4) — no mock filtering applies
  const activeUsers = users;

  // 2. DERIVED DATA: Studio equipment count calculated directly from equipment list assignments
  const activeStudios = useMemo(() => {
    return rawActiveStudios.map((s) => {
      const assignedEquips = rawActiveEquipments.filter(
        (e) => e.assignedStudioId === s.id || e.assignedStudioName?.toLowerCase() === s.name?.toLowerCase()
      );
      return {
        ...s,
        equipmentCount: assignedEquips.length
      };
    });
  }, [rawActiveStudios, rawActiveEquipments]);

  // 3. DERIVED DATA: Talent availability status dynamically updated based on active live sessions
  const activeTalents = useMemo(() => {
    return rawActiveTalents.map((t) => {
      const isLiveNow = rawActiveSessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Live Now"
      );
      const isUpcoming = rawActiveSessions.some(
        (s) => (s.hostId === t.id || s.hostName?.toLowerCase() === t.name?.toLowerCase()) && s.status === "Upcoming"
      );
      let derivedStatus: "Available" | "Busy" | "On Live" = t.availabilityStatus || "Available";
      if (isLiveNow) {
        derivedStatus = "On Live";
      } else if (isUpcoming && derivedStatus === "Available") {
        derivedStatus = "Busy";
      }
      return {
        ...t,
        availabilityStatus: derivedStatus
      };
    });
  }, [rawActiveTalents, rawActiveSessions]);

  const activeSessions = rawActiveSessions;
  const activeBrands = rawActiveBrands;
  const activeEquipments = rawActiveEquipments;

  const dataLoadErrors = useMemo(
    () =>
      [
        phase1Error && { key: "phase1", message: phase1Error },
        sessionsError && { key: "sessions", message: sessionsError },
        phase3Error && { key: "phase3", message: phase3Error },
        phase4Error && { key: "phase4", message: phase4Error },
        phase5Error && { key: "phase5", message: phase5Error },
        phase6Error && { key: "phase6", message: phase6Error },
        phase7Error && { key: "phase7", message: phase7Error },
        phase14Error && { key: "phase14", message: phase14Error },
        phase19Error && { key: "phase19", message: phase19Error },
        phaseB1Error && { key: "phaseB1", message: phaseB1Error },
        phaseC3Error && { key: "phaseC3", message: phaseC3Error }
      ].filter((e): e is { key: string; message: string } => Boolean(e)),
    [
      phase1Error,
      sessionsError,
      phase3Error,
      phase4Error,
      phase5Error,
      phase6Error,
      phase7Error,
      phase14Error,
      phase19Error,
      phaseB1Error,
      phaseC3Error
    ]
  );
  const dataLoadErrorSignature = dataLoadErrors.map((e) => e.key + ":" + e.message).join("|");
  const showDataLoadErrorBanner = dataLoadErrors.length > 0 && dismissedDataErrorSignature !== dataLoadErrorSignature;

  // Active Selected Session (null/undefined when activeSessions is empty)
  const activeSelectedSession = activeSessions.find((s) => s.id === selectedSession?.id) || activeSessions[0] || null;

  // Active User object — derived from the real authenticated Supabase profile, not a fake switcher
  const activeUser: SystemUser = profile
    ? {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        customRoleTitle: profile.custom_role_title,
        avatar: profile.avatar,
        status: profile.status,
        assignedBrandId: profile.assigned_brand_id ?? undefined,
        assignedTalentId: profile.assigned_talent_id ?? undefined,
        lastLogin: profile.last_login ?? "",
        customPermissionOverrides: profile.custom_permission_overrides ?? undefined
      }
    : {
        id: "unknown",
        name: "—",
        email: "",
        role: "talent",
        customRoleTitle: "",
        avatar: "",
        status: "Active",
        lastLogin: ""
      };

  // Workspace thật đang áp dụng — role "brand" bị ép cứng vào brand của chính họ (không cho
  // chọn lại); ceo/admin/operations dùng state `workspace` từ switcher; các role khác
  // (talent/moderator) luôn ở Agency Workspace vì chưa có nhu cầu nghiệp vụ nhìn theo brand.
  const effectiveWorkspace: WorkspaceContext = useMemo(() => {
    if (currentRole === "brand") {
      return activeUser.assignedBrandId ? { type: "brand", brandId: activeUser.assignedBrandId } : { type: "agency" };
    }
    if (currentRole === "ceo" || currentRole === "admin" || currentRole === "operations") {
      return workspace;
    }
    return { type: "agency" };
  }, [currentRole, workspace, activeUser.assignedBrandId]);
  const currentBrandId = effectiveWorkspace.type === "brand" ? effectiveWorkspace.brandId : undefined;

  // Helper to check permission for a specific key under current role/user
  const checkPermission = (permKey: PermissionKey): boolean => {
    if (activeUser && activeUser.customPermissionOverrides?.[permKey] !== undefined) {
      return !!activeUser.customPermissionOverrides[permKey];
    }
    return !!rolePermissions[currentRole]?.[permKey];
  };

  // Handlers for Users & Permissions
  const pushAuditLog = async (entry: {
    action: string;
    details: string;
    category: AuditLogEntry["category"];
  }) => {
    try {
      const created = await createAuditLog({
        performedByUserId: profile?.id,
        performedByName: `${activeUser.name} (${currentRole.toUpperCase()})`,
        action: entry.action,
        details: entry.details,
        category: entry.category
      });
      setAuditLogs((prev) => [created, ...prev]);
    } catch (e) {
      console.error("Không thể ghi audit log:", e);
    }
  };

  const handleUpdateRolePermissions = async (newMap: RolePermissionsMap) => {
    try {
      const saved = await updateRolePermissions(newMap);
      setRolePermissions(saved);
      await pushAuditLog({
        action: `Cập nhật Ma Trận Phân Quyền Role`,
        details: `Thay đổi cấu hình quyền truy cập tính năng cho các vai trò trong hệ thống.`,
        category: "Permission Change"
      });
    } catch (e: any) {
      window.alert(`Không thể lưu Ma Trận Phân Quyền: ${e.message ?? e}`);
    }
  };

  const handleAddUser = async (newUser: InviteUserPayload) => {
    try {
      await inviteUser(newUser);
      const refreshed = await fetchUsers();
      setUsers(refreshed);
      await pushAuditLog({
        action: `Tạo tài khoản người dùng mới`,
        details: `Đã gửi lời mời tạo tài khoản ${newUser.name} (${newUser.email}) với role ${newUser.role.toUpperCase()}`,
        category: "User Status"
      });
    } catch (e: any) {
      window.alert(`Không thể tạo tài khoản: ${e.message ?? e}`);
      throw e;
    }
  };

  const handleUpdateUser = async (updatedUser: SystemUser) => {
    try {
      const saved = await updateUserProfile(updatedUser);
      setUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));
      await pushAuditLog({
        action: `Cập nhật thông tin/quyền người dùng`,
        details: `Chỉnh sửa tài khoản ${updatedUser.name} (${updatedUser.email})`,
        category: "User Status"
      });
    } catch (e: any) {
      window.alert(`Không thể cập nhật tài khoản: ${e.message ?? e}`);
      throw e;
    }
  };

  const handleDeleteUser = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    try {
      await deleteUserAccount(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      if (target) {
        await pushAuditLog({
          action: `Xóa tài khoản người dùng`,
          details: `Đã xóa tài khoản ${target.name} (${target.email}) khỏi hệ thống`,
          category: "User Status"
        });
      }
    } catch (e: any) {
      window.alert(`Không thể xóa tài khoản: ${e.message ?? e}`);
    }
  };

  // Handlers for Talents — persisted to Supabase
  // Tạo talent mới giờ luôn kèm tạo account đăng nhập thật (mật khẩu mặc định 000000, xem
  // TalentMatcher.tsx "Thêm Talent Mới") — đi qua endpoint invite thay vì insert `talents`
  // trực tiếp, nên phải refetch cả talents lẫn users sau khi xong. Không catch+alert ở đây —
  // để lỗi propagate lên cho TalentMatcher hiện inline trong modal (tránh double dialog).
  const handleCreateTalentAccount = async (payload: NewTalentAccountPayload) => {
    await inviteUser({
      name: payload.name,
      email: payload.email,
      role: "talent",
      customRoleTitle: "Talent Host",
      defaultPassword: "000000",
      newTalentProfile: {
        name: payload.name,
        phone: payload.phone,
        role: payload.role,
        gender: payload.gender,
        niches: payload.niches,
        avatar: payload.avatar,
        avgGmvPerSession: payload.avgGmvPerSession,
        totalGmv: payload.totalGmv,
        ctrAvg: payload.ctrAvg,
        cvrAvg: payload.cvrAvg,
        overallScore: payload.overallScore,
        ratePerSession: payload.ratePerSession,
        commissionRate: payload.commissionRate,
        availabilityStatus: payload.availabilityStatus
      }
    });
    const [refreshedTalents, refreshedUsers] = await Promise.all([fetchTalents(), fetchUsers()]);
    setTalents(refreshedTalents);
    setUsers(refreshedUsers);
  };
  const handleUpdateTalent = async (id: string, patch: Partial<Talent>) => {
    try {
      const saved = await updateTalent(id, patch);
      setTalents(prev => prev.map(t => t.id === saved.id ? saved : t));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Talent: ${e.message ?? e}`);
    }
  };
  const handleDeleteTalent = async (id: string) => {
    try {
      await deleteTalent(id);
      setTalents(prev => prev.filter(t => t.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Talent: ${e.message ?? e}`);
    }
  };

  // Handlers for Studios — persisted to Supabase
  const handleAddStudio = async (newStudio: Studio) => {
    try {
      const created = await createStudio(newStudio);
      setStudios(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Studio: ${e.message ?? e}`);
    }
  };
  const handleUpdateStudio = async (updatedStudio: Studio) => {
    try {
      const saved = await updateStudio(updatedStudio);
      setStudios(prev => prev.map(s => s.id === saved.id ? saved : s));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Studio: ${e.message ?? e}`);
    }
  };
  const handleDeleteStudio = async (id: string) => {
    try {
      await deleteStudio(id);
      setStudios(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Studio: ${e.message ?? e}`);
    }
  };

  // Handlers for Equipments — persisted to Supabase
  const handleAddEquipment = async (newEquipment: Equipment) => {
    try {
      const created = await createEquipment(newEquipment);
      setEquipments(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo thiết bị: ${e.message ?? e}`);
    }
  };
  const handleUpdateEquipment = async (updatedEquipment: Equipment) => {
    try {
      const saved = await updateEquipment(updatedEquipment);
      setEquipments(prev => prev.map(e => e.id === saved.id ? saved : e));
    } catch (e: any) {
      window.alert(`Không thể cập nhật thiết bị: ${e.message ?? e}`);
    }
  };
  const handleDeleteEquipment = async (id: string) => {
    try {
      await deleteEquipment(id);
      setEquipments(prev => prev.filter(e => e.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa thiết bị: ${e.message ?? e}`);
    }
  };

  // Handlers for Brands — persisted to Supabase
  const handleAddBrand = async (newBrand: Brand) => {
    try {
      const created = await createBrand(newBrand);
      setBrands(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Brand: ${e.message ?? e}`);
    }
  };
  const handleUpdateBrand = async (updatedBrand: Brand) => {
    try {
      const saved = await updateBrand(updatedBrand);
      setBrands(prev => prev.map(b => b.id === saved.id ? saved : b));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Brand: ${e.message ?? e}`);
    }
  };
  const handleDeleteBrand = async (id: string) => {
    try {
      await deleteBrand(id);
      setBrands(prev => prev.filter(b => b.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Brand: ${e.message ?? e}`);
    }
  };

  // Handlers for Live Sessions — persisted to Supabase. Return a success boolean so callers that
  // manage their own UI state (e.g. LiveSessionHub's modal) know whether to close/reset — only
  // dismiss on caught errors below, not on an unconditional "we sent the request" assumption.
  const handleAddSession = async (newSession: LiveSession): Promise<boolean> => {
    try {
      const created = await createSession(newSession);
      setSessions(prev => [created, ...prev]);
      setSelectedSession(created);
      return true;
    } catch (e: any) {
      window.alert(`Không thể tạo Live Session: ${e.message ?? e}`);
      return false;
    }
  };
  const handleUpdateSession = async (updatedSession: LiveSession): Promise<boolean> => {
    try {
      const saved = await updateSession(updatedSession);
      setSessions(prev => prev.map(s => s.id === saved.id ? saved : s));
      if (selectedSession && selectedSession.id === saved.id) {
        setSelectedSession(saved);
      }
      return true;
    } catch (e: any) {
      window.alert(`Không thể cập nhật Live Session: ${e.message ?? e}`);
      return false;
    }
  };
  const handleSubmitSessionReport = async (sessionId: string, input: SessionReportInput): Promise<boolean> => {
    try {
      const saved = await submitSessionReport(sessionId, input);
      setSessions((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
      if (selectedSession && selectedSession.id === saved.id) {
        setSelectedSession(saved);
      }
      return true;
    } catch (e: any) {
      window.alert(`Không thể lưu report ca live: ${e.message ?? e}`);
      return false;
    }
  };
  // TikTokLiveReconciliation đã tự gọi RPC apply_tiktok_reconciliation và có sẵn LiveSession
  // đầy đủ (fetchSessionById) — chỉ cần cập nhật lại state, không network round-trip thêm.
  const handleSessionReconciled = (updated: LiveSession) => {
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    if (selectedSession && selectedSession.id === updated.id) {
      setSelectedSession(updated);
    }
  };
  const handleDeleteSession = async (id: string) => {
    try {
      await deleteSession(id);
      setSessions(prev => {
        const next = prev.filter(s => s.id !== id);
        if (selectedSession && selectedSession.id === id) {
          setSelectedSession(next[0] ?? null);
        }
        return next;
      });
    } catch (e: any) {
      window.alert(`Không thể xóa Live Session: ${e.message ?? e}`);
    }
  };

  // Handlers for "Đăng Ký & Chốt Lịch Host" (Giai đoạn 14a)
  const handleCreateShiftSlot = async (slot: ShiftSlot): Promise<boolean> => {
    try {
      const created = await createShiftSlot(slot);
      setShiftSlots((prev) => [...prev, created]);
      return true;
    } catch (e: any) {
      window.alert(`Không thể mở ca mới: ${e.message ?? e}`);
      return false;
    }
  };

  const handleDeleteShiftSlot = async (id: string) => {
    try {
      await deleteShiftSlot(id);
      setShiftSlots((prev) => prev.filter((s) => s.id !== id));
      setShiftRegistrations((prev) => prev.filter((r) => r.slotId !== id));
    } catch (e: any) {
      window.alert(`Không thể xoá ca: ${e.message ?? e}`);
    }
  };

  const handleCreateRecurringTemplate = async (t: RecurringShiftTemplate): Promise<boolean> => {
    try {
      const created = await createRecurringShiftTemplate(t);
      setRecurringShiftTemplates((prev) => [...prev, created]);
      return true;
    } catch (e: any) {
      window.alert(`Không thể tạo quy tắc lặp: ${e.message ?? e}`);
      return false;
    }
  };

  const handleToggleRecurringTemplate = async (t: RecurringShiftTemplate): Promise<boolean> => {
    try {
      const updated = await updateRecurringShiftTemplate({ ...t, active: !t.active });
      setRecurringShiftTemplates((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      return true;
    } catch (e: any) {
      window.alert(`Không thể cập nhật quy tắc lặp: ${e.message ?? e}`);
      return false;
    }
  };

  const handleDeleteRecurringTemplate = async (id: string) => {
    try {
      await deleteRecurringShiftTemplate(id);
      setRecurringShiftTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xoá quy tắc lặp: ${e.message ?? e}`);
    }
  };

  // Sinh ca cho cả tháng từ các quy tắc lặp đang active — bỏ qua ngày đã có
  // ca sinh từ đúng quy tắc đó rồi (tránh tạo trùng khi bấm lại nhiều lần).
  const handleGenerateMonthSlots = async (month: string): Promise<number> => {
    const [yearStr, monthStr] = month.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    const existingByTemplateAndDate = new Set(
      shiftSlots.filter((s) => s.templateId).map((s) => `${s.templateId}:${s.date}`)
    );

    const toCreate: ShiftSlot[] = [];
    for (const template of recurringShiftTemplates.filter((t) => t.active)) {
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIdx, day);
        if (!template.isDaily && date.getDay() !== template.weekday) continue;
        const dateStr = `${year}-${monthStr.padStart(2, "0")}-${`${day}`.padStart(2, "0")}`;
        if (existingByTemplateAndDate.has(`${template.id}:${dateStr}`)) continue;
        toCreate.push({
          id: `slot-${Date.now()}-${toCreate.length}`,
          date: dateStr,
          startTime: template.startTime,
          endTime: template.endTime,
          brandId: template.brandId,
          brandName: template.brandName,
          platform: template.platform,
          studioId: template.studioId,
          studioName: template.studioName,
          notes: template.notes,
          status: "open",
          templateId: template.id
        });
      }
    }

    if (toCreate.length === 0) return 0;
    try {
      const created = await createShiftSlots(toCreate);
      setShiftSlots((prev) => [...prev, ...created]);
      return created.length;
    } catch (e: any) {
      window.alert(`Không thể sinh ca tự động: ${e.message ?? e}`);
      return 0;
    }
  };

  const handleRegisterSlot = async (slotId: string, talentId: string): Promise<boolean> => {
    try {
      const created = await registerForSlot(slotId, talentId);
      setShiftRegistrations((prev) => [...prev, created]);
      return true;
    } catch (e: any) {
      window.alert(`Không thể đăng ký ca: ${e.message ?? e}`);
      return false;
    }
  };

  const handleUnregisterSlot = async (slotId: string, talentId: string): Promise<boolean> => {
    try {
      await unregisterFromSlot(slotId, talentId);
      setShiftRegistrations((prev) => prev.filter((r) => !(r.slotId === slotId && r.talentId === talentId)));
      return true;
    } catch (e: any) {
      window.alert(`Không thể huỷ đăng ký: ${e.message ?? e}`);
      return false;
    }
  };

  const handleSaveBrandPlatformRate = async (
    brandId: string,
    platform: "TikTok" | "Shopee",
    ratePerHour: number
  ): Promise<boolean> => {
    try {
      const saved = await upsertBrandPlatformRate(brandId, platform, ratePerHour);
      setBrandPlatformRates((prev) => {
        const next = prev.filter((r) => !(r.brandId === brandId && r.platform === platform));
        return [...next, saved];
      });
      return true;
    } catch (e: any) {
      window.alert(`Không thể lưu rate: ${e.message ?? e}`);
      return false;
    }
  };

  const handleSaveBrandPlatformReturnRate = async (
    brandId: string,
    platform: "TikTok" | "Shopee",
    returnRate: number
  ): Promise<boolean> => {
    try {
      const saved = await upsertBrandPlatformReturnRate(brandId, platform, returnRate);
      setBrandPlatformRates((prev) => {
        const next = prev.filter((r) => !(r.brandId === brandId && r.platform === platform));
        return [...next, saved];
      });
      return true;
    } catch (e: any) {
      window.alert(`Không thể lưu tỷ lệ hoàn hủy: ${e.message ?? e}`);
      return false;
    }
  };

  // Chốt lịch: sinh 1 live_session thật từ slot đã đăng ký, rồi đánh dấu slot "finalized"
  // và lưu lại session_id để tra ngược — cả 2 bước cần thành công thì mới coi là xong.
  const handleFinalizeShiftSlot = async (slot: ShiftSlot, hostId: string, coHostId: string | null): Promise<boolean> => {
    const brand = brands.find((b) => b.id === slot.brandId);
    const studio = studios.find((s) => s.id === slot.studioId);
    const host = talents.find((t) => t.id === hostId);
    const coHost = coHostId ? talents.find((t) => t.id === coHostId) : undefined;
    const rate = brandPlatformRates.find((r) => r.brandId === slot.brandId && r.platform === slot.platform);

    const [sh, sm] = slot.startTime.split(":").map(Number);
    let [eh, em] = slot.endTime.split(":").map(Number);
    let mins = eh * 60 + em - (sh * 60 + sm);
    if (mins <= 0) mins += 24 * 60;
    const hours = mins / 60;

    const newSession: LiveSession = {
      id: `session-${Date.now()}`,
      title: `${brand?.name ?? slot.brandName} - ${slot.date} ${slot.startTime}`,
      brandId: slot.brandId ?? "",
      brandName: brand?.name ?? slot.brandName,
      shopTikTokHandle: `@${(brand?.name ?? slot.brandName).toLowerCase().replace(/\s+/g, "") || "shop"}_official`,
      studioId: slot.studioId ?? "",
      studioName: studio?.name ?? slot.studioName,
      hostId,
      hostName: host?.name ?? "",
      assistantName: "",
      coHostId,
      coHostName: coHost?.name ?? "",
      platform: slot.platform,
      date: slot.date,
      startTime: slot.startTime,
      endTime: slot.endTime,
      status: "Upcoming",
      targetGmv: (rate?.ratePerHour ?? 0) * hours,
      actualGmv: 0,
      totalOrders: 0,
      avgWatchTimeSeconds: 0,
      peakViewers: 0,
      totalViews: 0,
      ctrAvg: 0,
      cvrAvg: 0,
      skus: [],
      checklist: [],
      minuteMetrics: []
    };

    try {
      const created = await createSession(newSession);
      setSessions((prev) => [created, ...prev]);
      const updatedSlot = await updateShiftSlot({ ...slot, status: "finalized", sessionId: created.id });
      setShiftSlots((prev) => prev.map((s) => (s.id === updatedSlot.id ? updatedSlot : s)));
      return true;
    } catch (e: any) {
      window.alert(`Không thể chốt lịch: ${e.message ?? e}`);
      return false;
    }
  };

  // Handlers for Workflow Rules — persisted to Supabase
  const handleAddWorkflowRule = async (newRule: WorkflowRule) => {
    try {
      const created = await createWorkflowRule(newRule);
      setWorkflowRules(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Workflow Rule: ${e.message ?? e}`);
    }
  };
  const handleUpdateWorkflowRule = async (updatedRule: WorkflowRule) => {
    try {
      const saved = await updateWorkflowRule(updatedRule);
      setWorkflowRules(prev => prev.map(r => r.id === saved.id ? saved : r));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Workflow Rule: ${e.message ?? e}`);
    }
  };
  const handleDeleteWorkflowRule = async (id: string) => {
    try {
      await deleteWorkflowRule(id);
      setWorkflowRules(prev => prev.filter(r => r.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Workflow Rule: ${e.message ?? e}`);
    }
  };

  const handleSelectSessionFromDashboard = (session: LiveSession) => {
    setSelectedSession(session);
    setActiveTab("sessions");
  };

  const handleSelectSessionFromBrandDashboard = (session: LiveSession) => {
    setSelectedSession(session);
    setActiveTab("brand_sessions");
  };

  // Navigation Items mapped to permission keys, grouped theo luồng công việc — đây là
  // nhóm cho Agency Workspace (nhìn xuyên mọi Brand). Xem BRAND_NAV_GROUPS bên dưới cho
  // Brand Workspace (Giai đoạn A, WORKSPACE_DESIGN.md).
  const AGENCY_NAV_GROUPS = [
    {
      label: "Tổng Quan",
      items: [
        { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: undefined },
      ],
    },
    {
      label: "Vận Hành Live",
      items: [
        { id: "sessions", label: "Live Sessions", icon: Radio, badge: "LIVE", perm: "manage_sessions" as PermissionKey },
        { id: "calendar", label: "Lịch Vận Hành", icon: CalendarIcon, badge: "SMART", perm: "manage_calendar" as PermissionKey },
        // Đăng ký & Chốt Lịch Host — luôn hiện với mọi role, không gate theo PermissionKey: role
        // talent cần thấy tab này để tự đăng ký ca (Giai đoạn 14a); màn hình bên trong tự đổi giao
        // diện theo currentRole (talent = đăng ký, ceo/operations/admin = mở ca + chốt lịch).
        { id: "shift_scheduling", label: "Đăng Ký & Chốt Lịch", icon: CalendarClock, badge: "NEW", perm: undefined },
        // Hồ Sơ Của Tôi — chỉ role talent, cùng pattern hardcode-theo-role như ai_training bên
        // dưới (không qua Ma Trận Phân Quyền, vì đây là trang tự quản lý của chính talent đó).
        ...(currentRole === "talent"
          ? [{ id: "my_talent_profile", label: "Hồ Sơ Của Tôi", icon: Users, perm: undefined }]
          : []),
      ],
    },
    {
      label: "Tài Nguyên Chung",
      items: [
        { id: "talents", label: "Talent Pool", icon: Users, perm: "manage_talents" as PermissionKey },
        { id: "studios", label: "Studios & Gear", icon: Building2, perm: "manage_studios_gear" as PermissionKey },
      ],
    },
    {
      label: "Kinh Doanh",
      items: [
        { id: "crm", label: "CRM", icon: Briefcase, perm: "manage_crm_projects" as PermissionKey },
        { id: "tiktok_api", label: "TikTok API", icon: Link2, perm: "manage_tiktok_api" as PermissionKey },
      ],
    },
    {
      label: "Tài Chính",
      items: [
        // Khoá cứng ceo/admin — không qua Ma Trận Phân Quyền (trước đây gate bằng permission
        // `view_financials` togglable, ceo có thể lỡ bật cho operations qua Ma Trận). Toàn bộ
        // dữ liệu Finance & HR (lương/hoa hồng/chi phí) giờ chỉ ceo/admin biết được.
        ...(currentRole === "ceo" || currentRole === "admin"
          ? [{ id: "finance", label: "Finance & P&L", icon: DollarSign, perm: undefined }]
          : []),
      ],
    },
    {
      label: "Hệ Thống",
      items: [
        { id: "ai_agents", label: "Hội Đồng AI & Simulator", icon: Bot, badge: "DEMO", perm: "manage_ai_agents" as PermissionKey },
        { id: "user_settings", label: "Phân Quyền & Role", icon: ShieldCheck, badge: "CUSTOM", perm: "manage_users_permissions" as PermissionKey },
        // Tài khoản cá nhân đã dời vào User Card cuối sidebar (bấm vào card để mở), không
        // còn là 1 mục nav riêng — tránh trùng lặp lối vào.
        // Độc quyền Admin — không dùng PermissionKey/Ma Trận Role để gate (không thể cấp
        // qua Ma Trận cho role khác, kể cả ceo), chỉ hiện khi currentRole === "admin".
        ...(currentRole === "admin"
          ? [{ id: "ai_training", label: "AI Training Center", icon: BrainCircuit, badge: "ADMIN", perm: undefined }]
          : []),
      ],
    },
  ];

  // Brand Workspace (Giai đoạn A) — 1 nhóm duy nhất, luôn scope theo đúng 1 brand
  // (currentBrandId). Không tab nào gate theo PermissionKey: role "brand" tự khoá vào
  // workspace của chính họ và có quyền thấy các module này bất kể Ma Trận Phân Quyền
  // (role_permissions của "brand" mặc định false cho manage_calendar/view_financials — dùng
  // lại các key đó ở đây sẽ khoá nhầm chính brand ra khỏi dữ liệu của họ); còn ceo/admin/
  // operations vào xem hộ qua switcher vốn đã có toàn quyền agency-level rồi.
  // Rate Card không còn ở đây — đã chuyển hẳn sang CRM (Agency-side, gate `view_rate_card`)
  // để ceo/admin/operations set giá 1 lần cho mọi brand, không cần vào từng brand workspace
  // (xem "Đã chuyển — Rate Card vào CRM" trong WORKSPACE_DESIGN.md).
  const BRAND_NAV_GROUPS = [
    {
      label: "Brand Workspace",
      items: [
        { id: "brand_dashboard", label: "Dashboard", icon: Store, perm: undefined },
        { id: "brand_calendar", label: "Lịch Vận Hành", icon: CalendarIcon, perm: undefined },
        { id: "brand_sessions", label: "Sessions", icon: Radio, perm: undefined },
        { id: "brand_skus", label: "SKU Showcase", icon: Package, badge: "NEW", perm: undefined },
        { id: "brand_audience_analytics", label: "Hiệu Suất Xem & Chuyển Đổi", icon: BarChart3, badge: "NEW", perm: undefined },
        { id: "brand_monthly_report", label: "Report Tháng", icon: FileText, badge: "NEW", perm: undefined },
      ],
    },
  ];

  const navGroups = effectiveWorkspace.type === "brand" ? BRAND_NAV_GROUPS : AGENCY_NAV_GROUPS;
  const navItems = navGroups.flatMap((g) => g.items);

  const handleWorkspaceChange = (next: WorkspaceContext) => {
    setWorkspace(next);
    const nextGroups = next.type === "brand" ? BRAND_NAV_GROUPS : AGENCY_NAV_GROUPS;
    const firstTab = nextGroups.flatMap((g) => g.items)[0]?.id;
    if (firstTab) setActiveTab(firstTab);
  };

  // Helper to determine if current tab is allowed
  const currentTabNavItem = navItems.find((n) => n.id === activeTab);
  const isTabAllowed = !currentTabNavItem?.perm || checkPermission(currentTabNavItem.perm);

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-base)] text-[var(--text-muted)] text-sm">
        Đang tải phiên đăng nhập...
      </div>
    );
  }

  if (passwordRecovery) {
    return <ResetPasswordScreen />;
  }

  if (!session) {
    return <Login />;
  }

  if (!profile) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-base)] text-[var(--text-muted)] text-sm">
        Đang tải hồ sơ người dùng...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-[var(--surface-base)] text-[var(--text)] overflow-hidden font-sans antialiased selection:bg-[var(--accent)] selection:text-white">
      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--surface)]/90 backdrop-blur-md border-r border-[var(--border)] flex flex-col transition-all duration-300 md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarCollapsed ? "md:w-16" : "md:w-64"}`}
      >
        <div
          className={`border-b border-[var(--border)] flex items-center justify-between ${
            sidebarCollapsed ? "p-6 md:px-0 md:py-4 md:justify-center" : "p-6"
          }`}
        >
          <div className={sidebarCollapsed ? "md:hidden" : ""}>
            <h1 className="text-xl font-bold tracking-tighter text-[var(--accent-text)]">LIVEOPS AI</h1>
            <p className="text-[10px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">
              Agency Operating System
            </p>
          </div>
          {sidebarCollapsed && (
            <span
              className="hidden md:flex w-9 h-9 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-[var(--accent-text)] items-center justify-center text-sm font-black tracking-tighter"
              title="LIVEOPS AI"
            >
              LO
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav
          className={`flex-1 py-3 space-y-4 overflow-y-auto scrollbar-thin ${
            sidebarCollapsed ? "px-3 md:px-2" : "px-3"
          }`}
        >
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.perm || checkPermission(item.perm)
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="space-y-1">
                <p
                  className={`px-3 text-[10px] font-bold uppercase tracking-widest text-[var(--text-faint)] ${
                    sidebarCollapsed ? "md:hidden" : ""
                  }`}
                >
                  {group.label}
                </p>
                {/* Ở chế độ thu gọn, nhóm nav chỉ còn được phân tách bằng 1 gạch mảnh. */}
                {sidebarCollapsed && <div className="hidden md:block mx-2 border-t border-[var(--border)]" />}
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      title={item.label}
                      className={`w-full flex items-center justify-between gap-2 py-2.5 rounded-xl transition-colors text-xs font-medium ${
                        sidebarCollapsed ? "px-3 md:px-0 md:justify-center" : "px-3"
                      } ${
                        isActive
                          ? "bg-[var(--accent)]/10 text-[var(--accent-text)] border border-[var(--accent)]/20 font-bold"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-elevated)]/80 hover:text-[var(--text)]"
                      }`}
                    >
                      <div className={`flex items-center gap-3 min-w-0 ${sidebarCollapsed ? "md:gap-0" : ""}`}>
                        <div className="relative shrink-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${isActive ? "text-[var(--accent-text)]" : "text-[var(--text-muted)]"}`}
                          />
                          {/* Thu gọn: badge NEW co lại thành chấm nhỏ trên icon cho khỏi mất tín hiệu. */}
                          {sidebarCollapsed && item.badge && (
                            <span className="hidden md:block absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rose-500" />
                          )}
                        </div>
                        <span className={`truncate ${sidebarCollapsed ? "md:hidden" : ""}`}>{item.label}</span>
                      </div>

                      <div className={`flex items-center gap-1.5 shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}>
                        {item.badge && (
                          <span className="bg-rose-600/20 text-rose-400 border border-rose-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase animate-pulse">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User Card — bấm để mở Tài Khoản Của Tôi (thay cho mục nav riêng đã bỏ) */}
        <div className={`mt-auto border-t border-[var(--border)] ${sidebarCollapsed ? "p-4 md:p-2" : "p-4"}`}>
          <button
            type="button"
            onClick={() => {
              setActiveTab("account_settings");
              setMobileMenuOpen(false);
            }}
            title={`${activeUser.name} • ${currentRole} — Tài Khoản Của Tôi`}
            className={`w-full flex items-center gap-3 rounded-xl border transition-colors text-left ${
              activeTab === "account_settings"
                ? "bg-[var(--accent)]/10 border-[var(--accent)]/20"
                : "bg-[var(--surface-elevated)]/50 border-[var(--border)]/50 hover:bg-[var(--surface-elevated)] hover:border-[var(--text-faint)]"
            } ${sidebarCollapsed ? "p-3 md:p-2 md:justify-center" : "p-3"}`}
          >
            {activeUser.avatar ? (
              <img
                src={activeUser.avatar}
                alt={activeUser.name}
                className="w-9 h-9 rounded-full object-cover border border-[var(--border)] shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {activeUser.name.charAt(0) || "?"}
              </div>
            )}
            <div className={`text-xs min-w-0 flex-1 ${sidebarCollapsed ? "md:hidden" : ""}`}>
              <p className="font-bold text-[var(--text)] truncate">{activeUser.name}</p>
              <p className="text-blue-400 text-[10px] uppercase font-extrabold truncate">
                {currentRole} • {activeUser.customRoleTitle}
              </p>
            </div>
            <UserCog
              className={`w-4 h-4 text-[var(--text-faint)] shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}
            />
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        }`}
      >
        {/* Top Header Bar */}
        <div className="flex items-center border-b border-[var(--border)] bg-[var(--surface)]/30 pr-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-4 md:hidden text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <Menu className="w-5 h-5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="hidden md:flex p-2 ml-3 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
            title={
              sidebarCollapsed
                ? isCalendarModule
                  ? "Mở rộng menu (Ctrl/Cmd + B) — menu tự thu gọn ở module có lịch"
                  : "Mở rộng menu (Ctrl/Cmd + B)"
                : "Thu gọn menu để rộng chỗ cho lịch (Ctrl/Cmd + B)"
            }
            aria-label={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
            aria-expanded={!sidebarCollapsed}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
          <div className="flex-1">
            <Header
              currentRole={currentRole}
              activeUserName={activeUser.name}
              activeUserTitle={activeUser.customRoleTitle}
              onSignOut={signOut}
              // Switcher chỉ hiện cho role được phép nhìn xuyên brand — role "brand" đã bị ép
              // cứng vào effectiveWorkspace của họ (không truyền props này xuống thì Header
              // tự ẩn switcher, xem Header.tsx).
              workspace={
                currentRole === "ceo" || currentRole === "admin" || currentRole === "operations" ? workspace : undefined
              }
              onWorkspaceChange={
                currentRole === "ceo" || currentRole === "admin" || currentRole === "operations"
                  ? handleWorkspaceChange
                  : undefined
              }
              brands={activeBrands}
            />
          </div>
        </div>

        {/* Data Load Error Banner — surfaces fetch failures that used to be captured in state
            and never shown anywhere, leaving affected tabs silently empty with no explanation. */}
        {showDataLoadErrorBanner && (
          <div className="bg-red-950/80 border-b border-red-500/30 px-6 py-2.5 text-xs text-red-200 flex flex-wrap items-start justify-between gap-3 shadow-md backdrop-blur-md">
            <div className="flex items-start gap-2">
              <span className="p-1 bg-red-500/20 rounded-lg text-red-400 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </span>
              <div>
                <strong className="text-red-300 font-extrabold uppercase block mb-1">
                  Lỗi Tải Dữ Liệu Từ Supabase:
                </strong>
                <ul className="list-disc list-inside space-y-0.5">
                  {dataLoadErrors.map((e) => (
                    <li key={e.key}>{e.message}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              onClick={() => setDismissedDataErrorSignature(dataLoadErrorSignature)}
              className="px-3 py-1 bg-red-900/80 hover:bg-red-800 text-red-200 border border-red-500/40 font-bold rounded-lg text-[11px] transition-all shrink-0"
            >
              Đóng
            </button>
          </div>
        )}

        {/* Dynamic View Content */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-6 scrollbar-thin">
          <div className={`mx-auto space-y-6 ${isCalendarModule ? "max-w-none" : "max-w-7xl"}`}>
            {!isTabAllowed ? (
              /* Access Guard Fallback */
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center max-w-2xl mx-auto my-12 space-y-5 text-[var(--text)] shadow-2xl">
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8 animate-bounce" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-black text-[var(--text)]">Quyền Truy Cập Bị Hạn Chế (Access Restricted)</h2>
                  <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                    Role hiện tại của bạn (<span className="text-amber-400 font-bold uppercase">{currentRole}</span>) chưa được cấp quyền truy cập tính năng{" "}
                    <strong className="text-[var(--text)]">&quot;{currentTabNavItem?.label}&quot;</strong>.
                  </p>
                </div>

                <div className="p-4 bg-[var(--surface-base)] border border-[var(--border)] rounded-xl text-left text-xs font-mono space-y-1 text-[var(--text-muted)]">
                  <div className="text-[var(--text-faint)] font-sans text-[10px] uppercase font-bold">Chi tiết yêu cầu an ninh:</div>
                  <div>• Permission Required: <span className="text-blue-400">{currentTabNavItem?.perm}</span></div>
                  <div>• Current Role: <span className="text-amber-400">{currentRole}</span></div>
                  <div>• Status: <span className="text-red-400">DENIED</span></div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text)] rounded-xl text-xs font-bold transition-all"
                  >
                    Về Dashboard Cho Role
                  </button>

                  {currentRole === "ceo" || currentRole === "admin" ? (
                    <button
                      onClick={() => {
                        setActiveTab("user_settings");
                      }}
                      className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-black shadow-lg shadow-[var(--accent)]/30 transition-all flex items-center gap-2"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>Quản Lý Phân Quyền Hợp Lệ (Role Settings)</span>
                    </button>
                  ) : (
                    <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl text-[11px] font-semibold flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Tài khoản hiện tại không thể tự cấp quyền. Vui lòng liên hệ Ban Giám Đốc (CEO).</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {activeTab === "dashboard" && (
                  <Dashboards
                    currentRole={currentRole}
                    sessions={activeSessions}
                    studios={activeStudios}
                    brands={activeBrands}
                    talents={activeTalents}
                    onSelectSession={handleSelectSessionFromDashboard}
                    onNavigateTab={setActiveTab}
                    onCalendarViewChange={setDashboardCalendarView}
                  />
                )}

                {activeTab === "sessions" && (
                  <LiveSessionHub
                    sessions={activeSessions}
                    selectedSession={activeSelectedSession}
                    studios={activeStudios}
                    talents={activeTalents}
                    brands={activeBrands}
                    users={activeUsers}
                    onSelectSession={setSelectedSession}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
                    onDeleteSession={handleDeleteSession}
                  />
                )}

                {activeTab === "calendar" && (
                  <LiveCalendar
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    studios={activeStudios}
                    talents={activeTalents}
                    brands={activeBrands}
                    users={activeUsers}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
                    onCreateSlot={handleCreateShiftSlot}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegisterSlot={handleRegisterSlot}
                    onUnregisterSlot={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    myTalentId={activeUser.assignedTalentId}
                    currentUserId={activeUser.id}
                    currentRole={currentRole}
                    schemes={promoSchemes}
                    onAddScheme={handleAddPromoScheme}
                    onUpdateScheme={handleUpdatePromoScheme}
                    onDeleteScheme={handleDeletePromoScheme}
                    recurringShiftTemplates={recurringShiftTemplates}
                    onCreateTemplate={handleCreateRecurringTemplate}
                    onToggleTemplate={handleToggleRecurringTemplate}
                    onDeleteTemplate={handleDeleteRecurringTemplate}
                    onGenerateMonthSlots={handleGenerateMonthSlots}
                  />
                )}

                {activeTab === "shift_scheduling" && (
                  <ShiftScheduling
                    currentRole={currentRole}
                    activeUser={activeUser}
                    sessions={activeSessions}
                    talents={activeTalents}
                    brands={activeBrands}
                    studios={activeStudios}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegister={handleRegisterSlot}
                    onUnregister={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    onUpdateSession={handleUpdateSession}
                    onLogAudit={pushAuditLog}
                  />
                )}

                {/* Brand Workspace (Giai đoạn A) — mọi tab dưới đây chỉ render khi effectiveWorkspace
                    đang scope theo đúng 1 brand; component con nhận thẳng brandId + data đã lọc sẵn
                    (giữ nguyên pattern fetch-1-lần-ở-App/filter-bằng-useMemo hiện có). */}
                {activeTab === "brand_dashboard" && effectiveWorkspace.type === "brand" && (
                  <BrandDashboard
                    brandId={currentBrandId!}
                    brand={activeBrands.find((b) => b.id === currentBrandId)}
                    sessions={activeSessions}
                    talents={activeTalents}
                    onSelectSession={handleSelectSessionFromBrandDashboard}
                    onCalendarViewChange={setDashboardCalendarView}
                  />
                )}

                {activeTab === "brand_calendar" && effectiveWorkspace.type === "brand" && (
                  <BrandCalendar
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    shiftRegistrations={shiftRegistrations}
                    studios={activeStudios}
                    talents={activeTalents}
                    users={activeUsers}
                    schemes={promoSchemes}
                    onAddScheme={handleAddPromoScheme}
                    onUpdateScheme={handleUpdatePromoScheme}
                    onDeleteScheme={handleDeletePromoScheme}
                    currentUserId={activeUser.id}
                    myTalentId={activeUser.assignedTalentId}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
                    onCreateSlot={handleCreateShiftSlot}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegisterSlot={handleRegisterSlot}
                    onUnregisterSlot={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    onSubmitSessionReport={handleSubmitSessionReport}
                    recurringShiftTemplates={recurringShiftTemplates}
                    onCreateTemplate={handleCreateRecurringTemplate}
                    onToggleTemplate={handleToggleRecurringTemplate}
                    onDeleteTemplate={handleDeleteRecurringTemplate}
                    onGenerateMonthSlots={handleGenerateMonthSlots}
                  />
                )}

                {activeTab === "brand_sessions" && effectiveWorkspace.type === "brand" && (
                  <BrandSessions
                    brandId={currentBrandId!}
                    sessions={activeSessions}
                    currentRole={currentRole}
                    onSubmitSessionReport={handleSubmitSessionReport}
                  />
                )}

                {activeTab === "brand_skus" && effectiveWorkspace.type === "brand" && (
                  <BrandSkuShowcase
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    brandSkus={brandSkus}
                    onAddSku={handleAddBrandSku}
                    onUpdateSku={handleUpdateBrandSku}
                    onDeleteSku={handleDeleteBrandSku}
                  />
                )}

                {activeTab === "brand_audience_analytics" && effectiveWorkspace.type === "brand" && (
                  <BrandAudienceAnalytics brandId={currentBrandId!} sessions={activeSessions} />
                )}

                {activeTab === "brand_monthly_report" && effectiveWorkspace.type === "brand" && (
                  <BrandMonthlyReport
                    brandId={currentBrandId!}
                    brandName={activeBrands.find((b) => b.id === currentBrandId)?.name || "Brand"}
                    sessions={activeSessions}
                    currentRole={currentRole}
                  />
                )}

                {activeTab === "talents" && (
                  <TalentMatcher
                    currentRole={currentRole}
                    talents={activeTalents}
                    brands={activeBrands}
                    onCreateTalentAccount={handleCreateTalentAccount}
                    onUpdateTalent={handleUpdateTalent}
                    onDeleteTalent={handleDeleteTalent}
                  />
                )}

                {activeTab === "my_talent_profile" && currentRole === "talent" && (
                  <MyTalentProfile
                    activeUser={activeUser}
                    talents={talents}
                    onUpdateTalent={handleUpdateTalent}
                  />
                )}

                {activeTab === "studios" && (
                  <StudioEquipment
                    studios={activeStudios}
                    equipments={activeEquipments}
                    sessions={activeSessions}
                    onAddStudio={handleAddStudio}
                    onUpdateStudio={handleUpdateStudio}
                    onDeleteStudio={handleDeleteStudio}
                    onAddEquipment={handleAddEquipment}
                    onUpdateEquipment={handleUpdateEquipment}
                    onDeleteEquipment={handleDeleteEquipment}
                  />
                )}

                {activeTab === "crm" && (
                  <CrmProjects
                    brands={activeBrands}
                    users={users}
                    onAddBrand={handleAddBrand}
                    onUpdateBrand={handleUpdateBrand}
                    onDeleteBrand={handleDeleteBrand}
                    currentRole={currentRole}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    sessions={activeSessions}
                    onSaveRate={handleSaveBrandPlatformRate}
                    onSaveReturnRate={handleSaveBrandPlatformReturnRate}
                  />
                )}

                {activeTab === "tiktok_api" && (
                  <TikTokApiAutomation
                    workflowRules={activeWorkflowRules}
                    onAddWorkflowRule={handleAddWorkflowRule}
                    onUpdateWorkflowRule={handleUpdateWorkflowRule}
                    onDeleteWorkflowRule={handleDeleteWorkflowRule}
                    currentRole={currentRole}
                    tiktokStatus={tiktokStatus}
                    tiktokStatusLoading={tiktokStatusLoading}
                    tiktokStatusError={tiktokStatusError}
                    webhookEvents={tiktokWebhookEvents}
                    onRefreshTikTokStatus={refreshTikTokStatus}
                    sessions={sessions}
                    onSessionUpdated={handleSessionReconciled}
                  />
                )}

                {activeTab === "finance" && (
                  <FinanceHr
                    sessions={activeSessions}
                    talents={talents}
                    financeRecords={financeRecords}
                    users={users}
                    brands={brands}
                    brandPlatformRates={brandPlatformRates}
                    talentRateHistory={talentRateHistory}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    onUpdateFinance={handleUpdateSessionFinance}
                    onSetFinanceApproval={handleSetSessionFinanceApproval}
                  />
                )}

                {activeTab === "ai_agents" && <AiMultiAgent />}

                {activeTab === "ai_training" && currentRole === "admin" && (
                  <AiTrainingCenter
                    prompts={aiAgentPrompts}
                    loading={aiAgentPromptsLoading}
                    error={aiAgentPromptsError}
                    onUpdate={handleUpdateAiAgentPrompt}
                  />
                )}

                {activeTab === "user_settings" && (
                  <UserRoleSettings
                    currentRole={currentRole}
                    rolePermissions={rolePermissions}
                    onUpdateRolePermissions={handleUpdateRolePermissions}
                    users={activeUsers}
                    onAddUser={handleAddUser}
                    onUpdateUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                    auditLogs={activeAuditLogs}
                    permissionDefinitions={ALL_PERMISSION_DEFINITIONS}
                    brands={activeBrands}
                    talents={activeTalents}
                    sessions={activeSessions}
                  />
                )}

                {activeTab === "account_settings" && (
                  <AccountSettings activeUser={activeUser} onUpdateUser={handleUpdateUser} />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

