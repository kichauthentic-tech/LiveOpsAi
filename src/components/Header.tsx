import React from "react";
import { UserRole, SystemUser } from "../types";
import { Radio, Sparkles, Activity, ShieldCheck, Bell, Eye, EyeOff, RotateCcw } from "lucide-react";

interface HeaderProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  users?: SystemUser[];
  activeUserId?: string;
  onUserSelect?: (userId: string) => void;
  isMockDataHidden?: boolean;
  onToggleMockData?: () => void;
  onResetData?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onRoleChange,
  activeTab,
  onTabChange,
  users = [],
  activeUserId,
  onUserSelect,
  isMockDataHidden = false,
  onToggleMockData,
  onResetData
}) => {
  const activeUser = users.find((u) => u.id === activeUserId) || users[0];

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
            {isMockDataHidden ? "Clean Test Mode" : "1 Concurrent Live Session"}
          </span>
          <span className="text-slate-500 text-xs">|</span>
          <span className="text-xs font-mono text-emerald-400 font-bold">
            {isMockDataHidden ? "Test Real-time Data" : "185.4M đ"}
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

        {/* Role Quick Selector */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
          <span className="text-[11px] text-slate-400 px-2 font-medium hidden md:flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-blue-400" /> Vị trí:
          </span>
          <button
            onClick={() => onRoleChange("ceo")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              currentRole === "ceo"
                ? "bg-purple-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            CEO
          </button>
          <button
            onClick={() => onRoleChange("operations")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              currentRole === "operations"
                ? "bg-blue-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            Ops
          </button>
          <button
            onClick={() => onRoleChange("brand")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              currentRole === "brand"
                ? "bg-emerald-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            Brand
          </button>
          <button
            onClick={() => onRoleChange("talent")}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              currentRole === "talent"
                ? "bg-amber-600 text-white shadow-sm font-bold"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
            }`}
          >
            Talent
          </button>
        </div>

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

