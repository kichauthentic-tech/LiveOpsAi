import React, { useState, useEffect, useMemo } from "react";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry, StrategicDirective, WorkflowRule, Talent, Studio, Equipment, Brand, AgencyProject, SessionFinance, TikTokConnectionStatus, TikTokWebhookEvent } from "./types";
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
  Eye,
  EyeOff,
  UserCheck
} from "lucide-react";
import { Header } from "./components/Header";
import { Login } from "./components/Login";
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
import { MyWorkspace } from "./components/MyWorkspace";

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
  const { session, profile, loading: authLoading, signOut } = useAuth();

  const currentRole: UserRole = profile?.role ?? "talent";
  const [activeTab, setActiveTab] = useState<string>(() => loadStorage("activeTab", "brief"));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hideRestrictedMenu, setHideRestrictedMenu] = useState<boolean>(() => loadStorage("hideRestrictedMenu", false));

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

  // State
  const [isMockDataHidden, setIsMockDataHidden] = useState<boolean>(() => loadStorage("isMockDataHidden", true));

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

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
  }, [session]);

  async function handleUpdateSessionFinance(
    sessionId: string,
    patch: Partial<Pick<SessionFinance, "agencyCommissionRate" | "studioCost" | "adsCost" | "notes">>
  ) {
    const updated = await upsertSessionFinance(sessionId, patch);
    setFinanceRecords((prev) => {
      const others = prev.filter((f) => f.sessionId !== sessionId);
      return [...others, updated];
    });
  }

  async function handleSetSessionFinanceApproval(sessionId: string, status: SessionFinance["approvalStatus"]) {
    const updated = await setSessionFinanceApproval(sessionId, status, profile?.id);
    setFinanceRecords((prev) => {
      const others = prev.filter((f) => f.sessionId !== sessionId);
      return [...others, updated];
    });
  }

  // LocalStorage sync effects
  useEffect(() => saveStorage("activeTab", activeTab), [activeTab]);
  useEffect(() => saveStorage("hideRestrictedMenu", hideRestrictedMenu), [hideRestrictedMenu]);
  useEffect(() => saveStorage("isMockDataHidden", isMockDataHidden), [isMockDataHidden]);

  // Active datasets filtered based on mock data visibility toggle
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

  // Handlers for Live Sessions — persisted to Supabase
  const handleAddSession = async (newSession: LiveSession) => {
    try {
      const created = await createSession(newSession);
      setSessions(prev => [created, ...prev]);
      setSelectedSession(created);
    } catch (e: any) {
      window.alert(`Không thể tạo Live Session: ${e.message ?? e}`);
    }
  };
  const handleUpdateSession = async (updatedSession: LiveSession) => {
    try {
      const saved = await updateSession(updatedSession);
      setSessions(prev => prev.map(s => s.id === saved.id ? saved : s));
      if (selectedSession && selectedSession.id === saved.id) {
        setSelectedSession(saved);
      }
    } catch (e: any) {
      window.alert(`Không thể cập nhật Live Session: ${e.message ?? e}`);
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

  const handleClearAllCustomData = () => {
    window.alert("Workflow Rules/Directives/Audit Logs giờ là dữ liệu thật trên Supabase — hãy xóa từng mục trong tab tương ứng.");
  };

  const handleClearEverything = () => {
    if (window.confirm("Bạn có chắc chắn muốn XÓA SẠCH TẤT CẢ DỮ LIỆU (Cả Mock Data & Dữ liệu tự nhập) để kiểm tra ứng dụng ở trạng thái hoàn toàn trống không?")) {
      setIsMockDataHidden(true);
    }
  };

  const handleSelectSessionFromDashboard = (session: LiveSession) => {
    setSelectedSession(session);
    setActiveTab("sessions");
  };

  // Navigation Items mapped to permission keys
  const navItems = [
    { id: "myworkspace", label: "Việc Của Tôi", icon: UserCheck, perm: undefined },
    { id: "brief", label: "Command Brief", icon: FileText, perm: "view_executive_brief" as PermissionKey },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, perm: undefined },
    { id: "sessions", label: "Live Sessions", icon: Radio, badge: "LIVE", perm: "manage_sessions" as PermissionKey },
    { id: "calendar", label: "Lịch Vận Hành", icon: CalendarIcon, badge: "SMART", perm: "manage_calendar" as PermissionKey },
    { id: "scripts", label: "AI Script Gen", icon: Sparkles, perm: "generate_scripts" as PermissionKey },
    { id: "talents", label: "Talent Pool", icon: Users, perm: "manage_talents" as PermissionKey },
    { id: "studios", label: "Studios & Gear", icon: Building2, perm: "manage_studios_gear" as PermissionKey },
    { id: "crm", label: "CRM & Projects", icon: Briefcase, perm: "manage_crm_projects" as PermissionKey },
    { id: "tiktok_api", label: "TikTok API", icon: Link2, perm: "manage_tiktok_api" as PermissionKey },
    { id: "finance", label: "Finance & P&L", icon: DollarSign, perm: "view_financials" as PermissionKey },
    { id: "ai_agents", label: "Hội Đồng AI & Simulator", icon: Bot, badge: "DEMO", perm: "manage_ai_agents" as PermissionKey },
    { id: "user_settings", label: "Phân Quyền & Role", icon: ShieldCheck, badge: "CUSTOM", perm: "manage_users_permissions" as PermissionKey },
  ];

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
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900/90 backdrop-blur-md border-r border-slate-800 flex flex-col transition-transform duration-300 md:static md:translate-x-0 ${
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

        <div className="px-4 py-2 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-semibold text-slate-500 uppercase tracking-wider text-[10px]">Danh Mục Tính Năng</span>
          <button
            onClick={() => setHideRestrictedMenu(!hideRestrictedMenu)}
            className="flex items-center gap-1 hover:text-blue-400 transition-colors text-[10px] font-medium"
            title="Ẩn hoặc hiện các mục không có quyền truy cập"
          >
            {hideRestrictedMenu ? <Eye className="w-3 h-3 text-blue-400" /> : <EyeOff className="w-3 h-3 text-slate-500" />}
            <span>{hideRestrictedMenu ? "Hiện tất cả" : "Ẩn tab khóa"}</span>
          </button>
        </div>

        <nav className="flex-1 py-3 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const hasAccess = !item.perm || checkPermission(item.perm);

            if (hideRestrictedMenu && !hasAccess) return null;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors text-xs font-medium ${
                  isActive
                    ? "bg-blue-600/10 text-blue-400 border border-blue-600/20 font-bold"
                    : hasAccess
                    ? "text-slate-400 hover:bg-slate-800/80 hover:text-slate-200"
                    : "text-slate-600 hover:bg-slate-900 hover:text-slate-500 opacity-70"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? "text-blue-400"
                        : hasAccess
                        ? "text-slate-400"
                        : "text-slate-600"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {!hasAccess && <Lock className="w-3.5 h-3.5 text-amber-500/80" />}
                  {item.badge && hasAccess && (
                    <span className="bg-rose-600/20 text-rose-400 border border-rose-500/30 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase animate-pulse">
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
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
              isMockDataHidden={isMockDataHidden}
              onToggleMockData={() => setIsMockDataHidden(!isMockDataHidden)}
              onResetData={handleClearAllCustomData}
            />
          </div>
        </div>

        {/* Clean Test Mode Alert Banner */}
        {isMockDataHidden && (
          <div className="bg-amber-950/80 border-b border-amber-500/30 px-6 py-2.5 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-amber-500/20 rounded-lg text-amber-400">
                <Sparkles className="w-4 h-4" />
              </span>
              <span>
                <strong className="text-amber-300 font-extrabold uppercase">Chế Độ Test App (Clean State):</strong> Tất cả dữ liệu mẫu (Mock Data) đã được ẩn/xóa sạch. Tất cả các tab (Brief, Calendar, CRM, Talent, Studio, Settings...) đang trống để bạn tự do tạo dữ liệu mới để thử nghiệm.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsMockDataHidden(false)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-[11px] transition-all shadow"
              >
                Mở Lại Mock Data Ban Đầu
              </button>
              <button
                onClick={handleClearEverything}
                className="px-3 py-1 bg-red-950/90 hover:bg-red-900 text-red-200 border border-red-500/40 font-bold rounded-lg text-[11px] transition-all"
              >
                Xóa Sạch Tự Nhập & Reset Về 0
              </button>
            </div>
          </div>
        )}

        {/* Dynamic View Content */}
        <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
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

                  {currentRole === "ceo" ? (
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
                  />
                )}

                {activeTab === "sessions" && (
                  <LiveSessionHub
                    sessions={activeSessions}
                    selectedSession={activeSelectedSession}
                    studios={activeStudios}
                    talents={activeTalents}
                    brands={activeBrands}
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
                  />
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
                    currentUserId={profile?.id}
                    onUpdateFinance={handleUpdateSessionFinance}
                    onSetFinanceApproval={handleSetSessionFinanceApproval}
                  />
                )}

                {activeTab === "ai_agents" && <AiMultiAgent onNavigateTab={setActiveTab} />}

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
                  />
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

