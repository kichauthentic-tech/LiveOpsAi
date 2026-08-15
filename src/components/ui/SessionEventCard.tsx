import React from "react";
import { Building2, GripVertical, LucideIcon, Mic, ShoppingBag, Users } from "lucide-react";
import { Brand, LiveSession, ShiftSlot } from "../../types";
import { BrandTheme, brandGradient } from "../../lib/brandTheme";
import { BrandLogo } from "./BrandLogo";

// Badge session/ca trên các view lịch — bản "to, rõ" thay cho pill 1 dòng cũ.
//
// Toàn bộ màu lấy từ `BrandTheme` (lib/brandTheme.ts, sample từ file logo thật) và đổ qua inline
// style, vì Tailwind không sinh được class từ hex động. Component này CHỈ trình bày: mọi dữ liệu
// (giờ, host, GMV...) do call-site tính rồi truyền vào.
//
// **Mở rộng thông tin sau này** (co-host, PCU, studio...) → thêm phần tử vào mảng `meta`, KHÔNG
// sửa layout ở đây. Mỗi meta là 1 chip tự xuống dòng, nên thêm bao nhiêu cũng không vỡ ô ngày; ở
// size "sm" (ô lịch tháng) chỉ hiện `metaLimit` chip đầu để giữ chiều cao ô. Riêng Target GMV có
// prop `targetGmv` và ô hiển thị badge màu riêng của nó — không đi qua `meta`.
export interface SessionCardMeta {
  icon?: LucideIcon;
  label: string;
  /** Tooltip riêng cho chip (vd tên host đầy đủ khi label đã rút gọn). */
  title?: string;
}

export type SessionCardTone = "live" | "upcoming" | "completed" | "cancelled" | "pending";

interface SessionEventCardProps {
  theme: BrandTheme;
  /** Brand để vẽ logo ảnh thật; brand chưa có file logo thì BrandLogo tự rơi về emoji. */
  brand?: Pick<Brand, "name" | "logo"> | null;
  brandName: string;
  /** Giờ bắt đầu/kết thúc tách riêng: ô lịch tháng hẹp (<1280px) chỉ đủ chỗ cho giờ bắt đầu,
   * từ xl trở lên mới hiện đủ khoảng giờ. Truyền nguyên "HH:mm", component tự ghép. */
  startTime: string;
  endTime: string;
  /** Tên phiên / mô tả ngắn — ẩn ở size "sm" nếu không có chỗ. */
  title?: string;
  meta?: SessionCardMeta[];
  /** Target GMV — tách riêng khỏi `meta` vì đây là con số quan trọng nhất sau giờ live, cần
   * nổi bật thành badge màu riêng ở góc phải hàng brand thay vì lẫn vào chip xám như các thông
   * tin phụ khác. Không truyền = không hiện badge (ca chờ đăng ký chưa có target). */
  targetGmv?: number;
  tone?: SessionCardTone;
  /** Nhãn trạng thái góc phải (LIVE, XONG...). Không truyền = không hiện — ca chờ đăng ký cố ý
   * không có nhãn, đã nhận ra qua viền đứt, để nhường chỗ cho chip thông tin. */
  statusLabel?: string;
  size?: "sm" | "md";
  /** Số chip meta tối đa hiện ra ở size "sm" (mặc định 2) — phần dư gộp thành "+N". */
  metaLimit?: number;
  /** Ca chờ đăng ký: viền đứt + nền mờ hơn để phân biệt với phiên đã chốt cùng brand. */
  pending?: boolean;
  /** Đang bị kéo (drag) — làm mờ card gốc. */
  dragging?: boolean;
  draggable?: boolean;
  tooltip?: string;
  onClick?: (e: React.MouseEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  className?: string;
}

// Target GMV rút gọn cho vừa 1 badge nhỏ (50.000.000đ → 50M, 1.200.000.000đ → 1.2B) — ký hiệu quốc
// tế M/B thay vì "tr"/"tỷ" cho ngắn gọn, bản đầy đủ vào `title` để hover xem chính xác.
const compactGmv = (amount: number): string => {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) return `${(amount / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}B`;
  if (abs >= 1_000_000) return `${(amount / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(amount / 1_000).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}K`;
  return `${amount}`;
};

