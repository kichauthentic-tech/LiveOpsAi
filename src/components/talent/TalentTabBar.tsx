import React from "react";
import type { NavItem } from "../../lib/appNav";

// Thanh 4 tab dưới đáy của app talent trên điện thoại (T1, 11/10). Host/trợ mở app bằng điện thoại riêng: menu ẩn sau nút ☰ là
// một lần bấm thừa cho 4 màn. Máy tính (phòng live) vẫn dùng sidebar — thanh này `md:hidden`.
const SHORT: Record<string, string> = { my_shifts: "Hôm nay", talent_calendar: "Lịch", shift_scheduling: "Đăng ký", my_talent_profile: "Hồ sơ" };

export const TalentTabBar: React.FC<{ items: NavItem[]; activeTab: string; onSelect: (tab: string) => void; badges?: Record<string, number> }> = ({
  items,
  activeTab,
  onSelect,
  badges = {}
}) => (
  <nav
    aria-label="Tab của app"
    className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--surface)] border-t border-[var(--border)] grid"
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
  >
    {items.map((it) => {
      const on = it.id === activeTab;
      const Icon = it.icon;
      const n = badges[it.id] ?? 0;
      return (
        <button
          key={it.id}
          type="button"
          onClick={() => onSelect(it.id)}
          aria-current={on ? "page" : undefined}
          className={`relative flex flex-col items-center justify-center gap-0.5 py-2 min-h-14 text-[11px] font-bold ${on ? "text-[var(--accent-text)]" : "text-[var(--text-faint)]"}`}
        >
          <Icon className="w-5 h-5" />
          {SHORT[it.id] ?? it.label}
          {n > 0 && (
            <span className="absolute top-1 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[11px] leading-[18px] text-center">{n}</span>
          )}
        </button>
      );
    })}
  </nav>
);
