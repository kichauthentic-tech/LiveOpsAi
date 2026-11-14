import React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { brandTrustLabel } from "../../lib/sessionLedger";
import { profileOf } from "../../lib/platforms/profiles";
import type { LiveSession } from "../../types";

/**
 * Viên "số của ca tin được tới đâu" — brand và ops cùng nhìn một nhãn (`brandTrustLabel`).
 *
 * Audit chữ 14/11: Sổ Ca và Cửa sổ Ca Live mỗi màn tự dựng một viên y hệt, kèm hai câu tooltip viết riêng. Gộp về đây
 * để sửa chữ một chỗ; tooltip nói đúng tên sàn của ca thay vì gõ cứng "TikTok".
 */
export const TrustBadge: React.FC<{ session: LiveSession }> = ({ session }) => {
  const label = brandTrustLabel(session);
  const done = label === "Đã chốt";
  const shop = profileOf({ platform: session.platform }).shopLabel;
  return (
    <span
      className={`inline-flex items-center gap-1 text-2xs font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${
        done ? "bg-emerald-950 text-emerald-300 border-emerald-800" : "bg-amber-950 text-amber-300 border-amber-800"
      }`}
      title={done ? `Số đã đối soát với báo cáo ${shop} cuối kỳ` : `Số ghi nhận lúc giao ca, ${shop} còn cập nhật`}
    >
      {done ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />} {label}
    </span>
  );
};
