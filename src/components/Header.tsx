import React from "react";
import { UserRole, LiveSession } from "../types";
import { ShieldCheck, Bell, Eye, EyeOff, RotateCcw, LogOut } from "lucide-react";

interface HeaderProps {
  currentRole: UserRole;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeUserName?: string;
  activeUserTitle?: string;
  onSignOut?: () => void;
  sessions?: LiveSession[];
  isMockDataHidden?: boolean;
  onToggleMockData?: () => void;
  onResetData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  activeTab,
  onTabChange,
  activeUserName,
  activeUserTitle,
  onSignOut,
  sessions = [],
  isMockDataHidden = false,
  onToggleMockData,
  onResetData
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
            {isMockDataHidden
              ? "Clean Test Mode"
              : `${liveSessions.length} Concurrent Live Session${liveSessions.length !== 1 ? "s" : ""}`}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            {isMockDataHidden ? "Test Real-time Data" : `${(liveGmvTotal / 1000000).toFixed(1)}M đ`}
          </span>
        </div>
      </div>

      {/* Role Switcher, Mock Data Control, Settings & User Profile */}
      <div className="flex items-center gap-3">
        {/* Mock Data Toggle Button for Testing */}
        {onToggleMockData && (
          <button
            onClick={onToggleMockData}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
              isMockDataHidden
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 shadow-lg shadow-amber-500/10"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-300 border-slate-700"
            }`}
            title={isMockDataHidden ? "Bấm để mở lại dữ liệu mẫu" : "Bấm để ẩn toàn bộ dữ liệu mẫu và test app sạch"}
          >
            {isMockDataHidden ? (
              <>
                <EyeOff className="w-4 h-4 text-amber-400" />
                <span className="hidden sm:inline">Mock Data: </span>
                <span className="text-amber-400 font-extrabold uppercase">ĐANG ẨN (TEST)</span>
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="hidden sm:inline">Mock Data: </span>
                <span className="text-emerald-400 font-extrabold uppercase">ĐANG HIỆN</span>
              </>
            )}
          </button>
        )}

        {/* Reset Custom Data Button */}
        {onResetData && (
          <button
            onClick={onResetData}
            className="p-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-red-950/60 hover:border-red-500/50 text-slate-300 hover:text-red-300 transition-all"
            title="Xóa toàn bộ dữ liệu tự nhập (giữ lại Mock Data mẫu)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        )}

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
          title="Cấu hình phân quyền & Người dùng"
        >
          <ShieldCheck className="w-4 h-4 text-purple-400" />
          <span className="hidden xl:inline">Phân Quyền Custom</span>
        </button>

        <button className="p-2 text-slate-400 hover:text-white transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full"></span>
        </button>
      </div>
    </header>
  );
};

