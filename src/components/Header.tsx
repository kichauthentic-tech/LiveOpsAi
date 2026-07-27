import React from "react";
import { UserRole, LiveSession } from "../types";
import { ShieldCheck, LogOut } from "lucide-react";

interface HeaderProps {
  currentRole: UserRole;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeUserName?: string;
  activeUserTitle?: string;
  onSignOut?: () => void;
  sessions?: LiveSession[];
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  activeTab,
  onTabChange,
  activeUserName,
  activeUserTitle,
  onSignOut,
  sessions = []
}) => {
  const liveSessions = sessions.filter((s) => s.status === "Live Now");
  const liveGmvTotal = liveSessions.reduce((sum, s) => sum + (s.actualGmv || 0), 0);

  return (
    <header className="h-16 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur-md sticky top-0 z-40 text-white gap-4">
      {/* Active Region & Live Status */}
      <div className="flex items-center gap-6">
        <div className="flex flex-col">
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

