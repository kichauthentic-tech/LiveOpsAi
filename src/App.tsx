import React, { useState } from "react";
import { UserRole, LiveSession, PermissionKey, RolePermissionsMap, SystemUser, AuditLogEntry } from "./types";
import {
  MOCK_SESSIONS,
  MOCK_BRANDS,
  MOCK_TALENTS,
  MOCK_STUDIOS,
  MOCK_EQUIPMENTS,
  MOCK_PROJECTS,
  MOCK_WORKFLOW_RULES,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSION_DEFINITIONS,
  MOCK_SYSTEM_USERS,
  MOCK_AUDIT_LOGS
} from "./data/mockData";
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
  ShieldAlert
} from "lucide-react";
import { Header } from "./components/Header";
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

export default function App() {
  const [currentRole, setCurrentRole] = useState<UserRole>("ceo");
  const [activeTab, setActiveTab] = useState<string>("brief");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // System Users & Custom Permissions State
  const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>(DEFAULT_ROLE_PERMISSIONS);
  const [users, setUsers] = useState<SystemUser[]>(MOCK_SYSTEM_USERS);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(MOCK_AUDIT_LOGS);
  const [activeUserId, setActiveUserId] = useState<string>("usr-1");

  // State
  const [sessions, setSessions] = useState<LiveSession[]>(MOCK_SESSIONS);
  const [selectedSession, setSelectedSession] = useState<LiveSession>(MOCK_SESSIONS[0]);
  const [brands, setBrands] = useState(MOCK_BRANDS);
  const [talents, setTalents] = useState(MOCK_TALENTS);
  const [studios, setStudios] = useState(MOCK_STUDIOS);
  const [equipments, setEquipments] = useState(MOCK_EQUIPMENTS);
  const [projects, setProjects] = useState(MOCK_PROJECTS);
  const [workflowRules, setWorkflowRules] = useState(MOCK_WORKFLOW_RULES);

  // Active User object
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];

  // Helper to check permission for a specific key under current role/user
  const checkPermission = (permKey: PermissionKey): boolean => {
    // Check if activeUser has override for this permission
    if (activeUser && activeUser.customPermissionOverrides?.[permKey] !== undefined) {
      return !!activeUser.customPermissionOverrides[permKey];
    }
    // Fallback to role permissions
    return !!rolePermissions[currentRole]?.[permKey];
  };

  // Handlers for Users & Permissions
  const handleUpdateRolePermissions = (newMap: RolePermissionsMap) => {
    setRolePermissions(newMap);
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      performedBy: `${activeUser.name} (${currentRole.toUpperCase()})`,
      action: `Cập nhật Ma Trận Phân Quyền Role`,
      details: `Thay đổi cấu hình quyền truy cập tính năng cho các vai trò trong hệ thống.`,
      category: "Permission Change"
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const handleAddUser = (newUser: SystemUser) => {
    setUsers((prev) => [newUser, ...prev]);
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      performedBy: `${activeUser.name} (${currentRole.toUpperCase()})`,
      action: `Tạo tài khoản người dùng mới`,
      details: `Đã tạo tài khoản ${newUser.name} (${newUser.email}) với role ${newUser.role.toUpperCase()}`,
      category: "User Status"
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const handleUpdateUser = (updatedUser: SystemUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    const newLog: AuditLogEntry = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
      performedBy: `${activeUser.name} (${currentRole.toUpperCase()})`,
      action: `Cập nhật thông tin/quyền người dùng`,
      details: `Chỉnh sửa tài khoản ${updatedUser.name} (${updatedUser.email})`,
      category: "User Status"
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    if (target) {
      const newLog: AuditLogEntry = {
        id: `log-${Date.now()}`,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        performedBy: `${activeUser.name} (${currentRole.toUpperCase()})`,
        action: `Xóa tài khoản người dùng`,
        details: `Đã xóa tài khoản ${target.name} (${target.email}) khỏi hệ thống`,
        category: "User Status"
      };
      setAuditLogs((prev) => [newLog, ...prev]);
    }
  };

  // Handlers for Talents
  const handleAddTalent = (newTalent: any) => {
    setTalents(prev => [newTalent, ...prev]);
  };
  const handleUpdateTalent = (updatedTalent: any) => {
    setTalents(prev => prev.map(t => t.id === updatedTalent.id ? updatedTalent : t));
  };
  const handleDeleteTalent = (id: string) => {
    setTalents(prev => prev.filter(t => t.id !== id));
  };

  // Handlers for Studios
  const handleAddStudio = (newStudio: any) => {
    setStudios(prev => [newStudio, ...prev]);
  };
  const handleUpdateStudio = (updatedStudio: any) => {
    setStudios(prev => prev.map(s => s.id === updatedStudio.id ? updatedStudio : s));
  };
  const handleDeleteStudio = (id: string) => {
    setStudios(prev => prev.filter(s => s.id !== id));
  };

  // Handlers for Equipments
  const handleAddEquipment = (newEquipment: any) => {
    setEquipments(prev => [newEquipment, ...prev]);
  };
  const handleUpdateEquipment = (updatedEquipment: any) => {
    setEquipments(prev => prev.map(e => e.id === updatedEquipment.id ? updatedEquipment : e));
  };
  const handleDeleteEquipment = (id: string) => {
    setEquipments(prev => prev.filter(e => e.id !== id));
  };

  // Handlers for Brands
  const handleAddBrand = (newBrand: any) => {
    setBrands(prev => [newBrand, ...prev]);
  };
  const handleUpdateBrand = (updatedBrand: any) => {
    setBrands(prev => prev.map(b => b.id === updatedBrand.id ? updatedBrand : b));
  };
  const handleDeleteBrand = (id: string) => {
    setBrands(prev => prev.filter(b => b.id !== id));
  };

  // Handlers for Projects
  const handleAddProject = (newProject: any) => {
    setProjects(prev => [newProject, ...prev]);
  };
  const handleUpdateProject = (updatedProject: any) => {
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
  };
  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
  };

  // Handlers for Live Sessions
  const handleAddSession = (newSession: any) => {
    setSessions(prev => [newSession, ...prev]);
    setSelectedSession(newSession);
  };
  const handleUpdateSession = (updatedSession: any) => {
    setSessions(prev => prev.map(s => s.id === updatedSession.id ? updatedSession : s));
    if (selectedSession.id === updatedSession.id) {
      setSelectedSession(updatedSession);
    }
  };
  const handleDeleteSession = (id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      if (selectedSession.id === id && next.length > 0) {
        setSelectedSession(next[0]);
      }
      return next;
    });
  };

  // Handlers for Workflow Rules
  const handleAddWorkflowRule = (newRule: any) => {
    setWorkflowRules(prev => [newRule, ...prev]);
  };
  const handleUpdateWorkflowRule = (updatedRule: any) => {
    setWorkflowRules(prev => prev.map(r => r.id === updatedRule.id ? updatedRule : r));
  };
  const handleDeleteWorkflowRule = (id: string) => {
    setWorkflowRules(prev => prev.filter(r => r.id !== id));
  };

  const handleSelectSessionFromDashboard = (session: LiveSession) => {
    setSelectedSession(session);
    setActiveTab("sessions");
  };

  // Navigation Items mapped to permission keys
  const navItems = [
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
    { id: "ai_agents", label: "AI Council", icon: Bot, perm: "manage_ai_agents" as PermissionKey },
    { id: "user_settings", label: "Phân Quyền & Role", icon: ShieldCheck, badge: "CUSTOM", perm: "manage_users_permissions" as PermissionKey },
  ];

  // Helper to determine if current tab is allowed
  const currentTabNavItem = navItems.find((n) => n.id === activeTab);
  const isTabAllowed = !currentTabNavItem?.perm || checkPermission(currentTabNavItem.perm);

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

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const hasAccess = !item.perm || checkPermission(item.perm);

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
                    : "text-slate-600 hover:bg-slate-900 hover:text-slate-500"
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
            <img
              src={activeUser.avatar}
              alt={activeUser.name}
              className="w-9 h-9 rounded-full object-cover border border-slate-600"
            />
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
              onRoleChange={setCurrentRole}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              users={users}
              activeUserId={activeUserId}
              onUserSelect={setActiveUserId}
            />
          </div>
        </div>

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

                  <button
                    onClick={() => {
                      setCurrentRole("ceo");
                      setActiveTab("user_settings");
                    }}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-black shadow-lg shadow-purple-600/30 transition-all flex items-center gap-2"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Mở Phân Quyền Custom (Chuyển CEO Admin)</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {activeTab === "brief" && <ExecutiveBrief currentRole={currentRole} />}

                {activeTab === "dashboard" && (
                  <Dashboards
                    currentRole={currentRole}
                    sessions={sessions}
                    studios={studios}
                    brands={brands}
                    talents={talents}
                    onSelectSession={handleSelectSessionFromDashboard}
                  />
                )}

                {activeTab === "sessions" && (
                  <LiveSessionHub
                    sessions={sessions}
                    selectedSession={selectedSession}
                    onSelectSession={setSelectedSession}
                    onAddSession={handleAddSession}
                    onUpdateSession={handleUpdateSession}
                    onDeleteSession={handleDeleteSession}
                  />
                )}

                {activeTab === "calendar" && (
                  <LiveCalendar
                    sessions={sessions}
                    studios={studios}
                    talents={talents}
                    brands={brands}
                  />
                )}

                {activeTab === "scripts" && <ScriptGenerator />}

                {activeTab === "talents" && (
                  <TalentMatcher
                    talents={talents}
                    brands={brands}
                    onAddTalent={handleAddTalent}
                    onUpdateTalent={handleUpdateTalent}
                    onDeleteTalent={handleDeleteTalent}
                  />
                )}

                {activeTab === "studios" && (
                  <StudioEquipment
                    studios={studios}
                    equipments={equipments}
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
                    brands={brands}
                    projects={projects}
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
                    workflowRules={workflowRules}
                    onAddWorkflowRule={handleAddWorkflowRule}
                    onUpdateWorkflowRule={handleUpdateWorkflowRule}
                    onDeleteWorkflowRule={handleDeleteWorkflowRule}
                  />
                )}

                {activeTab === "finance" && <FinanceHr sessions={sessions} />}

                {activeTab === "ai_agents" && <AiMultiAgent />}

                {activeTab === "user_settings" && (
                  <UserRoleSettings
                    currentRole={currentRole}
                    rolePermissions={rolePermissions}
                    onUpdateRolePermissions={handleUpdateRolePermissions}
                    users={users}
                    onAddUser={handleAddUser}
                    onUpdateUser={handleUpdateUser}
                    onDeleteUser={handleDeleteUser}
                    auditLogs={auditLogs}
                    permissionDefinitions={ALL_PERMISSION_DEFINITIONS}
                    brands={brands}
                    talents={talents}
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