const TONE_RING: Record<SessionCardTone, string> = {
  live: "ring-2 ring-rose-400 ring-offset-1 ring-offset-white dark:ring-offset-slate-950",
  upcoming: "",
  completed: "",
  cancelled: "opacity-60 saturate-50",
  pending: ""
};

export const SessionEventCard: React.FC<SessionEventCardProps> = ({
  theme,
  brand,
  brandName,
  startTime,
  endTime,
  title,
  meta = [],
  targetGmv,
  tone = "upcoming",
  statusLabel,
  size = "sm",
  metaLimit = 2,
  pending,
  dragging,
  draggable,
  tooltip,
  onClick,
  onDragStart,
  onDragEnd,
  className = ""
}) => {
  // Nền brand sáng (Crocs) dùng lớp phủ đen mờ cho chip; nền tối dùng trắng mờ — nếu không chip
  // sẽ tàng hình trên chính nền của nó.
  const overlay = theme.isLight ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.22)";
  const compact = size === "sm";
  const shown = compact ? meta.slice(0, metaLimit) : meta;
  const hidden = meta.length - shown.length;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      title={tooltip}
      style={{
        background: brandGradient(theme),
        color: theme.onPrimary,
        borderColor: pending ? (theme.isLight ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.75)") : theme.secondary,
        borderStyle: pending ? "dashed" : "solid",
        opacity: dragging ? 0.3 : pending ? 0.94 : 1
      }}
      className={`w-full rounded-xl border-2 shadow-md overflow-hidden text-left ${
        compact ? "px-1.5 py-1 xl:px-2 xl:py-1.5" : "px-2.5 py-2"
      } ${TONE_RING[tone]} ${tone === "live" ? "animate-pulse" : ""} ${
        onClick || draggable ? "cursor-pointer hover:shadow-lg hover:-translate-y-px transition-all active:scale-[0.99]" : ""
      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${className}`}
    >
      {/* Hàng 1: nhận diện brand (trái) + Target GMV (phải) — GMV là con số quan trọng nhất sau
          giờ live nên tách khỏi chip xám, đặt ngay góc phải hàng đầu để đập vào mắt trước tiên. */}
      <div className="flex items-center gap-1 xl:gap-1.5 min-w-0">
        {/* Tay cầm kéo-thả chiếm chỗ quý ở ô hẹp — chỉ hiện từ xl (cả card vẫn kéo được ở mọi khổ). */}
        {draggable && <GripVertical className={`w-3 h-3 shrink-0 opacity-60 ${compact ? "hidden xl:block" : ""}`} />}
        <BrandLogo brand={brand ?? { name: brandName, logo: "" }} size="xs" className="rounded-md bg-white shadow-sm" />
        <span className={`font-black uppercase tracking-tight truncate min-w-0 ${compact ? "text-[9px] xl:text-[10px]" : "text-[11px]"}`}>
          {brandName}
        </span>
        {!!targetGmv && (
          <span
            title={`Target GMV: ${targetGmv.toLocaleString("vi-VN")}đ`}
            className="ml-auto shrink-0 text-emerald-400 font-mono font-bold leading-none text-[9px] xl:text-[10px]"
          >
            {compactGmv(targetGmv)}
          </span>
        )}
      </div>

      {/* Hàng 2: giờ (thông tin quan trọng nhất, để to nhất) + nhãn trạng thái. Nhãn nằm ở đây chứ
          không ở hàng brand vì hàng giờ luôn ngắn — để tên brand không bị cắt oan ở ô hẹp.
          Ô hẹp (<xl) chỉ đủ chỗ cho giờ bắt đầu. */}
      <div className="flex items-center gap-1 mt-0.5 min-w-0">
        <span
          className={`font-black tabular-nums leading-tight whitespace-nowrap truncate ${
            compact ? "text-[11px] xl:text-[12px]" : "text-sm"
          }`}
        >
          {startTime}
          {compact ? <span className="hidden xl:inline"> - {endTime}</span> : ` - ${endTime}`}
        </span>
        {statusLabel && (
          <span
            style={{ background: overlay }}
            className="ml-auto shrink-0 text-[8px] font-black uppercase tracking-wide px-1 xl:px-1.5 py-0.5 rounded-full leading-none"
          >
            {statusLabel}
          </span>
        )}
      </div>

      {title && (
        <div className={`truncate opacity-90 font-semibold ${compact ? "text-[9px]" : "text-[10px] mt-0.5"}`}>{title}</div>
      )}

      {/* Hàng 3: chip thông tin mở rộng — brand/giờ đã ở hàng 1-2, chip này luôn hiện (mọi khổ
          màn hình, mọi khung lịch tuần/tháng) để đủ bộ thông tin vận hành: nền tảng, Target GMV,
          host + trợ. Grid tháng có min-width cưỡng bức (xem PosterCalendarGrid) nên luôn đủ chỗ
          ngang cho vài chip hẹp; chip tự xuống dòng (flex-wrap) khi cần. */}
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mt-1">
          {shown.map((m, i) => (
            <span
              key={i}
              title={m.title ?? m.label}
              style={{ background: overlay }}
              className="inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none"
            >
              {m.icon && <m.icon className="w-2.5 h-2.5 shrink-0 opacity-80" />}
              <span className="truncate">{m.label}</span>
            </span>
          ))}
          {hidden > 0 && (
            <span style={{ background: overlay }} className="px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none">
              +{hidden}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Map dữ liệu thật → props card. Để ở đây (không lặp ở từng calendar) để Agency
// và Brand Workspace luôn hiện cùng một bộ thông tin trên cùng một session.
// ---------------------------------------------------------------------------

export const SESSION_TONE: Record<LiveSession["status"], SessionCardTone> = {
  "Live Now": "live",
  Upcoming: "upcoming",
  Completed: "completed",
  Cancelled: "cancelled"
};

// Upcoming = trạng thái mặc định nên không cần nhãn — bớt nhiễu trên ô lịch.
export const SESSION_STATUS_LABEL: Record<LiveSession["status"], string | undefined> = {
  "Live Now": "LIVE",
  Upcoming: undefined,
  Completed: "XONG",
  Cancelled: "HUỶ"
};

// Rút tên còn "họ cuối + tên" cho vừa chip mà vẫn nhận ra người (Nguyễn Thị Mai Anh → Mai Anh).
const shortName = (full: string): string => full.trim().split(/\s+/).slice(-2).join(" ");

/** Thứ tự chip = thứ tự ưu tiên khi ô lịch hẹp (size "sm" chỉ hiện `metaLimit` chip đầu).
 * Target GMV KHÔNG nằm trong danh sách này — nó có badge riêng ở góc phải hàng brand (xem prop
 * `targetGmv` của SessionEventCard, đổ trực tiếp từ `s.targetGmv` ở call-site).
 * Actual GMV (kết quả) cũng không thuộc đây — đó là số của lịch báo cáo hiệu suất, không phải lịch vận hành. */
export const buildSessionMeta = (s: LiveSession): SessionCardMeta[] => {
  const meta: SessionCardMeta[] = [];
  if (s.platform) meta.push({ icon: ShoppingBag, label: s.platform, title: `Nền tảng: ${s.platform}` });
  if (s.hostName) meta.push({ icon: Mic, label: shortName(s.hostName), title: `Host: ${s.hostName}` });
  if (s.coHostName) meta.push({ icon: Users, label: shortName(s.coHostName), title: `Trợ (Co-Host): ${s.coHostName}` });
  return meta;
};

/** Ca chờ đăng ký chưa có host — nền tảng đứng đầu vì đó là thứ host cần biết trước khi nhận ca. */
export const buildSlotMeta = (sl: ShiftSlot): SessionCardMeta[] => {
  const meta: SessionCardMeta[] = [];
  if (sl.platform) meta.push({ icon: ShoppingBag, label: sl.platform, title: `Nền tảng: ${sl.platform}` });
  if (sl.studioName) meta.push({ icon: Building2, label: sl.studioName.split(" - ")[0], title: `Studio: ${sl.studioName}` });
  if (sl.notes) meta.push({ label: sl.notes, title: sl.notes });
  return meta;
};
