import React, { useState } from "react";
import { UserRole, Brand, AppNotification } from "../types";
import { NotificationBell } from "./NotificationBell";
import { LogOut, Building2, ChevronDown, Check, Palette, HelpCircle } from "lucide-react";
import { useTheme, THEME_OPTIONS } from "../hooks/useTheme";
import { BrandLogo } from "./ui/BrandLogo";
import { profileOf } from "../lib/platforms/profiles";
import { PLATFORM_SCOPE_LABEL, type PlatformScope, type ReportPlatform } from "../lib/reportPlatform";

// Giai đoạn A (Workspace Agency ↔ Brand) — xem docs/WORKSPACE_HISTORY.md.
export type WorkspaceContext = { type: "agency" } | { type: "brand"; brandId: string };

interface HeaderProps {
  currentRole: UserRole;
  activeUserName?: string;
  activeUserTitle?: string;
  onSignOut?: () => void;
  // Switcher chỉ hiện cho role có quyền nhìn xuyên brand (ceo/admin/operations) —
  // role "brand" tự khoá vào workspace của họ ở App.tsx, không truyền props này xuống.
  workspace?: WorkspaceContext;
  onWorkspaceChange?: (next: WorkspaceContext) => void;
  /** Kênh brand × sàn (07/10): mỗi brand chạy hai sàn hiện thành "VERA · TikTok", "VERA · Shopee", "VERA · Tổng". */
  brandPlatforms?: Record<string, ReportPlatform[]>;
  platformScope?: PlatformScope;
  onPickChannel?: (brandId: string, scope: ReportPlatform) => void;
  /** false = role brand: không có mục Agency (chỉ chọn sàn của brand mình). */
  showAgency?: boolean;
  /** Workspace agency (07/10): sàn đang mở, null = "Chung" (lịch, nhân sự, talent, studio, CRM, finance, hệ thống). */
  agencyPlatform?: ReportPlatform | null;
  onPickAgency?: (platform: ReportPlatform | null) => void;
  brands?: Brand[];
  /** Mở "Từ điển và cách dùng" (GlossaryDialog). */
  onOpenHelp?: () => void;
  // Chuông thông báo (migration 0083). App giữ state qua useNotifications và quyết định bấm vào
  // thì nhảy tab nào — Header chỉ vẽ. Không truyền là không hiện chuông (màn chưa đăng nhập).
  notifications?: {
    items: AppNotification[];
    unreadCount: number;
    onMarkRead: (ids?: string[]) => void;
    onOpen: (n: AppNotification) => void;
  };
}

