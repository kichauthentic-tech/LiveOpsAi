import React from "react";
import { Brand } from "../../types";
import { getBrandLogoAsset } from "../../lib/brandLogos";
import { getBrandEmoji } from "../../lib/brandIcons";

// Điểm hiển thị nhận diện brand duy nhất: có file logo trong src/assets/brands/ thì vẽ ảnh,
// chưa có thì rơi về emoji `Brand.logo` (lib/brandIcons.ts) — nhờ vậy brand mới tạo ở CRM &
// Projects vẫn hiện bình thường mà không cần thêm ảnh trước.
export type BrandLogoSize = "xs" | "sm" | "md" | "lg";

const BOX_CLASSES: Record<BrandLogoSize, string> = {
  xs: "w-4 h-4 rounded",
  sm: "w-6 h-6 rounded-md",
  md: "w-10 h-10 rounded-xl",
  lg: "w-14 h-14 rounded-2xl"
};

const EMOJI_CLASSES: Record<BrandLogoSize, string> = {
  xs: "text-[11px]",
  sm: "text-base",
  md: "text-2xl",
  lg: "text-4xl"
};

interface BrandLogoProps {
  brand: Pick<Brand, "name" | "logo"> | null | undefined;
  size?: BrandLogoSize;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ brand, size = "sm", className = "" }) => {
  const asset = getBrandLogoAsset(brand);
  const box = `${BOX_CLASSES[size]} shrink-0 inline-flex items-center justify-center overflow-hidden`;

  if (!asset) {
    return (
      <span className={`${box} ${EMOJI_CLASSES[size]} leading-none ${className}`}>{getBrandEmoji(brand)}</span>
    );
  }

  return (
    <span
      className={`${box} ${
        asset.needsLightChip ? "bg-white p-0.5 ring-1 ring-slate-200 dark:ring-slate-700" : ""
      } ${className}`}
    >
      <img
        src={asset.src}
        alt={`Logo ${asset.alt}`}
        loading="lazy"
        className={`w-full h-full ${asset.needsLightChip ? "object-contain" : "object-cover"}`}
      />
    </span>
  );
};
