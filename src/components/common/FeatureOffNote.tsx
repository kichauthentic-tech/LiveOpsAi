import React from "react";
import { featureOffText } from "../../lib/featureOff";

/**
 * Dải "tính năng chưa bật" dùng chung (audit chữ 13/11). Trước đây mỗi màn tự viết một câu kèm số migration và tên bảng
 * — xem `lib/featureOff.ts` vì sao bỏ. `what` = việc chưa làm được, chữ thường ("đặt hạn đăng ký theo tháng").
 *
 * `tone="line"` (mặc định) là một dòng chữ nhỏ; `tone="band"` là dải vàng cho màn mà thiếu tính năng này là chặn việc chính.
 */
export const FeatureOffNote: React.FC<{ what: string; tone?: "line" | "band"; className?: string }> = ({ what, tone = "line", className = "" }) => (
  <p
    className={
      tone === "band"
        ? `text-xs rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 px-3 py-2 ${className}`
        : `text-2xs text-amber-300 ${className}`
    }
  >
    {featureOffText(what)}
  </p>
);
