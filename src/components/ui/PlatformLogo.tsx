import React from "react";
import { Globe } from "lucide-react";
import { PLATFORM_LOGO_SRC } from "../../lib/platformLogos";
import type { SchedulePlatform } from "../../lib/reportPlatform";

// Logo sàn thay cho chữ "TikTok"/"Shopee" trên lịch. Vẫn có `alt` + `title` để đọc màn hình và để người
// mới hover biết tên sàn.
export type PlatformLogoSize = "xs" | "sm";
const SIZE: Record<PlatformLogoSize, string> = { xs: "w-3.5 h-3.5 rounded-[3px]", sm: "w-4 h-4 rounded-[4px]" };

export const PlatformLogo: React.FC<{ platform: SchedulePlatform | undefined; size?: PlatformLogoSize; className?: string }> = ({
  platform,
  size = "sm",
  className = ""
}) => {
  if (platform === "Website") {
    // Sàn chỉ lịch (CROCS Website) chưa có logo ảnh: ô địa cầu cùng cỡ để hàng ca vẫn thẳng.
    return (
      <span title="Sàn: Website" role="img" aria-label="Website" className={`${SIZE[size]} shrink-0 inline-flex items-center justify-center bg-sky-600 text-white ${className}`}>
        <Globe className="w-2.5 h-2.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (!platform || !PLATFORM_LOGO_SRC[platform]) return null;
  return (
    <img
      src={PLATFORM_LOGO_SRC[platform]}
      alt={platform}
      title={`Sàn: ${platform}`}
      loading="lazy"
      draggable={false}
      className={`${SIZE[size]} shrink-0 inline-block ${className}`}
    />
  );
};