const WorkspaceSwitcher: React.FC<{
  workspace: WorkspaceContext;
  brands: Brand[];
  onChange: (next: WorkspaceContext) => void;
  brandPlatforms?: Record<string, ReportPlatform[]>;
  platformScope?: PlatformScope;
  onPickChannel?: (brandId: string, scope: ReportPlatform) => void;
  showAgency?: boolean;
  agencyPlatform?: ReportPlatform | null;
  onPickAgency?: (platform: ReportPlatform | null) => void;
}> = ({ workspace, brands, onChange, brandPlatforms, platformScope, onPickChannel, showAgency = true, agencyPlatform = null, onPickAgency }) => {
  const [open, setOpen] = useState(false);
  const currentBrand = workspace.type === "brand" ? brands.find((b) => b.id === workspace.brandId) : undefined;
  const currentPlatforms = currentBrand ? brandPlatforms?.[currentBrand.id] ?? [] : [];
  const label = workspace.type === "agency" ? "Agency (Toàn cảnh)" : `${currentBrand?.name ?? "Brand"}${currentPlatforms.length > 1 && platformScope ? ` · ${PLATFORM_SCOPE_LABEL[platformScope]}` : ""}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-[var(--surface-elevated)]/80 hover:bg-[var(--surface-hover)] border border-[var(--border)]/60 px-3 py-1.5 rounded-full transition-colors"
      >
        {workspace.type === "agency" ? (
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <BrandLogo brand={currentBrand} size="xs" />
        )}
        {/* Màn điện thoại: "Agency (Toàn cảnh)" từng xuống 3 dòng (audit UX 2026-09-26) — rút còn "Agency". */}
        <span className="text-xs font-bold text-[var(--text)] whitespace-nowrap truncate max-w-[9rem] sm:max-w-none">
          {workspace.type === "agency" ? (
            <>
              Agency<span className="hidden sm:inline"> · {agencyPlatform ?? "Chung"}</span>
            </>
          ) : (
            label
          )}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 py-1.5 max-h-96 overflow-y-auto">
            {showAgency && (
              <>
                {/* Agency tách theo sàn (07/10): Chung = lịch + tài nguyên + tiền theo người; mỗi sàn có số liệu riêng. */}
                {([{ p: "TikTok" as const, hint: "Dashboard, Sổ Ca, Đối Soát, Hiệu Suất Host…" }, { p: "Shopee" as const, hint: "Dashboard, Sổ Ca, Đối Soát, Hiệu Suất Host…" }, { p: null, hint: "Lịch, Nhân sự ca, Talent, Studio, CRM, Finance" }] as const).map(({ p, hint }) => (
                  <button
                    key={p ?? "chung"}
                    onClick={() => {
                      if (onPickAgency) onPickAgency(p);
                      else onChange({ type: "agency" });
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)]/80 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="flex-1 text-left">
                      Agency · {p ?? "Chung"}
                      <span className="block text-[11px] font-normal text-[var(--text-faint)]">{hint}</span>
                    </span>
                    {workspace.type === "agency" && agencyPlatform === p && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </button>
                ))}
                <div className="border-t border-[var(--border)] my-1.5" />
              </>
            )}
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--text-faint)]">Brand</p>
            {brands.length === 0 && <p className="px-3 py-2 text-[11px] text-[var(--text-faint)]">Chưa có Brand nào.</p>}
            {brands.flatMap((b) => {
              const plats = brandPlatforms?.[b.id] ?? [];
              // Brand hai sàn: mỗi sàn là một workspace riêng (không có mục Tổng); brand một sàn giữ một mục như cũ.
              const channels: (ReportPlatform | null)[] = plats.length > 1 && onPickChannel ? plats : [null];
              return channels.map((ch) => {
                const active = workspace.type === "brand" && workspace.brandId === b.id && (ch === null || platformScope === ch);
                return (
                  <button
                    key={`${b.id}|${ch ?? ""}`}
                    onClick={() => {
                      if (ch === null || !onPickChannel) onChange({ type: "brand", brandId: b.id });
                      else onPickChannel(b.id, ch);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)]/80 transition-colors"
                  >
                    <BrandLogo brand={b} size="sm" />
                    <span className="flex-1 text-left truncate">
                      {b.name}
                      {ch && <span className={`ml-1.5 font-bold ${profileOf(ch).textClass}`}>· {PLATFORM_SCOPE_LABEL[ch]}</span>}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-blue-400" />}
                  </button>
                );
              });
            })}
          </div>
        </>
      )}
    </div>
  );
};

const ThemeSwitcher: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const current = THEME_OPTIONS.find((t) => t.id === theme);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
        title={`Giao diện: ${current?.label ?? theme}`}
      >
        <Palette className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 py-1.5">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                onClick={() => {
                  setTheme(opt.id);
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)]/80 transition-colors"
              >
                <span className="flex-1 text-left">{opt.label}</span>
                {theme === opt.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  activeUserName,
  activeUserTitle,
  onSignOut,
  workspace,
  onWorkspaceChange,
  brandPlatforms,
  platformScope,
  onPickChannel,
  showAgency,
  agencyPlatform,
  onPickAgency,
  brands = [],
  notifications,
  onOpenHelp
}) => {
  return (
    <header className="h-16 border-b border-[var(--border)]/80 px-2 sm:px-6 flex items-center justify-between bg-[var(--surface)]/40 backdrop-blur-md sticky top-0 z-40 text-[var(--text)] gap-4">
      {/* Active Region & Live Status */}
      <div className="flex items-center gap-6 min-w-0">
        {workspace && onWorkspaceChange && (
          <WorkspaceSwitcher workspace={workspace} brands={brands} onChange={onWorkspaceChange} brandPlatforms={brandPlatforms} platformScope={platformScope} onPickChannel={onPickChannel} showAgency={showAgency} agencyPlatform={agencyPlatform} onPickAgency={onPickAgency} />
        )}
      </div>

      {/* Role Switcher, Settings & User Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Logged-in user identity (real auth — role comes from the account, not a switcher) */}
        <div className="hidden md:flex flex-col items-end leading-tight px-2">
          <span className="text-xs font-bold text-[var(--text)]">{activeUserName}</span>
          <span className="text-[11px] text-[var(--accent-text)] font-semibold uppercase">
            {activeUserTitle || currentRole}
          </span>
        </div>

        {onOpenHelp && (
          <button
            onClick={onOpenHelp}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:border-[var(--accent)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all"
            title="Từ điển và cách dùng"
            aria-label="Từ điển và cách dùng"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        )}

        {notifications && <NotificationBell {...notifications} />}

        <ThemeSwitcher />

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="p-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)]/80 hover:bg-red-950/60 hover:border-red-500/50 text-[var(--text-muted)] hover:text-red-300 transition-all"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

