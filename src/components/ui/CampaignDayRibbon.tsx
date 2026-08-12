import React from "react";
import { Flame, Sparkles, Wallet } from "lucide-react";
import { CAMPAIGN_DAY_STYLES, CampaignDayInfo, CampaignDayType } from "../../lib/campaignDays";

// Poster Calendar Design System — dải banner camp bao trùm cả 3 ngày của một đợt camp
// (D-Day / Mid-Month / Pay-Day) thay cho badge nhỏ lẻ trên từng ô ngày.
//
// Cách hoạt động: MỌI ô ngày thuộc dải đều render component này để chừa cùng một khoảng
// chiều cao ở đầu ô (layout bên dưới không bị lệch), nhưng chỉ ô "đầu dải trong hàng đó"
// mới vẽ dải thật — dải này rộng bằng N ô + N-1 khe lưới và tràn ra ngoài ô để chạy liền
// qua các ngày còn lại. Ô nối tiếp chỉ là chỗ trống vô hình nằm dưới dải.
// Dải tự cắt ở cuối tuần: ngày rơi sang hàng mới (columnIndex === 0) lại mở một dải mới.

const CAMPAIGN_DAY_ICONS: Record<CampaignDayType, typeof Flame> = {
  dday: Flame,
  midmonth: Sparkles,
  payday: Wallet
};

/** Preset theo từng lưới lịch: bù đúng padding ngang của ô + khe lưới (`--camp-gap`). */
export type CampaignRibbonVariant = "poster" | "liveMonth" | "compact";

const RIBBON_PRESETS: Record<CampaignRibbonVariant, { wrapper: string; height: string; text: string; iconSize: string }> = {
  // PosterDayCell: p-1.5 sm:p-2.5, lưới gap-2
  poster: { wrapper: "-mx-1.5 sm:-mx-2.5 [--camp-gap:8px]", height: "h-[19px] sm:h-[23px]", text: "text-[9px] sm:text-[10px]", iconSize: "w-3 h-3" },
  // LiveCalendar month cell: p-1 sm:p-2.5, lưới gap-1 sm:gap-2
  liveMonth: {
    wrapper: "-mx-1 sm:-mx-2.5 [--camp-gap:4px] sm:[--camp-gap:8px]",
    height: "h-[19px] sm:h-[23px]",
    text: "text-[9px] sm:text-[10px]",
    iconSize: "w-3 h-3"
  },
  // ShiftScheduling month cell: p-1.5, lưới gap-1.5
  compact: { wrapper: "-mx-1.5 [--camp-gap:6px]", height: "h-[16px]", text: "text-[8px]", iconSize: "w-2.5 h-2.5" }
};

const STRIPES = "repeating-linear-gradient(115deg, rgba(255,255,255,0.16) 0 8px, rgba(255,255,255,0) 8px 18px)";

interface CampaignDayRibbonProps {
  /** `null` = ngày thường: vẫn render một dải trống cùng chiều cao. Bắt buộc gọi component này ở
   * MỌI ô ngày (không bọc `campaignDay && ...`) — nếu chỉ ô camp mới chừa chỗ thì số ngày của
   * 3 ngày camp bị đẩy tụt xuống so với các ngày khác cùng hàng. */
  info: CampaignDayInfo | null;
  /** Vị trí cột của ngày trong lưới 7 cột (0-6) — để dải tự ngắt/mở lại ở biên tuần. */
  columnIndex: number;
  /** Ô này là ô ngày đầu tiên của lưới (ngày trước đó không có ô nào) — dải phải mở lại từ đây. */
  isGridStart?: boolean;
  /** Số ô ngày còn lại của lưới tính từ ô này — chặn dải tràn ra ngoài lưới ở cuối tháng. */
  cellsRemainingInGrid?: number;
  variant?: CampaignRibbonVariant;
}

