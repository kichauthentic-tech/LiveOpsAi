import React, { useState } from "react";
import { UserRole, LiveSession, Brand } from "../types";
import { ShieldCheck, LogOut, Building2, ChevronDown, Check } from "lucide-react";

// Giai đoạn A (Workspace Agency ↔ Brand) — xem WORKSPACE_DESIGN.md.
export type WorkspaceContext = { type: "agency" } | { type: "brand"; brandId: string };

interface HeaderProps {
  currentRole: UserRole;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeUserName?: string;
  activeUserTitle?: string;
  onSignOut?: () => void;
  sessions?: LiveSession[];
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
        className="flex items-center gap-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 px-3 py-1.5 rounded-full transition-colors"
      >
        {workspace.type === "agency" ? (
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
        ) : (
          <span className="text-sm leading-none">{currentBrand?.logo ?? "🏷️"}</span>
        )}
        <span className="text-xs font-bold text-slate-200">{label}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 py-1.5 max-h-96 overflow-y-auto">
            <button
              onClick={() => {
                onChange({ type: "agency" });
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/80 transition-colors"
            >
              <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="flex-1 text-left">Agency (Toàn cảnh)</span>
              {workspace.type === "agency" && <Check className="w-3.5 h-3.5 text-blue-400" />}
            </button>
            <div className="border-t border-slate-800 my-1.5" />
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-600">Brand</p>
            {brands.length === 0 && <p className="px-3 py-2 text-[11px] text-slate-500">Chưa có Brand nào.</p>}
            {brands.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  onChange({ type: "brand", brandId: b.id });
                  setOpen(false);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/80 transition-colors"
              >
                <span className="text-sm leading-none shrink-0">{b.logo || "🏷️"}</span>
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

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  activeTab,
  onTabChange,
  activeUserName,
  activeUserTitle,
  onSignOut,
  sessions = [],
  workspace,
  onWorkspaceChange,
  brands = []
}) => {
  const liveSessions = sessions.filter((s) => s.status === "Live Now");
  const liveGmvTotal = liveSessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);

  return (
    <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 text-white gap-4">
      {/* Active Region & Live Status */}
      <div className="flex items-center gap-6">
        {workspace && onWorkspaceChange && (
          <WorkspaceSwitcher workspace={workspace} brands={brands} onChange={onWorkspaceChange} />
        )}

        <div className="hidden lg:flex flex-col">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Region</span>
          <span className="text-xs font-bold text-slate-200">Vietnam (HCMC/HN)</span>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1 rounded-full">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-xs font-semibold text-slate-200">
            {liveSessions.length} Concurrent Live Session{liveSessions.length !== 1 ? "s" : ""}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            {(liveGmvTotal / 1000000).toFixed(1)}M đ
          </span>
        </div>
      </div>

      {/* Role Switcher, Settings & User Profile */}
      <div className="flex items-center gap-3">
        {/* Logged-in user identity (real auth — role comes from the account, not a switcher) */}
        <div className="hidden md:flex flex-col items-end leading-tight px-2">
          <span className="text-xs font-bold text-slate-200">{activeUserName}</span>
          <span className="text-[10px] text-blue-400 font-semibold uppercase">
            {currentRole} {activeUserTitle ? `• ${activeUserTitle}` : ""}
          </span>
        </div>

        {onSignOut && (
          <button
            onClick={onSignOut}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-red-950/60 hover:border-red-500/50 text-slate-300 hover:text-red-300 transition-all"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}

        {/* User Settings Shortcut Button */}
        <button
          onClick={() => onTabChange("user_settings")}
          className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-bold ${
            activeTab === "user_settings"
              ? "bg-purple-600 text-white border-purple-500 shadow-lg shadow-purple-600/30"
              : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <span className="hidden xl:inline">Phân Quyền Custom</span>
        </button>
      </div>
    </header>
  );
};

