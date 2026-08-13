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
export type CampaignRibbonVariant = "poster" | "liveMonth" | "liveWeek";

const RIBBON_PRESETS: Record<
  CampaignRibbonVariant,
  { wrapper: string; height: string; ribbonHeight: string; text: string; iconSize: string; capStart: string; capEnd: string }
> = {
  // PosterDayCell: p-1.5 sm:p-2.5, lưới gap-2, bo góc ô `rounded-2xl`. `height` = chỗ chừa trong luồng
  // layout (dùng cho ô placeholder + để hàng thẳng số ngày với nhau). `ribbonHeight` cao hơn đúng bằng
  // padding trên của ô, kết hợp `-mt` cùng độ lớn để dải banner thật kéo lên khớp mép trên ô. `capStart`/
  // `capEnd` = bo góc trên-trái/trên-phải của dải camp — PHẢI khớp đúng bo góc của ô (không dùng
  // rounded-full/pill) để góc dải nằm khít vào góc ô, không lộ khe hở hay tràn ra ngoài đường viền ô.
  poster: {
    wrapper: "-mx-1.5 sm:-mx-2.5 -mt-1.5 sm:-mt-2.5 [--camp-gap:8px]",
    height: "h-[19px] sm:h-[23px]",
    ribbonHeight: "h-[25px] sm:h-[33px]",
    text: "text-[9px] sm:text-[10px]",
    iconSize: "w-3 h-3",
    capStart: "rounded-tl-2xl",
    capEnd: "rounded-tr-2xl"
  },
  // LiveCalendar month cell: p-1 sm:p-2.5, lưới gap-1 sm:gap-2, bo góc ô `rounded-2xl`.
  liveMonth: {
    wrapper: "-mx-1 sm:-mx-2.5 -mt-1 sm:-mt-2.5 [--camp-gap:4px] sm:[--camp-gap:8px]",
    height: "h-[19px] sm:h-[23px]",
    ribbonHeight: "h-[23px] sm:h-[33px]",
    text: "text-[9px] sm:text-[10px]",
    iconSize: "w-3 h-3",
    capStart: "rounded-tl-2xl",
    capEnd: "rounded-tr-2xl"
  },
  // LiveCalendar week cell: p-3, lưới gap-3, bo góc ô `rounded-2xl` — mỗi ô là 1 card viền riêng
  // (không dùng chung nền lưới như month), nhưng kỹ thuật bù âm margin/khe lưới vẫn giống hệt.
  liveWeek: {
    wrapper: "-mx-3 -mt-3 [--camp-gap:12px]",
    height: "h-[27px]",
    ribbonHeight: "h-[31px]",
    text: "text-[10px]",
    iconSize: "w-3 h-3",
    capStart: "rounded-tl-2xl",
    capEnd: "rounded-tr-2xl"
  }
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

  const spanWidth = `calc(${cellsInRow} * 100% + ${cellsInRow - 1} * var(--camp-gap))`;

  return (
    <div className={`relative ${preset.ribbonHeight} shrink-0 z-20 ${preset.wrapper}`} title={info.label}>
      {/* Khung chặn (clip) riêng — bề rộng khớp đúng span N ô như dải thật, nhưng cao hơn ~24px để
          chừa chỗ cho box-shadow lan xuống dưới. `overflow-hidden` đặt Ở ĐÂY (không phải trên chính
          dải màu) vì box-shadow của một phần tử không bao giờ bị cắt bởi overflow-hidden của CHÍNH nó —
          phải nhờ phần tử cha cắt hộ, nếu không đổ bóng sẽ lan ra ngoài 2 bên trái/phải dải (shadow-lg
          mặc định không có offset ngang nên tự lan đều 4 hướng) và trông như tràn khỏi mép ô ngày. */}
      <div
        style={{ width: spanWidth, height: "calc(100% + 24px)" }}
        // Khung clip phải bo góc trên KHỚP Y HỆT dải màu bên trong (không chỉ overflow-hidden suông) —
        // nếu không, phần "hốc" giữa góc bo tròn của dải và góc vuông của khung clip sẽ lộ ra thành một
        // miếng vuông có sọc (box-shadow/gradient của dải vẫn tô đầy hốc đó vì hốc nằm trong khung clip).
        className={`absolute left-0 top-0 overflow-hidden ${isSpanStart ? preset.capStart : ""} ${isSpanEnd ? preset.capEnd : ""}`}
      >
        <div
          className={`relative ${preset.ribbonHeight} flex items-center gap-1.5 px-2 overflow-hidden shadow-lg ${styles.banner} ${styles.glow} ${
            isSpanStart ? `${preset.capStart} pl-2` : "rounded-l-sm"
          } ${isSpanEnd ? `${preset.capEnd} pr-2` : "rounded-r-sm"}`}
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