export const CampaignDayRibbon: React.FC<CampaignDayRibbonProps> = ({
  info,
  columnIndex,
  isGridStart = false,
  cellsRemainingInGrid = 7,
  variant = "poster"
}) => {
  const preset = RIBBON_PRESETS[variant];
  // Ngày thường: chỉ chừa đúng khoảng chiều cao của dải để cả hàng thẳng số ngày với nhau.
  if (!info) return <div className={`${preset.height} shrink-0`} aria-hidden />;

  const styles = CAMPAIGN_DAY_STYLES[info.type];
  const Icon = CAMPAIGN_DAY_ICONS[info.type];

  const isRowHead = info.spanIndex === 0 || columnIndex === 0 || isGridStart;
  // Số ô mà dải này phủ: hết dải camp, hoặc dừng ở cuối hàng (thứ 7/CN tuỳ lưới) / cuối lưới.
  const daysLeftInSpan = info.spanLength - info.spanIndex;
  const cellsInRow = Math.min(daysLeftInSpan, 7 - columnIndex, cellsRemainingInGrid);
  const isSpanStart = info.spanIndex === 0;
  const isSpanEnd = info.spanIndex + cellsInRow === info.spanLength;

  // Ô nối tiếp: chỉ chừa chỗ, dải thật do ô đầu hàng vẽ đè lên.
  if (!isRowHead) return <div className={`${preset.height} shrink-0`} aria-hidden />;

  return (
    <div className={`relative ${preset.height} shrink-0 z-20 ${preset.wrapper}`} title={info.label}>
      <div
        style={{ width: `calc(${cellsInRow} * 100% + ${cellsInRow - 1} * var(--camp-gap))` }}
        className={`absolute inset-y-0 left-0 flex items-center gap-1.5 px-2 overflow-hidden shadow-lg ${styles.banner} ${styles.glow} ${
          isSpanStart ? "rounded-l-full pl-1.5" : "rounded-l-sm"
        } ${isSpanEnd ? "rounded-r-full pr-2.5" : "rounded-r-sm"}`}
      >
        <span className="absolute inset-0 pointer-events-none" style={{ backgroundImage: STRIPES }} />
        <span className="relative shrink-0 w-4 h-4 rounded-full bg-white/25 flex items-center justify-center">
          <Icon className={`${preset.iconSize} text-white`} />
        </span>
        <span className={`relative truncate font-black uppercase tracking-wider text-white ${preset.text}`}>{info.bannerLabel}</span>
        {isSpanEnd && cellsInRow > 1 && (
          <span className={`relative ml-auto shrink-0 font-black uppercase tracking-wider text-white/75 ${preset.text} hidden sm:block`}>
            {info.spanLength} ngày
          </span>
        )}
        {!isSpanEnd && <span className={`relative ml-auto shrink-0 font-black text-white/80 ${preset.text}`}>›››</span>}
      </div>
    </div>
  );
};

/** Bản độc lập (không bao qua nhiều ô): dùng cho thẻ ngày rời — week view, header ngày. */
export const CampaignDayBanner: React.FC<{ info: CampaignDayInfo; className?: string }> = ({ info, className = "" }) => {
  const styles = CAMPAIGN_DAY_STYLES[info.type];
  const Icon = CAMPAIGN_DAY_ICONS[info.type];
  return (
    <div
      title={info.label}
      className={`relative flex items-center gap-1.5 px-2 py-1 rounded-full overflow-hidden shadow-lg ${styles.banner} ${styles.glow} ${className}`}
    >
      <span className="absolute inset-0 pointer-events-none" style={{ backgroundImage: STRIPES }} />
      <span className="relative shrink-0 w-4 h-4 rounded-full bg-white/25 flex items-center justify-center">
        <Icon className="w-3 h-3 text-white" />
      </span>
      <span className="relative truncate text-[9px] sm:text-[10px] font-black uppercase tracking-wider text-white">{info.bannerLabel}</span>
    </div>
  );
};
