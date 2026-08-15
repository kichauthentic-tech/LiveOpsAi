import React, { useState, useMemo } from "react";
import { UserRole, PermissionKey, PermissionDefinition, RolePermissionsMap, SystemUser, AuditLogEntry, Brand, Talent, LiveSession } from "../types";
import {
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Users,
  Key,
  Lock,
  Unlock,
  Check,
  X,
  Search,
  Sliders,
  History,
  Sparkles,
  AlertTriangle,
  Mail,
  User,
  Building,
  CheckCircle2,
  Trash2,
  Edit2,
  Radio,
  Building2,
  Briefcase,
  FileText
} from "lucide-react";

export interface NewUserPayload {
  name: string;
  email: string;
  role: UserRole;
  customRoleTitle: string;
  assignedBrandId?: string;
  assignedTalentId?: string;
}

interface UserRoleSettingsProps {
  currentRole: UserRole;
  rolePermissions: RolePermissionsMap;
  onUpdateRolePermissions: (newMap: RolePermissionsMap) => void;
  users: SystemUser[];
  onAddUser: (newUser: NewUserPayload) => Promise<void>;
  onUpdateUser: (updatedUser: SystemUser) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  auditLogs: AuditLogEntry[];
  permissionDefinitions: PermissionDefinition[];
  brands: Brand[];
  talents: Talent[];
  sessions: LiveSession[];
}

