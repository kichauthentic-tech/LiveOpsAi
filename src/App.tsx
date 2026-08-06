import React, { useState, useEffect, useMemo } from "react";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry, StrategicDirective, WorkflowRule, Talent, Studio, Equipment, Brand, AgencyProject, SessionFinance, TikTokConnectionStatus, TikTokWebhookEvent, AiAgentPrompt, BrandPlatformRate, ShiftSlot, ShiftRegistration, RecurringShiftTemplate, Campaign, CampaignRevisionNote, TalentRateHistoryEntry, BrandPlatformRateHistoryEntry, BrandInvoice, BrandSku, ProductSample, LiveStreamIncident } from "./types";
import { ALL_PERMISSION_DEFINITIONS } from "./data/mockData";
import { fetchTalents, createTalent, updateTalent, deleteTalent } from "./lib/db/talents";
import { fetchStudios, createStudio, updateStudio, deleteStudio } from "./lib/db/studios";
import { fetchEquipments, createEquipment, updateEquipment, deleteEquipment } from "./lib/db/equipments";
import { fetchSessions, createSession, updateSession, deleteSession } from "./lib/db/sessions";
import { fetchBrands, createBrand, updateBrand, deleteBrand } from "./lib/db/brands";
import { fetchProjects, createProject, updateProject, deleteProject } from "./lib/db/projects";
import { fetchUsers, updateUserProfile, inviteUser, deleteUserAccount, InviteUserPayload } from "./lib/db/users";
import { fetchWorkflowRules, createWorkflowRule, updateWorkflowRule, deleteWorkflowRule } from "./lib/db/workflowRules";
import { fetchDirectives, createDirective, updateDirective, deleteDirective } from "./lib/db/directives";
import { fetchAuditLogs, createAuditLog } from "./lib/db/auditLogs";
import { fetchRolePermissions, updateRolePermissions } from "./lib/db/rolePermissions";
import { fetchSessionFinances, upsertSessionFinance, setSessionFinanceApproval } from "./lib/db/finance";
import { fetchTikTokStatus, fetchTikTokWebhookEvents } from "./lib/db/tiktokIntegration";
import { fetchAiAgentPrompts, updateAiAgentPrompt } from "./lib/db/aiAgentPrompts";
import { fetchBrandPlatformRates, upsertBrandPlatformRate } from "./lib/db/brandPlatformRates";
import { fetchShiftSlots, createShiftSlot, createShiftSlots, updateShiftSlot, deleteShiftSlot } from "./lib/db/shiftSlots";
import { fetchShiftRegistrations, registerForSlot, unregisterFromSlot } from "./lib/db/shiftRegistrations";
import {
  fetchRecurringShiftTemplates,
  createRecurringShiftTemplate,
  updateRecurringShiftTemplate,
  deleteRecurringShiftTemplate
} from "./lib/db/recurringShiftTemplates";
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaignForApproval,
  respondToCampaignApproval,
  submitCampaignReview
} from "./lib/db/campaigns";
import { fetchCampaignRevisionNotes, createCampaignRevisionNote } from "./lib/db/campaignRevisionNotes";
import { fetchTalentRateHistory } from "./lib/db/talentRateHistory";
import { fetchBrandPlatformRateHistory } from "./lib/db/brandPlatformRateHistory";
import { fetchBrandInvoices, createBrandInvoice, updateBrandInvoice, deleteBrandInvoice } from "./lib/db/brandInvoices";
import { fetchBrandSkus, createBrandSku, updateBrandSku, deleteBrandSku } from "./lib/db/brandSkus";
import { fetchProductSamples, createProductSample, updateProductSample, deleteProductSample } from "./lib/db/productSamples";
import {
  fetchLiveStreamIncidents,
  createLiveStreamIncident,
  updateLiveStreamIncident,
  deleteLiveStreamIncident
} from "./lib/db/liveStreamIncidents";
import {
  LayoutDashboard,
  Radio,
  FileText,
  Sparkles,
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
  Tag,
  Receipt,
  ClipboardCheck,
  Target,
  Package,
  Boxes,
  AlertTriangle
} from "lucide-react";
import { Header, WorkspaceContext } from "./components/Header";
import { BrandDashboard } from "./components/brand-workspace/BrandDashboard";
import { BrandCalendar } from "./components/brand-workspace/BrandCalendar";
import { BrandCampaigns } from "./components/brand-workspace/BrandCampaigns";
import { BrandSessions } from "./components/brand-workspace/BrandSessions";
import { BrandRateCard } from "./components/brand-workspace/BrandRateCard";
import { BrandInvoices } from "./components/brand-workspace/BrandInvoices";
import { BrandSkuShowcase } from "./components/brand-workspace/BrandSkuShowcase";
import { ProductSampleInventory } from "./components/ProductSampleInventory";
import { LiveStreamIncidentLog } from "./components/LiveStreamIncidentLog";
import { BrandReviewHistory } from "./components/brand-workspace/BrandReviewHistory";
import { Login } from "./components/Login";
import { ResetPasswordScreen } from "./components/ResetPasswordScreen";
import { AccountSettings } from "./components/AccountSettings";
import { useAuth } from "./hooks/useAuth";
import { ExecutiveBrief } from "./components/ExecutiveBrief";
import { Dashboards } from "./components/Dashboards";
import { LiveSessionHub } from "./components/LiveSessionHub";
import { LiveCalendar } from "./components/LiveCalendar";
import { ScriptGenerator } from "./components/ScriptGenerator";
import { TalentMatcher } from "./components/TalentMatcher";
import { StudioEquipment } from "./components/StudioEquipment";
import { CrmProjects } from "./components/CrmProjects";
import { TikTokApiAutomation } from "./components/TikTokApiAutomation";
import { FinanceHr } from "./components/FinanceHr";
import { AiMultiAgent } from "./components/AiMultiAgent";
import { UserRoleSettings } from "./components/UserRoleSettings";
import { AiTrainingCenter } from "./components/AiTrainingCenter";
import { MyWorkspace } from "./components/MyWorkspace";
import ShiftScheduling from "./components/ShiftScheduling";

