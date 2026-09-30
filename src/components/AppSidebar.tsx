import React from "react";
import { UserCog, X } from "lucide-react";
import { PermissionKey, SystemUser, UserRole } from "../types";
import { NavGroup } from "../lib/appNav";

// Sidebar trái: nhóm nav lọc theo quyền + thẻ người dùng ở chân. Tách khỏi App.tsx 2026-10-01 —
// 155 dòng JSX thuần trình bày, không giữ state nào của riêng nó. Chuyển nguyên văn, không đổi
// class hay hành vi; `onSelectTab` gói đúng cặp `setActiveTab` + đóng menu mobile mà bản cũ gọi
// lồng trong từng onClick.
interface AppSidebarProps {
  navGroups: NavGroup[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  checkPermission: (permKey: PermissionKey) => boolean;
  /** Ma Trận Phân Quyền chưa về: hiện khung xám thay vì menu rỗng (menu rỗng đọc như "mất quyền"). */
  permissionsLoading: boolean;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  activeUser: SystemUser;
  currentRole: UserRole;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  navGroups,
  activeTab,
  onSelectTab,
  checkPermission,
  permissionsLoading,
  sidebarCollapsed,
  mobileMenuOpen,
  onCloseMobileMenu,
  activeUser,
  currentRole
}) => (
  <aside
    className={`fixed inset-y-0 left-0 z-50 w-64 bg-[var(--surface)]/90 backdrop-blur-md border-r border-[var(--border)] flex flex-col transition-all duration-300 md:translate-x-0 ${
      mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
    } ${sidebarCollapsed ? "md:w-16" : "md:w-64"}`}
  >
    <div
      className={`border-b border-[var(--border)] flex items-center justify-between ${
        sidebarCollapsed ? "h-16 shrink-0 px-6 md:px-0 md:justify-center" : "h-16 shrink-0 px-6"
      }`}
    >
      <div className={sidebarCollapsed ? "md:hidden" : ""}>
        <h1 className="text-xl font-bold tracking-tighter text-[var(--accent-text)]">LIVEOPS AI</h1>
        <p className="text-[11px] uppercase tracking-widest text-[var(--text-faint)] font-semibold">
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
        onClick={() => onCloseMobileMenu()}
        className="p-1.5 -m-1.5 rounded md:hidden text-[var(--text-muted)] hover:text-[var(--text)]"
      >
        <X className="w-5 h-5" />
      </button>
    </div>

    <nav
      className={`flex-1 py-3 space-y-3 overflow-y-auto scrollbar-thin ${
        sidebarCollapsed ? "px-3 md:px-2" : "px-3"
      }`}
    >
      {/* Trong lúc Ma Trận Phân Quyền chưa về, checkPermission() nào cũng false nên MỌI nav
          item có `perm` biến mất — sidebar còn trơ 1-2 mục và trông như tài khoản vừa bị thu
          quyền. Hiện skeleton thay vì sự thật sai đó (cùng lý do với nhánh render bên dưới). */}
      {permissionsLoading
        ? Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`nav-skeleton-${i}`}
              className="mx-1 h-9 rounded-xl bg-[var(--surface-elevated)]/60 animate-pulse"
            />
          ))
        : navGroups.map((group) => {
        const visibleItems = group.items.filter(
          (item) => !item.perm || checkPermission(item.perm)
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={group.label} className="space-y-0.5">
            {group.label && (
              <p
                className={`px-3 text-[11px] font-bold uppercase tracking-widest text-[var(--text-faint)] ${
                  sidebarCollapsed ? "md:hidden" : ""
                }`}
              >
                {group.label}
              </p>
            )}
            {/* Ở chế độ thu gọn, nhóm nav chỉ còn được phân tách bằng 1 gạch mảnh. */}
            {sidebarCollapsed && <div className="hidden md:block mx-2 border-t border-[var(--border)]" />}
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  title={item.label}
                  className={`w-full flex items-center justify-between gap-2 py-2 rounded-xl transition-colors text-xs font-medium ${
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
                      <span className="bg-rose-600/20 text-rose-400 border border-rose-500/30 text-[11px] font-bold px-1.5 py-0.5 rounded uppercase">
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
    <div className={`mt-auto border-t border-[var(--border)] ${sidebarCollapsed ? "p-3 md:p-2" : "p-3"}`}>
      <button
        type="button"
        onClick={() => onSelectTab("account_settings")}
        title={`${activeUser.name} • ${currentRole} — Tài Khoản Của Tôi`}
        className={`w-full flex items-center gap-3 rounded-xl border transition-colors text-left ${
          activeTab === "account_settings"
            ? "bg-[var(--accent)]/10 border-[var(--accent)]/20"
            : "bg-[var(--surface-elevated)]/50 border-[var(--border)]/50 hover:bg-[var(--surface-elevated)] hover:border-[var(--text-faint)]"
        } ${sidebarCollapsed ? "p-2.5 md:p-2 md:justify-center" : "p-2.5"}`}
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
          {/* Chức danh đã chứa role ("Quản Trị Viên Hệ Thống (Admin)") — in thêm role phía trước là
              lặp "ADMIN • ... (ADMIN)". Chỉ rơi về tên role khi chưa đặt chức danh. */}
          <p className="text-[var(--accent-text)] text-[11px] uppercase font-extrabold truncate">
            {activeUser.customRoleTitle || currentRole}
          </p>
        </div>
        <UserCog
          className={`w-4 h-4 text-[var(--text-faint)] shrink-0 ${sidebarCollapsed ? "md:hidden" : ""}`}
        />
      </button>
    </div>
  </aside>
);
