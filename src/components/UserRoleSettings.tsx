import React, { useState, useMemo } from "react";
import { AUDIT_LOG_LIMIT } from "../lib/db/auditLogs";
import { UserRole, PermissionKey, PermissionDefinition, RolePermissionsMap, SystemUser, AuditLogEntry, Brand, Talent, LiveSession } from "../types";
import { PERMISSION_DEFINITIONS as permissionDefinitions } from "../lib/permissionDefinitions";
import { ShieldCheck, UserPlus, Users, Key, Lock, Unlock, Check, X, Search, Sliders, History, Trash2, Edit2, Radio, Building2, Zap, BarChart3, KeyRound, MailPlus } from "lucide-react";
import { useConfirm } from "../hooks/useConfirm";
import { PageHeader } from "./common/PageHeader";
import { TabUsagePanel } from "./TabUsagePanel";
import { accountStatusLabel } from "../lib/statusLabels";
import { talentRoleLabel } from "../lib/talentName";
import { TalentAccountGrants } from "./TalentAccountGrants";
import { CredentialDialog, IssuedCredential } from "./CredentialDialog";
import { isAliasEmail, loginLabel } from "../lib/loginName";
import type { GrantResult } from "../lib/talentAccounts";

export interface NewUserPayload {
  name: string;
  email: string;
  role: UserRole;
  customRoleTitle: string;
  assignedBrandId?: string;
  assignedTalentId?: string;
  newTalentProfile?: {
    name: string;
    phone: string;
    role: Talent["role"];
    gender: string;
    niches: string[];
  };
}

interface UserRoleSettingsProps {
  currentRole: UserRole;
  currentUserId: string;
  rolePermissions: RolePermissionsMap;
  onUpdateRolePermissions: (newMap: RolePermissionsMap) => void;
  users: SystemUser[];
  onAddUser: (newUser: NewUserPayload) => Promise<void>;
  onUpdateUser: (updatedUser: SystemUser) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  auditLogs: AuditLogEntry[];
  brands: Brand[];
  talents: Talent[];
  sessions: LiveSession[];
  /** Cấp tài khoản cho hồ sơ talent có sẵn — trả mật khẩu tạm (một lần). */
  onGrantTalentAccounts: (items: { talentId: string; email: string }[], onProgress?: (done: number) => void) => Promise<GrantResult[]>;
  /** Thêm email thật cho tài khoản đang đăng nhập bằng tên (lib/loginName.ts). */
  onSetUserEmail: (userId: string, email: string) => Promise<void>;
  /** Đặt lại mật khẩu — trả mật khẩu tạm (một lần). */
  onResetUserPassword: (userId: string) => Promise<string>;
}

// Danh sách role app thật sự hiển thị trong Ma Trận. Cố ý KHÔNG suy từ Object.keys(rolePermissions)
// (tức các dòng có trong bảng `role_permissions` dưới DB): hai thứ đó lệch nhau mỗi khi một role bị
// gỡ khỏi app mà dòng dưới DB chưa kịp dọn — đúng tình huống của 'moderator' 2026-09-22, lưới vẽ 5
// thẻ trong khi nhãn tab ghi "Ma Trận Role (6)". Nguồn sự thật cho MÀN HÌNH là danh sách này.
// Nhãn tiếng Việt cho loại nhật ký (giá trị DB giữ tiếng Anh).
const AUDIT_CATEGORY_LABEL: Record<string, string> = {
  "Permission Change": "Đổi quyền",
  "Role Update": "Đổi vai trò",
  "User Status": "Trạng thái tài khoản",
  "Security Alert": "Cảnh báo"
};

const MATRIX_ROLES: UserRole[] = ["admin", "ceo", "operations", "brand", "talent"];

// Group permissions by category. Không còn filter nào ở đây: từ 2026-09-22 mọi PermissionKey
// đều gate đúng một nav item thật (xem bất biến ở types.ts), nên lưới Ma Trận hiện đúng bằng
// danh sách key — trước đây view_financials/manage_finance_hr bị lọc khỏi lưới nhưng vẫn nằm
// trong tổng số đếm ở dưới, làm nhãn ghi "x/12" trong khi chỉ vẽ 10 ô.
const groupedPermissions: Record<string, PermissionDefinition[]> = {};
for (const def of permissionDefinitions) (groupedPermissions[def.category] ??= []).push(def);

