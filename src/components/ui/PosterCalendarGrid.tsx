import React from "react";
import { LucideIcon } from "lucide-react";

// Poster Calendar Design System — khung lưới dùng chung cho LiveCalendar / BrandCalendar /
// GmvCalendar. Chỉ chứa phần trình bày (header banner + lưới 7 cột + khung cell); logic
// nghiệp vụ (tính ngày, drag-drop, click mở modal...) vẫn nằm nguyên ở từng calendar,
// truyền vào qua props/children. Xem WORKSPACE_DESIGN.md "Quy ước kỹ thuật".

interface PosterCalendarHeaderProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  nav?: React.ReactNode;
  actions?: React.ReactNode;
}

export const PosterCalendarHeader: React.FC<PosterCalendarHeaderProps> = ({ icon: Icon, title, subtitle, nav, actions }) => (
  <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 border border-slate-700/60 dark:border-slate-800 px-5 py-4 flex flex-wrap items-center justify-between gap-3 shadow-lg">
    <div className="flex items-center gap-2.5">
      {Icon && <Icon className="w-5 h-5 text-blue-400 shrink-0" />}
      <div>
        <h2 className="text-lg font-black text-[var(--text)] tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--text-muted)] mt-0.5">{subtitle}</p>}
      </div>
    </div>
    <div className="flex items-center gap-1.5 flex-wrap">
      {actions}
      {nav}
    </div>
  </div>
);

const WEEKEND_TINT = "bg-pink-50/80 dark:bg-slate-900/40";

interface PosterCalendarGridProps {
  weekdayLabels: string[];
  weekendIndices?: number[];
  /** Bề rộng tối thiểu của lưới khi màn hẹp (vd "min-w-[1080px] xl:min-w-0") — lịch có card
   * session cần khoảng 150px/ô mới đọc được, hẹp hơn thì cho cuộn ngang thay vì bóp ô. Lịch chỉ
   * hiện số (GmvCalendar) không cần truyền. */
  minWidthClassName?: string;
  children: React.ReactNode;
}

export const PosterCalendarGrid: React.FC<PosterCalendarGridProps> = ({
  weekdayLabels,
  weekendIndices = [0, 6],
  minWidthClassName = "",
  children
}) => (
  <div className="bg-[#f8f9fa] dark:bg-slate-950 border border-pink-200 dark:border-slate-800 rounded-2xl p-3 sm:p-5 shadow-xl">
    <div className="overflow-x-auto -mx-1 px-1 pb-1">
      <div className={minWidthClassName}>
        <div className="grid grid-cols-7 gap-2 text-[10px] sm:text-xs font-black uppercase tracking-wide mb-3">
          {weekdayLabels.map((w, i) => (
            <div
              key={w}
              className={`text-center py-2 rounded-xl ${
                weekendIndices.includes(i)
                  ? "bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400"
                  : "bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400"
              }`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">{children}</div>
      </div>
    </div>
  </div>
);

interface PosterDayCellProps {
  day: number | null;
  isToday?: boolean;
  isWeekend?: boolean;
  badge?: React.ReactNode;
  /** Dải banner bao trùm nhiều ngày (ui/CampaignDayRibbon) — nằm sát mép trên ô, tràn qua khe lưới. */
  ribbon?: React.ReactNode;
  onClick?: () => void;
  title?: string;
  minHeight?: string;
  /** Ghi đè bg/border mặc định — dùng cho GmvCalendar (tone theo % đạt target). */
  toneClassName?: string;
  /** Dòng tóm tắt cuối ô, kiểu "N chiến dịch" — tuỳ chọn, không ép mọi calendar phải có. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export const PosterDayCell: React.FC<PosterDayCellProps> = ({
  day,
  isToday,
  isWeekend,
  badge,
  ribbon,
  onClick,
  title,
  minHeight = "min-h-[120px] sm:min-h-[155px]",
  toneClassName,
  footer,
  children
}) => {
  if (day === null) return <div className={minHeight} />;

  return (
    <div
      onClick={onClick}
      title={title}
      className={`${minHeight} relative rounded-2xl p-1.5 sm:p-2.5 flex flex-col gap-1 border overflow-visible ${
        isToday
          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/60 ring-2 ring-amber-400 shadow-md"
          : toneClassName ?? `bg-white dark:bg-slate-900/80 border-slate-200 dark:border-slate-800 ${isWeekend ? WEEKEND_TINT : ""}`
      } ${onClick ? "cursor-pointer hover:border-blue-400/60 dark:hover:border-blue-500/50 transition-colors" : ""}`}
    >
      {isToday && (
        // z-30 > z-20 của CampaignDayRibbon — ngày "hôm nay" rơi vào dải camp (D-Day/Mid-Month/
        // Pay-Day) vẫn phải đọc được chữ "HÔM NAY", không bị dải banner đè lên.
        <span className="absolute -top-2 right-1.5 shrink-0 text-[8px] sm:text-[9px] font-black px-2 py-0.5 rounded-full bg-orange-500 text-white leading-none shadow-md z-30 tracking-wide">
          HÔM NAY
        </span>
      )}
      {ribbon}
      <div className="flex items-start justify-between gap-1 flex-wrap pr-1">
        <span className={`shrink-0 text-sm sm:text-base font-black ${isToday ? "text-orange-600 dark:text-orange-400" : "text-slate-700 dark:text-slate-300"}`}>
          {day}
        </span>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      <div className="border-t border-slate-100 dark:border-slate-800/80" />
      <div className="flex-1 flex flex-col gap-1 overflow-hidden">{children}</div>
      {footer && (
        <div className="text-right text-[9px] font-semibold text-slate-400 dark:text-slate-500 pt-0.5">{footer}</div>
      )}
    </div>
  );
};
