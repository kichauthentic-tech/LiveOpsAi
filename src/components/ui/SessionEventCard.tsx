import React from "react";
import { Building2, CheckCircle2, Clock, LucideIcon, Mic, Users, XCircle } from "lucide-react";
import { Brand, LiveSession, ShiftSlot, Talent } from "../../types";
import { talentShortName } from "../../lib/talentName";
import { BrandTheme } from "../../lib/brandTheme";
import { getBrandLogoAsset } from "../../lib/brandLogos";
import { getBrandEmoji } from "../../lib/brandIcons";
import { fmtVndShort, fmtVndFull } from "../../lib/format";
import { PlatformLogo } from "./PlatformLogo";

// Thẻ ca trên MỌI lịch (Agency tháng/tuần/ngày, Brand, Nhân sự ca) — một thiết kế, đã thiết kế lại 07/10:
//   · nền = màu brand pha loãng + viền brand, logo brand 24px là điểm nhấn (không còn gradient đậm nuốt logo);
//   · nền tảng = logo TikTok/Shopee (PlatformLogo), không ghi chữ;
//   · trạng thái = biểu tượng (tích xanh xong / X đỏ huỷ / chấm LIVE / đồng hồ chờ đăng ký), không còn nhãn chữ XONG/HUỶ;
//   · Target GMV = viên thuốc đặc màu "mực" của brand (BrandTheme.ink) để không chìm trên nền thẻ.
// CSS (bố cục theo độ rộng của chính thẻ — container query) ở src/index.css, khối `.sc`.
//
// Component CHỈ trình bày: mọi dữ liệu (giờ, host, GMV...) do call-site tính rồi truyền vào. Không còn giới hạn
// số chip ("+N"): chip tự xuống dòng, ô lịch cao ra theo số thẻ — thiếu thông tin trên thẻ là lỗi, không phải
// đánh đổi. **Mở rộng thông tin sau này** (PCU, co-host thứ hai...) → thêm phần tử vào mảng `meta`.
export interface SessionCardMeta {
  icon?: LucideIcon;
  label: string;
  /** Tooltip riêng cho chip (vd tên host đầy đủ khi label đã rút gọn). */
  title?: string;
}

export type SessionCardTone = "live" | "upcoming" | "completed" | "cancelled" | "pending";

