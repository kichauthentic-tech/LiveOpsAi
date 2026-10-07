import React from "react";
import { PLATFORM_LOGO_SRC } from "../../lib/platformLogos";

// Logo sàn thay cho chữ "TikTok"/"Shopee" trên lịch. Vẫn có `alt` + `title` để đọc màn hình và để người
// mới hover biết tên sàn.
export type PlatformLogoSize = "xs" | "sm";
const SIZE: Record<PlatformLogoSize, string> = { xs: "w-3.5 h-3.5 rounded-[3px]", sm: "w-4 h-4 rounded-[4px]" };

export const PlatformLogo: React.FC<{ platform: "TikTok" | "Shopee" | undefined; size?: PlatformLogoSize; className?: string }> = ({
  platform,
  size = "sm",
  className = ""
}) => {
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