export const UserRoleSettings: React.FC<UserRoleSettingsProps> = ({
  currentRole,
  rolePermissions,
  onUpdateRolePermissions,
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  auditLogs,
  permissionDefinitions,
  brands,
  talents,
  sessions
}) => {
  const [activeTab, setActiveTab] = useState<"roles" | "users" | "audit">("roles");
  const [selectedRole, setSelectedRole] = useState<UserRole>("operations");
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");

  // Modal State for New/Edit User
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [formData, setFormData] = useState<{
    name: string;
    email: string;
    role: UserRole;
    customRoleTitle: string;
    status: "Active" | "Inactive";
    assignedBrandId: string;
    assignedTalentId: string;
  }>({
    name: "",
    email: "",
    role: "operations",
    customRoleTitle: "",
    status: "Active",
    assignedBrandId: "",
    assignedTalentId: ""
  });

  // Modal state for Custom User Permissions Overrides
  const [permissionOverrideUser, setPermissionOverrideUser] = useState<SystemUser | null>(null);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchQuery =
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.customRoleTitle.toLowerCase().includes(userSearch.toLowerCase());
      const matchRole = userRoleFilter === "all" || u.role === userRoleFilter;
      return matchQuery && matchRole;
    });
  }, [users, userSearch, userRoleFilter]);

  // Group permissions by category
  const groupedPermissions = useMemo(() => {
    const groups: Record<string, PermissionDefinition[]> = {};
    permissionDefinitions.forEach((def) => {
      if (!groups[def.category]) {
        groups[def.category] = [];
      }
      groups[def.category].push(def);
    });
    return groups;
  }, [permissionDefinitions]);

  // Toggle single permission for a role
  const handleToggleRolePermission = (role: UserRole, permKey: PermissionKey) => {
    const updatedRolePerms = {
      ...rolePermissions,
      [role]: {
        ...rolePermissions[role],
        [permKey]: !rolePermissions[role][permKey]
      }
    };
    onUpdateRolePermissions(updatedRolePerms);
  };

  // Toggle custom permission override for a specific user
  const handleToggleUserPermissionOverride = (userId: string, permKey: PermissionKey) => {
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return;

    const currentRoleDefault = rolePermissions[targetUser.role][permKey];
    const currentOverride = targetUser.customPermissionOverrides?.[permKey];

    // Calculate new override
    const newOverrides = { ...(targetUser.customPermissionOverrides || {}) };

    if (currentOverride === undefined) {
      // Toggle away from role default
      newOverrides[permKey] = !currentRoleDefault;
    } else {
      // Remove override if toggling back to role default
      delete newOverrides[permKey];
    }

    const updatedUser: SystemUser = {
      ...targetUser,
      customPermissionOverrides: newOverrides
    };

    onUpdateUser(updatedUser);
    setPermissionOverrideUser(updatedUser);
  };

  // Reset Role Permissions to Default
  const handleResetRoleToDefault = (role: UserRole) => {
    let preset: Record<PermissionKey, boolean>;
    if (role === "admin") {
      // Admin = CEO + quyền tối cao — mọi permission trong Ma Trận đều true, giống CEO.
      // Quyền độc quyền thật sự của Admin (cấu hình AI Training) KHÔNG nằm trong Ma
      // Trận này — xem RLS "admin only" của bảng ai_agent_prompts.
      preset = {
        view_financials: true,
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_finance_hr: true,
        manage_ai_agents: true,
        manage_users_permissions: true,
        export_reports: true,
        view_rate_card: true
      };
    } else if (role === "ceo") {
      preset = {
        view_financials: true,
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_finance_hr: true,
        manage_ai_agents: true,
        manage_users_permissions: true,
        export_reports: true,
        view_rate_card: true
      };
    } else if (role === "operations") {
      preset = {
        view_financials: false,
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_finance_hr: false,
        manage_ai_agents: true,
        manage_users_permissions: false,
        export_reports: true,
        view_rate_card: true
      };
    } else if (role === "brand") {
      preset = {
        view_financials: false,
        manage_sessions: false,
        manage_calendar: false,
        manage_talents: false,
        manage_studios_gear: false,
        manage_crm_projects: false,
        manage_tiktok_api: false,
        manage_finance_hr: false,
        manage_ai_agents: false,
        manage_users_permissions: false,
        export_reports: true,
        view_rate_card: true
      };
    } else if (role === "talent") {
      preset = {
        view_financials: false,
        manage_sessions: false,
        manage_calendar: false,
        manage_talents: false,
        manage_studios_gear: false,
        manage_crm_projects: false,
        manage_tiktok_api: false,
        manage_finance_hr: false,
        manage_ai_agents: false,
        manage_users_permissions: false,
        export_reports: false,
        view_rate_card: false
      };
    } else {
      // moderator — hẹp nhất: chỉ đọc dữ liệu (lịch/checklist) qua RLS "*_read_all"
      // mặc định cho mọi authenticated user, không bật quyền quản lý/ghi nào.
      preset = {
        view_financials: false,
        manage_sessions: false,
        manage_calendar: false,
        manage_talents: false,
        manage_studios_gear: false,
        manage_crm_projects: false,
        manage_tiktok_api: false,
        manage_finance_hr: false,
        manage_ai_agents: false,
        manage_users_permissions: false,
        export_reports: false,
        view_rate_card: false
      };
    }

    onUpdateRolePermissions({
      ...rolePermissions,
      [role]: preset
    });
  };

  // User creation/update handler
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim()) return;

    setIsSavingUser(true);
    try {
      if (editingUser) {
        const updated: SystemUser = {
          ...editingUser,
          name: formData.name,
          role: formData.role,
          customRoleTitle: formData.customRoleTitle || getRoleDefaultTitle(formData.role),
          status: formData.status,
          assignedBrandId: formData.role === "brand" ? formData.assignedBrandId : undefined,
          assignedTalentId: formData.role === "talent" ? formData.assignedTalentId : undefined
        };
        await onUpdateUser(updated);
      } else {
        await onAddUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          customRoleTitle: formData.customRoleTitle || getRoleDefaultTitle(formData.role),
          assignedBrandId: formData.role === "brand" ? formData.assignedBrandId : undefined,
          assignedTalentId: formData.role === "talent" ? formData.assignedTalentId : undefined
        });
      }

      setIsUserModalOpen(false);
      setEditingUser(null);
    } catch {
      // Error already surfaced to the user by the caller (App.tsx) — keep the modal open so they can retry.
    } finally {
      setIsSavingUser(false);
    }
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setFormData({
      name: "",
      email: "",
      role: "operations",
      customRoleTitle: "",
      status: "Active",
      assignedBrandId: "",
      assignedTalentId: ""
    });
    setIsUserModalOpen(true);
  };

  const openEditModal = (user: SystemUser) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      customRoleTitle: user.customRoleTitle,
      status: user.status,
      assignedBrandId: user.assignedBrandId || "",
      assignedTalentId: user.assignedTalentId || ""
    });
    setIsUserModalOpen(true);
  };

  const getRoleBadgeStyle = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "bg-rose-500/20 text-rose-300 border-rose-500/40";
      case "ceo":
        return "bg-purple-500/20 text-purple-300 border-purple-500/40";
      case "operations":
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
      case "brand":
        return "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
      case "talent":
        return "bg-amber-500/20 text-amber-300 border-amber-500/40";
      case "moderator":
        return "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
    }
  };

  const getRoleDefaultTitle = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "Quản Trị Viên Hệ Thống (Admin)";
      case "ceo":
        return "Executive Director / CEO";
      case "operations":
        return "Operations Specialist";
      case "brand":
        return "Brand Client Representative";
      case "talent":
        return "Livestream Host & Talent";
      case "moderator":
        return "Trợ Lý Vận Hành (Moderator)";
    }
  };

  // Số ca live đã/đang phụ trách với vai trò Moderator — tra theo assistantId thật
  // của session, không phải chuỗi assistantName gõ tay (xem migration 0010).
  const countModeratorSessions = (userId: string) => sessions.filter((s) => s.assistantId === userId).length;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-6 rounded-2xl shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-[var(--text)]">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[var(--accent)]/20 text-[var(--accent-text)] border border-[var(--accent)]/30 rounded-2xl">
            <ShieldCheck className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--accent-text)] uppercase tracking-widest">
                System Administration
              </span>
              <span className="bg-[var(--accent)]/30 text-[var(--accent-text)] border border-[var(--accent)]/40 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                Module 14
              </span>
            </div>
            <h2 className="text-2xl font-black text-[var(--text)] mt-0.5">
              Phân Quyền Custom & Setting Người Dùng (Access Control Engine)
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Cấu hình Ma trận phân quyền chi tiết cho 6 Role tiêu chuẩn, override quyền từng cá nhân & audit nhật ký an ninh.
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-[var(--surface-base)] p-1.5 rounded-xl border border-[var(--border)] text-xs font-bold gap-1">
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "roles"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 font-black"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Ma Trận Role ({Object.keys(rolePermissions).length})</span>
          </button>

          <button
            onClick={() => setActiveTab("users")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "users"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 font-black"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Danh Sách Account ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("audit")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "audit"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 font-black"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Logs ({auditLogs.length})</span>
          </button>
        </div>
      </div>

      {/* TAB 1: ROLE PERMISSIONS MATRIX */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {/* Role selector selector cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {(["admin", "ceo", "operations", "brand", "talent", "moderator"] as UserRole[]).map((roleKey) => {
              const isSelected = selectedRole === roleKey;
              const permsMap = rolePermissions[roleKey];
              const enabledCount = Object.values(permsMap).filter(Boolean).length;
              const totalCount = permissionDefinitions.length;

              return (
                <button
                  key={roleKey}
                  onClick={() => setSelectedRole(roleKey)}
                  className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden space-y-3 ${
                    isSelected
                      ? "bg-[var(--surface)] border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-xl"
                      : "bg-[var(--surface)]/50 border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--surface)]/80"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border ${getRoleBadgeStyle(
                        roleKey
                      )}`}
                    >
                      {roleKey.toUpperCase()}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text-muted)]">
                      {enabledCount}/{totalCount} Permissions
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-[var(--text)] text-base">
                      {roleKey === "admin" && "Quản Trị Viên Hệ Thống (Admin)"}
                      {roleKey === "ceo" && "Executive Admin (CEO)"}
                      {roleKey === "operations" && "Operations Manager"}
                      {roleKey === "brand" && "Brand Client Portal"}
                      {roleKey === "talent" && "Talent / Host Portal"}
                      {roleKey === "moderator" && "Trợ Lý Vận Hành Portal"}
                    </h3>
                    <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-1">
                      {roleKey === "admin" && "Quyền tối cao — mọi thứ CEO làm được + độc quyền cấu hình AI Training Center (kể cả CEO không sửa được)."}
                      {roleKey === "ceo" && "Truy cập toàn quyền điều hành agency, P&L tài chính, CRM & phân quyền system."}
                      {roleKey === "operations" && "Điều phối phòng studio, xếp lịch ca live, kiểm kê gear QR & duyệt script."}
                      {roleKey === "brand" && "Cổng báo cáo dành cho Khách hàng: xem GMV thực thu, ROI, order analytics."}
                      {roleKey === "talent" && "Cổng dành cho Host/KOC: xem lịch livestream, commission dự kiến & AI coaching."}
                      {roleKey === "moderator" && "Cổng dành cho Trợ Lý/Moderator: chỉ xem lịch ca được gán & checklist gear."}
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-[var(--surface-elevated)] h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[var(--accent)] h-full rounded-full transition-all duration-300"
                        style={{ width: `${(enabledCount / totalCount) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Permission Category Groups for Selected Role */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-[var(--text)] space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-[var(--border)]">
              <div>
                <div className="flex items-center gap-2">
                  <Key className="w-5 h-5 text-[var(--accent-text)]" />
                  <h3 className="font-black text-lg text-[var(--text)]">
                    Tùy Chỉnh Phân Quyền Chi Tiết Cho Role:{" "}
                    <span className="text-[var(--accent-text)] uppercase">{selectedRole}</span>
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Bật/tắt từng tính năng cụ thể. Các thay đổi sẽ được áp dụng ngay lập tức cho toàn bộ người dùng thuộc role này.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResetRoleToDefault(selectedRole)}
                  className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] rounded-xl text-xs font-bold border border-[var(--border)] transition-all flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  <span>Khôi Phục Mặc Định</span>
                </button>
              </div>
            </div>

            {/* Permission Toggles grouped by Category */}
            <div className="space-y-6">
              {(Object.entries(groupedPermissions) as [string, PermissionDefinition[]][]).map(([category, defs]) => (
                <div key={category} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black text-[var(--text-muted)] uppercase tracking-wider bg-[var(--surface-base)]/60 p-2.5 rounded-xl border border-[var(--border)]/80">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                    <span>{category}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {defs.map((def) => {
                      const isAllowed = rolePermissions[selectedRole][def.key];
                      const isCEO =
                        (selectedRole === "ceo" || selectedRole === "admin") && def.key === "manage_users_permissions";

                      return (
                        <div
                          key={def.key}
                          onClick={() => !isCEO && handleToggleRolePermission(selectedRole, def.key)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                            isAllowed
                              ? "bg-[var(--accent)]/10 border-[var(--accent)]/40 hover:border-[var(--accent)]"
                              : "bg-[var(--surface-base)]/40 border-[var(--border)] hover:border-[var(--border)] opacity-60 hover:opacity-100"
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {isAllowed ? (
                                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                              )}
                              <span className="font-bold text-xs text-[var(--text)]">{def.label}</span>
                            </div>
                            <p className="text-[10px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                              {def.description}
                            </p>
                          </div>

                          {/* Toggle Button */}
                          <div
                            className={`w-11 h-6 flex items-center rounded-full p-1 transition-all shrink-0 ${
                              isAllowed ? "bg-[var(--accent)] justify-end" : "bg-[var(--surface-elevated)] justify-start"
                            }`}
                          >
                            <div className="bg-white w-4 h-4 rounded-full shadow-md"></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SYSTEM USER DIRECTORY */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--surface)] p-4 rounded-2xl border border-[var(--border)] shadow-md">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              {/* Search input */}
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-[var(--text-faint)] absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Tìm tên, email hoặc vai trò..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[var(--surface-base)] text-xs text-[var(--text)] rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Role filter */}
              <select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value)}
                className="px-3 py-2 bg-[var(--surface-base)] text-xs text-[var(--text-muted)] rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] font-bold"
              >
                <option value="all">Tất cả Role</option>
                <option value="admin">Admin</option>
                <option value="ceo">CEO Admin</option>
                <option value="operations">Operations</option>
                <option value="brand">Brand Portal</option>
                <option value="talent">Talent Host</option>
                <option value="moderator">Trợ Lý Vận Hành</option>
              </select>
            </div>

            <button
              onClick={openCreateModal}
              className="w-full sm:w-auto px-4 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl text-xs font-extrabold shadow-lg shadow-[var(--accent)]/30 transition-all flex items-center justify-center gap-2"
            >
              <UserPlus className="w-4 h-4" />
              <span>Thêm Tài Khoản Mới</span>
            </button>
          </div>

          {/* User List Table / Cards */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl text-[var(--text)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surface-base)]/80 text-[var(--text-muted)] font-extrabold uppercase border-b border-[var(--border)] text-[10px]">
                  <tr>
                    <th className="p-4">Người Dùng System</th>
                    <th className="p-4">Role Phân Quyền</th>
                    <th className="p-4">Gán Thực Thể (Brand / Talent)</th>
                    <th className="p-4">Trạng Thái</th>
                    <th className="p-4">Đăng Nhập Cuối</th>
                    <th className="p-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]/80">
                  {filteredUsers.map((u) => {
                    const assignedBrand = brands.find((b) => b.id === u.assignedBrandId);
                    const assignedTalent = talents.find((t) => t.id === u.assignedTalentId);
                    const customOverridesCount = Object.keys(u.customPermissionOverrides || {}).length;

                    return (
                      <tr key={u.id} className="hover:bg-[var(--surface-elevated)]/40 transition-colors">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {u.avatar ? (
                              <img
                                src={u.avatar}
                                alt={u.name}
                                className="w-9 h-9 rounded-full object-cover border border-[var(--border)]"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] flex items-center justify-center text-xs font-bold uppercase">
                                {u.name.charAt(0) || "?"}
                              </div>
                            )}
                            <div>
                              <div className="font-bold text-[var(--text)] text-sm flex items-center gap-2">
                                <span>{u.name}</span>
                                {customOverridesCount > 0 && (
                                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black px-1.5 py-0.5 rounded">
                                    ⚡ {customOverridesCount} Override
                                  </span>
                                )}
                              </div>
                              <span className="text-[var(--text-muted)] text-[11px] block">{u.email}</span>
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border ${getRoleBadgeStyle(
                              u.role
                            )}`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                          <span className="text-[var(--text-muted)] text-[11px] block mt-1">{u.customRoleTitle}</span>
                        </td>

                        <td className="p-4">
                          {u.role === "brand" && assignedBrand ? (
                            <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 w-fit">
                              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{assignedBrand.name}</span>
                            </span>
                          ) : u.role === "talent" && assignedTalent ? (
                            <span className="bg-amber-950/60 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 w-fit">
                              <Radio className="w-3.5 h-3.5 text-amber-400" />
                              <span>{assignedTalent.name}</span>
                            </span>
                          ) : u.role === "moderator" ? (
                            <span className="bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 w-fit">
                              <Radio className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{countModeratorSessions(u.id)} ca đã phụ trách</span>
                            </span>
                          ) : (
                            <span className="text-[var(--text-faint)] text-[11px]">Toàn Cơ Quan (Agency-wide)</span>
                          )}
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.status === "Active"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>

                        <td className="p-4 text-[var(--text-muted)] text-[11px]">{u.lastLogin}</td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Custom Permission Overrides Button */}
                            <button
                              onClick={() => setPermissionOverrideUser(u)}
                              className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-all text-xs flex items-center gap-1"
                              title="Override quyền riêng cho người dùng này"
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline text-[10px] font-bold">Custom Extra</span>
                            </button>

                            {/* Edit Button */}
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-all"
                              title="Chỉnh sửa tài khoản"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {/* Delete Button */}
                            {u.role !== "ceo" && u.role !== "admin" && (
                              <button
                                onClick={() => {
                                  if (window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${u.name}" (${u.email})?`)) {
                                    onDeleteUser(u.id);
                                  }
                                }}
                                className="p-1.5 bg-[var(--surface-elevated)] hover:bg-red-900/50 text-[var(--text-faint)] hover:text-red-400 rounded-lg transition-all"
                                title="Xóa tài khoản"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AUDIT LOGS */}
      {activeTab === "audit" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-[var(--text)] space-y-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[var(--accent-text)]" />
              <h3 className="font-extrabold text-base text-[var(--text)]">
                Nhật Ký An Ninh & Thay Đổi Phân Quyền (Audit Trails)
              </h3>
            </div>
            <span className="text-xs text-[var(--text-muted)] font-mono">Real-time Encrypted Log</span>
          </div>

          <div className="space-y-3">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[var(--surface-base)] p-4 rounded-xl border border-[var(--border)]/80 flex items-start justify-between gap-4 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text)]">{log.action}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-black ${
                        log.category === "Permission Change"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : log.category === "Security Alert"
                          ? "bg-red-500/20 text-red-300 border border-red-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {log.category}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)] text-[11px]">{log.details}</p>
                  <p className="text-[var(--text-faint)] text-[10px]">Thực hiện bởi: {log.performedBy}</p>
                </div>
                <span className="text-[var(--text-faint)] text-[11px] font-mono shrink-0">{log.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: Create / Edit User */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-lg rounded-2xl p-6 text-[var(--text)] shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--border)] shrink-0">
              <h3 className="font-black text-lg text-[var(--text)] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[var(--accent-text)]" />
                {editingUser ? "Chỉnh Sửa Tài Khoản Người Dùng" : "Tạo Tài Khoản Người Dùng Mới"}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs overflow-y-auto">
              <div className="space-y-1">
                <label className="text-[var(--text-muted)] font-bold block">Họ và Tên (*)</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[var(--text-muted)] font-bold block">Email Đăng Nhập (*)</label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  placeholder="user@liveops.ai"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {editingUser && (
                  <p className="text-[10px] text-[var(--text-faint)]">
                    Không thể đổi email đăng nhập tại đây — email gắn với tài khoản Supabase Auth thật.
                  </p>
                )}
                {!editingUser && (
                  <p className="text-[10px] text-[var(--text-faint)]">
                    Hệ thống sẽ gửi email mời tạo mật khẩu đến địa chỉ này.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[var(--text-muted)] font-bold block">Role Phân Quyền (*)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-bold"
                  >
                    <option value="admin">Admin (Quản Trị Viên Hệ Thống)</option>
                    <option value="ceo">CEO Admin</option>
                    <option value="operations">Operations Manager</option>
                    <option value="brand">Brand Client Portal</option>
                    <option value="talent">Talent Host Portal</option>
                    <option value="moderator">Trợ Lý Vận Hành (Moderator)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[var(--text-muted)] font-bold block">Trạng Thái (*)</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as "Active" | "Inactive" })
                    }
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-bold"
                  >
                    <option value="Active">Active (Hoạt động)</option>
                    <option value="Inactive">Inactive (Tạm khóa)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[var(--text-muted)] font-bold block">Chức Danh Custom (Job Title)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Key Account Manager (Brand Lead)"
                  value={formData.customRoleTitle}
                  onChange={(e) => setFormData({ ...formData, customRoleTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Conditional Brand selection if role is brand */}
              {formData.role === "brand" && (
                <div className="space-y-1 p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-xl">
                  <label className="text-emerald-300 font-bold block">
                    Gán Khách Hàng Brand Quản Lý (*)
                  </label>
                  <select
                    required
                    value={formData.assignedBrandId}
                    onChange={(e) => setFormData({ ...formData, assignedBrandId: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    <option value="">-- Chọn Nhãn Hàng --</option>
                    {brands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.industry})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Conditional Talent selection if role is talent */}
              {formData.role === "talent" && (
                <div className="space-y-1 p-3 bg-amber-950/40 border border-amber-500/30 rounded-xl">
                  <label className="text-amber-300 font-bold block">
                    Gán Profile Talent Host (*)
                  </label>
                  <select
                    required
                    value={formData.assignedTalentId}
                    onChange={(e) => setFormData({ ...formData, assignedTalentId: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500 font-bold"
                  >
                    <option value="">-- Chọn Host Livestream --</option>
                    {talents.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-3 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingUser}
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] rounded-xl font-bold disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-extrabold shadow-lg shadow-[var(--accent)]/30 disabled:opacity-60"
                >
                  {isSavingUser ? "Đang xử lý..." : editingUser ? "Lưu Cập Nhật" : "Gửi Lời Mời"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Custom Permission Override per User */}
      {permissionOverrideUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] w-full max-w-2xl rounded-2xl p-6 text-[var(--text)] shadow-2xl space-y-5 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
              <div className="flex items-center gap-3">
                {permissionOverrideUser.avatar ? (
                  <img
                    src={permissionOverrideUser.avatar}
                    alt={permissionOverrideUser.name}
                    className="w-10 h-10 rounded-full object-cover border border-[var(--border)]"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full border border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--text-muted)] flex items-center justify-center text-sm font-bold uppercase">
                    {permissionOverrideUser.name.charAt(0) || "?"}
                  </div>
                )}
                <div>
                  <h3 className="font-black text-base text-[var(--text)]">
                    Custom Permission Extra: {permissionOverrideUser.name}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Ghi đè quyền đặc biệt cho tài khoản này (Role gốc:{" "}
                    <span className="text-[var(--accent-text)] font-bold uppercase">
                      {permissionOverrideUser.role}
                    </span>
                    )
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPermissionOverrideUser(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin text-xs">
              {permissionDefinitions.map((def) => {
                const roleDefault = rolePermissions[permissionOverrideUser.role][def.key];
                const userOverride = permissionOverrideUser.customPermissionOverrides?.[def.key];
                const activeVal = userOverride !== undefined ? userOverride : roleDefault;
                const isOverridden = userOverride !== undefined;

                return (
                  <div
                    key={def.key}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isOverridden
                        ? "bg-amber-950/30 border-amber-500/50"
                        : "bg-[var(--surface-base)] border-[var(--border)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)] text-xs">{def.label}</span>
                        {isOverridden && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black px-1.5 py-0.5 rounded">
                            OVERRIDDEN
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">{def.description}</p>
                      <span className="text-[10px] text-[var(--text-faint)] font-mono">
                        Quyền mặc định của Role: {roleDefault ? "ALLOWED" : "DENIED"}
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        handleToggleUserPermissionOverride(permissionOverrideUser.id, def.key)
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        activeVal
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]"
                      }`}
                    >
                      {activeVal ? "✓ ALLOWED" : "✕ DENIED"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[var(--border)] flex justify-end">
              <button
                onClick={() => setPermissionOverrideUser(null)}
                className="px-5 py-2 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-xl font-bold shadow-lg"
              >
                Xong
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
