import React from "react";
import { LucideIcon } from "lucide-react";
import { Brand } from "../../types";
import { BrandLogo } from "./BrandLogo";

// Poster Calendar Design System — 6 tier badge, xem WORKSPACE_DESIGN.md "Quy ước kỹ thuật".
// Mapping dữ liệu thật → tier là quyết định duy nhất cần sửa nếu muốn đổi cách hiển thị;
// không sửa style trực tiếp ở LiveCalendar/BrandCalendar/GmvCalendar.
export type EventPillTier =
  | "black_bold"
  | "gold_gradient"
  | "teal_gradient"
  | "orange_gradient"
  | "pastel_festival"
  | "purple_blue_gradient"
  | "white_box"
  | "green_flag";

interface EventPillProps {
  tier: EventPillTier;
  label: string;
  sublabel?: string;
  icon?: LucideIcon;
  /** Emoji riêng của brand (Brand.logo, xem lib/brandIcons.ts) — ưu tiên hơn `icon` nếu cả 2 truyền vào. */
  emoji?: string;
  /** Brand của event — hiện logo ảnh thật (ui/BrandLogo) thay cho `emoji`/`icon`; brand chưa có
   * file logo thì BrandLogo tự rơi về emoji nên vẫn an toàn khi truyền cho mọi brand. */
  brand?: Pick<Brand, "name" | "logo"> | null;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
  className?: string;
}

// Export để nơi cần tự vẽ phần tử (vd: div draggable trong LiveCalendar) vẫn dùng chung tier màu.
export const EVENT_PILL_TIER_CLASSES: Record<EventPillTier, string> = {
  black_bold:
    "bg-black dark:bg-black text-white border border-slate-700/80 rounded-full",
  gold_gradient:
    "bg-gradient-to-r from-[#ffe599] via-[#fff2cc] to-[#fce5cd] text-amber-900 border border-amber-300 rounded-full",
  teal_gradient:
    "bg-gradient-to-r from-teal-500 to-emerald-500 text-white border border-teal-400/60 rounded-full",
  orange_gradient:
    "bg-gradient-to-r from-orange-500 to-amber-500 text-white border border-orange-400/60 rounded-full",
  pastel_festival:
    "bg-gradient-to-r from-violet-600 to-purple-600 text-white border border-violet-400/60 rounded-full",
  purple_blue_gradient:
    "bg-gradient-to-r from-indigo-600 to-purple-600 text-white border border-indigo-400/60 rounded-full",
  white_box:
    "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-2 border-slate-900 dark:border-slate-600 rounded-full",
  green_flag:
    "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-400/70 dark:border-emerald-700/70 rounded-full"
};

// Tier có nền sáng (chữ tối) cần chip icon màu tối để icon không "biến mất" trên nền nhạt —
// ngược lại tier nền tối/đậm dùng chip trắng mờ để icon nổi trên nền đó.
const LIGHT_BG_TIERS: EventPillTier[] = ["gold_gradient", "white_box"];

export const EventPill: React.FC<EventPillProps> = ({
  tier,
  label,
  sublabel,
  icon: Icon,
  emoji,
  brand,
  onClick,
  title,
  className = ""
}) => {
  const lightBg = LIGHT_BG_TIERS.includes(tier);
  const colorClasses = EVENT_PILL_TIER_CLASSES[tier];
  return (
    <div
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 text-[10px] sm:text-[11px] font-extrabold tracking-tight leading-none truncate whitespace-nowrap shadow-md ${colorClasses} ${
        onClick ? "cursor-pointer hover:opacity-85 hover:shadow-lg active:scale-[0.98] transition-all" : ""
      } ${className}`}
    >
      {brand ? (
        <BrandLogo brand={brand} size="xs" className="rounded-full bg-white" />
      ) : emoji ? (
        <span className="shrink-0 w-4 h-4 rounded-full bg-white flex items-center justify-center text-[9px] leading-none">{emoji}</span>
      ) : (
        Icon && (
          <span
            className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center ${
              lightBg ? "bg-black/10" : "bg-white/25"
            }`}
          >
            <Icon className="w-2.5 h-2.5 shrink-0" />
          </span>
        )
      )}
      <span className="truncate">{label}</span>
      {sublabel && <span className="opacity-75 font-bold shrink-0">{sublabel}</span>}
    </div>
  );
};