const STORAGE_PREFIX = "liveops_os_v2_";

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
  const [activeTab, setActiveTab] = useState<string>(() => loadStorage("activeTab", "brief"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  // Workflow Rules / Directives / Audit Logs — real data from Supabase (Phase 5), no mock fallback
  const [workflowRules, setWorkflowRules] = useState<WorkflowRule[]>([]);
  const [directives, setDirectives] = useState<StrategicDirective[]>([]);
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

  // Brands / Projects — real data from Supabase (Phase 3), no mock fallback
  const [brands, setBrands] = useState<Brand[]>([]);
  const [projects, setProjects] = useState<AgencyProject[]>([]);
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

  // Campaign — chu kỳ vận hành theo tháng của brand (Giai đoạn 15), real data from Supabase `campaigns`.
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignRevisionNotes, setCampaignRevisionNotes] = useState<CampaignRevisionNote[]>([]);
  const [phase15Loading, setPhase15Loading] = useState(true);
  const [phase15Error, setPhase15Error] = useState<string | null>(null);

  // Rate Card Versioning (Giai đoạn 19) — lịch sử rate theo thời gian, ghi tự động bởi DB
  // trigger (migration 0018). Chỉ đọc, dùng để tra rate đúng tại ngày của session cũ ở
  // FinanceHr.tsx thay vì đọc giá trị hiện tại của talents/brandPlatformRates.
  const [talentRateHistory, setTalentRateHistory] = useState<TalentRateHistoryEntry[]>([]);
  const [brandPlatformRateHistory, setBrandPlatformRateHistory] = useState<BrandPlatformRateHistoryEntry[]>([]);
  const [phase19Loading, setPhase19Loading] = useState(true);
  const [phase19Error, setPhase19Error] = useState<string | null>(null);

  // Giai đoạn 20 — Hoá đơn/công nợ Brand.
  const [brandInvoices, setBrandInvoices] = useState<BrandInvoice[]>([]);
  const [phase20Loading, setPhase20Loading] = useState(true);
  const [phase20Error, setPhase20Error] = useState<string | null>(null);

  // Giai đoạn B1 — SKU Showcase & Hero Product Catalog (Brand Workspace, xem
  // WORKSPACE_DESIGN.md#6). Fetch 1 lần ở agency-level giống brandInvoices, mỗi Brand Workspace
  // tự filter theo brandId.
  const [brandSkus, setBrandSkus] = useState<BrandSku[]>([]);
  const [phaseB1Loading, setPhaseB1Loading] = useState(true);
  const [phaseB1Error, setPhaseB1Error] = useState<string | null>(null);
  const [productSamples, setProductSamples] = useState<ProductSample[]>([]);
  const [phaseB2Loading, setPhaseB2Loading] = useState(true);
  const [phaseB2Error, setPhaseB2Error] = useState<string | null>(null);
  const [liveStreamIncidents, setLiveStreamIncidents] = useState<LiveStreamIncident[]>([]);
  const [phaseB3Loading, setPhaseB3Loading] = useState(true);
  const [phaseB3Error, setPhaseB3Error] = useState<string | null>(null);

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
    Promise.all([fetchBrands(), fetchProjects()])
      .then(([b, p]) => {
        if (cancelled) return;
        setBrands(b);
        setProjects(p);
        setPhase3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase3Error(err.message ?? "Không tải được dữ liệu Brand/Project từ Supabase.");
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
    Promise.all([fetchWorkflowRules(), fetchDirectives(), fetchAuditLogs()])
      .then(([w, d, a]) => {
        if (cancelled) return;
        setWorkflowRules(w);
        setDirectives(d);
        setAuditLogs(a);
        setPhase5Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase5Error(err.message ?? "Không tải được Workflow Rules/Directives/Audit Logs từ Supabase.");
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
    setPhase15Loading(true);
    Promise.all([fetchCampaigns(), fetchCampaignRevisionNotes()])
      .then(([rows, notes]) => {
        if (cancelled) return;
        setCampaigns(rows);
        setCampaignRevisionNotes(notes);
        setPhase15Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase15Error(err.message ?? "Không tải được dữ liệu Campaign từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase15Loading(false);
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
    setPhase20Loading(true);
    fetchBrandInvoices()
      .then((invoices) => {
        if (cancelled) return;
        setBrandInvoices(invoices);
        setPhase20Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase20Error(err.message ?? "Không tải được dữ liệu Hoá Đơn Brand từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhase20Loading(false);
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
    setPhaseB2Loading(true);
    fetchProductSamples()
      .then((samples) => {
        if (cancelled) return;
        setProductSamples(samples);
        setPhaseB2Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseB2Error(err.message ?? "Không tải được Product Sample Inventory từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhaseB2Loading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setPhaseB3Loading(true);
    fetchLiveStreamIncidents()
      .then((incidents) => {
        if (cancelled) return;
        setLiveStreamIncidents(incidents);
        setPhaseB3Error(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhaseB3Error(err.message ?? "Không tải được Live Stream Incident Log từ Supabase.");
      })
      .finally(() => {
        if (!cancelled) setPhaseB3Loading(false);
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

  async function handleAddBrandInvoice(invoice: { brandId: string; month: string; amount: number; dueDate?: string; notes: string }) {
    const created = await createBrandInvoice({ ...invoice, status: "unpaid", createdBy: profile?.id });
    setBrandInvoices((prev) => [...prev, created]);
  }

  async function handleUpdateBrandInvoice(
    id: string,
    patch: Partial<Pick<BrandInvoice, "amount" | "status" | "dueDate" | "paidAmount" | "notes">>
  ) {
    const updated = await updateBrandInvoice(id, patch);
    setBrandInvoices((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
  }

  async function handleDeleteBrandInvoice(id: string) {
    await deleteBrandInvoice(id);
    setBrandInvoices((prev) => prev.filter((inv) => inv.id !== id));
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

  async function handleAddProductSample(sample: { brandId: string; studioId?: string; productName: string; sampleCode: string; quantity: number }) {
    const created = await createProductSample({ ...sample, createdBy: profile?.id });
    setProductSamples((prev) => [created, ...prev]);
  }

  async function handleUpdateProductSample(
    id: string,
    patch: Partial<Pick<ProductSample, "studioId" | "productName" | "sampleCode" | "quantity" | "status" | "locationNote" | "notes">>
  ) {
    const updated = await updateProductSample(id, patch);
    setProductSamples((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDeleteProductSample(id: string) {
    await deleteProductSample(id);
    setProductSamples((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleAddLiveStreamIncident(incident: {
    sessionId: string;
    category: LiveStreamIncident["category"];
    severity: LiveStreamIncident["severity"];
    description: string;
  }) {
    const created = await createLiveStreamIncident({ ...incident, reportedBy: profile?.id });
    setLiveStreamIncidents((prev) => [created, ...prev]);
  }

  async function handleUpdateLiveStreamIncident(
    id: string,
    patch: Partial<Pick<LiveStreamIncident, "category" | "severity" | "description" | "resolution" | "status">>
  ) {
    const updated = await updateLiveStreamIncident(id, patch);
    setLiveStreamIncidents((prev) => prev.map((i) => (i.id === id ? updated : i)));
  }

  async function handleDeleteLiveStreamIncident(id: string) {
    await deleteLiveStreamIncident(id);
    setLiveStreamIncidents((prev) => prev.filter((i) => i.id !== id));
  }

  // LocalStorage sync effects
  useEffect(() => saveStorage("activeTab", activeTab), [activeTab]);

  // Live Sessions are real Supabase data now (Phase 2) — no mock filtering applies
  const rawActiveSessions = sessions;
  // Brands/Talents/Studios/Equipments/Projects are real Supabase data now — no mock filtering applies
  const rawActiveBrands = brands;
  const rawActiveTalents = talents;
  const rawActiveStudios = studios;
  const rawActiveEquipments = equipments;
  const rawActiveProjects = projects;
  // Workflow Rules/Directives/Audit Logs are real Supabase data now (Phase 5) — no mock filtering applies
  const activeWorkflowRules = workflowRules;
  const activeDirectives = directives;
  const activeAuditLogs = auditLogs;
  // Users are real Supabase data now (Phase 4) — no mock filtering applies
  const activeUsers = users;

  // 1. DERIVED DATA: Projects GMV automatically computed from child sessions to ensure consistency
  const activeProjects = useMemo(() => {
    return rawActiveProjects.map((p) => {
      const childSessions = rawActiveSessions.filter(
        (s) => s.projectId === p.id || s.brandName?.toLowerCase() === p.brandName?.toLowerCase() || s.brandId === p.brandId
      );
      const computedActualGmv = childSessions.reduce((acc, s) => acc + (s.actualGmv || 0), 0);
      const computedTargetGmv = p.kpiGmv || childSessions.reduce((acc, s) => acc + (s.targetGmv || 0), 0);
      const computedSessionsCompleted = childSessions.filter((s) => s.status === "Completed").length;
      return {
        ...p,
        actualGmv: childSessions.length > 0 ? computedActualGmv : (p.actualGmv || 0),
        kpiGmv: computedTargetGmv > 0 ? computedTargetGmv : (p.kpiGmv || 0),
        sessionsCompleted: childSessions.length > 0 ? computedSessionsCompleted : (p.sessionsCompleted || 0)
      };
    });
  }, [rawActiveProjects, rawActiveSessions]);

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
        phase15Error && { key: "phase15", message: phase15Error },
        phase19Error && { key: "phase19", message: phase19Error },
        phase20Error && { key: "phase20", message: phase20Error },
        phaseB1Error && { key: "phaseB1", message: phaseB1Error },
        phaseB2Error && { key: "phaseB2", message: phaseB2Error },
        phaseB3Error && { key: "phaseB3", message: phaseB3Error }
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
      phase15Error,
      phase19Error,
      phase20Error,
      phaseB1Error,
      phaseB2Error,
      phaseB3Error
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
  const handleAddTalent = async (newTalent: Talent) => {
    try {
      const created = await createTalent(newTalent);
      setTalents(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Talent: ${e.message ?? e}`);
    }
  };
  const handleUpdateTalent = async (updatedTalent: Talent) => {
    try {
      const saved = await updateTalent(updatedTalent);
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

  // Handlers for Projects — persisted to Supabase
  const handleAddProject = async (newProject: AgencyProject) => {
    try {
      const created = await createProject(newProject);
      setProjects(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Dự Án: ${e.message ?? e}`);
    }
  };
  const handleUpdateProject = async (updatedProject: AgencyProject) => {
    try {
      const saved = await updateProject(updatedProject);
      setProjects(prev => prev.map(p => p.id === saved.id ? saved : p));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Dự Án: ${e.message ?? e}`);
    }
  };
  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Dự Án: ${e.message ?? e}`);
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
        if (date.getDay() !== template.weekday) continue;
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
          templateId: template.id,
          campaignId: template.campaignId
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

  // Handlers for Campaign (Giai đoạn 15)
  const handleCreateCampaign = async (c: Campaign): Promise<boolean> => {
    try {
      const created = await createCampaign(c);
      setCampaigns((prev) => [created, ...prev]);
      return true;
    } catch (e: any) {
      window.alert(`Không thể tạo campaign: ${e.message ?? e}`);
      return false;
    }
  };

  const handleUpdateCampaign = async (c: Campaign): Promise<boolean> => {
    try {
      const updated = await updateCampaign(c);
      setCampaigns((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      return true;
    } catch (e: any) {
      window.alert(`Không thể cập nhật campaign: ${e.message ?? e}`);
      return false;
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await deleteCampaign(id);
      setCampaigns((prev) => prev.filter((c) => c.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xoá campaign: ${e.message ?? e}`);
    }
  };

  // Giai đoạn 16 — luồng duyệt Campaign với Brand.
  const handleSendCampaignForApproval = async (campaign: Campaign): Promise<boolean> => {
    try {
      const updated = await sendCampaignForApproval(campaign.id);
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      await pushAuditLog({
        action: "Gửi Campaign cho Brand duyệt",
        details: `Campaign "${campaign.name}" (${campaign.brandName}) đã được gửi cho Brand duyệt lịch.`,
        category: "Security Alert"
      });
      return true;
    } catch (e: any) {
      window.alert(`Không thể gửi campaign cho brand duyệt: ${e.message ?? e}`);
      return false;
    }
  };

  const handleRespondToCampaignApproval = async (
    campaign: Campaign,
    decision: "approved" | "revision_requested",
    note?: string
  ): Promise<boolean> => {
    try {
      const updated = await respondToCampaignApproval(campaign.id, decision);
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      if (decision === "revision_requested" && note && note.trim()) {
        const created = await createCampaignRevisionNote({
          campaignId: campaign.id,
          note: note.trim(),
          requestedBy: profile?.id,
          requestedByName: activeUser.name
        });
        setCampaignRevisionNotes((prev) => [created, ...prev]);
      }
      await pushAuditLog({
        action: decision === "approved" ? "Brand duyệt Campaign" : "Brand yêu cầu sửa Campaign",
        details: `Campaign "${campaign.name}" (${campaign.brandName})${note ? ` — Ghi chú: ${note.trim()}` : ""}`,
        category: "Security Alert"
      });
      return true;
    } catch (e: any) {
      window.alert(`Không thể ghi nhận phản hồi duyệt: ${e.message ?? e}`);
      return false;
    }
  };

  // Giai đoạn 25 — đánh giá cuối campaign (Bước 11 workflow: KPI đạt không,
  // quyết định gia hạn/cảnh báo rủi ro rời Brand).
  const handleSubmitCampaignReview = async (
    campaign: Campaign,
    review: { outcome: NonNullable<Campaign["outcome"]>; renewalDecision: NonNullable<Campaign["renewalDecision"]>; reviewNotes: string }
  ): Promise<boolean> => {
    try {
      const updated = await submitCampaignReview(campaign.id, { ...review, reviewedBy: profile?.id });
      setCampaigns((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      await pushAuditLog({
        action: "Đánh giá cuối Campaign",
        details: `Campaign "${campaign.name}" (${campaign.brandName}) — Kết quả: ${review.outcome}, Gia hạn: ${review.renewalDecision}${
          review.reviewNotes ? ` — Ghi chú: ${review.reviewNotes}` : ""
        }`,
        category: "Security Alert"
      });
      return true;
    } catch (e: any) {
      window.alert(`Không thể lưu đánh giá campaign: ${e.message ?? e}`);
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
      campaignId: slot.campaignId,
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

  // Handlers for Directives — persisted to Supabase
  const handleAddDirective = async (newDir: StrategicDirective) => {
    try {
      const created = await createDirective(newDir);
      setDirectives(prev => [created, ...prev]);
    } catch (e: any) {
      window.alert(`Không thể tạo Chỉ Đạo: ${e.message ?? e}`);
    }
  };
  const handleUpdateDirective = async (updatedDir: StrategicDirective) => {
    try {
      const saved = await updateDirective(updatedDir);
      setDirectives(prev => prev.map(d => d.id === saved.id ? saved : d));
    } catch (e: any) {
      window.alert(`Không thể cập nhật Chỉ Đạo: ${e.message ?? e}`);
    }
  };
  const handleDeleteDirective = async (id: string) => {
    try {
      await deleteDirective(id);
      setDirectives(prev => prev.filter(d => d.id !== id));
    } catch (e: any) {
      window.alert(`Không thể xóa Chỉ Đạo: ${e.message ?? e}`);
    }
  };

  const handleSelectSessionFromDashboard = (session: LiveSession) => {
    setSelectedSession(session);
    setActiveTab("sessions");
  };

  // Navigation Items mapped to permission keys, grouped theo luồng công việc — đây là
  // nhóm cho Agency Workspace (nhìn xuyên mọi Brand). Xem BRAND_NAV_GROUPS bên dưới cho
  // Brand Workspace (Giai đoạn A, WORKSPACE_DESIGN.md).
  const AGENCY_NAV_GROUPS = [
    {
      label: "Tổng Quan",
      items: [
        { id: "myworkspace", label: "Việc Của Tôi", icon: UserCheck, perm: undefined },
        { id: "brief", label: "Command Brief", icon: FileText, perm: "view_executive_brief" as PermissionKey },
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
      ],
    },
    {
      label: "Tài Nguyên Chung",
      items: [
        { id: "scripts", label: "AI Script Gen", icon: Sparkles, perm: "generate_scripts" as PermissionKey },
        { id: "talents", label: "Talent Pool", icon: Users, perm: "manage_talents" as PermissionKey },
        { id: "studios", label: "Studios & Gear", icon: Building2, perm: "manage_studios_gear" as PermissionKey },
      ],
    },
    {
      label: "Content & Quality",
      items: [
        // Dùng lại perm "manage_studios_gear" — Product Sample Inventory liên kết chặt tới
        // Studio (đúng nguyên tắc đã chốt ở WORKSPACE_DESIGN.md#5, tránh phình PermissionKey).
        { id: "product_samples", label: "Hàng Mẫu (Product Sample)", icon: Boxes, badge: "NEW", perm: "manage_studios_gear" as PermissionKey },
        // Dùng lại perm "manage_sessions" — Incident Log liên kết chặt tới Live Session.
        { id: "live_incidents", label: "Nhật Ký Sự Cố Live", icon: AlertTriangle, badge: "NEW", perm: "manage_sessions" as PermissionKey },
      ],
    },
    {
      label: "Kinh Doanh",
      items: [
        { id: "crm", label: "CRM & Projects", icon: Briefcase, perm: "manage_crm_projects" as PermissionKey },
        { id: "tiktok_api", label: "TikTok API", icon: Link2, perm: "manage_tiktok_api" as PermissionKey },
      ],
    },
    {
      label: "Tài Chính",
      items: [
        { id: "finance", label: "Finance & P&L", icon: DollarSign, perm: "view_financials" as PermissionKey },
      ],
    },
    {
      label: "Hệ Thống",
      items: [
        { id: "ai_agents", label: "Hội Đồng AI & Simulator", icon: Bot, badge: "DEMO", perm: "manage_ai_agents" as PermissionKey },
        { id: "user_settings", label: "Phân Quyền & Role", icon: ShieldCheck, badge: "CUSTOM", perm: "manage_users_permissions" as PermissionKey },
        // Tài khoản cá nhân — luôn hiện với mọi role, không gate theo PermissionKey (đổi tên/mật khẩu
        // là việc của chính chủ tài khoản, không phải một quyền có thể cấp/thu hồi qua Ma Trận Role).
        { id: "account_settings", label: "Tài Khoản Của Tôi", icon: UserCog, perm: undefined },
        // Độc quyền Admin — không dùng PermissionKey/Ma Trận Role để gate (không thể cấp
        // qua Ma Trận cho role khác, kể cả ceo), chỉ hiện khi currentRole === "admin".
        ...(currentRole === "admin"
          ? [{ id: "ai_training", label: "AI Training Center", icon: BrainCircuit, badge: "ADMIN", perm: undefined }]
          : []),
      ],
    },
  ];

  // Brand Workspace (Giai đoạn A) — 1 nhóm duy nhất, luôn scope theo đúng 1 brand
  // (currentBrandId). Không gate theo PermissionKey: role "brand" tự khoá vào workspace của
  // chính họ và có quyền thấy đủ 7 module này bất kể Ma Trận Phân Quyền (role_permissions
  // của "brand" mặc định false cho manage_calendar/view_financials — dùng lại các key đó ở
  // đây sẽ khoá nhầm chính brand ra khỏi dữ liệu của họ); còn ceo/admin/operations vào xem hộ
  // qua switcher vốn đã có toàn quyền agency-level rồi.
  const BRAND_NAV_GROUPS = [
    {
      label: "Brand Workspace",
      items: [
        { id: "brand_dashboard", label: "Dashboard", icon: Store, perm: undefined },
        { id: "brand_calendar", label: "Lịch Vận Hành", icon: CalendarIcon, perm: undefined },
        { id: "brand_campaigns", label: "Campaign", icon: Target, badge: "CENTRAL", perm: undefined },
        { id: "brand_sessions", label: "Sessions", icon: Radio, perm: undefined },
        { id: "brand_rates", label: "Rate Card", icon: Tag, perm: undefined },
        { id: "brand_skus", label: "SKU Showcase", icon: Package, badge: "NEW", perm: undefined },
        { id: "brand_invoices", label: "Hoá Đơn & Công Nợ", icon: Receipt, perm: undefined },
        { id: "brand_reviews", label: "Báo Cáo Cuối Kỳ", icon: ClipboardCheck, perm: undefined },
        { id: "account_settings", label: "Tài Khoản Của Tôi", icon: UserCog, perm: undefined },
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
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-400 text-sm">
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
      <div className="flex h-screen w-full items-center justify-center bg-slate-950 text-slate-400 text-sm">
        Đang tải hồ sơ người dùng...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 overflow-hidden font-sans antialiased selection:bg-blue-600 selection:text-white">
      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/90 backdrop-blur-md border-r border-slate-800 flex flex-col transition-transform duration-300 md:translate-x-0 ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tighter text-blue-400">LIVEOPS AI</h1>
            <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              Agency Operating System
            </p>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-3 px-3 space-y-4 overflow-y-auto scrollbar-thin">
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.perm || checkPermission(item.perm)
            );

            if (visibleItems.length === 0) return null;

            return (
              <div key={group.label} className="space-y-1">
                <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                  {group.label}
                </p>
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
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl transition-colors text-xs font-medium ${
                        isActive
                          ? "bg-blue-600/10 text-blue-400 border border-blue-600/20 font-bold"
                          : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${isActive ? "text-blue-400" : "text-slate-400"}`}
                        />
                        <span className="truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
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

        {/* User Card */}
        <div className="p-4 mt-auto border-t border-slate-800">
          <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            {activeUser.avatar ? (
              <img
                src={activeUser.avatar}
                alt={activeUser.name}
                className="w-9 h-9 rounded-full object-cover border border-slate-600"
              />
            ) : (
              <div className="w-9 h-9 rounded-full border border-slate-600 bg-slate-800 text-slate-300 flex items-center justify-center text-xs font-bold uppercase shrink-0">
                {activeUser.name.charAt(0) || "?"}
              </div>
            )}
            <div className="text-xs min-w-0">
              <p className="font-bold text-slate-200 truncate">{activeUser.name}</p>
              <p className="text-blue-400 text-[10px] uppercase font-extrabold truncate">
                {currentRole} • {activeUser.customRoleTitle}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden md:ml-64">
        {/* Top Header Bar */}
        <div className="flex items-center border-b border-slate-800 bg-slate-900/30 pr-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-4 md:hidden text-slate-400 hover:text-white"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <Header
              currentRole={currentRole}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              activeUserName={activeUser.name}
              activeUserTitle={activeUser.customRoleTitle}
              onSignOut={signOut}
              sessions={activeSessions}
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
          <div className="max-w-7xl mx-auto space-y-6">
            {!isTabAllowed ? (
              /* Access Guard Fallback */
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center max-w-2xl mx-auto my-12 space-y-5 text-white shadow-2xl">
                <div className="w-16 h-16 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-8 h-8 animate-bounce" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-black text-white">Quyền Truy Cập Bị Hạn Chế (Access Restricted)</h2>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Role hiện tại của bạn (<span className="text-amber-400 font-bold uppercase">{currentRole}</span>) chưa được cấp quyền truy cập tính năng{" "}
                    <strong className="text-white">&quot;{currentTabNavItem?.label}&quot;</strong>.
                  </p>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-left text-xs font-mono space-y-1 text-slate-300">
                  <div className="text-slate-500 font-sans text-[10px] uppercase font-bold">Chi tiết yêu cầu an ninh:</div>
                  <div>• Permission Required: <span className="text-blue-400">{currentTabNavItem?.perm}</span></div>
                  <div>• Current Role: <span className="text-amber-400">{currentRole}</span></div>
                  <div>• Status: <span className="text-red-400">DENIED</span></div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setActiveTab("dashboard")}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
                  >
                    Về Dashboard Cho Role
                  </button>

                  {currentRole === "ceo" || currentRole === "admin" ? (
                    <button
                      onClick={() => {
                        setActiveTab("user_settings");
                      }}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2"
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
                {activeTab === "myworkspace" && (
                  <MyWorkspace
                    currentRole={currentRole}
                    activeUser={activeUser}
                    brands={activeBrands}
                    projects={activeProjects}
                    sessions={activeSessions}
                    talents={activeTalents}
                    campaigns={campaigns}
                    campaignRevisionNotes={campaignRevisionNotes}
                    shiftSlots={shiftSlots}
                    onRespondToCampaignApproval={handleRespondToCampaignApproval}
                    onNavigateTab={setActiveTab}
                    onSelectSession={handleSelectSessionFromDashboard}
                  />
                )}

                {activeTab === "brief" && (
                  <ExecutiveBrief
                    currentRole={currentRole}
                    sessions={activeSessions}
                    directives={activeDirectives}
                    onAddDirective={handleAddDirective}
                    onUpdateDirective={handleUpdateDirective}
                    onDeleteDirective={handleDeleteDirective}
                    onNavigateTab={setActiveTab}
                  />
                )}

                {activeTab === "dashboard" && (
                  <Dashboards
                    currentRole={currentRole}
                    sessions={activeSessions}
                    studios={activeStudios}
                    brands={activeBrands}
                    talents={activeTalents}
                    onSelectSession={handleSelectSessionFromDashboard}
                    onNavigateTab={setActiveTab}
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
                    campaigns={campaigns}
                    onSelectSession={setSelectedSession}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
                    onDeleteSession={handleDeleteSession}
                  />
                )}

                {activeTab === "calendar" && (
                  <LiveCalendar
                    sessions={activeSessions}
                    studios={activeStudios}
                    talents={activeTalents}
                    brands={activeBrands}
                    users={activeUsers}
                    campaigns={campaigns}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
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
                    brandPlatformRates={brandPlatformRates}
                    recurringShiftTemplates={recurringShiftTemplates}
                    campaigns={campaigns}
                    onCreateSlot={handleCreateShiftSlot}
                    onDeleteSlot={handleDeleteShiftSlot}
                    onRegister={handleRegisterSlot}
                    onUnregister={handleUnregisterSlot}
                    onFinalizeSlot={handleFinalizeShiftSlot}
                    onSaveRate={handleSaveBrandPlatformRate}
                    onCreateTemplate={handleCreateRecurringTemplate}
                    onToggleTemplate={handleToggleRecurringTemplate}
                    onDeleteTemplate={handleDeleteRecurringTemplate}
                    onGenerateMonthSlots={handleGenerateMonthSlots}
                    onCreateCampaign={handleCreateCampaign}
                    onUpdateCampaign={handleUpdateCampaign}
                    onDeleteCampaign={handleDeleteCampaign}
                    onSubmitCampaignReview={handleSubmitCampaignReview}
                    campaignRevisionNotes={campaignRevisionNotes}
                    onSendCampaignForApproval={handleSendCampaignForApproval}
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
                    campaigns={campaigns}
                    sessions={activeSessions}
                    brandInvoices={brandInvoices}
                  />
                )}

                {activeTab === "brand_calendar" && effectiveWorkspace.type === "brand" && (
                  <BrandCalendar
                    brandId={currentBrandId!}
                    sessions={activeSessions}
                    studios={activeStudios}
                    talents={activeTalents}
                    campaigns={campaigns}
                  />
                )}

                {activeTab === "brand_campaigns" && effectiveWorkspace.type === "brand" && (
                  <BrandCampaigns
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    campaigns={campaigns}
                    sessions={activeSessions}
                    shiftSlots={shiftSlots}
                    campaignRevisionNotes={campaignRevisionNotes}
                    onSendCampaignForApproval={handleSendCampaignForApproval}
                    onRespondToCampaignApproval={handleRespondToCampaignApproval}
                    onSubmitCampaignReview={handleSubmitCampaignReview}
                  />
                )}

                {activeTab === "brand_sessions" && effectiveWorkspace.type === "brand" && (
                  <BrandSessions
                    brandId={currentBrandId!}
                    brand={activeBrands.find((b) => b.id === currentBrandId)}
                    sessions={activeSessions}
                    talents={talents}
                    financeRecords={financeRecords}
                    brandPlatformRates={brandPlatformRates}
                    talentRateHistory={talentRateHistory}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                  />
                )}

                {activeTab === "brand_rates" && effectiveWorkspace.type === "brand" && (
                  <BrandRateCard
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    brandPlatformRates={brandPlatformRates}
                    brandPlatformRateHistory={brandPlatformRateHistory}
                    onSaveRate={handleSaveBrandPlatformRate}
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

                {activeTab === "brand_invoices" && effectiveWorkspace.type === "brand" && (
                  <BrandInvoices
                    brandId={currentBrandId!}
                    currentRole={currentRole}
                    brandInvoices={brandInvoices}
                    onAddInvoice={handleAddBrandInvoice}
                    onUpdateInvoice={handleUpdateBrandInvoice}
                    onDeleteInvoice={handleDeleteBrandInvoice}
                  />
                )}

                {activeTab === "brand_reviews" && effectiveWorkspace.type === "brand" && (
                  <BrandReviewHistory brandId={currentBrandId!} campaigns={campaigns} sessions={activeSessions} />
                )}

                {activeTab === "scripts" && <ScriptGenerator />}

                {activeTab === "talents" && (
                  <TalentMatcher
                    talents={activeTalents}
                    brands={activeBrands}
                    onAddTalent={handleAddTalent}
                    onUpdateTalent={handleUpdateTalent}
                    onDeleteTalent={handleDeleteTalent}
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

                {activeTab === "product_samples" && (
                  <ProductSampleInventory
                    currentRole={currentRole}
                    brands={activeBrands}
                    studios={activeStudios}
                    productSamples={productSamples}
                    onAddSample={handleAddProductSample}
                    onUpdateSample={handleUpdateProductSample}
                    onDeleteSample={handleDeleteProductSample}
                  />
                )}

                {activeTab === "live_incidents" && (
                  <LiveStreamIncidentLog
                    currentRole={currentRole}
                    sessions={activeSessions}
                    incidents={liveStreamIncidents}
                    onAddIncident={handleAddLiveStreamIncident}
                    onUpdateIncident={handleUpdateLiveStreamIncident}
                    onDeleteIncident={handleDeleteLiveStreamIncident}
                  />
                )}

                {activeTab === "crm" && (
                  <CrmProjects
                    brands={activeBrands}
                    projects={activeProjects}
                    users={users}
                    onAddBrand={handleAddBrand}
                    onUpdateBrand={handleUpdateBrand}
                    onDeleteBrand={handleDeleteBrand}
                    onAddProject={handleAddProject}
                    onUpdateProject={handleUpdateProject}
                    onDeleteProject={handleDeleteProject}
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

                {activeTab === "ai_agents" && <AiMultiAgent onNavigateTab={setActiveTab} />}

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

