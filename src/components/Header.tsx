import React, { useState } from "react";
import { UserRole, Brand } from "../types";
import { LogOut, Building2, ChevronDown, Check, Palette } from "lucide-react";
import { useTheme, THEME_OPTIONS } from "../hooks/useTheme";
import { BrandLogo } from "./ui/BrandLogo";

// Giai đoạn A (Workspace Agency ↔ Brand) — xem WORKSPACE_DESIGN.md.
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
  brands?: Brand[];
}

const WorkspaceSwitcher: React.FC<{
  workspace: WorkspaceContext;
  brands: Brand[];
  onChange: (next: WorkspaceContext) => void;
}> = ({ workspace, brands, onChange }) => {
  const [open, setOpen] = useState(false);
  const currentBrand = workspace.type === "brand" ? brands.find((b) => b.id === workspace.brandId) : undefined;
  const label = workspace.type === "agency" ? "Agency (Toàn cảnh)" : currentBrand?.name ?? "Brand";

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
        <span className="text-xs font-bold text-[var(--text)]">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-[var(--text-muted)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-64 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-2xl z-50 py-1.5 max-h-96 overflow-y-auto">
            <button
              onClick={() => {
                onChange({ type: "agency" });
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)]/80 transition-colors"
            >
              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="flex-1 text-left">Agency (Toàn cảnh)</span>
              {workspace.type === "agency" && <Check className="w-3.5 h-3.5 text-blue-400" />}
            </button>
            <div className="border-t border-[var(--border)] my-1.5" />
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-faint)]">Brand</p>
            {brands.length === 0 && <p className="px-3 py-2 text-[11px] text-[var(--text-faint)]">Chưa có Brand nào.</p>}
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  onChange({ type: "brand", brandId: b.id });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-elevated)]/80 transition-colors"
              >
                <BrandLogo brand={b} size="sm" />
                <span className="flex-1 text-left truncate">{b.name}</span>
                {workspace.type === "brand" && workspace.brandId === b.id && <Check className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            ))}
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
  brands = []
}) => {
  return (
    <header className="h-16 border-b border-[var(--border)]/80 px-6 flex items-center justify-between bg-[var(--surface)]/40 backdrop-blur-md sticky top-0 z-40 text-[var(--text)] gap-4">
      {/* Active Region & Live Status */}
      <div className="flex items-center gap-6">
        {workspace && onWorkspaceChange && (
          <WorkspaceSwitcher workspace={workspace} brands={brands} onChange={onWorkspaceChange} />
        )}
      </div>

      {/* Role Switcher, Settings & User Profile */}
      <div className="flex items-center gap-3">
        {/* Logged-in user identity (real auth — role comes from the account, not a switcher) */}
        <div className="hidden md:flex flex-col items-end leading-tight px-2">
          <span className="text-xs font-bold text-[var(--text)]">{activeUserName}</span>
          <span className="text-[10px] text-blue-400 font-semibold uppercase">
            {currentRole} {activeUserTitle ? `• ${activeUserTitle}` : ""}
          </span>
        </div>

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