interface SessionEventCardProps {
  theme: BrandTheme;
  /** Brand để vẽ logo ảnh thật; brand chưa có file logo thì rơi về emoji. */
  brand?: Pick<Brand, "name" | "logo"> | null;
  brandName: string;
  /** Giờ bắt đầu/kết thúc tách riêng: thẻ vi mô (<=100px, ca 1 tiếng trên lịch Ngày) chỉ hiện giờ bắt đầu. */
  startTime: string;
  endTime: string;
  /** Tên phiên — chỉ hiện từ thẻ "vừa" (>=200px) trở lên. */
  title?: string;
  /** Nền tảng — vẽ logo ở góc phải hàng đầu. */
  platform?: LiveSession["platform"];
  meta?: SessionCardMeta[];
  /** Target GMV — viên thuốc màu riêng cuối thẻ. Không truyền = không hiện (ca chờ đăng ký chưa có target, role brand). */
  targetGmv?: number;
  /** Trạng thái: live | completed (tích xanh) | cancelled (X đỏ, giờ gạch, mờ) | pending (đồng hồ, kèm viền đứt) | upcoming (không dấu). */
  tone?: SessionCardTone;
  /** Ca chờ đăng ký: viền đứt + nền nhạt hơn để phân biệt với phiên đã chốt cùng brand. */
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

const STATUS_TEXT: Record<SessionCardTone, string | undefined> = {
  live: "Đang live",
  upcoming: undefined,
  completed: "Đã xong",
  cancelled: "Đã huỷ",
  pending: "Chờ đăng ký"
};

const StatusIcon: React.FC<{ tone: SessionCardTone }> = ({ tone }) => {
  const label = STATUS_TEXT[tone];
  if (tone === "live") {
    return (
      <span className="sc-live" title={label} role="img" aria-label={label}>
        <b>LIVE</b>
      </span>
    );
  }
  if (tone === "completed") return <CheckCircle2 className="sc-st text-emerald-600 dark:text-emerald-400" strokeWidth={2.4} aria-label={label} role="img"><title>{label}</title></CheckCircle2>;
  if (tone === "cancelled") return <XCircle className="sc-st text-rose-600 dark:text-rose-400" strokeWidth={2.4} aria-label={label} role="img"><title>{label}</title></XCircle>;
  if (tone === "pending") return <Clock className="sc-st text-[var(--text-muted)]" strokeWidth={2.4} aria-label={label} role="img"><title>{label}</title></Clock>;
  return null;
};

/** Chú giải trạng thái thẻ — dùng chung mọi lịch, đúng các biểu tượng StatusIcon vẽ.
 * `variant="slot"` cho lịch Nhân sự ca (ca mở / đã chốt / đã huỷ, không có live/xong). */
export const SessionCardLegend: React.FC<{ showCancelled?: boolean; variant?: "session" | "slot"; className?: string }> = ({
  showCancelled,
  variant = "session",
  className = ""
}) => (
  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--text-muted)] ${className}`}>
    {variant === "session" ? (
      <>
        <span className="inline-flex items-center gap-1.5"><span className="sc-live" /> Đang live</span>
        <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="sc-st text-emerald-600 dark:text-emerald-400" strokeWidth={2.4} /> Đã xong</span>
        {showCancelled && <span className="inline-flex items-center gap-1.5"><XCircle className="sc-st text-rose-600 dark:text-rose-400" strokeWidth={2.4} /> Đã huỷ</span>}
        <span className="inline-flex items-center gap-1.5"><Clock className="sc-st" strokeWidth={2.4} /> Chờ đăng ký (viền đứt)</span>
      </>
    ) : (
      <>
        <span className="inline-flex items-center gap-1.5"><Clock className="sc-st" strokeWidth={2.4} /> Ca mở, chờ đăng ký (viền đứt)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-[4px] border-[1.5px] border-solid border-[var(--text-muted)]" /> Đã chốt (viền liền)</span>
        <span className="inline-flex items-center gap-1.5"><XCircle className="sc-st text-rose-600 dark:text-rose-400" strokeWidth={2.4} /> Đã huỷ (giờ gạch, mờ)</span>
      </>
    )}
  </div>
);

export const SessionEventCard: React.FC<SessionEventCardProps> = ({
  theme,
  brand,
  brandName,
  startTime,
  endTime,
  title,
  platform,
  meta = [],
  targetGmv,
  tone = "upcoming",
  pending,
  dragging,
  draggable,
  tooltip,
  onClick,
  onDragStart,
  onDragEnd,
  className = ""
}) => {
  const logo = getBrandLogoAsset(brand ?? { name: brandName });
  const style = {
    "--b": theme.accent,
    "--pbg": theme.ink,
    "--pfg": "#ffffff",
    "--pbg-d": theme.inkDark,
    "--pfg-d": theme.inkDarkOn,
    opacity: dragging ? 0.3 : undefined
  } as React.CSSProperties;
  const isPending = pending || tone === "pending";
  const shownTone: SessionCardTone = isPending && tone === "upcoming" ? "pending" : tone;

  return (
    <div className="sc-wrap">
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onClick}
        title={tooltip ?? `${brandName}${platform ? ` · ${platform}` : ""}`}
        data-tone={tone}
        data-pending={isPending ? "true" : undefined}
        data-clickable={onClick || draggable ? "true" : undefined}
        data-draggable={draggable ? "true" : undefined}
        style={style}
        className={`sc ${className}`}
      >
        <div className="sc-head">
          {logo ? (
            <img className="sc-blogo" data-pad={logo.needsLightChip ? "true" : undefined} src={logo.src} alt={`Logo ${logo.alt}`} loading="lazy" draggable={false} />
          ) : (
            <span className="sc-emoji">{getBrandEmoji(brand ?? { name: brandName, logo: "" })}</span>
          )}
          <span className="sc-time">
            {startTime}
            <span className="sc-te">–{endTime}</span>
          </span>
          <span className="sc-bname">{brandName}</span>
          <span className="sc-badges">
            <PlatformLogo platform={platform} />
            <StatusIcon tone={shownTone} />
          </span>
        </div>

        {meta.length > 0 && (
          <div className="sc-who">
            {meta.map((m, i) => (
              <span key={i} title={m.title ?? m.label} className="sc-chip">
                {m.icon && <m.icon aria-hidden />}
                <span>{m.label}</span>
              </span>
            ))}
          </div>
        )}

        {(!!targetGmv || title) && (
          <div className="sc-foot">
            {title && <span className="sc-title">{title}</span>}
            {!!targetGmv && (
              <span className="sc-pill" title={`Target GMV: ${fmtVndFull(targetGmv)}`}>
                {fmtVndShort(targetGmv)}
              </span>
            )}
          </div>
        )}
      </div>
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

// Tên trên chip: nickname ops đặt (0087) nếu tra được talent, không thì cắt 2 từ cuối họ tên
// (Nguyễn Thị Mai Anh → Mai Anh) — xem lib/talentName.ts.
type TalentLookup = (id: string | undefined) => Pick<Talent, "name" | "nickname"> | undefined;

/** Chip Host + Trợ live. Target GMV KHÔNG nằm trong danh sách này — nó có viên thuốc riêng cuối thẻ (prop
 * `targetGmv` của SessionEventCard, đổ trực tiếp từ `s.targetGmv` ở call-site).
 * Actual GMV (kết quả) cũng không thuộc đây — đó là số của lịch báo cáo hiệu suất, không phải lịch vận hành. */
export const buildSessionMeta = (
  s: LiveSession,
  lookup?: TalentLookup,
  /** Cách nhìn của người đang xem. "brand" bỏ các chip là chuyện nội bộ agency — xem ghi chú dưới. */
  viewerRole?: "agency" | "brand"
): SessionCardMeta[] => {
  // Nền tảng KHÔNG nằm trong meta nữa — thẻ vẽ logo sàn qua prop `platform`.
  const meta: SessionCardMeta[] = [];
  if (s.hostName) meta.push({ icon: Mic, label: talentShortName(lookup?.(s.hostId), s.hostName), title: `Host: ${s.hostName}` });
  // Trợ live là nhân sự nội bộ agency bố trí, không phải thứ brand mua. SessionWindow đã giấu chip
  // này (và cả studio + Target GMV) với role brand từ trước — lịch thì không, nên cùng một ca hiện
  // hai kiểu ở hai màn. Audit 2026-09-22 chọn theo SessionWindow: nó là màn chi tiết, lập trường ở
  // đó mới là lập trường đã cân nhắc.
  if (s.coHostName && viewerRole !== "brand") {
    meta.push({ icon: Users, label: talentShortName(lookup?.(s.coHostId), s.coHostName), title: `Trợ live: ${s.coHostName}` });
  }
  return meta;
};

/** Ca chờ đăng ký chưa có host — phòng + ghi chú điều phối (nền tảng là logo ở góc thẻ). */
export const buildSlotMeta = (sl: ShiftSlot, viewerRole?: "agency" | "brand"): SessionCardMeta[] => {
  const meta: SessionCardMeta[] = [];
  // Phòng live + ghi chú điều phối là chuyện bố trí nội bộ, cùng lý do với chip trợ live ở
  // buildSessionMeta bên trên.
  if (sl.studioName && viewerRole !== "brand") {
    meta.push({ icon: Building2, label: sl.studioName.split(" - ")[0], title: `Studio: ${sl.studioName}` });
  }
  if (sl.notes && viewerRole !== "brand") meta.push({ label: sl.notes, title: sl.notes });
  return meta;
};