export const UserRoleSettings: React.FC<UserRoleSettingsProps> = ({
  currentRole,
  currentUserId,
  rolePermissions,
  onUpdateRolePermissions,
  users,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  auditLogs,
  brands,
  talents,
  sessions,
  onGrantTalentAccounts,
  onSetUserEmail,
  onResetUserPassword
}) => {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<"roles" | "users" | "audit" | "usage">("roles");
  const canSeeUsage = currentRole === "ceo" || currentRole === "admin";
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

  // Tạo talent ở modal này = người MỚI: server tự tạo hồ sơ Talent Pool + link 2 chiều. Người đã có hồ sơ (34+ hồ sơ
  // thật nạp 19/09 không kèm tài khoản) thì cấp ở khối TalentAccountGrants phía trên danh sách — giữ nguyên ca cũ.
  const [newTalentForm, setNewTalentForm] = useState<{
    phone: string;
    role: Talent["role"];
    gender: string;
    niches: string;
  }>({ phone: "", role: "Host", gender: "Nữ", niches: "" });

  // Thêm email (tài khoản đăng nhập bằng tên) + đặt lại mật khẩu — chỉ ceo/admin, không áp cho chính mình, CEO không đụng Admin.
  const canManageAccounts = currentRole === "ceo" || currentRole === "admin";
  const canManage = (u: SystemUser) => canManageAccounts && u.id !== currentUserId && (u.role !== "admin" || currentRole === "admin");
  const [emailFor, setEmailFor] = useState<SystemUser | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [savingEmail, setSavingEmail] = useState(false);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const saveEmail = async () => {
    if (!emailFor) return;
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || isAliasEmail(email)) {
      setEmailError("Email chưa đúng dạng (vd: ten@gmail.com).");
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      await onSetUserEmail(emailFor.id, email);
      setEmailFor(null);
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Không đổi được email.");
    } finally {
      setSavingEmail(false);
    }
  };
  const resetPassword = async (u: SystemUser) => {
    if (!(await confirm(`Đặt lại mật khẩu cho "${u.name}"? Mật khẩu hiện tại hết hiệu lực ngay; bạn gửi mật khẩu tạm mới cho họ.`))) return;
    try {
      const password = await onResetUserPassword(u.id);
      setIssued({ name: u.name, email: u.email, password, kind: "reset" });
    } catch {
      // App.tsx đã hiện lỗi.
    }
  };

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
    const newEffectiveValue = currentOverride === undefined ? !currentRoleDefault : currentRoleDefault;

    // FIX L6 (audit 2026-08-21): Ma Trận Phân Quyền đã chặn tắt manage_users_permissions cho
    // role ceo/admin, nhưng override riêng-từng-user (đè lên role default, xem App.tsx hasPermission)
    // không có chặn tương tự — chính người đang đăng nhập có thể tự tắt quyền này cho tài khoản
    // mình, biến mất khỏi menu Phân Quyền, không còn cách nào tự khôi phục qua UI nếu không còn
    // ceo/admin nào khác. Chặn đúng như đã làm ở cấp role.
    if (userId === currentUserId && permKey === "manage_users_permissions" && !newEffectiveValue) {
      return;
    }

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
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_users_permissions: true
      };
    } else if (role === "ceo") {
      preset = {
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_users_permissions: true
      };
    } else if (role === "operations") {
      preset = {
        manage_sessions: true,
        manage_calendar: true,
        manage_talents: true,
        manage_studios_gear: true,
        manage_crm_projects: true,
        manage_tiktok_api: true,
        manage_users_permissions: false
      };
    } else if (role === "brand") {
      preset = {
        manage_sessions: false,
        manage_calendar: false,
        manage_talents: false,
        manage_studios_gear: false,
        manage_crm_projects: false,
        manage_tiktok_api: false,
        manage_users_permissions: false
      };
    } else {
      // talent — hẹp nhất: 3 tab của chính mình (Ca Của Tôi / Đăng Ký Ca / Hồ Sơ) đều không gate
      // bằng PermissionKey nào, nên không bật quyền quản lý/ghi nào.
      preset = {
        manage_sessions: false,
        manage_calendar: false,
        manage_talents: false,
        manage_studios_gear: false,
        manage_crm_projects: false,
        manage_tiktok_api: false,
        manage_users_permissions: false
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
        const isNewTalent = formData.role === "talent";
        await onAddUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          customRoleTitle: formData.customRoleTitle || getRoleDefaultTitle(formData.role),
          assignedBrandId: formData.role === "brand" ? formData.assignedBrandId : undefined,
          newTalentProfile: isNewTalent
            ? {
                name: formData.name,
                phone: newTalentForm.phone,
                role: newTalentForm.role,
                gender: newTalentForm.gender,
                niches: newTalentForm.niches.split(",").map((s) => s.trim()).filter(Boolean)
              }
            : undefined
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
    setNewTalentForm({ phone: "", role: "Host", gender: "Nữ", niches: "" });
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
    }
  };

  const getRoleDefaultTitle = (role: UserRole) => {
    switch (role) {
      case "admin":
        return "Quản trị hệ thống";
      case "ceo":
        return "CEO";
      case "operations":
        return "Vận hành";
      case "brand":
        return "Đại diện brand";
      case "talent":
        return "Host / Trợ live";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner — 10/10: dùng PageHeader chung (trước là bản chép tay p-6 cao hơn các trang khác). */}
      <PageHeader
        icon={ShieldCheck}
        title="Phân Quyền & Role"
        description={`Mỗi vai trò (${MATRIX_ROLES.length} vai trò) được mở những màn nào, quyền riêng cho từng tài khoản, nhật ký thay đổi quyền và số lượt mở từng màn.`}
        actions={
        <div className="flex items-center bg-[var(--surface-base)] p-1.5 rounded-xl border border-[var(--border)] text-xs font-bold gap-1 max-w-full overflow-x-auto whitespace-nowrap shrink-0">
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeTab === "roles"
                ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 font-black"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Quyền theo vai trò</span>
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
            <span>Tài khoản ({users.length})</span>
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
            <span>Nhật ký ({auditLogs.length >= AUDIT_LOG_LIMIT ? `${AUDIT_LOG_LIMIT} gần nhất` : auditLogs.length})</span>
          </button>

          {canSeeUsage && (
            <button
              onClick={() => setActiveTab("usage")}
              className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
                activeTab === "usage"
                  ? "bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/30 font-black"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]"
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>Lượt Mở Tab</span>
            </button>
          )}
        </div>
        }
      />

      {/* TAB 1: ROLE PERMISSIONS MATRIX */}
      {activeTab === "roles" && (
        <div className="space-y-6">
          {/* Role selector selector cards */}
          {/* 10/10: 5 vai trò = 5 cột ở xl (trước xl:grid-cols-6 chừa 1 ô trống). Điện thoại 2 cột, ẩn dòng mô tả —
              1 cột thì 5 thẻ cao ~750px trước khi tới công tắc quyền. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
            {MATRIX_ROLES.map((roleKey) => {
              const isSelected = selectedRole === roleKey;
              const permsMap = rolePermissions[roleKey];
              // Chỉ đếm quyền CÓ ĐỊNH NGHĨA trong app. Bảng `role_permissions` dưới DB còn sót key
              // của module đã xoá (`generate_scripts` — 0042, `view_executive_brief` — Dashboard gỡ
              // 2026-09-13), đếm thẳng Object.values ra "13/12 Permissions" (audit 2026-09-21).
              // Migration 0100 dọn DB; chỗ này vẫn giữ cách đếm theo định nghĩa để lần sau lệch nữa
              // thì hiện sai lệch chứ không hiện số vô lý.
              const enabledCount = permissionDefinitions.filter((def) => permsMap?.[def.key]).length;
              const totalCount = permissionDefinitions.length;

              return (
                <button
                  key={roleKey}
                  onClick={() => setSelectedRole(roleKey)}
                  className={`p-3 sm:p-4 rounded-2xl border text-left transition-all relative overflow-hidden space-y-3 min-w-0 ${
                    isSelected
                      ? "bg-[var(--surface)] border-[var(--accent)] ring-2 ring-[var(--accent)]/20 shadow-xl"
                      : "bg-[var(--surface)]/50 border-[var(--border)] hover:border-[var(--border)] hover:bg-[var(--surface)]/80"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span
                      className={`text-[11px] font-black uppercase px-2 sm:px-2.5 py-1 rounded-lg border truncate ${getRoleBadgeStyle(
                        roleKey
                      )}`}
                    >
                      {roleKey.toUpperCase()}
                    </span>
                    <span className="text-xs font-mono font-bold text-[var(--text-muted)] whitespace-nowrap">
                      {enabledCount}/{totalCount}<span className="hidden sm:inline"> quyền</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="font-extrabold text-[var(--text)] text-sm sm:text-base">
                      {roleKey === "admin" && "Quản trị hệ thống"}
                      {roleKey === "ceo" && "CEO"}
                      {roleKey === "operations" && "Vận hành"}
                      {roleKey === "brand" && "Brand (khách hàng)"}
                      {roleKey === "talent" && "Host / Trợ live"}
                    </h3>
                    <p className="hidden sm:block text-[11px] text-[var(--text-muted)] line-clamp-2 mt-1">
                      {roleKey === "admin" && "Mọi thứ CEO làm được, thêm AI Training Center (chỉ admin)."}
                      {roleKey === "ceo" && "Toàn bộ màn agency, Finance & P&L, CRM và phân quyền."}
                      {roleKey === "operations" && "Lập kế hoạch tháng, xếp và chốt người cho ca, up số liệu, đối soát, làm report. Không thấy Finance."}
                      {roleKey === "brand" && "Chỉ thấy workspace của brand mình: lịch, sổ ca, report tháng đã phát hành, cam kết, kế hoạch tháng sau."}
                      {roleKey === "talent" && "Ca của mình, đăng ký ca, nộp report ca và hồ sơ cá nhân."}
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
                    Quyền của vai trò:{" "}
                    <span className="text-[var(--accent-text)] uppercase">{selectedRole}</span>
                  </h3>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Mỗi công tắc mở hoặc khoá một màn trong menu. Đổi ở đây áp dụng ngay cho mọi tài khoản thuộc vai trò này.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResetRoleToDefault(selectedRole)}
                  className="px-3.5 py-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] rounded-xl text-xs font-bold border border-[var(--border)] transition-all flex items-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5 text-[var(--accent-text)]" />
                  <span>Về mặc định</span>
                </button>
              </div>
            </div>

            {/* Permission Toggles grouped by Category — 10/10: một lưới chung, tên nhóm thành dòng nhỏ
                trên mỗi thẻ. Trước đó mỗi nhóm một thanh tiêu đề + một hàng riêng, 3/4 nhóm chỉ có 1–2
                công tắc nên 2/3 hàng bỏ trống và trang dài gấp đôi. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {(Object.entries(groupedPermissions) as [string, PermissionDefinition[]][]).flatMap(([category, defs]) =>
                    defs.map((def) => {
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
                          <div className="space-y-1 min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-wider text-[var(--text-faint)]">{category}</p>
                            <div className="flex items-center gap-2">
                              {isAllowed ? (
                                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5 text-[var(--text-faint)]" />
                              )}
                              <span className="font-bold text-xs text-[var(--text)]">{def.label}</span>
                            </div>
                            <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
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
                    })
              )}
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
                <option value="all">Mọi vai trò</option>
                <option value="admin">Admin</option>
                <option value="ceo">CEO</option>
                <option value="operations">Vận hành</option>
                <option value="brand">Brand</option>
                <option value="talent">Host / Trợ live</option>
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

          {(currentRole === "ceo" || currentRole === "admin") && (
            <TalentAccountGrants talents={talents} users={users} sessions={sessions} onGrant={onGrantTalentAccounts} />
          )}

          {/* User List Table / Cards */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-xl text-[var(--text)]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[var(--surface-base)]/80 text-[var(--text-muted)] font-extrabold uppercase border-b border-[var(--border)] text-[11px]">
                  <tr>
                    <th className="p-4">Người dùng</th>
                    <th className="p-4">Vai trò</th>
                    <th className="p-4">Gắn với</th>
                    <th className="p-4">Trạng Thái</th>
                    <th className="p-4 text-right"></th>
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
                                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-black px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                                    <Zap className="w-2.5 h-2.5" /> {customOverridesCount} Override
                                  </span>
                                )}
                              </div>
                              {isAliasEmail(u.email) ? (
                                <span className="text-[11px] block text-[var(--text-muted)]">
                                  Tên đăng nhập <span className="font-mono font-bold">{loginLabel(u.email)}</span> ·{" "}
                                  <span className="text-amber-500 font-bold">chưa có email</span>
                                  {canManage(u) && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEmailFor(u);
                                        setNewEmail("");
                                        setEmailError(null);
                                      }}
                                      className="ml-2 inline-flex items-center gap-1 text-[var(--accent-text)] font-bold hover:underline"
                                    >
                                      <MailPlus className="w-3 h-3" /> Thêm email
                                    </button>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[var(--text-muted)] text-[11px] block">{u.email}</span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase border ${getRoleBadgeStyle(
                              u.role
                            )}`}
                          >
                            {u.role.toUpperCase()}
                          </span>
                          <span className="text-[var(--text-muted)] text-[11px] block mt-1">{u.customRoleTitle}</span>
                        </td>

                        <td className="p-4">
                          {u.role === "brand" && assignedBrand ? (
                            <span className="bg-emerald-950/85 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 w-fit">
                              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{assignedBrand.name}</span>
                            </span>
                          ) : u.role === "talent" && assignedTalent ? (
                            <span className="bg-amber-950/85 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1.5 w-fit">
                              <Radio className="w-3.5 h-3.5 text-amber-400" />
                              <span>{assignedTalent.name}</span>
                            </span>
                          ) : (
                            <span className="text-[var(--text-faint)] text-[11px]">Toàn agency</span>
                          )}
                        </td>

                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              u.status === "Active"
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"
                            }`}
                          >
                            {accountStatusLabel(u.status)}
                          </span>
                        </td>

                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Custom Permission Overrides Button */}
                            <button
                              onClick={() => setPermissionOverrideUser(u)}
                              className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-all text-xs flex items-center gap-1"
                              title="Quyền riêng cho tài khoản này"
                            >
                              <Key className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline text-[11px] font-bold">Quyền riêng</span>
                            </button>

                            {/* Edit Button — tài khoản Admin chỉ Admin sửa (0136 chặn ở DB) */}
                            {(u.role !== "admin" || currentRole === "admin") && (
                            <button
                              onClick={() => openEditModal(u)}
                              className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-all"
                              title="Chỉnh sửa tài khoản"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            )}

                            {canManage(u) && (
                              <button
                                onClick={() => resetPassword(u)}
                                className="p-1.5 bg-[var(--surface-elevated)] hover:bg-[var(--surface-hover)] text-[var(--accent-text)] rounded-lg transition-all text-xs flex items-center gap-1"
                                title="Đặt lại mật khẩu (mật khẩu tạm mới)"
                                aria-label={`Đặt lại mật khẩu cho ${u.name}`}
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                                <span className="hidden lg:inline text-[11px] font-bold">Đặt lại MK</span>
                              </button>
                            )}

                            {/* Delete Button */}
                            {u.role !== "ceo" && u.role !== "admin" && (
                              <button
                                onClick={async () => {
                                  if (await confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${u.name}" (${loginLabel(u.email)})?`, { danger: true })) {
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
      {activeTab === "usage" && canSeeUsage && <TabUsagePanel />}

      {activeTab === "audit" && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 text-[var(--text)] space-y-4 shadow-xl">
          <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-[var(--accent-text)]" />
              <h3 className="font-extrabold text-base text-[var(--text)]">
                Nhật ký thay đổi tài khoản và quyền
              </h3>
            </div>
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
                      className={`px-2 py-0.5 rounded text-[11px] font-black ${
                        log.category === "Permission Change"
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : log.category === "Security Alert"
                          ? "bg-red-500/20 text-red-300 border border-red-500/30"
                          : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                      }`}
                    >
                      {AUDIT_CATEGORY_LABEL[log.category] ?? log.category}
                    </span>
                  </div>
                  <p className="text-[var(--text-muted)] text-[11px]">{log.details}</p>
                  <p className="text-[var(--text-faint)] text-[11px]">Thực hiện bởi: {log.performedBy}</p>
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
                {editingUser ? "Sửa tài khoản" : "Tạo tài khoản"}
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
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
                  placeholder="Họ và tên"
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
                  placeholder="email@congty.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {editingUser && (
                  <p className="text-[11px] text-[var(--text-faint)]">
                    Không thể đổi email đăng nhập tại đây — email là tên đăng nhập của tài khoản.
                  </p>
                )}
                {!editingUser && (
                  <p className="text-[11px] text-[var(--text-faint)]">
                    Hệ thống sẽ gửi email mời tạo mật khẩu đến địa chỉ này.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[var(--text-muted)] font-bold block">Vai trò (*)</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)] font-bold"
                  >
                    {(currentRole === "admin" || formData.role === "admin") && <option value="admin">Quản trị hệ thống</option>}
                    <option value="ceo">CEO</option>
                    <option value="operations">Vận hành</option>
                    <option value="brand">Brand (khách hàng)</option>
                    <option value="talent">Host / Trợ live</option>
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
                    <option value="Active">Hoạt động</option>
                    <option value="Inactive">Tạm khoá</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[var(--text-muted)] font-bold block">Chức danh hiển thị</label>
                <input
                  type="text"
                  placeholder="Ví dụ: KAM, Trưởng ca"
                  value={formData.customRoleTitle}
                  onChange={(e) => setFormData({ ...formData, customRoleTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Conditional Brand selection if role is brand */}
              {formData.role === "brand" && (
                <div className="space-y-1 p-3 bg-emerald-950/80 border border-emerald-500/30 rounded-xl">
                  <label className="text-emerald-300 font-bold block">
                    Gán Khách Hàng Brand Quản Lý (*)
                  </label>
                  <select
                    required
                    value={formData.assignedBrandId}
                    onChange={(e) => setFormData({ ...formData, assignedBrandId: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    <option value="">Chọn brand</option>
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
                <div className="space-y-2 p-3 bg-amber-950/80 border border-amber-500/30 rounded-xl">
                  {editingUser ? (
                    <div>
                      <label className="text-amber-300 font-bold block mb-1">Hồ sơ talent của tài khoản này (*)</label>
                      <select
                        required
                        value={formData.assignedTalentId}
                        onChange={(e) => setFormData({ ...formData, assignedTalentId: e.target.value })}
                        className="w-full px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500 font-bold"
                      >
                        <option value="">Chọn hồ sơ</option>
                        {talents.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({talentRoleLabel(t.role)})
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-amber-300/80">
                        Chỉ dành cho người MỚI chưa có hồ sơ: hệ thống tạo hồ sơ Talent Pool tên "{formData.name || "chưa nhập"}" và gắn tài khoản này.
                        Người đã đứng ca rồi thì đóng lại, cấp ở khối "Host / trợ chưa có tài khoản" — tạo ở đây sẽ ra hồ sơ trùng, không thấy ca cũ.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Số điện thoại"
                          value={newTalentForm.phone}
                          onChange={(e) => setNewTalentForm({ ...newTalentForm, phone: e.target.value })}
                          className="px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500"
                        />
                        <select
                          value={newTalentForm.role}
                          onChange={(e) => setNewTalentForm({ ...newTalentForm, role: e.target.value as Talent["role"] })}
                          className="px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500"
                        >
                          <option value="Host">Host</option>
<option value="Assistant">Trợ live (Assistant)</option>
                        </select>
                        <select
                          value={newTalentForm.gender}
                          onChange={(e) => setNewTalentForm({ ...newTalentForm, gender: e.target.value })}
                          className="px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500"
                        >
                          <option value="Nữ">Nữ</option>
                          <option value="Nam">Nam</option>
                          <option value="Khác">Khác</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Ngành hàng (phân cách bằng dấu phẩy)"
                          value={newTalentForm.niches}
                          onChange={(e) => setNewTalentForm({ ...newTalentForm, niches: e.target.value })}
                          className="px-3 py-2 bg-[var(--surface-base)] rounded-xl border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-amber-500"
                        />
                      </div>
                    </div>
                  )}
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
                className="p-1.5 -m-1.5 rounded text-[var(--text-muted)] hover:text-[var(--text)]"
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
                const isSelfManagePermLock =
                  permissionOverrideUser.id === currentUserId && def.key === "manage_users_permissions" && activeVal;

                return (
                  <div
                    key={def.key}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                      isOverridden
                        ? "bg-amber-950/80 border-amber-500/50"
                        : "bg-[var(--surface-base)] border-[var(--border)]"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text)] text-xs">{def.label}</span>
                        {isOverridden && (
                          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black px-1.5 py-0.5 rounded">
                            QUYỀN RIÊNG
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">{def.description}</p>
                      <span className="text-[11px] text-[var(--text-faint)] font-mono">
                        Mặc định theo vai trò: {roleDefault ? "được mở" : "bị khoá"}
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        !isSelfManagePermLock && handleToggleUserPermissionOverride(permissionOverrideUser.id, def.key)
                      }
                      disabled={isSelfManagePermLock}
                      title={isSelfManagePermLock ? "Không thể tự tắt quyền Phân Quyền của chính tài khoản đang đăng nhập" : undefined}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 ${
                        isSelfManagePermLock
                          ? "bg-emerald-600/50 text-white/70 border-emerald-500/50 cursor-not-allowed"
                          : activeVal
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-[var(--surface-elevated)] text-[var(--text-muted)] border-[var(--border)]"
                      }`}
                    >
                      {activeVal ? (
                        <><Check className="w-3.5 h-3.5" /> Được mở</>
                      ) : (
                        <><X className="w-3.5 h-3.5" /> Bị khoá</>
                      )}
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

      {emailFor && (
        <div className="fixed inset-0 bg-[var(--surface)]/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-label={`Thêm email cho ${emailFor.name}`}
            onSubmit={(e) => {
              e.preventDefault();
              saveEmail();
            }}
            className="bg-[var(--surface)] w-full max-w-sm rounded-2xl shadow-2xl border border-[var(--border)] p-5 space-y-3 text-xs"
          >
            <h3 className="font-bold text-sm flex items-center gap-2">
              <MailPlus className="w-4 h-4 text-[var(--accent-text)]" />
              Thêm email cho {emailFor.name}
            </h3>
            <p className="text-[var(--text-muted)]">
              Từ lúc lưu, {emailFor.name} đăng nhập bằng email này (tên <span className="font-mono">{loginLabel(emailFor.email)}</span> hết dùng được), mật
              khẩu giữ nguyên, và tự dùng được "Quên mật khẩu".
            </p>
            <input
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoFocus
              aria-label="Email"
              placeholder="ten@gmail.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full min-h-10 px-3 bg-[var(--surface-base)] text-sm text-[var(--text)] rounded-xl border border-[var(--border)] focus:outline-none focus:border-[var(--accent)]"
            />
            {emailError && <p className="font-bold text-red-500">{emailError}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => setEmailFor(null)} className="flex-1 min-h-10 border border-[var(--border)] rounded-xl font-bold text-[var(--text-muted)]">
                Huỷ
              </button>
              <button type="submit" disabled={savingEmail} className="flex-1 min-h-10 bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-50 text-white rounded-xl font-bold">
                {savingEmail ? "Đang lưu…" : "Lưu email"}
              </button>
            </div>
          </form>
        </div>
      )}
      {issued && <CredentialDialog cred={issued} onClose={() => setIssued(null)} />}
    </div>
  );
};
